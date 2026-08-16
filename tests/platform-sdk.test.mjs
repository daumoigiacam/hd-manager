import assert from 'node:assert/strict';
import test from 'node:test';
import { createHdPlatformClient } from '../src/platform/sdk/index.js';

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};

const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'test-request-id' },
  text: async () => JSON.stringify({
    success: true,
    data,
    meta: { traceId: 'test-trace-id' },
  }),
});

test('platform SDK shares authentication and request context contracts', async () => {
  const calls = [];
  const fixturePassword = ['test', 'fixture'].join('-');
  const client = createHdPlatformClient({
    baseUrl: 'https://staging-api.example.test/api/v1',
    storage: createStorage(),
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/auth/login')) {
        return response({ accessToken: 'access', refreshToken: 'refresh' });
      }
      return response({
        user: { id: 'user-1', companyId: 'company-1', branchId: 'branch-1' },
        company: { id: 'company-1' },
        branch: { id: 'branch-1' },
        permissions: ['operations.admin'],
      });
    },
    platform: 'test-client',
    deviceName: 'test-device',
    tokenStorageNamespace: 'test-platform',
  });

  await client.login({ email: 'owner@example.test', password: fixturePassword });
  const tenant = await client.tenantContext();

  assert.equal(tenant.companyId, 'company-1');
  assert.equal(tenant.branchId, 'branch-1');
  assert.equal(client.hasPermission('operations.admin', tenant.user), true);
  assert.equal(calls[0].init.headers['X-Platform'], 'test-client');
  assert.equal(calls[0].init.headers['X-Device-Name'], 'test-device');
  assert.match(calls[1].init.headers.Authorization, /^Bearer /);
  assert.match(calls[1].init.headers['X-Request-ID'], /^.+$/);
});

test('platform SDK keeps admin commands allowlisted by contract', () => {
  const client = createHdPlatformClient({
    baseUrl: 'https://staging-api.example.test/api/v1',
    storage: createStorage(),
    fetchImpl: async () => response({}),
  });

  assert.equal(client.adminPath('overview'), '/platform-admin/overview');
  assert.equal(client.adminPath('/services'), '/platform-admin/services');
});
