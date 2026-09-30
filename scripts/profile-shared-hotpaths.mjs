import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { appFunction } from '../tests/helpers/app-source-function.mjs';
import { buildExecutiveDashboardSnapshot } from '../src/services/executiveDashboardService.js';

const label = process.argv[2] || 'before';
if (!/^[a-z-]+$/.test(label)) throw new Error('Invalid report label');
const rows = Array.from({ length: 6000 }, (_, i) => ({
  id: `o${i}`, companyId: 'fixture', customerId: `c${i % 1200}`,
  date: '2026-09-30', createdAt: `2026-09-${String(i % 28 + 1).padStart(2, '0')}T12:00:00`,
  amount: (i + 1) * 1000, items: [{ productId: `p${i % 40}`, quantity: 2, price: 60000, total: 120000 }],
}));
const optional = await import('../src/utils/collectionIdentity.js').catch(() => ({}));
const formatBindings = { viNumberFormatter: new Intl.NumberFormat('vi-VN') };
const formatCurrency = appFunction('formatCurrency', formatBindings);
const samples = {};
function measure(name, task) {
  task();
  const durations = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now(); task(); durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  samples[name] = { medianMs: +durations[2].toFixed(2), maxMs: +durations[4].toFixed(2) };
}
measure('format6000Amounts', () => rows.forEach(row => formatCurrency(row.amount)));
const searchBindings = {
  shellSearchOpen: false, tabPermissions: { finance: true }, shellCanViewCashflow: true,
  shellCanApproveCashflow: true, employee: { id: 'owner' }, shellSearchCustomers: [],
  expenses: rows, payments: rows.slice(0, 3000),
  getEntityTimestamp: row => Date.parse(row.createdAt),
  resolveEntityDateKey: row => row.date, formatCurrency,
  getPaymentSourceLabel: () => 'Fixture', getPaymentMethodLabel: () => 'Fixture',
};
let formattedSearchRows = 0;
const closedSearch = appFunction('shellSearchTransactions', {
  ...searchBindings, formatCurrency: value => { formattedSearchRows++; return formatCurrency(value); },
}, { memoCallback: true });
measure('prepareClosedSearch', closedSearch);
formattedSearchRows = 0; closedSearch();
samples.closedSearchFormattedRows = formattedSearchRows;

const snapshot = () => buildExecutiveDashboardSnapshot({
  now: '2026-09-30T12:00:00', orders: rows,
  customers: Array.from({ length: 1200 }, (_, i) => ({ id: `c${i}`, name: `Fixture ${i}` })),
});
measure('dashboard6000Orders', snapshot);
const actual = snapshot();
assert.equal(actual.finance.revenueToday, rows.reduce((sum, row) => sum + row.amount, 0));

let state = rows;
let invalidations = 0;
const setCollection = appFunction('setCollectionSafely', {
  hasCollectionValue: (value, object) => object ? Object.keys(value || {}).length > 0 : value?.length > 0,
  runNonBlockingStateUpdate: work => work(), markCollectionLoaded() {},
  getPreviousStableCollectionValue: () => state, rememberStableCollectionValue() {}, ...optional,
});
const incoming = structuredClone(rows);
measure('equalSnapshot6000Rows', () => setCollection('orders', updater => {
  const next = updater(state); if (state !== next) invalidations++;
  state = next;
}, structuredClone(incoming)));
state = rows; invalidations = 0;
for (let i = 0; i < 10; i++) setCollection('orders', updater => {
  const next = updater(state); if (next !== state) invalidations++;
  state = next;
}, structuredClone(rows));
samples.identicalSnapshotInvalidations = invalidations;

await fs.mkdir('test-results', { recursive: true });
const output = `test-results/shared-hotpaths-${label}.json`;
const report = { label, node: process.version,
  scope: 'Actual source helpers with isolated inputs. CPU and state-identity measurements; NOT browser, device, network or database timings.',
  fixtures: { orders: 6000, customers: 1200, searchTransactions: 9000 }, samples };
await fs.writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, ...report }, null, 2));
