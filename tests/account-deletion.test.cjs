const test = require('node:test');
const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
const { createHash, scryptSync } = require('node:crypto');
const { createIdentityCenter } = require('../functions/identityCenter');

const password = 'Fixture-only-2026';
const salt = Buffer.alloc(16, 7);
const passwordHash = 'scrypt-v1$' + salt.toString('base64url') + '$' + scryptSync(password, salt, 64).toString('base64url');
const publicRoot = 'artifacts/test-account-deletion/public/data/';
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const authError = code => Object.assign(Error(code), { code });

function fixture({ state = 'active', revoked = false, count = 2, accountType = 'employee' } = {}) {
  const identityId = 'employee_fixture', identityPath = 'identity_accounts/' + identityId;
  const accountPath = publicRoot + (accountType === 'customer' ? 'customer_accounts' : 'employees') + '/fixture';
  const rows = new Map([
    [identityPath, { id: identityId, status: state, passwordHash, pinHash: passwordHash, credentialVersion: 0,
      username: 'fixture', usernameNormalized: 'fixture', setup: { passwordChanged: true, pinSet: true },
      companyId: 'fixture-company', accountType,
      publicCollection: accountType === 'customer' ? 'customer_accounts' : 'employees', publicId: 'fixture',
      ...(accountType === 'customer' ? { customerId: 'fixture-customer' } : {}) }],
    [accountPath, { name: 'Synthetic account', passwordHash, identityId, salary: 5000000, companyId: 'fixture-company' }],
    [publicRoot + 'customers/fixture-customer', { debt: 123456, name: 'Synthetic customer', passwordHash }],
    [publicRoot + 'orders/fixture-order', { total: 123456, employeeId: 'fixture', companyId: 'fixture-company' }],
    [publicRoot + 'payrollPeriods/fixture-period', { locked: true, netSalary: 5000000 }],
    ['identity_accounts/other', { status: 'active', passwordHash }],
    ['identity_passkeys/other', { identityId: 'other', publicKey: 'retain' }],
  ]);
  for (let i = 0; i < count; i++) {
    rows.set(identityPath + '/devices/device-' + i, { trusted: true, deviceSecretHash: 'synthetic' });
    rows.set('identity_passkeys/key-' + i, { identityId, publicKey: 'synthetic' });
  }
  const authCalls = [], writes = [], faults = { failAt: '', beforeTransaction: null, beforeCommit: null, verifyError: null, beforeAudit: null };
  const clone = value => structuredClone(value);
  const put = (ref, value, options = {}) => {
    if (faults.failAt === 'public' && ref.path === accountPath) { faults.failAt = ''; throw Error('transient public write failure'); }
    const next = options.merge ? { ...(rows.get(ref.path) || {}) } : {};
    for (const [key, val] of Object.entries(value)) {
      if (val?.testDeleteField) delete next[key]; else next[key] = clone(val);
    }
    writes.push(ref.path); rows.set(ref.path, next);
  };
  const snapshot = ref => {
    const value = clone(rows.get(ref.path));
    return { ref, id: ref.id, exists: value !== undefined, data: () => clone(value) };
  };
  const doc = filePath => ({ path: filePath, id: filePath.split('/').at(-1),
    get: async () => snapshot(doc(filePath)), set: async (value, options) => put(doc(filePath), value, options),
    collection: name => collection(filePath + '/' + name) });
  let auditSequence = 0;
  const collection = (collectionPath, filters = [], max = Infinity) => ({
    doc: (id = 'auto-' + (++auditSequence)) => doc(collectionPath + '/' + id),
    add: async data => {
      if (faults.beforeAudit) await faults.beforeAudit(data);
      return put(doc(collectionPath + '/audit-' + (++auditSequence)), data);
    },
    where: (key, op, val) => { assert.equal(op, '=='); return collection(collectionPath, [...filters, [key, val]], max); },
    limit: size => collection(collectionPath, filters, size),
    get: async () => {
      const docs = [...rows].filter(([key, value]) => key.slice(0, key.lastIndexOf('/')) === collectionPath
        && filters.every(([field, val]) => value[field] === val)).slice(0, max).map(([key]) => snapshot(doc(key)));
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  });
  const batch = () => {
    const operations = [];
    return {
      set: (ref, value, options) => operations.push(() => put(ref, value, options)),
      update: (ref, value) => operations.push(() => { assert(rows.has(ref.path)); put(ref, value, { merge: true }); }),
      delete: ref => operations.push(() => { writes.push(ref.path); rows.delete(ref.path); }),
      commit: async () => operations.forEach(run => run()),
    };
  };
  const db = { doc, collection, batch,
    runTransaction: async callback => {
      if (faults.beforeTransaction) {
        const hook = faults.beforeTransaction; faults.beforeTransaction = null; await hook();
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        const pending = batch(), reads = new Map();
        let stagedWrite = false;
        const result = await callback({
          get: async ref => {
            assert.equal(stagedWrite, false, 'Firestore requires all reads before writes');
            const snap = snapshot(ref); reads.set(ref.path, snap.data()); return snap;
          },
          set: (...args) => { stagedWrite = true; return pending.set(...args); },
          update: (...args) => { stagedWrite = true; return pending.update(...args); },
        });
        if (faults.beforeCommit) {
          const hook = faults.beforeCommit; faults.beforeCommit = null; await hook();
        }
        // Model Firestore's retry when deletion changes an identity read by
        // an in-flight setup/session transaction, before any staged write lands.
        if ([...reads].some(([path, value]) => !isDeepStrictEqual(value, rows.get(path)))) continue;
        await pending.commit(); return result;
      }
      throw Error('transaction retry limit');
    } };
  const firebaseUid = 'identity_' + identityId;
  const authUsers = new Map([[firebaseUid, {}], ['identity_other', { retain: true }]]);
  const auth = {
    verifyIdToken: async (token, checkRevoked) => {
      authCalls.push(['verify', token, checkRevoked]);
      if (faults.verifyError && faults.verifyError.checkRevoked === checkRevoked) throw authError(faults.verifyError.code);
      if (token !== 'synthetic-token') throw authError('auth/argument-error');
      if (checkRevoked && revoked) throw authError('auth/id-token-revoked');
      return { identityId, uid: 'identity_' + identityId };
    },
    revokeRefreshTokens: async uid => {
      authCalls.push(['revoke', uid]);
      if (!authUsers.has(uid)) throw authError('auth/user-not-found');
    },
    deleteUser: async uid => {
      authCalls.push(['delete', uid]);
      if (!authUsers.delete(uid)) throw authError('auth/user-not-found');
    },
    setCustomUserClaims: async (uid, claims) => {
      authCalls.push(['claims', uid]);
      if (!authUsers.has(uid)) throw authError('auth/user-not-found');
      authUsers.set(uid, { claims });
    },
    createUser: async ({ uid }) => {
      authCalls.push(['create', uid]);
      if (authUsers.has(uid)) throw authError('auth/uid-already-exists');
      authUsers.set(uid, {}); return { uid };
    },
    createCustomToken: async uid => { authCalls.push(['sign', uid]); return 'synthetic-custom-token'; },
  };
  const admin = { auth: () => auth, firestore: { FieldValue: { delete: () => ({ testDeleteField: true }) } } };
  const service = createIdentityCenter({ db, admin, getAppId: () => 'test-account-deletion' });
  const call = (overrides = {}) => service.deleteAccount({ authorization: 'Bearer synthetic-token', currentPassword: password, confirmation: 'XOA TAI KHOAN', ...overrides });
  const setup = (overrides = {}) => service.completeSetup({ authorization: 'Bearer synthetic-token', device: { deviceId: 'enrollment-device' }, ...overrides });
  return { rows, identityPath, identityId, accountPath, call, setup, service, auth, authUsers, firebaseUid, authCalls, writes, faults };
}

test('deletes only the authenticated identity; retains orders, locked payroll, business fields and other accounts', async () => {
  const f = fixture(), order = structuredClone(f.rows.get(publicRoot + 'orders/fixture-order'));
  assert.deepEqual(await f.call({ identityId: 'other' }), { success: true, deleted: true });
  assert.equal(f.rows.get(f.identityPath).status, 'deleted');
  for (const key of ['passwordHash', 'pinHash', 'phone', 'username']) assert.equal(f.rows.get(f.identityPath)[key], undefined);
  assert.equal(f.rows.get(f.accountPath).passwordHash, undefined);
  assert.equal(f.rows.get(f.accountPath).authDisabled, true);
  assert.equal(f.rows.get(f.accountPath).salary, 5000000);
  assert.deepEqual(f.rows.get(publicRoot + 'orders/fixture-order'), order);
  assert.equal(f.rows.get(publicRoot + 'payrollPeriods/fixture-period').netSalary, 5000000);
  assert.equal(f.rows.get('identity_accounts/other').status, 'active');
  assert.ok(f.rows.has('identity_passkeys/other'));
  assert.equal([...f.rows.keys()].filter(key => key.startsWith(f.identityPath + '/devices/')).length, 0);
  assert.equal([...f.rows.values()].filter(value => value.identityId === f.identityId).length, 0);
  assert.deepEqual(f.authCalls.filter(call => call[0] !== 'verify'), [['revoke', 'identity_' + f.identityId], ['delete', 'identity_' + f.identityId]]);
  assert.equal([...f.rows.values()].filter(value => value.action === 'account_deleted').length, 1);
});

for (const overrides of [{ currentPassword: 'wrong' }, { confirmation: 'DELETE' }, { authorization: '' }, { authorization: 'Bearer forged' }]) {
  test('rejects invalid authentication or confirmation without a write: ' + Object.keys(overrides)[0] + ':' + Object.values(overrides)[0], async () => {
    const f = fixture(); await assert.rejects(f.call(overrides)); assert.equal(f.writes.length, 0);
    assert.equal(f.rows.get(f.identityPath).status, 'active');
  });
}

for (const state of ['blocked', 'suspended']) test('does not delete ' + state + ' identities', async () => {
  const f = fixture({ state }); await assert.rejects(f.call(), { statusCode: 403 }); assert.equal(f.writes.length, 0);
});

test('active identity rejects revoked tokens, while an interrupted deletion can resume', async () => {
  const active = fixture({ revoked: true }); await assert.rejects(active.call(), { statusCode: 401 }); assert.equal(active.writes.length, 0);
  const pending = fixture({ state: 'deleting', revoked: true }); assert.equal((await pending.call()).deleted, true);
  assert.equal(pending.authCalls.some(call => call[0] === 'verify' && call[2] === true), false);
});

for (const change of ['lockedAt', 'passwordHash']) test('rechecks ' + change + ' inside the deletion transaction', async () => {
  const f = fixture(); f.faults.beforeTransaction = () => { f.rows.get(f.identityPath)[change] = change === 'lockedAt' ? new Date() : 'changed-password'; };
  await assert.rejects(f.call(), { statusCode: 401 }); assert.equal(f.writes.length, 0);
  assert.equal(f.authCalls.some(call => call[0] === 'delete'), false);
});

test('retry after a partial cleanup finishes and completed deletion is idempotent', async () => {
  const f = fixture(); f.faults.failAt = 'public'; await assert.rejects(f.call(), /transient/);
  assert.equal(f.rows.get(f.identityPath).status, 'deleting'); assert.equal((await f.call()).deleted, true);
  const writes = f.writes.length; assert.deepEqual(await f.call(), { success: true, alreadyDeleted: true });
  assert.equal(f.writes.length, writes);
});

test('cleans more than one Firestore batch without touching another identity', async () => {
  const f = fixture({ count: 405 }); assert.equal((await f.call()).success, true);
  assert.equal([...f.rows.keys()].some(key => key.startsWith(f.identityPath + '/devices/')), false);
  assert.ok(f.rows.has('identity_passkeys/other'));
});

test('customer account removes only auth fields from linked customer; retains customer debt', async () => {
  const f = fixture({ accountType: 'customer' }); assert.equal((await f.call()).success, true);
  const customer = f.rows.get(publicRoot + 'customers/fixture-customer');
  assert.equal(customer.passwordHash, undefined); assert.equal(customer.debt, 123456); assert.equal(customer.authDisabled, true);
});

for (const checkRevoked of [false, true]) {
  for (const code of ['auth/argument-error', 'auth/invalid-id-token', 'auth/id-token-expired',
    'auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found']) {
    test('normalizes Firebase ' + code + ' to 401 at checkRevoked=' + checkRevoked, async () => {
      const f = fixture(); f.faults.verifyError = { checkRevoked, code };
      await assert.rejects(f.call(), { code, statusCode: 401 });
      assert.equal(f.writes.length, 0); assert(f.authUsers.has(f.firebaseUid));
      assert.equal(f.authCalls.some(call => call[0] === 'delete' || call[0] === 'revoke'), false);
    });
  }
}

// Pause exactly one RPC, allowing a competing deletion and its own RPCs to
// finish while the first request still has work in flight.
function pauseRpc(auth, method, { after = false } = {}) {
  const entered = deferred(), release = deferred(), original = auth[method];
  auth[method] = async (...args) => {
    auth[method] = original;
    const result = after ? await original(...args).then(value => ({ value }), error => ({ error })) : undefined;
    entered.resolve(args); await release.promise;
    if (result?.error) throw result.error;
    return after ? result.value : original(...args);
  };
  return { entered: entered.promise, release: release.resolve };
}

function assertDeleted(f) {
  const tombstone = f.rows.get(f.identityPath);
  assert.equal(tombstone.status, 'deleted');
  for (const field of ['passwordHash', 'pinHash', 'username', 'setup']) assert.equal(tombstone[field], undefined);
  assert.equal([...f.rows.keys()].some(key => key.startsWith(f.identityPath + '/devices/')), false);
  assert.equal(f.authUsers.has(f.firebaseUid), false);
  assert.deepEqual(f.authUsers.get('identity_other'), { retain: true });
}

test('setup staged before deletion cannot restore password, PIN, username or a trusted device', { timeout: 5000 }, async () => {
  const f = fixture(), entered = deferred(), release = deferred();
  f.faults.beforeTransaction = async () => { entered.resolve(); await release.promise; };
  const rejected = assert.rejects(f.setup({ password: 'Replacement2026', pin: '654321', username: 'fixture.next',
    trustDevice: true, biometricEnabled: false }), { statusCode: 403 });
  await entered.promise; await f.call(); const writes = f.writes.length;
  release.resolve(); await rejected;
  assert.equal(f.writes.length, writes); assertDeleted(f);
  assert.equal(f.authCalls.some(call => ['claims', 'sign', 'create'].includes(call[0])), false);
});

test('deletion after setup transaction reads forces a retry and discards all staged writes', { timeout: 5000 }, async () => {
  const f = fixture(), entered = deferred(), release = deferred();
  f.faults.beforeCommit = async () => { entered.resolve(); await release.promise; };
  const rejected = assert.rejects(f.setup({ trustDevice: true }), { statusCode: 403 });
  await entered.promise; await f.call(); const writes = f.writes.length;
  release.resolve(); await rejected;
  assert.equal(f.writes.length, writes); assertDeleted(f);
});

test('deletion racing the login transaction cannot recreate a device or reset the login rate', { timeout: 5000 }, async () => {
  const f = fixture(), entered = deferred(), release = deferred();
  f.faults.beforeCommit = async () => { entered.resolve(); await release.promise; };
  const rejected = assert.rejects(f.service.login({ identifier: 'fixture', password,
    device: { deviceId: 'login-device' } }), { statusCode: 403 });
  await entered.promise; await f.call(); const writes = f.writes.length;
  release.resolve(); await rejected;
  assert.equal(f.writes.length, writes); assertDeleted(f);
  assert.equal([...f.rows.keys()].some(path => path.startsWith('identity_rate_limits/')), false);
  assert.equal([...f.rows.values()].some(row => row.action === 'login'), false);
});

for (const change of [{ lockedAt: new Date() }, { status: 'deleting' }, { passwordHash: 'new-password-hash' }, { credentialVersion: 1 }]) {
  test('setup transaction rechecks ' + Object.keys(change)[0] + ' before either identity or device writes', async () => {
    const f = fixture(); f.faults.beforeTransaction = () => Object.assign(f.rows.get(f.identityPath), change);
    await assert.rejects(f.setup({ trustDevice: true }));
    assert.equal(f.writes.length, 0);
    assert.equal(f.authCalls.some(call => ['claims', 'sign', 'create', 'delete'].includes(call[0])), false);
  });
}

test('biometric enrollment rechecks the device credential in the setup transaction', async () => {
  const f = fixture(), devicePath = f.identityPath + '/devices/enrollment-device';
  f.rows.set(devicePath, { trusted: true, credentialVersion: 0,
    deviceSecretHash: createHash('sha256').update('synthetic-enrollment-secret').digest('hex') });
  f.faults.beforeTransaction = () => { f.rows.get(devicePath).revokedAt = new Date(); };
  await assert.rejects(f.setup({ biometricEnabled: true, deviceSecret: 'synthetic-enrollment-secret' }), { statusCode: 403 });
  assert.equal(f.writes.length, 0); assert.equal(f.rows.get(devicePath).biometricEnabled, undefined);
});

test('deletion during biometric audit cannot release a session or recreate its device', { timeout: 5000 }, async () => {
  const f = fixture(), entered = deferred(), release = deferred();
  f.rows.set(f.identityPath + '/devices/biometric-device', { trusted: true, biometricEnabled: true,
    credentialVersion: 0, deviceSecretHash: createHash('sha256').update('biometric-secret').digest('hex') });
  f.faults.beforeAudit = async data => {
    if (data.action === 'biometric_login') { entered.resolve(); await release.promise; }
  };
  const rejected = assert.rejects(f.service.biometricLogin({ identifier: 'fixture', device: { deviceId: 'biometric-device' },
    deviceSecret: 'biometric-secret', biometricProof: true }), { statusCode: 403 });
  await entered.promise; await f.call(); release.resolve(); await rejected; assertDeleted(f);
});

test('deletion while claims RPC is pending prevents the Auth creation fallback and device resurrection', { timeout: 5000 }, async () => {
  const f = fixture(), pause = pauseRpc(f.auth, 'setCustomUserClaims');
  const rejected = assert.rejects(f.setup({ trustDevice: true }), { statusCode: 403 });
  await pause.entered; await f.call(); const writes = f.writes.length;
  pause.release(); await rejected;
  assert.equal(f.writes.length, writes); assertDeleted(f);
  assert.equal(f.authCalls.some(call => call[0] === 'create'), false);
});

test('Auth creation completing after deletion is cleaned before the setup request fails', { timeout: 5000 }, async () => {
  const f = fixture(); f.authUsers.delete(f.firebaseUid);
  const pause = pauseRpc(f.auth, 'createUser');
  const rejected = assert.rejects(f.setup({ trustDevice: true }), { statusCode: 403 });
  await pause.entered; await f.call(); const writes = f.writes.length;
  pause.release(); await rejected;
  assert.equal(f.writes.length, writes); assertDeleted(f);
  const actions = f.authCalls.filter(call => call[0] !== 'verify').map(call => call[0]);
  assert(actions.lastIndexOf('delete') > actions.indexOf('create'));
});

test('Auth recreation is also cleaned while deletion is still finishing its Auth RPC', { timeout: 5000 }, async () => {
  const f = fixture(); f.authUsers.delete(f.firebaseUid);
  const create = pauseRpc(f.auth, 'createUser'), deleting = pauseRpc(f.auth, 'deleteUser', { after: true });
  const rejected = assert.rejects(f.setup({ trustDevice: true }), { statusCode: 403 });
  await create.entered; const deletion = f.call(); await deleting.entered;
  assert.equal(f.rows.get(f.identityPath).status, 'deleting');
  create.release(); await rejected; assert.equal(f.authUsers.has(f.firebaseUid), false);
  deleting.release(); await deletion; assertDeleted(f);
});

for (const failure of ['claims', 'sign']) {
  test('observes a late ' + failure + ' failure and cleans any Auth user recreated after deletion', { timeout: 5000 }, async () => {
    const f = fixture(); f.authUsers.delete(f.firebaseUid);
    const create = pauseRpc(f.auth, 'createUser');
    if (failure === 'claims') {
      const original = f.auth.setCustomUserClaims;
      let calls = 0;
      f.auth.setCustomUserClaims = async (...args) => {
        if (++calls === 2) throw Error('late claims failure');
        return original(...args);
      };
    }
    const signing = deferred();
    f.auth.createCustomToken = () => signing.promise;
    let finished = false;
    const rejected = assert.rejects(f.setup({ trustDevice: true }).finally(() => { finished = true; }));
    await create.entered; await f.call(); create.release();
    // Even a failed transaction/claims path must observe pending IAM work.
    await new Promise(resolve => setImmediate(resolve)); assert.equal(finished, false);
    signing.reject(Error('late signing failure')); await rejected; assertDeleted(f);
  });
}

test('delayed signing after durable session commit cannot release a token after deletion', { timeout: 5000 }, async () => {
  const f = fixture(), signing = pauseRpc(f.auth, 'createCustomToken');
  const committed = deferred(); let commits = 0;
  f.faults.beforeCommit = () => {
    // First commit is setup. Observe the next transaction's fully durable
    // login row via a claims hook installed before session issuance.
    commits++;
    f.faults.beforeCommit = () => { commits++; committed.resolve(); };
  };
  const rejected = assert.rejects(f.setup({ trustDevice: true }), { statusCode: 403 });
  await signing.entered; await committed.promise;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(commits, 2);
  assert([...f.rows.values()].some(row => row.action === 'login'), 'session audit must already be committed');
  await f.call(); const writes = f.writes.length;
  signing.release(); await rejected;
  assert.equal(f.writes.length, writes); assertDeleted(f);
});

test('normal setup still commits password/PIN/trust together and returns usable session metadata', async () => {
  const f = fixture();
  const result = await f.setup({ password: 'Replacement2026', pin: '654321', username: 'fixture.next', trustDevice: true });
  assert.equal(result.success, true); assert.equal(result.customToken, 'synthetic-custom-token');
  assert(result.deviceSecret); assert.equal(result.identity.username, 'fixture.next');
  const identity = f.rows.get(f.identityPath), device = f.rows.get(f.identityPath + '/devices/enrollment-device');
  assert.equal(identity.status, 'active'); assert.notEqual(identity.passwordHash, passwordHash);
  assert.notEqual(identity.pinHash, passwordHash); assert.equal(identity.credentialVersion, 1);
  assert.equal(device.trusted, true); assert.equal(device.credentialVersion, 1);
  assert.equal(device.deviceSecretHash, createHash('sha256').update(result.deviceSecret).digest('hex'));
});
