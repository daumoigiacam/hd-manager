import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { parse } from '@babel/parser';
import * as current from '../src/services/customerProductBilling.js';

const root = new URL('../', import.meta.url);
const modulePath = 'src/services/customerProductBilling.js';
const source = readFileSync(new URL(modulePath, root), 'utf8');
const frozen = execFileSync('git', ['show', `5f162f5ce85fd4dc746382f13a6a4170e4a29775:${modulePath}`], {
  cwd: fileURLToPath(root), encoding: 'utf8', maxBuffer: 1024 * 1024,
});

function normalizationHarness(text, cached = false) {
  const declarations = parse(text, { sourceType: 'module' }).program.body
    .filter(statement => statement.type === 'VariableDeclaration')
    .filter(statement => statement.declarations.some(entry => ['normalizeText', 'normalizedBillingTextCache'].includes(entry.id.name)))
    .map(statement => text.slice(statement.start, statement.end)).join('\n');
  return new Function(`"use strict"; ${declarations}\nreturn { normalize: normalizeText, cache: ${cached ? 'normalizedBillingTextCache' : 'null'} };`)();
}

// Hold dependencies identical so this comparison isolates the edited billing module.
let importable = frozen;
for (const statement of parse(frozen, { sourceType: 'module' }).program.body.filter(entry => entry.type === 'ImportDeclaration').reverse()) {
  importable = importable.slice(0, statement.source.start)
    + JSON.stringify(new URL(statement.source.value, new URL(modulePath, root)).href)
    + importable.slice(statement.source.end);
}
const baseline = await import(`data:text/javascript;base64,${Buffer.from(importable).toString('base64')}`);
const labels = ['Kg', ' KG ', 'Con', 'B\u1ed9', 'C\u00e1i', 'Ca\u0301i', '\u0110\u01a1n v\u1ecb',
  '\u0111\u01a1n-v\u1ecb', 'Cr\u00e8me', 'Cre\u0300me', '\u4ef6', '\ud83d\udce6', 'a/b', 'a\u00a0b',
  'a\u200bb', '__proto__', 'constructor', '', '   '];

test('billing formulas and non-normalization declarations match exactly apart from Git line endings', () => {
  const rest = text => parse(text, { sourceType: 'module' }).program.body
    .filter(statement => !(statement.type === 'VariableDeclaration'
      && statement.declarations.some(entry => ['normalizeText', 'normalizedBillingTextCache'].includes(entry.id.name))))
    .map(statement => text.slice(statement.start, statement.end).replace(/\r\n/g, '\n')).join('\n');
  assert.equal(rest(source), rest(frozen));
});

test('billing normalization matches frozen Unicode/coercion output before and after cache warming', () => {
  const before = normalizationHarness(frozen);
  const after = normalizationHarness(source, true);
  const values = [...labels, undefined, null, false, true, 0, -0, NaN, Infinity, -Infinity,
    42, -3.25, 0n, 42n, new String(' KG '), [], ['kg'], {}, { toString: () => 'B\u1ed9' }];
  for (let pass = 0; pass < 3; pass++) for (const value of values) {
    assert.equal(after.normalize(value), before.normalize(value));
  }
  assert.equal(after.cache.get(''), '');
  let label = 'Kg';
  let conversions = 0;
  const mutable = { toString() { conversions++; return label; } };
  assert.equal(after.normalize(mutable), 'kg');
  assert.equal(after.normalize(mutable), 'kg');
  label = 'Con';
  assert.equal(after.normalize(mutable), 'con');
  assert.equal(conversions, 3, 'Cache hits must not skip live input coercion');
  for (const make of [() => Symbol('billing'), () => Object.create(null),
    () => ({ toString() { throw new RangeError('billing coercion'); } }),
    () => ({ [Symbol.toPrimitive]: () => ({}) })]) {
    let expected;
    try { before.normalize(make()); } catch (error) { expected = error; }
    assert.ok(expected);
    assert.throws(() => after.normalize(make()), error => error.constructor === expected.constructor && error.message === expected.message);
  }
  assert.equal(after.normalize('Kg'), before.normalize('Kg'));
});

