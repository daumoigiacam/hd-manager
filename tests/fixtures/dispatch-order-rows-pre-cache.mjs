// Frozen callback before remount caching; uses original row/billing/branch logic.
export const buildFrozenDispatchOrderRows=({todayOrderRequests,customerLookup,productLookup,products,getCustomerDisplayName,resolveRequestDateKey,getDispatchOrderBranchRef,getProductShortName,getOrderLineUnitPriceValue,getOrderLineQuantityValue,getOrderLineWeightKgValue,getOrderLineSizeLabel,getOrderLineAttributeLabel})=>(() => todayOrderRequests.flatMap((request) => {
    const requestCustomer = customerLookup.get(request.customerId) || request.customer || null;
    const customerName = getCustomerDisplayName(requestCustomer) || requestCustomer?.name || request.customerName || request.customerNameSnapshot || '';
    const requestDate = resolveRequestDateKey(request);
    const requestItems = Array.isArray(request.items) && request.items.length > 0
      ? request.items
      : (request.primaryItem ? [request.primaryItem] : []);

    return requestItems.map((item, index) => {
      const matchedProduct = item?.productId ? productLookup.get(item.productId) || null : null;
      const productName = matchedProduct?.name || item?.description || item?.productName || item?.productNameSnapshot || '';
      const branchRef = getDispatchOrderBranchRef(requestCustomer, request, item);
      const itemRowKey = `${item?.rowKey || item?.id || item?.lineId || item?.itemId || index}`.trim();
      return {
        rowKey: `${request.id || 'request'}_${itemRowKey || item?.productId || index}`,
        requestId: request.id || '',
        requestDate,
        customerId: request.customerId || requestCustomer?.id || '',
        customerName,
        branchId: branchRef.branchId,
        branchName: branchRef.branchName,
        branchAddress: branchRef.branchAddress,
        customerBranchId: branchRef.branchId,
        customerBranchName: branchRef.branchName,
        customerBranchAddress: branchRef.branchAddress,
        customerPhone: requestCustomer?.phone || request.customerPhone || '',
        customerAddress: requestCustomer?.address || request.customerAddress || '',
        customerGroup: requestCustomer?.group || requestCustomer?.customerGroup || '',
        productId: matchedProduct?.id || item?.productId || '',
        productName,
        productShortName: getProductShortName(matchedProduct),
        productCategory: matchedProduct?.category || matchedProduct?.mainGroup || '',
        productUnit: matchedProduct?.unit || item?.quantityUnit || '',
        productBarcode: matchedProduct?.barcode || '',
        unitPrice: getOrderLineUnitPriceValue(item),
        configurationId: item?.configurationId || '',
        actualQuantity: item?.actualQuantity ?? item?.quantity ?? item?.quantityCount ?? 0,
        actualUnit: item?.actualUnit || item?.quantityUnit || item?.unit || matchedProduct?.unit || '',
        actualWeightKg: item?.actualWeightKg ?? item?.weightKg ?? 0,
        billingQuantity: item?.billingQuantity ?? item?.pricingQuantity ?? 0,
        billingUnit: item?.billingUnit || item?.pricingUnit || '',
        amount: item?.amount ?? item?.pricingAmount ?? item?.lineTotal ?? item?.total ?? 0,
        billingSnapshotVersion: item?.billingSnapshotVersion || 0,
        billingSnapshotSource: item?.billingSnapshotSource || '',
        quantity: getOrderLineQuantityValue(item),
        quantityUnit: item?.quantityUnit || item?.unit || matchedProduct?.unit || '',
        weightKg: getOrderLineWeightKgValue(item),
        sizeLabel: getOrderLineSizeLabel(item),
        attributeLabel: getOrderLineAttributeLabel(item),
        product: matchedProduct,
        item
      };
    }).filter(row => row.customerName || row.productName);
  }))();
