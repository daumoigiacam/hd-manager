import assert from 'node:assert/strict';
import test from 'node:test';
import { appFunction } from './helpers/app-source-function.mjs';
import { createSaveQueueHarness } from './helpers/save-queue-harness.mjs';
import { commitAtomicWrites, ATOMIC_SAVE_COLLECTION, expandPendingWrites } from '../src/utils/atomicSave.js';
import { canAutomaticallyRetryWrite, pendingWriteFailure, isRetryableWriteError } from '../src/utils/pendingWriteRetry.js';
import { isSamePendingWriteRevision } from '../src/utils/pendingWriteRevision.js';
import { readFileSync } from 'node:fs';
import { createDeliverySavePlan } from '../src/utils/deliverySavePlan.js';
import { mergeAtomicWrites } from '../src/utils/atomicSave.js';
import { replayShareCanvas } from '../src/utils/shareCanvasCommands.js';
import { createDraftRevision } from '../src/utils/draftRevision.js';
import { preserveCommandInputFocus, createCommandFocusGuard, createCommandClickGuard } from '../src/layout/commandFocus.js';

test('IME focus is released after the command click, never between pointerdown and pointerup', () => {
  let blurred = false;
  const focused = { tagName: 'INPUT', blur: () => { blurred = true; } };
  const button = { closest: () => ({ contains: node => node === focused }) };
  const event = { button: 0, target: { closest: () => button }, preventDefault() {} };
  const guard = createCommandFocusGuard({ activeElement: focused });
  guard.pointerdown(event);
  assert.equal(blurred, false);
  guard.click(event);
  assert.equal(blurred, true);
});

test('inline form panels retain IME focus instead of closing and reopening the keyboard', () => {
  let blurred = false;
  const focused = { tagName: 'INPUT', blur: () => { blurred = true; } };
  const button = { closest: () => ({ contains: node => node === focused }),
    hasAttribute: name => name === 'data-hd-keep-input-focus' };
  const event = { button: 0, target: { closest: () => button }, preventDefault() {} };
  const guard = createCommandFocusGuard({ activeElement: focused });
  guard.pointerdown(event);
  guard.click(event);
  assert.equal(blurred, false);
});

test('a command captures its actual pointer so IME resize cannot retarget the release to the backdrop', () => {
  const focused = { tagName: 'INPUT' };
  let captured;
  const button = { closest: () => ({ contains: node => node === focused }),
    setPointerCapture: id => { captured = id; } };
  preserveCommandInputFocus({ button: 0, pointerId: 7, target: { closest: () => button },
    preventDefault() {} }, { activeElement: focused });
  assert.equal(captured, 7);
});

test('commands keep keyboard focus within their form but allow unrelated navigation and disabled buttons', () => {
  const focused = { tagName: 'INPUT' };
  const scope = { contains: node => node === focused };
  const button = { closest: () => scope };
  let prevented = 0;
  const event = { button: 0, target: { closest: () => button }, preventDefault: () => prevented++ };
  preserveCommandInputFocus(event, { activeElement: focused });
  assert.equal(prevented, 1);
  button.disabled = true;
  preserveCommandInputFocus(event, { activeElement: focused });
  button.disabled = false;
  button.closest = () => ({ contains: () => false });
  preserveCommandInputFocus(event, { activeElement: focused });
  assert.equal(prevented, 1);
});

test('second click cannot open a record below a form just removed by its first save', () => {
  const guard = createCommandClickGuard();
  const command = { isConnected: true };
  let prevented = 0, stopped = 0;
  const event = { detail: 1, target: { closest: () => command }, preventDefault: () => prevented++, stopPropagation: () => stopped++ };
  guard(event);
  command.isConnected = false;
  guard({ ...event, detail: 2, target: { closest: () => null } });
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);
  guard({ ...event, detail: 1, target: { closest: () => null } });
  assert.equal(prevented, 1, 'a new deliberate interaction is allowed without a timer');
});

test('double submit cannot revalidate a cleared form, while repeated stepper clicks remain allowed', () => {
  const guard = createCommandClickGuard();
  let prevented = 0;
  const submit = { isConnected: true, type: 'submit' };
  const stepper = { isConnected: true, type: 'button' };
  const click = (command, detail) => guard({ detail, target: { closest: () => command },
    preventDefault: () => prevented++, stopPropagation() {} });
  click(submit, 1);
  click(submit, 2);
  assert.equal(prevented, 1, 'the completed first submit must not submit its reset draft again');
  click(submit, 1);
  click(stepper, 1);
  click(stepper, 2);
  assert.equal(prevented, 1, 'new intentional submits and repeated quantity changes remain allowed');
});

test('pricing snapshots and an earlier save receipt cannot overwrite a newer unsaved draft', async () => {
  const guard = createDraftRevision();
  const pricingDraftRevisionRef = { current: guard };
  let draft = { price: 60 };
  const replaceRulesDraft = next => { draft = typeof next === 'function' ? next(draft) : next; };
  const edit = appFunction('setRulesDraft', { pricingDraftRevisionRef, replaceRulesDraft }, { scope: 'SimplePricingEngineView', memoCallback: true });
  const hydrate = appFunction('syncPricingDraftFromSavedRules', {
    pricingDraftRevisionRef, savedRules: { price: 60 }, normalizePricingRuleDraft: value => value,
    normalizePricingLossStageGroups: () => ({ duck: [] }), normalizePricingCutPartGroups: () => ({}),
    replaceRulesDraft, setActiveLossGroupKey() {}, replaceLossStageGroupsDraft() {}, replaceCutPartGroupsDraft() {},
  }, { scope: 'SimplePricingEngineView' });
  edit({ price: 63 });
  hydrate();
  assert.equal(draft.price, 63, 'an earlier realtime ACK must not reset the input');
  let complete;
  const pricingSaveInFlightRef = { current: false };
  const save = appFunction('handleSavePricingRules', {
    canEditRules: true, pricingSaveInFlightRef, pricingDraftRevisionRef,
    onSavePricingRules: () => new Promise(resolve => { complete = resolve; }),
    parsedRules: { price: 63, marginByProduct: {} }, buildSeedProductMargins: () => ({}),
    setIsSavingPricing() {}, setStatusText() {}, getFriendlyFirebaseErrorMessage: error => error.message,
  }, { scope: 'SimplePricingEngineView' });
  const pending = save();
  await save();
  assert.equal(pricingSaveInFlightRef.current, true, 'duplicate submit must not release the first save lock');
  edit({ price: 64 });
  complete({ queued: true });
  await pending;
  assert.equal(guard.isDirty(), true, 'only the submitted revision was persisted');
  hydrate();
  assert.equal(draft.price, 64);
  assert.equal(pricingSaveInFlightRef.current, false);
  guard.saved(guard.capture());
  hydrate();
  assert.equal(draft.price, 60, 'idle drafts can accept a real remote update');
});

