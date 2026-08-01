// Unit helpers are intentionally data-only so order totals remain quantity x unit price.
export const PRODUCT_PRICING_UNIT_OPTIONS = ['Kg', 'Cái', 'Con', 'Thùng', 'Can', 'Bọc', 'Bao', 'Chai', 'Hộp', 'Túi'];

const normalizeText = (value = '') => `${value || ''}`
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const parseMoney = (value = 0) => {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : 0;
  const normalized = `${value || ''}`.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

export const normalizeProductPricingUnit = (value = '') => {
  const raw = `${value || ''}`.trim();
  if (!raw) return '';
  const normalized = normalizeText(raw);
  const exact = PRODUCT_PRICING_UNIT_OPTIONS.find(option => normalizeText(option) === normalized);
  if (exact) return exact;
  const alias = PRODUCT_PRICING_UNIT_OPTIONS.find((option) => {
    const optionKey = normalizeText(option);
    return optionKey && (optionKey.includes(normalized) || normalized.includes(optionKey));
  });
  return alias || raw;
};

export const getProductPricingUnits = (productOrUnit = {}, fallback = '') => {
  const rawUnit = typeof productOrUnit === 'string'
    ? productOrUnit
    : (productOrUnit?.unit || productOrUnit?.quantityUnit || productOrUnit?.defaultUnit || '');
  const pieces = `${rawUnit || ''}`
    .replace(/\s+(?:và|va)\s+/gi, ',')
    .split(/[;,/&+|\n]+/)
    .map(normalizeProductPricingUnit)
    .filter(Boolean);
  const unique = [];
  const keys = new Set();
  const unitsToUse = pieces.length > 0 ? pieces : [normalizeProductPricingUnit(fallback)];
  unitsToUse.filter(Boolean).forEach((unit) => {
    const key = normalizeText(unit);
    if (!keys.has(key)) {
      keys.add(key);
      unique.push(unit);
    }
  });
  return unique;
};

export const getProductPrimaryPricingUnit = (productOrUnit = {}, fallback = 'Con') => (
  getProductPricingUnits(productOrUnit, fallback)[0] || normalizeProductPricingUnit(fallback) || fallback
);

export const normalizeUnitPriceMap = (source = {}) => {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  return Object.entries(source).reduce((result, [unit, price]) => {
    const normalizedUnit = normalizeProductPricingUnit(unit);
    const normalizedPrice = parseMoney(price);
    if (normalizedUnit && normalizedPrice > 0) result[normalizedUnit] = normalizedPrice;
    return result;
  }, {});
};

export const getUnitPriceFromMap = (source = {}, unit = '') => {
  const target = normalizeText(normalizeProductPricingUnit(unit));
  if (!target) return 0;
  const entry = Object.entries(normalizeUnitPriceMap(source))
    .find(([savedUnit]) => normalizeText(savedUnit) === target);
  return entry ? parseMoney(entry[1]) : 0;
};

export const putUnitPriceIntoMap = (source = {}, unit = '', price = 0) => {
  const normalizedUnit = normalizeProductPricingUnit(unit);
  const normalizedPrice = parseMoney(price);
  const next = normalizeUnitPriceMap(source);
  if (normalizedUnit && normalizedPrice > 0) next[normalizedUnit] = normalizedPrice;
  return next;
};

export const resolveProductUnitPrice = ({ product = {}, customerConfig = null, unit = '' } = {}) => {
  const primaryUnit = getProductPrimaryPricingUnit(product, 'Con');
  const requestedUnit = normalizeProductPricingUnit(unit || customerConfig?.defaultUnit || primaryUnit);
  const customerUnitPrice = getUnitPriceFromMap(customerConfig?.unitPrices, requestedUnit);
  if (customerUnitPrice > 0) return customerUnitPrice;

  const productUnitPrice = getUnitPriceFromMap(product?.unitPrices, requestedUnit);
  if (productUnitPrice > 0) return productUnitPrice;

  const legacyCustomerPrice = parseMoney(customerConfig?.price ?? customerConfig?.unitPrice ?? customerConfig?.sellingPrice);
  const configuredUnit = normalizeProductPricingUnit(customerConfig?.defaultUnit || primaryUnit);
  if (legacyCustomerPrice > 0 && normalizeText(configuredUnit) === normalizeText(requestedUnit)) return legacyCustomerPrice;

  const legacyProductPrice = parseMoney(product?.sellingPrice ?? product?.price);
  return legacyProductPrice > 0 && normalizeText(primaryUnit) === normalizeText(requestedUnit) ? legacyProductPrice : 0;
};
