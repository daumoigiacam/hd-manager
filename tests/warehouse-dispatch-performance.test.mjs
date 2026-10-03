import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { parse } from '@babel/parser';
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
  assert.match(source, /retainRecent: activeTabForSyncRef\.current !== 'warehouse_dispatch'/);
  const backupEffect = source.slice(source.indexOf('if (autoBackupInFlightRef.current.has(stateKey))'),
    source.indexOf('const buildPaymentConfirmationMessage'));
  assert.match(source, /if \(activeTab === 'warehouse_dispatch'\) return undefined;\s*const dateKey = getTodayString\(\)/);
  assert.match(backupEffect, /const backupQueue = createCooperativeTaskQueue/);
  assert.match(backupEffect, /backupQueue\.enqueue\(stateKey\)/);
  assert.match(backupEffect, /backupQueue\.dispose\(\)/);
  assert.match(backupEffect, /\[firebaseUser, myCompanyId, currentCompany, activeTab\]/);
  assert.match(backupEffect, /document\.activeElement\?\.matches/);
});

// The reference is pinned independently of the working App and its local cache.
function frozenShortageFunctions() {
  const revision = '5f162f5ce85fd4dc746382f13a6a4170e4a29775';
  const source = execFileSync('git', ['show', `${revision}:src/App.jsx`], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  const names = new Set(['normalizeLookupText', 'addWarehouseShortageQuantity',
    'getWarehouseShortageQuantityValue', 'buildWarehouseDispatchShortageSummary']);
  const expressions = new Map();
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && names.has(node.id?.name)) {
      assert.ok(!expressions.has(node.id.name), `unambiguous Git reference ${node.id.name}`);
      expressions.set(node.id.name, source.slice(node.init.start, node.init.end));
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'extra', 'comments'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(walk);
      else if (value?.type) walk(value);
    }
  }
  walk(parse(source, { sourceType: 'module', plugins: ['jsx'] }));
  return (name, bindings = {}) => {
    assert.ok(expressions.has(name), `Git reference function ${name}`);
    return vm.runInNewContext(`(${expressions.get(name)})`, bindings);
  };
}

