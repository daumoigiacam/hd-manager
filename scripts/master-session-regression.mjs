import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { seedData } from '../src/mocks/seed-data.js';

// Never builds, attaches to an existing app, or impersonates an identity API.
// Run only AFTER the immutable before/after benchmarks have both completed:
// HD_MASTER_SESSION_DIST=test-results/full-interaction/<preview-phase>/dist
// node scripts/master-session-regression.mjs --run-after-paired-benchmarks
// Exit 2 means incomplete acceptance (unsupported preview auth/SDK capabilities).
if (!process.argv.includes('--run-after-paired-benchmarks')) {
  console.log('Prepared only. Set HD_MASTER_SESSION_DIST to an isolated preview bundle under test-results, then pass --run-after-paired-benchmarks after BOTH benchmark runs finish. No build or browser started.');
  process.exit(0);
}
assert.deepEqual(process.argv.slice(2), ['--run-after-paired-benchmarks'], 'No URL, server port, credentials or production target arguments are supported');

const root = fileURLToPath(new URL('../', import.meta.url));
const resultsRoot = path.join(root, 'test-results');
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
assert.ok(process.env.HD_MASTER_SESSION_DIST, 'An existing immutable preview dist is required; this harness never builds');
const dist = await realpath(path.resolve(root, process.env.HD_MASTER_SESSION_DIST));
assert.ok(inside(await realpath(resultsRoot), dist), 'Bundle must be under workspace test-results, not the production dist');
const files = new Map();
async function collectFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    assert.equal(entry.isSymbolicLink(), false, 'Bundle symlinks are not allowed');
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectFiles(absolute);
    else if (entry.isFile()) files.set(path.relative(dist, absolute).split(path.sep).join('/'), await readFile(absolute));
  }
}
await collectFiles(dist);
assert.ok(files.has('index.html'), 'Bundle has no index.html');
const bundleCode = [...files].filter(([name]) => name.endsWith('.js')).map(([, bytes]) => bytes.toString('utf8')).join('\n');
for (const marker of ['preview-project', 'hd-preview-auth-v1:', 'hd-manager-local-db-v2-clean-preview', 'identity-unavailable-in-ui-preview', 'This UI preview cannot sign in.']) {
  assert.ok(bundleCode.includes(marker), `Refusing unverified/non-preview bundle: missing ${marker}`);
}
const digest = createHash('sha256');
for (const [name, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b))) digest.update(name).update('\0').update(bytes);
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
const output = path.join(resultsRoot, 'master-session-regression', runId);
await mkdir(output, { recursive: true });
const DB_KEY = 'hd-manager-local-db-v2-clean-preview';
const SESSION_KEY = 'hd-manager-session-v2';
const BOOT_KEY = `master-session-once-${runId}`;
const SEED_KEY = `master-session-seeded-${runId}`;
const fixture = structuredClone(seedData);
const date = new Date().toISOString().slice(0, 10);
const tenants = {};
for (const letter of ['A', 'B']) {
  const companyId = `comp_session_${letter.toLowerCase()}`;
  const ownerId = `emp_session_${letter.toLowerCase()}_owner`;
  const salesId = `emp_session_${letter.toLowerCase()}_sales`;
  const ownerPhone = letter === 'A' ? '0908111101' : '0908222201';
  fixture.companies[companyId] = { id: companyId, name: `Session ${letter} Company`, ownerPhone,
    status: 'trial', createdAt: date, autoBackupEnabled: false };
  fixture.employees[ownerId] = { id: ownerId, companyId, name: `Session ${letter} Owner`,
    phone: ownerPhone, role: 'owner', position: 'Chủ doanh nghiệp', startDate: date, isArchived: false };
  fixture.employees[salesId] = { id: salesId, companyId, name: `Session ${letter} Sales`,
    phone: letter === 'A' ? '0908111102' : '0908222202', role: 'employee', position: 'Kinh doanh', startDate: date, isArchived: false };
  tenants[letter] = { letter, companyId, ownerId, salesId };
  for (let i = 0; i < 60; i++) {
    const id = `session_${letter.toLowerCase()}_product_${i}`;
    fixture.products[id] = { id, companyId, name: `Session ${letter} Product ${String(i).padStart(2, '0')}`,
      category: `Session ${letter}`, unit: 'Kg', purchaseUnit: 'Kg', stockUnit: 'Kg',
      price: 50000, sellingPrice: 50000, costPrice: 30000, stock: 50, isArchived: false };
  }
  for (let i = 0; i < 30; i++) {
    const id = `session_${letter.toLowerCase()}_customer_${i}`;
    fixture.customers[id] = { id, companyId, empId: salesId, assignedEmployeeId: salesId,
      responsibleEmployeeId: salesId, name: `Session ${letter} Customer ${String(i).padStart(2, '0')}`,
      phone: `09${letter === 'A' ? '81' : '82'}${String(i).padStart(6, '0')}`, isArchived: false };
  }
  for (let i = 0; i < 60; i++) {
    const customerId = `session_${letter.toLowerCase()}_customer_${i % 30}`;
    const id = `session_${letter.toLowerCase()}_order_${i}`;
    fixture.orders[id] = { id, companyId, customerId, empId: salesId, date,
      amount: 250000, total: 250000, totalAmount: 250000, isArchived: false,
      items: [{ productId: `session_${letter.toLowerCase()}_product_${i}`, quantity: 5, billingQuantity: 5, unitPrice: 50000, amount: 250000 }] };
    const paymentId = `session_${letter.toLowerCase()}_payment_${i}`;
    fixture.payments[paymentId] = { id: paymentId, companyId, customerId, date, amount: 50000, isArchived: false };
  }
}

