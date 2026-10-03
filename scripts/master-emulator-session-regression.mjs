import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exerciseMasterEmulatorUiCrud } from './helpers/master-emulator-ui-crud.mjs';

export const TARGET = Object.freeze({
  projectId: 'demo-hd-manager-local', appId: 'hd-manager-local',
  app: 'http://127.0.0.1:5214', auth: 'http://127.0.0.1:9199',
  firestore: 'http://127.0.0.1:8185', functions: 'http://127.0.0.1:5002',
  hub: 'http://127.0.0.1:4405',
});
const root = fileURLToPath(new URL('../', import.meta.url));
const RUN_FLAG = '--run-local-emulator-session-regression';
const functionNames = new Set(['identityRegisterCompany', 'identityLogin', 'identityCompleteSetup', 'identityDevices', 'identityLogout', 'customerPortalBootstrap']);
const TIMEOUT = 20000;

class SafetyError extends Error {
  constructor(code) { super(code); this.safeCode = code; }
}
export function parseOptions(args) {
  if (args.length === 0) return { run: false };
  if (args.length === 1 && args[0] === RUN_FLAG) return { run: true };
  throw new SafetyError('unsupported-options');
}
export function validateEnvironment(env) {
  for (const [key, expected] of Object.entries({
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8185', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199',
    GCLOUD_PROJECT: TARGET.projectId, GOOGLE_CLOUD_PROJECT: TARGET.projectId,
    FIREBASE_PROJECT_ID: TARGET.projectId,
  })) {
    if (env[key] && env[key] !== expected) throw new SafetyError('foreign-environment');
  }
  if (env.HD_E2E_URL && ![TARGET.app, `${TARGET.app}/`].includes(env.HD_E2E_URL)) throw new SafetyError('foreign-environment');
  if (env.GOOGLE_APPLICATION_CREDENTIALS || env.FIREBASE_CONFIG) throw new SafetyError('credential-environment');
}
export function isAllowedUrl(raw, surface = 'browser') {
  try {
    if (typeof raw !== 'string' || /[\\\x00-\x20]/.test(raw)) return false;
    const pathname = raw.split('?')[0];
    if (/%(?:2e|2f|5c|25)/i.test(pathname) || /(?:^|\/)\.\.(?:\/|$)/.test(pathname)) return false;
    const url = new URL(raw);
    if (url.username || url.password || url.hash) return false;
    if (surface === 'websocket') return url.protocol === 'ws:' && url.host === '127.0.0.1:5214';
    if (url.protocol !== 'http:') return false;
    if (url.origin === TARGET.app) return !/^\/api(?:\/|$)/.test(url.pathname);
    if (url.origin === TARGET.functions) {
      return functionNames.has(url.pathname.replace(`/${TARGET.projectId}/us-central1/`, ''))
        && url.pathname.startsWith(`/${TARGET.projectId}/us-central1/`) && !url.search;
    }
    if (url.origin === TARGET.auth) {
      return url.searchParams.get('key') === 'demo-api-key'
        && (/^\/identitytoolkit\.googleapis\.com\/v1\/(accounts:(signInWithCustomToken|lookup)|projects|recaptchaConfig)$/.test(url.pathname)
          || url.pathname === '/securetoken.googleapis.com/v1/token');
    }
    if (url.origin === TARGET.firestore) {
      const documents = `/v1/projects/${TARGET.projectId}/databases/(default)/documents`;
      return url.pathname.startsWith(`${documents}/`)
        || ['batchGet', 'commit', 'runQuery'].some(rpc => url.pathname === `${documents}:${rpc}`)
        || (/^\/google\.firestore\.v1\.Firestore\/(Listen|Write)\/channel$/.test(url.pathname)
          && url.searchParams.get('database') === `projects/${TARGET.projectId}/databases/(default)`);
    }
    return surface === 'preflight' && url.href === `${TARGET.hub}/emulators`;
  } catch { return false; }
}

export function isBlockedConnectivityProbe(raw, resourceType) {
  try {
    const url = new URL(raw);
    return resourceType === 'image' && ['http:', 'https:'].includes(url.protocol)
      && url.hostname === 'www.google.com' && !url.port && !url.username && !url.password && !url.hash
      && url.pathname === '/images/cleardot.gif';
  } catch { return false; }
}

