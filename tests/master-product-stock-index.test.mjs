import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProductStockBalanceIndex, productStockBalance } from '../src/utils/productMeasures.js';

const assertParity = (products, imports = [], dispatches = [], dates = ['', '2026-01-01', '2026-06-01', '2026-12-31']) => {
  for (const date of dates) {
    const index = buildProductStockBalanceIndex(products, imports, dispatches, date);
    assert.ok(index instanceof Map);
    assert.equal(index.size, new Set(products).size);
    for (const product of products) {
      assert.deepStrictEqual(index.get(product), productStockBalance(product, imports, dispatches, date),
        `stock parity for ${String(product.id)}, ${product.stockUnit || product.inventoryUnit || product.unit}, cutoff ${date}`);
    }
  }
};

test('date/archive filters and record.items || [record] match the reference', () => {
  const products = [
    { id: 'p', stockUnit: 'Con', openingStock: -10, isArchived: true },
    { id: 'p', inventoryUnit: 'Kg', stockQuantity: 4 },
    { id: 'absent', unit: 'Con', stock: -3 },
  ];
  const item = (quantity, totalKg = quantity) => ({ productId: 'p', quantity, totalKg });
  const imports = [
    item(1),
    { ...item(2), date: null },
    { ...item(3), date: 0 },
    { ...item(4), date: '2026-01-01' },
    { ...item(5), date: '2026-06-01' },
    { ...item(6), date: '2026-06-02' },
    { ...item(7), isArchived: true },
    { ...item(8), isArchived: 'false' },
    { ...item(9), items: [] },
    { ...item(10), items: null },
    { ...item(11), items: false },
    { date: '2026-06-01', items: [item(12), { ...item(13), isArchived: true, date: '2099-01-01' }] },
    { date: '2026-06-01', isArchived: true, items: [item(14)] },
  ];
  const dispatches = [item(2), { date: '2026-06-01', items: [item(3), item(-1)] }];
  assertParity(products, imports, dispatches);
  assert.equal(buildProductStockBalanceIndex(products, imports, dispatches, '2026-06-01').get(products[0]).incoming, 61);
});

test('date comparisons preserve JavaScript coercion for non-string cutoffs', () => {
  const products = [{ id: 'p', unit: 'Con' }];
  const dates = [undefined, null, '', NaN, 0, 1, -1, Infinity, '0', '1', 'invalid', '2026-06-01'];
  const imports = dates.map((date, i) => ({ productId: 'p', quantity: i + 1, date }));
  assertParity(products, imports, imports.slice().reverse(),
    [undefined, null, NaN, 0, 1, -1, Infinity, true, 'invalid', '2026-06-01']);
});

test('all weight/quantity aliases, unit normalization, and first extra measure precedence match', () => {
  const units = ['Kg', 'kilograms', 'Con', 'CAI', 'C\u00e1i', 'Thung', 'Th\u00f9ng', 'custom unit', '', 'Bao', 'unknown'];
  const products = units.map(stockUnit => ({ id: 'p', stockUnit }));
  const weightKeys = ['totalKg', 'weightKg', 'kg', 'actualWeightKg', 'weight'];
  const quantityKeys = ['quantity', 'totalQuantity', 'qty', 'pieceCount', 'quantityCount'];
  const values = [undefined, null, 0, -0, -7, '3.5', '', false, true, NaN, Infinity, -Infinity, 'invalid'];
  const imports = [];
  for (const value of values) {
    for (const key of [...weightKeys, ...quantityKeys]) {
      imports.push({
        productId: 'p', [key]: value, quantityUnit: 'Con',
        measures: [{ unit: 'Kg', quantity: 11 }, { unit: 'Con', quantity: 12 }, { unit: 'CAI', quantity: 13 }],
        extraMeasures: [{ unit: 'Kg', quantity: 90 }, { unit: 'Thung', quantity: 14 }, { unit: '', quantity: 15 }],
      });
    }
  }
  for (const keys of [weightKeys, quantityKeys]) {
    for (let i = 0; i < keys.length - 1; i += 1) {
      imports.push(
        { productId: 'p', [keys[i]]: -2, [keys[i + 1]]: 99 },
        { productId: 'p', [keys[i]]: null, [keys[i + 1]]: 5 },
      );
    }
  }
  imports.push(
    { productId: 'p', totalKg: NaN, weightKg: 100, quantity: NaN, totalQuantity: 100,
      measures: [{ unit: 'Kg', quantity: 80 }, { unit: 'Con', quantity: 80 }] },
    { productId: 'p', totalKg: 0, quantity: 0, quantityUnit: 'Kg', measures: [{ unit: 'Kg', quantity: 80 }] },
    { productId: 'p', quantity: 6, quantityUnit: '', unit: 'CAI' },
    { productId: 'p', quantity: 6, quantityUnit: ' custom unit ', measures: [{ unit: 'custom unit', quantity: 80 }] },
    { productId: 'p', measures: [{ unit: 'Bao', quantity: NaN }, { unit: 'Bao', quantity: 80 }],
      extraMeasures: [{ unit: 'Bao', quantity: 90 }, { unit: 'unknown', quantity: 3 }] },
    { productId: 'p', measures: null, extraMeasures: [{ unit: 'Thung', quantity: -2 }] },
    { productId: 'p', quantity: 4, quantityUnit: 'KG', totalKg: 7 },
  );
  assertParity(products, imports, imports.slice().reverse());
});

