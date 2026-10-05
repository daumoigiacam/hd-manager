import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDispatchHistoryRows, buildDispatchShortageTableRows } from '../src/features/warehouse/dispatchDialogModels.js';

test('shortage projection preserves action identity, fallback labels and raw row references', () => {
  const lines = Object.freeze([
    Object.freeze({ requestId: 'r', productId: 'p', rowKey: 'stable-key', itemIndex: 5, quantity: 3, quantityUnit: 'Con', attributeLabel: '2 kg' }),
    Object.freeze({ productName: 'Other', itemIndex: 1.5 }),
  ]);
  const rows = buildDispatchShortageTableRows(lines, 'Fallback', { formatDate: s => s, formatNumber: String, compactName: s => s });
  assert.deepEqual(rows.map(row => [row.id, row.itemIndex, row.rowKey, row.productLabel, row.quantityLabel]), [
    ['r_p_0', 5, 'stable-key', 'Fallback', '3 Con'], ['shortage_1_1', 1, '', 'Other', '0'],
  ]);
  assert.equal(rows[0].rawLine, lines[0]);
  assert.equal(rows[0].sizeLabel, '2 kg');
});

test('history projection preserves stable chronology, snapshot precedence and legacy weight parsing', () => {
  const items = Object.freeze([
    Object.freeze({ id: 'b', customerId: 'c', productId: 'p', weightKg: '3,5', time: 2 }),
    Object.freeze({ id: 'a', customerId: 'c', productId: 'p', customerNameSnapshot: 'Snapshot', productNameSnapshot: 'Old product', weightKg: 4.5, time: 1 }),
  ]);
  const rows = buildDispatchHistoryRows(items, {
    customers: new Map([['c', { name: 'Current' }]]), products: new Map([['p', { name: 'Product', short: 'P' }]]),
    timestamp: item => item.time, productShortName: product => product?.short || '', quantity: () => 5, unit: () => 'Con',
  });
  assert.deepEqual(rows.map(row => row.id), ['a', 'b']);
  assert.equal(items[0].id, 'b');
  assert.equal(rows[0].customerName, 'Snapshot');
  assert.equal(rows[0].productName, 'Old product');
  assert.equal(rows[1].weightKg, 3, 'Preserve prior parseFloat semantics; no business conversion in this refactor');
});
