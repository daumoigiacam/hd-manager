import { installPreviewReader } from '../helpers/preview-browser-storage.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';

const out = 'test-results/customer-debt-repayment';
await mkdir(out, { recursive: true });
Object.assign(process.env, { VITE_DATA_MODE: 'preview', VITE_ALLOW_PREVIEW_BUILD: 'true', VITE_HD_BUILD_ID: 'debt-repayment-test' });
await build({ build: { outDir: `${out}/app` }, logLevel: 'error' });
const server = await preview({ build: { outDir: `${out}/app` }, preview: { host: '127.0.0.1', port: 0 } });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  for (const width of [390, 1366]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') || route.request().url().startsWith('data:') ? route.continue() : route.abort());
    await installPreviewReader(page);
  await page.addInitScript(() => {
      window.__initial_auth_token = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify({ uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin', companyId: 'comp_preview', accountType: 'employee', role: 'super_admin', name: 'Demo' }))}`;
      if (!sessionStorage.getItem('repayment-seed')) {
        localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify({
          customers: {
            payable_test: { id: 'payable_test', companyId: 'comp_preview', name: 'Khách Test Trả Nợ', openingPayableAmount: 1000000, empId: 'emp_sales_01' },
            receivable_test: { id: 'receivable_test', companyId: 'comp_preview', name: 'Khách Test Phải Thu', openingDebtAmount: 200000, empId: 'emp_sales_01' },
          }, orders: {}, payments: {}, expenses: {}, warehouseImports: {},
        }));
        sessionStorage.setItem('repayment-seed', '1');
      }
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
    await page.locator('[data-hd-shell="enterprise"]').waitFor();
    const openDebt = async () => {
      await page.locator('nav').getByRole('button', { name: 'Thêm', exact: true }).click();
      await page.locator('main').getByRole('button', { name: 'Sổ nợ', exact: true }).click();
    };
    await openDebt();
    await page.getByRole('button', { name: /khách Nợ khách/ }).click();
    await page.getByText('Khách Test Trả Nợ', { exact: true }).click();
    await page.getByRole('button', { name: 'Ghi nhận khoản chi trả nợ', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Số tiền (VNĐ)').fill('300000');
    await page.screenshot({ path: `${out}/${width}-form.png` });
    await dialog.getByRole('button', { name: 'Xác nhận chi trả nợ', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => Object.values(window.__readPreviewStore().expenses || {}).some(item => item.sourceType === 'customer_debt_repayment' && item.amount === 300000));
    await page.getByText('700.000 đ', { exact: true }).waitFor();
    const receipts = await page.evaluate(() => Object.values(window.__readPreviewStore().payments || {}));
    assert.equal(receipts.filter(item => item.customerId === 'payable_test').length, 0);
    await page.screenshot({ path: `${out}/${width}-saved.png` });
    await page.reload();
    await page.locator('[data-hd-shell="enterprise"]').waitFor();
    await openDebt();
    await page.getByRole('button', { name: /khách Nợ khách/ }).click();
    await page.getByText('Khách Test Trả Nợ', { exact: true }).click();
    await page.getByText('700.000 đ', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(`${width}: expense persisted, payable 1,000,000 -> 700,000, zero receipts, reload PASS`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
