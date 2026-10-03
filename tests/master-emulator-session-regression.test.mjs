import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { TARGET, isAllowedUrl, isBlockedConnectivityProbe, parseOptions, preflight, requestLocal, safeFailure, summarize, validateEnvironment }
  from '../scripts/master-emulator-session-regression.mjs';

test('Default is prepared-only; execution requires the one explicit local flag', () => {
  assert.deepEqual(parseOptions([]), { run: false });
  assert.deepEqual(parseOptions(['--run-local-emulator-session-regression']), { run: true });
  for (const args of [['--production'], ['--url', 'https://app.hdconnect.net'], ['--project', 'hd-manager-c5839'],
    ['--token', 'secret'], ['--run-local-emulator-session-regression', '--run-local-emulator-session-regression']]) {
    assert.throws(() => parseOptions(args), /unsupported-options/);
  }
});

test('Corrected runtime is fixed to demo project and actual 9199/8185/5002 ports', () => {
  assert.equal(TARGET.projectId, 'demo-hd-manager-local');
  assert.equal(TARGET.appId, 'hd-manager-local');
  assert.equal(TARGET.auth, 'http://127.0.0.1:9199');
  assert.equal(TARGET.firestore, 'http://127.0.0.1:8185');
  assert.equal(TARGET.functions, 'http://127.0.0.1:5002');
  assert.equal(TARGET.hub, 'http://127.0.0.1:4405');
  assert.ok(Object.isFrozen(TARGET));
});

test('Environment cannot redirect SDK/runner to another project, port or credentials', () => {
  validateEnvironment({});
  validateEnvironment({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8185', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199',
    GCLOUD_PROJECT: TARGET.projectId, HD_E2E_URL: `${TARGET.app}/` });
  validateEnvironment({ HD_E2E_URL: TARGET.app });
  for (const env of [{ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180' }, { FIREBASE_AUTH_EMULATOR_HOST: 'foreign:9199' },
    { GCLOUD_PROJECT: 'hd-manager-c5839' }, { GOOGLE_CLOUD_PROJECT: 'production' },
    { HD_E2E_URL: 'https://app.hdconnect.net/' }, { GOOGLE_APPLICATION_CREDENTIALS: 'private.json' },
    { FIREBASE_CONFIG: '{"projectId":"production"}' }]) {
    assert.throws(() => validateEnvironment(env));
  }
});

const localFunction = name => `${TARGET.functions}/${TARGET.projectId}/us-central1/${name}`;
const channel = `${TARGET.firestore}/google.firestore.v1.Firestore/Listen/channel?database=${encodeURIComponent(`projects/${TARGET.projectId}/databases/(default)`)}&VER=8`;

test('Only the exact WebChannel image connectivity probe is classified, never permitted', () => {
  for (const url of ['http://www.google.com/images/cleardot.gif?zx=ephemeral', 'https://www.google.com/images/cleardot.gif']) {
    assert.equal(isBlockedConnectivityProbe(url, 'image'), true);
    assert.equal(isAllowedUrl(url), false);
    assert.equal(isBlockedConnectivityProbe(url, 'fetch'), false);
  }
  for (const url of ['https://www.google.com/maps', 'https://www.google.com.evil.test/images/cleardot.gif',
    'https://private:secret@www.google.com/images/cleardot.gif', 'https://www.google.com:444/images/cleardot.gif']) {
    assert.equal(isBlockedConnectivityProbe(url, 'image'), false);
  }
});
test('Only exact local service routes and demo database are allowed', () => {
  for (const url of [`${TARGET.app}/`, `${TARGET.app}/src/App.jsx`, localFunction('identityLogin'), localFunction('identityLogout'), localFunction('customerPortalBootstrap'),
    `${TARGET.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-api-key`,
    `${TARGET.auth}/securetoken.googleapis.com/v1/token?key=demo-api-key`, channel,
    `${TARGET.firestore}/v1/projects/${TARGET.projectId}/databases/(default)/documents:batchGet`,
    `${TARGET.firestore}/v1/projects/${TARGET.projectId}/databases/(default)/documents:runQuery`,
    `${TARGET.firestore}/v1/projects/${TARGET.projectId}/databases/(default)/documents/artifacts/hd-manager-local/public/data/products/id`]) {
    assert.equal(isAllowedUrl(url), true, url);
  }
  assert.equal(isAllowedUrl(`${TARGET.hub}/emulators`), false);
  assert.equal(isAllowedUrl(`${TARGET.hub}/emulators`, 'preflight'), true);
});

test('Production, wrong ports, project override, traversal and arbitrary endpoints fail closed', () => {
  for (const url of ['https://app.hdconnect.net/', 'https://firestore.googleapis.com/v1/projects/demo-hd-manager-local/',
    'http://127.0.0.1:8180/v1/projects/demo-hd-manager-local/', 'http://127.0.0.1:5101/demo-hd-manager-local/us-central1/identityLogin',
    'http://localhost:5214/', 'http://127.0.0.1.evil.test:5214/', 'http://user:pass@127.0.0.1:5214/',
    `${TARGET.app}/../private`, `${TARGET.app}/%2e%2e/private`, `${TARGET.app}/%252e%252e/private`,
    `${TARGET.app}/src\\private`, `${TARGET.app}/#secret`, `${TARGET.app}/api/identity/login`, `${TARGET.hub}/anything`,
    `${TARGET.functions}/hd-manager-c5839/us-central1/identityLogin`, localFunction('identityDeleteAccount'),
    `${localFunction('identityLogin')}?target=production`, `${TARGET.firestore}/anything/projects/${TARGET.projectId}/`,
    `${TARGET.firestore}/google.firestore.v1.Firestore/Listen/channel?database=projects/production/databases/(default)`,
    `${TARGET.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=production-key`,
    `${TARGET.auth}/emulator/v1/projects/production/accounts`]) assert.equal(isAllowedUrl(url), false, url);
});

test('WebSocket guard accepts dev HMR only, not remote or other loopback ports', () => {
  assert.equal(isAllowedUrl('ws://127.0.0.1:5214/?token=ephemeral-vite-hmr', 'websocket'), true);
  for (const url of ['wss://app.hdconnect.net/', 'ws://127.0.0.1:9199/', 'ws://localhost:5214/',
    'ws://user:pass@127.0.0.1:5214/', 'http://127.0.0.1:5214/']) assert.equal(isAllowedUrl(url, 'websocket'), false);
});

test('Unsafe target is rejected before injected fetch is called', async () => {
  let calls = 0;
  await assert.rejects(requestLocal('https://app.hdconnect.net/', {}, 'ephemeral', async () => { calls++; }), /forbidden-target/);
  assert.equal(calls, 0);
});

test('Requests are manual redirect, omit credentials and have bounded abort signals', async () => {
  const body = { appId: TARGET.appId, identifier: 'synthetic' };
  await requestLocal(localFunction('identityLogin'), body, '', async (url, options) => {
    assert.equal(url, localFunction('identityLogin'));
    assert.equal(options.redirect, 'manual');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.method, 'POST');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(options.body), body);
    return { status: 200, url };
  });
});

