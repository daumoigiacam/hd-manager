// Frozen formula from candidate 8b5d905d, before cooperative changes.
export default ({
  productFormulas = [],
  products = [],
  orders = [],
  latestInputsByGroup = {},
  marginByGroup = {},
  fallbackMargin = 20,
} = {}) => {
  const productById = new Map((Array.isArray(products) ? products : [])
    .map(product => [getPricingProductId(product), product])
    .filter(([id]) => id));

  return normalizePricingProductFormulas(productFormulas).map((formula) => {
    const rootProduct = productById.get(formula.rootProductId) || {};
    const rootProductName = formula.rootProductName || getPricingProductName(rootProduct, 'Sản phẩm gốc');
    const rootGroupKey = formula.rootGroupKey || getPricingProductGroupKey(rootProduct) || inferPricingGroupKeyFromText(rootProductName);
    const latestInput = latestInputsByGroup?.[rootGroupKey] || {};
    const inputCostPerKg = parseLooseMoneyValue(latestInput?.rawKgPrice || latestInput?.pricePerKg || latestInput?.unitPrice);
    const averageKg = parseLooseQuantityValue(latestInput?.averageKg) || (
      parseLooseQuantityValue(latestInput?.totalKg) > 0 && parseLooseQuantityValue(latestInput?.quantity) > 0
        ? parseLooseQuantityValue(latestInput.totalKg) / parseLooseQuantityValue(latestInput.quantity)
        : 0
    );
    const targetMargin = getPricingGroupMargin(marginByGroup, rootGroupKey, fallbackMargin);
    const children = normalizePricingProductFormulaChildren(formula.children).map((child) => {
      const childProduct = productById.get(child.productId) || {};
      const productName = child.productName || getPricingProductName(childProduct, 'Sản phẩm phụ');
      const outputRatioPercent = parseLooseQuantityValue(child.outputRatioPercent);
      const lossPercent = parseLooseQuantityValue(child.lossPercent);
      const valueFactor = parseLooseQuantityValue(child.valueFactor) || 1;
      const usableRatio = Math.max(outputRatioPercent * (1 - lossPercent / 100), 0) / 100;
      return {
        ...child,
        productName,
        unit: child.unit || getPricingProductUnit(childProduct),
        outputRatioPercent,
        lossPercent,
        valueFactor,
        usableRatio,
        revenue: 0,
        quantity: 0,
        estimatedCost: 0,
      };
    });

    const usableWeightTotal = children.reduce((sum, child) => sum + (child.usableRatio * Math.max(child.valueFactor, 0.01)), 0);
    (Array.isArray(orders) ? orders : []).forEach(order => {
      const statusText = normalizeLookupText(order?.status || order?.state || '');
      if (order?.isArchived || statusText.includes('cancel') || statusText.includes('huy')) return;
      getPricingDocumentLineItems(order).forEach(line => {
        const childIndex = children.findIndex(child => matchesPricingFormulaChild(line, child, productById));
        if (childIndex < 0) return;
        const quantity = getPricingOrderLineQuantity(line);
        const revenue = getPricingOrderLineRevenue(line);
        children[childIndex].quantity += quantity;
        children[childIndex].revenue += revenue;
      });
    });

    const childrenWithCost = children.map(child => {
      const allocatedCostPerUnit = inputCostPerKg > 0 && usableWeightTotal > 0
        ? (inputCostPerKg * Math.max(child.valueFactor, 0.01)) / usableWeightTotal
        : 0;
      return {
        ...child,
        estimatedCost: child.quantity * allocatedCostPerUnit,
        allocatedCostPerUnit,
      };
    });
    const totalRevenue = childrenWithCost.reduce((sum, child) => sum + child.revenue, 0);
    const estimatedCost = childrenWithCost.reduce((sum, child) => sum + child.estimatedCost, 0);
    const estimatedProfit = totalRevenue - estimatedCost;
    const recoveredPercent = childrenWithCost.reduce((sum, child) => sum + child.usableRatio * 100, 0);

    return {
      ...formula,
      rootProductName,
      rootGroupKey,
      latestInput,
      inputCostPerKg,
      averageKg,
      targetMargin,
      recoveredPercent,
      lossPercent: Math.max(100 - recoveredPercent, 0),
      children: childrenWithCost,
      totalRevenue,
      estimatedCost,
      estimatedProfit,
      estimatedMargin: totalRevenue > 0 ? (estimatedProfit / totalRevenue) * 100 : 0,
    };
  });
};
