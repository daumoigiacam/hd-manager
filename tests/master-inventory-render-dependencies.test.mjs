import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readApplicationSource } from '../scripts/helpers/application-source.cjs';
import test from 'node:test';
import { parse } from '@babel/parser';

const baseline = execFileSync('git', ['show', '5f162f5:src/App.jsx'], { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });
const current = readApplicationSource();
function declarations(source) {
  const found = new Map();
  function visit(node, owner = '') {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration') owner = node.id.name;
    if (node.type === 'VariableDeclarator' && node.id?.name && node.init) found.set(`${owner}.${node.id.name}`, node.init);
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'extra', 'comments'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(child => visit(child, owner));
      else if (value?.type) visit(value, owner);
    }
  }
  visit(parse(source, { sourceType: 'module', plugins: ['jsx'] }));
  return found;
}
const before = declarations(baseline);
const after = declarations(current);
const text = (source, node) => source.slice(node.start, node.end).replace(/\r\n/g, '\n');
const execute = (source, node, bindings) => new Function(...Object.keys(bindings), `return (${text(source, node)});`)(...Object.values(bindings));
const globalBindings = {};
const baselineBindings = {};
for (const name of ['LOOKUP_NORMALIZATION_CACHE_LIMIT', 'LOOKUP_NORMALIZATION_MAX_LENGTH', 'lookupNormalizationCache']) {
  const node = after.get(`.${name}`);
  assert.ok(node, `Actual normalization cache binding ${name}`);
  globalBindings[name] = execute(current, node, globalBindings);
}
const astShape = node => {
  if (Array.isArray(node)) return node.map(astShape);
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(Object.entries(node)
    .filter(([key]) => !['loc', 'start', 'end', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments'].includes(key))
    .map(([key, value]) => [key, astShape(value)]));
};
for (const name of ['capitalizeFirst', 'normalizeLeadingLabel', 'normalizeLookupText', 'getProductMainGroupLabel']) {
  if (name === 'normalizeLookupText') {
    // Cache branches change the function body, not the frozen normalization chain.
    const normalized = after.get(`.${name}`).body.body
      .filter(node => node.type === 'VariableDeclaration')
      .flatMap(node => node.declarations).find(node => node.id.name === 'normalized');
    assert.ok(normalized, 'The actual uncached normalization expression remains explicit');
    assert.deepEqual(astShape(normalized.init), astShape(before.get(`.${name}`).body), `${name} must retain its exact formula`);
  } else {
    assert.equal(text(current, after.get(`.${name}`)), text(baseline, before.get(`.${name}`)), `${name} must retain its formula`);
  }
  globalBindings[name] = execute(current, after.get(`.${name}`), globalBindings);
  baselineBindings[name] = execute(baseline, before.get(`.${name}`), baselineBindings);
}

for (const owner of ['WarehouseImportView', 'WarehouseDispatchView']) {
  test(`${owner}: group callback keeps the exact baseline body and depends only on module helpers`, () => {
    const node = after.get(`${owner}.getWarehouseStockGroupLabel`);
    assert.equal(node.type, 'CallExpression');
    assert.equal(node.callee.name, 'useCallback');
    assert.deepEqual(node.arguments[1].elements, []);
    assert.equal(text(current, node.arguments[0]), text(baseline, before.get(`${owner}.getWarehouseStockGroupLabel`)));
    const actual = execute(current, node.arguments[0], globalBindings);
    const original = execute(baseline, before.get(`${owner}.getWarehouseStockGroupLabel`), baselineBindings);
    for (const item of [{}, { groupName: '  g\u00e0  ' }, { productGroup: 'V\u1ecbt' }, { productNameSnapshot: 'Heo' }, { productName: 'Bao' }]) {
      for (const product of [null, {}, { mainGroup: 'A', category: 'B' }, { name: 'G\u00e0', category: '' }]) {
        assert.equal(actual(item, product), original(item, product));
      }
    }
    const product = { mainGroup: 'Before', category: 'Before' };
    assert.equal(actual({}, product), 'Before');
    product.mainGroup = product.category = 'After';
    assert.equal(actual({}, product), 'After', 'callback identity must not cache mutable record output');
  });
}

test('removed legacy calendar has no eager scan; native date filtering and actual stock calculations remain',()=>{
 for(const name of ['warehouseCalendarCells','warehouseImportCalendarMap','warehouseExportCalendarMap','warehouseStockCalendarMap','getWarehouseCalendarStat','warehouseCalendarTitle','warehouseCalendarCountLabel','handleWarehouseCalendarMonthChange'])assert.equal(after.has('WarehouseImportView.'+name),false,name+' is not a hidden eager calculation');
 assert.match(current,/aria-label="Chọn ngày xem danh sách nhập kho"/);
 assert.ok(after.has('WarehouseImportView.dayImports'));
 assert.ok(after.has('WarehouseImportView.buildWarehouseStockRowsForDate'));
 assert.ok(after.has('WarehouseImportView.warehouseStockRows'));
});
