import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyRuntimeRequest,
  collectFirebaseRequests,
  summarizeRuntimeRequests,
  validateSmokeTarget,
} from './vps-browser-smoke.mjs';

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
      'http://127.0.0.1:4173/src/mocks/firebase-firestore.js',
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

test('runtime request classification separates VPS, Firebase categories and analytics without query data', () => {
  assert.deepEqual(
    classifyRuntimeRequest('https://staging-api.hdconnect.net/api/v1/identity/me?access_token=redacted', 'https://staging-api.hdconnect.net'),
    { category: 'VPS API', origin: 'https://staging-api.hdconnect.net', path: '/api/v1/identity/me' },
  );
  assert.deepEqual(
    classifyRuntimeRequest('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=redacted'),
    { category: 'Firebase Auth', origin: 'https://identitytoolkit.googleapis.com', path: '/v1/accounts:signInWithPassword' },
  );
  assert.deepEqual(
    classifyRuntimeRequest('https://firestore.googleapis.com/v1/projects/redacted/databases/(default)/documents'),
    { category: 'Firestore', origin: 'https://firestore.googleapis.com', path: '/v1/projects/redacted/databases/(default)/documents' },
  );
  assert.deepEqual(
    classifyRuntimeRequest('https://www.googletagmanager.com/gtag/js?id=redacted'),
    { category: 'Analytics', origin: 'https://www.googletagmanager.com', path: '/gtag/js' },
  );
});

test('runtime request summary is deterministic and redacts query strings', () => {
  assert.deepEqual(
    summarizeRuntimeRequests([
      'https://staging-api.hdconnect.net/api/v1/products?cursor=secret',
      'https://staging-api.hdconnect.net/api/v1/products?cursor=other',
      'https://securetoken.googleapis.com/v1/token?refresh_token=redacted',
    ], 'https://staging-api.hdconnect.net'),
    {
      counts: { 'Firebase Auth': 1, 'VPS API': 2 },
      paths: {
        'Firebase Auth': ['/v1/token'],
        'VPS API': ['/api/v1/products'],
      },
    },
  );
});
