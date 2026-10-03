import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import babelTraverse from '@babel/traverse';
import { createRecordCalculationCache } from '../src/services/recordCalculationCache.js';
import { retainCollectionRecordIdentity } from '../src/utils/collectionIdentity.js';

const traverse = babelTraverse.default || babelTraverse;
const root = new URL('../', import.meta.url);
const frozenRoot = new URL('test-results/master-baseline/', root);
const baselineRevision = '5f162f5ce85fd4dc746382f13a6a4170e4a29775';
const hasFrozenApp = existsSync(new URL('src/App.jsx', frozenRoot));
const today = '2026-10-03';
process.env.TZ = 'Asia/Ho_Chi_Minh';
class RequestDate extends Date {
  constructor(...args) { super(...(args.length ? args : [`${today}T12:00:00+07:00`])); }
  static now() { return new RequestDate().getTime(); }
}
const globals = { Array, Object, Map, Set, WeakMap, Number, String, Boolean, Math, Intl,
  Date: RequestDate, RegExp, JSON, TypeError, parseInt, parseFloat, undefined, NaN, Infinity };
const modules = new Map();
const gitSources = new Map();

function moduleAst(revision, path = 'src/App.jsx') {
  const key = `${revision}:${path}`;
  if (modules.has(key)) return modules.get(key);
  assert.ok(path.startsWith('src/') && !path.includes('..'), `Unexpected source dependency: ${path}`);
  const frozenFile = new URL(path, frozenRoot);
  let source;
  if (revision === 'current') source = readFileSync(new URL(path, root), 'utf8');
  else if (revision === 'frozen' && existsSync(frozenFile)) source = readFileSync(frozenFile, 'utf8');
  else {
    if (!gitSources.has(path)) gitSources.set(path, execFileSync('git', ['show', `${baselineRevision}:${path}`], {
      cwd: fileURLToPath(root), encoding: 'utf8', maxBuffer: 30 * 1024 * 1024,
    }));
    source = gitSources.get(path);
  }
  const tree = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const top = new Map();
  const scoped = new Map();
  const imports = new Map();
  const exports = new Map();
  const add = (node, destination) => {
    if (node?.type === 'VariableDeclaration') {
      for (const entry of node.declarations) {
        if (entry.id.type === 'Identifier' && entry.init) destination.set(entry.id.name, entry.init);
      }
    }
    if (node?.type === 'FunctionDeclaration') destination.set(node.id.name, node);
  };
  for (const statement of tree.program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    add(declaration, top);
    if (declaration?.type === 'FunctionDeclaration' && declaration.id.name === 'OrderRequestView') {
      for (const child of declaration.body.body) add(child, scoped);
    }
    if (statement.type === 'ImportDeclaration') {
      for (const specifier of statement.specifiers) imports.set(specifier.local.name, {
        specifier, path: statement.source.value,
      });
    }
    if (statement.type === 'ExportNamedDeclaration') {
      if (declaration?.type === 'VariableDeclaration') {
        for (const entry of declaration.declarations) exports.set(entry.id.name, entry.id.name);
      }
      if (declaration?.type === 'FunctionDeclaration') exports.set(declaration.id.name, declaration.id.name);
      for (const specifier of statement.specifiers || []) exports.set(specifier.exported.name, specifier.local.name);
    }
  }
  const result = { source, top, scoped, imports, exports, expressions: new Map() };
  modules.set(key, result);
  return result;
}

function expressionDependencies(module, name, node) {
  if (module.expressions.has(node)) return module.expressions.get(node);
  const text = `const ${name} = (${module.source.slice(node.start, node.end)});`;
  const dependencies = new Set();
  traverse(parse(text, { sourceType: 'module' }), {
    ReferencedIdentifier(reference) {
      if (!reference.scope.hasBinding(reference.node.name, true)) dependencies.add(reference.node.name);
    },
  });
  const result = { text, dependencies: [...dependencies] };
  module.expressions.set(node, result);
  return result;
}


