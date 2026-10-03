import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import babelTraverse from '@babel/traverse';

const traverse = babelTraverse.default || babelTraverse;
const root = new URL('../', import.meta.url);
const frozenRoot = new URL('test-results/master-baseline/', root);
const baselineRevision = '5f162f5ce85fd4dc746382f13a6a4170e4a29775';
const hasFrozenApp = existsSync(new URL('src/App.jsx', frozenRoot));
const today = '2026-10-03';
process.env.TZ = 'Asia/Ho_Chi_Minh';
class HistoryDate extends Date {
  constructor(...args) { super(...(args.length ? args : [`${today}T12:00:00+07:00`])); }
  static now() { return new HistoryDate().getTime(); }
}
const globals = { Array, Object, Map, Set, WeakMap, Number, String, Boolean, Math, Intl,
  Date: HistoryDate, RegExp, JSON, parseInt, parseFloat, undefined, NaN, Infinity };
const modules = new Map();
const gitSources = new Map();

function baselineSource(path, { useFrozen = true, hasFile = existsSync } = {}) {
  const file = new URL(path, frozenRoot);
  if (useFrozen && hasFile(file)) return { source: readFileSync(file, 'utf8'), origin: 'frozen' };
  if (!gitSources.has(path)) {
    gitSources.set(path, execFileSync('git', ['show', `${baselineRevision}:${path}`], {
      cwd: fileURLToPath(root), encoding: 'utf8', maxBuffer: 30 * 1024 * 1024,
    }));
  }
  return { source: gitSources.get(path), origin: 'git' };
}

function moduleAst(revision, path = 'src/App.jsx') {
  const key = `${revision}:${path}`;
  if (modules.has(key)) return modules.get(key);
  assert.ok(path.startsWith('src/') && !path.includes('..'), `Unexpected dependency ${path}`);
  // Git is the CI oracle; ignored frozen files are only an additional local
  // reference. Neither a missing frozen App nor helper needs a shipped artifact.
  const { source, origin } = revision === 'current'
    ? { source: readFileSync(new URL(path, root), 'utf8'), origin: 'current' }
    : baselineSource(path, { useFrozen: revision === 'baseline' });
  const tree = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const top = new Map();
  const scoped = new Map();
  const imports = new Map();
  const exports = new Map();
  const add = (statement, destination) => {
    if (statement?.type === 'VariableDeclaration') {
      for (const d of statement.declarations) {
        if (d.id.type === 'Identifier' && d.init) destination.set(d.id.name, d.init);
      }
    }
    if (statement?.type === 'FunctionDeclaration') destination.set(statement.id.name, statement);
  };
  for (const statement of tree.program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    add(declaration, top);
    if (declaration?.type === 'FunctionDeclaration' && declaration.id.name === 'WarehouseImportView') {
      for (const child of declaration.body.body) add(child, scoped);
    }
    if (statement.type === 'ImportDeclaration') {
      for (const specifier of statement.specifiers) imports.set(specifier.local.name, { specifier, path: statement.source.value });
    }
    if (statement.type === 'ExportNamedDeclaration') {
      if (declaration?.type === 'VariableDeclaration') {
        for (const d of declaration.declarations) exports.set(d.id.name, d.id.name);
      }
      if (declaration?.type === 'FunctionDeclaration') exports.set(declaration.id.name, declaration.id.name);
      for (const s of statement.specifiers || []) exports.set(s.exported.name, s.local.name);
    }
  }
  const result = { source, origin, top, scoped, imports, exports, expressions: new Map() };
  modules.set(key, result);
  return result;
}

function expressionDependencies(module, name, node) {
  if (module.expressions.has(node)) return module.expressions.get(node);
  const text = `const ${name} = (${module.source.slice(node.start, node.end)});`;
  const dependencies = new Set();
  traverse(parse(text, { sourceType: 'module' }), {
    ReferencedIdentifier(path) {
      if (!path.scope.hasBinding(path.node.name, true)) dependencies.add(path.node.name);
    },
  });
  const result = { text, dependencies: [...dependencies] };
  module.expressions.set(node, result);
  return result;
}

