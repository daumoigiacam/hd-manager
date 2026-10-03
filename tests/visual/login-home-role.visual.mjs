import assert from 'node:assert/strict';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';
const deadline = setTimeout(() => { console.error('Login home timeout 120s'); process.exit(1); }, 120000);
Object.assign(process.env, { VITE_DATA_MODE: 'preview', VITE_ALLOW_PREVIEW_BUILD: 'true' });
const outDir = 'test-results/login-home-preview';
await build({ build: { outDir }, logLevel: 'error' });
const server = await preview({ build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  for (const position of ['', 'Kinh doanh', 'Tài xế', 'Sản xuất']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route('**/*', route => route.request().url().startsWith(url) ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ position }) => {
      const claims = { uid: 'own', identityId: 'own', appUserId: 'own', companyId: 'test', accountType: 'employee', role: 'employee', name: 'Own Employee' };
      window.__initial_auth_token = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
      localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify({ __replaceSeed: true, companies: { test: { id: 'test', name: 'Test Company' } }, employees: position ? { own: { id: 'own', companyId: 'test', role: 'employee', name: 'Own Employee', position } } : {} }));
      window.__wrongHomeSeen = false;
      new MutationObserver(() => { if (document.querySelector('.business-report-kpi--revenue')) window.__wrongHomeSeen = true; }).observe(document, { subtree: true, childList: true });
    }, { position });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    try {
      await page.getByRole('button', { name: 'Mở hồ sơ cá nhân', exact: true }).waitFor({ timeout: 20000 });
    } catch (error) {
      console.error({ position, errors, text: (await page.locator('body').innerText()).slice(0, 2500) });
      throw error;
    }
    assert.equal(await page.evaluate(() => window.__wrongHomeSeen), false, position || 'profile not loaded');
    assert.match(await page.locator('.hd-staff-greeting-surface').innerText(), /Own Employee/);
    assert.deepEqual(errors, []);
    console.log(`PASS personal home from first render: ${position || 'missing profile'}`);
    await context.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); clearTimeout(deadline); }
