import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import babelTraverse from '@babel/traverse';

const traverse = babelTraverse.default || babelTraverse;
const root = new URL('../', import.meta.url);
const baseline = '5f162f5ce85fd4dc746382f13a6a4170e4a29775';
const today = '2026-10-03';
process.env.TZ = 'Asia/Ho_Chi_Minh';

class CalculationDate extends Date {
  constructor(...args) { super(...(args.length ? args : [`${today}T12:00:00+07:00`])); }
  static now() { return new CalculationDate().getTime(); }
}

const globals = { Array, Object, Map, Set, WeakMap, Number, String, Boolean, Math, Intl,
  Date: CalculationDate, RegExp, JSON, parseInt, parseFloat, undefined, NaN, Infinity };
const sources = new Map();
function moduleSource(revision, path) {
  const key = `${revision}:${path}`;
  if (sources.has(key)) return sources.get(key);
  assert.ok(path.startsWith('src/') && !path.includes('..'), `Unexpected calculation dependency: ${path}`);
  const source = revision === 'current'
    ? readFileSync(new URL(path, root), 'utf8')
    : execFileSync('git', ['show', `${baseline}:${path}`], {
      cwd: fileURLToPath(root), encoding: 'utf8', maxBuffer: 30 * 1024 * 1024,
    });
  const tree = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const declarations = new Map();
  const imports = new Map();
  const exports = new Map();
  for (const statement of tree.program.body) {
    if (statement.type === 'ImportDeclaration') {
      for (const specifier of statement.specifiers) {
        imports.set(specifier.local.name, { source: statement.source.value, specifier });
      }
    }
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type === 'VariableDeclaration') {
      for (const entry of declaration.declarations) {
        if (entry.id.type === 'Identifier' && entry.init) declarations.set(entry.id.name, entry.init);
      }
    }
    if (declaration?.type === 'FunctionDeclaration') declarations.set(declaration.id.name, declaration);
    if (statement.type === 'ExportNamedDeclaration') {
      if (declaration?.type === 'VariableDeclaration') {
        for (const entry of declaration.declarations) exports.set(entry.id.name, entry.id.name);
      }
      if (declaration?.type === 'FunctionDeclaration') exports.set(declaration.id.name, declaration.id.name);
      for (const specifier of statement.specifiers || []) exports.set(specifier.exported.name, specifier.local.name);
    }
  }
  const result = { source, declarations, imports, exports };
  sources.set(key, result);
  return result;
}

// Resolve only the AST dependency graph of the two calculations. Baseline imports
// come from Git too; no current helper is substituted into the frozen reference.
function calculationHarness(revision) {
  const values = new Map();
  const resolving = new Set();
  const resolve = (name, path = 'src/App.jsx') => {
    const key = `${path}:${name}`;
    if (values.has(key)) return values.get(key);
    assert.ok(!resolving.has(key), `Circular calculation dependency: ${key}`);
    const module = moduleSource(revision, path);
    if (module.imports.has(name)) {
      const imported = module.imports.get(name);
      assert.equal(imported.specifier.type, 'ImportSpecifier', `Expected a named helper import: ${key}`);
      assert.ok(imported.source.startsWith('.'), `External App dependency must not execute: ${imported.source}`);
      const importedPath = posix.normalize(posix.join(posix.dirname(path), imported.source));
      const importedModule = moduleSource(revision, importedPath);
      const localName = importedModule.exports.get(imported.specifier.imported.name);
      assert.ok(localName, `Missing exported helper: ${importedPath}:${imported.specifier.imported.name}`);
      const result = resolve(localName, importedPath);
      values.set(key, result);
      return result;
    }
    const node = module.declarations.get(name);
    assert.ok(node, `Missing ${revision} calculation dependency: ${key}`);
    assert.ok(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration', 'ArrayExpression',
      'ObjectExpression', 'StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'NullLiteral', 'NewExpression'].includes(node.type),
    `Unsafe calculation initializer: ${key} (${node.type})`);
    if (node.type === 'NewExpression') {
      const constructor = module.source.slice(node.callee.start, node.callee.end);
      assert.ok(['Map', 'Set', 'WeakMap', 'Intl.NumberFormat'].includes(constructor), `Unsafe constructor: ${key}`);
    }
    const expression = module.source.slice(node.start, node.end);
    const fragment = `const ${name} = (${expression});`;
    const dependencies = new Set();
    traverse(parse(fragment, { sourceType: 'module' }), {
      ReferencedIdentifier(reference) {
        if (!reference.scope.hasBinding(reference.node.name, true)) dependencies.add(reference.node.name);
      },
    });
    resolving.add(key);
    const bindings = [...dependencies].map(dependency => Object.hasOwn(globals, dependency)
      ? globals[dependency] : resolve(dependency, path));
    const result = new Function(...dependencies, `"use strict"; ${fragment} return ${name};`)(...bindings);
    resolving.delete(key);
    values.set(key, result);
    return result;
  };
  return { inventory: resolve('buildInventoryMetrics'), shortage: resolve('buildWarehouseDispatchShortageSummary'), values };
}

