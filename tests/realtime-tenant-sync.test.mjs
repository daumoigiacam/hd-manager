import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from '@babel/parser';
import { COMPANY_HOME_PRIMARY_COLLECTIONS, isCompanyPrimaryHomeReadPlan } from '../src/services/homeDataContract.js';

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
  assert.match(appSource, /activationPlan\.evictedNames\.forEach/);
  assert.match(
    appSource,
    /readCollection\(colName, setFn, isObject, parser, \{ signal: controller\.signal \}\)[\s\S]*?\.finally\(\(\) => \{[\s\S]*?foregroundReadOnlyCollectionNames\.delete\(colName\)/
  );
  assert.match(appSource, /return \(\) => \{\};/);
  assert.match(
    appSource,
    /const baselineRealtimeCollectionNames = customerSession\s*\? \['notifications', 'messages'\]\s*:\s*BASELINE_REALTIME_COLLECTION_NAMES/
  );
  const tree = parse(appSource, { sourceType: 'module', plugins: ['jsx'] });
  let call, activationCall;
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee?.name === 'startBaselineSubscriptions') call = node;
    if (node.type === 'CallExpression' && node.callee?.name === 'planForegroundRealtimeActivation') activationCall = node;
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value?.type) visit(value);
    }
  };
  visit(tree); assert.ok(call, 'Actual baseline admission call must exist');
  assert.ok(activationCall, 'Actual foreground listener plan must exist');
  const limitExpression = activationCall.arguments[0].properties.find(property => property.key.name === 'limit').value;
  const actualLimit = new Function('nativeRealtimeStartup', 'isCompanyPrimaryHomeReadPlan', 'collectionNames', 'foregroundListenerLimit',
    `return (${appSource.slice(limitExpression.start, limitExpression.end)})`);
  for (const native of [false, true]) for (const limit of [0, 4, 8, 12]) {
    assert.equal(actualLimit(native, isCompanyPrimaryHomeReadPlan, ['orders'], limit), limit, 'Ordinary workspaces retain the configured listener limit');
    assert.equal(actualLimit(native, isCompanyPrimaryHomeReadPlan, COMPANY_HOME_PRIMARY_COLLECTIONS, limit), native ? Math.min(limit, 7) : limit,
      'Native primary Home keeps its REST lane without exceeding the configured listener budget');
  }
  const properties = call.arguments[0].properties;
  const bindingExpression = properties.find(property => property.key.name === 'bindings').value;
  const admitted = new Function('baselineRealtimeCollectionNames', 'collectionBindingMap', 'startupNotificationBarrier',
    `return (${appSource.slice(bindingExpression.start, bindingExpression.end)})`);
  const baseline = ['companies', 'employees', 'notifications'];
  const bindings = new Map(baseline.map(name => [name, [name]]));
  assert.deepEqual(admitted(baseline, bindings, {}), [['companies'], ['employees']], 'Only notifications waits behind the startup barrier');
  assert.deepEqual(admitted(baseline, bindings, null), baseline.map(name => [name]), 'Customer/preview path keeps its existing subscriptions');
  assert.equal(properties.find(property => property.key.name === 'coreNames').value.name, 'CORE_DATA_COLLECTION_NAMES');
  assert.match(appSource, /if \(!canStartBusinessSubscriptions\(currentUser\?\.accountType, isCoreDataLoaded\)\) return undefined/);
  assert.match(appSource, /return activateForegroundRealtimeRef\.current\(collectionNames\)/);
  assert.match(appSource, /if \(!force && hasActiveRealtimeListener\(activeRealtimeCollectionsRef\.current, colName\)\)/);
  assert.doesNotMatch(appSource, /const refreshAllCollections = async/);
  assert.doesNotMatch(appSource, /collectionBindings\.forEach\(\(binding\) =>/);
});
