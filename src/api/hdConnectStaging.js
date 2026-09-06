import { HdApiClient, HdApiError, createRequestId } from './client.js';
import { vpsAssetId, vpsAssetMutationPayload, vpsAssetQuery } from './vpsAssets.js';
import { vpsHolidayId, vpsHolidayMutationPayload, vpsHolidayQuery } from './vpsHolidays.js';
import { vpsSalaryAdvanceId, vpsSalaryAdvanceMutationPayload, vpsSalaryAdvanceQuery } from './vpsSalaryAdvances.js';
import { normalizeVpsEmployee } from './vpsEmployees.js';
import { customerLoanEditablePayload, listVpsCustomerLoanPage } from './vpsCustomerLoans.js';

const runtimeEnv = typeof import.meta !== 'undefined' && import.meta.env
  ? import.meta.env
  : {};

export const vpsDataMode = `${runtimeEnv.VITE_DATA_MODE || ''}`.trim();
export const isVpsProductionMode = vpsDataMode === 'vps-production';
export const isVpsStagingMode = vpsDataMode === 'vps-staging';
export const isVpsApiMode = isVpsStagingMode || isVpsProductionMode;
export const isVpsMode = isVpsApiMode;
export const inventoryVpsEnabled = runtimeEnv.VITE_INVENTORY_VPS_ENABLED === 'true';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value) => UUID_PATTERN.test(`${value || ''}`.trim());

const stringValue = (value) => `${value ?? ''}`.trim();

const unitLabel = (value) => (
  value && typeof value === 'object'
    ? stringValue(value.symbol || value.name || value.code)
    : stringValue(value)
);

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

const REALTIME_EVENT_DEDUPE_LIMIT = 256;

const normalizeReconnectDelay = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const waitForReconnect = (delayMs, signal) => new Promise((resolve) => {
  if (signal?.aborted || delayMs <= 0) {
    resolve();
    return;
  }

  const timer = globalThis.setTimeout(cleanup, delayMs);
  const abort = () => cleanup();

  function cleanup() {
    globalThis.clearTimeout(timer);
    signal?.removeEventListener?.('abort', abort);
    resolve();
  }

  signal?.addEventListener?.('abort', abort, { once: true });
});

const isAbortError = (error, signal) => Boolean(
  signal?.aborted || error?.name === 'AbortError',
);

const toTargetId = (value) => isUuid(value) ? `${value}` : undefined;

const requireIdentityInput = (value, code, message) => {
  const normalized = stringValue(value);
  if (!normalized) {
    throw new HdApiError(message, { code });
  }
  return normalized;
};

const normalizeVpsIdentitySession = (session = {}) => ({
  ...session,
  id: session.id,
  deviceId: session.id,
  name: session.deviceName || session.platform || 'Thiết bị',
  lastLoginAt: session.lastUsedAt || session.createdAt || '',
});

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
      phone: sourceUser.phone || sourceUser.phoneNormalized || '',
      phoneNormalized: sourceUser.phoneNormalized || sourceUser.phone || '',
      name: sourceUser.fullName || sourceUser.name || sourceUser.phone || sourceUser.email || '',
      displayName: sourceUser.fullName || sourceUser.name || sourceUser.phone || sourceUser.email || '',
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
  const salesEmployeeId = typeof record.salesEmployeeId === 'string' && isUuid(record.salesEmployeeId)
    ? stringValue(record.salesEmployeeId).toLowerCase() : null;

  const customer = {
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
    empId: salesEmployeeId || '',
    salesEmpId: salesEmployeeId || '',
    salesEmployeeId,
    vpsSalesEmployeeId: salesEmployeeId,
    userSalesOwnerId: record.salesOwnerId ?? null,
    salesEmployeeReconciliationRequired: !salesEmployeeId && Boolean(
      record.salesEmployeeId || attributes.empId || attributes.salesEmpId || attributes.legacyUi?.empId || attributes.legacyUi?.salesEmpId,
    ),
    creditLimit: toFiniteNumber(record.creditLimit) ?? attributes.creditLimit ?? 0,
    isArchived: Boolean(record.deletedAt) || record.status === 'ARCHIVED' || attributes.isArchived === true,
    legacySourceId: attributes.__hdcoProjection?.sourceRecordId || attributes.legacySourceId || '',
    createdAt: record.createdAt || attributes.createdAt || '',
    updatedAt: record.updatedAt || attributes.updatedAt || '',
    sourceSystem: 'hd-connect-vps',
  };
  // Legacy UI also interprets salesOwnerId as an employee alias; keep User identity separate.
  delete customer.salesOwnerId;
  return customer;
};

export const normalizeVpsProduct = (record = {}) => {
  const metadata = normalizeMetadata(record);
  const primaryUnit = record.salesUnit || record.baseUnit || record.inventoryUnit || record.purchaseUnit;
  const unit = unitLabel(record.unit) || unitLabel(primaryUnit) || unitLabel(metadata.unit);

  return {
    ...metadata,
    ...record,
    id: record.id,
    companyId: record.companyId,
    name: record.name || '',
    productName: record.name || metadata.productName || '',
    category: typeof record.category === 'string'
      ? record.category
      : (record.category?.name || (typeof metadata.category === 'string' ? metadata.category : '')),
    unit,
    unitId: record.salesUnitId || record.baseUnitId || primaryUnit?.id || metadata.unitId || '',
    isArchived: Boolean(record.deletedAt) || record.status === 'ARCHIVED' || metadata.isArchived === true,
    legacySourceId: metadata.__hdcoProjection?.sourceRecordId || metadata.legacySourceId || '',
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
    date: metadata.__hdcoProjection ? (metadata.date || record.orderDate || '') : (record.orderDate || metadata.date || ''),
    orderDate: record.orderDate || '',
    items: lines.map((line) => ({
      ...normalizeMetadata(line),
      ...line,
      id: line.id,
      productId: line.productId,
      unitId: line.unitId,
      unit: unitLabel(line.unit) || unitLabel(line.unitName) || unitLabel(normalizeMetadata(line).unit) || unitLabel(normalizeMetadata(line).quantityUnit),
      quantity: toFiniteNumber(line.quantity) ?? 0,
      unitPrice: toFiniteNumber(line.unitPrice) ?? 0,
    })),
    reviewStatus: metadata.__hdcoProjection ? (metadata.reviewStatus || record.status || '') : (record.status || metadata.reviewStatus || ''),
    isArchived: Boolean(record.deletedAt) || metadata.isArchived === true,
    legacySourceId: metadata.__hdcoProjection?.sourceRecordId || metadata.legacySourceId || '',
    createdAt: record.createdAt || metadata.createdAt || '',
    updatedAt: record.updatedAt || metadata.updatedAt || '',
    sourceSystem: 'hd-connect-vps',
  };
};

