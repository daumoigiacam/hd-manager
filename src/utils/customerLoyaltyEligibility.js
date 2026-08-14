export const LOYALTY_ELIGIBILITY_CONDITION_DEFINITIONS = Object.freeze([
  {
    id: 'notOverdue',
    label: 'Không quá hạn',
    customerDescription: 'Công nợ của đơn hàng không được quá 23:59 trong ngày.'
  },
  {
    id: 'withinCreditLimit',
    label: 'Trong hạn mức công nợ',
    customerDescription: 'Công nợ hiện tại không vượt hạn mức công ty đã cho phép.'
  },
  {
    id: 'orderedViaHdManager',
    label: 'Đặt hàng qua HD Manager',
    customerDescription: 'Khách hàng cần sử dụng app HD Manager để đặt hàng.'
  },
  {
    id: 'delivered',
    label: 'Đã giao hàng',
    customerDescription: 'Đơn hàng cần được xác nhận đã giao.'
  },
  {
    id: 'afterFifteenOrders',
    label: 'Áp dụng sau 15 đơn hàng',
    customerDescription: 'Điểm được áp dụng từ đơn thứ 16 của khách hàng.'
  }
]);

export const DEFAULT_LOYALTY_ELIGIBILITY_CONDITIONS = Object.freeze(
  Object.fromEntries(LOYALTY_ELIGIBILITY_CONDITION_DEFINITIONS.map(({ id }) => [id, false]))
);

export const normalizeLoyaltyEligibilityConditions = (value = {}) => {
  const source = value && typeof value === 'object' ? value : {};
  return LOYALTY_ELIGIBILITY_CONDITION_DEFINITIONS.reduce((conditions, { id }) => {
    conditions[id] = source[id] === true;
    return conditions;
  }, {});
};

export const getEnabledLoyaltyEligibilityConditions = (value = {}) => {
  const conditions = normalizeLoyaltyEligibilityConditions(value);
  return LOYALTY_ELIGIBILITY_CONDITION_DEFINITIONS.filter(({ id }) => conditions[id]);
};

const normalizeText = (value) => `${value ?? ''}`
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase()
  .replace(/đ/g, 'd');

const parseMoney = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  const normalized = `${value ?? ''}`
    .trim()
    .replace(/\s/g, '')
    // Remove Vietnamese thousands separators while preserving decimal values.
    .replace(/\.(?=\d{3}(?:[.,]|$))/g, '')
    .replace(/,(?=\d{3}(?:[.,]|$))/g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const getOrderStatus = (order = {}) => normalizeText(
  order.deliveryStatus
  ?? order.fulfillmentStatus
  ?? order.status
  ?? order.orderStatus
  ?? order.reviewStatus
  ?? ''
);

const isCancelled = (order = {}) => {
  const statuses = [
    order.deliveryStatus,
    order.fulfillmentStatus,
    order.status,
    order.orderStatus,
    order.reviewStatus
  ].map(normalizeText);
  return order.isCancelled === true
    || order.isArchived === true
    || statuses.some(status => ['cancelled', 'canceled', 'cancel', 'deleted', 'da huy', 'huy'].includes(status));
};

export const isActiveCustomerLoyaltyOrder = (order = {}) => !isCancelled(order);

const isDelivered = (order = {}) => {
  const status = getOrderStatus(order);
  return order.isDelivered === true
    || order.delivered === true
    || ['delivered', 'completed', 'complete', 'da giao', 'hoan thanh'].includes(status);
};

const getDateKey = (value) => {
  if (!value) return '';
  if (typeof value === 'string') {
    const isoDate = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoDate) return isoDate[1];
    const vietnameseDate = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (vietnameseDate) {
      const [, day, month, year] = vietnameseDate;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    return '';
  }
  if (value?.toDate) return getDateKey(value.toDate());
  if (typeof value?.seconds === 'number') return getDateKey(new Date(value.seconds * 1000));
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return '';
};

const getOrderOutstandingAmount = (order = {}, ledgerOrder = null) => {
  const ledgerOutstanding = ledgerOrder?.outstandingAmount
    ?? ledgerOrder?.remainingAmount
    ?? ledgerOrder?.remainingDebt;
  if (ledgerOutstanding !== undefined && ledgerOutstanding !== null) {
    return parseMoney(ledgerOutstanding);
  }
  const directOutstanding = order.outstandingAmount
    ?? order.remainingAmount
    ?? order.remainingDebt;
  if (directOutstanding !== undefined && directOutstanding !== null) {
    return parseMoney(directOutstanding);
  }
  const total = parseMoney(order.finalTotal ?? order.totalAmount ?? order.total ?? order.amount ?? order.totalDue ?? 0);
  const paid = parseMoney(order.paidAmount ?? order.amountPaid ?? order.collectedAmount ?? order.paid ?? 0);
  return Math.max(0, total - paid);
};

const isOverdue = (order = {}, ledgerOrder = null, today = '') => {
  // Debt expires at 23:59 on its order/due date; missing legacy dates do not fail by assumption.
  const dueDate = getDateKey(
    order.dueDate
    ?? order.paymentDueDate
    ?? order.due_at
    ?? order.date
    ?? order.orderDate
    ?? order.orderDateKey
    ?? order.createdAt
  );
  if (!dueDate || !today) return false;
  return getOrderOutstandingAmount(order, ledgerOrder) > 0 && dueDate < today;
};

const isOrderedViaHdManager = (order = {}) => {
  if (
    order.placedViaHdManager === true
    || order.isCustomerPortalOrder === true
    || order.submittedViaHdManager === true
    || Boolean(order.createdByCustomerId)
    || normalizeText(order.createdByRole) === 'customer'
  ) {
    return true;
  }

  const source = normalizeText(
    order.orderSource
    ?? order.source
    ?? order.sourceType
    ?? order.createdFrom
    ?? order.origin
    ?? ''
  );
  return [
    'customer_portal',
    'customer portal',
    'customer_app',
    'customer app',
    'hd_manager_customer',
    'hd manager customer'
  ].some((candidate) => source.includes(candidate));
};

export const evaluateCustomerLoyaltyOrder = ({
  order = {},
  ledgerOrder = null,
  customerDebtLimitStatus = {},
  conditions = {},
  completedOrderCountBefore = 0,
  today = new Date().toISOString().slice(0, 10)
} = {}) => {
  const normalizedConditions = normalizeLoyaltyEligibilityConditions(conditions);
  if (!isActiveCustomerLoyaltyOrder(order)) {
    return {
      eligible: false,
      failedConditionIds: ['orderActive'],
      conditions: normalizedConditions
    };
  }

  const failedConditionIds = [];
  if (normalizedConditions.notOverdue && isOverdue(order, ledgerOrder, today)) {
    failedConditionIds.push('notOverdue');
  }
  if (normalizedConditions.withinCreditLimit && customerDebtLimitStatus?.exceeded === true) {
    failedConditionIds.push('withinCreditLimit');
  }
  if (normalizedConditions.orderedViaHdManager && !isOrderedViaHdManager(order)) {
    failedConditionIds.push('orderedViaHdManager');
  }
  if (normalizedConditions.delivered && !isDelivered(order)) {
    failedConditionIds.push('delivered');
  }
  if (normalizedConditions.afterFifteenOrders && Number(completedOrderCountBefore) < 15) {
    failedConditionIds.push('afterFifteenOrders');
  }

  return {
    eligible: failedConditionIds.length === 0,
    failedConditionIds,
    conditions: normalizedConditions
  };
};
