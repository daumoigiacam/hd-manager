import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const baseUrl = process.env.HD_MANAGER_ORDER_REQUEST_URL || 'http://127.0.0.1:5211/';
const browserPath = process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const claims = {
  uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin',
  companyId: 'comp_preview', companyName: 'Công ty HD Preview',
  accountType: 'employee', role: 'super_admin', name: 'Quản trị Demo', phone: '0909000001',
};
const token = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const store = {
  orderRequests: {
    or_save_speed: {
      id: 'or_save_speed', companyId: 'comp_preview', customerId: 'c_preview_01',
      salesEmpId: 'emp_sales_01', empId: 'emp_sales_01', date: today,
      createdAt: `${today}T08:00:00+07:00`, isArchived: false,
      totalQuantity: 2, totalAmount: 570000,
      items: [{
        productId: 'prod_preview_01', description: 'Nước giặt HD', quantity: 2,
        quantityUnit: 'Can', orderUnit: 'Can', actualUnit: 'Can',
        billingUnit: 'Can', pricingUnit: 'Can', billingQuantity: 2,
        unitPrice: 285000, amount: 570000, lineTotal: 570000,
      }],
    },
  },
};

const browser = await chromium.launch({ executablePath: browserPath, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ initialToken, initialStore }) => {
    window.__initial_auth_token = initialToken;
    localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify(initialStore));
  }, { initialToken: token, initialStore: store });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-hd-shell="enterprise"]').waitFor({ timeout: 30000 });
  await page.locator('[data-hd-navigation="bottom"]').getByRole('button', { name: 'Đặt hàng', exact: true }).click();
  const requestModule = page.locator('.premium-order-request-module');
  await requestModule.waitFor();
  await requestModule.getByRole('button', { name: '285.000' }).first().click();
  const editor = page.getByRole('dialog', { name: 'Sửa đơn giá' });
  await editor.waitFor();
  await editor.getByRole('textbox').first().fill('290000');

  const startedAt = Date.now();
  await editor.getByRole('button', { name: 'Lưu', exact: true }).click();
  await editor.waitFor({ state: 'hidden', timeout: 5000 });
  const elapsedMs = Date.now() - startedAt;
  assert.ok(elapsedMs < 1500, `Confirmed edit took ${elapsedMs}ms in preview mode`);
  await requestModule.getByRole('button', { name: '290.000' }).first().waitFor();
  assert.deepEqual(errors, []);
  console.log(`PASS order request inline save: ${elapsedMs}ms in preview mode`);
} finally {
  await browser.close();
}
