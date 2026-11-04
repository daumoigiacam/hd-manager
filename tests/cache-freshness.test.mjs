import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from '@babel/parser';
import { subscribeScopedNativeEvent } from '../src/services/scopedNativeListener.js';
import {
  getRealtimeDataChangeCount,
  getRealtimeSnapshotSource,
  isRealtimeWriteConfirmed,
  isServerConfirmedRealtimeSnapshot,
  shouldApplyRealtimeSnapshot,
  isServerSnapshotFresh
} from '../src/services/realtimeFreshness.js';
import {
  buildReleaseManifestUrl,
  installReleaseFreshnessMonitor,
  shouldReloadForRelease
} from '../src/services/releaseFreshness.js';

test('alternating release manifests cannot cause a rapid reload loop across page loads', async () => {
  const values = new Map();
  const replacements = [];
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  for (const [buildId, remote] of [['a', 'b'], ['b', 'a'], ['a', 'c']]) {
    let timer;
    const stop = installReleaseFreshnessMonitor({ buildId,
      windowRef: { sessionStorage: storage, localStorage: storage,
        location: { protocol: 'https:', origin: 'https://app.hdconnect.net', href: 'https://app.hdconnect.net/', replace: url => replacements.push(url) },
        setTimeout: callback => { timer = callback; return 1; }, clearTimeout() {}, addEventListener() {}, removeEventListener() {} },
      documentRef: {}, fetchImpl: async () => ({ ok: true, json: async () => ({ buildId: remote }) }) });
    timer();
    await new Promise(resolve => setImmediate(resolve));
    stop();
  }
  assert.equal(replacements.length, 1);
});

const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const viteSource = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
const firestoreMockSource = fs.readFileSync(new URL('../src/mocks/firebase-firestore.js', import.meta.url), 'utf8');

test('only a server-confirmed snapshot can suppress a background refresh', () => {
  const now = 100000;
  assert.equal(isServerSnapshotFresh(now - 1000, { now }), true);
  assert.equal(isServerSnapshotFresh(now - 25000, { now }), false);
  assert.equal(isServerSnapshotFresh(0, { now }), false);
  assert.equal(getRealtimeSnapshotSource({ metadata: { fromCache: true } }), 'cache');
  assert.equal(getRealtimeSnapshotSource({ metadata: { fromCache: false } }), 'server');
});

