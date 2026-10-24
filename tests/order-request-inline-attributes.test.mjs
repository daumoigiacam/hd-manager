import test from 'node:test';
import assert from 'node:assert/strict';
import { expandOrderRequestAttributes } from '../src/utils/orderRequestAttributes.js';
import { resolveCustomerProductConfiguration, resolveCustomerProductActualUnit } from '../src/services/customerProductBilling.js';

test('all attributes inherit customer units and price without mutating configuration', () => {
  const product = { id: 'p', name: 'Product', unit: 'Kg', price: 58000 };
  const base = { billingUnit: 'Con', defaultOrderUnit: 'Con', unitPrice: 104000 };
  const configured = [{ id: 'large', attributeLabel: 'To', unit: 'Con', orderUnit: 'Con', price: 110000 }];
  const options = expandOrderRequestAttributes(['To', 'Trung', 'Nho'], configured, base);
  assert.deepEqual(options.map(option => option.attributeLabel), ['To', 'Trung', 'Nho']);
  assert.equal(configured.length, 1);
  const lines = options.map((variant, index) => {
    const config = resolveCustomerProductConfiguration({ product, variant, attributeLabel: variant.attributeLabel });
    assert.equal(config.billingUnit, 'Con');
    assert.equal(resolveCustomerProductActualUnit(config, product), 'Con');
    return { attribute: config.attributeLabel, quantity: index + 2, price: config.unitPrice };
  });
  assert.deepEqual(lines.map(line => line.price), [110000, 104000, 104000]);
  assert.deepEqual(lines.map(line => line.quantity), [2, 3, 4]);
  assert.equal(new Set(lines.map(line => line.attribute)).size, 3);
});

test('keeps distinct configured sizes and avoids duplicate catalog labels', () => {
  const variants = [{ attributeLabel: 'To', size: '2' }, { attributeLabel: 'To', size: '3' }];
  const options = expandOrderRequestAttributes(['To', 'to', 'Trung', 'Trung'], variants, {});
  assert.equal(options.length, 3);
  assert.deepEqual(options.slice(0, 2), variants);
  assert.deepEqual(expandOrderRequestAttributes([], [{ price: 10 }], {}), [{ price: 10 }]);
});
