import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '@babel/parser';
import {createOrderCreationAdmission} from '../src/services/orderCreationAdmission.js';
import {findDuplicateWarehouseDispatchIds, getWarehouseDispatchIds} from '../src/utils/warehouseDispatchOrders.js';

const identity = 'tenant-a:account-a:session-a:permissions-a';
const turn = () => new Promise(resolve => setImmediate(resolve));
const create = (callback, ready = false, timeoutMs = 1000) => {
  const gate = createOrderCreationAdmission({timeoutMs});
  gate.update({identity, ready, callback});
  return gate;
};

test('creation waits for fresh reconciliation and invokes once with unchanged arguments', async () => {
  const calls = [], args = ['employee', {amount: 680400}, {upfrontPayment: 0}];
  const callback = (...values) => {calls.push(values); return 'order-1';};
  const gate = create(callback);
  const pending = gate.run(args, identity);
  await turn(); assert.equal(calls.length, 0);
  for (let n = 0; n < 5; n++) {gate.update({identity, ready: false, callback}); await turn();}
  assert.equal(calls.length, 0);
  gate.update({identity, ready: true, callback});
  assert.equal(await pending, 'order-1');
  assert.equal(calls.length, 1); assert.strictEqual(calls[0][1], args[1]);
  assert.deepEqual(calls[0], args);
});

test('the callback uses the latest committed data after waiting', async () => {
  const gate = create(() => {throw Error('stale callback');});
  const pending = gate.run([], identity);
  gate.update({identity, ready: true, callback: () => 'latest'});
  assert.equal(await pending, 'latest');
});

test('a retained display snapshot alone never authorizes creation; timeout retains input and never fires later', async () => {
  let writes = 0;
  const callback = () => writes++;
  const gate = create(callback, false, 25);
  const draft = {localId: 'kept', amount: 680400};
  const before = JSON.stringify(draft);
  await assert.rejects(gate.run([draft], identity), {code: 'source-not-ready'});
  gate.update({identity, ready: true, callback}); await turn();
  assert.equal(writes, 0); assert.equal(JSON.stringify(draft), before);
});

for (const nextIdentity of ['tenant-b:account-a:session-a:permissions-a', 'tenant-a:account-b:session-a:permissions-a', 'tenant-a:account-a:session-b:permissions-a', 'tenant-a:account-a:session-a:permissions-b', '']) {
  test('pending creation is revoked when scope becomes ' + (nextIdentity || 'closed route'), async () => {
    let writes = 0;
    const callback = () => writes++;
    const gate = create(callback);
    const pending = gate.run([], identity);
    gate.update({identity: nextIdentity, ready: true, callback});
    gate.update({identity, ready: true, callback});
    await assert.rejects(pending, {code: 'read-owner-changed'});
    assert.equal(writes, 0);
  });
}

test('unmount cancels waiting creation, including StrictMode remount of same identity', async () => {
  let writes = 0;
  const callback = () => writes++;
  const gate = create(callback);
  const pending = gate.run([], identity);
  gate.cancel(); gate.update({identity, ready: true, callback});
  await assert.rejects(pending, {code: 'read-owner-changed'});
  assert.equal(writes, 0);
  await gate.run([], identity); assert.equal(writes, 1);
});

test('a stale caller cannot start a new creation in another owner scope', async () => {
  const gate = create(() => {throw Error('must not write');}, true);
  await assert.rejects(gate.run([], 'old-owner'), {code: 'read-owner-changed'});
});

test('source permission errors reject the pending creation without converting them into success', async () => {
  const denied = Object.assign(Error('Denied'), {code: 'permission-denied'});
  const gate = create(() => {throw Error('must not write');});
  const pending = gate.run([], identity);
  gate.update({identity, ready: false, error: denied});
  await assert.rejects(pending, error => error === denied);
});

test('a genuine server duplicate or an ambiguous transaction timeout is never automatically retried', async () => {
  for (const code of ['already-linked', 'HD_TIMEOUT']) {
    let calls = 0;
    const error = Object.assign(Error(code), {code});
    const callback = () => {calls++; throw error;};
    const gate = create(callback, true);
    await assert.rejects(gate.run([], identity), failure => failure === error);
    gate.update({identity, ready: true, callback}); await turn();
    assert.equal(calls, 1);
  }
});

