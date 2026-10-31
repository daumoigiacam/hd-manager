import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';
import { extractBrowserInteraction } from './helpers/browser-interaction-timing.mjs';

const output = path.resolve('test-results/navigation-response-20261031');
await mkdir(output, { recursive: true });
Object.assign(process.env, { VITE_DATA_MODE: 'preview', VITE_ALLOW_PREVIEW_BUILD: 'true', VITE_PERFORMANCE_PROFILE: 'false', VITE_PERFORMANCE_MONITOR: 'false' });
// This experiment was rejected. Re-run its archived source explicitly rather
// than silently reintroducing deferred navigation into today's application.
const candidateSource = process.env.HD_NAV_CANDIDATE_SOURCE || path.join(output, 'candidate-App.jsx');
const candidate = (await readFile(candidateSource, 'utf8')).replaceAll('\r\n', '\n');
const experimentHelper = await readFile('tests/fixtures/deferredNavigation.js', 'utf8');
let baseline = candidate;
const reverse = (needle, replacement, count = 1) => {
  const expression = typeof needle === 'string' ? needle : needle;
  const matches = typeof expression === 'string' ? baseline.split(expression).length - 1 : [...baseline.matchAll(expression)].length;
  assert.equal(matches, count, `Controlled baseline mismatch: ${needle}`);
  baseline = typeof expression === 'string' ? baseline.replaceAll(expression, replacement) : baseline.replace(expression, replacement);
};
reverse(/  const navigationScope = [\s\S]*?  const navigationPending = renderedTab !== activeTab;\n/g, '');
reverse('  const renderContent = (activeTab) => {', '  const renderContent = () => {');
reverse('      {navigationPending && <div className="hd-route-progress" role="status">Đang mở màn hình…</div>}\n', '');
reverse(/      <main ref=\{mainContentRef\} data-hd-module=\{renderedTab\}[\s\S]*?className="hd-app-content hd-shell-content flex-1 overflow-y-auto pb-24 px-4 pt-4">/g,
  '      <main ref={mainContentRef} data-hd-module={activeTab} className="hd-app-content hd-shell-content flex-1 overflow-y-auto pb-24 px-4 pt-4">');
reverse('VPS_UI_READ_MODULE_BY_TAB[renderedTab]', 'VPS_UI_READ_MODULE_BY_TAB[activeTab]', 2);
reverse("(renderedTab === 'home' || renderedTab === 'executive_dashboard') && canAccess(renderedTab)", "(activeTab === 'home' || activeTab === 'executive_dashboard') && canAccess(activeTab)");
reverse('name={`staff_${renderedTab}`}', 'name={`staff_${activeTab}`}');
reverse('resetKey={renderedTab}', 'resetKey={activeTab}');
reverse('id={`Module:${renderedTab}`}', 'id={`Module:${activeTab}`}');
reverse('{renderContent(renderedTab)}', '{renderContent()}');
const hash = value => createHash('sha256').update(value).digest('hex');
const iterations = Number(process.env.HD_NAV_ITERATIONS || 5);
assert.ok(Number.isInteger(iterations) && iterations >= 1 && iterations <= 20);
const allRoutes = [
  ['executive_dashboard', 'Điều hành'], ['home', 'Trang chủ', 'Trang chủ'], ['order_requests', 'Lên đơn đặt hàng', 'Đặt hàng'],
  ['orders', 'Đơn hàng', 'Đơn hàng'], ['warehouse_dispatch', 'Xuất kho', 'Xuất kho'], ['warehouse_import', 'Nhập Xuất Tồn'],
  ['delivery_reports', 'Báo cáo giao hàng'], ['products', 'Kho sản phẩm'], ['customers', 'Khách hàng'], ['debt', 'Sổ nợ'],
  ['finance', 'Thu chi'], ['bank_payments', 'Ngân hàng'], ['messages', 'Tin nhắn'], ['pricing', 'Giá cả'],
  ['company_attendance', 'Chấm công'], ['employee_reviews', 'Đánh giá'], ['asset_management', 'Quản lý tài sản'],
  ['payroll', 'Bảng lương'], ['employees', 'Nhân sự'], ['price_quotes', 'Báo giá hàng loạt'], ['settings', 'Cài đặt'],
  ['role_permissions', 'Vai trò'], ['billing', 'Gói cước'],
];
const requested = (process.env.HD_NAV_MODULES || 'customers,debt,products').split(',');
assert.ok(requested.every(module => allRoutes.some(route => route[0] === module)));
const routes = allRoutes.filter(route => requested.includes(route[0]));
await writeFile(path.join(output, 'source-manifest.json'), JSON.stringify({ candidateSha256: hash(candidate), baselineSha256: hash(baseline),
  candidateSource, variants: 'Only navigation priority/render ownership differs; financial logic, page size and compiler are identical',
  modules: requested, iterations, cpuThrottle: 6, viewport: { width: 390, height: 844 }, hardwareConcurrencyOverride: 4,
  React: 'production without profiler', compiler: ['chrome83', 'es2020'], scope: 'Desktop Chrome isolated preview; not physical Android or production Firebase',
}, null, 2));
for (const variant of ['before', 'after']) await build({ build: { outDir: path.join(output, variant), sourcemap: false, target: ['chrome83', 'es2020'] }, logLevel: 'error',
  plugins: [{ name: 'navigation-priority-ablation', enforce: 'pre',
    resolveId(id) { if (id === './services/deferredNavigation.js') return '\0hd-deferred-experiment'; },
    load(id) { if (id === '\0hd-deferred-experiment') return experimentHelper; },
    transform(code, id) { if (id.replaceAll('\\', '/').endsWith('/src/App.jsx')) return variant === 'before' ? baseline : candidate; },
    transformIndexHtml(html) { return html.replace('</head>', '<style>.hd-route-progress{position:absolute;top:calc(var(--hd-safe-top,0px) + 4rem);right:var(--hd-page-x,1rem);z-index:50;padding:.5rem .75rem;border:1px solid #cbd5e1;border-radius:.5rem;background:#fff;color:#334155;font-size:14px;pointer-events:none}.hd-app-content[data-navigation-pending="true"]{pointer-events:none}</style></head>'); },
  }] });