test('opening stock precedence preserves negative, nonfinite, and nullish values', () => {
  const values = [undefined, null, 0, -0, -5, '2.25', '', false, true, NaN, Infinity, -Infinity, 'invalid'];
  const keys = ['stockQuantity', 'openingStock', 'inventoryQuantity', 'stock'];
  const products = values.flatMap(value => keys.map(key => ({
    id: 'p', unit: 'Con', stockQuantity: null, openingStock: null, inventoryQuantity: null, stock: 17, [key]: value,
  })));
  products.push({ id: 'p', unit: 'Con' }, { id: 'p', stockUnit: '', inventoryUnit: 'Kg', unit: 'Con', openingStock: -4 });
  assertParity(products, [{ productId: 'p', quantity: 3, totalKg: 2 }], [{ productId: 'p', quantity: 1 }]);
});

test('strict ID identity and duplicate products preserve independent results', () => {
  const objectId = {};
  const otherObjectId = {};
  const symbolId = Symbol('p');
  const ids = ['1', 1, undefined, null, NaN, 0, -0, false, '', objectId, otherObjectId, symbolId, 1n, '__proto__'];
  const products = ids.flatMap(id => [
    { id, stockUnit: 'Con', openingStock: -3 },
    { id, stockUnit: 'Kg', openingStock: 8 },
    { id, stockUnit: 'kilograms', openingStock: -9 },
  ]);
  products.push(products[0], { ...products[0], openingStock: 20 });
  const imports = ids.map((productId, i) => ({ productId, quantity: i + 1, totalKg: i + 2 }));
  imports.push({ productId: {}, quantity: 1000 }, { quantity: 2, totalKg: 3 });
  const index = buildProductStockBalanceIndex(products, imports);
  assertParity(products, imports);
  assert.equal(index.get(products.find(product => Number.isNaN(product.id))).incoming, 0);
  assert.notStrictEqual(index.get(products[1]), index.get(products[2]));
  assert.equal(index.get({ ...products[0] }), undefined);
  index.get(products[1]).incoming = 123;
  assert.notEqual(index.get(products[2]).incoming, 123);
});

test('floating point accumulation retains item subtotals and record order', () => {
  const products = [{ id: 'p', unit: 'Con', openingStock: 0.1 }, { id: 'q', unit: 'Con' }];
  const item = quantity => ({ productId: 'p', quantity });
  const imports = [
    item(1e16),
    { items: [item(-1e16), { productId: 'q', quantity: 1 }, item(1)] },
    { items: [item(0.1), item(0.2), item(-0.3)] },
    { items: [item(-0), item(0)] },
  ];
  assertParity(products, imports, imports.slice().reverse());
  assert.equal(buildProductStockBalanceIndex(products, imports.slice(0, 2)).get(products[0]).incoming, 0);
  assert.equal(imports.slice(0, 2).flatMap(record => record.items || [record])
    .reduce((sum, entry) => sum + (entry.productId === 'p' ? entry.quantity : 0), 0), 1);
  assertParity(products, [item(Number.MAX_VALUE), item(Number.MAX_VALUE), item(-Number.MAX_VALUE)],
    [{ items: [item(-Number.MAX_VALUE), item(-Number.MAX_VALUE)] }, item(Number.MAX_VALUE)]);
});

test('sparse arrays, defaults, and empty snapshots preserve reduction behavior', () => {
  const products = [{ id: 'p', unit: 'Con' }, , { id: 'q' }];
  const imports = [, { items: [, { productId: 'p', quantity: 4 }, ,] }, , { productId: 'p', quantity: 2 }];
  const index = buildProductStockBalanceIndex(products, imports);
  products.forEach(product => assert.deepStrictEqual(index.get(product), productStockBalance(product, imports)));
  assert.equal(buildProductStockBalanceIndex().size, 0);
  assert.deepStrictEqual(buildProductStockBalanceIndex([products[0]]).get(products[0]),
    { incoming: 0, outgoing: 0, remaining: 0 });
});