const source = fs.readFileSync(new URL('../src/features/legacy/OrderManagementView.jsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
let handler;
const declarations = new Map();
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'VariableDeclarator' && node.id.name === 'handleSubmitBulkOrders') handler = node.init;
  if (node.type === 'VariableDeclarator' && node.id.name && node.init) declarations.set(node.id.name, node.init);
  for (const value of Object.values(node)) {if (Array.isArray(value)) value.forEach(visit); else if (value?.type) visit(value);}
}
visit(parse(source, {sourceType: 'module', plugins: ['jsx']}));
assert.ok(handler);
const actualHandler = bindings => Function(...Object.keys(bindings), 'return (' + source.slice(handler.start, handler.end) + ')')(...Object.values(bindings));
const actualDeclaration = (name, bindings) => {
  const node = declarations.get(name);
  assert.ok(node);
  return Function(...Object.keys(bindings), 'return (' + source.slice(node.start, node.end) + ')')(...Object.values(bindings));
};
const duplicateChecker = orders => {
  const bindings = {getWarehouseDispatchIds, activeProducts: [], normalizeLookupText: String, parseLooseQuantityValue: Number, parseLooseMoneyValue: Number, getTodayString: () => '2026-11-21', resolveEntityDateKey: row => row.date};
  bindings.buildOrderDuplicateSignature = actualDeclaration('buildOrderDuplicateSignature', bindings);
  return actualDeclaration('findDuplicateBulkOrderDrafts', {...bindings, activeOrders: orders});
};

test('different physical dispatches with the same customer, product, quantity, price and day are not duplicate invoices', () => {
  const a = {sourceDispatchIds: ['dispatch-a'], customerId: 'one-customer', date: '2026-11-21', items: [{productId: 'p', quantity: 10, unitPrice: 42000}]};
  const b = {...a, sourceDispatchIds: ['dispatch-b']};
  assert.deepEqual(duplicateChecker([])([a,b]), []);
  assert.deepEqual(duplicateChecker([a])([b]), []);
});

test('same dispatch remains duplicate after price/date/branch changes, including item-level source links', () => {
  const a = {sourceDispatchIds: ['same'], customerId: 'one-customer', date: '2026-11-21', items: [{productId: 'p', quantity: 10, unitPrice: 42000}]};
  const b = {...a, sourceDispatchIds: [], date: '2026-11-22', branchId: 'another', items: [{productId:'p',quantity:11,unitPrice:44000,sourceDispatchId:'same'}]};
  assert.equal(duplicateChecker([a])([b]).length, 1);
  assert.equal(duplicateChecker([])([a,b]).length, 1);
});

test('manual draft duplicate protection still compares customer, product, quantity, price and day', () => {
  const a = {customerId:'c',date:'2026-11-21',items:[{productId:'p',quantity:10,unitPrice:42000}]};
  assert.equal(duplicateChecker([])([a,{...a}]).length, 1);
  assert.equal(duplicateChecker([a])([{...a}]).length, 1);
});

function batch(count = 46) {
  const state = {drafts: Array.from({length: count}, (_,n) => ({localId: 'draft-' + n, sourceType: 'warehouse_dispatch', sourceDispatchIds: ['dispatch-' + n], items: [{quantity: 16.2, unitPrice: 42000}]})), status: '', orders: [], lock: {current: false}};
  const bind = submit => actualHandler({
    isBulkOrderSubmitting: false, bulkOrderSubmittingRef: state.lock, isWarehouseBulkReview: true,
    canUseWarehouseOrderSource: true, canUseImageOrderSource: false, bulkOrderSource: 'warehouse',
    bulkOrderDrafts: state.drafts, orderRecordsForDuplicateCheck: state.orders,
    setBulkOrderStatus: value => {state.status = value;}, setErrorMsg: () => {},
    findDuplicateWarehouseDispatchIds, findDuplicateBulkOrderDrafts: () => [],
    setIsBulkOrderSubmitting: () => {}, submitOrderDraft: submit,
    setBulkOrderDrafts: value => {state.drafts = typeof value === 'function' ? value(state.drafts) : value;},
    setShowAddOrder: () => {}, setShowOrderSourcePicker: () => {}, setOrderCreationSource: () => {},
    closeBulkDraftFeeEditor: () => {}, formatDateLabel: String, selectedWarehouseDispatchDate: '2026-11-20',
    isOrderSaveTimeoutError: error => error.code === 'HD_TIMEOUT', getFriendlyFirebaseErrorMessage: error => error.message,
  });
  return {state, bind};
}

