import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { normalizeAccountDeletionConfirmation, validateAccountDeletion } from '../development/hd-manager/application/src/features/identity/accountDeletion.js';
import { resolveIdentityApiBaseForPath } from '../development/hd-manager/application/src/services/identityHttpTransport.js';

test('confirmation accepts the same phrase in lower case, uppercase or Vietnamese; never accepts incomplete phrases', () => {
  for (const value of ['XOA TAI KHOAN', 'xoa tai khoan', ' Xóa  tài khoản ', 'xÓA TÀI KHOẢN']) {
    assert.equal(normalizeAccountDeletionConfirmation(value), 'XOA TAI KHOAN');
    assert.equal(validateAccountDeletion({ password: 'fixture', confirmation: value }), '');
  }
  for (const value of ['', 'xóa', 'XOA TAI KHOAN KHAC', 'delete']) assert.ok(validateAccountDeletion({ password: 'fixture', confirmation: value }));
  assert.match(validateAccountDeletion({ confirmation: 'XOA TAI KHOAN' }), /mật khẩu/i);
});

test('deletion uses its Cloud Function instead of the production proxy SPA; explicit development identity origins remain intact', () => {
  const firebase = 'https://us-central1-hd-manager-c5839.cloudfunctions.net';
  assert.equal(resolveIdentityApiBaseForPath('/api/identity/delete-account', 'https://app.hdconnect.net', firebase), firebase);
  assert.equal(resolveIdentityApiBaseForPath('/api/identity/login', 'https://app.hdconnect.net', firebase), 'https://app.hdconnect.net');
  assert.equal(resolveIdentityApiBaseForPath('/api/identity/delete-account', 'http://127.0.0.1:5500', firebase), 'http://127.0.0.1:5500');
});

const require = createRequire(import.meta.url);
const bundled = await build({ entryPoints: ['development/hd-manager/application/src/services/identityCenter.js'],
  bundle: true, write: false, platform: 'node', format: 'cjs', define: { 'import.meta.env': JSON.stringify({ VITE_IDENTITY_API_BASE_URL: 'https://app.hdconnect.net' }) },
  plugins: [{ name: 'no-native-side-effects', setup(builder) {
    builder.onResolve({ filter: /^@capacitor\/core$|^@capgo\/capacitor-native-biometric$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const Capacitor={isNativePlatform:()=>false,getPlatform:()=>"web"};export const CapacitorHttp={request:()=>{throw Error("Unexpected native request")}};export const NativeBiometric={};export const AccessControl={};' }));
  } }],
});
const loaded = { exports: {} };
let respondToRequest = () => { throw Error('Unexpected test network request'); };
const initialFetch = globalThis.fetch;
try {
  globalThis.fetch = (...args) => respondToRequest(...args);
  new Function('module', 'exports', 'require', bundled.outputFiles[0].text)(loaded, loaded.exports, require);
} finally { globalThis.fetch = initialFetch; }
const { identityDeleteAccount } = loaded.exports;

function storageFixture({ failCleanup = false } = {}) {
  const rows = new Map([
    ['hd-identity-device-v1', JSON.stringify({ deviceId: 'test-device', name: 'Synthetic browser' })],
    ['hd-identity-device-secret-v1:test-device.employee%3Atest%3Aone', 'fixture-only-secret'],
    ['hd-identity-device-secret-v1:test-device.employee%3Atest%3Atwo', 'unrelated-secret'],
    ['hd-identity-device-accounts-v2', JSON.stringify({ 'identifier:one': 'employee:test:one', 'identifier:two': 'employee:test:two' })],
  ]);
  const removed = [];
  globalThis.window = { location: { origin: 'https://app.hdconnect.net' }, localStorage: {
    getItem: key => rows.get(key) || null, setItem: (key, value) => rows.set(key, value),
    removeItem: key => { removed.push(key); if (failCleanup) throw Error('Storage denied'); rows.delete(key); },
  } };
  return { rows, removed };
}

test('successful deletion sends only own-session credentials, cleans only this account and reports storage failure without reversing server success', async () => {
  const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
  try {
    for (const failCleanup of [false, true]) {
      const storage = storageFixture({ failCleanup }); let request;
      respondToRequest = async (url, options) => {
        request = { url, options }; return Response.json({ success: true, deleted: true });
      };
      const result = await identityDeleteAccount({ idToken: 'synthetic-token', currentPassword: 'fixture-only', confirmation: 'XOA TAI KHOAN', identity: { id: 'one', companyId: 'test', accountType: 'employee' } });
      assert.equal(result.success, true); assert.equal(result.localCleanupPending, failCleanup);
      assert.equal(request.url, 'https://us-central1-hd-manager-c5839.cloudfunctions.net/identityDeleteAccount');
      assert.equal(request.options.headers.Authorization, 'Bearer synthetic-token');
      assert.deepEqual(JSON.parse(request.options.body), { currentPassword: 'fixture-only', confirmation: 'XOA TAI KHOAN' });
      assert.ok(storage.rows.has('hd-identity-device-secret-v1:test-device.employee%3Atest%3Atwo'));
      assert.equal(storage.rows.has('hd-identity-device-secret-v1:test-device.employee%3Atest%3Aone'), failCleanup);
      assert.ok(!storage.removed.some(key => key.endsWith('%3Atwo')));
      assert.equal(JSON.parse(storage.rows.get('hd-identity-device-accounts-v2'))['identifier:one'], undefined);
      assert.equal(JSON.parse(storage.rows.get('hd-identity-device-accounts-v2'))['identifier:two'], 'employee:test:two');
    }
  } finally { globalThis.fetch = originalFetch; globalThis.window = originalWindow; }
});

test('missing service, denied password, network failure and unconfirmed response never clear local credentials', async () => {
  const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
  try {
    const cases = [
      [() => new Response('<html>not deployed</html>', { status: 404 }), /chưa sẵn sàng/],
      [() => new Response('<html>SPA fallback</html>', { status: 200 }), /chưa sẵn sàng/],
      [() => Response.json({ success: false, message: 'Mật khẩu không đúng' }, { status: 401 }), /Mật khẩu/],
      [() => { throw Error('Failed to fetch'); }, /kết nối/],
      [() => Response.json({}), /chưa xác nhận/],
    ];
    for (const [respond, expected] of cases) {
      const storage = storageFixture(); respondToRequest = async () => respond();
      await assert.rejects(identityDeleteAccount({ idToken: 'fixture', currentPassword: 'fixture', confirmation: 'XOA TAI KHOAN', identity: { id: 'one' } }), expected);
      assert.equal(storage.removed.length, 0);
    }
  } finally { globalThis.fetch = originalFetch; globalThis.window = originalWindow; }
});
