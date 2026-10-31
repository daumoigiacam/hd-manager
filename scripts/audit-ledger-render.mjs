import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';
import { extractBrowserInteraction } from './helpers/browser-interaction-timing.mjs';

// Controlled ablation: both artifacts use the SAME compiler, fixture and runtime.
// BEFORE reverses only the shared-ledger change, not an invented slow baseline.
const directory = path.resolve('test-results/ledger-render-final-20261031');
await mkdir(directory, { recursive: true });
Object.assign(process.env, { VITE_DATA_MODE: 'preview', VITE_ALLOW_PREVIEW_BUILD: 'true',
  VITE_PERFORMANCE_PROFILE: 'false', VITE_PERFORMANCE_MONITOR: 'false' });
const source = await readFile('src/App.jsx', 'utf8');
const shell = (await readFile('src/layout/AppShell.jsx', 'utf8')).replaceAll('\r\n', '\n');
const shellReversals = [
  ["if (event.currentTarget.dataset.hdInputFocusMode !== 'pointer') {\n          event.currentTarget.dataset.hdInputFocusMode = 'pointer';\n        }", "event.currentTarget.dataset.hdInputFocusMode = 'pointer';"],
  ["if (event.key === 'Tab' && event.currentTarget.dataset.hdInputFocusMode !== 'keyboard') {\n          event.currentTarget.dataset.hdInputFocusMode = 'keyboard';\n        }", "if (event.key === 'Tab') event.currentTarget.dataset.hdInputFocusMode = 'keyboard';"],
];
let previousShell = shell;
for (const [needle, replacement] of shellReversals) {
  assert.equal(previousShell.split(needle).length, 2);
  previousShell = previousShell.replace(needle, replacement);
}
const reversals = [
  ['const ReconciledLedgerContext = React.createContext(null);', ''],
  ['[customers, orders, payments, warehouseImports, expenses, notificationDateKey]', '[customers, orders, payments, warehouseImports, expenses]'],
  ['<ReconciledLedgerContext.Provider value={reconciledLedgerMap}>\n                {renderContent()}\n              </ReconciledLedgerContext.Provider>', '{renderContent()}'],
  ['  const sharedCustomerLedgerMap = React.useContext(ReconciledLedgerContext);\n', ''],
  ['sharedCustomerLedgerMap || buildCustomerReconciledLedgerMap', 'buildCustomerReconciledLedgerMap'],
  ['[sharedCustomerLedgerMap, activeCustomers, orders, payments, safeCustomerWarehouseImports, expenses]', '[activeCustomers, orders, payments, safeCustomerWarehouseImports, expenses]'],
  ['  const sharedDebtLedgerMap = React.useContext(ReconciledLedgerContext);\n', ''],
  ['sharedDebtLedgerMap || buildCustomerReconciledLedgerMap', 'buildCustomerReconciledLedgerMap'],
  ['[sharedDebtLedgerMap, customers, orders, payments, safeDebtWarehouseImports, expenses]', '[customers, orders, payments, safeDebtWarehouseImports, expenses]'],
];
let previous = source.replaceAll('\r\n', '\n');
for (const [needle, replacement] of reversals) {
  assert.equal(previous.split(needle).length, 2, `Ablation must match exactly once: ${needle}`);
  previous = previous.replace(needle, replacement);
}
const draftReversals = [
  ["  const [customerImportManagerId, setCustomerImportManagerId] = useState(() => (\n    isEmployeeSalesPosition(employee) ? employee?.id || '' : (employees || []).find(isEmployeeSalesPosition)?.id || ''\n  ));", "  const [customerImportManagerId, setCustomerImportManagerId] = useState('');"],
  ['      // The list has no editor to reset on mount or a background snapshot.\n      // Reset once when leaving a previously selected customer, not every time.\n      if (selectedCustomerDraftSourceIdRef.current === null) return;\n', ''],
  ['      setNewCustomerProductIds(current => current.length === 0 ? current : []);', '      setNewCustomerProductIds([]);'],
  ['    if (!showAddCustomer) return usageByProductId;\n', ''],
  ['  }, [orders, showAddCustomer]);', '  }, [orders]);'],
  ['  const newCustomerProductOptions = useMemo(() => {\n    if (!showAddCustomer) return [];', '  const newCustomerProductOptions = useMemo(() => {'],
  ['[showAddCustomer, activeProductsForPricing, newCustomerProductSearch, newCustomerProductUsageById, selectedNewCustomerProductIdSet]', '[activeProductsForPricing, newCustomerProductSearch, newCustomerProductUsageById, selectedNewCustomerProductIdSet]'],
];
let sharedOnly = source.replaceAll('\r\n', '\n');
for (const [needle, replacement] of draftReversals) {
  assert.equal(previous.split(needle).length, 2, `Draft ablation must match once: ${needle}`);
  previous = previous.replace(needle, replacement);
  sharedOnly = sharedOnly.replace(needle, replacement);
}
const pager = await readFile('src/services/renderOptimization.js', 'utf8');
assert.equal(pager.split('? 10 : 50').length, 2);
const previousPager = pager.replace('? 10 : 50', '? 20 : 50');
const sha = data => createHash('sha256').update(data).digest('hex');
await writeFile(path.join(directory, 'source-manifest.json'), JSON.stringify({
  candidateAppSha256: sha(source.replaceAll('\r\n', '\n')), baselineAppSha256: sha(previous),
  candidateShellSha256: sha(shell), baselineShellSha256: sha(previousShell),
  candidatePagerSha256: sha(pager), baselinePagerSha256: sha(previousPager), sharedAppSha256: sha(sharedOnly),
  variants: { before: 'Original ledger/draft/shell work, 20 cards', shared: 'Shared ledger only, original draft/shell work, 20 cards', after: 'Shared ledger, avoid hidden draft/reset work and no-op shell writes, 10 cards' },
  reversals, draftReversals, shellReversals, compilerTarget: ['chrome83', 'es2020'], React: 'production, no profiling',
  scope: 'Preview only; browser EventTiming is not physical Android or Firebase latency',
}, null, 2));
for (const variant of ['before', 'shared', 'after']) {
  await build({ build: { outDir: path.join(directory, variant), sourcemap: false }, logLevel: 'error',
    plugins: variant !== 'after' ? [{ name: 'controlled-ledger-ablation', enforce: 'pre',
      transform(code, id) {
        if (variant === 'before' && id.replaceAll('\\', '/').endsWith('/src/App.jsx')) return previous;
        if (variant === 'shared' && id.replaceAll('\\', '/').endsWith('/src/App.jsx')) return sharedOnly;
        if (id.replaceAll('\\', '/').endsWith('/src/layout/AppShell.jsx')) return previousShell;
        if (id.replaceAll('\\', '/').endsWith('/src/services/renderOptimization.js')) return previousPager;
      },
    }] : [] });
}
const date = '2026-10-31';
const rows = (n, prefix, make) => Object.fromEntries(Array.from({ length: n }, (_, i) => {
  const id = `${prefix}_${i}`; return [id, { id, companyId: 'comp_preview', ...make(i) }];
}));
const fixture = {
  products: rows(600, 'p_perf', i => ({ name: `Sản phẩm ${String(i).padStart(4, '0')}`, category: 'Hàng thử', unit: 'kg', purchaseUnit: 'kg', stockUnit: 'kg', costPrice: 30000, price: 50000, sellingPrice: 50000, stock: 50, isArchived: false })),
  customers: rows(360, 'c_perf', i => ({ name: `Khách hàng ${i}`, empId: 'emp_sales_01', phone: `0900${String(i).padStart(6, '0')}`, isArchived: false })),
  orders: rows(1800, 'o_perf', i => ({ customerId: `c_perf_${i % 360}`, empId: 'emp_sales_01', date, amount: 250000, total: 250000, totalAmount: 250000, items: [{ productId: `p_perf_${i % 600}`, quantity: 5, billingQuantity: 5, unitPrice: 50000, amount: 250000 }] })),
  payments: rows(900, 'pay_perf', i => ({ customerId: `c_perf_${i % 360}`, date, amount: 50000 })),
};
const claims = { uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin', companyId: 'comp_preview', accountType: 'employee', role: 'super_admin', name: 'Quản trị Demo', phone: '0909000001' };
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const samples = [], errors = [], memory = [];
const routes = [['customers', 'Khách hàng', '[data-customer-card]'], ['debt', 'Sổ nợ', 'main[data-hd-module="debt"] button'], ['products', 'Kho sản phẩm', '.hd-product-list [role="listitem"]']];
const servers = new Map();
try {
  for (const variant of ['before', 'shared', 'after']) servers.set(variant, await preview({ build: { outDir: path.join(directory, variant) }, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' }));
  // ABBA order limits drift. Every measured action is retained, including cold ones.
  for (const [block, variant] of ['before', 'shared', 'after', 'after', 'shared', 'before'].entries()) {
    const server = servers.get(variant);
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(({ fixture, claims }) => {
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
      window.__initial_auth_token = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
      localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify(fixture));
      window.__browserEvents = [];
      window.__lastTrustedClick = null;
      addEventListener('click', event => { if (event.isTrusted) window.__lastTrustedClick = performance.now(); }, true);
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) window.__browserEvents.push({
          name: entry.name, startTime: entry.startTime, duration: entry.duration,
          processingStart: entry.processingStart, processingEnd: entry.processingEnd, interactionId: entry.interactionId,
        });
      }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
    }, { fixture, claims });
    const page = await context.newPage();
    let documentLoads = 0;
    page.on('domcontentloaded', () => { documentLoads++; });
    page.on('pageerror', error => errors.push({ block, variant, message: error.message }));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await page.goto(`${origin}/?perfMonitor=0`, { waitUntil: 'domcontentloaded' });
    await page.locator('main[data-hd-module="home"]').waitFor({ timeout: 30000 });
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('hd-low-power-ui')), true);
    for (const [module, label] of routes) {
      for (let iteration = 0; iteration < 5; iteration++) {
        await page.locator('[data-hd-navigation="bottom"]').getByRole('button', { name: 'Thêm', exact: true }).click();
        await page.locator('main[data-hd-module="more"]').waitFor();
        // Ensure the preceding screen has had a paint opportunity before the
        // next action; this does not subtract anything from EventTiming.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.evaluate(() => { window.__browserEvents = []; window.__lastTrustedClick = null; });
        await page.locator('main').getByRole('button', { name: label, exact: true }).click();
        await page.locator(`main[data-hd-module="${module}"]:not(:has([data-hd-module-loading]))`).waitFor();
        if (module === 'customers') await page.locator('[data-customer-card]').first().waitFor();
        if (module === 'products') await page.locator('.hd-product-list').waitFor();
        // Flush browser timing delivery AFTER readiness. This wait is NOT reported as latency.
        await page.waitForTimeout(180);
        const timing = await page.evaluate(() => ({
          click: window.__lastTrustedClick, events: window.__browserEvents,
          nodes: document.querySelectorAll('*').length, cards: document.querySelectorAll('[data-customer-card]').length,
          customerTotal: document.querySelector('nav[aria-label="Phân trang khách hàng"] span')?.textContent.split('/').at(-1).trim(),
          customerSnapshot: [...document.querySelectorAll('[data-customer-card]')].map(card => ({
            name: card.querySelector('.hd-customer-card__name')?.textContent.trim(),
            stats: card.querySelector('.hd-customer-card__stats-row')?.textContent.replace(/\s+/g, ' ').trim(),
          })),
        }));
        const measured = extractBrowserInteraction(timing.events, timing.click);
        const duration = measured.durationMs;
        samples.push({ block, variant, module, iteration, browserInteractionDurationMs: duration, events: measured.events, nodes: timing.nodes, cards: timing.cards,
          customerSnapshot: timing.customerSnapshot,
          customerTotal: timing.customerTotal,
          status: measured.status,
          contract: 'Max EventTiming duration across pointer/click entries sharing interactionId, rounded by Chromium; missing entries never count as zero or PASS' });
        console.log(`${variant} ${module} #${iteration}: ${duration ?? 'MISSING'} ms`);
      }
    }
    memory.push({ block, variant, documentLoads, scope: 'JS heap and DOM counters sampled after 15 openings; not native process/GPU peak memory',
      heap: await cdp.send('Runtime.getHeapUsage'), dom: await cdp.send('Memory.getDOMCounters') });
    assert.equal(documentLoads, 1, 'An unexpected document reload invalidates this block');
    await cdp.detach();
    await context.close();
  }
} finally {
  await browser.close();
  for (const server of servers.values()) await new Promise(resolve => server.httpServer.close(resolve));
  await writeFile(path.join(directory, 'samples-eventtiming-v2.json'), JSON.stringify({ samples, errors, memory }, null, 2));
}
assert.deepEqual(errors, []);
const customerSnapshots = samples.filter(sample => sample.module === 'customers').map(sample => sample.customerSnapshot);
assert.ok(customerSnapshots[0]?.length > 0, 'Financial parity needs real customer cards');
for (const snapshot of customerSnapshots) assert.deepEqual(snapshot.slice(0, 10), customerSnapshots[0].slice(0, 10), 'Shared ledger must preserve customer financial results on the common first ten cards');
const customerTotals = samples.filter(sample => sample.module === 'customers').map(sample => sample.customerTotal);
assert.ok(customerTotals[0]);
assert.ok(customerTotals.every(total => total === customerTotals[0]), 'Pagination must not change the total customer count');
const summary = [];
for (const [module] of routes) for (const variant of ['before', 'shared', 'after']) {
  const all = samples.filter(sample => sample.module === module && sample.variant === variant);
  const values = all.map(sample => sample.browserInteractionDurationMs).filter(value => value !== null).sort((a,b) => a-b);
  const p95 = values[Math.ceil(values.length * .95) - 1] ?? null;
  summary.push({ module, variant, attempts: all.length, measured: values.length, missing: all.length - values.length,
    medianMs: values[Math.floor(values.length / 2)] ?? null, p95Ms: p95, maxMs: values.at(-1) ?? null,
    gate: values.length !== all.length ? 'UNVERIFIED_MISSING_SAMPLES' : values.at(-1) <= 100 ? 'PASS_MEASURED_SAMPLES_ONLY' : 'FAIL' });
}
await writeFile(path.join(directory, 'summary-eventtiming-v2.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