const before = calculationHarness('baseline');
const after = calculationHarness('current');

function inventoryParity(fixture, options = {}, label = 'inventory') {
  const input = { products: fixture.products, orders: fixture.orders || [], options };
  const frozen = structuredClone(input);
  const baselineInput = structuredClone(input);
  const currentInput = structuredClone(input);
  const expected = before.inventory(baselineInput.products, baselineInput.orders, baselineInput.options);
  const actual = after.inventory(currentInput.products, currentInput.orders, currentInput.options);
  assert.deepStrictEqual(actual, expected, `${label}: all inventory fields, floats, and row order`);
  assert.deepStrictEqual(baselineInput, frozen, `${label}: baseline must not mutate inputs`);
  assert.deepStrictEqual(currentInput, frozen, `${label}: current must not mutate inputs`);
  return actual;
}

function shortageParity(fixture, options = {}, label = 'shortage') {
  const input = { customers: fixture.customers, products: fixture.products,
    orderRequests: fixture.orderRequests || [], warehouseDispatches: fixture.warehouseDispatches || [], dateKey: today, ...options };
  const frozen = structuredClone(input);
  const baselineInput = structuredClone(input);
  const currentInput = structuredClone(input);
  const expected = before.shortage(baselineInput);
  const actual = after.shortage(currentInput);
  assert.deepStrictEqual(actual, expected, `${label}: all shortage fields, floats, aliases, and line order`);
  assert.deepStrictEqual(baselineInput, frozen, `${label}: baseline must not mutate inputs`);
  assert.deepStrictEqual(currentInput, frozen, `${label}: current must not mutate inputs`);
  return actual;
}

const movementOptions = (fixture, untilDate = today) => ({ untilDate,
  warehouseImports: fixture.warehouseImports, warehouseDispatches: fixture.warehouseDispatches });

