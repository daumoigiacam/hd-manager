import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

test('native credential lifecycle is opt-in, scoped, protected and cancellable', { timeout: 15000 }, async () => {
  const storage = () => { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const secrets = new Map();
  let cancel = false;
  let available = true;
  let prompts = 0;
  let calls = 0;
  let enabled = false;
  let offline = false;
  let rejected = false;
  const identity = { identityKey: 'emp_a', id: 'a', phone: '0900000001', companyId: 'co', accountType: 'employee' };
  globalThis.window = { localStorage: storage(), sessionStorage: storage() };
  globalThis.__biometricTest = {
    async isAvailable() { return { isAvailable: available, strongBiometryIsAvailable: available, biometryType: 3 }; },
    async verifyIdentity() { prompts++; if (cancel) throw new Error('cancel'); },
    async setData(data) { if (cancel) throw new Error('cancel'); secrets.set(data.key, data); },
    async getSecureData({ key }) { prompts++; if (cancel) throw new Error('cancel'); const data = secrets.get(key); if (data?.accessControl !== 1) throw new Error('missing'); return { value: data.value }; },
    async getData({ key }) { const data = secrets.get(key); if (data?.accessControl === 1) throw new Error('protected'); return { value: data?.value }; },
    async deleteData({ key }) { secrets.delete(key); },
  };
  globalThis.fetch = async (url, options) => {
    calls++;
    if (offline) throw new Error('offline');
    if (rejected) return { ok: false, status: 403, json: async () => ({ success: false, message: 'revoked' }) };
    const body = JSON.parse(options.body);
    if (url.endsWith('identityCompleteSetup')) enabled = body.biometricEnabled;
    return { ok: true, json: async () => ({ success: true, identity, identityKey: identity.identityKey,
      setup: { biometricEnabled: url.endsWith('identityLogin') ? true : enabled },
      ...(body.trustDevice ? { deviceSecret: 'opaque-secret' } : {}), customToken: 'test-token' }) };
  };
  try {
    const output = await build({ entryPoints: ['src/services/identityCenter.js'], bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env': '{}' }, plugins: [{ name: 'native-test', setup(b) {
      b.onResolve({ filter: /^@capacitor\/core$|^@capgo\/capacitor-native-biometric$/ }, args => ({ path: args.path, namespace: 'test' }));
      b.onLoad({ filter: /.*/, namespace: 'test' }, args => ({ contents: args.path === '@capacitor/core' ? 'export const Capacitor={isNativePlatform:()=>true,getPlatform:()=>"android"};' : 'export const NativeBiometric=globalThis.__biometricTest;export const AccessControl={NONE:0,BIOMETRY_CURRENT_SET:1};' }));
    } }] });
    const api = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
    assert.equal(api.getBiometricAutoLoginProfile(), null);
    await api.identityLogin({ identifier: identity.phone, password: 'not-persisted' });
    assert.equal(api.getBiometricAutoLoginProfile(), null, 'account flag must not enable a new device');
    cancel = true;
    await assert.rejects(api.identitySetBiometric({ idToken: 'token', enabled: true, identity }));
    assert.equal(api.getBiometricAutoLoginProfile(), null);
    assert.equal(enabled, false);
    cancel = false;
    await api.identitySetBiometric({ idToken: 'token', enabled: true, identity });
    assert.equal(api.getBiometricAutoLoginProfile().accountScope, 'emp_a');
    assert.equal([...secrets.values()][0].accessControl, 1);
    assert.equal([...secrets.values()][0].value, 'opaque-secret');
    const before = prompts;
    await Promise.all([api.identityBiometricLogin({}), api.identityBiometricLogin({})]);
    assert.equal(prompts - before, 1, 'concurrent effects share one OS prompt');
    cancel = true;
    const beforeCalls = calls;
    assert.equal((await api.identityBiometricLogin({})).success, false);
    assert.equal(calls, beforeCalls, 'cancel never submits a login');
    cancel = false;
    await api.identitySetBiometric({ idToken: 'token', enabled: false, identity });
    assert.equal(secrets.size, 0, 'disable deletes, never downgrades the credential');
    assert.equal(api.getBiometricAutoLoginProfile(), null);
    available = false;
    await assert.rejects(api.identitySetBiometric({ idToken: 'token', enabled: true, identity }));
    available = true;
    await api.identitySetBiometric({ idToken: 'token', enabled: true, identity });
    api.suppressBiometricAutoLoginForSession();
    assert.equal(api.getBiometricAutoLoginProfile(), null, 'explicit logout suppresses automatic unlock');
    assert.ok(api.getBiometricAutoLoginProfile({ manual: true }), 'logout does not silently forget device');
    api.clearBiometricAutoLoginSuppression();
    offline = true;
    await assert.rejects(api.identityBiometricLogin({}), /offline/);
    assert.ok(api.getBiometricAutoLoginProfile(), 'network error does not revoke a valid device');
    await assert.rejects(api.identitySetBiometric({ idToken: 'token', enabled: false, identity }), /offline/);
    assert.equal(api.getBiometricAutoLoginProfile(), null, 'offline disable still removes local opt-in');
    assert.equal(secrets.size, 0);
    offline = false;
    await api.identitySetBiometric({ idToken: 'token', enabled: true, identity });
    rejected = true;
    await assert.rejects(api.identityBiometricLogin({}), /revoked/);
    assert.equal(api.getBiometricAutoLoginProfile(), null);
    assert.equal(secrets.size, 0);
    rejected = false;
    await api.identitySetBiometric({ idToken: 'token', enabled: true, identity });
    await assert.rejects(api.identityCompleteSetup({ idToken: 'token', password: 'new-password', biometricEnabled: true }));
    window.localStorage.removeItem('hd-identity-device-v1');
    assert.equal(api.getBiometricAutoLoginProfile(), null, 'lost installation binding requires password');
  } finally {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
    delete globalThis.__biometricTest;
  }
});
