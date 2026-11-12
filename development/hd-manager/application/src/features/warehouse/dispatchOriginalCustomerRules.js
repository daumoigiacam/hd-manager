// Exact original pure declarations extracted from features/customers/productCRMShared.jsx. No App/React/Firebase initialization.
import {resolveCustomerProductConfiguration} from "../../services/customerProductBilling.js";

import {normalizeProductPricingUnit} from "../../services/productPricingUnits.js";

import {normalizeUnitPriceMap} from "../../services/productPricingUnits.js";

const LEGACY_POSITION_MAP = {
  'Kế toán nhân sự': 'Kế toán & nhân sự',
  'Kế toán': 'Kế toán & nhân sự',
  'Admin': 'Kế toán & nhân sự',
  'Bán hàng': 'Kinh doanh',
  'CTV kinh doanh': 'Cộng tác viên kinh doanh',
  'Cộng tác viên': 'Cộng tác viên kinh doanh'
};

const WAREHOUSE_EXPORT_POSITION = 'Xuất kho';

const SALES_COLLABORATOR_POSITION = 'Cộng tác viên kinh doanh';

const normalizeEmployeePosition = (position = '') => {
  const rawPosition = `${position || ''}`.trim();
  const normalizedLookup = normalizeLookupText(rawPosition);
  if (['chu doanh nghiep', 'chu cua hang', 'giam doc', 'quan ly doanh nghiep', 'owner', 'business owner'].includes(normalizedLookup)) return 'Chủ doanh nghiệp';
  if (['ke toan nhan su', 'ke toan va nhan su', 'ke toan nhan vien', 'ke toan', 'nhan su', 'hanh chinh nhan su', 'hr', 'admin'].includes(normalizedLookup)) return 'Kế toán & nhân sự';
  if (['can hang xuat kho', 'xuat kho', 'nhan vien kho', 'kho'].includes(normalizedLookup)) return WAREHOUSE_EXPORT_POSITION;
  if (['cong tac vien kinh doanh', 'ctv kinh doanh', 'cong tac vien ban hang', 'ctv ban hang'].includes(normalizedLookup)) return SALES_COLLABORATOR_POSITION;
  if (['ban hang', 'sales', 'nhan vien kinh doanh'].includes(normalizedLookup)) return 'Kinh doanh';
  if (['tai xe', 'lai xe', 'giao hang', 'shipper', 'driver'].includes(normalizedLookup)) return 'Tài xế';
  if (['san xuat', 'nhan vien san xuat', 'production'].includes(normalizedLookup)) return 'Sản xuất';
  return LEGACY_POSITION_MAP[rawPosition] || rawPosition;
};

const isDeliveryParticipantPosition = (position = '') => ['Tài xế', 'Sản xuất'].includes(normalizeEmployeePosition(position));

const parseEmployeeRoleSalaryAmount = (value) => {
  return parseLooseMoneyValue(value);
};

const normalizeEmployeePositionList = (positions = []) => Array.from(new Set(
  (Array.isArray(positions) ? positions : [])
    .map(normalizeEmployeePosition)
    .filter(Boolean)
));

const normalizeEmployeeRoleSalaryComponents = (components = [], { keepEmpty = false } = {}) => (
  (Array.isArray(components) ? components : [])
    .map((row, index) => {
      const position = normalizeEmployeePosition(row?.position || row?.department || row?.role || '');
      const amount = parseEmployeeRoleSalaryAmount(row?.amount ?? row?.salary ?? row?.monthlySalary ?? 0);
      return {
        id: `${row?.id || position || `role_${index}`}`,
        position,
        amount,
        note: `${row?.note || ''}`.trim()
      };
    })
    .filter(row => row.position && (keepEmpty || row.amount > 0 || row.note))
);

const getEmployeePositionValues = (employee = {}) => normalizeEmployeePositionList([
  employee?.position,
  employee?.primaryPosition,
  ...(Array.isArray(employee?.secondaryPositions) ? employee.secondaryPositions : []),
  ...(Array.isArray(employee?.additionalPositions) ? employee.additionalPositions : []),
  ...(Array.isArray(employee?.departments) ? employee.departments : []),
  ...normalizeEmployeeRoleSalaryComponents(employee?.roleSalaryComponents, { keepEmpty: true }).map(row => row.position)
]);

const employeeHasPosition = (employee = {}, predicateOrPosition) => {
  const positions = getEmployeePositionValues(employee);
  if (typeof predicateOrPosition === 'function') return positions.some(position => predicateOrPosition(position));
  const normalized = normalizeEmployeePosition(predicateOrPosition);
  return positions.includes(normalized);
};

const isEmployeeDeliveryParticipant = (employee = {}) => employeeHasPosition(employee, isDeliveryParticipantPosition);

