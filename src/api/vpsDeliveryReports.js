import { HdApiError } from './client.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const text = (value) => `${value ?? ''}`.trim();
const asNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const isUuid = (value) => UUID_PATTERN.test(text(value));

const failure = (message, code) => new HdApiError(message, { code });

const requireValue = (value, code, message) => {
  const normalized = text(value);
  if (!normalized) throw failure(message, code);
  return normalized;
};

const optionalUuid = (value, code, message) => {
  const normalized = text(value);
  if (!normalized) return undefined;
  if (!isUuid(normalized)) throw failure(message, code);
  return normalized;
};

const safeNumberPart = (value) => text(value)
  .replace(/[^A-Za-z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60);

const deliveryNumber = (sourceRecordId) => {
  const suffix = safeNumberPart(sourceRecordId);
  if (!suffix) throw failure('A stable delivery report source id is required.', 'VPS_DELIVERY_REPORT_SOURCE_REQUIRED');
  return `HDM-DELIVERY-${suffix}`.slice(0, 80);
};

const sourceData = (record = {}) => (
  record?.data && typeof record.data === 'object' && !Array.isArray(record.data)
    ? record.data
    : record
);

const sourceId = (record = {}) => text(
  record.sourceId
  || record.sourceDocumentId
  || record.sourceRecordId
  || record.id,
);

const timestamp = (value) => {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
};

const deliveryLifecycleStatus = (delivery = {}) => text(delivery.status).toUpperCase();

const isDeliveredLifecycleStatus = (status) => (
  status === 'DELIVERED' || status === 'COMPLETED'
);

export const normalizeVpsDeliveryReport = (delivery = {}) => {
  const metadata = sourceData(delivery.metadata);
  const sourceReport = sourceData(metadata.sourceReport);
  const line = Array.isArray(delivery.lines) ? delivery.lines[0] : null;
  const actualWeightKg = asNumber(
    metadata.actualWeightKg ?? sourceReport.actualWeightKg ?? line?.actualWeightKg,
  );
  const expectedWeightKg = asNumber(
    metadata.expectedWeightKg ?? sourceReport.expectedWeightKg,
  );
  const differenceKg = asNumber(
    metadata.differenceKg ?? sourceReport.differenceKg ?? actualWeightKg - expectedWeightKg,
  );
  const lifecycleStatus = deliveryLifecycleStatus(delivery);

  return {
    ...sourceReport,
    id: delivery.id,
    companyId: delivery.companyId,
    dispatchId: text(metadata.sourceDispatchId ?? sourceReport.dispatchId),
    sourceRecordId: text(metadata.sourceRecordId ?? sourceReport.id),
    customerId: delivery.customerId || sourceReport.customerId || '',
    productId: line?.productId || sourceReport.productId || '',
    expectedWeightKg,
    actualWeightKg,
    differenceKg,
    status: text(metadata.weightStatus ?? sourceReport.status) || 'reported',
    reviewStatus: text(metadata.reviewStatus ?? sourceReport.reviewStatus) || 'pending',
    resolutionStatus: text(metadata.resolutionStatus ?? sourceReport.resolutionStatus) || 'pending',
    date: text(metadata.reportDate ?? sourceReport.date) || (delivery.scheduledAt || '').slice(0, 10),
    createdAt: delivery.createdAt || sourceReport.createdAt || '',
    updatedAt: delivery.updatedAt || sourceReport.updatedAt || '',
    deliveryNumber: delivery.deliveryNumber || '',
    deliveryStatus: lifecycleStatus.toLowerCase(),
    isDelivered: isDeliveredLifecycleStatus(lifecycleStatus) || Boolean(delivery.deliveredAt),
    deliveredAt: delivery.deliveredAt || sourceReport.deliveredAt || '',
    vpsDelivery: true,
    source: 'hd-connect-vps',
    isArchived: Boolean(delivery.deletedAt),
  };
};

export async function loadVpsDeliveryReports(api, session, { cancelled = () => false } = {}) {
  const companyId = requireValue(
    session?.companyId,
    'VPS_DELIVERY_REPORT_TENANT_REQUIRED',
    'VPS tenant context is required.',
  );
  const [nativePage, historicalPage] = await Promise.all([
    api.listLogisticsDeliveries({ page: 1, limit: 500, sortBy: 'createdAt', sortOrder: 'desc' }),
    api.listLegacyBusiness({ domain: 'DELIVERY', page: 1, limit: 500, sortBy: 'createdAt', sortOrder: 'desc' }),
  ]);
  if (cancelled()) return { items: [] };

  const native = (Array.isArray(nativePage?.items) ? nativePage.items : [])
    .filter((item) => item?.companyId === companyId)
    .filter((item) => text(sourceData(item.metadata).sourceRecordId))
    .map(normalizeVpsDeliveryReport);
  const nativeSourceIds = new Set(native.map((item) => item.sourceRecordId).filter(Boolean));
  const historical = (Array.isArray(historicalPage?.items) ? historicalPage.items : [])
    .filter((item) => item?.companyId === companyId)
    .map((item) => ({
      ...sourceData(item.data),
      id: sourceId(item),
      sourceRecordId: sourceId(item),
      companyId,
      source: 'hd-connect-vps-history',
      readOnlyHistorical: true,
    }))
    .filter((item) => item.id && !nativeSourceIds.has(item.sourceRecordId));

  return {
    items: [...native, ...historical].sort(
      (left, right) => timestamp(right.createdAt || right.date) - timestamp(left.createdAt || left.date),
    ),
  };
}

export async function saveVpsDeliveryReport(api, session, report = {}, dispatch = {}) {
  const companyId = requireValue(
    session?.companyId,
    'VPS_DELIVERY_REPORT_TENANT_REQUIRED',
    'VPS tenant context is required.',
  );
  if (report.companyId && text(report.companyId) !== companyId) {
    throw failure('Cannot write a delivery report for another tenant.', 'VPS_DELIVERY_REPORT_TENANT_MISMATCH');
  }
  if (dispatch.companyId && text(dispatch.companyId) !== companyId) {
    throw failure('The warehouse dispatch belongs to another tenant.', 'VPS_DELIVERY_DISPATCH_TENANT_MISMATCH');
  }

  const sourceRecordId = requireValue(
    report.id || report.sourceRecordId || report.idempotencyKey,
    'VPS_DELIVERY_REPORT_SOURCE_REQUIRED',
    'A stable delivery report id is required.',
  );
  const productId = optionalUuid(
    report.productId || dispatch.productId,
    'VPS_DELIVERY_PRODUCT_MAPPING_REQUIRED',
    'The delivery report requires a mapped VPS product.',
  );
  if (!productId) {
    throw failure('The delivery report requires a mapped VPS product.', 'VPS_DELIVERY_PRODUCT_MAPPING_REQUIRED');
  }
  const unitId = optionalUuid(
    report.unitId || dispatch.unitId,
    'VPS_DELIVERY_UNIT_MAPPING_INVALID',
    'The delivery unit is not a VPS master-data record.',
  );
  const productQuantity = asNumber(report.quantity ?? dispatch.quantity ?? dispatch.pieceCount ?? dispatch.quantityCount);
  const actualWeightKg = asNumber(report.actualWeightKg);
  const quantityUnit = text(report.quantityUnit || dispatch.quantityUnit || dispatch.unit).toLowerCase();
  const quantity = productQuantity > 0
    ? productQuantity
    : (quantityUnit === 'kg' && actualWeightKg > 0 ? actualWeightKg : 0);
  if (quantity <= 0) {
    throw failure(
      'The dispatch must retain an actual mapped quantity; weight cannot be inferred as units.',
      'VPS_DELIVERY_QUANTITY_REQUIRED',
    );
  }

  const sourceDispatchId = text(report.dispatchId || dispatch.sourceRecordId || dispatch.sourceDispatchId || dispatch.id);
  const expectedWeightKg = asNumber(report.expectedWeightKg ?? dispatch.weightKg);
  const differenceKg = actualWeightKg - expectedWeightKg;
  let delivery = await api.createLogisticsDelivery({
    deliveryNumber: deliveryNumber(sourceRecordId),
    salesOrderId: optionalUuid(report.orderId || dispatch.orderId || dispatch.salesOrderId, 'VPS_DELIVERY_ORDER_MAPPING_INVALID', 'The linked sales order is not a VPS record.'),
    customerId: optionalUuid(report.customerId || dispatch.customerId, 'VPS_DELIVERY_CUSTOMER_MAPPING_INVALID', 'The linked customer is not a VPS record.'),
    warehouseId: optionalUuid(report.warehouseId || dispatch.warehouseId, 'VPS_DELIVERY_WAREHOUSE_MAPPING_INVALID', 'The linked warehouse is not a VPS record.'),
    scheduledAt: text(report.date || dispatch.date) || undefined,
    note: text(report.note || report.resolutionNote).slice(0, 2000) || undefined,
    lines: [{
      productId,
      unitId,
      quantity,
      cageQuantity: Math.max(0, Math.trunc(asNumber(report.cageQuantity ?? dispatch.cageQuantity))),
      metadata: {
        sourceDispatchId,
        quantityUnit,
        reportedActualWeightKg: actualWeightKg,
      },
    }],
    metadata: {
      sourceRecordId,
      sourceDispatchId,
      reportKind: 'HD_MANAGER_DELIVERY_WEIGHT_REPORT',
      expectedWeightKg,
      actualWeightKg,
      differenceKg,
      weightStatus: text(report.status) || (differenceKg === 0 ? 'matched' : 'mismatch'),
      reviewStatus: text(report.reviewStatus) || (differenceKg === 0 ? 'not_required' : 'pending'),
      resolutionStatus: text(report.resolutionStatus) || (differenceKg === 0 ? 'not_required' : 'pending'),
      reportDate: text(report.date || dispatch.date),
      sourceReport: {
        ...report,
        id: sourceRecordId,
        companyId,
        dispatchId: sourceDispatchId,
        expectedWeightKg,
        actualWeightKg,
        differenceKg,
      },
    },
    clientMutationId: `hdm-delivery-report:${sourceRecordId}`.slice(0, 180),
  });
  if (delivery?.companyId !== companyId) {
    throw failure('The VPS delivery response belongs to a different tenant.', 'VPS_DELIVERY_REPORT_TENANT_MISMATCH');
  }
  // A map confirmation may only close a delivery that has already passed the
  // assignment, loading, and departure controls in the native workflow.
  // Weight reporting is deliberately not a substitute for physical delivery.
  if (
    text(report.deliveryStatus).toLowerCase() === 'delivered'
    && deliveryLifecycleStatus(delivery) === 'DEPARTED'
    && typeof api.transitionLogisticsDelivery === 'function'
  ) {
    delivery = await api.transitionLogisticsDelivery(delivery.id, {
      transitionCode: 'DELIVER',
      reason: text(report.note) || 'Confirmed from HD Manager delivery map.',
    });
    if (delivery?.companyId !== companyId) {
      throw failure('The VPS delivery transition belongs to a different tenant.', 'VPS_DELIVERY_REPORT_TENANT_MISMATCH');
    }
  }
  return normalizeVpsDeliveryReport(delivery);
}
