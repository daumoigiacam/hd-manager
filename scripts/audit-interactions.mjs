import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { build, preview } from 'vite';
import { chromium, _android } from 'playwright-core';
import { runInteractionActionCases } from '../tests/visual/interaction-action-cases.mjs';
import { summarizeInteractionSamples } from './interaction-metrics.mjs';

// Isolated UI measurements: never connect this fixture to cloud services.
const phase = process.argv[2] || 'before';
assert.match(phase, /^[a-z0-9-]+$/);
const output = path.resolve('test-results/full-interaction', phase);
const buildPhase = process.env.HD_AUDIT_BUILD_PHASE || phase;
assert.match(buildPhase, /^[a-z0-9-]+$/);
const buildOutput = path.resolve('test-results/full-interaction', buildPhase, 'app');
const actionsOnly = process.env.HD_AUDIT_ACTIONS_ONLY === '1';
const useAndroid = process.env.HD_AUDIT_ANDROID === '1';
const selectedModules = process.env.HD_AUDIT_MODULES?.split(',').filter(Boolean);
const profileModules = (process.env.HD_AUDIT_PROFILE_MODULES || 'pricing,finance').split(',');
const profileActions = (process.env.HD_AUDIT_PROFILE_ACTIONS || 'open').split(',');
await mkdir(output, { recursive: true });
Object.assign(process.env, {
  VITE_DATA_MODE: 'preview', VITE_ALLOW_PREVIEW_BUILD: 'true',
  VITE_PERFORMANCE_PROFILE: 'true', VITE_PERFORMANCE_MONITOR: 'true',
  VITE_PERFORMANCE_LOG_LIMIT: '10000', VITE_HD_BUILD_ID: `interaction-${phase}`,
});
if (process.env.HD_AUDIT_REUSE_BUILD !== '1') {
  await build({ build: { outDir: buildOutput }, logLevel: 'warn' });
}
const server = await preview({ build: { outDir: buildOutput }, preview: { host: '127.0.0.1', port: 0 } });
const baseUrl = `http://127.0.0.1:${server.httpServer.address().port}/?perfMonitor=1`;
const claims = { uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin', companyId: 'comp_preview', accountType: 'employee', role: 'super_admin', name: 'Quản trị Demo', phone: '0909000001' };
const token = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
const day = new Date();
const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
const rows = (count, prefix, make) => Object.fromEntries(Array.from({ length: count }, (_, i) => {
  const id = `${prefix}_${i}`;
  return [id, { id, companyId: 'comp_preview', ...make(i) }];
}));
const fixture = {
  products: rows(600, 'p_perf', i => ({ name: `Sản phẩm ${String(i).padStart(4, '0')}`, category: 'Hàng thử', unit: 'kg', purchaseUnit: 'kg', stockUnit: 'kg', costPrice: 30000, price: 50000, sellingPrice: 50000, stock: 50, isArchived: false })),
  customers: rows(360, 'c_perf', i => ({ name: `Khách hàng ${i}`, empId: 'emp_sales_01', phone: `0900${String(i).padStart(6, '0')}`, isArchived: false })),
  orders: rows(1800, 'o_perf', i => ({ customerId: `c_perf_${i % 360}`, empId: 'emp_sales_01', date, total: 250000, totalAmount: 250000, items: [{ productId: `p_perf_${i % 600}`, quantity: 5, billingQuantity: 5, unitPrice: 50000, amount: 250000 }] })),
  payments: rows(900, 'pay_perf', i => ({ customerId: `c_perf_${i % 360}`, date, amount: 50000 })),
  orderRequests: {
    or_save_speed: { id: 'or_save_speed', companyId: 'comp_preview', customerId: 'c_preview_01', salesEmpId: 'emp_sales_01', empId: 'emp_sales_01', date, createdAt: `${date}T08:00:00+07:00`, totalQuantity: 2, totalAmount: 570000, items: [{ productId: 'prod_preview_01', description: 'Nước giặt HD', quantity: 2, quantityUnit: 'Can', orderUnit: 'Can', actualUnit: 'Can', billingUnit: 'Can', pricingUnit: 'Can', billingQuantity: 2, unitPrice: 285000, amount: 570000, lineTotal: 570000 }] },
  },
};
if (actionsOnly) {
  fixture.customers.c_preview_01 = {
    id: 'c_preview_01', companyId: 'comp_preview', empId: 'emp_sales_01',
    name: 'Cửa hàng Lan Anh', phone: '0911222333', isArchived: false,
    customerProductIds: ['p_perf_0'],
  };
}
const routes = [
  ['home', 'Trang chủ'], ['order_requests', 'Lên đơn đặt hàng', 'Đặt hàng'],
  ['orders', 'Đơn hàng'], ['warehouse_dispatch', 'Xuất kho'],
  ['warehouse_import', 'Nhập Xuất Tồn'], ['delivery_reports', 'Báo cáo giao hàng'],
  ['products', 'Kho sản phẩm'], ['customers', 'Khách hàng'], ['debt', 'Sổ nợ'],
  ['finance', 'Thu chi'], ['bank_payments', 'Ngân hàng'], ['messages', 'Tin nhắn'],
  ['pricing', 'Giá cả'], ['company_attendance', 'Chấm công'], ['employee_reviews', 'Đánh giá'],
  ['asset_management', 'Quản lý tài sản'], ['payroll', 'Bảng lương'], ['employees', 'Nhân sự'],
  ['price_quotes', 'Báo giá hàng loạt'], ['settings', 'Cài đặt'], ['role_permissions', 'Vai trò'], ['billing', 'Gói cước'],
];
const samples = [];
const failures = [];
const errors = [];
const device = useAndroid ? (await _android.devices()).find(device => device.serial().startsWith('emulator-')) : null;
if (useAndroid) assert.ok(device, 'An authorized Android emulator is required; never select a physical device implicitly');
const adb = process.env.HD_MANAGER_ADB || 'D:/HD-DEV/android/sdk/platform-tools/adb.exe';
const port = String(server.httpServer.address().port);
let debugPort = '';
let reversed = false;
let browser;
try {
  if (device) {
    execFileSync(adb, ['-s', device.serial(), 'reverse', `tcp:${port}`, `tcp:${port}`]);
    reversed = true;
    debugPort = execFileSync(adb, ['-s', device.serial(), 'forward', 'tcp:0', 'localabstract:chrome_devtools_remote'], { encoding: 'utf8' }).trim();
  }
  browser = device ? await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`) : await chromium.launch({ executablePath: process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const viewports = device ? [{ name: 'android-emulator' }] : [{ name: 'mobile', width: 390, height: 844 }, { name: 'desktop', width: 1366, height: 900 }];
  for (const viewport of viewports) {
    const context = device ? browser.contexts()[0] : await browser.newContext({ viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => {
      errors.push({ viewport: viewport.name, message: error.message });
      console.log(`PAGE ERROR: ${error.message}`);
    });
    page.on('dialog', dialog => dialog.accept());
    await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseUrl).origin ? route.continue() : route.abort());
    await page.addInitScript(({ token, fixture }) => {
      window.__initial_auth_token = token;
      if (!sessionStorage.getItem('perf-seeded')) {
        localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify(fixture));
        sessionStorage.setItem('perf-seeded', '1');
      }
    }, { token, fixture });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-hd-shell="enterprise"]').waitFor({ timeout: 30000 });
    await page.waitForFunction(() => (window.hdPerformanceMonitor?.subscriptions().length || 0) >= 3);
    const measure = async (module, action, perform, expected, iteration) => {
      const profileSession = profileActions.includes(action) && iteration === 1 && profileModules.includes(module)
        ? await context.newCDPSession(page) : null;
      if (profileSession) { await profileSession.send('Profiler.enable'); await profileSession.send('Profiler.start'); }
      await page.evaluate(({ module, action, expected }) => {
        const monitor = window.hdPerformanceMonitor;
        monitor.clear();
        const id = monitor.beginInteraction(action, module);
        window.__auditResult = null;
        let started = false;
        let completed = false;
        const observer = new MutationObserver(check);
        function check() {
          if (!started || completed) return;
          const nodes = [...document.querySelectorAll(expected.selector)];
          const visible = nodes.filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
          const match = expected.mode === 'hidden' ? visible.length === 0
            : expected.mode === 'value' ? visible.some(node => node.value === expected.value)
              : expected.mode === 'text' ? visible.some(node => node.textContent.includes(expected.value))
                : visible.length > 0;
          if (!match) return;
          completed = true;
          observer.disconnect();
          window.removeEventListener('hd-performance-event', onEvent);
          const observed = performance.now();
          requestAnimationFrame(() => requestAnimationFrame(() => {
            const result = monitor.finishInteraction('expected_ui_observed', id);
            window.__auditResult = { ...result.detail, uiObservedTimeMs: observed, events: monitor.events(), subscriptions: monitor.subscriptions() };
          }));
        }
        function onEvent(event) {
          if (event.detail.type !== 'interaction.event') return;
          started = true;
          queueMicrotask(check);
          requestAnimationFrame(check);
        }
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
        window.addEventListener('hd-performance-event', onEvent);
        window.__auditCleanup = () => { observer.disconnect(); window.removeEventListener('hd-performance-event', onEvent); monitor.finishInteraction('failed', id); };
      }, { module, action, expected });
      try {
        await perform();
        await page.waitForFunction(() => window.__auditResult, null, { timeout: 10000 });
        const result = await page.evaluate(() => window.__auditResult);
        const record = { viewport: viewport.name, module, action, iteration, ...result };
        samples.push(record);
        console.log(`${viewport.name} ${module}.${action} #${iteration}: ${result.totalMs}ms`);
        return result;
      } catch (error) {
        await page.evaluate(() => window.__auditCleanup?.());
        throw error;
      } finally {
        if (profileSession) {
          const { profile } = await profileSession.send('Profiler.stop');
          await writeFile(path.join(output, `${viewport.name}-${module}.cpuprofile`), JSON.stringify(profile));
          await profileSession.detach();
        }
      }
    };
    const navigate = async (route, measured = false, iteration = 0) => {
      const [module, label, bottomLabel] = routes.find(row => row[0] === route) || [route, 'Thêm'];
      const nav = page.locator(`[data-hd-navigation="${viewport.name !== 'desktop' ? 'bottom' : 'sidebar'}"]`);
      if (!await nav.isVisible() && await page.getByRole('button', { name: 'Quay lại', exact: true }).first().isVisible()) {
        await page.getByRole('button', { name: 'Quay lại', exact: true }).first().click();
        // Attendance has its own internal back stack before returning to the shell.
        if (!await nav.isVisible() && await page.locator('.attendance-workspace').isVisible()) {
          await page.getByRole('button', { name: 'Quay lại', exact: true }).first().click();
        }
      }
      await nav.waitFor();
      const directNames = { products: 'Sản phẩm', asset_management: 'Tài sản', billing: 'Gói dịch vụ', price_quotes: 'Báo giá', order_requests: 'Đơn đặt' };
      let button = nav.getByRole('button', { name: viewport.name !== 'desktop' ? (bottomLabel || label) : (directNames[route] || label), exact: true });
      if (!await button.isVisible().catch(() => false)) {
        await nav.getByRole('button', { name: 'Thêm', exact: true }).click();
        await page.locator('main[data-hd-module="more"]').waitFor();
        button = page.locator('main').getByRole('button', { name: label, exact: true });
      }
      const expected = { selector: `main[data-hd-module="${module}"]` };
      if (measured) return measure(module, 'open', () => button.click(), expected, iteration);
      await button.click();
      await page.locator(expected.selector).waitFor();
    };
    for (const [module] of actionsOnly ? [] : routes.filter(([key]) => !selectedModules || selectedModules.includes(key))) {
      try {
        for (let iteration = 1; iteration <= 5; iteration++) {
          await navigate(module === 'home' ? 'more' : 'home');
          await navigate(module, true, iteration);
          if (iteration === 1) {
            const controls = await page.locator('main').evaluate(main => ({
              buttons: [...main.querySelectorAll('button')].filter(node => node.getClientRects().length).map(node => node.getAttribute('aria-label') || node.textContent.trim()).slice(0, 100),
              inputs: [...main.querySelectorAll('input,select')].filter(node => node.getClientRects().length).map(node => ({ tag: node.tagName, type: node.type, label: node.getAttribute('aria-label') || node.placeholder })),
            }));
            await writeFile(path.join(output, `${viewport.name}-${module}-controls.json`), JSON.stringify(controls, null, 2));
          }
        }
      } catch (error) {
        failures.push({ viewport: viewport.name, module, action: 'open', error: error.message });
        console.log(`BLOCKED ${module}: ${error.message.slice(0, 180)}`);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('[data-hd-shell="enterprise"]').waitFor();
      }
    }
    if (!actionsOnly && !selectedModules) try {
      await navigate('products');
      await page.locator('.hd-product-list__primary').first().waitFor();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.start');
      for (let iteration = 1; iteration <= 5; iteration++) {
        await measure('products', 'open_edit', () => page.locator('.hd-product-list__primary').filter({ hasText: 'Sản phẩm 0000' }).click(), { selector: '[role="dialog"][aria-label="Sửa sản phẩm"]' }, iteration);
        const editor = page.getByRole('dialog', { name: 'Sửa sản phẩm' });
        const value = `P${iteration}`;
        await measure('products', 'input', () => editor.getByRole('textbox', { name: 'Viết tắt', exact: true }).fill(value), { selector: 'input[aria-label="Viết tắt"]', mode: 'value', value }, iteration);
        await measure('products', 'save_edit', () => editor.getByRole('button', { name: /Lưu/ }).click(), { selector: '[role="dialog"][aria-label="Sửa sản phẩm"]', mode: 'hidden' }, iteration);
      }
      const { profile } = await cdp.send('Profiler.stop');
      await writeFile(path.join(output, `${viewport.name}-products.cpuprofile`), JSON.stringify(profile));
      await cdp.detach();
      await page.screenshot({ path: path.join(output, `${viewport.name}-products.png`) });
    } catch (error) {
      failures.push({ viewport: viewport.name, module: 'products', action: 'edit_save', error: error.message });
      await page.screenshot({ path: path.join(output, `${viewport.name}-product-error.png`) });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('[data-hd-shell="enterprise"]').waitFor();
    }
    if (!actionsOnly && !selectedModules) try {
      await navigate('order_requests');
      const module = page.locator('.premium-order-request-module');
      for (let iteration = 1; iteration <= 5; iteration++) {
        const oldPrice = iteration === 1 ? 285000 : 290000 + iteration - 1;
        const value = 290000 + iteration;
        await measure('order_requests', 'open_edit_price', () => module.getByRole('button', { name: new Intl.NumberFormat('vi-VN').format(oldPrice), exact: true }).first().click(), { selector: '[role="dialog"]' }, iteration);
        const editor = page.getByRole('dialog', { name: 'Sửa đơn giá' });
        await editor.getByRole('textbox').first().evaluate(node => node.dataset.auditPrice = 'true');
        await measure('order_requests', 'input_price', () => editor.getByRole('textbox').first().fill(String(value)), { selector: '[data-audit-price]', mode: 'value', value: new Intl.NumberFormat('vi-VN').format(value) }, iteration);
        await measure('order_requests', 'save_price', () => editor.getByRole('button', { name: 'Lưu', exact: true }).click(), { selector: '[data-audit-price]', mode: 'hidden' }, iteration);
        await module.getByRole('button', { name: new Intl.NumberFormat('vi-VN').format(value), exact: true }).first().waitFor();
      }
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('[data-hd-shell="enterprise"]').waitFor();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview')).orderRequests.or_save_speed.items[0].unitPrice === 290005);
    } catch (error) {
      failures.push({ viewport: viewport.name, module: 'order_requests', action: 'edit_save', error: error.message });
      await page.screenshot({ path: path.join(output, `${viewport.name}-request-error.png`) });
    }
    if (actionsOnly) await runInteractionActionCases({ page, navigate, measure, failures, viewport: viewport.name, output });
    if (device) await page.close();
    else await context.close();
  }
} finally {
  await browser?.close();
  if (device) {
    if (reversed) execFileSync(adb, ['-s', device.serial(), 'reverse', '--remove', `tcp:${port}`]);
    if (debugPort) execFileSync(adb, ['-s', device.serial(), 'forward', '--remove', `tcp:${debugPort}`]);
    await device.close();
  }
  await new Promise(resolve => server.httpServer.close(resolve));
  const summary = summarizeInteractionSamples(samples);
  await writeFile(path.join(output, 'samples.json'), JSON.stringify(samples, null, 2));
  await writeFile(path.join(output, 'summary.json'), JSON.stringify({ phase, fixtureCounts: Object.fromEntries(Object.entries(fixture).map(([key, value]) => [key, Object.keys(value).length])), runtime: `${device ? 'Android emulator Chrome' : 'Desktop Chrome/mobile viewport'}, React production profiling, isolated preview storage; NOT cloud/backend latency or physical device acceptance`, samples: samples.length, summary, failures, errors }, null, 2));
  console.log(JSON.stringify({ samples: samples.length, failures, errors }, null, 2));
  if (failures.length || errors.length) process.exitCode = 1;
}
