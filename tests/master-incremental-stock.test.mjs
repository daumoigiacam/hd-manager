import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { createIncrementalProductStockIndex } from '../src/utils/incrementalProductStock.js';
import { measureQuantity, productStockBalance, buildProductStockBalanceIndex } from '../src/utils/productMeasures.js';
import { PRODUCT_PRICING_UNIT_OPTIONS, normalizeProductPricingUnit } from '../src/services/productPricingUnits.js';
import { retainCollectionIdentity, retainCollectionRecordIdentity } from '../src/utils/collectionIdentity.js';
import { appFunction } from './helpers/app-source-function.mjs';
import { resolveTransactionBillingSnapshot, isSameBillingUnit } from '../src/services/customerProductBilling.js';

const measurementFields = item => [item.productId,
  item.totalKg ?? item.weightKg ?? item.kg ?? item.actualWeightKg ?? item.weight ?? null,
  item.quantity ?? item.totalQuantity ?? item.qty ?? item.pieceCount ?? item.quantityCount ?? null];

function calculator(options = {}) {
  const measured = [];
  let calls = 0;
  const index = createIncrementalProductStockIndex({
    ...options,
    measureQuantity: (item, unit) => {
      calls += 1;
      measured.push(measurementFields(item));
      return measureQuantity(item, unit);
    },
  });
  return { ...index, measured, count: item => measured.filter(fields =>
    fields.every((value, i) => Object.is(value, measurementFields(item)[i]))).length, get calls() { return calls; } };
}

function parity(index, products, imports = [], dispatches = [], cutoff = '') {
  const actual = index.build(products, imports, dispatches, cutoff);
  assert.ok(actual instanceof Map);
  assert.equal(actual.size, new Set(products.filter(() => true)).size);
  products.forEach(product => assert.deepStrictEqual(actual.get(product),
    productStockBalance(product, imports, dispatches, cutoff),
    `Exact legacy parity: ID ${String(product.id)}, unit ${product.stockUnit || product.inventoryUnit || product.unit}, cutoff ${cutoff}`));
  return actual;
}

function freezeGraph(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeGraph);
    Object.freeze(value);
  }
  return value;
}

test('semantic snapshots support default construction and validate measurement injection', () => {
  assert.throws(() => createIncrementalProductStockIndex({ measureQuantity: null }), TypeError);
  assert.equal(createIncrementalProductStockIndex().build().size, 0);
});

test('unchanged records are not remeasured during immutable append/edit/remove/reorder updates', () => {
  const index = calculator();
  const products = freezeGraph([{ id: 'p', unit: 'Kg', openingStock: -3 },
    { id: 'p', unit: 'Kg', openingStock: 20 }, { id: 'q', unit: 'Con' }]);
  const first = freezeGraph({ date: '2026-10-01', items: [
    { productId: 'p', totalKg: 0.1 }, { productId: 'p', totalKg: 0.2 }, { productId: 'q', quantity: 7 },
  ] });
  const second = freezeGraph({ date: '2026-10-02', productId: 'p', totalKg: 4 });
  const dispatch = freezeGraph({ date: '2026-10-02', productId: 'p', totalKg: 1 });
  let imports = freezeGraph([first, second]);
  const dispatches = freezeGraph([dispatch]);
  parity(index, products, imports, dispatches);
  assert.equal(index.calls, 5, 'Duplicate products with the same ID and unit share record measurements');
  const initial = index.calls;
  parity(index, products.slice(), imports.slice(), dispatches.slice());
  assert.equal(index.calls, initial);
  const added = freezeGraph({ date: '2026-10-03', productId: 'p', totalKg: 2 });
  imports = freezeGraph([...imports, added]);
  parity(index, products, imports, dispatches);
  assert.equal(index.calls, initial + 1);
  const edited = freezeGraph({ ...first, items: first.items.map((item, i) => i === 0 ? { ...item, totalKg: 8 } : item) });
  imports = freezeGraph([edited, second, added]);
  parity(index, products, imports, dispatches);
  assert.equal(index.calls, initial + 4, 'Only the changed record is remeasured, including its retained items');
  assert.equal(index.count(second), 1);
  assert.equal(index.count(dispatch), 1);
  assert.equal(index.count(added), 1);
  const afterEdit = index.calls;
  imports = freezeGraph([added, edited]);
  parity(index, products, imports, dispatches);
  parity(index, products.slice().reverse(), imports.slice().reverse(), []);
  assert.equal(index.calls, afterEdit, 'Removals and reorders reuse measurements');
});

test('reorders, edits, and duplicate record occurrences sum from zero in original record order', () => {
  const index = calculator();
  const product = { id: 'p', unit: 'Con', openingStock: 0.1 };
  const products = [product];
  const large = { productId: 'p', quantity: 1e16 };
  const small = { productId: 'p', quantity: 1 };
  const negative = { productId: 'p', quantity: -1e16 };
  let imports = [large, small, negative];
  assert.equal(parity(index, products, imports).get(product).incoming, 0);
  const initialCalls = index.calls;
  imports = [large, negative, small];
  assert.equal(parity(index, products, imports).get(product).incoming, 1);
  assert.equal(index.calls, initialCalls);
  const edited = { ...small, quantity: 2 };
  imports = [large, edited, negative];
  assert.equal(parity(index, products, imports).get(product).incoming, 2);
  assert.equal(index.calls, initialCalls + 1);
  assert.equal(parity(index, products, [edited, edited, edited]).get(product).incoming, 6);
  const nested = { items: [{ productId: 'p', quantity: -1e16 }, { productId: 'p', quantity: 1 }] };
  assert.equal(parity(index, products, [large, nested]).get(product).incoming, 0, 'Nested subtotal must precede record addition');
  parity(index, products, [nested, { productId: 'p', quantity: 0.1 }, { productId: 'p', quantity: 0.2 }], [large, nested]);
  parity(index, products, [{ items: [large, large, negative] }, negative], [{ items: [negative, negative, large] }]);
  parity(index, products, [{ productId: 'p', quantity: Number.MAX_VALUE }, { productId: 'p', quantity: Number.MAX_VALUE }]);
});

