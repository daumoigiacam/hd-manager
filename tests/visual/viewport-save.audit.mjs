import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const baseUrl = process.env.HD_MANAGER_VIEWPORT_AUDIT_URL || 'http://127.0.0.1:5211/';
const browserPath = process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const baseline = process.env.HD_MANAGER_AUDIT_BASELINE === '1';
const claims = {
  uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin',
  companyId: 'comp_preview', companyName: 'Công ty HD Preview',
  accountType: 'employee', role: 'super_admin', name: 'Quản trị Demo', phone: '0909000001',
};
const token = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
const localNow = new Date();
const today = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;
const store = {
  orderRequests: {
    or_viewport_audit: {
      id: 'or_viewport_audit', companyId: 'comp_preview', customerId: 'c_preview_01',
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
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ authToken, initialStore }) => {
    window.__initial_auth_token = authToken;
    localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify(initialStore));
    const target = new EventTarget();
    const visual = {
      height: 844, width: 390, offsetTop: 0, offsetLeft: 0, scale: 1,
      addEventListener: (...args) => target.addEventListener(...args),
      removeEventListener: (...args) => target.removeEventListener(...args),
    };
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: visual });
    window.__auditVisualViewport = (height, offsetTop = 0, width = visual.width) => {
      visual.height = height;
      visual.offsetTop = offsetTop;
      visual.width = width;
      target.dispatchEvent(new Event('resize'));
      target.dispatchEvent(new Event('scroll'));
    };
  }, { authToken: token, initialStore: store });
  await page.goto(`${baseUrl}?perfMonitor=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-hd-shell="enterprise"]').waitFor({ timeout: 30000 });
  await page.route('**/api/perf-audit*', route => route.fulfill({
    status: 201,
    body: JSON.stringify({ ok: true }),
    headers: { 'content-type': 'application/json', 'server-timing': 'db;dur=7.5' },
  }));
  const apiEventStart = await page.evaluate(() => window.hdPerformanceMonitor?.events().length || 0);
  const requestBody = JSON.stringify({ customerPhone: 'private-test-value' });
  await page.evaluate(body => fetch('/api/perf-audit?token=private-test-value', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body,
  }), requestBody);
  const apiTrace = await page.evaluate((start) => (window.hdPerformanceMonitor?.events() || [])
    .slice(start).find(event => event.type === 'api.response')?.detail || null, apiEventStart);
  assert.equal(apiTrace?.status, 201, 'network trace must report response status');
  assert.equal(apiTrace?.requestBytes, new TextEncoder().encode(requestBody).byteLength, 'network trace must report request bytes');
  assert.ok(apiTrace?.responseBytes > 0, 'network trace must report response bytes');
  assert.ok(apiTrace?.ttfbMs >= 0, 'network trace must report time to response headers');
  assert.equal(apiTrace?.databaseDurationMs, 7.5, 'network trace must read server database timing when provided');
  assert.ok(!JSON.stringify(apiTrace).includes('private-test-value'), 'network trace must not expose payload or secrets');
  await page.locator('[data-hd-navigation="bottom"]').getByRole('button', { name: 'Đặt hàng', exact: true }).click();
  const module = page.locator('.premium-order-request-module');
  await module.waitFor();
  await module.getByRole('button', { name: 'LÊN ĐƠN' }).click();
  const modal = page.locator('.hd-order-request-modal-panel');
  await modal.waitFor();
  const measure = () => page.evaluate(() => {
    const shell = document.querySelector('.mobile-app-shell').getBoundingClientRect();
    const layer = document.querySelector('.hd-order-request-modal-layer').getBoundingClientRect();
    const panel = document.querySelector('.hd-order-request-modal-panel').getBoundingClientRect();
    const footer = document.querySelector('.hd-order-request-modal-actions, .hd-order-request-modal-panel .hd-modal-actions').getBoundingClientRect();
    const body = document.querySelector('.hd-order-request-modal-panel form .hd-modal-body').getBoundingClientRect();
    return {
      shellHeight: Math.round(shell.height), layerHeight: Math.round(layer.height),
      panelHeight: Math.round(panel.height), panelTop: Math.round(panel.top),
      footerBottom: Math.round(footer.bottom), bodyBottom: Math.round(body.bottom),
      appViewportHeight: getComputedStyle(document.documentElement).getPropertyValue('--hd-viewport-height').trim(),
      modalViewportHeight: getComputedStyle(document.documentElement).getPropertyValue('--hd-modal-viewport-height').trim(),
      bodyOverflow: getComputedStyle(document.body).overflow,
    };
  });
  const before = await measure();
  const textInput = modal.getByPlaceholder('Chọn hoặc tìm khách hàng');
  await textInput.focus();
  await page.evaluate(() => window.__auditVisualViewport(500));
  await page.waitForTimeout(100);
  const textKeyboard = await measure();
  await page.evaluate(() => window.__auditVisualViewport(844));
  await textInput.focus();
  const customerOption = modal.getByRole('option').first();
  await customerOption.waitFor({ timeout: 5000 });
  await customerOption.click();
  await modal.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await page.waitForTimeout(180);
  const detailBefore = await measure();
  const numericInput = modal.locator('input[inputmode="numeric"]').first();
  await numericInput.waitFor();
  await numericInput.focus();
  await page.evaluate(() => window.__auditVisualViewport(500));
  await page.waitForTimeout(100);
  const numericKeyboard = await measure();
  await modal.getByPlaceholder('Ghi chú nếu cần').focus();
  await page.waitForTimeout(100);
  const switchedInput = await measure();
  await page.evaluate(() => document.activeElement?.blur());
  await page.evaluate(() => window.__auditVisualViewport(844));
  await page.waitForTimeout(100);
  const restored = await measure();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => window.__auditVisualViewport(390, 0, 844));
  await page.waitForTimeout(100);
  const landscape = await measure();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.__auditVisualViewport(844, 0, 390));
  await page.waitForTimeout(100);
  const afterRotation = await measure();
  await modal.locator(':scope > div').first().getByRole('button').click();
  await modal.waitFor({ state: 'hidden' });

  const existing = module.getByRole('button', { name: '285.000' }).first();
  await existing.waitFor();
  await existing.click();
  const editor = page.getByRole('dialog', { name: 'Sửa đơn giá' });
  await editor.getByRole('textbox').first().fill('290000');
  const performanceEventStart = await page.evaluate(() => window.hdPerformanceMonitor?.events().length || 0);
  const saveStart = performance.now();
  await editor.getByRole('button', { name: 'Lưu', exact: true }).click();
  await editor.waitFor({ state: 'hidden', timeout: 5000 });
  const saveMs = Math.round(performance.now() - saveStart);
  await module.getByRole('button', { name: '290.000' }).first().waitFor();
  const perfEvents = await page.evaluate((start) => (window.hdPerformanceMonitor?.events() || []).slice(start), performanceEventStart);
  const renderMs = perfEvents.filter(event => event.type === 'render.react')
    .reduce((sum, event) => sum + (event.detail.actualDurationMs || 0), 0);
  const networkRequests = perfEvents.filter(event => event.type === 'api.response');
  const saveTrace = perfEvents.filter(event => event.type === 'save.firestore_document').map(event => event.detail);
  const result = {
    before, textKeyboard, detailBefore, numericKeyboard, switchedInput, restored,
    landscape, afterRotation, saveMs, renderMs: Math.round(renderMs),
    saveTrace, networkRequests: networkRequests.length, errors,
  };
  console.log(JSON.stringify(result));
  assert.deepEqual(errors, []);
  if (!baseline) {
    assert.equal(textKeyboard.shellHeight, before.shellHeight, 'text keyboard must not resize the app shell');
    assert.equal(numericKeyboard.shellHeight, detailBefore.shellHeight, 'numeric keyboard must not resize the app shell');
    assert.equal(switchedInput.shellHeight, detailBefore.shellHeight, 'switching focused fields must not resize the app shell');
    assert.equal(restored.shellHeight, detailBefore.shellHeight, 'dismissing keyboard restores shell height');
    assert.ok(textKeyboard.footerBottom <= 500, 'modal actions must remain above the simulated text keyboard');
    assert.ok(numericKeyboard.footerBottom <= 500, 'modal actions must remain above the simulated numeric keyboard');
    assert.equal(switchedInput.footerBottom, numericKeyboard.footerBottom, 'switching inputs must not shift modal actions');
    assert.ok(Math.abs(restored.footerBottom - detailBefore.footerBottom) <= 2, 'modal actions must return to their original position');
    assert.equal(landscape.shellHeight, 390, 'landscape viewport must resize the app shell');
    assert.ok(landscape.footerBottom <= 390, 'modal actions must fit within the landscape viewport');
    assert.equal(afterRotation.shellHeight, detailBefore.shellHeight, 'returning to portrait must restore the app shell');
    assert.ok(Math.abs(afterRotation.footerBottom - detailBefore.footerBottom) <= 2, 'returning to portrait must restore modal actions');
    assert.ok(saveMs < 1500, `preview save took ${saveMs}ms`);
    assert.equal(saveTrace.length, 1, 'a document save must emit exactly one performance trace');
    assert.equal(saveTrace[0].status, 'queued', 'durable local save must not claim a server confirmation');
    assert.equal(saveTrace[0].remoteConfirmed, false);
    assert.equal(saveTrace[0].writeSource, 'durable-local-queue');
    const persistedRequest = await page.evaluate(() => JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview')).orderRequests.or_viewport_audit);
    assert.equal(persistedRequest.items[0].unitPrice, 290000, 'edited price must survive a local reload');
    assert.equal(saveTrace[0].retryCount, 0, 'preview save must not retry');
    assert.ok(saveTrace[0].payloadBytes > 0, 'trace must report payload size without exposing its content');
  }
  await module.getByRole('button', { name: '290.000' }).first().click();
  await editor.getByRole('textbox').first().fill('291000');
  const capturedSave = editor.getByRole('button', { name: 'Lưu', exact: true });
  await capturedSave.hover();
  await page.mouse.down();
  await page.evaluate(() => window.__auditVisualViewport(500));
  await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--hd-modal-viewport-height') === '500px');
  await page.mouse.up();
  await editor.waitFor({ state: 'hidden' });
  await module.getByRole('button', { name: '291.000' }).first().waitFor();
  await page.evaluate(() => window.__auditVisualViewport(844));
  await context.close();
} finally {
  await browser.close();
}
