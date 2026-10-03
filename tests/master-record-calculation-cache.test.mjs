import assert from 'node:assert/strict';
import test from 'node:test';
import { createRecordCalculationCache } from '../src/services/recordCalculationCache.js';

test('unchanged record and pricing context reuse calculation, preserving null and zero', () => {
  let calls = 0;
  const calculate = createRecordCalculationCache((record, product) => {
    calls++;
    return product ? { amount: record.quantity * product.price } : null;
  });
  const record = { quantity: 0 };
  const product = { price: 25000 };
  assert.deepEqual(calculate(record, product), { amount: 0 });
  assert.strictEqual(calculate(record, product), calculate(record, product));
  assert.equal(calls, 1);
  assert.equal(calculate(record, null), null);
  assert.equal(calculate(record, null), null);
  assert.equal(calls, 2);
});

test('record edit, product/customer replacement and label change invalidate', () => {
  const product = { price: 25000 };
  const customer = { discount: 0.1 };
  let calls = 0;
  const pure = (record, p, c, label) => ({ amount: record.quantity * p.price * (1 - c.discount), label });
  const cached = createRecordCalculationCache((...args) => { calls++; return pure(...args); });
  const initial = { quantity: 5 };
  for (const args of [
    [initial, product, customer, 'Kg'],
    [{ ...initial, quantity: 7 }, product, customer, 'Kg'],
    [initial, { price: 40000 }, customer, 'Kg'],
    [initial, product, { discount: 0.2 }, 'Kg'],
    [initial, product, customer, 'Con'],
  ]) {
    assert.deepEqual(cached(...args), pure(...args));
    assert.deepEqual(cached(...args), pure(...args));
  }
  assert.equal(calls, 5);
});

test('external source or tenant change starts a fresh cache; exceptions are never retained', () => {
  const record = { id: 'dispatch' };
  const build = price => createRecordCalculationCache(() => price);
  assert.equal(build(50000)(record), 50000);
  assert.equal(build(60000)(record), 60000);
  let calls = 0;
  const failing = createRecordCalculationCache(() => {
    if (++calls === 1) throw new Error('invalid price');
    return 0;
  });
  assert.throws(() => failing(record), /invalid price/);
  assert.equal(failing(record), 0);
  assert.equal(calls, 2);
});