test('cutoff/archive changes and empty/null/false items retain reference eligibility and precedence', () => {
  const index = calculator();
  const products = [{ id: 'p', unit: 'Kg', openingStock: -2, isArchived: true }, { id: 'p', unit: 'Con' }];
  const records = [
    { productId: 'p', totalKg: 0, weightKg: 10, quantity: 0, qty: 10,
      measures: [{ unit: 'Kg', quantity: 30 }, { unit: 'Con', quantity: 40 }] },
    { productId: 'p', date: '2026-10-01', totalKg: NaN, quantity: Infinity,
      extraMeasures: [{ unit: 'Kg', quantity: 30 }, { unit: 'Con', quantity: 40 }] },
    { productId: 'p', date: '2026-10-02', items: [], totalKg: 100 },
    { productId: 'p', date: '2026-10-03', items: null, weightKg: -1, qty: 3 },
    { productId: 'p', date: null, items: false, extraMeasures: [{ unit: 'Kg', quantity: 0.1 }] },
    { date: '2026-10-02', items: [{ productId: 'p', date: '2099-01-01', isArchived: true, totalKg: 2 }] },
    { productId: 'p', date: '2026-10-02', isArchived: 'false', totalKg: 1000 },
  ];
  for (const cutoff of ['', '2026-10-01', '2026-10-02', '2026-10-03', '', 20261003, -1, NaN]) {
    parity(index, products, records, records.slice().reverse(), cutoff);
  }
  const measured = index.calls;
  for (const cutoff of ['2026-10-01', '2026-10-03', '', '2026-10-02']) parity(index, products, records, [], cutoff);
  assert.equal(index.calls, measured, 'Cutoffs do not remeasure previously measured records');
  const archived = records.map((record, i) => i === 0 ? { ...record, isArchived: true } : record);
  parity(index, products, archived);
  assert.equal(index.calls, measured, 'Archived replacements are excluded before measuring');
  const unarchived = archived.map((record, i) => i === 0 ? { ...record, isArchived: false } : record);
  parity(index, products, unarchived);
  assert.equal(index.calls, measured, 'Present archived records retain measurements when restored');
});

test('product unit/ID changes invalidate only newly relevant record contributions', () => {
  const index = calculator();
  let products = [{ id: 'p', stockUnit: 'Con', openingStock: -1 }, { id: 'q', unit: 'Kg' }];
  const p = { productId: 'p', quantity: 3, quantityUnit: 'Con', totalKg: 4,
    extraMeasures: [{ unit: 'Bao', quantity: 5 }] };
  const q = { productId: 'q', totalKg: 6 };
  const imports = [p, q];
  parity(index, products, imports);
  assert.equal(index.calls, 2);
  products = [{ ...products[0], name: 'Renamed', openingStock: 20 }, products[1]];
  parity(index, products, imports);
  assert.equal(index.calls, 2, 'Renames/opening stock changes do not invalidate measurements');
  products = [{ ...products[0], stockUnit: 'Kg' }, products[1]];
  parity(index, products, imports);
  assert.equal(index.count(p), 2);
  assert.equal(index.count(q), 1, 'Unrelated product measurements stay cached');
  products = [...products, { id: 'p', unit: 'Bao' }, { id: 'p', unit: 'Kg', openingStock: -8 }];
  const duplicateResult = parity(index, products, imports);
  assert.equal(index.count(p), 3);
  assert.notStrictEqual(duplicateResult.get(products[0]), duplicateResult.get(products[3]));
  products = [{ ...products[0], id: 'q' }, products[1]];
  parity(index, products, imports);
  assert.equal(index.count(q), 1);
  products = [{ id: 'p', unit: 'Con' }, ...products];
  parity(index, products, imports);
  assert.equal(index.count(p), 4, 'Removed product units are invalidated rather than retained as history');
});

test('excluded caches are bounded by current records and catalog units, without measuring excluded edits', () => {
  const index = calculator();
  const con = { id: 'p', unit: 'Con' };
  const kg = { id: 'p', unit: 'Kg' };
  const movement = { id: 'a', date: '2026-10-02', productId: 'p', quantity: 2, totalKg: 5 };
  parity(index, [con, kg], [movement]);
  assert.equal(index.calls, 2);
  parity(index, [con], [structuredClone(movement)], [], '2026-10-01');
  parity(index, [con, kg], [structuredClone(movement)]);
  assert.equal(index.calls, 3, 'A unit removed while excluded is remeasured; the retained unit is not');
  parity(index, [con, kg], [{ ...movement, isArchived: true }]);
  parity(index, [con, kg], [{ ...movement, isArchived: false }]);
  assert.equal(index.calls, 3, 'Archive flags do not change cached stock fields');
  const edited = { ...movement, quantity: 7, totalKg: 9 };
  parity(index, [con, kg], [{ ...edited, isArchived: true }]);
  assert.equal(index.calls, 3, 'Excluded stock edits are not measured');
  parity(index, [con, kg], [edited]);
  assert.equal(index.calls, 5, 'Restoring edited stock fields measures the new values');
  parity(index, [con, kg], [edited], [], '2026-10-01');
  parity(index, [con, kg], []);
  parity(index, [con, kg], [structuredClone(edited)]);
  assert.equal(index.calls, 7, 'A removed excluded record does not leave historical cache entries');
  const ignoredMalformed = [{ isArchived: true, items: true },
    { date: '2099-01-01', items: [null] }, { isArchived: true, items: [null] }];
  parity(index, [con, kg], ignoredMalformed, [], '2026-10-03');
  assert.equal(index.calls, 7, 'Ignored malformed records neither throw nor measure');
});

test('strict ID identity, duplicate products, missing IDs, and sparse arrays have numeric parity', () => {
  const index = calculator();
  const objectId = {};
  const otherObjectId = {};
  const symbolId = Symbol('id');
  const ids = [0, -0, '0', false, null, undefined, NaN, 7, '7', objectId, otherObjectId, symbolId, 7n, '__proto__'];
  const products = ids.flatMap(id => [{ id, unit: 'Kg', openingStock: -2 }, { id, unit: 'Con', openingStock: 3 }]);
  products.push(products[0], { ...products[0], openingStock: Infinity });
  const imports = ids.map((productId, i) => ({ productId, totalKg: i + 0.1, quantity: i + 0.2 }));
  imports.push({ productId: {}, totalKg: 1000 }, { totalKg: 1 });
  parity(index, products, imports, imports.slice().reverse());
  parity(index, products.slice().reverse(), imports.slice().reverse(), imports);
  assert.equal(index.build(products, imports).get(products.find(product => Number.isNaN(product.id))).incoming, 0);
  parity(index, [{ id: 'p', unit: 'Con' }, , { id: 'q', unit: 'Kg' }],
    [, { items: [, { productId: 'p', quantity: 1 }, , { productId: 'q', totalKg: 2 }] }, ,]);
});