test('bulk quote save distinguishes queued receipts, rejects failures and locks duplicate submissions', async () => {
  let finish, calls = 0, status = '';
  const applyingBatchPriceRef = { current: false };
  const bindings = {
    applyingBatchPriceRef, onEditCustomer: () => { calls++; return new Promise(resolve => { finish = resolve; }); },
    activeProducts: [{ id: 'p', name: 'Product' }], batchPriceProductId: 'p', batchPriceValue: '63', batchPriceSize: '',
    parseLooseMoneyValue: Number, getBatchPriceTargetCustomers: () => [{ id: 'c' }],
    normalizeCustomerPriceOverrides: () => ({}), normalizeCustomerProductIds: () => ['p'],
    setIsApplyingBatchPrice() {}, setSelectedProductIds() {}, setQuoteStatus: text => { status = text; },
    getFriendlyFirebaseErrorMessage: error => error.message,
  };
  const save = appFunction('handleApplyBatchCustomerPrice', bindings, { scope: 'PriceQuoteBroadcastView' });
  const first = save();
  await save();
  assert.equal(calls, 1);
  assert.equal(applyingBatchPriceRef.current, true);
  finish({ queued: true });
  await first;
  assert.match(status, /^Đã lưu tạm giá/);
  assert.equal(applyingBatchPriceRef.current, false);
  bindings.onEditCustomer = async () => ({ queued: false });
  await appFunction('handleApplyBatchCustomerPrice', bindings, { scope: 'PriceQuoteBroadcastView' })();
  assert.match(status, /^Đã áp giá/);
  bindings.onEditCustomer = async () => { throw new Error('permission-denied'); };
  await appFunction('handleApplyBatchCustomerPrice', bindings, { scope: 'PriceQuoteBroadcastView' })();
  assert.equal(status, 'permission-denied');
  assert.equal(applyingBatchPriceRef.current, false);
});

test('a modal action retains input focus and cannot be retargeted to backdrop dismissal', () => {
  const listeners = new Map();
  let cleanup, dismissed = 0;
  class Element {
    constructor(className = '') { this.className = className; }
    getAttribute(name) { return name === 'class' ? this.className : ''; }
    querySelector() { return null; }
  }
  const focused = { tagName: 'INPUT' };
  const dismiss = Object.assign(new Element(), { textContent: 'Cancel', click: () => dismissed++ });
  const backdrop = Object.assign(new Element('fixed inset-0 bg-black/60'), { querySelectorAll: () => [dismiss] });
  const dialog = { contains: node => node === focused };
  const button = { disabled: false, closest: () => dialog };
  const target = { closest: () => button };
  const document = {
    activeElement: focused,
    addEventListener: (name, fn, options) => listeners.set(`${name}:${options === true || options?.capture === true}`, fn),
    removeEventListener: (name, fn, options) => listeners.delete(`${name}:${options === true || options?.capture === true}`),
  };
  appFunction('useDismissModalOnBackdropClick', {
    useEffect: fn => { cleanup = fn(); }, document, HTMLElement: Element, createCommandFocusGuard, createCommandClickGuard,
    normalizeLookupText: text => text.toLowerCase(),
  })();
  let focusRetained = false, stopped = false;
  listeners.get('pointerdown:true')({ target, button: 0, preventDefault: () => { focusRetained = true; } });
  assert.equal(focusRetained, true);
  const click = () => listeners.get('click:true')({ target: backdrop, preventDefault() {}, stopPropagation: () => { stopped = true; } });
  click();
  assert.equal(stopped, true);
  assert.equal(dismissed, 0, 'A click which began in an action must never discard the draft');
  listeners.get('pointerdown:true')({ target: backdrop, button: 0, preventDefault() {} });
  click();
  assert.equal(dismissed, 1, 'An intentional backdrop click still dismisses');
  cleanup();
  assert.equal(listeners.size, 0);
});

test('worker canvas replay preserves drawing properties and commands in order', () => {
  const calls = [];
  const context = { fillText: (...args) => calls.push(['fillText', ...args]), strokeRect: (...args) => calls.push(['strokeRect', ...args]) };
  replayShareCanvas(context, [['set', 'font', '900 25px Arial'], ['call', 'fillText', ['Invoice', 30, 45]], ['set', 'lineWidth', 1.35], ['call', 'strokeRect', [1, 2, 3, 4]]]);
  assert.equal(context.font, '900 25px Arial');
  assert.equal(context.lineWidth, 1.35);
  assert.deepEqual(calls, [['fillText', 'Invoice', 30, 45], ['strokeRect', 1, 2, 3, 4]]);
});

test('share image encoding supports asynchronous worker output and HTML fallback errors', async () => {
  const blob = new Blob(['png'], { type: 'image/png' });
  const offscreen = { convertToBlob(options) { this.options = options; return Promise.resolve(blob); } };
  const encode = appFunction('canvasToBlob', { recordPerformanceEvent() {} });
  assert.equal(await encode(offscreen), blob);
  assert.equal(blob.type, 'image/png');
  assert.deepEqual(offscreen.options, { type: 'image/png' });
  assert.equal(await encode({ toBlob: (callback) => callback(blob) }), blob);
  await assert.rejects(encode({ convertToBlob: () => Promise.reject(new Error('encoder failed')) }), /encoder failed/);
  await assert.rejects(encode({ toBlob: (callback) => callback(null) }), /Không thể tạo/);
});

