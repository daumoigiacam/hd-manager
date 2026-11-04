import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getEventListeners } from 'node:events';
import { setImmediate as nextTurn, setTimeout as timerTurn } from 'node:timers/promises';
import test from 'node:test';
import { parseExpression } from '@babel/parser';
import { appObject } from './helpers/app-source-function.mjs';
import { collectTenantRestQuery } from '../src/services/firestoreRestPagination.js';
import { createRequestAdmission } from '../src/data/requestAdmission.js';
import { createReadOwnerAccess } from '../src/services/readOwnerAccess.js';
import { CUSTOMER_FINANCIAL_SOURCES } from '../src/services/customerFinancialReadiness.js';
import {createCollectionCommitWitness} from '../src/services/collectionCommitWitness.js';
import {parseFirebaseResponseJsonInBackground} from '../src/services/backgroundJsonParser.js';
import { createRealtimeSnapshotItemsCollector, createRealtimeSnapshotPipeline } from '../src/services/realtimeSnapshotItems.js';
import { canUseFirestoreReadWorker } from '../src/services/readWorkerPolicy.js';
import { hasActiveRealtimeListener } from '../src/services/firestoreResilience.js';
import {
  getRealtimeDataChangeCount, isServerConfirmedRealtimeSnapshot,
  isServerSnapshotFresh, shouldApplyRealtimeSnapshot,
} from '../src/services/realtimeFreshness.js';
import {
  buildFirebaseRestCollectionQueryUrl, buildFirebaseRestDocumentUrl,
} from '../src/config/firebase-rest-runtime.js';

// Parse App through the existing helper, but execute only its extracted readers,
// listener callback and cleanup. No React, Firebase client or real fetch is loaded.
const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const expression = name => {
  const node = appObject(name);
  return source.slice(node.start, node.end);
};
const scopeStart = source.indexOf('const collectionReadRevisions =');
assert.ok(scopeStart >= 0, 'Missing collection read revision scope');
const cleanupStart = appObject('stopReadSources');
assert.ok(cleanupStart, 'Missing tenant cleanup');
const cleanupOffset = cleanupStart.start;
const cleanupEnd = cleanupStart.end;
assert.ok(cleanupEnd > cleanupOffset, 'Missing tenant effect dependency boundary');
const cleanup = source.slice(cleanupOffset, cleanupEnd).trim().replace(/;$/, '');
assert.equal(parseExpression(cleanup).type, 'ArrowFunctionExpression');

const projectId = 'demo-rest-integration';
const appId = 'rest-fixture';
const readTime = '2026-10-03T01:00:00.123456Z';
const parent = `projects/${projectId}/databases/(default)/documents/artifacts/${appId}/public/data`;
const noop = () => {};
const ref = current => ({ current });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => body, text: async () => status>=200&&status<300?JSON.stringify(body):'fixture transport error',
});
const fixture = (size, companyId = 'company-a', collectionName = 'orders') => Array.from({ length: size }, (_, index) => ({
  name: `${parent}/${collectionName}/doc-${String(index).padStart(4, '0')}`,
  fields: {
    companyId: { stringValue: companyId },
    id: { stringValue: `stored-id-${index}` },
    amount: { integerValue: String(index + 1) },
    details: { mapValue: { fields: { enabled: { booleanValue: true } } } },
  },
}));
const expected = documents => documents.map(document => ({
  id: document.name.split('/').at(-1),
  data: {
    companyId: document.fields.companyId.stringValue, id: document.fields.id.stringValue,
    amount: Number(document.fields.amount.integerValue), details: { enabled: true },
  },
}));
const pageResponse = (documents, body) => {
  const cursor = body.structuredQuery.startAt?.values[0].referenceValue;
  const remaining = documents.filter(document => !cursor || document.name > cursor);
  const page = remaining.slice(0, body.structuredQuery.limit);
  return response(page.length ? page.map(document => ({ document, readTime })) : [{ readTime, done: false }]);
};
const waitUntil = async predicate => {
  // REST decoding yields through real zero-delay timers. A fixed number of
  // setImmediate turns can all run before a timer is due on Linux/Node22.
  // This watchdog only waits for async progress; h.clock still owns the exact
  // 9s/120s business deadlines and every abort/publication assertion below.
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline) {
    if (predicate()) return;
    await timerTurn(0);
  }
  assert.fail('Extracted App operation did not reach the expected state');
};
const snapshot = (items, metadata = {}, changes = items.length) => ({
  metadata: { fromCache: false, hasPendingWrites: false, ...metadata },
  docs: items.map(({ id, data }) => ({ id, data: () => data })),
  docChanges: () => Array.from({ length: changes }, () => ({})),
});

function incrementalSnapshot(items, changes = [], metadata = {}) {
  const reads = [];
  const docs = items.map(({ id, data }) => ({ id, data: () => { reads.push(id); return data; } }));
  return {
    reads,
    snapshot: {
      query: {},
      metadata: { fromCache: false, hasPendingWrites: false, ...metadata },
      docs,
      docChanges: () => changes.map(([type, id, oldIndex, newIndex]) => ({
        type, oldIndex, newIndex,
        doc: docs.find(doc => doc.id === id) || { id, data: () => undefined },
      })),
    },
  };
}