test('consumer lifetimes and clear() isolate caches, snapshots, and in-place edits', () => {
  const first = calculator();
  const second = calculator();
  const products = [{ id: 'p', unit: 'Con', openingStock: -3 }];
  const item = { productId: 'p', quantity: 2 };
  const imports = [{ items: [item] }];
  const snapshot = parity(first, products, imports);
  parity(second, products, imports);
  assert.equal(first.calls, 1);
  assert.equal(second.calls, 1);
  const next = parity(first, products, imports.slice());
  assert.notStrictEqual(snapshot, next);
  assert.notStrictEqual(snapshot.get(products[0]), next.get(products[0]));
  next.get(products[0]).incoming = 1000;
  assert.equal(parity(first, products, imports).get(products[0]).incoming, 2, 'Consumer edits never corrupt cached totals');
  item.quantity = 7;
  assert.equal(productStockBalance(products[0], imports).incoming, 7);
  assert.equal(buildProductStockBalanceIndex(products, imports).get(products[0]).incoming, 7);
  assert.equal(parity(first, products, imports).get(products[0]).incoming, 7);
  assert.equal(first.calls, 2, 'In-place stock edits are detected without an explicit clear');
  first.clear();
  assert.equal(parity(first, products, imports).get(products[0]).incoming, 7);
  assert.equal(first.calls, 3, 'clear() explicitly discards cached measurements');
  assert.deepStrictEqual(snapshot.get(products[0]), { incoming: 2, outgoing: 0, remaining: -1 });
  second.clear();
  parity(second, [{ id: 'p', unit: 'Con' }], [{ productId: 'p', quantity: 100 }]);
  parity(first, products, []);
});

test('explicit immutableRecords reuses retained graphs; nested edits replace records and clear resets the promise', () => {
  const index = calculator({ immutableRecords: true });
  const products = [{ id: 'p', unit: 'Con' }, { id: 'p', unit: 'Kg' }];
  const first = freezeGraph({ id: 'a', date: '2026-10-02', items: [{ productId: 'p', quantity: 0.1, totalKg: 2,
    measures: [{ unit: 'Con', quantity: 4 }] }] });
  let imports = freezeGraph([first]);
  parity(index, products, imports);
  parity(index, products, imports.slice());
  assert.equal(index.calls, 2);
  const second = freezeGraph({ id: 'b', productId: 'p', quantity: 0.2, totalKg: 3 });
  imports = retainCollectionRecordIdentity(imports, freezeGraph(structuredClone([...imports, second])));
  assert.strictEqual(imports[0], first);
  parity(index, products, imports);
  assert.equal(index.calls, 4);
  const edited = freezeGraph({ ...first, items: first.items.map(item => ({ ...item, quantity: 7 })) });
  imports = freezeGraph([second, edited]);
  parity(index, products, imports);
  assert.equal(index.calls, 6);
  parity(index, products, imports, [], '2026-10-01');
  products[0].openingStock = -9;
  parity(index, products, imports, [], '2026-10-03');
  assert.equal(index.calls, 6, 'Cutoff and mutable product opening stock do not recapture immutable movements');
  index.clear();
  parity(index, products, imports);
  assert.equal(index.calls, 10, 'clear discards both captures and measurement entries');
  let quantity = 2;
  const coercible = { productId: 'p', quantity: { valueOf: () => quantity } };
  parity(index, products, [coercible]);
  quantity = 8;
  parity(index, products, [coercible]);
  assert.equal(index.calls, 14, 'Nonprimitive fields are never trusted by the immutable shortcut');
  const repairable = { productId: 'p', quantity: 3 };
  parity(index, products, [repairable]);
  repairable.quantity = 6;
  index.clear();
  parity(index, products, [repairable]);
});

test('identical immutable movement arrays and catalog ID/unit sets reuse totals without movement traversal', () => {
  const index = calculator({ immutableRecords: true });
  const products = [{ id: 'p', unit: 'Con', openingStock: 0.1, costPrice: 5 },
    { id: 'p', unit: 'Kg', openingStock: -2 }, { id: 'p', unit: 'Con', openingStock: 9 },
    { id: NaN, unit: 'Kg', openingStock: -3 }];
  const imports = freezeGraph([{ productId: 'p', quantity: 1e16, totalKg: 0.1 },
    { items: [{ productId: 'p', quantity: -1e16, totalKg: 0.2 }, { productId: 'p', quantity: 1, totalKg: 0.3 }] },
    { productId: NaN, quantity: 900 }]);
  const dispatches = freezeGraph([{ productId: 'p', quantity: 0.1, totalKg: 0.2 }]);
  const originalForEach = Array.prototype.forEach;
  let scans = 0;
  Array.prototype.forEach = function (callback, thisArg) {
    if (this === imports || this === dispatches) scans += 1;
    return originalForEach.call(this, callback, thisArg);
  };
  try {
    const first = parity(index, products, imports, dispatches, '2026-10-03');
    const measurements = index.calls;
    assert.equal(scans, 2);
    products[0].openingStock = -100;
    products[0].costPrice = 8;
    products[0].name = 'Renamed';
    const nextProducts = [...products].reverse();
    nextProducts.push({ id: 'p', unit: 'Con', openingStock: -7 });
    const next = parity(index, nextProducts, imports, dispatches, '2026-10-03');
    assert.equal(scans, 2, 'Price/name/opening changes, product reorder and same-unit duplicates scan no movements');
    assert.equal(index.calls, measurements);
    assert.notStrictEqual(next, first);
    assert.notStrictEqual(next.get(products[0]), first.get(products[0]));
    assert.deepStrictEqual([...next.keys()], nextProducts, 'Fresh result keys retain current product-object order');
    next.get(products[0]).incoming = 1234;
    parity(index, nextProducts, imports, dispatches, '2026-10-03');
    assert.equal(scans, 2, 'Consumer result mutations do not invalidate or corrupt internal totals');
    assert.equal(first.get(products[0]).remaining, 0.1 - 0.1);
    products[0].stockQuantity = Symbol('invalid opening');
    assert.throws(() => index.build(nextProducts, imports, dispatches, '2026-10-03'), TypeError);
    assert.throws(() => productStockBalance(products[0], imports, dispatches, '2026-10-03'), TypeError);
    delete products[0].stockQuantity;
    parity(index, nextProducts, imports, dispatches, '2026-10-03');
    assert.equal(scans, 2, 'A failed opening-stock conversion does not corrupt reusable totals');
    index.clear();
    parity(index, nextProducts, imports, dispatches, '2026-10-03');
    assert.equal(scans, 4, 'clear discards the identical-input shortcut');
  } finally {
    Array.prototype.forEach = originalForEach;
  }
});

