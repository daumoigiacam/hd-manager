// Frozen6aadaa23 complete inventory calculations.
export default (products = [], orders = [], { untilDate = '', warehouseImports = null, warehouseDispatches = null, stockBalanceResolver = buildProductStockBalanceIndex } = {}) => {
  const productMap = new Map((products || []).map(product => [product.id, product]));
  const stockBalances = warehouseImports && warehouseDispatches
    ? stockBalanceResolver(products || [], warehouseImports, warehouseDispatches, untilDate)
    : null;
  const soldByProductId = new Map();
  const revenueByProductId = new Map();
  const costByProductId = new Map();

  (orders || [])
    .filter(order => !order?.isArchived)
    .filter(order => !untilDate || `${order.date || ''}` <= untilDate)
    .forEach(order => {
      (order.items || []).forEach(item => {
        const product = productMap.get(item.productId);
        if (!product) return;
        const productId = product.id;
        const stockUnit = getProductInventoryUnit(product);
        const itemUnit = getOrderItemQuantityUnit(item, product);
        const quantity = getOrderItemQuantityValue(item);
        if (quantity > 0 && isSameInventoryUnit(stockUnit, itemUnit)) {
          soldByProductId.set(productId, (soldByProductId.get(productId) || 0) + quantity);
        }
        revenueByProductId.set(productId, (revenueByProductId.get(productId) || 0) + getOrderItemRevenue(item));
        costByProductId.set(productId, (costByProductId.get(productId) || 0) + getOrderItemCost(item, product));
      });
    });

  const productRows = (products || [])
    .filter(product => !product?.isArchived)
    .map(product => {
      const openingStock = getProductOpeningStock(product);
      const balance = stockBalances?.get(product) || null;
      const soldQuantity = balance ? balance.outgoing : soldByProductId.get(product.id) || 0;
      const remainingStock = balance ? balance.remaining : Math.max(0, openingStock - soldQuantity);
      const stockUnit = getProductInventoryUnit(product);
      const costPrice = parseLooseMoneyValue(product.costPrice);
      const stockValue = remainingStock * costPrice;
      const soldCost = costByProductId.get(product.id) || 0;
      const revenue = revenueByProductId.get(product.id) || 0;
      return {
        ...product,
        inventoryGroup: getProductMainGroupLabel(product, product.name),
        stockUnit,
        openingStock,
        soldQuantity,
        remainingStock,
        stockValue,
        soldCost,
        revenue,
        grossProfit: revenue - soldCost
      };
    });

  const groupRows = Array.from(productRows.reduce((acc, product) => {
    const groupKey = `${product.inventoryGroup || 'Chưa phân nhóm'}__${normalizeInventoryUnitKey(product.stockUnit)}`;
    const current = acc.get(groupKey) || {
      key: groupKey,
      label: product.inventoryGroup || 'Chưa phân nhóm',
      unit: product.stockUnit || 'Đơn vị',
      productCount: 0,
      openingStock: 0,
      soldQuantity: 0,
      remainingStock: 0,
      stockValue: 0,
      revenue: 0,
      soldCost: 0,
      grossProfit: 0
    };
    current.productCount += 1;
    current.openingStock += product.openingStock || 0;
    current.soldQuantity += product.soldQuantity || 0;
    current.remainingStock += product.remainingStock || 0;
    current.stockValue += product.stockValue || 0;
    current.revenue += product.revenue || 0;
    current.soldCost += product.soldCost || 0;
    current.grossProfit += product.grossProfit || 0;
    acc.set(groupKey, current);
    return acc;
  }, new Map()).values()).sort((a, b) => {
    if ((b.stockValue || 0) !== (a.stockValue || 0)) return (b.stockValue || 0) - (a.stockValue || 0);
    return (a.label || '').localeCompare(b.label || '', 'vi');
  });

  const totals = productRows.reduce((acc, product) => {
    acc.openingStock += product.openingStock || 0;
    acc.soldQuantity += product.soldQuantity || 0;
    acc.remainingStock += product.remainingStock || 0;
    acc.stockValue += product.stockValue || 0;
    acc.revenue += product.revenue || 0;
    acc.soldCost += product.soldCost || 0;
    acc.grossProfit += product.grossProfit || 0;
    if ((product.openingStock || 0) > 0) acc.trackedProducts += 1;
    if ((product.remainingStock || 0) <= 0 && (product.openingStock || 0) > 0) acc.outOfStockProducts += 1;
    return acc;
  }, { openingStock: 0, soldQuantity: 0, remainingStock: 0, stockValue: 0, revenue: 0, soldCost: 0, grossProfit: 0, trackedProducts: 0, outOfStockProducts: 0 });

  return { productRows, groupRows, totals };
}