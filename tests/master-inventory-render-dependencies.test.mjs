import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from '@babel/parser';

const baseline = execFileSync('git', ['show', '5f162f5:src/App.jsx'], { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });
const current = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
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

test('actual import calendar memo no longer scans exports after draft-only rerenders', () => {
  const group = after.get('WarehouseImportView.getWarehouseStockGroupLabel');
  const calendar = after.get('WarehouseImportView.warehouseExportCalendarMap');
  const rows = [{ date: '2026-10-02', productId: 'p1', weightKg: 2 }];
  let scans = 0;
  let callback;
  let memo;
  let dependencies;
  const bindings = { ...globalBindings,
    productLookup: new Map([['p1', { name: 'Chicken', category: 'Bird' }]]),
    warehouseDispatches: rows,
    isAfterWarehouseStockReset: () => true,
    resolveWarehouseRecordDateKey: row => { scans++; return row.date; },
    buildProcessingInventoryGroupKey: value => value.toLowerCase(),
    buildWarehouseDispatchMeasureEntries: row => [{ unit: 'Kg', quantity: row.weightKg }],
    parseLooseQuantityValue: Number,
    useCallback: fn => { callback ||= fn; return callback; },
    useMemo: (fn, next) => {
      if (!dependencies || next.some((value, index) => !Object.is(value, dependencies[index]))) memo = fn();
      dependencies = next;
      return memo;
    },
  };
  const render = () => {
    bindings.getWarehouseStockGroupLabel = execute(current, group, bindings);
    return execute(current, calendar, bindings);
  };
  const initial = render();
  assert.equal(initial.get('2026-10-02').totalKg, 2);
  assert.equal(scans, 1);
  for (let draftChange = 0; draftChange < 20; draftChange++) assert.equal(render(), initial);
  assert.equal(scans, 1, 'unchanged source movements must not be traversed for local input state');
  bindings.warehouseDispatches = [{ ...rows[0], weightKg: 3 }];
  assert.equal(render().get('2026-10-02').totalKg, 3);
  assert.equal(scans, 2, 'real movement changes must invalidate calendar calculations');
  bindings.productLookup = new Map([['p1', { category: 'Changed group' }]]);
  assert.deepEqual([...render().get('2026-10-02').groupKeys], ['changed group']);
  assert.equal(scans, 3);
});
