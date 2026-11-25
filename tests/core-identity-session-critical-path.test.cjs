const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { setImmediate: turn } = require('node:timers/promises');
const { parse } = require('@babel/parser');
const { requiresIdentitySetup } = require('../functions/identitySetupPolicy.cjs');
const source = readFileSync('functions/identityCenter.js', 'utf8');
const tree = parse(source, { sourceType: 'script' });
const center = tree.program.body.find(n => n.type === 'VariableDeclaration'
  && n.declarations.some(d => d.id.name === 'createIdentityCenter')).declarations[0].init;
const declarations = center.body.body.flatMap(n => n.type === 'VariableDeclaration' ? n.declarations : []);
const functionSource = name => {
  const node = declarations.find(n => n.id.name === name).init;
  return source.slice(node.start, node.end);
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function harness({ claimsImpl } = {}) {
  const claims = deferred(), token = deferred(), device = deferred(), commit = deferred();
  const events = [], writes = [], committed = [];
  const identity = { status: 'active', passwordHash: 'fixture-hash', credentialVersion: 3,
    companyId: 'company-a', appUserId: 'employee-a', role: 'employee', accountType: 'employee',
    setup: { pinSet: true, trustedDevice: true } };
  let currentIdentity = structuredClone(identity);
  const identitySnapshot = () => {
    const value = structuredClone(currentIdentity);
    return { exists: Boolean(value), data: () => value };
  };
  const auth = {
    setCustomUserClaims: (uid, value) => {
      events.push('claims-start'); return claimsImpl ? claimsImpl(uid, value) : claims.promise;
    },
    createUser: async () => { events.push('create-user'); },
    createCustomToken: () => { events.push('token-start'); return token.promise; },
    deleteUser: async uid => { events.push('delete-user:' + uid); },
  };
  const deviceRef = { device: true };
  const identityRef = { id: 'employee-a', get: async () => { events.push('identity-recheck'); return identitySnapshot(); },
    collection: () => ({ doc: () => deviceRef }) };
  const db = {
    collection: () => ({ doc: () => ({ audit: true }) }),
    runTransaction: async callback => {
      events.push('transaction-start');
      const staged = [];
      const result = await callback({
        get: ref => {
          if (ref === identityRef) return Promise.resolve(identitySnapshot());
          assert.equal(ref, deviceRef); events.push('device-start'); return device.promise;
        },
        set: (ref, value) => { staged.push({ ref, value }); writes.push({ ref, value }); },
        update: (ref, value) => { staged.push({ ref, value }); writes.push({ ref, value }); },
      });
      events.push('commit-start'); await commit.promise;
      committed.push(...staged); events.push('commit-finished'); return result;
    },
  };
  const issue = new Function('db', 'admin', 'getIdentityRef', 'sanitizeDevice', 'safeIdPart',
    'buildPublicIdentity', 'IDENTITY_AUDIT_COLLECTION', 'requiresIdentitySetup',
    `const assertCurrentIdentity = (${functionSource('assertCurrentIdentity')}); return (${functionSource('issueSession')});`)(
    db, { auth: () => auth }, () => identityRef, v => v, v => v,
    v => ({ companyId: v.companyId, accountType: v.accountType }), 'audit-fixture', requiresIdentitySetup);
  const input = { identityId: 'employee-a', identity, device: { deviceId: 'device-a', platform: 'android' },
    loginRateRef: { rate: true } };
  return { claims, token, device, commit, events, writes, committed, auth,
    changeIdentity: value => { currentIdentity = value === null ? null : { ...currentIdentity, ...value }; },
    run: () => issue(input) };
}

test('IAM signing overlaps claims RPC but session waits for claims, device and durable audit/rate commit', async () => {
  const h = harness(); let finished = false;
  const pending = h.run().then(v => { finished = true; return v; }); await turn();
  assert(h.events.includes('token-start'), 'IAM must start while Auth claims are still pending');
  h.token.resolve('signed-token'); h.device.resolve({ exists: true, data: () => ({ trusted: true, createdAtIso: 'original' }) });
  await turn(); assert.equal(finished, false); assert.equal(h.events.includes('transaction-start'), false);
  h.claims.resolve(); await turn(); assert(h.events.includes('commit-start')); assert.equal(finished, false);
  assert(h.writes.some(w => w.ref.rate && w.value.attempts === 0));
  assert(h.writes.some(w => w.ref.audit && w.value.action === 'login'));
  assert.equal(h.committed.length, 0);
  h.commit.resolve(); const result = await pending;
  assert.equal(result.customToken, 'signed-token'); assert.equal(result.device.trusted, true);
  assert.equal(h.committed.length, h.writes.length);
  assert(h.events.lastIndexOf('identity-recheck') > h.events.indexOf('commit-finished'));
});

test('concurrent token and claims/read failures are all observed and cannot commit a session', async () => {
  for (const failure of ['claims', 'device']) {
    const h = harness(), job = h.run(), rejected = assert.rejects(job, new RegExp(failure + ' denied'));
    await turn(); h.token.reject(Error('IAM unavailable'));
    if (failure === 'claims') h.claims.reject(Error('claims denied'));
    else { h.claims.resolve(); h.device.reject(Error('device denied')); }
    await rejected; await turn(); assert.equal(h.events.includes('commit-start'), false);
  }
});

test('claims failure waits for delayed signing to settle before returning the error', async () => {
  const h = harness(); let finished = false;
  const rejected = assert.rejects(h.run().finally(() => { finished = true; }), /claims denied/);
  h.claims.reject(Error('claims denied')); await turn(); assert.equal(finished, false);
  h.token.reject(Error('late IAM failure')); await rejected;
  assert.equal(h.events.includes('transaction-start'), false);
});

test('token failure or audit commit failure never returns a successful session', async () => {
  for (const failure of ['token', 'commit']) {
    const h = harness(), rejected = assert.rejects(h.run(), new RegExp(failure + ' failed'));
    h.claims.resolve(); h.device.resolve({ exists: false }); await turn();
    if (failure === 'token') { h.token.reject(Error('token failed')); h.commit.resolve(); }
    else { h.token.resolve('must-not-escape'); h.commit.reject(Error('commit failed')); }
    await rejected;
  }
});

test('first Auth user creation race still persists the exact claims before session release', async () => {
  let calls = 0; const savedClaims = [];
  const h = harness({ claimsImpl: async (_uid, claims) => {
    savedClaims.push(claims);
    if (++calls === 1) throw Object.assign(Error('missing'), { code: 'auth/user-not-found' });
  } });
  h.auth.createUser = async () => { h.events.push('create-user'); throw Object.assign(Error('raced'), { code: 'auth/uid-already-exists' }); };
  const job = h.run(); h.device.resolve({ exists: false }); h.token.resolve('signed-token'); await turn(); h.commit.resolve();
  const result = await job;
  assert.equal(calls, 2); assert.deepEqual(savedClaims[0], savedClaims[1]);
  assert.equal(savedClaims[1].companyId, 'company-a'); assert(h.events.includes('create-user'));
  assert.equal(result.customToken, 'signed-token');
});

for (const change of [{ status: 'deleted' }, { status: 'deleting' }, { lockedAt: new Date() },
  { status: 'blocked' }, { passwordHash: 'reset-hash' }, { credentialVersion: 4 }, null]) {
  test('fresh transaction gate rejects ' + JSON.stringify(change) + ' before any session persistence', async () => {
    const h = harness(), rejected = assert.rejects(h.run(), { statusCode: change === null
      || change.passwordHash || change.credentialVersion ? 401 : 403 });
    await turn(); h.changeIdentity(change); h.claims.resolve(); h.token.resolve('must-not-escape'); h.device.resolve({ exists: false });
    await rejected; assert.equal(h.writes.length, 0); assert.equal(h.committed.length, 0);
    const cleanup = h.events.filter(e => e.startsWith('delete-user:'));
    assert.deepEqual(cleanup, ['deleted', 'deleting'].includes(change?.status) ? ['delete-user:identity_employee-a'] : []);
  });
}

test('passkey response rechecks the original credential after its post-session audit', async () => {
  for (const change of [null, { status: 'deleted' }, { status: 'deleting' }, { lockedAt: new Date() },
    { status: 'blocked' }, { passwordHash: 'reset-hash' }, { credentialVersion: 4 }]) {
    const audit = deferred(), entered = deferred();
    const identity = { status: 'active', passwordHash: 'fixture-hash', credentialVersion: 3 };
    let current = { ...identity };
    const createPasskeyService = options => async () => {
      const session = await options.issueSession({ identityId: 'passkey-owner', identity });
      entered.resolve(); await options.logAudit();
      return { success: true, ...session };
    };
    const passkey = new Function('db', 'getVerifiedIdentity', 'verifyPassword', 'logAudit', 'issueSession',
      'createPasskeyService', 'getIdentityRef',
      `const assertCurrentIdentity = (${functionSource('assertCurrentIdentity')}); return (${functionSource('passkey')});`)(
      {}, () => {}, () => {}, () => audit.promise, async () => ({ customToken: 'passkey-token' }),
      createPasskeyService, () => ({ get: async () => ({ exists: true, data: () => current }) }));
    const job = passkey({});
    const result = change ? assert.rejects(job) : job;
    await entered.promise; current = { ...current, ...change }; audit.resolve();
    if (change) await result;
    else assert.equal((await result).customToken, 'passkey-token');
  }
});

for (const change of [{ status: 'deleted' }, { status: 'deleting' }, { lockedAt: new Date() },
  { status: 'blocked' }, { passwordHash: 'reset-hash' }, { credentialVersion: 4 }]) {
  test('delayed signing rechecks identity after commit: ' + JSON.stringify(change), async () => {
    const h = harness(), rejected = assert.rejects(h.run());
    h.claims.resolve(); h.device.resolve({ exists: false }); h.commit.resolve(); await turn();
    assert(h.events.includes('commit-finished'), 'the durable transaction must finish while IAM is pending');
    h.changeIdentity(change); h.token.resolve('late-token-must-not-escape'); await rejected;
    assert.equal(h.committed.length, 4);
    assert.equal(h.events.some(e => e.startsWith('delete-user:')), ['deleted', 'deleting'].includes(change.status));
  });
}
