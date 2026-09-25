import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.HD_MANAGER_HEADER_BACK_URL || 'http://127.0.0.1:5189/';
const browserPath = process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const androidCdpUrl = process.env.HD_MANAGER_ANDROID_CDP_URL || '';
const claims = {
  uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin',
  companyId: 'comp_preview', companyName: 'Công ty HD Preview',
  accountType: 'employee', role: 'super_admin', name: 'Quản trị Demo', phone: '0909000001',
};
const token = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
const today = new Date().toISOString().slice(0, 10);
const previewStore = {
  assets: {
    qa_asset_back: {
      id: 'qa_asset_back', companyId: 'comp_preview', name: 'Xe tải thử nghiệm',
      type: 'truck', status: 'active', plateNumber: '51C-12345',
    },
  },
  warehouseDispatches: {
    qa_delivery_back: {
      id: 'qa_delivery_back', companyId: 'comp_preview', date: today,
      customerId: 'c_preview_01', customerNameSnapshot: 'Cửa hàng Lan Anh',
      productId: 'prod_preview_01', productNameSnapshot: 'Nước giặt HD',
      assignedDriverId: 'emp_driver_01', quantity: 2, quantityUnit: 'Can',
      isArchived: false,
    },
  },
};

const browser = androidCdpUrl
  ? await chromium.connectOverCDP(androidCdpUrl)
  : await chromium.launch({ executablePath: browserPath, headless: true });
