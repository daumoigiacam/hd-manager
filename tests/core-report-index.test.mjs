import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { withSalesRevenueIndex, summarizeEmployeeSalesRevenueForMonth as summary } from '../src/utils/salesRevenuePeriod.js';
import { sortOrdersByNewest, compareOrdersByNewest } from '../src/utils/orderRecency.js';
import { buildExecutiveDashboardSnapshot, DashboardService } from '../src/services/executiveDashboardService.js';

const serviceUrl = new URL('../src/services/executiveDashboardService.js', import.meta.url);
const baselineSource = readFileSync(serviceUrl, 'utf8')
  .replaceAll('const totals = getPeriodTotals(entities, amountGetter);', 'const totals = null;')
  .replace(/from '([^']+)'/g, (_, path) => `from '${new URL(path, serviceUrl).href}'`);
const periodBaseline = await import(`data:text/javascript;base64,${Buffer.from(baselineSource).toString('base64')}`);

const customers = Array.from({ length: 600 }, (_, i) => ({ id: `c${i}`, empId: `e${i % 12}` }));
const orders = Array.from({ length: 3000 }, (_, i) => ({ id: `o${i}`, customerId: `c${i % 600}`,
  date: `2026-${String(1 + i % 10).padStart(2, '0')}-${String(1 + i % 28).padStart(2, '0')}`,
  amount: i % 13 === 0 ? '42' : i + 0.125, isArchived: i % 31 === 0,
  ...(i % 7 === 0 ? { salesEmpId: 'explicit' } : {}) }));

test('indexed sales summaries equal original across employee, month and edits', () => {
  const cases = ['explicit', ...Array.from({ length: 12 }, (_, i) => `e${i}`)].flatMap(employeeId =>
    ['2026-01', '2026-10', 'bad'].map(monthKey => ({ employeeId, monthKey, customers, orders })));
  const expected = cases.map(summary);
  const start = performance.now();
  const actual = withSalesRevenueIndex(() => cases.map(summary));
  console.log(`Sales index: ${Math.round(performance.now() - start)} ms, 3000 orders / 39 lookups`);
  assert.deepEqual(actual, expected);
  orders[0].amount = 999;
  orders[0].isArchived = false;
  assert.deepEqual(withSalesRevenueIndex(() => cases.map(summary)), cases.map(summary));
  assert.throws(() => withSalesRevenueIndex(() => { throw Error('abort'); }));
  assert.deepEqual(cases.map(summary), withSalesRevenueIndex(() => cases.map(summary)));
  assert.equal(withSalesRevenueIndex(() => summary({ ...cases[0], orders: [], customers: [] })).revenue, 0);
});

test('decorated order sort preserves exact ordering and original objects', () => {
  const rows = [...orders, { id: 'bad', date: 'invalid' }, { id: 'vn', createdAt: '3/10/2026 12:30' }, { id: 'stamp', createdAt: { seconds: 1791018000 } }];
  const copy = [...rows];
  assert.deepEqual(sortOrdersByNewest(rows), [...rows].sort(compareOrdersByNewest));
  assert.deepEqual(rows, copy);
  rows[0].createdAt = '2030-01-01';
  assert.equal(sortOrdersByNewest(rows)[0], rows[0]);
});

test('period totals match uncached report for large data and repayment exclusions', () => {
  const input = { now: '2026-10-03T12:00:00', orders, customers,
    expenses: orders.map((o, i) => ({ ...o, sourceType: i % 3 ? 'manual' : 'customer_debt_repayment' })) };
  const strip = ({ generatedAt: _generatedAt, ...value }) => value;
  const start = performance.now();
  const reference = DashboardService.build(input);
  const baselineMs = performance.now() - start;
  const optimizedStart = performance.now();
  const optimized = buildExecutiveDashboardSnapshot(input);
  console.log(`Report: uncached ${Math.round(baselineMs)} ms, indexed ${Math.round(performance.now() - optimizedStart)} ms`);
  assert.deepEqual(strip(optimized), strip(reference));
  const measurements = [];
  for (let run = 0; run < 4; run += 1) {
    const before = performance.now();
    const prior = periodBaseline.buildExecutiveDashboardSnapshot(input);
    const middle = performance.now();
    const next = buildExecutiveDashboardSnapshot(input);
    const end = performance.now();
    assert.deepEqual(strip(next), strip(prior));
    measurements.push({ before: Math.round(middle - before), after: Math.round(end - middle) });
  }
  console.log('Period-index-only comparison (same existing date/billing caches):', measurements);
});