test('save handlers reject expired authentication or missing tenant instead of resolving as success', async () => {
  const handlers = [
    'handleLeave', 'handleEditAttendance', 'handleToggleArchive',
    'handleEditPayment', 'handleDeletePayment', 'handleEditFinancialRecord', 'handleDeleteFinancialRecord',
    'updatePerformance', 'handleEditCustomer', 'handleSaveCustomerProductPreference',
    'handleAddOrderRequest', 'handleEditOrderRequest', 'handleDeleteOrderRequest',
    'handleEditWarehouseImport', 'handleDeleteWarehouseImport',
    'handleAddPricingInput', 'handleEditPricingInput', 'handleDeletePricingInput',
    'handleSavePricingRules', 'handleSavePricingScenario',
    'handleEditWarehouseStockCount', 'handleDeleteWarehouseStockCount',
    'handleAddAsset', 'handleEditAsset', 'handleDeleteAsset',
    'handleEditWarehouseDispatch', 'handleDeleteWarehouseDispatch', 'handleDeleteOrder',
    'handleAddHoliday', 'handleDeleteHoliday', 'handleAddWarehouseDispatch', 'handleAddOrder',
    'handleCheckIn', 'handleCheckOut',
  ];
  const bindings = {
    isVpsStagingMode: false, firebaseUser: null, myCompanyId: 'a', currentCompany: {},
    rawOrders: [], employees: [], attendanceRecords: {}, currentDate: '2026-09-30',
    getTodayString: () => '2026-09-30', getWarehouseDispatchIds: () => [],
    resolveAttendanceActionDateForShift: () => '2026-09-30',
    normalizeAttendanceMethod: () => ({}), applyAttendanceFixedLocationGuard: () => ({}),
    saveDataDocument() { assert.fail('Invalid sessions must never reach persistence'); },
  };
  for (const handler of handlers) {
    const args = handler === 'handleSaveCustomerProductPreference' ? [{ customerId: 'c', productId: 'p', inputUnit: 'kg' }] : ['record', {}];
    for (const session of [{ firebaseUser: null, myCompanyId: 'a' }, { firebaseUser: { uid: 'u' }, myCompanyId: '' }]) {
      await assert.rejects(appFunction(handler, { ...bindings, ...session })(...args), /Phiên.*không hợp lệ/, handler);
    }
  }
});

test('pricing save publishes through the persistence boundary and preserves pending vs confirmed receipts', async () => {
  const writes = [];
  let queued = true, failure = false;
  const save = appFunction('handleSavePricingRules', {
    firebaseUser: { uid: 'u' }, myCompanyId: 'a', employeeInfo: { id: 'e' }, currentUser: { id: 'u' },
    setRawPricingRules() { assert.fail('Do not publish an extra optimistic update before persistence'); },
    rememberRecentLocalWrite() { assert.fail('The persistence boundary owns cache updates'); },
    async saveDataDocument(...args) {
      if (failure) throw new Error('storage-full');
      writes.push(args);
      return { queued };
    },
  });
  assert.deepEqual(await save({ targetMargin: 20 }), { id: 'pricing_engine_rules', queued: true });
  assert.equal(writes[0][0], 'pricingRules');
  assert.equal(writes[0][2].companyId, 'a');
  queued = false;
  assert.deepEqual(await save({ targetMargin: 25 }), { id: 'pricing_engine_rules', queued: false });
  failure = true;
  await assert.rejects(save({ targetMargin: 30 }), /storage-full/);
});

test('customer and order-request edits cannot use a record belonging to another tenant', async () => {
  const bindings = {
    isVpsStagingMode: false, firebaseUser: { uid: 'u' }, myCompanyId: 'a',
    rawCustomers: [{ id: 'foreign', companyId: 'b' }], orderRequests: [{ id: 'foreign', companyId: 'b' }],
    saveDataDocument() { assert.fail('Foreign records must not reach the local queue'); },
  };
  for (const handler of ['handleEditCustomer', 'handleEditOrderRequest', 'handleDeleteOrderRequest']) {
    await assert.rejects(appFunction(handler, bindings)('foreign', {}), /Không tìm thấy/, handler);
  }
});

test('company snapshot hydrates a claims-only profile even without an updatedAt timestamp', () => {
  const shouldUpdate = appFunction('shouldUpdateCompanyProfile');
  const claims = { id: 'company', name: 'Test' };
  const document = { ...claims, bankId: 'STB', bankAccountNumber: 'test-account' };
  assert.equal(shouldUpdate(claims, document), true);
  assert.equal(shouldUpdate(document, document), false);
  assert.equal(shouldUpdate({ ...document }, document), false);
  assert.equal(shouldUpdate(document, { ...document, bankId: 'BIDV' }), true);
  assert.equal(shouldUpdate({ ...document, updatedAt: '2026-09-30T09:00:00Z' }, { ...document, updatedAt: '2026-09-29T09:00:00Z' }), false);
});

test('invoice cache renders a valid local QR without waiting for a payment-link API', async () => {
  const entries = new Map(), pending = new Map(), pendingByOrder = new Map();
  let renders = 0, apiCalls = 0;
  const warm = appFunction('warmOrderShareAssetCache', {
    buildOrderShareAssetCacheKey: order => `${order.id}:${order.amount}`,
    getCachedOrderShareAsset: order => entries.get(`${order.id}:${order.amount}`),
    orderShareAssetPendingCache: pending, orderShareAssetPendingByOrderId: pendingByOrder,
    readPersistentShareImageAsset: async () => null, ORDER_SHARE_ASSET_CACHE_TTL_MS: 60000,
    recordPerformanceEvent() {}, createPerformanceSpan: () => ({ end() {}, fail(error) { throw error; } }),
    getOrderPayosPaymentSource: () => '', getOrderSharePaymentDueAmount: order => order.amount,
    buildOrderLocalPaymentQrPayload: () => 'verified-local-vietqr', warmLocalPaymentQrDataUrlCache() {},
    isOrderPaymentQrFingerprintAligned: () => false, isOrderPaymentSourceAlignedWithTransferProfile: () => false,
    isOrderSharePaymentAmountAligned: () => false,
    drawSalesInvoiceShareImage: async () => { renders++; return new Blob(['invoice']); },
    prepareOrderShareNativeFile: async () => null, upsertOrderIntoShareCollection: (orders, order) => [...orders, order],
    rememberOrderShareAsset: (order, company, asset) => { entries.set(`${order.id}:${order.amount}`, asset); return asset; },
  });
  const options = { order: { id: 'local', amount: 60 }, company: {}, ensurePayment: async () => { apiCalls++; throw new Error('API unavailable'); } };
  await Promise.all([warm(options), warm(options)]);
  assert.equal(apiCalls, 0);
  assert.equal(renders, 1);
  assert.equal(pending.size, 0);
  assert.equal(pendingByOrder.size, 0);
});

