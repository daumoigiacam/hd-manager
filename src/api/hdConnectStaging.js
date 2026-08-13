import { HdApiClient, HdApiError, createRequestId } from './client.js';

const runtimeEnv = typeof import.meta !== 'undefined' && import.meta.env
  ? import.meta.env
  : {};

export const isVpsStagingMode = runtimeEnv.VITE_DATA_MODE === 'vps-staging';
export const inventoryVpsEnabled = runtimeEnv.VITE_INVENTORY_VPS_ENABLED === 'true';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value) => UUID_PATTERN.test(`${value || ''}`.trim());

const stringValue = (value) => `${value ?? ''}`.trim();

const omitUndefined = (value) => Object.fromEntries(
  Object.entries(value).filter(([, item]) => item !== undefined),
);

const toStringArray = (...values) => [...new Set(
  values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map(stringValue)
    .filter(Boolean),
)];

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const toTargetId = (value) => isUuid(value) ? `${value}` : undefined;

const normalizePage = (result, normalizeItem) => {
  const source = Array.isArray(result)
    ? result
    : (Array.isArray(result?.items) ? result.items : []);

  return {
    items: source.map(normalizeItem),
    pagination: result?.pagination ?? null,
  };
};

const normalizeAttributes = (record) => (
  record?.attributes && typeof record.attributes === 'object' && !Array.isArray(record.attributes)
    ? record.attributes
    : {}
);

const normalizeMetadata = (record) => (
  record?.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
    ? record.metadata
    : {}
);

const preservedLegacyFields = (record, allowedKeys) => Object.fromEntries(
  allowedKeys
    .filter((key) => record?.[key] !== undefined)
    .map((key) => [key, record[key]]),
);

export const normalizeVpsSession = (session = {}, currentUser = null) => {
  const sourceUser = session.user || currentUser?.user || currentUser || {};
  const company = session.company || currentUser?.company || null;
  const branch = session.branch || currentUser?.branch || null;
  const roles = Array.isArray(session.roles) ? session.roles : (currentUser?.roles || []);
  const permissions = Array.isArray(session.permissions)
    ? session.permissions
    : (currentUser?.permissions || []);
  const primaryRole = stringValue(roles[0] || sourceUser.role || 'employee').toLowerCase();

  return {
    user: {
      id: sourceUser.id,
      email: sourceUser.email || '',
      name: sourceUser.fullName || sourceUser.name || sourceUser.email || '',
      displayName: sourceUser.fullName || sourceUser.name || sourceUser.email || '',
      companyId: company?.id || sourceUser.companyId || '',
      branchId: branch?.id || sourceUser.branchId || '',
      role: primaryRole,
      roles,
      permissions,
      accountType: 'employee',
      authProvider: 'hd-connect-vps',
    },
    company: company ? {
      ...company,
      id: company.id,
      name: company.name || company.displayName || company.code || '',
    } : null,
    branch: branch || null,
    roles,
    permissions,
  };
};

export const normalizeVpsCustomer = (record = {}) => {
  const attributes = normalizeAttributes(record);
  const phones = toStringArray(record.phones);
  const emails = toStringArray(record.emails);

  return {
    ...attributes,
    ...record,
    id: record.id,
    companyId: record.companyId,
    branchId: record.branchId || '',
    name: record.name || '',
    phone: phones[0] || attributes.phone || '',
    phones,
    email: emails[0] || attributes.email || '',
    emails,
    empId: record.salesOwnerId || attributes.empId || '',
    creditLimit: toFiniteNumber(record.creditLimit) ?? attributes.creditLimit ?? 0,
    isArchived: Boolean(record.deletedAt),
    createdAt: record.createdAt || attributes.createdAt || '',
    updatedAt: record.updatedAt || attributes.updatedAt || '',
    sourceSystem: 'hd-connect-vps',
  };
};

export const normalizeVpsProduct = (record = {}) => {
  const metadata = normalizeMetadata(record);

  return {
    ...metadata,
    ...record,
    id: record.id,
    companyId: record.companyId,
    name: record.name || '',
    productName: record.name || metadata.productName || '',
    unitId: record.salesUnitId || record.baseUnitId || metadata.unitId || '',
    isArchived: Boolean(record.deletedAt),
    createdAt: record.createdAt || metadata.createdAt || '',
    updatedAt: record.updatedAt || metadata.updatedAt || '',
    sourceSystem: 'hd-connect-vps',
  };
};

