import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readApplicationSource } from '../scripts/helpers/application-source.cjs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { parse } from '@babel/parser';
import { test } from 'node:test';
import { selectLatestWarehouseStockCountMeasures } from '../src/utils/warehouseInventory.js';
import './warehouse-dispatch-command.test.mjs';
import './warehouse-dispatch-edit-ack.test.mjs';
import {assertAuditedMutationWiring} from './helpers/audited-handler-gates.mjs';
import {appFunction} from './helpers/app-source-function.mjs';

const baseline = execFileSync('git', ['show', '5f162f5:src/App.jsx'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
const current = readApplicationSource();
function callback(source) {
  source = source.replace(/\r\n/g, '\n');
  const start = source.indexOf('  const warehouseMovementTableRows = useMemo(() => {');
  const end = source.indexOf('\n  }, [', start);
  assert.ok(start > 0 && end > start);
  return source.slice(start + '  const warehouseMovementTableRows = useMemo('.length, end) + '\n  }';
}
const before = callback(baseline);
const after = callback(current);
const normalize = value => String(value || '').toLowerCase();
function context(tab, unit = 'kg', hidden = false) {
  const measures = [{ unit: 'Kg', quantity: 10 }, { unit: 'Con', quantity: 2 }];
  return {
    warehouseInventoryTab: tab,
    warehouseMovementUnitFilter: unit,
    warehouseMovementSelectedUnitLabel: unit,
    warehouseMovementMonthKey: '2026-10',
    warehouseMovementMonthDateKeys: ['2026-10-01', '2026-10-02'],
    warehouseImports: [
      { id: 'i1', date: '2026-10-01', groupName: 'A', measures },
      { id: 'i2', date: '2026-10-02', groupName: 'A', measures },
      { id: 'archived', date: '2026-10-01', groupName: 'A', measures, isArchived: true },
    ],
    warehouseDispatches: [{ id: 'd1', date: '2026-10-01', groupName: 'A', measures: [{ unit: 'Kg', quantity: 4 }] }],
    warehouseStockCounts: [{ id: 's1', date: '2026-10-01', groupName: 'A', updatedAt: 1, measures: [{ unit: 'Kg', quantity: 5 }] }],
    hiddenWarehouseStockUnitKeyMap: new Map(),
    hiddenWarehouseStockGroupKeys: new Set(hidden ? ['a'] : []),
    productLookup: new Map(),
    normalizeLookupText: normalize,
    buildProcessingInventoryGroupKey: normalize,
    normalizeLeadingLabel: value => value,
    normalizeWarehouseMeasureUnit: value => value,
    annotateWarehouseMeasureRows: rows => rows,
    parseLooseQuantityValue: value => Number(value) || 0,
    parseEntityTimestampValue: value => Number(value) || 0,
    getEntityTimestamp: item => item.updatedAt || 0,
    resolveWarehouseRecordDateKey: item => item.date,
    isAfterWarehouseStockReset: () => true,
    getWarehouseStockGroupLabel: item => item.groupName,
    buildStoredWarehouseMeasureEntries: item => item.measures,
    buildWarehouseDispatchMeasureEntries: item => item.measures,
    buildStoredWarehouseStockCountMeasureEntries: item => item.measures,
    selectLatestWarehouseStockCountMeasures,
    buildWarehouseStockRowsForDate: () => [{ key: 'a', groupName: 'A', measureRows: [{ unit: 'Kg', remaining: 6 }, { unit: 'Con', remaining: 2 }] }],
  };
}
const evaluate = (body, values) => JSON.parse(JSON.stringify(vm.runInNewContext(`(${body})()`, values)));

test('active report formula retains baseline except explicit pending-ACK exclusion', () => {
  assert.equal(after.split(' && !item?.__pendingFirebaseSync').length - 1, 1);
  assert.equal(after.replace(' && !item?.__pendingFirebaseSync', '').replace(/    \/\/ The monthly table[^\n]*\n    if \(warehouseInventoryTab !== 'report'\) return \[\];\n/, ''), before);
});
test('pending dispatch does not enter monthly totals before ACK', () => {
  const values = context('report');
  const expected = evaluate(after, values);
  values.warehouseDispatches.push({ ...values.warehouseDispatches[0], id: 'pending', __pendingFirebaseSync: true });
  assert.deepEqual(evaluate(after, values), expected);
});
test('hidden import/export/stock views do not read monthly data', () => {
  for (const tab of ['import', 'export', 'stock']) {
    const values = { warehouseInventoryTab: tab };
    Object.defineProperty(values, 'warehouseImports', { get() { throw new Error('Hidden scan'); } });
    assert.deepEqual(evaluate(after, values), []);
  }
});
test('report results retain units, archived exclusion, actual stock and hidden groups', () => {
  for (const unit of ['kg', 'con']) for (const hidden of [false, true]) {
    const values = context('report', unit, hidden);
    assert.deepEqual(evaluate(after, values), evaluate(before, values));
  }
  const rows = evaluate(after, context('report'));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].imported, 10);
  assert.equal(rows[0].exported, 4);
  assert.equal(rows[0].expected, 6);
  assert.equal(rows[0].actual, 5);
  assert.equal(rows[0].status, 'loss');
  assert.equal(rows[1].actual, null);
});
test('hidden report does not clear selection; report visibility invalidates memo', () => {
  assert.match(current, /warehouseMovementUnitFilter,\s*warehouseStockCounts,\s*warehouseInventoryTab\s*\]\);/);
  assert.match(current, /useEffect\(\(\) => \{\s*if \(warehouseInventoryTab !== 'report'\) return;\s*if \(!selectedWarehouseMovementRowKey\) return;/);
});
test('unaffected canonical mutation handlers retain their frozen baseline; audited changes use current behavior gates', () => {
  const handlers = source => {
    const result = new Map();
    const normalized = source.replace(/\r\n/g, '\n');
    const walk = node => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'VariableDeclarator' && node.id?.name && node.init) {
        result.set(node.id.name, normalized.slice(node.init.start, node.init.end));
      }
      for (const [key, value] of Object.entries(node)) {
        if (['loc', 'start', 'end', 'extra', 'comments'].includes(key)) continue;
        if (Array.isArray(value)) value.forEach(walk);
        else if (value?.type) walk(value);
      }
    };
    walk(parse(normalized, { sourceType: 'module', plugins: ['jsx'] }));
    return result;
  };
  const oldHandlers = handlers(baseline);
  const newHandlers = handlers(current);
  for (const name of [
    'saveDataDocument', 'handleDeletePayment', 'handleDeleteExpense',
    'handleAddCustomer', 'handleDeleteCustomer',
    'handleAddProduct', 'handleEditProduct', 'handleDeleteProduct',
    // Customer configuration and order-request saves now share a transaction;
    // their atomicity/concurrency contract is exercised against the Emulator.
    'handleDeleteOrderRequest',
    'handleAddWarehouseImport', 'handleEditWarehouseImport', 'handleDeleteWarehouseImport',
    // Dispatch now has command identity/ACK semantics, covered by the imported
    // command and edit-ACK behavioral suites, not the old source-equality lock.
  ]) {
    assert.ok(oldHandlers.has(name), name);
    const clean=node=>JSON.parse(JSON.stringify(node,(key,value)=>['loc','start','end','extra','leadingComments','trailingComments','innerComments'].includes(key)?undefined:value));
    const expression=text=>parse(`(${text})`,{sourceType:'module',plugins:['jsx']}).program.body[0].expression;
    assert.deepEqual(clean(expression(newHandlers.get(name))),clean(expression(oldHandlers.get(name))),name);
  }
  assertAuditedMutationWiring(newHandlers);
});
test('product floating action reserves footer space outside staff-only shells', () => {
  const css = readFileSync(new URL('../src/design-system/foundation.css', import.meta.url), 'utf8');
  assert.match(css, /\n\.hd-module-fab\.hd-product-module-fab \{\s*bottom: calc\(max\(var\(--hd-footer-height, 0px\), var\(--hd-bottom-nav-height, 4rem\)\)\s*\+ var\(--hd-space-3, 0\.75rem\)\);\s*\}/);
});

test('actual canonical expense parents retain tenant and asset guards before any persistence or write-plan staging',async()=>{
  const writes=[],writePlan=[],base={isVpsStagingMode:false,firebaseUser:{uid:'actor'},myCompanyId:'tenant',assets:[],currentUser:{id:'actor'},parseLooseMoneyValue:Number,
    saveDataDocument:async(...args)=>{writes.push(args);}};
  await assert.rejects(appFunction('handleAddExpense',base)('actor',{clientMutationId:'expense',assetId:'foreign',amount:50000},writePlan),/công ty/);
  await assert.rejects(appFunction('handleEditExpense',{...base,rawExpenses:[{id:'expense',companyId:'foreign'}]})('expense',{},writePlan),/công ty/);
  await assert.rejects(appFunction('handleEditExpense',{...base,rawExpenses:[{id:'expense',companyId:'tenant'}]})('expense',{assetId:'foreign'},writePlan),/công ty/);
  assert.deepEqual(writes,[]);assert.deepEqual(writePlan,[]);
});