// Execute the actual scoped derivations and their pure dependency graph, never
// App, React, Firebase or mutation handlers. Git is the independent CI oracle.
function requestHarness(revision) {
  const helpers = new Map();
  const hooks = new Map();
  const calls = new Map();
  const memo = (key, factory, deps) => {
    assert.ok(Array.isArray(deps), `Missing hook dependencies: ${key}`);
    const previous = hooks.get(key);
    if (previous && previous.deps.length === deps.length
      && deps.every((value, index) => Object.is(value, previous.deps[index]))) return previous.value;
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
        const key = `${path}:${scoped ? 'OrderRequestView:' : ''}${name}`;
        if (path === 'src/App.jsx' && Object.hasOwn(input, name)) return input[name];
        if (Object.hasOwn(globals, name)) return globals[name];
        if (values.has(key)) return values.get(key);
        if (!scoped && helpers.has(key)) return helpers.get(key);
        if (resolving.has(key)) {
          const initializer = (scoped ? module.scoped : module.top).get(name);
          assert.ok(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'].includes(initializer?.type),
            `Only function references may have a deferred recursive binding: ${key}`);
          return (...args) => {
            const callable = values.get(key) ?? helpers.get(key);
            assert.equal(typeof callable, 'function', `Recursive helper used before initialization: ${key}`);
            return callable(...args);
          };
        }
        if (!scoped && module.imports.has(name)) {
          const imported = module.imports.get(name);
          assert.equal(imported.specifier.type, 'ImportSpecifier', `Unsupported import: ${key}`);
          assert.ok(imported.path.startsWith('.'), `External App import must not execute: ${imported.path}`);
          const importedPath = posix.normalize(posix.join(posix.dirname(path), imported.path));
          const local = moduleAst(revision, importedPath).exports.get(imported.specifier.imported.name);
          assert.ok(local, `Missing export: ${importedPath}:${name}`);
          const result = resolve(local, importedPath, false);
          helpers.set(key, result);
          return result;
        }
        const node = (scoped ? module.scoped : module.top).get(name);
        assert.ok(node, `Missing ${revision} dependency: ${key}`);
        assert.notEqual(name, 'OrderRequestView', 'Never execute the component');
        const { text, dependencies } = expressionDependencies(module, name, node);
        resolving.add(key);
        const bindings = dependencies.map(dependency => {
          if (dependency === 'useMemo') return (factory, deps) => memo(key, factory, deps);
          if (dependency === 'useCallback') return (callback, deps) => memo(key, () => callback, deps);
          if (dependency === 'useRef') return initial => memo(key, () => ({ current: initial }), []);
          if (scoped && dependency === 'createRecordCalculationCache') return calculate => (
            createRecordCalculationCache((...args) => {
              calls.set(name, (calls.get(name) || 0) + 1);
              return calculate(...args);
            })
          );
          return resolve(dependency, path, scoped);
        });
        const result = new Function(...dependencies, `"use strict"; ${text} return ${name};`)(...bindings);
        resolving.delete(key);
        values.set(key, result);
        if (!scoped) helpers.set(key, result);
        return result;
      };
      const result = Object.fromEntries([
        'latestOrderRequests', 'visibleRequests', 'filteredRequests', 'requestDateCounts',
        'requestSheetRows', 'mergedRequestSheetRows', 'currentDayGroupQuantitySummary',
        'editableCurrentDayRows', 'editableRowsBySales', 'displayRowsBySales',
      ].map(name => [name, resolve(name)]));
      return result;
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
const fixture = (overrides = {}) => ({
  employee: { id: 'e1', name: 'Sales One', companyId: 'tenant-a' },
  customers: [], products: [], orderRequests: [], employees: [],
  isSales: false, canViewAllRequests: true, salesVisibleEmployeeIdSet: new Set(['e1']),
  isOwnerAccount: false, canEdit: false, warehouseDispatches: [],
  requestWorkingDate: today, requestFilterDate: '', requestFilterSalesEmpId: 'all', ...overrides,
});
const item = (productId, quantity = 2, extra = {}) => ({
  productId, description: `Product ${productId}`, quantity, quantityUnit: 'Con',
  actualQuantity: quantity, actualUnit: 'Con', billingQuantity: quantity,
  billingUnit: 'Con', unitPrice: 12000, amount: quantity * 12000, ...extra,
});
const request = (id, customerId, productId, extra = {}) => ({
  id, companyId: 'tenant-a', customerId, date: today,
  createdAt: `${today}T09:00:00+07:00`, items: [item(productId)], ...extra,
});
function populatedFixture(overrides = {}) {
  return fixture({
    customers: [
      { id: 'c1', companyId: 'tenant-a', name: 'Customer 1', empId: 'e1',
        branches: [{ id: 'b1', name: 'Branch 1', address: 'Address 1', productIds: ['p1'] }] },
      { id: 'c2', companyId: 'tenant-a', name: 'Customer 2', empId: 'e2' },
    ],
    products: [
      { id: 'p1', companyId: 'tenant-a', name: 'Ga 2', shortName: 'G2', mainGroup: 'Ga', unit: 'Con' },
      { id: 'p2', companyId: 'tenant-a', name: 'Vit 10', shortName: 'V10', mainGroup: 'Vit', unit: 'Kg' },
    ],
    orderRequests: [
      request('r1', 'c1', 'p1', { branchId: 'b1', note: 'first', custom: { preserve: true },
        items: [item('p1', 1, { attribute: 'A', sizeLabel: '2', configurationId: 'x' }), item('p2', 3)] }),
      request('r2', 'c2', 'p1', { salesEmpId: 'e2', createdAt: `${today}T10:00:00+07:00` }),
      request('r3', 'c1', 'missing', { date: '2026-10-02', branchId: 'deleted-branch' }),
    ], ...overrides,
  });
}

function assertParity(input, current = requestHarness('current'), label = 'rows') {
  const original = structuredClone(input);
  const expected = requestHarness('git').render(deepFreeze(structuredClone(input)));
  const actual = current.render(deepFreeze(input));
  assert.deepStrictEqual(actual, expected, `${label}: every raw field, row, group, summary and order`);
  if (hasFrozenApp) assert.deepStrictEqual(actual,
    requestHarness('frozen').render(deepFreeze(structuredClone(input))), `${label}: independent local frozen source`);
  assert.deepStrictEqual(input, original, `${label}: source records must remain unchanged`);
  return actual;
}

test('pinned Git is always the independent oracle; ignored frozen source is optional', () => {
  assert.ok(moduleAst('git').scoped.has('visibleRequests'));
  assert.ok(moduleAst('git').scoped.has('requestSheetRows'));
  assert.ok(moduleAst('current').scoped.has('getVisibleRequest'));
  assert.ok(moduleAst('current').scoped.has('getRequestSheetRows'));
  for (const name of ['getHistoryRequestRows', 'historyRequests', 'historyRequestGroups',
    'previewSheetRows', 'currentDayRequestSummary', 'topRequestedProducts']) {
    assert.ok(!moduleAst('current').scoped.has(name), `${name} has no UI consumer and must not run during navigation/save`);
  }
  assertParity(fixture());
});

test('complete multi-item, branch, billing, history, raw field and grouping parity', () => {
  const input = populatedFixture();
  input.orderRequests.push(request('r4', 'c1', 'p1', {
    branchId: 'b1', note: 'second', items: [item('p1', 0.5, { attribute: 'A', sizeLabel: '2', configurationId: 'x' })],
  }));
  const output = assertParity(input);
  assert.equal(output.requestSheetRows.length, 5);
  assert.ok(output.mergedRequestSheetRows.length < output.requestSheetRows.length);
  assert.equal(output.visibleRequests.find(row => row.id === 'r1').custom.preserve, true);
});

test('editable base rows rebuild only the changed immutable request on a warm publication', () => {
  const input = populatedFixture();
  const current = requestHarness('current');
  assertParity(input, current);
  const calls = current.calls.get('getEditableRequestBaseRows');
  assert.equal(calls, input.orderRequests.length);
  const changed = structuredClone(input.orderRequests);
  changed[0].note = 'updated';
  changed[0].items[0].quantity = 4;
  changed[0].items[0].actualQuantity = 4;
  changed[0].items[0].billingQuantity = 4;
  changed[0].items[0].amount = 48000;
  const next = { ...input, orderRequests: retainCollectionRecordIdentity(input.orderRequests, changed) };
  const rows = assertParity(next, current).editableCurrentDayRows;
  assert.equal(current.calls.get('getEditableRequestBaseRows'), calls + 1);
  assert.equal(rows.find(row => row.requestId === 'r1' && row.itemIndex === 0).amount, 48000);
  assert.equal(rows.find(row => row.requestId === 'r1').note, 'updated');
  assertParity({ ...next, orderRequests: next.orderRequests.slice().reverse() }, current);
  assert.equal(current.calls.get('getEditableRequestBaseRows'), calls + 1);
});

test('current warehouse status, dates and dispatch IDs overlay warm bases without stale fields', () => {
  const current = requestHarness('current');
  const input = populatedFixture({ orderRequestWarehouseStatusMaps: {
    byRowKey: new Map([['r1_0', { status: 'partial', dispatchedDate: '2026-10-01', dispatchIds: ['d1'] }]]),
    byRequestId: new Map([['r1', { status: 'partial', latestDispatchDate: '2026-10-01' }]]),
  } });
  assertParity(input, current);
  const calls = current.calls.get('getEditableRequestBaseRows');
  const updated = { ...input, orderRequestWarehouseStatusMaps: {
    byRowKey: new Map([['r1_0', { status: 'dispatched', dispatchedDate: today, dispatchIds: ['d1', 'd2'] }]]),
    byRequestId: new Map([['r1', { status: 'dispatched', latestDispatchDate: today }]]),
  } };
  let rows = assertParity(updated, current).editableCurrentDayRows;
  let row = rows.find(entry => entry.rowKey === 'r1_0');
  assert.equal(row.warehouseDispatchStatus, 'dispatched');
  assert.equal(row.warehouseDispatchDate, today);
  assert.deepEqual(row.warehouseDispatchIds, ['d1', 'd2']);
  assert.equal(current.calls.get('getEditableRequestBaseRows'), calls);
  rows = assertParity({ ...updated, orderRequestWarehouseStatusMaps: {
    byRowKey: new Map(), byRequestId: new Map(),
  } }, current).editableCurrentDayRows;
  row = rows.find(entry => entry.rowKey === 'r1_0');
  assert.equal(row.warehouseDispatchStatus, '');
  assert.equal(row.warehouseDispatchDate, '');
  assert.deepEqual(row.warehouseDispatchIds, []);
  assert.equal(current.calls.get('getEditableRequestBaseRows'), calls);
});

test('editable base permissions and employee fallback names refresh with owner, scope and tenant changes', () => {
  const current = requestHarness('current');
  const input = populatedFixture({ canViewAllRequests: false, canEdit: false,
    orderRequests: [request('portal', 'c2', 'p1', { source: 'customer_portal' })] });
  let rows = assertParity(input, current).editableCurrentDayRows;
  assert.equal(rows[0].canApproveCustomerPortal, false);
  for (const override of [{ isOwnerAccount: true }, { canEdit: true },
    { canViewAllRequests: true }, { salesVisibleEmployeeIdSet: new Set(['e2']) },
    { employee: { id: 'e2', name: 'Changed fallback', companyId: 'tenant-b' },
      salesVisibleEmployeeIdSet: new Set(['e2']) }]) {
    rows = assertParity({ ...input, ...override }, current).editableCurrentDayRows;
    assert.equal(rows[0].canApproveCustomerPortal, true);
  }
  rows = assertParity(input, current).editableCurrentDayRows;
  assert.equal(rows[0].canApproveCustomerPortal, false);
});

test('versions, archives, duplicates, missing references and stable equal-time ordering', () => {
  const input = populatedFixture();
  input.customers.push({ ...input.customers[0], name: 'Duplicate must not replace first' });
  input.products.push({ ...input.products[0], name: 'Z duplicate product' });
  input.orderRequests.push(
    request('old', 'c1', 'p1', { source: 'customer_portal', customerOrderRootId: 'root', updatedAt: '2026-10-01' }),
    request('new', 'c1', 'p2', { source: 'customer_portal', customerOrderRootId: 'root', updatedAt: today }),
    request('archived', 'c1', 'p1', { isArchived: true }),
    request('unknown', 'absent', '', { items: [item('', -2, { description: 'Fallback', amount: 0 })] }),
    request('empty', 'c1', 'p1', { items: [] }),
    request('undated', 'c1', 'p1', { date: '', createdAt: '', requestDate: 'invalid' }),
    request('missing-date', 'c1', 'p1', { date: '', createdAt: '', requestDate: '' }),
  );
  const output = assertParity(input);
  assert.equal(output.visibleRequests.some(row => row.id === 'old' || row.id === 'archived'), false);
  assert.equal(output.visibleRequests.find(row => row.id === 'undated').requestDateKey, 'invalid');
  assert.equal(output.visibleRequests.find(row => row.id === 'missing-date').requestDateKey, today);
  assert.equal(output.visibleRequests.find(row => row.id === 'r1').customer.name, 'Customer 1');
});

test('permission, date and sales filters remain outside the cached enrichment', () => {
  const current = requestHarness('current');
  let input = populatedFixture({ isSales: true, canViewAllRequests: false });
  let output = assertParity(input, current, 'own sales scope');
  assert.equal(output.visibleRequests.some(row => row.id === 'r2'), false);
  input = { ...input, canViewAllRequests: true, requestFilterDate: today, requestFilterSalesEmpId: 'e2' };
  output = assertParity(input, current, 'all-sales date and employee filter');
  assert.deepStrictEqual(output.filteredRequests.map(row => row.id), ['r2']);
  input = { ...input, canViewAllRequests: false, salesVisibleEmployeeIdSet: new Set(['e2']) };
  assertParity(input, current, 'permission scope replacement');
});

test('published clone/edit/reorder retains warm identities and recalculates one changed request', () => {
  const current = requestHarness('current');
  let input = populatedFixture();
  const cold = assertParity(input, current);
  assert.equal(current.calls.get('getVisibleRequest'), 3);
  assert.equal(current.calls.get('getRequestSheetRows'), 3);
  input = { ...input, orderRequests: retainCollectionRecordIdentity(input.orderRequests, structuredClone(input.orderRequests)) };
  const warm = assertParity(input, current, 'unchanged publication');
  assert.strictEqual(warm.visibleRequests, cold.visibleRequests);
  assert.equal(current.calls.get('getRequestSheetRows'), 3);
  const changed = structuredClone(input.orderRequests);
  changed[0].items[0].quantity = 7;
  changed[0].items[0].actualQuantity = 7;
  changed[0].items[0].billingQuantity = 7;
  changed[0].items[0].amount = 84000;
  input = { ...input, orderRequests: retainCollectionRecordIdentity(input.orderRequests, changed.reverse()) };
  const updated = assertParity(input, current, 'one request edit and source reorder');
  assert.equal(current.calls.get('getVisibleRequest'), 4);
  assert.equal(current.calls.get('getRequestSheetRows'), 4);
  const unchangedOld = cold.visibleRequests.find(row => row.id === 'r2');
  assert.strictEqual(updated.visibleRequests.find(row => row.id === 'r2'), unchangedOld);
  assert.strictEqual(updated.requestSheetRows.find(row => row.id.startsWith('r2_')),
    cold.requestSheetRows.find(row => row.id.startsWith('r2_')));
});

test('unrelated customer-map replacement does not invalidate all request rows', () => {
  const current = requestHarness('current');
  let input = populatedFixture();
  const cold = assertParity(input, current);
  input = { ...input, customers: [...input.customers, { id: 'unrelated', name: 'New Customer', empId: 'e1' }] };
  let output = assertParity(input, current, 'unrelated customer addition');
  assert.equal(current.calls.get('getVisibleRequest'), 3);
  assert.equal(current.calls.get('getRequestSheetRows'), 3);
  assert.strictEqual(output.requestSheetRows[0], cold.requestSheetRows[0]);
  input = { ...input, customers: input.customers.map(customer => customer.id === 'c2'
    ? { ...customer, name: 'Changed Customer 2' } : customer) };
  output = assertParity(input, current, 'one associated customer edit');
  assert.equal(current.calls.get('getVisibleRequest'), 4);
  assert.equal(current.calls.get('getRequestSheetRows'), 4);
  assert.equal(output.requestSheetRows.find(row => row.id.startsWith('r2_')).customerName, 'Changed Customer 2');
});

test('catalog edits/archive, branch edits and removals conservatively refresh exact rows', () => {
  const current = requestHarness('current');
  let input = populatedFixture();
  assertParity(input, current);
  input = { ...input, products: input.products.map(product => product.id === 'p2'
    ? { ...product, name: 'Updated Vit', mainGroup: 'Heo', unit: 'Bao' } : product) };
  assertParity(input, current, 'secondary product edit');
  assert.equal(current.calls.get('getRequestSheetRows'), 6, 'Catalog recreation invalidates all row calculators');
  input = { ...input, customers: input.customers.map(customer => customer.id === 'c1'
    ? { ...customer, branches: [{ id: 'b1', name: 'Renamed Branch', address: 'New Address' }] } : customer) };
  let output = assertParity(input, current, 'branch configuration edit');
  assert.equal(output.requestSheetRows.find(row => row.id.startsWith('r1_')).branchName, 'Renamed Branch');
  input = { ...input, products: input.products.map(product => product.id === 'p1'
    ? { ...product, isArchived: true } : product) };
  assertParity(input, current, 'product archive and fallback');
  input = { ...input, customers: input.customers.filter(customer => customer.id !== 'c1') };
  assertParity(input, current, 'associated customer removal');
  input = { ...input, orderRequests: input.orderRequests.map(row => row.id === 'r1' ? { ...row, isArchived: true } : row) };
  output = assertParity(input, current, 'request archive');
  assert.equal(output.requestSheetRows.some(row => row.id.startsWith('r1_')), false);
});

test('undated fallback follows the working day while explicit-date wrappers stay reusable', () => {
  const current = requestHarness('current');
  let input = populatedFixture();
  input.orderRequests.push(request('undated', 'c1', 'p1', { date: '', createdAt: '' }));
  const cold = assertParity(input, current);
  input = { ...input, requestWorkingDate: '2026-10-04' };
  const next = assertParity(input, current, 'new working day');
  assert.equal(next.visibleRequests.find(row => row.id === 'undated').requestDateKey, '2026-10-04');
  assert.strictEqual(next.visibleRequests.find(row => row.id === 'r1'), cold.visibleRequests.find(row => row.id === 'r1'));
  assert.equal(current.calls.get('getVisibleRequest'), 5);
  assert.equal(current.calls.get('getRequestSheetRows'), 5);
});

test('sorting and grouped totals never mutate cached rows or earlier outputs', () => {
  const current = requestHarness('current');
  let input = populatedFixture();
  const cold = assertParity(input, current);
  const original = structuredClone(cold);
  deepFreeze(cold);
  input = { ...input, requestFilterDate: today };
  assertParity(input, current, 'first filter selection');
  input = { ...input, requestFilterDate: '' };
  const warm = assertParity(input, current, 'restore complete sheet');
  assert.deepStrictEqual(cold, original);
  assert.deepStrictEqual(warm, original);
  assert.equal(current.calls.get('getRequestSheetRows'), 3);
});

test('tenant replacement and a new component lifetime do not share cached wrappers', () => {
  const current = requestHarness('current');
  let input = populatedFixture();
  const cold = assertParity(input, current);
  input = { ...input, employee: { ...input.employee, companyId: 'tenant-b' } };
  const changedScope = assertParity(input, current, 'tenant cache reset');
  assert.notStrictEqual(changedScope.visibleRequests[0], cold.visibleRequests[0]);
  assert.equal(current.calls.get('getVisibleRequest'), 6);
  assert.equal(current.calls.get('getRequestSheetRows'), 6);
  assert.equal(current.calls.get('getHistoryRequestRows'), undefined);
  const remounted = assertParity(input, requestHarness('current'), 'new component lifetime');
  assert.notStrictEqual(remounted.visibleRequests[0], changedScope.visibleRequests[0]);
  // Cache lifetime is not access control: App remains responsible for supplying
  // tenant-scoped collections and the unchanged per-request permission filter.
});

test('historical requests retain all fields, billing and date selection without unused preview calculation', () => {
  const input = populatedFixture();
  input.orderRequests = [
    request('ha', 'c1', 'p1', { date: '2026-10-02', branchId: 'b1', note: 'first note',
      items: [item('p1', 0.1, { amount: 1200.125, configurationId: 'same', sizeLabel: '2' })] }),
    request('hb', 'c1', 'p1', { date: '2026-10-02', branchId: 'b1', note: 'second note',
      items: [item('p1', 0.2, { amount: 2400.375, configurationId: 'same', sizeLabel: '2' })] }),
    request('hc', 'c2', '', { date: '2026-09-30', items: [item('', '2,5', {
      actualUnit: '', quantityUnit: '', billingUnit: '', description: 'Unknown product', unitPrice: '1.250', amount: '3.125',
    })] }),
    ...Array.from({ length: 15 }, (_, index) => request(`hx${index}`, 'c1', 'p2', {
      date: '2026-09-29', branchId: `b-${index}`, items: [item('p2', index + 0.25, { sizeLabel: `${index}` })],
    })),
  ];
  const output = assertParity(input, requestHarness('current'), 'history full rows and aggregate oracle');
  assert.equal(output.requestSheetRows.length, 18, 'All historical rows survive, not just twelve preview rows');
  assert.equal(output.requestSheetRows.find(row => row.id === 'ha_p1').amount, 1200.125);
  const combined = output.mergedRequestSheetRows.find(row => row.id === 'ha_p1');
  assert.equal(combined.quantity, 0.1 + 0.2);
  assert.equal(combined.note, 'first note; second note');
  assert.equal(output.requestSheetRows.every(row => Object.hasOwn(row, 'date')), true);
  const selected = assertParity({ ...input, requestFilterDate: '2026-09-29' });
  assert.equal(selected.filteredRequests.length, 15);
  assert.equal(selected.requestSheetRows.length, 15);
});

test('warm historical publication recalculates only one edited request, not every historical row', () => {
  const current = requestHarness('current');
  const count = 90;
  let input = populatedFixture({ orderRequests: Array.from({ length: count }, (_, index) => (
    request(`h${index}`, index === 0 ? 'c2' : 'c1', index % 2 ? 'p1' : 'p2', {
      date: `2026-09-${String(27 + index % 3).padStart(2, '0')}`,
      items: [item(index % 2 ? 'p1' : 'p2', index + 0.1)],
    })
  )) });
  const cold = assertParity(input, current);
  assert.equal(current.calls.get('getRequestSheetRows'), count);
  deepFreeze(cold);
  const changed = structuredClone(input.orderRequests);
  changed[0].note = 'Edited historical request';
  input = { ...input, orderRequests: retainCollectionRecordIdentity(input.orderRequests, changed) };
  let output = assertParity(input, current, 'one historical edit');
  assert.equal(current.calls.get('getRequestSheetRows'), count + 1);
  assert.strictEqual(output.requestSheetRows.find(row => row.id === 'h1_p1'),
    cold.requestSheetRows.find(row => row.id === 'h1_p1'));
  input = { ...input, customers: [...input.customers, { id: 'unused', name: 'Unrelated customer' }] };
  assertParity(input, current, 'fresh grouping from unchanged cached rows');
  assert.equal(current.calls.get('getRequestSheetRows'), count + 1);
  input = { ...input, customers: input.customers.map(customer => customer.id === 'c2'
    ? { ...customer, name: 'One changed customer' } : customer) };
  assertParity(input, current, 'one associated historical customer');
  assert.equal(current.calls.get('getRequestSheetRows'), count + 2);
  input = { ...input, orderRequests: input.orderRequests.map(row => row.id === 'h0'
    ? { ...row, isArchived: true } : row) };
  output = assertParity(input, current, 'historical archive excludes rows without recalculating survivors');
  assert.equal(current.calls.get('getRequestSheetRows'), count + 2);
  assert.equal(output.requestSheetRows.length, count - 1);
});

test('actual request projections preserve sorting while reusing repeated short collation pairs', () => {
  const input = deepFreeze(populatedFixture({ orderRequests: Array.from({ length: 4500 }, (_, index) => (
    request(`sort-${index}`, index % 3 ? 'c1' : 'c2', index % 2 ? 'p1' : 'p2', {
      items: [item(index % 2 ? 'p1' : 'p2', index + 0.1, { sizeLabel: String(index % 8) })],
    })
  )) }));
  const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });
  let directCalls = 0;
  let cachedCalls = 0;
  const expected = requestHarness('git').render({ ...input, vietnamNumericCollator: {
    compare: (a, b) => { directCalls += 1; return collator.compare(a, b); },
  } });
  const actual = requestHarness('current').render({ ...input, vietnamNumericCollator: {
    compare: (a, b) => { cachedCalls += 1; return collator.compare(a, b); },
  } });
  assert.deepStrictEqual(actual, expected);
  assert.ok(cachedCalls < directCalls / 2, `Repeated labels: ${cachedCalls} collations vs ${directCalls}`);
});