export const normalizeVpsPayment = (record = {}) => {
  const metadata = normalizeMetadata(record);
  const historical = Boolean(metadata.__hdcoProjection);
  return {
    ...metadata,
    ...record,
    id: record.id,
    companyId: record.companyId,
    customerId: record.customerTargetId || record.customerId || '',
    matchedOrderId: record.salesOrderTargetId || record.matchedOrderId || '',
    reference: record.reference || record.externalReference || record.externalPaymentId || '',
    amount: toFiniteNumber(record.amount) ?? 0,
    status: historical ? (metadata.status || '') : (record.status || ''),
    reconciliationStatus: historical ? (metadata.reconciliationStatus || '') : (record.reconciliationStatus || ''),
    projectionReconciliationStatus: historical ? (record.reconciliationStatus || '') : '',
    isArchived: Boolean(record.deletedAt) || metadata.isArchived === true,
    legacySourceId: metadata.__hdcoProjection?.sourceRecordId || '',
    sourceSystem: 'hd-connect-vps',
    readOnly: true,
  };
};

export const normalizeVpsFinanceExpense = (record = {}) => {
  const status = stringValue(record.status).toUpperCase();
  const metadata = normalizeMetadata(record);
  const historical = metadata.__hdcoProjection?.historicalOnly === true;
  const assetCost = metadata.hdManagerAssetCost?.kind === 'NATIVE_CREATE' && metadata.assetCostLogId === metadata.hdManagerAssetCost?.costId;

  return {
    ...metadata,
    ...record,
    id: record.id,
    companyId: record.companyId,
    branchId: record.branchId || '',
    empId: historical ? (metadata.__hdcoProjection.references?.employee || metadata.empId || '') : (record.createdBy || ''),
    amount: toFiniteNumber(record.amount) ?? 0,
    category: record.expenseType || 'Chi phí khác',
    note: record.description || '',
    date: stringValue(record.expenseDate || record.createdAt).slice(0, 10),
    approvalStatus: historical && metadata.approvalStatus ? metadata.approvalStatus : status === 'APPROVED' || status === 'POSTED'
      ? 'approved'
      : 'pending',
    requiresApproval: assetCost ? false : historical ? metadata.requiresApproval === true : status !== 'POSTED',
    handoverStatus: assetCost ? 'confirmed' : historical ? (metadata.handoverStatus || '') : status === 'POSTED' ? 'confirmed' : 'pending',
    isArchived: Boolean(record.deletedAt) || metadata.isArchived === true,
    legacySourceId: metadata.__hdcoProjection?.sourceRecordId || '',
    readOnly: historical || assetCost,
    sourceSystem: 'hd-connect-vps',
  };
};

export const normalizeVpsAttendance = (record = {}) => {
  const workDate = stringValue(record.workDate).slice(0, 10);
  const status = stringValue(record.status).toLowerCase();
  return {
    ...normalizeMetadata(record),
    ...record,
    id: record.id,
    companyId: record.companyId,
    employeeId: record.employeeId,
    empId: record.employeeId,
    date: workDate,
    workDate,
    checkIn: record.checkInAt || null,
    checkOut: record.checkOutAt || null,
    checkInMethod: record.checkInMethod || '',
    checkOutMethod: record.checkOutMethod || '',
    status: status === 'present' || status === 'late' || status === 'leave' || status === 'absent'
      ? status
      : 'present',
    sourceSystem: 'hd-connect-vps',
  };
};

const toCustomerSalesEmployeeId = (record) => {
  const reconcile = () => {
    throw new HdApiError('Select a mapped native HR employee before saving this customer.', { code: 'reconciliation_required' });
  };
  const values = ['empId', 'salesEmpId', 'salesEmployeeId']
    .filter(key => record[key] !== undefined)
    .map(key => {
      const value = record[key];
      if (value === null || value === '') return null;
      if (typeof value !== 'string' || !isUuid(value)) return reconcile();
      return stringValue(value).toLowerCase();
    });
  // A normalized customer may retain old aliases while the form edits just empId.
  const changed = record.sourceSystem === 'hd-connect-vps' && Object.hasOwn(record, 'vpsSalesEmployeeId')
    ? values.filter(value => value !== record.vpsSalesEmployeeId) : values;
  const targets = [...new Set(changed.length ? changed : values)];
  if (targets.length > 1) return reconcile();
  const target = targets[0];
  const attributes = normalizeAttributes(record);
  if (!target && (record.salesEmployeeReconciliationRequired || attributes.empId || attributes.salesEmpId || attributes.legacyUi?.empId || attributes.legacyUi?.salesEmpId)
    && !record.vpsSalesEmployeeId) return reconcile();
  return target;
};

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
    salesOwnerId: toTargetId(record.salesOwnerId),
    salesEmployeeId: toCustomerSalesEmployeeId(record),
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

const toSalesOrderLinePayload = (line, index, clientMutationId) => {
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
      clientMutationId: stringValue(clientMutationId),
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

  const lines = sourceLines.map((line, index) => (
    toSalesOrderLinePayload(line, index, record.clientMutationId)
  ));

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
  const sourceLines = Array.isArray(record.lines)
    ? record.lines
    : (Array.isArray(record.items) ? record.items : undefined);
  if (sourceLines && sourceLines.length === 0) {
    throw new HdApiError('An order requires at least one item.', {
      code: 'ORDER_LINES_REQUIRED',
    });
  }

  return omitUndefined({
    clientMutationId: stringValue(record.clientMutationId) || undefined,
    branchId: toTargetId(record.branchId),
    salespersonId: toTargetId(record.salespersonId || record.salesEmpId || record.empId),
    deliveryRouteId: toTargetId(record.deliveryRouteId),
    paymentTerm: stringValue(record.paymentTerm) || undefined,
    internalNote: stringValue(record.internalNote) || undefined,
    customerNote: stringValue(record.customerNote) || undefined,
    discountType: ['PERCENTAGE', 'AMOUNT'].includes(stringValue(record.discountType).toUpperCase())
      ? stringValue(record.discountType).toUpperCase()
      : undefined,
    discountValue: toFiniteNumber(record.discountValue),
    lines: sourceLines?.map((line, index) => (
      toSalesOrderLinePayload(line, index, record.clientMutationId)
    )),
    metadata: {
      ...normalizeMetadata(record),
      clientMutationId: stringValue(record.clientMutationId),
      sourceEntity: 'hd-manager-ui',
    },
  });
};

