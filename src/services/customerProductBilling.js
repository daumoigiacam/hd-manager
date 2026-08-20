import {
  getProductPricingUnits,
  getProductPrimaryPricingUnit,
  getUnitPriceFromMap,
  normalizeProductPricingUnit,
  normalizeUnitPriceMap,
  resolveProductUnitPrice,
} from './productPricingUnits.js';
import { resolveUnitConversionFactor } from './smartCustomerOrdering.js';

const normalizeText = (value = '') => `${value || ''}`
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const parsePositiveNumber = (value = 0) => {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : 0;
  const raw = `${value || ''}`.replace(/[^0-9,.-]/g, '');
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const firstPositiveNumber = (...values) => values
  .map(parsePositiveNumber)
  .find(value => value > 0) || 0;

const parseMoney = (value = 0) => {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : 0;
  const parsed = Number(`${value || ''}`.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

export const isSameBillingUnit = (left = '', right = '') => {
  const normalizedLeft = normalizeText(normalizeProductPricingUnit(left));
  const normalizedRight = normalizeText(normalizeProductPricingUnit(right));
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
};

const normalizeOrderUnits = (...sources) => {
  const units = [];
  sources
    .flatMap((source) => Array.isArray(source) ? source : `${source || ''}`.split(/[;,/&+|]/))
    .map(normalizeProductPricingUnit)
    .filter(Boolean)
    .forEach((unit) => {
      if (!units.some(existingUnit => isSameBillingUnit(existingUnit, unit))) units.push(unit);
    });
  return units;
};

const normalizeConfigurationVariant = (source = {}, fallbackId = '') => ({
  id: `${source?.id || source?.configurationId || source?.variantId || fallbackId || ''}`.trim(),
  sizeLabel: `${source?.sizeLabel ?? source?.size ?? source?.weightKg ?? ''}`.trim(),
  attributeLabel: `${source?.attributeLabel ?? source?.productAttribute ?? source?.attribute ?? source?.variant ?? ''}`.trim(),
  pricingUnit: normalizeProductPricingUnit(
    source?.pricingUnit || source?.billingUnit || source?.defaultUnit || source?.quantityUnit || source?.unit || ''
  ),
  unitPrice: parseMoney(source?.unitPrice ?? source?.price ?? source?.sellingPrice),
  unitPrices: normalizeUnitPriceMap(source?.unitPrices ?? source?.pricesByUnit ?? source?.priceByUnit ?? {}),
  orderUnits: source?.orderUnits ?? source?.allowedOrderUnits ?? source?.inputUnits ?? '',
  defaultOrderUnit: normalizeProductPricingUnit(
    source?.defaultOrderUnit || source?.orderUnit || source?.preferredOrderUnit || ''
  ),
  unitConversions: source?.unitConversions ?? source?.conversions ?? source?.conversion ?? '',
});

const configurationVariantMatches = (variant = {}, criteria = {}) => {
  const requestedId = `${criteria?.configurationId || criteria?.variantId || ''}`.trim();
  if (requestedId && variant.id === requestedId) return true;
  const requestedSize = normalizeText(criteria?.sizeLabel || criteria?.size || criteria?.weightKg || '');
  const requestedAttribute = normalizeText(criteria?.attributeLabel || criteria?.productAttribute || criteria?.attribute || '');
  if (!requestedSize && !requestedAttribute) return false;
  return (!requestedSize || normalizeText(variant.sizeLabel) === requestedSize)
    && (!requestedAttribute || normalizeText(variant.attributeLabel) === requestedAttribute);
};

const buildConfigurationId = ({ productId = '', variant = {}, pricingUnit = '' } = {}) => {
  if (variant.id) return variant.id;
  return [
    productId || 'product',
    normalizeText(variant.sizeLabel) || 'default',
    normalizeText(variant.attributeLabel) || 'default',
    normalizeText(pricingUnit) || 'unit',
  ].join('__');
};

export const resolveCustomerProductConfiguration = ({
  customerConfig = null,
  product = null,
  productId = '',
  configurationId = '',
  variantId = '',
  variant = null,
  sizeLabel = '',
  attributeLabel = '',
  fallbackUnit = '',
} = {}) => {
  const resolvedProduct = product || {};
  const resolvedProductId = `${productId || resolvedProduct.id || ''}`.trim();
  const hasCustomerConfig = Boolean(customerConfig && typeof customerConfig === 'object');
  const baseVariant = normalizeConfigurationVariant(customerConfig || {}, `${resolvedProductId || 'product'}_default`);
  const configuredVariants = (Array.isArray(customerConfig?.variants) ? customerConfig.variants : [])
    .map((item, index) => normalizeConfigurationVariant(item, `${resolvedProductId || 'product'}_variant_${index + 1}`));
  const explicitVariant = variant && typeof variant === 'object'
    ? normalizeConfigurationVariant(variant, `${resolvedProductId || 'product'}_selected`)
    : null;
  const matchCriteria = { configurationId, variantId, sizeLabel, attributeLabel };
  const matchedVariant = explicitVariant
    || configuredVariants.find(item => configurationVariantMatches(item, matchCriteria))
    || (configuredVariants.length === 1 && !baseVariant.pricingUnit && baseVariant.unitPrice <= 0 ? configuredVariants[0] : null);
  const selectedVariant = matchedVariant
    ? {
        ...baseVariant,
        ...matchedVariant,
        unitPrices: {
          ...baseVariant.unitPrices,
          ...matchedVariant.unitPrices,
        },
        orderUnits: matchedVariant.orderUnits || baseVariant.orderUnits,
        defaultOrderUnit: matchedVariant.defaultOrderUnit || baseVariant.defaultOrderUnit,
        unitConversions: matchedVariant.unitConversions || baseVariant.unitConversions,
      }
    : baseVariant;

  const configuredUnitPrices = normalizeUnitPriceMap(selectedVariant.unitPrices);
  const unitPriceKeys = Object.keys(configuredUnitPrices);
  const legacyPrimaryUnit = getProductPrimaryPricingUnit(resolvedProduct, fallbackUnit || 'Con');
  const pricingUnit = normalizeProductPricingUnit(
    selectedVariant.pricingUnit
    || (unitPriceKeys.length === 1 ? unitPriceKeys[0] : '')
    || legacyPrimaryUnit
  );
  const mappedPrice = getUnitPriceFromMap(configuredUnitPrices, pricingUnit);
  const unitPrice = mappedPrice
    || selectedVariant.unitPrice
    || resolveProductUnitPrice({
      product: resolvedProduct,
      customerConfig: hasCustomerConfig ? customerConfig : null,
      unit: pricingUnit,
    });
  const isAmbiguous = hasCustomerConfig
    && !matchedVariant
    && configuredVariants.length > 1
    && !baseVariant.pricingUnit
    && baseVariant.unitPrice <= 0;
  const source = hasCustomerConfig ? 'customer_fixed_product' : 'legacy_product';
  const productOrderUnits = getProductPricingUnits(resolvedProduct, '');
  const orderUnits = normalizeOrderUnits(
    selectedVariant.orderUnits,
    selectedVariant.defaultOrderUnit,
    productOrderUnits,
    pricingUnit,
  );
  const defaultOrderUnit = normalizeProductPricingUnit(
    selectedVariant.defaultOrderUnit || orderUnits[0] || pricingUnit
  );

  return {
    productId: resolvedProductId,
    productName: `${resolvedProduct.name || ''}`.trim(),
    configurationId: buildConfigurationId({ productId: resolvedProductId, variant: selectedVariant, pricingUnit }),
    sizeLabel: selectedVariant.sizeLabel,
    attributeLabel: selectedVariant.attributeLabel,
    pricingUnit,
    billingUnit: pricingUnit,
    unitPrice: parseMoney(unitPrice),
    orderUnits,
    defaultOrderUnit,
    unitConversions: selectedVariant.unitConversions || '',
    allowedUnits: pricingUnit ? [pricingUnit] : [],
    source,
    isCustomerConfigured: hasCustomerConfig,
    isAmbiguous,
    isValid: Boolean(resolvedProductId && pricingUnit && parseMoney(unitPrice) > 0 && !isAmbiguous),
    errorCode: isAmbiguous
      ? 'AMBIGUOUS_CUSTOMER_CONFIGURATION'
      : (!pricingUnit ? 'MISSING_PRICING_UNIT' : (parseMoney(unitPrice) <= 0 ? 'MISSING_UNIT_PRICE' : '')),
  };
};

export const isCustomerProductUnitAllowed = (configuration = null, unit = '') => {
  if (!configuration || !unit) return false;
  return (configuration.allowedUnits || [configuration.billingUnit || configuration.pricingUnit])
    .filter(Boolean)
    .some(allowedUnit => isSameBillingUnit(allowedUnit, unit));
};

export const resolveCustomerProductActualUnit = (configuration = null, product = null) => {
  const billingUnit = normalizeProductPricingUnit(configuration?.billingUnit || configuration?.pricingUnit || '');
  const productUnit = getProductPrimaryPricingUnit(product || {}, billingUnit || 'Con');
  if (isSameBillingUnit(billingUnit, 'Kg') && productUnit && !isSameBillingUnit(productUnit, 'Kg')) {
    return productUnit;
  }
  return billingUnit || productUnit;
};

export const isWarehouseDispatchActualUnitCompatible = ({
  expectedActualUnit = '',
  actualUnit = '',
  billingUnit = '',
  actualWeightKg = 0,
} = {}) => {
  if (!expectedActualUnit || isSameBillingUnit(expectedActualUnit, actualUnit)) return true;

  // Count and weight describe two different facts for weight-priced products.
  // The measured Kg is authoritative for billing; the count unit remains useful
  // for warehouse reconciliation and therefore does not need to match "Kg".
  return isSameBillingUnit(billingUnit, 'Kg') && parsePositiveNumber(actualWeightKg) > 0;
};

export const calculateBillableAmount = ({
  configuration = null,
  actualQuantity = 0,
  actualUnit = '',
  orderUnit = '',
  actualWeightKg = 0,
  billingQuantity = 0,
  billingUnit = '',
  unitPrice = 0,
  conversionFactor = 0,
  unitConversions = null,
  conversions = null,
} = {}) => {
  const resolvedBillingUnit = normalizeProductPricingUnit(
    billingUnit || configuration?.billingUnit || configuration?.pricingUnit || ''
  );
  const resolvedOrderUnit = normalizeProductPricingUnit(orderUnit || actualUnit || resolvedBillingUnit);
  const resolvedActualUnit = normalizeProductPricingUnit(actualUnit || resolvedOrderUnit || resolvedBillingUnit);
  const resolvedUnitPrice = parseMoney(unitPrice || configuration?.unitPrice);
  const parsedActualQuantity = parsePositiveNumber(actualQuantity);
  const parsedActualWeightKg = parsePositiveNumber(actualWeightKg);
  const explicitBillingQuantity = parsePositiveNumber(billingQuantity);
  const usesWeightPricing = isSameBillingUnit(resolvedBillingUnit, 'Kg');
  const unitMismatch = Boolean(
    resolvedOrderUnit
    && resolvedBillingUnit
    && !isSameBillingUnit(resolvedOrderUnit, resolvedBillingUnit)
  );
  const conversion = unitMismatch
    ? resolveUnitConversionFactor({
        fromUnit: resolvedOrderUnit,
        toUnit: resolvedBillingUnit,
        conversionFactor,
        unitConversions: unitConversions ?? configuration?.unitConversions,
        conversions: conversions ?? configuration?.conversions,
      })
    : { factor: 0, isConfigured: false, source: '' };
  const hasConfiguredConversion = conversion.isConfigured && conversion.factor > 0;
  const convertedQuantity = hasConfiguredConversion && parsedActualQuantity > 0
    ? parsedActualQuantity * conversion.factor
    : 0;
  const resolvedBillingQuantity = explicitBillingQuantity > 0
    ? explicitBillingQuantity
    : (usesWeightPricing
      ? (parsedActualWeightKg > 0
        ? parsedActualWeightKg
        : (isSameBillingUnit(resolvedOrderUnit, resolvedBillingUnit) ? parsedActualQuantity : convertedQuantity))
      : (isSameBillingUnit(resolvedOrderUnit, resolvedBillingUnit) ? parsedActualQuantity : convertedQuantity));
  const hasUnresolvedNonWeightMismatch = !usesWeightPricing && unitMismatch && !hasConfiguredConversion;
  const errorCode = !resolvedBillingUnit
    ? 'MISSING_BILLING_UNIT'
    : (resolvedUnitPrice <= 0
      ? 'MISSING_UNIT_PRICE'
      : (hasUnresolvedNonWeightMismatch
        ? 'ACTUAL_UNIT_NOT_ALLOWED'
        : (resolvedBillingQuantity <= 0 ? 'MISSING_BILLING_QUANTITY' : '')));

  return {
    actualQuantity: parsedActualQuantity,
    actualUnit: resolvedActualUnit,
    orderUnit: resolvedOrderUnit,
    actualWeightKg: parsedActualWeightKg,
    billingQuantity: resolvedBillingQuantity,
    billingUnit: resolvedBillingUnit,
    unitPrice: resolvedUnitPrice,
    amount: errorCode ? 0 : Math.round(resolvedBillingQuantity * resolvedUnitPrice),
    usesWeightPricing,
    conversionFactor: hasConfiguredConversion ? conversion.factor : 0,
    conversionSource: hasConfiguredConversion ? conversion.source : '',
    isPending: errorCode === 'MISSING_BILLING_QUANTITY',
    isValid: !errorCode,
    errorCode,
  };
};

export const buildCustomerProductBillingSnapshot = ({
  configuration = null,
  product = null,
  productId = '',
  productName = '',
  sizeLabel = '',
  attributeLabel = '',
  ...quantityInput
} = {}) => {
  const calculation = calculateBillableAmount({ configuration, ...quantityInput });
  const resolvedProductId = `${productId || configuration?.productId || product?.id || ''}`.trim();
  const resolvedProductName = `${productName || configuration?.productName || product?.name || ''}`.trim();
  const resolvedSize = `${sizeLabel || configuration?.sizeLabel || ''}`.trim();
  const resolvedAttribute = `${attributeLabel || configuration?.attributeLabel || ''}`.trim();

  return {
    productId: resolvedProductId,
    productName: resolvedProductName,
    productNameSnapshot: resolvedProductName,
    configurationId: `${configuration?.configurationId || ''}`.trim(),
    sizeLabel: resolvedSize,
    attributeLabel: resolvedAttribute,
    actualQuantity: calculation.actualQuantity,
    actualUnit: calculation.actualUnit,
    orderUnit: calculation.orderUnit,
    actualWeightKg: calculation.actualWeightKg,
    billingQuantity: calculation.billingQuantity,
    billingUnit: calculation.billingUnit,
    basePriceUnit: calculation.billingUnit,
    unitPrice: calculation.unitPrice,
    conversionFactor: calculation.conversionFactor || 0,
    conversionSource: calculation.conversionSource || '',
    unitConversions: quantityInput.unitConversions
      ?? quantityInput.conversions
      ?? configuration?.unitConversions
      ?? configuration?.conversions
      ?? '',
    amount: calculation.amount,
    quantity: calculation.actualQuantity,
    quantityCount: calculation.actualQuantity,
    quantityUnit: calculation.actualUnit,
    pricingQuantity: calculation.billingQuantity,
    pricingUnit: calculation.billingUnit,
    pricingAmount: calculation.amount,
    lineTotal: calculation.amount,
    pricingPendingActual: calculation.isPending,
    billingSnapshotVersion: 1,
    billingSnapshotSource: configuration?.source || 'transaction',
    billingSnapshotValid: calculation.isValid,
    billingSnapshotError: calculation.errorCode,
  };
};

export const resolveTransactionBillingSnapshot = ({
  record = null,
  configuration = null,
  product = null,
} = {}) => {
  const source = record || {};
  const explicitBillingUnit = normalizeProductPricingUnit(source.billingUnit || source.pricingUnit || '');
  const legacyTransactionUnit = normalizeProductPricingUnit(source.quantityUnit || source.unit || '');
  const legacyWeight = parsePositiveNumber(source.actualWeightKg ?? source.weightKg ?? source.totalKg ?? source.kg);
  const legacyAmount = parseMoney(source.amount ?? source.pricingAmount ?? source.lineTotal ?? source.totalAmount);
  // Older rows stored a single unit for both actual quantity and billing. Preserve
  // it only when the row is unambiguous; count + weight rows still need the fixed
  // customer configuration to decide whether billing was by count or by Kg.
  const savedBillingUnit = explicitBillingUnit || (
    legacyTransactionUnit
    && (isSameBillingUnit(legacyTransactionUnit, 'Kg') || legacyWeight <= 0)
    && legacyAmount > 0
      ? legacyTransactionUnit
      : ''
  );
  const savedUnitPrice = parseMoney(
    source.unitPrice ?? source.price ?? source.sellingPrice ?? source.unitPriceVnd ?? source.unit_price_vnd
  );
  const savedBillingQuantity = parsePositiveNumber(source.billingQuantity ?? source.pricingQuantity);
  const hasSnapshotMarker = parsePositiveNumber(source.billingSnapshotVersion) > 0
    || Boolean(`${source.billingSnapshotSource || ''}`.trim());
  const hasFrozenPricing = Boolean(savedBillingUnit && savedUnitPrice > 0 && (
    hasSnapshotMarker
    || Boolean(source.configurationId)
    || savedBillingQuantity > 0
    || legacyAmount > 0
  ));
  const effectiveConfiguration = hasFrozenPricing
    ? {
        ...(configuration || {}),
        productId: source.productId || configuration?.productId || product?.id || '',
        productName: source.productName || source.productNameSnapshot || configuration?.productName || product?.name || '',
        configurationId: source.configurationId || configuration?.configurationId || '',
        sizeLabel: source.sizeLabel || source.size || configuration?.sizeLabel || '',
        attributeLabel: source.attributeLabel || configuration?.attributeLabel || '',
        billingUnit: savedBillingUnit,
        pricingUnit: savedBillingUnit,
        unitPrice: savedUnitPrice,
        unitConversions: source.unitConversions ?? source.conversions ?? configuration?.unitConversions ?? '',
        source: 'transaction_snapshot',
      }
    : configuration;
  const snapshot = buildCustomerProductBillingSnapshot({
    configuration: effectiveConfiguration,
    product,
    productId: source.productId,
    productName: source.productName || source.productNameSnapshot,
    sizeLabel: source.sizeLabel || source.size,
    attributeLabel: source.attributeLabel,
    actualQuantity: source.actualQuantity ?? source.quantity ?? source.pieceCount ?? source.quantityCount,
    actualUnit: source.actualUnit || source.actualQuantityUnit || source.quantityUnit || source.unit,
    orderUnit: source.orderUnit || source.inputUnit || source.quantityUnit || source.actualUnit || source.unit,
    actualWeightKg: source.actualWeightKg ?? source.weightKg ?? source.totalKg ?? source.kg,
    billingQuantity: savedBillingQuantity,
    billingUnit: savedBillingUnit,
    unitPrice: savedUnitPrice,
    conversionFactor: source.conversionFactor ?? source.unitConversionFactor,
    unitConversions: source.unitConversions ?? source.conversions,
  });
  const savedAmount = legacyAmount;
  return {
    ...snapshot,
    ...(hasFrozenPricing && savedAmount > 0 ? {
      amount: savedAmount,
      pricingAmount: savedAmount,
      lineTotal: savedAmount,
    } : {}),
    hasFrozenPricing,
  };
};

// Keep order-list summaries aligned with the frozen billing snapshot used by
// invoices. Never add physical counts and Kg together under a hard-coded unit.
export const summarizeOrderBillingItems = (items = []) => {
  const summariesByUnit = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const source = item || {};
    const snapshot = resolveTransactionBillingSnapshot({ record: source });
    const billingUnit = normalizeProductPricingUnit(
      snapshot.billingUnit
      || source.billingUnit
      || source.pricingUnit
      || source.quantityUnit
      || source.unit
      || ''
    );
    const actualUnit = normalizeProductPricingUnit(
      snapshot.actualUnit
      || source.actualUnit
      || source.actualQuantityUnit
      || source.quantityUnit
      || source.unit
      || billingUnit
    );
    const usesWeightPricing = isSameBillingUnit(billingUnit, 'Kg');
    const fallbackQuantity = usesWeightPricing
      ? parsePositiveNumber(
        snapshot.actualWeightKg
        ?? source.actualWeightKg
        ?? source.weightKg
        ?? source.totalKg
        ?? source.kg
      )
      : parsePositiveNumber(
        snapshot.actualQuantity
        ?? source.actualQuantity
        ?? source.quantity
        ?? source.quantityCount
        ?? source.pieceCount
      );
    const quantity = parsePositiveNumber(snapshot.billingQuantity) || fallbackQuantity;
    const unit = billingUnit || actualUnit || 'Đơn vị';
    const unitKey = normalizeText(unit) || 'don-vi';
    const unitPrice = parseMoney(
      snapshot.unitPrice
      ?? source.unitPrice
      ?? source.price
      ?? source.sellingPrice
      ?? source.unitPriceVnd
      ?? source.unit_price_vnd
    );
    const current = summariesByUnit.get(unitKey) || {
      unit,
      quantity: 0,
      unitPrices: [],
    };

    current.quantity += quantity;
    if (unitPrice > 0) current.unitPrices.push(unitPrice);
    summariesByUnit.set(unitKey, current);
  });

  return [...summariesByUnit.values()].map((summary) => ({
    ...summary,
    unitPrices: [...new Set(summary.unitPrices)].sort((left, right) => left - right),
  }));
};

// A warehouse dispatch records what physically left the warehouse.  A sales
// order created from that dispatch must always bill by the customer's pricing
// unit, never by whichever quantity field happened to be entered first.
export const buildWarehouseDispatchOrderBillingSnapshot = ({
  dispatch = null,
  product = null,
  configuration = null,
  sourceUnitPrice = 0,
  sourcePricingUnit = '',
} = {}) => {
  const source = dispatch || {};
  const frozenSnapshot = resolveTransactionBillingSnapshot({ record: source, product });
  const hasCustomerPricingConfiguration = configuration?.isCustomerConfigured !== false;
  const configuredBillingUnit = hasCustomerPricingConfiguration
    ? normalizeProductPricingUnit(configuration?.billingUnit || configuration?.pricingUnit || '')
    : '';
  const fallbackBillingUnit = normalizeProductPricingUnit(
    frozenSnapshot.billingUnit
    || source.billingUnit
    || source.pricingUnit
    || source.quantityUnit
    || source.unit
    || getProductPrimaryPricingUnit(product || {}, 'Con')
  );
  const billingUnit = configuredBillingUnit || fallbackBillingUnit;
  const configuredUnitPrice = hasCustomerPricingConfiguration ? parseMoney(configuration?.unitPrice) : 0;
  const matchedSourceUnit = normalizeProductPricingUnit(sourcePricingUnit);
  const matchedSourcePrice = parseMoney(sourceUnitPrice);
  const frozenPriceCanBeUsed = isSameBillingUnit(frozenSnapshot.billingUnit, billingUnit);
  const sourcePriceCanBeUsed = matchedSourcePrice > 0
    && matchedSourceUnit
    && isSameBillingUnit(matchedSourceUnit, billingUnit);
  const unitPrice = sourcePriceCanBeUsed
    ? matchedSourcePrice
    : (configuredUnitPrice > 0
      ? configuredUnitPrice
      : (frozenPriceCanBeUsed
        ? parseMoney(frozenSnapshot.unitPrice)
        : parseMoney(source.unitPrice ?? source.price ?? product?.sellingPrice)));
  const effectiveConfiguration = {
    ...(configuration || {}),
    productId: product?.id || source.productId || configuration?.productId || '',
    productName: product?.name || source.productName || source.productNameSnapshot || configuration?.productName || '',
    configurationId: configuration?.configurationId || source.configurationId || frozenSnapshot.configurationId || '',
    billingUnit,
    pricingUnit: billingUnit,
    unitPrice,
    unitConversions: configuration?.unitConversions || source.unitConversions || frozenSnapshot.unitConversions || '',
    source: configuredBillingUnit ? 'customer_fixed_product' : 'warehouse_dispatch_fallback',
  };
  const configuredActualUnit = resolveCustomerProductActualUnit(effectiveConfiguration, product);
  const actualUnit = normalizeProductPricingUnit(
    source.actualUnit
    || source.actualQuantityUnit
    || source.quantityUnit
    || source.unit
    || frozenSnapshot.actualUnit
    || configuredActualUnit
    || billingUnit
  );
  const actualQuantity = [
    source.actualQuantity,
    source.quantityCount,
    source.pieceCount,
    source.quantity,
    frozenSnapshot.actualQuantity,
  ]
    .map(parsePositiveNumber)
    .find(value => value > 0) || 0;
  const actualWeightKg = firstPositiveNumber(
    source.weightKg,
    source.totalKg,
    source.kg,
    source.actualWeightKg,
    source.weight,
    frozenSnapshot.actualWeightKg,
  );
  const usesWeightPricing = isSameBillingUnit(billingUnit, 'Kg');
  const fallbackFrozenQuantity = frozenPriceCanBeUsed
    ? parsePositiveNumber(frozenSnapshot.billingQuantity)
    : 0;
  const billingQuantity = usesWeightPricing
    ? (actualWeightKg > 0 ? actualWeightKg : fallbackFrozenQuantity)
    : (actualQuantity > 0 ? actualQuantity : fallbackFrozenQuantity);

  return buildCustomerProductBillingSnapshot({
    configuration: effectiveConfiguration,
    product,
    productId: effectiveConfiguration.productId,
    productName: effectiveConfiguration.productName,
    sizeLabel: source.sizeLabel || source.size || '',
    attributeLabel: source.attributeLabel || source.productAttribute || '',
    actualQuantity,
    actualUnit,
    orderUnit: source.orderUnit || frozenSnapshot.orderUnit || actualUnit,
    actualWeightKg,
    billingQuantity,
    billingUnit,
    unitPrice,
    conversionFactor: source.conversionFactor ?? frozenSnapshot.conversionFactor ?? 0,
    unitConversions: effectiveConfiguration.unitConversions,
  });
};

const uniqueNonEmptyValues = (values = []) => [...new Set(
  values.map(value => `${value || ''}`.trim()).filter(Boolean)
)];

// Keep one readable order line per product and billing unit. Every source
// dispatch remains traceable, and mixed prices use an exact weighted average.
export const mergeWarehouseDispatchOrderBillingItems = (items = []) => {
  const groupedItems = new Map();

  (Array.isArray(items) ? items : []).forEach((source, sourceIndex) => {
    const productId = `${source?.productId || ''}`.trim();
    const productName = `${source?.productName || source?.productNameSnapshot || source?.description || ''}`.trim();
    const productKey = productId || normalizeText(productName) || `source-${sourceIndex}`;
    const billingUnit = normalizeProductPricingUnit(source?.billingUnit || source?.pricingUnit || '');
    const actualUnit = normalizeProductPricingUnit(
      source?.actualUnit || source?.actualQuantityUnit || source?.quantityUnit || billingUnit
    );
    const mergeKey = [
      productKey,
      normalizeText(billingUnit) || 'unknown-billing-unit',
      normalizeText(actualUnit) || 'unknown-actual-unit',
    ].join('__');
    const sourceDispatchIds = uniqueNonEmptyValues([
      ...(Array.isArray(source?.sourceDispatchIds) ? source.sourceDispatchIds : []),
      source?.sourceDispatchId,
      source?.dispatchId,
    ]);

    let group = groupedItems.get(mergeKey);
    if (!group) {
      group = {
        template: { ...source },
        sourceDispatchIds: [],
        sourceDispatchIdSet: new Set(),
        sourceConfigurationIds: [],
        sourceSizeLabels: [],
        sourceAttributeLabels: [],
        sourceActualUnits: [],
        actualQuantity: 0,
        actualWeightKg: 0,
        billingQuantity: 0,
        amount: 0,
        sourceCount: 0,
      };
      groupedItems.set(mergeKey, group);
    }

    // Realtime listeners may briefly repeat the same dispatch snapshot.
    if (sourceDispatchIds.length > 0 && sourceDispatchIds.every(id => group.sourceDispatchIdSet.has(id))) {
      return;
    }

    sourceDispatchIds.forEach((id) => {
      group.sourceDispatchIdSet.add(id);
      group.sourceDispatchIds.push(id);
    });
    group.sourceConfigurationIds.push(
      ...(Array.isArray(source?.sourceConfigurationIds) ? source.sourceConfigurationIds : []),
      source?.configurationId,
    );
    group.sourceSizeLabels.push(
      ...(Array.isArray(source?.sourceSizeLabels) ? source.sourceSizeLabels : []),
      source?.sizeLabel || source?.size,
    );
    group.sourceAttributeLabels.push(
      ...(Array.isArray(source?.sourceAttributeLabels) ? source.sourceAttributeLabels : []),
      source?.attributeLabel || source?.productAttribute,
    );
    group.sourceActualUnits.push(actualUnit);

    const actualQuantity = parsePositiveNumber(source?.actualQuantity ?? source?.quantityCount ?? source?.quantity);
    const actualWeightKg = firstPositiveNumber(
      source?.weightKg,
      source?.totalKg,
      source?.kg,
      source?.actualWeightKg,
    );
    const billingQuantity = parsePositiveNumber(source?.billingQuantity ?? source?.pricingQuantity ?? source?.quantity);
    const unitPrice = parseMoney(source?.unitPrice);
    const storedAmount = parseMoney(source?.amount ?? source?.pricingAmount ?? source?.lineTotal);

    group.actualQuantity += actualQuantity;
    group.actualWeightKg += actualWeightKg;
    group.billingQuantity += billingQuantity;
    group.amount += storedAmount > 0 ? storedAmount : Math.round(billingQuantity * unitPrice);
    group.sourceCount += Math.max(
      1,
      sourceDispatchIds.length,
      Math.floor(parsePositiveNumber(source?.mergedDispatchCount))
    );
  });

  return Array.from(groupedItems.values()).map((group) => {
    const sourceConfigurationIds = uniqueNonEmptyValues(group.sourceConfigurationIds);
    const sourceSizeLabels = uniqueNonEmptyValues(group.sourceSizeLabels);
    const sourceAttributeLabels = uniqueNonEmptyValues(group.sourceAttributeLabels);
    const sourceActualUnits = uniqueNonEmptyValues(
      group.sourceActualUnits.map(unit => normalizeProductPricingUnit(unit))
    );
    const billingUnit = normalizeProductPricingUnit(
      group.template.billingUnit || group.template.pricingUnit || ''
    );
    const hasCompatibleActualUnits = sourceActualUnits.length <= 1;
    const actualUnit = hasCompatibleActualUnits
      ? (sourceActualUnits[0] || normalizeProductPricingUnit(group.template.actualUnit || group.template.quantityUnit || billingUnit))
      : billingUnit;
    const actualQuantity = hasCompatibleActualUnits ? group.actualQuantity : group.billingQuantity;
    const weightedUnitPrice = group.billingQuantity > 0
      ? group.amount / group.billingQuantity
      : parseMoney(group.template.unitPrice);
    const displayUnitPrice = Math.round(weightedUnitPrice);
    const roundedAmount = Math.round(group.amount);

    return {
      ...group.template,
      configurationId: sourceConfigurationIds.length === 1 ? sourceConfigurationIds[0] : '',
      sizeLabel: sourceSizeLabels.length === 1 ? sourceSizeLabels[0] : '',
      attributeLabel: sourceAttributeLabels.length === 1 ? sourceAttributeLabels[0] : '',
      actualQuantity,
      actualUnit,
      actualWeightKg: group.actualWeightKg,
      billingQuantity: group.billingQuantity,
      billingUnit,
      unitPrice: displayUnitPrice,
      weightedUnitPrice,
      amount: roundedAmount,
      quantity: actualQuantity,
      quantityCount: actualQuantity,
      quantityUnit: actualUnit,
      weightKg: group.actualWeightKg,
      pricingQuantity: group.billingQuantity,
      pricingUnit: billingUnit,
      pricingAmount: roundedAmount,
      lineTotal: roundedAmount,
      billingSnapshotVersion: 1,
      billingSnapshotSource: group.sourceCount > 1
        ? 'warehouse_dispatch_merged_snapshot'
        : (group.template.billingSnapshotSource || 'warehouse_dispatch_order_snapshot'),
      sourceDispatchIds: uniqueNonEmptyValues(group.sourceDispatchIds),
      sourceConfigurationIds,
      sourceSizeLabels,
      sourceAttributeLabels,
      sourceActualUnits,
      mergedDispatchCount: group.sourceCount,
    };
  });
};

const getWarehouseDispatchSourceIds = (item = {}) => uniqueNonEmptyValues([
  ...(Array.isArray(item?.sourceDispatchIds) ? item.sourceDispatchIds : []),
  item?.sourceDispatchId,
  item?.dispatchId,
]);

export const isWarehouseDispatchOrderItem = (item = {}) => (
  getWarehouseDispatchSourceIds(item).length > 0
);

// Bulk drafts can contain both dispatch snapshots and products added in the order form.
// Only dispatch-backed lines are eligible for consolidation; manual lines need their
// billing quantity copied into the persisted order quantity so they survive validation.
export const prepareWarehouseDispatchOrderItems = (items = []) => {
  const dispatchItems = [];
  const manualItems = [];

  (Array.isArray(items) ? items : []).forEach((item) => {
    if (isWarehouseDispatchOrderItem(item)) dispatchItems.push(item);
    else manualItems.push(item);
  });

  const preservedManualItems = manualItems.map((item) => {
    const billingQuantity = firstPositiveNumber(
      item?.billingQuantity,
      item?.pricingQuantity,
      item?.quantity,
    );
    return {
      ...item,
      quantity: billingQuantity,
      billingQuantity,
      pricingQuantity: billingQuantity,
    };
  });

  return [
    ...mergeWarehouseDispatchOrderBillingItems(dispatchItems),
    ...preservedManualItems,
  ];
};
