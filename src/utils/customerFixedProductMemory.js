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
  const sizeLabel = cleanId(item.sizeLabel || item.size || item.weightKg);
  const attributeLabel = cleanId(item.attributeLabel || item.productAttribute || item.attribute || item.variant);
  if (sizeLabel || attributeLabel) {
    return variants.findIndex((variant = {}) => (
      cleanId(variant.sizeLabel || variant.size) === sizeLabel
      && cleanId(variant.attributeLabel || variant.productAttribute || variant.attribute) === attributeLabel
    ));
  }

  const configurationId = cleanId(item.configurationId || item.variantId || item.customerProductConfigurationId);
  if (!configurationId) return -1;
  return variants.findIndex((variant = {}) => cleanId(
    variant.id || variant.configurationId || variant.variantId
  ) === configurationId);
};

const getItemSizeLabel = (item = {}) => cleanId(
  item.sizeLabel || item.size || item.weightKg
);

const getItemAttributeLabel = (item = {}) => cleanId(
  item.attributeLabel || item.productAttribute || item.attribute || item.variant
);

const rememberRootConfiguration = (nextConfig = {}, item = {}) => {
  const next = { ...nextConfig };
  const sizeLabel = getItemSizeLabel(item);
  const attributeLabel = getItemAttributeLabel(item);

  if (sizeLabel) {
    next.size = sizeLabel;
    next.sizeLabel = sizeLabel;
  }
  if (attributeLabel) next.attributeLabel = attributeLabel;

  return next;
};

const rememberVariantConfiguration = (nextConfig = {}, variant = {}, item = {}) => {
  const next = { ...nextConfig };
  const configurationId = cleanId(
    variant.id || variant.configurationId || variant.variantId || item.configurationId || item.variantId
  );

  if (configurationId) next.defaultConfigurationId = configurationId;
  return next;
};

const rememberUsageMetadata = (nextConfig = {}, item = {}) => {
  const next = { ...nextConfig };
  const lastUsedAt = item.memoryLastUsedAt || item.createdAt || item.requestedAt || item.orderDate || item.date;
  const lastOrderId = cleanId(item.memoryLastOrderId || item.orderRequestId || item.orderId);
  const lastOrderDate = item.memoryLastOrderDate || item.orderDate || item.date || lastUsedAt;
  if (lastUsedAt) next.lastUsedAt = lastUsedAt;
  if (lastOrderId) next.lastOrderId = lastOrderId;
  if (lastOrderDate) next.lastOrderDate = lastOrderDate;
  return next;
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

  return rememberUsageMetadata(rememberRootConfiguration(next, item), item);
};

