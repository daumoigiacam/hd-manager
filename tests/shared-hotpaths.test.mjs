import assert from 'node:assert/strict';
import test from 'node:test';
import { Timestamp, GeoPoint } from 'firebase/firestore';
import { retainCollectionIdentity, retainCollectionRecordIdentity } from '../src/utils/collectionIdentity.js';
import { appFunction } from './helpers/app-source-function.mjs';
import { createSaveQueueHarness } from './helpers/save-queue-harness.mjs';
import { DashboardService, buildExecutiveDashboardSnapshot } from '../src/services/executiveDashboardService.js';

test('snapshots preserve references only when every field and row order agrees', () => {
  const previous = [{ id: 'a', companyId: 'one', items: [{ price: 60 }], pending: true }, { id: 'b' }];
  assert.equal(retainCollectionIdentity(previous, structuredClone(previous)), previous);
  const changed = structuredClone(previous); changed[0].items[0].price = 63;
  const result = retainCollectionIdentity(previous, changed);
  assert.notEqual(result, previous);
  assert.equal(result[1], previous[1]);
  assert.equal(result[0].items[0].price, 63);
  assert.equal(previous[0].items[0].price, 60);
  for (const mutate of [
    rows => delete rows[0].pending, rows => rows.reverse(), rows => rows.pop(),
    rows => { rows[0].companyId = 'two'; }, rows => { rows[0].items = []; },
    rows => { rows[0].optional = undefined; },
  ]) {
    const incoming = structuredClone(previous); mutate(incoming);
    assert.deepEqual(retainCollectionIdentity(previous, incoming), incoming);
    assert.notEqual(retainCollectionIdentity(previous, incoming), previous);
  }
  const attendance = { '2026-09-30_e': { id: 'e', status: 'present', checkOut: null } };
  assert.equal(retainCollectionIdentity(attendance, structuredClone(attendance)), attendance);
  assert.notEqual(retainCollectionIdentity(attendance, {}), attendance);
});

test('special SDK values, prototype changes and missing fields cannot mask an update', () => {
  for (const [before, after] of [
    [new Timestamp(1, 2), new Timestamp(1, 3)], [new GeoPoint(10, 20), new GeoPoint(11, 20)],
    [new Date(1), new Date(2)], [new Map([['x', 1]]), new Map([['x', 2]])],
    [{ x: undefined }, {}], [{}, { x: undefined }], [null, {}], [[], {}],
  ]) assert.equal(retainCollectionIdentity(before, after), after);
  const incoming = JSON.parse('{"__proto__":{"flag":true}}');
  const old = JSON.parse('{"__proto__":{"flag":true}}');
  assert.equal(retainCollectionIdentity(old, incoming), old);
  const patched = retainCollectionIdentity({ ...old, status: 'pending' }, { ...incoming, status: 'confirmed' });
  assert.equal(Object.getPrototypeOf(patched), Object.prototype);
  assert.equal(patched.status, 'confirmed');
  assert.equal(Object.hasOwn(patched, '__proto__'), true);
  assert.equal({}.flag, undefined);
  const before = Object.assign(Object.create(null), { nested: { price: 60 }, status: 'pending' });
  const after = Object.assign(Object.create(null), { nested: { price: 60 }, status: 'confirmed' });
  const retained = retainCollectionIdentity(before, after);
  assert.equal(Object.getPrototypeOf(retained), null);
  assert.equal(retained.nested, before.nested);
  assert.equal(retained.status, 'confirmed');
});

test('durable save writes queue once, verifies storage and preserves the latest revision', () => {
  const harness = createSaveQueueHarness();
  const save = (price, durable = true) => harness.enqueue({ collectionName: 'products', documentId: 'p', payload: { price }, durable });
  save(60);
  assert.equal(harness.stats.writes, 1);
  assert.equal(harness.stats.reads, 1);
  save(63);
  assert.equal(harness.stats.writes, 2);
  assert.equal(harness.queue.current.length, 1);
  assert.equal(JSON.parse(harness.stored.get('pending:fixture'))[0].payload.price, 63);
  const previous = harness.queue.current;
  harness.fault.full = true;
  assert.throws(() => save(70), /QuotaExceeded/);
  assert.equal(harness.queue.current, previous);
  harness.fault.full = false;
  harness.fault.corrupt = true;
  assert.throws(() => save(70), /Không thể lưu tạm/);
  assert.equal(harness.queue.current, previous);
  harness.fault.corrupt = false;
  save(72, false);
  assert.equal(harness.stats.writes, 4);
  assert.equal(JSON.parse(harness.stored.get('pending:fixture'))[0].payload.price, 72);
});

