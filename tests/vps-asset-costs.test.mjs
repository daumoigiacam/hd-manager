import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadVpsAssetCosts, mergeVpsAssetCosts, mergeVpsAssetCostExpenses, mergeVpsFinanceExpenseSnapshot, normalizeVpsAssetCost, saveVpsAssetCost, vpsAssetCostPayload } from '../src/api/vpsAssetCosts.js';
import { normalizeVpsFinanceExpense } from '../src/api/hdConnectStaging.js';

const session = { id: randomUUID(), companyId: randomUUID(), permissions: ['logistics.read', 'logistics.manage', 'finance.read', 'finance.manage'] };
const form = { assetId: randomUUID(), driverId: '', type: 'fuel', costType: 'maintenance', date: '2026-09-06', kmAt: '100', liters: '10', unitPrice: '20000', amount: 200000, note: 'Fuel', receiptImageUrl: '', odometerImageUrl: '', receiptStorageFileId: '', odometerStorageFileId: '' };
const response = (input = form, changes = {}) => {
  const cost = vpsAssetCostPayload(input), id = randomUUID(), expenseId = randomUUID();
  return { ...cost, id, expenseId, companyId: session.companyId, version: '2026-09-06T01:00:00.000Z', isArchived: false, vpsAssetCost: true,
    expense: { id: expenseId, companyId: session.companyId, amount: String(cost.amount), status: 'APPROVED' }, ...changes };
};

test('cost form preserves explicit amount even when it differs from liters * unit price', () => {
  assert.equal(vpsAssetCostPayload({ ...form, amount: 215000 }).amount, 215000);
  assert.equal(vpsAssetCostPayload({ ...form, liters: '' }).liters, 0);
});
test('cost form carries only durable VPS storage IDs for receipt evidence', () => {
  const receiptStorageFileId = randomUUID(), odometerStorageFileId = randomUUID();
  const payload = vpsAssetCostPayload({ ...form, receiptStorageFileId, odometerStorageFileId });
  assert.equal(payload.receiptStorageFileId, receiptStorageFileId);
  assert.equal(payload.odometerStorageFileId, odometerStorageFileId);
  assert.throws(() => vpsAssetCostPayload({ ...form, receiptStorageFileId: 'legacy-file' }));
});
for (const [name, patch] of Object.entries({ booleanMoney: { amount: false }, arrayMoney: { amount: [] }, foreignLink: { relatedExpenseId: randomUUID() }, delivery: { relatedDeliveryReportId: randomUUID() }, image: { receiptImageUrl: 'data:image/png;base64,x' }, fractionalMoney: { amount: 1.001 }, invalidDate: { date: '2026-02-30' }, skip: { skipExpenseSync: true } })) {
  test(`rejects ${name} before any request`, async () => {
    let calls = 0;
    await assert.rejects(saveVpsAssetCost({ createManagerAssetCost: () => { calls++; } }, session, null, { ...form, ...patch }));
    assert.equal(calls, 0);
  });
}
test('requires both logistics and finance permissions', async () => {
  await assert.rejects(saveVpsAssetCost({}, { ...session, permissions: ['logistics.manage'] }, null, form), /PERMISSION/);
});
test('transport retry retains request ID, successful later create receives a fresh ID', async () => {
  const ids = []; let fail = true;
  const api = { createManagerAssetCost: async body => { ids.push(body.requestId); if (fail) { fail = false; throw new Error('connection'); } return response(body.cost); } };
  await assert.rejects(saveVpsAssetCost(api, session, null, form), /connection/);
  await saveVpsAssetCost(api, session, null, form);
  await saveVpsAssetCost(api, session, null, form);
  assert.equal(ids[0], ids[1]); assert.notEqual(ids[1], ids[2]);
});
test('update and archive carry version and verify persisted result', async () => {
  const current = response();
  const result = await saveVpsAssetCost({ updateManagerAssetCost: async (id, body) => {
    assert.equal(id, current.id); assert.equal(body.version, current.version);
    return { ...current, ...body.cost, version: '2026-09-06T01:01:00.000Z', expense: { ...current.expense, amount: '220000' } };
  } }, session, current, { ...form, amount: 220000 });
  assert.equal(result.amount, 220000);
  const archived = await saveVpsAssetCost({ archiveManagerAssetCost: async (id, body) => {
    assert.equal(id, result.id); assert.equal(body.version, result.version); assert.equal(body.cost, undefined);
    return { ...result, isArchived: true, version: '2026-09-06T01:02:00.000Z' };
  } }, session, result, null, true);
  assert.equal(archived.isArchived, true);
});
test('rejects cross-tenant response and mismatched expense amount', () => {
  assert.throws(() => normalizeVpsAssetCost(response(form, { companyId: randomUUID() }), session.companyId));
  const row = response(); row.expense.amount = '1';
  assert.throws(() => normalizeVpsAssetCost(row, session.companyId));
});
test('list is paginated and merge preserves historical records without reclassifying them', async () => {
  const native = response(), legacy = { id: 'legacy_cost_1', companyId: session.companyId, amount: 111 };
  const loaded = await loadVpsAssetCosts({ listManagerAssetCosts: async query => { assert.equal(query.includeArchived, 'true'); return { items: [native], nextOffset: null }; } }, session);
  const rows = mergeVpsAssetCosts([legacy], loaded.items, session.companyId);
  assert.deepEqual(rows.find(row => row.id === legacy.id), legacy);
  assert.equal(rows.length, 2);
});
test('linked expense uses explicit legacy approved cashflow semantics without claiming bank posting', () => {
  const costId = randomUUID();
  const item = normalizeVpsFinanceExpense({ id: randomUUID(), companyId: session.companyId, amount: '200000', status: 'APPROVED',
    metadata: { hdManagerAssetCost: { kind: 'NATIVE_CREATE', costId }, assetCostLogId: costId, sourceType: 'asset_cost_log' } });
  assert.equal(item.requiresApproval, false); assert.equal(item.approvalStatus, 'approved'); assert.equal(item.handoverStatus, 'confirmed'); assert.equal(item.readOnly, true);
});