export const normalizeVpsOrder = (record = {}) => {
  const metadata = normalizeMetadata(record);
  const lines = Array.isArray(record.lines) ? record.lines : [];

  return {
    ...metadata,
    ...record,
    id: record.id,
    code: record.orderNumber || metadata.code || '',
    orderNumber: record.orderNumber || '',
    companyId: record.companyId,
    customerId: record.customerId,
    warehouseId: record.warehouseId,
    salesEmpId: record.salespersonId || metadata.salesEmpId || '',
    date: record.orderDate || metadata.date || '',
    orderDate: record.orderDate || '',
    items: lines.map((line) => ({
      ...line,
      id: line.id,
      productId: line.productId,
      unitId: line.unitId,
      quantity: toFiniteNumber(line.quantity) ?? 0,
      unitPrice: toFiniteNumber(line.unitPrice) ?? 0,
    })),
    reviewStatus: record.status || metadata.reviewStatus || '',
    isArchived: Boolean(record.deletedAt),
    createdAt: record.createdAt || metadata.createdAt || '',
    updatedAt: record.updatedAt || metadata.updatedAt || '',
    sourceSystem: 'hd-connect-vps',
  };
};

export const normalizeVpsPayment = (record = {}) => ({
  ...record,
  id: record.id,
  companyId: record.companyId,
  reference: record.reference || record.externalPaymentId || '',
  amount: toFiniteNumber(record.amount) ?? 0,
  isArchived: Boolean(record.deletedAt),
  sourceSystem: 'hd-connect-vps',
  readOnly: true,
});

const toCustomerPayload = (record = {}) => {
  const name = stringValue(record.name);
  if (!name) {
    throw new HdApiError('Customer name is required.', { code: 'CUSTOMER_NAME_REQUIRED' });
  }

  const legacyFields = preservedLegacyFields(record, [
    'customerHonorific',
    'debtLimitMode',
    'debtLimitAmount',
    'allowedDriverIds',
    'legacySourceId',
  ]);

  return omitUndefined({
    code: stringValue(record.code) || undefined,
    name,
    companyName: stringValue(record.companyName) || undefined,
    taxCode: stringValue(record.taxCode || record.taxId) || undefined,
    contactName: stringValue(record.contactName || record.contact) || undefined,
    phones: toStringArray(record.phones, record.phone),
    emails: toStringArray(record.emails, record.email),
    address: stringValue(record.address) || undefined,
    latitude: toFiniteNumber(record.latitude ?? record.lat),
    longitude: toFiniteNumber(record.longitude ?? record.lng),
    notes: stringValue(record.notes || record.note) || undefined,
    branchId: toTargetId(record.branchId),
    priceListId: toTargetId(record.priceListId),
    routeId: toTargetId(record.routeId),
    salesOwnerId: toTargetId(record.salesOwnerId || record.empId),
    customerGroupId: toTargetId(record.customerGroupId),
    paymentTerm: stringValue(record.paymentTerm) || undefined,
    creditLimit: toFiniteNumber(record.creditLimit ?? record.debtLimitAmount),
    status: ['ACTIVE', 'INACTIVE', 'BLOCKED'].includes(stringValue(record.status).toUpperCase())
      ? stringValue(record.status).toUpperCase()
      : undefined,
    attributes: {
      ...normalizeAttributes(record),
      legacyUi: legacyFields,
    },
  });
};

const toProductPayload = (record = {}) => {
  const name = stringValue(record.name || record.productName);
  if (!name) {
    throw new HdApiError('Product name is required.', { code: 'PRODUCT_NAME_REQUIRED' });
  }

  const legacyFields = preservedLegacyFields(record, [
    'unit',
    'unitName',
    'price',
    'cost',
    'imageUrl',
    'legacySourceId',
  ]);

  return omitUndefined({
    code: stringValue(record.code) || undefined,
    sku: stringValue(record.sku) || undefined,
    barcode: stringValue(record.barcode) || undefined,
    qrCode: stringValue(record.qrCode) || undefined,
    name,
    shortName: stringValue(record.shortName) || undefined,
    description: stringValue(record.description) || undefined,
    categoryId: toTargetId(record.categoryId),
    baseUnitId: toTargetId(record.baseUnitId || record.unitId),
    salesUnitId: toTargetId(record.salesUnitId || record.unitId),
    purchaseUnitId: toTargetId(record.purchaseUnitId),
    inventoryUnitId: toTargetId(record.inventoryUnitId),
    metadata: {
      ...normalizeMetadata(record),
      legacyUi: legacyFields,
    },
  });
};

