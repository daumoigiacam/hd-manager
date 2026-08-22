import test from 'node:test';
import assert from 'node:assert/strict';
import { collectFirebaseRequests, validateSmokeTarget } from './vps-browser-smoke.mjs';

test('browser smoke rejects production targets', () => {
  assert.throws(() => validateSmokeTarget('https://app.hdconnect.net', 'app'), /production/);
  assert.throws(() => validateSmokeTarget('https://api.hdconnect.net', 'api'), /production/);
});

test('browser smoke rejects Firebase targets', () => {
  assert.throws(() => validateSmokeTarget('https://example.firebaseapp.com', 'app'), /Firebase/);
  assert.throws(() => validateSmokeTarget('https://example.cloudfunctions.net', 'api'), /Firebase/);
});

test('browser smoke rejects unapproved external targets', () => {
  assert.throws(() => validateSmokeTarget('https://example.test', 'app'), /approved staging host/);
  assert.doesNotThrow(() => validateSmokeTarget('http://127.0.0.1:4173', 'app'));
  assert.doesNotThrow(() => validateSmokeTarget('https://staging-api.hdconnect.net', 'api'));
});

test('Firebase request inventory is deterministic and does not expose values', () => {
  assert.deepEqual(
    collectFirebaseRequests([
      'https://staging-api.hdconnect.net/api/v1/health',
      'https://firestore.googleapis.com/v1/projects/redacted',
      'https://us-central1-example.cloudfunctions.net/redacted',
      'https://firebasestorage.googleapis.com/v0/b/redacted/o/file',
      'https://redacted.firebasestorage.app/o/file',
      'https://securetoken.googleapis.com/v1/token',
    ]),
    [
      'https://firestore.googleapis.com/v1/projects/redacted',
      'https://us-central1-example.cloudfunctions.net/redacted',
      'https://firebasestorage.googleapis.com/v0/b/redacted/o/file',
      'https://redacted.firebasestorage.app/o/file',
      'https://securetoken.googleapis.com/v1/token',
    ],
  );
});
