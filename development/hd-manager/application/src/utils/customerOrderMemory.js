const cleanId = (value = '') => `${value || ''}`.trim();

const normalizeText = (value = '') => `${value || ''}`
  .trim()
  .toLocaleLowerCase('vi')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const toTimestamp = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 100000000000 ? value * 1000 : value;
  }
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getCustomerOrderMemoryTimestamp = (request = {}) => (
  toTimestamp(
    request.createdAt
    || request.requestedAt
    || request.orderDate
    || request.date
    || request.updatedAt,
  )
);

const getRequestItems = (request = {}) => {
  if (Array.isArray(request.items) && request.items.length > 0) return request.items;
  return request.primaryItem ? [request.primaryItem] : [];
};

const getRequestBranchId = (request = {}) => cleanId(
  request.branchId || request.customerBranchId,
);

const isRequestInScope = (request = {}, {
  companyId = '',
  customerId = '',
  branchId = '',
} = {}) => {
  if (!request || request.isArchived) return false;
  if (cleanId(request.customerId) !== cleanId(customerId)) return false;

  const expectedCompanyId = cleanId(companyId);
  const requestCompanyId = cleanId(request.companyId || request.tenantId);
  if (expectedCompanyId && requestCompanyId && requestCompanyId !== expectedCompanyId) {
    return false;
  }

  return getRequestBranchId(request) === cleanId(branchId);
};

export const buildCustomerOrderPreferenceKey = (item = {}) => {
  const productId = cleanId(item.productId);
  if (!productId) return '';
  const size = normalizeText(item.sizeLabel || item.weightKg || item.size);
  const attribute = normalizeText(
    item.attributeLabel || item.productAttribute || item.attribute || item.variant,
  );
  const configurationId = cleanId(
    item.configurationId || item.variantId || item.customerProductConfigurationId,
  );
  const variantIdentity = size || attribute
    ? `${size}::${attribute}`
    : normalizeText(configurationId || 'default');
  return `${productId}::${variantIdentity}`;
};

const copySafeOrderItem = (item = {}) => ({
  productId: cleanId(item.productId),
  description: `${item.description || item.productName || ''}`.trim(),
  configurationId: cleanId(
    item.configurationId || item.variantId || item.customerProductConfigurationId,
  ),
  attributeLabel: `${item.attributeLabel ?? item.productAttribute ?? item.attribute ?? ''}`.trim(),
  sizeLabel: `${item.sizeLabel ?? item.weightKg ?? item.size ?? ''}`.trim(),
  quantity: item.quantity ?? '',
  quantityUnit: `${item.quantityUnit || item.orderUnit || item.defaultOrderUnit || item.actualUnit || item.unit || ''}`.trim(),
  orderUnit: `${item.orderUnit || item.defaultOrderUnit || item.quantityUnit || item.actualUnit || item.unit || ''}`.trim(),
  pricingUnit: `${item.pricingUnit || item.billingUnit || item.defaultUnit || item.quantityUnit || ''}`.trim(),
  billingUnit: `${item.billingUnit || item.pricingUnit || item.defaultUnit || item.quantityUnit || ''}`.trim(),
  unitPrice: item.unitPrice ?? item.price ?? item.sellingPrice ?? '',
});

const getScopedRequestsNewestFirst = (options = {}) => (
  (Array.isArray(options.requests) ? options.requests : [])
    .filter((request) => isRequestInScope(request, options))
    .map((request, index) => ({ request, index }))
    .sort((left, right) => (
      getCustomerOrderMemoryTimestamp(right.request)
      - getCustomerOrderMemoryTimestamp(left.request)
      || right.index - left.index
    ))
    .map(({ request }) => request)
);

export const getCustomerRecentOrderPreferences = ({
  requests = [],
  companyId = '',
  customerId = '',
  branchId = '',
  limit = 12,
} = {}) => {
  const recent = new Map();
  getScopedRequestsNewestFirst({ requests, companyId, customerId, branchId })
    .forEach((request) => {
      getRequestItems(request).forEach((item) => {
        const key = buildCustomerOrderPreferenceKey(item);
        if (!key || recent.has(key)) return;
        const safeItem = copySafeOrderItem(item);
        recent.set(key, {
          ...safeItem,
          key,
          lastOrderId: cleanId(request.id || request.orderRequestId),
          lastUsedAt: request.createdAt || request.requestedAt || request.orderDate || request.date || '',
          lastOrderDate: request.date || request.orderDate || request.requestedAt || request.createdAt || '',
        });
      });
    });
  return Array.from(recent.values()).slice(0, Math.max(0, Number(limit) || 0));
};

export const getLatestCustomerOrderTemplate = ({
  requests = [],
  companyId = '',
  customerId = '',
  branchId = '',
} = {}) => {
  const latest = getScopedRequestsNewestFirst({
    requests,
    companyId,
    customerId,
    branchId,
  }).find((request) => getRequestItems(request).some((item) => cleanId(item.productId)));
  if (!latest) return null;

  return {
    customerId: cleanId(customerId),
    branchId: getRequestBranchId(latest),
    branchName: `${latest.branchName || latest.customerBranchName || ''}`.trim(),
    branchAddress: `${latest.branchAddress || latest.customerBranchAddress || ''}`.trim(),
    items: getRequestItems(latest)
      .map(copySafeOrderItem)
      .filter((item) => item.productId),
  };
};

export const mergeCustomerOrderMemoryHistory = ({
  existingRequests = [],
  savedRequests = [],
  companyId = '',
  customerId = '',
} = {}) => {
  const normalizedCustomerId = cleanId(customerId);
  const normalizedCompanyId = cleanId(companyId);
  const merged = new Map();
  const idless = [];

  [...(Array.isArray(existingRequests) ? existingRequests : []),
    ...(Array.isArray(savedRequests) ? savedRequests : [])]
    .forEach((request) => {
      if (!request || request.isArchived) return;
      if (cleanId(request.customerId) !== normalizedCustomerId) return;
      const requestCompanyId = cleanId(request.companyId || request.tenantId);
      if (normalizedCompanyId && requestCompanyId && requestCompanyId !== normalizedCompanyId) return;
      const id = cleanId(request.id || request.orderRequestId);
      if (id) merged.set(id, request);
      else idless.push(request);
    });

  return [...merged.values(), ...idless].sort((left, right) => (
    getCustomerOrderMemoryTimestamp(left) - getCustomerOrderMemoryTimestamp(right)
  ));
};
