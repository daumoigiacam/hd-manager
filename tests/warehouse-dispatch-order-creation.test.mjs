import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  collectUsedWarehouseDispatchIds,
  findDuplicateWarehouseDispatchIds,
  getWarehouseDispatchIds,
  isWarehouseDispatchAlreadyLinked,
  resolveOrderCreationDateKey,
} from '../src/utils/warehouseDispatchOrders.js';

assert.equal(
  resolveOrderCreationDateKey({
    sourceType: 'warehouse_dispatch',
    draftDate: '2026-09-21',
    creationDate: '2026-09-23',
  }),
  '2026-09-23',
  'warehouse sourced orders use the day they are created, not the dispatch day',
);
assert.equal(
  resolveOrderCreationDateKey({
    sourceType: 'manual',
    draftDate: '2026-09-21',
    creationDate: '2026-09-23',
  }),
  '2026-09-21',
  'manual orders keep their selected business date',
);

const existingOrders = [
  { id: 'active-order', sourceDispatchIds: ['dispatch-active'] },
  { id: 'archived-order', isArchived: true, sourceDispatchIds: ['dispatch-archived'] },
  { id: 'legacy-order', sourceDispatchId: 'dispatch-legacy' },
  { id: 'item-linked-order', items: [{ sourceDispatchId: 'dispatch-item' }] },
];

assert.deepEqual(
  [...collectUsedWarehouseDispatchIds(existingOrders)].sort(),
  ['dispatch-active', 'dispatch-archived', 'dispatch-item', 'dispatch-legacy'],
  'dispatch references are collected from active, archived, and legacy order shapes',
);
assert.deepEqual(
  getWarehouseDispatchIds({
    sourceDispatchIds: ['dispatch-a'],
    items: [{ sourceDispatchIds: ['dispatch-b', 'dispatch-a'] }],
  }),
  ['dispatch-a', 'dispatch-b'],
  'dispatch ids are normalized and de-duplicated',
);
assert.deepEqual(
  findDuplicateWarehouseDispatchIds(
    [{ sourceDispatchIds: ['dispatch-archived', 'dispatch-new'] }],
    existingOrders,
  ),
  ['dispatch-archived'],
  'archived source orders remain protected from reuse',
);
assert.deepEqual(
  findDuplicateWarehouseDispatchIds(
    [
      { sourceDispatchIds: ['dispatch-batch'] },
      { sourceDispatchIds: ['dispatch-batch'] },
    ],
    [],
  ),
  ['dispatch-batch'],
  'the same dispatch cannot appear twice in one bulk submission',
);
assert.deepEqual(
  findDuplicateWarehouseDispatchIds([{ sourceDispatchIds: ['dispatch-clean'] }], existingOrders),
  [],
  'unused source dispatches remain eligible',
);
assert.equal(isWarehouseDispatchAlreadyLinked({ linkedOrderId: 'order-1' }), true);
assert.equal(isWarehouseDispatchAlreadyLinked({ id: 'dispatch-free' }), false);

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
assert.ok(/resolveOrderCreationDateKey\(\{[\s\S]{0,220}sourceType: isWarehouseDispatchDraft \? 'warehouse_dispatch' : draft\.sourceType/.test(appSource));
assert.ok(/sourceDispatchDate: draft\.sourceDispatchDate \|\| ''/.test(appSource));
assert.ok(/findDuplicateWarehouseDispatchIds\(\s*\[orderData\],\s*existingCompanyOrders\s*\)/.test(appSource));
assert.ok(/await runTransaction\(db, async \(transaction\) => \{[\s\S]{0,1200}transaction\.set\(orderRef/.test(appSource));
assert.ok(/transaction\.set\(dispatchRef, dispatchLinkPatch, \{ merge: true \}\)/.test(appSource));
assert.ok(/findDuplicateWarehouseDispatchIds\(\s*bulkOrderDrafts,\s*orderRecordsForDuplicateCheck\s*\)/.test(appSource));
assert.ok(/clientMutationId: orderData\.clientMutationId \|\| \(isWarehouseDispatchOrder[\s\S]{0,260}order-dispatch-/.test(appSource));

console.log('Warehouse dispatch order creation date and duplicate protection tests passed.');