test('identical-input shortcut invalidates catalog IDs/units, cutoff, record date/archive and array order/membership', () => {
  const index = calculator({ immutableRecords: true });
  let products = [{ id: 7, unit: 'Con' }, { id: '7', unit: 'Kg' }, { id: NaN, unit: 'Con' }];
  let imports = freezeGraph([{ id: 'a', date: '2026-10-02', productId: 7, quantity: 1e16, totalKg: 2 },
    { id: 'b', date: '2026-10-03', productId: 7, quantity: 1, totalKg: 3 },
    { id: 'c', productId: 7, quantity: -1e16, totalKg: 4 },
    { id: 'd', productId: '7', quantity: 5, totalKg: 6 }, { id: 'e', productId: 'new', quantity: 8 }]);
  const dispatches = freezeGraph([]);
  parity(index, products, imports, dispatches, '2026-10-03');
  products = [...products, { id: 'new', unit: 'Con' }];
  assert.equal(parity(index, products, imports, dispatches, '2026-10-03').get(products[3]).incoming, 8);
  products = products.map((product, i) => i === 0 ? { ...product, unit: 'Kg' } : product);
  assert.equal(parity(index, products, imports, dispatches, '2026-10-03').get(products[0]).incoming, 9);
  products = products.slice(0, 2);
  parity(index, products, imports, dispatches, '2026-10-03');
  products[0].id = '7';
  assert.equal(parity(index, products, imports, dispatches, '2026-10-03').get(products[0]).incoming, 6);
  products[0].id = 7;
  products[0].unit = 'Con';
  assert.equal(parity(index, products, imports, dispatches, '2026-10-02').get(products[0]).incoming, 0);
  parity(index, products, imports, dispatches, '2026-10-03');
  imports = freezeGraph(imports.map((record, i) => i === 1 ? { ...record, date: '2099-01-01' } : record));
  parity(index, products, imports, dispatches, '2026-10-03');
  imports = freezeGraph(imports.map((record, i) => i === 0 ? { ...record, isArchived: true } : record));
  parity(index, products, imports, dispatches, '2026-10-03');
  imports = freezeGraph(imports.map(record => ({ ...record, date: '2026-10-03', isArchived: false })));
  parity(index, products, imports, dispatches, '2026-10-03');
  imports = freezeGraph([imports[0], imports[2], imports[1], imports[3]]);
  assert.equal(parity(index, products, imports, dispatches, '2026-10-03').get(products[0]).incoming, 1);
  imports = freezeGraph(imports.slice(1));
  parity(index, products, imports, dispatches, '2026-10-03');
  imports = freezeGraph([...imports, { productId: 7, quantity: 0.2 }]);
  parity(index, products, imports, dispatches, '2026-10-03');
  const outgoing = freezeGraph([{ productId: 7, quantity: 0.1 }]);
  parity(index, products, imports, outgoing, '2026-10-03');
});

test('default mode still detects same-array mutations; immutable shortcut conservatively bypasses coercible inputs', () => {
  const index = calculator();
  const products = [{ id: 'p', unit: 'Con' }];
  const imports = [{ productId: 'p', quantity: 1 }, { productId: 'p', quantity: 2 }];
  const dispatches = [];
  parity(index, products, imports, dispatches);
  imports.push({ productId: 'p', quantity: 4 });
  parity(index, products, imports, dispatches);
  imports[0].quantity = 8;
  parity(index, products, imports, dispatches);
  imports[1].isArchived = true;
  parity(index, products, imports, dispatches);
  imports.reverse();
  parity(index, products, imports, dispatches);
  imports.pop();
  parity(index, products, imports, dispatches);
  const immutable = calculator({ immutableRecords: true });
  let quantity = 3;
  const coercible = freezeGraph([{ productId: 'p', quantity: { valueOf: () => quantity } }]);
  assert.equal(parity(immutable, products, coercible, dispatches).get(products[0]).incoming, 3);
  quantity = 9;
  assert.equal(parity(immutable, products, coercible, dispatches).get(products[0]).incoming, 9);
  let rawUnit = 'Con';
  const unitProduct = { id: 'p', unit: { toString: () => rawUnit } };
  const movements = freezeGraph([{ productId: 'p', quantity: 2, totalKg: 5 }]);
  assert.equal(parity(immutable, [unitProduct], movements, dispatches).get(unitProduct).incoming, 2);
  rawUnit = 'Kg';
  assert.equal(parity(immutable, [unitProduct], movements, dispatches).get(unitProduct).incoming, 5);
  let date = '2026-10-01';
  const dated = freezeGraph([{ productId: 'p', quantity: 4, date: { toString: () => date } }]);
  assert.equal(parity(immutable, products, dated, dispatches, '2026-10-03').get(products[0]).incoming, 4);
  date = '2026-10-04';
  assert.equal(parity(immutable, products, dated, dispatches, '2026-10-03').get(products[0]).incoming, 0);
  const choices = PRODUCT_PRICING_UNIT_OPTIONS.slice();
  try {
    const product = { id: 'p', unit: 'kilograms' };
    const incoming = freezeGraph([{ productId: 'p', totalKg: 5, quantity: 2, quantityUnit: 'kilograms' }]);
    assert.equal(parity(immutable, [product], incoming, dispatches).get(product).incoming, 5);
    PRODUCT_PRICING_UNIT_OPTIONS.unshift('kilograms');
    assert.equal(parity(immutable, [product], incoming, dispatches).get(product).incoming, 2);
  } finally {
    PRODUCT_PRICING_UNIT_OPTIONS.splice(0, PRODUCT_PRICING_UNIT_OPTIONS.length, ...choices);
  }
});

test('a failed immutable build does not publish partial balances or corrupt later builds', () => {
  const index = calculator();
  const products = [{ id: 'p', unit: 'Con' }];
  const first = { productId: 'p', quantity: 3 };
  const previous = parity(index, products, [first]);
  const broken = { productId: 'p', quantity: Symbol('invalid numeric value') };
  assert.throws(() => index.build(products, [first, broken]), TypeError);
  assert.throws(() => productStockBalance(products[0], [first, broken]), TypeError);
  const repaired = { ...broken, quantity: 0.2 };
  parity(index, products, [first, repaired]);
  assert.deepStrictEqual(previous.get(products[0]), { incoming: 3, outgoing: 0, remaining: 3 });
});

test('semantic stock snapshots reuse cloned records and detect mutable fields and measure ordering', () => {
  const index = calculator();
  const products = [{ id: 'p', unit: 'Kg' }, { id: 'p', unit: 'Con' }, { id: 'p', unit: 'Bao' }];
  const imports = [{ id: 'movement', date: '2026-10-01', note: 'original metadata', items: [
    { productId: 'p', totalKg: 5, quantity: 2, quantityUnit: 'Con',
      measures: [{ unit: 'Bao', quantity: 3 }, { unit: 'Bao', quantity: 99 }],
      extraMeasures: [{ unit: 'Bao', quantity: 8 }] },
  ] }];
  parity(index, products, imports);
  assert.equal(index.calls, 3);
  const cloned = structuredClone(imports);
  cloned[0].note = 'Different metadata';
  cloned[0].items[0].unitPrice = 50000;
  parity(index, products.slice(), cloned);
  assert.equal(index.calls, 3, 'Full clones and business-only edits do not normalize or measure again');
  cloned[0].items[0].totalKg = 7;
  parity(index, products, cloned);
  assert.equal(index.calls, 6, 'In-place stock edits invalidate that record');
  cloned[0].items[0].measures.reverse();
  assert.equal(parity(index, products, cloned).get(products[2]).incoming, 99);
  assert.equal(index.calls, 9, 'Measure order is part of the semantic key');
  cloned[0].isArchived = true;
  parity(index, products, cloned);
  assert.equal(index.calls, 9);
  cloned[0].isArchived = false;
  cloned[0].date = '2026-10-04';
  parity(index, products, cloned, [], '2026-10-03');
  assert.equal(index.calls, 9);
  parity(index, products, cloned, [], '2026-10-04');
  assert.equal(index.calls, 9, 'Present excluded records retain measurements without remeasurement');
  parity(index, products, [], [], '2026-10-04');
  parity(index, products, cloned, [], '2026-10-04');
  assert.equal(index.calls, 12, 'Removed records are evicted even if previously excluded');
});

