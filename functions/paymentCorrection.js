const { createHash } = require('node:crypto');
const { isOfficialPayment } = require('./customerDebtPayment');
const { createInventoryError, getInventoryPermissionDecision } = require('./inventoryTransactions');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const money = value => Number.isSafeInteger(value) && value >= 0;

// Caller owns the transaction and must include the matching order/credit change.
// No endpoint exposes this step on its own.
async function preparePaymentCorrection({ transaction, db, collectionPath, appId, claims, paymentId, orderId,
  operationKey, releaseAmount, refundAmount = 0, refundConfirmed = false, refundReference = '', reason, timestamp }) {
  const fail = (code, message, status = 409) => { throw createInventoryError(code, message, status); };
  const companyId = claims?.companyId;
  const employeeId = claims?.appUserId;
  if (!companyId || !employeeId || claims.accountType !== 'employee') fail('correction_identity', 'Employee required', 403);
  if (![paymentId, orderId, operationKey].every(value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,180}$/.test(value))) fail('correction_key', 'Invalid correction identity', 400);
  if (!money(releaseAmount) || releaseAmount === 0 || !money(refundAmount) || refundAmount > releaseAmount) fail('correction_amount', 'Invalid correction amount', 400);
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000) fail('correction_reason', 'Reason required', 400);
  if (refundAmount > 0 && (refundConfirmed !== true || typeof refundReference !== 'string' || !refundReference.trim())) fail('refund_confirmation', 'Actual refund confirmation and reference required', 400);
  const ref = (name, id) => db.collection(collectionPath(appId, name)).doc(id);
  const id = `pc_${hash([companyId, operationKey]).slice(0, 48)}`;
  const stateRef = ref('paymentCorrectionStates', `pcs_${hash([companyId, paymentId]).slice(0, 48)}`);
  const eventRef = ref('paymentCorrections', id);
  const refundRef = refundAmount > 0 ? ref('refundReceipts', `rf_${hash([companyId, refundReference.trim()]).slice(0, 48)}`) : null;
  const requestHash = hash([companyId, paymentId, orderId, releaseAmount, refundAmount, refundConfirmed, refundReference, reason]);
  const [paymentSnap, orderSnap, companySnap, employeeSnap, stateSnap, eventSnap, refundSnap] = await transaction.getAll(
    ref('payments', paymentId), ref('orders', orderId), ref('companies', companyId), ref('employees', employeeId), stateRef, eventRef,
    ...(refundRef ? [refundRef] : [])
  );
  const payment = paymentSnap.data();
  const order = orderSnap.data();
  if (!payment || !order || payment.companyId !== companyId || order.companyId !== companyId || !payment.customerId || payment.customerId !== order.customerId) fail('correction_tenant', 'Payment/order identity mismatch', 403);
  if (!companySnap.exists || !employeeSnap.exists) fail('correction_identity', 'Identity missing', 403);
  const permission = getInventoryPermissionDecision({ claims, company: companySnap.data(), employee: { ...employeeSnap.data(), id: employeeId } });
  if (!permission.allowed || permission.roleKey !== 'owner') fail('correction_permission', 'Owner required', 403);
  if (eventSnap.exists) {
    if (eventSnap.data().requestHash !== requestHash || eventSnap.data().companyId !== companyId) fail('correction_conflict', 'Operation key already used');
    return { id, duplicate: true, apply() {} };
  }
  if (refundSnap?.exists) fail('refund_duplicate_reference', 'Refund reference already recorded');
  if (payment.isArchived || !isOfficialPayment(payment) || !money(payment.amount)) fail('correction_payment', 'Official payment required');
  // Never reconstruct allocations from an incomplete client page or silently
  // rerun FIFO: that could reassign money from unrelated orders.
  if (!Array.isArray(payment.allocations)) fail('allocation_reconciliation_required', 'Authoritative allocation snapshot required');
  const original = payment.allocations.map(row => ({ orderId: row.orderId, amount: row.amount }));
  if (original.some(row => typeof row.orderId !== 'string' || !row.orderId || !money(row.amount))
    || new Set(original.map(row => row.orderId)).size !== original.length) fail('allocation_reconciliation_required', 'Invalid allocation snapshot');
  const sourceHash = hash([payment.companyId, payment.customerId, payment.amount, original]);
  const sourceAllocated = original.reduce((sum, row) => sum + row.amount, 0);
  if (!money(sourceAllocated) || sourceAllocated > payment.amount) fail('allocation_reconciliation_required', 'Allocation exceeds payment');
  const state = stateSnap.exists ? stateSnap.data() : {
    companyId, paymentId, customerId: payment.customerId, sourceHash, revision: 0,
    allocations: original, unallocated: payment.amount - sourceAllocated, refunded: 0
  };
  if (state.companyId !== companyId || state.paymentId !== paymentId || state.customerId !== payment.customerId || state.sourceHash !== sourceHash) fail('allocation_reconciliation_required', 'Allocation source changed');
  if (!Array.isArray(state.allocations) || !money(state.unallocated) || !money(state.refunded) || !money(state.revision)
    || state.allocations.some(row => !money(row.amount)) || new Set(state.allocations.map(row => row.orderId)).size !== state.allocations.length
    || state.allocations.reduce((sum, row) => sum + row.amount, 0) + state.unallocated + state.refunded !== payment.amount) fail('allocation_reconciliation_required', 'Allocation invariant failed');
  const affected = state.allocations.find(row => row.orderId === orderId);
  if (!affected || affected.amount < releaseAmount) fail('allocation_insufficient', 'Release exceeds this order allocation');
  const next = {
    ...state, revision: state.revision + 1,
    allocations: state.allocations.map(row => row.orderId === orderId ? { ...row, amount: row.amount - releaseAmount } : row),
    unallocated: state.unallocated + releaseAmount - refundAmount,
    refunded: state.refunded + refundAmount, updatedAt: timestamp
  };
  let applied = false;
  return { id, duplicate: false, state: next, apply() {
    if (applied) throw new Error('Correction plan already applied');
    applied = true;
    transaction.set(stateRef, next);
    if (refundRef) transaction.set(refundRef, { companyId, paymentId, orderId, correctionId: id, amount: refundAmount,
      reference: refundReference.trim(), actor: employeeId, createdAt: timestamp, type: 'REFUND_CONFIRMED' });
    transaction.set(eventRef, { id, companyId, customerId: payment.customerId, paymentId, orderId,
      operationKey, requestHash, type: 'PAYMENT_REVERSAL', releaseAmount, refundAmount,
      unallocatedDelta: releaseAmount - refundAmount, refundReference: refundAmount ? refundReference.trim() : '',
      reason: reason.trim(), actor: employeeId, createdAt: timestamp, revision: next.revision });
  } };
}
module.exports = { preparePaymentCorrection };
