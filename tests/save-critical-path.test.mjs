import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isSamePendingWriteRevision } from '../src/utils/pendingWriteRevision.js';
import { canSaveLocallyFirst, coalescePendingWrite, isReplayableJson } from '../src/utils/localFirstSave.js';
import { ATOMIC_SAVE_COLLECTION, expandPendingWrites, mergeAtomicWrites, validateAtomicWrites } from '../src/utils/atomicSave.js';

test('atomic queue retains linked documents across edits and rejects unsafe commands', () => {
  const initial = [
    { collectionName: 'orders', documentId: 'o', payload: { companyId: 'a', customerId: 'c', amount: 60 }, options: {} },
    { collectionName: 'expenses', documentId: 'e', payload: { companyId: 'a', amount: 3 }, options: {} },
  ];
  const next = mergeAtomicWrites(initial, [{ collectionName: 'orders', documentId: 'o', payload: { companyId: 'a', amount: 63 }, options: { merge: true } }]);
  assert.equal(next.length, 2);
  assert.equal(next[0].payload.customerId, 'c');
  assert.equal(next[0].payload.amount, 63);
  assert.equal(next[0].options.merge, false);
  assert.deepEqual(expandPendingWrites([{ collectionName: ATOMIC_SAVE_COLLECTION, payload: { writes: next } }]), next);
  assert.equal(validateAtomicWrites(next, 'a'), next);
  assert.throws(() => validateAtomicWrites(next, 'b'));
  assert.throws(() => validateAtomicWrites([...next, next[0]], 'a'));
  assert.throws(() => validateAtomicWrites([{ ...next[0], collectionName: 'employees' }], 'a'));
});

test('local-first policy excludes dependent financial and identity writes and SDK objects', () => {
  for (const collection of ['products', 'orderRequests', 'warehouseDispatches', 'warehouseStockCounts', 'pricingInputs', 'pricingRules', 'pricingScenarios', 'deliveryReports', 'customers', 'assets', 'holidays']) {
    assert.equal(canSaveLocallyFirst(collection, { id: '1', items: [], amount: 0 }), true);
  }
  for (const collection of ['employees', 'orders', 'payments', 'expenses', 'warehouseImports', 'financials', 'companies']) {
    assert.equal(canSaveLocallyFirst(collection, {}), false);
  }
  assert.equal(canSaveLocallyFirst('products', {}, { mergeFields: ['name'] }), false);
  assert.equal(canSaveLocallyFirst('customers', { account: { password: 'test' } }), false);
  assert.equal(isReplayableJson({ date: new Date() }), false);
  assert.equal(isReplayableJson({ value: Infinity }), false);
  assert.equal(isReplayableJson({ value: undefined }), false);
  const cycle = {}; cycle.self = cycle;
  assert.equal(isReplayableJson(cycle), false);
});

test('queued create then partial edits preserve all data and replacement semantics after reload', () => {
  const created = { payload: { name: 'Product', price: 60, units: { buy: 'kg', sell: 'con' } }, options: {} };
  const updated = coalescePendingWrite(created, { price: 63, units: { sell: 'kg' } }, { merge: true });
  const restored = JSON.parse(JSON.stringify(updated));
  assert.deepEqual(restored, { payload: { name: 'Product', price: 63, units: { buy: 'kg', sell: 'kg' } }, options: { merge: false } });
  assert.deepEqual(coalescePendingWrite(restored, { name: 'Replacement' }, {}), { payload: { name: 'Replacement' }, options: {} });
});

test('queued patches preserve map leaves, replace arrays and honor explicit empty maps', () => {
  const first = { payload: { name: 'P', units: { buy: 'kg' }, items: [1, 2] }, options: { merge: true } };
  const next = coalescePendingWrite(first, { units: { sell: 'con' }, items: [3] }, { merge: true });
  assert.deepEqual(next.payload, { name: 'P', units: { buy: 'kg', sell: 'con' }, items: [3] });
  assert.deepEqual(coalescePendingWrite(next, { units: {} }, { merge: true }).payload.units, {});
  assert.throws(() => coalescePendingWrite({ payload: { units: {} }, options: { merge: true } }, { units: { buy: 'kg' } }, { merge: true }));
});

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
const saveSource = source.slice(source.indexOf('  const saveDataDocument ='), source.indexOf('\n  useEffect(() => {', source.indexOf('  const saveDataDocument =')));

