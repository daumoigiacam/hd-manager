import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import * as current from '../src/services/productPricingUnits.js';

const root = new URL('../', import.meta.url);
const path = 'src/services/productPricingUnits.js';
const baselineRevision = '5f162f5ce85fd4dc746382f13a6a4170e4a29775';
const baselineSource = execFileSync('git', ['show', `${baselineRevision}:${path}`], {
  cwd: fileURLToPath(root), encoding: 'utf8', maxBuffer: 1024 * 1024,
});
const baseline = await import(`data:text/javascript;base64,${Buffer.from(baselineSource).toString('base64')}`);
const currentSource = readFileSync(new URL(path, root), 'utf8');

// Execute the same module declarations in isolation and expose its runtime Map.
// All public results are also checked against the actual imported current module.
function inspectCurrentModule() {
  const tree = parse(currentSource, { sourceType: 'module' });
  const exports = [];
  const declarations = new Set();
  const body = tree.program.body.map(statement => {
    assert.notEqual(statement.type, 'ImportDeclaration', 'The inspected module must remain standalone');
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    assert.ok(declaration, 'Expected a module declaration rather than a re-export');
    if (declaration.type === 'VariableDeclaration') {
      for (const entry of declaration.declarations) {
        assert.equal(entry.id.type, 'Identifier');
        declarations.add(entry.id.name);
        if (statement.type === 'ExportNamedDeclaration') exports.push(entry.id.name);
      }
    }
    return currentSource.slice(declaration.start, declaration.end);
  }).join('\n');
  assert.ok(declarations.has('normalizedUnitTextCache'), 'Missing runtime normalization cache');
  const inspected = new Function(`"use strict"; ${body}\nreturn {
    exports: { ${exports.join(', ')} }, cache: normalizedUnitTextCache
  };`)();
  assert.ok(inspected.cache instanceof Map);
  assert.deepStrictEqual(Object.keys(inspected.exports).sort(), Object.keys(current).sort());
  return inspected;
}

function parity(name, args, inspected = null) {
  const expected = baseline[name](...args);
  const actual = current[name](...args);
  assert.deepStrictEqual(actual, expected, `${name}: exact result parity`);
  if (inspected) assert.deepStrictEqual(inspected.exports[name](...args), expected, `${name}: inspected module parity`);
  return actual;
}

function exerciseLabel(label, inspected = null) {
  const priceMap = { [label]: '12.345,67', kg: 8000, Con: 9000 };
  parity('normalizeProductPricingUnit', [label], inspected);
  parity('getProductPricingUnits', [{ unit: `${label}; KG / Con / ${label}` }, 'Bao'], inspected);
  parity('getProductPrimaryPricingUnit', [{ quantityUnit: label }, 'Con'], inspected);
  parity('getProductCatalogUnitSuggestions', [[
    { unit: label }, { quantityUnit: label }, { unit: 'Con' }, { unit: label, isArchived: true },
  ]], inspected);
  parity('normalizeUnitPriceMap', [priceMap], inspected);
  parity('getUnitPriceFromMap', [priceMap, label], inspected);
  parity('putUnitPriceIntoMap', [priceMap, label, '9.876,54'], inspected);
  parity('resolveProductUnitPrice', [{ product: { unit: label, sellingPrice: '4.500', unitPrices: priceMap },
    customerConfig: { pricingUnit: label, unitPrices: { [label]: '7.500' } }, unit: label }], inspected);
}

test('actual module exports and default results equal frozen 5f162f5c', () => {
  assert.deepStrictEqual(Object.keys(current).sort(), Object.keys(baseline).sort());
  assert.deepStrictEqual(current.PRODUCT_PRICING_UNIT_OPTIONS, baseline.PRODUCT_PRICING_UNIT_OPTIONS);
  assert.notStrictEqual(current.PRODUCT_PRICING_UNIT_OPTIONS, baseline.PRODUCT_PRICING_UNIT_OPTIONS);
  for (const name of Object.keys(current)) {
    if (typeof current[name] === 'function') {
      assert.notStrictEqual(current[name], baseline[name]);
      parity(name, []);
    }
  }
});

