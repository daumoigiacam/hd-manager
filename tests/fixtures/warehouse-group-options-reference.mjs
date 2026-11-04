// Frozen eager projection from fe70815e; parity baseline for scheduling-only change.
export function eagerWarehouseGroups({orders,orderRequests,warehouseDispatches,warehouseImports,products,warehouseProductLookup,currentCompany,DEFAULT_PROCESSING_INVENTORY_GROUPS,normalizeProductGroups,normalizeLeadingLabel,buildProcessingInventoryGroupKey,getWarehouseInventoryGroupLabel}){
    const orderGroupLabels = (orders || []).flatMap(order => (order.items || []).map(item => {
      const product = warehouseProductLookup.get(item.productId);
      return item.productGroupName
        || item.groupName
        || item.productGroup
        || getWarehouseInventoryGroupLabel(product, item.productName || item.description || item.name);
    }));
    const orderRequestGroupLabels = (orderRequests || []).flatMap(request => (request.items || request.lines || request.products || []).map(item => {
      const product = warehouseProductLookup.get(item.productId);
      return item.productGroupName
        || item.groupName
        || item.productGroup
        || getWarehouseInventoryGroupLabel(product, item.productName || item.description || item.name);
    }));
    const dispatchGroupLabels = (warehouseDispatches || []).map(item => {
      const product = warehouseProductLookup.get(item.productId);
      return item.productGroupName
        || item.groupName
        || item.productGroup
        || getWarehouseInventoryGroupLabel(product, item.productNameSnapshot || item.productName || item.description);
    });
    const labels = [
      ...DEFAULT_PROCESSING_INVENTORY_GROUPS,
      ...normalizeProductGroups(currentCompany?.productGroups || []),
      'Bò',
      'Túi bóng',
      'Thùng xốp',
      ...products.flatMap(product => [
        getWarehouseInventoryGroupLabel(product, product.name),
        product.mainGroup,
        product.groupName,
        product.productGroup,
        product.category
      ]),
      ...warehouseImports.map(item => item.groupName || item.productGroup),
      ...dispatchGroupLabels,
      ...orderGroupLabels,
      ...orderRequestGroupLabels
    ]
      .map(label => normalizeLeadingLabel(label || 'Nhóm hàng'))
      .filter(Boolean);
    return Array.from(new Map(labels.map(label => [buildProcessingInventoryGroupKey(label), label])).values());

}
