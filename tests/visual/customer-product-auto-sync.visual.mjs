import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';
import { installPreviewReader } from '../helpers/preview-browser-storage.mjs';
import { resolveCustomerProductConfiguration, buildCustomerProductBillingSnapshot } from '../../src/services/customerProductBilling.js';

// UI integration only. Real transaction/rules behavior is tested separately on Firestore Emulator.
const output = 'test-results/customer-config-ui';
await mkdir(output, { recursive: true });
const product = { id: 'sync-product', companyId: 'comp_preview', name: 'Gà Sync', unit: 'Kg', price: 62000, category: 'Gà', isArchived: false };
const config = { billingUnit: 'Kg', pricingUnit: 'Kg', price: 62000, unitPrice: 62000, size: '1-1.1kg', defaultOrderUnit: 'Con', orderUnits: ['Con', 'Kg'] };
const customer = { id: 'sync-customer', companyId: 'comp_preview', empId: 'emp_sales_01', name: 'Khách đồng bộ', phone: '0999000011', isArchived: false,
  customerProductIds: [product.id], priceOverrides: { [product.id]: config } };
const date = new Date().toLocaleDateString('sv-SE');
const snapshot = buildCustomerProductBillingSnapshot({ product, productId: product.id, productName: product.name,
  configuration: resolveCustomerProductConfiguration({ product, customerConfig: config }), actualQuantity: 120, actualUnit: 'Con', orderUnit: 'Con' });
const request = { id: 'sync-request', customerId: customer.id, companyId: customer.companyId, empId: customer.empId, salesEmpId: customer.empId,
  date, createdAt: new Date().toISOString(), items: [{ ...snapshot, productId: product.id, description: product.name, sizeLabel: config.size }], isArchived: false };
