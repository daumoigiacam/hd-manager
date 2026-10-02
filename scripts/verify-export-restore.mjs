import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

const projectId = 'demo-hd-manager-local';
const appId = 'hd-manager-local';
const url = 'http://127.0.0.1:5214/?perfMonitor=1';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8185';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9199';
const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const adminApp = admin.initializeApp({ projectId });
const db = adminApp.firestore();
const col = name => db.collection(`artifacts/${appId}/public/data/${name}`);
const output = 'test-results/export-restore';
await mkdir(output, { recursive: true });
const rules = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8185,
  rules: await readFile('firestore.rules', 'utf8') } });
const phone = `09${String(Date.now()).slice(-8)}`;
const password = 'EmulatorOnly123!';
const result = { baseline: 'd4262219', projectId, productionTouched: false, checks: [], requests: [], errors: [] };
let browser, page;
try {
  const registration = await fetch(`http://127.0.0.1:5002/${projectId}/us-central1/identityRegisterCompany`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId, companyName: 'Export restore local test', phone, password,
      device: { deviceId: `restore-${Date.now()}`, deviceName: 'Local restore', platform: 'web' } }),
  }).then(r => r.json());
  assert.equal(registration.success, true, JSON.stringify(registration));
  const companyId = registration.company.id;
  await writeFile(`${output}/demo-access.json`, JSON.stringify({ environment: 'LOCAL EMULATOR ONLY',
    url, phone, password, pin: '246813', companyId, projectId }, null, 2));
  const employees = await col('employees').where('companyId', '==', companyId).get();
  const empId = employees.docs[0].id;
  const customerId = `restore_customer_${Date.now()}`;
  const productId = `restore_product_${Date.now()}`;
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  await col('customers').doc(customerId).set({ id: customerId, companyId, empId, name: 'Khach Restore',
    phone: '0901111222', customerProductIds: [productId], isArchived: false });
  await col('products').doc(productId).set({ id: productId, companyId, name: 'Hang Restore', group: 'Hang Restore',
    groupName: 'Hang Restore', shortName: 'HR', price: 10000, unit: 'Kg', orderUnit: 'Kg', actualUnit: 'Kg',
    billingUnit: 'Kg', pricingUnit: 'Kg', isArchived: false });
  await col('warehouseImports').doc(`opening_${productId}`).set({ id: `opening_${productId}`, companyId, productId,
    groupName: 'Hang Restore', date, quantity: 100, quantityUnit: 'Kg', weightKg: 100, isArchived: false,
    createdAt: new Date().toISOString() });
  await col('companies').doc(companyId).set({ autoBackupEnabled: false }, { merge: true });
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 430, height: 900 } });
  await context.route('**/*', route => {
    const requestUrl = new URL(route.request().url());
    return ['localhost', '127.0.0.1'].includes(requestUrl.hostname) || ['blob:', 'data:'].includes(requestUrl.protocol)
      ? route.continue() : route.abort();
  });
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', e => result.errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') result.errors.push(message.text()); });
  page.on('response', r => result.requests.push({ url: r.url().split('?')[0], status: r.status() }));
  await page.goto(url);
  await page.locator('input[type="tel"], input[placeholder*="điện thoại"]').first().fill(phone);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: 'Vào Ứng Dụng', exact: true }).click();
  await page.locator('[data-hd-shell="enterprise"]').waitFor({ timeout: 60000 });
  await page.getByPlaceholder('PIN 6 số', { exact: true }).fill('246813');
  await page.getByPlaceholder('Xác nhận PIN 6 số', { exact: true }).fill('246813');
  await page.getByRole('button', { name: 'Hoàn tất và vào trang chủ', exact: true }).click();
  const nav = page.locator('[data-hd-navigation="bottom"]');
  await nav.getByRole('button', { name: 'Xuất kho', exact: true }).click();
  const main = page.locator('main[data-hd-module="warehouse_dispatch"]');
  await main.waitFor();
  result.beforeSaveTelemetry = await page.evaluate(() => ({
    listeners: window.hdPerformanceMonitor?.subscriptions().length,
    events: window.hdPerformanceMonitor?.events(),
  }));
  result.checks.push('1 open warehouse');
  const customer = main.getByRole('textbox', { name: 'Tìm tên khách hàng', exact: true });
  await customer.fill('Khach Restore');
  await main.locator('[data-search-zone]').first().getByRole('button').filter({ hasText: 'Khach Restore' }).first().click();
  result.checks.push('2 select customer');
  await main.getByRole('textbox', { name: 'Tìm loại hàng', exact: true }).fill('Hang Restore');
  await main.locator('[data-search-zone]').nth(1).getByRole('button').filter({ hasText: 'Hang Restore' }).first().click();
  result.checks.push('3 select product');
  await main.getByPlaceholder('Số lượng', { exact: true }).fill('12');
  result.checks.push('4 enter quantity');
  const started = performance.now();
  await main.getByRole('button', { name: 'Lưu và thêm mới', exact: true }).click();
  let saved;
  for (let i = 0; i < 100; i++) {
    const docs = await col('warehouseDispatches').where('companyId', '==', companyId).get();
    saved = docs.docs.find(d => d.data().productId === productId);
    if (saved) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(saved, 'Real Firestore must confirm the document, not just local optimistic state');
  result.serverConfirmationMs = performance.now() - started;
  assert.equal(Number(saved.data().quantity), 12);
  result.checks.push('5 save confirmed by Firestore');
  result.afterSaveTelemetry = await page.evaluate(() => ({
    listeners: window.hdPerformanceMonitor?.subscriptions().length,
    events: window.hdPerformanceMonitor?.events(),
  }));
  await page.reload();
  await nav.getByRole('button', { name: 'Xuất kho', exact: true }).click();
  await main.getByText('Khach Restore', { exact: true }).first().waitFor();
  result.checks.push('6 close/reopen via full reload', '7 saved dispatch visible');
  const opening = await col('warehouseImports').where('companyId', '==', companyId).get();
  const dispatches = await col('warehouseDispatches').where('companyId', '==', companyId).get();
  const stock = opening.docs.reduce((sum, d) => sum + Number(d.data().quantity || 0), 0)
    - dispatches.docs.reduce((sum, d) => sum + Number(d.data().quantity || 0), 0);
  assert.equal(stock, 88);
  assert.equal((await col('inventoryOperations').where('companyId', '==', companyId).get()).size, 0);
  result.checks.push('8 legacy receipt-based stock 100 - 12 = 88; no new inventory operation');
  assert.equal(result.requests.filter(r => r.status === 404).length, 0);
  assert.equal(result.requests.filter(r => /inventoryAtomicOperation|orderReturnTransaction/.test(r.url)).length, 0);
  result.checks.push('9 no HTTP 404 or new transaction endpoint');
  assert.deepEqual(result.errors, []);
  result.checks.push('10 no browser page errors');
  await page.screenshot({ path: `${output}/confirmed.png`, fullPage: true });
  result.status = 'PASS';
  console.log(JSON.stringify({ status: result.status, checks: result.checks, serverConfirmationMs: result.serverConfirmationMs }, null, 2));
} catch (error) {
  result.status = 'NOT PASS'; result.failure = error.stack;
  if (page) { await page.screenshot({ path: `${output}/failure.png` }); await writeFile(`${output}/failure.txt`, await page.locator('body').innerText()); }
  throw error;
} finally {
  await writeFile(`${output}/smoke.json`, JSON.stringify(result, null, 2));
  await browser?.close(); await rules.cleanup(); await adminApp.delete();
}
