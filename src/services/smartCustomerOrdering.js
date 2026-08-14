import {
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

const parseConfiguredConversion = (value = 0) => parsePositiveQuantity(value);

const normalizeConversionKey = (value = '') => normalizeText(normalizeProductPricingUnit(value));

const buildConversionResult = (factor = 0, source = '') => ({
  factor: parseConfiguredConversion(factor),
  isConfigured: parseConfiguredConversion(factor) > 0,
  source,
});

const findConversionInText = ({ text = '', fromUnit = '', toUnit = '' } = {}) => {
  const normalizedFrom = normalizeConversionKey(fromUnit);
  const normalizedTo = normalizeConversionKey(toUnit);
  if (!normalizedFrom || !normalizedTo) return null;

  return `${text || ''}`
    .split(/[;\n|]+/)
    .map(entry => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const explicitTarget = entry.match(/^(.+?)\s*(?:->|to)\s*(.+?)\s*=\s*([0-9][0-9.,]*)\s*$/i);
      if (explicitTarget) {
        return {
          from: explicitTarget[1],
          to: explicitTarget[2],
          factor: explicitTarget[3],
          source: 'configured_text_target',
        };
      }
      const implicitTarget = entry.match(/^(.+?)\s*(?:=|:)\s*([0-9][0-9.,]*)\s*$/);
      if (implicitTarget) {
        return {
          from: implicitTarget[1],
          to: '',
          factor: implicitTarget[2],
          source: 'configured_text',
        };
      }
      return null;
    })
    .find((entry) => entry
      && normalizeConversionKey(entry.from) === normalizedFrom
      && (!entry.to || normalizeConversionKey(entry.to) === normalizedTo));
};

const findConversionInObject = ({ source = null, fromUnit = '', toUnit = '' } = {}) => {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const normalizedFrom = normalizeConversionKey(fromUnit);
  const normalizedTo = normalizeConversionKey(toUnit);
  if (!normalizedFrom || !normalizedTo) return null;

  for (const [rawKey, rawValue] of Object.entries(source)) {
    const normalizedKey = normalizeText(rawKey);
    const arrowMatch = `${rawKey}`.match(/^(.+?)\s*(?:->|to)\s*(.+?)$/i);
    if (arrowMatch) {
      if (
        normalizeConversionKey(arrowMatch[1]) === normalizedFrom
        && normalizeConversionKey(arrowMatch[2]) === normalizedTo
      ) {
        const factor = parseConfiguredConversion(rawValue?.factor ?? rawValue?.value ?? rawValue);
        if (factor > 0) return { factor, source: 'configured_object_target' };
      }
      continue;
    }

    if (normalizedKey !== normalizedFrom) continue;
    if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
      const targetValue = rawValue[toUnit] ?? rawValue[normalizedTo] ?? rawValue.factor ?? rawValue.value;
      const factor = parseConfiguredConversion(targetValue);
      if (factor > 0) return { factor, source: 'configured_object_nested' };
      continue;
    }
    const factor = parseConfiguredConversion(rawValue);
    if (factor > 0) return { factor, source: 'configured_object' };
  }
  return null;
};

const findConfiguredConversion = ({ source = null, fromUnit = '', toUnit = '' } = {}) => {
  if (Array.isArray(source)) {
    for (const entry of source) {
      if (!entry || typeof entry !== 'object') continue;
      const entryFrom = entry.fromUnit || entry.from || entry.orderUnit || entry.unit || '';
      const entryTo = entry.toUnit || entry.to || entry.pricingUnit || entry.billingUnit || '';
      if (
        normalizeConversionKey(entryFrom) === normalizeConversionKey(fromUnit)
        && (!entryTo || normalizeConversionKey(entryTo) === normalizeConversionKey(toUnit))
      ) {
        const factor = parseConfiguredConversion(entry.factor ?? entry.conversionFactor ?? entry.value);
        if (factor > 0) return { factor, source: 'configured_list' };
      }
    }
    return null;
  }
  if (typeof source === 'string') return findConversionInText({ text: source, fromUnit, toUnit });
  return findConversionInObject({ source, fromUnit, toUnit });
};

