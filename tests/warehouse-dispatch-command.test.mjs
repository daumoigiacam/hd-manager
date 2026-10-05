import assert from 'node:assert/strict';
import test from 'node:test';
import { appFunction } from './helpers/app-source-function.mjs';

function harness({ existing = [], rejectEnqueue = false, pending = [] } = {}) {
  let rows = [...existing];
  const overlay = new Map();
  const writes = [];
  const events = [];
  const add = appFunction('handleAddWarehouseDispatch', {
    isVpsStagingMode: false,
    firebaseUser: { uid: 'user-a' }, myCompanyId: 'company-a',
    customers: [{ id: 'customer-a', name: 'Customer A' }],
    products: [{ id: 'product-a', name: 'Product A' }],
    rawWarehouseDispatches: existing,
    pendingFirebaseWritesRef: { current: pending },
    parseLooseQuantityValue: value => Number(value) || 0,
    normalizeLeadingLabel: value => String(value).trim(),
    normalizeLookupText: value => String(value).trim().toLowerCase(),
    getTodayString: () => '2026-10-05',
    getEntityTimestamp: row => Date.parse(row.updatedAt || row.createdAt),
    setRawWarehouseDispatches: update => { events.push('publish'); rows = update(rows); },
    rememberRecentLocalWrite: (collection, id, payload) => { events.push('overlay'); overlay.set(id, payload); },
    enqueuePendingFirebaseWrite: command => {
      events.push('durable');
      if (rejectEnqueue) throw new Error('Storage quota exceeded');
      writes.push(command);
      return { queued: true };
    },
    requireSharedWriteConfirmation: async (result, collection, id) => {
      events.push('ack');
      return { confirmed: true, id, collection, companyId: result.companyId };
    },
  }, { scope: 'App' });
  return { add, overlay, writes, events, rows: () => rows };
}

const draft = id => ({ clientMutationId: id, customerId: 'customer-a', productId: 'product-a',
  quantity: 5, quantityUnit: 'Con', weightKg: 10, date: '2026-10-05' });

test('failed durable enqueue never publishes a dispatch or a replay overlay', async () => {
  const h = harness({ rejectEnqueue: true });
  await assert.rejects(h.add('employee-a', draft('command-a')), /Storage quota/);
  assert.equal(h.rows().length, 0);
  assert.equal(h.overlay.size, 0, 'a rejected draft must not reappear during snapshot reconciliation');
  assert.deepEqual(h.events, ['durable']);
});

test('accepted local save is durable before publication and returns only after ACK', async () => {
  const h = harness();
  const result = await h.add('employee-a', draft('command-a'));
  assert.equal(result.queued, false);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].durable, true);
  assert.equal(h.rows().length, 1);
  assert.ok(h.events.indexOf('durable') < h.events.indexOf('publish'));
  assert.ok(h.events.indexOf('publish') < h.events.indexOf('ack'));
  assert.equal(h.rows()[0].quantity, 5);
  assert.equal(h.rows()[0].weightKg, 10);
});

test('two intentional commands with identical goods inside 20 seconds are not collapsed', async () => {
  const existing = [{ ...draft('command-a'), id: 'wd_company-a_command-a', companyId: 'company-a', createdAt: new Date().toISOString() }];
  const h = harness({ existing });
  const result = await h.add('employee-a', draft('command-b'));
  assert.notEqual(result.id, 'wd_company-a_command-a');
  assert.equal(h.rows().length, 2);
  assert.equal(h.writes.length, 1);
});

test('same command replay reuses its existing identity', async () => {
  const existing = [{ ...draft('command-a'), id: 'wd_company-a_command-a', companyId: 'company-a', createdAt: new Date().toISOString() }];
  const h = harness({ existing });
  const result = await h.add('employee-a', draft('command-a'));
  assert.equal(result.id, 'wd_company-a_command-a');
  assert.equal(result.duplicate, true);
  assert.equal(h.writes.length, 0);
});

test('same pending command awaits ACK before returning success', async () => {
  const existing = [{ ...draft('command-a'), id: 'wd_company-a_command-a', companyId: 'company-a', createdAt: new Date().toISOString() }];
  for (const syncState of ['queued', 'blocked', 'paused']) {
    const h = harness({ existing, pending: [{ companyId: 'company-a', collectionName: 'warehouseDispatches', documentId: 'wd_company-a_command-a', syncState }] });
    const result = await h.add('employee-a', draft('command-a'));
    assert.equal(result.queued, false, `${syncState} resolves only after the confirmation helper completes`);
    assert.equal(result.duplicate, true);
    assert.equal(h.writes.length, 0);
  }
});

test('another tenant pending write cannot change the replay confirmation state', async () => {
  const existing = [{ ...draft('command-a'), id: 'wd_company-a_command-a', companyId: 'company-a', createdAt: new Date().toISOString() }];
  const h = harness({ existing, pending: [{ companyId: 'company-b', collectionName: 'warehouseDispatches', documentId: 'saved-a' }] });
  assert.equal((await h.add('employee-a', draft('command-a'))).queued, false);
});

test('legacy callers without a command ID retain their short duplicate guard', async () => {
  const existing = [{ ...draft(''), id: 'saved-a', companyId: 'company-a', createdAt: new Date().toISOString() }];
  const h = harness({ existing });
  const result = await h.add('employee-a', draft(''));
  assert.equal(result.id, 'saved-a');
  assert.equal(h.writes.length, 0);
});