test('Redirects are never followed, including same-origin, foreign and injected implicit redirects', async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    await assert.rejects(requestLocal(localFunction('identityLogin'), {}, '', async () => ({ status })), /redirect-refused/);
  }
  await assert.rejects(requestLocal(localFunction('identityLogin'), {}, '', async () => ({ status: 200, url: 'https://app.hdconnect.net/' })), /redirect-refused/);
});

function fixtureFetch({ ports = {}, env = {} } = {}) {
  const info = Object.fromEntries([['auth', 9199], ['firestore', 8185], ['functions', 5002]]
    .map(([name, port]) => [name, { host: '127.0.0.1', port: ports[name] ?? port }]));
  const config = { VITE_FIREBASE_PROJECT_ID: TARGET.projectId, VITE_HD_APP_ID: TARGET.appId,
    VITE_FIREBASE_EMULATORS: 'true', VITE_DATA_MODE: 'cloud', ...env };
  return async url => {
    assert.ok(isAllowedUrl(url, 'preflight'));
    return { status: 200, ok: true, url, json: async () => info, text: async () => `import.meta.env = ${JSON.stringify(config)};` };
  };
}
test('Preflight accepts exact observed runtime and performs no mutations', async () => {
  const urls = [];
  const fetch = fixtureFetch();
  await preflight(async (url, options) => {
    assert.equal(options.method, 'GET');
    assert.equal(options.body, undefined);
    assert.equal(options.headers.Authorization, undefined);
    urls.push(url);
    return fetch(url, options);
  });
  assert.deepEqual(urls, [`${TARGET.hub}/emulators`, `${TARGET.app}/src/config/firebase-endpoints.js`]);
});

test('Preflight rejects old ports and production/non-emulator/preview environment', async () => {
  for (const options of [{ ports: { firestore: 8180 } }, { ports: { functions: 5101 } },
    { env: { VITE_FIREBASE_PROJECT_ID: 'hd-manager-c5839' } }, { env: { VITE_HD_APP_ID: 'production' } },
    { env: { VITE_FIREBASE_EMULATORS: 'false' } }, { env: { VITE_DATA_MODE: 'preview' } }]) {
    await assert.rejects(preflight(fixtureFetch(options)), /emulator-(config|app-config)-mismatch/);
  }
});