test('Firestore listeners distinguish cache delivery from server confirmation', async () => {
  assert.match(appSource, /lastRealtimeServerSnapshotAtRef/);
  assert.match(appSource, /includeMetadataChanges:\s*true/);
  assert.match(appSource, /isServerConfirmedRealtimeSnapshot\(snapshot\)/);
  assert.match(appSource, /if \(!shouldApplyRealtimeSnapshot\(snapshot\)\)/);
  assert.match(appSource, /const hasPendingWrites = Boolean/);
  assert.match(appSource, /const readTenantCollectionViaRest = async/);
  assert.match(appSource, /hasActiveRealtimeListener\(activeRealtimeCollectionsRef\.current, collectionName\)/);
  assert.match(appSource, /forceRefreshCollectionRef\.current\?\.\(collectionName, \{ serverOnly: true \}\)/);
  // Extract and execute the current App effect, rather than requiring the old
  // direct addListener spelling or testing a reimplementation of its callback.
  const tree = parse(appSource, { sourceType: 'module', plugins: ['jsx'] });
  const effects = [], registrations = [];
  const visit = (node, inspect) => {
    if (!node || typeof node !== 'object') return;
    inspect(node);
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'extra', 'comments'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(child => visit(child, inspect));
      else if (value?.type) visit(value, inspect);
    }
  };
  visit(tree, node => {
    if (node.type === 'CallExpression' && node.callee.name === 'useEffect'
      && Array.isArray(node.arguments[0]?.body?.body)
      && node.arguments[0].body.body.some(statement => statement.type === 'VariableDeclaration'
        && statement.declarations.some(declaration => declaration.id.name === 'refreshForegroundCollections'))) effects.push(node.arguments[0]);
  });
  assert.equal(effects.length, 1, 'App must own one foreground refresh effect');
  visit(effects[0], node => {
    if (node.type === 'CallExpression' && node.callee.name === 'subscribeScopedNativeEvent'
      && node.arguments[0]?.name === 'CapacitorApp' && node.arguments[1]?.value === 'appStateChange') registrations.push(node);
  });
  assert.equal(registrations.length, 1, 'the App effect must register appStateChange through the scoped owner');
  assert.ok(tree.program.body.some(node => node.type === 'ImportDeclaration'
    && node.source.value === './services/scopedNativeListener.js'
    && node.specifiers.some(specifier => specifier.imported?.name === 'subscribeScopedNativeEvent'
      && specifier.local.name === 'subscribeScopedNativeEvent')), 'the wrapper must resolve to the actual lifecycle helper');
  const effect = appSource.slice(effects[0].start, effects[0].end);
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  for (const lateRegistration of [false, true]) {
    let now = 20000;
    const refreshes = [];
    const mount = (uid, names) => {
      let resolve, callback, removals = 0;
      const windowListeners = new Map(), documentListeners = new Map(), registrations = [];
      const plugin = { addListener(name, listener) {
        registrations.push(name); callback = listener;
        return new Promise(ready => { resolve = ready; });
      } };
      const bindings = {
        firebaseUser: { uid }, isFirebaseConfigured: true, isNativeRuntime: () => true,
        CapacitorApp: plugin, subscribeScopedNativeEvent, Date: { now: () => now },
        window: { addEventListener: (name, listener) => windowListeners.set(name, listener),
          removeEventListener: (name, listener) => { assert.equal(windowListeners.get(name), listener); windowListeners.delete(name); } },
        document: { visibilityState: 'visible', addEventListener: (name, listener) => documentListeners.set(name, listener),
          removeEventListener: (name, listener) => { assert.equal(documentListeners.get(name), listener); documentListeners.delete(name); } },
        FIRESTORE_WRITE_EVENT: 'fixture-write', lastCriticalRefreshAtRef: { current: 0 },
        activeRealtimeCollectionsRef: { current: new Set(names) },
        scheduleCollectionRefresh: (name, delays) => refreshes.push({ uid, name, delays }),
        applyLocalCollectionDelete() {}, applyLocalCollectionWrite() {},
      };
      const cleanup = new Function(...Object.keys(bindings), `return (${effect})();`)(...Object.values(bindings));
      return { cleanup, emit: value => callback(value), registrations,
        resolve: () => resolve({ remove() { removals++; } }),
        read: () => ({ removals, window: windowListeners.size, document: documentListeners.size }) };
    };
    const old = mount('actor-a', ['orders', 'payments']);
    assert.deepEqual(old.registrations, ['appStateChange']);
    old.emit({ isActive: false }); assert.equal(refreshes.length, 0);
    old.emit({ isActive: true });
    assert.deepEqual(refreshes, ['orders', 'payments'].map(name => ({ uid: 'actor-a', name, delays: [900, 3200] })));
    old.emit({ isActive: true }); assert.equal(refreshes.length, 2, 'foreground bursts retain the existing throttle');
    if (!lateRegistration) { old.resolve(); await flush(); }
    old.cleanup(); now += 20000; old.emit({ isActive: true });
    assert.equal(refreshes.length, 2, 'cleanup detaches the App closure synchronously, even before native removal resolves');
    if (lateRegistration) { old.resolve(); await flush(); }
    assert.deepEqual(old.read(), { removals: 1, window: 0, document: 0 });
    const current = mount('actor-b', ['financials']);
    old.emit({ isActive: true }); current.emit({ isActive: true });
    assert.deepEqual(refreshes.at(-1), { uid: 'actor-b', name: 'financials', delays: [900, 3200] });
    assert.equal(refreshes.length, 3, 'an old native callback cannot refresh a replacement account');
    current.resolve(); await flush(); current.cleanup(); now += 20000;
    old.emit({ isActive: true }); current.emit({ isActive: true });
    assert.equal(refreshes.length, 3); assert.deepEqual(current.read(), { removals: 1, window: 0, document: 0 });
  }
  assert.match(appSource, /native-app-active/);
});

test('cached snapshots never replace business data and pending snapshots are not server confirmation', () => {
  const cached = { metadata: { fromCache: true, hasPendingWrites: false } };
  const localPending = { metadata: { fromCache: false, hasPendingWrites: true } };
  const confirmed = { metadata: { fromCache: false, hasPendingWrites: false } };

  assert.equal(shouldApplyRealtimeSnapshot(cached), false);
  assert.equal(isServerConfirmedRealtimeSnapshot(cached), false);
  assert.equal(shouldApplyRealtimeSnapshot(localPending), true);
  assert.equal(isServerConfirmedRealtimeSnapshot(localPending), false);
  assert.equal(isServerConfirmedRealtimeSnapshot(confirmed), true);
});

test('metadata-only realtime snapshots are detected without counting metadata changes as data', () => {
  let receivedOptions = null;
  const metadataOnlySnapshot = {
    docChanges: (options) => {
      receivedOptions = options;
      return [];
    }
  };
  const changedSnapshot = {
    docChanges: () => [{ type: 'modified' }]
  };

  assert.equal(getRealtimeDataChangeCount(metadataOnlySnapshot), 0);
  assert.deepEqual(receivedOptions, { includeMetadataChanges: false });
  assert.equal(getRealtimeDataChangeCount(changedSnapshot), 1);
  assert.equal(getRealtimeDataChangeCount({}), null);
});

