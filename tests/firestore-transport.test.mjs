import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { initializeFirestore, terminate } from 'firebase/firestore';
import { getFirestoreTransportOptions } from '../src/services/firestoreTransport.js';

const capable = () => ({ fetch() {}, ReadableStream: class { getReader() {} }, TextDecoder: class {}, Response: class { get body() { return null; } } });
test('capable engines consume response chunks; missing or restricted capabilities select closed long polls', () => {
  assert.deepEqual(getFirestoreTransportOptions(capable()), { useFetchStreams: true, experimentalForceLongPolling: false });
  for (const key of ['fetch', 'ReadableStream', 'TextDecoder', 'Response']) {
    assert.deepEqual(getFirestoreTransportOptions({ ...capable(), [key]: undefined }), { useFetchStreams: false, experimentalForceLongPolling: true });
  }
  assert.equal(getFirestoreTransportOptions({ ...capable(), ReadableStream: class {} }).useFetchStreams, false);
  assert.equal(getFirestoreTransportOptions({ ...capable(), Response: class {} }).useFetchStreams, false);
  assert.deepEqual(getFirestoreTransportOptions({ get fetch() { throw Error('restricted'); } }), { useFetchStreams: false, experimentalForceLongPolling: true });
});

test('installed Firebase SDK accepts both transport branches without enabling auto-detect or changing data settings', async () => {
  for (const scope of [capable(), {}]) {
    const app = initializeApp({ projectId: 'demo-transport-test', apiKey: 'fixture' }, `transport-${Object.keys(scope).length}`);
    const options = { experimentalAutoDetectLongPolling: false, ...getFirestoreTransportOptions(scope) };
    const db = initializeFirestore(app, options);
    try {
      // Inspect settings only. No login, read, write or external request occurs.
      const settings = db._getSettings();
      assert.equal(settings.experimentalAutoDetectLongPolling, false);
      assert.equal(settings.useFetchStreams, options.useFetchStreams);
      assert.equal(settings.experimentalForceLongPolling, options.experimentalForceLongPolling);
      assert.equal(settings.ignoreUndefinedProperties, false);
      assert.equal(settings.ssl, true);
    } finally { await terminate(db); await deleteApp(app); }
  }
});
