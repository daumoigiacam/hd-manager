import { getCustomerOrderMemoryTimestamp } from './customerOrderMemory.js';

// Only one previous order supplies suggestions; never merge older catalog memory.
export function getPreviousOrderSuggestions({ requests = [], customer, branchId = '', beforeDate, productLookup }) {
  if (!customer?.id || !beforeDate) return [];
  let latest = null;
  let latestDay = '';
  let latestTime = -1;
  const companyId = customer.companyId || customer.tenantId || '';
  for (const request of requests) {
    if (!request || request.customerId !== customer.id || request.isArchived
      || ['cancelled', 'canceled', 'rejected'].includes(request.status)) continue;
    const requestCompany = request.companyId || request.tenantId || '';
    if (companyId && requestCompany && companyId !== requestCompany) continue;
    if ((request.branchId || request.customerBranchId || '') !== branchId) continue;
    const day = String(request.requestDateKey || request.date || request.orderDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day >= beforeDate) continue;
    const time = getCustomerOrderMemoryTimestamp(request);
    if (day > latestDay || (day === latestDay && time >= latestTime)) {
      latest = request;
      latestDay = day;
      latestTime = time;
    }
  }
  const items = latest?.items || (latest?.primaryItem ? [latest.primaryItem] : []);
  const seen = new Set();
  return items.flatMap(item => {
    const product = productLookup.get(item.productId);
    if (!product || product.isArchived) return [];
    const variant = {
      previousOrder: true,
      id: item.configurationId || '',
      attributeLabel: item.attributeLabel ?? item.productAttribute ?? '',
      size: item.sizeLabel ?? item.weightKg ?? item.size ?? '',
      unit: item.billingUnit || item.pricingUnit || item.defaultUnit || item.quantityUnit || '',
      orderUnit: item.quantityUnit || item.actualUnit || item.orderUnit || '',
      price: item.unitPrice ?? item.price ?? '',
    };
    const key = JSON.stringify([product.id, variant.attributeLabel, variant.size, variant.unit, variant.orderUnit, variant.price]);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ product, variant }];
  });
}

export function previousOrderDraftFields(variant) {
  if (!variant?.previousOrder) return {};
  return {
    previousOrder: true,
    attributeLabel: variant.attributeLabel,
    weightKg: variant.size,
    unitPrice: variant.price,
    quantityUnit: variant.orderUnit || variant.unit,
    actualUnit: variant.orderUnit || variant.unit,
    pricingUnit: variant.unit,
    billingUnit: variant.unit,
    configurationId: variant.id,
  };
}
