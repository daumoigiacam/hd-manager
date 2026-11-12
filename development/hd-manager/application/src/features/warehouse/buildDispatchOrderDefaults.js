/**
 * @param {import('./dispatchWorkflowContracts.js').OrderRow | null} orderRow
 * @param {import('./dispatchWorkflowContracts.js').DefaultsPorts} ports
 */
export function buildDispatchOrderDefaults(orderRow, ports) {
  const { productLookup, customerLookup, products, getCustomerBranchProductConfigSource, resolveCustomerProductBillingConfiguration, resolveTransactionBillingSnapshot, resolveCustomerProductActualUnit, normalizeDispatchQuantityUnit, isSameBillingUnit, parseLooseQuantityValue, formatDispatchNumberInput } = ports;
  if (!orderRow) return {
    productId: '',
    productSearch: '',
    pieceCount: '',
    quantityUnit: '',
    weightKg: '',
    configurationId: '',
    billingUnit: '',
    billingQuantity: 0,
    unitPrice: 0,
    amount: 0,
    billingSnapshotVersion: 0,
    billingSnapshotSource: '',
  };
  const product = (orderRow.productId && productLookup.get(orderRow.productId)) || orderRow.product || null;
  const productName = product?.name || orderRow.productName || orderRow.item?.productName || orderRow.item?.description || '';
  const customer = customerLookup.get(orderRow.customerId || orderRow.item?.customerId || '') || null;
  const configSource = getCustomerBranchProductConfigSource(
    customer,
    orderRow.branchId || orderRow.customerBranchId || '',
    products
  );
  const configuration = resolveCustomerProductBillingConfiguration(configSource, product, {
    configurationId: orderRow.item?.configurationId || orderRow.configurationId || '',
    sizeLabel: orderRow.sizeLabel || orderRow.item?.sizeLabel || '',
    attributeLabel: orderRow.attributeLabel || orderRow.item?.attributeLabel || '',
  });
  const sourceRecord = { ...orderRow, ...(orderRow.item || {}) };
  const sourceSnapshot = resolveTransactionBillingSnapshot({
    record: sourceRecord,
    configuration,
    product,
  });
  const pricingUnit = sourceSnapshot.billingUnit || configuration.billingUnit;
  const configuredActualUnit = resolveCustomerProductActualUnit(configuration, product);
  const quantityUnit = normalizeDispatchQuantityUnit(
    sourceSnapshot.actualUnit
    && (!isSameBillingUnit(pricingUnit, 'Kg') || !isSameBillingUnit(sourceSnapshot.actualUnit, 'Kg'))
      ? sourceSnapshot.actualUnit
      : (configuredActualUnit || sourceSnapshot.actualUnit || product?.unit || pricingUnit)
  );
  const orderQuantity = parseLooseQuantityValue(
    sourceSnapshot.actualQuantity > 0
      ? sourceSnapshot.actualQuantity
      : (orderRow.item?.quantity
        ?? orderRow.item?.quantityValue
        ?? orderRow.item?.quantityCount
        ?? orderRow.quantity
        ?? orderRow.quantityCount)
  );
  const explicitWeight = parseLooseQuantityValue(
    sourceSnapshot.actualWeightKg > 0
      ? sourceSnapshot.actualWeightKg
      : (sourceSnapshot.billingQuantity > 0
        ? sourceSnapshot.billingQuantity
        : (orderRow.item?.weightKg
          ?? orderRow.item?.kg
          ?? orderRow.item?.weight
          ?? orderRow.weightKg))
  );
  const defaultWeight = isSameBillingUnit(pricingUnit, 'Kg')
    ? explicitWeight
    : 0;
  return {
    productId: product?.id || orderRow.productId || '',
    productSearch: productName,
    pieceCount: orderQuantity > 0 ? formatDispatchNumberInput(orderQuantity) : '',
    quantityUnit,
    weightKg: defaultWeight > 0 ? formatDispatchNumberInput(defaultWeight) : '',
    configurationId: sourceSnapshot.configurationId || configuration.configurationId || '',
    billingUnit: pricingUnit,
    billingQuantity: sourceSnapshot.billingQuantity || 0,
    unitPrice: sourceSnapshot.unitPrice || configuration.unitPrice || 0,
    amount: sourceSnapshot.amount || 0,
    billingSnapshotVersion: sourceSnapshot.hasFrozenPricing ? 1 : 0,
    billingSnapshotSource: sourceSnapshot.hasFrozenPricing ? 'order_request_snapshot' : configuration.source,
  };

}
