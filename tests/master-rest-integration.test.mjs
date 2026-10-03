import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getEventListeners } from 'node:events';
import { setImmediate as nextTurn } from 'node:timers/promises';
import test from 'node:test';
import { parseExpression } from '@babel/parser';
import { appObject } from './helpers/app-source-function.mjs';
import { collectTenantRestQuery } from '../src/services/firestoreRestPagination.js';
import { createRealtimeSnapshotItemsCollector } from '../src/services/realtimeSnapshotItems.js';
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
const cleanupStart = /return \(\) => \{\s*cancelled = true;/.exec(source.slice(scopeStart));
assert.ok(cleanupStart, 'Missing tenant cleanup');
const cleanupOffset = scopeStart + cleanupStart.index + 'return '.length;
const cleanupEnd = source.indexOf('  }, [', cleanupOffset);
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
  json: async () => body, text: async () => 'fixture transport error',
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
  for (let turn = 0; turn < 40; turn += 1) {
    if (predicate()) return;
    await nextTurn();
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

function createHarness({ companyId = 'company-a', customer = false, role = 'sales', preview = false,
  fetchPage = () => response([{ readTime }]), sdkRead, tokenRead, stable = [] } = {}) {
  const clock = createClock();
  const calls = [];
  const tokens = [];
  const sdkCalls = [];
  const scans = [];
  const events = { publications: [], confirmed: [], loaded: [], statuses: [], stable: [], errors: [] };
  const active = new Set();
  const serverAt = new Map();
  const snapshotAt = new Map();
  const bindings = {
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
    createRealtimeSnapshotItemsCollector, hasActiveRealtimeListener, isServerSnapshotFresh,
    isServerConfirmedRealtimeSnapshot, shouldApplyRealtimeSnapshot, getRealtimeDataChangeCount,
    activeRealtimeCollectionsRef: ref(active), lastRealtimeServerSnapshotAtRef: ref(serverAt),
    lastRealtimeSnapshotAtRef: ref(snapshotAt),
    recentLocalWritesRef: ref(new Map()), recentLocalDeletesRef: ref(new Map()),
    markCollectionLoaded: name => events.loaded.push(name),
    markCollectionServerConfirmed: name => events.confirmed.push(name),
    applyCollectionItems: (name, setter, items, isObject, parser, options) => {
      events.publications.push({ name, items, isObject, parser, options });
      setter(items);
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
    foregroundReadOnlyTimers: new Map(), foregroundReadOnlyCollectionNames: new Set(),
    realtimeListenerStartTimersRef: ref([]), refreshCollectionsInFlightRef: ref(false),
    forceRefreshCollectionRef: ref(noop), collectionRefreshTimersRef: ref(new Map()),
  };
  const declarations = [
    'customerOwnedCollections', 'customerInboxCollectionNames', 'collectionReadRevisions', 'collectionReadControllers',
    'fromFirestoreRestValue', 'fromFirestoreRestFields', 'buildFirestoreRestDocumentUrl',
    'normalizeFirestoreSnapshotData', 'getTenantCollectionSources', 'getSnapshotItems',
    'readTenantCollectionViaRest', 'hasCollectionValue', 'isRecoverableCollectionReadError', 'withTimeout', 'readCollection',
  ].map(name => `const ${name} = ${expression(name)};`).join('\n');
  const runtime = new Function(...Object.keys(bindings), `"use strict";
    let cancelled = ${expression('cancelled')};
    let loadedCollectionMarkTimer = null;
    let serverConfirmedCollectionMarkTimer = null;
    let refreshTimer = null;
    let foregroundCollectionRecency = [];
    ${declarations}
    return {
      readTenantCollectionViaRest, readCollection, getTenantCollectionSources,
      revisions: collectionReadRevisions, controllers: collectionReadControllers,
      dispose: ${cleanup},
      listener(colName, sourceCount = 1) {
        const collectionRefs = Array.from({ length: sourceCount }, () => ({}));
        const sourceItemsByIndex = new Map();
        const serverConfirmedSourceIndexes = new Set();
        const snapshotItemCollectors = ${expression('snapshotItemCollectors')};
        const setterCalls = [];
        const setFn = items => setterCalls.push(items);
        const isObject = false;
        const parser = null;
        let hasAppliedDataSnapshot = false;
        const applySnapshot = ${expression('applySnapshot')};
        const listener = (snapshot, sourceIndex = 0) => applySnapshot(snapshot, sourceIndex);
        listener.sourceItems = sourceItemsByIndex;
        listener.sources = collectionRefs;
        listener.setterCalls = setterCalls;
        return listener;
      },
    };
  `)(...Object.values(bindings));
  return { ...runtime, calls, tokens, sdkCalls, scans, events, clock, active, serverAt, snapshotAt };
}

function assertReadCleanup(h) {
  assert.equal(h.controllers.size, 0);
  assert.equal(h.clock.timers.size, 0);
  for (const scan of h.scans) {
    if (scan.signal) assert.equal(getEventListeners(scan.signal, 'abort').length, 0);
  }
}

for (const size of [0, 199, 200, 201, 400]) {
  test(`actual App transport completely collects ${size} records at its 200-page boundary`, async () => {
    const documents = fixture(size);
    const h = createHarness({ fetchPage: ({ body }) => pageResponse(documents, body) });
    await h.readCollection('orders', noop);
    assert.deepEqual(h.events.publications.map(event => event.items), [expected(documents)]);
    assert.deepEqual(h.events.confirmed, ['orders']);
    assert.deepEqual(h.events.publications[0].options, { source: 'server', keepPreviousOnEmpty: false });
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
      if (failure === 'json') return { ...response(null), json: async () => { throw new SyntaxError('Invalid JSON'); } };
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

test('actual listener feeds initial ignored cache snapshot before a metadata-only first publication', () => {
  const h = createHarness();
  const listener = h.listener('orders');
  const items = expected(fixture(3));
  const cached = incrementalSnapshot(items, [], { fromCache: true, hasPendingWrites: true });
  listener(cached.snapshot);
  assert.deepEqual(cached.reads, items.map(item => item.id));
  assert.deepEqual(h.events.publications, []);
  assert.deepEqual(h.events.confirmed, []);
  assert.equal(listener.sourceItems.size, 0, 'Ignored cache must not enter the published source union');
  const confirmed = incrementalSnapshot(items);
  listener(confirmed.snapshot);
  assert.notEqual(cached.snapshot.query, confirmed.snapshot.query);
  assert.deepEqual(confirmed.reads, [], 'Captured source ref must survive new snapshot query wrappers');
  assert.deepEqual(h.events.publications.map(event => event.items), [items]);
  assert.deepEqual(h.events.confirmed, ['orders']);
  const ack = incrementalSnapshot(items);
  listener(ack.snapshot);
  assert.deepEqual(ack.reads, []);
  assert.equal(h.events.publications.length, 1);
});

test('actual listener decodes one of 4000 changed documents and no metadata-only ACK data', () => {
  const h = createHarness();
  const listener = h.listener('orders');
  const items = expected(fixture(4000));
  const first = incrementalSnapshot(items);
  listener(first.snapshot);
  assert.equal(first.reads.length, 4000);
  const updated = items.map((item, index) => index === 2000
    ? { ...item, data: { ...item.data, amount: 99000 } } : item);
  const next = incrementalSnapshot(updated, [['modified', items[2000].id, 2000, 2000]], { hasPendingWrites: true });
  listener(next.snapshot);
  assert.deepEqual(next.reads, [items[2000].id]);
  assert.deepEqual(h.events.publications.at(-1).items, updated);
  const ack = incrementalSnapshot(updated);
  listener(ack.snapshot);
  assert.deepEqual(ack.reads, []);
  assert.equal(h.events.publications.length, 2);
  assert.deepEqual(h.events.publications[0].items, items, 'Previously published records remain unchanged');
});

test('actual listener publishes ignored cache modifications on the zero-change server ACK', () => {
  const h = createHarness();
  const listener = h.listener('orders');
  const items = expected(fixture(2));
  listener(incrementalSnapshot(items).snapshot);
  const cachedItems = items.map((item, index) => index === 0
    ? { ...item, data: { ...item.data, amount: 200 } } : item);
  const cache = incrementalSnapshot(cachedItems, [['modified', items[0].id, 0, 0]], { fromCache: true });
  listener(cache.snapshot);
  assert.deepEqual(cache.reads, [items[0].id]);
  assert.equal(h.events.publications.length, 1);
  assert.equal(listener.setterCalls.length, 1);
  assert.deepEqual(listener.sourceItems.get(0), items, 'Ignored cache does not directly replace published-source items');
  const ack = incrementalSnapshot(cachedItems);
  listener(ack.snapshot);
  assert.deepEqual(ack.reads, []);
  assert.equal(h.events.publications.length, 2, 'Server ACK must publish the previously ignored source change');
  assert.equal(listener.setterCalls.length, 2);
  assert.deepEqual(h.events.publications.at(-1).items, cachedItems);
  assert.deepEqual(listener.setterCalls.at(-1), cachedItems);
  assert.deepEqual(listener.sourceItems.get(0), cachedItems);
  const unchangedAck = incrementalSnapshot(cachedItems);
  listener(unchangedAck.snapshot);
  assert.deepEqual(unchangedAck.reads, []);
  assert.equal(h.events.publications.length, 2);
  assert.equal(listener.setterCalls.length, 2, 'Unchanged metadata must not trigger another setter');
  const finalItems = cachedItems.map((item, index) => index === 1
    ? { ...item, data: { ...item.data, amount: 300 } } : item);
  const final = incrementalSnapshot(finalItems, [['modified', items[1].id, 1, 1]]);
  listener(final.snapshot);
  assert.deepEqual(final.reads, [items[1].id]);
  assert.deepEqual(h.events.publications.at(-1).items, finalItems);
  assert.deepEqual(h.events.publications[0].items, items);
});

test('actual listener source union preserves per-source deltas and overlapping-ID precedence', () => {
  const h = createHarness();
  const listener = h.listener('messages', 2);
  assert.notEqual(listener.sources[0], listener.sources[1]);
  const item = (id, amount) => ({ id, data: { companyId: 'company-a', amount } });
  const a = [item('shared', 10), item('assigned', 1)];
  const b = [item('shared', 20), item('internal', 2)];
  const union = (...sources) => [...new Map(sources.flat().map(record => [record.id, record])).values()];
  listener(incrementalSnapshot(a, a.map((item, index) => ['added', item.id, -1, index])).snapshot, 0);
  listener(incrementalSnapshot(b, b.map((item, index) => ['added', item.id, -1, index])).snapshot, 1);
  assert.deepEqual(h.events.publications.at(-1).items, union(a, b));
  const nextA = [item('shared', 30), a[1]];
  const updateA = incrementalSnapshot(nextA, [['modified', 'shared', 0, 0]]);
  listener(updateA.snapshot, 0);
  assert.deepEqual(updateA.reads, ['shared']);
  assert.deepEqual(h.events.publications.at(-1).items, union(nextA, b));
  const nextB = [b[1]];
  const removeB = incrementalSnapshot(nextB, [['removed', 'shared', 0, -1]]);
  listener(removeB.snapshot, 1);
  assert.deepEqual(removeB.reads, []);
  assert.deepEqual(h.events.publications.at(-1).items, union(nextA, nextB));
  assert.equal(h.events.publications.at(-1).items[0].data.amount, 30);
  const publicationCount = h.events.publications.length;
  const metadataB = incrementalSnapshot(nextB);
  listener(metadataB.snapshot, 1);
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

test('actual listener immediately publishes cache-first secondary source union on a zero-change server ACK', () => {
  const h = createHarness();
  const listener = h.listener('messages', 2);
  const a = [{ id: 'assigned', data: { companyId: 'company-a', amount: 1 } }];
  const b = [{ id: 'internal', data: { companyId: 'company-a', amount: 2 } }];
  listener(incrementalSnapshot(a, [['added', 'assigned', -1, 0]]).snapshot, 0);
  const cachedB = incrementalSnapshot(b, [['added', 'internal', -1, 0]], { fromCache: true });
  listener(cachedB.snapshot, 1);
  assert.deepEqual(h.events.publications.map(event => event.items), [a]);
  assert.equal(listener.setterCalls.length, 1);
  assert.equal(listener.sourceItems.has(1), false);
  const confirmedB = incrementalSnapshot(b);
  listener(confirmedB.snapshot, 1);
  assert.deepEqual(cachedB.reads, ['internal']);
  assert.deepEqual(confirmedB.reads, []);
  assert.deepEqual(listener.sourceItems.get(1), b);
  assert.deepEqual(h.events.publications.map(event => event.items), [a, [...a, ...b]]);
  assert.equal(listener.setterCalls.length, 2);
  assert.deepEqual(listener.setterCalls.at(-1), [...a, ...b]);
  assert.deepEqual(h.events.confirmed, ['messages']);
  const unchangedB = incrementalSnapshot(b);
  listener(unchangedB.snapshot, 1);
  assert.deepEqual(unchangedB.reads, []);
  assert.equal(h.events.publications.length, 2);
  assert.equal(listener.setterCalls.length, 2);
  const updatedA = [{ ...a[0], data: { ...a[0].data, amount: 3 } }];
  listener(incrementalSnapshot(updatedA, [['modified', 'assigned', 0, 0]]).snapshot, 0);
  assert.deepEqual(h.events.publications.at(-1).items, [...updatedA, ...b]);
});

test('actual listener unchanged metadata ACKs on either source cause no extra collection setter calls', () => {
  const h = createHarness();
  const listener = h.listener('messages', 2);
  const a = [{ id: 'assigned', data: { companyId: 'company-a', amount: 1 } }];
  const b = [{ id: 'internal', data: { companyId: 'company-a', amount: 2 } }];
  listener(incrementalSnapshot(a, [['added', 'assigned', -1, 0]]).snapshot, 0);
  listener(incrementalSnapshot(b, [['added', 'internal', -1, 0]]).snapshot, 1);
  assert.equal(listener.setterCalls.length, 2);
  const priorA = listener.sourceItems.get(0)[0].data;
  const priorB = listener.sourceItems.get(1)[0].data;
  for (const [sourceIndex, items, metadata] of [
    [0, a, { hasPendingWrites: true }],
    [0, a, { hasPendingWrites: false }],
    [1, b, { hasPendingWrites: false }],
  ]) {
    const ack = incrementalSnapshot(items, [], metadata);
    listener(ack.snapshot, sourceIndex);
    assert.deepEqual(ack.reads, []);
    assert.equal(listener.setterCalls.length, 2);
    assert.equal(h.events.publications.length, 2);
  }
  assert.equal(listener.sourceItems.get(0)[0].data, priorA);
  assert.equal(listener.sourceItems.get(1)[0].data, priorB);
  assert.deepEqual(listener.setterCalls.at(-1), [...a, ...b]);
});

test('actual listener decode failure publishes no partial union or confirmation and recovers fully', () => {
  const h = createHarness();
  const listener = h.listener('orders');
  const items = expected(fixture(2));
  listener(incrementalSnapshot(items).snapshot);
  const updated = items.map(item => ({ ...item, data: { ...item.data, amount: 500 } }));
  const broken = incrementalSnapshot(updated, updated.map((item, index) => ['modified', item.id, index, index]));
  broken.snapshot.docs[1].data = () => { throw new Error('Snapshot decode failed'); };
  const confirmationCount = h.events.confirmed.length;
  assert.throws(() => listener(broken.snapshot), /Snapshot decode failed/);
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
    call === 1 ? pageResponse(fixture(201), body) : { ...response(null), json: () => json.promise }
  ) });
  const read = h.readCollection('orders', noop);
  await waitUntil(() => h.calls.length === 2);
  await h.clock.advance(9000);
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