test('captured stock values remain independent of subsequently mutated source graphs', () => {
  const index = calculator();
  const original = [{ productId: 'p', quantity: 2, totalKg: 5, quantityUnit: 'Con' }];
  const con = { id: 'p', unit: 'Con' };
  parity(index, [con], original);
  const cloned = structuredClone(original);
  original[0].totalKg = 999;
  original[0].quantity = 777;
  const kg = { id: 'p', unit: 'Kg' };
  assert.equal(parity(index, [kg], cloned).get(kg).incoming, 5, 'A new unit must read the captured values, not old mutable sources');
  assert.equal(parity(index, [con, kg], original).get(con).incoming, 777);
});

test('coercible objects bypass caching and exported unit choices invalidate measurement context', () => {
  const index = calculator();
  let amount = 2;
  const quantity = { valueOf: () => amount };
  const products = [{ id: 'p', unit: 'Con' }];
  const imports = [{ productId: 'p', quantity }];
  assert.equal(parity(index, products, imports).get(products[0]).incoming, 2);
  amount = 7;
  assert.equal(parity(index, products, imports).get(products[0]).incoming, 7);
  assert.equal(index.calls, 2);
  const choices = PRODUCT_PRICING_UNIT_OPTIONS.slice();
  try {
    const unitProduct = { id: 'p', unit: 'kilograms' };
    const movements = [{ productId: 'p', totalKg: 5, quantity: 2, quantityUnit: 'kilograms' }];
    assert.equal(parity(index, [unitProduct], movements).get(unitProduct).incoming, 5);
    PRODUCT_PRICING_UNIT_OPTIONS.unshift('kilograms');
    assert.equal(parity(index, [unitProduct], movements).get(unitProduct).incoming, 2);
    PRODUCT_PRICING_UNIT_OPTIONS.splice(0, 1);
    assert.equal(parity(index, [unitProduct], movements).get(unitProduct).incoming, 5);
  } finally {
    PRODUCT_PRICING_UNIT_OPTIONS.splice(0, PRODUCT_PRICING_UNIT_OPTIONS.length, ...choices);
  }
});

test('actual record retainer preserves strict unique IDs across full-clone inserts/removes/reorders', () => {
  const previous = [{ id: 7, nested: { value: 1 } }, { id: '7', nested: { value: 2 } },
    { id: 0, nested: { value: 3 } }, { id: '__proto__', nested: { value: 4 } }];
  assert.strictEqual(retainCollectionRecordIdentity(previous, structuredClone(previous)), previous);
  const incoming = structuredClone([previous[3], previous[1], { id: 'added', nested: { value: 5 } }, previous[0]]);
  const result = retainCollectionRecordIdentity(previous, incoming);
  assert.deepStrictEqual(result, incoming);
  assert.strictEqual(result[0], previous[3]);
  assert.strictEqual(result[1], previous[1]);
  assert.strictEqual(result[2], incoming[2]);
  assert.strictEqual(result[3], previous[0]);
  assert.notStrictEqual(result[1], previous[0], 'String and numeric IDs must not collide');
  const appended = structuredClone([...previous, { id: 'added' }]);
  assert.strictEqual(retainCollectionIdentity(previous, appended), appended);
  const retainedAppend = retainCollectionRecordIdentity(previous, appended);
  previous.forEach((row, i) => assert.strictEqual(retainedAppend[i], row));
});

test('actual record retainer conservatively falls back for ambiguous IDs and unknown root shapes', () => {
  for (const previous of [
    [{ id: 'same', value: 1 }, { id: 'same', value: 2 }],
    [{ id: 0 }, { id: -0 }], [{ id: NaN }], [{ id: '' }], [{ id: '   ' }], [{ id: false }], [{ id: null }], [{}],
    [{ id: {} }], [{ id: Symbol('id') }], [, { id: 'a' }],
  ]) {
    const next = [...previous, { id: 'new' }];
    assert.strictEqual(retainCollectionIdentity(previous, next), next);
    assert.strictEqual(retainCollectionRecordIdentity(previous, next), next, 'Ambiguous IDs must use the original conservative path');
  }
  const previous = [{ id: 'a' }, { id: 'b' }];
  const duplicateNext = [{ id: 'a' }, { id: 'a' }];
  assert.deepStrictEqual(retainCollectionRecordIdentity(previous, duplicateNext), retainCollectionIdentity(previous, duplicateNext));
  for (const [before, next] of [[null, []], [{ a: { value: 1 } }, { a: { value: 1 } }], [[], {}]]) {
    assert.deepStrictEqual(retainCollectionRecordIdentity(before, next), retainCollectionIdentity(before, next));
  }
});

test('actual retainer plus stock factory handles App-shaped full-clone snapshot updates', () => {
  const index = calculator();
  const products = [{ id: 'p', unit: 'Kg' }];
  let published = [{ id: 'a', companyId: 'tenant-a', items: [{ productId: 'p', totalKg: 1 }] },
    { id: 'b', companyId: 'tenant-a', items: [{ productId: 'p', totalKg: 2 }] }];
  parity(index, products, published);
  assert.equal(index.calls, 2);
  let next = structuredClone([...published, { id: 'c', companyId: 'tenant-a', items: [{ productId: 'p', totalKg: 3 }] }]);
  const oldPublished = published;
  published = retainCollectionRecordIdentity(published, next);
  assert.strictEqual(published[0], oldPublished[0]);
  assert.strictEqual(published[1], oldPublished[1]);
  parity(index, products, published);
  assert.equal(index.calls, 3, 'Adding one movement measures one record despite cloning the whole snapshot');
  next = structuredClone(published);
  next[1].items[0].totalKg = 4;
  published = retainCollectionRecordIdentity(published, next);
  parity(index, products, published);
  assert.equal(index.calls, 4, 'Editing one movement measures one record');
  published = retainCollectionRecordIdentity(published, structuredClone([published[2], published[1]]));
  parity(index, products, published);
  assert.equal(index.calls, 4, 'Removal and reorder reuse unchanged row measurements');
});

