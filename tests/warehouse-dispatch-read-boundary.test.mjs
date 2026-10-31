import assert from 'node:assert/strict';
import test from 'node:test';
import { createWarehouseDispatchReadDecoder } from '../src/features/warehouse/warehouseDispatchReadRepository.js';
import { appFunction } from './helpers/app-source-function.mjs';
import {createSnapshotRecordMaterializer,materializeSnapshotRecords} from '../src/services/realtimeSnapshotItems.js';

const record = (id = 'dispatch-a', patch = {}) => ({
  id, data: { id, companyId: 'company-a', customerId: 'customer-a',
    quantity: '5', weightKg: 10, weightEntries: ['4,5', 5.5], ...patch },
});

test('read boundary preserves legacy values and all snapshot fields without coercion', () => {
  const decode = createWarehouseDispatchReadDecoder({ companyId: 'company-a' });
  const input = record('legacy', { clientMutationId: null, assignedDriverId: null, note: null,
    date: '2026-10-06', billingSnapshot: { amount: 50000 }, isArchived: null });
  const result = decode([input]);
  assert.equal(result[0].data, input.data);
  assert.deepEqual(result, [input]);
  assert.deepEqual(decode([]), []);
});

test('tenant and customer scopes are enforced independently for every decoder', () => {
  const employee = createWarehouseDispatchReadDecoder({ companyId: 'company-a' });
  const customer = createWarehouseDispatchReadDecoder({ companyId: 'company-a', customerId: 'customer-b' });
  const input = record();
  assert.equal(employee([input]).length, 1);
  assert.throws(() => customer([input]), /customerId/);
  assert.throws(() => employee([record('foreign', { companyId: 'company-b' })]), /companyId/);
  assert.throws(() => createWarehouseDispatchReadDecoder({ companyId: '' }), /tenant/);
});

test('invalid numeric, text, flag and nested weight values fail before publication', () => {
  const decode = createWarehouseDispatchReadDecoder({ companyId: 'company-a' });
  for (const [field, value] of [
    ['weightKg', NaN], ['quantity', {}], ['amount', Infinity],
    ['customerNameSnapshot', {}], ['isArchived', 'false'],
    ['weightEntries', ['4', {}]], ['weightEntries', {}],
  ]) {
    assert.throws(() => decode([record('bad', { [field]: value })]), new RegExp(field));
  }
  assert.throws(() => decode({}), /snapshot/);
  assert.throws(() => decode([{ id: '', data: {} }]), /document/);
  assert.throws(() => decode([record(), record()]), /duplicate id/);
  assert.throws(() => decode([record('actual', { id: 'forged' })]), /id/);
});

test('unchanged immutable snapshots reuse validation and replacement snapshots are checked', () => {
  const decode = createWarehouseDispatchReadDecoder({ companyId: 'company-a' });
  let reads = 0;
  const item = record();
  Object.defineProperty(item.data, 'quantity', { enumerable: true, get: () => { reads++; return '5'; } });
  decode([item]);
  const firstReads = reads;
  for (let i = 0; i < 20; i++) decode([item]);
  assert.equal(reads, firstReads);
  assert.throws(() => decode([record('dispatch-a', { quantity: {} })]), /quantity/);
  assert.equal(decode([record('dispatch-a', { quantity: 7 })])[0].data.quantity, 7);
});

test('actual collection publication validates the full batch before touching overlays or state', async () => {
  const events = [];
  const apply = appFunction('applyCollectionItems', {
    cancelled:false,readWorker:null,materializationRevisions:new Map(),snapshotRecordMaterializers:new Map(),
    createSnapshotRecordMaterializer,materializeSnapshotRecords,
    decodeWarehouseDispatchItems: createWarehouseDispatchReadDecoder({ companyId: 'company-a' }),
    clearConfirmedLocalMutations: () => events.push('clear-overlay'),
    filterRecentlyDeletedItems: (_name, items) => items,
    getPreviousStableCollectionValue: () => [],
    hasCollectionValue: value => value.length > 0,
    mergePendingArrayItems: (_name, items) => items,
    setCollectionSafely: (_name, setter, value) => setter(value),
  });
  const publish = rows => events.push(rows);
  await assert.rejects(apply('warehouseDispatches', publish, [
    record(), record('invalid', { weightKg: {} }),
  ]), /weightKg/);
  assert.deepEqual(events, []);
  await apply('warehouseDispatches', publish, [record()]);
  assert.equal(events[0], 'clear-overlay');
  assert.equal(events[1][0].quantity, '5');
});

test('actual realtime callback rejects malformed data before ACK bookkeeping or publication', async () => {
  const effects = [];
  const snapshot = { metadata: { fromCache: false, hasPendingWrites: false } };
  const apply = appFunction('applySnapshot', {
    cancelled: false,
    listenerActive:true,
    colName: 'warehouseDispatches',
    snapshotItemCollectors: [() => [record('bad', { weightKg: {} })]],
    collectionRefs: [{}],
    decodeWarehouseDispatchItems: createWarehouseDispatchReadDecoder({ companyId: 'company-a' }),
    lastRealtimeSnapshotAtRef: { current: { set: () => effects.push('snapshot') } },
    lastRealtimeServerSnapshotAtRef: { current: { set: () => effects.push('ack') } },
    isServerConfirmedRealtimeSnapshot: () => true,
    markCollectionServerConfirmed: () => effects.push('confirmed'),
    applyCollectionItems: () => effects.push('published'),
  });
  await assert.rejects(apply(snapshot, 0), /weightKg/);
  assert.deepEqual(effects, []);
});
