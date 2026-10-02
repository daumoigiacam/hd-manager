import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyInventoryOutcome, commitAtomicInventoryOperation } from '../src/services/inventoryTransactions.js';
import { appFunction } from './helpers/app-source-function.mjs';

const options = {
  projectId: 'test-project',
  firebaseUser: { getIdToken: async () => 'test-token' },
  appId: 'test-app',
  operation: { clientMutationId: 'same-retry-key', operationType: 'OUTBOUND', documentId: 'dispatch-test' },
};

test('missing deployment is reported without treating the dispatch as saved', async () => {
  await assert.rejects(commitAtomicInventoryOperation({ ...options,
    fetchImpl: async () => new Response('Not found', { status: 404 }),
  }), error => error.code === 'inventory_endpoint_unavailable'
    && error.status === 404 && !error.message.includes('Not found'));
});

test('network and timeout failures retain an unconfirmed outcome', async () => {
  for (const [cause, code] of [
    [new TypeError('Failed to fetch'), 'inventory_connection_unavailable'],
    [new DOMException('timed out', 'TimeoutError'), 'inventory_confirmation_timeout'],
    [new DOMException('aborted', 'AbortError'), 'inventory_confirmation_timeout'],
  ]) {
    await assert.rejects(commitAtomicInventoryOperation({ ...options,
      fetchImpl: async () => { throw cause; },
    }), error => error.code === code && error.cause === cause);
  }
});

test('dispatch errors never claim Firestore will sync an unconfirmed HTTP command', async () => {
  const friendlyMessage = appFunction('getFriendlyFirebaseErrorMessage', {
    isFirestoreInternalAssertionError: () => false,
    isFirebaseQuotaError: () => false,
    isFirebasePermissionError: () => false,
    isTimeoutLikeError: () => true,
  });
  const error = await commitAtomicInventoryOperation({ ...options,
    fetchImpl: async () => { throw new DOMException('timed out', 'TimeoutError'); },
  }).catch(value => value);
  assert.equal(friendlyMessage(error), error.message);
  assert.ok(!friendlyMessage(error).includes('tự đồng bộ'));
});

test('server inventory rejection preserves its business code and details', async () => {
  await assert.rejects(commitAtomicInventoryOperation({ ...options,
    fetchImpl: async () => Response.json({ success: false,
      code: 'inventory_insufficient_stock', details: { available: 2 },
    }, { status: 409 }),
  }), error => error.code === 'inventory_insufficient_stock' && error.status === 409
    && error.details.available === 2);
});

test('retry forwards the same mutation without a fallback or extra request', async () => {
  const bodies = [];
  const fetchImpl = async (url, request) => {
    assert.equal(url, 'https://us-central1-test-project.cloudfunctions.net/inventoryAtomicOperation');
    bodies.push(JSON.parse(request.body));
    if (bodies.length === 1) throw new TypeError('connection lost after request');
    return Response.json({ success: true, data: { operationId: 'receipt', documentId: 'dispatch-test', duplicate: true } });
  };
  await assert.rejects(commitAtomicInventoryOperation({ ...options, fetchImpl }));
  assert.deepEqual(await commitAtomicInventoryOperation({ ...options, fetchImpl }),
    { operationId: 'receipt', documentId: 'dispatch-test', duplicate: true, outcome: 'CONFIRMED' });
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0], bodies[1]);
  assert.equal(options.operation.clientMutationId, 'same-retry-key');
});

test('network, missing endpoint, permission, business rejection and conflict remain distinct', () => {
  for (const [code, status, outcome] of [
    ['inventory_connection_unavailable', 0, 'NETWORK_ERROR'],
    ['inventory_confirmation_timeout', 0, 'NETWORK_ERROR'],
    ['inventory_endpoint_unavailable', 404, 'BACKEND_ENDPOINT_NOT_FOUND'],
    ['unauthenticated', 401, 'PERMISSION_DENIED'],
    ['inventory_permission_denied', 403, 'PERMISSION_DENIED'],
    ['inventory_insufficient_stock', 409, 'BUSINESS_RULE_REJECTED'],
    [10, 500, 'CONFLICT_RETRY'],
    ['internal_error', 500, 'SERVER_ERROR'],
  ]) assert.equal(classifyInventoryOutcome(code, status), outcome);
});

test('malformed or mismatched HTTP success cannot clear a draft', async () => {
  for (const data of [null, {}, { operationId: 'receipt', documentId: 'different' }]) {
    await assert.rejects(commitAtomicInventoryOperation({ ...options,
      fetchImpl: async () => Response.json({ success: true, data }),
    }), { code: 'inventory_confirmation_invalid', outcome: 'NETWORK_ERROR' });
  }
});
