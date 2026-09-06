export const VPS_ORDER_REQUEST_SOURCE_WORKFLOW = 'hd_manager_order_request_entry';

const stringValue = (value = '') => `${value ?? ''}`.trim();

const numericValue = (value) => {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
};

const orderMetadata = (order = {}) => (
  order?.metadata && typeof order.metadata === 'object' ? order.metadata : {}
);

const lineMetadata = (line = {}) => (
  line?.metadata && typeof line.metadata === 'object' ? line.metadata : {}
);

export const isVpsOrderRequestSource = (order = {}) => {
  const metadata = orderMetadata(order);
  return order?.sourceWorkflow === VPS_ORDER_REQUEST_SOURCE_WORKFLOW
    || metadata.sourceWorkflow === VPS_ORDER_REQUEST_SOURCE_WORKFLOW;
};

const projectLine = (line = {}, index = 0) => {
  const metadata = lineMetadata(line);
  const quantity = numericValue(line.quantity);
  const unitPrice = numericValue(line.unitPrice);
  const quantityUnit = stringValue(
    line.inputUnit || line.quantityUnit || line.unit || line.unitName || metadata.inputUnit || metadata.quantityUnit,
  );
  const billingUnit = stringValue(
    line.billingUnit || line.pricingUnit || metadata.pricingUnit || quantityUnit,
  );
  const sizeLabel = stringValue(
    line.sizeLabel || line.size || line.weightKg || metadata.sizeLabel || metadata.size || metadata.weightKg,
  );
  const attributeLabel = stringValue(
    line.attributeLabel || line.productAttribute || metadata.attributeLabel || metadata.productAttribute,
  );
  const amount = numericValue(line.lineTotal ?? line.amount ?? line.total ?? (quantity * unitPrice));

  return {
    ...metadata,
    id: stringValue(line.id) || `vps-order-request-line-${index + 1}`,
    productId: stringValue(line.productId),
    unitId: stringValue(line.unitId),
    quantity,
    quantityUnit,
    actualQuantity: quantity,
    actualUnit: quantityUnit,
    billingQuantity: quantity,
    billingUnit,
    pricingQuantity: quantity,
    pricingUnit: billingUnit,
    sizeLabel,
    attributeLabel,
    productAttribute: attributeLabel,
    configurationId: stringValue(line.configurationId || metadata.configurationId),
    unitPrice,
    amount,
    lineTotal: amount,
    description: stringValue(line.note || line.description),
    note: stringValue(line.note),
  };
};

// The native SalesOrder remains the only record. This is a read-model adapter
// for the existing order-request screen, so VPS mode never needs a Firebase
// shadow document to display an employee-entered order request.
export const projectVpsSalesOrderToOrderRequest = (order = {}) => {
  if (!order?.id || !isVpsOrderRequestSource(order)) return null;

  const metadata = orderMetadata(order);
  const items = (Array.isArray(order.items) ? order.items : [])
    .map(projectLine)
    .filter((item) => item.productId && item.quantity > 0);
  if (items.length === 0) return null;

  const totalAmount = numericValue(order.totalAmount ?? order.grandTotal ?? order.amount)
    || items.reduce((sum, item) => sum + item.amount, 0);

  return {
    ...metadata,
    id: order.id,
    vpsSalesOrderId: order.id,
    entityType: 'sales_order',
    source: 'vps_sales_order',
    sourceWorkflow: VPS_ORDER_REQUEST_SOURCE_WORKFLOW,
    companyId: stringValue(order.companyId),
    customerId: stringValue(order.customerId),
    branchId: stringValue(order.branchId),
    warehouseId: stringValue(order.warehouseId),
    empId: stringValue(order.salesEmpId || order.salespersonId),
    salesEmpId: stringValue(order.salesEmpId || order.salespersonId),
    date: stringValue(metadata.sourceOrderRequestDate || order.date || order.orderDate),
    orderDate: stringValue(order.orderDate || order.date),
    note: stringValue(order.internalNote || order.customerNote),
    internalNote: stringValue(order.internalNote),
    customerNote: stringValue(order.customerNote),
    reviewStatus: stringValue(order.reviewStatus || order.status || 'DRAFT').toLowerCase(),
    status: stringValue(order.status || order.reviewStatus || 'DRAFT'),
    items,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    totalAmount,
    amount: totalAmount,
    createdAt: order.createdAt || '',
    updatedAt: order.updatedAt || order.createdAt || '',
    // A cancelled native order remains available to the sales audit trail, but
    // must leave this legacy-compatible read model and its shortage list.
    isArchived: Boolean(order.isArchived)
      || ['CANCELLED', 'CANCELED'].includes(stringValue(order.status).toUpperCase()),
  };
};

export const projectVpsSalesOrdersToOrderRequests = (orders = []) => (
  (Array.isArray(orders) ? orders : [])
    .map(projectVpsSalesOrderToOrderRequest)
    .filter(Boolean)
);