test('actual App warehouse local writes and dispatch edit/archive/rollback preserve frozen published graphs', async () => {
  const index = calculator({ immutableRecords: true });
  const products = [{ id: 'p', unit: 'Con' }, { id: 'p', unit: 'Kg' }];
  let imports = freezeGraph([{ id: 'a', productId: 'p', quantity: 1, totalKg: 2 }]);
  let dispatches = freezeGraph([{ id: 'd', companyId: 'tenant-a', items: [{ productId: 'p', quantity: 0.1, totalKg: 0.2 }] }]);
  const setImports = updater => { imports = freezeGraph(updater(imports)); };
  const setDispatches = updater => { dispatches = freezeGraph(updater(dispatches)); };
  const localBindings = {
    getLocalCollectionBinding: name => name === 'warehouseImports' ? [setImports] : [setDispatches],
    updateStableCollectionLocalValue() {}, rememberRecentLocalDelete() {},
    runNonBlockingStateUpdate: callback => callback(), setLoadedCollections: updater => updater({}),
  };
  const write = appFunction('applyLocalCollectionWrite', localBindings);
  const remove = appFunction('applyLocalCollectionDelete', localBindings);
  const upsert = appFunction('upsertLocalListRecord');
  parity(index, products, imports, dispatches);
  const original = imports;
  write('warehouseImports', 'b', freezeGraph({ productId: 'p', quantity: 4, totalKg: 5 }));
  assert.strictEqual(imports[1], original[0]);
  parity(index, products, imports, dispatches);
  write('warehouseImports', 'a', freezeGraph({ quantity: 8 }), { merge: true });
  assert.notStrictEqual(imports[1], original[0]);
  assert.equal(original[0].quantity, 1);
  parity(index, products, imports, dispatches);
  upsert(setImports, freezeGraph({ id: 'a', totalKg: 6 }));
  parity(index, products, imports, dispatches);
  remove('warehouseImports', 'b');
  parity(index, products, imports, dispatches);
  let failure;
  const dispatchBindings = () => {
    const bindings = { isVpsStagingMode: false, firebaseUser: {}, myCompanyId: 'tenant-a',
      rawWarehouseDispatches: dispatches, customers: [], products, setRawWarehouseDispatches: setDispatches,
      normalizeProductPricingUnit, isSameBillingUnit, getTodayString: () => '2026-10-03', currentUser: { id: 'employee' },
      rememberRecentLocalWrite() {}, saveDataDocument: async () => { if (failure) throw failure; } };
    for (const name of ['capitalizeFirst', 'normalizeLeadingLabel', 'parseLooseQuantityValue', 'parseLooseMoneyValue']) {
      bindings[name] = appFunction(name, bindings);
    }
    return bindings;
  };
  const previousDispatch = dispatches;
  const patch = freezeGraph({ items: [{ productId: 'p', quantity: 7, totalKg: 9 }] });
  await appFunction('handleEditWarehouseDispatch', dispatchBindings())('d', patch, 'employee');
  assert.notStrictEqual(dispatches[0], previousDispatch[0]);
  assert.strictEqual(dispatches[0].items, patch.items);
  assert.equal(previousDispatch[0].items[0].quantity, 0.1);
  parity(index, products, imports, dispatches);
  const beforeFailure = dispatches[0];
  failure = new Error('Rejected write');
  await assert.rejects(appFunction('handleEditWarehouseDispatch', dispatchBindings())('d',
    freezeGraph({ items: [{ productId: 'p', quantity: 99 }] })), /Rejected write/);
  assert.strictEqual(dispatches[0], beforeFailure, 'Rollback restores the prior published graph');
  parity(index, products, imports, dispatches);
  failure = null;
  await appFunction('handleDeleteWarehouseDispatch', dispatchBindings())('d');
  assert.notStrictEqual(dispatches[0], beforeFailure);
  assert.equal(dispatches[0].isArchived, true);
  assert.equal(beforeFailure.isArchived, undefined);
  parity(index, products, imports, dispatches);
});

test('actual App setter, inventory calculation and explicit immutable view memo retain pure-path parity', () => {
  const bindings = { buildProductStockBalanceIndex, resolveTransactionBillingSnapshot };
  for (const name of ['capitalizeFirst', 'normalizeLookupText', 'parseLooseQuantityValue', 'parseLooseMoneyValue',
    'normalizeLeadingLabel', 'getProductInventoryUnit', 'getProductOpeningStock', 'getProductMainGroupLabel',
    'normalizeInventoryUnitKey', 'isSameInventoryUnit', 'getOrderItemQuantityUnit', 'getOrderItemQuantityValue',
    'getOrderLineUnitPriceValue', 'getOrderLineQuantityValue', 'getOrderLineWeightKgValue',
    'getTransactionBillingPresentation', 'getOrderItemRevenue', 'getOrderItemCost']) {
    bindings[name] = appFunction(name, bindings);
  }
  const metrics = appFunction('buildInventoryMetrics', bindings);
  const products = [{ id: 'p', name: 'Vit', unit: 'Con', costPrice: 3, openingStock: -2 },
    { id: 'p', name: 'Bao', unit: 'Kg', costPrice: 9, openingStock: 1 },
    { id: 'q', name: 'Ga', unit: 'Con', isArchived: true }];
  const orders = [{ date: '2026-10-03', items: [{ productId: 'p', quantity: 0.1, unit: 'Con', unitPrice: 13 }] },
    { isArchived: true, items: [{ productId: 'p', quantity: 999, unitPrice: 999 }] }];
  let state = [{ id: 'a', companyId: 'tenant-a', date: '2026-10-02', productId: 'p', quantity: 0.1, totalKg: 2 },
    { id: 'b', companyId: 'tenant-a', date: '2026-10-03', productId: 'p', quantity: 0.2, totalKg: 3 }];
  const apply = appFunction('setCollectionSafely', {
    retainCollectionRecordIdentity, runNonBlockingStateUpdate: callback => callback(),
    hasCollectionValue: value => value?.length > 0, getPreviousStableCollectionValue: () => state,
    rememberStableCollectionValue() {}, markCollectionLoaded() {},
  });
  const dispatches = [{ id: 'd', companyId: 'tenant-a', productId: 'p', quantity: 1, totalKg: 0.1 }];
  let previousDependencies;
  let memoized;
  let factories = 0;
  const useMemo = (callback, dependencies) => {
    if (!previousDependencies || !dependencies.every((value, i) => Object.is(value, previousDependencies[i]))) {
      memoized = callback();
      previousDependencies = dependencies;
    }
    return memoized;
  };
  const getViewIndex = companyId => appFunction('stockIndex', {
    useMemo, currentCompany: { id: companyId }, createIncrementalProductStockIndex: options => {
      assert.deepStrictEqual(options, { immutableRecords: true }, 'Actual AST memo explicitly opts in for each tenant lifetime');
      factories += 1;
      return calculator(options);
    },
  });
  const index = getViewIndex('tenant-a');
  assert.strictEqual(getViewIndex('tenant-a'), index);
  assert.deepStrictEqual(previousDependencies, ['tenant-a']);
  const check = cutoff => {
    const options = { untilDate: cutoff, warehouseImports: state, warehouseDispatches: dispatches };
    const pure = metrics(products, orders, options);
    const incremental = metrics(products, orders, { ...options, stockBalanceResolver: index.build });
    assert.deepStrictEqual(incremental, pure, 'All App rows, groups, totals, fields, and floating-point values');
    const actualView = appFunction('inventoryMetrics', { useMemo: callback => callback(),
      buildInventoryMetrics: metrics, products, orders, warehouseImports: state,
      warehouseDispatches: dispatches, stockIndex: index, getTodayString: () => cutoff });
    assert.deepStrictEqual(actualView, pure, 'The view passes the actual resolver to the calculation');
  };
  check('2026-10-03');
  assert.equal(index.calls, 6);
  const previous = state;
  apply('warehouseImports', updater => { state = updater(state); }, structuredClone([...state,
    { id: 'c', companyId: 'tenant-a', productId: 'p', quantity: 4, totalKg: 5 }]));
  assert.strictEqual(state[0], previous[0]);
  check('2026-10-03');
  assert.equal(index.calls, 8);
  const edited = structuredClone(state);
  edited[1].quantity = 7;
  apply('warehouseImports', updater => { state = updater(state); }, edited);
  check('2026-10-03');
  assert.equal(index.calls, 10);
  apply('warehouseImports', updater => { state = updater(state); }, structuredClone([state[2], state[1]]));
  check('2026-10-02');
  check('2026-10-03');
  assert.equal(index.calls, 10);
  const otherTenant = getViewIndex('tenant-b');
  assert.notStrictEqual(otherTenant, index);
  assert.equal(factories, 2, 'Actual view factory lifetime is keyed by company ID');
  const otherProducts = [{ id: 'p', unit: 'Con' }];
  const otherImports = [{ id: 'a', companyId: 'tenant-b', productId: 'p', quantity: 50 }];
  assert.deepStrictEqual(metrics(otherProducts, [], { warehouseImports: otherImports, warehouseDispatches: [],
    stockBalanceResolver: otherTenant.build }), metrics(otherProducts, [], { warehouseImports: otherImports, warehouseDispatches: [] }));
  assert.equal(otherTenant.calls, 1, 'Caller supplies already-scoped tenant data; the new lifetime starts cold');
});

