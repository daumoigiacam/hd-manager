import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const app = parse(source, { sourceType: 'module', plugins: ['jsx'] }).program.body
  .find(node => node.type === 'ExportDefaultDeclaration' && node.declaration.id?.name === 'App').declaration;
const login = app.body.body.flatMap(node => node.declarations || [])
  .find(node => node.id.name === 'handleIdentityLogin').init;
const dependencies = ['isVpsStagingMode', 'normalizeEmployeeLoginPhone', 'recordStartupEvent', 'identityLogin',
  'isNativeRuntime', 'getBiometricAutoLoginProfile', 'biometricVerifiedIdentityRef', 'getIdentityAccountScope',
  'setBiometricUnlockState', 'logLoginStep', 'identitySetupPendingRef', 'establishIdentitySession', 'appId'];
const createLogin = new Function(...dependencies, `return (${source.slice(login.start, login.end)});`);

test('actual password handler never requires optional enrollment, and still enforces existing-device unlock and setup', async () => {
  for (const native of [false, true]) for (const enrolled of [false, true]) for (const setup of [false, true]) {
    const events = [], unlock = [], activations = [];
    const verified = { current: '' }, pending = { current: false };
    const session = { identity: { id: 'fixture' }, identityKey: 'fixture-scope', requiresSetup: setup, setup: {} };
    let apiCalls = 0;
    const handler = createLogin(false, value => value, name => events.push(name), async () => {
      apiCalls++; return session;
    }, () => native, () => enrolled ? { accountScope: 'fixture-scope' } : null,
    verified, () => 'fixture-scope', value => unlock.push(value), () => {}, pending,
    async (value, options) => { assert.equal(value, session); activations.push(options.activate); return { success: true, identity: session.identity }; }, 'fixture-app');
    const result = await handler('0900000000', 'fixture-password');
    assert.equal(result.success, true);
    assert.equal(apiCalls, 1);
    assert.deepEqual(activations, [!setup], 'required setup must finish before activating session');
    assert.equal(result.requiresSetup, setup);
    assert.equal(pending.current, setup);
    const needsUnlock = native && enrolled && !setup;
    assert.deepEqual(unlock, [needsUnlock ? 'blocked' : 'unlocked']);
    assert.equal(verified.current, needsUnlock ? '' : 'fixture-scope');
    assert.ok(events.includes('auth.identity_login.completed'));
  }
});

test('optional enrollment cannot replace the App screen; explicit secure enrollment remains available', () => {
  assert.doesNotMatch(source, /biometricOfferIdentity|setBiometricOfferIdentity|LazyBiometricEnrollment/);
  assert.match(source, /if \(!isVpsStagingMode && firebaseUser && currentUser && biometricUnlockState !== 'unlocked'\)/);
  const security = readFileSync(new URL('../src/features/identity/IdentitySecurityCenter.jsx', import.meta.url), 'utf8');
  assert.match(security, /identitySetBiometric\(\{ idToken, enabled: !biometricEnabled, identity: identityUser \}\)/);
  assert.match(security, /aria-label="Đăng nhập bằng sinh trắc học"/);
});
