import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { preview } from 'vite';
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';

const serial = process.env.HD_LOGIN_ANDROID_SERIAL;
if (serial) assert.match(serial, /^[a-zA-Z0-9_-]+$/);
const adb = 'D:/HD-DEV/android/sdk/platform-tools/adb.exe';
const output = `test-results/perf-recovery-001/login-isolated${serial ? '-native' : ''}`;
await mkdir(output, { recursive: true });
const server = await preview({ build: { outDir: 'test-results/full-interaction/recovery-001-before/app' }, preview: { host: '127.0.0.1', port: 0 } });
const origin = serial ? 'https://localhost' : `http://127.0.0.1:${server.httpServer.address().port}`;
let debugPort;
if (serial) {
  const pid = execFileSync(adb, ['-s', serial, 'shell', 'pidof', 'com.hdmanager.app.acceptance'], { encoding: 'utf8' }).trim();
  assert.match(pid, /^\d+$/);
  debugPort = execFileSync(adb, ['-s', serial, 'forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid}`], { encoding: 'utf8' }).trim();
}
const browser = serial ? await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`) : await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const results = [];
const errors = [];
let requests = 0;
let page;
const paths = [];
try {
  const context = serial ? browser.contexts()[0] : await browser.newContext({ viewport: { width: 390, height: 844 } });
  page = serial ? context.pages().find(page => page.url().startsWith(origin)) : await context.newPage();
  assert.ok(page);
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (serial && url.pathname === '/acceptance-init.js') return route.fulfill({ contentType: 'application/javascript', body: 'localStorage.clear();sessionStorage.clear();' });
    if (route.request().method() === 'POST') paths.push(url.pathname);
    if (url.origin === origin) return route.continue();
    if (url.pathname.endsWith('/identityLogin')) {
      requests++;
      return route.fulfill({ status: 401, json: { success: false, message: 'Tai khoan kiem thu khong hop le' } });
    }
    return route.abort();
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Số điện thoại', { exact: true }).waitFor();
  results.push({ check: 'Login screen without session', status: 'PASS' });
  await page.getByPlaceholder('Mật khẩu', { exact: true }).fill('TestOnly123');
  await page.getByRole('button', { name: 'Hiện mật khẩu', exact: true }).click();
  assert.equal(await page.getByPlaceholder('Mật khẩu', { exact: true }).getAttribute('type'), 'text');
  await page.getByRole('button', { name: 'Ẩn mật khẩu', exact: true }).click();
  assert.equal(await page.getByPlaceholder('Mật khẩu', { exact: true }).getAttribute('type'), 'password');
  results.push({ check: 'Password visibility toggle', status: 'PASS' });
  await page.getByPlaceholder('Số điện thoại', { exact: true }).fill('12');
  await page.getByRole('button', { name: 'Vào Ứng Dụng', exact: true }).click();
  await page.getByText(/Nhập số điện thoại hợp lệ/).waitFor();
  assert.equal(requests, 0);
  results.push({ check: 'Invalid phone rejected before request', status: 'PASS' });
  await page.getByPlaceholder('Số điện thoại', { exact: true }).fill('0909000001');
  await page.getByRole('button', { name: 'Vào Ứng Dụng', exact: true }).click();
  await page.getByText('This UI preview cannot sign in. Open the Firebase cloud app to use your account.', { exact: true }).waitFor();
  assert.equal(requests, 0);
  assert.equal(await page.locator('main[data-hd-module="home"]:visible').count(), 0);
  results.push({ check: 'Preview safety guard blocks cloud login', status: 'PASS' });
  results.push({ check: 'Successful Firebase login and rejection', status: 'BLOCKED', reason: 'Preview intentionally prohibits authentication; requires an authorized test account and cloud runtime' });
  await page.getByRole('button', { name: 'Quên mật khẩu?', exact: true }).click();
  await page.getByText('Khôi phục mật khẩu', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Vào Ứng Dụng', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Quay lại đăng nhập', exact: true }).click();
  await page.getByRole('button', { name: 'Vào Ứng Dụng', exact: true }).waitFor();
  results.push({ check: 'Recovery screen and return', status: 'PASS' });
  await page.screenshot({ path: `${output}/login.png`, fullPage: true });
  assert.deepEqual(errors, []);
} catch (error) {
  console.log({ paths, body: (await page?.locator('body').innerText())?.slice(0, 2200) });
  results.push({ check: 'Remaining login checks', status: 'FAIL', error: error.message });
  process.exitCode = 1;
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ scope: `${serial ? 'Physical Android acceptance APK' : 'Browser'} preview login UI; NOT Firebase authentication, native biometric or successful login acceptance`, results, errors }, null, 2));
  console.log(JSON.stringify({ results, errors }, null, 2));
  await browser.close();
  if (debugPort) execFileSync(adb, ['-s', serial, 'forward', '--remove', `tcp:${debugPort}`]);
  await new Promise(resolve => server.httpServer.close(resolve));
}