// A conversion is valid only when it is expressly configured. This prevents
// a count (for example Con) from ever being silently treated as Kg.
export const resolveUnitConversionFactor = ({
  fromUnit = '',
  toUnit = '',
  conversionFactor = 0,
  unitConversions = null,
  conversions = null,
} = {}) => {
  const normalizedFrom = normalizeProductPricingUnit(fromUnit);
  const normalizedTo = normalizeProductPricingUnit(toUnit);
  if (!normalizedFrom || !normalizedTo || sameUnit(normalizedFrom, normalizedTo)) {
    return buildConversionResult(0, '');
  }

  const directFactor = parseConfiguredConversion(conversionFactor);
  if (directFactor > 0) return buildConversionResult(directFactor, 'explicit_line_factor');

  const configured = findConfiguredConversion({
    source: unitConversions ?? conversions,
    fromUnit: normalizedFrom,
    toUnit: normalizedTo,
  });
  const configuredFactor = parseConfiguredConversion(configured?.factor);
  if (configuredFactor > 0) return buildConversionResult(configuredFactor, configured.source);

  if (unitConversions == null && conversions != null) {
    const fallbackConfigured = findConfiguredConversion({
      source: conversions,
      fromUnit: normalizedFrom,
      toUnit: normalizedTo,
    });
    const fallbackFactor = parseConfiguredConversion(fallbackConfigured?.factor);
    if (fallbackFactor > 0) return buildConversionResult(fallbackFactor, fallbackConfigured.source);
  }

  return buildConversionResult(0, '');
};

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
  catalogUnits = [],
  fallback = 'Con',
} = {}) => {
  const normalizedPricingUnit = normalizeProductPricingUnit(pricingUnit);
  const productUnits = getProductPricingUnits(product || {}, '');
  const normalizedCatalogUnits = Array.isArray(catalogUnits)
    ? catalogUnits
    : `${catalogUnits || ''}`.split(/[;,/&+|]/);
  const candidates = [
    currentUnit,
    rememberedUnit,
    ...productUnits,
    ...normalizedCatalogUnits,
    normalizedPricingUnit,
    fallback,
  ];
  const uniqueUnits = [];

  candidates
    .map(normalizeProductPricingUnit)
    .filter(Boolean)
    .forEach((unit) => {
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
  conversionFactor = 0,
  unitConversions = null,
  conversions = null,
} = {}) => {
  const normalizedPricingUnit = normalizeProductPricingUnit(pricingUnit);
  const normalizedInputUnit = normalizeProductPricingUnit(inputUnit);
  const normalizedActualUnit = normalizeProductPricingUnit(actualQuantityUnit);
  const weight = parsePositiveQuantity(actualWeightKg);
  const actual = parsePositiveQuantity(actualQuantity);
  const entered = parsePositiveQuantity(inputQuantity);
  const conversionInputUnit = normalizedInputUnit || normalizedActualUnit;
  const conversionInputQuantity = entered > 0 ? entered : actual;
  const conversion = resolveUnitConversionFactor({
    fromUnit: conversionInputUnit,
    toUnit: normalizedPricingUnit,
    conversionFactor,
    unitConversions,
    conversions,
  });
  const convertedQuantity = conversion.isConfigured && conversionInputQuantity > 0
    ? conversionInputQuantity * conversion.factor
    : 0;

  if (sameUnit(normalizedPricingUnit, 'Kg')) {
    if (weight > 0) return { quantity: weight, source: 'actualWeightKg', isPending: false };
    if (sameUnit(normalizedInputUnit, 'Kg') && entered > 0) {
      return { quantity: entered, source: 'inputQuantity', isPending: false };
    }
    if (convertedQuantity > 0) {
      return {
        quantity: convertedQuantity,
        source: 'configuredUnitConversion',
        isPending: false,
        conversionFactor: conversion.factor,
        conversionSource: conversion.source,
      };
    }
    return { quantity: 0, source: 'missingActualWeightKg', isPending: true };
  }

  if (actual > 0 && (!normalizedActualUnit || sameUnit(normalizedActualUnit, normalizedPricingUnit))) {
    return { quantity: actual, source: 'actualQuantity', isPending: false };
  }
  if (sameUnit(normalizedInputUnit, normalizedPricingUnit) && entered > 0) {
    return { quantity: entered, source: 'inputQuantity', isPending: false };
  }
  if (convertedQuantity > 0) {
    return {
      quantity: convertedQuantity,
      source: 'configuredUnitConversion',
      isPending: false,
      conversionFactor: conversion.factor,
      conversionSource: conversion.source,
    };
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
