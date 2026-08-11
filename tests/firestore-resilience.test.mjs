import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  hasActiveRealtimeListener,
  runResilientFirestoreWrite
} from '../src/services/firestoreResilience.js';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('a synchronous Firestore assertion falls back to REST exactly once', async () => {
  let restCalls = 0;
  let internalFailures = 0;
  const result = await runResilientFirestoreWrite({
    sdkWrite: () => {
      throw new Error('FIRESTORE INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)');
    },
    restWrite: async () => {
      restCalls += 1;
      return { id: 'dispatch-1' };
    },
    isInternalError: error => `${error?.message || ''}`.includes('INTERNAL ASSERTION FAILED'),
    onSdkInternalError: () => {
      internalFailures += 1;
    }
  });

  assert.deepEqual(result, { id: 'dispatch-1' });
  assert.equal(restCalls, 1);
  assert.equal(internalFailures, 1);
});

test('an asynchronous Firestore assertion also falls back without duplicating the write', async () => {
  let sdkCalls = 0;
  let restCalls = 0;
  await runResilientFirestoreWrite({
    sdkWrite: async () => {
      sdkCalls += 1;
      throw new Error('INTERNAL ASSERTION FAILED: ca9');
    },
    restWrite: async () => {
      restCalls += 1;
      return { ok: true };
    },
    isInternalError: error => `${error?.message || ''}`.includes('INTERNAL ASSERTION FAILED')
  });
  assert.equal(sdkCalls, 1);
  assert.equal(restCalls, 1);
});

test('ordinary permission errors are never hidden by the internal-error fallback', async () => {
  let restCalls = 0;
  await assert.rejects(
    runResilientFirestoreWrite({
      sdkWrite: async () => {
        const error = new Error('Missing or insufficient permissions');
        error.code = 'permission-denied';
        throw error;
      },
      restWrite: async () => {
        restCalls += 1;
      },
      isInternalError: () => false
    }),
    /insufficient permissions/
  );
  assert.equal(restCalls, 0);
});

test('a poisoned SDK session bypasses the SDK and writes through REST', async () => {
  let sdkCalls = 0;
  let restCalls = 0;
  await runResilientFirestoreWrite({
    preferRest: true,
    sdkWrite: async () => {
      sdkCalls += 1;
    },
    restWrite: async () => {
      restCalls += 1;
      return { ok: true };
    },
    isInternalError: () => false
  });
  assert.equal(sdkCalls, 0);
  assert.equal(restCalls, 1);
});

test('active realtime listeners suppress overlapping transient refreshes', () => {
  const active = new Set(['warehouseDispatches']);
  assert.equal(hasActiveRealtimeListener(active, 'warehouseDispatches'), true);
  assert.equal(hasActiveRealtimeListener(active, 'orders'), false);
  assert.equal(hasActiveRealtimeListener(null, 'warehouseDispatches'), false);
});

test('App prevents the known ca9/b815 trigger and never exposes its raw stack in warehouse UI', () => {
  assert.match(appSource, /experimentalAutoDetectLongPolling:\s*false/);
  assert.doesNotMatch(appSource, /firebaseEnableNetwork|requestFirestoreNetworkEnable|enableNetwork\(db\)/);
  assert.match(appSource, /readTenantCollectionViaRest/);
  assert.match(appSource, /hasActiveRealtimeListener\(activeRealtimeCollectionsRef\.current, collectionName\)/);
  assert.match(appSource, /runResilientFirestoreWrite\(\{/);
  assert.match(appSource, /setDispatchError\(getFriendlyFirebaseErrorMessage\(/);
  assert.doesNotMatch(appSource, /setDispatchError\(error\?\.message \|\| 'Không thể lưu phiếu xuất kho/);
});
