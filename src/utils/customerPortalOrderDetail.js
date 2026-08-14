import {
  isSameBillingUnit,
  resolveTransactionBillingSnapshot,
} from '../services/customerProductBilling.js';
import { normalizeProductPricingUnit } from '../services/productPricingUnits.js';

const parseQuantity = (value = 0) => {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : 0;
  const raw = `${value || ''}`.replace(/\s+/g, '').replace(',', '.');
  const matched = raw.match(/-?\d+(?:\.\d+)?/);
  return matched ? Math.max(0, Number(matched[0]) || 0) : 0;
};

const parseMoney = (value = 0) => {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  const digits = `${value || ''}`.replace(/[^\d]/g, '');
  return digits ? Number.parseInt(digits, 10) : 0;
};

const firstPositiveQuantity = (...values) => values
  .map(parseQuantity)
  .find(value => value > 0) || 0;

const firstPositiveMoney = (...values) => values
  .map(parseMoney)
  .find(value => value > 0) || 0;

const getLineActualQuantity = (line = {}) => firstPositiveQuantity(
  line.actualQuantity,
  line.quantity,
  line.quantityValue,
  line.quantityCount,
  line.pieceCount,
  line.count,
  line.qty,
);

const getLineActualWeightKg = (line = {}) => firstPositiveQuantity(
  line.actualWeightKg,
  line.weightKg,
  line.totalKg,
  line.kg,
  isSameBillingUnit(line.actualUnit || line.quantityUnit || line.unit, 'Kg') ? line.quantity : 0,
);

const getLineUnitPrice = (line = {}) => firstPositiveMoney(
  line.unitPrice,
  line.price,
  line.sellingPrice,
  line.salePrice,
  line.finalPrice,
  line.unitPriceVnd,
  line.unit_price_vnd,
  line.unit_price,
);

const getLineStoredAmount = (line = {}) => firstPositiveMoney(
  line.amount,
  line.pricingAmount,
  line.lineTotal,
  line.totalAmount,
  line.itemTotal,
  line.subtotal,
  line.total,
);

const getLineProductName = (line = {}, order = {}, allowOrderFallback = false) => {
  const lineName = [
    line.productNameSnapshot,
    line.productName,
    line.name,
    line.title,
    line.description,
    line.product?.name,
    line.product?.productName,
    line.productLabel,
    line.shortName,
  ].find(value => `${value || ''}`.trim());
  if (lineName) return `${lineName}`.trim();

  if (allowOrderFallback) {
    const orderName = [
      order.productNameSnapshot,
      order.productName,
      order.name,
      order.title,
      order.description,
      order.product?.name,
      order.productLabel,
      order.shortName,
    ].find(value => `${value || ''}`.trim());
    if (orderName) return `${orderName}`.trim();
  }

  return 'Sản phẩm chưa có tên';
};

const getSourceLines = (order = {}) => {
  const collection = [order.items, order.orderItems, order.lines, order.details]
    .find(value => Array.isArray(value) && value.length > 0);
  if (collection) {
    return {
      lines: collection.filter(Boolean),
      source: 'collection',
    };
  }

  if (order.primaryItem) {
    return {
      lines: [order.primaryItem],
      source: 'primary-item',
    };
  }

  return {
    lines: [order].filter(Boolean),
    source: 'order',
  };
};

// Keep the selection separate from the order object so a realtime update can
// replace its data without leaving fields from the previously opened order.
export const getCustomerPortalOrderSelection = (order = {}) => {
  const type = `${order.type || ''}`.trim().toLowerCase() === 'request' ? 'request' : 'order';
  const id = [
    order.id,
    order.orderId,
    order.orderCode,
    order.code,
    order.requestCode,
    order.customerOrderRootId,
    order.sourceCustomerRequestId,
    order.clientRequestId,
  ]
    .map(value => `${value ?? ''}`.trim())
    .find(Boolean);

  return id ? { type, id } : null;
};

export const resolveCustomerPortalOrderSelection = (items = [], selection = null) => {
  if (!selection?.id) return null;
  return (Array.isArray(items) ? items : []).find((item) => {
    const candidate = getCustomerPortalOrderSelection(item);
    return candidate?.type === selection.type && candidate.id === selection.id;
  }) || null;
};

const getLineRecord = ({ order = {}, line = {}, allowOrderMetadata = false } = {}) => {
  if (!allowOrderMetadata || line === order) return line || {};

  // A primary-item fallback may inherit product metadata from its legacy parent,
  // but never any order-wide monetary field.
  const {
    amount: _amount,
    pricingAmount: _pricingAmount,
    lineTotal: _lineTotal,
    totalAmount: _totalAmount,
    itemTotal: _itemTotal,
    subtotal: _subtotal,
    total: _total,
    ...orderMetadata
  } = order;
  return { ...orderMetadata, ...line };
};