test('customer create retry keeps the command ID and never bypasses another customer phone', async () => {
  const rawCustomers = [];
  const bindings = {
    isVpsStagingMode: false, firebaseUser: { uid: 'u' }, myCompanyId: 'a', currentUser: { id: 'e' }, rawCustomers,
    normalizeCustomerHonorific: value => value, inferCustomerHonorificFromName: () => '',
    stripCustomerHonorificPrefix: value => value, toTitleCase: value => value,
    buildCustomerPhoneDuplicateKey: value => value,
    setRawCustomers() {}, rollbackLocalListRecord() {},
    saveDataDocument: async (_, id, payload) => { rawCustomers.splice(0, rawCustomers.length, payload); return { queued: true }; },
  };
  const create = appFunction('handleAddCustomer', bindings);
  const draft = { clientMutationId: 'fixed', phone: 'test-only', name: 'Test' };
  assert.equal(await create('e', draft), 'c_fixed');
  assert.equal(await create('e', draft), 'c_fixed');
  assert.equal(rawCustomers.length, 1);
  await assert.rejects(create('e', { ...draft, clientMutationId: 'another', id: 'c_fixed' }), /Số điện thoại/);
  await assert.rejects(appFunction('handleAddCustomer', { ...bindings, myCompanyId: '' })('e', draft), /Chưa kết nối/);
});

test('product create retries retain their ID and invalid sessions or tenant edits never succeed silently', async () => {
  const records = new Map();
  const bindings = {
    isVpsStagingMode: false, firebaseUser: { uid: 'u' }, myCompanyId: 'a', currentUser: { id: 'e' },
    rawProducts: [{ id: 'p', companyId: 'a' }, { id: 'foreign', companyId: 'b' }],
    saveDataDocument: async (_, id, payload) => { records.set(id, payload); return { queued: true }; },
  };
  const create = appFunction('handleAddProduct', bindings);
  const draft = { name: 'Test', clientMutationId: 'stable', sellingPrice: 60 };
  assert.equal(await create(draft), 'prod_stable');
  await create(draft);
  assert.equal(records.size, 1);
  await assert.rejects(create({ ...draft, clientMutationId: '../bad' }));
  await assert.rejects(create({ ...draft, name: '' }));
  await assert.rejects(appFunction('handleAddProduct', { ...bindings, firebaseUser: null })(draft));
  const edit = appFunction('handleEditProduct', bindings);
  assert.equal((await edit('p', { sellingPrice: 63 })).queued, true);
  await assert.rejects(edit('foreign', { sellingPrice: 1 }));
  const archive = appFunction('handleDeleteProduct', bindings);
  assert.equal((await archive('p')).queued, true);
  assert.equal(records.get('p').isArchived, true);
  await assert.rejects(archive('foreign'));
});

test('debt share text uses each payment, not a fabricated invoice repeated as history', () => {
  const format = appFunction('buildDebtShareText', {
    currentCompany: { name: 'Test Company' }, getCustomerDisplayName: customer => customer.name,
    formatCurrency: String, formatOrderCode: value => value, formatDateLabel: value => value,
    getPaymentDateKey: value => value.date, getPaymentMethodLabel: value => value.method,
  });
  const text = format({ name: 'Test Customer', currentDebt: 40, orders: [{ id: 'order-actual', date: '2026-09-29', amount: 100, outstandingAmount: 40 }], payments: [{ date: '2026-09-30', amount: 60, appliedAmount: 60, method: 'Cash' }] });
  assert.equal((text.match(/BẢNG ĐỐI SOÁT/g) || []).length, 1);
  assert.ok(text.includes('2026-09-30 - Cash - Đã thu 60 đ - Đã phân bổ 60 đ'));
  assert.ok(text.includes('order-actual'));
  assert.ok(format({ name: 'Empty' }).includes('Chưa có khoản thu nào'));
});

test('switching delivery panels preserves already entered cashflow amounts', () => {
  const state = { income: true, expense: false, returned: false, shipping: false };
  const toggle = appFunction('toggleDeliveryReportPanel', {
    setShowIncomeReportSection: update => { state.income = update(state.income); },
    setShowExpenseReportSection: update => { state.expense = update(state.expense); },
    setShowReturnReportSection: update => { state.returned = update(state.returned); },
    setShowShippingReportSection: update => { state.shipping = update(state.shipping); },
    setCollectedAmount() { assert.fail('Panel navigation must not clear the payment draft'); },
    setCollectedAmountManuallyEdited() { assert.fail('Panel navigation must retain manual input'); },
  }, { scope: 'DeliveryReportView' });
  toggle('expense');
  assert.equal(state.income, false);
  assert.equal(state.expense, true);
  toggle('income');
  assert.equal(state.income, true);
  assert.equal(state.expense, false);
});

test('expenses use stable command IDs and common durable save for create/edit/archive', async () => {
  const saved = new Map();
  const bindings = {
    isVpsStagingMode: false, firebaseUser: { uid: 'u' }, myCompanyId: 'a', currentUser: { id: 'e' },
    rawExpenses: [{ id: 'existing', companyId: 'a' }, { id: 'foreign', companyId: 'b' }],
    parseLooseMoneyValue: Number, normalizeExpenseCategoryLabel: value => value,
    normalizeLeadingLabel: value => value, CASHFLOW_APPROVAL_STATUS: { pending: 'pending', approved: 'approved', rejected: 'rejected' },
    saveDataDocument: async (_, id, payload) => { saved.set(id, payload); return { queued: true }; },
  };
  const add = appFunction('handleAddExpense', bindings);
  const draft = { amount: 60, clientMutationId: 'exp_stable', category: 'Test' };
  assert.equal((await add('e', draft)).id, 'exp_stable');
  assert.equal((await add('e', draft)).queued, true);
  assert.equal(saved.size, 1);
  await assert.rejects(add('e', { ...draft, amount: 0 }));
  await assert.rejects(appFunction('handleAddExpense', { ...bindings, firebaseUser: null })('e', draft));
  const edit = appFunction('handleEditExpense', bindings);
  assert.equal((await edit('existing', { amount: 63 })).queued, true);
  await assert.rejects(edit('foreign', { amount: 60 }));
  await assert.rejects(edit('existing', { amount: -1 }));
  const archive = appFunction('handleDeleteExpense', bindings);
  assert.equal((await archive('existing')).queued, true);
  await assert.rejects(archive('foreign'));
});

