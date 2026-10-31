import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyStaticCompression } from '../scripts/verify-static-compression.mjs';

const probe = headers => verifyStaticCompression({ fetchImpl: async (url, options) => {
  assert.equal(new URL(url).origin, 'https://app.hdconnect.net');
  assert.equal(options.headers['Accept-Encoding'], 'gzip, br');
  if (options.method === 'GET') return new Response('<script type="module" src="./assets/index-test.js"></script><link rel="stylesheet" href="./assets/index-test.css">');
  return new Response(null, { headers });
} });

test('large plain assets fail even when their status and MIME are successful', async () => {
  const result = await probe({ 'Content-Type': 'application/javascript', 'Content-Length': '2497240' });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.assets.length, 2);
});
test('compressed assets pass without relying on an uncompressed content length', async () => {
  assert.equal((await probe({ 'Content-Encoding': 'gzip' })).status, 'PASS');
  assert.equal((await probe({ 'Content-Encoding': 'br' })).status, 'PASS');
});
test('missing size cannot turn an uncompressed asset into a small passing sample', async () => {
  assert.equal((await probe({})).status, 'FAIL');
  assert.equal((await probe({ 'Content-Length': '900' })).status, 'PASS');
});
