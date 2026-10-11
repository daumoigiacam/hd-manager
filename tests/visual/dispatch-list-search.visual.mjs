import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';

const deadline = setTimeout(() => { console.error('Dispatch search timeout'); process.exit(1); }, 180000);
const output = 'test-results/dispatch-list-search';
const outDir = `${output}/preview`;
const now = new Date();
const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const authToken = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify({
  uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin', companyId: 'comp_preview',
  accountType: 'employee', role: 'super_admin', name: 'Qu\u1ea3n tr\u1ecb Demo',
}))}`;
const customers = {
  qa_trang: { id: 'qa_trang', companyId: 'comp_preview', name: 'Trang V\u1ecbt S\u1ed1ng Ch\u01a1n Th\u00e0nh', customerHonorific: 'Ch\u1ecb', phone: '0909123456' },
  qa_exact: { id: 'qa_exact', companyId: 'comp_preview', name: 'Ch\u1ecb Trang' },
  qa_lac: { id: 'qa_lac', companyId: 'comp_preview', name: 'Ch\u1ecb L\u1ea1c' },
};
const products = {
  qa_vit: { id: 'qa_vit', companyId: 'comp_preview', name: 'V\u1ecbt S\u1ed1ng', shortName: 'VS', unit: 'Con', price: 44000 },
  qa_ga: { id: 'qa_ga', companyId: 'comp_preview', name: 'G\u00e0 M\u00f3c', shortName: 'GM', unit: 'Con', price: 50000 },
};
const common = { companyId: 'comp_preview', date, quantityUnit: 'Con', isArchived: false };
const special = [
  { ...common, id: 'qa_lac_row', customerId: 'qa_lac', customerNameSnapshot: 'Ch\u1ecb L\u1ea1c', productId: 'qa_ga', quantity: 26 },
  { ...common, id: 'qa_trang_row', customerId: 'qa_trang', customerNameSnapshot: 'Ch\u1ecb Trang V\u1ecbt S\u1ed1ng Ch\u01a1n Th\u00e0nh',
    productId: 'qa_vit', productNameSnapshot: 'V\u1ecbt S\u1ed1ng', quantity: 5, weightKg: 17,
    assignedDriverId: 'emp_driver_01', assignedDriverNameSnapshot: 'V\u00f5 \u0110\u1ea1i Hi\u1ec7p' },
  { ...common, id: 'qa_exact_row', customerId: 'qa_exact', customerNameSnapshot: 'Ch\u1ecb Trang', productId: 'qa_ga', quantity: 20 },
];
const filler = Array.from({ length: 2000 }, (_, i) => ({ ...common, id: `qa_filler_${i}`, customerId: `qa_customer_${i}`,
  customerNameSnapshot: `Kh\u00e1ch \u0110i\u1ec3m ${i}`, productId: 'qa_ga', productNameSnapshot: 'G\u00e0 M\u00f3c', quantity: 10, weightKg: 30,
}));
const initialStore = { customers, products, warehouseDispatches: Object.fromEntries([...filler, ...special].map(row => [row.id, row])) };
let server;
let browser;
const evidence = [];
await mkdir(output, { recursive: true });
Object.assign(process.env, { VITE_DATA_MODE: 'preview', VITE_ALLOW_PREVIEW_BUILD: 'true' });
try {
  await build({ build: { outDir }, logLevel: 'error' });
  server = await preview({ build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
  const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  for (const width of [390, 1366]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith(url) || route.request().url().startsWith('data:') ? route.continue() : route.abort());
    await page.addInitScript(({ authToken, initialStore }) => {
      window.__initial_auth_token = authToken;
      localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify(initialStore));
    }, { authToken, initialStore });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 3 });
    await page.goto(url, { waitUntil: 'commit', timeout: 30000 });
    await page.locator('[data-hd-shell="enterprise"]').waitFor({ timeout: 30000 });
    await page.getByRole('button', { name: 'Xu\u1ea5t kho', exact: true }).filter({ visible: true }).first().click();
    const search = page.getByRole('searchbox', { name: 'T\u00ecm ki\u1ebfm phi\u1ebfu xu\u1ea5t kho trong ng\u00e0y', exact: true });
    const table = page.locator('#warehouse-dispatch-results');
    await search.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      window.__searchMeasurements = [];
      window.__searchLongTasks = [];
      const observer = new PerformanceObserver(list => {
        window.__searchLongTasks.push(...list.getEntries().map(entry => entry.duration));
      });
      observer.observe({ type: 'longtask' });
      document.addEventListener('input', event => {
        if (event.target.getAttribute('aria-controls') !== 'warehouse-dispatch-results') return;
        const start = performance.now();
        const query = event.target.value;
        let firstPaint;
        const inspect = () => {
          if (event.target.value !== query) return;
          firstPaint ??= performance.now() - start;
          const table = document.getElementById('warehouse-dispatch-results');
          if (table.getAttribute('aria-busy') === 'false') {
            requestAnimationFrame(() => window.__searchMeasurements.push({ query, feedbackMs: firstPaint, resultsMs: performance.now() - start }));
          } else if (performance.now() - start < 10000) requestAnimationFrame(inspect);
        };
        requestAnimationFrame(inspect);
      }, true);
    });
    const query = async value => {
      const count = await page.evaluate(() => window.__searchMeasurements.length);
      await search.fill(value);
      await page.waitForFunction(count => window.__searchMeasurements.length > count, count);
    };
    const customerLabels = () => table.locator('.hd-dispatch-table__cell-button--customer').allTextContents();
    await query('Ch\u1ecb trang');
    assert.deepEqual(await customerLabels(), ['Ch\u1ecb Trang', 'Ch\u1ecb Trang V\u1ecbt S\u1ed1ng Ch\u01a1n Th\u00e0nh']);
    assert.equal(await page.getByRole('dialog').count(), 0);
    await page.screenshot({ path: `${output}/search-${width}.png` });
    for (const value of ['t', 'tr', 'trang', 'chi tr', 'CHI TRANG', 'trang chi', 'chon thanh', 'trang vs', 'trang hiep', '0909123']) {
      await query(value);
      assert.ok((await customerLabels()).includes('Ch\u1ecb Trang V\u1ecbt S\u1ed1ng Ch\u01a1n Th\u00e0nh'), value);
    }
    await query('gm 26');
    const numericLabels = await customerLabels();
    assert.deepEqual(numericLabels.slice(0, 2), ['Kh\u00e1ch \u0110i\u1ec3m 26', 'Ch\u1ecb L\u1ea1c']);
    assert.ok(!numericLabels.some(label => label.includes('1026')));
    await query('notpresent');
    assert.equal((await customerLabels()).length, 0);
    await query('chi trang');
    await search.fill('k');
    await search.fill('trang vs');
    await page.waitForFunction(() => document.querySelector('#warehouse-dispatch-results').getAttribute('aria-busy') === 'false');
    assert.deepEqual(await customerLabels(), ['Ch\u1ecb Trang V\u1ecbt S\u1ed1ng Ch\u01a1n Th\u00e0nh']);
    await page.getByRole('button', { name: 'X\u00f3a t\u00ecm ki\u1ebfm phi\u1ebfu xu\u1ea5t', exact: true }).click();
    assert.equal(await search.inputValue(), '');
    assert.ok((await table.locator('tbody tr').count()) <= 20, 'list remains paginated');
    for (const value of ['t', 'tr', 'chi trang', 'vs', 'hiep', 'gm 26', 'notpresent', 'k', 'trang']) await query(value);
    const measured = await page.evaluate(() => ({ samples: window.__searchMeasurements, longTasks: window.__searchLongTasks }));
    const p95 = key => measured.samples.map(sample => sample[key]).sort((a, b) => a - b)[Math.ceil(measured.samples.length * 0.95) - 1];
    const result = { width, rows: filler.length + special.length, cpuThrottle: 3, uiP95Ms: p95('feedbackMs'), resultsP95Ms: p95('resultsMs'), ...measured };
    evidence.push(result);
    console.log(JSON.stringify(result));
    assert.deepEqual(errors, []);
    assert.ok(result.uiP95Ms <= 100, 'input feedback P95 <= 100ms');
    assert.ok(result.resultsP95Ms <= 100, 'search results P95 <= 100ms');
    assert.deepEqual(result.longTasks, [], 'no >=50ms main-thread task during search');
    await page.close();
  }
  await writeFile(`${output}/evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log('PASS dispatch live search, relevance, clear, stale-query cancellation and input feedback');
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
  clearTimeout(deadline);
}