test('finance expense form awaits durable acceptance, rejects double tap and retains draft on failure', async () => {
  const lock = { current: false }, command = { current: 'exp_stable' };
  const changes = [];
  let finish, calls = 0;
  const bindings = {
    canCreateExpense: true, expenseSubmitInFlightRef: lock, expenseMutationIdRef: command,
    newExpense: { amount: 60, category: 'Test', note: 'Draft', date: '2026-09-30' },
    normalizeExpenseCategoryLabel: value => value, parseInputCurrency: Number, normalizeLeadingLabel: value => value,
    isDriverFinanceMode: false, cashflowNeedsApproval: false, reportedCashflowRole: 'company',
    CASHFLOW_APPROVAL_STATUS: { pending: 'pending', approved: 'approved' }, getTodayString: () => '2026-09-30',
    setExpenseSaving() {}, setExpenseSaveError: value => changes.push(['error', value]),
    setShowExpenseModal: value => changes.push(['modal', value]), setNewExpense: value => changes.push(['draft', value]),
    getFriendlyFirebaseErrorMessage: error => error.message,
    onAddExpense: () => { calls++; return new Promise(resolve => { finish = resolve; }); },
  };
  const submit = appFunction('handleExpenseSubmit', bindings, { scope: 'FinanceView' });
  const first = submit({ preventDefault() {} });
  await submit({ preventDefault() {} });
  assert.equal(calls, 1);
  assert.equal(changes.some(change => change[0] === 'modal'), false);
  finish({ queued: true });
  await first;
  assert.equal(lock.current, false);
  assert.equal(command.current, '');
  assert.ok(changes.some(change => change[0] === 'modal' && change[1] === false));
  changes.length = 0;
  command.current = 'exp_retry';
  const fail = appFunction('handleExpenseSubmit', { ...bindings, onAddExpense: async () => { throw new Error('Storage full'); } }, { scope: 'FinanceView' });
  await fail({ preventDefault() {} });
  assert.equal(command.current, 'exp_retry');
  assert.equal(changes.some(change => change[0] === 'modal' || change[0] === 'draft'), false);
  assert.ok(changes.some(change => change[1] === 'Storage full'));
});

test('invoice double tap joins one command, competing edits reject and failures release the lock', async () => {
  let finish;
  let calls = 0;
  const lock = { current: null };
  const snapshot = { current: null };
  const states = [];
  const bindings = {
    orderEditInFlightRef: lock, selectedOrderSnapshotRef: snapshot,
    setOrderSaving: state => states.push(state), normalizeOrderPaymentSnapshot: value => value,
    onEditOrder: () => { calls++; return new Promise(resolve => { finish = resolve; }); },
  };
  const edit = appFunction('commitOrderEdit', bindings);
  const first = edit({ id: 'o' }, { amount: 60 });
  const second = edit({ id: 'o' }, { amount: 60 });
  await Promise.resolve();
  assert.equal(calls, 1);
  await assert.rejects(edit({ id: 'o' }, { amount: 63 }), /Đang lưu/);
  finish({ success: true, queued: true, order: { id: 'o', amount: 60 } });
  assert.equal((await first).queued, true);
  await second;
  assert.equal(snapshot.current.amount, 60);
  assert.equal(lock.current, null);
  assert.deepEqual(states, [true, false]);
  const fail = appFunction('commitOrderEdit', { ...bindings, onEditOrder: () => { throw new Error('Storage full'); } });
  await assert.rejects(fail({ id: 'o' }, { amount: 63 }), /Storage full/);
  assert.equal(lock.current, null);
});

test('delivery reports validate the session and persist before applying any UI record', async () => {
  const saved = [];
  const bindings = {
    firebaseUser: { uid: 'u' }, myCompanyId: 'a', deliveryReports: [], warehouseDispatches: [], customers: [], products: [],
    parseLooseQuantityValue: value => Number(value || 0), getTodayString: () => '2026-09-30',
    getDeliveryReportWeightStatus: () => ({ diff: 0, status: 'matched', isMismatch: false }),
    saveDataDocument: async (...args) => { saved.push(args); return { queued: true }; },
  };
  const add = appFunction('handleAddDeliveryReport', bindings);
  assert.equal(await add('e', { clientMutationId: 'stable' }), 'dr_stable');
  await add('e', { clientMutationId: 'stable' });
  assert.deepEqual(saved.map(write => write[1]), ['dr_stable', 'dr_stable']);
  await assert.rejects(appFunction('handleAddDeliveryReport', { ...bindings, firebaseUser: null })('e', {}));
  await assert.rejects(appFunction('handleAddDeliveryReport', { ...bindings, saveDataDocument: async () => { throw new Error('Storage full'); } })('e', {}), /Storage full/);
  await assert.rejects(appFunction('handleUpdateDeliveryReport', bindings)('foreign', {}), /công ty này/);
});

test('delivery compound save stages reports, payment, expense and cost without any partial acceptance', async () => {
  const plan = createDeliverySavePlan('stable');
  const reportId = plan.addReport({ customerId: 'c', actualWeightKg: 2 });
  plan.addPayment({ amount: 60, customerId: 'c', relatedDeliveryReportId: reportId });
  plan.addExpense({ amount: 3, relatedDeliveryReportId: reportId });
  const costId = plan.addCost({ amount: 3, relatedDeliveryReportId: reportId });
  plan.editReport(reportId, { assetCostLogId: costId });
  assert.equal(reportId, 'dr_stable_0');
  assert.equal(costId, 'acl_stable_3');
  const accepted = [];
  const bindings = {
    firebaseUser: { uid: 'u' }, myCompanyId: 'a', isVpsStagingMode: false, mergeAtomicWrites,
    handleAddDeliveryReport: async (_, payload, writes) => writes.push({ collectionName: 'deliveryReports', documentId: payload.id, payload }),
    handleAddPayment: async (payload, writes) => writes.push({ collectionName: 'payments', documentId: payload.id, payload }),
    handleAddExpense: async (_, payload, writes) => writes.push({ collectionName: 'expenses', documentId: payload.id, payload }),
    handleAddAssetCostLog: async (_, payload, writes) => writes.push({ collectionName: 'assetCostLogs', documentId: payload.id, payload }),
    handleUpdateDeliveryReport: async (id, payload, writes) => writes.push({ collectionName: 'deliveryReports', documentId: id, payload, options: { merge: true } }),
    saveAtomicDocuments: (key, writes) => { accepted.push({ key, writes }); return { queued: true }; },
  };
  const save = appFunction('handleSaveDeliveryCommand', bindings);
  assert.equal((await save('e', plan)).queued, true);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].key, 'delivery_stable');
  assert.equal(accepted[0].writes.length, 4);
  assert.equal(accepted[0].writes[0].payload.assetCostLogId, costId);
  assert.equal(accepted[0].writes[0].payload.customerId, 'c');
  const failing = appFunction('handleSaveDeliveryCommand', { ...bindings,
    handleAddAssetCostLog: async () => { throw new Error('Invalid cost'); },
  });
  await assert.rejects(failing('e', plan), /Invalid cost/);
  assert.equal(accepted.length, 1, 'A failure during planning must not enqueue any document');
  await assert.rejects(save('e', { commandId: 'other', operations: [{ type: 'unknown' }] }));
  assert.equal(accepted.length, 1);
  assert.throws(() => createDeliverySavePlan('../invalid'));
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('function DeliveryReportView(');
  const delivery = source.slice(start, source.indexOf('\nfunction ', start + 1));
  assert.ok(delivery.includes('if (deliverySaveInFlightRef.current) return false;'));
});