function shortageHarness(factory = appFunction, extraBindings = {}) {
  const lookupBindings = factory === appFunction
    ? Object.fromEntries(['LOOKUP_NORMALIZATION_CACHE_LIMIT', 'LOOKUP_NORMALIZATION_MAX_LENGTH', 'lookupNormalizationCache']
      .map(name => [name, appFunction(name)])) : {};
  const normalizeLookupText = factory('normalizeLookupText', lookupBindings);
  const parseLooseQuantityValue = value => Number(value) || 0;
  const normalizeWarehouseMeasureUnit = unit => unit;
  const bindings = { normalizeLookupText, parseLooseQuantityValue, normalizeWarehouseMeasureUnit };
  return { calculate: factory('buildWarehouseDispatchShortageSummary', {
    ...bindings,
    ...extraBindings,
    getTodayString: () => '2026-10-02',
    getDaysBetweenDateKeys: (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000,
    resolveEntityDateKey: record => record.date,
    getEntityTimestamp: record => Date.parse(record.createdAt) || 0,
    getProductShortName: product => product?.shortName || '',
    parseLooseMoneyValue: parseLooseQuantityValue,
    addWarehouseShortageQuantity: factory('addWarehouseShortageQuantity', bindings),
    getWarehouseShortageQuantityValue: factory('getWarehouseShortageQuantityValue', bindings),
    isKgQuantityUnit: unit => normalizeLookupText(unit) === 'kg',
    buildWarehouseDispatchMeasureEntries: dispatch => [{ unit: 'Kg', quantity: dispatch.weightKg }],
    formatWarehouseShortageQuantityLabel: values => JSON.stringify(values),
  }) };
}

test('immutable dispatch index survives request edits and invalidates on source/date/context changes', () => {
  const h = shortageHarness();
  let reads = 0;
  const dispatch = { id: 'd', customerId: 'c', productId: 'p', date: '2026-10-02',
    get isArchived() { reads++; return false; } };
  const options = { customers: [{ id: 'c', name: 'C' }], products: [{ id: 'p', name: 'P' }],
    warehouseDispatches: [dispatch], orderRequests: [{ id: 'r', customerId: 'c', date: '2026-10-02',
      items: [{ productId: 'p', quantity: 2 }] }], statusesOnly: true, dispatchIndexCache: { current: null } };
  const calculate = () => h.calculate(options);
  calculate();
  assert.equal(reads, 1);
  options.orderRequests = options.orderRequests.map(row => ({ ...row, note: 'edited' }));
  const cached = calculate();
  assert.equal(reads, 1, 'no dispatch traversal for request-only changes');
  assert.deepEqual(cached, h.calculate({ ...options, dispatchIndexCache: null }));
  for (const patch of [{ products: [...options.products] }, { customers: [...options.customers] },
    { warehouseDispatches: [...options.warehouseDispatches] }, { dateKey: '2026-10-03' }]) {
    Object.assign(options, patch);
    const before = reads;
    assert.deepEqual(calculate(), h.calculate({ ...options, dispatchIndexCache: null }));
    assert.ok(reads > before);
  }
});

test('cached request projections match independent source after edits, aliases, removals and mode changes', () => {
  const actual = shortageHarness();
  const oracle = shortageHarness(frozenShortageFunctions());
  const options = { customers: [{ id: 'c', name: 'Customer' }], products: [],
    dateKey: '2026-10-02', dispatchDateKey: '2026-10-02', includePreviousOpenOrders: true,
    warehouseDispatches: [{ id: 'd', customerId: 'c', productId: 'p', date: '2026-10-02', productNameSnapshot: 'Alias' }],
    orderRequests: Array.from({ length: 120 }, (_, i) => ({ id: `r${i}`, customerId: 'c', date: '2026-10-02',
      items: [{ productId: 'p', productName: i % 2 ? 'Alias' : 'Other', quantity: i + 1, quantityUnit: 'Kg' },
        { productId: 'p', productName: 'Alias', quantity: 0.1, quantityUnit: 'Kg' }] })),
    dispatchIndexCache: { current: null } };
  for (const mode of ['statusesOnly', 'notificationOnly', 'statusesOnly']) {
    options.statusesOnly = mode === 'statusesOnly';
    options.notificationOnly = mode === 'notificationOnly';
    for (let i = 0; i < 5; i++) {
      const result = actual.calculate(options);
      const expected = oracle.calculate(options);
      if (options.statusesOnly) assert.deepEqual(result.requestLineStatuses, structuredClone(expected.requestLineStatuses));
      else {
        assert.equal(result.issueLines.length, expected.issueLines.length);
        assert.equal(result.latestTimestamp, expected.latestTimestamp);
      }
      options.orderRequests = options.orderRequests.map((row, index) => index === i ? {
        ...row, note: `edit ${i}`, items: row.items.map(item => ({ ...item, quantity: i + 9 })),
      } : row).filter((_, index) => index !== 119 - i);
    }
  }
});

test('per-call shortage label cache never retains a quantity or dispatch status', () => {
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

test('per-call shortage label cache is bounded and the full 4500-alias summary equals independent Git 5f', () => {
  const maps = [];
  class ObservedMap extends Map {
    constructor(...args) { super(...args); this.peakSize = this.size; maps.push(this); }
    set(key, value) {
      super.set(key, value);
      this.peakSize = Math.max(this.peakSize || 0, this.size);
      return this;
    }
  }
  const h = shortageHarness(appFunction, { Map: ObservedMap });
  const reference = shortageHarness(frozenShortageFunctions());
  const implementation = h.calculate.toString();
  assert.match(implementation, /const normalizedLabels = new Map\(\)/, 'label cache is created within each summary call');
  assert.match(implementation, /text\.length <= 256 && normalizedLabels\.size < 2048/);
  assert.doesNotMatch(implementation, /warehouseShortageLabelCaches/);
  assert.match(implementation, /dispatchIndexCache && \(statusesOnly \|\| notificationOnly\)/);
  const customers = [{ id: 'customer-a', name: 'Customer A' }];
  const products = [];
  const items = Array.from({ length: 4500 }, (_, index) => ({ productId: `p-${index}`,
    description: index === 4499 ? `Long historical ${'x'.repeat(300)}` : `Historical \u0110\u1ed3ng product ${index}`,
    productShortName: `ALIAS-${index}`, quantity: 1 + index % 7, quantityUnit: 'Kg' }));
  const input = { customers, products, orderRequests: [{ id: 'request-a',
    customerId: 'customer-a', date: '2026-10-02', items }], dateKey: '2026-10-02' };
  const result = h.calculate(input);
  assert.deepEqual(result, structuredClone(reference.calculate(input)), 'every output field, quantity, alias and line order is unchanged');
  assert.equal(result.totalRequiredLines, 4500, 'cache bounds must not remove request lines');
  assert.equal(result.missingLines.length, 4500);
  assert.equal(result.coveredLines, 0);
  assert.equal(result.partialLines.length, 0);
  const labelCaches = () => maps.filter(map => map.size > 0 && [...map.values()].every(value => typeof value === 'string'));
  const [firstCache] = labelCaches();
  assert.equal(labelCaches().length, 1);
  assert.equal(firstCache.peakSize, 2048, 'storage saturates its bound without limiting calculation');
  const variantLeaves = maps.filter(map => map.size > 0 && [...map.values()].every(value => (
    Array.isArray(value) && value.every(alias => typeof alias === 'string' && alias.includes('__'))
  )));
  assert.equal(variantLeaves.reduce((sum, map) => sum + map.size, 0), 2048,
    'structured variant tuples retain at most 2048 per-call entries across all leaves');
  assert.ok([...firstCache.keys()].every(key => key.length <= 256), 'long names are normalized without being retained');
  assert.ok(result.missingLines.some(line => line.productName === items[4499].description), 'uncached long alias survives in the full output');
  customers[0].name = 'Renamed Customer A';
  items[0].quantity = 10;
  // Dispatch acknowledges earlier request rows; a later row remains missing in full.
  const revised = { ...input,
    orderRequests: [
      { ...input.orderRequests[0], createdAt: '2026-10-02T08:00:00Z' },
      { id: 'request-later', customerId: customers[0].id, date: '2026-10-02',
        createdAt: '2026-10-02T10:00:00Z', items: [{ ...items[0], quantity: 15, rowKey: 'later-row' }] },
    ],
    warehouseDispatches: [{ id: 'dispatch-a', customerId: customers[0].id,
      productId: items[0].productId, date: '2026-10-02', createdAt: '2026-10-02T09:00:00Z', weightKg: 10 }],
  };
  const updated = h.calculate(revised);
  assert.deepEqual(updated, structuredClone(reference.calculate(revised)), 'same input identities with edited data match the frozen algorithm');
  assert.equal(updated.totalRequiredLines, 4500);
  assert.equal(updated.missingLines.length, 4500);
  assert.equal(updated.partialLines.length, 0, 'row acknowledgement emits missing/done, not fractional coverage');
  assert.equal(updated.coveredLines, 0);
  const editedLine = updated.missingLines.find(line => line.productId === items[0].productId);
  assert.ok(editedLine);
  assert.equal(editedLine.customerName, customers[0].name);
  assert.equal(editedLine.requiredKg, 25);
  assert.equal(editedLine.dispatchedKg, 10);
  assert.equal(editedLine.remainingKg, 15);
  assert.equal(editedLine.dispatchedLineCount, 1);
  assert.deepEqual(editedLine.requestLineStatuses.map(line => [line.requestId, line.quantity, line.status, line.dispatchIds]), [
    ['request-a', 10, 'dispatched', ['dispatch-a']], ['request-later', 15, 'missing', []],
  ]);
  assert.equal(editedLine.latestMissingTimestamp, Date.parse('2026-10-02T10:00:00Z'));
  const caches = labelCaches();
  assert.equal(caches.length, 2, 'a fresh local label cache is allocated for the second call');
  assert.notEqual(caches[0], caches[1]);
  assert.ok(caches.every(cache => cache.peakSize <= 2048));
  assert.ok(!caches[1].has('Customer A'), 'prior call labels are not inherited');
});

test('repeated shortage aliases reduce set construction without reusing live quantities', () => {
  let currentSets = 0;
  let referenceSets = 0;
  class CurrentSet extends Set { constructor(...args) { super(...args); currentSets += 1; } }
  class ReferenceSet extends Set { constructor(...args) { super(...args); referenceSets += 1; } }
  const current = shortageHarness(appFunction, { Set: CurrentSet });
  const reference = shortageHarness(frozenShortageFunctions(), { Set: ReferenceSet });
  const input = { dateKey: '2026-10-02',
    customers: [{ id: 'c__1', name: 'Đồng Khách' }],
    products: [{ id: 'p1', name: 'Gà', shortName: 'GA', unit: 'Kg' }],
    orderRequests: Array.from({ length: 300 }, (_, i) => ({ id: `r${i}`, customerId: 'c__1',
      date: '2026-10-02', items: [{ productId: 'p1', quantity: i + 1, quantityUnit: 'Kg' }] })),
  };
  assert.deepEqual(current.calculate(input), structuredClone(reference.calculate(input)));
  assert.ok(currentSets < referenceSets - 500, `${currentSets} vs ${referenceSets} set constructions`);
  input.orderRequests[0].items[0].quantity = 999;
  assert.deepEqual(current.calculate(input), structuredClone(reference.calculate(input)));
  input.orderRequests[0].closedShortItemKeys = ['p1'];
  input.orderRequests[1].closedShortItems = { p1: { reason: 'closed' } };
  input.orderRequests[2].closedShortItemKeys = [null, '', false];
  assert.deepEqual(current.calculate(input), structuredClone(reference.calculate(input)),
    'Nonempty closed keys remain request-local; empty and false keys cannot close adjacent requests');
  delete input.orderRequests[0].closedShortItemKeys;
  delete input.orderRequests[1].closedShortItems;
  assert.deepEqual(current.calculate(input), structuredClone(reference.calculate(input)),
    'Reopening a line uses fresh closure state on the next calculation');
});

test('shortage timestamps reuse dates per call without caching live quantities or mixing start/end boundaries', () => {
  let constructions = 0;
  class ObservedDate extends Date {
    constructor(...args) { super(...args); constructions += 1; }
  }
  const current = shortageHarness(appFunction, { Date: ObservedDate });
  const reference = shortageHarness(frozenShortageFunctions());
  const input = { dateKey: '2026-10-02',
    customers: [{ id: 'c', name: 'Customer' }],
    products: [{ id: 'p', name: 'Product', unit: 'Kg' }],
    orderRequests: Array.from({ length: 300 }, (_, i) => ({ id: `r${i}`, customerId: 'c',
      date: '2026-10-02', items: [{ productId: 'p', quantity: i + 1, quantityUnit: 'Kg' }] })),
    warehouseDispatches: [{ id: 'd', customerId: 'c', productId: 'p', date: '2026-10-02', weightKg: 3 }],
  };
  assert.deepEqual(current.calculate(input), structuredClone(reference.calculate(input)));
  assert.equal(constructions, 2, 'one midnight and one end-of-day timestamp for 301 records');
  input.orderRequests[0].items[0].quantity = 999;
  assert.deepEqual(current.calculate(input), structuredClone(reference.calculate(input)));
  assert.equal(constructions, 4, 'a new calculation owns its own date cache');
  const dates = Array.from({ length: 300 }, (_, i) => new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10));
  const historical = { ...input, dateKey: '2026-12-31', includePreviousOpenOrders: true,
    orderRequests: dates.map((date, i) => ({ ...input.orderRequests[i], date })), warehouseDispatches: [] };
  assert.deepEqual(current.calculate(historical), structuredClone(reference.calculate(historical)),
    'dates beyond the cache bound still participate in the calculation');
  const invalid = { ...input, dateKey: '2026-99-99', dispatchDateKey: '2026-99-99',
    orderRequests: [{ ...input.orderRequests[0], date: '2026-99-99' }], warehouseDispatches: [] };
  assert.deepEqual(current.calculate(invalid), structuredClone(reference.calculate(invalid)),
    'non-finite timestamps retain the existing zero fallback');
});

test('status-only projection preserves every row without preparing unused quantity summaries', () => {
  const current = shortageHarness();
  const reference = shortageHarness(frozenShortageFunctions());
  const input = { dateKey: '2026-10-02', includePreviousOpenOrders: true,
    customers: [{ id: 'c', name: 'Customer' }], products: [{ id: 'p', name: 'Product', unit: 'Kg' }],
    orderRequests: Array.from({ length: 300 }, (_, i) => ({ id: `r${i}`, customerId: 'c',
      date: i % 2 ? '2026-10-01' : '2026-10-02',
      createdAt: new Date(Date.UTC(2026, 9, 2, 0, i)).toISOString(),
      items: [{ productId: 'p', quantity: i + 1, quantityUnit: 'Kg' }] })),
    warehouseDispatches: [{ id: 'd', customerId: 'c', productId: 'p', date: '2026-10-02',
      createdAt: '2026-10-02T02:00:00Z', weightKg: 5 }],
  };
  for (const patch of [{}, { closedShortItems: { p: { reason: 'closed' } } }, { isArchived: true }]) {
    Object.assign(input.orderRequests[0], patch);
    assert.deepEqual(current.calculate({ ...input, statusesOnly: true }).requestLineStatuses,
      structuredClone(reference.calculate(input)).requestLineStatuses);
    const notification = current.calculate({ ...input, notificationOnly: true });
    const full = reference.calculate(input);
    assert.equal(notification.issueLines.length, full.issueLines.length);
    assert.equal(notification.latestTimestamp, full.latestTimestamp);
  }
});

test('notification projection preserves alias, duplicate, archive and timestamp edge cases', () => {
  const current = shortageHarness();
  const reference = shortageHarness(frozenShortageFunctions());
  for (let seed = 0; seed < 40; seed++) {
    const input = { dateKey: '2026-10-02', includePreviousOpenOrders: Boolean(seed % 2),
      customers: [{ id: 'c', name: 'Customer' }], products: [{ id: 'p', name: 'Product', unit: 'Kg' }],
      orderRequests: Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, customerId: i % 3 ? 'c' : '',
        customerName: 'Customer', date: i % 2 ? '2026-10-01' : '2026-10-02',
        createdAt: i % 4 ? `2026-10-02T0${i % 8}:00:00Z` : 'invalid',
        isArchived: (i + seed) % 11 === 0,
        items: [{ productId: i % 3 ? 'p' : '', productName: 'Product', quantity: i,
          status: (i + seed) % 13 ? '' : 'closed_short' }] })),
      warehouseDispatches: Array.from({ length: seed % 9 }, (_, i) => ({
        id: i % 3 ? 'duplicate' : '', customerId: i % 2 ? 'c' : '', productId: 'p',
        customerNameSnapshot: 'Customer', productNameSnapshot: 'Product', date: '2026-10-02',
        createdAt: i % 2 ? `2026-10-02T0${i}:00:00Z` : 'invalid',
        isArchived: (i + seed) % 5 === 0, weightKg: 1,
      })),
    };
    const full = reference.calculate(input);
    const notice = current.calculate({ ...input, notificationOnly: true });
    assert.equal(notice.issueLines.length, full.issueLines.length, `seed ${seed}`);
    assert.equal(notice.latestTimestamp, full.latestTimestamp, `seed ${seed}`);
    assert.deepEqual(current.calculate({ ...input, statusesOnly: true }).requestLineStatuses,
      structuredClone(full.requestLineStatuses));
  }
});