test('actual snapshot setter skips no-op replacement but applies price and confirmation changes', () => {
  let state = [{ id: 'o', price: 60, __pendingFirebaseSync: true }];
  let loaded = 0;
  const setter = updater => { state = updater(state); };
  const apply = appFunction('setCollectionSafely', {
    retainCollectionRecordIdentity, runNonBlockingStateUpdate: callback => callback(),
    hasCollectionValue: value => value?.length > 0,
    getPreviousStableCollectionValue: () => state, rememberStableCollectionValue() {},
    markCollectionLoaded() { loaded++; },
  });
  const initial = state;
  apply('orders', setter, structuredClone(state));
  assert.equal(state, initial);
  apply('orders', setter, [{ id: 'o', price: 63 }]);
  assert.equal(state[0].price, 63);
  assert.equal(Object.hasOwn(state[0], '__pendingFirebaseSync'), false);
  assert.equal(loaded, 2);
  apply('orders', setter, []);
  assert.deepEqual(state, []);
});


test('shared money/quantity formatters retain existing edge-case output', () => {
  const bindings = { viNumberFormatter: new Intl.NumberFormat('vi-VN') };
  const currency = appFunction('formatCurrency', bindings);
  const quantity = appFunction('formatNumber', bindings);
  const input = appFunction('formatInputCurrency', bindings);
  for (const value of [undefined, null, NaN, 0, -0, -100.7, 1234567.891, '63', '', Infinity]) {
    const expectedCurrency = value == null || isNaN(value) ? '0' : new Intl.NumberFormat('vi-VN').format(Math.round(Number(value) || 0));
    const expectedQuantity = value == null || Number.isNaN(value) ? '0' : new Intl.NumberFormat('vi-VN').format(value);
    assert.equal(currency(value), expectedCurrency);
    assert.equal(quantity(value), expectedQuantity);
  }
  assert.equal(input('1.234.567'), '1.234.567');
  assert.equal(input(''), '');
});

test('per-build report cache matches uncached calculation and never retains edited prices', () => {
  const withoutBuildTime = ({ generatedAt, ...snapshot }) => { assert.ok(generatedAt); return snapshot; };
  const compare = value => assert.deepEqual(withoutBuildTime(buildExecutiveDashboardSnapshot(value)), withoutBuildTime(DashboardService.build(value)));
  const input = { now: '2026-09-30T12:00:00', company: { id: 'a' },
    customers: [{ id: 'c', name: 'Fixture' }],
    orders: ['2026-09-30', '30/9/2026 12:00', '2026-09-29T18:00:00Z', 'invalid'].map((date, i) => ({
      id: `o${i}`, customerId: 'c', date,
      items: [{ productId: 'p', quantity: 2, unit: 'Kg', billingUnit: 'Kg', billingSnapshotVersion: 1, billingQuantity: 2, unitPrice: 60, amount: 120 }],
    })),
    expenses: [{ date: '2026-09-30', amount: 5 }],
    payrollCosts: [{ date: '2026-09-30', amount: 10 }],
  };
  compare(input);
  const before = buildExecutiveDashboardSnapshot(input).finance.revenueToday;
  input.orders[0].items[0].unitPrice = 63;
  input.orders[0].items[0].amount = 126;
  compare(input);
  assert.equal(buildExecutiveDashboardSnapshot(input).finance.revenueToday, before + 6);
  compare({ now: input.now, company: { id: 'b' } });
});

test('hidden executive dashboard stays mounted but ignores background data churn', () => {
  const compare = appFunction('areExecutiveDashboardPropsEqual');
  const visible = { isActive: true, orders: [{ id: 'o1' }], company: { id: 'c1' } };
  const hidden = { ...visible, isActive: false };
  assert.equal(compare(visible, hidden), true, 'hiding must not render the report');
  assert.equal(compare(hidden, { ...hidden, orders: [{ id: 'o2' }] }), true, 'hidden data updates must not render the dashboard');
  assert.equal(compare(hidden, visible), true, 'unchanged data does not rebuild on return');
  assert.equal(compare(visible, { ...visible, orders: [{ id: 'o2' }] }), false, 'changed data must refresh on return');
  assert.equal(compare(visible, { ...visible, company: { id: 'c2' } }), false, 'company changes must refresh');
  assert.equal(compare(visible, { ...visible, onOpenGlobalSearch: () => {} }), false, 'callback changes must refresh');
  assert.equal(compare(visible, visible), true, 'stable visible props remain memoized');
});