function createClock() {
  let now = 0;
  let sequence = 0;
  const timers = new Map();
  return {
    timers,
    get now() { return now; },
    setTimeout(callback, delay) {
      const id = ++sequence;
      timers.set(id, { callback, at: now + delay, delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    async advance(milliseconds) {
      const target = now + milliseconds;
      while (true) {
        const due = [...timers].filter(([, timer]) => timer.at <= target)
          .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].callback();
        await nextTurn();
      }
      now = target;
    },
  };
}

function createHarness({ companyId = 'company-a', customer = false, role = 'sales', preview = false, native = false,
  fetchPage = () => response([{ readTime }]), sdkRead, tokenRead, stable = [], onSubscribeThrowAt = Infinity, onSubscribe=noop, worker = null,deferPublication=false,nativeConcurrency=1 } = {}) {
  const clock = createClock();
  const calls = [];
  const tokens = [];
  const sdkCalls = [];
  const scans = [];
  const events = { publications: [], confirmed: [], pending: [], loaded: [], statuses: [], stable: [], errors: [] };
  events.schedulerClosures=0;
  const committed={},pendingCommits=[];
  const publicationWitness=createCollectionCommitWitness({getCommittedStates:()=>committed,onCommitted:name=>events.confirmed.push(name),
    schedule:clock.setTimeout,cancel:clock.clearTimeout});
  const active = new Set();
  const serverAt = new Map();
  const snapshotAt = new Map();
  const subscriptions = [];
  const bindings = {
    createReadOwnerAccess,retryCustomerBootstrapRef:ref(null),customerBootstrapCommitRef:ref(null),
    CUSTOMER_FINANCIAL_SOURCES,
    startupUiAdmission:{close:noop},startupUiAdmissionRef:ref(null),
    createProjectionScheduler:()=>({yieldTask:()=>new Promise(resolve=>clock.setTimeout(resolve,0)),close:()=>events.schedulerClosures++}),
    createRequestAdmission,NATIVE_REST_READ_CONCURRENCY:nativeConcurrency,activeTenantScopeRef:ref(companyId),
    readWorker:worker,readWorkerControllerRef:ref(worker),canUseFirestoreReadWorker,parseFirebaseResponseJsonInBackground,isNativeRuntime:()=>native,
    appId, tenantCompanyId: companyId, sessionCustomerId: customer ? 'customer-a' : '',
    customerSession: customer, currentUser: { id: 'employee-a', employeeId: 'employee-a', role },
    db: {}, activeFirebaseConfig: { projectId }, isVpsMode: false, isPreviewDataMode: preview,
    firebaseUser: { getIdToken: async refresh => {
      tokens.push(refresh);
      return tokenRead ? tokenRead(refresh) : `${companyId}-${refresh ? 'refreshed' : 'original'}`;
    } },
    auth: null, buildFirebaseRestCollectionQueryUrl, buildFirebaseRestDocumentUrl,
    collection: (_, ...path) => ({ kind: 'collection', path }),
    doc: (_, ...path) => ({ kind: 'doc', path }),
    firebaseQuery: (target, ...constraints) => ({ kind: 'query', target, constraints }),
    firebaseQueryEqual: (left, right) => JSON.stringify(left) === JSON.stringify(right),
    firebaseWhere: (field, op, value) => ({ kind: 'where', field, op, value }),
    firebaseOrderBy: (field, direction) => ({ kind: 'orderBy', field, direction }),
    firebaseLimit: count => ({ kind: 'limit', count }),
    isOwnerRoleValue: value => ['owner', 'company_owner', 'business_owner'].includes(value),
    firebaseGetDocs: async target => {
      sdkCalls.push(target);
      assert.ok(sdkRead, 'Unexpected SDK collection transport');
      return sdkRead(target);
    },
    firebaseGetDoc: async target => {
      sdkCalls.push(target);
      assert.ok(sdkRead, 'Unexpected SDK document transport');
      return sdkRead(target);
    },
    fetch: async (url, init) => {
      const call = { url, ...init, body: init.body ? JSON.parse(init.body) : null };
      calls.push(call);
      if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return fetchPage(call, calls.length);
    },
    collectTenantRestQuery: options => {
      scans.push(options);
      return collectTenantRestQuery(options);
    },
    createRealtimeSnapshotItemsCollector, createRealtimeSnapshotPipeline, hasActiveRealtimeListener, isServerSnapshotFresh,
    CORE_DATA_COLLECTION_NAMES: ['companies', 'employees'],
    onSnapshot: (target, options, next, error) => {
      onSubscribe();
      if (subscriptions.length === onSubscribeThrowAt) throw new Error('fixture subscribe failed');
      const sub = { target, options, next, error, stopped: false };subscriptions.push(sub);
      return () => { sub.stopped = true; };
    },
    isRecoverableRealtimeError: () => false, isFirestoreInternalAssertionError: () => false,
    shouldLogRecoverableRealtimeError: () => false, scheduleCollectionRefresh: noop,
    isServerConfirmedRealtimeSnapshot, shouldApplyRealtimeSnapshot, getRealtimeDataChangeCount,
    activeRealtimeCollectionsRef: ref(active), lastRealtimeServerSnapshotAtRef: ref(serverAt),
    lastRealtimeSnapshotAtRef: ref(snapshotAt),
    recentLocalWritesRef: ref(new Map()), recentLocalDeletesRef: ref(new Map()),
    markCollectionLoaded: name => events.loaded.push(name),
    markCollectionServerPending: name => events.pending.push(name),
    markCollectionServerConfirmed: name => events.confirmed.push(name),
    publicationWitness,collectionCommitWitnessRef:ref(publicationWitness),
    applyCollectionItems: (name, setter, items, isObject, parser, options) => {
      events.publications.push({ name, items, isObject, parser, options });
      setter(items);
      const commit=()=>{committed[name]=items;publicationWitness.expectCommit(name,options?.serverCommitVersion,items);publicationWitness.confirmCommitted(committed)};
      if(deferPublication)pendingCommits.push(commit);else commit();
    },
    updateRealtimeStatusLightly: status => events.statuses.push(status),
    setRealtimeStatus: status => events.statuses.push(status),
    getPreviousStableCollectionValue: () => stable,
    shouldLogRecoverableCollectionRead: () => false,
    setCollectionSafely: (name, setter, items, isObject, options) => {
      events.stable.push({ name, items, isObject, options });
      setter(items);
    },
    getFriendlyFirebaseErrorMessage: error => error.message,
    console: { warn: noop, error: (...args) => events.errors.push(args) },
    window: { setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, clearInterval: noop },
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    activateForegroundRealtimeRef: ref(noop),
    pendingLoadedCollectionMarks: new Set(), pendingServerConfirmedCollectionMarks: new Set(),
    unsubscribeCollectionListeners: [], realtimeUnsubscribersRef: ref([]),
    foregroundReadOnlyTimers: new Map(), foregroundReadOnlyControllers: new Map(), foregroundReadOnlyCollectionNames: new Set(),
    baselineCollectionNames: new Set(), foregroundRealtimeCollectionNames: new Set(),
    realtimeListenerStartTimersRef: ref([]), refreshCollectionsInFlightRef: ref(false),
    forceRefreshCollectionRef: ref(noop), collectionRefreshTimersRef: ref(new Map()),
  };
  const declarations = [
    'customerOwnedCollections', 'customerInboxCollectionNames', 'collectionReadRevisions', 'collectionReadControllers', 'restReadAdmission',
    'fromFirestoreRestValue', 'fromFirestoreRestFields', 'buildFirestoreRestDocumentUrl',
    'normalizeFirestoreSnapshotData', 'getTenantCollectionSources', 'getSnapshotItems',
    'readTenantCollectionViaRest', 'hasCollectionValue', 'isRecoverableCollectionReadError', 'withTimeout', 'readCollection',
  ].map(name => `const ${name} = ${expression(name)};`).join('\n');
  const runtime = new Function(...Object.keys(bindings), `"use strict";
    let cancelled = ${expression('cancelled')};
    const readOwnerKey='fixture-session',readOwnerRef={current:'fixture-session'};
    const getErrorText=${expression('getErrorText')};
    const isFirebasePermissionError=${expression('isFirebasePermissionError')};
    const readAccess=createReadOwnerAccess({ownerKey:readOwnerKey,
      isOwnerCurrent:()=>readOwnerRef.current===readOwnerKey,isPermissionError:isFirebasePermissionError});
    const isReadAccessCurrent=${expression('isReadAccessCurrent')};
    const failReadAccess=${expression('failReadAccess')};
    const startupNotificationBarrier = null;
    let loadedCollectionMarkTimer = null;
    let serverConfirmedCollectionMarkTimer = null;
    let refreshTimer = null;
    let publicationScheduler;
    const yieldPublicationWork = ${expression('yieldPublicationWork')};
    let foregroundCollectionRecency = [];
    ${declarations}
    const activeRealtimeCollectionListeners = new Map();
    const stopCollectionListener = ${expression('stopCollectionListener')};
    const startCollectionListener = ${expression('startCollectionListener')};
    const cancelForegroundReadOnlyCollection = ${expression('cancelForegroundReadOnlyCollection')};
    const scheduleForegroundReadOnlyCollection = ${expression('scheduleForegroundReadOnlyCollection')};
    const stopReadSources = ${cleanup};
    const removeDenialCleanup=readAccess.onDenied(stopReadSources);
    return {
      readTenantCollectionViaRest, readCollection, getTenantCollectionSources,
      scheduleOverflow: scheduleForegroundReadOnlyCollection, cancelOverflow: cancelForegroundReadOnlyCollection,
      startListener: startCollectionListener, stopListener: stopCollectionListener,
      revisions: collectionReadRevisions, controllers: collectionReadControllers,
      readAdmission: restReadAdmission,
      dispose(){removeDenialCleanup();stopReadSources();},
      listener(colName, sourceCount = 1) {
        const collectionRefs = Array.from({ length: sourceCount }, () => ({}));
        const workerEligible = Boolean(readWorker && canUseFirestoreReadWorker(colName, sourceCount, customerSession));
        const sourceItemsByIndex = new Map();
        const committedSourceItemsByIndex = new Map();
        const serverConfirmedSourceIndexes = new Set();
        const snapshotItemCollectors = ${expression('snapshotItemCollectors')};
        const setterCalls = [];
        const setFn = items => setterCalls.push(items);
        const isObject = false;
        const parser = null;
        let hasAppliedDataSnapshot = false;
        let hasServerPublication = false;
        let listenerActive = true;
        const applySnapshot = ${expression('applySnapshot')};
        const listener = (snapshot, sourceIndex = 0) => applySnapshot(snapshot, sourceIndex);
        listener.sourceItems = sourceItemsByIndex;
        listener.sources = collectionRefs;
        listener.setterCalls = setterCalls;
        return listener;
      },
    };
  `)(...Object.values(bindings));
  return { ...runtime, calls, tokens, sdkCalls, scans, events, clock, active, serverAt, snapshotAt, subscriptions,
    commitPublications:()=>pendingCommits.splice(0).forEach(commit=>commit()) };
}

test('actual REST and main-SDK listener paths confirm data only after their publication commits',async()=>{
 const h=createHarness({deferPublication:true,fetchPage:()=>response(fixture(2).map(document=>({document,readTime})))});
 const values=[];await h.readCollection('orders',value=>values.push(value));
 assert.equal(values.length,1);assert.deepEqual(h.events.confirmed,[],'received/queued REST rows are not a React commit');
 h.commitPublications();assert.deepEqual(h.events.confirmed,['orders']);
 const listener=h.listener('payments');await listener(snapshot(expected(fixture(1))));
 assert.deepEqual(h.events.confirmed,['orders']);h.commitPublications();assert.deepEqual(h.events.confirmed,['orders','payments']);h.dispose();
});

test('actual business listener yields to input before publication and invalidates disposed work', async () => {
  const h=createHarness(),items=expected(fixture(400));
  const setterCalls=[];h.startListener(['orders',data=>setterCalls.push(data),false,null]);
  h.subscriptions[0].next(incrementalSnapshot(items).snapshot);
  assert.equal(h.events.publications.length,0);assert.deepEqual(h.events.confirmed,[]);
  let inputHandled=false;
  h.clock.setTimeout(()=>{inputHandled=true;assert.equal(setterCalls.length,0)},0);
  await h.clock.advance(0);
  assert.equal(inputHandled,true);assert.deepEqual(setterCalls,[items]);
  assert.deepEqual(h.events.confirmed,['orders']);
  const fresh=items.map(item=>({...item,data:{...item.data,amount:500}}));
  h.subscriptions[0].next(incrementalSnapshot(fresh).snapshot);
  h.stopListener('orders');await h.clock.advance(0);
  assert.equal(setterCalls.length,1);assert.equal(h.subscriptions[0].stopped,true);
  h.subscriptions[0].next(incrementalSnapshot(fresh).snapshot);await h.clock.advance(0);
  assert.equal(setterCalls.length,1);
});

test('tenant cleanup releases the lazily created publication task scheduler',async()=>{
 const h=createHarness(),items=expected(fixture(80));
 h.startListener(['orders',()=>{},false,null]);h.subscriptions[0].next(incrementalSnapshot(items).snapshot);
 await h.clock.advance(0);assert.equal(h.events.publications.length,1);assert.equal(h.events.schedulerClosures,0);
 h.dispose();assert.equal(h.events.schedulerClosures,1);
});

test('new SDK subscription is pending before physical subscribe, dedupes reopen calls, and cannot confirm cached/pending-write rows',async()=>{
 let physical=0;
 const h=createHarness({deferPublication:true,onSubscribe:()=>{physical++;assert.ok(h.events.pending.includes('orders'));}});
 const values=[],binding=['orders',items=>values.push(items),false,null];
 h.startListener(binding);const count=h.events.pending.length;h.startListener(binding);
 assert.equal(physical,1);assert.equal(h.events.pending.length,count,'existing listeners do not begin a new freshness generation');
 const items=expected(fixture(1));
 h.subscriptions[0].next(incrementalSnapshot(items,[],{fromCache:true}).snapshot);await h.clock.advance(0);
 assert.deepEqual(h.events.confirmed,[]);assert.equal(values.length,0);
 h.subscriptions[0].next(incrementalSnapshot(items,[],{hasPendingWrites:true}).snapshot);await h.clock.advance(0);
 assert.equal(values.length,1);h.commitPublications();assert.deepEqual(h.events.confirmed,[]);
 h.subscriptions[0].next(incrementalSnapshot(items).snapshot);await h.clock.advance(0);
 assert.deepEqual(h.events.confirmed,[],'server receipt is not a committed publication');
 h.commitPublications();assert.deepEqual(h.events.confirmed,['orders'],'unchanged server ACK must replace the unset start witness');
 h.dispose();
});

test('REST start marks pending before token/fetch and retires the previous uncommitted witness',async()=>{
 const gate=deferred();let attempt=0;
 const h=createHarness({deferPublication:true,fetchPage:()=>{
  assert.ok(h.events.pending.includes('orders'));return ++attempt===1?response(fixture(1).map(document=>({document,readTime}))):gate.promise;
 }});
 await h.readCollection('orders',noop,false,null,{force:true});assert.deepEqual(h.events.confirmed,[]);
 const next=h.readCollection('orders',noop,false,null,{force:true});await waitUntil(()=>h.calls.length===2);
 h.commitPublications();assert.deepEqual(h.events.confirmed,[],'the earlier generation cannot confirm after the replacement physical read starts');
 gate.resolve(response(fixture(1).map(document=>({document,readTime}))));await next;
 assert.deepEqual(h.events.confirmed,[]);h.commitPublications();assert.deepEqual(h.events.confirmed,['orders']);h.dispose();
});

test('live customer financial updates become pending without reopening and only a committed server ACK restores confirmation',async()=>{
 const h=createHarness({customer:true,deferPublication:true});h.startListener(['orders',noop,false,null]);
 const first=expected(fixture(1));h.subscriptions[0].next(incrementalSnapshot(first).snapshot);await h.clock.advance(0);h.commitPublications();
 assert.deepEqual(h.events.confirmed,['orders']);const pendingCount=h.events.pending.length;
 const next=first.map(item=>({...item,data:{...item.data,amount:999}}));
 h.subscriptions[0].next(incrementalSnapshot(next,[['modified',next[0].id,0,0]],{hasPendingWrites:true}).snapshot);await h.clock.advance(0);
 assert.equal(h.events.pending.length,pendingCount+1,'an existing customer listener must invalidate financial readiness before changed rows publish');
 h.commitPublications();assert.deepEqual(h.events.confirmed,['orders'],'pending writes are never a fresh financial baseline');
 h.subscriptions[0].next(incrementalSnapshot(next).snapshot);await h.clock.advance(0);
 assert.deepEqual(h.events.confirmed,['orders']);h.commitPublications();assert.deepEqual(h.events.confirmed,['orders','orders']);h.dispose();
});

test('customer offline cache receipt invalidates freshness without replacing rows and needs a new committed server witness',async()=>{
 const h=createHarness({customer:true,deferPublication:true});h.startListener(['orders',noop,false,null]);
 const first=expected(fixture(1));h.subscriptions[0].next(incrementalSnapshot(first).snapshot);await h.clock.advance(0);h.commitPublications();
 assert.deepEqual(h.events.confirmed,['orders']);const pendingCount=h.events.pending.length;
 const cached=first.map(item=>({...item,data:{...item.data,amount:999}}));
 h.subscriptions[0].next(incrementalSnapshot(cached,[],{fromCache:true}).snapshot);await h.clock.advance(0);
 assert.equal(h.events.pending.length,pendingCount+1);assert.equal(h.events.publications.length,1,'offline cache rows never replace the last complete ledger inputs');
 h.commitPublications();assert.deepEqual(h.events.confirmed,['orders']);
 h.subscriptions[0].next(incrementalSnapshot(first).snapshot);await h.clock.advance(0);
 assert.deepEqual(h.events.confirmed,['orders']);h.commitPublications();assert.deepEqual(h.events.confirmed,['orders','orders']);h.dispose();
});

test('actual App worker branch preserves confirmed snapshot publication, cancellation and original listener fallback',async()=>{
  const streams=[];let stops=0,closed=0;
  const worker={subscribe:(name,handlers)=>{streams.push({name,...handlers});return()=>stops++},close:()=>closed++,
    beginPublication:()=>1,publicationScheduled:()=>{}};
  const h=createHarness({worker});const values=[];
  const off=h.startListener(['orders',items=>values.push(items),false,null]);
  assert.equal(h.subscriptions.length,0);assert.equal(streams.length,1);
  const items=expected(fixture(2));
  streams[0].publish({kind:'hd-firestore-worker-snapshot-v1',metadata:{fromCache:false,hasPendingWrites:false},dataChangeCount:null},items);
  assert.equal(values.length,1);assert.deepEqual(values[0],items);assert.deepEqual(h.events.confirmed,[],'receiving worker data cannot confirm uncommitted React state');
  const property=appObject('readWorker').consequent.arguments[0].properties.find(p=>p.key.name==='onCommitted');
  const committed=new Function('markCollectionServerConfirmed',`return (${source.slice(property.value.start,property.value.end)});`)(name=>h.events.confirmed.push(name));
  committed({collectionName:'orders'});assert.deepEqual(h.events.confirmed,['orders']);
  off();streams[0].publish({kind:'hd-firestore-worker-snapshot-v1',metadata:{fromCache:false,hasPendingWrites:false},dataChangeCount:0},[]);
  assert.equal(values.length,1);assert.equal(stops,1);
  h.stopListener('orders');
  const offFallback=h.startListener(['orders',items=>values.push(items),false,null]);
  const fallbackStop=streams[1].fallback();
  assert.equal(h.subscriptions.length,1);
  h.subscriptions[0].next(snapshot(items));await h.clock.advance(0);
  assert.equal(values.length,2);assert.deepEqual(values[1],items);
  fallbackStop();offFallback();assert.equal(h.subscriptions[0].stopped,true);
  h.dispose();assert.equal(closed,1);
});

test('actual core listener yields before publication and a partially failed multi-source subscription is cleaned up',async()=>{
  const core=createHarness();let count=0;
  core.startListener(['companies',()=>{count++},false,null]);
  core.subscriptions[0].next(snapshot(expected(fixture(1))));assert.equal(count,0);
  await core.clock.advance(0);assert.equal(count,1);
  const failed=createHarness({onSubscribeThrowAt:1});
  failed.startListener(['messages',noop,false,null]);
  assert.equal(failed.subscriptions.length,1);assert.equal(failed.subscriptions[0].stopped,true);
  assert.equal(failed.active.has('messages'),false);
});

function assertReadCleanup(h) {
  assert.equal(h.controllers.size, 0);
  assert.equal(h.clock.timers.size, 0);
  for (const scan of h.scans) {
    if (scan.signal) assert.equal(getEventListeners(scan.signal, 'abort').length, 0);
  }
}

for(const [native,nativeConcurrency] of [[true,1],[true,2],[false,1]])test(`actual App REST pages share bounded admission and still return complete exact histories (native=${native}, nativeConcurrency=${nativeConcurrency})`,async()=>{
  const names=['orders','payments','expenses','products','warehouseImports'];let active=0,peak=0;
  const h=createHarness({native,nativeConcurrency,fetchPage:async({body})=>{
    active++;peak=Math.max(peak,active);await timerTurn(2);active--;
    const name=body.structuredQuery.from[0].collectionId;
    return pageResponse(fixture(205,'company-a',name),body);
  }});
  try{
    const results=await Promise.all(names.map(name=>h.readTenantCollectionViaRest(name)));
    assert.equal(peak,native?nativeConcurrency:2);
    results.forEach((items,index)=>assert.deepEqual(items,expected(fixture(205,'company-a',names[index]))));
    assert.equal(h.scans.length,5);
    assert.equal(h.calls.length,10,'larger bulk pages reduce HTTP calls without truncating any complete history');
    await nextTurn();assert.equal(h.readAdmission.getDiagnostics().activeRequests,0);
    assert.equal(h.readAdmission.getDiagnostics().queuedRequests,0);
  }finally{h.dispose()}
});

test('actual App cancels a waiting REST page before token/fetch work and closes admission on tenant cleanup',async()=>{
  const gate=deferred(),h=createHarness({native:true,fetchPage:()=>gate.promise}),controller=new AbortController();
  const first=h.readTenantCollectionViaRest('orders');await waitUntil(()=>h.calls.length===1);
  const second=h.readTenantCollectionViaRest('payments',{signal:controller.signal}),rejected=assert.rejects(second,{name:'AbortError'});
  await waitUntil(()=>h.readAdmission.getDiagnostics().queuedRequests===1);controller.abort();await rejected;
  assert.equal(h.calls.length,1);assert.equal(h.tokens.length,1);
  const third=h.readTenantCollectionViaRest('expenses'),closed=assert.rejects(third,{name:'AbortError'});
  await waitUntil(()=>h.readAdmission.getDiagnostics().queuedRequests===1);h.dispose();await closed;
  gate.resolve(response([{readTime}]));await assert.rejects(first,{name:'AbortError'});
  assert.equal(h.calls.length,1);assert.equal(h.readAdmission.getDiagnostics().closed,true);
});

test('native 200-document bulk pages publish one complete pinned tenant snapshot, including empty and exact boundaries',async()=>{
 for(const size of [0,199,200,201,401]){
  const documents=fixture(size),h=createHarness({native:true,fetchPage:({body})=>pageResponse(documents,body)});
  await h.readCollection('orders',noop);
  assert.deepEqual(h.events.publications.map(e=>e.items),[expected(documents)]);
  assert.equal(h.calls.length,Math.floor(size/200)+1);
  assert.ok(h.calls.every(call=>call.body.structuredQuery.limit===200));
  assert.ok(h.calls.slice(1).every(call=>call.body.readTime===readTime));
  assert.deepEqual(h.events.confirmed,['orders']);assertReadCleanup(h);h.dispose();
 }
});

for (const size of [0, 199, 200, 201, 400]) {
  test(`actual App transport completely collects ${size} records at its 200-page boundary`, async () => {
    const documents = fixture(size);
    const h = createHarness({ fetchPage: ({ body }) => pageResponse(documents, body) });
    await h.readCollection('orders', noop);
    assert.deepEqual(h.events.publications.map(event => event.items), [expected(documents)]);
    assert.deepEqual(h.events.confirmed, ['orders']);
    const {isCurrent,...publicationOptions}=h.events.publications[0].options;
    assert.deepEqual(publicationOptions, { source: 'server', keepPreviousOnEmpty: false,serverCommitVersion:1 });
    assert.equal(isCurrent(),true);
    h.dispose();assert.equal(isCurrent(),false);
    assert.equal(h.calls.length, Math.floor(size / 200) + 1);
    assert.equal(h.scans.length, 1);
    for (const [index, call] of h.calls.entries()) {
      assert.equal(call.method, 'POST');
      assert.equal(call.url, buildFirebaseRestCollectionQueryUrl(projectId, appId));
      assert.equal(call.headers.Authorization, 'Bearer company-a-original');
      assert.equal(call.headers['Content-Type'], 'application/json');
      assert.deepEqual(call.body.structuredQuery.from, [{ collectionId: 'orders' }]);
      assert.deepEqual(call.body.structuredQuery.where, {
        fieldFilter: { field: { fieldPath: 'companyId' }, op: 'EQUAL', value: { stringValue: 'company-a' } },
      });
      assert.deepEqual(call.body.structuredQuery.orderBy, [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }]);
      assert.equal(call.body.structuredQuery.limit, 200);
      assert.notEqual(call.signal, h.scans[0].signal, 'Each page must use a child signal');
      assert.equal(call.signal.aborted, true, 'Completed page controllers must be disposed');
      if (index === 0) assert.equal(call.body.readTime, undefined);
      else {
        assert.equal(call.body.readTime, readTime);
        assert.deepEqual(call.body.structuredQuery.startAt, {
          values: [{ referenceValue: documents[index * 200 - 1].name }], before: false,
        });
      }
    }
    assertReadCleanup(h);
  });
}

test('actual App retries each 401/403 page once with fresh user auth and unchanged query', async () => {
  const documents = fixture(201);
  const h = createHarness({ fetchPage: ({ body }, call) => (
    call === 1 ? response(null, 401) : call === 3 ? response(null, 403) : pageResponse(documents, body)
  ) });
  assert.deepEqual(await h.readTenantCollectionViaRest('orders'), expected(documents));
  assert.deepEqual(h.tokens, [false, true, false, true]);
  assert.deepEqual(h.calls[0].body, h.calls[1].body);
  assert.deepEqual(h.calls[2].body, h.calls[3].body);
  assert.equal(h.calls[1].headers.Authorization, 'Bearer company-a-refreshed');
  assert.equal(h.calls[3].headers.Authorization, 'Bearer company-a-refreshed');
});

test('actual App retains permission-denied after the one authorized retry', async () => {
  const h = createHarness({ fetchPage: () => response(null, 403) });
  await assert.rejects(h.readTenantCollectionViaRest('orders'), { code: 'firestore/permission-denied' });
  assert.deepEqual(h.tokens, [false, true]);
  assert.equal(h.calls.length, 2);
});

test('nanosecond App bootstrap is discarded and pinned replay cannot publish early', async () => {
  const documents = fixture(201);
  const replay = deferred();
  const h = createHarness({ fetchPage: async ({ body }, call) => {
    if (call === 1) {
      const original = await pageResponse(documents, body).json();
      return response(original.map(row => ({
        ...row, readTime: '2026-10-03T01:00:00.123456789Z',
        document: { ...row.document, fields: { ...row.document.fields, amount: { integerValue: '987654' } } },
      })));
    }
    assert.equal(body.readTime, readTime);
    if (call === 2) {
      assert.equal(body.structuredQuery.startAt, undefined);
      return replay.promise;
    }
    return pageResponse(documents, body);
  } });
  const read = h.readCollection('orders', noop);
  await waitUntil(() => h.calls.length === 2);
  assert.deepEqual(h.events.publications, []);
  assert.deepEqual(h.events.confirmed, []);
  assert.equal(h.serverAt.size, 0);
  replay.resolve(pageResponse(documents, h.calls[1].body));
  await read;
  assert.deepEqual(h.events.publications.map(event => event.items), [expected(documents)]);
  assert.deepEqual(h.events.confirmed, ['orders']);
  assert.equal(h.calls.length, 3);
  assertReadCleanup(h);
});

test('actual App does not publish or confirm until the last page finishes', async () => {
  const documents = fixture(201);
  const lastPage = deferred();
  const h = createHarness({ fetchPage: ({ body }, call) => (
    call === 1 ? pageResponse(documents, body) : lastPage.promise
  ) });
  const read = h.readCollection('orders', noop);
  await waitUntil(() => h.calls.length === 2);
  assert.deepEqual(h.events.publications, []);
  assert.deepEqual(h.events.confirmed, []);
  assert.equal(h.serverAt.size, 0);
  lastPage.resolve(pageResponse(documents, h.calls[1].body));
  await read;
  assert.deepEqual(h.events.publications.map(event => event.items), [expected(documents)]);
  assert.deepEqual(h.events.confirmed, ['orders']);
});

for (const failure of ['http', 'json', 'missing-time', 'foreign-tenant']) {
  test(`actual App never publishes or confirms the first page after a middle ${failure} error`, async () => {
    const h = createHarness({ fetchPage: ({ body }, call) => {
      if (call === 1) return pageResponse(fixture(201), body);
      if (failure === 'http') return response(null, 503);
      if (failure === 'json') return { ...response(null), text: async () => 'invalid JSON body', json: async () => { throw new SyntaxError('Invalid JSON'); } };
      if (failure === 'missing-time') return response([{ document: fixture(201).at(-1) }]);
      return response([{ document: fixture(201, 'company-b').at(-1), readTime }]);
    } });
    await h.readCollection('orders', noop);
    assert.equal(h.calls.length, 2);
    assert.deepEqual(h.events.publications, []);
    assert.deepEqual(h.events.confirmed, []);
    assert.equal(h.serverAt.size, 0);
    assert.equal(h.clock.timers.size, 0);
  });
}

test('same-collection supersession aborts the old scan without deleting the newer controller', async () => {
  const oldPage = deferred();
  const newPage = deferred();
  const h = createHarness({ fetchPage: (_, call) => call === 1 ? oldPage.promise : newPage.promise });
  const first = h.readCollection('orders', noop, false, null, { force: true });
  await waitUntil(() => h.calls.length === 1);
  const oldSignal = h.calls[0].signal;
  const second = h.readCollection('orders', noop, false, null, { force: true });
  await waitUntil(() => h.calls.length === 2);
  const newController = h.controllers.get('orders');
  await first;
  assert.equal(oldSignal.aborted, true);
  assert.equal(h.controllers.get('orders'), newController);
  assert.equal(h.events.statuses.length, 0);
  newPage.resolve(pageResponse(fixture(1), h.calls[1].body));
  await second;
  oldPage.resolve(response(null, 503));
  await nextTurn();
  assert.deepEqual(h.events.publications.map(event => event.items), [expected(fixture(1))]);
  assert.deepEqual(h.events.confirmed, ['orders']);
  assert.equal(h.controllers.size, 0);
  assert.equal(h.clock.timers.size, 0);
});

test('different collections keep independent controllers and revisions', async () => {
  const orders = deferred();
  const products = deferred();
  const h = createHarness({ fetchPage: ({ body }) => (
    body.structuredQuery.from[0].collectionId === 'orders' ? orders.promise : products.promise
  ) });
  const first = h.readCollection('orders', noop);
  const second = h.readCollection('products', noop);
  await waitUntil(() => h.calls.length === 2);
  assert.equal(h.controllers.size, 2);
  assert.equal(h.calls.some(call => call.signal.aborted), false);
  products.resolve(pageResponse(fixture(1, 'company-a', 'products'), h.calls[1].body));
  await second;
  assert.equal(h.controllers.has('orders'), true);
  orders.resolve(pageResponse(fixture(1), h.calls[0].body));
  await first;
  assert.deepEqual(h.events.confirmed, ['products', 'orders']);
});

test('leaving overflow module cancels its timer or running scan without publishing partial data', async () => {
  const pending = deferred();
  const h = createHarness({ fetchPage: () => pending.promise });
  h.scheduleOverflow(['orders', noop]); h.cancelOverflow('orders');
  await h.clock.advance(100); assert.equal(h.calls.length, 0);
  h.scheduleOverflow(['orders', noop]); await h.clock.advance(40);
  await waitUntil(() => h.calls.length === 1);
  const signal = h.calls[0].signal;
  h.cancelOverflow('orders'); assert.equal(signal.aborted, true);
  await waitUntil(() => h.controllers.size === 0);
  pending.resolve(pageResponse(fixture(1), h.calls[0].body)); await nextTurn();
  assert.deepEqual(h.events.publications, []); assert.deepEqual(h.events.confirmed, []);
  assert.deepEqual(h.events.loaded, []); assert.deepEqual(h.events.statuses, []);
  assert.equal(h.clock.timers.size, 0);
});

test('cancelled overflow completion cannot cancel or erase a new explicit same-collection read', async () => {
  const oldPage = deferred(), newPage = deferred();
  const h = createHarness({ fetchPage: (_, call) => call === 1 ? oldPage.promise : newPage.promise });
  h.scheduleOverflow(['orders', noop]); await h.clock.advance(40); await waitUntil(() => h.calls.length === 1);
  const forced = h.readCollection('orders', noop, false, null, { force: true });
  await waitUntil(() => h.calls.length === 2);
  h.cancelOverflow('orders');
  assert.equal(h.calls[0].signal.aborted, true); assert.equal(h.calls[1].signal.aborted, false);
  newPage.resolve(pageResponse(fixture(1), h.calls[1].body)); await forced;
  oldPage.resolve(pageResponse(fixture(1), h.calls[0].body)); await nextTurn();
  assert.deepEqual(h.events.publications.map(event => event.items), [expected(fixture(1))]);
  assert.deepEqual(h.events.confirmed, ['orders']); assert.equal(h.controllers.size, 0);
});

test('leaving and immediately revisiting overflow keeps the new job after old finally runs', async () => {
  const oldPage = deferred(), newPage = deferred();
  const h = createHarness({ fetchPage: (_, call) => call === 1 ? oldPage.promise : newPage.promise });
  h.scheduleOverflow(['orders', noop]); await h.clock.advance(40); await waitUntil(() => h.calls.length === 1);
  h.cancelOverflow('orders'); h.scheduleOverflow(['orders', noop]);
  await nextTurn(); await h.clock.advance(40); await waitUntil(() => h.calls.length === 2);
  assert.equal(h.calls[1].signal.aborted, false);
  newPage.resolve(pageResponse(fixture(1), h.calls[1].body));
  await waitUntil(() => h.events.publications.length === 1);
  oldPage.resolve(pageResponse(fixture(1), h.calls[0].body)); await nextTurn();
  assert.equal(h.events.publications.length, 1); assert.deepEqual(h.events.confirmed, ['orders']);
});

test('confirmed listener metadata invalidates REST before the no-data-change early return', async () => {
  const pending = deferred();
  const h = createHarness({ fetchPage: () => pending.promise });
  const listener = h.listener('orders');
  listener(snapshot(expected(fixture(1))));
  const read = h.readCollection('orders', noop, false, null, { force: true });
  await waitUntil(() => h.calls.length === 1);
  listener(snapshot(expected(fixture(1)), {}, 0));
  await read;
  assert.equal(h.calls[0].signal.aborted, true);
  pending.resolve(pageResponse(fixture(2), h.calls[0].body));
  await nextTurn();
  assert.equal(h.events.publications.length, 1);
  assert.equal(h.events.publications[0].options.source, 'realtime');
  assert.equal(h.events.statuses.some(status => status.state === 'error'), false);
});

test('cache or pending-write snapshots do not falsely confirm or invalidate a server scan', async () => {
  const pending = deferred();
  const h = createHarness({ fetchPage: () => pending.promise });
  const read = h.readCollection('orders', noop);
  await waitUntil(() => h.calls.length === 1);
  const listener = h.listener('orders');
  listener(snapshot([], { fromCache: true }));
  listener(snapshot([], { hasPendingWrites: true }));
  assert.equal(h.calls[0].signal.aborted, false);
  assert.deepEqual(h.events.confirmed, []);
  pending.resolve(pageResponse(fixture(1), h.calls[0].body));
  await read;
  assert.deepEqual(h.events.confirmed, ['orders']);
});

test('all listener sources must confirm before aborting the collection REST scan', async () => {
  const pending = deferred();
  const h = createHarness({ fetchPage: () => pending.promise });
  const read = h.readCollection('orders', noop);
  await waitUntil(() => h.calls.length === 1);
  const listener = h.listener('orders', 2);
  listener(snapshot([]), 0);
  assert.equal(h.calls[0].signal.aborted, false);
  listener(snapshot([]), 1);
  assert.equal(h.calls[0].signal.aborted, true);
  await read;
  pending.resolve(response([{ readTime }]));
  await nextTurn();
  assert.equal(h.clock.timers.size, 0);
});

test('actual listener feeds initial ignored cache snapshot before a metadata-only first publication', async () => {
  const h = createHarness();
  const listener = h.listener('orders');
  const items = expected(fixture(3));
  const cached = incrementalSnapshot(items, [], { fromCache: true, hasPendingWrites: true });
  await listener(cached.snapshot);
  assert.deepEqual(cached.reads, items.map(item => item.id));
  assert.deepEqual(h.events.publications, []);
  assert.deepEqual(h.events.confirmed, []);
  assert.equal(listener.sourceItems.size, 0, 'Ignored cache must not enter the published source union');
  const confirmed = incrementalSnapshot(items);
  await listener(confirmed.snapshot);
  assert.notEqual(cached.snapshot.query, confirmed.snapshot.query);
  assert.deepEqual(confirmed.reads, [], 'Captured source ref must survive new snapshot query wrappers');
  assert.deepEqual(h.events.publications.map(event => event.items), [items]);
  assert.deepEqual(h.events.confirmed, ['orders']);
  const ack = incrementalSnapshot(items);
  await listener(ack.snapshot);
  assert.deepEqual(ack.reads, []);
  assert.equal(h.events.publications.length, 1);
});

test('actual listener decodes one of 4000 changed documents and no metadata-only ACK data', async () => {
  const h = createHarness();
  const listener = h.listener('orders');
  const items = expected(fixture(4000));
  const first = incrementalSnapshot(items);
  await listener(first.snapshot);
  assert.equal(first.reads.length, 4000);
  const updated = items.map((item, index) => index === 2000
    ? { ...item, data: { ...item.data, amount: 99000 } } : item);
  const next = incrementalSnapshot(updated, [['modified', items[2000].id, 2000, 2000]], { hasPendingWrites: true });
  await listener(next.snapshot);
  assert.deepEqual(next.reads, [items[2000].id]);
  assert.deepEqual(h.events.publications.at(-1).items, updated);
  const ack = incrementalSnapshot(updated);
  await listener(ack.snapshot);
  assert.deepEqual(ack.reads, []);
  assert.equal(h.events.publications.length, 2);
  assert.deepEqual(h.events.publications[0].items, items, 'Previously published records remain unchanged');
});

test('actual listener publishes ignored cache modifications on the zero-change server ACK', async () => {
  const h = createHarness();
  const listener = h.listener('orders');
  const items = expected(fixture(2));
  await listener(incrementalSnapshot(items).snapshot);
  const cachedItems = items.map((item, index) => index === 0
    ? { ...item, data: { ...item.data, amount: 200 } } : item);
  const cache = incrementalSnapshot(cachedItems, [['modified', items[0].id, 0, 0]], { fromCache: true });
  await listener(cache.snapshot);
  assert.deepEqual(cache.reads, [items[0].id]);
  assert.equal(h.events.publications.length, 1);
  assert.equal(listener.setterCalls.length, 1);
  assert.deepEqual(listener.sourceItems.get(0), items, 'Ignored cache does not directly replace published-source items');
  const ack = incrementalSnapshot(cachedItems);
  await listener(ack.snapshot);
  assert.deepEqual(ack.reads, []);
  assert.equal(h.events.publications.length, 2, 'Server ACK must publish the previously ignored source change');
  assert.equal(listener.setterCalls.length, 2);
  assert.deepEqual(h.events.publications.at(-1).items, cachedItems);
  assert.deepEqual(listener.setterCalls.at(-1), cachedItems);
  assert.deepEqual(listener.sourceItems.get(0), cachedItems);
  const unchangedAck = incrementalSnapshot(cachedItems);
  await listener(unchangedAck.snapshot);
  assert.deepEqual(unchangedAck.reads, []);
  assert.equal(h.events.publications.length, 2);
  assert.equal(listener.setterCalls.length, 2, 'Unchanged metadata must not trigger another setter');
  const finalItems = cachedItems.map((item, index) => index === 1
    ? { ...item, data: { ...item.data, amount: 300 } } : item);
  const final = incrementalSnapshot(finalItems, [['modified', items[1].id, 1, 1]]);
  await listener(final.snapshot);
  assert.deepEqual(final.reads, [items[1].id]);
  assert.deepEqual(h.events.publications.at(-1).items, finalItems);
  assert.deepEqual(h.events.publications[0].items, items);
});

test('actual listener source union preserves per-source deltas and overlapping-ID precedence', async () => {
  const h = createHarness();
  const listener = h.listener('messages', 2);
  assert.notEqual(listener.sources[0], listener.sources[1]);
  const item = (id, amount) => ({ id, data: { companyId: 'company-a', amount } });
  const a = [item('shared', 10), item('assigned', 1)];
  const b = [item('shared', 20), item('internal', 2)];
  const union = (...sources) => [...new Map(sources.flat().map(record => [record.id, record])).values()];
  await listener(incrementalSnapshot(a, a.map((item, index) => ['added', item.id, -1, index])).snapshot, 0);
  await listener(incrementalSnapshot(b, b.map((item, index) => ['added', item.id, -1, index])).snapshot, 1);
  assert.deepEqual(h.events.publications.at(-1).items, union(a, b));
  const nextA = [item('shared', 30), a[1]];
  const updateA = incrementalSnapshot(nextA, [['modified', 'shared', 0, 0]]);
  await listener(updateA.snapshot, 0);
  assert.deepEqual(updateA.reads, ['shared']);
  assert.deepEqual(h.events.publications.at(-1).items, union(nextA, b));
  const nextB = [b[1]];
  const removeB = incrementalSnapshot(nextB, [['removed', 'shared', 0, -1]]);
  await listener(removeB.snapshot, 1);
  assert.deepEqual(removeB.reads, []);
  assert.deepEqual(h.events.publications.at(-1).items, union(nextA, nextB));
  assert.equal(h.events.publications.at(-1).items[0].data.amount, 30);
  const publicationCount = h.events.publications.length;
  const metadataB = incrementalSnapshot(nextB);
  await listener(metadataB.snapshot, 1);
  assert.deepEqual(metadataB.reads, []);
  assert.equal(h.events.publications.length, publicationCount);
});

test('actual listener restart creates a fresh collector even for identical document IDs', () => {
  const h = createHarness();
  const first = h.listener('orders');
  first(incrementalSnapshot(expected(fixture(1))).snapshot);
  const restarted = h.listener('orders');
  const items = expected(fixture(1)).map(item => ({ ...item, data: { ...item.data, amount: 800 } }));
  const initial = incrementalSnapshot(items);
  restarted(initial.snapshot);
  assert.notEqual(first.sources[0], restarted.sources[0]);
  assert.deepEqual(initial.reads, [items[0].id]);
  assert.deepEqual(h.events.publications.at(-1).items, items);
});

test('actual listener immediately publishes cache-first secondary source union on a zero-change server ACK', async () => {
  const h = createHarness();
  const listener = h.listener('messages', 2);
  const a = [{ id: 'assigned', data: { companyId: 'company-a', amount: 1 } }];
  const b = [{ id: 'internal', data: { companyId: 'company-a', amount: 2 } }];
  await listener(incrementalSnapshot(a, [['added', 'assigned', -1, 0]]).snapshot, 0);
  const cachedB = incrementalSnapshot(b, [['added', 'internal', -1, 0]], { fromCache: true });
  await listener(cachedB.snapshot, 1);
  assert.deepEqual(h.events.publications.map(event => event.items), [a]);
  assert.equal(listener.setterCalls.length, 1);
  assert.equal(listener.sourceItems.has(1), false);
  const confirmedB = incrementalSnapshot(b);
  await listener(confirmedB.snapshot, 1);
  assert.deepEqual(cachedB.reads, ['internal']);
  assert.deepEqual(confirmedB.reads, []);
  assert.deepEqual(listener.sourceItems.get(1), b);
  assert.deepEqual(h.events.publications.map(event => event.items), [a, [...a, ...b]]);
  assert.equal(listener.setterCalls.length, 2);
  assert.deepEqual(listener.setterCalls.at(-1), [...a, ...b]);
  assert.deepEqual(h.events.confirmed, ['messages']);
  const unchangedB = incrementalSnapshot(b);
  await listener(unchangedB.snapshot, 1);
  assert.deepEqual(unchangedB.reads, []);
  assert.equal(h.events.publications.length, 2);
  assert.equal(listener.setterCalls.length, 2);
  const updatedA = [{ ...a[0], data: { ...a[0].data, amount: 3 } }];
  await listener(incrementalSnapshot(updatedA, [['modified', 'assigned', 0, 0]]).snapshot, 0);
  assert.deepEqual(h.events.publications.at(-1).items, [...updatedA, ...b]);
});

test('actual listener unchanged metadata ACKs on either source cause no extra collection setter calls', async () => {
  const h = createHarness();
  const listener = h.listener('messages', 2);
  const a = [{ id: 'assigned', data: { companyId: 'company-a', amount: 1 } }];
  const b = [{ id: 'internal', data: { companyId: 'company-a', amount: 2 } }];
  await listener(incrementalSnapshot(a, [['added', 'assigned', -1, 0]]).snapshot, 0);
  await listener(incrementalSnapshot(b, [['added', 'internal', -1, 0]]).snapshot, 1);
  assert.equal(listener.setterCalls.length, 2);
  const priorA = listener.sourceItems.get(0)[0].data;
  const priorB = listener.sourceItems.get(1)[0].data;
  for (const [sourceIndex, items, metadata] of [
    [0, a, { hasPendingWrites: true }],
    [0, a, { hasPendingWrites: false }],
    [1, b, { hasPendingWrites: false }],
  ]) {
    const ack = incrementalSnapshot(items, [], metadata);
    await listener(ack.snapshot, sourceIndex);
    assert.deepEqual(ack.reads, []);
    assert.equal(listener.setterCalls.length, 2);
    assert.equal(h.events.publications.length, 2);
  }
  assert.equal(listener.sourceItems.get(0)[0].data, priorA);
  assert.equal(listener.sourceItems.get(1)[0].data, priorB);
  assert.deepEqual(listener.setterCalls.at(-1), [...a, ...b]);
});

test('actual listener decode failure publishes no partial union or confirmation and recovers fully', async () => {
  const h = createHarness();
  const listener = h.listener('orders');
  const items = expected(fixture(2));
  listener(incrementalSnapshot(items).snapshot);
  const updated = items.map(item => ({ ...item, data: { ...item.data, amount: 500 } }));
  const broken = incrementalSnapshot(updated, updated.map((item, index) => ['modified', item.id, index, index]));
  broken.snapshot.docs[1].data = () => { throw new Error('Snapshot decode failed'); };
  const confirmationCount = h.events.confirmed.length;
  await assert.rejects(listener(broken.snapshot), /Snapshot decode failed/);
  assert.equal(h.events.publications.length, 1);
  assert.equal(h.events.confirmed.length, confirmationCount);
  assert.deepEqual(listener.sourceItems.get(0), items);
  const recovery = incrementalSnapshot(updated, [['modified', updated[0].id, 0, 0]]);
  listener(recovery.snapshot);
  assert.deepEqual(recovery.reads, updated.map(item => item.id));
  assert.deepEqual(h.events.publications.at(-1).items, updated);
});

test('healthy pages get fresh 9s budgets and complete a scan longer than 9s', async () => {
  const documents = fixture(401);
  const pages = Array.from({ length: 3 }, deferred);
  const h = createHarness({ fetchPage: (_, call) => pages[call - 1].promise });
  const read = h.readCollection('orders', noop);
  await waitUntil(() => h.calls.length === 1);
  assert.deepEqual([...h.clock.timers.values()].map(timer => timer.delay).sort((a, b) => a - b),
    [9000, 9000, 120000, 120000]);
  for (let index = 0; index < pages.length; index += 1) {
    await h.clock.advance(8000);
    assert.equal(h.calls[index].signal.aborted, false);
    assert.deepEqual(h.events.publications, []);
    pages[index].resolve(pageResponse(documents, h.calls[index].body));
    if (index < pages.length - 1) await waitUntil(() => h.calls.length === index + 2);
  }
  await read;
  assert.equal(h.clock.now, 24000);
  assert.equal(h.scans[0].signal.aborted, false);
  assert.deepEqual(h.events.publications.map(event => event.items), [expected(documents)]);
  assert.deepEqual(h.events.confirmed, ['orders']);
  assertReadCleanup(h);
});

test('a stalled later page hits its own 9s deadline without publishing earlier pages', async () => {
  const firstPage = deferred();
  const secondPage = deferred();
  const stable = expected(fixture(1));
  const h = createHarness({ stable, fetchPage: (_, call) => call === 1 ? firstPage.promise : secondPage.promise });
  const read = h.readCollection('orders', noop);
  await waitUntil(() => h.calls.length === 1);
  await h.clock.advance(8000);
  firstPage.resolve(pageResponse(fixture(201), h.calls[0].body));
  await waitUntil(() => h.calls.length === 2);
  await h.clock.advance(8999);
  assert.equal(h.calls[1].signal.aborted, false);
  await h.clock.advance(1);
  await read;
  assert.equal(h.calls[1].signal.aborted, true);
  assert.equal(h.scans[0].signal.aborted, false, 'The page, not the 120s scan budget, expired');
  assert.deepEqual(h.events.publications, []);
  assert.deepEqual(h.events.confirmed, []);
  assert.equal(h.clock.timers.size, 0);
  assert.equal(h.controllers.size, 0);
  secondPage.resolve(pageResponse(fixture(201), h.calls[1].body));
  await nextTurn();
  assert.deepEqual(h.events.publications, []);
  assertReadCleanup(h);
});

test('the absolute 120s scan budget expires despite healthy page progress', async () => {
  const documents = fixture(3201);
  const stable = expected(fixture(1));
  const pages = Array.from({ length: 16 }, deferred);
  const h = createHarness({ stable, fetchPage: (_, call) => pages[call - 1].promise });
  const read = h.readCollection('orders', noop);
  await waitUntil(() => h.calls.length === 1);
  for (let index = 0; index < 15; index += 1) {
    await h.clock.advance(7500);
    assert.equal(h.calls[index].signal.aborted, false);
    pages[index].resolve(pageResponse(documents, h.calls[index].body));
    await waitUntil(() => h.calls.length === index + 2);
    assert.deepEqual(h.events.publications, []);
  }
  assert.equal(h.clock.now, 112500);
  await h.clock.advance(7500);
  await read;
  assert.equal(h.clock.now, 120000);
  assert.equal(h.scans[0].signal.aborted, true);
  assert.equal(h.calls[15].signal.aborted, true);
  assert.deepEqual(h.events.publications, []);
  assert.deepEqual(h.events.confirmed, []);
  assert.deepEqual(h.events.stable.map(event => event.items), [stable]);
  pages[15].resolve(pageResponse(documents, h.calls[15].body));
  await nextTurn();
  assertReadCleanup(h);
});

test('cleanup suppresses old-tenant late results while a new tenant reads independently', async () => {
  const pending = deferred();
  const old = createHarness({ fetchPage: () => pending.promise });
  const read = old.readCollection('orders', noop);
  await waitUntil(() => old.calls.length === 1);
  old.dispose();
  const documents = fixture(201, 'company-b');
  const next = createHarness({ companyId: 'company-b', fetchPage: ({ body }) => pageResponse(documents, body) });
  await next.readCollection('orders', noop);
  await read;
  pending.resolve(pageResponse(fixture(1), old.calls[0].body));
  await nextTurn();
  assert.equal(old.calls[0].signal.aborted, true);
  assert.equal(old.controllers.size, 0);
  assert.deepEqual(old.events.publications, []);
  assert.deepEqual(old.events.confirmed, []);
  assert.deepEqual(old.events.statuses, []);
  assert.deepEqual(next.events.publications[0].items, expected(documents));
  assert.equal(next.calls.every(call => call.headers.Authorization === 'Bearer company-b-original'), true);
});

test('page 9s deadline during token acquisition prevents any late fetch or publication', async () => {
  const token = deferred();
  const h = createHarness({ tokenRead: () => token.promise });
  const read = h.readCollection('orders', noop);
  await waitUntil(() => h.tokens.length === 1);
  await h.clock.advance(9000);
  await read;
  token.resolve('late-token');
  await nextTurn();
  assert.deepEqual(h.events.publications, []);
  assert.deepEqual(h.events.confirmed, []);
  assert.equal(h.calls.length, 0, 'send must recheck the child signal after token acquisition');
  assert.equal(h.scans[0].signal.aborted, false);
  assertReadCleanup(h);
});

test('page 9s deadline during auth refresh cannot renew the page budget', async () => {
  const refreshedToken = deferred();
  const h = createHarness({
    tokenRead: refresh => refresh ? refreshedToken.promise : 'original-token',
    fetchPage: () => response(null, 403),
  });
  const read = h.readCollection('orders', noop);
  await waitUntil(() => h.tokens.length === 2);
  await h.clock.advance(9000);
  await read;
  refreshedToken.resolve('late-refreshed-token');
  await nextTurn();
  assert.deepEqual(h.tokens, [false, true]);
  assert.equal(h.calls.length, 1, 'Late refreshed auth must not issue a retry fetch');
  assert.deepEqual(h.events.publications, []);
  assert.deepEqual(h.events.confirmed, []);
  assertReadCleanup(h);
});

test('page 9s deadline while the later JSON body is pending suppresses late completion', async () => {
  const json = deferred();
  const h = createHarness({ fetchPage: ({ body }, call) => (
    call === 1 ? pageResponse(fixture(201), body) : { ...response(null), text: () => json.promise.then(value=>JSON.stringify(value)), json: () => json.promise }
  ) });
  let settled=false;
  const read = h.readCollection('orders', noop).finally(()=>{settled=true});
  await waitUntil(() => h.calls.length === 2);
  await h.clock.advance(8999);
  assert.equal(settled,false,'the pending body must not fail early via an unintended JSON path');
  await h.clock.advance(1);
  await read;
  json.resolve([{ document: fixture(201).at(-1), readTime }]);
  await nextTurn();
  assert.equal(h.calls[1].signal.aborted, true);
  assert.equal(h.scans[0].signal.aborted, false);
  assert.deepEqual(h.events.publications, []);
  assert.deepEqual(h.events.confirmed, []);
  assertReadCleanup(h);
});

for (const [name, options] of [
  ['companies', {}], ['messages', { role: 'manager' }],
  ['orders', { customer: true }], ['orders', { preview: true }],
]) {
  test(`non-scanning ${name} read keeps the original 9s whole-read budget (${JSON.stringify(options)})`, async () => {
    const pending = deferred();
    const h = createHarness({ ...options, fetchPage: () => pending.promise, sdkRead: () => pending.promise });
    const read = h.readCollection(name, noop);
    await waitUntil(() => h.calls.length + h.sdkCalls.length === 1);
    assert.deepEqual([...h.clock.timers.values()].map(timer => timer.delay), [9000, 9000]);
    await h.clock.advance(9000);
    await read;
    assert.equal(h.scans.length, 0);
    assert.deepEqual(h.events.publications, []);
    assert.deepEqual(h.events.confirmed, []);
    pending.resolve(options.preview ? snapshot(expected(fixture(1))) : response([{ readTime }]));
    await nextTurn();
    assertReadCleanup(h);
    assert.deepEqual(h.events.publications, []);
  });
}

test('active listener and fresh server snapshot skip ordinary REST fallback', async () => {
  const h = createHarness();
  h.active.add('orders');
  await h.readCollection('orders', noop);
  h.serverAt.set('products', Date.now());
  await h.readCollection('products', noop);
  assert.deepEqual(h.calls, []);
  assert.equal(h.controllers.size, 0);
});

test('customer queries retain company/customer/inbox filters and never use the employee collector', async () => {
  const h = createHarness({ customer: true });
  await h.readTenantCollectionViaRest('orders');
  await h.readTenantCollectionViaRest('notifications');
  assert.equal(h.scans.length, 0);
  const filters = h.calls.map(call => call.body.structuredQuery.where.compositeFilter.filters.map(entry => entry.fieldFilter));
  assert.deepEqual(filters[0], [
    { field: { fieldPath: 'companyId' }, op: 'EQUAL', value: { stringValue: 'company-a' } },
    { field: { fieldPath: 'customerId' }, op: 'EQUAL', value: { stringValue: 'customer-a' } },
  ]);
  assert.deepEqual(filters[1], [...filters[0], {
    field: { fieldPath: 'recipientType' }, op: 'EQUAL', value: { stringValue: 'customer' },
  }]);
  assert.equal(h.calls[1].body.structuredQuery.limit, 100);
  assert.deepEqual(h.calls[1].body.structuredQuery.orderBy, [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }]);
  assert.deepEqual(await h.readTenantCollectionViaRest('employees'), []);
  assert.equal(h.calls.length, 2);
});