test('reload restores linked expenses, preserves unrelated history and rejects stale refresh overwrites', () => {
  const cost = response();
  const legacy = { id: 'legacy-expense', companyId: session.companyId, amount: 42 };
  const first = mergeVpsAssetCostExpenses([legacy], [cost], session.companyId);
  assert.equal(first.find(item => item.id === cost.expenseId).amount, 200000);
  const latest = { ...cost, amount: 215000, version: '2026-09-06T01:01:00.000Z', expense: { ...cost.expense, amount: '215000' } };
  const changed = mergeVpsAssetCostExpenses(first, [latest], session.companyId);
  const stale = mergeVpsAssetCostExpenses(changed, [cost], session.companyId);
  assert.equal(stale.find(item => item.id === cost.expenseId).amount, 215000);
  assert.equal(stale.find(item => item.id === legacy.id), legacy);
  assert.throws(() => mergeVpsAssetCostExpenses(stale, [{ ...cost, companyId: randomUUID() }], session.companyId));
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /setRawExpenses\(previous => mergeVpsAssetCostExpenses\(previous, assetCostsResult.value.items, currentUser.companyId\)\)/);
});

test('a delayed complete finance snapshot cannot erase a newer cost receipt or commit a partial page', () => {
  const cost = response();
  const saved = mergeVpsAssetCostExpenses([], [cost], session.companyId);
  const stale = { ...cost.expense, amount: '100000', updatedAt: '2026-09-06T00:00:00.000Z' };
  assert.equal(mergeVpsFinanceExpenseSnapshot(saved, { complete: true, items: [stale] }, session.companyId)[0].amount, 200000);
  assert.equal(mergeVpsFinanceExpenseSnapshot(saved, { complete: true, items: [] }, session.companyId)[0].amount, 200000);
  assert.throws(() => mergeVpsFinanceExpenseSnapshot(saved, { items: [stale] }, session.companyId));
  assert.throws(() => mergeVpsFinanceExpenseSnapshot(saved, { complete: true, items: [{ ...stale, companyId: randomUUID() }] }, session.companyId));
  const fresh = { ...stale, amount: '220000', updatedAt: '2026-09-06T01:01:00.000Z' };
  assert.equal(mergeVpsFinanceExpenseSnapshot(saved, { complete: true, items: [fresh] }, session.companyId)[0].amount, 220000);
});
test('UI waits for save/archive, preserves failed form and exposes cost tab', () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const submit = source.slice(source.indexOf('  const handleCostSubmit ='), source.indexOf('  const sectionItems = (isVpsApiMode'));
  assert.match(submit, /if \(isSavingCost \|\| isUploadingAssetEvidence\)/);
  assert.match(submit, /await onDeleteAssetCostLog/);
  assert.match(submit, /catch \(error\)/);
  assert.doesNotMatch(submit, /VPS chưa hỗ trợ nhật ký/);
  assert.match(source, /onUploadAssetEvidence\(file, purpose\)/);
  assert.match(source, /receiptStorageFileId/);
  assert.match(source, /id: 'costs', label: 'Nhật ký chi phí'/);
});

