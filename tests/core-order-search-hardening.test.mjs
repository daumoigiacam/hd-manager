import test from 'node:test';
import assert from 'node:assert/strict';
import { appFunction } from './helpers/app-source-function.mjs';
import { readFileSync } from 'node:fs';
import { createSearchRecordIndexAsync, getOrderSearchFields, searchOrders } from '../src/services/searchEngine.js';

const orders = Array.from({ length: 1800 }, (_, i) => ({ id: `order-${i}`, customerId: `c${i % 360}`,
  date: '2026-10-02', amount: i * 100, items: [{ description: `Sản phẩm ${i % 600}` }] }));
const customers = new Map(Array.from({ length: 360 }, (_, i) => [`c${i}`, { name: `Khách ${i}`, phone: `090000${i}`, code: `KH${i}` }]));
async function makeSearch(source = orders, lookup = customers) {
  let builds = 0;
  let fieldReads = 0;
  const fields = appFunction('getPreparedOrderSearchFields', {
    customerLookup: lookup, products: [], orderSearchProductLookup: new Map(), getOrderSearchFields,
    buildLineItemProductSearchText: item => { fieldReads++; return item.description; },
  }, { memoCallback: true });
  const index = await createSearchRecordIndexAsync(source, fields, { yieldTask: () => Promise.resolve() });
  builds++;
  return { search: index.search, counts: () => ({ builds, fieldReads }) };
}
test('order search prepares outside render; queries reuse one index without re-normalizing fields', async () => {
  const run = await makeSearch();
  assert.deepEqual(run.search(''), orders);
  assert.deepEqual(run.counts(), { builds: 1, fieldReads: 1800 });
  for (const query of ['Sản', 'Sản phẩm', 'sản phẩm 12', 'Khách 2', '0900', 'KH20', 'HD1799', 'absent']) {
    const expected = searchOrders(orders, query, {
      getItemText: order => order.items.map(item => item.description).join(' '),
      getCustomerText: order => { const c = customers.get(order.customerId); return [c?.name, c?.phone, c?.code]; },
    });
    assert.deepEqual(run.search(query), expected);
  }
  assert.deepEqual(run.counts(), { builds: 1, fieldReads: 1800 });
});
test('new filter/data/customer scope does not return stale or foreign results', async () => {
  const original = await makeSearch();
  original.search('Khách');
  const updated = [{ ...orders[0], customerId: 'other', items: [{ description: 'Changed' }] }];
  const next = await makeSearch(updated, new Map([['other', { name: 'New tenant' }]]));
  assert.deepEqual(next.search('New tenant'), updated);
  assert.deepEqual(next.search('Khách'), []);
  assert.deepEqual(next.counts(), { builds: 1, fieldReads: 1 });
});
test('normalized snapshot memo keeps null filtering and original mapping semantics', () => {
  let calls = 0;
  const snapshots = appFunction('normalizedOrderSnapshots', {
    activeOrders: orders, orderViewModels: { 'order-0': { ...orders[0], amount: 42 } },
    normalizeOrderPaymentSnapshot: row => { calls++; return row.id === 'order-1' ? null : row; },
  }, { memoCallback: true })();
  assert.equal(calls, 1800);
  assert.equal(snapshots.length, 1799);
  assert.equal(snapshots[0].amount, 42);
  assert.strictEqual(snapshots[1], orders[2]);
});
test('delivery scroll requests coalesce and release their timer after firing', () => {
  const timers = new Map();
  let id = 0;
  let scrolls = 0;
  const deliveryFormScrollTimerRef = { current: null };
  const scroll = appFunction('scrollToDeliveryReportForm', {
    window: { setTimeout: callback => { timers.set(++id, callback); return id; }, clearTimeout: key => timers.delete(key) },
    deliveryFormScrollTimerRef,
    deliveryReportFormRef: { current: { scrollIntoView: () => scrolls++ } },
  });
  scroll(); scroll(); scroll();
  assert.equal(timers.size, 1);
  [...timers.values()][0]();
  assert.equal(scrolls, 1);
  assert.equal(deliveryFormScrollTimerRef.current, null);
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /useEffect\(\(\) => \(\) => \{[^]*?window\.clearTimeout\(deliveryFormScrollTimerRef\.current\);\s*\}, \[\]\)/);
});
