import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const baseUrl = process.env.HD_MANAGER_NAV_PERF_URL || 'http://127.0.0.1:5216/';
const browserPath = process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const maxMs = Number(process.env.HD_MANAGER_NAV_MAX_MS || 0);
const scale = Math.max(1, Number(process.env.HD_MANAGER_NAV_SCALE || 1));
const claims = {
  uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin',
  companyId: 'comp_preview', companyName: 'Công ty HD Preview',
  accountType: 'employee', role: 'super_admin', name: 'Quản trị Demo', phone: '0909000001',
};
const token = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
const now = new Date();
const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const fixture = {
  employees: Object.fromEntries(Array.from({ length: 12 }, (_, index) => {
    const id = `emp_${index}`;
    return [id, { id, companyId: 'comp_preview', name: `Nhân viên ${index}`, role: 'sales', position: 'Kinh doanh', baseSalary: 8000000 }];
  })),
  customers: Object.fromEntries(Array.from({ length: 120 * scale }, (_, index) => {
    const id = `customer_${index}`;
    return [id, { id, companyId: 'comp_preview', name: `Khách hàng ${index}`, empId: `emp_${index % 12}`, phone: `0900${String(index).padStart(6, '0')}` }];
  })),
  orders: Object.fromEntries(Array.from({ length: 600 * scale }, (_, index) => {
    const id = `order_${index}`;
    return [id, { id, companyId: 'comp_preview', customerId: `customer_${index % 120}`, date, total: 250000, totalAmount: 250000, items: [{ productId: 'product_1', quantity: 5, unitPrice: 50000 }] }];
  })),
  payments: Object.fromEntries(Array.from({ length: 300 * scale }, (_, index) => {
    const id = `payment_${index}`;
    return [id, { id, companyId: 'comp_preview', customerId: `customer_${index % 120}`, date, amount: 50000 }];
  })),
  products: { product_1: { id: 'product_1', companyId: 'comp_preview', name: 'Vịt sống', unit: 'kg', price: 50000 } },
};

const browser = await chromium.launch({ executablePath: browserPath, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ authToken, store }) => {
    window.__initial_auth_token = authToken;
    window.localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify(store));
  }, { authToken: token, store: fixture });
  await page.goto(baseUrl, { waitUntil: 'commit' });
  await page.locator('[data-hd-shell="enterprise"]').waitFor();
  await page.waitForFunction(() => {
    const title = document.querySelector('.business-report-kpi--revenue')?.getAttribute('title') || '';
    return Number(title.replace(/[^\d]/g, '')) >= 150000000;
  }, null, { timeout: 30000 });
  if (Number(process.env.HD_MANAGER_NAV_IDLE_MS) > 0) {
    await page.waitForTimeout(Number(process.env.HD_MANAGER_NAV_IDLE_MS));
  }
  const measure = async (label, contentSelector, expectedText = '') => {
    const timing = await page.evaluate(async ({ name, selector, text }) => {
    const button = [...document.querySelectorAll('[data-hd-navigation="bottom"] button')]
      .find(item => item.textContent.trim() === name);
    if (!button) throw new Error(`Missing footer button: ${name}`);
    const started = performance.now();
    const longTasks = [];
    const longTaskObserver = typeof PerformanceObserver === 'function'
      ? new PerformanceObserver((list) => list.getEntries().forEach((entry) => longTasks.push(Math.round(entry.duration))))
      : null;
    longTaskObserver?.observe({ entryTypes: ['longtask'] });
    button.click();
    const clickMs = Math.round(performance.now() - started);
    let contentMs = 0;
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => { observer.disconnect(); reject(new Error(`Timed out navigating to ${name}`)); }, 30000);
      const check = () => {
        const target = document.querySelector(selector);
        if (!target || !target.getClientRects().length || (text && !target.textContent.includes(text))) return;
        contentMs = Math.round(performance.now() - started);
        window.clearTimeout(timeout);
        observer.disconnect();
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      };
      const observer = new MutationObserver(check);
      observer.observe(document.body, { childList: true, attributes: true, attributeFilter: ['style'], subtree: true });
      check();
    });
    longTaskObserver?.disconnect();
    return { ms: Math.round(performance.now() - started), clickMs, contentMs, longTasks };
    }, { name: label, selector: contentSelector, text: expectedText });
    if (timing.ms >= 200) console.log(`Navigation timing ${label}:`, JSON.stringify(timing));
    return timing.ms;
  };

  const profileNavigation = async (label, run) => {
    if (process.env.HD_MANAGER_NAV_PROFILE !== '1'
      || (process.env.HD_MANAGER_NAV_PROFILE_TARGET && process.env.HD_MANAGER_NAV_PROFILE_TARGET !== label)) return run();
    const profiler = await context.newCDPSession(page);
    await profiler.send('Profiler.enable');
    await profiler.send('Profiler.start');
    try {
      const ms = await run();
      const { profile } = await profiler.send('Profiler.stop');
      if (ms >= 200) {
        const hot = profile.nodes
          .filter(node => node.hitCount > 0)
          .sort((left, right) => right.hitCount - left.hitCount)
          .slice(0, 20)
          .map(node => ({ function: node.callFrame.functionName, hits: node.hitCount, url: node.callFrame.url.split('/').slice(-1)[0], line: node.callFrame.lineNumber }));
        console.log(`Navigation CPU profile ${label} (${ms} ms):`, JSON.stringify(hot));
      }
      return ms;
    } finally {
      await profiler.detach();
    }
  };

  const samples = [];
  for (let index = 0; index < 3; index += 1) {
    samples.push({ screen: 'Thêm', ms: await measure('Thêm', '.hd-more-menu, .hd-more-grid, .hd-more-screen') });
    samples.push({ screen: 'Trang chủ', ms: await profileNavigation('Trang chủ từ Thêm', () => measure('Trang chủ', '.business-report-workspace')) });
  }
  for (const [button, title] of [
    ['Đặt hàng', 'Đơn đặt'],
    ['Xuất kho', 'Phiếu xuất kho'],
    ['Đơn hàng', 'Đơn hàng'],
  ]) {
    samples.push({ screen: button, ms: await profileNavigation(button, () => measure(button, '.hd-app-header .hd-header-title', title)) });
    samples.push({ screen: 'Trang chủ', ms: await profileNavigation(`Trang chủ từ ${button}`, () => measure('Trang chủ', '.business-report-workspace')) });
  }
  assert.deepEqual(errors, [], 'navigation must not raise page errors');
  if (maxMs > 0) {
    for (const sample of samples) assert(sample.ms < maxMs, `${sample.screen} took ${sample.ms} ms (limit ${maxMs} ms)`);
  }
  console.log(JSON.stringify(samples));
  await context.close();
} finally {
  await browser.close();
}