test('billing cache has real FIFO eviction and never retains oversized strings', () => {
  const before = normalizationHarness(frozen);
  const after = normalizationHarness(source, true);
  for (let i = 0; i < 900; i++) {
    assert.equal(after.normalize(`label-${i}`), before.normalize(`label-${i}`));
    assert.ok(after.cache.size <= 512);
  }
  assert.equal(after.cache.size, 512);
  assert.equal(after.cache.has('label-0'), false);
  assert.equal(after.cache.has('label-899'), true);
  assert.equal(after.normalize('label-0'), before.normalize('label-0'));
  assert.equal(after.cache.has('label-0'), true);
  for (const length of [255, 256, 257, 4096, 32768]) {
    const label = '\u0110'.repeat(length);
    for (let pass = 0; pass < 2; pass++) assert.equal(after.normalize(label), before.normalize(label));
    assert.equal(after.cache.has(label), length <= 256);
    assert.ok(after.cache.size <= 512);
  }
});

test('warm short billing labels skip normalization work, while long labels are never cached', () => {
  const declarations = parse(source, { sourceType: 'module' }).program.body
    .filter(statement => statement.type === 'VariableDeclaration'
      && statement.declarations.some(entry => ['normalizeText', 'normalizedBillingTextCache'].includes(entry.id.name)))
    .map(statement => source.slice(statement.start, statement.end)).join('\n');
  const isolated = runInNewContext(`(() => {
    let calls = 0;
    const original = String.prototype.normalize;
    String.prototype.normalize = function (...args) { calls++; return original.apply(this, args); };
    ${declarations}
    return { normalize: normalizeText, calls: () => calls };
  })()`);
  for (let i = 0; i < 2000; i++) assert.equal(isolated.normalize('B\u1ed9'), 'bo');
  assert.equal(isolated.calls(), 1);
  for (let i = 0; i < 10; i++) isolated.normalize('a'.repeat(257));
  assert.equal(isolated.calls(), 11);
});

test('public billing exports, variants, immutable amounts and grouping match frozen module', () => {
  assert.deepEqual(Object.keys(current).sort(), Object.keys(baseline).sort());
  for (const name of Object.keys(current)) assert.deepEqual(current[name](), baseline[name](), `${name} defaults`);
  for (const label of labels) {
    const product = { id: 'p', name: label, unit: 'Con', sellingPrice: 55000 };
    const customerConfig = { pricingUnit: 'Kg', price: 60000,
      variants: [{ id: '', sizeLabel: label, attributeLabel: label, pricingUnit: 'Kg', unitPrice: 62000 }] };
    const input = { product, customerConfig, sizeLabel: label, attributeLabel: label };
    for (let pass = 0; pass < 3; pass++) {
      const configuration = current.resolveCustomerProductConfiguration(input);
      assert.deepEqual(configuration, baseline.resolveCustomerProductConfiguration(input));
      for (const actualUnit of ['Con', 'Kg', 'B\u1ed9', label]) {
        assert.equal(current.isSameBillingUnit(actualUnit, label), baseline.isSameBillingUnit(actualUnit, label));
        const args = { configuration, product, actualQuantity: 7, actualUnit, actualWeightKg: 20 };
        const record = current.buildCustomerProductBillingSnapshot(args);
        assert.deepEqual(record, baseline.buildCustomerProductBillingSnapshot(args));
        assert.deepEqual(current.calculateBillableAmount(args), baseline.calculateBillableAmount(args));
        const changed = { record, product, configuration: { ...configuration, unitPrice: 99000 } };
        assert.deepEqual(current.resolveTransactionBillingSnapshot(changed), baseline.resolveTransactionBillingSnapshot(changed));
        const items = [record, { ...record, productName: label, actualQuantity: 3 }, { ...record, productId: 'other' }];
        for (const name of ['summarizeOrderBillingItems', 'mergeWarehouseDispatchOrderBillingItems', 'prepareWarehouseDispatchOrderItems']) {
          assert.deepEqual(current[name](items), baseline[name](items), `${name}: ${label}`);
        }
      }
    }
  }
});