const toSalesOrderPayload = (record = {}) => {
  const customerId = toTargetId(record.customerId);
  const warehouseId = toTargetId(record.warehouseId);
  const sourceLines = Array.isArray(record.lines)
    ? record.lines
    : (Array.isArray(record.items) ? record.items : []);

  if (!customerId) {
    throw new HdApiError('The selected customer does not have a target VPS ID.', {
      code: 'ORDER_CUSTOMER_UNRESOLVED',
    });
  }
  if (!warehouseId) {
    throw new HdApiError('Order creation is blocked until a target warehouse is selected.', {
      code: 'ORDER_WAREHOUSE_UNRESOLVED',
    });
  }
  if (sourceLines.length === 0) {
    throw new HdApiError('An order requires at least one item.', {
      code: 'ORDER_LINES_REQUIRED',
    });
  }

  const lines = sourceLines.map((line, index) => {
    const productId = toTargetId(line?.productId || line?.id);
    const unitId = toTargetId(line?.unitId || line?.salesUnitId || line?.baseUnitId);
    const quantity = toFiniteNumber(line?.quantity ?? line?.qty);

    if (!productId || !unitId || !quantity || quantity <= 0) {
      throw new HdApiError(
        `Order line ${index + 1} requires a target product, unit, and positive quantity.`,
        { code: 'ORDER_LINE_UNRESOLVED' },
      );
    }

    return omitUndefined({
      productId,
      variantId: toTargetId(line?.variantId),
      unitId,
      warehouseId: toTargetId(line?.warehouseId),
      taxRateId: toTargetId(line?.taxRateId),
      quantity,
      unitPrice: toFiniteNumber(line?.unitPrice ?? line?.price),
      discountType: ['PERCENTAGE', 'AMOUNT'].includes(stringValue(line?.discountType).toUpperCase())
        ? stringValue(line.discountType).toUpperCase()
        : undefined,
      discountValue: toFiniteNumber(line?.discountValue),
      note: stringValue(line?.note) || undefined,
      metadata: {
        ...normalizeMetadata(line),
        clientMutationId: stringValue(record.clientMutationId),
      },
    });
  });

  return omitUndefined({
    customerId,
    warehouseId,
    clientMutationId: stringValue(record.clientMutationId) || undefined,
    branchId: toTargetId(record.branchId),
    salespersonId: toTargetId(record.salespersonId || record.salesEmpId || record.empId),
    priceListId: toTargetId(record.priceListId),
    deliveryRouteId: toTargetId(record.deliveryRouteId),
    orderDate: stringValue(record.orderDate || record.date) || undefined,
    currency: stringValue(record.currency) || undefined,
    paymentTerm: stringValue(record.paymentTerm) || undefined,
    internalNote: stringValue(record.internalNote) || undefined,
    customerNote: stringValue(record.customerNote) || undefined,
    metadata: {
      ...normalizeMetadata(record),
      clientMutationId: stringValue(record.clientMutationId),
      sourceEntity: 'hd-manager-ui',
    },
    lines,
  });
};

const toSalesOrderUpdatePayload = (record = {}) => {
  const unsupportedLineMutation = Object.prototype.hasOwnProperty.call(record, 'items')
    || Object.prototype.hasOwnProperty.call(record, 'lines');
  if (unsupportedLineMutation) {
    throw new HdApiError(
      'Order line editing is not enabled until its VPS contract is implemented.',
      { code: 'ORDER_LINE_UPDATE_BLOCKED' },
    );
  }

  return omitUndefined({
    clientMutationId: stringValue(record.clientMutationId) || undefined,
    branchId: toTargetId(record.branchId),
    salespersonId: toTargetId(record.salespersonId || record.salesEmpId || record.empId),
    deliveryRouteId: toTargetId(record.deliveryRouteId),
    paymentTerm: stringValue(record.paymentTerm) || undefined,
    internalNote: stringValue(record.internalNote) || undefined,
    customerNote: stringValue(record.customerNote) || undefined,
    metadata: {
      ...normalizeMetadata(record),
      clientMutationId: stringValue(record.clientMutationId),
      sourceEntity: 'hd-manager-ui',
    },
  });
};

export class HdConnectStagingApi {
  constructor(client) {
    this.client = client;
  }

  async login({ email, password, deviceName } = {}) {
    return normalizeVpsSession(await this.client.login({ email, password, deviceName }));
  }

  async restoreSession() {
    const restored = await this.client.restoreSession();
    if (!restored) return null;
    return normalizeVpsSession(restored.session, restored.currentUser);
  }

  async logout() {
    return this.client.logout();
  }

  async logoutAll() {
    return this.client.logoutAll();
  }

  async requestPasswordReset(email) {
    await this.client.post('/identity/password/forgot', { email: stringValue(email) }, {
      authenticate: false,
      retry: false,
      allowRefresh: false,
    });
    return {
      success: true,
      message: 'If the account exists, a password reset instruction has been requested.',
    };
  }