function uiHandlers(extra = {}) {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const source = app.slice(app.indexOf('  const handleCostSubmit ='), app.indexOf('  const sectionItems = (isVpsApiMode'));
  let closed = 0;
  const statuses = [];
  const bindings = {
    isVpsApiMode: true, isSavingCost: false, isUploadingAssetEvidence: false, costForm: form, editingCostLog: null, canDeleteAssetCostLog: true,
    setIsSavingCost() {}, setAssetSaveStatus: value => statuses.push(value), closeCostForm: () => { closed++; },
    parseLooseQuantityValue: Number, parseLooseMoneyValue: Number, window: { confirm: () => true },
    onAddAssetCostLog: async () => response(), onEditAssetCostLog: async () => response(),
    onDeleteAssetCostLog: async () => ({ success: true }), ...extra,
  };
  return { ...new Function(...Object.keys(bindings), `${source}\nreturn { handleCostSubmit, handleCostArchive };`)(...Object.values(bindings)), closed: () => closed, statuses };
}

test('actual cost UI keeps failed drafts open and closes only after an awaited confirmed save/archive', async () => {
  for (const result of [null, { success: false }]) {
    const ui = uiHandlers({ editingCostLog: response(), onEditAssetCostLog: async () => result, onDeleteAssetCostLog: async () => result });
    await ui.handleCostSubmit({ preventDefault() {} });
    await ui.handleCostArchive();
    assert.equal(ui.closed(), 0);
    assert.ok(ui.statuses.at(-1));
  }
  let reject;
  const ui = uiHandlers({ onAddAssetCostLog: () => new Promise((resolve, fail) => { reject = fail; }) });
  const saving = ui.handleCostSubmit({ preventDefault() {} });
  assert.equal(ui.closed(), 0);
  reject(new Error('ASSET_COST_CHANGED_RELOAD'));
  await saving;
  assert.equal(ui.closed(), 0);
  assert.equal(ui.statuses.at(-1), 'ASSET_COST_CHANGED_RELOAD');
  const success = uiHandlers({ editingCostLog: response() });
  await success.handleCostSubmit({ preventDefault() {} });
  await success.handleCostArchive();
  assert.equal(success.closed(), 2);
});

test('actual cost UI preserves entered amount and loaded version without calculating a new accounting rule', async () => {
  const current = response();
  let submitted;
  const ui = uiHandlers({ editingCostLog: current, costForm: { ...form, amount: '215000' }, onEditAssetCostLog: async (id, body) => { submitted = { id, ...body }; return current; } });
  await ui.handleCostSubmit({ preventDefault() {} });
  assert.equal(submitted.id, current.id);
  assert.equal(submitted.version, current.version);
  assert.equal(submitted.amount, 215000);
  assert.equal(submitted.liters, 10);
  assert.equal(submitted.unitPrice, 20000);
});
