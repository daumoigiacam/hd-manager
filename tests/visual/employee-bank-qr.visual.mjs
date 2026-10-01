import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { seedData } from '../../src/mocks/seed-data.js';

process.env.VITE_DATA_MODE = 'preview';
const output = 'test-results/employee-bank-qr';
await mkdir(output, { recursive: true });
const server = await createServer({ cacheDir: `${output}/vite-cache`, optimizeDeps: { entries: ['index.html'] }, server: { host: '127.0.0.1', port: 0 }, logLevel: 'warn' });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const fixture = structuredClone(seedData);
Object.assign(fixture.employees.emp_sales_01, { salaryBankId: 'VCB', salaryBankName: 'Vietcombank', salaryBankAccountNumber: '1234567890', salaryBankAccountName: 'NGOC ANH' });
const claims = { uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin', companyId: 'comp_preview', accountType: 'employee', role: 'super_admin', name: 'Quản trị Demo', phone: '0909000001' };
try {
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const width of [360, 430, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => /^https?:/.test(route.request().url()) && !route.request().url().startsWith(url) ? route.abort() : route.continue());
    await page.addInitScript(({ fixture, claims }) => {
      window.__initial_auth_token = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
      localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify({ ...fixture, __replaceSeed: true }));
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
      Object.defineProperty(navigator, 'share', { value: async data => { window.__sharedQr = { size: data.files[0].size, type: data.files[0].type }; }, configurable: true });
    }, { fixture, claims });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.getByRole('button', { name: 'Thêm', exact: true }).first().click({ timeout: 60000 });
    await page.getByRole('button', { name: 'Nhân sự', exact: true }).first().click();
    const qr = page.getByRole('button', { name: 'Mở QR ngân hàng Ngọc Anh', exact: true });
    await qr.scrollIntoViewIfNeeded();
    await qr.click({ timeout: 30000 });
    const dialog = page.getByRole('dialog', { name: 'QR ngân hàng Ngọc Anh', exact: true });
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /1234567890/);
    assert.equal(await dialog.locator('img').evaluate(img => img.complete && img.naturalWidth === 600), true);
    await dialog.getByRole('button', { name: 'Chia sẻ QR', exact: true }).click();
    await page.waitForFunction(() => window.__sharedQr?.size > 100);
    assert.equal(await page.evaluate(() => window.__sharedQr.type), 'image/png');
    await page.screenshot({ path: `${output}/${width}-qr.png` });
    await dialog.getByRole('button', { name: 'Đóng QR', exact: true }).click();
    assert.ok(await page.getByText('Chưa đủ thông tin ngân hàng', { exact: true }).count());
    const card = qr.locator('../..');
    assert.equal(await card.evaluate(el => el.scrollWidth <= el.clientWidth), true);
    await page.screenshot({ path: `${output}/${width}-list.png` });
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('PASS: employee QR, share PNG, missing bank and responsive layout at 3 widths');
} finally { await browser.close(); await server.close(); }
