import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const baseUrl = process.env.HD_MANAGER_ORDER_REQUEST_URL || 'http://127.0.0.1:5211/';
const browserPath = process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const androidEndpoint = process.env.HD_MANAGER_ANDROID_CDP;
assert.ok(['127.0.0.1', '10.0.2.2'].includes(new URL(baseUrl).hostname), 'Use an isolated local preview');
const claims = {
  uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin',
  companyId: 'comp_preview', companyName: 'Công ty HD Preview',
  accountType: 'employee', role: 'super_admin', name: 'Quản trị Demo', phone: '0909000001',
};
const token = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const store = {
  customers: {
    c_preview_01: {
      id: 'c_preview_01', companyId: 'comp_preview', name: 'Cửa hàng Lan Anh',
      empId: 'emp_sales_01', customerProductIds: ['prod_preview_01'],
      priceOverrides: { prod_preview_01: { price: 285000, unit: 'Can' } },
    },
  },
  products: {
    prod_preview_01: {
      id: 'prod_preview_01', companyId: 'comp_preview', name: 'Nước giặt HD',
      unit: 'Can', price: 285000, isArchived: false,
    },
  },
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

const browser = androidEndpoint ? await chromium.connectOverCDP(androidEndpoint) : await chromium.launch({ executablePath: browserPath, headless: true });
try {
  const page = androidEndpoint ? await browser.contexts()[0].newPage() : await browser.newPage({ viewport: { width: 390, height: 844 } });
  assert.ok(page, 'The debug preview WebView must be open');
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseUrl).origin ? route.continue() : route.abort());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ initialToken, initialStore }) => {
    window.__initial_auth_token = initialToken;
    if (!sessionStorage.getItem('hd-save-fixture-seeded')) {
      localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify(initialStore));
      sessionStorage.setItem('hd-save-fixture-seeded', '1');
    }
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
  assert.ok(elapsedMs < 1000, `Confirmed edit took ${elapsedMs}ms in preview mode`);
  await requestModule.getByRole('button', { name: '290.000' }).first().waitFor();

  await page.locator('[data-hd-navigation="bottom"]').getByRole('button', { name: 'Đặt hàng', exact: true }).click();
  await page.getByRole('button', { name: 'LÊN ĐƠN' }).click();
  const createDialog = page.getByRole('dialog');
  await createDialog.getByPlaceholder('Chọn hoặc tìm khách hàng').fill('Cửa hàng Lan Anh');
  await createDialog.getByRole('option', { name: /Cửa hàng Lan Anh/ }).click();
  await createDialog.getByRole('button', { name: 'Tiếp tục' }).click();
  await createDialog.getByRole('button', { name: '-- Chọn sp --' }).click();
  await createDialog.getByRole('button', { name: /Nước giặt HD/ }).last().click();
  await createDialog.getByPlaceholder('Số lượng').fill('3');

  const createStartedAt = Date.now();
  await createDialog.getByRole('button', { name: 'Lưu đơn', exact: true }).click();
  await createDialog.waitFor({ state: 'hidden', timeout: 5000 });
  const createElapsedMs = Date.now() - createStartedAt;
  assert.ok(createElapsedMs < 1000, `Order request create form took ${createElapsedMs}ms to close in preview mode`);
  await page.waitForFunction(() => {
    const rows = JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview') || '{}').orderRequests || {};
    return rows.or_save_speed?.items?.[0]?.unitPrice === 290000
      && Object.values(rows).some(row => row.id !== 'or_save_speed' && row.customerId === 'c_preview_01' && row.items?.[0]?.quantity === 3);
  });
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview')).orderRequests);
  const created = Object.values(persisted).filter(row => row.id !== 'or_save_speed' && row.customerId === 'c_preview_01' && row.items?.[0]?.quantity === 3);
  assert.equal(created.length, 1, 'Create must persist exactly one new request');
  assert.equal(persisted.or_save_speed.items[0].unitPrice, 290000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-hd-shell="enterprise"]').waitFor();
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview')).orderRequests);
  assert.deepEqual(restored.or_save_speed.items, persisted.or_save_speed.items, 'Edited price must survive reload');
  assert.deepEqual(restored[created[0].id].items, created[0].items, 'Created items must survive reload');
  assert.deepEqual(errors, []);
  console.log(`PASS order request inline save: ${elapsedMs}ms; create form close: ${createElapsedMs}ms in preview mode`);
} finally {
  await browser.close();
}
