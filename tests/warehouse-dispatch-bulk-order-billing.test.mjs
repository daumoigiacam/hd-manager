import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildWarehouseDispatchOrderBillingSnapshot,
  isWarehouseDispatchActualUnitCompatible,
  mergeWarehouseDispatchOrderBillingItems,
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

const mergedSamePriceRows = mergeWarehouseDispatchOrderBillingItems([
  {
    ...kilogramBilling,
    sourceDispatchIds: ['dispatch-a'],
    billingQuantity: 30.8,
    actualWeightKg: 30.8,
    unitPrice: 60000,
    amount: 1848000,
  },
  {
    ...kilogramBilling,
    sourceDispatchIds: ['dispatch-b'],
    billingQuantity: 28.3,
    actualWeightKg: 28.3,
    unitPrice: 60000,
    amount: 1698000,
  },
]);
assert.equal(mergedSamePriceRows.length, 1, 'duplicate product dispatches become one order line');
assert.equal(mergedSamePriceRows[0].billingQuantity, 59.1, 'duplicate Kg quantities are summed');
assert.equal(mergedSamePriceRows[0].amount, 3546000, 'same-price line totals are preserved exactly');
assert.equal(mergedSamePriceRows[0].unitPrice, 60000, 'same price remains unchanged after consolidation');
assert.deepEqual(mergedSamePriceRows[0].sourceDispatchIds, ['dispatch-a', 'dispatch-b'], 'all source dispatch ids remain traceable');

const mergedMixedPriceRows = mergeWarehouseDispatchOrderBillingItems([
  {
    ...kilogramBilling,
    configurationId: 'size-small',
    sourceDispatchIds: ['dispatch-c'],
    billingQuantity: 30.8,
    actualWeightKg: 30.8,
    unitPrice: 60000,
    amount: 1848000,
  },
  {
    ...kilogramBilling,
    configurationId: 'size-large',
    sourceDispatchIds: ['dispatch-d'],
    billingQuantity: 28.3,
    actualWeightKg: 28.3,
    unitPrice: 63000,
    amount: 1782900,
  },
]);
assert.equal(mergedMixedPriceRows.length, 1, 'same product and pricing unit merge even when source prices differ');
assert.equal(mergedMixedPriceRows[0].billingQuantity, 59.1, 'mixed-price quantities are summed');
assert.equal(mergedMixedPriceRows[0].amount, 3630900, 'mixed-price source amounts remain exact');
assert.equal(mergedMixedPriceRows[0].unitPrice, 61437, 'display price uses the weighted average rounded to a whole VND');
assert.ok(Math.abs(mergedMixedPriceRows[0].weightedUnitPrice - (3630900 / 59.1)) < 0.000001, 'the exact weighted average remains available for audit');
assert.equal(mergedMixedPriceRows[0].configurationId, '', 'a mixed configuration is not mislabeled as one source configuration');
assert.deepEqual(mergedMixedPriceRows[0].sourceConfigurationIds, ['size-small', 'size-large'], 'source configurations remain auditable');

const separateBillingUnits = mergeWarehouseDispatchOrderBillingItems([
  { ...kilogramBilling, sourceDispatchIds: ['dispatch-e'] },
  { ...countBilling, sourceDispatchIds: ['dispatch-f'] },
]);
assert.equal(separateBillingUnits.length, 2, 'incompatible billing units remain separate to avoid invalid arithmetic');

const separateActualUnits = mergeWarehouseDispatchOrderBillingItems([
  { ...kilogramBilling, actualUnit: 'Con', sourceDispatchIds: ['dispatch-e-count'] },
  { ...kilogramBilling, actualUnit: 'Kg', sourceDispatchIds: ['dispatch-e-weight'] },
]);
assert.equal(separateActualUnits.length, 2, 'incompatible physical units remain separate to preserve warehouse quantities');

const duplicateListenerRows = mergeWarehouseDispatchOrderBillingItems([
  { ...kilogramBilling, sourceDispatchIds: ['dispatch-g'] },
  { ...kilogramBilling, sourceDispatchIds: ['dispatch-g'] },
]);
assert.equal(duplicateListenerRows[0].billingQuantity, kilogramBilling.billingQuantity, 'a repeated realtime dispatch snapshot is not counted twice');
assert.equal(duplicateListenerRows[0].amount, kilogramBilling.amount, 'a repeated realtime dispatch snapshot cannot inflate revenue');

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
assert.match(appSource, /buildWarehouseDispatchOrderBillingSnapshot\(/, 'bulk conversion uses the dispatch-to-order billing resolver');
assert.match(appSource, /mergeWarehouseDispatchOrderBillingItems\(group\.items\)/, 'bulk conversion consolidates duplicate product rows before review');
assert.match(appSource, /draft\.sourceType === 'warehouse_dispatch'[\s\S]*mergeWarehouseDispatchOrderBillingItems\(draft\.items\)/, 'warehouse drafts are consolidated again immediately before persistence');
assert.match(appSource, /getCustomerBranchProductConfigSource\(customer, branchId, activeProducts\)/, 'bulk conversion reads the customer product pricing configuration');
assert.match(appSource, /quantity: item\.billingQuantity > 0/, 'draft quantity is the billing quantity rather than the physical count');
assert.match(appSource, /'billingQuantity', e\.target\.value/, 'editing the visible quantity recalculates the billing quantity');
assert.match(appSource, /isWarehouseDispatchActualUnitCompatible\(\{/, 'warehouse save validates physical and billing units with the shared compatibility rule');

console.log('Warehouse dispatch bulk order billing tests: PASS (12 scenarios, 41 assertions)');