function randomFixture(seed, productCount = 18, recordCount = 24) {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const pick = items => items[Math.floor(random() * items.length)];
  const units = ['Kg', 'kg', 'kilograms', 'Con', 'C\u00e1i', 'CAI', 'Th\u00f9ng', 'Bao', '', undefined, 'Khay'];
  const quantities = [0, -0, 0.1, 0.2, 0.3, 2.75, 17, -3, '2,5', '1.25', '12 Con', undefined, null, NaN, Infinity, 'invalid'];
  const dates = [today, '2026-10-02', '2026-09-27', '2026-10-04', undefined, '', 'invalid'];
  const archived = [undefined, false, false, false, true, 'false', 0];
  const groups = ['V\u1ecbt', 'G\u00e0', 'Heo', 'V\u1eadt t\u01b0', 'Th\u00f9ng', '', undefined];
  const names = ['V\u1ecbt c\u1ecf', 'Ga Ta', '  G\u00c0 TA  ', 'Bao b\u00ec', 'Heo m\u1ea3nh', 'Vit-co'];
  const products = Array.from({ length: productCount }, (_, i) => ({
    id: i < 10 ? [0, '0', 7, '7', undefined, null, '', NaN, '__proto__', 'duplicate'][i] : `p-${i % (productCount - 2)}`,
    companyId: `tenant-${i % 2}`, name: `${pick(names)} ${i % 9}`, shortName: `SP${i % 13}`,
    stockUnit: pick(units), inventoryUnit: pick(units), unit: pick(units),
    stockQuantity: pick(quantities), openingStock: pick(quantities), inventoryQuantity: pick(quantities),
    stock: pick(quantities), costPrice: pick([12000, 25500.25, 0, '18.000', null, NaN]),
    mainGroup: pick(groups), category: pick(groups), isArchived: pick(archived),
    note: `Product field ${i}`, customMetadata: { position: i },
  }));
  const customers = Array.from({ length: Math.max(4, Math.floor(productCount / 4)) }, (_, i) => ({
    id: i === 0 ? 7 : i === 1 ? '7' : `c-${i}`, companyId: `tenant-${i % 2}`,
    name: `${pick(['Ch\u1ecb H\u00e0', 'CHI HA', '  chi-ha ', 'Anh B\u00ecnh', 'Binh'])} ${i % 4}`,
    isArchived: pick(archived),
  }));
  const productIds = [...products.map(product => product.id), 'unknown', 777];
  const customerIds = [...customers.map(customer => customer.id), 'unknown', undefined, ''];
  const measure = () => ({ unit: pick(units), quantity: pick(quantities) });
  const item = (index = 0) => ({
    rowKey: `row-${index}`, productId: pick(productIds), description: pick(names),
    productName: pick(names), productNameSnapshot: pick(names), productShortName: `SP${Math.floor(random() * 13)}`,
    quantity: pick(quantities), quantityValue: pick(quantities), qty: pick(quantities),
    quantityUnit: pick(units), unit: pick(units), totalKg: pick(quantities), weightKg: pick(quantities),
    pieceCount: pick(quantities), quantityCount: pick(quantities), totalQuantity: pick(quantities),
    measures: Array.from({ length: Math.floor(random() * 4) }, measure),
    extraMeasures: Array.from({ length: Math.floor(random() * 3) }, measure),
    unitPrice: pick([12000, 0, 17.5, '23.000', undefined]), costPrice: pick([9000, 0, '8.500', undefined]),
    billingUnit: pick(units), billingQuantity: pick(quantities), billingSnapshotVersion: pick([0, 1, undefined]),
    actualUnit: pick(units), actualQuantity: pick(quantities), amount: pick([undefined, 0, 37500, '25.000']),
    status: pick(['open', 'closed_short', undefined]), dispatchStatus: pick(['open', undefined, 'closed_short']),
    attributeLabel: pick(['', 'L\u00e0m s\u1ea1ch', 'nguy\u00ean con']), sizeLabel: pick(['', '2.5', '3']),
    date: pick(dates), isArchived: pick(archived),
  });
  const timestamp = () => pick([undefined, 'invalid', `${today}T08:00:00+07:00`, `${today}T10:00:00+07:00`,
    '2026-10-02T09:00:00+07:00', { seconds: 1790989200, nanoseconds: 123000000 }, 1790989200000]);
  const orders = Array.from({ length: recordCount }, (_, i) => ({ id: `order-${i}`, companyId: `tenant-${i % 2}`,
    date: pick(dates), isArchived: pick(archived), items: Array.from({ length: Math.floor(random() * 5) }, (_, j) => item(j)) }));
  const warehouseImports = Array.from({ length: recordCount }, (_, i) => ({ ...item(i), id: `import-${i}`,
    companyId: `tenant-${i % 2}`, date: pick(dates), isArchived: pick(archived),
    ...(random() < 0.6 ? { items: Array.from({ length: Math.floor(random() * 5) }, (_, j) => item(j)) } : {}) }));
  const warehouseDispatches = Array.from({ length: recordCount }, (_, i) => ({ ...item(i),
    id: random() < 0.15 ? '' : `dispatch-${i % Math.max(1, recordCount - 2)}`, companyId: `tenant-${i % 2}`,
    customerId: pick(customerIds), customerNameSnapshot: pick(customers).name, productNameSnapshot: pick(names),
    date: pick(dates), createdAt: timestamp(), isArchived: pick(archived),
    sourceOrderRequestDate: pick([...dates, undefined, undefined]), sourceOrderRequestId: `request-${i % 5}`,
    sourceOrderRequestRowKey: `row-${i % 4}`, weightEntries: [0.1, { quantity: 0.2 }, { kg: 0.3 }],
    ...(random() < 0.25 ? { items: [item(0), item(1)] } : {}) }));
  const orderRequests = Array.from({ length: recordCount }, (_, i) => {
    const items = Array.from({ length: 1 + Math.floor(random() * 4) }, (_, j) => item(j));
    return { id: `request-${i}`, companyId: `tenant-${i % 2}`, customerId: pick(customerIds),
      customerName: pick(customers).name, customerNameSnapshot: pick(customers).name,
      date: pick(dates), createdAt: timestamp(), isArchived: pick(archived),
      ...(random() < 0.2 ? { primaryItem: items[0], items: [] } : { items }),
      closedShortItemKeys: random() < 0.3 ? [pick(items).rowKey] : [],
      closedShortItems: random() < 0.25 ? { [pick(items).rowKey]: { reason: 'customer_cancel' } } : {},
      note: `Request note ${i}`, totalAmount: 123456 + i, salesEmpId: `sales-${i % 3}`, createdByEmpId: 'owner' };
  });
  return { products, customers, orders, warehouseImports, warehouseDispatches, orderRequests };
}

