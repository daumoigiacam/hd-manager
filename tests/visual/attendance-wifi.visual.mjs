import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { seedData } from '../../src/mocks/seed-data.js';

process.env.VITE_DATA_MODE = 'preview';
const output = 'test-results/attendance-wifi';
await mkdir(output, { recursive: true });
const server = await createServer({ cacheDir: `${output}/vite-cache`, optimizeDeps: { entries: ['index.html', 'tests/visual/fixtures/attendance-wifi.html'] }, server: { host: '127.0.0.1', port: 0 }, logLevel: 'warn' });
const browser = await chromium.launch({ executablePath: process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const claims = { uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin', companyId: 'comp_preview',
  companyName: 'Công ty HD Preview', accountType: 'employee', role: 'super_admin', name: 'Quản trị Demo', phone: '0909000001' };
try {
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 900 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    const externalWrites = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      if (/^https?:/.test(route.request().url()) && !route.request().url().startsWith(url)) {
        if (route.request().method() !== 'GET') externalWrites.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    await page.addInitScript(({ fixture, claims }) => {
      window.__initial_auth_token = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
      const key = 'hd-manager-local-db-v2-clean-preview';
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ ...fixture, __replaceSeed: true }));
    }, { fixture: seedData, claims });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.getByRole('button', { name: 'Thêm', exact: true }).first().click({ timeout: 30000 });
    await page.getByRole('button', { name: 'Chấm công', exact: true }).first().click();
    await page.getByRole('button', { name: 'WiFi nội bộ', exact: true }).click();
    const wifi = page.locator('[data-attendance-screen="wifi"]');
    await wifi.getByRole('heading', { name: 'WiFi nội bộ', exact: true }).waitFor();
    const toggle = wifi.getByRole('switch', { name: 'Tự động chấm công vào', exact: true });
    assert.equal(await toggle.isDisabled(), true, 'browser must not pretend to support native WiFi');
    assert.match(await wifi.innerText(), /chưa hỗ trợ web và bản iPhone/);
    await page.screenshot({ path: `${output}/${viewport.width}-web.png`, animations: 'disabled' });
    await wifi.getByRole('button', { name: 'Quay lại', exact: true }).click();
    await wifi.waitFor({ state: 'hidden' });
    const self = page.locator('[data-attendance-self]');
    await self.waitFor();
    assert.equal(await page.getByText('Chấm công của bạn', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Lọc theo vị trí', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Cảnh báo thiếu chấm công', { exact: true }).count(), 0);
    await self.getByRole('button', { name: 'GPS vị trí', exact: true }).click();
    assert.equal(await self.getByRole('button', { name: 'GPS vị trí', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await self.getByRole('button', { name: 'WiFi nội bộ', exact: true }).getAttribute('aria-pressed'), 'false');
    await page.screenshot({ path: `${output}/${viewport.width}-team.png`, animations: 'disabled' });
    assert.equal(await page.locator('.hd-app-header').isVisible(), true, 'team header restored');

    await page.goto(`${url}/tests/visual/fixtures/attendance-wifi.html`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('switch').waitFor();
    await page.getByRole('switch').dblclick();
    assert.equal(await page.evaluate(() => window.__wifiTest.toggles), 1);
    assert.equal(await page.getByRole('switch').getAttribute('aria-checked'), 'false', 'pending setting is not reported as saved');
    assert.equal(await page.getByRole('switch').isDisabled(), true);
    await page.evaluate(() => window.__wifiTest.finish(false));
    await page.getByText('Không lưu được cài đặt tự động.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('switch').getAttribute('aria-checked'), 'false');
    await page.getByRole('switch').click();
    await page.evaluate(() => window.__wifiTest.finish(true));
    await page.waitForFunction(() => document.querySelector('[role="switch"]').getAttribute('aria-checked') === 'true');
    await page.evaluate(() => window.__wifiTest.setRecord({ checkIn: new Date().toISOString(), status: 'present', checkInMethod: 'WiFi: HD', checkInMethodMeta: { ssid: 'HD', automatic: true } }));
    await page.getByText('Đã ghi nhận vào ca', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Chấm công vào qua WiFi', exact: true }).count(), 0);
    await page.screenshot({ path: `${output}/${viewport.width}-native-ui-fixture.png`, animations: 'disabled' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'no horizontal overflow');
    assert.deepEqual(errors, []);
    assert.deepEqual(externalWrites, []);
    console.log(`PASS ${viewport.width}x${viewport.height}: company WiFi route, safe browser gate, back navigation; native UI fixture switch/error/double-tap/confirmed time`);
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
