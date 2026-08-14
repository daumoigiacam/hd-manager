const crypto = require('crypto');

const MAX_CUSTOMER_DEBT_PAYMENT_ORDERS = 50;

const parseMoney = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const normalized = `${value ?? ''}`.replace(/[^\d.-]/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
};

const getEntityTimestamp = (value) => {
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 100000000000 ? value * 1000 : value;
  }
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'object' && Number.isFinite(value.seconds)) {
    return (value.seconds * 1000) + Math.floor(Number(value.nanoseconds || 0) / 1000000);
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const getLedgerTimestamp = (item = {}) => getEntityTimestamp(
  item.transactionDateTime
  || item.paidAt
  || item.transactionAt
  || item.paymentTime
  || item.completedAt
  || item.paymentDate
  || item.transactionDate
  || item.date
  || item.createdAt
  || item.updatedAt
);

const compareLedgerItems = (left = {}, right = {}) => {
  const timestampDifference = getLedgerTimestamp(left) - getLedgerTimestamp(right);
  if (timestampDifference !== 0) return timestampDifference;
  return `${left.id || ''}`.localeCompare(`${right.id || ''}`);
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

const isUnconfirmedPaymentIntent = (payment = {}) => {
  const sourceType = String(payment.sourceType || payment.type || '').trim().toLowerCase();
  const statuses = [
    payment.status,
    payment.paymentStatus,
    payment.settlementStatus,
    payment.reconciliationStatus
  ]
    .map(value => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  return Boolean(
    payment.isPaymentIntent === true
    || payment.paymentIntent === true
    || payment.isCustomerDebtPaymentIntent === true
    || PAYMENT_INTENT_SOURCE_TYPES.has(sourceType)
    || statuses.some(status => UNCONFIRMED_PAYMENT_STATUSES.has(status))
  );
};

const isOfficialPayment = (payment = {}) => {
  const requiresApproval = Boolean(
    payment.requiresApproval
    || ['pending_handover', 'rejected'].includes(payment.approvalStatus)
    || ['pending', 'handed_over'].includes(payment.handoverStatus)
    || ['driver_delivery_expense', 'employee_reported_expense', 'employee_reported_income'].includes(payment.sourceType)
    || (payment.sourceType === 'driver_cash' && payment.createdByRole === 'driver')
  );
  return !isUnconfirmedPaymentIntent(payment)
    && (!requiresApproval || payment.approvalStatus === 'approved');
};

const getCustomerId = (record = {}) => `${
  record.customerId
  || record.customer_id
  || record.customer?.id
  || record.customer?.customerId
  || ''
}`.trim();

// Match the customer ledger exactly: `amount` is the canonical invoice total.
// Falling back to another historical field could make the QR differ from the
// debt amount the customer selected on screen.
const getOrderAmount = (order = {}) => parseMoney(order.amount || 0);

// Keep server-side debt allocation identical to the customer ledger. `amount`
// is the canonical approved payment value used by the app.
const getPaymentAmount = (payment = {}) => parseMoney(payment.amount || 0);

const buildCustomerDebtLedger = ({ customer = {}, orders = [], payments = [] } = {}) => {
  const customerId = `${customer.id || customer.customerId || ''}`.trim();
  const openingDebtAmount = parseMoney(
    customer.openingDebtAmount
    ?? customer.oldDebtAmount
    ?? customer.legacyDebtAmount
    ?? 0
  );
  const openingDebt = openingDebtAmount > 0 ? {
    id: `opening_debt_${customerId || 'customer'}`,
    customerId,
    amount: openingDebtAmount,
    outstandingAmount: openingDebtAmount,
    appliedAmount: 0,
    isOpeningDebt: true,
    date: customer.openingDebtDate
      || customer.oldDebtDate
      || customer.legacyDebtDate
      || customer.createdAt
      || new Date().toISOString()
  } : null;
  const ledgerOrders = [
    ...(openingDebt ? [openingDebt] : []),
    ...(Array.isArray(orders) ? orders : [])
      .filter(order => order && !order.isArchived && (!customerId || getCustomerId(order) === customerId))
      .map(order => ({
        ...order,
        id: `${order.id || order.orderId || ''}`.trim(),
        amount: getOrderAmount(order),
        outstandingAmount: getOrderAmount(order),
        appliedAmount: 0
      }))
      .filter(order => order.id && order.amount > 0)
  ].sort(compareLedgerItems);
  const ledgerPayments = (Array.isArray(payments) ? payments : [])
    .filter(payment => payment && !payment.isArchived && isOfficialPayment(payment))
    .filter(payment => !customerId || getCustomerId(payment) === customerId)
    .map(payment => ({
      ...payment,
      id: `${payment.id || ''}`.trim(),
      amount: getPaymentAmount(payment)
    }))
    .filter(payment => payment.amount > 0)
    .sort(compareLedgerItems);
  const timeline = [
    ...ledgerOrders.map(order => ({ type: 'order', ref: order })),
    ...ledgerPayments.map(payment => ({ type: 'payment', ref: payment }))
  ].sort((left, right) => {
    const baseDifference = compareLedgerItems(left.ref, right.ref);
    if (baseDifference !== 0) return baseDifference;
    if (left.type === right.type) return 0;
    return left.type === 'order' ? -1 : 1;
  });

  const openOrders = [];
  let customerCredit = 0;
  timeline.forEach(({ type, ref }) => {
    if (type === 'order') {
      if (customerCredit > 0) {
        const appliedCredit = Math.min(customerCredit, ref.outstandingAmount);
        ref.outstandingAmount -= appliedCredit;
        ref.appliedAmount += appliedCredit;
        customerCredit -= appliedCredit;
      }
      if (ref.outstandingAmount > 0) openOrders.push(ref);
      return;
    }

    let remaining = ref.amount;
    const shouldPrioritizeMatchedOrder = Boolean(
      ref.matchedOrderId
      && !ref.allocateOldestFirst
      && ref.allocationMode !== 'oldest_first'
    );
    const prioritizedOrder = shouldPrioritizeMatchedOrder
      ? ledgerOrders.find(order => order.id === `${ref.matchedOrderId || ''}`)
      : null;
    if (prioritizedOrder?.outstandingAmount > 0) {
      const applied = Math.min(prioritizedOrder.outstandingAmount, remaining);
      prioritizedOrder.outstandingAmount -= applied;
      prioritizedOrder.appliedAmount += applied;
      remaining -= applied;
    }
    for (const order of openOrders) {
      if (remaining <= 0) break;
      if (prioritizedOrder && order.id === prioritizedOrder.id) continue;
      if (order.outstandingAmount <= 0) continue;
      const applied = Math.min(order.outstandingAmount, remaining);
      order.outstandingAmount -= applied;
      order.appliedAmount += applied;
      remaining -= applied;
    }
    if (remaining > 0) customerCredit += remaining;
  });

  const normalizedOrders = ledgerOrders.map(order => ({
    ...order,
    outstandingAmount: Math.max(0, Math.round(order.outstandingAmount || 0))
  }));
  return {
    orders: normalizedOrders,
    orderOutstandingById: new Map(normalizedOrders.map(order => [order.id, order.outstandingAmount])),
    currentDebt: normalizedOrders.reduce((total, order) => total + order.outstandingAmount, 0),
    creditBalance: Math.max(0, Math.round(customerCredit))
  };
};

const normalizeCustomerDebtPaymentOrderIds = (orderIds = []) => {
  if (!Array.isArray(orderIds)) return [];
  return [...new Set(orderIds
    .map(orderId => `${orderId || ''}`.trim())
    .filter(Boolean))]
    .slice(0, MAX_CUSTOMER_DEBT_PAYMENT_ORDERS);
};

const normalizeCustomerDebtPaymentCode = (value = '') => `${value || ''}`
  .replace(/^\s*TT\s*/i, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, '');

const normalizeCustomerDebtPaymentLookupTokens = (tokens = []) => [...new Set(
  (Array.isArray(tokens) ? tokens : [])
    .map(normalizeCustomerDebtPaymentCode)
    .filter(token => /^HD[A-Z0-9]{4,20}$/.test(token))
)];

const buildCustomerDebtPaymentFingerprint = ({
  companyId = '',
  customerId = '',
  items = [],
  receivingProfile = {}
} = {}) => {
  const sourceItems = Array.isArray(items) ? items : [];
  const normalizedItems = sourceItems
    .map(item => ({
      orderId: `${item?.orderId || ''}`.trim(),
      amount: Math.max(0, Math.round(Number(item?.amount) || 0))
    }))
    .filter(item => item.orderId && item.amount > 0)
    .sort((left, right) => left.orderId.localeCompare(right.orderId));
  const fingerprintPayload = {
    companyId: `${companyId || ''}`.trim(),
    customerId: `${customerId || ''}`.trim(),
    receivingBankCode: `${receivingProfile.bankQrCode || receivingProfile.bankCode || receivingProfile.bankName || ''}`.trim().toUpperCase(),
    receivingAccountNumber: `${receivingProfile.accountNumber || ''}`.replace(/[^\dA-Za-z]/g, '').toUpperCase(),
    receivingAccountName: `${receivingProfile.accountName || ''}`.trim().toUpperCase(),
    items: normalizedItems
  };
  if (normalizedItems.length === 1) {
    fingerprintPayload.singleInvoiceCode = normalizeCustomerDebtPaymentCode(sourceItems[0]?.orderCode);
  }
  const source = JSON.stringify(fingerprintPayload);
  return crypto.createHash('sha256').update(source).digest('hex');
};

const buildCustomerDebtPaymentCode = (fingerprint = '') => {
  const safeFingerprint = `${fingerprint || ''}`.replace(/[^a-fA-F0-9]/g, '');
  if (!safeFingerprint) return '';
  return `HDP${safeFingerprint.slice(0, 12).toUpperCase()}`;
};

const resolveCustomerDebtPaymentCode = ({ fingerprint = '', items = [] } = {}) => {
  const normalizedItems = Array.isArray(items) ? items.filter(Boolean) : [];
  if (normalizedItems.length === 1) {
    const invoiceCode = normalizeCustomerDebtPaymentCode(normalizedItems[0]?.orderCode);
    if (/^HD[A-Z0-9]{4,20}$/.test(invoiceCode)) return invoiceCode;
  }
  return buildCustomerDebtPaymentCode(fingerprint);
};

const buildCustomerDebtPaymentIntentId = (fingerprint = '') => {
  const safeFingerprint = `${fingerprint || ''}`.replace(/[^a-fA-F0-9]/g, '');
  return safeFingerprint ? `customer_debt_${safeFingerprint.slice(0, 32).toLowerCase()}` : '';
};

const allocateCustomerDebtPayment = ({ items = [], orderOutstandingById = {}, paidAmount = 0 } = {}) => {
  let remaining = Math.max(0, Math.round(Number(paidAmount) || 0));
  const getOutstanding = (orderId) => {
    const value = orderOutstandingById instanceof Map
      ? orderOutstandingById.get(orderId)
      : orderOutstandingById?.[orderId];
    return Math.max(0, Math.round(Number(value) || 0));
  };
  const allocations = [];
  let totalOutstanding = 0;

  (Array.isArray(items) ? items : []).forEach((item) => {
    const orderId = `${item?.orderId || ''}`.trim();
    if (!orderId) return;
    const outstandingAmount = getOutstanding(orderId);
    totalOutstanding += outstandingAmount;
    const appliedAmount = Math.min(remaining, outstandingAmount);
    remaining -= appliedAmount;
    allocations.push({
      orderId,
      outstandingAmount,
      appliedAmount,
      remainingAmount: Math.max(0, outstandingAmount - appliedAmount)
    });
  });

  const appliedAmount = allocations.reduce((total, allocation) => total + allocation.appliedAmount, 0);
  return {
    allocations,
    totalOutstanding,
    appliedAmount,
    remainingOutstanding: Math.max(0, totalOutstanding - appliedAmount),
    overpaidAmount: Math.max(0, remaining)
  };
};

module.exports = {
  MAX_CUSTOMER_DEBT_PAYMENT_ORDERS,
  allocateCustomerDebtPayment,
  buildCustomerDebtLedger,
  buildCustomerDebtPaymentCode,
  buildCustomerDebtPaymentFingerprint,
  buildCustomerDebtPaymentIntentId,
  normalizeCustomerDebtPaymentOrderIds,
  normalizeCustomerDebtPaymentLookupTokens,
  resolveCustomerDebtPaymentCode
};
