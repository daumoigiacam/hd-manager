import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';

// Mount the entire App, rather than evaluating helpers with preinitialized
// fixtures. Preview-only identities; all external requests are blocked.
const output = process.env.HD_AUTH_INIT_UI_OUTPUT || 'test-results/backup-auth-initialization-ui';
const requestedRoutes=(process.env.HD_AUTH_INIT_UI_ROUTES || '').split(',').filter(Boolean);
const routeLabels={orders:'Đơn hàng',order_requests:'Đặt hàng',payroll:'Bảng lương',products:'Kho sản phẩm',warehouse_dispatch:'Xuất kho',customers:'Khách hàng',debt:'Sổ nợ',employees:'Nhân sự',pricing:'Giá cả'};
for(const route of requestedRoutes)assert.ok(routeLabels[route],'Unsupported preview route');
await mkdir(output, { recursive: true });
Object.assign(process.env, { VITE_DATA_MODE: 'preview', VITE_ALLOW_PREVIEW_BUILD: 'true',
  VITE_PERFORMANCE_PROFILE: 'false', VITE_PERFORMANCE_MONITOR: 'false' });
await build({ build: { outDir: `${output}/app` }, logLevel: 'warn' });
const server = await preview({ build: { outDir: `${output}/app` }, preview: { host: '127.0.0.1', port: 0 } });
const url = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const checks = [];
try {
  for (const scenario of [
    { name: 'signed-out' },
    { name: 'owner', id: 'emp_admin', role: 'super_admin' },
    { name: 'sales-employee', id: 'emp_sales_01', role: 'employee' },
  ]) {
    const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
    const page = await context.newPage();
    const errors = [];
    let blockedExternalRequests = 0;
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => {
      if (route.request().url().startsWith(url + '/')) return route.continue();
      blockedExternalRequests++;
      return route.abort();
    });
    try {
      let ordersChecked=false;
      let ordersUnavailable=false;
      const routeChecks=[];
      if (scenario.id) {
        const claims = { uid: scenario.id, identityId: scenario.id, appUserId: scenario.id,
          companyId: 'comp_preview', accountType: 'employee', role: scenario.role };
        await page.addInitScript(token => { window.__initial_auth_token = token; },
          `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`);
      }
      await page.goto(url);
      if (scenario.id) await page.locator('main[data-hd-module="home"]').waitFor({ timeout: 20000 });
      else await page.locator('input[type="tel"]').waitFor({ timeout: 20000 });
      await page.waitForTimeout(1000);
      if (scenario.id) for(const module of requestedRoutes) {
        const label=routeLabels[module];
        let target=page.locator('[data-hd-navigation="bottom"]').getByRole('button',{name:label,exact:true});
        if(!await target.count()){
          await page.locator('[data-hd-navigation="bottom"]').getByRole('button',{name:'Thêm',exact:true}).click();
          await page.locator('main[data-hd-module="more"]').waitFor();
          target=page.locator('main').getByRole('button',{name:label,exact:true});
        }
        if(await target.count()){
          await target.click();
          await page.waitForFunction(module=>{
            const main=document.querySelector('main[data-hd-module="'+module+'"]');
            const selector={payroll:'.payroll-workspace',products:'.premium-products-module',warehouse_dispatch:'.premium-dispatch-module',customers:'.premium-customer-module',debt:'.premium-debt-module',employees:'[data-hd-employee-directory]',pricing:'.premium-pricing-module'}[module] || '.premium-orders-module';
            return main && main.querySelector(selector)
              && !main.querySelector('[aria-busy="true"],[data-hd-module-loading]');
          },module,{timeout:20000});
          routeChecks.push({module,status:'PASS_PROJECTION_READY'});
          if(module==='orders')ordersChecked=true;
          if(module==='pricing' && scenario.name==='owner'){
            const note=page.getByPlaceholder('Ghi chú công thức nếu cần');
            assert.equal(await note.count(),0,'closed formula section must not build its editor controls');
            await page.getByRole('button',{name:'3. Công thức sản phẩm gốc/phụ',exact:true}).click();
            await page.getByRole('button',{name:'+ Công thức',exact:true}).click();
            await note.first().waitFor();
            await page.evaluate(()=>{window.__pricingFocusedNode=document.querySelector('textarea[placeholder="Ghi chú công thức nếu cần"]')});
            await note.first().pressSequentially('Draft remains focused',{delay:15});
            assert.equal(await note.first().inputValue(),'Draft remains focused');
            assert.equal(await page.evaluate(()=>window.__pricingFocusedNode===document.querySelector('textarea[placeholder="Ghi chú công thức nếu cần"]') && document.activeElement===window.__pricingFocusedNode),true);
            await page.waitForFunction(()=>{
              const pricing=document.querySelector('.premium-pricing-module');
              return pricing && !pricing.querySelector('[aria-busy="true"]');
            },null,{timeout:20000});
            assert.equal(await note.first().inputValue(),'Draft remains focused');
            routeChecks.push({module:'pricing_formula_editor',status:'PASS_DIRTY_INPUT_NODE_AND_FOCUS_RETAINED_NO_SAVE'});
          }
        }else {
          routeChecks.push({module,status:'NOT_PERMITTED_NOT_TESTED'});
          if(module==='orders')ordersUnavailable=true;
        }
      }
      const initializationError = await page.evaluate(() => /Cannot access ['"][\w$]+['"] before initialization/.test(document.body.innerText));
      assert.equal(initializationError, false, scenario.name);
      assert.deepEqual(errors, [], scenario.name);
      checks.push({ scenario: scenario.name, status: 'PASS', blockedExternalRequests,
        routes:routeChecks,
        ...(ordersChecked?{ordersProjectionReady:true}:{}),...(ordersUnavailable?{ordersProjection:'NOT_PERMITTED_NOT_TESTED'}:{}), });
      await page.screenshot({ path: `${output}/${scenario.name}.png` });
    } catch (error) {
      await page.screenshot({ path: `${output}/${scenario.name}-failure.png` });
      checks.push({ scenario: scenario.name, status: 'FAIL', message: error.message, errors });
      throw error;
    } finally { await context.close(); }
  }
} finally {
  await writeFile(`${output}/result.json`, JSON.stringify({ checks,
    scope: 'Full production React App in isolated preview build, synthetic SDK authentication claims and seed records. External network blocked. No real Firebase login, credentials, cloud writes or performance claim.' }, null, 2));
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
console.log(JSON.stringify({ checks, scope: 'Preview App initialization only; real Firebase login still requires user on Acceptance APK.' }));