const date = '2026-10-31';
const make = (count, prefix, data) => Object.fromEntries(Array.from({ length: count }, (_, i) => {
  const id = `${prefix}_${i}`; return [id, { id, companyId: 'comp_preview', ...data(i) }];
}));
const fixture = {
  products: make(600, 'p_perf', i => ({ name: `Sản phẩm ${String(i).padStart(4, '0')}`, category: 'Hàng thử', unit: 'kg', purchaseUnit: 'kg', stockUnit: 'kg', costPrice: 30000, price: 50000, sellingPrice: 50000, stock: 50, isArchived: false })),
  customers: make(360, 'c_perf', i => ({ name: `Khách hàng ${i}`, empId: 'emp_sales_01', phone: `0900${String(i).padStart(6, '0')}`, isArchived: false })),
  orders: make(1800, 'o_perf', i => ({ customerId: `c_perf_${i % 360}`, empId: 'emp_sales_01', date, amount: 250000, totalAmount: 250000, total: 250000, items: [{ productId: `p_perf_${i % 600}`, quantity: 5, billingQuantity: 5, unitPrice: 50000, amount: 250000 }] })),
  payments: make(900, 'pay_perf', i => ({ customerId: `c_perf_${i % 360}`, date, amount: 50000 })),
};
const claims = { uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin', companyId: 'comp_preview', accountType: 'employee', role: 'super_admin', name: 'Quản trị Demo', phone: '0909000001' };
await writeFile(path.join(output, 'fixture.json'), JSON.stringify({ fixture, claims }, null, 2));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const samples = [], failures = [], memory = [], servers = new Map();
try {
  for (const variant of ['before', 'after']) servers.set(variant, await preview({ build: { outDir: path.join(output, variant) }, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' }));
  for (const [block, variant] of ['before', 'after', 'after', 'before'].entries()) {
    const origin = `http://127.0.0.1:${servers.get(variant).httpServer.address().port}`;
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(({ fixture, claims }) => {
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
      window.__initial_auth_token = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
      localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify(fixture));
      window.__timing = { events: [], click: null, expected: null, feedbackAt: null, readyAt: null };
      addEventListener('click', event => { if (event.isTrusted) window.__timing.click = performance.now(); }, true);
      new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__timing.events.push({
        name: entry.name, startTime: entry.startTime, duration: entry.duration, interactionId: entry.interactionId,
        processingStart: entry.processingStart, processingEnd: entry.processingEnd,
      }); }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
      new MutationObserver(() => {
        const timing = window.__timing;
        if (!timing.expected || timing.click === null) return;
        const shell = document.querySelector('[data-active-tab]');
        if (timing.feedbackAt === null && shell?.dataset.activeTab === timing.expected) timing.feedbackAt = performance.now();
        const main = document.querySelector('main[data-hd-module]');
        if (timing.readyAt === null && main?.dataset.hdModule === timing.expected && main.getAttribute('aria-busy') !== 'true'
          && !main.querySelector('[data-hd-module-loading]')) {
          if (timing.expected === 'customers' && !main.querySelector('[data-customer-card]')) return;
          if (timing.expected === 'products' && !main.querySelector('.hd-product-list')) return;
          timing.readyAt = performance.now();
        }
      }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-hd-module', 'data-active-tab', 'aria-busy'] });
    }, { fixture, claims });
    const page = await context.newPage();
    let documentLoads = 0;
    page.on('domcontentloaded', () => documentLoads++);
    page.on('pageerror', error => failures.push({ block, variant, type: 'javascript', message: error.message }));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await page.goto(`${origin}/?perfMonitor=0`, { waitUntil: 'domcontentloaded' });
    await page.locator('main[data-hd-module="home"]').waitFor({ timeout: 30000 });
    assert.equal(await page.evaluate(() => window.hdPerformanceMonitor.enabled()), false);
    const nav = page.locator('[data-hd-navigation="bottom"]');
    for (const [module, label, bottomLabel] of routes) for (let iteration = 0; iteration < iterations; iteration++) {
      try {
        await nav.getByRole('button', { name: 'Thêm', exact: true }).click();
        await page.locator('main[data-hd-module="more"]:not([aria-busy="true"])').waitFor();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.evaluate(expected => { window.__timing = { events: [], click: null, expected, feedbackAt: null, readyAt: null }; }, module);
        const button = bottomLabel ? nav.getByRole('button', { name: bottomLabel, exact: true }) : page.locator('main').getByRole('button', { name: label, exact: true });
        await button.click();
        await page.waitForFunction(() => window.__timing.readyAt !== null, null, { timeout: 15000 });
        await page.waitForTimeout(180); // Delivery flush only; never included in reported timing.
        const raw = await page.evaluate(() => ({ ...window.__timing,
          cards: [...document.querySelectorAll('[data-customer-card]')].map(card => ({
            name: card.querySelector('.hd-customer-card__name')?.textContent.trim(),
            stats: card.querySelector('.hd-customer-card__stats-row')?.textContent.replace(/\s+/g, ' ').trim(),
          })),
          liveNodes: document.querySelectorAll('*').length,
          customerTotal: document.querySelector('nav[aria-label="Phân trang khách hàng"] span')?.textContent.split('/').at(-1).trim(),
        }));
        const measured = extractBrowserInteraction(raw.events, raw.click);
        const eventStart = measured.events.length ? Math.min(...measured.events.map(event => event.startTime)) : null;
        const sample = { block, variant, module, iteration, responseToPaintMs: measured.durationMs,
          domAcknowledgementMs: eventStart === null || raw.feedbackAt === null ? null : raw.feedbackAt - eventStart,
          domReadyMs: eventStart === null ? null : raw.readyAt - eventStart, status: measured.status, raw };
        assert.ok(sample.domReadyMs === null || sample.domReadyMs >= 0, 'Negative timing invalidates the measurement');
        samples.push(sample);
        console.log(`${variant} ${module} #${iteration}: next-paint ${sample.responseToPaintMs ?? 'MISSING'} ms; DOM-ready ${sample.domReadyMs?.toFixed(1) ?? 'MISSING'} ms`);
      } catch (error) { failures.push({ block, variant, module, iteration, message: error.message }); }
    }
    memory.push({ block, variant, documentLoads, preGcHeap: await cdp.send('Runtime.getHeapUsage'), preGcDom: await cdp.send('Memory.getDOMCounters') });
    if (documentLoads !== 1) failures.push({ block, variant, type: 'unexpected-document-reload', documentLoads });
    await cdp.detach();
    await context.close();
  }
} finally {
  await browser.close();
  for (const server of servers.values()) await new Promise(resolve => server.httpServer.close(resolve));
  await writeFile(path.join(output, 'samples.json'), JSON.stringify({ samples, failures, memory }, null, 2));
}
const customerSamples = samples.filter(sample => sample.module === 'customers');
if (customerSamples.length) {
  for (const sample of customerSamples) {
    assert.deepEqual(sample.raw.cards, customerSamples[0].raw.cards, 'Navigation must preserve the same customer card financial results');
    assert.equal(sample.raw.customerTotal, customerSamples[0].raw.customerTotal);
  }
}
const stats = values => {
  const measured = values.filter(value => value !== null).sort((a,b) => a-b);
  return { measured: measured.length, missing: values.length - measured.length, median: measured[Math.floor(measured.length / 2)] ?? null,
    p95: measured[Math.ceil(measured.length * .95) - 1] ?? null, max: measured.at(-1) ?? null };
};
const summary = routes.flatMap(([module]) => ['before', 'after'].map(variant => {
  const rows = samples.filter(sample => sample.module === module && sample.variant === variant);
  const response = stats(rows.map(sample => sample.responseToPaintMs));
  const ready = stats(rows.map(sample => sample.domReadyMs));
  return { variant, module, attempts: rows.length, responseToPaint: response, domReady: ready,
    responseGate: response.missing || rows.length !== iterations * 2 ? 'UNVERIFIED' : response.max <= 100 ? 'PASS_MEASURED_SAMPLES_ONLY' : 'FAIL',
    contentGate: ready.missing || rows.length !== iterations * 2 ? 'UNVERIFIED' : ready.max <= 100 ? 'PASS_MEASURED_SAMPLES_ONLY' : 'FAIL' };
}));
await writeFile(path.join(output, 'summary.json'), JSON.stringify({ summary, failures,
  contracts: { response: 'Chromium EventTiming maximum across all pointer/click entries sharing interactionId; rounded by browser',
    ready: 'Expected module DOM committed, no loading marker and aria-busy false; NOT compositor paint or server ACK',
    missing: 'Missing or failed samples never count as zero or PASS', environment: 'Desktop Chrome CPU6, isolated preview, no React profiler; NOT every Android device' } }, null, 2));
console.log(JSON.stringify({ summary, failures }, null, 2));
if (failures.length) process.exitCode = 1;
