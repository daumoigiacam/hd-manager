import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { readFile } from 'node:fs/promises';

import {
  DELIVERY_RECONCILIATION_INITIAL_CUSTOMER_LIMIT,
  buildPendingDeliveryReconciliationGroups,
  countPendingDeliveryReconciliationDispatches,
  getVisibleDeliveryReconciliationGroups,
} from '../src/utils/deliveryReconciliationUx.js';

const test = (name, callback) => {
  callback();
  console.log(`PASS ${name}`);
};

const createGroup = (index, rows) => ({
  key: `customer-${index}`,
  customerName: `Customer ${index}`,
  rows,
});

const createRow = (id, overrides = {}) => ({
  dispatch: { id },
  productLabel: 'Product',
  dispatchWeight: 10,
  unitPrice: 50_000,
  totalAmount: 500_000,
  report: null,
  ...overrides,
});

test('keeps only unreported dispatches and preserves customer grouping', () => {
  const groups = [
    createGroup(1, [
      createRow('dispatch-1'),
      createRow('dispatch-2', { report: { id: 'report-2' } }),
      createRow('dispatch-3', { dispatchWeight: 5, totalAmount: 250_000 }),
    ]),
    createGroup(2, [createRow('dispatch-4', { report: { id: 'report-4' } })]),
  ];

  const pending = buildPendingDeliveryReconciliationGroups(groups);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].key, 'customer-1');
  assert.deepEqual(pending[0].rows.map((row) => row.dispatch.id), ['dispatch-1', 'dispatch-3']);
  assert.equal(pending[0].pendingCount, 2);
  assert.equal(pending[0].productWeightLines[0].weight, 15);
  assert.equal(pending[0].paymentSummaryTotal, 750_000);
});

test('optimistic completion removes a saved dispatch before realtime sync returns', () => {
  const groups = [createGroup(1, [createRow('dispatch-1'), createRow('dispatch-2')])];
  const pending = buildPendingDeliveryReconciliationGroups(groups, new Set(['dispatch-1']));

  assert.equal(pending.length, 1);
  assert.deepEqual(pending[0].rows.map((row) => row.dispatch.id), ['dispatch-2']);
  assert.equal(countPendingDeliveryReconciliationDispatches(pending), 1);
});

test('groups and totals quantity-priced products without treating them as Kg', () => {
  const groups = [createGroup(1, [
    createRow('dispatch-box-1', {
      productLabel: 'Vịt nguyên con',
      dispatchWeight: 12.5,
      pricingUnit: 'Con',
      pricingQuantity: 5,
      unitPrice: 100_000,
      totalAmount: 500_000,
    }),
    createRow('dispatch-box-2', {
      productLabel: 'Vịt nguyên con',
      dispatchWeight: 7.5,
      pricingUnit: 'Con',
      pricingQuantity: 3,
      unitPrice: 100_000,
      totalAmount: 300_000,
    }),
  ])];

  const pending = buildPendingDeliveryReconciliationGroups(groups);
  const line = pending[0].productWeightLines[0];
  assert.equal(line.pricingUnit, 'Con');
  assert.equal(line.pricingQuantity, 8);
  assert.equal(line.weight, 8);
  assert.equal(pending[0].paymentSummaryTotal, 800_000);
});

test('shows five customers by default and all customers when expanded', () => {
  const groups = Array.from({ length: 8 }, (_, index) => (
    createGroup(index + 1, [createRow(`dispatch-${index + 1}`)])
  ));
  const pending = buildPendingDeliveryReconciliationGroups(groups);

  assert.equal(DELIVERY_RECONCILIATION_INITIAL_CUSTOMER_LIMIT, 5);
  assert.equal(getVisibleDeliveryReconciliationGroups(pending, false).length, 5);
  assert.equal(getVisibleDeliveryReconciliationGroups(pending, true).length, 8);
  assert.equal(countPendingDeliveryReconciliationDispatches(pending), 8);
});

test('pending list preparation stays well below one frame for a large workday', () => {
  const groups = Array.from({ length: 1_000 }, (_, index) => (
    createGroup(index + 1, [createRow(`dispatch-${index + 1}`)])
  ));
  const startedAt = performance.now();
  const pending = buildPendingDeliveryReconciliationGroups(groups);
  const visible = getVisibleDeliveryReconciliationGroups(pending, false);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(visible.length, 5);
  assert.ok(elapsedMs < 16, `List preparation took ${elapsedMs.toFixed(2)} ms`);
  console.log(`INFO 1000 groups prepared in ${elapsedMs.toFixed(2)} ms; initial cards 1000 -> ${visible.length}`);
});

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('delivery report screen uses the memoized pending-only reconciliation section', () => {
  assert.match(appSource, /const DeliveryReconciliationCard = React\.memo/);
  assert.match(appSource, /const deliveryReconciliationSection = \(/);
  assert.match(appSource, /stageReportedReconciliationRows\(rowsToSave\.map\(row => row\.dispatchId\)\)/);
  assert.match(appSource, /sessionStorage\.setItem\(reconciliationExpandedSessionKey/);
  assert.doesNotMatch(appSource, />Danh sách đối chiếu<\/h3>/);
});

console.log('\n6 delivery reconciliation UX tests passed.');
