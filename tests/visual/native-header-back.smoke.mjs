import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

// Run against a debug APK built with VITE_DATA_MODE=preview and VITE_ALLOW_PREVIEW_BUILD=true.
const endpoint = process.env.HD_MANAGER_NATIVE_CDP_URL || 'http://127.0.0.1:9225';
const claims = {
  uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin',
  companyId: 'comp_preview', companyName: 'Công ty HD Preview',
  accountType: 'employee', role: 'super_admin', name: 'Quản trị Demo', phone: '0909000001',
};
const authToken = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
const targets = await (await fetch(`${endpoint}/json`)).json();
const target = targets.find((item) => item.type === 'page' && item.url.startsWith('https://localhost/'));
assert(target?.webSocketDebuggerUrl, 'Android app WebView must expose a debug page');

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 0;
socket.addEventListener('message', (event) => {
  const response = JSON.parse(event.data);
  if (!response.id || !pending.has(response.id)) return;
  const { resolve, reject, timer } = pending.get(response.id);
  clearTimeout(timer);
  pending.delete(response.id);
  if (response.error) reject(new Error(`${response.error.message} (${response.error.code})`));
  else resolve(response.result || {});
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  const timer = setTimeout(() => {
    pending.delete(id);
    reject(new Error(`CDP timed out: ${method}`));
  }, 20000);
  pending.set(id, { resolve, reject, timer });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result?.value;
};
const until = async (condition, label, timeoutMs = 30000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (await evaluate(condition)) return;
    } catch {
      // The execution context is briefly replaced during a WebView reload.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const body = await evaluate('document.body?.innerText?.slice(0, 500)').catch(() => 'unavailable');
  throw new Error(`Timed out waiting for ${label}. Screen: ${body}`);
};
const click = async (selector, label) => {
  const clicked = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    element.click();
    return true;
  })()`);
  assert(clicked, `${label} must be present`);
};
const clickNamed = async (name) => {
  const clicked = await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')]
      .find((item) => item.textContent.trim() === ${JSON.stringify(name)});
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(clicked, `${name} button must be present`);
};
const titleIs = (title) => `document.querySelector('.hd-app-header h1')?.textContent?.trim() === ${JSON.stringify(title)}`;

try {
  await new Promise((resolve, reject) => {
    if (socket.readyState === WebSocket.OPEN) return resolve();
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__initial_auth_token = ${JSON.stringify(authToken)};`,
  });
  await send('Page.reload', { ignoreCache: true });
  await until("Boolean(document.querySelector('[data-hd-navigation=bottom]'))", 'authenticated app footer', 45000);

  await clickNamed('Thêm');
  await until(titleIs('Thêm'), 'More section');
  await clickNamed('Khách hàng');
  await until(titleIs('Khách hàng'), 'Customers');
  await click('[data-customer-card="true"]', 'customer card');
  await until("Boolean(document.querySelector('[data-customer-detail-products=true]'))", 'customer detail');
  await click('.hd-app-header button[aria-label="Quay lại"]', 'header back in customer detail');
  await until("Boolean(document.querySelector('[data-customer-card=true]')) && !document.querySelector('[data-customer-detail-products=true]')", 'customer list');
  await click('.hd-app-header button[aria-label="Quay lại"]', 'header back in Customers');
  await until(titleIs('Thêm'), 'previous More section');

  await clickNamed('Kho sản phẩm');
  await until(titleIs('Kho SP'), 'Products');
  await click('button[aria-label="Thêm sản phẩm"]', 'add product');
  await until("Boolean(document.querySelector('.hd-product-editor-layer'))", 'product editor');
  execFileSync('adb', ['shell', 'input', 'keyevent', '4']);
  await until("!document.querySelector('.hd-product-editor-layer')", 'product editor closed by Android Back');
  assert(await evaluate(titleIs('Kho SP')), 'Android Back must keep the product list open');
  await click('.hd-app-header button[aria-label="Quay lại"]', 'header back in Products');
  await until(titleIs('Thêm'), 'More section after Products');

  const capture = await send('Page.captureScreenshot', { format: 'png' });
  await mkdir('test-results/app-header-back', { recursive: true });
  await writeFile('test-results/app-header-back/native-webview.png', Buffer.from(capture.data, 'base64'));
  assert(await evaluate("Boolean(document.querySelector('[data-hd-shell=enterprise]'))"), 'back must not exit the native app');
  console.log('PASS native Android WebView header and system back');
} finally {
  socket.close();
}
