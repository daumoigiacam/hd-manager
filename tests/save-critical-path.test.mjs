import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isSamePendingWriteRevision } from '../src/utils/pendingWriteRevision.js';

test('write acknowledgements retain newer edits and other tenants', () => {
  const sent = { key: 'orders:1', companyId: 'a', revision: '1', payload: { price: 60 } };
  const newer = { ...sent, revision: '2', payload: { price: 63 } };
  const otherTenant = { ...sent, companyId: 'b' };
  assert.deepEqual([sent, newer, otherTenant].filter(item => !isSamePendingWriteRevision(item, sent)), [newer, otherTenant]);
  assert.equal(isSamePendingWriteRevision(JSON.parse(JSON.stringify(sent)), sent), true);
});

test('legacy queued writes compare content as well as timestamp', () => {
  const sent = { key: 'orders:1', companyId: 'a', updatedAt: 'same-millisecond', payload: { price: 60 }, options: { merge: true } };
  assert.equal(isSamePendingWriteRevision({ ...sent, payload: { price: 63 } }, sent), false);
  assert.equal(isSamePendingWriteRevision({ ...sent }, sent), true);
  assert.equal(isSamePendingWriteRevision({ ...sent, revision: 'new' }, sent), false);
});

const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('  const handleEditOrder ='), source.indexOf('  const getOrderCurrentPaymentDueAmount ='));

test('order edit waits for confirmation, but never waits for QR/image preparation', async () => {
  let confirm;
  const confirmation = new Promise(resolve => { confirm = resolve; });
  let saved = false;
  let warmed = false;
  const bindings = {
    isVpsStagingMode: false, firebaseUser: {}, myCompanyId: 'a',
    rawOrders: [{ id: '1', companyId: 'a', customerId: 'c' }],
    customers: [{ id: 'c', name: 'Test' }], currentUser: { id: 'employee' },
    saveDataDocument: async () => ({ queued: true }),
    requireSharedWriteConfirmation: () => confirmation,
    rememberRecentLocalWrite() {}, setRawOrders() {},
    syncCustomerLoyaltyPoints: async () => {}, rawExpenses: [],
    capitalizeFirst: value => value || '',
    scheduleOrderShareWarmup: () => { warmed = true; return new Promise(() => {}); },
    currentCompany: {}, orders: [], payments: [], products: [],
    handleEnsureOrderPayosPayment() {},
  };
  const edit = new Function(...Object.keys(bindings), `${handler}; return handleEditOrder;`)(...Object.values(bindings));
  const result = edit('1', { customerId: 'c' }).then(value => { saved = true; return value; });
  await Promise.resolve();
  assert.equal(saved, false);
  assert.equal(warmed, false);
  confirm();
  assert.equal((await result).success, true);
  assert.equal(warmed, true);
  assert.equal(saved, true);
});

test('share warmup has no artificial delay and records failures', () => {
  const warmup = source.slice(source.indexOf('const scheduleOrderShareWarmup ='), source.indexOf('const ORDER_REQUEST_SHARE_WARMUP_EVENT'));
  assert.doesNotMatch(warmup, /setTimeout|requestIdleCallback/);
  assert.match(warmup, /warmup_failed/);
});

test('in-flight sync drains a newer revision before reporting confirmation', async () => {
  const flushSource = source.slice(source.indexOf('  const flushPendingFirebaseWriteNow ='), source.indexOf('  const requireSharedWriteConfirmation ='));
  const first = { key: 'orders:1', companyId: 'a', collectionName: 'orders', documentId: '1', revision: '1', payload: { price: 60 } };
  const newer = { ...first, revision: '2', payload: { price: 63 } };
  const queue = { current: [first] };
  const commits = [];
  const bindings = {
    isVpsStagingMode: false, activeTenantScopeRef: { current: 'a' },
    normalizeTenantStorageScope: value => value,
    pendingFirebaseWritePromisesRef: { current: new Map() }, pendingFirebaseWritesRef: queue,
    doc: () => ({}), db: {}, appId: 'test', firestoreSdkFailedRef: { current: false },
    runResilientFirestoreWrite: ({ sdkWrite }) => sdkWrite(),
    setDoc: (_ref, payload) => new Promise(resolve => commits.push({ payload, resolve })),
    withTimeout: promise => promise, isFirestoreInternalAssertionError: () => false,
    persistPendingFirebaseWrites: writes => { queue.current = writes; },
    scheduleCollectionRefresh() {}, setRealtimeStatus() {}, isSamePendingWriteRevision,
  };
  const flush = new Function(...Object.keys(bindings), `${flushSource}; return flushPendingFirebaseWriteNow;`)(...Object.values(bindings));
  let finished = false;
  const result = flush('orders', '1').then(value => { finished = true; return value; });
  queue.current = [newer];
  commits[0].resolve();
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  assert.equal(finished, false);
  assert.deepEqual(queue.current, [newer]);
  assert.equal(commits.length, 2);
  assert.deepEqual(commits[1].payload, { price: 63 });
  commits[1].resolve();
  assert.equal((await result).confirmed, true);
  assert.deepEqual(queue.current, []);
});