test('all public results retain Unicode, aliases, separators, and stable ordering', () => {
  const labels = ['Kg', ' KG ', 'kilo', 'kilogram', 'KILOGRAMS', 'kgs', 'Con', 'CON',
    'C\u00e1i', 'Ca\u0301i', 'CAI', 'B\u1ed9', 'Th\u00f9ng', 'THUNG', 'B\u1ecdc', 'H\u1ed9p', 'T\u00fai',
    '\u0110\u01a1n v\u1ecb', '\u0111\u01a1n-v\u1ecb', 'Cr\u00e8me Box', 'Cre\u0300me Box',
    '\u4ef6', '\ud83d\udce6', 'Box\u00a0Pack', 'Box\u200bPack', 'a/b', 'Box&Crate', 'constructor', '__proto__'];
  const inspected = inspectCurrentModule();
  for (let pass = 0; pass < 3; pass += 1) for (const label of labels) exerciseLabel(label, inspected);
  for (const raw of ['Kg v\u00e0 Con', 'Kg VA CON', 'Con;kg&Thung|Bao\nCai',
    'Cr\u00e8me Box / creme-box / CREME BOX', 'kg,Kg,kgs,Con,CON', ' ; & / + | \n ', '\u4ef6,\ud83d\udce6']) {
    parity('getProductPricingUnits', [raw, 'Bao'], inspected);
    parity('getProductPrimaryPricingUnit', [raw, 'Bao'], inspected);
  }
  assert.deepStrictEqual(parity('getProductPricingUnits', ['kg,Kg,kgs,Con,CON'], inspected), ['Kg', 'Con']);
  assert.deepStrictEqual(parity('getProductCatalogUnitSuggestions', [[
    { unit: 'Bao' }, { unit: 'Con' }, { unit: 'Kg' }, { unit: 'Con' }, { unit: 'Bao' },
    { unit: 'Thung', isArchived: 'false' }, null,
  ]], inspected), ['Bao', 'Con', 'Kg']);
});

test('runtime cache stays bounded and evicts after more than 512 distinct labels', () => {
  const inspected = inspectCurrentModule();
  exerciseLabel('cache-label-0', inspected);
  assert.ok(inspected.cache.has('cache-label-0'));
  for (let i = 1; i <= 900; i += 1) {
    const label = `cache-label-${i}`;
    parity('normalizeProductPricingUnit', [label], inspected);
    assert.ok(inspected.cache.size <= 512, `Cache exceeded 512 entries at label ${i}`);
  }
  assert.equal(inspected.cache.size, 512);
  assert.equal(inspected.cache.has('cache-label-0'), false, 'Old label must actually be evicted');
  assert.equal(inspected.cache.has('cache-label-900'), true, 'Newest label must remain cached');
  for (const label of ['cache-label-0', 'cache-label-1', 'cache-label-450', 'cache-label-900', 'KG', 'Thung']) {
    exerciseLabel(label, inspected);
    assert.ok(inspected.cache.size <= 512);
  }
  assert.equal(inspected.cache.has('cache-label-0'), true, 'Evicted label must be recomputed on reuse');
});

test('256-character boundary and very long labels preserve results without growing the cache', () => {
  const inspected = inspectCurrentModule();
  parity('normalizeProductPricingUnit', ['warm-all-known-options'], inspected);
  for (const length of [255, 256, 257, 4096, 32768]) {
    const label = '\u0110'.repeat(length);
    const sizeBefore = inspected.cache.size;
    for (let pass = 0; pass < 2; pass += 1) parity('normalizeProductPricingUnit', [label], inspected);
    assert.equal(inspected.cache.has(label), length <= 256, `Cache eligibility for ${length} characters`);
    assert.equal(inspected.cache.size, sizeBefore + (length <= 256 ? 1 : 0));
    exerciseLabel(label, inspected);
    assert.ok(inspected.cache.size <= 512);
  }
  const longKnownAlias = `kg${'\u0301'.repeat(8192)}`;
  assert.equal(parity('normalizeProductPricingUnit', [longKnownAlias], inspected), 'Kg');
  assert.equal(inspected.cache.has(longKnownAlias), false);
  const paddedKnownUnit = `${' '.repeat(4096)}Thung${' '.repeat(4096)}`;
  assert.equal(parity('normalizeProductPricingUnit', [paddedKnownUnit], inspected), 'Th\u00f9ng');
});