test('actual shared save returns after local persistence without waiting for remote ACK', async () => {
  const events = [];
  const spans = [];
  let failStorage = false;
  const bindings = {
    assertFirebaseWriteAllowed() {}, isPerformanceMonitorEnabled: () => true,
    createPerformanceSpan: () => ({ end: value => spans.push(value), fail() {} }),
    currentUser: { companyId: 'a' }, currentCompany: {},
    COMPANY_SCOPED_DATA_COLLECTION_NAMES: new Set(['products']),
    sanitizeFirestoreWritePayload: value => value,
    lastFirestoreWriteCollectionsRef: { current: [] }, activeTenantScopeRef: { current: 'a' },
    isVpsStagingMode: false, canSaveLocallyFirst,
    enqueuePendingFirebaseWrite: options => {
      events.push('persist');
      assert.equal(options.durable, true);
      if (failStorage) throw new Error('Storage full');
      return { queued: true, companyId: 'a', id: 'p' };
    },
    rememberRecentLocalWrite: () => events.push('remember'),
    applyLocalCollectionWrite: () => events.push('ui'),
    flushPendingFirebaseWriteNow: () => { events.push('remote'); return new Promise(() => {}); },
  };
  const save = new Function(...Object.keys(bindings), `${saveSource}; return saveDataDocument;`)(...Object.values(bindings));
  assert.equal((await save('products', 'p', { price: 60 })).queued, true);
  assert.deepEqual(events, ['persist', 'remember', 'ui', 'remote']);
  assert.equal(spans[0].remoteConfirmed, false);
  assert.equal(spans[0].writeSource, 'durable-local-queue');
  events.length = 0;
  failStorage = true;
  await assert.rejects(save('products', 'p', { price: 63 }), /Storage full/);
  assert.deepEqual(events, ['persist']);
});

test('actual enqueue keeps a durable merged revision and rejects full storage without mutating queue', () => {
  const start = source.indexOf('  const enqueuePendingFirebaseWrite =');
  const enqueueSource = source.slice(start, source.indexOf('  const rememberRecentLocalWrite =', start));
  const queue = { current: [] };
  const storage = new Map();
  let full = false;
  const bindings = {
    firebaseUser: { uid: 'writer' },
    activeTenantScopeRef: { current: 'a' }, pendingFirebaseWritesRef: queue,
    coalescePendingWrite, ATOMIC_SAVE_COLLECTION, mergeAtomicWrites, getFriendlyFirebaseErrorMessage: () => '',
    getTenantStorageKey: (key, company) => `${key}:${company}`, PENDING_FIREBASE_WRITES_STORAGE_KEY: 'pending',
    window: { localStorage: {
      setItem: (key, value) => { if (full) throw new Error('QuotaExceeded'); storage.set(key, value); },
      getItem: key => storage.get(key),
    } },
    persistPendingFirebaseWrites: writes => { queue.current = writes; },
    setRealtimeStatus() {}, isFirestoreInternalAssertionError: () => false,
  };
  const enqueue = new Function(...Object.keys(bindings), `${enqueueSource}; return enqueuePendingFirebaseWrite;`)(...Object.values(bindings));
  enqueue({ collectionName: 'products', documentId: 'p', payload: { name: 'P', price: 60 }, durable: true });
  enqueue({ collectionName: 'products', documentId: 'p', payload: { price: 63 }, options: { merge: true }, durable: true });
  assert.equal(queue.current.length, 1);
  assert.deepEqual(JSON.parse(storage.get('pending:a'))[0].payload, { name: 'P', price: 63 });
  const before = queue.current;
  full = true;
  assert.throws(() => enqueue({ collectionName: 'products', documentId: 'p', payload: { price: 70 }, durable: true }), /QuotaExceeded/);
  assert.equal(queue.current, before);
});
const handler = source.slice(source.indexOf('  const handleEditOrder ='), source.indexOf('  const getOrderCurrentPaymentDueAmount ='));

