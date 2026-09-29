import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const baseUrl = process.env.HD_MANAGER_EMPLOYEE_FAB_URL || 'http://127.0.0.1:5211/';
const browserPath = process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const claims = {
  uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin',
  companyId: 'comp_preview', companyName: 'Công ty HD Preview',
  accountType: 'employee', role: 'super_admin', name: 'Quản trị Demo', phone: '0909000001',
};
const authToken = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;

const browser = await chromium.launch({ executablePath: browserPath, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(token => { window.__initial_auth_token = token; }, authToken);
  const response = await page.goto(baseUrl, { waitUntil: 'commit', timeout: 20000 });
  assert.equal(response?.status(), 200);
  const moreButton = page.getByRole('button', { name: 'Thêm', exact: true });
  await moreButton.waitFor({ state: 'visible', timeout: 30000 });
  await moreButton.click();
  await page.getByRole('button', { name: 'Nhân sự', exact: true }).click();

  const addButton = page.getByRole('button', { name: 'Thêm nhân viên' });
  await addButton.waitFor({ state: 'visible', timeout: 10000 });
  const layout = await page.evaluate(() => {
    const button = document.querySelector('button[aria-label="Thêm nhân viên"]');
    const footer = document.querySelector('.hd-app-navigation');
    return {
      buttonBottom: button.getBoundingClientRect().bottom,
      footerTop: footer?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY,
      viewportHeight: window.innerHeight,
      display: getComputedStyle(button.parentElement).display,
    };
  });
  assert(layout.buttonBottom < layout.footerTop, 'employee create button must remain above the bottom navigation');
  assert(layout.buttonBottom <= layout.viewportHeight, 'employee create button must remain inside the viewport');
  assert.equal(layout.display, 'flex');

  await addButton.click();
  await page.getByRole('heading', { name: 'Tạo tài khoản bộ phận' }).waitFor({ state: 'visible', timeout: 5000 });
  const form = page.locator('form').filter({ has: page.getByPlaceholder('Tên nhân sự') });
  const nameInput = form.getByPlaceholder('Tên nhân sự');
  const departmentSelect = form.getByRole('combobox', { name: 'Bộ phận' });
  const phoneInput = form.getByPlaceholder('SĐT (Đăng nhập)');
  const passwordInput = form.getByRole('textbox', { name: 'Mật khẩu' });
  await Promise.all([
    nameInput.waitFor({ state: 'visible' }),
    departmentSelect.waitFor({ state: 'visible' }),
    phoneInput.waitFor({ state: 'visible' }),
    passwordInput.waitFor({ state: 'visible' }),
  ]);
  assert.equal(await passwordInput.inputValue(), '12345678', 'new employee form must show the default password');

  const formLayout = await page.evaluate(() => {
    const bounds = selector => {
      const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      name: bounds('input[placeholder="Tên nhân sự"]'),
      department: bounds('select[aria-label="Bộ phận"]'),
      phone: bounds('input[placeholder="SĐT (Đăng nhập)"]'),
      password: bounds('input[aria-label="Mật khẩu"]'),
    };
  });
  const sameRow = (first, second) => Math.abs(first.y - second.y) < 2
    && first.x < second.x && first.x + first.width <= second.x + 8;
  assert(sameRow(formLayout.name, formLayout.department), 'employee name and department selector must share a row');
  assert(sameRow(formLayout.phone, formLayout.password), 'phone and password must share a row');

  const formText = await form.innerText();
  for (const removedText of [
    'Bộ phận công ty',
    'Chưa phân bộ phận',
    'Bộ phận được chọn sẽ quyết định',
    'Chọn thêm bộ phận mà nhân sự có thể làm',
    'Giấy tờ nhân sự',
    'Vị trí GPS chấm công',
    'Lấy GPS',
  ]) {
    assert(!formText.includes(removedText), `new employee form must not show: ${removedText}`);
  }

  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  for (const removedText of ['Tài khoản bộ phận', 'Mô hình tài khoản', 'Lượt khách']) {
    assert.equal(await page.getByText(removedText, { exact: true }).count(), 0, `employee screen must not show: ${removedText}`);
  }
  const settingsButton = page.getByRole('button', { name: 'Cài đặt nhân sự' });
  await settingsButton.waitFor({ state: 'visible' });
  assert.equal(await page.getByRole('button', { name: 'Thông báo' }).count(), 0, 'employee header must replace the notification button with settings');
  await settingsButton.click();
  const settingsDialog = page.getByRole('dialog', { name: 'Cài đặt nhân sự' });
  await settingsDialog.waitFor({ state: 'visible' });
  const departmentsRow = settingsDialog.getByRole('button', { name: /Bộ phận công ty/ });
  const holidaysRow = settingsDialog.getByRole('button', { name: /Ngày lễ/ });
  await Promise.all([departmentsRow.waitFor({ state: 'visible' }), holidaysRow.waitFor({ state: 'visible' })]);
  await departmentsRow.click();
  await settingsDialog.getByRole('textbox', { name: 'Tên bộ phận công ty' }).waitFor({ state: 'visible' });
  await settingsDialog.getByRole('button', { name: /Ngày lễ/ }).click();
  await settingsDialog.getByRole('heading', { name: 'Cài một lần, bảng lương tự tính' }).waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await settingsDialog.waitFor({ state: 'hidden' });

  const firstEmployeeCard = page.locator('main div[role="button"][tabindex="0"]:visible').first();
  await firstEmployeeCard.click();
  const employeeProfile = page.getByRole('dialog', { name: /^Hồ sơ nhân sự/ });
  await employeeProfile.waitFor({ state: 'visible' });
  const profileBounds = await employeeProfile.boundingBox();
  assert(profileBounds && profileBounds.width >= 390 && profileBounds.height >= 780, `editing an employee must open a fixed full-page profile: ${JSON.stringify(profileBounds)}`);
  const saveButton = employeeProfile.getByRole('button', { name: 'Lưu', exact: true });
  const saveTopBeforeScroll = (await saveButton.boundingBox()).y;
  const profileScroll = employeeProfile.locator('form > div.overflow-y-auto');
  await profileScroll.evaluate(element => { element.scrollTop = element.scrollHeight; });
  const saveTopAfterScroll = (await saveButton.boundingBox()).y;
  assert(Math.abs(saveTopAfterScroll - saveTopBeforeScroll) < 2, 'profile save bar must stay fixed while the form scrolls');
  await employeeProfile.getByRole('button', { name: 'Quay lại danh sách nhân sự' }).click();
  await employeeProfile.waitFor({ state: 'hidden' });

  assert.deepEqual(errors, [], 'employee add flow must not produce browser errors');
  console.log('PASS employee add/profile/settings visual QA', { ...layout, formLayout, profileBounds });
  await context.close();
} finally {
  await browser.close();
}
