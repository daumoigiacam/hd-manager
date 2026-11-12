// Exact original shared pure declarations; no CRM UI/native/auth imports.
import {sortProjection} from "../../services/cooperativeProjection.js";

import {purchaseAmount} from "../../utils/productMeasures.js";

import {createCustomerRecordSelector} from "../../utils/customerLedgerIndex.js";

const getLocalDateInputValue = (date = new Date()) => {
  const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const year = safeDate.getFullYear();
  const month = String(safeDate.getMonth() + 1).padStart(2, '0');
  const day = String(safeDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTodayString = () => getLocalDateInputValue(new Date());

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

const isOwnerPosition = (position = '') => normalizeEmployeePosition(position) === 'Chủ doanh nghiệp';

const isOwnerRoleValue = (value = '') => {
  const normalized = normalizeLookupText(value || '');
  const compact = normalized.replace(/\s+/g, '');
  if (!normalized) return false;
  return normalized === 'super admin'
    || normalizeEmployeePosition(value) === 'Chủ doanh nghiệp'
    || ['superadmin', 'owner', 'companyowner', 'businessowner', 'owneraccount', 'accountowner'].includes(compact)
    || ['business owner', 'company owner', 'owner account', 'account owner', 'chu doanh nghiep', 'chu cong ty', 'chu cua hang', 'giam doc', 'quan ly doanh nghiep'].includes(normalized);
};

const isOwnerAccountUser = (employee = null, currentUser = null) => (
  currentUser?.role === 'super_admin'
  || employee?.role === 'super_admin'
  || currentUser?.isOwner === true
  || currentUser?.isCompanyOwner === true
  || employee?.isOwner === true
  || employee?.isCompanyOwner === true
  || isOwnerRoleValue(currentUser?.role)
  || isOwnerRoleValue(currentUser?.position)
  || isOwnerRoleValue(currentUser?.userRole)
  || isOwnerRoleValue(currentUser?.accountRole)
  || isOwnerRoleValue(employee?.role)
  || isOwnerPosition(employee?.position)
);

const isSalesPosition = (position = '') => ['Kinh doanh', SALES_COLLABORATOR_POSITION].includes(normalizeEmployeePosition(position));

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

const isEmployeeSalesPosition = (employee = {}) => employeeHasPosition(employee, isSalesPosition);

const getSalesLeaderId = (employee = {}) => `${employee?.salesLeaderId || employee?.salesManagerId || employee?.parentSalesEmpId || employee?.managerEmpId || ''}`.trim();

const toTitleCase = (str) => {
  if (!str) return '';
  return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

const viNumberFormatter = new Intl.NumberFormat('vi-VN');

const parseInputCurrency = (val) => {
  if (val === '' || val === undefined || val === null) return '';
  const num = parseInt(val.toString().replace(/\D/g, ''), 10);
  return isNaN(num) ? '' : num;
};

const formatCurrency = (amount) => {
  if (amount === undefined || amount === null || isNaN(amount)) return '0';
  return viNumberFormatter.format(Math.round(Number(amount) || 0));
};

const roundMoneyValue = (amount) => {
  if (amount === undefined || amount === null || Number.isNaN(Number(amount))) return 0;
  return Math.round(Number(amount) || 0);
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

const normalizeCustomerPhone = (value = '') => `${value}`.replace(/\D/g, '');

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

const CASHFLOW_APPROVAL_STATUS = {
  pending: 'pending_handover',
  approved: 'approved',
  rejected: 'rejected'
};

const UNCONFIRMED_PAYMENT_STATUSES = new Set([
  'pending',
  'created',
  'initiated',
  'processing',
  'awaiting_payment',
  'awaiting_transfer',
  'unpaid',
  'failed',
  'cancelled',
  'canceled',
  'expired'
]);

const PAYMENT_INTENT_SOURCE_TYPES = new Set([
  'customer_debt_payment_intent',
  'customer_payment_intent',
  'sepay_customer_debt_intent',
  'sepay_payment_intent',
  'bank_qr_payment_intent'
]);

const isUnconfirmedPaymentIntent = (item = {}) => {
  const sourceType = `${item.sourceType || item.type || ''}`.trim().toLowerCase();
  const statuses = [
    item.status,
    item.paymentStatus,
    item.settlementStatus,
    item.reconciliationStatus
  ]
    .map(value => `${value || ''}`.trim().toLowerCase())
    .filter(Boolean);

  return Boolean(
    item.isPaymentIntent === true
    || item.paymentIntent === true
    || item.isCustomerDebtPaymentIntent === true
    || PAYMENT_INTENT_SOURCE_TYPES.has(sourceType)
    || statuses.some(status => UNCONFIRMED_PAYMENT_STATUSES.has(status))
  );
};

const requiresCashflowApproval = (item = {}) => Boolean(
  item.requiresApproval ||
  item.approvalStatus === CASHFLOW_APPROVAL_STATUS.pending ||
  item.approvalStatus === CASHFLOW_APPROVAL_STATUS.rejected ||
  item.handoverStatus === 'pending' ||
  item.handoverStatus === 'handed_over' ||
  item.sourceType === 'driver_delivery_expense' ||
  item.sourceType === 'employee_reported_expense' ||
  item.sourceType === 'employee_reported_income' ||
  (item.sourceType === 'driver_cash' && item.createdByRole === 'driver')
);

const isCashflowOfficial = (item = {}) => (
  !isUnconfirmedPaymentIntent(item)
  && (!requiresCashflowApproval(item) || item.approvalStatus === CASHFLOW_APPROVAL_STATUS.approved)
);

const toDateInputString = (date) => {
  const normalized = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return normalized.toISOString().split('T')[0];
};

const compareLedgerItems = (a, b, sortKeys = null) => {
  const keyFor = item => {
    if (sortKeys?.has(item)) return sortKeys.get(item);
    const dateKey = getPaymentDateKey(item) || getDateKeyFromAnyValue(item?.paymentDate || item?.transactionDate || item?.transactionDateTime || item?.paidAt || item?.transactionAt || item?.date || item?.createdAt || getEntityTimestamp(item));
    const key = { day: new Date(`${dateKey || '1970-01-01'}T00:00:00`).getTime(), timestamp: undefined };
    sortKeys?.set(item, key);
    return key;
  };
  const aKey = keyFor(a), bKey = keyFor(b);
  const dateCompare = aKey.day - bKey.day;
  if (dateCompare !== 0) return dateCompare;
  if (aKey.timestamp === undefined) aKey.timestamp = getPaymentTimestamp(a) || getEntityTimestamp(a) || 0;
  if (bKey.timestamp === undefined) bKey.timestamp = getPaymentTimestamp(b) || getEntityTimestamp(b) || 0;
  const timestampCompare = aKey.timestamp - bKey.timestamp;
  if (timestampCompare !== 0) return timestampCompare;
  return (a.id || '').localeCompare(b.id || '');
};

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

const normalizeCustomerOpeningDebtAmount = (value) => Math.max(0, roundMoneyValue(parseLooseMoneyValue(value)));

const normalizeCustomerOpeningPayableAmount = (value) => Math.max(0, roundMoneyValue(parseLooseMoneyValue(value)));

const getCustomerOpeningDebtAmount = (customer = {}) => normalizeCustomerOpeningDebtAmount(
  customer?.openingDebtAmount
    ?? customer?.oldDebtAmount
    ?? customer?.legacyDebtAmount
    ?? 0
);

const getCustomerOpeningDebtDate = (customer = {}) => {
  const rawDate = customer?.openingDebtDate || customer?.oldDebtDate || customer?.legacyDebtDate || customer?.createdAt || '';
  if (typeof rawDate === 'string' && rawDate.trim()) return rawDate.trim().slice(0, 10);
  return getTodayString();
};

const getCustomerOpeningPayableAmount = (customer = {}) => normalizeCustomerOpeningPayableAmount(
  customer?.openingPayableAmount
    ?? customer?.oldPayableAmount
    ?? customer?.legacyPayableAmount
    ?? customer?.companyOpeningDebtAmount
    ?? customer?.companyOldDebtAmount
    ?? 0
);

const getCustomerOpeningPayableDate = (customer = {}) => {
  const rawDate = customer?.openingPayableDate
    || customer?.oldPayableDate
    || customer?.legacyPayableDate
    || customer?.companyOpeningDebtDate
    || customer?.createdAt
    || '';
  if (typeof rawDate === 'string' && rawDate.trim()) return rawDate.trim().slice(0, 10);
  return getTodayString();
};

const buildCustomerOpeningDebtOrder = (customer = null) => {
  if (!customer?.id) return null;
  const amount = getCustomerOpeningDebtAmount(customer);
  if (amount <= 0) return null;
  const date = getCustomerOpeningDebtDate(customer);

  return {
    id: `opening_debt_${customer.id}`,
    code: 'Nợ cũ',
    orderCode: 'Nợ cũ',
    customerId: customer.id,
    customerName: getCustomerDisplayName(customer) || customer.name || '',
    date,
    createdAt: customer.openingDebtCreatedAt || date,
    amount,
    totalAmount: amount,
    paidAmount: 0,
    appliedAmount: 0,
    creditApplied: 0,
    outstandingAmount: amount,
    allocations: [],
    items: [{ description: 'Nợ cũ', productName: 'Nợ cũ', quantity: 1, unitPrice: amount, total: amount }],
    note: customer.openingDebtNote || 'Nợ cũ trước khi sử dụng hệ thống',
    isOpeningDebt: true,
    sourceType: 'opening_debt'
  };
};

const selectCustomerHistoryRows = createCustomerRecordSelector();

const buildCustomerLedger = (customerOrId, allOrders = [], allPayments = [], { cooperative = false, historyAlreadySelected = false } = {}) => {
  function* calculate() {
  // Per build only: the ledger mutates allocations/amounts, never these date
  // fields. Reusing parsed sort keys avoids reparsing every comparator pair;
  // no cache survives a save, a new ledger build or a different tenant.
  const sortKeys = new Map();
  const compareCustomerLedgerItems = (a, b) => compareLedgerItems(a, b, sortKeys);
  const customerRecord = typeof customerOrId === 'object' && customerOrId !== null ? customerOrId : null;
  const customerId = customerRecord?.id || customerOrId || '';
  const openingDebtOrder = buildCustomerOpeningDebtOrder(customerRecord);
  let orders = [];
  if (openingDebtOrder) orders.push(openingDebtOrder);
  const customerOrders = historyAlreadySelected ? allOrders : selectCustomerHistoryRows(allOrders, customerId);
  for (const order of customerOrders) {
    yield;
    if (order.customerId !== customerId || order.isArchived) continue;
    orders.push({...order, appliedAmount: 0, creditApplied: 0,
      outstandingAmount: Math.max(0, order.amount || 0), allocations: []});
  }
  orders = cooperative ? yield* sortProjection(orders, compareCustomerLedgerItems) : orders.sort(compareCustomerLedgerItems);
  let payments = [];
  const customerPayments = historyAlreadySelected ? allPayments : selectCustomerHistoryRows(allPayments, customerId);
  for (const payment of customerPayments) {
    yield;
    if (payment.customerId !== customerId || payment.isArchived || !isCashflowOfficial(payment)) continue;
    payments.push({...payment, appliedAmount: 0, overpaidAmount: 0, allocations: []});
  }
  payments = cooperative ? yield* sortProjection(payments, compareCustomerLedgerItems) : payments.sort(compareCustomerLedgerItems);
  let timeline = [];
  for (const order of orders) { yield; timeline.push({type: 'order', date: order.date, id: 'order_'+order.id, ref: order}); }
  for (const payment of payments) { yield; timeline.push({type: 'payment', date: getPaymentDateKey(payment) || payment.date, id: 'payment_'+payment.id, ref: payment}); }
  const compareTimeline = (a, b) => {
    const baseCompare = compareCustomerLedgerItems(a, b);
    if (baseCompare !== 0) return baseCompare;
    if (a.type === b.type) return 0;
    return a.type === 'order' ? -1 : 1;
  };
  timeline = cooperative ? yield* sortProjection(timeline, compareTimeline) : timeline.sort(compareTimeline);

  const openOrders = [];
  let customerCredit = 0;

  for (const item of timeline) {
    yield;
    if (item.type === 'order') {
      const order = item.ref;
      if (customerCredit > 0) {
        const covered = Math.min(customerCredit, order.outstandingAmount);
        order.appliedAmount += covered;
        order.creditApplied += covered;
        order.outstandingAmount -= covered;
        customerCredit -= covered;
      }

      if (order.outstandingAmount > 0) {
        openOrders.push(order);
      }
      continue;
    }

    const payment = item.ref;
    let remaining = Math.max(0, payment.amount || 0);
    const shouldPrioritizeMatchedOrder = payment.matchedOrderId
      && !payment.allocateOldestFirst
      && payment.allocationMode !== 'oldest_first';
    let prioritizedOrder = null;
    if (shouldPrioritizeMatchedOrder) for (const order of orders) {
      yield;
      if (order.id === payment.matchedOrderId) { prioritizedOrder = order; break; }
    }

    if (prioritizedOrder && prioritizedOrder.outstandingAmount > 0 && remaining > 0) {
      const prioritizedAmount = Math.min(prioritizedOrder.outstandingAmount, remaining);
      prioritizedOrder.outstandingAmount -= prioritizedAmount;
      prioritizedOrder.appliedAmount += prioritizedAmount;
      prioritizedOrder.allocations.push({ paymentId: payment.id, amount: prioritizedAmount, date: getPaymentDateKey(payment) || payment.date, matchType: 'order_code' });
      payment.appliedAmount += prioritizedAmount;
      payment.allocations.push({ orderId: prioritizedOrder.id, amount: prioritizedAmount, date: prioritizedOrder.date, matchType: 'order_code' });
      remaining -= prioritizedAmount;
    }

    for (const order of openOrders) {
      yield;
      if (remaining <= 0) break;
      if (prioritizedOrder && order.id === prioritizedOrder.id) continue;
      if (order.outstandingAmount <= 0) continue;

      const applied = Math.min(order.outstandingAmount, remaining);
      order.outstandingAmount -= applied;
      order.appliedAmount += applied;
      order.allocations.push({ paymentId: payment.id, amount: applied, date: getPaymentDateKey(payment) || payment.date });
      payment.appliedAmount += applied;
      payment.allocations.push({ orderId: order.id, amount: applied, date: order.date });
      remaining -= applied;
    }

    if (remaining > 0) {
      payment.overpaidAmount = remaining;
      customerCredit += remaining;
    }
  }

  const orderDetails = [];
  for (const order of orders) {
    yield;
    orderDetails.push({
    ...order,
    outstandingAmount: Math.max(0, order.outstandingAmount),
    status: order.outstandingAmount <= 0 ? 'paid' : order.appliedAmount > 0 ? 'partial' : 'unpaid'
    });
  }
  let totalRevenue = 0, totalPaid = 0, currentDebt = 0;
  for (const order of orderDetails) { yield; totalRevenue += order.isOpeningDebt ? 0 : (order.amount || 0); }
  for (const payment of payments) { yield; totalPaid += payment.amount || 0; }
  for (const order of orderDetails) { yield; currentDebt += order.outstandingAmount || 0; }

  return {
    orders: orderDetails,
    payments,
    totalRevenue,
    totalPaid,
    currentDebt,
    creditBalance: Math.max(0, customerCredit)
  };
  }
  const iterator = calculate();
  if (cooperative) return iterator;
  for (;;) { const next = iterator.next(); if (next.done) return next.value; }
};

const buildCustomerSupplierPurchaseLedger = (customerOrId, warehouseImports = []) => {
  const customerRecord = typeof customerOrId === 'object' && customerOrId !== null ? customerOrId : null;
  const customerId = `${customerRecord?.id || (typeof customerOrId === 'string' ? customerOrId : '') || ''}`.trim();
  const customerPhone = normalizeCustomerPhone(customerRecord?.phone || customerRecord?.phoneNumber || '');
  const customerNameKey = normalizeLookupText(getCustomerDisplayName(customerRecord) || customerRecord?.name || '');
  const openingPayableAmount = getCustomerOpeningPayableAmount(customerRecord || {});
  const openingPayableDate = getCustomerOpeningPayableDate(customerRecord || {});
  const openingPayableNote = `${customerRecord?.openingPayableNote || customerRecord?.oldPayableNote || customerRecord?.companyOpeningDebtNote || ''}`.trim();
  const imports = (Array.isArray(warehouseImports) ? warehouseImports : [])
    .filter(item => item && !item.isArchived)
    .filter(item => {
      const supplierCustomerId = `${item.supplierCustomerId || item.linkedCustomerId || item.customerId || ''}`.trim();
      if (customerId && supplierCustomerId && supplierCustomerId === customerId) return true;

      const supplierPhone = normalizeCustomerPhone(item.supplierPhone || item.phone || item.customerPhone || '');
      if (customerPhone && supplierPhone && supplierPhone === customerPhone) return true;

      const supplierNameKey = normalizeLookupText(item.supplier || item.supplierName || item.customerName || item.customerNameSnapshot || '');
      return Boolean(customerNameKey && supplierNameKey && supplierNameKey === customerNameKey);
    })
    .map(item => {
      const totalKg = parseLooseQuantityValue(item.totalKg ?? item.weightKg ?? item.kg);
      const unitPrice = parseLooseMoneyValue(item.unitPrice ?? item.price);
      const rawAmount = parseLooseMoneyValue(item.amount ?? item.totalAmount ?? item.value ?? item.total);
      const amount = roundMoneyValue(item.amount != null || item.totalAmount != null || item.value != null || item.total != null
        ? rawAmount
        : purchaseAmount({ ...item, totalKg, quantity: parseLooseQuantityValue(item.quantity), unitPrice }, item.purchaseUnit || 'Kg'));
      return { ...item, amount };
    })
    .filter(item => item.amount > 0)
    .sort(compareLedgerItems);
  const purchaseImportAmount = roundMoneyValue(imports.reduce((sum, item) => sum + parseLooseMoneyValue(item.amount), 0));
  const totalPurchaseDebt = roundMoneyValue(openingPayableAmount + purchaseImportAmount);
  return {
    imports,
    purchaseImportAmount,
    openingPayableAmount,
    openingPayableDate,
    openingPayableNote,
    hasOpeningPayable: openingPayableAmount > 0,
    totalPurchaseDebt
  };
};

const applyCustomerSupplierReconciliation = (ledger = {}, purchaseLedger = {}, repayments = []) => {
  const salesDebtBeforeReconcile = Math.max(0, roundMoneyValue(parseLooseMoneyValue(ledger.currentDebt)));
  const customerCreditBeforeReconcile = Math.max(0, roundMoneyValue(parseLooseMoneyValue(ledger.creditBalance)));
  const purchaseDebt = Math.max(0, roundMoneyValue(parseLooseMoneyValue(purchaseLedger.totalPurchaseDebt)));
  const totalRepaid = roundMoneyValue(repayments.reduce((sum, item) => sum + Math.max(0, parseLooseMoneyValue(item.amount)), 0));
  const companyOwesBeforeReconcile = roundMoneyValue(customerCreditBeforeReconcile + purchaseDebt - totalRepaid);
  const reconciliationOffset = Math.max(0, roundMoneyValue(Math.min(salesDebtBeforeReconcile, companyOwesBeforeReconcile)));
  const currentDebt = Math.max(0, roundMoneyValue(salesDebtBeforeReconcile - companyOwesBeforeReconcile));
  const creditBalance = Math.max(0, roundMoneyValue(companyOwesBeforeReconcile - salesDebtBeforeReconcile));

  return {
    ...ledger,
    repayments,
    totalRepaid,
    currentDebt,
    creditBalance,
    hasPurchaseReconciliation: (purchaseLedger.imports || []).length > 0 || purchaseDebt > 0,
    salesDebtBeforeReconcile,
    customerCreditBeforeReconcile,
    openingPayableAmount: purchaseLedger.openingPayableAmount || 0,
    openingPayableDate: purchaseLedger.openingPayableDate || '',
    openingPayableNote: purchaseLedger.openingPayableNote || '',
    purchaseImportAmount: purchaseLedger.purchaseImportAmount || 0,
    purchaseDebt,
    purchaseImports: purchaseLedger.imports || [],
    companyOwesBeforeReconcile,
    reconciliationOffset,
    reconciliationNetAmount: currentDebt || creditBalance,
    reconciliationStatus: currentDebt > 0
      ? 'customer_owes_company'
      : creditBalance > 0
        ? 'company_owes_customer'
        : 'balanced'
  };
};

const getCustomerDebtRepayments = (customerOrId, expenses = []) => {
  const customerId = typeof customerOrId === 'string' ? customerOrId : customerOrId?.id;
  return expenses.filter(item => item && !item.isArchived && item.sourceType === 'customer_debt_repayment'
    && item.customerId === customerId && isCashflowOfficial(item)
    && (!customerOrId?.companyId || item.companyId === customerOrId.companyId));
};

const buildCustomerReconciledLedger = (customerOrId, allOrders = [], allPayments = [], warehouseImports = [], expenses = []) => {
  const ledger = buildCustomerLedger(customerOrId, allOrders, allPayments);
  const purchaseLedger = buildCustomerSupplierPurchaseLedger(customerOrId, warehouseImports);
  return applyCustomerSupplierReconciliation(ledger, purchaseLedger, getCustomerDebtRepayments(customerOrId, expenses));
};

const getDateKeyFromAnyValue = (value = '') => {
  if (!value) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : toDateInputString(value);
  if (typeof value === 'number' && Number.isFinite(value)) return toDateInputString(new Date(value));
  if (typeof value?.toDate === 'function') {
    const parsedDate = value.toDate();
    return parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime()) ? toDateInputString(parsedDate) : '';
  }
  if (typeof value === 'object') {
    const timestamp = parseEntityTimestampValue(value);
    return timestamp ? toDateInputString(new Date(timestamp)) : '';
  }
  const raw = `${value || ''}`.trim();
  const directDate = raw.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
  if (directDate) return directDate;
  const vietnameseTimestamp = parseVietnameseDateTimeString(raw);
  if (vietnameseTimestamp) return toDateInputString(new Date(vietnameseTimestamp));
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : toDateInputString(parsed);
};

const getPaymentRawPayosData = (payment = {}) => {
  const rawWebhook = payment.rawWebhook || payment.rawPayload || {};
  const data = rawWebhook?.data || {};
  const paymentLink = rawWebhook?.paymentLink || data?.paymentLink || {};
  const latestTransaction = rawWebhook?.latestTransaction || data?.latestTransaction || {};
  const transactions = Array.isArray(paymentLink?.transactions) ? paymentLink.transactions : [];
  const latestLinkedTransaction = transactions
    .slice()
    .sort((a, b) => `${b?.transactionDateTime || b?.transactionDate || b?.createdAt || ''}`.localeCompare(`${a?.transactionDateTime || a?.transactionDate || a?.createdAt || ''}`))[0] || {};

  return {
    rawWebhook,
    data,
    paymentLink,
    latestTransaction,
    latestLinkedTransaction
  };
};

const getPaymentDateCandidates = (payment = {}) => {
  const { rawWebhook, data, paymentLink, latestTransaction, latestLinkedTransaction } = getPaymentRawPayosData(payment);
  return [
    payment.paymentDate,
    payment.transactionDate,
    payment.transactionDateTime,
    payment.bankTransactionDate,
    data.transactionDateTime,
    data.transactionDate,
    data.paymentTime,
    data.completedTime,
    data.paidAt,
    latestTransaction.transactionDateTime,
    latestTransaction.transactionDate,
    latestTransaction.paymentTime,
    latestTransaction.completedTime,
    latestTransaction.paidAt,
    latestTransaction.createdAt,
    latestLinkedTransaction.transactionDateTime,
    latestLinkedTransaction.transactionDate,
    latestLinkedTransaction.paymentTime,
    latestLinkedTransaction.completedTime,
    latestLinkedTransaction.paidAt,
    latestLinkedTransaction.createdAt,
    paymentLink.transactionDateTime,
    paymentLink.transactionDate,
    paymentLink.paymentTime,
    paymentLink.completedTime,
    paymentLink.paidAt,
    paymentLink.createdAt,
    rawWebhook.transactionDateTime,
    rawWebhook.transactionDate,
    rawWebhook.paymentTime,
    rawWebhook.completedTime,
    rawWebhook.paidAt,
    payment.paidAt,
    payment.transactionAt,
    payment.transactedAt,
    payment.paymentTime,
    payment.completedTime,
    payment.completedAt,
    data.createdAt,
    rawWebhook.createdAt,
    payment.date,
    payment.createdAt,
    payment.updatedAt,
    getEntityTimestamp(payment)
  ];
};

const getPaymentDateSource = (payment = {}) => (
  getPaymentDateCandidates(payment).find(candidate => getDateKeyFromAnyValue(candidate)) || ''
);

const getPaymentDateKey = (payment = {}) => getDateKeyFromAnyValue(getPaymentDateSource(payment));

const getPaymentTimestamp = (payment = {}) => (
  parseEntityTimestampValue(getPaymentDateSource(payment))
    || getEntityTimestamp(payment)
    || (getPaymentDateKey(payment) ? new Date(`${getPaymentDateKey(payment)}T12:00:00`).getTime() : 0)
);

export {isOwnerAccountUser,isOwnerPosition,getEntityTimestamp,isEmployeeSalesPosition,normalizeEmployeePosition,getTodayString,getDateKeyFromAnyValue,buildCustomerReconciledLedger,parseLooseMoneyValue,roundMoneyValue,normalizeEmployeeRoleSalaryComponents,isSalesPosition,WAREHOUSE_EXPORT_POSITION,formatCurrency,SALES_COLLABORATOR_POSITION,getSalesLeaderId,parseInputCurrency};
