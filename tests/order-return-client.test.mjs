import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { commitOrderReturnTransaction } from '../src/services/orderReturns.js';

const options = { projectId: 'demo-test', firebaseUser: { getIdToken: async () => 'token' }, appId: 'test',
  request: { orderId: 'order-test', clientMutationId: 'return-same-key' } };

test('return transport failure stays unconfirmed and retry retains command identity', async () => {
  const requests = [];
  const fetchImpl = async (_, request) => {
    requests.push(JSON.parse(request.body));
    if (requests.length === 1) throw new TypeError('Failed to fetch');
    return Response.json({ success: true, data: { returnId: 'return-test', orderId: 'order-test', duplicate: true } });
  };
  await assert.rejects(commitOrderReturnTransaction({ ...options, fetchImpl }), { outcome: 'NETWORK_ERROR' });
  assert.equal((await commitOrderReturnTransaction({ ...options, fetchImpl })).duplicate, true);
  assert.deepEqual(requests[0], requests[1]);
});

test('return requires a matching server receipt', async () => {
  for (const data of [null, { returnId: 'return-test', orderId: 'other-order' }]) {
    await assert.rejects(commitOrderReturnTransaction({ ...options,
      fetchImpl: async () => Response.json({ success: true, data }),
    }), { code: 'return_confirmation_invalid' });
  }
});

test('return UI retains the pending mutation until server success', () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('const saveOrderReturnEditor = async');
  const editor = source.slice(start, source.indexOf('const openOrderItemEditor', start));
  assert.match(editor, /returnPendingCommandRef\.current\?\.key !== requestKey/);
  assert.match(editor, /clientMutationId: returnPendingCommandRef\.current\.clientMutationId/);
  assert.ok(editor.indexOf('returnPendingCommandRef.current = null') > editor.indexOf('await onReturnOrder'));
  assert.doesNotMatch(editor.slice(editor.indexOf('catch (error)')), /returnPendingCommandRef\.current = null/);
});
