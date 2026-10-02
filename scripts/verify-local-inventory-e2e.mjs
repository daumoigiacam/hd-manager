import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';

const projectId = 'demo-hd-manager-local';
const appId = 'hd-manager-local';
const origin = `http://127.0.0.1:5002/${projectId}/us-central1`;
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8185';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9199';
const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const { buildInventoryBalanceId } = require('../functions/inventoryTransactions');
const { reconcileCorrectedCustomerDebt } = require('../functions/debtCorrectionReconciliation');
const adminApp = admin.initializeApp({ projectId });
const db = adminApp.firestore();
const col = name => db.collection(`artifacts/${appId}/public/data/${name}`);
const output = path.resolve('test-results/local-inventory-e2e');
await mkdir(output, { recursive: true });
const phone = `09${String(Date.now()).slice(-8)}`;
const password = 'EmulatorOnly123!';
const device = { deviceId: `local-e2e-${Date.now()}`, deviceName: 'Emulator test browser', platform: 'web' };
async function api(name, body, token = '') {
  const response = await fetch(`${origin}/${name}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ appId, ...body }), signal: AbortSignal.timeout(60000) });
  const data = await response.json();
  return { status: response.status, ...data };
}
let browser, server, page;
const evidence = { startedAt: new Date().toISOString(), projectId, appId, network: 'real Auth/Functions/Firestore Emulators; no mocked API responses', cases: [] };
try {
  const registration = await api('identityRegisterCompany', { companyName: 'Local inventory test', phone, password, device });
  assert.equal(registration.success, true, JSON.stringify(registration));
  const companyId = registration.company.id;
  const company = await col('companies').doc(companyId).get();
  const employees = await col('employees').where('companyId', '==', companyId).get();
  const employeeId = employees.docs[0].id;
  const customerId = `customer_local_${Date.now()}`;
  const productId = `product_local_${Date.now()}`;
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  await col('customers').doc(customerId).set({ id: customerId, companyId, name: 'Khach Emulator', phone: '0901111222', empId: employeeId, isArchived: false,
    customerProductIds: [productId], createdAt: new Date().toISOString() });
  await col('products').doc(productId).set({ id: productId, companyId, name: 'Hang Emulator', shortName: 'HE', group: 'Hang Emulator', groupName: 'Hang Emulator',
    price: 10000, unit: 'Kg', orderUnit: 'Kg', actualUnit: 'Kg', billingUnit: 'Kg', pricingUnit: 'Kg', isArchived: false });
  await col('companies').doc(companyId).set({ ...company.data(), autoBackupEnabled: false });
  const exchange = await fetch('http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-api-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: registration.customToken, returnSecureToken: true }),
  }).then(r => r.json());
  assert.ok(exchange.idToken, 'Auth Emulator must confirm the real Identity Center session');
  const token = exchange.idToken;
  const opening = await api('inventoryAtomicOperation', { operationType: 'INBOUND', documentId: `import_${customerId}`,
    clientMutationId: `opening_${customerId}`, document: { companyId, productId, date, quantity: 100, quantityUnit: 'Kg' },
    movements: [{ warehouseId: 'default', productId, unit: 'Kg', quantity: 100 }] }, token);
  assert.equal(opening.success, true, JSON.stringify(opening));
  console.log('PASS: real login session and atomic opening inventory');
  let applicationUrl = process.env.HD_E2E_URL;
  if (applicationUrl) {
    assert.equal(new URL(applicationUrl).origin, 'http://127.0.0.1:5214', 'Only the isolated local demo server is accepted');
  } else {
    if (process.env.HD_E2E_REUSE_BUILD !== '1') await build({ mode: 'emulator', build: { outDir: path.join(output, 'app') }, logLevel: 'warn' });
    server = await preview({ mode: 'emulator', build: { outDir: path.join(output, 'app') }, preview: { host: '127.0.0.1', port: 0 } });
    applicationUrl = `http://127.0.0.1:${server.httpServer.address().port}/`;
  }
  evidence.applicationUrl = applicationUrl;
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 430, height: 900 } });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort();
  });
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(applicationUrl);
  await page.screenshot({ path: path.join(output, 'login.png') });
  await writeFile(path.join(output, 'login.txt'), await page.locator('body').innerText());
  const fields = await page.locator('input').evaluateAll(nodes => nodes.map(n => ({ type: n.type, placeholder: n.placeholder, aria: n.getAttribute('aria-label') })));
  console.log('LOGIN FIELDS', fields);
  // The credential values exist only in this disposable demo project.
  await page.locator('input[type="tel"], input[placeholder*="điện thoại"]').first().fill(phone);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: 'Vào Ứng Dụng', exact: true }).click();
  await page.locator('[data-hd-shell="enterprise"]').waitFor({ timeout: 60000 });
  await page.getByPlaceholder('PIN 6 số', { exact: true }).fill('246813');
  await page.getByPlaceholder('Xác nhận PIN 6 số', { exact: true }).fill('246813');
  await page.getByRole('button', { name: 'Hoàn tất và vào trang chủ', exact: true }).click({ timeout: 60000 });
  const nav = page.locator('[data-hd-navigation="bottom"]');
  await nav.waitFor({ timeout: 60000 });
  await writeFile(path.join(output, 'logged-in.txt'), await page.locator('body').innerText());
  evidence.cases.push({ name: 'UI Identity Center login', pass: true });
  await writeFile(path.join(output, 'demo-access.json'), JSON.stringify({ environment: 'Disposable LOCAL demo only',
    applicationUrl, phone, password, pin: '246813', companyId, projectId }, null, 2));
  const balanceId = buildInventoryBalanceId({ companyId, warehouseId: 'default', productId, unit: 'Kg' });
  assert.equal((await col('inventoryBalances').doc(balanceId).get()).data().availableQuantity, 100);
  console.log('PASS: real browser login');
  await nav.getByRole('button', { name: 'Xuất kho', exact: true }).click();
  const main = page.locator('main[data-hd-module="warehouse_dispatch"]');
  const search = main.getByRole('textbox', { name: 'Tìm tên khách hàng', exact: true });
  await search.fill('Khach Emulator');
  await main.locator('[data-search-zone]').first().getByRole('button').filter({ hasText: 'Khach Emulator' }).first().click();
  const product = main.getByRole('textbox', { name: 'Tìm loại hàng', exact: true });
  await product.fill('Hang Emulator');
  await main.locator('[data-search-zone]').nth(1).getByRole('button').filter({ hasText: 'Hang Emulator' }).first().click();
  await main.getByPlaceholder('Số lượng', { exact: true }).fill('12');
  const confirmed = page.waitForResponse(r => r.url().endsWith('/inventoryAtomicOperation') && r.request().method() === 'POST');
  await main.getByRole('button', { name: 'Lưu và thêm mới', exact: true }).click();
  const savedResponse = await confirmed;
  const saved = await savedResponse.json();
  assert.equal(savedResponse.status(), 200, JSON.stringify(saved));
  assert.equal(saved.success, true);
  await search.waitFor();
  await page.waitForFunction(() => document.querySelector('input[aria-label="Tìm tên khách hàng"]')?.value === '');
  const savedCommand = savedResponse.request().postDataJSON();
  const receipt = saved.data;
  for (const [collection, id] of [['warehouseDispatches', receipt.documentId], ['inventoryOperations', receipt.operationId], ['activityLogs', `audit_${receipt.operationId}`]]) {
    assert.equal((await col(collection).doc(id).get()).exists, true, `${collection} must be committed`);
  }
  const ledgers = await col('inventoryLedger').where('operationId', '==', receipt.operationId).get();
  assert.equal(ledgers.size, 1);
  assert.equal((await col('inventoryBalances').doc(balanceId).get()).data().availableQuantity, 88);
  evidence.cases.push({ name: 'UI outbound server confirmation', pass: true, documentId: receipt.documentId, operationId: receipt.operationId, stock: 88, audit: true });
  await page.screenshot({ path: path.join(output, 'outbound-confirmed.png') });
  const retry = await api('inventoryAtomicOperation', savedCommand, token);
  assert.equal(retry.data.duplicate, true);
  assert.equal((await col('inventoryLedger').where('operationId', '==', receipt.operationId).get()).size, 1);
  assert.equal((await col('inventoryBalances').doc(balanceId).get()).data().availableQuantity, 88);
  evidence.cases.push({ name: 'HTTP retry same operation', pass: true, logical_effect_count: 1 });
  await search.fill('Khach Emulator');
  await main.locator('[data-search-zone]').first().getByRole('button').filter({ hasText: 'Khach Emulator' }).first().click();
  await product.fill('Hang Emulator');
  await main.locator('[data-search-zone]').nth(1).getByRole('button').filter({ hasText: 'Hang Emulator' }).first().click();
  await main.getByPlaceholder('Số lượng', { exact: true }).fill('101');
  const rejectedResponse = page.waitForResponse(r => r.url().endsWith('/inventoryAtomicOperation') && r.request().method() === 'POST');
  await main.getByRole('button', { name: 'Lưu và thêm mới', exact: true }).click();
  const rejected = await rejectedResponse;
  assert.equal((await rejected.json()).code, 'inventory_insufficient_stock');
  await main.getByText('Số lượng xuất vượt quá tồn kho khả dụng.', { exact: true }).waitFor();
  assert.equal(await main.getByPlaceholder('Số lượng', { exact: true }).inputValue(), '101');
  assert.equal(await search.inputValue(), 'Khach Emulator');
  assert.equal((await col('warehouseDispatches').doc(rejected.request().postDataJSON().documentId).get()).exists, false);
  assert.equal((await col('inventoryBalances').doc(balanceId).get()).data().availableQuantity, 88);
  evidence.cases.push({ name: 'UI overstock rejected; draft retained', pass: true });
  await page.screenshot({ path: path.join(output, 'outbound-rejected.png') });
  for (const concurrency of [2, 5, 10]) {
    const warehouseId = `concurrency-${concurrency}-${customerId}`;
    const make = (type, key, quantity) => ({ operationType: type, documentId: `document_${key}`, clientMutationId: key,
      document: { companyId, productId, date }, movements: [{ warehouseId, productId, unit: 'Kg', quantity }] });
    assert.equal((await api('inventoryAtomicOperation', make('INBOUND', `opening_${warehouseId}`, 10), token)).success, true);
    const commands = Array.from({ length: concurrency }, (_, i) => make('OUTBOUND', `out_${warehouseId}_${i}`, 6));
    const results = await Promise.all(commands.map(command => api('inventoryAtomicOperation', command, token)));
    assert.equal(results.filter(r => r.success).length, 1);
    assert.ok(results.filter(r => !r.success).every(r => r.code === 'inventory_insufficient_stock'));
    const final = (await col('inventoryBalances').doc(buildInventoryBalanceId({ companyId, warehouseId, productId, unit: 'Kg' })).get()).data();
    assert.equal(final.availableQuantity, 4);
    const accepted = results.findIndex(r => r.success);
    const repeats = await Promise.all(Array.from({ length: concurrency }, () => api('inventoryAtomicOperation', commands[accepted], token)));
    assert.ok(repeats.every(r => r.success && r.data.duplicate));
    assert.equal((await col('inventoryLedger').where('operationId', '==', results[accepted].data.operationId).get()).size, 1);
    evidence.cases.push({ name: 'HTTP concurrent outbound + retry', concurrency, pass: true, accepted: 1, stock: 4, logical_effect_count: 1 });
  }
  assert.equal((await api('inventoryAtomicOperation', savedCommand)).status, 401);
  evidence.cases.push({ name: 'Unauthenticated HTTP denied', pass: true });
  // Order and delivery are explicit fixtures. Outbound above and returns below
  // use the real UI and Functions; do not claim fixture setup is an E2E caller.
  const orderId = `order_return_${customerId}`;
  const paymentId = `payment_${customerId}`;
  const originalOrder = { id: orderId, companyId, customerId, date, amount: 120000,
    salesEmpId: employeeId, empId: employeeId, isArchived: false,
    sourceDispatchIds: [receipt.documentId], items: [{ productId, productName: 'Hang Emulator', description: 'Hang Emulator',
      quantity: 12, weightKg: 12, unit: 'Kg', billingUnit: 'Kg', pricingUnit: 'Kg', unitPrice: 10000, amount: 120000 }] };
  const originalPayment = { id: paymentId, companyId, customerId, date, amount: 120000,
    sourceOrderId: orderId, matchedOrderId: orderId, approvalStatus: 'approved', status: 'confirmed',
    allocations: [{ orderId, amount: 120000 }], isArchived: false };
  await col('orders').doc(orderId).set(originalOrder);
  await col('payments').doc(paymentId).set(originalPayment);
  await col('warehouseDispatches').doc(receipt.documentId).set({ linkedOrderId: orderId }, { merge: true });
  await col('deliveryReports').doc(`delivery_${customerId}`).set({ companyId, dispatchId: receipt.documentId,
    deliveredAt: new Date().toISOString(), isArchived: false });
  await nav.getByRole('button', { name: 'Đơn hàng', exact: true }).click();
  await page.locator('main[data-hd-module="orders"]').getByRole('button').filter({ hasText: 'Khach Emulator' }).first().click();
  async function returnFromUI(quantity, condition, loseFirstConfirmation = false) {
    await page.getByRole('button', { name: 'Trả hàng', exact: true }).click();
    const form = page.locator('form').filter({ hasText: 'Ghi nhận hàng khách trả' });
    await form.getByPlaceholder('0', { exact: true }).nth(1).fill(String(quantity));
    await form.locator('textarea').fill('Khach da tra hang thuc te');
    await form.getByRole('button', { name: condition === 'DAMAGED' ? /Hàng hỏng/ : /Bán lại được/ }).click();
    let firstCommand;
    if (loseFirstConfirmation) {
      await page.route('**/orderReturnTransaction', async route => {
        if (route.request().method() !== 'POST') return route.continue();
        firstCommand = route.request().postDataJSON();
        // Commit through the actual backend, then simulate a lost response.
        const committed = await route.fetch();
        assert.equal(committed.status(), 200);
        await route.abort('failed');
        await page.unroute('**/orderReturnTransaction');
      });
      await form.getByRole('button', { name: 'Xác nhận đã nhận hàng', exact: true }).click();
      await form.getByText('Chưa nhận được xác nhận trả hàng. Giữ nguyên nội dung và thử lại để kiểm tra kết quả.', { exact: true }).waitFor();
      assert.equal(await form.getByPlaceholder('0', { exact: true }).nth(1).inputValue(), String(quantity));
    }
    const responsePromise = page.waitForResponse(r => r.url().endsWith('/orderReturnTransaction') && r.request().method() === 'POST');
    await form.getByRole('button', { name: 'Xác nhận đã nhận hàng', exact: true }).click();
    const response = await responsePromise;
    const result = await response.json();
    assert.equal(response.status(), 200, JSON.stringify(result));
    if (loseFirstConfirmation) {
      assert.deepEqual(response.request().postDataJSON(), firstCommand);
      assert.equal(result.data.duplicate, true);
      evidence.cases.push({ name: 'UI retry after backend commit with lost response', pass: true, logical_effect_count: 1 });
    }
    await form.waitFor({ state: 'hidden' });
    return { result: result.data, command: response.request().postDataJSON() };
  }
  const partial = await returnFromUI(3, 'SELLABLE', true);
  assert.equal(partial.result.returnStatus, 'PARTIAL_RETURN');
  assert.equal((await col('inventoryBalances').doc(balanceId).get()).data().availableQuantity, 91);
  assert.equal((await api('orderReturnTransaction', partial.command, token)).data.duplicate, true);
  const damaged = await returnFromUI(2, 'DAMAGED');
  assert.equal(damaged.result.returnStatus, 'PARTIAL_RETURN');
  assert.equal((await col('inventoryBalances').doc(balanceId).get()).data().availableQuantity, 91);
  const full = await returnFromUI(7, 'SELLABLE');
  assert.equal(full.result.returnStatus, 'FULL_RETURN');
  assert.equal((await col('inventoryBalances').doc(balanceId).get()).data().availableQuantity, 98);
  const tooMuch = await api('orderReturnTransaction', { ...full.command, clientMutationId: `overreturn_${customerId}` }, token);
  assert.equal(tooMuch.code, 'return_quantity_exceeds_delivered');
  assert.equal((await col('orderReturns').where('orderId', '==', orderId).get()).size, 3);
  assert.equal((await col('inventoryDamagedReturns').where('orderId', '==', orderId).get()).size, 1);
  const finalOrder = (await col('orders').doc(orderId).get()).data();
  const finalPayment = (await col('payments').doc(paymentId).get()).data();
  assert.equal(finalOrder.amount, originalOrder.amount);
  assert.deepEqual(finalOrder.items, originalOrder.items);
  assert.deepEqual(finalPayment, originalPayment);
  const debt = reconcileCorrectedCustomerDebt({ companyId, customerId, complete: true, orders: [finalOrder], payments: [finalPayment] });
  assert.equal(debt.status, 'PASS', JSON.stringify(debt));
  assert.equal(debt.balances.currentDebt, 0);
  evidence.cases.push({ name: 'UI partial + damaged + full returns, retry and delivered cap', pass: true,
    setup: 'order, delivery and payment fixtures; real prior UI outbound; real UI return requests',
    returned: 12, sellableReturned: 10, damaged: 2, finalStock: 98, receipts: 3 });
  evidence.cases.push({ name: 'Inherited debt auditor after quantity returns; original charge/payment immutable', pass: true,
    valuation: 'Not enabled: manual company confirmation workflow/read models still required', debt: debt.balances });
  await page.screenshot({ path: path.join(output, 'returns-confirmed.png') });
  console.log('PASS: UI save, retry, invalid stock, concurrency 2/5/10, audit and authentication');
  console.log('PASS: UI quantity returns and original financial evidence unchanged');
} catch (error) {
  evidence.failure = error.stack;
  if (page) {
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    await writeFile(path.join(output, 'failure.txt'), await page.locator('body').innerText()).catch(() => {});
  }
  process.exitCode = 1;
  console.error(error);
} finally {
  await writeFile(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  await browser?.close();
  await server?.httpServer.close();
  await adminApp.delete();
}
