import { normalizeProductPricingUnit } from '../services/productPricingUnits.js';

export const measureQuantity = (record = {}, unit = '') => {
  const key = normalizeProductPricingUnit(unit).toLowerCase();
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const weight = record.totalKg ?? record.weightKg ?? record.kg ?? record.actualWeightKg ?? record.weight;
  const quantity = record.quantity ?? record.totalQuantity ?? record.qty ?? record.pieceCount ?? record.quantityCount;
  if (key === 'kg' && weight != null) return number(weight);
  if (quantity != null && normalizeProductPricingUnit(record.quantityUnit || record.unit || 'Con').toLowerCase() === key) {
    return number(quantity);
  }
  const measure = [...(record.measures || []), ...(record.extraMeasures || [])]
    .find(item => normalizeProductPricingUnit(item.unit).toLowerCase() === key);
  return measure ? number(measure.quantity) : 0;
};

export const purchaseAmount = (record = {}, unit = 'Kg') => (
  measureQuantity(record, unit) * (Number(record.unitPrice) || 0)
);

export const productStockBalance = (product, imports = [], dispatches = [], untilDate = '') => {
  const unit = product.stockUnit || product.inventoryUnit || product.unit;
  const total = records => records.filter(record => !record.isArchived && (!untilDate || `${record.date || ''}` <= untilDate))
    .reduce((sum, record) => sum + (record.items || [record]).reduce((value, item) => (
      value + (item.productId === product.id ? measureQuantity(item, unit) : 0)
    ), 0), 0);
  const incoming = total(imports);
  const outgoing = total(dispatches);
  return { incoming, outgoing, remaining: (Number(product.stockQuantity ?? product.openingStock ?? product.inventoryQuantity ?? product.stock) || 0) + incoming - outgoing };
};
