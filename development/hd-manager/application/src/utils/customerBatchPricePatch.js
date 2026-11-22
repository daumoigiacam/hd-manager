import {resolveCustomerProductConfiguration, isSameBillingUnit} from '../services/customerProductBilling.js';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = message => Object.assign(new Error(message), {code: 'customer_batch_price_invalid'});

const overrideMap = source => Array.isArray(source)
  ? Object.fromEntries(source.filter(item => item && (item.productId || item.id))
    .map(item => [String(item.productId || item.id).trim(), item]))
  : (record(source) ? source : {});

// The caller supplies the normalized view it used, while raw records retain
// fields (especially variant metadata) intentionally omitted by normalization.
export function buildCustomerBatchPricePatch({
  customer = {}, product = {}, price, size = '', normalizedOverrides = {}, fingerprint,
} = {}) {
  const productId = String(product?.id || '').trim();
  if (!productId) throw invalid('Bạn hãy chọn sản phẩm cần áp giá.');
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    throw invalid('Giá mới phải là số hữu hạn lớn hơn 0.');
  }
  if (fingerprint !== undefined && (typeof fingerprint !== 'string' || !fingerprint.trim())) {
    throw invalid('Thiếu dấu đối chiếu cấu hình khách hàng đã chọn.');
  }

  const raw = overrideMap(customer?.priceOverrides || customer?.customPrices || {});
  const normalized = overrideMap(normalizedOverrides);
  const rawConfig = raw[productId];
  const current = {
    ...(record(normalized[productId]) ? normalized[productId] : {}),
    ...(record(rawConfig) ? rawConfig : {}),
  };
  const resolved = resolveCustomerProductConfiguration({customerConfig: current, product});
  const hasBaseUnit = current.pricingUnit || current.billingUnit || current.defaultUnit || current.quantityUnit || current.unit;
  const hasBasePrice = Number(current.unitPrice ?? current.price ?? current.sellingPrice) > 0;
  if (resolved.isAmbiguous || (current.variants?.length && !hasBaseUnit && !hasBasePrice)) {
    throw invalid('Sản phẩm chỉ có cấu hình biến thể. Hãy chọn cấu hình giá cụ thể trước khi áp giá hàng loạt.');
  }

  const next = {...current, price};
  // The billing resolver prefers unitPrice over price; keep existing aliases aligned.
  for (const alias of ['unitPrice', 'sellingPrice']) {
    if (Object.hasOwn(current, alias)) next[alias] = price;
  }
  const cleanSize = String(size ?? '').trim();
  if (cleanSize) {
    next.size = cleanSize;
    if (Object.hasOwn(current, 'sizeLabel')) next.sizeLabel = cleanSize;
  }

  for (const field of ['unitPrices', 'pricesByUnit', 'priceByUnit']) {
    const normalizedMap = normalized[productId]?.[field];
    const rawMap = record(rawConfig) ? rawConfig[field] : undefined;
    if (!record(normalizedMap) && !record(rawMap)) continue;
    const map = {...(record(normalizedMap) ? normalizedMap : {}), ...(record(rawMap) ? rawMap : {})};
    // Update only existing keys for the resolved primary unit, including aliases.
    // Other order-unit prices and all variant prices keep their own policy.
    next[field] = Object.fromEntries(Object.entries(map).map(([unit, value]) => [
      unit, isSameBillingUnit(unit, resolved.pricingUnit) ? price : value,
    ]));
  }

  return {
    priceOverrides: {...normalized, ...raw, [productId]: next},
    ...(fingerprint === undefined ? {} : {__customerConfigBase: fingerprint}),
  };
}