test('falsy, numeric, BigInt, and object coercion match public results exactly', () => {
  const inspected = inspectCurrentModule();
  const values = [undefined, null, '', '   ', false, true, 0, -0, NaN, Infinity, -Infinity, 42, -3.25, 0n, 42n,
    new String(' KG '), new Number(42), [], ['kg'], ['kg', 'Con'], {},
    { toString: () => ' Thung ' }, { [Symbol.toPrimitive]: () => 'C\u00e1i' }];
  for (const value of values) {
    parity('normalizeProductPricingUnit', [value], inspected);
    for (const fallback of ['', 'Con', false, 0, 42, null]) {
      parity('getProductPricingUnits', [value, fallback], inspected);
      parity('getProductPrimaryPricingUnit', [value, fallback], inspected);
      parity('getProductPricingUnits', [{ unit: value, quantityUnit: 'Con', defaultUnit: 'Bao' }, fallback], inspected);
    }
    parity('getUnitPriceFromMap', [{ Kg: 12000, Con: 9000, 42: 50 }, value], inspected);
    parity('putUnitPriceIntoMap', [{ Kg: 12000 }, value, 42], inspected);
    parity('resolveProductUnitPrice', [{ product: { unit: value, price: 5000 }, unit: value }], inspected);
  }
  for (const source of [undefined, null, false, true, 0, 42, 'Kg', [], {}, { Kg: NaN, Con: Infinity },
    { kg: '12.345,67', Kg: 0, Con: -1, Thung: '9.000', Bao: false }]) {
    parity('normalizeUnitPriceMap', [source], inspected);
    parity('getUnitPriceFromMap', [source, 'Kg'], inspected);
    parity('putUnitPriceIntoMap', [source, 'Con', '1.000'], inspected);
  }
  for (const source of [undefined, null, false, {}, 'Kg', [null, false, { unit: 42 }, { unit: 'Kg' }]]) {
    parity('getProductCatalogUnitSuggestions', [source], inspected);
  }
  // Conversion remains live even when the same object changes its textual value.
  let label = 'kg';
  const mutable = { toString: () => label };
  assert.equal(parity('normalizeProductPricingUnit', [mutable], inspected), 'Kg');
  label = 'Con';
  assert.equal(parity('normalizeProductPricingUnit', [mutable], inspected), 'Con');
});

test('unsupported coercion produces the same errors without poisoning later results', () => {
  const inspected = inspectCurrentModule();
  const factories = [() => Symbol('unit'), () => Object.create(null),
    () => ({ toString() { throw new RangeError('unit coercion failed'); } }),
    () => ({ [Symbol.toPrimitive]: () => ({}) })];
  for (const factory of factories) {
    for (const name of ['normalizeProductPricingUnit', 'getUnitPriceFromMap', 'putUnitPriceIntoMap', 'resolveProductUnitPrice']) {
      const args = () => name === 'getUnitPriceFromMap' || name === 'putUnitPriceIntoMap'
        ? [{ Kg: 100 }, factory(), 50]
        : name === 'resolveProductUnitPrice' ? [{ product: { unit: 'Kg' }, unit: factory() }] : [factory()];
      let expectedError;
      try { baseline[name](...args()); } catch (error) { expectedError = error; }
      assert.ok(expectedError, `Baseline must reject ${name} coercion`);
      for (const module of [current, inspected.exports]) {
        assert.throws(() => module[name](...args()), error => {
          assert.equal(error.constructor, expectedError.constructor);
          assert.equal(error.message, expectedError.message);
          return true;
        });
      }
    }
  }
  exerciseLabel('KG', inspected);
  exerciseLabel('Thung', inspected);
});

