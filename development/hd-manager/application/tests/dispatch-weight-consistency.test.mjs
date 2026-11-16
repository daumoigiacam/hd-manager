import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from '@babel/parser';
import { buildDispatchEditableRows, requireSingleDispatchSource } from '../src/features/warehouse/dispatchEditableRows.js';
import { resolveDispatchWeightWrite } from '../src/features/warehouse/dispatchWeightModel.js';
import { formatDispatchNumberInput } from '../src/features/warehouse/dispatchNumberInput.js';
import { getWarehouseWeightEntryTotal, normalizeWarehouseWeightEntries } from '../src/utils/warehouseWeightEntries.js';
import { createWarehouseDispatch, updateWarehouseDispatch } from '../src/features/warehouse/warehouseDispatchUseCases.js';
import { originalDispatchCreate, originalDispatchUpdate } from '../src/features/warehouse/warehouseDispatchOriginalPlan.js';
import { buildWarehouseDispatchPresentationGroups } from '../src/utils/warehouseDispatchGrouping.js';
import { buildDispatchHistoryRows } from '../src/features/warehouse/dispatchDialogModels.js';
import { renderDispatchSheetCanvas } from '../src/features/warehouse/renderDispatchSheetCanvas.js';

const entries = [27.3, 27.3, 29.9, 28.5, 29.8];
const first = { id: 'qa-first', companyId: 'qa-company', customerId: 'qa-customer', productId: 'qa-product',
  date: '2026-11-16', sourceOrderRequestId: 'qa-request', quantity: 80, pieceCount: 80, quantityUnit: 'Con',
  weightKg: 27.3, weightEntries: [27.3], updatedAt: '2026-11-16T01:00:00Z' };
const second = { ...first, id: 'qa-second', quantity: 73, pieceCount: 73, weightKg: 142.8, weightEntries: entries };
const read = { weight: row => Number(row.weightKg), quantity: row => Number(row.quantity), unit: row => row.quantityUnit };

test('reported case: 27.3 + 142.8 is two editable documents, not a 170.1 kg row opening a 142.8 kg editor', () => {
  const rows = buildDispatchEditableRows([first, second], read);
  assert.deepEqual(rows.map(r => [r.id, r.quantity, r.weightKg]), [['qa-first', 80, 27.3], ['qa-second', 73, 142.8]]);
  for (const row of rows) assert.equal(requireSingleDispatchSource(row).weightKg, row.weightKg);
  assert.equal(buildWarehouseDispatchPresentationGroups({ rows })[0].rows.length, 2);
  assert.equal(getWarehouseWeightEntryTotal(rows.map(r => r.weightKg)), 170.1);
  assert.equal(rows.reduce((sum, row) => sum + row.quantity, 0), 153);
  assert.deepEqual(second.weightEntries, entries);
});
test('legacy aggregate cannot silently target only its first document', () => {
  assert.throws(() => requireSingleDispatchSource({ id: 'merged', sourceRows: [first, second] }), /nhiều phiếu/);
});
test('two equal legitimate measurements are retained; totals are exact to one gram', () => {
  assert.equal(getWarehouseWeightEntryTotal(entries), 142.8);
  assert.equal(getWarehouseWeightEntryTotal(['0,1', '0.2', '27.123']), 27.423);
  assert.equal(formatDispatchNumberInput(27.123), '27.123');
  assert.equal(getWarehouseWeightEntryTotal(entries.map(formatDispatchNumberInput)), 142.8);
});
test('history detail preserves decimal commas instead of truncating 142,8 to 142', () => {
  const rows = buildDispatchHistoryRows([{ ...second, weightKg: '142,8' }], {
    customers: new Map(), products: new Map(), timestamp: () => 0,
    productShortName: () => 'VB', quantity: read.quantity, unit: read.unit,
  });
  assert.equal(rows[0].weightKg, 142.8);
});
test('shared dispatch sheet formats decimal kg from the same source document', async () => {
  const text = [];
  const ctx = new Proxy({}, { get: (_obj, name) => name === 'measureText' ? () => ({ width: 0 })
    : name === 'fillText' ? value => text.push(value) : () => {}, set: () => true });
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ctx }) };
  try {
    await renderDispatchSheetCanvas([{ ...second, weightKg: '142,8' }], second.date, {
      companyName: 'QA', formatDateLabel: value => value,
      formatNumber: value => new Intl.NumberFormat('vi-VN').format(value), compactProductName: value => value,
    });
    assert.ok(text.includes('142,8')); assert.ok(!text.includes('NaN'));
  } finally { globalThis.document = previousDocument; }
});
test('write boundary rejects mismatched total before any durable write', () => {
  assert.throws(() => resolveDispatchWeightWrite({ weightKg: 170.1, weightEntries: entries }), /không khớp/);
  assert.deepEqual(resolveDispatchWeightWrite({ weightEntries: entries }), { weightKg: 142.8, weightEntries: entries });
  assert.equal(resolveDispatchWeightWrite({ weightKg: '142,8', weightEntries: entries }).weightKg, 142.8);
  assert.deepEqual(resolveDispatchWeightWrite({ weightKg: 42 }), { weightKg: 42 });
  assert.deepEqual(resolveDispatchWeightWrite({ weightEntries: [] }, second), { weightKg: 0, weightEntries: [] });
});
for (const bad of ['-27.3', '27abc', '27.1234', NaN, Infinity, '1 2']) {
  test(`reject malformed measurement ${String(bad)}`, () => {
    assert.throws(() => resolveDispatchWeightWrite({ weightEntries: [bad] }), /kg/);
  });
}