test('warehouse import retry uses stable IDs for both stock and its single expense; no side effects if durable acceptance fails', async () => {
  const commands = [];
  const bindings = {
    isVpsStagingMode: false, firebaseUser: { uid: 'u' }, myCompanyId: 'a',
    parseLooseQuantityValue: Number, parseLooseMoneyValue: value => Number(value) || 0,
    normalizeLeadingLabel: value => value, normalizeWarehouseImportSourceType: value => value,
    getWarehouseImportSourceLabel: () => 'Purchase', getTodayString: () => '2026-09-30',
    buildWarehouseImportMeasureEntries: ({ quantity, totalKg }) => [{ unit: 'kg', quantity: totalKg }, { unit: 'con', quantity }],
    CASHFLOW_APPROVAL_STATUS: { approved: 'approved' }, employeeInfo: { id: 'e' }, currentUser: { id: 'e' },
    saveAtomicDocuments: (key, writes) => { commands.push({ key, writes }); return { queued: true }; },
  };
  const add = appFunction('handleAddWarehouseImport', bindings);
  const payload = { clientMutationId: 'command1', totalKg: 10, quantity: 3, amount: 60000, sourceType: 'purchase_resale' };
  assert.equal(await add('e', payload), 'wi_command1');
  await add('e', payload);
  assert.deepEqual(commands.map(command => command.key), ['warehouseImport_wi_command1', 'warehouseImport_wi_command1']);
  assert.equal(commands[0].writes[1].documentId, 'exp_warehouse_import_wi_command1');
  assert.equal(commands[0].writes[1].payload.amount, 60000);
  await assert.rejects(appFunction('handleAddWarehouseImport', { ...bindings, firebaseUser: null })('e', payload), /Phiên/);
  await assert.rejects(appFunction('handleAddWarehouseImport', { ...bindings, saveAtomicDocuments: () => { throw new Error('Storage full'); } })('e', payload), /Storage full/);
});

test('lost delivery resolution validates all writes before one atomic order/report/penalty save', async () => {
  const commands = [];
  const bindings = {
    isVpsStagingMode: false, firebaseUser: { uid: 'u' }, myCompanyId: 'a', currentUser: { id: 'e' },
    employees: [{ id: 'e', companyId: 'a' }], deliveryReports: [{ id: 'report', companyId: 'a' }],
    deliveryResolutionInFlightRef: { current: new Set() },
    parseLooseMoneyValue: Number, capitalizeFirst: value => value, getTodayString: () => '2026-09-30',
    getFriendlyFirebaseErrorMessage: error => error.message, mergeAtomicWrites,
    handleEditOrder: async (id, payload, payment, writes) => { writes.push({ collectionName: 'orders', documentId: id, payload: { ...payload, companyId: 'a' } }); return { planned: true }; },
    saveDataDocument() { assert.fail('Planning must not write an individual record'); },
    saveAtomicDocuments: (key, writes) => { commands.push({ key, writes }); return { queued: true }; },
  };
  bindings.addFinancialRecord = appFunction('addFinancialRecord', bindings);
  const resolve = appFunction('handleResolveDeliveryReportIssue', bindings);
  const input = { reportId: 'report', action: 'lost_charged', orderId: 'order', orderData: { amount: 63 }, penaltyData: { empId: 'e', amount: 3 } };
  assert.equal((await resolve(input)).queued, true);
  await resolve(input);
  assert.equal(commands.length, 2);
  assert.equal(commands[0].writes.length, 3);
  assert.equal(commands[0].writes[1].documentId, commands[1].writes[1].documentId);
  assert.equal(commands[0].writes[1].ifAbsent, true);
  assert.equal(commands[0].writes[1].payload.sourceDeliveryReportId, 'report');
  assert.equal((await resolve({ ...input, penaltyData: { empId: 'foreign', amount: 3 } })).success, false);
  assert.equal(commands.length, 2, 'Invalid payroll recipient must not persist the order or report');
  assert.equal((await resolve({ ...input, reportId: 'foreign' })).success, false);
  assert.equal(commands.length, 2);
});

test('competing delivery decisions are locked while the compound command is being planned', async () => {
  let release;
  let saves = 0;
  const locks = { current: new Set() };
  const resolve = appFunction('handleResolveDeliveryReportIssue', {
    firebaseUser: { uid: 'u' }, myCompanyId: 'a', currentUser: { id: 'e' },
    deliveryReports: [{ id: 'report', companyId: 'a' }], deliveryResolutionInFlightRef: locks,
    parseLooseMoneyValue: value => Number(value) || 0, capitalizeFirst: value => value,
    handleEditOrder: () => new Promise(done => { release = done; }), mergeAtomicWrites,
    saveAtomicDocuments: () => { saves++; return { queued: true }; },
    getFriendlyFirebaseErrorMessage: error => error.message,
  });
  const first = resolve({ reportId: 'report', action: 'accepted', orderId: 'order', orderData: {} });
  assert.equal((await resolve({ reportId: 'report', action: 'rejected' })).success, false);
  assert.equal(saves, 0);
  release({ success: true });
  assert.equal((await first).success, true);
  assert.equal(saves, 1);
  assert.equal(locks.current.size, 0);
});

test('resolved delivery command replay preserves later order edits and rejects another decision', async () => {
  const records = new Map([
    ['report', { companyId: 'a', resolutionStatus: 'pending' }],
    ['order', { companyId: 'a', amount: 60 }],
  ]);
  const commit = writes => commitAtomicWrites({ writes, companyId: 'a', reference: write => write.documentId,
    transaction: async callback => {
      const staged = [];
      const result = await callback({ get: async id => ({ exists: () => records.has(id), data: () => records.get(id) }),
        set: (id, payload) => staged.push([id, payload]),
      });
      staged.forEach(([id, payload]) => records.set(id, payload));
      return result;
    },
  });
  const command = [
    { collectionName: 'orders', documentId: 'order', payload: { companyId: 'a', amount: 63 } },
    { collectionName: 'deliveryReports', documentId: 'report', resolveOnce: true, payload: { companyId: 'a', resolutionStatus: 'accepted', linkedOrderId: 'order' } },
  ];
  await commit(command);
  records.set('order', { companyId: 'a', amount: 70 });
  const replay = await commit(command);
  assert.equal(records.get('order').amount, 70);
  assert.equal(replay.existingDocuments[0].payload.amount, 70);
  await assert.rejects(commit([{ ...command[1], payload: { ...command[1].payload, resolutionStatus: 'rejected' } }]), error => error.code === 'firestore/delivery-resolution-conflict');
  assert.equal(records.get('report').resolutionStatus, 'accepted');
});