test('employee profile retry uses one document and never persists login credentials', async () => {
  const employeeSource = source.slice(source.indexOf('  const handleAddEmployee ='), source.indexOf('  const handleEditEmployee ='));
  const records = new Map();
  const employees = [];
  let writes = 0;
  const bindings = {
    isVpsStagingMode: false, firebaseUser: {}, myCompanyId: 'a', rawEmployees: employees,
    normalizeEmployeePosition: value => value, normalizeEmployeeLoginPhone: value => value,
    isSameLoginPhone: (a, b) => a === b, isOwnerPosition: () => false,
    db: {}, appId: 'test', doc: (...args) => args.at(-1),
    sanitizeFirestoreWritePayload: value => value,
    runTransaction: async (_db, callback) => callback({
      get: async id => ({ exists: () => records.has(id), data: () => records.get(id) }),
      set: (id, data) => { records.set(id, data); writes += 1; },
    }),
    setRawEmployees: callback => { const next = callback(employees); employees.splice(0, employees.length, ...next); },
  };
  const create = new Function(...Object.keys(bindings), `${employeeSource}; return handleAddEmployee;`)(...Object.values(bindings));
  const data = { clientMutationId: 'request-1', name: 'Test', phone: '0900000000', position: 'Sales', account: { password: 'secret' }, loginPassword: 'secret' };
  assert.equal((await create(data)).success, true);
  assert.equal((await create({ ...data, name: 'Changed retry' })).success, true);
  assert.equal(writes, 1);
  assert.equal(employees[0].name, 'Test');
  assert.equal(records.get('request-1').account, undefined);
  assert.equal(records.get('request-1').loginPassword, undefined);
  assert.equal((await create({ ...data, clientMutationId: 'request-2' })).success, false);
});

test('payroll double tap starts only one server lock and clears busy after rejection', async () => {
  const start = source.indexOf('  const handleConfirmPayrollLock =');
  const lockSource = source.slice(start, source.indexOf('  const openPayrollAdjustmentDialog =', start));
  let resolve;
  let calls = 0;
  const guard = { current: false };
  const bindings = {
    canLockSelectedPayrollPeriod: true, isLockingPayroll: false, payrollLockInFlightRef: guard,
    buildPayrollLockPayload: () => ({ period: {}, snapshots: [{}] }),
    setIsLockingPayroll() {}, setPayrollLockStatus() {},
    onLockPayrollPeriod: () => { calls += 1; return new Promise(done => { resolve = done; }); },
  };
  const lock = new Function(...Object.keys(bindings), `${lockSource}; return handleConfirmPayrollLock;`)(...Object.values(bindings));
  const first = lock();
  await lock();
  assert.equal(calls, 1);
  resolve({ success: false, message: 'Denied' });
  await first;
  assert.equal(guard.current, false);
});

test('order edit accepts durable group immediately, prepares share only after confirmation', async () => {
  let confirm;
  const confirmation = new Promise(resolve => { confirm = resolve; });
  let saved = false;
  let warmed = false;
  const bindings = {
    isVpsStagingMode: false, firebaseUser: {}, myCompanyId: 'a',
    rawOrders: [{ id: '1', companyId: 'a', customerId: 'c' }],
    customers: [{ id: 'c', name: 'Test' }], currentUser: { id: 'employee' },
    saveDataDocument: async () => ({ queued: true }),
    saveAtomicDocuments: () => ({ queued: true }),
    flushPendingFirebaseWriteNow: () => confirmation,
    ATOMIC_SAVE_COLLECTION, activeTenantScopeRef: { current: 'a' },
    expandPendingWrites, pendingFirebaseWritesRef: { current: [] },
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
  assert.equal(saved, true);
  assert.equal(warmed, false);
  confirm();
  assert.equal((await result).success, true);
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
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
    ATOMIC_SAVE_COLLECTION, expandPendingWrites,
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