const toTenantSafePayload = (record = {}) => {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return {};
  const {
    companyId: _companyId,
    tenantId: _tenantId,
    organizationId: _organizationId,
    ...payload
  } = record;
  return payload;
};

const toTenantSafeQuery = (query = {}) => {
  if (!query || typeof query !== 'object' || Array.isArray(query)) return {};
  const {
    companyId: _companyId,
    tenantId: _tenantId,
    organizationId: _organizationId,
    ...safeQuery
  } = query;
  return safeQuery;
};

const mutationOptions = (record = {}) => ({
  idempotencyKey: stringValue(record.clientMutationId) || createRequestId(),
  retry: false,
});

const normalizeUnitKey = (value) => stringValue(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, '');

/**
 * Build the signed inventory transaction payload without inventing a unit,
 * warehouse, conversion, or quantity. Legacy UI callers must provide the
 * resolved target IDs explicitly.
 */
export const buildVpsInventoryTransaction = (record = {}, { referenceType = 'HD_MANAGER' } = {}) => {
  const warehouseId = toTargetId(record.warehouseId);
  const productId = toTargetId(record.productId);
  const unitId = toTargetId(record.unitId);
  const quantity = toFiniteNumber(record.quantity);

  if (!warehouseId || !productId || !unitId) {
    throw new HdApiError(
      'Inventory mutation requires resolved warehouseId, productId, and unitId.',
      { code: 'INVENTORY_TARGET_MAPPING_REQUIRED' },
    );
  }
  if (!quantity || quantity <= 0) {
    throw new HdApiError('Inventory mutation requires a positive quantity.', {
      code: 'INVENTORY_QUANTITY_REQUIRED',
    });
  }

  const requestedUnit = normalizeUnitKey(record.quantityUnit || record.unit);
  const resolvedUnit = normalizeUnitKey(record.unitLabel || record.unitName || record.unitSymbol);
  if (requestedUnit && resolvedUnit && requestedUnit !== resolvedUnit) {
    throw new HdApiError(
      'The selected quantity unit does not match the resolved VPS unit.',
      { code: 'INVENTORY_UNIT_MAPPING_MISMATCH' },
    );
  }

  return omitUndefined({
    warehouseId,
    productId,
    unitId,
    orderId: toTargetId(record.orderId),
    orderLineId: toTargetId(record.orderLineId),
    reservationId: toTargetId(record.reservationId),
    sourceDispatchId: stringValue(record.sourceDispatchId) || undefined,
    zoneId: toTargetId(record.zoneId),
    binLocationId: toTargetId(record.binLocationId),
    variantId: toTargetId(record.variantId),
    batchId: toTargetId(record.batchId),
    serialId: toTargetId(record.serialId),
    quantity,
    inventoryStatus: stringValue(record.inventoryStatus) || undefined,
    referenceType: stringValue(record.referenceType) || referenceType,
    referenceId: stringValue(record.referenceId || record.sourceRecordId) || undefined,
    reason: stringValue(record.reason || record.note) || undefined,
    actualCount: toFiniteNumber(record.actualCount ?? record.quantityCount ?? record.packedQuantity),
    actualWeightKg: toFiniteNumber(record.actualWeightKg ?? record.weightKg ?? record.totalKg),
    lossWeightKg: toFiniteNumber(record.lossWeightKg),
    weightNotes: stringValue(record.weightNotes) || undefined,
    metadata: {
      ...normalizeMetadata(record),
      sourceEntity: 'hd-manager-ui',
      sourceRecordId: stringValue(record.sourceRecordId || record.id) || undefined,
      quantityUnit: stringValue(record.quantityUnit || record.unit) || undefined,
      packedQuantity: toFiniteNumber(record.packedQuantity),
      billingQuantity: toFiniteNumber(record.billingQuantity),
      billingUnit: stringValue(record.billingUnit) || undefined,
    },
  });
};

export const normalizeVpsStockMovement = (record = {}, legacy = {}) => {
  const metadata = normalizeMetadata(record);
  const unit = unitLabel(record.unit) || unitLabel(record.unitOfMeasure) || metadata.quantityUnit || legacy.quantityUnit || '';
  return {
    ...legacy,
    ...record,
    id: record.id || legacy.id || '',
    companyId: record.companyId || legacy.companyId || '',
    warehouseId: record.warehouseId || legacy.warehouseId || '',
    productId: record.productId || legacy.productId || '',
    unitId: record.unitId || legacy.unitId || '',
    quantity: toFiniteNumber(record.quantity) ?? toFiniteNumber(legacy.quantity) ?? 0,
    quantityUnit: unit,
    weightKg: toFiniteNumber(record.actualWeightKg ?? metadata.weightKg ?? legacy.weightKg) ?? 0,
    sourceSystem: 'hd-connect-vps',
    readOnlyLedger: true,
  };
};

// Historical warehouse rows preserve the legacy document verbatim in metadata.
// They are display-only until a warehouse/product/unit target mapping exists;
// source IDs must never be treated as mutable VPS master-data IDs.
export const normalizeVpsWarehouseHistoryRecord = (record = {}, type = 'IMPORT') => {
  const metadata = normalizeMetadata(record);
  const quantity = toFiniteNumber(record.quantity) ?? toFiniteNumber(metadata.quantity) ?? 0;
  const weightKg = toFiniteNumber(record.weight) ?? toFiniteNumber(metadata.weightKg ?? metadata.totalKg) ?? 0;
  const occurredAt = record.occurredAt || metadata.date || record.createdAt || '';

  return {
    ...metadata,
    id: record.id || '',
    companyId: record.companyId || '',
    warehouseId: record.warehouseTargetId || '',
    productId: record.productTargetId || '',
    unitId: record.unitTargetId || '',
    orderRequestId: record.orderRequestTargetId || '',
    sourceWarehouseId: metadata.warehouseId || '',
    sourceProductId: metadata.productId || '',
    sourceUnitId: metadata.unitId || '',
    legacySourceId: record.sourceDocumentId || metadata.id || '',
    productName: metadata.productName || metadata.productNameSnapshot || metadata.groupName || '',
    productNameSnapshot: metadata.productNameSnapshot || metadata.productName || metadata.groupName || '',
    groupName: metadata.groupName || metadata.productGroup || '',
    quantity,
    totalQuantity: quantity,
    quantityUnit: stringValue(metadata.quantityUnit || metadata.unit || ''),
    weightKg,
    totalKg: weightKg,
    date: typeof occurredAt === 'string' ? occurredAt.slice(0, 10) : '',
    occurredAt,
    status: record.status || metadata.status || '',
    isArchived: false,
    createdAt: record.createdAt || '',
    updatedAt: record.updatedAt || '',
    sourceSystem: 'hd-connect-vps-history',
    historyType: type,
    historicalOnly: true,
    readOnlyLedger: true,
  };
};

