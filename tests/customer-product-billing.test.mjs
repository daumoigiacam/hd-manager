import assert from 'node:assert/strict';
import {
  buildCustomerProductBillingSnapshot,
  calculateBillableAmount,
  isCustomerProductUnitAllowed,
  resolveCustomerProductConfiguration,
  resolveTransactionBillingSnapshot,
} from '../src/services/customerProductBilling.js';
import { buildExecutiveDashboardSnapshot } from '../src/services/executiveDashboardService.js';
import { buildPricingEngineSnapshot } from '../src/services/pricingEngineService.js';

const UNIT_SET = 'B\u1ed9';
const UNIT_PIECE = 'C\u00e1i';

const offalProduct = { id: 'offal', name: 'L\u00f2ng V\u1ecbt', unit: UNIT_SET, sellingPrice: 4000 };
const duckProduct = { id: 'duck', name: 'V\u1ecbt', unit: 'Con', sellingPrice: 55000 };
const offalConfig = { price: 5000, pricingUnit: UNIT_SET, size: 'X\u00f4' };
const duckConfig = { price: 60000, pricingUnit: 'Kg' };

const offalResolved = resolveCustomerProductConfiguration({ customerConfig: offalConfig, product: offalProduct });
assert.equal(offalResolved.pricingUnit, UNIT_SET, '1. fixed pricing unit is resolved from customer configuration');
assert.equal(offalResolved.unitPrice, 5000, '2. fixed customer price wins over product price');
assert.deepEqual(offalResolved.allowedUnits, [UNIT_SET], '3. only the configured unit is allowed');
assert.equal(isCustomerProductUnitAllowed(offalResolved, UNIT_PIECE), false, '4. an arbitrary unit is rejected');

const orderOffal = buildCustomerProductBillingSnapshot({
  configuration: offalResolved,
  product: offalProduct,
  actualQuantity: 10,
  actualUnit: UNIT_SET,
});
assert.equal(orderOffal.amount, 50000, '5. 10 sets x 5,000 = 50,000');
assert.equal(orderOffal.billingQuantity, 10, '6. non-weight billing uses actual quantity');

const invalidOffal = calculateBillableAmount({
  configuration: offalResolved,
  actualQuantity: 10,
  actualUnit: UNIT_PIECE,
});
assert.equal(invalidOffal.isValid, false, '7. wrong actual unit is invalid');
assert.equal(invalidOffal.errorCode, 'ACTUAL_UNIT_NOT_ALLOWED', '8. unit mismatch has an explicit error');

const warehouseOffal = buildCustomerProductBillingSnapshot({
  configuration: offalResolved,
  product: offalProduct,
  actualQuantity: 9,
  actualUnit: UNIT_SET,
});
assert.equal(warehouseOffal.amount, 45000, '9. warehouse 9 sets x 5,000 = 45,000');

const duckResolved = resolveCustomerProductConfiguration({ customerConfig: duckConfig, product: duckProduct });
const warehouseDuck = buildCustomerProductBillingSnapshot({
  configuration: duckResolved,
  product: duckProduct,
  actualQuantity: 7,
  actualUnit: 'Con',
  actualWeightKg: 20,
});
assert.equal(warehouseDuck.actualQuantity, 7, '10. actual duck count is preserved');
assert.equal(warehouseDuck.actualUnit, 'Con', '11. actual duck unit is preserved');
assert.equal(warehouseDuck.billingQuantity, 20, '12. weight is the billing quantity');
assert.equal(warehouseDuck.billingUnit, 'Kg', '13. Kg remains the billing unit');
assert.equal(warehouseDuck.amount, 1200000, '14. 20 Kg x 60,000 = 1,200,000');

const pendingDuckOrder = buildCustomerProductBillingSnapshot({
  configuration: duckResolved,
  product: duckProduct,
  actualQuantity: 7,
  actualUnit: 'Con',
});
assert.equal(pendingDuckOrder.pricingPendingActual, true, '15. a Kg-priced order can wait for the warehouse weight');
assert.equal(pendingDuckOrder.amount, 0, '16. pending weight never guesses an order amount from the duck count');
assert.equal(pendingDuckOrder.unitPrice, 60000, '17. the pending order still freezes its configured unit price');

const deliverySnapshot = resolveTransactionBillingSnapshot({ record: warehouseOffal, product: offalProduct });
assert.equal(deliverySnapshot.amount, 45000, '18. delivery reuses the warehouse snapshot');

const changedConfig = resolveCustomerProductConfiguration({
  customerConfig: { ...offalConfig, price: 6000 },
  product: offalProduct,
});
const oldDelivery = resolveTransactionBillingSnapshot({
  record: warehouseOffal,
  configuration: changedConfig,
  product: offalProduct,
});
assert.equal(oldDelivery.unitPrice, 5000, '19. old snapshot price is immutable');
assert.equal(oldDelivery.amount, 45000, '20. old snapshot amount is immutable');
const newDelivery = buildCustomerProductBillingSnapshot({
  configuration: changedConfig,
  product: offalProduct,
  actualQuantity: 9,
  actualUnit: UNIT_SET,
});
assert.equal(newDelivery.amount, 54000, '21. new transaction uses the new price');

const customerB = resolveCustomerProductConfiguration({
  customerConfig: { price: 7000, pricingUnit: UNIT_SET },
  product: offalProduct,
});
assert.equal(customerB.unitPrice, 7000, '22. another customer keeps its own configuration');

