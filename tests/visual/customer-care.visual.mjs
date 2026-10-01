import assert from 'node:assert/strict';
import { readdir, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, cacheDir: 'test-results/customer-care/cache', server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['tests/visual/fixtures/customer-care.html'] } });
await server.listen();
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mkdir('test-results/customer-care', { recursive: true });
  const css = (await readdir('dist/assets')).find(name => /^index-.*\.css$/.test(name));
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/visual/fixtures/customer-care.html`);
    await page.addStyleTag({ path: `dist/assets/${css}` });
    await page.getByRole('button', { name: /Khách lâu chưa mua/ }).waitFor();
    await page.screenshot({ path: `test-results/customer-care/${width}-list.png` });
    for (const name of ['Khách lâu chưa mua', 'Khách mới', 'Sau khi giao hàng', 'Sinh nhật khách hàng', 'Ngày lễ', 'Sau khi nhận khoản thanh toán']) {
      await page.getByRole('button', { name: new RegExp(name) }).click();
      await page.getByLabel('Trạng thái', { exact: true }).check();
      await page.getByLabel('Người gửi').selectOption('assigned_employee');
      await page.getByLabel('Nội dung tin nhắn').fill('Tin nhắn kiểm thử');
      if (name === 'Ngày lễ') await page.getByLabel('Ngày lễ', { exact: true }).fill('2026-10-20');
      await page.getByRole('button', { name: 'Lưu', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Đã lưu.' }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `test-results/customer-care/${width}-detail.png` });
      await page.getByRole('button', { name: 'Quay lại' }).click();
    }
    assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 6);
  }
  assert.deepEqual(errors, []);
  console.log('PASS care UI: six editors, save, back, toggles and layout at 360/1440');
} finally { await browser.close(); await server.close(); }