try {
  const context = androidCdpUrl
    ? browser.contexts()[0]
    : await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = androidCdpUrl
    ? context.pages().find((candidate) => candidate.url().startsWith(baseUrl)) || await context.newPage()
    : await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(({ authToken, store }) => {
    window.__initial_auth_token = authToken;
    window.localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify(store));
  }, { authToken: token, store: previewStore });
  const response = await page.goto(baseUrl, { waitUntil: 'commit', timeout: 20000 });
  assert.equal(response?.status(), 200);
  await page.locator('[data-hd-shell="enterprise"]').waitFor({ timeout: 60000 }).catch(async (error) => {
    console.error('Page:', (await page.locator('body').innerText()).slice(0, 1000));
    console.error('Errors:', errors);
    throw error;
  });
  const header = page.locator('.hd-app-header');
  const bottomNav = page.locator('[data-hd-navigation="bottom"]');
  await bottomNav.waitFor({ state: 'visible', timeout: 15000 }).catch(async (error) => {
    console.error('Bottom navigation missing:', (await page.locator('body').innerText()).slice(0, 500));
    console.error('URL:', page.url(), 'Errors:', errors);
    throw error;
  });
  const headerTitle = () => header.locator('h1').innerText();
  const back = () => header.getByRole('button', { name: 'Quay lại', exact: true });
  const waitForTitle = (title) => page.waitForFunction((expected) => document.querySelector('.hd-app-header h1')?.textContent?.trim() === expected, title, { timeout: 10000 });
  const openModule = async (name, title) => {
    console.log('Opening module:', name);
    await page.getByRole('button', { name, exact: true }).first().click();
    await waitForTitle(title).catch(async (error) => {
      console.error('Module title mismatch:', name, 'expected:', title, 'actual:', await header.locator('h1').textContent({ timeout: 1000 }).catch(() => '<missing>'));
      console.error('Page:', (await page.locator('body').innerText()).slice(0, 250));
      throw error;
    });
  };

  await bottomNav.getByRole('button', { name: 'Thêm', exact: true }).click();
  await openModule('Khách hàng', 'Khách hàng');
  const customerCard = page.locator('[data-customer-card="true"]').first();
  await customerCard.waitFor({ state: 'visible' });
  await customerCard.click();
  await page.locator('[data-customer-detail-products="true"]').waitFor({ state: 'visible' });
  await back().click();
  await customerCard.waitFor({ state: 'visible' });
  assert.equal(await headerTitle(), 'Khách hàng', 'detail back should stay inside Customers');
  await header.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
  await page.locator('#hd-customer-filter-sheet').waitFor({ state: 'visible' });
  await page.goBack();
  await page.locator('#hd-customer-filter-sheet').waitFor({ state: 'hidden' });
  assert.equal(await headerTitle(), 'Khách hàng', 'filter back should stay inside Customers');
  await back().click();
  await waitForTitle('Thêm');
  assert.equal(await headerTitle(), 'Thêm', 'header back should return to More, not Home');

  await openModule('Quản lý tài sản', 'Tài sản');
  await page.locator('[data-asset-list-screen="true"]').waitFor({ state: 'visible' });
  await page.locator('[data-asset-card="true"]').first().click();
  await page.locator('[data-asset-detail-screen="true"]').waitFor({ state: 'visible' });
  await back().click();
  await page.locator('[data-asset-list-screen="true"]').waitFor({ state: 'visible' });
  assert.equal(await headerTitle(), 'Tài sản', 'asset detail back should return to asset list');
  await back().click();
  await waitForTitle('Thêm');
  assert.equal(await headerTitle(), 'Thêm');

  await openModule('Kho sản phẩm', 'Kho SP');
  await page.getByRole('button', { name: 'Thêm sản phẩm', exact: true }).first().click();
  await page.locator('.hd-product-editor-layer').waitFor({ state: 'visible' });
  await page.goBack();
  await page.locator('.hd-product-editor-layer').waitFor({ state: 'hidden' });
  assert.equal(await headerTitle(), 'Kho SP', 'browser back should close product editor without leaving Products');
  await back().click();
  await waitForTitle('Thêm');

  await openModule('Báo cáo giao hàng', 'Giao hàng');
  await page.getByRole('button', { name: /Bắt đầu giao hàng/ }).click();
  await page.getByPlaceholder('Tìm khách hàng...').waitFor({ state: 'visible' });
  await back().click();
  await page.getByRole('button', { name: /Bắt đầu giao hàng/ }).waitFor({ state: 'visible' });
  assert.equal(await headerTitle(), 'Giao hàng', 'delivery list back should return to overview');
  await page.goBack();
  await waitForTitle('Thêm');

  for (const [moduleName, title] of [
    ['Đơn hàng', 'Đơn hàng'],
    ['Sổ nợ', 'Sổ nợ'],
    ['Xuất kho', 'Phiếu xuất kho'],
    ['Nhập Xuất Tồn', 'Nhập Xuất Tồn'],
    ['Lên đơn đặt hàng', 'Đơn đặt'],
    ['Bản đồ', 'Bản đồ'],
    ['Ngân hàng', 'Ngân Hàng'],
    ['Giá cả', 'Giá cả'],
    ['Báo cáo', 'Báo cáo'],
    ['Chấm công', 'Chấm công'],
    ['Bảng lương', 'Bảng lương'],
    ['Đánh giá', 'Đánh giá'],
    ['Nhân sự', 'Nhân sự'],
    ['Cài đặt', 'Cài đặt'],
    ['Vai trò', 'Vai trò'],
    ['Gói cước', 'Gói cước'],
  ]) {
    await openModule(moduleName, title);
    await back().click();
    await waitForTitle('Thêm');
  }

  await page.getByRole('button', { name: 'Điều hành', exact: true }).first().click();
  await page.getByText('Tổng quan tài chính', { exact: true }).first().waitFor({ state: 'visible' });
  await page.goBack();
  await waitForTitle('Thêm');

  await page.getByRole('button', { name: 'Báo giá hàng loạt', exact: true }).first().click();
  await page.goBack();
  await waitForTitle('Thêm');

  await page.getByRole('button', { name: /Quản trị Demo/ }).first().click();
  await waitForTitle('Cá nhân');
  await back().click();
  await waitForTitle('Thêm');

  await page.getByRole('button', { name: 'Tin nhắn', exact: true }).first().click();
  await page.getByText('Ưu tiên', { exact: true }).first().waitFor({ state: 'visible' });
  await page.goBack();
  await waitForTitle('Thêm');

  await openModule('Thu chi', 'Thu chi');
  const cashflowQuickAction = page.getByRole('button', { name: 'Mở thao tác thu chi' });
  await cashflowQuickAction.click();
  assert.equal(await cashflowQuickAction.getAttribute('aria-expanded'), 'true');
  await back().click();
  assert.equal(await cashflowQuickAction.getAttribute('aria-expanded'), 'false', 'back should close cashflow action menu');
  assert.equal(await headerTitle(), 'Thu chi', 'closing a menu should not leave Finance');
  await back().click();
  await waitForTitle('Thêm');

  if (androidCdpUrl) {
    await openModule('Kho sản phẩm', 'Kho SP');
    execFileSync('adb', ['shell', 'input', 'keyevent', '4']);
    await waitForTitle('Thêm');
    assert.equal(await headerTitle(), 'Thêm', 'Android Back should return to previous app tab');
  }

  assert.equal(await page.locator('[data-hd-shell="enterprise"]').count(), 1, 'back must not exit the app');
  assert.deepEqual(errors, [], 'navigation should not throw');
  await mkdir('test-results/app-header-back', { recursive: true });
  await page.screenshot({ path: `test-results/app-header-back/${androidCdpUrl ? 'android-emulator' : 'mobile-browser'}.png` });
  if (!androidCdpUrl) await context.close();
} finally {
  await browser.close();
}

console.log('PASS app header back navigation');
