import assert from 'node:assert/strict';
import {
  buildCustomerProductBillingSnapshot,
  calculateBillableAmount,
  isCustomerProductUnitAllowed,
  isWarehouseDispatchActualUnitCompatible,
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
assert.equal(
  `${warehouseDuck.billingQuantity} ${warehouseDuck.billingUnit}`,
  '20 Kg',
  '14a. invoice details must display the frozen billing quantity and unit that match the billed amount'
);

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

const duckOrderUnitConfig = resolveCustomerProductConfiguration({
  customerConfig: {
    pricingUnit: 'Kg',
    price: 57000,
    orderUnits: 'Kg, Con',
    defaultOrderUnit: 'Con',
    unitConversions: 'Con=2.5',
  },
  product: duckProduct,
});
assert.deepEqual(duckOrderUnitConfig.orderUnits, ['Kg', 'Con'], '39. customer configuration exposes allowed order units');
assert.equal(duckOrderUnitConfig.defaultOrderUnit, 'Con', '40. customer configuration preserves its default order unit');

const oneKgCustomerOrder = buildCustomerProductBillingSnapshot({
  configuration: duckOrderUnitConfig,
  product: duckProduct,
  actualQuantity: 1,
  actualUnit: 'Kg',
  orderUnit: 'Kg',
});
assert.equal(oneKgCustomerOrder.amount, 57000, '41. 1 Kg x 57,000 = 57,000');
assert.equal(oneKgCustomerOrder.orderUnit, 'Kg', '42. the chosen Kg order unit is persisted');

const oneDuckCustomerOrder = buildCustomerProductBillingSnapshot({
  configuration: duckOrderUnitConfig,
  product: duckProduct,
  actualQuantity: 1,
  actualUnit: 'Con',
  orderUnit: 'Con',
});
assert.equal(oneDuckCustomerOrder.billingQuantity, 2.5, '43. 1 Con converts to 2.5 Kg when configured');
assert.equal(oneDuckCustomerOrder.conversionFactor, 2.5, '44. the snapshot stores the configured conversion factor');
assert.equal(oneDuckCustomerOrder.amount, 142500, '45. 1 Con x 2.5 Kg x 57,000 = 142,500');
assert.equal(oneDuckCustomerOrder.basePriceUnit, 'Kg', '46. the base price unit remains Kg');

const threeDuckCustomerOrder = buildCustomerProductBillingSnapshot({
  configuration: duckOrderUnitConfig,
  product: duckProduct,
  actualQuantity: 3,
  actualUnit: 'Con',
  orderUnit: 'Con',
});
assert.equal(threeDuckCustomerOrder.amount, 427500, '47. 3 Con x 2.5 Kg x 57,000 = 427,500');

const commaDecimalConversionOrder = buildCustomerProductBillingSnapshot({
  configuration: resolveCustomerProductConfiguration({
    customerConfig: {
      pricingUnit: 'Kg',
      price: 57000,
      orderUnits: 'Kg, Con',
      defaultOrderUnit: 'Con',
      unitConversions: 'Con=2,5',
    },
    product: duckProduct,
  }),
  product: duckProduct,
  actualQuantity: 1,
  actualUnit: 'Con',
  orderUnit: 'Con',
});
assert.equal(commaDecimalConversionOrder.amount, 142500, '48. Vietnamese comma conversion preserves the exact amount');
assert.equal(commaDecimalConversionOrder.conversionFactor, 2.5, '49. Vietnamese comma conversion is saved in the snapshot');

const missingConversionOrder = buildCustomerProductBillingSnapshot({
  configuration: resolveCustomerProductConfiguration({
    customerConfig: { pricingUnit: 'Kg', price: 57000, orderUnits: 'Kg, Con' },
    product: duckProduct,
  }),
  product: duckProduct,
  actualQuantity: 1,
  actualUnit: 'Con',
  orderUnit: 'Con',
});
assert.equal(missingConversionOrder.amount, 0, '50. missing conversion never assumes 1 Con equals 1 Kg');
assert.equal(missingConversionOrder.billingSnapshotValid, false, '51. missing conversion leaves the cart line invalid');
assert.equal(missingConversionOrder.pricingPendingActual, true, '52. missing conversion is explicitly marked as unresolved');

const lo47Configuration = resolveCustomerProductConfiguration({
  customerConfig: { pricingUnit: 'Kg', price: 52000 },
  product: { id: 'unplucked-chicken', name: 'Ga Khong Moc', unit: 'Kg', sellingPrice: 57000 },
});
const lo47Dispatch = buildCustomerProductBillingSnapshot({
  configuration: lo47Configuration,
  product: { id: 'unplucked-chicken', name: 'Ga Khong Moc', unit: 'Kg', sellingPrice: 57000 },
  actualQuantity: 20,
  actualUnit: 'Con',
  actualWeightKg: 45.7,
});
assert.equal(
  isWarehouseDispatchActualUnitCompatible({
    expectedActualUnit: 'Kg',
    actualUnit: 'Con',
    billingUnit: lo47Dispatch.billingUnit,
    actualWeightKg: lo47Dispatch.actualWeightKg,
  }),
  true,
  '39. a measured count plus Kg dispatch is valid when this customer is priced by Kg'
);
assert.equal(lo47Dispatch.billingUnit, 'Kg', '40. the customer fixed-product pricing unit remains authoritative');
assert.equal(lo47Dispatch.billingQuantity, 45.7, '41. the measured weight is used as the billing quantity');
assert.equal(lo47Dispatch.unitPrice, 52000, '42. the customer-specific price wins over the global product price');
assert.equal(lo47Dispatch.amount, 2376400, '43. 45.7 Kg x 52,000 is calculated exactly');

assert.equal(
  isWarehouseDispatchActualUnitCompatible({
    expectedActualUnit: 'Con',
    actualUnit: 'Bao',
    billingUnit: 'Con',
    actualWeightKg: 45.7,
  }),
  false,
  '44. a non-weight pricing unit cannot silently use an incompatible physical unit'
);

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

const postgresNumericDashboard = buildExecutiveDashboardSnapshot({
  now: reportDate,
  customers: [{
    id: 'postgres-numeric-customer',
    name: 'Postgres Numeric Customer',
    currentDebt: '162844000.2135611',
  }],
  orders: [{
    id: 'postgres-numeric-order',
    customerId: 'postgres-numeric-customer',
    customerName: 'Postgres Numeric Customer',
    orderDate: reportDate.toISOString(),
    totalAmount: '1438441308.0025882',
    paidAmount: '1438441308.0025882',
  }],
});
assert.equal(
  postgresNumericDashboard.finance.revenueToday,
  1438441308.0025882,
  '40. PostgreSQL numeric strings retain their decimal point instead of being parsed as grouped text'
);
assert.equal(
  postgresNumericDashboard.business.topCustomersByRevenue[0].revenue,
  1438441308.0025882,
  '41. customer revenue rankings preserve PostgreSQL numeric values'
);
assert.equal(
  postgresNumericDashboard.business.topCustomersByDebt[0].debt,
  162844000.2135611,
  '42. customer debt rankings preserve PostgreSQL numeric values'
);

const pricingSnapshot = buildPricingEngineSnapshot({
  date: reportDate,
  orders: [frozenBillingOrder],
  products: [duckProduct],
});
assert.equal(
  pricingSnapshot.totals.monthlyRevenue,
  1200000,
  '43. pricing analytics uses the same frozen billing amount as the order and debt flow'
);

console.log('Customer product billing tests: PASS (23 scenarios, 64 assertions)');
