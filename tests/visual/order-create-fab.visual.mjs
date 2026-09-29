import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const baseUrl = process.env.HD_MANAGER_ORDER_FAB_URL || 'http://127.0.0.1:5211/';
const browserPath = process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const claims = {
  uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin',
  companyId: 'comp_preview', companyName: 'Công ty HD Preview',
  accountType: 'employee', role: 'super_admin', name: 'Quản trị Demo', phone: '0909000001',
};
const authToken = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;

const browser = await chromium.launch({ executablePath: browserPath, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(token => { window.__initial_auth_token = token; }, authToken);
  const response = await page.goto(baseUrl, { waitUntil: 'commit', timeout: 20000 });
  assert.equal(response?.status(), 200);
  const bottomNavigation = page.locator('[data-hd-navigation="bottom"]');
  await bottomNavigation.waitFor({ timeout: 20000 });
  await bottomNavigation.getByRole('button', { name: 'Đơn hàng', exact: true }).click();

  const addButton = page.getByRole('button', { name: 'Tạo đơn bán hàng' });
  await addButton.waitFor({ state: 'visible', timeout: 10000 });
  const layout = await page.evaluate(() => {
    const button = document.querySelector('button[aria-label="Tạo đơn bán hàng"]');
    const footer = document.querySelector('[data-hd-navigation="bottom"]');
    const rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      buttonBottom: rect.bottom,
      footerTop: footer.getBoundingClientRect().top,
      viewportHeight: window.innerHeight,
      display: getComputedStyle(button.parentElement).display,
      receivesPointer: hit?.closest('button[aria-label="Tạo đơn bán hàng"]') === button,
    };
  });
  assert(layout.buttonBottom < layout.footerTop, 'order create button must remain above bottom navigation');
  assert(layout.buttonBottom <= layout.viewportHeight, 'order create button must remain inside the viewport');
  assert.equal(layout.display, 'flex');
  assert.equal(layout.receivesPointer, true, 'order create button must be the top hit target');

  await addButton.click();
  await page.getByRole('heading', { name: 'Chọn cách lên đơn' }).waitFor({ state: 'visible', timeout: 5000 });
  await page.getByRole('button', { name: /Thủ công/ }).waitFor({ state: 'visible' });
  assert.deepEqual(errors, [], 'order create flow must not produce browser errors');
  console.log('PASS order create button visual QA', layout);
  await context.close();
} finally {
  await browser.close();
}
