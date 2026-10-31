import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerAuthEnvelope, createWorkerAuthPersistence, assertWorkerIdentity } from '../src/services/workerAuthSession.js';

const scope = { uid: 'fixture-user', companyId: 'fixture-company', accountType: 'employee', apiKey: 'fixture-api', appName: '[DEFAULT]' };
const fixture = () => ({ uid: scope.uid, apiKey: scope.apiKey, appName: scope.appName, emailVerified: false, isAnonymous: false,
  displayName: 'Must not transfer', phoneNumber: 'Must not transfer', email: 'Must not transfer', providerData: [{ displayName: 'Must not transfer' }],
  stsTokenManager: { accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', expirationTime: Date.now()+3600000 } });

test('worker envelope is minimal, independent and rejects another Firebase account/app', () => {
  const raw = fixture(), user = { uid: scope.uid, toJSON: () => raw };
  const envelope = createWorkerAuthEnvelope(user, scope);
  assert.equal(envelope.displayName, undefined);
  assert.equal(envelope.phoneNumber, undefined);
  assert.equal(envelope.email, undefined);
  assert.deepEqual(envelope.providerData, []);
  envelope.stsTokenManager.accessToken = 'changed';
  assert.equal(raw.stsTokenManager.accessToken, 'synthetic-access');
  for (const patch of [{ uid: 'other' }, { apiKey: 'other' }, { appName: 'other' }, { isAnonymous: true }, { stsTokenManager: null }]) {
    assert.throws(() => createWorkerAuthEnvelope({ uid: scope.uid, toJSON: () => ({ ...raw, ...patch }) }, scope), /scope/);
  }
});

test('memory-only persistence keeps account scope through refresh and revokes without a storage API', async () => {
  const adapter = createWorkerAuthPersistence(fixture(), scope), persistence = new adapter.Persistence();
  const key = `firebase:authUser:${scope.apiKey}:${scope.appName}`;
  assert.equal(adapter.Persistence.type, 'NONE');
  assert.equal(persistence.type, 'NONE');
  assert.equal(persistence._shouldAllowMigration, false);
  assert.equal(await persistence._get('different-project-key'), null);
  const first = await persistence._get(key);first.stsTokenManager.accessToken = 'local-mutation';
  assert.equal((await persistence._get(key)).stsTokenManager.accessToken, 'synthetic-access');
  const fresh = fixture();fresh.stsTokenManager.accessToken = 'synthetic-fresh';
  await persistence._set(key, fresh);
  assert.equal((await persistence._get(key)).stsTokenManager.accessToken, 'synthetic-fresh');
  await assert.rejects(persistence._set(key, { ...fresh, uid: 'other' }), /scope/);
  await assert.rejects(persistence._set('other', fresh), /scope/);
  await persistence._remove(key);assert.equal(await persistence._get(key), null);
  await persistence._set(key, fresh);adapter.clear();
  assert.equal(await persistence._get(key), null);
  assert.equal(await persistence._isAvailable(), false);
  await assert.rejects(persistence._set(key, fresh), /scope/);
});

test('worker identity must match SDK user and verified company/account-type claims', () => {
  const user = { uid: scope.uid, isAnonymous: false };
  assertWorkerIdentity(user, { companyId: scope.companyId, accountType: 'employee' }, scope);
  for (const [candidate, claims] of [
    [{ ...user, uid: 'other' }, { companyId: scope.companyId, accountType: 'employee' }],
    [user, { companyId: 'other-company', accountType: 'employee' }],
    [user, { companyId: scope.companyId, accountType: 'customer' }],
    [{ ...user, isAnonymous: true }, { companyId: scope.companyId, accountType: 'employee' }],
  ]) assert.throws(() => assertWorkerIdentity(candidate, claims, scope), /scope/);
});
