import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectionCache, runCooperativeProjection, sortProjection } from '../src/services/cooperativeProjection.js';
import { appFunction } from './helpers/app-source-function.mjs';

test('projection cache isolates every immutable source and date/employee scope, with bounded retention', () => {
  const entryFor = createProjectionCache();
  const sources = [[], [], [], [], []];
  const scope = JSON.stringify(['2026-10-02', 'driver', true]);
  const entry = entryFor(sources, scope);
  entry.value = [{ total: 10 }];
  entry.complete = true;
  assert.equal(entryFor([...sources], scope), entry);
  for (let i = 0; i < sources.length; i++) {
    const changed = [...sources]; changed[i] = [];
    assert.equal(entryFor(changed, scope).complete, false);
  }
  for (const other of [['2026-10-03', 'driver', true], ['2026-10-02', 'other', true], ['2026-10-02', 'driver', false]]) {
    assert.equal(entryFor(sources, JSON.stringify(other)).complete, false);
  }
  for (let i = 0; i < 8; i++) entryFor(sources, `scope${i}`);
  assert.notEqual(entryFor(sources, scope), entry);
  assert.throws(() => entryFor([], scope), TypeError);
});

for (const size of [20, 1000, 5000]) {
  test(`delivery projection ${size} preserves group totals across repeated opens and cancellation`, { timeout: 30000 }, async () => {
    const product = { id: 'p', name: 'Product', unit: 'Kg' };
    const dispatches = Array.from({ length: size }, (_, i) => ({ id: `d${i}`, customerId: `c${i % 20}`, productId: 'p', quantity: 1, weightKg: 1 }));
    let priceCalls = 0;
    const bindings = {
      sortProjection, dayDispatches: dispatches, customerLookup: new Map(), productLookup: new Map([['p', product]]), latestReportByDispatch: new Map(),
      normalizeLookupText: String, getDeliveryReportWeightStatus: () => ({}), getProductShortName: row => row?.name,
      getCompactProductName: row => row?.name, parseLooseQuantityValue: value => Number(value) || 0,
      normalizeProductPricingUnit: value => value, resolveDispatchOrderRequestPrice: () => { priceCalls++; return { unitPrice: 10, pricingUnit: 'Kg' }; },
      resolveTransactionBillingSnapshot: () => null,
      calculateBillableAmount: ({ actualQuantity }) => ({ billingQuantity: actualQuantity, amount: actualQuantity * 10 }),
      formatNumber: String, formatCurrency: String, getEntityTimestamp: () => 0,
    };
    const factory = appFunction('prepareDispatchReconciliationGroups', bindings, { memoCallback: true, scope: 'DeliveryReportView' });
    let yields = 0;
    const start = performance.now();
    const first = await runCooperativeProjection(factory, { yieldTask: async () => { yields++; }, now: () => 0 });
    assert.equal(priceCalls, size);
    assert.equal(first.reduce((sum, group) => sum + group.paymentSummaryTotal, 0), size * 10);
    assert.ok(yields >= size / 128);
    assert.deepEqual(await runCooperativeProjection(factory), first);
    const dated = dispatches.map((row, index) => ({ ...row, date: index % 2 ? '2026-10-02' : '2026-10-03', assigned: index % 3 === 0 }));
    for (const workingDate of ['2026-10-02', '2026-10-03']) {
      for (const scoped of [false, true]) {
        const visible = appFunction('dayDispatches', {
          warehouseDispatches: dated, workingDate, customerLookup: new Map(),
          isCurrentEmployeeDeliveryParticipant: scoped, employee: { id: 'driver' },
          resolveEntityDateKey: row => row.date, getDeliveryAssignmentIds: row => row.assigned ? ['driver'] : [],
        }, { memoCallback: true, scope: 'DeliveryReportView' })();
        const filteredFactory = appFunction('prepareDispatchReconciliationGroups', { ...bindings, dayDispatches: visible },
          { memoCallback: true, scope: 'DeliveryReportView' });
        const filtered = await runCooperativeProjection(filteredFactory);
        const expected = dated.filter(row => row.date === workingDate && (!scoped || row.assigned));
        assert.equal(filtered.reduce((sum, group) => sum + group.rows.length, 0), expected.length);
        assert.equal(filtered.reduce((sum, group) => sum + group.paymentSummaryTotal, 0), expected.length * 10);
      }
    }
    const controller = new AbortController();
    const beforeCancel = priceCalls;
    await assert.rejects(runCooperativeProjection(factory, { signal: controller.signal, yieldTask: async () => controller.abort() }), { name: 'AbortError' });
    assert.equal(priceCalls, beforeCancel);
    console.log(JSON.stringify({ dispatches: size, priceCallsFirstOpen: size, yields, repeatedProjectionMs: performance.now() - start }));
  });
}
