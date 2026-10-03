import { installPreviewReader } from '../helpers/preview-browser-storage.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { seedData } from '../../src/mocks/seed-data.js';

process.env.VITE_DATA_MODE = 'preview';
const output = 'test-results/attendance-work-roles';
await mkdir(output, { recursive: true });
const server = await createServer({ cacheDir: `${output}/vite-cache`, optimizeDeps: { entries: ['index.html'] }, server: { host: '127.0.0.1', port: 0 }, logLevel: 'warn' });
const browser = await chromium.launch({ executablePath: process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const today = new Date().toLocaleDateString('sv-SE');
const empId = 'emp_role_test';
const claims = { uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin', companyId: 'comp_preview',
  companyName: 'Công ty HD Preview', accountType: 'employee', role: 'super_admin', name: 'Quản trị Demo', phone: '0909000001' };
const fixture = structuredClone(seedData);
fixture.employees = { emp_admin: fixture.employees.emp_admin, [empId]: {
  id: empId, companyId: 'comp_preview', name: 'Nhân sự Kiêm nhiệm Test', phone: '0909000044',
  position: 'Sản xuất', secondaryPositions: ['Tài xế'], role: 'employee', startDate: '2020-01-01', probationDuration: 0,
  salaryMonthDays: 26, basicSalary: 2600000, supportSalary: 0, experienceSalary: 0, overtimeRate: 0,
  roleSalaryComponents: [{ id: 'driver', position: 'Tài xế', amount: 1300000 }],
} };
fixture.attendance = { [`${today}_${empId}`]: { id: `${today}_${empId}`, companyId: 'comp_preview', status: 'present',
  checkIn: `${today}T07:30:00+07:00`, checkOut: `${today}T16:30:00+07:00` } };
fixture.payrollPeriods = {};
fixture.payrollSnapshots = {};
fixture.payrollAutoLockPlans = {};
try {
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
  for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 900 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    await installPreviewReader(page);
  await page.addInitScript(({ fixture, claims }) => {
      window.__initial_auth_token = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
      const key = 'hd-manager-local-db-v2-clean-preview';
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ ...fixture, __replaceSeed: true }));
    }, { fixture, claims });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Thêm', exact: true }).first().click({ timeout: 30000 });
    await page.getByRole('button', { name: 'Chấm công', exact: true }).first().click();
    const card = page.locator('div.bg-white.rounded-2xl').filter({ has: page.getByRole('heading', { name: 'Nhân sự Kiêm nhiệm Test', exact: true }) }).last();
    await card.getByRole('button', { name: 'Tài xế', exact: true }).click();
    assert.match(await card.innerText(), /Chưa chấm công/);
    await card.getByRole('button', { name: 'Chỉnh sửa', exact: true }).click();
    const form = page.locator('form').filter({ has: page.getByRole('group', { name: 'Công việc chấm công' }) });
    assert.equal(await form.getByRole('button', { name: 'Tài xế', exact: true }).getAttribute('aria-pressed'), 'true');
    const productionBounds = await form.getByRole('button', { name: 'Sản xuất', exact: true }).boundingBox();
    const driverBounds = await form.getByRole('button', { name: 'Tài xế', exact: true }).boundingBox();
    assert.ok(Math.abs(productionBounds.y - driverBounds.y) < 2, 'work roles share one row');
    assert.ok(driverBounds.x + driverBounds.width <= viewport.width, 'role choices fit the viewport');
    await form.locator('input[type="time"]').nth(0).fill('06:30');
    await form.locator('input[type="time"]').nth(1).fill('16:30');
    await page.screenshot({ path: `${output}/${viewport.width}-edit.png`, animations: 'disabled' });
    await form.getByRole('button', { name: 'Lưu chỉnh sửa', exact: true }).click();
    await form.waitFor({ state: 'hidden' });
    const saved = await page.evaluate(key => window.__readPreviewStore().attendance[key], `${today}_${empId}`);
    assert.equal(saved.checkIn, `${today}T07:30:00+07:00`, 'driver save preserves production time');
    assert.equal(new Date(saved.workRoles['Tài xế'].checkIn).getHours(), 6);
    assert.equal(new Date(saved.workRoles['Tài xế'].checkOut).getHours(), 16);
    await card.getByRole('button', { name: 'Sản xuất', exact: true }).click();
    assert.match(await card.innerText(), /07:30/);
    await card.getByRole('button', { name: 'Tài xế', exact: true }).click();
    assert.match(await card.innerText(), /06:30/);
    await page.screenshot({ path: `${output}/${viewport.width}-saved.png`, animations: 'disabled' });
    await page.getByRole('button', { name: 'Thêm', exact: true }).first().click();
    await page.getByRole('button', { name: 'Bảng lương', exact: true }).first().click();
    await page.getByRole('button', { name: 'Danh sách nhân viên' }).click();
    await page.getByText('Nhân sự Kiêm nhiệm Test', { exact: true }).click();
    await page.getByRole('tab', { name: 'Phụ cấp', exact: true }).click();
    assert.match(await page.locator('[data-payroll-screen="detail"]').innerText(), /Tài xế · 1 ngày công/);
    assert.match(await page.locator('[data-payroll-screen="detail"]').innerText(), /50\.000 đ/);
    await page.getByRole('tab', { name: 'Tổng quan', exact: true }).click();
    assert.match(await page.locator('[data-payroll-screen="detail"]').innerText(), /150\.000 đ/);
    await page.screenshot({ path: `${output}/${viewport.width}-payroll.png` });
    await page.reload();
    await page.getByRole('button', { name: 'Thêm', exact: true }).first().click();
    await page.getByRole('button', { name: 'Chấm công', exact: true }).first().click();
    await card.getByRole('button', { name: 'Tài xế', exact: true }).click();
    assert.match(await card.innerText(), /06:30/);
    assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}x${viewport.height}: role choice, edit, persistence, reload, separate salary`);
    await context.close();
  }
  const selfClaims = { ...claims, uid: empId, identityId: empId, appUserId: empId, role: 'production',
    position: 'Sản xuất', name: fixture.employees[empId].name, phone: fixture.employees[empId].phone };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 },
    geolocation: { latitude: 10.75, longitude: 106.6 }, permissions: ['geolocation'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await installPreviewReader(page);
  await page.addInitScript(({ fixture, claims }) => {
    window.__initial_auth_token = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
    const key = 'hd-manager-local-db-v2-clean-preview';
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ ...fixture, __replaceSeed: true }));
  }, { fixture, claims: selfClaims });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Thêm', exact: true }).first().click();
  await page.getByRole('button', { name: 'Chấm công', exact: true }).first().click();
  const workspace = page.locator('[data-attendance-screen="dashboard"]');
  await workspace.getByRole('button', { name: 'Tài xế', exact: true }).click();
  assert.match(await workspace.innerText(), /Chưa chấm công/);
  await workspace.getByRole('button', { name: 'Chấm công vào qua GPS', exact: true }).click();
  await workspace.getByRole('button', { name: 'Chấm công ra', exact: true }).waitFor();
  await workspace.getByRole('button', { name: 'Chấm công ra', exact: true }).click();
  await page.waitForFunction(key => Boolean(window.__readPreviewStore().attendance[key]?.workRoles?.['Tài xế']?.checkOut), `${today}_${empId}`);
  const saved = await page.evaluate(key => window.__readPreviewStore().attendance[key], `${today}_${empId}`);
  assert.equal(saved.checkIn, fixture.attendance[`${today}_${empId}`].checkIn);
  assert.equal(saved.checkOut, fixture.attendance[`${today}_${empId}`].checkOut);
  assert.equal(saved.workRoles['Tài xế'].checkInMethodMeta.type, 'gps');
  assert.equal(saved.workRoles['Tài xế'].checkOutMethodMeta.type, 'gps');
  await workspace.getByRole('button', { name: 'Sản xuất', exact: true }).click();
  assert.match(await workspace.innerText(), /07:30/);
  await workspace.getByRole('button', { name: 'Tài xế', exact: true }).click();
  await page.screenshot({ path: `${output}/390-self.png`, animations: 'disabled' });
  await page.getByRole('button', { name: 'Lịch sử', exact: true }).click();
  assert.match(await page.locator('[data-attendance-screen="history"]').innerText(), /GPS vị trí/);
  assert.deepEqual(errors, []);
  console.log('PASS employee self-attendance: GPS in/out for driver, primary time preserved, role history');
  await context.close();
} finally {
  await browser.close();
  await server.close();
}