test('editable base rows refresh only associated customer contexts and check permissions live', () => {
  const current = requestHarness('current');
  const count = 60;
  let input = populatedFixture({ orderRequests: Array.from({ length: count }, (_, index) => (
    request(`context-${index}`, index === 0 ? 'c2' : 'c1', 'p1')
  )) });
  assertParity(input, current);
  assert.equal(current.calls.get('getEditableRequestBaseRows'), count);
  input = { ...input, customers: [...input.customers, { id: 'unused', name: 'Unrelated customer' }] };
  assertParity(input, current, 'unrelated customer does not rebuild editable bases');
  assert.equal(current.calls.get('getEditableRequestBaseRows'), count);
  input = { ...input, customers: input.customers.map(customer => customer.id === 'c2'
    ? { ...customer, name: 'Changed associated customer' } : customer) };
  assertParity(input, current, 'associated customer changes only its request');
  assert.equal(current.calls.get('getEditableRequestBaseRows'), count + 1);
  input = { ...input, canEdit: true, isOwnerAccount: true };
  assertParity(input, current, 'fresh permission overlay without recalculating static bases');
  assert.equal(current.calls.get('getEditableRequestBaseRows'), count + 1);
  input = { ...input, canEdit: false, isOwnerAccount: false };
  assertParity(input, current, 'revoked permission uses the independent frozen oracle');
  assert.equal(current.calls.get('getEditableRequestBaseRows'), count + 1);
});
