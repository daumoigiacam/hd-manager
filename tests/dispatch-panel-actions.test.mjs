import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteDispatchHistoryRow } from '../src/features/warehouse/dispatchHistoryActions.js';
import { deleteShortageOrderRequestRow, closeSelectedDispatchShortage } from '../src/features/warehouse/dispatchShortageActions.js';

test('history delete blocks repeat actions, waits for ACK, reports failure and releases lock', async () => {
  let reject;
  let calls = 0;
  const removed = [], errors = [], pending = [];
  const context = { allowed: true, lock: { current: false }, confirm: () => true,
    remove: () => { calls++; return new Promise((_resolve, fail) => { reject = fail; }); },
    onRemoved: row => removed.push(row), setPending: id => pending.push(id),
    setError: error => errors.push(error), errorMessage: error => error.message };
  const task = deleteDispatchHistoryRow({ id: 'd' }, context);
  await deleteDispatchHistoryRow({ id: 'd' }, context);
  assert.equal(calls, 1); assert.deepEqual(removed, []);
  reject(new Error('Server rejected')); await task;
  assert.deepEqual(errors, ['', 'Server rejected']);
  assert.deepEqual(pending, ['d', '']); assert.equal(context.lock.current, false);
});

function setup() {
  const calls = [];
  const request = { id: 'r', items: [
    { rowKey: 'a', productId: 'p', amount: 10 }, { rowKey: 'b', productId: 'q', amount: 20 },
  ] };
  const context = { lock: { current: false }, selectedShortageLine: { customerName: 'Customer', requestLines: [] },
    canDeleteOrderRequest: true, orderRequests: [request], employee: { id: 'e' }, workingDate: '2026-10-06',
    confirm: () => true, normalizeLookupText: value => value,
    getTransactionBillingPresentation: item => ({ amount: item.amount }),
    getFriendlyFirebaseErrorMessage: error => error.message,
    onDeleteOrderRequest: async id => calls.push(['delete', id]),
    onEditOrderRequest: async (id, payload) => calls.push(['edit', id, payload]),
    setDeletingShortageRequestKey() {}, setIsClosingShortageLine() {},
    setDispatchError: error => calls.push(['error', error]),
    setSelectedShortageLine: () => calls.push(['close']),
  };
  return { context, calls, request };
}
const row = { id: 'row-a', requestId: 'r', rowKey: 'a', itemIndex: 0, productLabel: 'P', quantityLabel: '5', requestDateLabel: '06/10' };

test('shortage delete preserves the other line and delegates existing billing calculation', async () => {
  const { context, calls, request } = setup();
  await deleteShortageOrderRequestRow(row, context);
  const edit = calls.find(call => call[0] === 'edit');
  assert.equal(edit[2].items.length, 1); assert.equal(edit[2].items[0], request.items[1]);
  assert.equal(edit[2].totalAmount, 20); assert.equal(request.items.length, 2);
  assert.equal(context.lock.current, false);
});

test('shortage delete respects permission and cancellation', async () => {
  const { context, calls } = setup();
  context.canDeleteOrderRequest = false;
  await deleteShortageOrderRequestRow(row, context);
  context.canDeleteOrderRequest = true; context.confirm = () => false;
  await deleteShortageOrderRequestRow(row, context);
  assert.deepEqual(calls, []);
});

test('shortage close preserves existing closure metadata and groups by request', async () => {
  const { context, calls, request } = setup();
  request.closedShortItems = { old: { reason: 'existing' } };
  context.selectedShortageLine.requestLines = [{ requestId: 'r', rowKey: 'a', productId: 'p', quantity: 5 }];
  await closeSelectedDispatchShortage(context);
  const edits = calls.filter(call => call[0] === 'edit');
  assert.equal(edits.length, 1);
  assert.equal(edits[0][2].closedShortItems.old, request.closedShortItems.old);
  assert.equal(edits[0][2].closedShortItems.a.quantity, 5);
  assert.equal(edits[0][2].closedShortItems.a.closedByEmpId, 'e');
});

test('shortage lock covers competing delete and close until the real promise settles', async () => {
  const { context, calls } = setup();
  let release;
  context.onEditOrderRequest = () => new Promise(resolve => { release = resolve; });
  const task = deleteShortageOrderRequestRow(row, context);
  await closeSelectedDispatchShortage(context);
  await deleteShortageOrderRequestRow(row, context);
  assert.equal(context.lock.current, true);
  assert.deepEqual(calls, [['error', '']]);
  release(); await task;
  assert.equal(context.lock.current, false);
});