test('warehouse submit does not await secondary company settings and debt errors retain the form', () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const warehouse = source.slice(source.indexOf('function WarehouseImportView('), source.indexOf('function WarehouseDispatchView('));
  assert.equal(warehouse.includes('await ensureWarehouseInventoryGroupExists(groupName)'), false);
  assert.ok(warehouse.includes('if (importSubmitRef.current) return;'));
  const debt = source.slice(source.indexOf('function DebtManagementView('));
  const submit = debt.slice(debt.indexOf('const handlePaymentSubmit ='), debt.indexOf('const resolveDebtShareStatusMessage'));
  const catchBlock = submit.slice(submit.indexOf('} catch'));
  assert.equal(catchBlock.includes('resetPaymentDraft'), false);
  assert.ok(submit.includes('if (debtPaymentSubmitRef.current) return;'));
});

test('asset cost create/edit/archive submit log and linked expense as one durable command', async () => {
  const commands = [];
  const bindings = {
    firebaseUser: { uid: 'u' }, myCompanyId: 'a', assets: [{ id: 'truck' }],
    assetCostLogs: [], expenses: [], employeeInfo: { id: 'e' }, currentUser: { id: 'e' },
    parseLooseQuantityValue: Number, parseLooseMoneyValue: value => Number(value) || 0,
    getAssetDisplayLabel: () => 'Truck', getAssetCostTypeLabel: () => 'Fuel',
    normalizeExpenseCategoryLabel: value => value, normalizeLeadingLabel: value => value,
    getTodayString: () => '2026-09-30', CASHFLOW_APPROVAL_STATUS: { approved: 'approved' },
    saveAtomicDocuments: (key, writes) => { commands.push({ key, writes }); return { queued: true }; },
  };
  const add = appFunction('handleAddAssetCostLog', bindings);
  assert.equal(await add('e', { clientMutationId: 'log', assetId: 'truck', liters: 10, unitPrice: 20000 }), 'log');
  assert.equal(commands[0].writes.length, 2);
  assert.equal(commands[0].writes[1].payload.amount, 200000);
  assert.equal(commands[0].writes[0].payload.expenseId, commands[0].writes[1].documentId);
  bindings.assetCostLogs.push(commands[0].writes[0].payload);
  bindings.expenses.push(commands[0].writes[1].payload);
  await appFunction('handleEditAssetCostLog', bindings)('log', { amount: 230000 });
  await appFunction('handleDeleteAssetCostLog', bindings)('log');
  assert.deepEqual(commands.map(command => command.key), ['asset_cost_log', 'asset_cost_log', 'asset_cost_log']);
  assert.deepEqual(commands[1].writes.map(write => write.payload.amount), [230000, 230000]);
  assert.equal(commands[2].writes.every(write => write.payload.isArchived), true);
  await assert.rejects(appFunction('handleEditAssetCostLog', bindings)('missing', {}));
  const denied = appFunction('handleAddAssetCostLog', { ...bindings, saveAtomicDocuments: () => { throw new Error('Storage full'); } });
  await assert.rejects(denied('e', { clientMutationId: 'not-saved', amount: 60 }), /Storage full/);
});

test('conditional atomic payment retry never resets read/sent status and rejects command reuse with another amount', async () => {
  const records = new Map();
  let writes = 0;
  const save = data => commitAtomicWrites({ writes: data, companyId: 'a', reference: write => write.documentId,
    transaction: async callback => {
      const staged = [];
      const value = await callback({
        get: async id => ({ exists: () => records.has(id), data: () => records.get(id) }),
        set: (id, payload) => staged.push([id, payload]),
      });
      for (const [id, payload] of staged) { records.set(id, payload); writes++; }
      return value;
    },
  });
  const command = [
    { collectionName: 'payments', documentId: 'p', ifAbsent: true, payload: { companyId: 'a', amount: 60, customerId: 'c', method: 'cash' } },
    { collectionName: 'notifications', documentId: 'n', ifAbsent: true, payload: { companyId: 'a', status: 'unread' } },
    { collectionName: 'zalo_campaign_queue', documentId: 'z', ifAbsent: true, payload: { companyId: 'a', status: 'pending' } },
  ];
  await save(command);
  records.set('n', { companyId: 'a', status: 'read' });
  records.set('z', { companyId: 'a', status: 'sent' });
  assert.equal((await save(JSON.parse(JSON.stringify(command)))).existingDocuments.length, 3);
  assert.equal(writes, 3);
  assert.equal(records.get('n').status, 'read');
  assert.equal(records.get('z').status, 'sent');
  await assert.rejects(save([{ ...command[0], payload: { ...command[0].payload, amount: 63 } }]), error => error.code === 'firestore/payment-command-conflict');
  await assert.rejects(save([{ ...command[0], payload: { ...command[0].payload, relatedDeliveryReportId: 'another-report' } }]), error => error.code === 'firestore/payment-command-conflict');
  assert.equal(records.get('p').amount, 60);
});

test('payment command rejects invalid form or storage failure without an optimistic money record', async () => {
  const commands = [];
  const bindings = {
    isVpsStagingMode: false, firebaseUser: { uid: 'u' }, myCompanyId: 'a', orders: [], currentCompany: {}, currentUser: { id: 'e' },
    resolveMatchedOrderFromTransfer: () => null, capitalizeFirst: value => value,
    parseLooseMoneyValue: Number, CASHFLOW_APPROVAL_STATUS: { approved: 'approved', pending: 'pending' },
    isOrderCodeAutoMatchEnabled: () => false,
    buildPaymentConfirmationWrites: payload => [{ collectionName: 'notifications', documentId: `notice_${payload.id}`, ifAbsent: true, payload: { companyId: 'a' } }],
    saveAtomicDocuments: (key, writes) => { commands.push({ key, writes }); return { queued: true }; },
  };
  const add = appFunction('handleAddPayment', bindings);
  const form = { clientMutationId: 'p1', customerId: 'c', amount: 60, method: 'cash' };
  await add(form);
  await add(form);
  assert.deepEqual(commands.map(command => command.key), ['payment_p1', 'payment_p1']);
  assert.equal(commands[0].writes.length, 2);
  assert.equal(commands[0].writes[0].ifAbsent, true);
  await assert.rejects(add({ ...form, amount: 0 }));
  assert.equal(commands.length, 2);
  await assert.rejects(appFunction('handleAddPayment', { ...bindings, saveAtomicDocuments: () => { throw new Error('Storage full'); } })(form), /Storage full/);
});