test('AST extraction uses independent revision dependencies and a deterministic clock', () => {
  assert.equal(before.values.get('src/App.jsx:getTodayString')(), today);
  assert.equal(after.values.get('src/App.jsx:getTodayString')(), today);
  assert.ok(before.values.has('src/utils/productMeasures.js:productStockBalance'));
  assert.ok(after.values.has('src/utils/productMeasures.js:buildProductStockBalanceIndex'));
  for (const dependency of ['getTransactionBillingPresentation', 'parseLooseQuantityValue', 'normalizeLookupText',
    'buildWarehouseDispatchMeasureEntries', 'resolveEntityDateKey', 'formatNumber']) {
    assert.equal(typeof before.values.get(`src/App.jsx:${dependency}`), 'function');
    assert.notStrictEqual(before.values.get(`src/App.jsx:${dependency}`), after.values.get(`src/App.jsx:${dependency}`));
  }
  assert.notStrictEqual(before.values.get('src/services/customerProductBilling.js:resolveTransactionBillingSnapshot'),
    after.values.get('src/services/customerProductBilling.js:resolveTransactionBillingSnapshot'));
  for (const harness of [before, after]) {
    assert.ok(!harness.values.has('src/App.jsx:App'));
    assert.ok(![...harness.values.keys()].some(key => /firebase|useEffect|useMemo|localStorage/i.test(key)));
  }
});

test('empty/default/null collections and optional warehouse paths retain all output fields', () => {
  assert.deepStrictEqual(after.inventory(), before.inventory());
  assert.deepStrictEqual(after.shortage(), before.shortage());
  inventoryParity({ products: null, orders: null }, { warehouseImports: null, warehouseDispatches: null });
  shortageParity({ customers: null, products: null, orderRequests: null, warehouseDispatches: null });
  const fixture = randomFixture(11);
  for (const options of [{}, { warehouseImports: [] }, { warehouseDispatches: [] },
    { warehouseImports: [], warehouseDispatches: [] },
    { warehouseImports: fixture.warehouseImports, warehouseDispatches: null },
    { warehouseImports: null, warehouseDispatches: fixture.warehouseDispatches }]) inventoryParity(fixture, options);
});

test('400-product realistic workload has exact full-output parity at multiple cutoffs', () => {
  const fixture = randomFixture(0x4002026, 400, 600);
  // Keep a realistic active majority while retaining edge cases throughout the data.
  fixture.products.forEach((product, i) => {
    if (i % 11 === 0) return;
    product.stockQuantity = 20 + i / 10;
    product.costPrice = 12000 + (i % 7) * 500;
    product.isArchived = i % 29 === 0;
  });
  for (const cutoff of ['', '2026-09-27', '2026-10-02', today, '2026-10-04']) {
    const inventory = inventoryParity(fixture, movementOptions(fixture, cutoff), `400 products cutoff ${cutoff}`);
    assert.ok(inventory.productRows.length > 300);
    assert.ok(inventory.groupRows.length > 3);
    inventoryParity(fixture, { untilDate: cutoff }, `400 products order-only cutoff ${cutoff}`);
  }
  const shortage = shortageParity(fixture, { includePreviousOpenOrders: true, fromDateKey: '2026-09-27' }, '400 products backlog');
  assert.ok(shortage.totalRequiredLines > 50);
  assert.ok(shortage.requestLineStatuses.length > 50);
  shortageParity(fixture, { dateKey: '2026-10-02', dispatchDateKey: today, autoCancelAfterDays: 1 }, '400 products same-day');
});