test('caller rebuilds explicitly after mutations; snapshots do not alter source data', () => {
  const product = { id: 'p', unit: 'Con', openingStock: -2 };
  const products = [product];
  const imports = [{ date: '2026-01-01', items: [{ productId: 'p', quantity: 3 }] }];
  const dispatches = [{ productId: 'p', quantity: 1 }];
  const original = structuredClone({ products, imports, dispatches });
  const first = buildProductStockBalanceIndex(products, imports, dispatches, '2026-06-01');
  assert.deepStrictEqual({ products, imports, dispatches }, original);
  imports[0].items[0].quantity = 10;
  product.openingStock = -4;
  dispatches.push({ productId: 'p', quantity: 2 });
  assert.deepStrictEqual(first.get(product), { incoming: 3, outgoing: 1, remaining: 0 });
  const rebuilt = buildProductStockBalanceIndex(products, imports, dispatches, '2026-06-01');
  assert.notStrictEqual(first, rebuilt);
  assert.deepStrictEqual(rebuilt.get(product), { incoming: 10, outgoing: 3, remaining: 3 });
  imports[0].isArchived = true;
  assertParity(products, imports, dispatches);
  imports[0].isArchived = false;
  imports[0].date = '2026-12-31';
  product.unit = 'Kg';
  imports[0].items[0].totalKg = 7;
  assertParity(products, imports, dispatches);
});

test('seeded randomized fixtures have exact parity across dates and units', () => {
  let state = 0x5eed1234;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const pick = values => values[Math.floor(random() * values.length)];
  const values = [undefined, null, 0, -0, -4, '3.75', '', false, NaN, Infinity, -Infinity, 'invalid', 1e16, -1e16, 0.1, 0.2];
  const units = [undefined, '', 'Kg', 'kilo', 'Con', 'CAI', 'Thung', 'Bao', 'custom', 'custom other'];
  const objectId = {};
  const ids = ['p', 'q', 1, '1', undefined, null, NaN, 0, -0, false, objectId, '__proto__'];
  const dates = [undefined, null, '', 0, '2026-01-01', '2026-06-01', '2026-06-02', '2026-12-31', 'invalid'];
  const measures = () => Array.from({ length: Math.floor(random() * 5) }, () => ({ unit: pick(units), quantity: pick(values) }));
  const item = () => {
    const entry = { productId: pick(ids), quantityUnit: pick(units), unit: pick(units), date: pick(dates), isArchived: pick([false, true, undefined]) };
    for (const key of ['totalKg', 'weightKg', 'kg', 'actualWeightKg', 'weight', 'quantity', 'totalQuantity', 'qty', 'pieceCount', 'quantityCount']) {
      if (random() < 0.35) entry[key] = pick(values);
    }
    if (random() < 0.8) entry.measures = measures();
    if (random() < 0.8) entry.extraMeasures = measures();
    return entry;
  };
  const record = () => {
    const entry = { ...item(), isArchived: pick([undefined, false, true, 0, '', 'false']) };
    const shape = Math.floor(random() * 5);
    if (shape === 0) entry.items = [];
    if (shape === 1) entry.items = null;
    if (shape >= 2) entry.items = Array.from({ length: 1 + Math.floor(random() * 6) }, item);
    return entry;
  };
  for (let fixture = 0; fixture < 100; fixture += 1) {
    const products = Array.from({ length: 24 }, () => ({
      id: pick(ids), stockUnit: pick(units), inventoryUnit: pick(units), unit: pick(units),
      stockQuantity: pick(values), openingStock: pick(values), inventoryQuantity: pick(values), stock: pick(values),
      isArchived: pick([true, false]),
    }));
    assertParity(products, Array.from({ length: 30 }, record), Array.from({ length: 20 }, record));
  }
});

test('movement reads stay linear with many duplicate IDs and distinct requested units', () => {
  const readCounts = { id: 0, weight: 0, quantity: 0, measure: 0 };
  const unitCount = 80;
  const products = Array.from({ length: unitCount * 4 }, (_, i) => ({
    id: 'p', stockUnit: `custom-${i % unitCount}`, openingStock: i,
  }));
  const imports = Array.from({ length: 40 }, () => ({
    items: Array.from({ length: 5 }, () => ({
      get productId() { readCounts.id += 1; return 'p'; },
      get totalKg() { readCounts.weight += 1; return 5; },
      get quantity() { readCounts.quantity += 1; return 2; },
      measures: Array.from({ length: unitCount }, (_, i) => ({
        get unit() { readCounts.measure += 1; return `custom-${i}`; }, quantity: 1,
      })),
    })),
  }));
  const index = buildProductStockBalanceIndex(products, imports);
  for (const product of products) assert.deepStrictEqual(index.get(product),
    { incoming: 200, outgoing: 0, remaining: product.openingStock + 200 });
  assert.ok(readCounts.id <= 400);
  assert.equal(readCounts.weight, 200);
  assert.equal(readCounts.quantity, 200);
  assert.equal(readCounts.measure, 200 * unitCount);
});