  async listCustomers(query = {}) {
    const result = await this.client.get('/master-data/customers', { query });
    return normalizePage(result, normalizeVpsCustomer);
  }

  async getCustomer(id) {
    return normalizeVpsCustomer(await this.client.get(`/master-data/customers/${id}`));
  }

  async createCustomer(record) {
    return normalizeVpsCustomer(await this.client.post('/master-data/customers', toCustomerPayload(record), {
      idempotencyKey: record.clientMutationId || createRequestId(),
      retry: false,
    }));
  }

  async updateCustomer(id, record) {
    return normalizeVpsCustomer(await this.client.patch(`/master-data/customers/${id}`, toCustomerPayload(record), {
      idempotencyKey: record.clientMutationId || createRequestId(),
      retry: false,
    }));
  }

  async deleteCustomer(id) {
    return this.client.delete(`/master-data/customers/${id}`, { retry: false });
  }

  async listUnits(query = {}) {
    return normalizePage(await this.client.get('/master-data/units', { query }), (unit) => unit);
  }

  async listProducts(query = {}) {
    return normalizePage(await this.client.get('/products', { query }), normalizeVpsProduct);
  }

  async getProduct(id) {
    return normalizeVpsProduct(await this.client.get(`/products/${id}`));
  }

  async createProduct(record) {
    return normalizeVpsProduct(await this.client.post('/products', toProductPayload(record), {
      idempotencyKey: record.clientMutationId || createRequestId(),
      retry: false,
    }));
  }

  async updateProduct(id, record) {
    return normalizeVpsProduct(await this.client.patch(`/products/${id}`, toProductPayload(record), {
      idempotencyKey: record.clientMutationId || createRequestId(),
      retry: false,
    }));
  }

  async deleteProduct(id) {
    return this.client.delete(`/products/${id}`, { retry: false });
  }

  async listProductPrices(id, query = {}) {
    return normalizePage(await this.client.get(`/products/${id}/prices`, { query }), (price) => price);
  }

  async listProductUnits(id, query = {}) {
    return normalizePage(await this.client.get(`/products/${id}/units`, { query }), (unit) => unit);
  }

  async listOrders(query = {}) {
    return normalizePage(await this.client.get('/sales/orders', { query }), normalizeVpsOrder);
  }

  async getOrder(id) {
    return normalizeVpsOrder(await this.client.get(`/sales/orders/${id}`));
  }

  async createOrder(record) {
    const clientMutationId = stringValue(record.clientMutationId) || createRequestId();
    const payload = toSalesOrderPayload({ ...record, clientMutationId });
    return normalizeVpsOrder(await this.client.post('/sales/orders', payload, {
      idempotencyKey: clientMutationId,
      retry: false,
    }));
  }

  async updateOrder(id, record) {
    const clientMutationId = stringValue(record.clientMutationId) || createRequestId();
    return normalizeVpsOrder(await this.client.patch(
      `/sales/orders/${id}`,
      toSalesOrderUpdatePayload({ ...record, clientMutationId }),
      { idempotencyKey: clientMutationId, retry: false },
    ));
  }

  async confirmOrder(id, note = '') {
    return normalizeVpsOrder(await this.client.post(`/sales/orders/${id}/confirm`, {
      ...(stringValue(note) ? { note: stringValue(note) } : {}),
    }, { retry: false }));
  }

  async cancelOrder(id, reason) {
    const normalizedReason = stringValue(reason);
    if (!normalizedReason) {
      throw new HdApiError('A cancellation reason is required.', {
        code: 'ORDER_CANCEL_REASON_REQUIRED',
      });
    }
    return normalizeVpsOrder(await this.client.post(`/sales/orders/${id}/cancel`, {
      reason: normalizedReason,
    }, { retry: false }));
  }

  async listPayments(query = {}) {
    return normalizePage(await this.client.get('/cx-suite/payments', { query }), normalizeVpsPayment);
  }
}

let stagingApi;

export const getHdConnectStagingApi = () => {
  if (!isVpsStagingMode) {
    throw new HdApiError('The VPS API client is only available in vps-staging mode.', {
      code: 'VPS_STAGING_MODE_REQUIRED',
    });
  }

  if (!stagingApi) {
    stagingApi = new HdConnectStagingApi(new HdApiClient({
      baseUrl: runtimeEnv.VITE_API_BASE_URL,
      deviceName: runtimeEnv.VITE_HD_DEVICE_NAME || 'HD Manager web staging',
    }));
  }

  return stagingApi;
};

export const createHdConnectStagingApi = (client) => new HdConnectStagingApi(client);
