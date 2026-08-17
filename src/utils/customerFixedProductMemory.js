import {
  normalizeProductPricingUnit,
  normalizeUnitPriceMap,
  putUnitPriceIntoMap,
} from '../services/productPricingUnits.js';

const cleanId = (value = '') => `${value || ''}`.trim();

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const uniqueIds = (values = [], validProductIds = null) => {
  const validIds = validProductIds instanceof Set
    ? validProductIds
    : new Set((validProductIds || []).map(cleanId).filter(Boolean));
  return [...new Set((Array.isArray(values) ? values : []).map(cleanId).filter(Boolean))]
    .filter(productId => validIds.size === 0 || validIds.has(productId));
};

const getBranchId = (branch = {}, index = 0) => cleanId(
  branch.id || branch.branchId || branch.code || `branch_${index + 1}`
);

const normalizeUnit = (value) => normalizeProductPricingUnit(value || '');

const parsePrice = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const getConfigMap = (source = {}) => {
  if (isRecord(source?.priceOverrides)) {
    return { key: 'priceOverrides', map: { ...source.priceOverrides } };
  }
  if (isRecord(source?.customPrices)) {
    return { key: 'customPrices', map: { ...source.customPrices } };
  }
  return { key: 'priceOverrides', map: {} };
};

const getItemBillingUnit = (item = {}, currentConfig = {}) => normalizeUnit(
  currentConfig.billingUnit
  || currentConfig.pricingUnit
  || currentConfig.defaultUnit
  || item.billingUnit
  || item.pricingUnit
  || item.defaultUnit
);

const getItemOrderUnit = (item = {}) => normalizeUnit(
  item.orderUnit
  || item.defaultOrderUnit
  || item.actualUnit
  || item.quantityUnit
  || item.unit
);

const getItemPrice = (item = {}) => (
  parsePrice(item.unitPrice)
  ?? parsePrice(item.price)
  ?? parsePrice(item.sellingPrice)
);

const getVariantIndex = (variants = [], item = {}) => {
  const configurationId = cleanId(item.configurationId || item.variantId || item.customerProductConfigurationId);
  if (configurationId) {
    return variants.findIndex((variant = {}) => cleanId(
      variant.id || variant.configurationId || variant.variantId
    ) === configurationId);
  }

  const sizeLabel = cleanId(item.sizeLabel || item.size || item.attributeLabel || item.productAttribute);
  if (!sizeLabel) return -1;
  return variants.findIndex((variant = {}) => cleanId(
    variant.sizeLabel || variant.size || variant.attributeLabel || variant.productAttribute || variant.label
  ) === sizeLabel);
};

const updateConfiguration = (currentConfig = {}, item = {}) => {
  // Older customer records may store a product price directly as a number.
  // Keep that value when later adding the saved order-unit preference.
  const legacyPrice = parsePrice(currentConfig);
  const current = isRecord(currentConfig)
    ? currentConfig
    : (legacyPrice !== null ? { price: legacyPrice, unitPrice: legacyPrice } : {});
  const next = { ...current };
  const billingUnit = getItemBillingUnit(item, current);
  const orderUnit = getItemOrderUnit(item);
  const price = getItemPrice(item);

  // The billing unit comes from a billing snapshot only; the order-entry unit never changes it.
  if (!normalizeUnit(current.billingUnit || current.pricingUnit || current.defaultUnit) && billingUnit) {
    next.billingUnit = billingUnit;
    next.pricingUnit = billingUnit;
  }

  if (orderUnit) {
    const knownOrderUnits = Array.isArray(current.orderUnits)
      ? current.orderUnits
      : (Array.isArray(current.allowedOrderUnits) ? current.allowedOrderUnits : []);
    next.orderUnits = [...new Set([...knownOrderUnits.map(normalizeUnit).filter(Boolean), orderUnit])];
    next.defaultOrderUnit = orderUnit;
    next.orderUnit = orderUnit;
  }

  if (price !== null) {
    const priceUnit = billingUnit || normalizeUnit(item.billingUnit || item.pricingUnit || item.defaultUnit);
    next.price = price;
    next.unitPrice = price;
    if (priceUnit) {
      next.unitPrices = putUnitPriceIntoMap(normalizeUnitPriceMap(current.unitPrices), priceUnit, price);
    }
  }

  return next;
};

const updateProductConfiguration = (currentConfig = {}, item = {}) => {
  const current = isRecord(currentConfig) ? currentConfig : {};
  const variants = Array.isArray(current.variants) ? current.variants : [];
  const variantIndex = getVariantIndex(variants, item);
  // Pass the original value through so legacy numeric price overrides are
  // preserved before order-unit metadata is added.
  if (variantIndex < 0) return updateConfiguration(currentConfig, item);

  const nextVariants = variants.map((variant, index) => (
    index === variantIndex ? updateConfiguration(variant, item) : variant
  ));
  return { ...current, variants: nextVariants };
};

const isSameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const getRequestTimestamp = (request = {}) => {
  const parsed = Date.parse(
    request.updatedAt
    || request.createdAt
    || request.requestedAt
    || request.orderDate
    || request.date
    || 0
  );
  return Number.isFinite(parsed) ? parsed : 0;
};

const getSortedRequests = (requests = []) => (
  (Array.isArray(requests) ? requests : [])
    .map((request, index) => ({ request, index }))
    .sort((left, right) => getRequestTimestamp(left.request) - getRequestTimestamp(right.request) || left.index - right.index)
    .map(({ request }) => request)
);

export const buildCustomerFixedProductMemoryPatch = ({
  customer = null,
  requests = [],
  validProductIds = [],
} = {}) => {
  const customerId = cleanId(customer?.id);
  if (!customerId) {
    return {
      patch: null,
      addedProductIds: [],
      updatedProductIds: [],
      skippedBranchIds: [],
    };
  }

  const validIds = new Set((validProductIds || []).map(cleanId).filter(Boolean));
  // Never remove an existing fixed-product reference just because the current
  // catalog query does not include that historical product.
  const rootProductIds = uniqueIds(customer?.customerProductIds);
  const rootConfigState = getConfigMap(customer);
  const rootConfigs = { ...rootConfigState.map };
  const rawBranches = Array.isArray(customer?.branches)
    ? customer.branches
    : (Array.isArray(customer?.customerBranches) ? customer.customerBranches : []);
  const branches = rawBranches.map((branch = {}, index) => ({
    ...branch,
    id: getBranchId(branch, index),
    customerProductIds: uniqueIds(branch.customerProductIds),
  }));
  const addedProductIds = new Set();
  const updatedProductIds = new Set();
  const skippedBranchIds = new Set();
  let rootProductsChanged = false;
  let rootConfigsChanged = false;
  let branchesChanged = false;

  getSortedRequests(requests).forEach((request = {}) => {
    if (cleanId(request.customerId) !== customerId) return;
    const items = (Array.isArray(request.items) ? request.items : [])
      .filter((item = {}) => {
        const productId = cleanId(item.productId);
        return productId && (validIds.size === 0 || validIds.has(productId));
      });
    if (items.length === 0) return;

    const branchId = cleanId(request.branchId || request.customerBranchId);
    if (!branchId) {
      items.forEach((item) => {
        const productId = cleanId(item.productId);
        if (!rootProductIds.includes(productId)) {
          rootProductIds.push(productId);
          addedProductIds.add(productId);
          rootProductsChanged = true;
        }

        const currentConfig = rootConfigs[productId] || {};
        const nextConfig = updateProductConfiguration(currentConfig, item);
        if (!isSameValue(currentConfig, nextConfig)) {
          rootConfigs[productId] = nextConfig;
          updatedProductIds.add(productId);
          rootConfigsChanged = true;
        }
      });
      return;
    }

    const branchIndex = branches.findIndex((branch, index) => getBranchId(branch, index) === branchId);
    if (branchIndex < 0) {
      skippedBranchIds.add(branchId);
      return;
    }

    const branch = branches[branchIndex];
    const branchProductIds = branch.customerProductIds.length > 0
      ? [...branch.customerProductIds]
      : [...rootProductIds];
    const branchConfigState = getConfigMap(branch);
    const branchConfigs = { ...branchConfigState.map };
    let branchChanged = false;

    items.forEach((item) => {
      const productId = cleanId(item.productId);
      if (!branchProductIds.includes(productId)) {
        branchProductIds.push(productId);
        addedProductIds.add(productId);
        branchChanged = true;
      }

      // A branch inherits root configuration until its first branch-specific update.
      const currentConfig = branchConfigs[productId] || rootConfigs[productId] || {};
      const nextConfig = updateProductConfiguration(currentConfig, item);
      if (!isSameValue(currentConfig, nextConfig) || !isSameValue(branchConfigs[productId], nextConfig)) {
        branchConfigs[productId] = nextConfig;
        updatedProductIds.add(productId);
        branchChanged = true;
      }
    });

    if (branchChanged) {
      branches[branchIndex] = {
        ...branch,
        customerProductIds: branchProductIds,
        [branchConfigState.key]: branchConfigs,
      };
      branchesChanged = true;
    }
  });

  const patch = {};
  if (rootProductsChanged) patch.customerProductIds = rootProductIds;
  if (rootConfigsChanged) patch[rootConfigState.key] = rootConfigs;
  if (branchesChanged) patch.branches = branches;

  return {
    patch: Object.keys(patch).length > 0 ? patch : null,
    addedProductIds: [...addedProductIds],
    updatedProductIds: [...updatedProductIds],
    skippedBranchIds: [...skippedBranchIds],
  };
};