test('400 seeded randomized fixtures preserve archive/date/ID/unit/name and closed-shortage behavior', () => {
  for (let i = 0; i < 400; i += 1) {
    const fixture = randomFixture(0x51a70000 + i);
    const untilDate = ['', '2026-09-27', '2026-10-02', today, '2026-10-04', 20261003][i % 6];
    inventoryParity(fixture, movementOptions(fixture, untilDate), `seed ${i} warehouse`);
    inventoryParity(fixture, { untilDate }, `seed ${i} orders`);
    shortageParity(fixture, {
      dateKey: i % 7 === 0 ? '' : today,
      dispatchDateKey: i % 3 === 0 ? '2026-10-04' : today,
      includePreviousOpenOrders: i % 2 === 0,
      fromDateKey: ['', '2026-09-27', 'invalid', '2026-10-02'][i % 4],
      autoCancelAfterDays: [0, 1, 3, '7 days', -1][i % 5],
    }, `seed ${i} shortage`);
  }
});

test('inventory floats preserve record grouping, duplicate IDs, row order, and independent units', () => {
  const fixture = {
    products: [
      { id: 'p', name: 'Vit', unit: 'Con', openingStock: -2, costPrice: 101 },
      { id: 'p', name: 'Ga', unit: 'Kg', openingStock: 0.1, costPrice: 101 },
      { id: 7, name: 'Heo', unit: 'Con', openingStock: 2, costPrice: 101 },
      { id: '7', name: 'Bao', unit: 'Con', openingStock: 2, costPrice: 101 },
      { id: NaN, name: 'Missing ID', unit: 'Kg', openingStock: 2, costPrice: 101 },
      { name: 'No ID', unit: 'Kg', openingStock: 3, costPrice: 101 },
    ], orders: [{ items: [{ productId: 'p', quantity: 0.1, quantityUnit: 'Kg', unitPrice: 100 },
      { productId: 'p', quantity: 0.2, quantityUnit: 'Kg', unitPrice: 100 }] }],
    warehouseImports: [
      { productId: 'p', quantity: 1e16, totalKg: 1e16 },
      { items: [{ productId: 'p', quantity: -1e16, totalKg: -1e16 }, { productId: 'p', quantity: 1, totalKg: 1 }] },
      { items: [{ productId: 'p', totalKg: 0.1 }, { productId: 'p', totalKg: 0.2 }] },
      { productId: 7, quantity: 1 }, { productId: '7', quantity: 2 },
      { productId: NaN, totalKg: 1000 }, { totalKg: 0.2 },
    ], warehouseDispatches: [],
  };
  const result = inventoryParity(fixture, movementOptions(fixture));
  assert.deepStrictEqual(result.productRows.map(row => row.id), ['p', 'p', 7, '7', NaN, undefined]);
  assert.equal(result.productRows[0].remainingStock, -2);
  assert.equal(result.productRows[1].remainingStock, 0.1 + (0.1 + 0.2));
  assert.equal(result.productRows[2].remainingStock, 3);
  assert.equal(result.productRows[3].remainingStock, 4);
  assert.equal(result.productRows[4].remainingStock, 2);
});

function editableFixture() {
  return {
    products: [{ id: 'p', companyId: 'a', name: 'V\u1ecbt c\u1ecf', shortName: 'VC', unit: 'Kg', openingStock: 5, costPrice: 100 }],
    customers: [{ id: 'c', companyId: 'a', name: 'Ch\u1ecb H\u00e0' }],
    orders: [{ id: 'o', companyId: 'a', date: today, items: [{ productId: 'p', quantity: 0.1, quantityUnit: 'Kg', unitPrice: 100 }] }],
    warehouseImports: [{ id: 'i', companyId: 'a', date: today, items: [{ productId: 'p', totalKg: 0.1 }, { productId: 'p', totalKg: 0.2 }] }],
    warehouseDispatches: [{ id: 'd', companyId: 'a', date: today, createdAt: `${today}T09:00:00+07:00`,
      customerId: 'c', productId: 'p', weightKg: 0.1 }],
    orderRequests: [{ id: 'r', companyId: 'a', customerId: 'c', date: today, createdAt: `${today}T10:00:00+07:00`,
      items: [{ rowKey: 'line', productId: 'p', quantity: 0.3, quantityUnit: 'Kg' }] }],
  };
}