function context(rows = [first, second]) {
  const writes = [];
  return { writes, rawWarehouseDispatches: rows, customers: [], products: [], myCompanyId: 'qa-company',
    parseLooseQuantityValue: value => Number(String(value ?? 0).replace(',', '.')),
    normalizeLeadingLabel: value => value, normalizeLookupText: value => String(value || '').toLowerCase(),
    normalizeProductPricingUnit: value => value, parseLooseMoneyValue: value => Number(value || 0),
    isSameBillingUnit: (a, b) => a === b, getTodayString: () => '2026-11-16', getEntityTimestamp: () => 0,
    editedAt: '2026-11-16T03:00:00Z', pendingFirebaseWritesRef: { current: [] },
    enqueuePendingFirebaseWrite: write => { writes.push(write); return { queued: true }; },
    setRawWarehouseDispatches() {}, rememberRecentLocalWrite() {}, requireSharedWriteConfirmation: async () => {},
    saveDataDocument: async (collectionName, documentId, payload) => { writes.push({ collectionName, documentId, payload }); return { queued: true }; } };
}
for (const [name, create, update] of [['online', createWarehouseDispatch, updateWarehouseDispatch], ['offline plan', originalDispatchCreate, originalDispatchUpdate]]) {
  test(`${name}: inconsistent create/update cannot enqueue or acknowledge`, async () => {
    const c = context();
    await assert.rejects(create('qa-employee', { ...second, weightKg: 170.1 }, c), /không khớp/);
    await assert.rejects(update(second.id, { weightKg: 170.1 }, 'qa-employee', c), /không khớp/);
    assert.equal(c.writes.length, 0);
  });
  test(`${name}: edit replaces total and recalculates kg billing, preserving sibling/quantity/price`, async () => {
    const base = { ...second, billingUnit: 'Kg', unitPrice: 57000, amount: 8139600 };
    const c = context([first, base]);
    await update(second.id, { weightEntries: [27.3, 27.3, 29.9, 28.5, 30] }, 'qa-employee', c);
    const w = c.writes[0];
    assert.equal(w.documentId, second.id); assert.equal(c.writes.length, 1);
    assert.equal(w.payload.weightKg, 143); assert.equal(w.payload.billingQuantity, 143);
    assert.equal(w.payload.amount, 8151000); assert.equal(w.payload.pieceCount, 73);
    assert.equal(w.payload.updatedByEmpId, 'qa-employee');
    assert.equal(first.weightKg, 27.3); assert.equal(first.quantity, 80);
    assert.deepEqual(second.weightEntries, entries);
  });
  test(`${name}: unrelated edit does not silently repair historical weight or recalculate amount`, async () => {
    const c = context([{ ...second, weightKg: 170.1, amount: 123 }]);
    await update(second.id, { note: 'unchanged weight' }, 'qa-employee', c);
    assert.equal(c.writes[0].payload.weightKg, 170.1);
    assert.equal(Object.hasOwn(c.writes[0].payload, 'amount'), false);
    assert.equal(Object.hasOwn(c.writes[0].payload, 'weightEntries'), false);
  });
}

const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const ast = parse(app, { sourceType: 'module', plugins: ['jsx'] });
let saveNode;
function visit(node) { if (!node || typeof node !== 'object') return;
  if (node.type === 'VariableDeclarator' && node.id?.name === 'saveDispatchListWeightEntries') saveNode = node.init;
  for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value?.type) visit(value);
}
visit(ast);
export function saveHandler(bindings) { return new Function(...Object.keys(bindings), `return (${app.slice(saveNode.start, saveNode.end)});`)(...Object.values(bindings)); }
export function saveBindings(rows, onEdit) {
  const editor = { rowId: second.id, sourceBaseWeightKg: second.weightKg, sourceWeightEntries: entries,
    sourceUpdatedAt: second.updatedAt, sourceDate: second.date };
  const errors = [];
  return { dispatchListWeightEditor: editor, canEdit: true, employee: { id: 'qa-employee' }, dispatchListWeightSaveLockRef: { current: false },
    normalizeWarehouseWeightEntries, getWarehouseWeightEntryTotal, editableDispatchRows: rows,
    getDispatchRowWeight: read.weight, formatDispatchNumberInput, workingDate: '2026-11-16',
    setIsSavingDispatchListWeight() {}, setDispatchError: error => errors.push(error), setDispatchListWeightEditor() {},
    getFriendlyFirebaseErrorMessage: error => error.message, onEditWarehouseDispatch: onEdit, errors };
}
test('actual parent save callback prevents overwrite when realtime changes during editing', async () => {
  let writes = 0;
  const b = saveBindings([first, { ...second, weightKg: 144 }], async () => { writes++; });
  await saveHandler(b)({ entries });
  assert.equal(writes, 0); assert.match(b.errors[0], /đã thay đổi/); assert.equal(b.dispatchListWeightSaveLockRef.current, false);
});
test('actual parent callback ignores re-entrant double taps and does not add to the prior total', async () => {
  let writes = 0, release;
  const b = saveBindings([first, second], async (_id, payload) => { writes++; assert.equal(payload.weightKg, '142.8'); await new Promise(resolve => { release = resolve; }); });
  const save = saveHandler(b); const running = save({ entries }); await save({ entries });
  assert.equal(writes, 1); release(); await running;
  assert.equal(b.dispatchListWeightSaveLockRef.current, false);
});