test('same-timestamp shortage rows share candidate work, not mutable dispatch ID arrays', () => {
  let checks = 0;
  const instrument = factory => (name, bindings = {}) => {
    const fn = factory(name, bindings);
    if (name !== 'buildWarehouseDispatchShortageSummary') return fn;
    const expression = fn.toString().replace(
      /dispatchLinesSorted\.filter\(dispatchLine => \{\s*const dispatchTimestamp = dispatchLine\.dispatchTimestamp \|\| 0;/,
      'dispatchLinesSorted.filter(dispatchLine => { const dispatchTimestamp = (countCheck(), dispatchLine.dispatchTimestamp || 0);')
      .replace('if ((dispatchLinesSorted[middle].dispatchTimestamp || 0) < requestTimestamp)',
        'if ((countCheck(), dispatchLinesSorted[middle].dispatchTimestamp || 0) < requestTimestamp)');
    return vm.runInNewContext(`(${expression})`, { ...bindings, warehouseShortageKeyCache: new WeakMap(), countCheck: () => checks++ });
  };
  const input = { dateKey: '2026-10-02',
    customers: [{ id: 'c', name: 'Customer' }], products: [{ id: 'p', name: 'Product', unit: 'Kg' }],
    orderRequests: Array.from({ length: 300 }, (_, i) => ({ id: `r${i}`, customerId: 'c',
      date: '2026-10-02', createdAt: '2026-10-02T08:00:00Z',
      items: [{ productId: 'p', quantity: i + 1, quantityUnit: 'Kg' }] })),
    warehouseDispatches: Array.from({ length: 100 }, (_, i) => ({ id: `d${i}`,
      customerId: 'c', productId: 'p', date: '2026-10-02',
      createdAt: '2026-10-02T09:00:00Z', weightKg: i + 1 })),
  };
  const current = shortageHarness(instrument(appFunction));
  const result = current.calculate(input);
  const optimizedChecks = checks;
  checks = 0;
  const reference = shortageHarness(instrument(frozenShortageFunctions()));
  assert.deepEqual(structuredClone(result), structuredClone(reference.calculate(input)));
  assert.ok(optimizedChecks > 0 && optimizedChecks <= 7, 'one binary search replaces a full candidate scan');
  assert.equal(checks, 30000);
  assert.notEqual(result.requestLineStatuses[0].dispatchIds, result.requestLineStatuses[1].dispatchIds);
  result.requestLineStatuses[0].dispatchIds.push('must-not-leak');
  assert.ok(!result.requestLineStatuses[1].dispatchIds.includes('must-not-leak'));
  input.orderRequests.forEach((request, i) => { request.createdAt = new Date(Date.UTC(2026, 9, 2, 0, i)).toISOString(); });
  assert.deepEqual(structuredClone(current.calculate(input)), structuredClone(reference.calculate(input)),
    'more than 256 unique timestamps do not omit rows');
  input.orderRequests[0].createdAt = 'invalid';
  input.warehouseDispatches[0].createdAt = 'invalid';
  input.warehouseDispatches[1].isArchived = true;
  input.warehouseDispatches[2].id = '';
  input.warehouseDispatches[3].id = input.warehouseDispatches[4].id;
  assert.deepEqual(structuredClone(current.calculate(input)), structuredClone(reference.calculate(input)),
    'fallback times, archived records, missing/duplicate IDs and stable tied timestamp selection retain parity');
});
