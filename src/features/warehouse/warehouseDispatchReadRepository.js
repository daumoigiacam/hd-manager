/** @typedef {import('./warehouseDispatchContracts.js').DispatchReadData} DispatchReadData */
/** @typedef {{ id: string, data: DispatchReadData }} DispatchReadItem */

const textFields = [
  'id', 'companyId', 'clientMutationId', 'empId', 'createdByEmpId', 'customerId',
  'customerName', 'customerNameSnapshot', 'productId', 'productName', 'productNameSnapshot',
  'branchId', 'branchName', 'customerBranchId', 'customerBranchName',
  'assignedDriverId', 'driverId', 'assignedDriverNameSnapshot', 'driverNameSnapshot',
  'sourceOrderRequestId', 'sourceOrderRequestRowKey', 'quantityUnit', 'unit',
  'billingUnit', 'pricingUnit', 'date', 'createdAt', 'updatedAt', 'archivedAt',
  'archivedByEmpId', 'updatedByEmpId', 'shipmentId', 'warehouseShipmentId',
  'exportOrderId', 'exportId', 'dispatchGroupId', 'dispatchBatchId', 'batchId',
  'deliveryPlanId', 'orderId', 'orderRequestId', 'requestId', 'sourceRequestId',
  'invoiceId', 'deliveryStatus', 'trackingStatus', 'fulfillmentStatus', 'status',
  'deliveryStatusKey', 'deliveryStatusLabel', 'deliveryDriverId', 'driverEmployeeId',
  'assignedDriverName', 'driverName', 'customerID', 'note',
];
const numericFields = [
  'quantity', 'pieceCount', 'quantityCount', 'weightKg', 'totalKg', 'actualWeightKg',
  'unitPrice', 'price', 'billingQuantity', 'pricingQuantity', 'amount', 'pricingAmount',
  'lineTotal',
];
const booleanFields = ['isArchived', '__pendingFirebaseSync'];

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @returns {value is string | number | null | undefined} */
function isNumericInput(value) {
  return value == null || typeof value === 'string'
    || (typeof value === 'number' && Number.isFinite(value));
}

/** @param {string} id @param {string} field */
function invalidRecord(id, field) {
  // Include record identity, never customer names, amounts or complete payloads.
  return new TypeError(`Phiếu xuất ${id || '(không có mã)'} có dữ liệu không hợp lệ ở trường ${field}. Dữ liệu trước đó được giữ nguyên.`);
}

/**
 * Normalized SDK/REST input only: shared transport converts Timestamp to ISO.
 * Optional nulls and numeric strings are valid legacy values, not coerced here.
 * @param {unknown} value
 * @param {string} id
 * @param {{companyId: string, customerId?: string}} scope
 * @returns {asserts value is DispatchReadData}
 */
function validateData(value, id, scope) {
  if (!isRecord(value)) throw invalidRecord(id, 'document');
  if (value.companyId !== scope.companyId) throw invalidRecord(id, 'companyId');
  if (scope.customerId && value.customerId !== scope.customerId) throw invalidRecord(id, 'customerId');
  if (value.id != null && value.id !== id) throw invalidRecord(id, 'id');
  for (const field of textFields) {
    if (value[field] != null && typeof value[field] !== 'string') throw invalidRecord(id, field);
  }
  for (const field of numericFields) {
    if (!isNumericInput(value[field])) throw invalidRecord(id, field);
  }
  for (const field of booleanFields) {
    if (value[field] != null && typeof value[field] !== 'boolean') throw invalidRecord(id, field);
  }
  if (value.weightEntries != null
    && (!Array.isArray(value.weightEntries) || !value.weightEntries.every(isNumericInput))) {
    throw invalidRecord(id, 'weightEntries');
  }
}

/**
 * One decoder per tenant/listener lifetime. Immutable snapshot data is reused by
 * the existing collector, so unchanged records are validated only once. Weak
 * keys never retain records removed from the collection.
 * Validate the whole batch before the caller changes overlays or published state.
 * @param {{companyId: string, customerId?: string}} scope
 */
export function createWarehouseDispatchReadDecoder(scope) {
  const companyId = scope.companyId;
  const customerId = scope.customerId;
  if (!companyId) throw new TypeError('Warehouse dispatch read requires a tenant.');
  /** @type {WeakMap<object, {id: string, data: DispatchReadData}>} */
  const validated = new WeakMap();
  /** @param {unknown} items @returns {DispatchReadItem[]} */
  return function decode(items) {
    if (!Array.isArray(items)) throw invalidRecord('', 'snapshot');
    const ids = new Set();
    return items.map(item => {
      if (!isRecord(item) || typeof item.id !== 'string' || !item.id || !isRecord(item.data)) {
        throw invalidRecord('', 'document');
      }
      const { id, data } = item;
      if (ids.has(id)) throw invalidRecord(id, 'duplicate id');
      ids.add(id);
      const cached = validated.get(data);
      if (cached?.id === id) return { id, data: cached.data };
      validateData(data, id, { companyId, customerId });
      validated.set(data, { id, data });
      return { id, data };
    });
  };
}