const fixture = { products: { [product.id]: product }, customers: { [customer.id]: customer }, orderRequests: { [request.id]: request } };
const claims = { uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin', companyId: 'comp_preview', accountType: 'employee', role: 'super_admin', name: 'QA' };
Object.assign(process.env, { VITE_DATA_MODE: 'preview', VITE_ALLOW_PREVIEW_BUILD: 'true' });
await build({ build: { outDir: `${output}/app` }, logLevel: 'warn' });
const server = await preview({ build: { outDir: `${output}/app` }, preview: { host: '127.0.0.1', port: 0 } });
const url = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.setDefaultTimeout(12000);
await installPreviewReader(page);
await page.addInitScript(({ fixture, token }) => {
  window.__initial_auth_token = token;
  if (!sessionStorage.getItem('sync-fixture')) {
    localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify(fixture));
    sessionStorage.setItem('sync-fixture', '1');
  }
}, { fixture, token: `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}` });
const navigate = async module => {
  const nav = page.locator('[data-hd-navigation="bottom"]');
  if (module === 'customers') {
    await nav.getByRole('button', { name: 'Thêm', exact: true }).click();
    await page.locator('main').getByRole('button', { name: 'Khách hàng', exact: true }).click();
  } else await nav.getByRole('button', { name: 'Đặt hàng', exact: true }).click();
  await page.locator(`main[data-hd-module="${module}"]`).waitFor();
};
const state = () => page.evaluate(() => window.__readPreviewStore());
const waitConfig = async (field, value) => page.waitForFunction(({ field, value }) => window.__readPreviewStore().customers['sync-customer'].priceOverrides['sync-product'][field] === value, { field, value });
const enterDraft = async quantity => {
  await page.getByRole('button', { name: 'LÊN ĐƠN' }).click();
  const form = page.getByRole('dialog');
  await form.getByPlaceholder('Chọn hoặc tìm khách hàng').fill(customer.name);
  await form.getByRole('option', { name: new RegExp(customer.name) }).click();
  await form.getByRole('button', { name: /Gà Sync -/ }).click();
  await form.getByRole('spinbutton', { name: /Số lượng Gà Sync/ }).fill(String(quantity));
  await form.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  return form;
};
let checks = 0;
try {
  await page.goto(url);
  await page.locator('[data-hd-shell="enterprise"]').waitFor();
  await navigate('order_requests');
  const module = page.locator('.premium-order-request-module');
  await module.getByRole('button', { name: '62.000', exact: true }).click();
  let editor = page.getByRole('dialog', { name: 'Sửa đơn giá', exact: true });
  await editor.getByRole('textbox').fill('63000');
  await editor.getByRole('button', { name: 'Lưu', exact: true }).click();
  await editor.waitFor({ state: 'hidden' });
  await waitConfig('unitPrice', 63000);
  assert.equal((await state()).orderRequests[request.id].items[0].unitPrice, 63000);
  checks++;

  const row = module.locator('tbody tr').filter({ has: page.getByRole('button', { name: product.name, exact: true }) });
  await row.locator('button[title="Bấm để sửa ô size"]').click();
  editor = page.getByRole('dialog', { name: 'Sửa size', exact: true });
  await editor.getByRole('textbox').fill('Size đồng bộ');
  await editor.getByRole('button', { name: 'Lưu', exact: true }).click();
  await editor.waitFor({ state: 'hidden' });
  await waitConfig('size', 'Size đồng bộ');
  await row.locator('button[title="Bấm để sửa ô số lượng"]').click();
  editor = page.getByRole('dialog', { name: 'Sửa số lượng', exact: true });
  await editor.getByRole('combobox').selectOption('Kg');
  await editor.getByRole('button', { name: 'Lưu', exact: true }).click();
  await editor.waitFor({ state: 'hidden' });
  await waitConfig('defaultOrderUnit', 'Kg');
  const frozen = (await state()).orderRequests[request.id];
  assert.equal(frozen.items[0].quantity, 120);
  assert.equal(frozen.items[0].billingUnit, 'Kg');
  checks++;

  await navigate('customers');
  await page.locator('[data-customer-card]').filter({ hasText: customer.name }).click();
  if (!await page.getByLabel(`Giá của ${product.name}`, { exact: true }).isVisible()) await page.getByRole('button', { name: /SP khách lấy/ }).click();
  assert.equal(await page.getByLabel(`Giá của ${product.name}`, { exact: true }).inputValue(), '63.000');
  await page.getByLabel(`Giá của ${product.name}`, { exact: true }).fill('64000');
  await page.getByLabel(`Size của ${product.name}`, { exact: true }).fill('Size từ khách');
  await page.getByLabel(`Đơn vị đặt của ${product.name}`, { exact: true }).fill('Con');
  await page.getByRole('button', { name: 'Lưu cấu hình', exact: true }).click();
  await waitConfig('price', 64000);
  await waitConfig('defaultOrderUnit', 'Con');
  assert.deepEqual((await state()).orderRequests[request.id], frozen);
  checks++;

  await navigate('order_requests');
  let form = await enterDraft(121);
  await form.getByRole('button', { name: 'Lưu đơn', exact: true }).click();
  await form.waitFor({ state: 'hidden' });
  let store = await state();
  const created = Object.values(store.orderRequests).find(row => row.id !== request.id && row.customerId === customer.id);
  assert.equal(created.items[0].unitPrice, 64000);
  assert.equal(created.items[0].sizeLabel, 'Size từ khách');
  assert.equal(created.items[0].orderUnit, 'Con');
  assert.equal(created.items[0].billingUnit, 'Kg');
  assert.equal(created.items[0].amount, 0, '120+ Con must wait for actual Kg, never multiply piece count by Kg price');
  checks++;

  form = await enterDraft(99);
  await context.setOffline(true);
  await form.getByRole('button', { name: 'Lưu đơn', exact: true }).click();
  await page.waitForFunction(() => Object.keys(localStorage).some(key => key.includes('pending-firebase-writes') && localStorage.getItem(key).includes('sync-customer')));
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const persisted = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('hd-order-request-draft-v1:')).map(key => [key, JSON.parse(localStorage.getItem(key))])));
  assert.ok(Object.values(persisted).some(value => value.drafts?.some(draft => draft.items?.some(item => Number(item.quantity) === 99))));
  await context.setOffline(false);
  await page.reload();
  await page.locator('[data-hd-shell="enterprise"]').waitFor();
  await navigate('order_requests');
  form = page.getByRole('dialog', { name: 'Lên đơn đặt hàng', exact: true });
  await form.waitFor();
  // Reload restores the entered values; saving again replays the same mutation ID.
  if (await form.getByRole('button', { name: 'Tiếp tục', exact: true }).isVisible()) await form.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await form.getByRole('button', { name: 'Lưu đơn', exact: true }).click();
  await form.waitFor({ state: 'hidden' });
  store = await state();
  assert.equal(Object.values(store.orderRequests).filter(row => row.customerId === customer.id && Number(row.items?.[0]?.quantity) === 99).length, 1);
  assert.deepEqual(store.orderRequests[request.id], frozen);
  checks++;
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${output}/completed.png` });
  console.log(JSON.stringify({ status: 'PASS', checks, scope: 'Browser preview UI + durable queue; real Firestore covered separately' }));
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  await writeFile(`${output}/failure.txt`, `${error.stack}\n\n${await page.locator('body').innerText()}`);
  throw error;
} finally {
  await context.close();
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
