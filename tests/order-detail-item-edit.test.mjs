import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { updateTransactionBillingItem } from '../src/services/customerProductBilling.js';

const countPricedItem = {
  productId: 'duck-large',
  description: 'Vit Khong Moc To',
  quantity: 60,
  actualQuantity: 60,
  quantityCount: 60,
  actualUnit: 'Con',
  quantityUnit: 'Con',
  billingQuantity: 60,
  pricingQuantity: 60,
  billingUnit: 'Con',
  pricingUnit: 'Con',
  unitPrice: 152000,
  amount: 9120000,
  pricingAmount: 9120000,
  lineTotal: 9120000,
  billingSnapshotVersion: 1,
  billingSnapshotSource: 'warehouse_dispatch_order_snapshot',
};

const editedCountItem = updateTransactionBillingItem(countPricedItem, {
  billingQuantity: 70,
  unitPrice: 152000,
});
assert.equal(editedCountItem.billingQuantity, 70, 'edited count is the billing quantity shown in order detail');
assert.equal(editedCountItem.unitPrice, 152000, 'edited count keeps the requested unit price');
assert.equal(editedCountItem.amount, 10640000, '70 Con x 152,000 VND = 10,640,000 VND');
assert.equal(editedCountItem.actualQuantity, 60, 'physical dispatch quantity remains available for audit');
assert.equal(editedCountItem.quantity, 60, 'frozen dispatch quantity is not overwritten by a billing correction');

const kilogramItem = {
  ...countPricedItem,
  quantity: 5,
  actualQuantity: 5,
  actualWeightKg: 10,
  actualUnit: 'Con',
  quantityUnit: 'Con',
  billingQuantity: 10,
  pricingQuantity: 10,
  billingUnit: 'Kg',
  pricingUnit: 'Kg',
  unitPrice: 60000,
  amount: 600000,
  pricingAmount: 600000,
  lineTotal: 600000,
};
const editedKilogramItem = updateTransactionBillingItem(kilogramItem, {
  billingQuantity: 12,
  unitPrice: 61000,
});
assert.equal(editedKilogramItem.billingQuantity, 12, 'Kg edit updates the billing Kg quantity');
assert.equal(editedKilogramItem.amount, 732000, '12 Kg x 61,000 VND = 732,000 VND');
assert.equal(editedKilogramItem.actualQuantity, 5, 'Kg edit preserves physical count');
assert.equal(editedKilogramItem.actualWeightKg, 10, 'Kg edit preserves physical weight');

const directItem = updateTransactionBillingItem({
  productId: 'direct-product',
  quantity: 60,
  quantityUnit: 'Con',
  unitPrice: 145000,
}, { billingQuantity: 70, unitPrice: 152000 });
assert.equal(directItem.quantity, 70, 'direct orders update their persisted quantity');
assert.equal(directItem.amount, 10640000, 'direct order amount recalculates from edited quantity and price');

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
assert.match(appSource, /canEditOrderQuantityPrice = false/);
assert.match(appSource, /canEditOrderQuantityPrice=\{canRoleAction\('orders', 'edit_order_items'\) \|\| canRoleAction\('orders', 'edit_order_quantity_price'\)\}/);
assert.match(appSource, /const canEditOrderItemRecord = \(order\) =>/);
assert.match(appSource, /const currentBilling = getOrderItemBillingPresentation\(targetItem\);/);
assert.match(appSource, /updateTransactionBillingItem\(item, \{ billingQuantity: nextQuantity, unitPrice: nextUnitPrice \}\)/);
assert.match(appSource, /disabled=\{!canEditOrderItemRecord\(selectedOrder\)\}/);

console.log('Order detail quantity/price edit tests: PASS');
