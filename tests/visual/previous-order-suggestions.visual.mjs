import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';
import { installPreviewReader } from '../helpers/preview-browser-storage.mjs';

const output = 'test-results/previous-order-visual';
let browser;
let server;
const deadline = setTimeout(() => { console.error('TIMEOUT: previous-order visual verification'); process.exit(124); }, 180000);
Object.assign(process.env, { VITE_DATA_MODE: 'preview', VITE_ALLOW_PREVIEW_BUILD: 'true', VITE_HD_BUILD_ID: 'previous-order-verification' });
try {
  await mkdir(output, { recursive: true });
  await build({ build: { outDir: `${output}/app` }, logLevel: 'warn' });
  server = await preview({ build: { outDir: `${output}/app` }, preview: { host: '127.0.0.1', port: 0 } });
  const baseUrl = server.resolvedUrls.local[0];
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const results = [];
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    page.setDefaultTimeout(15000);
    await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseUrl).origin ? route.continue() : route.abort());
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await installPreviewReader(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { window.__shareInvocations = (window.__shareInvocations || 0) + 1; } });
      const claims = { uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin', companyId: 'comp_preview', accountType: 'employee', role: 'super_admin', name: 'Admin', phone: '0909000001' };
      window.__initial_auth_token = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
      if (sessionStorage.getItem('previous-order-seeded')) return;
      const dateKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const older = new Date(); older.setDate(older.getDate() - 2);
      const customer = { id: 'c_a', companyId: 'comp_preview', name: 'Customer A', empId: 'emp_sales_01', customerProductIds: ['duck', 'chicken'], priceOverrides: { duck: { price: 90000, unit: 'Kg', size: '9kg' } } };
      const makeOrder = (id, customerId, date, productId) => ({ id, companyId: 'comp_preview', customerId, salesEmpId: 'emp_sales_01', date, createdAt: `${date}T08:00:00+07:00`, items: [{ productId, quantity: 5, quantityUnit: 'Con', billingUnit: 'Kg', pricingUnit: 'Kg', unitPrice: 50000, sizeLabel: '2kg' }] });
      const orderRequests = Object.fromEntries(Array.from({ length: 4500 }, (_, i) => [`noise${i}`, makeOrder(`noise${i}`, `other${i}`, dateKey(older), 'chicken')]));
      orderRequests.old = makeOrder('old', 'c_a', dateKey(older), 'chicken');
      orderRequests.previous = makeOrder('previous', 'c_a', dateKey(yesterday), 'duck');
      localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify({
        customers: { c_a: customer }, orderRequests,
        products: { duck: { id: 'duck', companyId: 'comp_preview', name: 'Vịt không móc', unit: 'Kg', price: 90000 }, chicken: { id: 'chicken', companyId: 'comp_preview', name: 'Gà', unit: 'Con', price: 70000 } },
      }));
      sessionStorage.setItem('previous-order-seeded', '1');
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 3 });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-hd-shell="enterprise"]').waitFor();
    await page.locator('[data-hd-navigation="bottom"]').getByRole('button', { name: 'Đặt hàng', exact: true }).click();
    await page.getByRole('button', { name: /lên đơn/i }).click();
    const dialog = page.getByRole('dialog');
    const inputStart = performance.now();
    await dialog.getByPlaceholder('Chọn hoặc tìm khách hàng').fill('Customer A');
    const inputMs = performance.now() - inputStart;
    const selectionStart = performance.now();
    await dialog.getByRole('option', { name: /Customer A/ }).click();
    await dialog.getByRole('button', { name: 'Vịt không móc', exact: true }).waitFor();
    const selectionMs = performance.now() - selectionStart;
    assert.equal(await dialog.locator('[data-order-product-attribute]').count(), 1);
    assert.equal(await dialog.getByRole('button', { name: 'Gà', exact: true }).count(), 0);
    await page.screenshot({ path: `${output}/suggestions-${width}.png` });
    await dialog.getByRole('button', { name: 'Thêm sản phẩm khác' }).click();
    assert.ok(await dialog.getByText('Gà', { exact: true }).count() > 0);
    await dialog.getByRole('button', { name: 'Thêm sản phẩm khác' }).click();
    await dialog.getByRole('button', { name: 'Vịt không móc', exact: true }).click();
    await dialog.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
    await dialog.getByPlaceholder('Số lượng').fill('5');
    const saveStart = performance.now();
    await dialog.getByRole('button', { name: 'Lưu đơn', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const saveUiMs = performance.now() - saveStart;
    await page.waitForFunction(() => Object.values(window.__readPreviewStore().orderRequests || {}).some(row => row.customerId === 'c_a' && !['old', 'previous'].includes(row.id)));
    const stored = await page.evaluate(() => window.__readPreviewStore());
    const saved = Object.values(stored.orderRequests).find(row => row.customerId === 'c_a' && !['old', 'previous'].includes(row.id));
    assert.equal(saved.items[0].unitPrice, 50000);
    assert.equal(saved.items[0].sizeLabel, '2kg');
    assert.equal(saved.items[0].quantity, 5);
    assert.equal(stored.customers.c_a.priceOverrides.duck.price, 90000);
    assert.equal(await page.getByText(/Firebase đang đồng bộ nền|Đã lưu thay đổi đơn/).count(), 0);
    await page.locator('.premium-order-request-module').getByRole('button', { name: 'Chia sẻ', exact: true }).click();
    await page.waitForFunction(() => window.__shareInvocations === 1);
    assert.equal(await page.getByText(/Đã mở bảng chia sẻ/).count(), 0);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-hd-shell="enterprise"]').waitFor();
    const restored = await page.evaluate(id => window.__readPreviewStore().orderRequests[id], saved.id);
    assert.deepEqual(restored.items, saved.items);
    assert.deepEqual(errors, []);
    results.push({ width, cpu: 3, requests: 4502, inputMs, selectionMs, saveUiMs, status: 'PASS', environment: 'isolated preview, not Firebase ACK' });
    await page.close();
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  clearTimeout(deadline);
  await browser?.close();
  await new Promise(resolve => server ? server.httpServer.close(resolve) : resolve());
}
