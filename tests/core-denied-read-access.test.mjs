import test from 'node:test';
import assert from 'node:assert/strict';
import { appFunction } from './helpers/app-source-function.mjs';
import { createReadOwnerAccess } from '../src/services/readOwnerAccess.js';
import { bindScopedReadPublication } from '../src/services/scopedReadPublication.js';
import { resetCustomerFinancialReadiness } from '../src/services/customerFinancialReadiness.js';

const isPermissionError = appFunction('isFirebasePermissionError', { getErrorText: appFunction('getErrorText') });
const denial = code => Object.assign(new Error('Synthetic access failure'), { code });
const silent = { warn() {}, error() {} };

function fixture() {
  const owner = { current: 'owner-a' }, events = [], queued = [];
  const access = createReadOwnerAccess({ ownerKey: owner.current, isOwnerCurrent: () => owner.current === 'owner-a', isPermissionError });
  const state = { loaded: { companies: true, employees: true, orders: true },
    confirmed: { tenantId: 'tenant', ownerKey: 'owner-a', collections: { orders: true } },
    financial: { status: 'ready' } };
  const refs = { lastStableCollectionDataRef: { current: new Map([['orders', [{ id: 'private' }]]]) },
    lastRealtimeSnapshotAtRef: { current: new Map([['orders', 10]]) },
    lastRealtimeServerSnapshotAtRef: { current: new Map([['orders', 10]]) },
    collectionReadinessCommittedRef: { current: { loaded: state.loaded } }, customerBootstrapCommitRef: { current: {} } };
  const invalidate = appFunction('invalidateDeniedReadOwner', { ...refs, readOwnerRef: owner, readOwnerKey: 'owner-a',
    tenantCompanyId: 'tenant', stopReadSources: () => events.push('stop'), resetCustomerFinancialReadiness,
    setLoadedCollections: update => queued.push(() => { state.loaded = update(state.loaded); }),
    setServerConfirmedCollectionState: update => queued.push(() => { state.confirmed = update(state.confirmed); }),
    setCustomerFinancialState: update => queued.push(() => { state.financial = update(state.financial); }),
  });
  access.onDenied(invalidate);
  return { owner, access, events, queued, state, refs, flush: () => { for (const apply of queued.splice(0)) apply(); },
    isReadAccessCurrent: () => access.isCurrent(), failReadAccess: (error, collection) => access.reject(error, collection) };
}

function listener(f) {
  return appFunction('handleListenerError', {
    ...f, listenerActive: true, colName: 'orders', console: silent,
    isRecoverableRealtimeError: () => { f.events.push('classify-transient'); return true; },
    shouldLogRecoverableRealtimeError: () => false, markCollectionLoaded: () => f.events.push('loaded'),
    stopCollectionListener: () => f.events.push('stop-listener'), isFirestoreInternalAssertionError: () => false,
    scheduleCollectionRefresh: () => f.events.push('retry'),
  });
}

function reader(f, error) {
  return appFunction('readCollection', { ...f, ...f.refs, console: silent,
    activeRealtimeCollectionsRef: { current: new Set() }, hasActiveRealtimeListener: () => false,
    isServerSnapshotFresh: () => false, collectionReadRevisions: new Map(), collectionReadControllers: new Map(),
    window: { setTimeout: () => 1, clearTimeout() {} }, isPreviewDataMode: false, customerSession: false,
    getTenantCollectionSources: () => [{}], withTimeout: promise => promise,
    markCollectionServerPending() {}, publicationWitness: { begin: () => 1 },
    readTenantCollectionViaRest: async () => { throw error; },
    isRecoverableCollectionReadError: () => { f.events.push('classify-transient'); return true; },
    shouldLogRecoverableCollectionRead: () => false,
    getPreviousStableCollectionValue: () => [{ id: 'retained' }], hasCollectionValue: value => value?.length > 0,
    setCollectionSafely: async (_name, _setter, value) => f.events.push(value),
    markCollectionLoaded: () => f.events.push('loaded'),
  });
}

