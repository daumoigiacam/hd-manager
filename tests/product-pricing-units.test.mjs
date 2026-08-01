import assert from 'node:assert/strict';
import {
  getProductPricingUnits,
  getProductPrimaryPricingUnit,
  getUnitPriceFromMap,
  putUnitPriceIntoMap,
  resolveProductUnitPrice,
} from '../src/services/productPricingUnits.js';

const product = { unit: 'Kg, Con', sellingPrice: 50000, unitPrices: { Con: 90000 } };

assert.deepEqual(getProductPricingUnits(product), ['Kg', 'Con']);
assert.deepEqual(getProductPricingUnits({ unit: 'Kg và Con' }), ['Kg', 'Con']);
assert.deepEqual(getProductPricingUnits({ unit: 'Box' }, 'Con'), ['Box']);
assert.equal(getProductPrimaryPricingUnit(product), 'Kg');
assert.equal(getUnitPriceFromMap({ kg: 50000, Con: 100000 }, 'Kg'), 50000);
assert.deepEqual(putUnitPriceIntoMap({ Kg: 50000 }, 'Con', 100000), { Kg: 50000, Con: 100000 });
assert.equal(resolveProductUnitPrice({ product, unit: 'Kg' }), 50000);
assert.equal(resolveProductUnitPrice({ product, unit: 'Con' }), 90000);
assert.equal(resolveProductUnitPrice({ product, customerConfig: { defaultUnit: 'Con', unitPrices: { Con: 100000 } }, unit: 'Con' }), 100000);
assert.equal(resolveProductUnitPrice({ product, customerConfig: { price: 55000 }, unit: 'Kg' }), 55000);
assert.equal(resolveProductUnitPrice({ product: { unit: 'Kg, Con', sellingPrice: 50000 }, unit: 'Con' }), 0);

console.log('PASS product pricing units: multi-unit parsing, customer memory, catalog fallback and legacy compatibility.');