const report = {
  schemaVersion: 1, runId, dist, bundleSha256: digest.digest('hex'),
  runtime: 'Disposable loopback static preview; Firebase/identity mocks, NOT production, real credentials, Firestore rules or SDK offline acceptance',
  productionTarget5213: 'NEVER CONNECTED', startedAt: new Date().toISOString(),
  fixtureCounts: Object.fromEntries(Object.entries(fixture).map(([key, rows]) => [key, Object.keys(rows).length])),
  results: [], blockedRequests: [], serverRejectedRequests: [], pageErrors: [], consoleErrors: [], dialogs: [],
};
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon' };
const server = createServer((request, response) => {
  let name;
  try { name = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname).replace(/^\//, '') || 'index.html'; }
  catch { response.writeHead(400).end(); return; }
  if (!['GET', 'HEAD'].includes(request.method) || !files.has(name)) {
    report.serverRejectedRequests.push({ method: request.method, path: name });
    response.writeHead(404).end(); return;
  }
  response.writeHead(200, { 'Content-Type': types[path.extname(name)] || 'application/octet-stream',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(request.method === 'HEAD' ? undefined : files.get(name));
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address();
assert.notEqual(address.port, 5213);
const origin = `http://127.0.0.1:${address.port}`;
report.origin = origin;
let browser;
let activeCase = 'setup';
const contexts = new Set();
const readStore = page => page.evaluate(() => window.__readPreviewStore());
const scopedRows = (store, companyId) => Object.fromEntries(Object.entries(store).map(([collection, rows]) => [collection,
  Object.fromEntries(Object.entries(rows || {}).filter(([id, row]) => row?.companyId === companyId || (collection === 'companies' && id === companyId)))
]).filter(([, rows]) => Object.keys(rows).length));
async function check(id, task, scope = 'BOOTSTRAPPED_PREVIEW_ONLY') {
  activeCase = id;
  const errorsBefore = report.pageErrors.length;
  const contextsBefore = new Set(contexts);
  try {
    const evidence = await task();
    assert.equal(report.pageErrors.length, errorsBefore, 'Unexpected browser exception during this check');
    report.results.push({ id, status: 'PASS_PREVIEW', scope, evidence });
  } catch (error) {
    report.results.push({ id, status: 'FAIL', scope, error: error.stack || error.message });
  } finally {
    for (const context of contexts) {
      if (contextsBefore.has(context)) continue;
      await context.close().catch(() => {});
      contexts.delete(context);
    }
  }
  await writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
}
function blocked(id, reason, evidence = {}) {
  report.results.push({ id, status: 'BLOCKED', reason, evidence });
}
import { installPreviewReader } from '../tests/helpers/preview-browser-storage.mjs';

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true, serviceWorkers: 'block' });
  contexts.add(context);
  await context.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin && ['GET', 'HEAD'].includes(request.method()) && !url.pathname.startsWith('/api/')) return route.continue();
    report.blockedRequests.push({ case: activeCase, method: request.method(), origin: url.origin, path: url.pathname });
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket('**/*', socket => {
    report.blockedRequests.push({ case: activeCase, kind: 'websocket', url: socket.url().split('?')[0] });
    socket.close({ code: 1008, reason: 'Isolated static preview: no backend sockets' });
  });
  await context.addInitScript(({ origin, fixture, DB_KEY, SEED_KEY, BOOT_KEY }) => {
    if (location.origin !== origin) return;
    if (!sessionStorage.getItem(SEED_KEY)) {
      localStorage.setItem(DB_KEY, JSON.stringify(fixture));
      sessionStorage.setItem(SEED_KEY, '1');
    }
    // Explicit, consumed-once fixture bootstrap. Never inject on ordinary reload.
    const token = sessionStorage.getItem(BOOT_KEY);
    sessionStorage.removeItem(BOOT_KEY);
    if (token) window.__initial_auth_token = token;
  }, { origin, fixture, DB_KEY, SEED_KEY, BOOT_KEY });
  const page = await context.newPage();
  await installPreviewReader(page);
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => report.pageErrors.push({ case: activeCase, message: error.message }));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({ case: activeCase, message: message.text() }); });
  page.on('dialog', async dialog => {
    const expected = page.pendingRestoreDialog;
    const matched = Boolean(expected && dialog.type() === 'confirm' && /^Khôi phục \d+ bản ghi từ file sao lưu này\?/.test(dialog.message()));
    report.dialogs.push({ case: activeCase, type: dialog.type(), message: dialog.message(), matched, decision: matched ? expected : 'dismiss' });
    page.pendingRestoreDialog = null;
    if (matched && expected === 'accept') await dialog.accept();
    else await dialog.dismiss();
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await loginScreen(page);
  return page;
}
async function loginScreen(page) {
  await page.getByRole('button', { name: 'Vào Ứng Dụng', exact: true }).waitFor();
  assert.equal(await page.locator('[data-hd-shell="enterprise"]').count(), 0, 'Unauthenticated cached metadata must not grant a private shell');
}
async function bootstrap(page, tenant, role = 'owner') {
  const employee = fixture.employees[role === 'owner' ? tenant.ownerId : tenant.salesId];
  const claims = { uid: employee.id, identityId: employee.id, appUserId: employee.id,
    companyId: tenant.companyId, companyName: fixture.companies[tenant.companyId].name,
    accountType: 'employee', role: employee.role, name: employee.name, phone: employee.phone };
  await page.evaluate(({ key, token }) => sessionStorage.setItem(key, token), {
    key: BOOT_KEY, token: `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`,
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-hd-shell="enterprise"]').waitFor({ timeout: 60000 });
  await page.waitForFunction(({ key, employeeId, companyId }) => {
    const session = JSON.parse(localStorage.getItem(key) || 'null');
    return session?.currentUser?.id === employeeId && session?.currentUser?.companyId === companyId;
  }, { key: SESSION_KEY, employeeId: employee.id, companyId: tenant.companyId });
  assert.equal(await page.evaluate(key => sessionStorage.getItem(key), BOOT_KEY), null);
}
async function navigate(page, module, label) {
  await page.locator('[data-hd-navigation="sidebar"]').getByRole('button', { name: label, exact: true }).click();
  await page.locator(`main[data-hd-module="${module}"]`).waitFor();
}
async function logout(page) {
  const sidebar = page.locator('[data-hd-navigation="sidebar"]');
  const logoutButton = sidebar.getByRole('button', { name: 'Đăng xuất', exact: true });
  if (await logoutButton.isVisible()) await logoutButton.click();
  else {
    await navigate(page, 'more', 'Thêm');
    await page.locator('.hd-more-menu__logout').click();
  }
  await loginScreen(page);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), SESSION_KEY), null);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await loginScreen(page);
  assert.equal(await page.evaluate(() => typeof window.__initial_auth_token), 'undefined', 'Consumed fixture token must not resurrect logout');
}
async function showProduct(page, name) {
  await navigate(page, 'products', 'Sản phẩm');
  const search = page.getByPlaceholder('Tìm sản phẩm...');
  if (!await search.isVisible()) await page.locator('.hd-app-header').getByRole('button', { name: 'Tìm kiếm', exact: true }).last().click();
  await search.fill(name);
  await page.waitForFunction(name => {
    const rows = [...document.querySelectorAll('.hd-product-list__name')];
    return rows.length === 1 && rows[0].textContent.trim() === name;
  }, name);
}
async function createProduct(page, name, price) {
  await navigate(page, 'products', 'Sản phẩm');
  const previousIds = Object.keys((await readStore(page)).products);
  await page.locator('main').getByRole('button', { name: 'Thêm sản phẩm', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Tạo sản phẩm' });
  await form.getByRole('textbox', { name: 'Tên sản phẩm', exact: true }).fill(name);
  await form.getByLabel('Nhóm hàng', { exact: true }).fill('Session A');
  await form.getByRole('textbox', { name: 'Giá bán', exact: true }).fill(String(price));
  await form.getByRole('button', { name: 'Lưu', exact: true }).click();
  await form.waitFor({ state: 'hidden' });
  await page.waitForFunction(({ name, price }) => Object.values(window.__readPreviewStore().products)
    .some(row => row.name === name && row.sellingPrice === price), { DB_KEY, name, price });
  const previous = new Set(previousIds);
  const additions = Object.entries((await readStore(page)).products).filter(([id]) => !previous.has(id));
  assert.equal(additions.length, 1, 'Real UI create must persist exactly one new document');
  assert.equal(additions[0][1].name, name);
  assert.equal(additions[0][1].companyId, tenants.A.companyId);
  return additions[0][1];
}
async function backupPanel(page) {
  await navigate(page, 'settings', 'Cài đặt');
  const main = page.locator('main[data-hd-module="settings"]');
  const panel = main.locator('section').filter({ has: page.getByRole('heading', { name: 'Sao lưu / Khôi phục', exact: true }) });
  if (!await panel.isVisible()) await main.getByRole('button', { name: /^Sao lưu\/khôi phục/ }).click();
  await panel.waitFor();
  return panel;
}
async function uploadBackup(page, panel, file, decision) {
  const countBefore = report.dialogs.length;
  page.pendingRestoreDialog = decision;
  try {
    const chooserPromise = page.waitForEvent('filechooser');
    await panel.getByRole('button', { name: 'Khôi phục', exact: true }).click();
    await (await chooserPromise).setFiles(file);
    if (decision === 'accept') await panel.getByText(/^Đã khôi phục \d+ bản ghi\.$/).waitFor();
    else if (decision === 'dismiss') await panel.getByText('Đã hủy khôi phục dữ liệu.', { exact: true }).waitFor();
    else await panel.getByText(/File sao lưu không hợp lệ|Unexpected|JSON|Expected|không thể khôi phục/i).waitFor();
    const confirmations = report.dialogs.slice(countBefore);
    assert.equal(confirmations.length, decision ? 1 : 0);
    if (decision) assert.ok(confirmations[0].matched && confirmations[0].decision === decision);
  } finally { page.pendingRestoreDialog = null; }
}

try {
  browser = await chromium.launch({ executablePath: process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, args: ['--disable-background-networking', '--disable-component-update'] });
  await check('preview-login-capability-probe', async () => {
    const page = await newPage();
    // Valid UI input, NOT an invented valid preview identity credential.
    await page.getByPlaceholder('Số điện thoại', { exact: true }).fill(fixture.employees.emp_admin.phone);
    await page.getByPlaceholder('Mật khẩu', { exact: true }).fill('PreviewOnly123!');
    await page.getByRole('button', { name: 'Vào Ứng Dụng', exact: true }).click();
    const unavailable = page.getByText('This UI preview cannot sign in. Open the Firebase cloud app to use your account.', { exact: true });
    await unavailable.waitFor();
    await loginScreen(page);
    await page.screenshot({ path: path.join(output, 'preview-login-unavailable.png') });
    await page.context().close();
    return { credentialAccepted: false, fixtureBootstrapUsed: false, displayedError: 'identity-unavailable-in-ui-preview' };
  }, 'UNSUPPORTED_CAPABILITY_PROBE_NOT_AUTH_ACCEPTANCE');
  blocked('actual-credential-login-and-tenant-switch', 'Preview aliases identityLogin/identityLogout to blocked(). No preview identity credential verifier exists; no replacement API or production fallback supplied.', {
    source: 'vite.config.js identityCenterAlias; src/mocks/identity-center-vps.js identityLogin/identityLogout',
  });

  await check('ui-logout-one-shot-bootstrap-and-cached-session-gate', async () => {
    const page = await newPage();
    await bootstrap(page, tenants.A);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await loginScreen(page);
    assert.equal(await page.evaluate(() => typeof window.__initial_auth_token), 'undefined');
    assert.ok((await readStore(page)).products.session_a_product_0);
    await bootstrap(page, tenants.A);
    await logout(page);
    await page.context().close();
    return { cachedMetadataGrantsPrivateAccess: false, uiLogoutClearsAppSession: true, reloadDoesNotReinjectToken: true };
  });
  blocked('sdk-auth-session-persistence', 'Preview Firebase Auth setPersistence() is a no-op and authState is module memory. Reload recovery using token reinjection would be a false positive.', {
    source: 'src/mocks/firebase-auth.js authState/setPersistence/signInWithCustomToken',
  });

  await check('tenant-view-replacement-and-ui-rbac', async () => {
    const page = await newPage();
    for (const tenant of [tenants.A, tenants.B, tenants.A]) {
      await bootstrap(page, tenant);
      await navigate(page, 'products', 'Sản phẩm');
      await page.waitForFunction(prefix => {
        const names = [...document.querySelectorAll('.hd-product-list__name')].map(node => node.textContent.trim());
        return names.length === 50 && names.every(name => name.startsWith(prefix));
      }, `Session ${tenant.letter} Product `);
      assert.ok(await page.locator('main').getByRole('button', { name: 'Thêm sản phẩm', exact: true }).isVisible());
      await navigate(page, 'customers', 'Khách hàng');
      await page.waitForFunction(prefix => {
        const cards = [...document.querySelectorAll('[data-customer-card]')];
        return cards.length === 30 && cards.every(card => card.textContent.includes(prefix));
      }, `Session ${tenant.letter} Customer `);
      const foreign = tenant.letter === 'A' ? 'B' : 'A';
      assert.equal(await page.locator('main').getByText(new RegExp(`Session ${foreign} (?:Customer|Product)`)).count(), 0);
      await logout(page);
    }
    await bootstrap(page, tenants.A, 'sales');
    await navigate(page, 'customers', 'Khách hàng');
    await page.locator('[data-customer-card]').first().waitFor();
    const sidebar = page.locator('[data-hd-navigation="sidebar"]');
    for (const label of ['Sản phẩm', 'Cài đặt', 'Vai trò']) assert.equal(await sidebar.getByRole('button', { name: label, exact: true }).count(), 0, `Restricted sales fixture must not expose ${label}`);
    assert.equal(await page.getByRole('button', { name: 'Thêm sản phẩm', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Khôi phục', exact: true }).count(), 0);
    await page.screenshot({ path: path.join(output, 'restricted-sales-ui.png') });
    await logout(page);
    await page.context().close();
    return { sequence: ['A owner', 'logout', 'B owner', 'logout', 'A owner', 'logout', 'A sales'],
      bootstrapNotCredentialSwitch: true, checks: 'Positive tenant records, no foreign records, owner create visible, sales privileged navigation/actions absent' };
  });
  blocked('backend-tenant-isolation-and-rbac', 'Mock Firestore filters local queries but has no security-rule enforcement. Hidden UI controls do not prove SDK/API authorization.', {
    source: 'src/mocks/firebase-firestore.js createSnapshot/applySetDoc',
  });

  await check('real-preview-backup-download-and-restore', async () => {
    const page = await newPage();
    await bootstrap(page, tenants.A);
    const product = await createProduct(page, 'Session A Backup Product', 65001);
    let panel = await backupPanel(page);
    const downloadPromise = page.waitForEvent('download');
    await panel.getByRole('button', { name: 'Sao lưu', exact: true }).click();
    const download = await downloadPromise;
    const backupPath = path.join(output, 'tenant-a-downloaded-backup.json');
    await download.saveAs(backupPath);
    assert.equal(await download.failure(), null);
    const bytes = await readFile(backupPath);
    const backup = JSON.parse(bytes.toString('utf8'));
    assert.equal(backup.schemaVersion, 1);
    assert.equal(backup.sourceCompanyId, tenants.A.companyId);
    assert.equal(backup.appName, 'HD Manager');
    assert.ok(backup.collections.products.some(row => row.id === product.id && row.sellingPrice === 65001));
    const storeAtExport = await readStore(page);
    for (const [collection, rows] of Object.entries(backup.collections)) {
      assert.ok(Array.isArray(rows), 'Downloaded backup collections must be arrays');
      for (const row of rows) {
        assert.ok(collection === 'companies' ? row.id === tenants.A.companyId : row.companyId === tenants.A.companyId, `Foreign row in downloaded ${collection}`);
      }
      if (['products', 'customers', 'orders', 'payments', 'employees'].includes(collection)) {
        const expectedIds = Object.values(storeAtExport[collection] || {}).filter(row => row.companyId === tenants.A.companyId).map(row => row.id).sort();
        assert.deepEqual(rows.map(row => row.id).sort(), expectedIds, `Backup must include the full tenant ${collection} dataset`);
      }
    }
    const beforeRejectedRestore = await readStore(page);
    await uploadBackup(page, panel, { name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"broken":') }, null);
    assert.deepEqual(await readStore(page), beforeRejectedRestore, 'Malformed restore must not write any preview database collection');
    await uploadBackup(page, panel, backupPath, 'dismiss');
    assert.deepEqual(await readStore(page), beforeRejectedRestore, 'Cancelled restore must not write any preview database collection');
    await showProduct(page, product.name);
    await page.locator('.hd-product-list__primary').click();
    const edit = page.getByRole('dialog', { name: 'Sửa sản phẩm' });
    await edit.getByRole('textbox', { name: 'Giá bán', exact: true }).fill('70002');
    await edit.getByRole('button', { name: 'Lưu', exact: true }).click();
    await edit.waitFor({ state: 'hidden' });
    await page.waitForFunction(({ id }) => window.__readPreviewStore().products[id].sellingPrice === 70002, { DB_KEY, id: product.id });
    const retained = await createProduct(page, 'Session A Retained Product', 67003);
    const foreignBeforeRestore = scopedRows(await readStore(page), tenants.B.companyId);
    panel = await backupPanel(page);
    await uploadBackup(page, panel, backupPath, 'accept');
    await page.waitForFunction(({ id }) => {
      const row = window.__readPreviewStore().products[id];
      return row.sellingPrice === 65001 && Boolean(row.restoredAt);
    }, { DB_KEY, id: product.id });
    const restored = await readStore(page);
    for (const [collection, rows] of Object.entries(backup.collections)) {
      if (collection === 'companies') continue;
      for (const expected of rows) {
        const actual = restored[collection]?.[expected.id];
        assert.ok(actual, `Missing restored ${collection}/${expected.id}`);
        for (const [key, value] of Object.entries(expected)) assert.deepEqual(actual[key], value, `${collection}/${expected.id}/${key}`);
        assert.ok(actual.restoredAt);
      }
    }
    assert.deepEqual(restored.products[retained.id], retained, 'Restore merges; it must not delete newer local data');
    assert.deepEqual(scopedRows(restored, tenants.B.companyId), foreignBeforeRestore, 'Tenant A restore must leave every tenant B row unchanged');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await loginScreen(page);
    const recovered = await readStore(page);
    assert.deepEqual(recovered.products[product.id], restored.products[product.id]);
    assert.deepEqual(recovered.products[retained.id], retained);
    assert.deepEqual(scopedRows(recovered, tenants.B.companyId), foreignBeforeRestore);
    await bootstrap(page, tenants.A);
    await showProduct(page, product.name);
    await page.locator('.hd-product-list__primary').click();
    const reopened = page.getByRole('dialog', { name: 'Sửa sản phẩm' });
    assert.equal(Number((await reopened.getByRole('textbox', { name: 'Giá bán', exact: true }).inputValue()).replace(/\D/g, '')), 65001);
    await page.screenshot({ path: path.join(output, 'restored-product-reopened.png') });
    await page.context().close();
    return { downloadSha256: createHash('sha256').update(bytes).digest('hex'), suggestedFilename: download.suggestedFilename(),
      sourceCompanyId: backup.sourceCompanyId, collectionCounts: Object.fromEntries(Object.entries(backup.collections).map(([key, rows]) => [key, rows.length])),
      restoredProductId: product.id, retainedProductId: retained.id, malformedRestoreNoDatabaseWrites: true,
      cancelledRestoreNoDatabaseWrites: true, tenantBUnchanged: true, durableReload: true,
      reloadUiVerificationRequiredExplicitFixtureRebootstrap: true, crossCompanyBackupImportRejectionNotClaimed: true };
  });

  await check('mock-offline-write-and-durable-reload', async () => {
    const page = await newPage();
    await bootstrap(page, tenants.A);
    await navigate(page, 'products', 'Sản phẩm');
    await page.locator('.hd-product-list__item').first().waitFor();
    const foreignBefore = scopedRows(await readStore(page), tenants.B.companyId);
    await page.context().setOffline(true);
    assert.equal(await page.evaluate(() => navigator.onLine), false);
    const product = await createProduct(page, 'Session A Offline Product', 68004);
    const offlineReceipt = (await readStore(page)).products[product.id];
    assert.equal(offlineReceipt.sellingPrice, 68004);
    await page.context().setOffline(false);
    // Load application assets online; only the data write above was offline.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await loginScreen(page);
    assert.deepEqual((await readStore(page)).products[product.id], offlineReceipt);
    await bootstrap(page, tenants.A);
    await showProduct(page, product.name);
    assert.deepEqual(scopedRows(await readStore(page), tenants.B.companyId), foreignBefore);
    await page.context().close();
    return { navigatorOfflineDuringWrite: true, docId: product.id, mockLocalStorageReceipt: true,
      onlineAssetReloadPreservedOfflineWrite: true, offlineAssetBootNotTested: true,
      cloudQueueFlushNotTested: true, SDKCacheMetadataNotUsedAsEvidence: true };
  });
  blocked('sdk-offline-queue-and-cloud-reconciliation', 'Preview writes go straight to localStorage and snapshots always report fromCache=false/hasPendingWrites=false. No real SDK cache, network acknowledgement, offline asset boot or server reconciliation is represented.', {
    source: 'src/mocks/firebase-firestore.js persistStore/createSnapshot/createDocumentSnapshot',
  });
} catch (error) {
  report.results.push({ id: activeCase, status: 'FAIL', error: error.stack || error.message });
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  report.finishedAt = new Date().toISOString();
  report.status = report.results.some(row => row.status === 'FAIL') || report.pageErrors.length || report.dialogs.some(dialog => !dialog.matched) ? 'FAIL'
    : report.results.some(row => row.status === 'BLOCKED') ? 'INCOMPLETE' : 'PASS_PREVIEW';
  await writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, output, results: report.results.map(({ id, status }) => ({ id, status })) }, null, 2));
  process.exitCode = report.status === 'FAIL' ? 1 : report.status === 'INCOMPLETE' ? 2 : 0;
}