// Neither external error messages nor API bodies are permitted into evidence.
export function safeFailure(error) {
  const codes = new Set(['permission-denied', 'auth/invalid-credential', 'auth/user-not-found']);
  if (error instanceof SafetyError) return error.safeCode;
  if (/^crud-phase-\d{1,2}-step-\d{1,6}$/.test(error?.safeCrudStep || '')) return error.safeCrudStep;
  const code = codes.has(error?.code) ? error.code : 'step-failed';
  const location = typeof error?.stack === 'string'
    ? error.stack.match(/master-emulator-session-regression\.mjs:(\d{1,6}):(\d{1,6})/) : null;
  const crudLocations = typeof error?.stack === 'string'
    ? [...error.stack.matchAll(/master-emulator-ui-crud\.mjs:(\d{1,6}):(\d{1,6})/g)] : [];
  if (crudLocations.length) return `${code}@crud:${crudLocations.slice(0, 4).map(item => `${item[1]}:${item[2]}`).join(',')}`;
  return location ? `${code}@harness:${location[1]}:${location[2]}` : code;
}
export function summarize(cases, prepared = false) {
  return {
    status: prepared ? 'PREPARED_NOT_RUN' : cases.some(c => c.status === 'FAIL') ? 'FAIL'
      : cases.some(c => c.status === 'BLOCKED') ? 'INCOMPLETE' : 'PASS_LOCAL_EMULATOR',
    projectId: TARGET.projectId, appId: TARGET.appId,
    production: 'NOT_CONTACTED_OR_CERTIFIED',
    scope: 'Selected local real-identity UI sessions/RBAC, actual product/customer/legacy dispatch save and reload, SDK offline writes and observable App legacy maintenance; no API mocks or injected claims',
    cases: cases.map(({ name, status, reason }) => ({ name, status, ...(reason ? { reason } : {}) })),
    limitations: [
      'Role fixtures use owner-authorized public Firestore creation and real first-login migration; UI invite/registration UX is outside scope.',
      'SDK offline queue coverage is not proof of App pending-write/background-queue cancellation; user-scoped SDK writes may resume after original-user reauthentication.',
      'Ordinary logout is client sign-out, not JWT revocation; Firebase emulator results do not certify production.',
      'Synthetic local accounts/data remain for diagnosis; no credentials, tokens, storage dumps or screenshots are recorded.',
    ],
    independentlyCoveredNotExecutedHere: [
      'tests/master-background-scheduling.test.mjs: extracted actual App loyalty/backup/readiness scheduling',
      'tests/master-compatibility-maintenance.test.mjs: extracted actual App maintenance scheduling',
      'scripts/master-session-regression.mjs: preview session sidecar (not real identity acceptance)',
    ],
    unverifiedByThisRunner: ['Offline App pending-save replay, hidden/focused-input gates, and loyalty/backup lifecycle; see independent coverage above. Actual online legacy dispatch save is independently covered here.'],
  };
}

async function bounded(promise, ms = TIMEOUT) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new SafetyError('timeout')), ms);
    })]);
  } finally { clearTimeout(timer); }
}
export async function requestLocal(url, body, token = '', fetchImpl = globalThis.fetch) {
  if (!isAllowedUrl(url, 'preflight')) throw new SafetyError('forbidden-target');
  const response = await bounded(fetchImpl(url, {
    method: body === undefined ? 'GET' : 'POST', redirect: 'manual', credentials: 'omit',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(TIMEOUT),
  }));
  if (response.status >= 300 && response.status < 400) throw new SafetyError('redirect-refused');
  if (response.url && response.url !== url) throw new SafetyError('redirect-refused');
  return response;
}
export async function preflight(fetchImpl = globalThis.fetch) {
  const hub = await requestLocal(`${TARGET.hub}/emulators`, undefined, '', fetchImpl);
  if (!hub.ok) throw new SafetyError('hub-unavailable');
  const info = await bounded(hub.json());
  for (const [name, port] of [['auth', 9199], ['firestore', 8185], ['functions', 5002]]) {
    if (info[name]?.port !== port || info[name]?.host !== '127.0.0.1') throw new SafetyError('emulator-config-mismatch');
  }
  // Intentionally supports the existing dev:emulator server, not arbitrary previews/builds.
  const response = await requestLocal(`${TARGET.app}/src/config/firebase-endpoints.js`, undefined, '', fetchImpl);
  if (!response.ok) throw new SafetyError('emulator-app-unavailable');
  const source = await bounded(response.text());
  for (const [key, value] of [['VITE_FIREBASE_PROJECT_ID', TARGET.projectId],
    ['VITE_HD_APP_ID', TARGET.appId], ['VITE_FIREBASE_EMULATORS', 'true'], ['VITE_DATA_MODE', 'cloud']]) {
    if (!new RegExp(`"${key}"\\s*:\\s*"${value}"`).test(source)) throw new SafetyError('emulator-app-config-mismatch');
  }
}

