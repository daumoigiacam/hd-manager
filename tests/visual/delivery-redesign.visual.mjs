import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.HD_MANAGER_VISUAL_QA_URL || 'http://127.0.0.1:5176/';
const outputDir = process.env.HD_MANAGER_DELIVERY_VISUAL_OUTPUT || 'test-results/delivery-legacy';
const browserPath = process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const claims = {
  uid: 'emp_admin',
  identityId: 'emp_admin',
  appUserId: 'emp_admin',
  companyId: 'comp_preview',
  companyName: 'Công ty HD Preview',
  accountType: 'employee',
  role: 'super_admin',
  name: 'Quản trị Demo',
  phone: '0909000001',
};
const authToken = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
const now = new Date();
const today = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
const previewStore = {
  customers: {
    delivery_01: {
      id: 'delivery_01', companyId: 'comp_preview', empId: 'emp_admin',
      name: 'Toàn Mua Lồng Vịt', phone: '0911000001', address: 'Bình Dương', isArchived: false,
    },
  },
  warehouseDispatches: {
    dispatch_01: {
      id: 'dispatch_01', companyId: 'comp_preview', date: today,
      createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 15).toISOString(),
      customerId: 'delivery_01', customerNameSnapshot: 'Toàn Mua Lồng Vịt',
      productNameSnapshot: 'Lồng vịt', quantityUnit: 'Con', weightKg: 112, isArchived: false,
    },
  },
  deliveryReports: {},
};

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ executablePath: browserPath, headless: true });

try {
  for (const viewport of [
    { name: 'mobile-320', width: 320, height: 700 },
    { name: 'mobile-390', width: 390, height: 844 },
    { name: 'tablet-768', width: 768, height: 1024 },
    { name: 'desktop-1366', width: 1366, height: 768 },
  ]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript(({ token, store }) => {
      window.__initial_auth_token = token;
      window.localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify(store));
    }, { token: authToken, store: previewStore });
    const response = await page.goto(baseUrl, { waitUntil: 'commit', timeout: 20000 });
    assert.equal(response?.status(), 200, `${viewport.name}: local app must return HTTP 200`);
    await page.waitForSelector('[data-hd-shell="enterprise"]', { timeout: 20000 });

    const navigation = viewport.width < 600
      ? page.locator('[data-hd-navigation="bottom"]')
      : viewport.width < 1024
        ? page.locator('[data-hd-navigation="rail"]')
        : page.locator('[data-hd-navigation="sidebar"]');
    await navigation.getByRole('button', { name: 'Thêm', exact: true }).click();
    await page.getByRole('button', { name: 'Báo cáo giao hàng', exact: true }).click();

    const reconciliationHeading = page.getByRole('heading', { name: 'Đối chiếu giao hàng' });
    const customerPicker = page.getByPlaceholder('Chọn hoặc tìm khách hàng');
    await reconciliationHeading.waitFor({ state: 'visible', timeout: 10000 });
    await customerPicker.waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(await page.getByText('Giao đúng hẹn', { exact: true }).count(), 0, `${viewport.name}: the replacement overview must not be active.`);
    assert.equal(await page.getByRole('button', { name: 'Bắt đầu giao hàng' }).count(), 0, `${viewport.name}: the replacement flow must not be active.`);

    const geometry = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      reconciliationWidth: document.querySelector('#delivery-reconciliation-title')?.getBoundingClientRect().width || 0,
      customerPickerWidth: document.querySelector('input[placeholder="Chọn hoặc tìm khách hàng"]')?.getBoundingClientRect().width || 0,
    }));
    await page.screenshot({ path: `${outputDir}/${viewport.name}-legacy-report.png`, fullPage: false });
    assert.ok(geometry.documentWidth <= geometry.viewportWidth + 1, `${viewport.name}: restored view must not overflow horizontally (${JSON.stringify(geometry)})`);
    assert.ok(geometry.reconciliationWidth > 0 && geometry.customerPickerWidth > 0, `${viewport.name}: previous reconciliation and report form must render (${JSON.stringify(geometry)})`);
    assert.deepEqual(consoleErrors, [], `${viewport.name}: browser console must be clean`);
    assert.deepEqual(pageErrors, [], `${viewport.name}: browser must have no uncaught errors`);
    await context.close();
  }
} finally {
  await browser.close();
}

console.log('Delivery legacy UI visual checks passed at 320, 390, 768, and 1366px.');
