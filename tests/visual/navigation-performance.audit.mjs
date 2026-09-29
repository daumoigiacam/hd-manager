import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const url = process.env.HD_MANAGER_VIEWPORT_AUDIT_URL || 'http://127.0.0.1:5223/';
const androidEndpoint = process.env.HD_MANAGER_ANDROID_CDP;
assert.ok(['127.0.0.1', '10.0.2.2'].includes(new URL(url).hostname), 'Run only against isolated local preview');
const claims = { uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin', companyId: 'comp_preview', accountType: 'employee', role: 'super_admin', name: 'Preview', phone: '0909000001' };
const browser = androidEndpoint
  ? await chromium.connectOverCDP(androidEndpoint)
  : await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = androidEndpoint
    ? browser.contexts()[0].pages().find(item => item.url().startsWith(url))
    : await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  assert.ok(page, 'Open the isolated preview in Android Chrome first');
  await page.route('**/*', route => {
    const requested = new URL(route.request().url());
    return requested.origin === new URL(url).origin ? route.continue() : route.abort();
  });
  await page.addInitScript(token => { window.__initial_auth_token = token; }, `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${url}?perfMonitor=1`, { waitUntil: 'networkidle' });
  const nav = page.locator('[data-hd-navigation="bottom"]');
  await nav.waitFor();
  const samples = [];
  for (let round = 0; round < 2; round += 1) {
    for (const label of ['Đặt hàng', 'Xuất kho', 'Đơn hàng', 'Thêm', 'Trang chủ']) {
      const startEvent = await page.evaluate(() => window.hdPerformanceMonitor.events().length);
      const start = performance.now();
      try {
        await nav.getByRole('button', { name: label, exact: true }).click({ timeout: 5000 });
      } catch (error) {
        await page.screenshot({ path: 'test-results/navigation-blocked.png', fullPage: true });
        console.log(JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('main, [data-hd-navigation="bottom"], [aria-label="Thêm"]')].map(el => ({ tag: el.tagName, class: el.className, rect: el.getBoundingClientRect().toJSON(), position: getComputedStyle(el).position, zIndex: getComputedStyle(el).zIndex, transform: getComputedStyle(el).transform })))));
        throw error;
      }
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const responseMs = Math.round(performance.now() - start);
      const events = await page.evaluate(offset => window.hdPerformanceMonitor.events().slice(offset), startEvent);
      samples.push({ round, label, responseMs, renderMs: Math.round(events.filter(event => event.type === 'render.react').reduce((sum, event) => sum + (event.detail.actualDurationMs || 0), 0)), apiRequests: events.filter(event => event.type === 'api.response').length });
    }
  }
  for (const [label, fab] of [['Nhân sự', '.hd-employee-module-fab'], ['Kho sản phẩm', '.hd-product-module-fab'], ['Đơn hàng', '.hd-order-module-fab']]) {
    await nav.getByRole('button', { name: 'Thêm', exact: true }).click();
    await page.locator('main').getByRole('button', { name: label, exact: true }).click();
    const addButton = page.locator(fab).getByRole('button').first();
    await addButton.click({ trial: true });
    await nav.getByRole('button', { name: 'Trang chủ', exact: true }).click();
  }
  await page.screenshot({ path: 'test-results/save-audit-home.png', fullPage: true });
  const report = { environment: `${androidEndpoint ? 'Android emulator Chrome' : 'Desktop Chrome mobile viewport'}; local mock Firebase; click-to-two-animation-frames, not production latency`, samples, errors };
  await writeFile(`test-results/navigation-performance${androidEndpoint ? '-android' : ''}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  assert.deepEqual(errors, []);
  assert.ok(samples.every(sample => sample.responseMs < 1000), 'Each navigation must respond in under one second');
} finally {
  await browser.close();
}
