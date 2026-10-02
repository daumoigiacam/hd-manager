import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createCooperativeTaskQueue } from '../src/services/cooperativeTaskQueue.js';
import { hasLoyaltySnapshotChanges } from '../src/utils/loyaltySnapshot.js';
import { createSearchRecordIndex, searchRecords } from '../src/services/searchEngine.js';
import { planForegroundRealtimeActivation } from '../src/services/realtimeListenerPlanner.js';
import { appFunction } from './helpers/app-source-function.mjs';

function harness(options) {
  const callbacks = new Map();
  let next = 0;
  const queue = createCooperativeTaskQueue({ ...options,
    schedule: callback => { callbacks.set(++next, callback); return next; },
    cancel: id => callbacks.delete(id),
  });
  return { queue, callbacks, async tick() {
    const [id, callback] = callbacks.entries().next().value;
    callbacks.delete(id);
    await callback();
  } };
}

test('maintenance deduplicates customers and pauses while dispatch data entry is active', async () => {
  let paused = true;
  const calls = [];
  const h = harness({ run: (id, reason) => calls.push([id, reason]), isPaused: () => paused });
  h.queue.enqueue('customer-a', 'old');
  h.queue.enqueue('customer-a', 'latest');
  h.queue.enqueue('customer-b', 'payment');
  await h.tick();
  assert.deepEqual(calls, []);
  assert.equal(h.queue.size, 2);
  paused = false;
  await h.tick();
  assert.deepEqual(calls, [['customer-a', 'latest']]);
  await h.tick();
  assert.equal(calls.length, 2);
  assert.equal(h.callbacks.size, 0);
});

test('maintenance never launches a second job while the first write is awaiting confirmation', async () => {
  let finish;
  const calls = [];
  const h = harness({ run: id => { calls.push(id); return new Promise(resolve => { finish = resolve; }); } });
  h.queue.enqueue('a', 1);
  const pending = h.tick();
  h.queue.enqueue('b', 2);
  h.queue.enqueue('a', 3);
  assert.deepEqual(calls, ['a']);
  assert.equal(h.callbacks.size, 0);
  finish();
  await pending;
  assert.equal(h.queue.size, 2);
  h.queue.dispose();
  assert.equal(h.callbacks.size, 0);
});

test('tenant logout cancels queued jobs, and errors do not starve later customers', async () => {
  const errors = [];
  const calls = [];
  const h = harness({ run: id => { calls.push(id); if (id === 'bad') throw new Error('network'); }, onError: error => errors.push(error.message) });
  h.queue.enqueue('bad');
  h.queue.enqueue('ok');
  await h.tick();
  await h.tick();
  assert.deepEqual(errors, ['network']);
  assert.deepEqual(calls, ['bad', 'ok']);
  h.queue.enqueue('stale');
  h.queue.dispose();
  h.queue.enqueue('ignored');
  assert.equal(h.queue.size, 0);
  assert.equal(h.callbacks.size, 0);
});

test('unchanged loyalty calculations do not write again just for a timestamp', () => {
  const current = { id: 'points-a', availablePoints: 10, pendingRewardDate: '2026-10-02',
    pendingRewardPoints: 20, eligibleOrderIds: ['order-a'], history: [], updatedAt: 'old' };
  assert.equal(hasLoyaltySnapshotChanges(current, { ...current, updatedAt: 'new', lastSyncedAt: 'new', pendingRewardCheckedAt: 'new', updatedBy: 'another-device' }), false);
  for (const change of [{ availablePoints: 11 }, { pendingRewardPoints: 21 }, { pendingRewardDate: '2026-10-03' }, { eligibleOrderIds: ['order-b'] }, { usedPoints: 2 }, { redeemValuePerPoint: 2000 }]) {
    assert.equal(hasLoyaltySnapshotChanges(current, { ...current, ...change }), true);
  }
  assert.equal(hasLoyaltySnapshotChanges({}, current), true);
});

test('cached picker search preserves exact matching, accents, phone, initials and ranking', () => {
  const records = [
    { id: 'a', labels: ['Anh Tam Dong Xoai', '0978194836', 'atdx'] },
    { id: 'b', labels: ['Tam Binh Duong', '0909000000', 'tbd'] },
    { id: 'c', labels: ['Tam Dong Xoai', '0988000000', 'tdx'] },
  ];
  let builds = 0;
  const fields = row => [{ key: 'primary', priority: 100, values: row.labels }];
  const index = createSearchRecordIndex(records, row => { builds++; return fields(row); });
  for (const query of ['', ' ', 'tam', 'dong tam', '097819', 'atdx', 'tbd', 'xyz', '\u0110\u1ed3ng Xo\u00e0i']) {
    assert.deepEqual(index.search(query), searchRecords(records, query, fields));
  }
  assert.equal(builds, records.length);
  const refreshed = createSearchRecordIndex([{ id: 'new', labels: ['New customer'] }], fields);
  assert.equal(refreshed.search('new')[0].id, 'new');
});

test('warehouse workspace closes unrelated warm listeners but keeps dispatch sources and baseline intact', () => {
  const plan = planForegroundRealtimeActivation({ requestedNames: ['customers', 'products', 'orderRequests', 'warehouseDispatches', 'employees'],
    activeNames: ['orders', 'payments', 'expenses', 'customer_points', 'customers'],
    baselineNames: ['employees', 'companies', 'notifications'], limit: 12, retainRecent: false });
  assert.deepEqual(plan.liveNames, ['customers', 'products', 'orderRequests', 'warehouseDispatches']);
  assert.deepEqual(plan.evictedNames, ['orders', 'payments', 'expenses', 'customer_points']);
  assert.deepEqual(plan.overflowNames, []);
});

