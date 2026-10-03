import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createServer } from 'node:http';

test('encrypted native session opt-in, matching account, logout and storage failures', { timeout: 15000 }, async () => {
  const oldWindow = globalThis.window;
  const values = new Map(), encrypted = new Map();
  globalThis.window = { location: { href: 'http://localhost' }, localStorage: { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) } };
  globalThis.__sessionStore = {
    setData: async ({ key, value, accessControl }) => { assert.equal(accessControl, 0); encrypted.set(key, value); },
    getData: async ({ key }) => ({ value: encrypted.get(key) }),
    deleteData: async ({ key }) => encrypted.delete(key),
  };
  try {
    const result = await build({ entryPoints: ['src/services/nativeSessionPersistence.js'], bundle: true, write: false, format: 'esm', platform: 'node', plugins: [{ name: 'native', setup(b) {
      b.onResolve({ filter: /^@capacitor\/core$|^@capgo\/capacitor-native-biometric$/ }, a => ({ path: a.path, namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: a.path === '@capacitor/core' ? 'export const Capacitor={getPlatform:()=>"android"}' : 'export const NativeBiometric=globalThis.__sessionStore' }));
    } }] });
    const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
    const store = new api.NativeSessionPersistence();
    await store._set('auth', { uid: 'a', stsTokenManager: { refreshToken: 'test-only' } });
    assert.equal(await store._get('auth'), null, 'no restore before biometric opt-in');
    const auth = { currentUser: { uid: 'a' } };
    await api.rememberNativeSession(auth, async (_, ctor) => assert.equal(ctor, api.NativeSessionPersistence));
    assert.equal((await store._get('auth')).uid, 'a');
    assert.equal([...values.values()].some(v => v.includes('test-only')), false);
    await store._set('other', { uid: 'b' });
    assert.equal(await store._get('other'), null);
    api.forgetNativeSession();
    assert.equal(await store._get('auth'), null, 'logout blocks restore even before async deletion');
    await assert.rejects(api.rememberNativeSession(auth, async () => { throw Error('storage failed'); }));
    assert.equal(api.rememberedNativeUid(), '');
    await store._remove('auth');
    assert.equal(encrypted.has('firebase-session:auth'), false);
    // Exercise the real Firebase persistence contract against a local-only API.
    // Use the browser SDK: Firebase's Node build intentionally disables persistence.
    const sdkBundle = await build({ stdin: { contents: "export {initializeApp,deleteApp} from 'firebase/app'; export {initializeAuth,inMemoryPersistence,setPersistence,connectAuthEmulator,signInWithCustomToken,signOut} from 'firebase/auth';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'browser', format: 'esm' });
    const { initializeApp, deleteApp, initializeAuth, inMemoryPersistence, setPersistence, connectAuthEmulator, signInWithCustomToken, signOut } = await import(`data:text/javascript;base64,${Buffer.from(sdkBundle.outputFiles[0].text).toString('base64')}`);
    const now = Math.floor(Date.now() / 1000);
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const idToken = `${encode({ alg: 'none' })}.${encode({ sub: 'a', user_id: 'a', iat: now, exp: now + 3600, auth_time: now })}.test`;
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url.includes('signInWithCustomToken')) res.end(JSON.stringify({ idToken, refreshToken: 'test-refresh', expiresIn: '3600', localId: 'a' }));
      else if (req.url.includes('lookup')) res.end(JSON.stringify({ users: [{ localId: 'a', createdAt: String(Date.now()), lastLoginAt: String(Date.now()), providerUserInfo: [] }] }));
      else { res.statusCode = 400; res.end('{}'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let app;
    try {
      const start = persistence => {
        app = initializeApp({ apiKey: 'test-only', projectId: 'demo-session' }, 'session-contract');
        const auth = initializeAuth(app, { persistence });
        connectAuthEmulator(auth, `http://127.0.0.1:${server.address().port}`, { disableWarnings: true });
        return auth;
      };
      let firebase = start(inMemoryPersistence);
      await signInWithCustomToken(firebase, 'test-only');
      await api.rememberNativeSession(firebase, setPersistence);
      await deleteApp(app); app = null;
      firebase = start(api.NativeSessionPersistence);
      await firebase.authStateReady();
      assert.equal(firebase.currentUser?.uid, 'a', 'real SDK restores encrypted session after restart');
      api.forgetNativeSession();
      await signOut(firebase);
      await deleteApp(app); app = null;
      firebase = start(api.NativeSessionPersistence);
      await firebase.authStateReady();
      assert.equal(firebase.currentUser, null, 'real SDK cannot restore after explicit logout');
    } finally {
      if (app) await deleteApp(app);
      await new Promise(resolve => server.close(resolve));
    }
  } finally { globalThis.window = oldWindow; delete globalThis.__sessionStore; }
});