test('actual bulk handler creates all 46 drafts despite refresh after every server ACK; rapid double-submit does not duplicate', async () => {
  const {state, bind} = batch();
  const gate = create(null, true);
  const callback = async draft => {
    assert.equal(findDuplicateWarehouseDispatchIds([draft], state.orders).length, 0);
    await turn();
    state.orders.push({id: draft.localId, sourceDispatchIds: draft.sourceDispatchIds});
    gate.update({identity, ready: false, callback});
    setImmediate(() => gate.update({identity, ready: true, callback}));
    return {orderId: draft.localId};
  };
  gate.update({identity, ready: true, callback});
  const submit = bind(draft => gate.run([draft], identity));
  const first = submit(); await submit(); await first;
  assert.equal(state.orders.length, 46); assert.equal(state.drafts.length, 0);
  assert.equal(new Set(state.orders.map(order => order.id)).size, 46);
  assert.match(state.status, /Đã tạo 46 đơn hàng/); assert.equal(state.lock.current, false);
});

test('failure at draft 3 removes only the confirmed prefix; retry submits exactly the remaining 44 once', async () => {
  const {state, bind} = batch();
  const original = state.drafts.map(draft => JSON.stringify(draft));
  let attempts = 0;
  await bind(async draft => {
    if (++attempts === 3) throw Object.assign(Error('Chưa đối chiếu xong'), {code: 'source-not-ready'});
    state.orders.push({id: draft.localId, sourceDispatchIds: draft.sourceDispatchIds});
    return {orderId: draft.localId};
  })();
  assert.equal(state.orders.length, 2); assert.equal(state.drafts.length, 44);
  assert.deepEqual(state.drafts.map(draft => JSON.stringify(draft)), original.slice(2));
  assert.match(state.status, /Đã tạo 2 đơn; giữ lại 44 bản nháp/);
  await bind(async draft => {
    assert.equal(findDuplicateWarehouseDispatchIds([draft], state.orders).length, 0);
    state.orders.push({id: draft.localId, sourceDispatchIds: draft.sourceDispatchIds});
    return {orderId: draft.localId};
  })();
  assert.equal(state.orders.length, 46); assert.equal(state.drafts.length, 0);
});

test('unknown ACK retains the current draft and all remaining drafts without claiming success', async () => {
  const {state, bind} = batch(3);
  await bind(async draft => {
    if (draft.localId === 'draft-1') throw Object.assign(Error('Unknown ACK'), {code: 'HD_TIMEOUT'});
    state.orders.push({id: draft.localId, sourceDispatchIds: draft.sourceDispatchIds}); return {};
  })();
  assert.equal(state.orders.length, 1); assert.deepEqual(state.drafts.map(draft => draft.localId), ['draft-1', 'draft-2']);
  assert.match(state.status, /2 bản nháp chưa xác nhận/);
});

test('genuine source-dispatch duplicates still stop before creating anything', async () => {
  const {state, bind} = batch(3);
  state.orders.push({id: 'old-order', sourceDispatchIds: ['dispatch-1']});
  let calls = 0;
  await bind(async () => {calls++;})();
  assert.equal(calls, 0); assert.equal(state.drafts.length, 3); assert.match(state.status, /chặn tạo trùng/);
});

test('the canonical UI waits behind the unchanged full ledger guard, captures the read owner, and locks draft editing during submission', () => {
  assert.match(app, /orderMutationsReady=mainLedgerReady&&orderLedgerSourcesReady/);
  assert.match(app, /runOrderCreation=useOrderCreationAdmission\(\{identity:activeTab==='orders'\?orderReadIdentity:'',ready:orderMutationsReady,error:mainLedgerProjection.error,callback:onAddOrder\}/);
  assert.ok(app.includes('onAddOrder={(...args)=>runOrderCreation(args,orderReadIdentity)}'));
  assert.match(source, /<fieldset disabled=\{isBulkOrderSubmitting\}/);
  assert.match(source, /const closeAddOrderModal = \(\) => \{\s*if \(bulkOrderSubmittingRef.current\) return;/);
  const transaction = app.slice(app.indexOf('const handleAddOrder ='), app.indexOf('const handleEditOrder ='));
  assert.match(transaction, /await runTransaction\(db/);
  assert.match(transaction, /transaction.get\(orderRef\)/);
  assert.match(transaction, /isWarehouseDispatchAlreadyLinked\(dispatch\)/);
});
