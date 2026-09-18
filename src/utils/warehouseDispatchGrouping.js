const toText = (value = '') => `${value ?? ''}`.trim();

const normalizeText = (value = '') => toText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

const DELIVERY_STATUS_LABELS = {
  delivered: 'Đã giao',
  in_transit: 'Đang giao',
  pending: 'Chưa giao',
};

const getLatestReportsByDispatchId = (deliveryReports = []) => {
  const reportsByDispatchId = new Map();

  deliveryReports
    .filter(report => report && !report.isArchived)
    .forEach((report) => {
      const dispatchId = toText(report.dispatchId || report.warehouseDispatchId);
      if (!dispatchId) return;

      const existing = reportsByDispatchId.get(dispatchId);
      const reportTimestamp = Date.parse(report.updatedAt || report.createdAt || report.deliveredAt || '') || 0;
      const existingTimestamp = Date.parse(existing?.updatedAt || existing?.createdAt || existing?.deliveredAt || '') || 0;
      if (!existing || reportTimestamp >= existingTimestamp) {
        reportsByDispatchId.set(dispatchId, report);
      }
    });

  return reportsByDispatchId;
};

export const getWarehouseDispatchPresentationGroupId = (dispatch = {}) => {
  const candidates = [
    dispatch.shipmentId,
    dispatch.warehouseShipmentId,
    dispatch.exportOrderId,
    dispatch.exportId,
    dispatch.dispatchGroupId,
    dispatch.dispatchBatchId,
    dispatch.batchId,
    dispatch.deliveryPlanId,
    dispatch.orderId,
    dispatch.sourceOrderRequestId,
    dispatch.orderRequestId,
    dispatch.requestId,
    dispatch.sourceRequestId,
    dispatch.invoiceId,
  ];
  const groupId = candidates.map(toText).find(Boolean);

  const dispatchId = toText(dispatch.id);
  return groupId ? `shipment:${groupId}` : dispatchId ? `dispatch:${dispatchId}` : '';
};

export const resolveWarehouseDispatchDeliveryStatus = (dispatch = {}, deliveryReport = null) => {
  const reportStatus = normalizeText(
    deliveryReport?.deliveryStatus
    || deliveryReport?.trackingStatus
    || deliveryReport?.status
  );
  const dispatchStatus = normalizeText(
    dispatch.deliveryStatus
    || dispatch.trackingStatus
    || dispatch.fulfillmentStatus
    || dispatch.status
  );
  const status = reportStatus || dispatchStatus;

  if (
    deliveryReport?.id
    || deliveryReport?.deliveredAt
    || ['delivered', 'da giao'].includes(status)
  ) {
    return { key: 'delivered', label: DELIVERY_STATUS_LABELS.delivered };
  }

  if (toText(dispatch.deliveryStatusKey) && toText(dispatch.deliveryStatusLabel)) {
    return {
      key: toText(dispatch.deliveryStatusKey),
      label: toText(dispatch.deliveryStatusLabel),
    };
  }

  if (['shipping', 'in transit', 'in_transit', 'out for delivery', 'dang giao'].includes(status)) {
    return { key: 'in_transit', label: DELIVERY_STATUS_LABELS.in_transit };
  }

  if (!status || ['pending', 'assigned', 'draft', 'new', 'cho giao', 'chua giao'].includes(status)) {
    return { key: 'pending', label: DELIVERY_STATUS_LABELS.pending };
  }

  return { key: status, label: toText(dispatch.deliveryStatus || dispatch.trackingStatus || dispatch.fulfillmentStatus || dispatch.status) };
};

const getDriver = (row = {}) => {
  const id = toText(row.assignedDriverId || row.driverId || row.deliveryDriverId || row.driverEmployeeId);
  const name = toText(row.assignedDriverName || row.assignedDriverNameSnapshot || row.driverNameSnapshot || row.driverName);
  return {
    id,
    name: name || 'Chưa giao',
    hasAssignedDriver: Boolean(id || name),
    key: id || normalizeText(name) || 'unassigned',
  };
};

const getCustomer = (row = {}) => {
  const id = toText(row.customerId || row.customerID);
  const name = toText(row.customerName || row.customerNameSnapshot) || 'Khách hàng';
  return {
    id,
    name,
    key: id || normalizeText(name) || 'unknown-customer',
  };
};

export const buildWarehouseDispatchPresentationGroups = ({ rows = [], deliveryReports = [] } = {}) => {
  const reportsByDispatchId = getLatestReportsByDispatchId(deliveryReports);
  const groups = new Map();

  rows.forEach((row, index) => {
    const customer = getCustomer(row);
    const driver = getDriver(row);
    const dispatchId = toText(row.id);
    const deliveryStatus = resolveWarehouseDispatchDeliveryStatus(row, reportsByDispatchId.get(dispatchId));
    const shipmentKey = getWarehouseDispatchPresentationGroupId(row) || `row:${index}`;
    const rowKey = dispatchId || `row:${index}`;
    const groupKey = [shipmentKey, customer.key, driver.key, deliveryStatus.key].join('__');
    const group = groups.get(groupKey);

    if (group) {
      group.rows.push(row);
      return;
    }

    groups.set(groupKey, {
      key: groupKey,
      shipmentKey,
      customerId: customer.id,
      customerName: customer.name,
      driverId: driver.id,
      driverName: driver.name,
      hasAssignedDriver: driver.hasAssignedDriver,
      deliveryStatus,
      firstRowId: rowKey,
      rows: [row],
    });
  });

  return Array.from(groups.values()).map(group => ({
    ...group,
    rowSpan: group.rows.length,
  }));
};