export class HdConnectStagingApi {
  constructor(client) {
    this.client = client;
  }

  async login({ phone, email, password, deviceName } = {}) {
    return normalizeVpsSession(await this.client.login({ phone, email, password, deviceName }));
  }

  async register({ companyCode, companyName, phone, password, fullName, deviceName } = {}) {
    return normalizeVpsSession(await this.client.register({
      companyCode,
      companyName,
      phone,
      password,
      fullName,
      deviceName,
    }));
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

  async completePasswordReset({ token, newPassword } = {}) {
    const normalizedToken = requireIdentityInput(
      token,
      'PASSWORD_RESET_TOKEN_REQUIRED',
      'A password reset token is required.',
    );
    if (normalizedToken.length < 20 || `${newPassword || ''}`.length < 8) {
      throw new HdApiError('The password reset input is invalid.', {
        code: 'PASSWORD_RESET_INPUT_INVALID',
      });
    }
    return this.client.post('/identity/password/reset', {
      token: normalizedToken,
      newPassword,
    }, {
      authenticate: false,
      retry: false,
      allowRefresh: false,
    });
  }

  async getIdentityProfile() {
    return this.client.get('/identity/me');
  }

  async updateIdentityProfile(record = {}) {
    return this.client.patch('/identity/me/profile', record, { retry: false });
  }

  async updateIdentityPreferences(record = {}) {
    return this.client.patch('/identity/me/preferences', record, { retry: false });
  }

  async changeIdentityPassword({ currentPassword, newPassword } = {}) {
    if (!currentPassword || `${newPassword || ''}`.length < 8) {
      throw new HdApiError('Current password and a new password of at least 8 characters are required.', {
        code: 'PASSWORD_CHANGE_INPUT_INVALID',
      });
    }
    return this.client.post('/identity/password/change', {
      currentPassword,
      newPassword,
    }, { retry: false });
  }

  async getIdentityPasswordPolicy() {
    return this.client.get('/identity/password/policy');
  }

  async listIdentitySessions() {
    const result = await this.client.get('/identity/sessions');
    const items = Array.isArray(result)
      ? result
      : (Array.isArray(result?.items) ? result.items : []);
    return {
      items: items.map(normalizeVpsIdentitySession),
      pagination: result?.pagination ?? null,
    };
  }

  async revokeIdentitySession(sessionId) {
    const normalizedSessionId = requireIdentityInput(
      sessionId,
      'IDENTITY_SESSION_ID_REQUIRED',
      'A session id is required.',
    );
    if (!isUuid(normalizedSessionId)) {
      throw new HdApiError('The session id is invalid.', {
        code: 'IDENTITY_SESSION_ID_INVALID',
      });
    }
    return this.client.delete(`/identity/sessions/${normalizedSessionId}`, { retry: false });
  }

  async listIdentityAudit(query = {}) {
    const result = await this.client.get('/audit', { query });
    const entries = Array.isArray(result)
      ? result
      : (Array.isArray(result?.items) ? result.items : []);
    return {
      entries,
      pagination: result?.pagination ?? null,
    };
  }

  async listCustomers(query = {}) {
    const result = await this.client.get('/master-data/customers', { query });
    return normalizePage(result, normalizeVpsCustomer);
  }

  async listCustomerLoans(query = {}) {
    return listVpsCustomerLoanPage(this.client, query);
  }

  async createCustomerLoan({ requestId, customerId, ...record }) {
    return this.client.post('/master-data/customer-goods-loans', {
      requestId, customerId, ...customerLoanEditablePayload(record),
    }, { retry: false, idempotencyKey: requestId });
  }

  async updateCustomerLoan(id, { version, ...record }) {
    return this.client.patch(`/master-data/customer-goods-loans/${id}`, {
      version, ...customerLoanEditablePayload(record),
    }, { retry: false });
  }

  async returnCustomerLoan(id, { requestId, version, quantity, weightKg, returnDate, note }) {
    return this.client.post(`/master-data/customer-goods-loans/${id}/returns`, {
      requestId, version, quantity, weightKg, returnDate, note,
    }, { retry: false, idempotencyKey: requestId });
  }

  async archiveCustomerLoan(id, { version }) {
    return this.client.post(`/master-data/customer-goods-loans/${id}/archive`, { version }, { retry: false });
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

  async listPaymentHistory(query = {}) {
    return normalizePage(await this.client.get('/finance-suite/payments/history', { query: toTenantSafeQuery(query) }), normalizeVpsPayment);
  }

  async getHistoricalCustomerLedger(id) {
    const customerId = requireIdentityInput(id, 'CUSTOMER_ID_REQUIRED', 'A customer id is required.');
    return this.client.get(`/finance-suite/customers/${encodeURIComponent(customerId)}/historical-ledger`);
  }

  // These methods intentionally mirror existing VPS contracts. They do not
  // translate legacy Firebase records or invent domain rules; callers must
  // provide already-resolved target IDs and domain-valid DTO fields.
  async listWarehouses(query = {}) {
    return normalizePage(await this.client.get('/warehouse-suite/warehouses', { query: toTenantSafeQuery(query) }), (item) => item);
  }

  async createWarehouse(record = {}) {
    return this.client.post('/warehouse-suite/warehouses', toTenantSafePayload(record), mutationOptions(record));
  }

  async updateWarehouse(id, record = {}) {
    return this.client.patch(`/warehouse-suite/warehouses/${id}`, toTenantSafePayload(record), mutationOptions(record));
  }

  async deleteWarehouse(id) {
    return this.client.delete(`/warehouse-suite/warehouses/${id}`, { retry: false });
  }

  async restoreWarehouse(id) {
    return this.client.post(`/warehouse-suite/warehouses/${id}/restore`, undefined, { retry: false });
  }

  async listWarehouseBalances(query = {}) {
    return normalizePage(await this.client.get('/warehouse-suite/balances', { query: toTenantSafeQuery(query) }), (item) => item);
  }

  async getInventoryReconciliationStatus() {
    return this.client.get('/inventory/reconciliation-status');
  }

  async listWarehouseLedger(query = {}) {
    return normalizePage(await this.client.get('/warehouse-suite/ledger', { query: toTenantSafeQuery(query) }), (item) => item);
  }

  async listWarehouseHistoryImports(query = {}) {
    return normalizePage(
      await this.client.get('/warehouse-suite/history/imports', { query: toTenantSafeQuery(query) }),
      (item) => normalizeVpsWarehouseHistoryRecord(item, 'IMPORT'),
    );
  }

  async listWarehouseHistoryDispatches(query = {}) {
    return normalizePage(
      await this.client.get('/warehouse-suite/history/dispatches', { query: toTenantSafeQuery(query) }),
      (item) => normalizeVpsWarehouseHistoryRecord(item, 'DISPATCH'),
    );
  }

  async listWarehouseCountSessions(query = {}) {
    return normalizePage(await this.client.get('/warehouse-suite/counts', { query: toTenantSafeQuery(query) }), (item) => item);
  }

  async createWarehouseCountSession(record = {}) {
    return this.client.post('/warehouse-suite/counts', toTenantSafePayload(record), mutationOptions(record));
  }

  async addWarehouseCountLine(sessionId, record = {}) {
    const safeSessionId = requireIdentityInput(sessionId, 'STOCK_COUNT_SESSION_ID_REQUIRED', 'A stock count session id is required.');
    return this.client.post(`/warehouse-suite/counts/${safeSessionId}/lines`, toTenantSafePayload(record), mutationOptions(record));
  }

  async postWarehouseCountSession(sessionId) {
    const safeSessionId = requireIdentityInput(sessionId, 'STOCK_COUNT_SESSION_ID_REQUIRED', 'A stock count session id is required.');
    return this.client.post(`/warehouse-suite/counts/${safeSessionId}/post`, undefined, { retry: false });
  }

  async postWarehouseStockIn(record = {}) {
    return this.client.post('/warehouse-suite/stock-in', toTenantSafePayload(record), mutationOptions(record));
  }

  async postWarehouseStockOut(record = {}) {
    return this.client.post('/warehouse-suite/stock-out', toTenantSafePayload(record), mutationOptions(record));
  }

  async listWarehouseTransfers(query = {}) {
    return normalizePage(await this.client.get('/warehouse-suite/transfers', { query: toTenantSafeQuery(query) }), (item) => item);
  }

  async createWarehouseTransfer(record = {}) {
    return this.client.post('/warehouse-suite/transfers', toTenantSafePayload(record), mutationOptions(record));
  }

  async postWarehouseTransfer(transferId) {
    const safeTransferId = requireIdentityInput(transferId, 'WAREHOUSE_TRANSFER_ID_REQUIRED', 'A warehouse transfer id is required.');
    return this.client.post(`/warehouse-suite/transfers/${safeTransferId}/post`, undefined, { retry: false });
  }

  async createWarehouseAdjustment(record = {}, direction = 'increase') {
    if (!['increase', 'decrease'].includes(direction)) {
      throw new HdApiError('The warehouse adjustment direction is invalid.', {
        code: 'WAREHOUSE_ADJUSTMENT_DIRECTION_INVALID',
      });
    }
    return this.client.post(`/warehouse-suite/adjustments/${direction}`, toTenantSafePayload(record), mutationOptions(record));
  }

  async listInventory(query = {}) {
    return normalizePage(await this.client.get('/inventory/lookup', { query: toTenantSafeQuery(query) }), (item) => item);
  }

  async listInventoryLedger(query = {}) {
    return normalizePage(await this.client.get('/inventory/ledger', { query: toTenantSafeQuery(query) }), (item) => item);
  }

  async listInventoryBalances(query = {}) {
    return normalizePage(await this.client.get('/inventory/balances', { query: toTenantSafeQuery(query) }), (item) => item);
  }

  async postInventoryOpeningBalance(record = {}) {
    return this.client.post('/inventory/transactions/opening-balance', toTenantSafePayload(record), mutationOptions(record));
  }

  async postInventoryStockIn(record = {}) {
    return this.client.post('/inventory/transactions/stock-in', toTenantSafePayload(record), mutationOptions(record));
  }

  async postInventoryStockOut(record = {}) {
    return this.client.post('/inventory/transactions/stock-out', toTenantSafePayload(record), mutationOptions(record));
  }

  async postInventoryAdjustment(record = {}, direction = 'increase') {
    if (!['increase', 'decrease'].includes(direction)) {
      throw new HdApiError('The inventory adjustment direction is invalid.', {
        code: 'INVENTORY_ADJUSTMENT_DIRECTION_INVALID',
      });
    }
    return this.client.post(`/inventory/adjustments/${direction}`, toTenantSafePayload(record), mutationOptions(record));
  }

  async listLogisticsDeliveries(query = {}) {
    return normalizePage(
      await this.client.get('/logistics-suite/deliveries', { query: toTenantSafeQuery(query) }),
      (item) => item,
    );
  }

  async listLogisticsVehicles(query = {}) {
    return normalizePage(
      await this.client.get('/logistics-suite/vehicles', { query: toTenantSafeQuery(query) }),
      (item) => item,
    );
  }

  async listLogisticsDrivers(query = {}) {
    return normalizePage(
      await this.client.get('/logistics-suite/drivers', { query: toTenantSafeQuery(query) }),
      (item) => item,
    );
  }

  async listLogisticsTeams(query = {}) {
    return normalizePage(
      await this.client.get('/logistics-suite/teams', { query: toTenantSafeQuery(query) }),
      (item) => item,
    );
  }

  async getLogisticsDelivery(id) {
    return this.client.get(`/logistics-suite/deliveries/${id}`);
  }

  async assignLogisticsDelivery(id, record = {}) {
    const deliveryId = requireIdentityInput(
      id,
      'LOGISTICS_DELIVERY_ID_REQUIRED',
      'A delivery id is required.',
    );
    if (!isUuid(deliveryId)) {
      throw new HdApiError('The delivery id is invalid.', {
        code: 'LOGISTICS_DELIVERY_ID_INVALID',
      });
    }
    const payload = {};
    for (const [field, code] of [
      ['vehicleId', 'LOGISTICS_VEHICLE_ID_INVALID'],
      ['driverId', 'LOGISTICS_DRIVER_ID_INVALID'],
      ['teamId', 'LOGISTICS_TEAM_ID_INVALID'],
    ]) {
      const value = stringValue(record[field]);
      if (!value) continue;
      if (!isUuid(value)) {
        throw new HdApiError(`The ${field} is invalid.`, { code });
      }
      payload[field] = value;
    }
    const reason = stringValue(record.reason);
    if (reason) payload.reason = reason;
    return this.client.post(
      `/logistics-suite/deliveries/${deliveryId}/assign`,
      payload,
      { retry: false },
    );
  }

  async createLogisticsDelivery(record = {}) {
    const { clientMutationId, ...payload } = record;
    return this.client.post(
      '/logistics-suite/deliveries',
      toTenantSafePayload(payload),
      {
        idempotencyKey: clientMutationId || createRequestId(),
        retry: false,
      },
    );
  }

  async transitionLogisticsDelivery(id, record = {}) {
    const deliveryId = requireIdentityInput(
      id,
      'LOGISTICS_DELIVERY_ID_REQUIRED',
      'A delivery id is required.',
    );
    if (!isUuid(deliveryId)) {
      throw new HdApiError('The delivery id is invalid.', {
        code: 'LOGISTICS_DELIVERY_ID_INVALID',
      });
    }
    const transitionCode = stringValue(record.transitionCode).toUpperCase();
    if (!transitionCode) {
      throw new HdApiError('A delivery lifecycle transition is required.', {
        code: 'LOGISTICS_DELIVERY_TRANSITION_REQUIRED',
      });
    }
    return this.client.post(
      `/logistics-suite/deliveries/${deliveryId}/transition`,
      {
        transitionCode,
        ...(stringValue(record.reason) ? { reason: stringValue(record.reason) } : {}),
      },
      { retry: false },
    );
  }

  async listFinanceCashAccounts(query = {}) {
    return normalizePage(await this.client.get('/finance-suite/cash-accounts', { query: toTenantSafeQuery(query) }), (item) => item);
  }

  async createFinanceCashAccount(record = {}) {
    return this.client.post('/finance-suite/cash-accounts', toTenantSafePayload(record), mutationOptions(record));
  }

  async listFinanceCashTransactions(query = {}) {
    return normalizePage(await this.client.get('/finance-suite/cash-transactions', { query: toTenantSafeQuery(query) }), (item) => item);
  }

  async createFinanceCashTransaction(record = {}) {
    return this.client.post('/finance-suite/cash-transactions', toTenantSafePayload(record), mutationOptions(record));
  }

  async createFinanceCustomerReceipt(record = {}) {
    const { clientMutationId, ...payload } = record;
    return this.client.post('/finance-suite/receipts', toTenantSafePayload(payload), {
      idempotencyKey: clientMutationId || createRequestId(),
      retry: false,
    });
  }

  async listFinanceReceivables(query = {}) {
    return normalizePage(await this.client.get('/finance-suite/receivables', { query: toTenantSafeQuery(query) }), (item) => item);
  }

  async createFinanceReceivable(record = {}) {
    return this.client.post('/finance-suite/receivables', toTenantSafePayload(record), mutationOptions(record));
  }

  async listFinancePayables(query = {}) {
    return normalizePage(await this.client.get('/finance-suite/payables', { query: toTenantSafeQuery(query) }), (item) => item);
  }

  async createFinancePayable(record = {}) {
    return this.client.post('/finance-suite/payables', toTenantSafePayload(record), mutationOptions(record));
  }

  async createFinanceDebtMovement(record = {}) {
    return this.client.post('/finance-suite/debt-movements', toTenantSafePayload(record), mutationOptions(record));
  }

  async getFinanceAging() {
    return this.client.get('/finance-suite/aging');
  }

  async listFinanceExpenses(query = {}) {
    return normalizePage(await this.client.get('/finance-suite/expenses', { query: toTenantSafeQuery(query) }), (item) => item);
  }

  async createFinanceExpense(record = {}) {
    return this.client.post('/finance-suite/expenses', toTenantSafePayload(record), mutationOptions(record));
  }

  async approveFinanceExpense(id) {
    return this.client.post(`/finance-suite/expenses/${id}/approve`, undefined, { retry: false });
  }

  async postFinanceExpense(id) {
    return this.client.post(`/finance-suite/expenses/${id}/post`, undefined, { retry: false });
  }

  async listNotifications(query = {}) {
    return normalizePage(await this.client.get('/notifications', { query: toTenantSafeQuery(query) }), (item) => item);
  }

  async listUnreadNotifications() {
    return this.client.get('/notifications/unread');
  }

  async markNotificationsRead({ notificationIds = [], all = false } = {}) {
    return this.client.post('/notifications/read', {
      notificationIds: toStringArray(notificationIds),
      all: Boolean(all),
    }, { retry: false });
  }

  async archiveNotifications({ notificationIds = [], all = false } = {}) {
    return this.client.post('/notifications/archive', {
      notificationIds: toStringArray(notificationIds),
      all: Boolean(all),
    }, { retry: false });
  }

  async sendNotification(record = {}) {
    return this.client.post('/notifications/send', toTenantSafePayload(record), mutationOptions(record));
  }

  async listLegacyBusiness(query = {}) {
    return normalizePage(
      await this.client.get('/legacy-business', { query: toTenantSafeQuery(query) }),
      (item) => item,
    );
  }

  async getLegacyBusinessSummary() {
    return this.client.get('/legacy-business/summary');
  }

  async listStorage(query = {}) {
    return normalizePage(await this.client.get('/storage', { query: toTenantSafeQuery(query) }), (item) => item);
  }

  async getStorageMetadata(id) {
    return this.client.get(`/storage/metadata/${id}`);
  }

  async getStorageDownload(id) {
    return this.client.get(`/storage/download/${id}`);
  }

  async getStorageSignedUrl(record = {}) {
    return this.client.post('/storage/signed-url', toTenantSafePayload(record), { retry: false });
  }

  async uploadStorageFile(record = {}) {
    const payload = toTenantSafePayload(record);
    if (!stringValue(payload.fileName) || !stringValue(payload.mimeType)) {
      throw new HdApiError('Storage upload requires a file name and MIME type.', {
        code: 'STORAGE_FILE_METADATA_REQUIRED',
      });
    }
    if (!stringValue(payload.contentBase64) && !stringValue(payload.contentText)) {
      throw new HdApiError('Storage upload requires base64 or text content.', {
        code: 'STORAGE_FILE_CONTENT_REQUIRED',
      });
    }
    return this.client.post('/storage/upload', payload, { retry: false });
  }

  async archiveStorageFile(record = {}) {
    return this.client.post('/storage/archive', toTenantSafePayload(record), { retry: false });
  }

  async getExecutiveDashboard(query = {}) {
    return this.client.get('/executive/dashboard', { query });
  }

  async getExecutiveReports(query = {}) {
    return normalizePage(await this.client.get('/executive/reports', { query: toTenantSafeQuery(query) }), (item) => item);
  }

  async getPlatformConfig(query = {}) {
    return this.client.get('/platform/config', { query: toTenantSafeQuery(query) });
  }

  async getManagerSettings() {
    return this.client.get('/company-settings/manager');
  }

  async updateManagerSettings({ version, settings }) {
    return this.client.patch('/company-settings/manager', { version, settings }, { retry: false });
  }

  async getPlatformFlags(query = {}) {
    return normalizePage(await this.client.get('/platform/flags', { query: toTenantSafeQuery(query) }), (item) => item);
  }

  async listEmployees(query = {}) {
    return normalizePage(await this.client.get('/hr-suite/employees', { query: toTenantSafeQuery(query) }), normalizeVpsEmployee);
  }

  async getManagerEmployee(id) {
    return this.client.get(`/hr-suite/manager-employees/${id}`);
  }

  async createManagerEmployee({ requestId, profile }) {
    return this.client.post('/hr-suite/manager-employees', { requestId, profile }, { retry: false });
  }

  async updateManagerEmployee(id, { version, profile }) {
    return this.client.patch(`/hr-suite/manager-employees/${id}`, { version, profile }, { retry: false });
  }

  async createEmployee(record = {}) {
    return this.client.post('/hr-suite/employees', toTenantSafePayload(record), mutationOptions(record));
  }

  async updateEmployee(id, record = {}) {
    return this.client.patch(`/hr-suite/employees/${id}`, toTenantSafePayload(record), mutationOptions(record));
  }

  async terminateEmployee(id) {
    return this.client.post(`/hr-suite/employees/${id}/terminate`, undefined, { retry: false });
  }

  async listAttendance(query = {}) {
    return normalizePage(await this.client.get('/hr-suite/attendance', { query }), (item) => item);
  }

  async recordAttendance(record = {}) {
    return this.client.post('/hr-suite/attendance', toTenantSafePayload(record), mutationOptions(record));
  }

  async listHrPerformanceReviews(query = {}) {
    return normalizePage(await this.client.get('/hr-suite/performance-reviews', { query: toTenantSafeQuery(query) }), (item) => item);
  }

  async createHrPerformanceReview(record = {}) {
    return this.client.post('/hr-suite/performance-reviews', toTenantSafePayload(record), mutationOptions(record));
  }

  async listPayrolls(query = {}) {
    return normalizePage(await this.client.get('/hr-suite/payrolls', { query }), (item) => item);
  }

  async getPayroll(id) {
    return this.client.get(`/hr-suite/payrolls/${id}`);
  }

  async listManagerHolidays(query = {}) {
    return this.client.get('/hr-suite/manager-holidays', { query: vpsHolidayQuery(query) });
  }

  async listManagerAssets(query = {}) {
    return this.client.get('/logistics-suite/manager-assets', { query: vpsAssetQuery(query) });
  }

  async listManagerAssetCosts(query = {}) {
    return this.client.get('/logistics-suite/manager-asset-costs', { query: vpsAssetQuery(query) });
  }

  async createManagerAssetCost(record) {
    return this.client.post('/logistics-suite/manager-asset-costs', record, { retry: false });
  }

  async updateManagerAssetCost(id, record) {
    return this.client.patch(`/logistics-suite/manager-asset-costs/${vpsAssetId(id)}`, record, { retry: false });
  }

  async archiveManagerAssetCost(id, record) {
    return this.client.post(`/logistics-suite/manager-asset-costs/${vpsAssetId(id)}/archive`, record, { retry: false });
  }

  async getManagerAsset(id, query = {}) {
    return this.client.get(`/logistics-suite/manager-assets/${vpsAssetId(id)}`, { query: vpsAssetQuery(query, true) });
  }

  async createManagerAsset(record) {
    return this.client.post('/logistics-suite/manager-assets', vpsAssetMutationPayload('create', record), { retry: false });
  }

  async updateManagerAsset(id, record) {
    return this.client.patch(`/logistics-suite/manager-assets/${vpsAssetId(id)}`, vpsAssetMutationPayload('update', record), { retry: false });
  }

  async archiveManagerAsset(id, record) {
    return this.client.post(`/logistics-suite/manager-assets/${vpsAssetId(id)}/archive`, vpsAssetMutationPayload('archive', record), { retry: false });
  }

  async getManagerHoliday(id) {
    return this.client.get(`/hr-suite/manager-holidays/${vpsHolidayId(id)}`);
  }

  async createManagerHoliday(record) {
    return this.client.post('/hr-suite/manager-holidays', vpsHolidayMutationPayload('create', record), { retry: false });
  }

  async updateManagerHoliday(id, record) {
    return this.client.patch(`/hr-suite/manager-holidays/${vpsHolidayId(id)}`, vpsHolidayMutationPayload('update', record), { retry: false });
  }

  async archiveManagerHoliday(id, record) {
    return this.client.post(`/hr-suite/manager-holidays/${vpsHolidayId(id)}/archive`, vpsHolidayMutationPayload('archive', record), { retry: false });
  }

  async listManagerSalaryAdvances(query = {}) {
    return this.client.get('/hr-suite/manager-salary-advances', { query: vpsSalaryAdvanceQuery(query) });
  }

  async createManagerSalaryAdvance(record) {
    return this.client.post('/hr-suite/manager-salary-advances', vpsSalaryAdvanceMutationPayload('create', record), { retry: false });
  }

  async approveManagerSalaryAdvance(id, record) {
    return this.client.post(`/hr-suite/manager-salary-advances/${vpsSalaryAdvanceId(id)}/approve`, vpsSalaryAdvanceMutationPayload('approve', record), { retry: false });
  }

  async rejectManagerSalaryAdvance(id, record) {
    return this.client.post(`/hr-suite/manager-salary-advances/${vpsSalaryAdvanceId(id)}/reject`, vpsSalaryAdvanceMutationPayload('reject', record), { retry: false });
  }

  async cancelManagerSalaryAdvance(id, record) {
    return this.client.post(`/hr-suite/manager-salary-advances/${vpsSalaryAdvanceId(id)}/cancel`, vpsSalaryAdvanceMutationPayload('cancel', record), { retry: false });
  }

  async listPayrollPeriods(query = {}) {
    return normalizePage(await this.client.get('/hr-suite/payroll-periods', { query }), (item) => item);
  }

  async createPayrollPeriod(record = {}) {
    return this.client.post('/hr-suite/payroll-periods', toTenantSafePayload(record), mutationOptions(record));
  }

  async generatePayroll(record = {}) {
    return this.client.post('/hr-suite/payrolls/generate', toTenantSafePayload(record), mutationOptions(record));
  }

  async approvePayroll(id, record = {}) {
    return this.client.post(`/hr-suite/payrolls/${id}/approve`, undefined, mutationOptions(record));
  }

  async lockPayroll(id, record = {}) {
    return this.client.post(`/hr-suite/payrolls/${id}/lock`, undefined, mutationOptions(record));
  }

  async listDocuments(query = {}) {
    return normalizePage(await this.client.get('/documents', { query }), (item) => item);
  }

  async createDocument(record = {}) {
    return this.client.post('/documents', toTenantSafePayload(record), mutationOptions(record));
  }

  async updateDocument(id, record = {}) {
    return this.client.patch(`/documents/${id}`, toTenantSafePayload(record), mutationOptions(record));
  }

  async archiveDocument(id) {
    return this.client.post(`/documents/${id}/archive`, undefined, { retry: false });
  }

  async listEvents(query = {}) {
    return normalizePage(await this.client.get('/events', { query }), (item) => item);
  }

  async listWorkerJobs(query = {}) {
    return normalizePage(await this.client.get('/worker/jobs', { query }), (item) => item);
  }

  async runWorkerJobs(query = {}) {
    return this.client.post('/worker/jobs/run', undefined, { query, retry: false });
  }

  async subscribeRealtime({
    onEvent,
    signal,
    onState,
    initialReconnectDelayMs = 500,
    maxReconnectDelayMs = 8_000,
  } = {}) {
    if (typeof onEvent !== 'function') {
      throw new HdApiError('A realtime event callback is required.', {
        code: 'REALTIME_CALLBACK_REQUIRED',
      });
    }

    const initialDelay = normalizeReconnectDelay(initialReconnectDelayMs, 500);
    const maximumDelay = Math.max(
      initialDelay,
      normalizeReconnectDelay(maxReconnectDelayMs, 8_000),
    );
    const recentEventIds = new Set();
    let reconnectAttempt = 0;
    let refreshesSinceReady = 0;

    const emitState = (state, details = {}) => {
      if (typeof onState !== 'function') return;
      onState({ state, attempt: reconnectAttempt, ...details });
    };

    const handleEvent = (message) => {
      if (message?.type === 'ready') {
        reconnectAttempt = 0;
        refreshesSinceReady = 0;
        emitState('connected');
      }

      if (message?.type === 'heartbeat') {
        emitState('connected', { heartbeatAt: message?.data?.at || '' });
      }

      const eventId = message?.type === 'event'
        ? stringValue(message?.data?.eventId)
        : '';
      if (eventId) {
        if (recentEventIds.has(eventId)) return;
        recentEventIds.add(eventId);
        if (recentEventIds.size > REALTIME_EVENT_DEDUPE_LIMIT) {
          recentEventIds.delete(recentEventIds.values().next().value);
        }
      }

      onEvent(message);
    };

    while (!signal?.aborted) {
      try {
        emitState(reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
        await this.client.stream('/realtime/stream', { onEvent: handleEvent, signal });

        if (signal?.aborted) return;
        throw new HdApiError('The realtime stream closed unexpectedly.', {
          code: 'REALTIME_STREAM_CLOSED',
          retryable: true,
        });
      } catch (error) {
        if (isAbortError(error, signal)) return;

        if (error?.status === 401 && typeof this.client.refresh === 'function') {
          if (refreshesSinceReady >= 1) {
            emitState('authentication-failed', { error: error.message || '' });
            throw error;
          }

          refreshesSinceReady += 1;
          emitState('reauthenticating');
          await this.client.refresh();
          continue;
        }

        const retryable = Boolean(error?.retryable || error?.status >= 500 || error?.status === 0);
        if (!retryable) {
          emitState('failed', { error: error?.message || '' });
          throw error;
        }

        const delayMs = Math.min(
          maximumDelay,
          initialDelay * (2 ** Math.min(reconnectAttempt, 8)),
        );
        emitState('reconnecting', { delayMs, error: error?.message || '' });
        reconnectAttempt += 1;
        await waitForReconnect(delayMs, signal);
      }
    }
  }
}

let vpsApi;

export const getHdConnectApi = () => {
  if (!isVpsApiMode) {
    throw new HdApiError('The VPS API client is only available in a VPS data mode.', {
      code: 'VPS_MODE_REQUIRED',
    });
  }

  if (!vpsApi) {
    vpsApi = new HdConnectStagingApi(new HdApiClient({
      baseUrl: runtimeEnv.VITE_API_BASE_URL,
      deviceName: runtimeEnv.VITE_HD_DEVICE_NAME || `HD Manager web ${isVpsProductionMode ? 'production' : 'staging'}`,
      tokenStorageNamespace: isVpsProductionMode ? 'vps-production' : 'vps-staging',
    }));
  }

  return vpsApi;
};

// Compatibility exports keep the approved staging contract stable while both
// VPS modes share one API adapter and never fall back to Firebase core paths.
export const getHdConnectStagingApi = getHdConnectApi;
export const createHdConnectApi = (client) => new HdConnectStagingApi(client);
export const createHdConnectStagingApi = (client) => new HdConnectStagingApi(client);

const unsupportedVpsIdentityOperation = (code, message) => async () => {
  throw new HdApiError(message, { status: 501, code });
};

export const createVpsIdentitySecurityApi = (api = getHdConnectApi()) => ({
  getIdentityDevice: () => ({
    deviceId: api.client.deviceName || '',
    name: api.client.deviceName || 'HD Manager',
    platform: api.client.platform || 'hd-manager-web',
  }),
  identityChangePassword: ({ currentPassword, newPassword } = {}) => (
    api.changeIdentityPassword({ currentPassword, newPassword })
  ),
  identityListDevices: async () => {
    const result = await api.listIdentitySessions();
    return { devices: result.items };
  },
  identityListAudit: (query = {}) => api.listIdentityAudit(query),
  identityRevokeDevices: ({ deviceId, all = false } = {}) => (
    all ? api.logoutAll() : api.revokeIdentitySession(deviceId)
  ),
  identityCompleteSetup: unsupportedVpsIdentityOperation(
    'VPS_IDENTITY_SETUP_NOT_READY',
    'Identity setup is managed by invitation acceptance in VPS mode.',
  ),
  identityDeleteAccount: unsupportedVpsIdentityOperation(
    'VPS_IDENTITY_DELETE_NOT_READY',
    'Account deletion is not available in VPS mode until its retention contract is approved.',
  ),
  identitySetBiometric: unsupportedVpsIdentityOperation(
    'VPS_IDENTITY_BIOMETRIC_NOT_READY',
    'Biometric settings are not available in VPS mode.',
  ),
  identityVerifyPin: unsupportedVpsIdentityOperation(
    'VPS_IDENTITY_PIN_NOT_READY',
    'PIN verification is not available in VPS mode.',
  ),
});
