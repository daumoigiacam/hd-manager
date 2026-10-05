import assert from 'node:assert/strict';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';
import { installPreviewReader } from '../helpers/preview-browser-storage.mjs';

const timeoutMs = 180000;
const timeout = setTimeout(() => {
  console.error(`Warehouse dispatch create preview timed out after ${timeoutMs}ms`);
  process.exit(1);
}, timeoutMs);
Object.assign(process.env, { VITE_DATA_MODE: 'preview', VITE_ALLOW_PREVIEW_BUILD: 'true' });
const outDir = 'test-results/warehouse-dispatch-create-preview';
const browserPath = process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const claims = {
  uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin',
  companyId: 'comp_preview', companyName: 'Công ty HD Preview',
  accountType: 'employee', role: 'super_admin', name: 'Quản trị Demo', phone: '0909000001',
};
const authToken = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;

await build({ build: { outDir }, logLevel: 'error' });
const server = await preview({
  build: { outDir },
  preview: { host: '127.0.0.1', port: 0 },
});
const baseUrl = `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await chromium.launch({ executablePath: browserPath, headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.route('**/*', route => (
    new URL(route.request().url()).origin === new URL(baseUrl).origin || route.request().url().startsWith('data:')
      ? route.continue()
      : route.abort()
  ));
  const diagnostics = { pageErrors: [], consoleErrors: [], blockedRequests: [] };
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
  });
  page.on('requestfailed', request => diagnostics.blockedRequests.push(request.url()));
  await installPreviewReader(page);
  await page.addInitScript(token => {
    window.__initial_auth_token = token;
    localStorage.removeItem('hd-manager-local-db-v2-clean-preview');
  }, authToken);

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.locator('[data-hd-shell="enterprise"]').waitFor({ timeout: 30000 });
  const navigation = page.locator('[data-hd-navigation="bottom"]');
  const warehouseTab = navigation.getByRole('button', { name: 'Xuất kho', exact: true });
  const homeTab = navigation.getByRole('button', { name: 'Trang chủ', exact: true });
  const screenOpenSamplesMs = [];
  for (let index = 0; index < 5; index += 1) {
    const transitionStartedAt = Date.now();
    await warehouseTab.click();
    await page.locator('form').filter({ has: page.getByRole('button', { name: 'Lưu lại', exact: true }) }).waitFor({ state: 'visible' });
    screenOpenSamplesMs.push(Date.now() - transitionStartedAt);
    if (index < 4) {
      await homeTab.click();
      await page.locator('form').filter({ has: page.getByRole('button', { name: 'Lưu lại', exact: true }) }).waitFor({ state: 'detached' });
    }
  }
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Lưu lại', exact: true }) });
  await form.waitFor();

  const customerInput = form.getByRole('combobox', { name: 'Tìm tên khách hàng' });
  const selectionStartedAt = performance.now();
  await customerInput.fill('Cửa hàng Lan Anh');
  const customerOption = form.locator('[data-search-zone="true"]').first().getByRole('option').filter({ hasText: 'Cửa hàng Lan Anh' });
  try {
    await customerOption.waitFor({ timeout: 5000 });
  } catch (error) {
    const pickerText = await form.locator('[data-search-zone="true"]').first().innerText().catch(() => '');
    throw new Error(`Customer option absent after typing; picker text: ${pickerText.slice(0, 500)}`, { cause: error });
  }
  await customerOption.click();
  await customerOption.waitFor({ state: 'hidden' });
  const selectedCustomerLabel = await customerInput.inputValue();
  assert.match(selectedCustomerLabel, /Lan Anh/i, `selected customer label was: ${selectedCustomerLabel}`);
  const customerSelectionMs = performance.now() - selectionStartedAt;

  const productInput = form.getByRole('combobox', { name: 'Tìm loại hàng' });
  const productSelectionStartedAt = performance.now();
  await productInput.fill('Nước giặt HD');
  await form.getByRole('option', { name: /Nước giặt HD/ }).click();
  await page.waitForFunction(() => document.querySelector('input[aria-label="Tìm loại hàng"]')?.value === 'Nước giặt HD');
  const productSelectionMs = performance.now() - productSelectionStartedAt;
  await form.getByPlaceholder('Số lượng').fill('4');

  const submit = form.getByRole('button', { name: 'Lưu lại', exact: true });
  const saveStartedAt = Date.now();
  await submit.dblclick({ delay: 5 });
  await page.waitForFunction(() => {
    const rows = Object.values(window.__readPreviewStore().warehouseDispatches || {});
    return rows.some(row => row.clientMutationId && row.customerId === 'c_preview_01' && row.productId === 'prod_preview_01');
  }, null, { timeout: 15000 });
  const saveElapsedMs = Date.now() - saveStartedAt;

  const savedRows = await page.evaluate(() => Object.values(window.__readPreviewStore().warehouseDispatches || {})
    .filter(row => row.customerId === 'c_preview_01' && row.productId === 'prod_preview_01'));
  assert.equal(savedRows.length, 1, 'rapid double submit must keep exactly one preview dispatch');
  const [saved] = savedRows;
  assert.equal(saved.companyId, 'comp_preview');
  assert.equal(saved.quantity, 4);
  assert.equal(saved.quantityUnit, 'Can');
  assert.equal(saved.isOutsideOrderRequest, true);
  assert.ok(saved.clientMutationId, 'saved dispatch must carry its stable mutation identity');

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.locator('[data-hd-shell="enterprise"]').waitFor({ timeout: 30000 });
  const restoredRows = await page.evaluate(() => Object.values(window.__readPreviewStore().warehouseDispatches || {})
    .filter(row => row.clientMutationId));
  assert.equal(restoredRows.length, 1, 'the locally confirmed preview write must survive reload');
  assert.equal(restoredRows[0].id, saved.id);
  assert.equal(restoredRows[0].quantity, 4);
  assert.deepEqual(diagnostics.pageErrors, []);
  assert.deepEqual(diagnostics.consoleErrors, []);
  assert.deepEqual(diagnostics.blockedRequests, [], 'preview E2E must not make external requests');

  console.log(JSON.stringify({
    status: 'PASS_PREVIEW_ONLY',
    environment: 'isolated Vite preview + local preview persistence; external requests blocked',
    measurementsMs: {
      dispatchScreenOpen: {
        samples: screenOpenSamplesMs,
        p50: [...screenOpenSamplesMs].sort((a, b) => a - b)[Math.floor(screenOpenSamplesMs.length * 0.5)],
        p95: [...screenOpenSamplesMs].sort((a, b) => a - b)[Math.ceil(screenOpenSamplesMs.length * 0.95) - 1],
      },
      customerSelection: Math.round(customerSelectionMs),
      productSelection: Math.round(productSelectionMs),
      saveAndLocalAck: saveElapsedMs,
    },
    createsAfterRapidDoubleSubmit: savedRows.length,
    recordsAfterReload: restoredRows.length,
    mutationId: saved.clientMutationId,
    note: 'Save duration is local preview persistence, not Firebase/network/server ACK.',
  }, null, 2));
  await context.close();
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
  clearTimeout(timeout);
}