const toTitleCase = (str) => {
  if (!str) return '';
  return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

const LOOKUP_NORMALIZATION_CACHE_LIMIT = 2048;

const LOOKUP_NORMALIZATION_MAX_LENGTH = 256;

const lookupNormalizationCache = new Map();

const normalizeLookupText = (value = '') => {
  const cacheable = typeof value === 'string' && value.length <= LOOKUP_NORMALIZATION_MAX_LENGTH;
  if (cacheable) {
    const cached = lookupNormalizationCache.get(value);
    if (cached !== undefined) return cached;
  }
  const normalized = `${value}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (cacheable) {
    // FIFO hits keep insertion order; only primitive short strings are retained.
    if (lookupNormalizationCache.size >= LOOKUP_NORMALIZATION_CACHE_LIMIT) {
      lookupNormalizationCache.delete(lookupNormalizationCache.keys().next().value);
    }
    lookupNormalizationCache.set(value, normalized);
  }
  return normalized;
};

const parseLooseMoneyValue = (value) => {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return Math.max(0, Math.round(value));
  const digits = `${value}`.replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
};

const normalizeCustomerHonorific = (value = '') => {
  const normalized = normalizeLookupText(value || '').replace(/\s+/g, '');
  if (['a', 'anh', 'ong', 'chu', 'bacnam'].includes(normalized)) return 'anh';
  if (['c', 'chi', 'co', 'bacnu'].includes(normalized)) return 'chi';
  return '';
};

const inferCustomerHonorificFromName = (name = '') => {
  const firstToken = normalizeLookupText(`${name || ''}`.trim().split(/\s+/)[0] || '').replace(/[.:,-]/g, '');
  return normalizeCustomerHonorific(firstToken);
};

const stripCustomerHonorificPrefix = (name = '') => {
  const text = `${name || ''}`.trim();
  if (!text) return '';
  const parts = text.split(/\s+/);
  const firstToken = normalizeLookupText(parts[0] || '').replace(/[.:,-]/g, '');
  return normalizeCustomerHonorific(firstToken) ? parts.slice(1).join(' ') : text;
};

const getCustomerHonorific = (customer = {}) => (
  normalizeCustomerHonorific(customer?.customerHonorific || customer?.honorific)
  || inferCustomerHonorificFromName(customer?.name || customer?.customerName || '')
);

const getCustomerPlainName = (customer = {}) => {
  const rawName = `${customer?.plainName || customer?.customerName || customer?.name || ''}`.trim();
  return toTitleCase(stripCustomerHonorificPrefix(rawName)).trim();
};

const getCustomerDisplayName = (customer = {}) => {
  const plainName = getCustomerPlainName(customer);
  const honorific = getCustomerHonorific(customer);
  if (!plainName) return '';
  if (honorific === 'anh') return `Anh ${plainName}`;
  if (honorific === 'chi') return `Chị ${plainName}`;
  return plainName;
};

const hasCustomerOrderConfigurationValue = (value) => {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(`${value || ''}`.trim());
};

const normalizeCustomerPriceOverrides = (source = {}) => {
  const rawOverrides = source?.priceOverrides || source?.customPrices || {};
  const entries = Array.isArray(rawOverrides)
    ? rawOverrides.map(item => [item.productId || item.id, item])
    : Object.entries(rawOverrides);

  const normalizeVariantConfig = (variant = {}, index = 0) => {
    if (!variant || typeof variant !== 'object') return null;
    const price = parseLooseMoneyValue(variant.price ?? variant.unitPrice ?? variant.sellingPrice);
    const size = `${variant.size ?? variant.sizeLabel ?? variant.weightKg ?? ''}`.trim();
    const attributeLabel = `${variant.attributeLabel ?? variant.productAttribute ?? variant.attribute ?? variant.variant ?? ''}`.trim();
    const pricingUnit = normalizeProductPricingUnit(variant.pricingUnit ?? variant.defaultUnit ?? variant.quantityUnit ?? variant.unit ?? '');
    const unitPrices = normalizeUnitPriceMap(variant.unitPrices ?? variant.pricesByUnit ?? variant.priceByUnit ?? {});
    const orderUnits = variant.orderUnits ?? variant.allowedOrderUnits ?? variant.inputUnits ?? '';
    const defaultOrderUnit = normalizeProductPricingUnit(
      variant.defaultOrderUnit ?? variant.orderUnit ?? variant.preferredOrderUnit ?? ''
    );
    const unitConversions = variant.unitConversions ?? variant.conversions ?? variant.conversion ?? '';
    if (
      price <= 0
      && !size
      && !attributeLabel
      && !pricingUnit
      && Object.keys(unitPrices).length === 0
      && !hasCustomerOrderConfigurationValue(orderUnits)
      && !defaultOrderUnit
      && !hasCustomerOrderConfigurationValue(unitConversions)
    ) return null;
    return {
      id: `${variant.id || variant.localId || `variant_${index + 1}`}`,
      price,
      size,
      attributeLabel,
      unit: pricingUnit,
      pricingUnit,
      unitPrices,
      orderUnits,
      defaultOrderUnit,
      unitConversions
    };
  };

  return entries.reduce((acc, [productId, config]) => {
    const cleanProductId = `${productId || ''}`.trim();
    const rawPrice = typeof config === 'object' && config !== null
      ? config.price ?? config.unitPrice ?? config.sellingPrice
      : config;
    const cleanPrice = parseLooseMoneyValue(rawPrice);
    const cleanSize = typeof config === 'object' && config !== null
      ? `${config.size ?? config.sizeLabel ?? config.weightKg ?? ''}`.trim()
      : '';
    const cleanAttributeLabel = typeof config === 'object' && config !== null
      ? `${config.attributeLabel ?? config.productAttribute ?? config.attribute ?? config.variant ?? ''}`.trim()
      : '';
    const pricingUnit = typeof config === 'object' && config !== null
      ? normalizeProductPricingUnit(config.pricingUnit ?? config.defaultUnit ?? config.quantityUnit ?? config.unit ?? '')
      : '';
    const unitPrices = typeof config === 'object' && config !== null
      ? normalizeUnitPriceMap(config.unitPrices ?? config.pricesByUnit ?? config.priceByUnit ?? {})
      : {};
    const orderUnits = typeof config === 'object' && config !== null
      ? config.orderUnits ?? config.allowedOrderUnits ?? config.inputUnits ?? ''
      : '';
    const defaultOrderUnit = typeof config === 'object' && config !== null
      ? normalizeProductPricingUnit(config.defaultOrderUnit ?? config.orderUnit ?? config.preferredOrderUnit ?? '')
      : '';
    const unitConversions = typeof config === 'object' && config !== null
      ? config.unitConversions ?? config.conversions ?? config.conversion ?? ''
      : '';
    const variants = typeof config === 'object' && config !== null && Array.isArray(config.variants)
      ? config.variants.map(normalizeVariantConfig).filter(Boolean)
      : [];
    if (cleanProductId && (
      cleanPrice > 0
      || cleanSize
      || cleanAttributeLabel
      || pricingUnit
      || Object.keys(unitPrices).length > 0
      || hasCustomerOrderConfigurationValue(orderUnits)
      || defaultOrderUnit
      || hasCustomerOrderConfigurationValue(unitConversions)
      || variants.length > 0
    )) {
      acc[cleanProductId] = {
        price: cleanPrice,
        size: cleanSize,
        attributeLabel: cleanAttributeLabel,
        pricingUnit,
        defaultUnit: pricingUnit,
        unitPrices,
        orderUnits,
        defaultOrderUnit,
        unitConversions,
        variants
      };
    }
    return acc;
  }, {});
};

const normalizeCustomerProductIds = (customer = {}, products = [], validProductIds = new Set((products || []).map(product => product.id).filter(Boolean))) => {
  const savedIds = Array.isArray(customer?.customerProductIds)
    ? customer.customerProductIds
    : (Array.isArray(customer?.quotedProductIds) ? customer.quotedProductIds : []);
  const priceOverrideIds = Object.keys(normalizeCustomerPriceOverrides(customer || {}));
  const candidateIds = savedIds.length > 0 ? savedIds : priceOverrideIds;
  return [...new Set(candidateIds.map(productId => `${productId || ''}`.trim()).filter(Boolean))]
    .filter(productId => validProductIds.size === 0 || validProductIds.has(productId));
};

const normalizeCustomerBranches = (customer = {}, products = []) => {
  const rawBranches = Array.isArray(customer?.branches)
    ? customer.branches
    : (Array.isArray(customer?.customerBranches) ? customer.customerBranches : []);

  return rawBranches
    .map((branch = {}, index) => {
      const id = `${branch.id || branch.branchId || branch.code || `branch_${index + 1}`}`.trim();
      const name = `${branch.name || branch.branchName || branch.label || ''}`.trim();
      const address = `${branch.address || branch.deliveryAddress || branch.locationText || ''}`.trim();
      const phone = `${branch.phone || branch.contactPhone || ''}`.trim();
      const note = `${branch.note || branch.description || ''}`.trim();
      const customerProductIds = normalizeCustomerProductIds(branch, products);
      return {
        ...branch,
        id: id || `branch_${index + 1}`,
        name,
        address,
        phone,
        note,
        customerProductIds
      };
    })
    .filter(branch => branch.name || branch.address || branch.phone || branch.note || branch.customerProductIds.length > 0);
};

const getCustomerProductConfig = (customer = null, product = null) => {
  const productId = product?.id || '';
  const customerPrices = normalizeCustomerPriceOverrides(customer || {});
  return productId ? customerPrices[productId] || null : null;
};

const resolveCustomerProductBillingConfiguration = (customer = null, product = null, options = {}) => (
  resolveCustomerProductConfiguration({
    customerConfig: getCustomerProductConfig(customer, product),
    product,
    productId: product?.id || '',
    ...options,
  })
);

export {resolveCustomerProductBillingConfiguration,normalizeCustomerBranches,normalizeCustomerProductIds,getCustomerDisplayName,isEmployeeDeliveryParticipant};