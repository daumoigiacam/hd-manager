import assert from 'node:assert/strict';
import test from 'node:test';
import { getFirebaseEmulatorConfig, getFirebaseFunctionsOrigin, getFirestoreRestOrigin } from '../src/config/firebase-endpoints.js';

test('demo mode keeps Functions, REST and SDK on the same local project', () => {
  const env = { MODE: 'emulator', VITE_FIREBASE_EMULATORS: 'true' };
  const project = 'demo-hd-manager-local';
  assert.equal(getFirebaseFunctionsOrigin(project, env), `http://127.0.0.1:5002/${project}/us-central1`);
  assert.equal(getFirestoreRestOrigin(project, env), 'http://127.0.0.1:8185');
  assert.deepEqual(getFirebaseEmulatorConfig(project, env), { host: '127.0.0.1', authPort: 9199, firestorePort: 8185, functionsPort: 5002 });
});

test('production/staging targets cannot be redirected into the emulator accidentally', () => {
  for (const project of ['hd-manager-c5839', 'staging-test']) {
    assert.throws(() => getFirebaseFunctionsOrigin(project, { MODE: 'emulator', VITE_FIREBASE_EMULATORS: 'true' }));
  }
  for (const MODE of ['production', 'development', undefined]) {
    assert.throws(() => getFirebaseFunctionsOrigin('demo-test', { MODE, VITE_FIREBASE_EMULATORS: 'true' }));
  }
  assert.equal(getFirebaseFunctionsOrigin('hd-manager-c5839', {}), 'https://us-central1-hd-manager-c5839.cloudfunctions.net');
  assert.equal(getFirestoreRestOrigin('hd-manager-c5839', {}), 'https://firestore.googleapis.com');
});

test('function origins reject URL injection and preserve explicit valid regions', () => {
  assert.throws(() => getFirebaseFunctionsOrigin('../project', {}));
  assert.throws(() => getFirebaseFunctionsOrigin('project', { VITE_FIREBASE_FUNCTIONS_REGION: 'us-central1/else' }));
  assert.equal(getFirebaseFunctionsOrigin('project', { VITE_FIREBASE_FUNCTIONS_REGION: 'asia-southeast1' }), 'https://asia-southeast1-project.cloudfunctions.net');
});
