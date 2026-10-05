import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const deadline = setTimeout(() => { console.error('TIMEOUT dispatch panels 120s'); process.exit(1); }, 120000);
const server = await createServer({ configFile: false, cacheDir: 'test-results/dispatch-panels-vite-cache',
  optimizeDeps: { entries: ['tests/visual/fixtures/dispatch-panels.html'] },
  esbuild: { jsx: 'automatic' }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  await mkdir('test-results', { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    page.setDefaultTimeout(10000);
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/tests/visual/fixtures/dispatch-panels.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const picker = page.getByRole('combobox', { name: 'Tìm khách' });
    await picker.click();
    await picker.fill('Khách');
    await picker.press('ArrowDown');
    await page.getByRole('listbox').getByRole('option').press('Enter');
    assert.equal(await page.locator('output').textContent(), 'customer-a');
    await picker.click();
    await picker.press('Escape');
    assert.equal(await page.getByRole('listbox').count(), 0);
    await page.getByRole('button', { name: 'Mở lịch sử' }).click();
    let dialog = page.getByRole('dialog', { name: 'Chi tiết phiếu xuất', exact: true });
    await dialog.waitFor();
    assert(await dialog.evaluate(node => node.contains(document.activeElement)));
    await page.keyboard.press('Shift+Tab');
    assert(await dialog.evaluate(node => node.contains(document.activeElement)));
    await dialog.getByRole('button', { name: 'Xóa lịch sử xuất kho' }).click();
    assert.equal(await page.locator('output').textContent(), 'd');
    assert(await dialog.locator('.hd-dispatch-dialog-cell-actions span').evaluate(node => node.getBoundingClientRect().width >= 40), 'customer name must not collapse beside delete control');
    await page.screenshot({ path: `test-results/dispatch-history-${width}.png` });
    assert(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth));
    await page.keyboard.press('Escape');
    assert(await page.getByRole('button', { name: 'Mở lịch sử' }).evaluate(node => node === document.activeElement));
    await page.getByRole('button', { name: 'Mở đơn thiếu' }).click();
    dialog = page.getByRole('dialog', { name: 'Đơn còn thiếu', exact: true });
    await dialog.getByRole('button', { name: 'Xóa đơn đặt sai', exact: true }).click();
    assert.equal(await page.locator('output').textContent(), 'request-original');
    assert(await dialog.getByRole('button', { name: 'Xóa đơn đặt sai', exact: true }).isDisabled());
    assert(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth));
    await page.screenshot({ path: `test-results/dispatch-shortage-${width}.png` });
    await page.keyboard.press('Escape');
    const shortages = page.getByRole('region', {name: 'Danh sách đơn thiếu'});
    assert.equal(await shortages.locator('.hd-dispatch-shortage-customer').count(), 3);
    await shortages.getByRole('button', {name: 'Xem thêm 2 khách còn thiếu'}).click();
    assert.equal(await shortages.locator('.hd-dispatch-shortage-customer').count(), 5);
    await shortages.getByRole('button', {name: 'Thu gọn danh sách thiếu'}).click();
    await page.getByLabel('Tháng lịch sử').selectOption('09');
    assert.equal(await page.getByLabel('Tháng lịch sử').inputValue(), '09');
    await page.getByRole('button', {name: 'day-5: 2 đơn xuất kho', exact: true}).click();
    assert.equal(await page.locator('output').textContent(), 'day-5');
    assert(await page.locator('main').evaluate(node => node.scrollWidth <= node.clientWidth));
    await page.screenshot({path: `test-results/dispatch-overview-${width}.png`, fullPage: true});
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS isolated component UI: picker keyboard, callback identity, dialogs, focus restore, 320/390/768/1440 widths');
} finally {
  await browser.close(); await server.close(); clearTimeout(deadline);
}
