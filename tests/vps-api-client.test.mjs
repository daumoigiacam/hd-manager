import assert from 'node:assert/strict';
import test from 'node:test';
import { HdApiClient, HdApiError } from '../src/api/client.js';
import { createHdConnectStagingApi } from '../src/api/hdConnectStaging.js';

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};

const envelope = (data, { status = 200 } = {}) => new Response(
  JSON.stringify({ success: true, data, error: null, meta: { traceId: 'trace-test' } }),
  { status, headers: { 'content-type': 'application/json' } },
);

const errorEnvelope = (message, { status = 400, code = 'REQUEST_REJECTED' } = {}) => new Response(
  JSON.stringify({
    success: false,
    data: null,
    error: { code, message },
    meta: { traceId: 'trace-error' },
  }),
  { status, headers: { 'content-type': 'application/json' } },
);

test('stores an access and refresh token pair after VPS login', async () => {
  const storage = createStorage();
  const requests = [];
  const client = new HdApiClient({
    baseUrl: 'https://staging-api.example.test/api/v1',
    storage,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return envelope({ accessToken: 'access-1', refreshToken: 'refresh-1', user: { id: 'user-1' } });
    },
  });

  const session = await client.login({ email: 'owner@example.test', password: 'password-123' });

  assert.equal(session.user.id, 'user-1');
  assert.equal(client.getAccessToken(), 'access-1');
  assert.equal(client.getRefreshToken(), 'refresh-1');
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/api\/v1\/auth\/login$/);
  assert.equal(requests[0].init.headers.Authorization, undefined);
});

test('isolates production VPS tokens from staging browser sessions', () => {
  const storage = createStorage();
  const client = new HdApiClient({
    baseUrl: 'https://api.example.test/api/v1',
    storage,
    tokenStorageNamespace: 'vps-production',
    fetchImpl: async () => envelope({}),
  });

  client.setSession({ accessToken: 'production-access', refreshToken: 'production-refresh' });

  assert.equal(storage.getItem('hdconnect.vps-production.access-token'), 'production-access');
  assert.equal(storage.getItem('hdconnect.vps-production.refresh-token'), 'production-refresh');
  assert.equal(storage.getItem('hdconnect.vps-staging.access-token'), null);
  assert.equal(storage.getItem('hdconnect.vps-staging.refresh-token'), null);
});

test('refreshes once and retries an authenticated read after HTTP 401', async () => {
  const storage = createStorage();
  storage.setItem('hdconnect.vps-staging.access-token', 'expired-access');
  storage.setItem('hdconnect.vps-staging.refresh-token', 'refresh-1');
  const calls = [];
  const client = new HdApiClient({
    baseUrl: 'https://staging-api.example.test/api/v1',
    storage,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/auth/refresh')) {
        return envelope({ accessToken: 'fresh-access', refreshToken: 'fresh-refresh' });
      }
      if (calls.filter((call) => call.url.endsWith('/master-data/customers')).length === 1) {
        return errorEnvelope('Access token expired.', { status: 401, code: 'UNAUTHORIZED' });
      }
      return envelope({ items: [{ id: 'customer-1' }], pagination: { page: 1 } });
    },
  });

  const result = await client.get('/master-data/customers');

  assert.equal(result.items[0].id, 'customer-1');
  assert.equal(client.getAccessToken(), 'fresh-access');
  assert.equal(client.getRefreshToken(), 'fresh-refresh');
  assert.equal(calls.filter((call) => call.url.endsWith('/auth/refresh')).length, 1);
  assert.equal(calls.at(-1).init.headers.Authorization, 'Bearer fresh-access');
});

test('rejects malformed API envelopes without exposing sensitive request data', async () => {
  const client = new HdApiClient({
    baseUrl: 'https://staging-api.example.test/api/v1',
    fetchImpl: async () => new Response(JSON.stringify({ hello: 'world' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });

  await assert.rejects(
    () => client.get('/master-data/customers'),
    (error) => error instanceof HdApiError && error.code === 'API_REQUEST_REJECTED',
  );
});

test('blocks order creation until the target warehouse and line-unit mapping are proven', async () => {
  const api = createHdConnectStagingApi({
    post: async () => {
      throw new Error('The client must not call the API for unresolved orders.');
    },
  });

  await assert.rejects(
    () => api.createOrder({
      customerId: '11111111-1111-4111-8111-111111111111',
      items: [{ productId: '22222222-2222-4222-8222-222222222222', quantity: 1 }],
    }),
    (error) => error instanceof HdApiError && error.code === 'ORDER_WAREHOUSE_UNRESOLVED',
  );
});

test('does not retry a failed POST mutation automatically', async () => {
  let callCount = 0;
  const client = new HdApiClient({
    baseUrl: 'https://staging-api.example.test/api/v1',
    fetchImpl: async () => {
      callCount += 1;
      throw new TypeError('network unavailable');
    },
  });

  await assert.rejects(
    () => client.post('/master-data/customers', { name: 'No retry' }),
    (error) => error instanceof HdApiError && error.code === 'API_NETWORK_ERROR',
  );
  assert.equal(callCount, 1);
});

test('keeps company scope on the server when creating a customer', async () => {
  let capturedPayload;
  let capturedOptions;
  const api = createHdConnectStagingApi({
    post: async (_path, payload, options) => {
      capturedPayload = payload;
      capturedOptions = options;
      return {
        id: '11111111-1111-4111-8111-111111111111',
        companyId: '22222222-2222-4222-8222-222222222222',
        name: payload.name,
      };
    },
  });

  await api.createCustomer({
    name: 'Tenant-safe customer',
    phone: '0900000000',
    companyId: 'attacker-selected-company-id',
    clientMutationId: 'mutation-1',
  });

  assert.equal(Object.hasOwn(capturedPayload, 'companyId'), false);
  assert.equal(capturedPayload.phones[0], '0900000000');
  assert.equal(capturedOptions.idempotencyKey, 'mutation-1');
});
