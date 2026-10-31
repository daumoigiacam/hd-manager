// Frozen candidate 0c29b54f source, before cooperative ledger changes.
export default (customerOrId, allOrders = [], allPayments = []) => {
  // Per build only: the ledger mutates allocations/amounts, never these date
  // fields. Reusing parsed sort keys avoids reparsing every comparator pair;
  // no cache survives a save, a new ledger build or a different tenant.
  const sortKeys = new Map();
  const compareCustomerLedgerItems = (a, b) => compareLedgerItems(a, b, sortKeys);
  const customerRecord = typeof customerOrId === 'object' && customerOrId !== null ? customerOrId : null;
  const customerId = customerRecord?.id || customerOrId || '';
  const openingDebtOrder = buildCustomerOpeningDebtOrder(customerRecord);
  const orders = [
    ...(openingDebtOrder ? [openingDebtOrder] : []),
    ...selectCustomerHistoryRows(allOrders, customerId)
    .filter(order => order.customerId === customerId && !order.isArchived)
    .map(order => ({
      ...order,
      appliedAmount: 0,
      creditApplied: 0,
      outstandingAmount: Math.max(0, order.amount || 0),
      allocations: []
    }))
  ]
    .sort(compareCustomerLedgerItems);

  const payments = selectCustomerHistoryRows(allPayments, customerId)
    .filter(payment => payment.customerId === customerId && !payment.isArchived && isCashflowOfficial(payment))
    .map(payment => ({
      ...payment,
      appliedAmount: 0,
      overpaidAmount: 0,
      allocations: []
    }))
    .sort(compareCustomerLedgerItems);

  const timeline = [
    ...orders.map(order => ({ type: 'order', date: order.date, id: `order_${order.id}`, ref: order })),
    ...payments.map(payment => ({ type: 'payment', date: getPaymentDateKey(payment) || payment.date, id: `payment_${payment.id}`, ref: payment }))
  ].sort((a, b) => {
    const baseCompare = compareCustomerLedgerItems(a, b);
    if (baseCompare !== 0) return baseCompare;
    if (a.type === b.type) return 0;
    return a.type === 'order' ? -1 : 1;
  });

  const openOrders = [];
  let customerCredit = 0;

  timeline.forEach(item => {
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
      return;
    }

    const payment = item.ref;
    let remaining = Math.max(0, payment.amount || 0);
    const shouldPrioritizeMatchedOrder = payment.matchedOrderId
      && !payment.allocateOldestFirst
      && payment.allocationMode !== 'oldest_first';
    const prioritizedOrder = shouldPrioritizeMatchedOrder
      ? orders.find(order => order.id === payment.matchedOrderId)
      : null;

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
  });

  const orderDetails = orders.map(order => ({
    ...order,
    outstandingAmount: Math.max(0, order.outstandingAmount),
    status: order.outstandingAmount <= 0 ? 'paid' : order.appliedAmount > 0 ? 'partial' : 'unpaid'
  }));

  const totalRevenue = orderDetails.reduce((sum, order) => sum + (order.isOpeningDebt ? 0 : (order.amount || 0)), 0);
  const totalPaid = payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
  const currentDebt = orderDetails.reduce((sum, order) => sum + (order.outstandingAmount || 0), 0);

  return {
    orders: orderDetails,
    payments,
    totalRevenue,
    totalPaid,
    currentDebt,
    creditBalance: Math.max(0, customerCredit)
  };
};
