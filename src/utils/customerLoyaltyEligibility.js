export const LOYALTY_ELIGIBILITY_CONDITION_DEFINITIONS = Object.freeze([
  {
    id: 'delivered',
    label: 'Đã giao hàng',
    customerDescription: 'Đơn hàng cần được xác nhận đã giao.'
  },
  {
    id: 'fullyPaid',
    label: 'Đã thanh toán đủ',
    customerDescription: 'Đơn hàng cần thanh toán đủ trước khi nhận điểm.'
  },
  {
    id: 'noReturn',
    label: 'Không trả hàng',
    customerDescription: 'Đơn hàng không có phần trả hàng hoặc hủy.'
  },
  {
    id: 'notOverdue',
    label: 'Không quá hạn',
    customerDescription: 'Công nợ của đơn hàng chưa quá hạn thanh toán.'
  },
  {
    id: 'withinCreditLimit',
    label: 'Trong hạn mức công nợ',
    customerDescription: 'Công nợ hiện tại không vượt hạn mức công ty đã cấu hình.'
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
  const status = getOrderStatus(order);
  return order.isCancelled === true
    || order.isArchived === true
    || ['cancelled', 'canceled', 'cancel', 'deleted', 'da huy', 'huy'].includes(status);
};

const isDelivered = (order = {}) => {
  const status = getOrderStatus(order);
  return order.isDelivered === true
    || order.delivered === true
    || ['delivered', 'completed', 'complete', 'da giao', 'hoan thanh'].includes(status);
};

const hasReturn = (order = {}) => {
  const status = normalizeText(order.returnStatus ?? order.returnedStatus ?? '');
  return order.hasReturn === true
    || order.isReturned === true
    || parseMoney(order.returnAmount ?? order.returnedAmount ?? 0) > 0
    || ['returned', 'partial_return', 'da tra', 'tra hang'].includes(status);
};

const isPaid = (order = {}, ledgerOrder = null) => {
  if (ledgerOrder && parseMoney(ledgerOrder.outstandingAmount) <= 0) return true;
  const paymentStatus = normalizeText(order.paymentStatus ?? order.payment_state ?? '');
  if (['paid', 'fully_paid', 'da thanh toan'].includes(paymentStatus)) return true;
  const total = parseMoney(order.finalTotal ?? order.totalAmount ?? order.total ?? order.amount ?? 0);
  const paid = parseMoney(order.paidAmount ?? order.amountPaid ?? order.collectedAmount ?? 0);
  return total > 0 && paid >= total;
};

const getDateKey = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value?.toDate) return value.toDate().toISOString().slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return '';
};

const isOverdue = (order = {}, ledgerOrder = null, today = '') => {
  const dueDate = getDateKey(order.dueDate ?? order.paymentDueDate ?? order.due_at);
  if (!dueDate) return false;
  const outstanding = ledgerOrder ? parseMoney(ledgerOrder.outstandingAmount) : 1;
  return outstanding > 0 && dueDate < today;
};

export const evaluateCustomerLoyaltyOrder = ({
  order = {},
  ledgerOrder = null,
  customerDebtLimitStatus = {},
  conditions = {},
  today = new Date().toISOString().slice(0, 10)
} = {}) => {
  const normalizedConditions = normalizeLoyaltyEligibilityConditions(conditions);
  if (isCancelled(order)) {
    return {
      eligible: false,
      failedConditionIds: ['orderActive'],
      conditions: normalizedConditions
    };
  }

  const failedConditionIds = [];
  if (normalizedConditions.delivered && !isDelivered(order)) failedConditionIds.push('delivered');
  if (normalizedConditions.fullyPaid && !isPaid(order, ledgerOrder)) failedConditionIds.push('fullyPaid');
  if (normalizedConditions.noReturn && hasReturn(order)) failedConditionIds.push('noReturn');
  if (normalizedConditions.notOverdue && isOverdue(order, ledgerOrder, today)) failedConditionIds.push('notOverdue');
  if (normalizedConditions.withinCreditLimit && customerDebtLimitStatus?.exceeded === true) {
    failedConditionIds.push('withinCreditLimit');
  }

  return {
    eligible: failedConditionIds.length === 0,
    failedConditionIds,
    conditions: normalizedConditions
  };
};
