/**
 * @param {import('./dispatchWorkflowContracts.js').BillingInput} input
 * @param {import('./dispatchWorkflowContracts.js').BillingPorts} ports
 */
export function coordinateDispatchBilling({customer = null, product = null, matchedOrderRow = null, existingRecord = null, actualQuantity = 0, actualUnit = '', actualWeightKg = 0, branchId = ''} = {}, {products, getCustomerBranchProductConfigSource, resolveCustomerProductBillingConfiguration, resolveTransactionBillingSnapshot, resolveCustomerProductActualUnit, isSameBillingUnit, buildCustomerProductBillingSnapshot, isWarehouseDispatchActualUnitCompatible}) {
    const configSource = getCustomerBranchProductConfigSource(customer, branchId, products);
    const currentConfiguration = resolveCustomerProductBillingConfiguration(configSource, product, {
      configurationId: matchedOrderRow?.item?.configurationId
        || matchedOrderRow?.configurationId
        || existingRecord?.configurationId
        || '',
      sizeLabel: matchedOrderRow?.sizeLabel || matchedOrderRow?.item?.sizeLabel || existingRecord?.sizeLabel || '',
      attributeLabel: matchedOrderRow?.attributeLabel || matchedOrderRow?.item?.attributeLabel || existingRecord?.attributeLabel || '',
    });
    const existingSnapshot = resolveTransactionBillingSnapshot({
      record: existingRecord,
      configuration: currentConfiguration,
      product,
    });
    const orderSource = matchedOrderRow
      ? { ...matchedOrderRow, ...(matchedOrderRow.item || {}) }
      : null;
    const orderSnapshot = resolveTransactionBillingSnapshot({
      record: orderSource,
      configuration: currentConfiguration,
      product,
    });
    const frozenSource = existingSnapshot.hasFrozenPricing
      ? existingSnapshot
      : (orderSnapshot.hasFrozenPricing ? orderSnapshot : null);
    const billingConfiguration = frozenSource
      ? {
          ...currentConfiguration,
          configurationId: frozenSource.configurationId || currentConfiguration.configurationId,
          billingUnit: frozenSource.billingUnit,
          pricingUnit: frozenSource.billingUnit,
          unitPrice: frozenSource.unitPrice,
          source: existingSnapshot.hasFrozenPricing ? 'warehouse_snapshot' : 'order_request_snapshot',
      }
      : currentConfiguration;
    const configuredActualUnit = resolveCustomerProductActualUnit(billingConfiguration, product);
    const orderActualUnit = orderSnapshot.actualUnit;
    const expectedActualUnit = existingSnapshot.hasFrozenPricing
      ? existingSnapshot.actualUnit
      : (orderSnapshot.hasFrozenPricing
        ? (isSameBillingUnit(orderSnapshot.billingUnit, 'Kg')
            && isSameBillingUnit(orderActualUnit, 'Kg')
            && configuredActualUnit
            && !isSameBillingUnit(configuredActualUnit, 'Kg')
          ? configuredActualUnit
          : orderActualUnit)
        : configuredActualUnit);
    const snapshot = buildCustomerProductBillingSnapshot({
      configuration: billingConfiguration,
      product,
      productId: product?.id || '',
      productName: product?.name || '',
      sizeLabel: matchedOrderRow?.sizeLabel || matchedOrderRow?.item?.sizeLabel || existingRecord?.sizeLabel || '',
      attributeLabel: matchedOrderRow?.attributeLabel || matchedOrderRow?.item?.attributeLabel || existingRecord?.attributeLabel || '',
      actualQuantity,
      actualUnit,
      actualWeightKg,
    });
    if (!isWarehouseDispatchActualUnitCompatible({
      expectedActualUnit,
      actualUnit,
      billingUnit: snapshot.billingUnit,
      actualWeightKg: snapshot.actualWeightKg,
    })) {
      return {
        ...snapshot,
        billingSnapshotValid: false,
        billingSnapshotError: 'ACTUAL_UNIT_NOT_ALLOWED',
      };
    }
    return snapshot;

}