test('600 products / 4300 movements: exact cold/warm parity, actual retainer, and one-pass CPU evidence', context => {
  const products = Array.from({ length: 600 }, (_, i) => ({ id: `product-${i}`,
    stockUnit: ['Kg', 'Con', 'Thung'][i % 3], openingStock: 20 + i / 10 }));
  const makeRecord = i => ({ id: `movement-${i}`, companyId: 'tenant-a', date: '2026-10-02',
    items: Array.from({ length: 2 }, (_, j) => ({ productId: `product-${(i * 13 + j * 17) % 600}`,
      totalKg: i / 7 + j + 0.1, quantity: i % 19 + j + 1, quantityUnit: 'Con',
      extraMeasures: [{ unit: 'Thung', quantity: i % 7 + j + 0.2 }] })), note: `Metadata ${i}` });
  let imports = Array.from({ length: 3500 }, (_, i) => makeRecord(i));
  let dispatches = Array.from({ length: 800 }, (_, i) => makeRecord(i + 3500));
  let calls = 0;
  const index = createIncrementalProductStockIndex({ measureQuantity: (item, unit) => {
    calls += 1;
    return measureQuantity(item, unit);
  } });
  let immutableCalls = 0;
  const immutableIndex = createIncrementalProductStockIndex({ immutableRecords: true, measureQuantity: (item, unit) => {
    immutableCalls += 1;
    return measureQuantity(item, unit);
  } });
  const timed = run => {
    const cpu = process.cpuUsage();
    const start = performance.now();
    const result = run();
    const elapsed = performance.now() - start;
    const used = process.cpuUsage(cpu);
    return { result, wallMs: elapsed, cpuMs: (used.user + used.system) / 1000 };
  };
  const pure = timed(() => buildProductStockBalanceIndex(products, imports, dispatches, '2026-10-03'));
  const cold = timed(() => index.build(products, imports, dispatches, '2026-10-03'));
  const immutableCold = timed(() => immutableIndex.build(products, imports, dispatches, '2026-10-03'));
  assert.deepStrictEqual(cold.result, pure.result);
  assert.deepStrictEqual(immutableCold.result, pure.result);
  products.forEach(product => assert.deepStrictEqual(cold.result.get(product), productStockBalance(product, imports, dispatches, '2026-10-03')));
  assert.equal(calls, 8600);
  assert.equal(immutableCalls, 8600);
  imports = retainCollectionRecordIdentity(imports, structuredClone(imports));
  dispatches = retainCollectionRecordIdentity(dispatches, structuredClone(dispatches));
  const warm = timed(() => index.build(products, imports, dispatches, '2026-10-03'));
  const immutableWarm = timed(() => immutableIndex.build(products, imports, dispatches, '2026-10-03'));
  assert.deepStrictEqual(warm.result, cold.result);
  assert.deepStrictEqual(immutableWarm.result, cold.result);
  assert.equal(calls, 8600, 'Warm full-clone snapshots perform zero new measurements');
  assert.equal(immutableCalls, 8600);
  const warmBatch = build => Array.from({ length: 16 }, () => build(products, imports, dispatches, '2026-10-03'));
  const pureWarmBatch = timed(() => warmBatch(buildProductStockBalanceIndex));
  const immutableWarmBatch = timed(() => warmBatch(immutableIndex.build));
  assert.deepStrictEqual(immutableWarmBatch.result, pureWarmBatch.result);
  assert.equal(immutableCalls, 8600, 'Sixteen retained-graph warm builds measure nothing');
  const added = retainCollectionRecordIdentity(imports, structuredClone([...imports, makeRecord(4300)]));
  const append = timed(() => index.build(products, added, dispatches, '2026-10-03'));
  const immutableAppend = timed(() => immutableIndex.build(products, added, dispatches, '2026-10-03'));
  assert.deepStrictEqual(append.result, buildProductStockBalanceIndex(products, added, dispatches, '2026-10-03'));
  assert.deepStrictEqual(immutableAppend.result, append.result);
  products.forEach(product => assert.deepStrictEqual(append.result.get(product), productStockBalance(product, added, dispatches, '2026-10-03')));
  assert.equal(calls, 8602, 'A full-clone append measures only the two new movement items');
  assert.equal(immutableCalls, 8602);
  let next = added;
  const appendInputs = Array.from({ length: 16 }, (_, i) => {
    next = retainCollectionRecordIdentity(next, structuredClone([...next, makeRecord(4301 + i)]));
    return next;
  });
  const appendBatch = build => appendInputs.map(records => build(products, records, dispatches, '2026-10-03'));
  const pureAppendBatch = timed(() => appendBatch(buildProductStockBalanceIndex));
  const immutableAppendBatch = timed(() => appendBatch(immutableIndex.build));
  assert.deepStrictEqual(immutableAppendBatch.result, pureAppendBatch.result);
  assert.equal(immutableCalls, 8634, 'Sixteen full-clone appends measure exactly thirty-two new items');
  const timing = value => ({ cpuMs: value.cpuMs, wallMs: value.wallMs });
  context.diagnostic(`One-pass evidence (not a timing gate): ${JSON.stringify({
    pureCold: { cpuMs: pure.cpuMs, wallMs: pure.wallMs },
    incrementalCold: { cpuMs: cold.cpuMs, wallMs: cold.wallMs },
    incrementalWarm: { cpuMs: warm.cpuMs, wallMs: warm.wallMs },
    incrementalAppend: { cpuMs: append.cpuMs, wallMs: append.wallMs }, coldMeasurements: 8600, warmMeasurements: 0, appendMeasurements: 2,
    immutableCold: timing(immutableCold), immutableWarm: timing(immutableWarm), immutableAppend: timing(immutableAppend),
    matched16BuildBatches: { pureWarm: timing(pureWarmBatch), immutableWarm: timing(immutableWarmBatch),
      pureAppend: timing(pureAppendBatch), immutableAppend: timing(immutableAppendBatch) },
  })}`);
});

