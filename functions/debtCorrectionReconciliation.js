const { isOfficialPayment } = require('./customerDebtPayment');

// Read-only audit of a COMPLETE customer scope. Never recompute FIFO or repair
// history here: corrections must preserve allocations on unrelated invoices.
function reconcileCorrectedCustomerDebt({ companyId, customerId, complete, orders = [], payments = [],
  states = [], corrections = [], refunds = [], credits = [] }) {
  const issues = [];
  const fail = (code, id) => issues.push({ code, id });
  const money = value => Number.isSafeInteger(value) && value >= 0;
  if (!companyId || !customerId || complete !== true) fail('incomplete_scope', customerId);
  const index = (rows, kind, customerRequired = true) => {
    const result = new Map();
    for (const row of rows) {
      if (!row?.id || result.has(row.id)) { fail('duplicate_or_missing_identity', kind); continue; }
      if (row.companyId !== companyId || (customerRequired && row.customerId !== customerId)) fail('foreign_scope', row.id);
      result.set(row.id, row);
    }
    return result;
  };
  const orderMap = index(orders, 'orders');
  const paymentMap = index(payments, 'payments');
  const correctionMap = index(corrections, 'corrections');
  const refundMap = index(refunds, 'refunds', false);
  index(credits, 'credits');
  index(states, 'states');
  const balances = new Map();
  for (const order of orderMap.values()) {
    if (order.isArchived || !money(order.amount)) fail('invalid_charge', order.id);
    balances.set(order.id, { orderId: order.id, charge: order.amount, credit: 0, allocated: 0 });
  }
  const creditOperations = new Set();
  for (const credit of credits) {
    const balance = balances.get(credit.orderId);
    if (!balance || !money(credit.amount) || !credit.operationKey || !credit.actor || !credit.createdAt
      || creditOperations.has(credit.operationKey)) { fail('invalid_credit', credit.id); continue; }
    creditOperations.add(credit.operationKey);
    balance.credit += credit.amount;
  }
  let received = 0;
  let refunded = 0;
  let unallocated = 0;
  const referencedRefunds = new Set();
  const operationKeys = new Set();
  for (const payment of paymentMap.values()) {
    if (payment.isArchived || !isOfficialPayment(payment) || !money(payment.amount) || !Array.isArray(payment.allocations)) {
      fail('authoritative_allocation_required', payment.id); continue;
    }
    const allocations = new Map();
    for (const allocation of payment.allocations) {
      if (!balances.has(allocation.orderId) || !money(allocation.amount) || allocations.has(allocation.orderId)) {
        fail('invalid_allocation', payment.id); continue;
      }
      allocations.set(allocation.orderId, allocation.amount);
    }
    const allocated = [...allocations.values()].reduce((a, b) => a + b, 0);
    if (!money(allocated) || allocated > payment.amount) fail('allocation_exceeds_payment', payment.id);
    let free = payment.amount - allocated;
    let paidBack = 0;
    const events = [...correctionMap.values()].filter(row => row.paymentId === payment.id).sort((a, b) => a.revision - b.revision);
    for (const [i, event] of events.entries()) {
      if (event.type !== 'PAYMENT_REVERSAL' || event.revision !== i + 1 || !event.actor || !event.createdAt
        || !event.operationKey || operationKeys.has(event.operationKey)
        || !money(event.releaseAmount) || event.releaseAmount === 0 || !money(event.refundAmount)
        || event.refundAmount > event.releaseAmount || !allocations.has(event.orderId)
        || event.releaseAmount > allocations.get(event.orderId)
        || event.unallocatedDelta !== event.releaseAmount - event.refundAmount) {
        fail('invalid_correction', event.id); continue;
      }
      operationKeys.add(event.operationKey);
      allocations.set(event.orderId, allocations.get(event.orderId) - event.releaseAmount);
      free += event.unallocatedDelta;
      paidBack += event.refundAmount;
      if (event.refundAmount > 0) {
        const matching = [...refundMap.values()].filter(row => row.correctionId === event.id);
        const receipt = matching[0];
        if (matching.length !== 1 || receipt.type !== 'REFUND_CONFIRMED' || receipt.paymentId !== payment.id
          || receipt.orderId !== event.orderId || receipt.amount !== event.refundAmount
          || !receipt.reference || receipt.reference !== event.refundReference || !receipt.actor || !receipt.createdAt) {
          fail('refund_evidence_mismatch', event.id);
        } else referencedRefunds.add(receipt.id);
      }
    }
    const matchingStates = states.filter(row => row.paymentId === payment.id);
    const state = matchingStates[0];
    if (events.length || matchingStates.length) {
      const actual = new Map((state?.allocations || []).map(row => [row.orderId, row.amount]));
      if (matchingStates.length !== 1 || state.revision !== events.length || state.unallocated !== free
        || state.refunded !== paidBack || actual.size !== allocations.size || state.allocations.length !== actual.size
        || [...allocations].some(([id, amount]) => actual.get(id) !== amount)) fail('state_differs_from_history', payment.id);
    }
    for (const [id, amount] of allocations) balances.get(id).allocated += amount;
    received += payment.amount;
    refunded += paidBack;
    unallocated += free;
  }
  const refundReferences = new Set();
  for (const refund of refunds) {
    if (!referencedRefunds.has(refund.id)) fail('orphan_refund', refund.id);
    if (refundReferences.has(refund.reference)) fail('duplicate_refund_reference', refund.id);
    refundReferences.add(refund.reference);
  }
  for (const row of [...states, ...corrections]) if (!paymentMap.has(row.paymentId)) fail('orphan_payment_evidence', row.id);
  const results = [...balances.values()].map(row => {
    const debt = row.charge - row.credit - row.allocated;
    if (!money(row.credit) || row.credit > row.charge || !money(row.allocated) || !money(debt)) fail('invalid_order_debt', row.orderId);
    return { ...row, debt };
  });
  const currentDebt = results.reduce((sum, row) => sum + row.debt, 0);
  if (![received, refunded, unallocated, currentDebt].every(money)) fail('invalid_total', customerId);
  return { status: issues.length ? 'NOT PASS' : 'PASS', issues,
    // An invalid scope must never produce a usable balance for a caller.
    balances: issues.length ? null : { orders: results, currentDebt, received, refunded, netReceived: received - refunded, unallocated } };
}
module.exports = { reconcileCorrectedCustomerDebt };