test('direct tenant/customer documents retain GET and do not enter the collection collector', async () => {
  const document = fixture(1)[0];
  const h = createHarness({ customer: true, fetchPage: () => response(document) });
  await h.readTenantCollectionViaRest('companies');
  await h.readTenantCollectionViaRest('customers');
  assert.equal(h.scans.length, 0);
  assert.equal(h.calls.every(call => call.method === 'GET' && call.body === null), true);
  assert.equal(h.calls[0].url, buildFirebaseRestDocumentUrl(projectId, appId, 'companies', 'company-a'));
  assert.equal(h.calls[1].url, buildFirebaseRestDocumentUrl(projectId, appId, 'customers', 'customer-a'));
});

test('assigned-employee message scopes keep both SDK queries rather than broad REST pagination', async () => {
  const documents = expected(fixture(1, 'company-a', 'messages'));
  const h = createHarness({ sdkRead: () => snapshot(documents) });
  assert.deepEqual(await h.readTenantCollectionViaRest('messages'), documents);
  assert.equal(h.calls.length, 0);
  assert.equal(h.scans.length, 0);
  assert.equal(h.sdkCalls.length, 2);
  assert.deepEqual(h.sdkCalls[0].constraints.filter(entry => entry.kind === 'where'), [
    { kind: 'where', field: 'companyId', op: '==', value: 'company-a' },
    { kind: 'where', field: 'conversationType', op: '==', value: 'customer_support' },
    { kind: 'where', field: 'assignedEmployeeId', op: '==', value: 'employee-a' },
    { kind: 'where', field: 'assignmentState', op: '==', value: 'assigned' },
  ]);
  assert.deepEqual(h.sdkCalls[1].constraints.filter(entry => entry.kind === 'where'), [
    { kind: 'where', field: 'companyId', op: '==', value: 'company-a' },
    { kind: 'where', field: 'conversationType', op: 'in', value: ['internal', 'internal_group', 'support'] },
  ]);
});