test('realtime rendering skips repeated metadata-only snapshots but preserves the first payload', () => {
  assert.match(appSource, /let hasAppliedDataSnapshot = false;/);
  assert.match(appSource, /let hasLocalMutationForCollection = false;/);
  assert.match(appSource, /for \(const write of recentLocalWritesRef\.current\.values\(\)\)/);
  assert.match(appSource, /for \(const entry of recentLocalDeletesRef\.current\.values\(\)\)/);
  assert.match(appSource, /const unchanged = hasAppliedDataSnapshot && dataChangeCount === 0 && !hasSourceDataChanges && !hasLocalMutationForCollection/);
  assert.match(appSource, /const applied=await applyCollectionItems[\s\S]*if\(applied===false \|\| cancelled \|\| !listenerActive\)return;[\s\S]*committedSourceItemsByIndex\.clear\(\);[\s\S]*hasAppliedDataSnapshot = true;/);
  assert.match(appSource, /if \(isPerformanceMonitorEnabled\(\)\)/);
});

test('an older order snapshot cannot confirm and overwrite a freshly edited amount', () => {
  const expected = { amount: 62000, updatedAt: '2026-08-10T10:00:00.000Z' };
  assert.equal(isRealtimeWriteConfirmed({
    data: { amount: 60000, updatedAt: '2026-08-10T09:59:00.000Z' }
  }, expected), false);
  assert.equal(isRealtimeWriteConfirmed({
    data: { amount: 62000, updatedAt: '2026-08-10T10:00:00.000Z' }
  }, expected), true);
});

test('persistent business collection cache is purged and never hydrated', () => {
  assert.match(appSource, /staleKeys\.forEach\(key => window\.localStorage\.removeItem\(key\)\)/);
  assert.match(appSource, /Business data must never be hydrated from a stale device cache/);
  assert.doesNotMatch(appSource, /cachedValue\.map\(value => parser\(value\)\)/);
  assert.doesNotMatch(appSource, /saveRealtimeCollectionCache/);
  assert.match(appSource, /readTenantCollectionViaRest\(colName, \{ signal: controller.signal, isCurrent \}\)/);
});

test('undated financial rows are not reassigned to the current day or month', () => {
  assert.match(appSource, /const getExpenseDateValue =[\s\S]*?return value \|\| '';/);
  assert.match(appSource, /return Boolean\(key\) && buildMonthKeyFromDate\(key\) === monthKey;/);
  assert.match(appSource, /return Boolean\(orderDateKey\) && buildMonthKeyFromDate\(orderDateKey\) === monthKey;/);
  assert.doesNotMatch(appSource, /buildMonthKeyFromDate\(key \|\| getTodayString\(\)\)/);
  assert.doesNotMatch(appSource, /buildMonthKeyFromDate\(orderDateKey \|\| getTodayString\(\)\)/);
});

test('company dashboard renders immediately while server-confirmed data syncs in the background', () => {
  assert.doesNotMatch(appSource, /COMPANY_DASHBOARD_SERVER_COLLECTION_NAMES/);
  assert.doesNotMatch(appSource, /isCompanyDashboardServerReady/);
  assert.doesNotMatch(appSource, /Đang đồng bộ dữ liệu mới nhất/);
  assert.match(appSource, /const renderExecutiveDashboard = \(\) => \([\s\S]*?<(?:Memoized)?ExecutiveDashboardView/);
  assert.match(appSource, /if \(!shouldApplyRealtimeSnapshot\(snapshot\)\)/);
  assert.match(appSource, /readTenantCollectionViaRest\(colName, \{ signal: controller.signal, isCurrent \}\)/);
});

test('preview Firestore supports the same freshness APIs as production', () => {
  assert.match(firestoreMockSource, /export const getDocsFromServer = getDocs/);
  assert.match(firestoreMockSource, /export const getDocFromServer = getDoc/);
  assert.match(firestoreMockSource, /fromCache:\s*false/);
});

test('web release freshness reloads only once for a genuinely newer build', () => {
  assert.equal(shouldReloadForRelease({
    currentReleaseId: 'build-a',
    remoteReleaseId: 'build-b'
  }), true);
  assert.equal(shouldReloadForRelease({
    currentReleaseId: 'build-a',
    remoteReleaseId: 'build-a'
  }), false);
  assert.equal(shouldReloadForRelease({
    currentReleaseId: 'build-a',
    remoteReleaseId: 'build-b',
    guardedReleaseId: 'build-b'
  }), false);

  const manifestUrl = new URL(buildReleaseManifestUrl('https://app.hdconnect.net', 12345));
  assert.equal(manifestUrl.pathname, '/version.json');
  assert.equal(manifestUrl.searchParams.get('t'), '12345');
});

test('production build emits a release manifest and discourages stale HTML caching', () => {
  assert.match(viteSource, /fileName:\s*'version\.json'/);
  assert.match(viteSource, /VITE_HD_BUILD_ID/);
  assert.match(indexSource, /no-cache, no-store, must-revalidate/);
  assert.match(indexSource, /__HD_MANAGER_BUILD_ID__/);
});
