import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildWarehouseDispatchOrderBillingSnapshot,
  isWarehouseDispatchActualUnitCompatible,
} from '../src/services/customerProductBilling.js';

const duckProduct = {
  id: 'duck',
  name: 'Vit moc',
  unit: 'Con',
  sellingPrice: 55000,
};

const fiftyDuckDispatch = {
  id: 'dispatch-duck-001',
  productId: 'duck',
  productNameSnapshot: 'Vit moc',
  quantity: 50,
  quantityUnit: 'Con',
  weightKg: 125.4,
};

const kilogramBilling = buildWarehouseDispatchOrderBillingSnapshot({
  dispatch: fiftyDuckDispatch,
  product: duckProduct,
  configuration: { configurationId: 'customer-duck-kg', pricingUnit: 'Kg', unitPrice: 65000 },
});
assert.equal(kilogramBilling.actualQuantity, 50, 'physical count remains available for warehouse reconciliation');
assert.equal(kilogramBilling.actualWeightKg, 125.4, 'physical dispatch weight is preserved');
assert.equal(kilogramBilling.billingUnit, 'Kg', 'customer pricing unit determines billing unit');
assert.equal(kilogramBilling.billingQuantity, 125.4, 'Kg billing uses dispatch weight, not duck count');
assert.equal(kilogramBilling.amount, 8151000, '125.4 Kg x 65,000 is billed correctly');

const countBilling = buildWarehouseDispatchOrderBillingSnapshot({
  dispatch: fiftyDuckDispatch,
  product: duckProduct,
  configuration: { configurationId: 'customer-duck-count', pricingUnit: 'Con', unitPrice: 100000 },
});
assert.equal(countBilling.billingUnit, 'Con', 'count configuration remains a count sale');
assert.equal(countBilling.billingQuantity, 50, 'count billing uses exported duck count');
assert.equal(countBilling.amount, 5000000, '50 ducks x 100,000 is billed correctly');

const legacyCountSnapshot = buildWarehouseDispatchOrderBillingSnapshot({
  dispatch: {
    ...fiftyDuckDispatch,
    billingUnit: 'Con',
    billingQuantity: 50,
    unitPrice: 100000,
    amount: 5000000,
    billingSnapshotVersion: 1,
    billingSnapshotSource: 'legacy_dispatch_snapshot',
  },
  product: duckProduct,
  configuration: { configurationId: 'customer-duck-kg', pricingUnit: 'Kg', unitPrice: 65000 },
});
assert.equal(legacyCountSnapshot.billingUnit, 'Kg', 'customer Kg configuration overrides an incompatible legacy dispatch billing unit');
assert.equal(legacyCountSnapshot.billingQuantity, 125.4, 'legacy count snapshot cannot replace the exported weight for Kg pricing');
assert.equal(legacyCountSnapshot.amount, 8151000, 'legacy count price cannot charge a Kg-configured customer by duck count');

const linkedKilogramPrice = buildWarehouseDispatchOrderBillingSnapshot({
  dispatch: fiftyDuckDispatch,
  product: duckProduct,
  configuration: { configurationId: 'customer-duck-kg', pricingUnit: 'Kg', unitPrice: 65000 },
  sourceUnitPrice: 62000,
  sourcePricingUnit: 'Kg',
});
assert.equal(linkedKilogramPrice.unitPrice, 62000, 'an exact source order price is reused only when it has the same pricing unit');
assert.equal(linkedKilogramPrice.amount, 7774800, 'linked Kg source price still uses exported Kg');

const preservedFallback = buildWarehouseDispatchOrderBillingSnapshot({
  dispatch: {
    ...fiftyDuckDispatch,
    billingUnit: 'Con',
    billingQuantity: 50,
    unitPrice: 100000,
    amount: 5000000,
    billingSnapshotVersion: 1,
  },
  product: duckProduct,
});
assert.equal(preservedFallback.billingUnit, 'Con', 'legacy dispatch remains deterministic when no customer configuration exists');
assert.equal(preservedFallback.amount, 5000000, 'legacy fallback preserves an eligible frozen price');

const noCustomerOverride = buildWarehouseDispatchOrderBillingSnapshot({
  dispatch: {
    ...fiftyDuckDispatch,
    billingUnit: 'Con',
    billingQuantity: 50,
    unitPrice: 100000,
    amount: 5000000,
    billingSnapshotVersion: 1,
  },
  product: duckProduct,
  configuration: { isCustomerConfigured: false, pricingUnit: 'Kg', unitPrice: 65000 },
});
assert.equal(noCustomerOverride.billingUnit, 'Con', 'a product fallback cannot overwrite an eligible legacy frozen dispatch unit');
assert.equal(noCustomerOverride.amount, 5000000, 'only an actual customer product configuration can override legacy fallback pricing');

assert.equal(isWarehouseDispatchActualUnitCompatible({
  expectedActualUnit: 'Kg',
  actualUnit: 'Con',
  billingUnit: kilogramBilling.billingUnit,
  actualWeightKg: kilogramBilling.actualWeightKg,
}), true, 'a count plus measured Kg is accepted for a Kg-priced customer product');

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
assert.match(appSource, /buildWarehouseDispatchOrderBillingSnapshot\(/, 'bulk conversion uses the dispatch-to-order billing resolver');
assert.match(appSource, /getCustomerBranchProductConfigSource\(customer, branchId, activeProducts\)/, 'bulk conversion reads the customer product pricing configuration');
assert.match(appSource, /quantity: item\.billingQuantity > 0/, 'draft quantity is the billing quantity rather than the physical count');
assert.match(appSource, /'billingQuantity', e\.target\.value/, 'editing the visible quantity recalculates the billing quantity');
assert.match(appSource, /isWarehouseDispatchActualUnitCompatible\(\{/, 'warehouse save validates physical and billing units with the shared compatibility rule');

console.log('Warehouse dispatch bulk order billing tests: PASS (7 scenarios, 23 assertions)');