test('manager message REST fallback preserves its bounded query and propagates JSON failures', async () => {
  const documents = fixture(200, 'company-a', 'messages');
  const h = createHarness({ role: 'manager', fetchPage: ({ body }) => pageResponse(documents, body) });
  assert.deepEqual(await h.readTenantCollectionViaRest('messages'), expected(documents));
  assert.equal(h.scans.length, 0, 'Bounded manager inbox must not become a complete authoritative scan');
  assert.equal(h.calls.length, 1, 'A full inbox response must not trigger cursor continuation');
  assert.equal(h.calls[0].method, 'POST');
  assert.equal(h.calls[0].headers.Authorization, 'Bearer company-a-original');
  assert.deepEqual(h.calls[0].body.structuredQuery.from, [{ collectionId: 'messages' }]);
  assert.deepEqual(h.calls[0].body.structuredQuery.where, {
    fieldFilter: { field: { fieldPath: 'companyId' }, op: 'EQUAL', value: { stringValue: 'company-a' } },
  });
  assert.equal(h.calls[0].body.structuredQuery.limit, 200);
  assert.deepEqual(h.calls[0].body.structuredQuery.orderBy, [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }]);
  assert.equal(h.calls[0].body.structuredQuery.startAt, undefined);
  assert.equal(h.calls[0].body.readTime, undefined);

  for (const [collectionName, options] of [
    ['messages', { role: 'manager' }],
    ['notifications', { customer: true }],
    ['customers', { customer: true }],
  ]) {
    const broken = createHarness({ ...options, fetchPage: () => ({
      ...response(null), json: async () => { throw new SyntaxError('Invalid bounded response JSON'); },
    }) });
    await assert.rejects(broken.readTenantCollectionViaRest(collectionName), SyntaxError);
    await broken.readCollection(collectionName, noop);
    assert.equal(broken.scans.length, 0);
    assert.deepEqual(broken.events.publications, []);
    assert.deepEqual(broken.events.confirmed, []);
    assert.equal(broken.serverAt.size, 0);
  }
});
