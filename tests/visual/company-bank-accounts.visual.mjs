import assert from 'node:assert/strict';
import { readdir, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, cacheDir: 'test-results/bank-accounts/vite-cache', server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['tests/visual/fixtures/company-bank-accounts.html'] } });
await server.listen();
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await mkdir('test-results/bank-accounts', { recursive: true });
  const css = (await readdir('dist/assets')).find(name => /^index-.*\.css$/.test(name));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/visual/fixtures/company-bank-accounts.html`);
    await page.addStyleTag({ path: `dist/assets/${css}` });
    await page.locator('[data-bank-accounts="list"]').waitFor();
    await page.screenshot({ path: `test-results/bank-accounts/${width}-list.png` });
    await page.getByRole('button', {name: /Thêm tài khoản/}).click();
    await page.getByLabel('Chủ tài khoản', {exact:true}).fill('TEST TWO');
    await page.getByLabel('Số tài khoản', {exact:true}).fill('009999');
    await page.getByLabel('Tên ngân hàng').selectOption('VCB');
    await page.getByRole('button', {name:'Lưu tài khoản'}).click();
    await page.getByRole('status').filter({hasText:'Đã lưu'}).waitFor();
    await page.screenshot({ path: `test-results/bank-accounts/${width}-detail.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  assert.deepEqual(errors, []);
  console.log('PASS bank account form: create and save at 360/1440, no runtime errors');
} finally { await browser.close(); await server.close(); }