test('warm calculations rebuild after in-place edits, renames, archives, and removals', () => {
  const fixture = editableFixture();
  // Reuse the same harness AND array/object identities to expose stale caches.
  const check = label => {
    const snapshot = structuredClone(fixture);
    const inventory = after.inventory(fixture.products, fixture.orders, movementOptions(fixture));
    const shortage = after.shortage({ ...fixture, dateKey: today });
    assert.deepStrictEqual(inventory, before.inventory(fixture.products, fixture.orders, movementOptions(fixture)), `${label} inventory`);
    assert.deepStrictEqual(shortage, before.shortage({ ...fixture, dateKey: today }), `${label} shortage`);
    assert.deepStrictEqual(fixture, snapshot, `${label} input mutation`);
    return { inventory, shortage };
  };
  const initial = check('initial');
  assert.equal(initial.shortage.missingLines[0].remainingKg, 0.3);
  fixture.warehouseImports[0].items[0].totalKg = 7;
  fixture.warehouseDispatches[0].weightKg = 2;
  fixture.orders[0].items[0].quantity = 0.2;
  fixture.products[0].openingStock = -4;
  fixture.orderRequests[0].items[0].quantity = 0.7;
  const edited = check('quantities and opening stock edited');
  assert.notDeepStrictEqual(edited, initial);
  assert.equal(edited.shortage.missingLines[0].remainingKg, 0.7);
  fixture.products[0].name = 'Renamed product';
  fixture.products[0].shortName = 'RP';
  fixture.customers[0].name = 'Renamed customer';
  const renamed = check('catalog labels edited');
  assert.equal(renamed.shortage.missingLines[0].customerName, 'Renamed customer');
  assert.equal(renamed.shortage.missingLines[0].productName, 'Renamed product');
  fixture.warehouseDispatches[0].createdAt = `${today}T11:00:00+07:00`;
  assert.equal(check('dispatch timestamp edited').shortage.coveredLines, 1);
  fixture.warehouseDispatches[0].isArchived = true;
  assert.equal(check('dispatch archived').shortage.coveredLines, 0);
  fixture.warehouseDispatches.splice(0, 1);
  fixture.warehouseImports.splice(0, 1);
  fixture.orders.splice(0, 1);
  const removed = check('movements and order removed');
  assert.equal(removed.inventory.productRows[0].remainingStock, -4);
  fixture.orderRequests[0].closedShortItems = { line: { reason: 'customer_cancel' } };
  assert.equal(check('shortage closed').shortage.totalRequiredLines, 0);
  fixture.orderRequests[0].closedShortItems = {};
  fixture.orderRequests[0].date = '2026-10-04';
  assert.equal(check('request date edited').shortage.totalRequiredLines, 0);
  fixture.orderRequests.splice(0, 1);
  fixture.products.splice(0, 1);
  fixture.customers.splice(0, 1);
  const empty = check('catalog and request removed');
  assert.deepStrictEqual(empty.inventory.productRows, []);
  assert.deepStrictEqual(empty.shortage.requestLineStatuses, []);
});

test('closed-shortage forms, name aliases, timestamp ties, and backlog boundaries match exactly', () => {
  const fixture = editableFixture();
  fixture.orderRequests[0].createdAt = `${today}T08:00:00+07:00`;
  fixture.warehouseDispatches[0].createdAt = fixture.orderRequests[0].createdAt;
  fixture.warehouseDispatches[0].customerId = 'historical-c';
  fixture.warehouseDispatches[0].customerNameSnapshot = '  CHI-HA ';
  fixture.warehouseDispatches[0].productId = 'historical-p';
  fixture.warehouseDispatches[0].productNameSnapshot = 'VIT CO';
  fixture.warehouseDispatches[0].productShortName = 'vc';
  assert.equal(shortageParity(fixture).coveredLines, 1);
  for (const closure of [
    { items: [{ ...fixture.orderRequests[0].items[0], status: 'closed_short' }] },
    { items: [{ ...fixture.orderRequests[0].items[0], dispatchStatus: 'closed_short' }] },
    { closedShortItemKeys: ['line'] }, { closedShortItemKeys: ['p'] }, { closedShortItemKeys: ['vit co'] },
    { closedShortItems: { line: { reason: 'cancelled' } } }, { closedShortItems: { p: true } },
    { closedShortItems: { 'vit co': true } },
  ]) {
    const closed = { ...fixture, orderRequests: [{ ...fixture.orderRequests[0], ...closure }] };
    assert.equal(shortageParity(closed).totalRequiredLines, 0);
  }
  const backlog = structuredClone(fixture);
  backlog.orderRequests[0].date = '2026-10-02';
  backlog.orderRequests[0].createdAt = '2026-10-02T08:00:00+07:00';
  backlog.warehouseDispatches[0].sourceOrderRequestDate = '2026-10-02';
  assert.equal(shortageParity(backlog).totalRequiredLines, 0);
  assert.equal(shortageParity(backlog, { includePreviousOpenOrders: true, fromDateKey: '2026-10-02', autoCancelAfterDays: 1 }).coveredLines, 1);
  assert.equal(shortageParity(backlog, { includePreviousOpenOrders: true, fromDateKey: today }).totalRequiredLines, 0);
  assert.equal(shortageParity(backlog, { includePreviousOpenOrders: true, dispatchDateKey: '2026-10-04', autoCancelAfterDays: 1 }).totalRequiredLines, 0);
});