test('automatic retry is finite, honors backoff and excludes permanent failures and another actor', () => {
  const first = pendingWriteFailure({}, { code: 'firestore/unavailable' }, 1000);
  assert.equal(first.syncState, 'queued');
  assert.equal(canAutomaticallyRetryWrite(first, 'u', 1001), false);
  assert.equal(canAutomaticallyRetryWrite(first, 'u', 31000), true);
  const denied = pendingWriteFailure(first, { code: 'permission-denied' }, 1000);
  assert.equal(denied.syncState, 'blocked');
  assert.equal(canAutomaticallyRetryWrite(denied, 'u', 999999), false);
  const exhausted = pendingWriteFailure({ attempts: 5 }, { code: 'unavailable' });
  assert.equal(exhausted.syncState, 'paused');
  assert.equal(canAutomaticallyRetryWrite(exhausted, 'u', Date.now() + 999999), false);
  assert.equal(canAutomaticallyRetryWrite({ payload: { actorUid: 'other' } }, 'u'), false);
  assert.equal(canAutomaticallyRetryWrite({ actorUid: 'other' }, 'u'), false);
  const queue = createSaveQueueHarness([{ key: 'products:p', actorUid: 'other' }]);
  assert.throws(() => queue.enqueue({ collectionName: 'products', documentId: 'p', payload: {} }), /tài khoản khác/);
  assert.equal(isRetryableWriteError({ code: 'auth/unauthenticated' }), false);
  const harness = createSaveQueueHarness([{ key: 'products:p', attempts: 6, syncState: 'paused', payload: { price: 60 } }]);
  harness.enqueue({ collectionName: 'products', documentId: 'p', payload: { price: 63 }, durable: true });
  assert.equal(harness.queue.current[0].attempts, 0);
  assert.equal(harness.queue.current[0].syncState, 'queued');
});

test('UI timeout never releases actual write lock; a new revision waits for the real ACK', async () => {
  const write = { key: 'products:p', companyId: 'a', collectionName: 'products', documentId: 'p', revision: '1', payload: { price: 60 } };
  const queue = { current: [write] };
  const lock = { current: new Map() };
  const commits = [];
  const bindings = {
    isVpsStagingMode: false, activeTenantScopeRef: { current: 'a' }, normalizeTenantStorageScope: value => value,
    pendingFirebaseWritePromisesRef: lock, pendingFirebaseWritesRef: queue,
    doc: () => ({}), db: {}, appId: 'test', firestoreSdkFailedRef: { current: false },
    runResilientFirestoreWrite: ({ sdkWrite }) => sdkWrite(),
    setDoc: (_, payload) => new Promise(resolve => commits.push({ payload, resolve })),
    isFirestoreInternalAssertionError: () => false,
    persistPendingFirebaseWrites: writes => { queue.current = writes; },
    scheduleCollectionRefresh() { assert.fail('An acknowledged document must not reload its collection'); }, setRealtimeStatus() {}, isSamePendingWriteRevision, ATOMIC_SAVE_COLLECTION, expandPendingWrites,
    applyLocalCollectionWrite() {},
  };
  let flush;
  bindings.flushPendingFirebaseWriteNow = (...args) => flush(...args);
  flush = appFunction('flushPendingFirebaseWriteNow', bindings);
  const first = flush('products', 'p', 1);
  assert.equal(lock.current.size, 1);
  queue.current = [{ ...write, revision: '2', payload: { price: 63 } }];
  assert.equal(flush('products', 'p'), first);
  assert.equal(commits.length, 1);
  commits[0].resolve();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.equal(commits.length, 2);
  commits[1].resolve();
  assert.equal((await first).confirmed, true);
  assert.equal(lock.current.size, 0);
});

test('confirmation preserves permission errors and timeout only means pending, never success', async () => {
  const denied = Object.assign(new Error('Denied'), { code: 'permission-denied' });
  const bindings = {
    activeTenantScopeRef: { current: 'a' }, isRetryableWriteError,
    flushPendingFirebaseWriteNow: async () => { throw denied; }, withTimeout: value => value,
  };
  await assert.rejects(appFunction('requireSharedWriteConfirmation', bindings)({ queued: true }, 'products', 'p'), error => error === denied);
  const timeout = Object.assign(new Error('Deadline'), { code: 'HD_TIMEOUT' });
  await assert.rejects(appFunction('requireSharedWriteConfirmation', { ...bindings, withTimeout: () => Promise.reject(timeout), flushPendingFirebaseWriteNow: () => new Promise(() => {}) })({ queued: true }, 'products', 'p'), error => error.code === 'firestore/sync-pending' && error.cause === timeout);
});

test('rejected optimistic write restores only server truth and does not overwrite a newer edit', async () => {
  const command = { companyId: 'a', key: 'products:p', collectionName: 'products', documentId: 'p', revision: '1', syncState: 'blocked' };
  const queue = { current: [command] };
  const restored = [];
  let finishRead;
  const bindings = {
    activeTenantScopeRef: { current: 'a' }, pendingFirebaseWritesRef: queue, isSamePendingWriteRevision, expandPendingWrites,
    recentLocalWritesRef: { current: new Map([['products:p', {}]]) },
    db: {}, appId: 'test', doc: () => ({}), withTimeout: promise => promise,
    firebaseGetDocFromServer: () => new Promise(resolve => { finishRead = resolve; }),
    applyLocalCollectionWrite: (...args) => restored.push(args),
  };
  const restore = appFunction('restoreRejectedPendingWrite', bindings);
  const first = restore(command);
  finishRead({ exists: () => true, data: () => ({ companyId: 'a', price: 60 }) });
  await first;
  assert.equal(restored[0][2].price, 60);
  const second = restore(command);
  queue.current = [{ ...command, revision: '2', syncState: 'queued' }];
  finishRead({ exists: () => true, data: () => ({ companyId: 'a', price: 60 }) });
  await second;
  assert.equal(restored.length, 1);
});
