import {
  PRODUCT_PRICING_UNIT_OPTIONS,
  getProductPricingUnits,
  getProductPrimaryPricingUnit,
  normalizeProductPricingUnit,
} from './productPricingUnits.js';

const normalizeText = (value = '') => `${value || ''}`
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const parsePositiveQuantity = (value = 0) => {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : 0;
  const raw = `${value || ''}`.replace(/[^0-9,.-]/g, '');
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const parsePositiveMoney = (value = 0) => {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : 0;
  const normalized = `${value || ''}`.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const sameUnit = (left = '', right = '') => (
  normalizeText(normalizeProductPricingUnit(left)) === normalizeText(normalizeProductPricingUnit(right))
);

const stableHash = (value = '') => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const safeIdPart = (value = '') => encodeURIComponent(`${value || ''}`.trim()).slice(0, 180);

export const buildCustomerProductPreferenceId = ({ companyId = '', customerId = '', productId = '' } = {}) => {
  const rawKey = `${companyId || ''}|${customerId || ''}|${productId || ''}`;
  return `${safeIdPart(companyId)}__${safeIdPart(customerId)}__${safeIdPart(productId)}__${stableHash(rawKey)}`;
};

export const buildCustomerProductPreferenceCacheKey = (identity = {}) => (
  buildCustomerProductPreferenceId(identity)
);

export const normalizeCustomerProductPreference = (source = {}) => ({
  id: `${source?.id || ''}`.trim(),
  companyId: `${source?.companyId || ''}`.trim(),
  customerId: `${source?.customerId || ''}`.trim(),
  productId: `${source?.productId || ''}`.trim(),
  defaultInputUnit: normalizeProductPricingUnit(
    source?.defaultInputUnit || source?.defaultUnit || source?.preferredInputUnit || ''
  ),
  lastInputUnit: normalizeProductPricingUnit(
    source?.lastInputUnit || source?.lastUnit || source?.defaultInputUnit || source?.defaultUnit || ''
  ),
  updatedAt: source?.updatedAt || '',
  updatedByEmpId: `${source?.updatedByEmpId || ''}`.trim(),
});

export const shouldOfferDefaultInputUnitUpdate = ({ preference = null, nextInputUnit = '' } = {}) => {
  const current = normalizeCustomerProductPreference(preference || {});
  const nextUnit = normalizeProductPricingUnit(nextInputUnit);
  return Boolean(current.defaultInputUnit && nextUnit && !sameUnit(current.defaultInputUnit, nextUnit));
};

export const buildCustomerProductPreferenceWrite = ({
  identity = {},
  existingPreference = null,
  inputUnit = '',
  updateDefault = false,
  updatedAt = new Date().toISOString(),
  updatedByEmpId = '',
} = {}) => {
  const current = normalizeCustomerProductPreference(existingPreference || {});
  const normalizedInputUnit = normalizeProductPricingUnit(inputUnit);
  const defaultInputUnit = current.defaultInputUnit
    ? (updateDefault && normalizedInputUnit ? normalizedInputUnit : current.defaultInputUnit)
    : normalizedInputUnit;
  const normalizedIdentity = {
    companyId: `${identity?.companyId || current.companyId || ''}`.trim(),
    customerId: `${identity?.customerId || current.customerId || ''}`.trim(),
    productId: `${identity?.productId || current.productId || ''}`.trim(),
  };
  const id = buildCustomerProductPreferenceId(normalizedIdentity);
  return {
    id,
    ...normalizedIdentity,
    defaultInputUnit,
    lastInputUnit: normalizedInputUnit || current.lastInputUnit || defaultInputUnit,
    updatedAt,
    updatedByEmpId: `${updatedByEmpId || ''}`.trim(),
  };
};

export const resolveRememberedInputUnit = ({
  preference = null,
  availableUnits = [],
  pricingUnit = '',
  product = null,
  fallback = 'Con',
} = {}) => {
  const normalizedPreference = normalizeCustomerProductPreference(preference || {});
  const normalizedAvailableUnits = (Array.isArray(availableUnits) ? availableUnits : [])
    .map(normalizeProductPricingUnit)
    .filter(Boolean);
  const candidates = [
    normalizedPreference.defaultInputUnit,
    normalizedPreference.lastInputUnit,
    normalizeProductPricingUnit(pricingUnit),
    getProductPrimaryPricingUnit(product || {}, fallback),
    normalizeProductPricingUnit(fallback),
  ].filter(Boolean);
  if (normalizedAvailableUnits.length === 0) return candidates[0] || fallback;
  return candidates.find(candidate => normalizedAvailableUnits.some(unit => sameUnit(unit, candidate)))
    || normalizedAvailableUnits[0];
};

export const getOrderInputUnitOptions = ({
  product = null,
  pricingUnit = '',
  currentUnit = '',
  rememberedUnit = '',
  fallback = 'Con',
} = {}) => {
  const normalizedPricingUnit = normalizeProductPricingUnit(pricingUnit);
  const usesWeightPricing = sameUnit(normalizedPricingUnit, 'Kg');
  const productUnits = getProductPricingUnits(product || {}, '');
  const candidates = usesWeightPricing
    ? [
        currentUnit,
        rememberedUnit,
        ...productUnits,
        fallback,
        'Con',
        'Kg',
        ...PRODUCT_PRICING_UNIT_OPTIONS,
      ]
    : [
        normalizedPricingUnit,
        currentUnit,
        rememberedUnit,
        ...productUnits,
        fallback,
      ];
  const uniqueUnits = [];

  candidates
    .map(normalizeProductPricingUnit)
    .filter(Boolean)
    .forEach((unit) => {
      if (!usesWeightPricing && normalizedPricingUnit && !sameUnit(unit, normalizedPricingUnit)) return;
      if (!uniqueUnits.some(existingUnit => sameUnit(existingUnit, unit))) uniqueUnits.push(unit);
    });

  return uniqueUnits.length > 0
    ? uniqueUnits
    : [normalizedPricingUnit || normalizeProductPricingUnit(fallback)].filter(Boolean);
};

export const resolvePricingQuantity = ({
  pricingUnit = '',
  inputUnit = '',
  inputQuantity = 0,
  actualWeightKg = 0,
  actualQuantity = 0,
  actualQuantityUnit = '',
} = {}) => {
  const normalizedPricingUnit = normalizeProductPricingUnit(pricingUnit);
  const normalizedInputUnit = normalizeProductPricingUnit(inputUnit);
  const normalizedActualUnit = normalizeProductPricingUnit(actualQuantityUnit);
  const weight = parsePositiveQuantity(actualWeightKg);
  const actual = parsePositiveQuantity(actualQuantity);
  const entered = parsePositiveQuantity(inputQuantity);

  if (sameUnit(normalizedPricingUnit, 'Kg')) {
    if (weight > 0) return { quantity: weight, source: 'actualWeightKg', isPending: false };
    if (sameUnit(normalizedInputUnit, 'Kg') && entered > 0) {
      return { quantity: entered, source: 'inputQuantity', isPending: false };
    }
    return { quantity: 0, source: 'missingActualWeightKg', isPending: true };
  }

  if (actual > 0 && (!normalizedActualUnit || sameUnit(normalizedActualUnit, normalizedPricingUnit))) {
    return { quantity: actual, source: 'actualQuantity', isPending: false };
  }
  if (sameUnit(normalizedInputUnit, normalizedPricingUnit) && entered > 0) {
    return { quantity: entered, source: 'inputQuantity', isPending: false };
  }
  return { quantity: 0, source: 'missingActualQuantity', isPending: true };
};

export const calculatePricingAmount = ({ unitPrice = 0, ...quantityInput } = {}) => {
  const pricingQuantity = resolvePricingQuantity(quantityInput);
  const normalizedUnitPrice = parsePositiveMoney(unitPrice);
  return {
    ...pricingQuantity,
    unitPrice: normalizedUnitPrice,
    amount: Math.round(pricingQuantity.quantity * normalizedUnitPrice),
  };
};
