import test from 'node:test';
import assert from 'node:assert/strict';
import { unlockWarmSession } from '../src/services/warmSessionUnlock.js';

test('warm resume authenticates locally without issuing a new login', async () => {
  let prompts = 0;
  const user = { getIdTokenResult: async force => {
    assert.equal(force, false);
    return { expirationTime: new Date(3600000).toISOString() };
  } };
  const options = { user, scope: 'employee-a', lease: { user, scope: 'employee-a', lockedAt: 1000 },
    currentUser: () => user, now: () => 2000, authenticate: async () => { prompts++; return true; } };
  assert.deepEqual(await unlockWarmSession(options), { success: true, warm: true });
  assert.equal(prompts, 1);
  for (const change of [{ lease: null }, { scope: 'employee-b' }, { currentUser: () => null }, { now: () => 400000 }]) {
    assert.deepEqual(await unlockWarmSession({ ...options, ...change }), { fallback: true });
  }
  assert.equal(prompts, 1);
  assert.deepEqual(await unlockWarmSession({ ...options, authenticate: async () => false }), { success: false });
  let current = user;
  assert.deepEqual(await unlockWarmSession({ ...options, currentUser: () => current,
    authenticate: async () => { current = null; return true; } }), { success: false });
  user.getIdTokenResult = async () => ({ expirationTime: new Date(2500).toISOString() });
  assert.deepEqual(await unlockWarmSession(options), { fallback: true });
});
