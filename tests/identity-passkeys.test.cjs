const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { createPasskeyService, resolvePasskeyOrigin } = require('../functions/identityPasskeys');
const { memoryStore } = require('./helpers/passkey-store.cjs');
const origin = 'https://app.hdconnect.net';

function fixture() {
  const db = memoryStore({ 'identity_accounts/alice': { status: 'active', passwordHash: 'password-v1', name: 'Alice' }, 'identity_accounts/bob': { status: 'active', passwordHash: 'password-v2', name: 'Bob' } });
  let time = Date.now();
  let sessions = 0;
  const api = {
    generateRegistrationOptions: async options => { assert.equal(options.authenticatorSelection.userVerification, 'required'); return { challenge: randomBytes(32).toString('base64url') }; },
    generateAuthenticationOptions: async options => { assert.equal(options.userVerification, 'required'); return { challenge: randomBytes(32).toString('base64url') }; },
    verifyRegistrationResponse: async options => {
      assert.equal(options.requireUserVerification, true);
      assert.equal(options.expectedOrigin, origin);
      assert.equal(options.expectedRPID, 'app.hdconnect.net');
      return { verified: true, registrationInfo: { credential: { id: 'cred-alice', publicKey: new Uint8Array([1, 2, 3]), counter: 0 } } };
    },
    verifyAuthenticationResponse: async options => {
      assert.equal(options.requireUserVerification, true);
      assert.equal(options.expectedRPID, 'app.hdconnect.net');
      assert.equal(options.expectedOrigin, origin);
      if (options.response.bad) throw new Error('invalid signature');
      return { verified: true, authenticationInfo: { newCounter: options.credential.counter + 1 } };
    },
  };
  const service = createPasskeyService({ db, api, now: () => time,
    getVerifiedIdentity: async id => { if (!db.rows.has(`identity_accounts/${id}`)) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 }); return { identityId: id, identity: db.rows.get(`identity_accounts/${id}`) }; },
    verifyPassword: async (password, hash) => password === hash,
    issueSession: async ({ identityId }) => { sessions++; return { customToken: `test-only:${identityId}` }; },
    logAudit: async () => {},
  });
  const call = (operation, body = {}, authorization = 'alice') => service({ operation, body, authorization, origin, ip: 'test' });
  const enroll = async () => { const challenge = await call('register-options', { password: 'password-v1' }); await call('register-verify', { challengeId: challenge.challengeId, response: {} }); };
  return { db, call, enroll, api, advance: ms => { time += ms; }, sessions: () => sessions };
}

test('origins are pinned; localhost is only accepted by emulator', () => {
  assert.equal(resolvePasskeyOrigin(origin).rpID, 'app.hdconnect.net');
  for (const value of ['https://evil.example', 'https://app.hdconnect.net.evil.example', 'http://app.hdconnect.net', 'null', 'http://localhost:5212']) assert.throws(() => resolvePasskeyOrigin(value, false));
  assert.equal(resolvePasskeyOrigin('http://localhost:5212', true).rpID, 'localhost');
});
test('enrollment requires password and challenge is bound to authenticated owner', async () => {
  const f = fixture();
  await assert.rejects(f.call('register-options', { password: 'wrong' }), { statusCode: 401 });
  const c = await f.call('register-options', { password: 'password-v1' });
  await assert.rejects(f.call('register-verify', { challengeId: c.challengeId }, 'bob'), { statusCode: 401 });
  assert.equal((await f.call('list')).passkeys.length, 0);
});
test('valid login succeeds once; replay and concurrent double submit are rejected', async () => {
  const f = fixture(); await f.enroll();
  const c = await f.call('login-options');
  const body = { challengeId: c.challengeId, response: { id: 'cred-alice' } };
  const results = await Promise.allSettled([f.call('login-verify', body), f.call('login-verify', body)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.sessions(), 1);
  await assert.rejects(f.call('login-verify', body), { statusCode: 401 });
});
test('expired challenges and invalid signatures never mint a session', async () => {
  const f = fixture(); await f.enroll();
  let c = await f.call('login-options');
  await assert.rejects(f.call('login-verify', { challengeId: c.challengeId, response: { id: 'cred-alice', bad: true } }), { statusCode: 401 });
  f.advance(6 * 60000);
  await assert.rejects(f.call('login-verify', { challengeId: c.challengeId, response: { id: 'cred-alice' } }), { statusCode: 401 });
  assert.equal(f.sessions(), 0);
});
test('cross-account revocation is forbidden; owner revocation invalidates login', async () => {
  const f = fixture(); await f.enroll();
  const id = (await f.call('list')).passkeys[0].id;
  assert.equal((await f.call('list', {}, 'bob')).passkeys.length, 0);
  await assert.rejects(f.call('revoke', { id, password: 'password-v2' }, 'bob'), { statusCode: 404 });
  await f.call('revoke', { id, password: 'password-v1' });
  const c = await f.call('login-options');
  await assert.rejects(f.call('login-verify', { challengeId: c.challengeId, response: { id: 'cred-alice' } }), { statusCode: 401 });
});
for (const change of [{ passwordHash: 'reset-password' }, { status: 'blocked' }, { lockedAt: new Date() }]) test(`account change invalidates passkey: ${Object.keys(change)[0]}`, async () => {
  const f = fixture(); await f.enroll();
  Object.assign(f.db.rows.get('identity_accounts/alice'), change);
  const c = await f.call('login-options');
  await assert.rejects(f.call('login-verify', { challengeId: c.challengeId, response: { id: 'cred-alice' } }), { statusCode: 401 });
  assert.equal(f.sessions(), 0);
});
test('public challenge requests are rate limited', async () => {
  const f = fixture();
  for (let i = 0; i < 40; i++) await f.call('login-options');
  await assert.rejects(f.call('login-options'), { statusCode: 429 });
});
