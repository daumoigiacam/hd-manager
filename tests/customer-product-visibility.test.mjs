import assert from 'node:assert/strict';
import {
  filterCustomerVisibleProducts,
  isCustomerVisibleProduct,
} from '../src/utils/customerProductVisibility.js';

const products = [
  { id: 'active' },
  { id: 'archived', isArchived: true },
  { id: 'hidden-for-customer', hiddenFromCustomers: true },
  { id: 'explicitly-not-visible', visibleToCustomers: false },
  { id: 'legacy-hidden', isHidden: 'true' },
  { id: 'explicitly-visible', isVisible: true },
];

assert.equal(isCustomerVisibleProduct(null), false);
assert.equal(isCustomerVisibleProduct({ isArchived: false }), true);
assert.deepEqual(
  filterCustomerVisibleProducts(products).map((product) => product.id),
  ['active', 'explicitly-visible'],
);

console.log('Customer product visibility tests passed.');
