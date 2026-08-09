import assert from 'node:assert/strict';
import { fetchWithTimeout } from '../src/services/fetchWithTimeout.js';

const successResponse = { ok: true };
const immediate = await fetchWithTimeout('/ok', {}, 1000, async () => successResponse);
assert.equal(immediate, successResponse);

const externalController = new AbortController();
const externallyAborted = fetchWithTimeout('/abort', { signal: externalController.signal }, 5000, (_url, init) => new Promise((resolve, reject) => {
  init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
}));
externalController.abort();
await assert.rejects(externallyAborted, error => error.name === 'AbortError');

await assert.rejects(
  fetchWithTimeout('/slow', {}, 1000, (_url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
  })),
  error => error.name === 'TimeoutError',
);

console.log('Fetch timeout tests: PASS (3 cases)');