test('application wires latest callback, complete input guard and warehouse maintenance pause', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /loyaltySyncCallbackRef\.current = syncCustomerLoyaltyPoints/);
  assert.match(source, /if \(!loyaltyMaintenanceDataReady \|\| activeTab === 'warehouse_dispatch'\) return/);
  assert.match(source, /loyaltyActivityRef\.current\.tab === 'warehouse_dispatch'/);
  assert.match(source, /loyaltyMaintenanceRef\.current\?\.enqueue\(customerId, 'eligibility_sync'\)/);
  assert.match(source, /retainRecent: activeTab !== 'warehouse_dispatch'/);
  const backupEffect = source.slice(source.indexOf('if (autoBackupInFlightRef.current.has(stateKey))'),
    source.indexOf('const buildPaymentConfirmationMessage'));
  assert.match(source, /if \(activeTab === 'warehouse_dispatch'\) return undefined;\s*const dateKey = getTodayString\(\)/);
  assert.match(backupEffect, /const backupQueue = createCooperativeTaskQueue/);
  assert.match(backupEffect, /backupQueue\.enqueue\(stateKey\)/);
  assert.match(backupEffect, /backupQueue\.dispose\(\)/);
  assert.match(backupEffect, /\[firebaseUser, myCompanyId, currentCompany, activeTab\]/);
  assert.match(backupEffect, /document\.activeElement\?\.matches/);
});

function shortageHarness(cache = new WeakMap()) {
  const normalizeLookupText = appFunction('normalizeLookupText');
  const parseLooseQuantityValue = value => Number(value) || 0;
  const normalizeWarehouseMeasureUnit = unit => unit;
  const bindings = { normalizeLookupText, parseLooseQuantityValue, normalizeWarehouseMeasureUnit };
  return { cache, calculate: appFunction('buildWarehouseDispatchShortageSummary', {
    ...bindings,
    warehouseShortageLabelCaches: cache,
    getTodayString: () => '2026-10-02',
    getDaysBetweenDateKeys: (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000,
    resolveEntityDateKey: record => record.date,
    getEntityTimestamp: record => Date.parse(record.createdAt) || 0,
    getProductShortName: product => product?.shortName || '',
    parseLooseMoneyValue: parseLooseQuantityValue,
    addWarehouseShortageQuantity: appFunction('addWarehouseShortageQuantity', bindings),
    getWarehouseShortageQuantityValue: appFunction('getWarehouseShortageQuantityValue', bindings),
    isKgQuantityUnit: unit => normalizeLookupText(unit) === 'kg',
    buildWarehouseDispatchMeasureEntries: dispatch => [{ unit: 'Kg', quantity: dispatch.weightKg }],
    formatWarehouseShortageQuantityLabel: values => JSON.stringify(values),
  }) };
}

test('warm shortage label cache never retains a quantity or dispatch status', () => {
  const h = shortageHarness();
  const customers = [{ id: 'customer-a', name: 'Customer A' }];
  const products = [{ id: 'product-a', name: 'Product A', unit: 'Kg' }];
  const request = { id: 'request-a', customerId: 'customer-a', date: '2026-10-02',
    createdAt: '2026-10-02T08:00:00Z', items: [{ productId: 'product-a', quantity: 10, quantityUnit: 'Kg' }] };
  const dispatch = { id: 'dispatch-a', customerId: 'customer-a', productId: 'product-a',
    date: '2026-10-02', createdAt: '2026-10-02T09:00:00Z', weightKg: 10 };
  const base = { customers, products, orderRequests: [request], dateKey: '2026-10-02' };
  assert.equal(h.calculate(base).missingLines.length, 1);
  assert.equal(h.calculate({ ...base, warehouseDispatches: [dispatch] }).coveredLines, 1);
  assert.equal(h.calculate({ ...base, warehouseDispatches: [{ ...dispatch, isArchived: true }] }).coveredLines, 0);
  const changedRequest = { ...request, items: [{ ...request.items[0], quantity: 25 }] };
  const revised = h.calculate({ ...base, orderRequests: [changedRequest] });
  assert.equal(revised.missingLines[0].remainingKg, 25);
  const closed = { ...request, items: [{ ...request.items[0], status: 'closed_short' }] };
  assert.equal(h.calculate({ ...base, orderRequests: [closed] }).totalRequiredLines, 0);
  const renamed = { ...base, customers: [{ ...customers[0], name: 'Renamed A' }] };
  assert.deepEqual(h.calculate(renamed), shortageHarness().calculate(renamed));
  const replacedProducts = { ...base, products: [{ ...products[0], name: 'Renamed product' }] };
  assert.deepEqual(h.calculate(replacedProducts), shortageHarness().calculate(replacedProducts));
});

test('shortage label caches remain bounded with thousands of distinct historical aliases', () => {
  const h = shortageHarness();
  const customers = [{ id: 'customer-a', name: 'Customer A' }];
  const products = [];
  const items = Array.from({ length: 4500 }, (_, index) => ({ productId: `p-${index}`,
    description: `Historical product ${index}`, quantity: 1, quantityUnit: 'Kg' }));
  const result = h.calculate({ customers, products, orderRequests: [{ id: 'request-a',
    customerId: 'customer-a', date: '2026-10-02', items }], dateKey: '2026-10-02' });
  assert.equal(result.totalRequiredLines, 4500, 'cache bounds must not remove request lines');
  assert.ok(h.cache.get(customers).normalized.size <= 4096);
  assert.ok(h.cache.get(customers).variants.size <= 4096);
});