export async function runRegression() {
  validateEnvironment(process.env);
  const cases = [];
  const apps = [];
  let browser;
  let expired = false;
  let stopped = false;
  const deadline = setTimeout(() => { expired = true; void browser?.close(); }, 480000);
  const check = async (name, operation, timeout = 60000) => {
    if (expired) throw new SafetyError('run-deadline');
    try { await bounded(operation(), timeout); cases.push({ name, status: 'PASS' }); }
    catch (error) { stopped = true; cases.push({ name, status: 'FAIL', reason: safeFailure(error) }); throw error; }
  };
  let firestore;
  let firebase;
  try {
    await check('Verified local emulator ports and dev-server environment before any writes', () => preflight());
    firebase = await import('firebase/app');
    firebase.setLogLevel('silent');
    const authSdk = await import('firebase/auth');
    firestore = await import('firebase/firestore');
    firestore.setLogLevel('silent');
    const { chromium } = await import('playwright-core');
    const runId = randomUUID().replaceAll('-', '');
    const password = `LocalOnly!${randomUUID()}`;
    const phoneBase = Number(BigInt(`0x${runId.slice(0, 12)}`) % 90000000n);
    const phone = n => `09${String((phoneBase + n) % 100000000).padStart(8, '0')}`;
    const device = { deviceId: `regression-${runId}`, deviceName: 'Disposable local regression', platform: 'web' };
    const ensureActive = () => { if (expired || stopped) throw new SafetyError('run-stopped'); };
    const api = async (name, body, token) => {
      ensureActive();
      if (!functionNames.has(name)) throw new SafetyError('forbidden-endpoint');
      const response = await requestLocal(`${TARGET.functions}/${TARGET.projectId}/us-central1/${name}`,
        { appId: TARGET.appId, device, ...body }, token);
      const data = await bounded(response.json());
      if (!response.ok || !data.success) throw new SafetyError('identity-request-rejected');
      return data;
    };
    const session = async (customToken, label) => {
      ensureActive();
      const app = firebase.initializeApp({ projectId: TARGET.projectId, apiKey: 'demo-api-key', appId: TARGET.projectId }, `${runId}-${label}`);
      apps.push(app);
      const auth = authSdk.getAuth(app);
      authSdk.connectAuthEmulator(auth, TARGET.auth, { disableWarnings: true });
      const db = firestore.initializeFirestore(app, { experimentalForceLongPolling: true });
      firestore.connectFirestoreEmulator(db, '127.0.0.1', 8185);
      const login = await authSdk.signInWithCustomToken(auth, customToken);
      const claims = (await login.user.getIdTokenResult(true)).claims;
      const token = await login.user.getIdToken();
      return { app, auth, db, claims, token };
    };
    const ref = (s, collection, id) => {
      ensureActive();
      return firestore.doc(s.db, 'artifacts', TARGET.appId, 'public', 'data', collection, id);
    };
    const read = (s, collection, id) => firestore.getDocFromServer(ref(s, collection, id));
    const denied = async work => {
      let error;
      try { await work(); } catch (caught) { error = caught; }
      assert.equal(error?.code, 'permission-denied');
    };
    const owners = [];
    const roles = [];
    await check('Two synthetic tenants registered by real Identity Center; Auth issues matching claims', async () => {
      for (let i = 0; i < 2; i++) {
        const registration = await api('identityRegisterCompany', { companyName: `Session regression ${runId}-${i}`, phone: phone(i), password });
        const s = await session(registration.customToken, `owner-${i}`);
        assert.equal(s.claims.companyId, registration.company.id);
        assert.equal(s.claims.accountType, 'employee');
        assert.equal(s.claims.role, 'super_admin');
        assert.ok(s.claims.identityId);
        owners.push({ ...s, phone: phone(i), customToken: registration.customToken });
        await firestore.setDoc(ref(s, 'companies', s.claims.companyId), { autoBackupEnabled: false }, { merge: true });
        await firestore.setDoc(ref(s, 'customers', `ui-${runId}-${i}`), {
          id: `ui-${runId}-${i}`, companyId: s.claims.companyId, name: `SessionFixture${i}${runId.slice(0, 8)}`,
          phone: phone(i + 20), empId: s.claims.appUserId, isArchived: false,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
        await firestore.setDoc(ref(s, 'products', `probe-${runId}-${i}`), {
          id: `probe-${runId}-${i}`, companyId: s.claims.companyId, name: `Local probe ${i}`, marker: 0, isArchived: false,
        });
      }
      assert.notEqual(owners[0].claims.companyId, owners[1].claims.companyId);
    });
    await check('Real Auth refresh preserves server-issued company and role claims', async () => {
      for (const owner of owners) {
        const refreshed = await owner.auth.currentUser.getIdTokenResult(true);
        assert.equal(refreshed.claims.companyId, owner.claims.companyId);
        assert.equal(refreshed.claims.identityId, owner.claims.identityId);
        assert.equal(refreshed.claims.role, 'super_admin');
      }
    });
    await check('Owner tenant isolation: own read allowed; foreign read/update/create rejected', async () => {
      for (let i = 0; i < 2; i++) {
        assert.equal((await read(owners[i], 'products', `probe-${runId}-${i}`)).exists(), true);
        assert.equal((await read(owners[i], 'payrollPeriods', `missing-${runId}`)).exists(), false);
        await denied(() => read(owners[i], 'products', `probe-${runId}-${1 - i}`));
        await denied(() => firestore.updateDoc(ref(owners[i], 'products', `probe-${runId}-${1 - i}`), { marker: 99 }));
        await denied(() => firestore.setDoc(ref(owners[i], 'products', `foreign-${runId}-${i}`), {
          companyId: owners[1 - i].claims.companyId, name: 'Forbidden synthetic record',
        }));
      }
    });
    await check('Real public-account first-login migration: employee/customer claims and rules', async () => {
      for (let tenant = 0; tenant < owners.length; tenant++) {
        const owner = owners[tenant];
        for (const [offset, collection, role, accountType] of [[2, 'employees', 'employee', 'employee'], [3, 'customers', 'customer', 'customer']]) {
          const n = offset + tenant * 2;
          const id = `role-${runId}-${n}`;
          const name = `Role Probe ${tenant} ${n}`;
          await firestore.setDoc(ref(owner, collection, id), { id, companyId: owner.claims.companyId,
            phone: phone(n), name, role, position: 'Kinh doanh', isArchived: false, empId: owner.claims.appUserId,
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
          const login = await api('identityLogin', { identifier: phone(n), password: '12345678' });
          const s = await session(login.customToken, `role-${n}`);
          assert.equal(s.claims.accountType, accountType);
          assert.equal(s.claims.role, role);
          assert.equal(s.claims.companyId, owner.claims.companyId);
          await api('identityCompleteSetup', { password, pin: '246813', trustDevice: true }, s.token);
          const relogin = await api('identityLogin', { identifier: phone(n), password });
          assert.ok(relogin.customToken);
          roles.push({ ...s, phone: phone(n), name, tenant });
          await denied(() => read(s, 'products', `probe-${runId}-${1 - tenant}`));
          await denied(() => firestore.updateDoc(ref(s, 'products', `probe-${runId}-${1 - tenant}`), { marker: 99 }));
          await denied(() => read(s, 'payrollPeriods', `missing-${runId}`));
          if (accountType === 'customer') {
            assert.equal((await read(s, 'customers', id)).exists(), true);
            await denied(() => read(s, 'products', `probe-${runId}-${tenant}`));
            await denied(() => firestore.setDoc(ref(s, 'products', `customer-denied-${runId}-${tenant}`), { companyId: owner.claims.companyId }));
          } else assert.equal((await read(s, 'products', `probe-${runId}-${tenant}`)).exists(), true);
        }
      }
    });
    await check('Actual SDK offline resume; logout parks user-scoped write during foreign login', async () => {
      const queued = await session(owners[0].customToken, 'offline');
      await firestore.disableNetwork(queued.db);
      const pending = firestore.updateDoc(ref(queued, 'products', `probe-${runId}-0`), { marker: 1 });
      void pending.catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 250));
      assert.equal((await read(owners[0], 'products', `probe-${runId}-0`)).data().marker, 0);
      await firestore.enableNetwork(queued.db);
      await pending;
      assert.equal((await read(owners[0], 'products', `probe-${runId}-0`)).data().marker, 1);
      await firestore.disableNetwork(queued.db);
      const parked = firestore.updateDoc(ref(queued, 'products', `probe-${runId}-0`), { marker: 2 });
      let parkedState = 'pending';
      const result = parked.then(() => { parkedState = 'committed'; }, error => { parkedState = error.code; });
      await authSdk.signOut(queued.auth);
      await authSdk.signInWithCustomToken(queued.auth, owners[1].customToken);
      await firestore.enableNetwork(queued.db);
      assert.equal((await read(queued, 'products', `probe-${runId}-1`)).data().marker, 0);
      await new Promise(resolve => setTimeout(resolve, 250));
      assert.equal(parkedState, 'pending', 'Firestore retains pending mutations per user, not under the next identity');
      assert.equal((await read(owners[0], 'products', `probe-${runId}-0`)).data().marker, 1);
      await denied(() => read(queued, 'products', `probe-${runId}-0`));
      await authSdk.signOut(queued.auth);
      await authSdk.signInWithCustomToken(queued.auth, owners[0].customToken);
      await result;
      assert.equal(parkedState, 'committed');
      assert.equal((await read(owners[0], 'products', `probe-${runId}-0`)).data().marker, 2);
    });
    await check('Unauthenticated SDK and Identity endpoint access rejected after sign-out', async () => {
      const s = await session(owners[0].customToken, 'logout');
      await authSdk.signOut(s.auth);
      assert.equal(s.auth.currentUser, null);
      await denied(() => read(s, 'products', `probe-${runId}-0`));
      const response = await requestLocal(`${TARGET.functions}/${TARGET.projectId}/us-central1/identityDevices`, { appId: TARGET.appId });
      assert.ok([401, 403].includes(response.status));
    });
    await check('Actual UI credential login/reload/offline navigation/reconnect/logout and second-tenant login', async () => {
      browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
        timeout: TIMEOUT, args: ['--disable-background-networking'] });
      const context = await browser.newContext({ viewport: { width: 430, height: 900 }, serviceWorkers: 'block' });
      let rejectedNetwork = 0;
      let blockedConnectivityProbes = 0;
      const rejectedTargets = new Set();
      let identityLogins = 0;
      let authExchanges = 0;
      await context.route('**/*', route => {
        const request = route.request();
        // WebChannel probes connectivity after the deliberate offline test.
        // Never send this request or mock its response; business routes remain fail-closed.
        if (isBlockedConnectivityProbe(request.url(), request.resourceType())) {
          blockedConnectivityProbes++; return route.abort();
        }
        if (!isAllowedUrl(request.url())
          || (new URL(request.url()).origin === TARGET.app && !['GET', 'HEAD'].includes(request.method()))) {
          const target = new URL(request.url());
          const localFunction = target.origin === TARGET.functions
            ? target.pathname.match(/^\/demo-hd-manager-local\/us-central1\/([A-Za-z]{1,80})$/)?.[1] : null;
          rejectedTargets.add(localFunction ? `local-function-${localFunction}` : target.origin === TARGET.app
            ? 'local-app-method-or-path' : target.origin === TARGET.auth ? 'local-auth-path'
              : target.origin === TARGET.firestore ? 'local-firestore-path'
                : ['identitytoolkit.googleapis.com', 'securetoken.googleapis.com', 'firestore.googleapis.com',
                  'www.googleapis.com', 'www.google.com', 'fonts.googleapis.com', 'fonts.gstatic.com',
                  'firebasestorage.googleapis.com', 'api.qrserver.com', 'hd-manager-c5839.web.app',
                  'us-central1-hd-manager-c5839.cloudfunctions.net', 'localhost', '127.0.0.1'].includes(target.hostname)
                  ? `rejected-host-${target.hostname}${target.hostname === 'www.google.com'
                    ? target.pathname.startsWith('/recaptcha/') ? '-recaptcha'
                      : target.pathname.startsWith('/maps') ? '-maps'
                        : /^\/[A-Za-z_./-]{0,60}$/.test(target.pathname) ? `-${target.pathname}` : '-other' : ''}` : 'external-origin');
          rejectedNetwork++; return route.abort();
        }
        return route.continue();
      });
      if (typeof context.routeWebSocket !== 'function') throw new SafetyError('websocket-guard-unavailable');
      await context.routeWebSocket('**/*', socket => {
        if (!isAllowedUrl(socket.url(), 'websocket')) { rejectedNetwork++; socket.close(); }
        else socket.connectToServer();
      });
      context.on('response', response => {
        if (!response.ok()) return;
        if (response.url().endsWith('/identityLogin') && response.request().method() === 'POST') identityLogins++;
        if (response.url().includes('/accounts:signInWithCustomToken')) authExchanges++;
      });
      const page = await context.newPage();
      page.setDefaultTimeout(TIMEOUT);
      page.setDefaultNavigationTimeout(TIMEOUT);
      await page.goto(`${TARGET.app}/`);
      const nav = page.locator('[data-hd-navigation="bottom"]');
      const login = async owner => {
        const exchangePromise = page.waitForResponse(response => response.ok()
          && response.url().startsWith(`${TARGET.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken`));
        void exchangePromise.catch(() => {});
        await page.locator('input[type="tel"], input[placeholder*="điện thoại"]').first().fill(owner.phone);
        await page.locator('input[type="password"]').first().fill(password);
        await page.getByRole('button', { name: 'Vào Ứng Dụng', exact: true }).click();
        await page.locator('[data-hd-shell="enterprise"]').waitFor();
        const pin = page.getByPlaceholder('PIN 6 số', { exact: true });
        await Promise.race([pin.waitFor(), nav.waitFor()]);
        if (await pin.isVisible()) {
          await pin.fill('246813');
          await page.getByPlaceholder('Xác nhận PIN 6 số', { exact: true }).fill('246813');
          await page.getByRole('button', { name: 'Hoàn tất và vào trang chủ', exact: true }).click();
        }
        await nav.waitFor();
        const exchange = await (await exchangePromise).json();
        assert.ok(exchange.idToken);
        const claims = JSON.parse(Buffer.from(exchange.idToken.split('.')[1], 'base64url').toString('utf8'));
        for (const key of ['companyId', 'role', 'accountType', 'identityId', 'appUserId']) assert.equal(claims[key], owner.claims[key]);
        // The real server verifies the browser-issued token. It is never injected
        // into UI state, mocked, logged, or persisted by the harness.
        await api('identityDevices', {}, exchange.idToken);
      };
      const assertTenant = async index => {
        await nav.getByRole('button', { name: 'Xuất kho', exact: true }).click();
        const main = page.locator('main[data-hd-module="warehouse_dispatch"]');
        const search = main.getByRole('textbox', { name: 'Tìm tên khách hàng', exact: true });
        await search.fill(`SessionFixture${index}${runId.slice(0, 8)}`);
        await main.locator('[data-search-zone]').first().getByRole('button')
          .filter({ hasText: `SessionFixture${index}${runId.slice(0, 8)}` }).first().waitFor();
        await search.fill(`SessionFixture${1 - index}${runId.slice(0, 8)}`);
        await page.waitForTimeout(750);
        assert.equal(await main.locator('[data-search-zone]').first().getByRole('button')
          .filter({ hasText: `SessionFixture${1 - index}${runId.slice(0, 8)}` }).count(), 0);
        await search.fill('');
      };
      // A genuine legacy-maintenance write is observable in Firestore. Creating the
      // fixture while warehouse_dispatch is active guarantees the App queue is parked.
      const parkedCustomer = async n => {
        const id = `maintenance-${runId}-${n}`;
        const plain = `Queue Probe ${phoneBase} ${n}`;
        const payload = { id, companyId: owners[0].claims.companyId, name: `Anh ${plain}`,
          phone: phone(n + 10), empId: owners[0].claims.appUserId, isArchived: false,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        await firestore.setDoc(ref(owners[0], 'customers', id), payload);
        const main = page.locator('main[data-hd-module="warehouse_dispatch"]');
        await main.getByRole('textbox', { name: 'Tìm tên khách hàng', exact: true }).fill(plain);
        await main.locator('[data-search-zone]').first().getByRole('button').filter({ hasText: plain }).first().waitFor();
        assert.equal((await read(owners[0], 'customers', id)).data().name, payload.name);
        return { id, plain, payload };
      };
      const waitNormalized = async fixture => {
        const until = Date.now() + TIMEOUT;
        let data;
        do {
          data = (await read(owners[0], 'customers', fixture.id)).data();
          if (data.name === fixture.plain) break;
          await page.waitForTimeout(200);
        } while (Date.now() < until);
        assert.equal(data.name, fixture.plain);
        assert.equal(data.customerHonorific, 'anh');
        for (const key of ['companyId', 'phone', 'empId', 'isArchived', 'createdAt', 'updatedAt']) assert.equal(data[key], fixture.payload[key]);
      };
      await login(owners[0]);
      await exerciseMasterEmulatorUiCrud({ page, nav, owner: owners[0], firestore, ref, read, runId, check });
      await assertTenant(0);
      const initialLogins = identityLogins;
      await page.reload();
      await nav.waitFor();
      await assertTenant(0);
      assert.equal(identityLogins, initialLogins, 'Reload must restore a real persisted session, not repeat credential login');
      const reconnectFixture = await parkedCustomer(0);
      await context.setOffline(true);
      await nav.getByRole('button', { name: 'Thêm', exact: true }).click();
      await page.waitForTimeout(1200);
      assert.equal((await read(owners[0], 'customers', reconnectFixture.id)).data().name, reconnectFixture.payload.name);
      await context.setOffline(false);
      await waitNormalized(reconnectFixture);
      cases.push({ name: 'Actual App legacy maintenance: warehouse/offline parking and online idle resume with exact patch', status: 'PASS' });
      await assertTenant(0);
      const logoutFixture = await parkedCustomer(1);
      await context.setOffline(true);
      await nav.getByRole('button', { name: 'Thêm', exact: true }).click();
      await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
      await page.getByRole('button', { name: 'Vào Ứng Dụng', exact: true }).waitFor();
      await context.setOffline(false);
      await page.reload();
      await page.getByRole('button', { name: 'Vào Ứng Dụng', exact: true }).waitFor();
      assert.equal(await nav.count(), 0);
      await login(owners[1]);
      await assertTenant(1);
      await nav.getByRole('button', { name: 'Thêm', exact: true }).click();
      await page.waitForTimeout(1200);
      assert.equal((await read(owners[0], 'customers', logoutFixture.id)).data().name, logoutFixture.payload.name,
        'Tenant A parked maintenance must not execute in tenant B session');
      await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
      await page.getByRole('button', { name: 'Vào Ứng Dụng', exact: true }).waitFor();
      await login(owners[0]);
      await nav.getByRole('button', { name: 'Thêm', exact: true }).click();
      await waitNormalized(logoutFixture);
      cases.push({ name: 'Actual App legacy maintenance: logout/tenant isolation and eligible work re-admitted on original-tenant login', status: 'PASS' });
      await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
      await page.getByRole('button', { name: 'Vào Ứng Dụng', exact: true }).waitFor();
      for (const role of roles) {
        await login(role);
        const assertRoleUi = async () => {
          if (role.claims.accountType === 'customer') {
            await page.locator('.customer-portal-shell .customer-portal-main').waitFor();
            await nav.getByRole('button', { name: 'Đặt hàng', exact: true }).waitFor();
            await nav.getByRole('button', { name: 'Đơn hàng', exact: true }).click();
            assert.equal(await nav.getByRole('button', { name: 'Xuất kho', exact: true }).count(), 0);
            await nav.getByRole('button', { name: 'Thêm', exact: true }).click();
            await page.getByRole('heading', { name: 'Thông tin khách hàng', exact: true }).waitFor();
            await page.locator('.customer-portal-shell [data-hd-region="header"]').filter({ hasText: role.name }).waitFor();
          } else {
            assert.equal(await page.locator('.customer-portal-shell').count(), 0);
            await nav.getByRole('button', { name: 'Thêm', exact: true }).click();
            await page.locator('[data-hd-more-module="orders"]').click();
            await page.locator('main[data-hd-module="orders"]').waitFor();
            await nav.getByRole('button', { name: 'Thêm', exact: true }).click();
            await page.locator('.hd-more-menu').waitFor();
            assert.equal(await page.locator('[data-hd-more-module="role_permissions"]').count(), 0);
            assert.equal(await page.locator('[data-hd-more-module="billing"]').count(), 0);
            await page.locator('.hd-more-menu__profile').filter({ hasText: role.name }).waitFor();
          }
        };
        await assertRoleUi();
        const roleLoginCount = identityLogins;
        await page.reload();
        await nav.waitFor();
        await assertRoleUi();
        assert.equal(identityLogins, roleLoginCount, 'Role reload must restore persisted real Auth, without credential replay');
        // Paired backend denials use the same server-issued identity, not UI visibility as authorization evidence.
        await denied(() => read(role, 'products', `probe-${runId}-${1 - role.tenant}`));
        await denied(() => read(role, 'payrollPeriods', `missing-${runId}`));
        await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
        await page.getByRole('button', { name: 'Vào Ứng Dụng', exact: true }).waitFor();
        await page.reload();
        await page.getByRole('button', { name: 'Vào Ứng Dụng', exact: true }).waitFor();
        assert.equal(await nav.count(), 0);
        cases.push({ name: `Actual ${role.claims.accountType} UI login/server claims/modules/reload/logout, tenant ${role.tenant + 1}`, status: 'PASS' });
      }
      assert.ok(identityLogins >= 2 && authExchanges >= 2, 'Must observe successful real identity and Auth requests from browser');
      if (rejectedNetwork) throw new SafetyError(`rejected-network:${[...rejectedTargets].sort().join(',')}`);
      cases.push({ name: `WebChannel connectivity probes blocked without response mocks: ${blockedConnectivityProbes}`, status: 'PASS' });
    }, 420000);
  } catch (error) {
    if (!cases.some(c => c.status === 'FAIL')) cases.push({ name: 'Harness prerequisites', status: 'FAIL', reason: safeFailure(error) });
  } finally {
    stopped = true;
    clearTimeout(deadline);
    await bounded(browser?.close() ?? Promise.resolve(), 5000).catch(() => {});
    for (const app of apps) {
      await bounded(firestore.terminate(firestore.getFirestore(app)), 3000).catch(() => {});
      await bounded(firebase.deleteApp(app), 3000).catch(() => {});
    }
  }
  return summarize(cases);
}

export async function main(args = process.argv.slice(2)) {
  let report;
  try {
    const options = parseOptions(args);
    report = options.run ? await runRegression() : summarize([], true);
  } catch (error) { report = summarize([{ name: 'Safety preconditions', status: 'FAIL', reason: safeFailure(error) }]); }
  const output = path.join(root, 'test-results', 'master-emulator-session-regression');
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'result.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  return report.status === 'FAIL' ? 1 : report.status === 'INCOMPLETE' ? 2 : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => process.exit(code), () => {
    process.stderr.write('{"status":"FAIL","reason":"report-or-run-failed"}\n');
    process.exit(1);
  });
}