const getDisplayBillingQuantity = ({ line = {}, snapshot = {}, actualQuantity = 0, actualUnit = '', billingUnit = '' } = {}) => {
  const explicit = firstPositiveQuantity(snapshot.billingQuantity, line.billingQuantity, line.pricingQuantity);
  if (explicit > 0) return explicit;

  const actualWeightKg = firstPositiveQuantity(snapshot.actualWeightKg, getLineActualWeightKg(line));
  if (isSameBillingUnit(billingUnit, 'Kg')) return actualWeightKg;
  if (isSameBillingUnit(actualUnit, billingUnit)) return actualQuantity;

  const factor = firstPositiveQuantity(snapshot.conversionFactor, line.conversionFactor, line.unitConversionFactor);
  return factor > 0 && actualQuantity > 0 ? actualQuantity * factor : 0;
};

const isPricingPending = (line = {}, snapshot = {}) => Boolean(
  line.pricingPendingActual
  || snapshot.pricingPendingActual
  || snapshot.billingSnapshotError === 'MISSING_BILLING_QUANTITY'
);

export const getCustomerPortalOrderLines = (order = {}) => {
  const { lines: sourceLines, source } = getSourceLines(order);
  const isSingleLine = sourceLines.length === 1;

  return sourceLines.map((sourceLine, index) => {
    const line = getLineRecord({
      order,
      line: sourceLine,
      allowOrderMetadata: source === 'primary-item' && isSingleLine,
    });
    const snapshot = resolveTransactionBillingSnapshot({ record: line });
    const actualQuantity = firstPositiveQuantity(snapshot.actualQuantity, getLineActualQuantity(line), getLineActualWeightKg(line));
    const actualUnit = normalizeProductPricingUnit(
      snapshot.actualUnit
      || line.actualUnit
      || line.actualQuantityUnit
      || line.quantityUnit
      || line.unit
      || (getLineActualWeightKg(line) > 0 ? 'Kg' : '')
    );
    const billingUnit = normalizeProductPricingUnit(
      snapshot.billingUnit
      || line.billingUnit
      || line.pricingUnit
      || line.basePriceUnit
      || actualUnit
    );
    const billingQuantity = getDisplayBillingQuantity({
      line,
      snapshot,
      actualQuantity,
      actualUnit,
      billingUnit,
    });
    const unitPrice = firstPositiveMoney(snapshot.unitPrice, getLineUnitPrice(line));
    const storedAmount = getLineStoredAmount(line);
    const lineTotal = storedAmount || (
      !isPricingPending(line, snapshot) && billingQuantity > 0 && unitPrice > 0
        ? Math.round(billingQuantity * unitPrice)
        : 0
    );

    return {
      id: `${sourceLine.id || sourceLine.lineId || sourceLine.productId || 'line'}_${index}`,
      productName: getLineProductName(sourceLine, order, source !== 'collection' && isSingleLine),
      quantity: actualQuantity,
      unit: actualUnit,
      actualWeightKg: firstPositiveQuantity(snapshot.actualWeightKg, getLineActualWeightKg(line)),
      billingQuantity,
      billingUnit,
      unitPrice,
      lineTotal,
      conversionFactor: firstPositiveQuantity(snapshot.conversionFactor, line.conversionFactor, line.unitConversionFactor),
      conversionSource: `${snapshot.conversionSource || line.conversionSource || ''}`.trim(),
      size: `${sourceLine.sizeLabel || sourceLine.size || sourceLine.attributeLabel || sourceLine.attribute || ''}`.trim(),
      branchId: sourceLine.branchId || sourceLine.customerBranchId || order.branchId || order.customerBranchId || '',
      branchName: sourceLine.branchName || sourceLine.customerBranchName || order.branchName || order.customerBranchName || '',
      branchAddress: sourceLine.branchAddress || sourceLine.customerBranchAddress || order.branchAddress || order.customerBranchAddress || '',
    };
  });
};

export const getCustomerPortalOrderTotal = (order = {}) => {
  const explicitTotal = parseMoney(order.totalAmount ?? order.finalTotal ?? order.total ?? order.amount ?? 0);
  if (explicitTotal > 0) return explicitTotal;
  return getCustomerPortalOrderLines(order).reduce((sum, line) => sum + line.lineTotal, 0);
};

export const getCustomerPortalLineConversion = (line = {}) => {
  const actualQuantity = parseQuantity(line.quantity);
  const billingQuantity = parseQuantity(line.billingQuantity);
  if (!actualQuantity || !billingQuantity || isSameBillingUnit(line.unit, line.billingUnit)) return null;

  const factor = parseQuantity(line.conversionFactor) || (billingQuantity / actualQuantity);
  if (!factor) return null;

  return {
    fromUnit: normalizeProductPricingUnit(line.unit),
    toUnit: normalizeProductPricingUnit(line.billingUnit),
    factor,
  };
};