test('existing classifier latches permission/unauthenticated variants, but never transient errors', () => {
  for (const error of ['permission-denied', 'firestore/permission-denied', 'auth/unauthenticated', 'functions/unauthenticated',
    'PERMISSION_DENIED', '401', '403'].map(denial)) {
    const f = fixture();
    assert.equal(f.access.reject(error, 'orders'), true);
    assert.equal(f.access.isCurrent(), false);
    assert.equal(f.access.getSnapshot().ownerKey, 'owner-a');
    assert.equal(f.access.reject(error), true);
    assert.deepEqual(f.events, ['stop']);
  }
  for (const code of ['unavailable', 'deadline-exceeded', 'resource-exhausted']) {
    const f = fixture(); assert.equal(f.access.reject(denial(code)), false);
    assert.equal(f.access.getSnapshot(), null); assert.deepEqual(f.events, []);
  }
});

test('actual listener error callback rejects denial before generic retry/loaded, invalidates readiness and queued publications', () => {
  const f = fixture(), durableCommands = [{ operationId: 'pending-command' }], draft = { amount: 'unsaved' };
  let rows = [{ id: 'old' }], updaterRan = false;
  const publish = bindScopedReadPublication(update => f.queued.push(() => { rows = update(rows); }), f.isReadAccessCurrent);
  publish(() => { updaterRan = true; return [{ id: 'must-not-publish' }]; });
  listener(f)(denial('firestore/permission-denied'));
  assert.deepEqual(f.events, ['stop']);
  assert.equal(f.refs.lastStableCollectionDataRef.current.size, 0);
  assert.equal(f.refs.collectionReadinessCommittedRef.current, null);
  f.flush();
  assert.equal(updaterRan, false); assert.deepEqual(rows, [{ id: 'old' }]);
  assert.deepEqual(f.state.loaded, {}); assert.deepEqual(f.state.confirmed.collections, {});
  assert.equal(f.state.financial.status, 'loading');
  assert.deepEqual(durableCommands, [{ operationId: 'pending-command' }]); assert.equal(draft.amount, 'unsaved');
  listener(f)(denial('unauthenticated')); assert.deepEqual(f.events, ['stop']);
});

test('actual one-shot read callback rejects denial before stale fallback and mark loaded', async () => {
  for (const code of ['permission-denied', 'auth/unauthenticated']) {
    const f = fixture(); await reader(f, denial(code))('orders', () => {});
    assert.deepEqual(f.events, ['stop']); assert.equal(f.access.isCurrent(), false);
  }
});

test('actual listener/read transient paths keep stale fallback and do not revoke the owner', async () => {
  const f = fixture(); listener(f)(denial('unavailable'));
  assert.deepEqual(f.events, ['classify-transient', 'loaded', 'stop-listener', 'retry']);
  assert.equal(f.access.isCurrent(), true);
  f.events.length = 0;
  await reader(f, denial('unavailable'))('orders', () => {});
  assert.deepEqual(f.events, ['classify-transient', [{ id: 'retained' }], 'loaded']);
  assert.equal(f.access.getSnapshot(), null);
});

test('actual bootstrap, synchronous subscribe failure and worker-auth callback fail closed without automatic logout', async () => {
  const f = fixture();
  const bootstrap = appFunction('loadCustomerBootstrap', { ...f, bootstrapPromise: null, bootstrapScope: 'scope',
    setCustomerCatalogState() {}, firebaseUser: { getIdToken: async () => 'synthetic' }, appId: 'synthetic',
    customerPortalBootstrap: async () => { throw denial('functions/permission-denied'); },
  });
  await bootstrap(); assert.deepEqual(f.events, ['stop']);
  const g = fixture();
  const start = appFunction('startCollectionListener', { ...g, activeRealtimeCollectionListeners: new Map(),
    getTenantCollectionSources() { throw denial('permission-denied'); },
    scheduleCollectionRefresh: () => g.events.push('retry'), console: silent });
  assert.equal(typeof start(['orders', () => {}]), 'function'); assert.deepEqual(g.events, ['stop']);
  const h = fixture(); appFunction('handleReadWorkerAuthInvalid', h)();
  assert.equal(h.access.getSnapshot().code, 'auth/unauthenticated'); assert.deepEqual(h.events, ['stop']);
});

test('old owner errors and deferred invalidation cannot revoke or erase a new owner', () => {
  const f = fixture(); f.access.reject(denial('permission-denied'));
  f.owner.current = 'owner-b';
  const ready = { orders: true }; f.state.loaded = ready;
  f.flush(); assert.equal(f.state.loaded, ready);
  const next = createReadOwnerAccess({ ownerKey: 'owner-b', isOwnerCurrent: () => f.owner.current === 'owner-b', isPermissionError });
  assert.equal(f.access.reject(denial('permission-denied')), false);
  assert.equal(next.isCurrent(), true); assert.equal(next.getSnapshot(), null);
  assert.equal(f.access.isCurrent(), false, 'a denied owner cannot be reopened');
});

