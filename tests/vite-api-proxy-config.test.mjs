import assert from 'node:assert/strict';
import test from 'node:test';

import createViteConfig from '../vite.config.js';

const withEnvironment = async (values, callback) => {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );

  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });

  try {
    return await callback();
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
};

test('enables the API proxy only when an explicit local dev target is configured', async () => {
  await withEnvironment({
    HD_MANAGER_DEV_API_PROXY_TARGET: 'https://staging-api.hdconnect.net/',
    VITE_API_BASE_URL: 'http://127.0.0.1:5176/api/v1',
    VITE_DATA_MODE: 'vps-staging',
  }, async () => {
    const config = await createViteConfig({ mode: 'development' });

    assert.deepEqual(config.server.proxy, {
      '/api': {
        target: 'https://staging-api.hdconnect.net',
        changeOrigin: true,
        secure: true,
      },
    });
  });
});

test('does not add a proxy to builds or dev servers without an explicit target', async () => {
  await withEnvironment({
    HD_MANAGER_DEV_API_PROXY_TARGET: undefined,
    VITE_API_BASE_URL: 'https://staging-api.hdconnect.net/api/v1',
    VITE_DATA_MODE: 'vps-staging',
  }, async () => {
    const config = await createViteConfig({ mode: 'production' });

    assert.equal(config.server.proxy, undefined);
  });
});
