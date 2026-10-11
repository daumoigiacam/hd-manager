import assert from 'node:assert/strict';
import { getOrderRequestAttributeOptions } from '../src/utils/orderRequestAttributes.js';
import { resolveCustomerProductConfiguration } from '../src/services/customerProductBilling.js';

const variants = [
  { id: 'small', attributeLabel: 'Làm sạch', size: '2kg', price: 50000, unit: 'Kg' },
  { id: 'large', attributeLabel: 'Làm sạch', size: '3kg', price: 55000, unit: 'Kg' },
];
const base = { configurationId: 'base', unitPrice: 40000, billingUnit: 'Kg', sizeLabel: '2kg' };
const options = getOrderRequestAttributeOptions(['Làm sạch', 'Nguyên con'], variants, base, '2kg');
assert.equal(options.length, 2);
assert.equal(options[0].id, 'small');
assert.equal(options[0].price, 50000);
const resolved = resolveCustomerProductConfiguration({ product: { id: 'p', unit: 'Kg' }, variant: options[1] });
assert.equal(resolved.attributeLabel, 'Nguyên con');
assert.equal(resolved.unitPrice, 40000);
assert.equal(resolved.sizeLabel, '2kg');
assert.notEqual(resolved.configurationId, 'base');
assert.equal(getOrderRequestAttributeOptions([], [], base).length, 0);
assert.equal(variants.length, 2);
console.log('Order request attribute options: PASS');
