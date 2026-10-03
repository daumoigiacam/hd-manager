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

// Snapshot keyed by product object, so duplicate IDs retain their unit and opening stock.
// Rebuild explicitly when products, movements, or the cutoff change. Work is linear
// in products, records, items, and their measure entries; lookups are O(1).
export const buildProductStockBalanceIndex = (products = [], imports = [], dispatches = [], untilDate = '') => {
  const unitsById = new Map();
  const bucketsByProduct = new Map();
  const unitKey = unit => normalizeProductPricingUnit(unit).toLowerCase();
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

  products.forEach(product => {
    const key = unitKey(product.stockUnit || product.inventoryUnit || product.unit);
    // Map matches NaN keys, whereas the reference uses strict equality.
    if (Number.isNaN(product.id)) {
      bucketsByProduct.set(product, { incoming: 0, outgoing: 0 });
      return;
    }
    let units = unitsById.get(product.id);
    if (!units) {
      units = new Map();
      unitsById.set(product.id, units);
    }
    if (!units.has(key)) units.set(key, { incoming: 0, outgoing: 0 });
    bucketsByProduct.set(product, units.get(key));
  });

  const accumulate = (records, field) => records.forEach(record => {
    if (record.isArchived || !(!untilDate || `${record.date || ''}` <= untilDate)) return;
    const recordTotals = new Map();
    (record.items || [record]).forEach(item => {
      if (Number.isNaN(item.productId)) return;
      const units = unitsById.get(item.productId);
      if (!units) return;

      const quantities = new Map();
      const weight = item.totalKg ?? item.weightKg ?? item.kg ?? item.actualWeightKg ?? item.weight;
      const quantity = item.quantity ?? item.totalQuantity ?? item.qty ?? item.pieceCount ?? item.quantityCount;
      if (weight != null && units.has('kg')) quantities.set('kg', number(weight));
      if (quantity != null) {
        const key = unitKey(item.quantityUnit || item.unit || 'Con');
        if (units.has(key) && !quantities.has(key)) quantities.set(key, number(quantity));
      }
      // First matching measure wins, with primary quantity/weight taking precedence.
      const addMeasures = measures => {
        for (const measure of measures) {
          if (quantities.size === units.size) break;
          const key = unitKey(measure.unit);
          if (units.has(key) && !quantities.has(key)) quantities.set(key, number(measure.quantity));
        }
      };
      if (quantities.size < units.size) addMeasures(item.measures || []);
      if (quantities.size < units.size) addMeasures(item.extraMeasures || []);
      quantities.forEach((value, key) => {
        const bucket = units.get(key);
        recordTotals.set(bucket, (recordTotals.get(bucket) ?? 0) + value);
      });
    });
    // Preserve the reference's item subtotal, then record-total addition order.
    recordTotals.forEach((value, bucket) => { bucket[field] += value; });
  });
  accumulate(imports, 'incoming');
  accumulate(dispatches, 'outgoing');

  const index = new Map();
  products.forEach(product => {
    const { incoming, outgoing } = bucketsByProduct.get(product);
    const opening = Number(product.stockQuantity ?? product.openingStock ?? product.inventoryQuantity ?? product.stock) || 0;
    index.set(product, { incoming, outgoing, remaining: opening + incoming - outgoing });
  });
  return index;
};