test('actual cleanup closes reads/worker/witness/listeners and clears retries exactly once', () => {
  const calls = [], close = name => ({ close: () => calls.push(name) });
  const ui = close('ui'), worker = close('worker'), witness = close('witness');
  const read = new AbortController(), overflow = new AbortController();
  const collections = new Set(['orders']), timers = new Map([['orders', 41]]), controllers = new Map([['orders', overflow]]);
  const window = { clearTimeout: id => calls.push(['timeout', id]), clearInterval: id => calls.push(['interval', id]) };
  const env = { window, customerSession: false, startupNotificationBarrier: { dispose: () => calls.push('barrier') },
    startupUiAdmission: ui, startupUiAdmissionRef: { current: ui }, restReadAdmission: close('admission'),
    publicationScheduler: close('scheduler'), readWorker: worker, publicationWitness: witness,
    collectionCommitWitnessRef: { current: witness }, readWorkerControllerRef: { current: worker },
    activateForegroundRealtimeRef: { current() {} }, collectionReadControllers: new Map([['orders', read]]),
    pendingLoadedCollectionMarks: new Set(['orders']), pendingServerConfirmedCollectionMarks: new Set(['orders']),
    unsubscribeCollectionListeners: [() => calls.push('unsubscribe')], realtimeUnsubscribersRef: { current: [] },
    activeRealtimeCollectionsRef: { current: new Set(['orders']) }, foregroundReadOnlyCollectionNames: collections,
    foregroundReadOnlyTimers: timers, foregroundReadOnlyControllers: controllers,
    realtimeListenerStartTimersRef: { current: [42] }, refreshCollectionsInFlightRef: { current: true },
    forceRefreshCollectionRef: { current() {} }, collectionRefreshTimersRef: { current: new Map([['orders', [43]]]) } };
  env.cancelForegroundReadOnlyCollection = appFunction('cancelForegroundReadOnlyCollection', env);
  const run = new Function(...Object.keys(env), `let cancelled=false,loadedCollectionMarkTimer=44,
    serverConfirmedCollectionMarkTimer={},foregroundCollectionRecency=[],refreshTimer=45;
    return (${appFunction('stopReadSources').toString()});`)(...Object.values(env));
  run(); const count = calls.length; run(); assert.equal(calls.length, count);
  for (const name of ['worker', 'witness', 'ui', 'admission', 'scheduler', 'barrier', 'unsubscribe']) assert.ok(calls.includes(name), name);
  for (const id of [41, 42, 43, 44]) assert.ok(calls.some(value => Array.isArray(value) && value[0] === 'timeout' && value[1] === id));
  assert.equal(read.signal.aborted, true); assert.equal(overflow.signal.aborted, true);
  assert.equal(env.collectionRefreshTimersRef.current.size, 0); assert.equal(env.activeRealtimeCollectionsRef.current.size, 0);
});

test('actual refresh scheduling ignores denied owners and old timers cannot call a replacement owner', () => {
  const f = fixture(), callbacks = []; let reads = 0;
  const accessRef = { current: f.access };
  const refresh = appFunction('scheduleCollectionRefresh', { readAccessRef: accessRef,
    window: { setTimeout: callback => { callbacks.push(callback); return callbacks.length; }, clearTimeout() {} },
    collectionRefreshLastScheduledAtRef: { current: new Map() }, collectionRefreshTimersRef: { current: new Map() },
    lastRealtimeServerSnapshotAtRef: { current: new Map() }, isServerSnapshotFresh: () => false,
    forceRefreshCollectionRef: { current: () => { reads++; } } });
  refresh('orders', [10]); assert.equal(callbacks.length, 1);
  f.access.reject(denial('permission-denied')); callbacks[0](); refresh('orders'); assert.equal(reads, 0);
  assert.equal(callbacks.length, 1);
  f.owner.current = 'owner-b'; accessRef.current = createReadOwnerAccess({ ownerKey: 'owner-b', isOwnerCurrent: () => true, isPermissionError });
  callbacks[0](); assert.equal(reads, 0);
  refresh('orders'); callbacks.at(-1)(); assert.equal(reads, 1);
});