test('tenant scope remains caller supplied with colliding IDs and shared array identities', () => {
  const tenantA = editableFixture();
  const tenantB = structuredClone(tenantA);
  for (const collection of Object.values(tenantB)) for (const record of collection) record.companyId = 'b';
  tenantB.products[0].name = 'Tenant B product';
  tenantB.products[0].openingStock = 200;
  tenantB.customers[0].name = 'Tenant B customer';
  tenantB.orderRequests[0].items[0].quantity = 17;
  tenantB.warehouseDispatches[0].weightKg = 20;
  tenantB.warehouseDispatches[0].createdAt = `${today}T11:00:00+07:00`;
  const mixed = Object.fromEntries(Object.keys(tenantA).map(key => [key, [...tenantA[key], ...tenantB[key]]]));
  const scope = tenant => Object.fromEntries(Object.entries(mixed).map(([key, records]) =>
    [key, records.filter(record => record.companyId === tenant)]));
  const scopedA = scope('a');
  const inventoryA = inventoryParity(scopedA, movementOptions(scopedA), 'tenant a');
  const shortageA = shortageParity(scopedA, {}, 'tenant a');
  const scopedB = scope('b');
  const inventoryB = inventoryParity(scopedB, movementOptions(scopedB), 'tenant b');
  const shortageB = shortageParity(scopedB, {}, 'tenant b');
  assert.notDeepStrictEqual(inventoryA, inventoryB);
  assert.equal(shortageA.missingLines[0].customerName, 'Ch\u1ecb H\u00e0');
  assert.equal(shortageB.coveredLines, 1);
  // Mimic a caller replacing tenant data in existing arrays, then switching back.
  for (const [key, records] of Object.entries(scopedA)) records.splice(0, records.length, ...scopedB[key]);
  assert.deepStrictEqual(after.inventory(scopedA.products, scopedA.orders, movementOptions(scopedA)), inventoryB);
  assert.deepStrictEqual(after.shortage({ ...scopedA, dateKey: today }), shortageB);
  for (const [key, records] of Object.entries(scopedA)) records.splice(0, records.length, ...scope('a')[key]);
  assert.deepStrictEqual(after.inventory(scopedA.products, scopedA.orders, movementOptions(scopedA)), inventoryA);
  assert.deepStrictEqual(after.shortage({ ...scopedA, dateKey: today }), shortageA);
  inventoryParity(mixed, movementOptions(mixed), 'caller supplied mixed scope');
  shortageParity(mixed, {}, 'caller supplied mixed scope');
});

test('shortage latest dispatch preserves stable timestamp ties and the complete ordered ID list', () => {
  const fixture = editableFixture();
  fixture.orderRequests[0].createdAt = `${today}T08:00:00+07:00`;
  const template = fixture.warehouseDispatches[0];
  fixture.warehouseDispatches = [
    { ...template, id: 'latest-first', createdAt: `${today}T12:00:00+07:00` },
    { ...template, id: 'older', createdAt: `${today}T09:00:00+07:00` },
    { ...template, id: 'latest-second', createdAt: `${today}T12:00:00+07:00` },
    { ...template, id: 'earlier-than-request', createdAt: `${today}T07:00:00+07:00` },
  ];
  const result = shortageParity(fixture);
  const status = result.requestLineStatuses[0];
  assert.equal(status.status, 'dispatched');
  assert.equal(status.dispatchedAt, new Date(`${today}T12:00:00+07:00`).getTime());
  assert.deepStrictEqual(status.dispatchIds, ['older', 'latest-first', 'latest-second']);
  fixture.warehouseDispatches[0].createdAt = `${today}T06:00:00+07:00`;
  assert.deepStrictEqual(shortageParity(fixture).requestLineStatuses[0].dispatchIds, ['older', 'latest-second']);
});
