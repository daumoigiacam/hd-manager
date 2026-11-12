// Prepared original pure declaration text. See extraction-evidence.json.

const getPrimaryDeliveryAssignmentId = (source = {}) => getDeliveryAssignmentIds(source)[0] || '';
const normalizeLeadingLabel = (str = '') => capitalizeFirst(`${str}`.trim());
const normalizeExpenseCategoryLabel = (str = '') => normalizeLeadingLabel(str);
const getOrderPaymentDisplayCode = (order = {}) => (
  order?.paymentCode
  || order?.matchedOrderCode
  || order?.orderCode
  || order?.code
  || formatOrderCode(order?.id)
);
const normalizeTransferMemoToken = (value = '') => `${value}`
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, '');
const buildOrderMemoCandidates = (order = {}) => {
  const rawCodes = [
    order.id,
    order.orderId,
    order.orderCode,
    order.code,
    order.invoiceCode,
    order.paymentCode,
    order.paymentOrderCode,
    order.payosOrderCode,
    order.referenceCode,
    order.transferCode,
    order.matchedOrderCode
  ].filter(Boolean);
  const formattedCodes = rawCodes.map(code => formatOrderCode(code)).filter(Boolean);
  return [...new Set([...rawCodes, ...formattedCodes]
    .map(normalizeTransferMemoToken)
    .filter(token => token.length >= 6))];
};
const isOrderCodeAutoMatchEnabled = (company = null) => company?.autoReconcileByOrderCode !== false;
const resolveMatchedOrderFromTransfer = ({ paymentData = {}, orders = [], company = null } = {}) => {
  const activeOrders = orders.filter(order => !order?.isArchived);
  if (paymentData?.orderId) {
    return activeOrders.find(order => order.id === paymentData.orderId) || null;
  }
  if (!isOrderCodeAutoMatchEnabled(company)) return null;

  const searchableText = normalizeTransferMemoToken([
    paymentData?.note,
    paymentData?.bankContent,
    paymentData?.transferMemo,
    paymentData?.referenceCode
  ].filter(Boolean).join(' '));

  if (!searchableText) return null;

  return [...activeOrders]
    .sort((a, b) => (getEntityTimestamp(b) || 0) - (getEntityTimestamp(a) || 0))
    .find(order => buildOrderMemoCandidates(order).some(token => searchableText.includes(token))) || null;
};
const RETURN_GOODS_STATUS_LABELS = {
  pending_pickup: 'Chưa lấy về kho',
  retrieved: 'Đã lấy về kho',
  discounted_sale: 'Giảm giá bán luôn'
};
const DELIVERY_WEIGHT_TOLERANCE = 0.01;
const getDeliveryReportWeightStatus = (report = {}) => {
  const expectedWeight = parseLooseQuantityValue(report.expectedWeightKg ?? report.expectedWeight ?? report.dispatchWeightKg);
  const actualWeight = parseLooseQuantityValue(report.actualWeightKg ?? report.actualWeight);
  if (actualWeight <= 0) {
    return { status: 'not_measured', expectedWeight, actualWeight: 0, diff: 0, isMismatch: false };
  }
  if (expectedWeight <= 0) {
    return { status: 'reported', expectedWeight: 0, actualWeight, diff: actualWeight, isMismatch: false };
  }
  const diff = Number((actualWeight - expectedWeight).toFixed(2));
  const isMismatch = Math.abs(diff) > DELIVERY_WEIGHT_TOLERANCE;
  return {
    status: isMismatch ? (diff > 0 ? 'over' : 'short') : 'matched',
    expectedWeight,
    actualWeight,
    diff,
    isMismatch
  };
};
const getAssetCostTypeLabel = (type) => ({
  fuel: 'Nhiên liệu',
  maintenance: 'Bảo dưỡng',
  repair: 'Sửa chữa',
  tire: 'Vá lốp',
  oil: 'Thay nhớt',
  toll: 'Phí cầu đường',
  other: 'Khác'
}[type] || type || 'Khác');
const getAssetDisplayLabel = (asset = {}) => {
  const name = asset.name || asset.vehicleName || asset.vehicleModel || asset.vehicleBrand || asset.type || 'Tài sản';
  const plate = asset.plateNumber || asset.licensePlate || asset.plate || asset.vehiclePlate || '';
  const cleanName = `${name || ''}`.trim();
  const cleanPlate = `${plate || ''}`.trim();
  return [cleanName, cleanPlate && !cleanName.includes(cleanPlate) ? cleanPlate : ''].filter(Boolean).join(' - ') || 'Tài sản';
};
const getDeliveryAssignmentIds = (source = {}) => Array.from(new Set([
  source.assignedDriverId,
  source.driverId,
  source.deliveryDriverId,
  source.driverEmployeeId,
  source.assignedEmployeeId,
  source.employeeId,
  source.managerId,
  source.responsibleEmployeeId,
  ...(Array.isArray(source.assignedDriverIds) ? source.assignedDriverIds : []),
  ...(Array.isArray(source.driverIds) ? source.driverIds : []),
  ...(Array.isArray(source.assignedEmployeeIds) ? source.assignedEmployeeIds : [])
].map(value => `${value || ''}`.trim()).filter(Boolean)));
const capitalizeFirst = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};
const parseInputCurrency = (val) => {
  if (val === '' || val === undefined || val === null) return '';
  const num = parseInt(val.toString().replace(/\D/g, ''), 10);
  return isNaN(num) ? '' : num;
};
const formatOrderCode = (orderId = '') => `HD${String(orderId || '').slice(-6).toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
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
const parseLooseQuantityValue = (value) => {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : 0;
  const matched = `${value}`.replace(/\s+/g, '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return matched ? Math.max(0, parseFloat(matched[0]) || 0) : 0;
};
const parseLooseMoneyValue = (value) => {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return Math.max(0, Math.round(value));
  const digits = `${value}`.replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
};
const normalizeReturnGoodsStatus = (record = {}) => {
  if (record.status) return record.status;
  if (record.discountedSale) return 'discounted_sale';
  if (record.isRetrievedToWarehouse || record.retrievedToWarehouse) return 'retrieved';
  return 'pending_pickup';
};
const getOrderReturnGoodsRecords = (order = {}) => {
  const records = Array.isArray(order?.returnGoods)
    ? order.returnGoods
    : (Array.isArray(order?.returnedGoods) ? order.returnedGoods : []);
  return records.filter(record => record && record.isArchived !== true);
};
const summarizeOrderReturnGoods = (order = {}) => getOrderReturnGoodsRecords(order).reduce((acc, record) => {
  const pieces = parseLooseQuantityValue(record.pieces ?? record.quantity ?? record.returnPieces ?? 0);
  const weightKg = parseLooseQuantityValue(record.weightKg ?? record.returnWeightKg ?? 0);
  const discountAmount = parseLooseMoneyValue(record.discountAmount ?? record.discount ?? 0);
  const status = normalizeReturnGoodsStatus(record);

  acc.count += 1;
  acc.pieces += pieces;
  acc.weightKg += weightKg;
  acc.discountAmount += discountAmount;
  if (status === 'pending_pickup') {
    acc.pendingCount += 1;
    acc.pendingPieces += pieces;
    acc.pendingWeightKg += weightKg;
  }
  if (status === 'retrieved') {
    acc.retrievedCount += 1;
    acc.retrievedPieces += pieces;
    acc.retrievedWeightKg += weightKg;
  }
  if (status === 'discounted_sale') acc.discountedCount += 1;
  return acc;
}, {
  count: 0,
  pieces: 0,
  weightKg: 0,
  discountAmount: 0,
  pendingCount: 0,
  pendingPieces: 0,
  pendingWeightKg: 0,
  retrievedCount: 0,
  retrievedPieces: 0,
  retrievedWeightKg: 0,
  discountedCount: 0
});
const getOrderReturnProductSummary = (order = {}) => (Array.isArray(order.items) ? order.items : [])
  .map(item => item.description || item.productName || item.name)
  .filter(Boolean)
  .join(', ');
const parseVietnameseDateTimeString = (value = '') => {
  const raw = `${value || ''}`.trim();
  if (!raw) return null;
  const match = raw.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4] || 0);
  const minute = Number(match[5] || 0);
  const second = Number(match[6] || 0);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
  const parsed = new Date(year, month - 1, day, hour, minute, second);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed.getTime();
};
const ENTITY_TIMESTAMP_CACHE_LIMIT = 2048;
const ENTITY_TIMESTAMP_CACHE_MAX_LENGTH = 64;
const entityTimestampStringCache = new Map();
const parseEntityTimestampValue = (rawValue) => {
  if (!rawValue) return null;

  if (typeof rawValue === 'number') {
    if (!Number.isFinite(rawValue) || rawValue <= 0) return null;
    return rawValue < 10000000000 ? rawValue * 1000 : rawValue;
  }

  if (typeof rawValue?.toDate === 'function') {
    const parsedDate = rawValue.toDate();
    if (parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime())) return parsedDate.getTime();
  }

  if (typeof rawValue === 'object') {
    const seconds = rawValue.seconds ?? rawValue._seconds;
    const nanos = rawValue.nanoseconds ?? rawValue._nanoseconds ?? 0;
    if (seconds !== undefined && seconds !== null) {
      const parsedSeconds = Number(seconds);
      const parsedNanos = Number(nanos);
      if (Number.isFinite(parsedSeconds)) {
        return (parsedSeconds * 1000) + Math.floor((Number.isFinite(parsedNanos) ? parsedNanos : 0) / 1000000);
      }
    }

    const nestedValue = rawValue.timestampValue
      ?? rawValue.stringValue
      ?? rawValue.integerValue
      ?? rawValue.doubleValue
      ?? rawValue.value;
    if (nestedValue !== undefined && nestedValue !== rawValue) {
      return parseEntityTimestampValue(nestedValue);
    }
  }

  if (typeof rawValue === 'string') {
    const normalized = rawValue.trim();
    if (!normalized) return null;
    // Bound the raw string too; a trimmed key can retain its backing string.
    const cacheable = rawValue.length <= ENTITY_TIMESTAMP_CACHE_MAX_LENGTH
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(normalized);
    if (cacheable) {
      const cached = entityTimestampStringCache.get(normalized);
      if (cached !== undefined) return cached;
    }
    if (/^\d{10,13}$/.test(normalized)) {
      const parsedNumeric = Number(normalized);
      if (Number.isFinite(parsedNumeric)) return normalized.length === 10 ? parsedNumeric * 1000 : parsedNumeric;
    }
    const vietnameseTimestamp = parseVietnameseDateTimeString(normalized);
    if (vietnameseTimestamp) return vietnameseTimestamp;
    const parsed = new Date(normalized).getTime();
    if (!Number.isNaN(parsed)) {
      if (cacheable && Number.isFinite(parsed)) {
        if (entityTimestampStringCache.size >= ENTITY_TIMESTAMP_CACHE_LIMIT) {
          entityTimestampStringCache.delete(entityTimestampStringCache.keys().next().value);
        }
        entityTimestampStringCache.set(normalized, parsed);
      }
      return parsed;
    }
  }

  return null;
};
const getEntityTimestamp = (entity = {}) => {
  if (!entity || typeof entity !== 'object') return parseEntityTimestampValue(entity);

  // Plain business records usually have createdAt. Preserve the existing
  // priority and truthy/epoch-zero rules without allocating a nine-value array
  // or reading later fields when an earlier timestamp already resolves.
  const timestamp = parseEntityTimestampValue(entity.createdAt)
    || parseEntityTimestampValue(entity.updatedAt)
    || parseEntityTimestampValue(entity.timestamp)
    || parseEntityTimestampValue(entity.receivedAt)
    || parseEntityTimestampValue(entity.sentAt)
    || parseEntityTimestampValue(entity.approvedAt)
    || parseEntityTimestampValue(entity.paidAt)
    || parseEntityTimestampValue(entity.lastMessageAt)
    || parseEntityTimestampValue(entity.lastActivityAt);
  if (timestamp) return timestamp;

  if (typeof entity.date === 'string' && entity.date.includes('T')) {
    const parsed = new Date(entity.date).getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }

  const idMatch = `${entity.id || ''}`.match(/_(\d{10,13})$/);
  if (idMatch) {
    const rawTimestamp = parseInt(idMatch[1], 10);
    if (!Number.isNaN(rawTimestamp)) {
      return idMatch[1].length === 10 ? rawTimestamp * 1000 : rawTimestamp;
    }
  }

  const embeddedIdTimestampMatch = `${entity.id || ''}`.match(/(?:^|_)(\d{13})(?:_|$)/);
  if (embeddedIdTimestampMatch) {
    const rawTimestamp = parseInt(embeddedIdTimestampMatch[1], 10);
    if (!Number.isNaN(rawTimestamp)) return rawTimestamp;
  }

  return null;
};
export {getDeliveryReportWeightStatus,resolveMatchedOrderFromTransfer,normalizeExpenseCategoryLabel,parseInputCurrency,parseLooseMoneyValue,parseLooseQuantityValue,capitalizeFirst,normalizeLeadingLabel,getOrderPaymentDisplayCode,isOrderCodeAutoMatchEnabled,getAssetDisplayLabel,getAssetCostTypeLabel,getOrderReturnGoodsRecords,summarizeOrderReturnGoods,RETURN_GOODS_STATUS_LABELS,getOrderReturnProductSummary,formatOrderCode,normalizeLookupText,getPrimaryDeliveryAssignmentId};