test('warm caches reflect mutable exported choices: additions, removals, replacements, and order', () => {
  const inspected = inspectCurrentModule();
  const modules = [current, baseline, inspected.exports];
  const originals = modules.map(module => module.PRODUCT_PRICING_UNIT_OPTIONS.slice());
  const change = edit => modules.forEach(module => edit(module.PRODUCT_PRICING_UNIT_OPTIONS));
  try {
    for (const label of ['creme box', 'CON', 'KG', '42', 'false']) exerciseLabel(label, inspected);
    change(options => options.push('Cr\u00e8me Box'));
    assert.equal(parity('normalizeProductPricingUnit', ['creme-box'], inspected), 'Cr\u00e8me Box');
    exerciseLabel('creme box', inspected);
    change(options => options.splice(options.indexOf('Kg'), 1));
    assert.equal(parity('normalizeProductPricingUnit', ['KG'], inspected), 'KG');
    assert.equal(parity('normalizeProductPricingUnit', ['kilogram'], inspected), 'Kg');
    change(options => { options[options.indexOf('Con')] = 'CON'; });
    assert.equal(parity('normalizeProductPricingUnit', ['con'], inspected), 'CON');
    change(options => options.unshift('C\u00f3n'));
    assert.equal(parity('normalizeProductPricingUnit', ['con'], inspected), 'C\u00f3n');
    change(options => options.reverse());
    assert.equal(parity('normalizeProductPricingUnit', ['con'], inspected), 'CON');
    change(options => options.push(42, false, null, '\u4ef6'));
    assert.equal(parity('normalizeProductPricingUnit', ['42'], inspected), 42);
    assert.equal(parity('normalizeProductPricingUnit', ['\u4ef6'], inspected), '\u4ef6');
    for (const label of ['con', 'KG', '42', '\u4ef6', 'Creme Box', 'BOX']) exerciseLabel(label, inspected);
    change(options => options.splice(0, options.length));
    assert.equal(parity('normalizeProductPricingUnit', ['CON'], inspected), 'CON');
    assert.equal(parity('normalizeProductPricingUnit', ['THUNG'], inspected), 'THUNG');
    assert.equal(parity('normalizeProductPricingUnit', ['TUI'], inspected), 'T\u00fai');
    for (const label of ['KG', 'con', 'creme box', 'Thung']) exerciseLabel(label, inspected);
  } finally {
    modules.forEach((module, i) => module.PRODUCT_PRICING_UNIT_OPTIONS.splice(0,
      module.PRODUCT_PRICING_UNIT_OPTIONS.length, ...originals[i]));
  }
  assert.deepStrictEqual(current.PRODUCT_PRICING_UNIT_OPTIONS, originals[0]);
  for (const label of ['KG', 'con', 'creme box', 'Thung']) exerciseLabel(label, inspected);
});

test('seeded pricing, catalog, and normalization results stay exact across cache churn', () => {
  const inspected = inspectCurrentModule();
  let state = 0x5f162f5c;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const pick = values => values[Math.floor(random() * values.length)];
  const labels = ['Kg', 'KG', 'kgs', 'Con', 'C\u00e1i', 'CAI', 'Th\u00f9ng', 'Thung', 'Bao', 'Can',
    'Cr\u00e8me Box', 'creme-box', '\u4ef6', '', null, 0, 42, false];
  const prices = [undefined, null, false, 0, -1, NaN, Infinity, 0.1, 12345.67, '12.345,67', '500', 'invalid'];
  for (let i = 0; i < 700; i += 1) {
    parity('normalizeProductPricingUnit', [`churn-${i}`], inspected);
    const unit = pick(labels);
    const priceMap = Object.fromEntries(Array.from({ length: 5 }, () => [pick(labels), pick(prices)]));
    const product = { unit: `${pick(labels)} / ${pick(labels)}; ${pick(labels)}`,
      quantityUnit: pick(labels), defaultUnit: pick(labels), sellingPrice: pick(prices), price: pick(prices), unitPrices: priceMap };
    const customerConfig = { pricingUnit: pick(labels), defaultUnit: pick(labels), price: pick(prices),
      unitPrice: pick(prices), sellingPrice: pick(prices), unitPrices: { [pick(labels)]: pick(prices) } };
    const fixture = { product, customerConfig, priceMap };
    const snapshot = structuredClone(fixture);
    parity('normalizeProductPricingUnit', [unit], inspected);
    parity('getProductPricingUnits', [product, pick(labels)], inspected);
    parity('getProductPrimaryPricingUnit', [product, pick(labels)], inspected);
    parity('normalizeUnitPriceMap', [priceMap], inspected);
    parity('getUnitPriceFromMap', [priceMap, unit], inspected);
    parity('putUnitPriceIntoMap', [priceMap, unit, pick(prices)], inspected);
    parity('resolveProductUnitPrice', [{ product, customerConfig, unit }], inspected);
    parity('getProductCatalogUnitSuggestions', [[product, { ...product, unit: pick(labels) },
      { unit: pick(labels), isArchived: pick([true, false, undefined, 'false']) }]], inspected);
    assert.deepStrictEqual(fixture, snapshot, `Seeded fixture ${i} must not mutate`);
    assert.ok(inspected.cache.size <= 512, `Seeded fixture ${i} exceeded the cache bound`);
  }
});
