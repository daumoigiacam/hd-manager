const { buildInventoryLedgerId, createInventoryError, getInventoryPermissionDecision } = require('./inventoryTransactions');
const { createHash } = require('node:crypto');

// A transaction step, not a separate commit. The caller must atomically apply
// order/payment/debt transitions in the SAME transaction before exposing it.
async function prepareInventoryReversal({ transaction, db, collectionPath, appId, claims, operationId, reason, goodsReturned, timestamp }) {
  const fail = (code, message, status = 409) => { throw createInventoryError(code, message, status); };
  const companyId = claims?.companyId;
  const employeeId = claims?.appUserId;
  if (!companyId || !employeeId || claims.accountType !== 'employee') fail('reversal_identity', 'Employee identity required', 403);
  if (!/^iop_[a-f0-9]{48}$/.test(operationId || '')) fail('reversal_operation', 'Invalid source operation', 400);
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000) fail('reversal_reason', 'Reason required', 400);
  const ref = (collection, id) => db.collection(collectionPath(appId, collection)).doc(id);
  const reversalId = `irv_${createHash('sha256').update(`${companyId}|${operationId}`).digest('hex').slice(0, 48)}`;
  const reversalRef = ref('inventoryOperations', reversalId);
  const [sourceSnap, companySnap, employeeSnap, reversalSnap] = await transaction.getAll(
    ref('inventoryOperations', operationId), ref('companies', companyId),
    ref('employees', employeeId), reversalRef
  );
  const source = sourceSnap.data();
  if (!source || source.companyId !== companyId) fail('reversal_source', 'Source not found in tenant', 403);
  if (!companySnap.exists || !employeeSnap.exists) fail('reversal_identity', 'Identity not found', 403);
  const permission = getInventoryPermissionDecision({ claims, company: companySnap.data(), employee: { ...employeeSnap.data(), id: employeeId }, operationType: source.operationType });
  // Correction permissions are not implied by warehouse create permissions.
  if (!permission.allowed || permission.roleKey !== 'owner') fail('reversal_permission', 'Owner permission required', 403);
  if (reversalSnap.exists) {
    const existing = reversalSnap.data();
    if (existing.companyId !== companyId || existing.reversesOperationId !== operationId || existing.operationType !== 'REVERSAL') fail('reversal_conflict', 'Invalid reversal receipt');
    return { reversalId, duplicate: true, apply() {} };
  }
  if (!['INBOUND', 'OUTBOUND'].includes(source.operationType) || source.status !== 'COMMITTED') fail('reversal_unsupported', 'Source needs a dedicated correction workflow');
  if (source.operationType === 'OUTBOUND' && goodsReturned !== true) fail('reversal_goods_confirmation', 'Returned goods must be confirmed');
  const balances = source.balances;
  if (!Array.isArray(balances) || !balances.length || balances.length > 12 || new Set(balances.map(item => item.balanceId)).size !== balances.length) fail('reversal_evidence', 'Invalid source balance evidence');
  const rows = await Promise.all(balances.map(async (row, index) => {
    const balanceRef = ref('inventoryBalances', row.balanceId);
    const [balanceSnap, ledgerSnap, compensationSnap] = await transaction.getAll(
      balanceRef, ref('inventoryLedger', buildInventoryLedgerId(operationId, index)),
      ref('inventoryLedger', buildInventoryLedgerId(reversalId, index))
    );
    if (compensationSnap.exists) fail('reversal_evidence', 'Orphan compensation requires reconciliation');
    const balance = balanceSnap.data();
    const ledger = ledgerSnap.data();
    if (!balance || !ledger || balance.companyId !== companyId || ledger.companyId !== companyId || ledger.operationId !== operationId) fail('reversal_evidence', 'Missing or foreign ledger/balance');
    if (ledger.operationType !== source.operationType || ledger.documentId !== source.documentId || ledger.collectionName !== source.collectionName) fail('reversal_evidence', 'Ledger source mismatch');
    for (const key of ['warehouseId', 'productId', 'unit']) {
      if (balance[key] !== row[key] || ledger[key] !== row[key]) fail('reversal_evidence', 'Balance identity differs from ledger');
    }
    if (ledger.beforeQuantity !== row.beforeQuantity || ledger.afterQuantity !== row.afterQuantity) fail('reversal_evidence', 'Operation differs from ledger');
    if (![ledger.beforeQuantity, ledger.afterQuantity, balance.availableQuantity].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)
      || !Number.isSafeInteger(balance.revision) || balance.revision < 1) fail('reversal_evidence', 'Invalid quantities or revision');
    const delta = Math.round((ledger.beforeQuantity - ledger.afterQuantity) * 1e6) / 1e6;
    if ((source.operationType === 'OUTBOUND' && delta <= 0) || (source.operationType === 'INBOUND' && delta >= 0)) fail('reversal_evidence', 'Source direction mismatch');
    const after = Math.round((balance.availableQuantity + delta) * 1e6) / 1e6;
    if (!Number.isFinite(after) || after < 0) fail('inventory_insufficient_stock', 'Reversal would create negative stock');
    return { row, balanceRef, balance, delta, after, index };
  }));
  let applied = false;
  return {
    reversalId,
    duplicate: false,
    apply() {
      if (applied) throw new Error('Reversal plan already applied');
      applied = true;
      for (const { row, balanceRef, balance, delta, after, index } of rows) {
        transaction.set(balanceRef, { availableQuantity: after, revision: balance.revision + 1, lastOperationId: reversalId, updatedAt: timestamp }, { merge: true });
        const ledgerId = buildInventoryLedgerId(reversalId, index);
        transaction.set(ref('inventoryLedger', ledgerId), {
          id: ledgerId, companyId, operationId: reversalId, reversesOperationId: operationId,
          operationType: 'REVERSAL', collectionName: source.collectionName, documentId: source.documentId,
          warehouseId: row.warehouseId, productId: row.productId, unit: row.unit,
          quantity: Math.abs(delta), delta, beforeQuantity: balance.availableQuantity, afterQuantity: after,
          sequence: balance.revision + 1, createdAt: timestamp, createdByEmployeeId: employeeId
        });
      }
      transaction.set(reversalRef, {
        id: reversalId, companyId, operationType: 'REVERSAL', reversesOperationId: operationId,
        documentId: source.documentId, collectionName: source.collectionName, status: 'COMMITTED',
        reason: reason.trim(), goodsReturned: goodsReturned === true, createdAt: timestamp, createdByEmployeeId: employeeId,
        balances: rows.map(({ row, balance, after }) => ({ ...row, beforeQuantity: balance.availableQuantity, afterQuantity: after }))
      });
    }
  };
}

module.exports = { prepareInventoryReversal };