const safeLegacy = resolveCustomerProductConfiguration({ product: offalProduct });
assert.deepEqual(safeLegacy.allowedUnits, [UNIT_SET], '23. legacy fallback exposes one deterministic unit only');

const variantsConfig = {
  variants: [
    { id: 'bulk', size: 'X\u00f4', pricingUnit: UNIT_SET, price: 5000 },
    { id: 'bag', size: 'Bao', pricingUnit: UNIT_SET, price: 7000 },
  ],
};
const bulkVariant = resolveCustomerProductConfiguration({
  customerConfig: variantsConfig,
  product: offalProduct,
  variantId: 'bulk',
});
const bagVariant = resolveCustomerProductConfiguration({
  customerConfig: variantsConfig,
  product: offalProduct,
  variantId: 'bag',
});
assert.equal(bulkVariant.unitPrice, 5000, '24. explicit variant resolves the correct price');
assert.equal(bagVariant.unitPrice, 7000, '25. another variant does not reuse the first price');

const ambiguousVariant = resolveCustomerProductConfiguration({
  customerConfig: variantsConfig,
  product: offalProduct,
});
assert.equal(ambiguousVariant.isValid, false, '26. multiple variants require an exact configuration match');
assert.equal(ambiguousVariant.errorCode, 'AMBIGUOUS_CUSTOMER_CONFIGURATION', '27. ambiguous variants fail explicitly');

const legacyRow = {
  productId: 'offal',
  quantity: 8,
  quantityUnit: UNIT_SET,
  pricingQuantity: 8,
  pricingUnit: UNIT_SET,
  unitPrice: 5000,
  lineTotal: 40000,
};
const normalizedLegacy = resolveTransactionBillingSnapshot({
  record: legacyRow,
  configuration: changedConfig,
  product: offalProduct,
});
assert.equal(normalizedLegacy.hasFrozenPricing, true, '28. legacy pricing aliases count as a frozen snapshot');
assert.equal(normalizedLegacy.amount, 40000, '29. legacy order does not change after refresh/config update');

const oldestLegacyRow = {
  productId: 'offal',
  quantity: 8,
  quantityUnit: UNIT_SET,
  unitPrice: 5000,
  lineTotal: 40000,
};
const normalizedOldestLegacy = resolveTransactionBillingSnapshot({
  record: oldestLegacyRow,
  configuration: changedConfig,
  product: offalProduct,
});
assert.equal(normalizedOldestLegacy.hasFrozenPricing, true, '30. an oldest-format unambiguous row is also frozen');
assert.equal(normalizedOldestLegacy.billingUnit, UNIT_SET, '31. the oldest-format stored unit remains authoritative');
assert.equal(normalizedOldestLegacy.unitPrice, 5000, '32. the oldest-format stored price is not replaced by current configuration');
assert.equal(normalizedOldestLegacy.amount, 40000, '33. the oldest-format stored amount remains immutable');

const roundTripWarehouseDuck = resolveTransactionBillingSnapshot({
  record: JSON.parse(JSON.stringify(warehouseDuck)),
  configuration: resolveCustomerProductConfiguration({
    customerConfig: { ...duckConfig, price: 75000 },
    product: duckProduct,
  }),
  product: duckProduct,
});
assert.equal(roundTripWarehouseDuck.unitPrice, 60000, '34. a JSON/Firestore round trip preserves the frozen price');
assert.equal(roundTripWarehouseDuck.billingQuantity, 20, '35. a reload preserves the frozen billing quantity');
assert.equal(roundTripWarehouseDuck.amount, 1200000, '36. a reload cannot recalculate the old transaction with a new price');

const missingPrice = resolveCustomerProductConfiguration({
  customerConfig: { pricingUnit: 'Con', price: 0 },
  product: { id: 'no-price', name: 'No price', unit: 'Con', sellingPrice: 0 },
});
assert.equal(missingPrice.isValid, false, '37. a fixed product without a price is rejected instead of silently charging zero');

const decimalWeight = buildCustomerProductBillingSnapshot({
  configuration: resolveCustomerProductConfiguration({
    customerConfig: { pricingUnit: 'Kg', price: 50000 },
    product: duckProduct,
  }),
  product: duckProduct,
  actualQuantity: 1,
  actualUnit: 'Con',
  actualWeightKg: 2.5,
});
assert.equal(decimalWeight.amount, 125000, '38. decimal Kg billing is rounded and calculated correctly');

const reportDate = new Date('2026-08-08T10:00:00+07:00');
const frozenBillingOrder = {
  id: 'billing-order',
  orderDate: reportDate.toISOString(),
  items: [warehouseDuck],
};
const dashboardSnapshot = buildExecutiveDashboardSnapshot({
  now: reportDate,
  orders: [frozenBillingOrder],
  products: [duckProduct],
});
assert.equal(
  dashboardSnapshot.finance.revenueToday,
  1200000,
  '39. executive dashboard revenue uses the frozen 20 Kg billing amount instead of 7 Con'
);

const pricingSnapshot = buildPricingEngineSnapshot({
  date: reportDate,
  orders: [frozenBillingOrder],
  products: [duckProduct],
});
assert.equal(
  pricingSnapshot.totals.monthlyRevenue,
  1200000,
  '40. pricing analytics uses the same frozen billing amount as the order and debt flow'
);

console.log('Customer product billing tests: PASS (16 scenarios, 40 assertions)');
