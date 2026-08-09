import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  getRealtimeSnapshotSource,
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
  assert.match(appSource, /if \(!fromCache\)\s*\{\s*lastRealtimeServerSnapshotAtRef\.current\.set/);
  assert.match(appSource, /getDocsFromServer as firebaseGetDocsFromServer/);
  assert.match(appSource, /forceRefreshCollectionRef\.current\?\.\(collectionName, \{ serverOnly: true \}\)/);
  assert.match(appSource, /CapacitorApp\.addListener\('appStateChange'/);
  assert.match(appSource, /native-app-active/);
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