test('Report does not serialize raw errors, tokens, credentials, response bodies or storage', () => {
  assert.equal(safeFailure(new Error('password=secret idToken=private bearer=secret')), 'step-failed');
  assert.equal(safeFailure({ code: 'auth/private-token-in-message', message: 'private' }), 'step-failed');
  const report = summarize([{ name: 'SDK session', status: 'FAIL', reason: safeFailure(new Error('private-secret')),
    token: 'private-secret', password: 'private-secret', storage: { bearer: 'private-secret' } }]);
  assert.equal(report.status, 'FAIL');
  assert.equal(JSON.stringify(report).includes('private-secret'), false);
  assert.equal(report.production, 'NOT_CONTACTED_OR_CERTIFIED');
  assert.equal(safeFailure({ stack: 'private-token\n at C:/private/master-emulator-session-regression.mjs:123:4\npassword=secret' }),
    'step-failed@harness:123:4');
  assert.equal(safeFailure({ safeCrudStep: 'crud-phase-4-step-11', message: 'password=secret' }), 'crud-phase-4-step-11');
  assert.equal(safeFailure({ safeCrudStep: 'crud-phase-private-token-step-11' }), 'step-failed');
  assert.equal(safeFailure({ stack: 'secret\n at private/master-emulator-ui-crud.mjs:123:4\npassword=secret' }),
    'step-failed@crud:123:4');
});

test('Missing real capabilities cannot produce a passing acceptance result', () => {
  assert.equal(summarize([], true).status, 'PREPARED_NOT_RUN');
  assert.equal(summarize([{ name: 'App queue', status: 'BLOCKED' }]).status, 'INCOMPLETE');
  assert.equal(summarize([{ name: 'Auth', status: 'PASS' }, { name: 'App queue', status: 'FAIL' }]).status, 'FAIL');
  assert.equal(summarize([{ name: 'Auth', status: 'PASS' }]).status, 'PASS_LOCAL_EMULATOR');
});

test('Source remains isolated: lazy real SDK/browser, no builds/startup/admin bypass or identity mocks', async () => {
  const source = await readFile(new URL('../scripts/master-emulator-session-regression.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"](?:vite|playwright-core|firebase-admin|firebase\/)/);
  assert.doesNotMatch(source, /\b(?:spawn|execSync|route\.fulfill|addInitScript|authenticatedContext|setCustomUserClaims|signInAnonymously)\s*\(/);
  assert.match(source, /await check\('Verified local emulator ports[\s\S]*?firebase = await import\('firebase\/app'\)/);
  assert.match(source, /signInWithCustomToken\(auth, customToken\)/);
  assert.match(source, /getIdTokenResult\(true\)/);
  assert.match(source, /getDocFromServer/);
  assert.match(source, /disableNetwork/);
  assert.match(source, /enableNetwork/);
  assert.match(source, /signOut\(queued.auth\)/);
  assert.match(source, /routeWebSocket/);
  assert.match(source, /const parkedCustomer = async/);
  assert.match(source, /waitNormalized\(logoutFixture\)/);
  assert.match(source, /Tenant A parked maintenance must not execute in tenant B session/);
  assert.match(source, /\['companyId', 'phone', 'empId', 'isArchived', 'createdAt', 'updatedAt'\]/);
  assert.match(source, /unverifiedByThisRunner/);
  assert.match(source, /independentlyCoveredNotExecutedHere/);
  assert.match(source, /report.status === 'INCOMPLETE' \? 2/);
});

test('Real role browser coverage is prepared for both tenants without claiming invite UX', async () => {
  const source = await readFile(new URL('../scripts/master-emulator-session-regression.mjs', import.meta.url), 'utf8');
  assert.match(source, /tenant < owners.length/);
  assert.match(source, /roles.push\(/);
  assert.match(source, /for \(const role of roles\)/);
  assert.match(source, /await login\(role\)/);
  assert.match(source, /Role reload must restore persisted real Auth/);
  assert.match(source, /await api\('identityDevices', \{\}, exchange.idToken\)/);
  assert.match(source, /\['companyId', 'role', 'accountType', 'identityId', 'appUserId'\]/);
  assert.match(source, /customer-portal-shell/);
  assert.match(source, /data-hd-more-module="role_permissions"/);
  assert.match(source, /read\(role, 'payrollPeriods'/);
  assert.doesNotMatch(source, /name: 'Employee\/customer UI registration\/invite and persistence', status: 'BLOCKED'/);
  assert.match(source, /UI invite\/registration UX is outside scope/);
});
