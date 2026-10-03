import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { setTimeout as waitForDevice } from 'node:timers/promises';
import { build, preview } from 'vite';
import { chromium, _android } from 'playwright-core';
import { parseStringPromise } from 'xml2js';
import { runInteractionActionCases, measureSearchReadiness, waitForExactSearchResults, PRODUCT_COVERAGE_FIXTURE_VERSION, PRODUCT_COVERAGE_FIXTURES } from '../tests/visual/interaction-action-cases.mjs';
import { summarizeInteractionSamples } from './interaction-metrics.mjs';
import { ACCEPTANCE_PACKAGE, buildAcceptanceApk } from './android-acceptance-apk.mjs';
import { runNativeKeyboardAcceptance } from '../tests/visual/native-keyboard-acceptance.mjs';
import { runBoundedAudit } from './helpers/bounded-audit-process.mjs';
import { installPreviewReader } from '../tests/helpers/preview-browser-storage.mjs';

// Isolated UI measurements: never connect this fixture to cloud services.
const phase = process.argv[2] || 'before';
assert.match(phase, /^[a-z0-9-]+$/);
const output = path.resolve('test-results/full-interaction', phase);
if (process.env.HD_AUDIT_SUPERVISED !== '1') {
  const result = await runBoundedAudit({ script: process.argv[1], args: process.argv.slice(2), output,
    timeoutMs: process.env.HD_AUDIT_TOTAL_TIMEOUT_MS || 300000 });
  process.exit(result.code);
}
let deadlineCleanup = async () => {};
process.on('message', message => {
  if (message?.type !== 'audit-timeout') return;
  deadlineCleanup().finally(() => process.exit(124));
});
const reportAuditProgress = stage => { if (process.connected) process.send({ type: 'audit-progress', stage }); };
reportAuditProgress('build/setup');
const buildPhase = process.env.HD_AUDIT_BUILD_PHASE || phase;
assert.match(buildPhase, /^[a-z0-9-]+$/);
const buildOutput = path.resolve('test-results/full-interaction', buildPhase, 'app');
const actionsOnly = process.env.HD_AUDIT_ACTIONS_ONLY === '1';
const criticalOnly = process.env.HD_AUDIT_CRITICAL_ONLY === '1';
const masterFixtures = process.env.HD_AUDIT_MASTER_FIXTURES === '1';
const productLegacyPrecondition = process.env.HD_AUDIT_PRODUCT_LEGACY_PRECONDITION === '1';
const inventoryHistory = process.env.HD_AUDIT_INVENTORY_HISTORY === '1';
const inventoryHistoryMonth = process.env.HD_AUDIT_INVENTORY_MONTH || '2026-08';
const priceOnly = process.env.HD_AUDIT_PRICE_ONLY === '1';
const profileRender = process.env.HD_AUDIT_PROFILE_RENDER !== '0';
const useNative = process.env.HD_AUDIT_NATIVE === '1';
const useAndroid = process.env.HD_AUDIT_ANDROID === '1' || useNative;
const selectedModules = process.env.HD_AUDIT_MODULES?.split(',').filter(Boolean);
const profileModules = (process.env.HD_AUDIT_PROFILE_MODULES || 'payroll,pricing,finance').split(',');
const profileActions = (process.env.HD_AUDIT_PROFILE_ACTIONS || 'open').split(',');
if (criticalOnly) {
  assert.deepEqual(selectedModules, ['order_requests', 'warehouse_dispatch', 'delivery_reports']);
  assert.equal(process.env.HD_AUDIT_ACTION_MODULES, 'order_requests');
  assert.equal(process.env.HD_AUDIT_DISPATCH_STRESS, '1');
  assert.equal(process.env.HD_AUDIT_MASTER_FIXTURES, '1');
  assert.equal(process.env.HD_AUDIT_DISPATCH_SAVE, '1');
  assert.equal(process.env.HD_AUDIT_INCLUDE_ACTIONS, '1');
  assert.equal(actionsOnly, false);
}
if (inventoryHistory) {
  assert.equal(process.env.HD_AUDIT_REUSE_BUILD, '1', 'History acceptance must reuse an immutable preview build');
  assert.equal(actionsOnly, true, 'History acceptance is a dedicated run, not an addition to the default action suite');
  assert.deepEqual(selectedModules, ['warehouse_import']);
  assert.equal(process.env.HD_AUDIT_ACTION_MODULES, 'warehouse_import');
  assert.equal(process.env.HD_AUDIT_DISPATCH_STRESS, '1', 'History acceptance retains all 4300 dispatches and 4500 requests');
  assert.equal(masterFixtures, false, 'Keep history and master delivery fixture contracts separate');
  assert.equal(productLegacyPrecondition, false);
  assert.ok(process.env.HD_AUDIT_FIXED_DATE, 'History acceptance requires a fixed current date');
  assert.equal(useAndroid, false, 'History acceptance targets the paired CPU1/3/6 browser previews');
  assert.equal(process.env.HD_AUDIT_CPU_PROFILES, '1');
  assert.match(inventoryHistoryMonth, /^\d{4}-(0[1-9]|1[0-2])$/);
  const [historyYear, historyMonth] = inventoryHistoryMonth.split('-').map(Number);
  assert.equal(new Date(Date.UTC(historyYear, historyMonth, 0)).getUTCDate(), 31);
  assert.match(process.env.HD_AUDIT_FIXED_DATE, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(`${inventoryHistoryMonth}-31` < process.env.HD_AUDIT_FIXED_DATE, 'Use a completed historical month before the fixed current date');
}
await mkdir(output, { recursive: true });
Object.assign(process.env, {
  VITE_DATA_MODE: 'preview', VITE_ALLOW_PREVIEW_BUILD: 'true',
  VITE_PERFORMANCE_PROFILE: String(profileRender), VITE_PERFORMANCE_MONITOR: 'true',
  VITE_PERFORMANCE_LOG_LIMIT: '10000', VITE_HD_BUILD_ID: `interaction-${phase}`,
});
if (process.env.HD_AUDIT_REUSE_BUILD !== '1') {
  await build({ build: { outDir: buildOutput }, logLevel: 'warn' });
}
const server = await preview({ build: { outDir: buildOutput }, preview: { host: '127.0.0.1', port: 0 } });
const baseUrl = useNative ? 'https://localhost/?perfMonitor=1' : `http://127.0.0.1:${server.httpServer.address().port}/?perfMonitor=1`;
const claims = { uid: 'emp_admin', identityId: 'emp_admin', appUserId: 'emp_admin', companyId: 'comp_preview', accountType: 'employee', role: 'super_admin', name: 'Quản trị Demo', phone: '0909000001' };
const token = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
const fixedDate = process.env.HD_AUDIT_FIXED_DATE;
if (fixedDate) assert.match(fixedDate, /^\d{4}-\d{2}-\d{2}$/);
const day = fixedDate ? new Date(`${fixedDate}T12:00:00+07:00`) : new Date();
const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
const rows = (count, prefix, make) => Object.fromEntries(Array.from({ length: count }, (_, i) => {
  const id = `${prefix}_${i}`;
  return [id, { id, companyId: 'comp_preview', ...make(i) }];
}));
const fixture = {
  products: rows(600, 'p_perf', i => ({ name: `Sản phẩm ${String(i).padStart(4, '0')}`, category: 'Hàng thử', unit: 'kg', purchaseUnit: 'kg', stockUnit: 'kg', costPrice: 30000, price: 50000, sellingPrice: 50000, stock: 50, isArchived: false })),
  customers: rows(360, 'c_perf', i => ({ name: `Khách hàng ${i}`, empId: 'emp_sales_01', phone: `0900${String(i).padStart(6, '0')}`, isArchived: false })),
  orders: rows(1800, 'o_perf', i => ({ customerId: `c_perf_${i % 360}`, empId: 'emp_sales_01', date, amount: 250000, total: 250000, totalAmount: 250000, items: [{ productId: `p_perf_${i % 600}`, quantity: 5, billingQuantity: 5, unitPrice: 50000, amount: 250000 }] })),
  payments: rows(900, 'pay_perf', i => ({ customerId: `c_perf_${i % 360}`, date, amount: 50000 })),
  orderRequests: {
    or_save_speed: { id: 'or_save_speed', companyId: 'comp_preview', customerId: 'c_preview_01', salesEmpId: 'emp_sales_01', empId: 'emp_sales_01', date, createdAt: `${date}T08:00:00+07:00`, totalQuantity: 2, totalAmount: 570000, items: [{ productId: 'prod_preview_01', description: 'Nước giặt HD', quantity: 2, quantityUnit: 'Can', orderUnit: 'Can', actualUnit: 'Can', billingUnit: 'Can', pricingUnit: 'Can', billingQuantity: 2, unitPrice: 285000, amount: 570000, lineTotal: 570000 }] },
  },
};
if (process.env.HD_AUDIT_DISPATCH_STRESS === '1') {
  fixture.orderRequests = rows(4500, 'request_perf', i => ({
    customerId: `c_perf_${i % 360}`, date, createdAt: `${date}T08:00:00+07:00`,
    items: [{ productId: `p_perf_${i % 600}`, quantity: 5, quantityUnit: 'Kg',
      actualUnit: 'Kg', billingUnit: 'Kg', billingQuantity: 5, unitPrice: 50000, amount: 250000 }],
  }));
  fixture.warehouseDispatches = rows(4300, 'dispatch_perf', i => ({
    customerId: `c_perf_${i % 360}`, productId: `p_perf_${i % 600}`,
    date, createdAt: `${date}T09:00:00+07:00`, quantity: 5, quantityUnit: 'Kg',
    weightKg: 5, assignedDriverId: 'emp_driver_01',
    sourceOrderRequestId: `request_perf_${i}`,
  }));
}
if (actionsOnly || process.env.HD_AUDIT_INCLUDE_ACTIONS === '1') {
  fixture.customers.c_preview_01 = {
    id: 'c_preview_01', companyId: 'comp_preview', empId: 'emp_sales_01',
    name: 'Cửa hàng Lan Anh', phone: '0911222333', isArchived: false,
    customerProductIds: ['prod_preview_01', 'p_perf_0'],
  };
}
const deliveryFixtures = [];
if (masterFixtures) {
  fixture.warehouseDispatches ||= {};
  for (let iteration = 1; iteration <= 3; iteration++) {
    const customerId = `c_master_delivery_${iteration}`;
    const requestId = `request_master_delivery_${iteration}`;
    const dispatchId = `dispatch_master_delivery_${iteration}`;
    const productId = `p_perf_${iteration}`;
    const customerName = `Audit delivery customer ${iteration}`;
    const phone = `091900000${iteration}`;
    const productName = fixture.products[productId].name;
    const rowKey = `master_delivery_line_${iteration}`;
    const billing = {
      productId, productNameSnapshot: productName, quantity: 5, quantityUnit: 'Kg',
      actualQuantity: 5, actualUnit: 'Kg', actualWeightKg: 5, weightKg: 5,
      billingUnit: 'Kg', pricingUnit: 'Kg', billingQuantity: 5, pricingQuantity: 5,
      unitPrice: 50000, amount: 250000, lineTotal: 250000,
      billingSnapshotVersion: 1, billingSnapshotValid: true,
      billingSnapshotSource: 'audit_master_fixture',
    };
    fixture.customers[customerId] = {
      id: customerId, companyId: claims.companyId, empId: 'emp_sales_01',
      name: customerName, phone, isArchived: false,
    };
    fixture.orderRequests[requestId] = {
      id: requestId, companyId: claims.companyId, customerId, date,
      empId: 'emp_sales_01', salesEmpId: 'emp_sales_01', isArchived: false,
      createdAt: `${date}T08:00:00+07:00`, totalQuantity: 5, totalAmount: 250000,
      items: [{ ...billing, rowKey, description: productName }],
    };
    fixture.warehouseDispatches[dispatchId] = {
      ...billing, id: dispatchId, companyId: claims.companyId, customerId,
      customerNameSnapshot: customerName, date, createdAt: `${date}T09:00:00+07:00`,
      isArchived: false, assignedDriverId: 'emp_driver_01',
      sourceOrderRequestId: requestId, sourceOrderRequestDate: date,
      sourceOrderRequestRowKey: `${requestId}_${rowKey}`,
      sourceOrderRequestUnitPrice: 50000,
    };
    deliveryFixtures.push({ customerId, customerName, phone, dispatchId, requestId,
      productId, productName, companyId: claims.companyId, date, weightKg: 5,
      quantity: 5, unitPrice: 50000 });
  }
}
let inventoryHistoryFixture = null;
if (inventoryHistory) {
  const month = inventoryHistoryMonth;
  assert.match(month, /^\d{4}-(0[1-9]|1[0-2])$/);
  const [year, monthNumber] = month.split('-').map(Number);
  assert.equal(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate(), 31, 'History fixture requires a complete 31-day month');
  assert.ok(`${month}-31` < date, 'Use a completed historical month before the fixed current date');
  const dates = Array.from({ length: 31 }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  for (let i = 0; i < 4500; i++) {
    const request = fixture.orderRequests[`request_perf_${i}`];
    request.date = dates[i % 31];
    request.createdAt = `${request.date}T08:00:00+07:00`;
  }
  for (let i = 0; i < 4300; i++) {
    const dispatch = fixture.warehouseDispatches[`dispatch_perf_${i}`];
    dispatch.date = dates[i % 31];
    dispatch.createdAt = `${dispatch.date}T09:00:00+07:00`;
    dispatch.sourceOrderRequestDate = dispatch.date;
    const request = fixture.orderRequests[dispatch.sourceOrderRequestId];
    assert.equal(request.date, dispatch.date);
    assert.equal(request.customerId, dispatch.customerId);
    assert.equal(request.items[0].productId, dispatch.productId);
  }
  // Imports establish visible groups; dispatch-only groups are excluded by the real stock UI.
  fixture.warehouseImports ||= {};
  const groups = ['Hàng thử', 'Audit history control'];
  for (let dayIndex = 0; dayIndex < 31; dayIndex++) {
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
      const id = `import_history_${dayIndex}_${groupIndex}`;
      assert.equal(fixture.warehouseImports[id], undefined);
      fixture.warehouseImports[id] = {
        id, companyId: claims.companyId, date: dates[dayIndex],
        createdAt: `${dates[dayIndex]}T07:00:00+07:00`, isArchived: false,
        groupName: groups[groupIndex], quantityUnit: 'Con',
        totalKg: (groupIndex ? 300 : 100) + dayIndex + 1,
        quantity: groupIndex ? 10 + dayIndex + 1 : 2 + (dayIndex + 1) % 3,
        sourceType: 'purchase_resale', supplier: 'Audit history supplier',
        unitPrice: 20000, amount: ((groupIndex ? 300 : 100) + dayIndex + 1) * 20000,
        note: 'Isolated inventory history fixture v1',
      };
    }
  }
  assert.equal(Object.keys(fixture.warehouseDispatches).length, 4300);
  assert.equal(Object.keys(fixture.orderRequests).length, 4500);
  // Independent arithmetic oracle, not a call into business stock helpers.
  const expectedStock = dates.map((dateKey, index) => {
    const days = index + 1;
    const exportedKg = 5 * (138 * days + Math.min(days, 22));
    const importedKg = 100 * days + days * (days + 1) / 2;
    const importedCon = Array.from({ length: days }, (_, i) => 2 + (i + 1) % 3).reduce((sum, value) => sum + value, 0);
    const controlKg = 300 * days + days * (days + 1) / 2;
    const controlCon = 10 * days + days * (days + 1) / 2;
    return { date: dateKey, groups: [
      { name: groups[0], measures: [
        { unit: 'Con', imported: importedCon, exported: 0, remaining: importedCon },
        { unit: 'Kg', imported: importedKg, exported: exportedKg, remaining: importedKg - exportedKg },
      ] },
      { name: groups[1], measures: [
        { unit: 'Con', imported: controlCon, exported: 0, remaining: controlCon },
        { unit: 'Kg', imported: controlKg, exported: 0, remaining: controlKg },
      ] },
    // Neither generic fixture group has a warning in the original UI; ties sort by label.
    ].sort((a, b) => a.name.localeCompare(b.name, 'vi')) };
  });
  inventoryHistoryFixture = { version: 1, month, dates, currentDate: date, groups, expectedStock,
    counts: { dispatches: 4300, requests: 4500, addedImports: 62 },
    unavailable: { monthlyCalculation: 'The immutable BEFORE and current WarehouseImportView expose only import/export/stock tabs; report/monthly controls are unreachable' },
  };
  await writeFile(path.join(output, 'inventory-history-fixture-v1.json'), JSON.stringify(inventoryHistoryFixture, null, 2));
}
const routes = [
  ['executive_dashboard', 'Điều hành'],
  ['home', 'Trang chủ'], ['order_requests', 'Lên đơn đặt hàng', 'Đặt hàng'],
  ['orders', 'Đơn hàng'], ['warehouse_dispatch', 'Xuất kho'],
  ['warehouse_import', 'Nhập Xuất Tồn'], ['delivery_reports', 'Báo cáo giao hàng'],
  ['products', 'Kho sản phẩm'], ['customers', 'Khách hàng'], ['debt', 'Sổ nợ'],
  ['finance', 'Thu chi'], ['bank_payments', 'Ngân hàng'], ['messages', 'Tin nhắn'],
  ['pricing', 'Giá cả'], ['company_attendance', 'Chấm công'], ['employee_reviews', 'Đánh giá'],
  ['asset_management', 'Quản lý tài sản'], ['payroll', 'Bảng lương'], ['employees', 'Nhân sự'],
  ['price_quotes', 'Báo giá hàng loạt'], ['settings', 'Cài đặt'], ['role_permissions', 'Vai trò'], ['billing', 'Gói cước'],
];
const samples = [];
const failures = [];
const errors = [];
const observations = [];
const device = useAndroid ? (await _android.devices()).find(device => device.serial().startsWith('emulator-')) : null;
if (useAndroid) assert.ok(device, 'An authorized Android emulator is required; never select a physical device implicitly');
const adb = process.env.HD_MANAGER_ADB || 'D:/HD-DEV/android/sdk/platform-tools/adb.exe';
const port = String(server.httpServer.address().port);
let debugPort = '';
let reversed = false;
let browser;
async function nativeDebugSocket(serial) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    let pid = '';
    try {
      pid = execFileSync(adb, ['-s', serial, 'shell', 'pidof', ACCEPTANCE_PACKAGE], { encoding: 'utf8' }).trim();
    } catch (error) {
      if (error.status !== 1) throw error;
    }
    if (/^\d+$/.test(pid)) {
      const socket = `webview_devtools_remote_${pid}`;
      const sockets = execFileSync(adb, ['-s', serial, 'shell', 'cat', '/proc/net/unix'], { encoding: 'utf8' });
      if (sockets.includes(`@${socket}`)) return socket;
    }
    // Startup readiness only, before any interaction timing begins.
    await waitForDevice(100);
  }
  throw new Error('Acceptance APK did not expose its WebView debug target within 15 seconds');
}
async function readyNativePage(browser) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const page = browser.contexts().flatMap(context => context.pages())
      .find(candidate => !candidate.isClosed() && candidate.url().startsWith('https://localhost'));
    if (page) {
      try {
        await page.locator('[data-hd-shell="enterprise"]').waitFor({ timeout: 1000 });
        if (!page.isClosed()) return page;
      } catch (error) {
        if (!page.isClosed() && !error.message.includes('Timeout')) throw error;
      }
    }
    await waitForDevice(100);
  }
  throw new Error('Installed acceptance APK did not expose a ready app page within 30 seconds');
}
try {
  if (device) {
    let socket = 'chrome_devtools_remote';
    if (useNative) {
      const apk = await buildAcceptanceApk({ buildOutput, output, fixture, token });
      execFileSync(adb, ['-s', device.serial(), 'install', '-r', apk], { stdio: 'inherit' });
      execFileSync(adb, ['-s', device.serial(), 'shell', 'am', 'force-stop', ACCEPTANCE_PACKAGE]);
      execFileSync(adb, ['-s', device.serial(), 'shell', 'am', 'start', '-W', '-n', `${ACCEPTANCE_PACKAGE}/com.hdmanager.app.MainActivity`], { stdio: 'inherit' });
      socket = await nativeDebugSocket(device.serial());
    } else {
      execFileSync(adb, ['-s', device.serial(), 'reverse', `tcp:${port}`, `tcp:${port}`]);
      reversed = true;
    }
    debugPort = execFileSync(adb, ['-s', device.serial(), 'forward', 'tcp:0', `localabstract:${socket}`], { encoding: 'utf8' }).trim();
  }
  browser = device ? await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`) : await chromium.launch({ executablePath: process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  deadlineCleanup = async () => { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); };
  let viewports = device ? [{ name: useNative ? 'android-apk-webview' : 'android-emulator' }]
    : process.env.HD_AUDIT_CPU_PROFILES === '1'
      ? [{ name: 'cpu-low-6x', width: 390, height: 844, cpuRate: 6 }, { name: 'cpu-mid-3x', width: 390, height: 844, cpuRate: 3 }, { name: 'cpu-high-1x', width: 1366, height: 900, cpuRate: 1 }]
      : [{ name: 'mobile', width: 390, height: 844 }, { name: 'desktop', width: 1366, height: 900 }];
  if (process.env.HD_AUDIT_CPU_RATES) {
    assert.ok(!device && process.env.HD_AUDIT_CPU_PROFILES === '1', 'CPU rate selection requires desktop CPU profiles');
    const rates = process.env.HD_AUDIT_CPU_RATES.split(',').map(Number);
    assert.ok(rates.length && rates.every(rate => [1, 3, 6].includes(rate)), 'CPU rates must be 1, 3 or 6');
    viewports = viewports.filter(viewport => rates.includes(viewport.cpuRate));
  }
  for (const viewport of viewports) {
    reportAuditProgress(`${viewport.name}: setup`);
    const nativePage = useNative ? await readyNativePage(browser) : null;
    const context = nativePage?.context() || (device ? browser.contexts()[0] : await browser.newContext({ viewport }));
    const page = nativePage || await context.newPage();
    assert.ok(page, 'Native WebView target is required');
    if (viewport.cpuRate) {
      const cpuSession = await context.newCDPSession(page);
      await cpuSession.send('Emulation.setCPUThrottlingRate', { rate: viewport.cpuRate });
    }
    const actionTimeout = Number(process.env.HD_AUDIT_ACTION_TIMEOUT_MS || 7000);
    assert.ok(Number.isFinite(actionTimeout) && actionTimeout >= 7000 && actionTimeout <= 60000);
    page.setDefaultTimeout(actionTimeout);
    page.on('pageerror', error => {
      errors.push({ viewport: viewport.name, message: error.message, stack: error.stack });
      console.log(`PAGE ERROR: ${error.message}`);
    });
    let confirmations = 0;
    page.on('dialog', async dialog => {
      try {
        confirmations++;
        if (!useNative) { await dialog.accept(); return; }
        // CDP resolves WebView's JS dialog but can leave its native window visible.
        // Tap the actual Android button; these samples include UI-automation cost.
        execFileSync(adb, ['-s', device.serial(), 'shell', 'uiautomator', 'dump', '/sdcard/hd-acceptance-ui.xml']);
        const xml = execFileSync(adb, ['-s', device.serial(), 'shell', 'cat', '/sdcard/hd-acceptance-ui.xml'], { encoding: 'utf8' });
        const tree = await parseStringPromise(xml);
        const findButton = nodes => {
          for (const node of nodes || []) {
            if (node.$?.['resource-id'] === 'android:id/button1' && node.$?.package === ACCEPTANCE_PACKAGE) return node.$;
            const nested = findButton(node.node);
            if (nested) return nested;
          }
          return null;
        };
        const button = findButton(tree.hierarchy.node);
        assert.ok(button, 'Actual Android confirmation button must be present');
        const bounds = button.bounds.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
        assert.ok(bounds, 'Native confirmation must have valid bounds');
        const [, x1, y1, x2, y2] = bounds.map(Number);
        execFileSync(adb, ['-s', device.serial(), 'shell', 'input', 'tap', String(Math.round((x1 + x2) / 2)), String(Math.round((y1 + y2) / 2))]);
      } catch (error) {
        errors.push({ viewport: viewport.name, message: `Native confirmation: ${error.message}` });
      }
    });
    await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseUrl).origin ? route.continue() : route.abort());
    const simulatedDispatchOperations = [];
    if (process.env.HD_AUDIT_DISPATCH_SAVE === '1') await page.route('**/inventoryAtomicOperation', async route => {
      const operation = route.request().postDataJSON();
      assert.equal(operation.operationType, 'OUTBOUND');
      assert.equal(operation.document.companyId, claims.companyId);
      assert.ok(operation.clientMutationId);
      assert.equal(operation.movements.length, 1);
      assert.equal(operation.movements[0].quantity, 12.5 + simulatedDispatchOperations.length);
      simulatedDispatchOperations.push(operation);
      // Simulated confirmation latency, never a real inventory mutation.
      await waitForDevice(120);
      await route.fulfill({ json: { success: true, data: { operationId: `audit-${operation.documentId}`, documentId: operation.documentId, duplicate: false } } });
    });
    await installPreviewReader(page);
    await page.addInitScript(({ token, fixture, fixedDate }) => {
      if (fixedDate) {
        const NativeDate = Date;
        const started = NativeDate.now();
        const base = new NativeDate(`${fixedDate}T12:00:00+07:00`).getTime();
        window.Date = class extends NativeDate {
          constructor(...args) { super(...(args.length ? args : [base + NativeDate.now() - started])); }
          static now() { return base + NativeDate.now() - started; }
        };
      }
      window.__initial_auth_token = token;
      if (!sessionStorage.getItem('perf-seeded')) {
        localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify(fixture));
        sessionStorage.setItem('perf-seeded', '1');
      }
    }, { token, fixture, fixedDate });
    if (process.env.HD_AUDIT_STORAGE_PROFILE === '1') await page.addInitScript(() => {
      window.__hdStorageSamples = [];
      const record = (kind, start, chars = 0, key = '') => {
        window.__hdStorageSamples.push({ kind, start, ms: performance.now() - start, chars,
          owner: key === 'hd-manager-local-db-v2-clean-preview' ? 'preview-db' : 'other' });
      };
      for (const method of ['stringify', 'parse']) {
        const original = JSON[method];
        JSON[method] = function (...args) {
          const start = performance.now();
          try { return original.apply(this, args); }
          finally { record(method, start); }
        };
      }
      for (const method of ['setItem', 'getItem']) {
        const original = Storage.prototype[method];
        Storage.prototype[method] = function (...args) {
          const start = performance.now();
          try { return original.apply(this, args); }
          finally { record(method, start, method === 'setItem' ? String(args[1]).length : 0, String(args[0])); }
        };
      }
    });
    if (criticalOnly) await page.addInitScript(() => {
      window.__hdReactPhases = [];
      const stamp = console.timeStamp.bind(console);
      console.timeStamp = (...args) => {
        const [name, start, end] = args;
        if (/^(Commit|Remaining Effects|Render)/.test(name) && typeof start === 'number' && typeof end === 'number') {
          window.__hdReactPhases.push({ name, start, end, ms: end - start });
          if (window.__hdReactPhases.length > 2000) window.__hdReactPhases.shift();
        }
        return stamp(...args);
      };
    });
    if (process.env.HD_AUDIT_TRACE_EVENTS === '1') await page.addInitScript(() => {
      window.__hdAuditEvents = [];
      for (const type of ['pointerdown', 'pointerup', 'mousedown', 'click', 'focusin', 'focusout']) document.addEventListener(type, event => {
        window.__hdAuditEvents.push({
          type, trusted: event.isTrusted, detail: event.detail, time: performance.now(),
          tag: event.target.tagName, text: event.target.closest('button')?.textContent,
          placeholder: event.target.getAttribute('placeholder'),
          focused: document.activeElement?.getAttribute('placeholder'),
          visualHeight: visualViewport.height, innerHeight,
          targetBounds: event.target.getBoundingClientRect().toJSON(),
          modalHeight: document.documentElement.style.getPropertyValue('--hd-modal-viewport-height'),
          maxTouchPoints: navigator.maxTouchPoints, coarse: matchMedia('(pointer: coarse)').matches,
        });
        if (window.__hdAuditEvents.length > 200) window.__hdAuditEvents.shift();
      }, true);
      window.addEventListener('resize', () => requestAnimationFrame(() => requestAnimationFrame(() => {
        window.__hdAuditEvents.push({ type: 'viewport-resize', time: performance.now(),
          width: innerWidth, innerHeight, visualHeight: visualViewport.height,
          maxTouchPoints: navigator.maxTouchPoints, coarse: matchMedia('(pointer: coarse)').matches,
          appHeight: document.documentElement.style.getPropertyValue('--hd-viewport-height'),
          modalHeight: document.documentElement.style.getPropertyValue('--hd-modal-viewport-height') });
        if (window.__hdAuditEvents.length > 200) window.__hdAuditEvents.shift();
      })));
    });
    const loadStarted = performance.now();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-hd-shell="enterprise"]').waitFor({ timeout: 30000 });
    await page.waitForFunction(() => (window.hdPerformanceMonitor?.subscriptions().length || 0) >= 3);
    if (process.env.HD_AUDIT_OBSERVE_EXTRA === '1') {
      const readyMs = performance.now() - loadStarted;
      observations.push({ viewport: viewport.name, kind: 'startup', readyMs, ...await page.evaluate(() => ({
        scope: 'Preview shell plus three mock subscriptions; NOT production interactive readiness',
        navigation: performance.getEntriesByType('navigation').map(entry => entry.toJSON()),
        resources: performance.getEntriesByType('resource').map(entry => ({ name: entry.name.split('/').at(-1), duration: entry.duration, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize })),
        heapBytes: performance.memory?.usedJSHeapSize ?? null,
      })) });
    }
    const measure = async (module, action, perform, expected, iteration) => {
      if (criticalOnly && !['save_create', 'save_dispatch_local_receipt', 'open'].includes(action)) {
        await perform();
        await page.waitForFunction(({ selector, mode, value }) => {
          const nodes = [...document.querySelectorAll(selector)].filter(node => node.getClientRects().length);
          return mode === 'hidden' ? !nodes.length : mode === 'value'
            ? nodes.some(node => node.value === value) : nodes.length > 0;
        }, expected, { timeout: 10000 });
        return;
      }
      reportAuditProgress(`${viewport.name}/${module}/${action} #${iteration}`);
      const confirmationsBefore = confirmations;
      const profileSession = profileActions.includes(action) && (iteration === 1 || process.env.HD_AUDIT_PROFILE_EVERY_SAMPLE === '1') && profileModules.includes(module)
        ? await context.newCDPSession(page) : null;
      if (profileSession) {
        await profileSession.send('Profiler.enable');
        await profileSession.send('Performance.enable');
        await profileSession.send('Profiler.start');
      }
      await page.evaluate(({ module, action, expected }) => {
        const monitor = window.hdPerformanceMonitor;
        monitor.clear();
        const id = monitor.beginInteraction(action, module);
        window.__auditResult = null;
        let started = false;
        let completed = false;
        let cancelled = false;
        let inputPaintPending = false;
        let inputPaintTimeMs = null;
        let frame = null;
        const observer = new MutationObserver(check);
        const visibleNodes = selector => [...document.querySelectorAll(selector)]
          .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
        const exactListMatches = () => {
          const labels = visibleNodes(expected.selector).map(node => node.textContent.trim());
          return labels.length === expected.values.length && labels.every((label, index) => label === expected.values[index]);
        };
        const inputMatches = () => visibleNodes(expected.inputPaint.selector).some(node => node.value === expected.inputPaint.value);
        const poll = () => { frame = requestAnimationFrame(() => { frame = null; check(); }); };
        function check() {
          if (!started || completed) return;
          if (expected.inputPaint && inputPaintTimeMs === null && !inputPaintPending && inputMatches()) {
            inputPaintPending = true;
            requestAnimationFrame(() => requestAnimationFrame(() => {
              if (cancelled) return;
              inputPaintPending = false;
              if (inputMatches()) inputPaintTimeMs = performance.now();
              check();
            }));
          }
          // Property-only input updates need frame polling; MutationObserver still catches delayed lists.
          if (expected.mode === 'exact-list' && frame === null) poll();
          if (expected.persisted) {
            const requirement = expected.persisted;
            let value = window.__readPreviewStore()?.[requirement.collection]?.[requirement.id];
            for (const key of requirement.path) value = value?.[key];
            if (Number(value) !== requirement.value) return;
          }
          const nodes = [...document.querySelectorAll(expected.selector)];
          const visible = nodes.filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
          const match = expected.mode === 'hidden' ? visible.length === 0
            : expected.mode === 'value' ? visible.some(node => node.value === expected.value)
              : expected.mode === 'text' ? visible.some(node => node.textContent.includes(expected.value))
                : expected.mode === 'exact-list' ? exactListMatches()
                : visible.length > 0;
          if (!match) return;
          if (expected.inputPaint && !inputMatches()) return;
          completed = true;
          if (expected.mode !== 'exact-list') {
            observer.disconnect();
            window.removeEventListener('hd-performance-event', onEvent);
          }
          const observed = performance.now();
          requestAnimationFrame(() => requestAnimationFrame(() => {
            if (cancelled) return;
            if (expected.mode === 'exact-list' && (!exactListMatches() || (expected.inputPaint && (inputPaintTimeMs === null || !inputMatches())))) {
              completed = false;
              check();
              return;
            }
            observer.disconnect();
            if (frame !== null) cancelAnimationFrame(frame);
            window.removeEventListener('hd-performance-event', onEvent);
            const result = monitor.finishInteraction('expected_ui_observed', id);
            // A timed-out action may complete after cleanup or a new measurement.
            if (!result) return;
            window.__auditResult = { ...result.detail, uiObservedTimeMs: observed, events: monitor.events(), subscriptions: monitor.subscriptions(),
              reactPhases: window.__hdReactPhases?.filter(sample => sample.start >= result.detail.startTimeMs && sample.start <= result.detail.endTimeMs),
              ...(expected.inputPaint ? { inputPaintTimeMs, resultReadyTimeMs: observed, measurementContract: 'search-readiness-v1' } : {}),
              storage: window.__hdStorageSamples?.filter(sample => sample.start >= result.detail.startTimeMs && sample.start <= result.detail.endTimeMs) };
          }));
        }
        function onEvent(event) {
          if (event.detail.type !== 'interaction.event') return;
          started = true;
          queueMicrotask(check);
          requestAnimationFrame(check);
        }
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
        window.addEventListener('hd-performance-event', onEvent);
        window.__auditCleanup = () => { cancelled = true; completed = true; observer.disconnect(); if (frame !== null) cancelAnimationFrame(frame); window.removeEventListener('hd-performance-event', onEvent); monitor.finishInteraction('failed', id); };
      }, { module, action, expected });
      try {
        const cpuBefore = profileSession ? await profileSession.send('Performance.getMetrics') : null;
        await perform();
        await page.waitForFunction(() => window.__auditResult, null, { timeout: Math.max(10000, actionTimeout) });
        const result = await page.evaluate(() => window.__auditResult);
        if (profileSession) {
          const after = await profileSession.send('Performance.getMetrics');
          const before = new Map(cpuBefore.metrics.map(metric => [metric.name, metric.value]));
          result.cpuEnvelope = Object.fromEntries(after.metrics
            .filter(metric => ['ScriptDuration', 'TaskDuration', 'LayoutDuration', 'RecalcStyleDuration'].includes(metric.name))
            .map(metric => [metric.name, (metric.value - before.get(metric.name)) * 1000]));
          result.cpuEnvelope.scope = 'Automation action envelope; includes browser automation and work after UI readiness, not isolated business CPU';
        }
        const record = { viewport: viewport.name, module, action, iteration, ...result,
          nativeConfirmationIncludesAutomation: useNative && confirmations > confirmationsBefore };
        samples.push(record);
        if (expected.inputPaint) {
          assert.ok(result.inputPaintTimeMs >= result.startTimeMs && result.inputPaintTimeMs <= result.endTimeMs);
          const paint = { ...record, action: expected.inputPaint.action, endTimeMs: result.inputPaintTimeMs,
            totalMs: Math.round((result.inputPaintTimeMs - result.startTimeMs) * 100) / 100,
            uiObservedTimeMs: result.inputPaintTimeMs, pairedAction: action,
            storage: record.storage?.filter(sample => sample.start <= result.inputPaintTimeMs),
            events: record.events.filter(event => event.msSinceOpen <= result.inputPaintTimeMs + 1),
            milestoneScope: 'Input value plus two animation-frame opportunities; not compositor paint' };
          samples.push(paint);
          observations.push({ viewport: viewport.name, module, kind: 'search-readiness', iteration,
            interactionId: result.interactionId, inputPaintAction: paint.action, resultReadyAction: action,
            inputPaintMs: paint.totalMs, resultReadyMs: result.totalMs,
            resultCount: expected.values.length, measurementContract: 'search-readiness-v1' });
        }
        console.log(`${viewport.name} ${module}.${action} #${iteration}: ${result.totalMs}ms`);
        return result;
      } catch (error) {
        await page.evaluate(() => window.__auditCleanup?.());
        await writeFile(path.join(output, `${viewport.name}-${action}-failure.txt`), await page.locator('body').innerText());
        throw error;
      } finally {
        if (profileSession) {
          const { profile } = await profileSession.send('Profiler.stop');
          await writeFile(path.join(output, `${viewport.name}-${module}-${action}-${iteration}.cpuprofile`), JSON.stringify(profile));
          await profileSession.detach();
        }
      }
    };
    const navigate = async (route, measured = false, iteration = 0) => {
      const [module, label, bottomLabel] = routes.find(row => row[0] === route) || [route, 'Thêm'];
      const nav = page.locator('[data-hd-navigation="bottom"]');
      if (!await nav.isVisible() && await page.getByRole('button', { name: 'Quay lại', exact: true }).first().isVisible()) {
        await page.getByRole('button', { name: 'Quay lại', exact: true }).first().click();
        // Attendance has its own internal back stack before returning to the shell.
        if (!await nav.isVisible() && await page.locator('.attendance-workspace').isVisible()) {
          await page.getByRole('button', { name: 'Quay lại', exact: true }).first().click();
        }
      }
      await nav.waitFor();
      let button = nav.getByRole('button', { name: bottomLabel || label, exact: true });
      if (!await button.isVisible().catch(() => false)) {
        await nav.getByRole('button', { name: 'Thêm', exact: true }).click();
        await page.locator('main[data-hd-module="more"]').waitFor();
        button = page.locator('main').getByRole('button', { name: label, exact: true });
      }
      const expected = { selector: `main[data-hd-module="${module}"]:not(:has([data-hd-module-loading]))` };
      if (measured) return measure(module, 'open', () => button.click(), expected, iteration);
      await button.click();
      await page.locator(expected.selector).waitFor();
    };
    const captureLifecycle = async (module, iteration, stage) => {
      if (process.env.HD_AUDIT_CORE_SMOOTHNESS !== '1') return;
      const session = await context.newCDPSession(page);
      try {
        await session.send('HeapProfiler.collectGarbage');
        observations.push({ viewport: viewport.name, module, iteration, stage, kind: 'lifecycle',
          scope: 'Post-GC JS heap and document-wide DOM listeners; not process/GPU memory or screen-owned timer count',
          heap: await session.send('Runtime.getHeapUsage'), dom: await session.send('Memory.getDOMCounters'),
          subscriptions: await page.evaluate(() => window.hdPerformanceMonitor?.subscriptions() || []),
        });
      } finally { await session.detach(); }
    };
    for (const [module] of actionsOnly || priceOnly ? [] : routes.filter(([key]) => (!selectedModules || selectedModules.includes(key)) && (!criticalOnly || key === 'delivery_reports'))) {
      try {
        for (let iteration = 1; iteration <= 5; iteration++) {
          await navigate(module === 'home' ? 'more' : 'home');
          await captureLifecycle(module, iteration, 'away');
          await navigate(module, true, iteration);
          await captureLifecycle(module, iteration, 'mounted');
          if (iteration === 1) {
            const controls = await page.locator('main').evaluate(main => ({
              buttons: [...main.querySelectorAll('button')].filter(node => node.getClientRects().length).map(node => node.getAttribute('aria-label') || node.textContent.trim()).slice(0, 100),
              inputs: [...main.querySelectorAll('input,select')].filter(node => node.getClientRects().length).map(node => ({ tag: node.tagName, type: node.type, label: node.getAttribute('aria-label') || node.placeholder })),
            }));
            await writeFile(path.join(output, `${viewport.name}-${module}-controls.json`), JSON.stringify(controls, null, 2));
            if (process.env.HD_AUDIT_PHASE1_PARITY === '1') {
              const capture = async (view) => {
                const main = page.locator(`main[data-hd-module="${module}"]`);
                if (module === 'order_requests') {
                  await page.waitForFunction(() => document.querySelectorAll('main[data-hd-module="order_requests"] tbody tr').length > 1);
                }
                const { content, rows } = await main.evaluate(node => ({
                  content: node.innerText,
                  rows: [...node.querySelectorAll('tbody tr, [role="listitem"]')].map(row => row.textContent),
                }));
                observations.push({ viewport: viewport.name, module, kind: 'phase1-parity', view, content, rows });
                await page.screenshot({ path: path.join(output, `${viewport.name}-${module}-${view}.png`) });
              };
              await capture('initial');
              if (module === 'warehouse_import') {
                for (const label of ['Xuất', 'Tồn', 'Nhập']) {
                  await page.locator('.premium-inventory-module .premium-data-toolbar').getByRole('button', { name: new RegExp(`^${label}`) }).click();
                  await capture(label);
                }
              }
            }
            if (process.env.HD_AUDIT_OBSERVE_EXTRA === '1') {
              const scroll = await page.locator('main').evaluate(async main => {
                const candidates = [main, ...main.querySelectorAll('*')].filter(node => /auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight);
                const scroller = candidates.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0];
                if (!scroller) return { status: 'NO_SCROLLABLE_CONTENT', domNodes: main.querySelectorAll('*').length };
                const saved = scroller.scrollTop;
                const deltas = [];
                let start, previous;
                await new Promise(resolve => requestAnimationFrame(function frame(time) {
                  start ??= time;
                  if (previous !== undefined) deltas.push(time - previous);
                  previous = time;
                  scroller.scrollTop = Math.min(scroller.scrollHeight - scroller.clientHeight, (time - start) * 1.5);
                  if (time - start < 1200) requestAnimationFrame(frame); else resolve();
                }));
                scroller.scrollTop = saved;
                return { status: 'MEASURED', scope: 'Programmatic scroll RAF cadence, not compositor FPS or physical-device smoothness', frames: deltas.length, meanFrameMs: deltas.reduce((a, b) => a + b, 0) / deltas.length, maxFrameMs: Math.max(...deltas), framesOver34ms: deltas.filter(ms => ms > 34).length, domNodes: main.querySelectorAll('*').length, heapBytes: performance.memory?.usedJSHeapSize ?? null };
              });
              observations.push({ viewport: viewport.name, module, kind: 'scroll', ...scroll });
            }
          }
        }
      } catch (error) {
        failures.push({ viewport: viewport.name, module, action: 'open', error: error.message });
        console.log(`BLOCKED ${module}: ${error.message.slice(0, 180)}`);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('[data-hd-shell="enterprise"]').waitFor();
      }
    }
    if (process.env.HD_AUDIT_DISPATCH_STRESS === '1' && (!selectedModules || selectedModules.includes('warehouse_dispatch'))) {
      await navigate('warehouse_dispatch');
      const main = page.locator('main[data-hd-module="warehouse_dispatch"]');
      const search = main.getByRole('textbox', { name: 'Tìm tên khách hàng', exact: true });
      for (let iteration = 1; !criticalOnly && iteration <= 5; iteration++) {
        await search.fill('');
        await measure('warehouse_dispatch', 'open_customer_picker', () => search.click(),
          { selector: 'main[data-hd-module="warehouse_dispatch"] [data-search-zone] button:has(p)' }, iteration);
        const value = `Khách hàng ${iteration}`;
        await measure('warehouse_dispatch', 'input_customer', () => search.fill(value),
          { selector: 'input[aria-label="Tìm tên khách hàng"]', mode: 'value', value }, iteration);
        const quantity = main.getByPlaceholder('Số lượng', { exact: true });
        await measure('warehouse_dispatch', 'input_quantity', () => quantity.fill(String(iteration + 100)),
          { selector: 'input[placeholder="Số lượng"]', mode: 'value', value: String(iteration + 100) }, iteration);
      }
      if (process.env.HD_AUDIT_LEGACY_DISPATCH_SAVE === '1') {
        for (let iteration = 1; iteration <= 3; iteration++) {
          await search.fill('Khách hàng 1');
          await measure('warehouse_dispatch', 'select_customer',
            () => main.locator('[data-search-zone]').first().getByRole('button').filter({ hasText: /Khách Hàng 1/i }).first().click(),
            { selector: '[data-search-zone] button:has(p)', mode: 'hidden' }, iteration);
          const product = main.getByRole('textbox', { name: 'Tìm loại hàng', exact: true });
          await measure('warehouse_dispatch', 'input_product', () => product.fill('Sản phẩm 0001'),
            { selector: 'input[aria-label="Tìm loại hàng"]', mode: 'value', value: 'Sản phẩm 0001' }, iteration);
          await measure('warehouse_dispatch', 'select_product',
            () => main.locator('[data-search-zone]').nth(1).getByRole('button').filter({ hasText: /Sản phẩm 0001/i }).first().click(),
            { selector: '[data-search-zone] button:has(p)', mode: 'hidden' }, iteration);
          await main.getByPlaceholder('Số lượng', { exact: true }).fill(String(20 + iteration));
          await measure('warehouse_dispatch', 'save_local_queue',
            () => main.locator('form button[type="submit"]').click(),
            { selector: 'input[aria-label="Tìm tên khách hàng"]', mode: 'value', value: '' }, iteration);
        }
      }
      if (process.env.HD_AUDIT_DISPATCH_SAVE === '1') {
        const readDispatches = () => window.__readPreviewStore().warehouseDispatches || {};
        const originalIds = Object.keys(await page.evaluate(readDispatches));
        const receipts = [];
        for (let iteration = 1; iteration <= 3; iteration++) {
          await search.fill('Khách hàng 1');
          await main.locator('[data-search-zone]').first().getByRole('button', { name: /^Khách hàng 1\s+0900000001$/i }).click();
          const product = main.getByRole('textbox', { name: 'Tìm loại hàng', exact: true });
          await product.fill('Sản phẩm 0001');
          await main.locator('[data-search-zone]').nth(1).getByRole('button').filter({ has: page.getByText('Sản phẩm 0001', { exact: true }) }).click();
          assert.equal(await product.inputValue(), 'Sản phẩm 0001');
          await main.getByRole('button', { name: 'Nhập các lần cân kg', exact: true }).click();
          const weight = page.getByRole('textbox', { name: 'Lần cân 1', exact: true });
          const weightValue = `${11.5 + iteration}`.replace('.', ',');
          await measure('warehouse_dispatch', 'input_weight', () => weight.fill(weightValue),
            { selector: 'input[aria-label="Lần cân 1"]', mode: 'value', value: weightValue }, iteration);
          await page.getByRole('button', { name: 'Cập nhật', exact: true }).click();
          // A Kg-only fixture submits the measured weight, not a piece-count measure.
          await main.getByPlaceholder('Số lượng', { exact: true }).fill('0');
          const previousIds = Object.keys(await page.evaluate(readDispatches));
          await measure('warehouse_dispatch', 'save_dispatch_local_receipt',
            () => main.getByRole('button', { name: 'Lưu và thêm mới', exact: true }).dblclick(),
            { selector: 'input[aria-label="Tìm tên khách hàng"]', mode: 'value', value: '' }, iteration);
          // Local receipt timing ends at form reset; persistence checks are untimed.
          await page.waitForFunction(ids => {
            const previous = new Set(ids);
            return Object.keys(window.__readPreviewStore().warehouseDispatches || {}).some(id => !previous.has(id));
          }, previousIds);
          const persisted = await page.evaluate(readDispatches);
          const previous = new Set(previousIds);
          const newIds = Object.keys(persisted).filter(id => !previous.has(id));
          assert.equal(newIds.length, 1, 'Double click must persist exactly one new dispatch');
          const receipt = persisted[newIds[0]];
          assert.equal(receipt.id, newIds[0]);
          assert.equal(receipt.companyId, claims.companyId);
          assert.equal(receipt.customerId, 'c_perf_1');
          assert.equal(receipt.productId, 'p_perf_1');
          assert.equal(receipt.date, date);
          assert.equal(receipt.weightKg, 11.5 + iteration);
          assert.deepEqual(receipt.weightEntries, [11.5 + iteration]);
          assert.equal(receipt.billingUnit.toLowerCase(), 'kg');
          assert.equal(receipt.billingQuantity, 11.5 + iteration);
          assert.equal(receipt.unitPrice, 50000);
          assert.match(receipt.clientMutationId, /^[A-Za-z0-9_-]+$/);
          assert.equal(Object.values(persisted).filter(row => row.clientMutationId === receipt.clientMutationId).length, 1);
          assert.ok(!receipts.some(row => row.clientMutationId === receipt.clientMutationId));
          receipts.push(receipt);
        }
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('[data-hd-shell="enterprise"]').waitFor();
        await navigate('warehouse_dispatch');
        const recovered = await page.evaluate(readDispatches);
        const original = new Set(originalIds);
        assert.equal(Object.keys(recovered).filter(id => !original.has(id)).length, receipts.length);
        for (const receipt of receipts) assert.deepEqual(recovered[receipt.id], receipt, 'Dispatch must survive reload unchanged');
        observations.push({ viewport: viewport.name, module: 'warehouse_dispatch', kind: 'save-safety',
          documents: receipts.length, documentIds: receipts.map(row => row.id), reloadRecovery: 'PASS',
          confirmation: 'LOCAL durable receipt and preview persistence; NOT Cloud Function or stock-ledger acceptance' });
      }
      await page.screenshot({ path: path.join(output, `${viewport.name}-warehouse-input.png`) });
      if (process.env.HD_AUDIT_CHECK_EXPORT_PAGING === '1') {
        const listRows = main.locator('table').filter({ hasText: 'Người giao' }).locator('tbody tr');
        const initialRows = await listRows.count();
        await main.getByRole('button', { name: 'Tải thêm phiếu xuất', exact: true }).click();
        const expandedRows = await listRows.count();
        assert.ok(expandedRows > initialRows, 'Load more must reveal additional complete groups');
        await main.getByRole('button', { name: 'Mở tìm kiếm phiếu xuất kho', exact: true }).click();
        await main.getByRole('searchbox', { name: 'Tìm kiếm phiếu xuất kho trong ngày', exact: true }).fill('Khách hàng 359');
        // Legacy fuzzy search can also match common words; traverse all matching groups normally.
        const targetRow = listRows.filter({ hasText: /Khách hàng 359/i }).first();
        for (let pageIndex = 0; pageIndex < 40 && !await targetRow.count(); pageIndex++) {
          await main.getByRole('button', { name: 'Tải thêm phiếu xuất', exact: true }).click();
        }
        await targetRow.waitFor();
        observations.push({ viewport: viewport.name, module: 'warehouse_dispatch', kind: 'render-pagination',
          initialRows, expandedRows, fullDatasetSearch: 'PASS customer outside initial page',
          readScope: 'Unchanged full dataset; presentation-only pagination' });
      }
      // Supplemental keys do not redefine historical input_customer/input_product timings.
      if (!criticalOnly) {
      const customerInput = 'main[data-hd-module="warehouse_dispatch"] input[aria-label="Tìm tên khách hàng"]';
      const productInput = 'main[data-hd-module="warehouse_dispatch"] input[aria-label="Tìm loại hàng"]';
      // Tag zones in the isolated page because :nth-of-type depends on unrelated sibling markup.
      await main.locator('[data-search-zone]').nth(0).evaluate(node => node.dataset.auditPicker = 'customer');
      await main.locator('[data-search-zone]').nth(1).evaluate(node => node.dataset.auditPicker = 'product');
      const customerResults = 'main[data-hd-module="warehouse_dispatch"] [data-audit-picker="customer"] button > p:first-child';
      const productResults = 'main[data-hd-module="warehouse_dispatch"] [data-audit-picker="product"] button > p:first-child';
      await search.fill('0900000000');
      await waitForExactSearchResults(page, customerResults, ['Khách Hàng 0']);
      for (let iteration = 1; iteration <= 5; iteration++) {
        await measureSearchReadiness({ page, measure, module: 'warehouse_dispatch', action: 'customer_search',
          input: customerInput, query: `0900${String(iteration).padStart(6, '0')}`,
          selector: customerResults, values: [`Khách Hàng ${iteration}`], iteration });
      }
      await search.fill('0900000001');
      await waitForExactSearchResults(page, customerResults, ['Khách Hàng 1']);
      await main.locator('[data-audit-picker="customer"]').getByRole('button', { name: /^Khách hàng 1\s+0900000001$/i }).click();
      const productSearch = main.getByRole('textbox', { name: 'Tìm loại hàng', exact: true });
      const captureProductPicker = () => page.evaluate(({ input, selector }) => ({
        inputValue: document.querySelector(input)?.value,
        resultNames: [...document.querySelectorAll(selector)]
          .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
          .map(node => node.textContent.trim()),
      }), { input: productInput, selector: productResults });
      const productPrefill = process.env.HD_AUDIT_PICKER_DIAGNOSTICS === '1' ? await captureProductPicker() : null;
      if (productPrefill) {
        await productSearch.fill('Sản phẩm 0001');
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        observations.push({ viewport: viewport.name, module: 'warehouse_dispatch', kind: 'product-picker-same-value-diagnostic',
          before: productPrefill, after: await captureProductPicker() });
      }
      // Customer selection prefills this label with searchEdited=false. Filling the
      // identical value does not trigger React onChange; clear through the real control first.
      await productSearch.fill('');
      await productSearch.fill('Sản phẩm 0001');
      await waitForExactSearchResults(page, productResults, ['Sản phẩm 0001']);
      const orderedProductNumbers = [121, 241, 361, 481, 1];
      for (let iteration = 1; iteration <= 5; iteration++) {
        const name = `Sản phẩm ${String(orderedProductNumbers[iteration - 1]).padStart(4, '0')}`;
        await measureSearchReadiness({ page, measure, module: 'warehouse_dispatch', action: 'product_search',
          input: productInput, query: name, selector: productResults, values: [name], iteration });
      }
      }
    }
    if (productLegacyPrecondition || (!actionsOnly && !priceOnly && !selectedModules)) try {
      await navigate('products');
      await page.locator('.hd-product-list__primary').first().waitFor();
      const cdp = profileModules.includes('products') ? await context.newCDPSession(page) : null;
      if (cdp) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); }
      for (let iteration = 1; iteration <= 5; iteration++) {
        await measure('products', 'open_edit', () => page.locator('.hd-product-list__primary').filter({ hasText: 'Sản phẩm 0000' }).click(), { selector: '[role="dialog"][aria-label="Sửa sản phẩm"]' }, iteration);
        const editor = page.getByRole('dialog', { name: 'Sửa sản phẩm' });
        const value = `P${iteration}`;
        await measure('products', 'input', () => editor.getByRole('textbox', { name: 'Viết tắt', exact: true }).fill(value), { selector: 'input[aria-label="Viết tắt"]', mode: 'value', value }, iteration);
        await measure('products', 'save_edit', () => editor.getByRole('button', { name: /Lưu/ }).click(), { selector: '[role="dialog"][aria-label="Sửa sản phẩm"]', mode: 'hidden' }, iteration);
      }
      if (cdp) {
        const { profile } = await cdp.send('Profiler.stop');
        await writeFile(path.join(output, `${viewport.name}-products.cpuprofile`), JSON.stringify(profile));
        await cdp.detach();
      }
      await page.screenshot({ path: path.join(output, `${viewport.name}-products.png`) });
    } catch (error) {
      failures.push({ viewport: viewport.name, module: 'products', action: 'edit_save', error: error.message });
      await page.screenshot({ path: path.join(output, `${viewport.name}-product-error.png`) });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('[data-hd-shell="enterprise"]').waitFor();
    }
    if (!actionsOnly && (!selectedModules || priceOnly)) try {
      await navigate('order_requests');
      const module = page.locator('.premium-order-request-module');
      for (let iteration = 1; iteration <= 5; iteration++) {
        const oldPrice = iteration === 1 ? (process.env.HD_AUDIT_DISPATCH_STRESS === '1' ? 50000 : 285000) : 290000 + iteration - 1;
        const value = 290000 + iteration;
        await measure('order_requests', 'open_edit_price', () => module.getByRole('button', { name: new Intl.NumberFormat('vi-VN').format(oldPrice), exact: true }).first().click(), { selector: '[role="dialog"]' }, iteration);
        const editor = page.getByRole('dialog', { name: 'Sửa đơn giá' });
        await editor.getByRole('textbox').first().evaluate(node => node.dataset.auditPrice = 'true');
        await measure('order_requests', 'input_price', () => editor.getByRole('textbox').first().fill(String(value)), { selector: '[data-audit-price]', mode: 'value', value: new Intl.NumberFormat('vi-VN').format(value) }, iteration);
        await measure('order_requests', 'save_price', () => editor.getByRole('button', { name: 'Lưu', exact: true }).click(), { selector: '[data-audit-price]', mode: 'hidden' }, iteration);
        await module.getByRole('button', { name: new Intl.NumberFormat('vi-VN').format(value), exact: true }).first().waitFor();
      }
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('[data-hd-shell="enterprise"]').waitFor();
      await page.waitForFunction(() => Object.values(window.__readPreviewStore().orderRequests).some(request => request.items?.[0]?.unitPrice === 290005));
    } catch (error) {
      failures.push({ viewport: viewport.name, module: 'order_requests', action: 'edit_save', error: error.message });
      await page.screenshot({ path: path.join(output, `${viewport.name}-request-error.png`) });
    }
    if (actionsOnly || process.env.HD_AUDIT_INCLUDE_ACTIONS === '1') {
      const clickCommand = useNative ? async locator => {
        await locator.scrollIntoViewIfNeeded();
        assert.ok(await locator.isEnabled(), 'Native commands must be enabled');
        const point = await locator.evaluate(element => {
          const rect = element.getBoundingClientRect();
          const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
          if (!element.contains(document.elementFromPoint(x, y))) throw new Error('Native command center is occluded');
          return { x: Math.round(x * devicePixelRatio), y: Math.round(y * devicePixelRatio) };
        });
        // Real Android input rather than CDP's synthetic mouse across IME resize.
        execFileSync(adb, ['-s', device.serial(), 'shell', 'input', 'tap', String(point.x), String(point.y)]);
      } : locator => locator.click();
      await runInteractionActionCases({ page, navigate, measure, failures, viewport: viewport.name, output, clickCommand, deliveryFixtures, inventoryHistoryFixture });
    }
    if (useNative && process.env.HD_AUDIT_DEVICE_CHECKS === '1') {
      try { await runNativeKeyboardAcceptance({ page, navigate, adb, serial: device.serial(), output }); }
      catch (error) { failures.push({ viewport: viewport.name, module: 'native-layout', action: 'keyboard_orientation_back', error: error.message }); }
    }
    if (device && !useNative) await page.close();
    else await context.close();
  }
} catch (error) {
  failures.push({ viewport: useNative ? 'android-apk-webview' : useAndroid ? 'android-emulator' : 'browser', module: 'harness', action: 'setup_or_run', error: error.stack || error.message });
} finally {
  await browser?.close();
  if (device) {
    if (reversed) execFileSync(adb, ['-s', device.serial(), 'reverse', '--remove', `tcp:${port}`]);
    if (debugPort) execFileSync(adb, ['-s', device.serial(), 'forward', '--remove', `tcp:${debugPort}`]);
    await device.close();
  }
  await new Promise(resolve => server.httpServer.close(resolve));
  const summary = summarizeInteractionSamples(samples);
  await writeFile(path.join(output, 'samples.json'), JSON.stringify(samples, null, 2));
  await writeFile(path.join(output, 'observations.json'), JSON.stringify(observations, null, 2));
  await writeFile(path.join(output, 'summary.json'), JSON.stringify({ phase, measurementContracts: {
    legacy: 'Historical action keys and timing predicates retained; products/search is not evidence of filtered-result readiness',
    searchReadinessV1: 'New *_input_paint_v1 / *_result_ready_v1 pairs share one input event; input value plus two frames vs exact ordered results plus two frames. Not comparable to legacy search/input samples; frame opportunity is not compositor paint.',
    coverageV1: 'Opt-in HD_AUDIT_MASTER_FIXTURES=1 adds isolated product create/edit/reopen/reload/category-filter acceptance; recovery is outside save latency',
    ...(masterFixtures ? { productCoverageFixture: { version: PRODUCT_COVERAGE_FIXTURE_VERSION, products: PRODUCT_COVERAGE_FIXTURES,
      comparison: 'Alphabetic unique-marker fixtures replace numeric coverage labels; compare only matching fixture versions, not failed v4 partial coverage samples' } } : {}),
    ...(inventoryHistory ? { inventoryHistoryV1: 'Dedicated read-only 31-date full-dispatch fixture; new history_*_v1 samples await exact stock labels plus two frames. Monthly report controls unavailable, not simulated.' } : {}),
    ...(productLegacyPrecondition ? { productLegacyPreconditionV1: 'Focused product pair includes all five legacy edit saves before extended readiness acceptance; compare only with the same focused precondition on both immutable builds.' } : {}),
  }, fixtureCounts: Object.fromEntries(Object.entries(fixture).map(([key, value]) => [key, Object.keys(value).length])), runtime: `${useNative ? 'Installed Android debug APK/Capacitor WebView' : device ? 'Android emulator Chrome' : 'Desktop Chrome/mobile viewport'}, React production ${profileRender ? 'profiling' : 'runtime (no React render profiler)'}, isolated preview storage; NOT cloud/backend latency or physical device acceptance`, samples: samples.length, summary, failures, errors }, null, 2));
  console.log(JSON.stringify({ samples: samples.length, failures, errors }, null, 2));
  if (failures.length || errors.length) process.exitCode = 1;
  if (process.connected) process.disconnect();
}
