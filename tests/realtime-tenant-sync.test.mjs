import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const getSection = (startMarker, endMarker) => {
  const start = appSource.indexOf(startMarker);
  const end = appSource.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `Missing source marker: ${startMarker}`);
  assert.ok(end > start, `Missing end marker: ${endMarker}`);
  return appSource.slice(start, end);
};

test('realtime customer listeners are constrained by both company and customer', () => {
  const section = getSection('const getTenantCollectionSources =', 'const getSnapshotItems =');

  assert.match(section, /firebaseWhere\('companyId', '==', tenantCompanyId\),\s*firebaseWhere\('customerId', '==', sessionCustomerId\)/);
  assert.match(section, /if \(!customerSession\)[\s\S]*?firebaseWhere\('companyId', '==', tenantCompanyId\)/);
});

test('queued writes remain isolated while a user changes tenant', () => {
  const section = getSection('const flushPendingFirebaseWriteNow =', 'const requireSharedWriteConfirmation =');

  assert.match(section, /const inFlightKey = `\$\{normalizeTenantStorageScope\(companyId\)\}:\$\{key\}`/);
  assert.match(section, /item\?\.key === key && `\$\{item\?\.companyId \|\| ''\}`\.trim\(\) === companyId/);
  assert.match(section, /if \(activeTenantScopeRef\.current !== companyId\)/);
  assert.match(section, /savePendingFirebaseWrites\(scopedWrites, companyId\)/);
  assert.match(section, /pendingFirebaseWritePromisesRef\.current\.delete\(inFlightKey\)/);
});

test('each tenant flushes independently without duplicate retry work', () => {
  const section = getSection(
    'const flushPendingWrites = async',
    '}, [firebaseUser?.uid, currentUser?.companyId, pendingFirebaseWriteCount]);'
  );

  assert.match(section, /pendingFirebaseFlushInFlightRef\.current\.has\(companyId\)/);
  assert.match(section, /pendingFirebaseFlushInFlightRef\.current\.add\(companyId\)/);
  assert.match(section, /pendingFirebaseFlushInFlightRef\.current\.delete\(companyId\)/);
  assert.match(section, /flushPendingFirebaseWriteNow\(write\.collectionName, write\.documentId, 8000, companyId\)/);
});

test('realtime keeps only baseline data at startup and scopes business listeners to the active workspace', () => {
  assert.match(appSource, /const BASELINE_REALTIME_COLLECTION_NAMES = \['companies', 'employees', 'notifications'\]/);
  assert.match(appSource, /const FOREGROUND_REALTIME_COLLECTIONS_BY_TAB = Object\.freeze\(/);
  assert.match(appSource, /const WEB_FOREGROUND_REALTIME_LISTENER_LIMIT = 12/);
  assert.match(appSource, /const NATIVE_FOREGROUND_REALTIME_LISTENER_LIMIT = 8/);
  assert.match(appSource, /const activateForegroundRealtimeCollections = \(collectionNames = \[\]\) =>/);
  assert.match(appSource, /planForegroundRealtimeActivation\(\{/);
  assert.match(appSource, /activeNames: Array\.from\(foregroundRealtimeCollectionNames\)/);
  assert.match(appSource, /limit: foregroundListenerLimit/);
  assert.match(appSource, /activationPlan\.evictedNames\.forEach/);
  assert.match(
    appSource,
    /readCollection\(colName, setFn, isObject, parser\)[\s\S]*?\.finally\(\(\) => \{[\s\S]*?foregroundReadOnlyCollectionNames\.delete\(colName\)/
  );
  assert.match(appSource, /return \(\) => \{\};/);
  assert.match(
    appSource,
    /const baselineRealtimeCollectionNames = customerSession\s*\? \['notifications', 'messages'\]\s*:\s*BASELINE_REALTIME_COLLECTION_NAMES/
  );
  assert.match(appSource, /baselineRealtimeCollectionNames\.forEach/);
  assert.match(appSource, /return activateForegroundRealtimeRef\.current\(collectionNames\)/);
  assert.match(appSource, /if \(!force && hasActiveRealtimeListener\(activeRealtimeCollectionsRef\.current, colName\)\)/);
  assert.doesNotMatch(appSource, /const refreshAllCollections = async/);
  assert.doesNotMatch(appSource, /collectionBindings\.forEach\(\(binding\) =>/);
});