function historyHarness(revision) {
  const helpers = new Map();
  const hooks = new Map();
  const calls = new Map();
  const memo = (key, factory, deps) => {
    assert.ok(Array.isArray(deps), `Missing dependency array ${key}`);
    const previous = hooks.get(key);
    if (previous && previous.deps.length === deps.length
      && deps.every((value, i) => Object.is(value, previous.deps[i]))) return previous.value;
    const value = factory();
    hooks.set(key, { deps: deps.slice(), value });
    return value;
  };
  return {
    calls,
    render(input) {
      const values = new Map();
      const resolving = new Set();
      const resolve = (name, path = 'src/App.jsx', allowScoped = true) => {
        const module = moduleAst(revision, path);
        const scoped = allowScoped && module.scoped.has(name);
        const key = `${path}:${scoped ? 'WarehouseImportView:' : ''}${name}`;
        if (path === 'src/App.jsx' && Object.hasOwn(input, name)) return input[name];
        if (Object.hasOwn(globals, name)) return globals[name];
        if (values.has(key)) return values.get(key);
        if (!scoped && helpers.has(key)) return helpers.get(key);
        assert.ok(!resolving.has(key), `Circular history dependency ${key}`);
        if (!scoped && module.imports.has(name)) {
          const imported = module.imports.get(name);
          assert.equal(imported.specifier.type, 'ImportSpecifier', `Unsupported import ${key}`);
          assert.ok(imported.path.startsWith('.'), `Do not execute external App import ${imported.path}`);
          const importedPath = posix.normalize(posix.join(posix.dirname(path), imported.path));
          const local = moduleAst(revision, importedPath).exports.get(imported.specifier.imported.name);
          assert.ok(local, `Missing export ${importedPath}:${name}`);
          const result = resolve(local, importedPath, false);
          helpers.set(key, result);
          return result;
        }
        const node = (scoped ? module.scoped : module.top).get(name);
        assert.ok(node, `Missing ${revision} history dependency ${key}`);
        assert.notEqual(name, 'WarehouseImportView', 'Never execute the component');
        const { text, dependencies } = expressionDependencies(module, name, node);
        resolving.add(key);
        const bindings = dependencies.map(dependency => {
          if (dependency === 'useMemo') return (factory, deps) => memo(key, factory, deps);
          if (dependency === 'useCallback') return (callback, deps) => memo(key, () => callback, deps);
          return resolve(dependency, path, scoped);
        });
        let result = new Function(...dependencies, `"use strict"; ${text} return ${name};`)(...bindings);
        if (['buildStoredWarehouseMeasureEntries', 'buildWarehouseDispatchMeasureEntries'].includes(name)) {
          const actual = result;
          result = (...args) => {
            calls.set(name, (calls.get(name) || 0) + 1);
            return actual(...args);
          };
        }
        resolving.delete(key);
        values.set(key, result);
        if (!scoped) helpers.set(key, result);
        return result;
      };
      return {
        build: resolve('buildWarehouseStockRowsForDate'),
        monthDates: resolve('warehouseMovementMonthDateKeys'),
        prepared: revision === 'current' ? resolve('preparedWarehouseStockMovements') : null,
        productLookup: resolve('productLookup'),
      };
    },
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}
const fixture = (extra = {}) => ({ products: [], warehouseImports: [], warehouseDispatches: [],
  warehouseStockCounts: [], currentCompany: {}, workingDate: today, ...extra });
function pair(input) {
  const original = structuredClone(input);
  const a = deepFreeze(structuredClone(input));
  const b = deepFreeze(structuredClone(input));
  const before = historyHarness('git-baseline');
  const after = historyHarness('current');
  const old = before.render(a);
  const current = after.render(b);
  const c = hasFrozenApp ? deepFreeze(structuredClone(input)) : null;
  const frozen = hasFrozenApp ? historyHarness('baseline').render(c) : null;
  if (frozen) assert.deepStrictEqual(frozen.monthDates, old.monthDates, 'Frozen and pinned Git month keys');
  return {
    old, current, before, after,
    compare(date) {
      const expected = old.build(date);
      const actual = current.build(date);
      assert.deepStrictEqual(actual, expected, `Exact rows, Maps, measures, warnings and order at ${date}`);
      if (frozen) {
        assert.deepStrictEqual(frozen.build(date), expected, `Independent frozen/Git full-output parity at ${date}`);
        assert.deepStrictEqual(c, original);
      }
      assert.deepStrictEqual(a, original);
      assert.deepStrictEqual(b, original);
      return actual;
    },
  };
}
const stamp = (date, time = '12:00:00') => `${date}T${time}+07:00`;
const movement = (id, date, quantity, extra = {}) => ({
  id, date, groupName: 'Ga', quantityUnit: 'Con', quantity, totalKg: quantity * 2, ...extra,
});

test('CI baseline needs no ignored artifact; local frozen formula is independently checked against pinned Git', t => {
  const git = moduleAst('git-baseline');
  assert.equal(git.origin, 'git');
  const missing = baselineSource('src/App.jsx', { hasFile: () => false });
  assert.equal(missing.origin, 'git');
  assert.equal(missing.source, git.source, 'Missing artifact must load pinned Git App, not current App');
  if (!hasFrozenApp) {
    assert.equal(moduleAst('baseline').origin, 'git');
    t.diagnostic(`No local frozen App; all fixtures use Git ${baselineRevision}`);
    return;
  }
  const frozen = moduleAst('baseline');
  assert.equal(frozen.origin, 'frozen');
  const formula = module => JSON.stringify(module.scoped.get('buildWarehouseStockRowsForDate'), (key, value) => (
    ['start', 'end', 'loc', 'extra', 'leadingComments', 'trailingComments', 'innerComments'].includes(key) ? undefined : value
  ));
  assert.ok(git.scoped.has('buildWarehouseStockRowsForDate'));
  assert.ok(frozen.scoped.has('buildWarehouseStockRowsForDate'));
  const identical = formula(git) === formula(frozen);
  t.diagnostic(`Frozen/Git callback formulas ${identical ? 'identical' : 'different'}; both baselines replay every fixture independently`);
});

test('actual scoped callbacks and supporting hooks replay empty days/months and default dates', () => {
  const p = pair(fixture());
  assert.equal(p.current.monthDates.length, 31);
  assert.deepEqual(p.current.monthDates, p.old.monthDates);
  for (const date of [undefined, '', '2026-10-01', `${today}T18:00:00Z`, ...p.current.monthDates]) {
    assert.deepEqual(p.compare(date), []);
  }
});

test('stock counts exclude target day and only include movements strictly after each unit baselineAt', () => {
  const input = fixture({
    warehouseImports: [movement('opening', '2026-09-30', 100),
      movement('before', '2026-10-02', 10, { createdAt: stamp('2026-10-02', '11:00:00') }),
      movement('equal-baseline', '2026-10-02', 2, { createdAt: stamp('2026-10-02') }),
      movement('date-only-baseline', '2026-10-02', 50),
      movement('after', '2026-10-02', 3, { createdAt: stamp('2026-10-02', '13:00:00') }),
      movement('today', today, 5), movement('archived', today, 999, { isArchived: true })],
    warehouseDispatches: [movement('d-before', '2026-10-02', 2, { createdAt: stamp('2026-10-02', '11:00:00') }),
      movement('d-after', '2026-10-02', 1, { createdAt: stamp('2026-10-02', '13:00:00') }),
      movement('d-today', today, 4), movement('d-archived', today, 999, { isArchived: true })],
    warehouseStockCounts: [movement('count-2', '2026-10-02', 20, { createdAt: stamp('2026-10-02') }),
      movement('count-3', today, 999, { createdAt: stamp(today, '18:00:00') }),
      movement('archived-count', '2026-10-02', 500, { isArchived: true })],
  });
  const p = pair(input);
  const rows = p.compare(today);
  assert.equal(rows[0].remainingQty, 23);
  assert.equal(rows[0].remainingKg, 46);
  assert.equal(rows[0].measureRows.find(m => m.unit === 'Con').baselineItemId, 'count-2');
  for (const date of ['2026-10-01', '2026-10-02', '2026-10-04']) p.compare(date);
});

test('per-unit count baselines preserve zero, timestamp ties, source order and different unit dates', () => {
  const input = fixture({
    warehouseStockCounts: [
      { id: 'kg-old', date: '2026-10-01', groupName: 'Ga', countedMeasures: [{ unit: 'Kg', quantity: 8 }] },
      { id: 'tie-first', date: '2026-10-02', createdAt: stamp('2026-10-02'), groupName: 'Ga', countedMeasures: [{ unit: 'Con', quantity: 7 }] },
      { id: 'tie-last-zero', date: '2026-10-02', createdAt: stamp('2026-10-02'), groupName: 'Ga', countedMeasures: [{ unit: 'Con', quantity: 0 }] },
    ],
    warehouseImports: [movement('new', today, 1, { totalKg: 0 })],
  });
  const row = pair(input).compare(today)[0];
  assert.equal(row.remainingQty, 1);
  assert.equal(row.remainingKg, 8);
  assert.equal(row.measureRows.find(m => m.unit === 'Con').baselineItemId, 'tie-last-zero');
  assert.equal(row.measureRows.find(m => m.unit === 'Kg').baselineItemId, 'kg-old');
});

function seededFixture(seed) {
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
  const pick = values => values[Math.floor(random() * values.length)];
  const dates = ['2026-09-29', ...Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`), '2026-11-01', '', 'bad'];
  const units = ['Con', 'con', 'Kg', 'kg', 'Bao', 'Th\u00f9ng', 'C\u00e1i', 'Khay', ''];
  const quantities = [0, -2, 0.1, 0.2, 7, '2,5', '12 Con', undefined, NaN, Infinity];
  const groups = ['Ga', 'Vit', 'Bao', 'GA', 'Unknown'];
  const records = (kind, size) => Array.from({ length: size }, (_, i) => {
    const date = pick(dates);
    return { id: `${kind}-${i}`, date, createdAt: date.length === 10 ? stamp(date, pick(['08:00:00', '12:00:00', '18:00:00'])) : undefined,
      groupName: pick(groups), quantity: pick(quantities), quantityUnit: pick(units), totalKg: pick(quantities),
      productId: pick(['p', 'duplicate', 'missing']), isArchived: random() < 0.15,
      extraMeasures: [{ unit: pick(units), quantity: pick(quantities) }],
    };
  });
  return fixture({
    products: [{ id: 'p', name: 'Ga', mainGroup: 'Ga', unit: 'Con' },
      { id: 'duplicate', mainGroup: 'Ga', unit: 'Con' }, { id: 'duplicate', mainGroup: 'Bao', unit: 'Kg' }],
    warehouseImports: records('i', 36), warehouseDispatches: records('d', 28),
    warehouseStockCounts: records('c', 12).map((r, i) => i % 2 ? r : {
      ...r, countedMeasures: [{ unit: 'Con', quantity: i % 3 ? 4 : 0 }, { unit: 'Kg', quantity: i + 0.2 }],
    }),
    currentCompany: { warehouseStockResetAt: seed % 2 ? stamp('2026-10-04', '10:00:00') : '' },
  });
}

for (const seed of [1, 17, 20261003]) {
  test(`seed ${seed}: exact day/month parity for 31 ascending, descending and repeated dates`, () => {
    const p = pair(seededFixture(seed));
    assert.deepEqual(p.current.monthDates, p.old.monthDates);
    for (const date of [...p.current.monthDates, ...p.current.monthDates.toReversed(), today, '2026-10-01', today]) p.compare(date);
  });
}

test('reset boundaries include equal timestamps, date-only fallback and malformed reset values', () => {
  for (const reset of ['', 'invalid', stamp('2026-10-02')]) {
    const p = pair(fixture({ currentCompany: { warehouseStockResetAt: reset },
      warehouseImports: [movement('old', '2026-10-01', 10),
        movement('before', '2026-10-02', 2, { createdAt: stamp('2026-10-02', '11:59:59') }),
        movement('equal', '2026-10-02', 3, { createdAt: stamp('2026-10-02') }),
        movement('date-only', '2026-10-02', 4),
        movement('after', '2026-10-02', 5, { createdAt: stamp('2026-10-02', '12:00:01') }),
        movement('undated', '', 100)],
    }));
    for (const date of ['2026-10-01', '2026-10-02', today]) p.compare(date);
  }
});

test('immutable edit/clone/archive/count/reset/product renders invalidate prepared lazy measures', () => {
  const before = historyHarness('git-baseline');
  const frozenBefore = hasFrozenApp ? historyHarness('baseline') : null;
  const after = historyHarness('current');
  let input = deepFreeze(fixture({
    products: [{ id: 'duplicate', mainGroup: 'Ga', unit: 'Con' }, { id: 'duplicate', mainGroup: 'Bao', unit: 'Kg' }],
    warehouseImports: [movement('ga', '2026-10-01', 10), movement('bao', '2026-10-01', 10, { groupName: 'Bao', quantityUnit: 'Kg', totalKg: 0 })],
    warehouseDispatches: [{ id: 'd', date: '2026-10-02', productId: 'duplicate', quantity: 2 }],
  }));
  const check = () => {
    const a = before.render(input);
    const b = after.render(input);
    const frozen = frozenBefore?.render(input);
    const original = structuredClone(input);
    for (const date of [today, '2026-10-01', '2026-10-31']) {
      const expected = a.build(date);
      assert.deepStrictEqual(b.build(date), expected);
      if (frozen) assert.deepStrictEqual(frozen.build(date), expected, `Frozen/Git lifecycle parity at ${date}`);
    }
    assert.deepStrictEqual(input, original);
    return b;
  };
  let current = check();
  assert.equal(current.productLookup.get('duplicate'), input.products.at(-1), 'Preserve actual last-ID Map lookup semantics');
  assert.equal(check().prepared, current.prepared, 'Identical render dependencies reuse preparation');
  const stages = [
    value => structuredClone(value),
    value => ({ ...value, warehouseImports: value.warehouseImports.map((r, i) => i ? r : { ...r, quantity: 13 }) }),
    value => ({ ...value, warehouseDispatches: value.warehouseDispatches.map(r => ({ ...r, isArchived: true })) }),
    value => ({ ...value, warehouseDispatches: value.warehouseDispatches.map(r => ({ ...r, isArchived: false })) }),
    value => ({ ...value, products: value.products.toReversed() }),
    value => ({ ...value, products: value.products.map(r => ({ ...r, unit: 'Bao' })) }),
    value => ({ ...value, currentCompany: { warehouseStockResetAt: stamp('2026-10-02') } }),
    value => ({ ...value, currentCompany: { warehouseStockResetAt: '' } }),
  ];
  for (const stage of stages) {
    input = deepFreeze(stage(input));
    const next = check();
    assert.notEqual(next.prepared, current.prepared, 'Changed movement/product/reset dependency must refresh preparation');
    current = next;
  }
  input = deepFreeze({ ...input, warehouseStockCounts: [movement('count', '2026-10-02', 1)] });
  const withCount = check();
  assert.equal(withCount.prepared, current.prepared, 'Count-only changes need not discard movement measurements');
  input = deepFreeze({ ...input, warehouseStockCounts: input.warehouseStockCounts.map(r => ({ ...r, quantity: 6, totalKg: 12 })) });
  const editedCount = check();
  assert.equal(editedCount.prepared, withCount.prepared);
  assert.notDeepStrictEqual(editedCount.build(today), withCount.build(today), 'Count edits must change derived stock rows');
  input = deepFreeze({ ...input, warehouseStockCounts: input.warehouseStockCounts.map(r => ({ ...r, isArchived: true })) });
  check();
});

test('month replay measures eligible records once and leaves future/orphan entries lazy', () => {
  const p = pair(fixture({
    warehouseImports: [movement('early', '2026-10-01', 10), movement('late', '2026-10-20', 4),
      movement('empty', '2026-10-01', 0), movement('future', '2026-11-01', 100)],
    warehouseDispatches: [movement('export', '2026-10-02', 1),
      movement('orphan', '2026-10-01', 5, { groupName: 'Orphan' }),
      movement('future-export', '2026-11-01', 100)],
  }));
  assert.ok(p.current.prepared.imports.every(e => e.measures === null));
  p.compare('2026-10-01');
  assert.equal(p.current.prepared.imports.find(e => e.item.id === 'late').measures, null);
  assert.equal(p.current.prepared.dispatches.find(e => e.item.id === 'orphan').measures, null);
  for (const date of [...p.current.monthDates, ...p.current.monthDates.toReversed()]) p.compare(date);
  assert.equal(p.after.calls.get('buildStoredWarehouseMeasureEntries'), 3);
  assert.equal(p.after.calls.get('buildWarehouseDispatchMeasureEntries'), 1);
  assert.ok(p.before.calls.get('buildStoredWarehouseMeasureEntries') > 3);
  assert.ok(p.before.calls.get('buildWarehouseDispatchMeasureEntries') > 1);
  assert.equal(p.current.prepared.imports.find(e => e.item.id === 'future').measures, null);
  assert.equal(p.current.prepared.dispatches.find(e => e.item.id === 'future-export').measures, null);
  assert.equal(p.current.prepared.dispatches.find(e => e.item.id === 'orphan').measures, null);
});
