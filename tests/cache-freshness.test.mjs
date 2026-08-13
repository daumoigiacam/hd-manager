import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
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
  shouldReloadForRelease
} from '../src/services/releaseFreshness.js';

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

test('Firestore listeners distinguish cache delivery from server confirmation', () => {
  assert.match(appSource, /lastRealtimeServerSnapshotAtRef/);
  assert.match(appSource, /includeMetadataChanges:\s*true/);
  assert.match(appSource, /isServerConfirmedRealtimeSnapshot\(snapshot\)/);
  assert.match(appSource, /if \(!shouldApplyRealtimeSnapshot\(snapshot\)\)/);
  assert.match(appSource, /const hasPendingWrites = Boolean/);
  assert.match(appSource, /const readTenantCollectionViaRest = async/);
  assert.match(appSource, /hasActiveRealtimeListener\(activeRealtimeCollectionsRef\.current, collectionName\)/);
  assert.match(appSource, /forceRefreshCollectionRef\.current\?\.\(collectionName, \{ serverOnly: true \}\)/);
  assert.match(appSource, /CapacitorApp\.addListener\('appStateChange'/);
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
  assert.match(appSource, /if \(hasAppliedDataSnapshot && dataChangeCount === 0 && !hasLocalMutationForCollection\)/);
  assert.match(appSource, /hasAppliedDataSnapshot = true;\s*applyCollectionItems/);
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
  assert.match(appSource, /readTenantCollectionViaRest\(colName\)/);
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
  assert.match(appSource, /const renderExecutiveDashboard = \(\) => \([\s\S]*?<ExecutiveDashboardView/);
  assert.match(appSource, /if \(!shouldApplyRealtimeSnapshot\(snapshot\)\)/);
  assert.match(appSource, /readTenantCollectionViaRest\(colName\)/);
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