const buildVariantId = (item = {}, fallbackIndex = 0) => {
  const explicitId = cleanId(item.configurationId || item.variantId || item.customerProductConfigurationId);
  if (explicitId) return explicitId;
  const productId = cleanId(item.productId || 'product');
  const identity = cleanId(
    item.sizeLabel || item.size || item.weightKg
    || item.attributeLabel || item.productAttribute || item.attribute
    || `variant_${fallbackIndex + 1}`,
  ).toLocaleLowerCase('vi').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${productId}-${identity || `variant-${fallbackIndex + 1}`}`;
};

const getConfigurationIdentity = (config = {}) => ({
  size: cleanId(config.sizeLabel || config.size || config.weightKg),
  attribute: cleanId(config.attributeLabel || config.productAttribute || config.attribute),
});

const hasDifferentVariantIdentity = (current = {}, item = {}) => {
  const currentIdentity = getConfigurationIdentity(current);
  const itemIdentity = getConfigurationIdentity(item);
  if (!currentIdentity.size && !currentIdentity.attribute) return false;
  if (!itemIdentity.size && !itemIdentity.attribute) return false;
  return currentIdentity.size !== itemIdentity.size || currentIdentity.attribute !== itemIdentity.attribute;
};

const omitRootVariantFields = (config = {}) => {
  const next = { ...config };
  [
    'price', 'unitPrice', 'sellingPrice', 'unitPrices', 'pricesByUnit', 'priceByUnit',
    'size', 'sizeLabel', 'weightKg', 'attributeLabel', 'productAttribute', 'attribute',
    'orderUnit', 'defaultOrderUnit', 'orderUnits', 'allowedOrderUnits',
    'lastUsedAt', 'lastOrderId', 'lastOrderDate',
  ].forEach((key) => delete next[key]);
  return next;
};

const updateProductConfiguration = (currentConfig = {}, item = {}) => {
  const current = isRecord(currentConfig) ? currentConfig : {};
  const variants = Array.isArray(current.variants) ? current.variants : [];
  const variantIndex = getVariantIndex(variants, item);
  if (variantIndex < 0 && variants.length === 0 && !hasDifferentVariantIdentity(current, item)) {
    // Pass the original value through so legacy numeric price overrides are
    // preserved before order-unit metadata is added.
    return updateConfiguration(currentConfig, item);
  }

  if (variantIndex < 0 && variants.length === 0) {
    const previousVariant = {
      ...current,
      id: cleanId(current.id || current.configurationId) || buildVariantId(current, 0),
    };
    delete previousVariant.variants;
    delete previousVariant.defaultConfigurationId;
    const nextVariant = {
      ...updateConfiguration({}, item),
      id: buildVariantId(item, 1),
    };
    return rememberUsageMetadata(
      rememberVariantConfiguration({
        ...omitRootVariantFields(current),
        variants: [previousVariant, nextVariant],
      }, nextVariant, item),
      item,
    );
  }

  if (variantIndex < 0) {
    const nextVariant = {
      ...updateConfiguration({}, item),
      id: buildVariantId(item, variants.length),
    };
    return rememberUsageMetadata(
      rememberVariantConfiguration({
        ...current,
        variants: [...variants, nextVariant],
      }, nextVariant, item),
      item,
    );
  }

  const nextVariants = variants.map((variant, index) => (
    index === variantIndex ? updateConfiguration(variant, item) : variant
  ));
  return rememberUsageMetadata(
    rememberVariantConfiguration({ ...current, variants: nextVariants }, nextVariants[variantIndex], item),
    item,
  );
};

const isSameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const getRequestTimestamp = (request = {}) => {
  const value = request.createdAt
    || request.requestedAt
    || request.orderDate
    || request.date
    || request.updatedAt
    || 0;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 100000000000 ? value * 1000 : value;
  }
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
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
        const memoryItem = {
          ...item,
          memoryLastUsedAt: request.createdAt || request.requestedAt || request.orderDate || request.date || request.updatedAt || '',
          memoryLastOrderId: request.id || request.orderRequestId || '',
          memoryLastOrderDate: request.date || request.orderDate || request.requestedAt || request.createdAt || '',
        };
        const productId = cleanId(item.productId);
        if (!rootProductIds.includes(productId)) {
          rootProductIds.push(productId);
          addedProductIds.add(productId);
          rootProductsChanged = true;
        }

        const currentConfig = rootConfigs[productId] || {};
        const nextConfig = updateProductConfiguration(currentConfig, memoryItem);
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
      const memoryItem = {
        ...item,
        memoryLastUsedAt: request.createdAt || request.requestedAt || request.orderDate || request.date || request.updatedAt || '',
        memoryLastOrderId: request.id || request.orderRequestId || '',
        memoryLastOrderDate: request.date || request.orderDate || request.requestedAt || request.createdAt || '',
      };
      const productId = cleanId(item.productId);
      if (!branchProductIds.includes(productId)) {
        branchProductIds.push(productId);
        addedProductIds.add(productId);
        branchChanged = true;
      }

      // A branch inherits root configuration until its first branch-specific update.
      const currentConfig = branchConfigs[productId] || rootConfigs[productId] || {};
      const nextConfig = updateProductConfiguration(currentConfig, memoryItem);
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