test('seeded immutable mutation sequences match independent legacy balances exactly', () => {
  const units = ['Kg', 'kilograms', 'Con', 'C\u00e1i', 'CAI', 'Th\u00f9ng', 'Thung', 'Bao', '', undefined, 'custom'];
  const values = [undefined, null, 0, -0, -3, '2.5', 'invalid', false, true, NaN, Infinity, -Infinity, 0.1, 0.2, 1e16, -1e16];
  const dates = [undefined, null, '', 0, '2026-10-01', '2026-10-02', '2026-10-03', 'invalid'];
  const ids = ['p', 'q', 7, '7', undefined, null, 0, -0, NaN, false, '__proto__'];
  for (let seed = 0; seed < 40; seed += 1) {
    let state = (0x5eed0000 + seed) >>> 0;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
    const pick = items => items[Math.floor(random() * items.length)];
    const measure = () => ({ unit: pick(units), quantity: pick(values) });
    const item = () => ({ productId: pick(ids), totalKg: pick(values), weightKg: pick(values), kg: pick(values),
      actualWeightKg: pick(values), weight: pick(values), quantity: pick(values), totalQuantity: pick(values), qty: pick(values),
      pieceCount: pick(values), quantityCount: pick(values), quantityUnit: pick(units), unit: pick(units),
      measures: Array.from({ length: Math.floor(random() * 4) }, measure),
      extraMeasures: Array.from({ length: Math.floor(random() * 3) }, measure), isArchived: pick([true, false]), date: pick(dates) });
    const record = () => freezeGraph({ ...item(), date: pick(dates), isArchived: pick([true, false, false, undefined, 'false']),
      ...pick([{}, { items: null }, { items: false }, { items: [] },
        { items: Array.from({ length: 1 + Math.floor(random() * 4) }, item) }]) });
    let products = freezeGraph(Array.from({ length: 16 }, () => ({ id: pick(ids), unit: pick(units), stockUnit: pick(units),
      inventoryUnit: pick(units), stockQuantity: pick(values), openingStock: pick(values), inventoryQuantity: pick(values),
      stock: pick(values), isArchived: pick([true, false]) })));
    let imports = freezeGraph(Array.from({ length: 18 }, record));
    let dispatches = freezeGraph(Array.from({ length: 12 }, record));
    let cutoff = '';
    const indexes = [calculator(), calculator({ immutableRecords: true })];
    for (let step = 0; step < 60; step += 1) {
      const operation = step % 12;
      const side = step % 2 ? 'imports' : 'dispatches';
      let records = side === 'imports' ? imports : dispatches;
      if (operation === 0) records = [...records, record()];
      if (operation === 1 && records.length) {
        const position = Math.floor(random() * records.length);
        const previous = records[position];
        const replacement = Array.isArray(previous.items) && previous.items.length
          ? { ...previous, items: previous.items.map((entry, i) => i === 0 ? { ...entry, totalKg: pick(values), quantity: pick(values) } : entry) }
          : { ...previous, totalKg: pick(values), quantity: pick(values) };
        records = records.map((entry, i) => i === position ? freezeGraph(replacement) : entry);
      }
      if (operation === 2) records = records.slice(1);
      if (operation === 3) records = records.slice().reverse();
      if (operation === 4) cutoff = pick(['', '2026-10-01', '2026-10-02', '2026-10-03', 20261003, NaN, -1]);
      if (operation === 5 && records.length) records = records.map((entry, i) => i === 0 ? freezeGraph({ ...entry, isArchived: !entry.isArchived }) : entry);
      if (operation === 6) products = freezeGraph(products.map((entry, i) => i === 0 ? { ...entry, stockUnit: pick(units), inventoryUnit: '', unit: pick(units) } : entry));
      if (operation === 7) products = freezeGraph(products.map((entry, i) => i === 0 ? { ...entry, id: pick(ids) } : entry));
      if (operation === 8) products = freezeGraph(products.map((entry, i) => i === 0 ? { ...entry, stockQuantity: pick(values), openingStock: pick(values) } : entry));
      if (operation === 9 && records.length) records = [...records, records[0]];
      if (operation === 10) products = freezeGraph([...products.slice(1), { ...products[0], unit: pick(units) }]);
      if (operation === 11 && records.length) records = records.map((entry, i) => i === 0 ? freezeGraph({ ...entry, date: pick(dates) }) : entry);
      records = freezeGraph(records);
      if (side === 'imports') imports = records; else dispatches = records;
      for (const index of indexes) {
        const result = parity(index, products, imports, dispatches, cutoff);
        const calls = index.calls;
        const identical = parity(index, products, imports, dispatches, cutoff);
        assert.deepStrictEqual(identical, result, `Seed ${seed}, step ${step}: identical movement inputs`);
        assert.equal(index.calls, calls, `Seed ${seed}, step ${step}: identical-input measurements stay cached`);
        const repeated = parity(index, products.slice(), imports.slice(), dispatches.slice(), cutoff);
        assert.deepStrictEqual(repeated, result, `Seed ${seed}, step ${step}: unchanged cloned arrays`);
        assert.equal(index.calls, calls, `Seed ${seed}, step ${step}: unchanged record measurements must be cached`);
      }
    }
  }
});
