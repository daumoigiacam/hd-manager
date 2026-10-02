const { createHash } = require('node:crypto');
const {
  buildInventoryBalanceId,
  buildInventoryLedgerId,
  createInventoryError,
  getInventoryPermissionDecision,
} = require('./inventoryTransactions');

const MAX_RETURN_LINES = 12;
const MAX_SOURCE_DISPATCHES = 12;
const QUANTITY_PRECISION = 1_000_000;
const RETURN_CONDITIONS = new Set(['SELLABLE', 'DAMAGED']);
const MUTATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,160}$/;
const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,180}$/;

const text = value => `${value || ''}`.trim();
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const quantity = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return Math.round(parsed * QUANTITY_PRECISION) / QUANTITY_PRECISION;
};
const sameQuantity = (left, right) => Math.abs(quantity(left) - quantity(right)) < (1 / QUANTITY_PRECISION);
const fail = (code, message, statusCode = 409, details = null) => {
  throw createInventoryError(code, message, statusCode, details);
};
const isRetryableTransactionError = error => (
  [10, 13, 14].includes(Number(error?.code))
  || (Number(error?.code) === 3 && /transaction is invalid or closed/i.test(text(error?.details || error?.message)))
);
const returnStateId = (companyId, operationId, movementIndex) => (
  `irst_${hash([companyId, operationId, movementIndex]).slice(0, 48)}`
);
const damagedEvidenceId = (returnId, allocationIndex) => (
  `ird_${hash([returnId, allocationIndex]).slice(0, 48)}`
);

const stableReturnRequest = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableReturnRequest).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableReturnRequest(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const normalizeReturnLines = (lines = []) => {
  if (!Array.isArray(lines) || !lines.length || lines.length > MAX_RETURN_LINES) {
    fail('return_lines_invalid', `Mỗi lần trả hàng phải có từ 1 đến ${MAX_RETURN_LINES} dòng.`, 400);
  }
  const merged = new Map();
  for (const row of lines) {
    const productId = text(row?.productId || row?.productKey);
    const unit = text(row?.unit || row?.quantityUnit).toLowerCase();
    const warehouseId = text(row?.warehouseId);
    const condition = text(row?.condition).toUpperCase();
    const returnedQuantity = quantity(row?.quantity);
    if (!productId || !unit || !RETURN_CONDITIONS.has(condition)
      || !Number.isFinite(returnedQuantity) || returnedQuantity <= 0) {
      fail('return_line_invalid', 'Sản phẩm, đơn vị, số lượng hoặc tình trạng hàng trả không hợp lệ.', 400);
    }
    const key = JSON.stringify([warehouseId, productId, unit, condition]);
    const current = merged.get(key) || { warehouseId, productId, unit, condition, quantity: 0 };
    current.quantity = quantity(current.quantity + returnedQuantity);
    merged.set(key, current);
  }
  return [...merged.values()];
};

const isDeliveryEvidence = (dispatch = {}, reports = []) => {
  const status = text(dispatch.deliveryStatus || dispatch.fulfillmentStatus || dispatch.status).toLowerCase();
  if (['delivered', 'completed', 'complete', 'da_giao'].includes(status)
    || dispatch.deliveredAt || dispatch.deliveryCompletedAt || dispatch.linkedDeliveryReportId) return true;
  return reports.some(report => report && !report.isArchived && report.companyId === dispatch.companyId);
};

const executeOrderReturnTransaction = async ({
  db,
  FieldValue,
  collectionPath,
  appId,
  claims,
  payload = {},
}) => {
  if (!db?.runTransaction || typeof collectionPath !== 'function') {
    throw new Error('Order return transaction dependencies are not configured.');
  }
  const companyId = text(claims?.companyId);
  const employeeId = text(claims?.appUserId);
  if (!companyId || !employeeId || text(claims?.accountType).toLowerCase() !== 'employee') {
    fail('return_identity_required', 'Cần tài khoản nhân sự thuộc công ty.', 403);
  }
  const clientMutationId = text(payload.clientMutationId);
  const orderId = text(payload.orderId);
  const reason = text(payload.reason);
  if (!MUTATION_ID_PATTERN.test(clientMutationId)) fail('return_mutation_invalid', 'Mã thao tác trả hàng không hợp lệ.', 400);
  if (!DOCUMENT_ID_PATTERN.test(orderId)) fail('return_order_invalid', 'Mã đơn hàng không hợp lệ.', 400);
  if (!reason || reason.length > 1000) fail('return_reason_required', 'Cần nhập lý do trả hàng.', 400);
  if (payload.goodsReturnedConfirmed !== true) {
    fail('return_goods_confirmation_required', 'Chỉ ghi nhận khi đã thực sự nhận hàng khách trả.', 400);
  }
  if (Number(payload.creditAmount || 0) !== 0 || payload.paymentCorrection || payload.refund) {
    fail(
      'business_rule_required',
      'Chưa được phép tự tính hoặc ghi giảm tiền hàng trả khi quy tắc giảm giá, thuế và phí chưa được Owner chốt.',
      409,
      { ruleId: 'partial_return_valuation' },
    );
  }
  const lines = normalizeReturnLines(payload.lines);
  const returnId = `ort_${hash([companyId, clientMutationId]).slice(0, 48)}`;
  const requestHash = hash(stableReturnRequest({ companyId, orderId, reason, lines }));
  const ref = (collectionName, id) => db.collection(collectionPath(appId, collectionName)).doc(id);
  const returnRef = ref('orderReturns', returnId);
  const orderRef = ref('orders', orderId);
  const orderStateRef = ref('orderReturnStates', `ors_${hash([companyId, orderId]).slice(0, 48)}`);
  let transactionAttempts = 0;

  const runReturnAttempt = () => db.runTransaction(async (transaction) => {
    transactionAttempts += 1;
    const existingReturn = await transaction.get(returnRef);
    if (existingReturn.exists) {
      const existing = existingReturn.data() || {};
      if (existing.companyId !== companyId || existing.requestHash !== requestHash) {
        fail('return_idempotency_conflict', 'Mã thao tác đã thuộc một lần trả hàng khác.');
      }
      return {
        success: true,
        duplicate: true,
        returnId,
        orderId,
        returnStatus: existing.returnStatus,
        transactionAttempts,
      };
    }

    const [orderSnap, companySnap, employeeSnap, orderStateSnap] = await transaction.getAll(
      orderRef,
      ref('companies', companyId),
      ref('employees', employeeId),
      orderStateRef,
    );
    const order = orderSnap.data();
    if (!order || order.companyId !== companyId || order.isArchived) {
      fail('return_order_not_found', 'Không tìm thấy đơn hàng hợp lệ trong công ty.', 404);
    }
    if (!companySnap.exists || !employeeSnap.exists) fail('return_identity_not_found', 'Không tìm thấy hồ sơ xác minh.', 403);
    const permission = getInventoryPermissionDecision({
      claims,
      company: companySnap.data() || {},
      employee: { id: employeeId, ...(employeeSnap.data() || {}) },
      operationType: 'OUTBOUND',
    });
    if (!permission.allowed || permission.roleKey !== 'owner') {
      fail('return_permission_denied', 'Hiện chỉ Chủ doanh nghiệp được duyệt hàng trả.', 403);
    }

    const sourceDispatchIds = [...new Set([
      ...(Array.isArray(order.sourceDispatchIds) ? order.sourceDispatchIds : []),
      order.sourceDispatchId,
      ...(Array.isArray(order.items) ? order.items.flatMap(item => (
        Array.isArray(item?.sourceDispatchIds) ? item.sourceDispatchIds : [item?.sourceDispatchId]
      )) : []),
    ].map(text).filter(Boolean))];
    if (!sourceDispatchIds.length || sourceDispatchIds.length > MAX_SOURCE_DISPATCHES) {
      fail('return_delivery_evidence_required', 'Đơn hàng chưa có bằng chứng phiếu xuất kho phù hợp.', 409);
    }
    const dispatchRefs = sourceDispatchIds.map(id => ref('warehouseDispatches', id));
    const dispatchSnaps = await transaction.getAll(...dispatchRefs);
    const dispatches = dispatchSnaps.map((snap, index) => ({ id: sourceDispatchIds[index], ...(snap.data() || {}) }));
    for (const dispatch of dispatches) {
      if (!dispatch.companyId || dispatch.companyId !== companyId || dispatch.isArchived
        || (dispatch.linkedOrderId && dispatch.linkedOrderId !== orderId)) {
        fail('return_dispatch_mismatch', 'Phiếu xuất kho không còn liên kết hợp lệ với đơn hàng.', 409);
      }
      if (!text(dispatch.inventoryOperationId)) {
        fail('return_inventory_evidence_required', 'Phiếu xuất thiếu bằng chứng giao dịch tồn kho.', 409);
      }
    }

    const deliveryReportSnapshots = [];
    for (const dispatch of dispatches) {
      // Firestore transactions can retry this callback under contention. Keep query
      // reads ordered so one retry cannot leave sibling reads on a closed attempt.
      deliveryReportSnapshots.push(await transaction.get(
        db.collection(collectionPath(appId, 'deliveryReports')).where('dispatchId', '==', dispatch.id).limit(5),
      ));
    }
    dispatches.forEach((dispatch, index) => {
      const reports = deliveryReportSnapshots[index].docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (!isDeliveryEvidence(dispatch, reports)) {
        fail('return_delivery_confirmation_required', `Phiếu ${dispatch.id} chưa có xác nhận giao hàng.`, 409);
      }
    });

    const operationRefs = dispatches.map(dispatch => ref('inventoryOperations', dispatch.inventoryOperationId));
    const operationSnaps = await transaction.getAll(...operationRefs);
    const sourceRows = [];
    operationSnaps.forEach((snap, operationIndex) => {
      const operation = snap.data();
      const dispatch = dispatches[operationIndex];
      if (!operation || operation.companyId !== companyId || operation.operationType !== 'OUTBOUND'
        || operation.status !== 'COMMITTED' || operation.documentId !== dispatch.id
        || operation.collectionName !== 'warehouseDispatches' || !Array.isArray(operation.balances)
        || !operation.balances.length || operation.balances.length > MAX_RETURN_LINES) {
        fail('return_inventory_evidence_invalid', 'Bằng chứng xuất kho không đầy đủ hoặc không khớp.', 409);
      }
      operation.balances.forEach((balance, movementIndex) => sourceRows.push({
        operationId: snap.id,
        dispatchId: dispatch.id,
        movementIndex,
        ...balance,
      }));
    });

    const ledgerRefs = sourceRows.map(row => ref('inventoryLedger', buildInventoryLedgerId(row.operationId, row.movementIndex)));
    const stateRefs = sourceRows.map(row => ref('inventoryReturnStates', returnStateId(companyId, row.operationId, row.movementIndex)));
    const uniqueBalanceRefs = new Map(sourceRows.map(row => [
      row.balanceId || buildInventoryBalanceId({ companyId, ...row }),
      ref('inventoryBalances', row.balanceId || buildInventoryBalanceId({ companyId, ...row })),
    ]));
    const ledgerSnaps = await transaction.getAll(...ledgerRefs);
    const stateSnaps = await transaction.getAll(...stateRefs);
    const balanceSnaps = await transaction.getAll(...uniqueBalanceRefs.values());
    const balanceSnapshots = new Map([...uniqueBalanceRefs.keys()].map((id, index) => [id, balanceSnaps[index]]));
    const availableRows = sourceRows.map((row, index) => {
      const ledger = ledgerSnaps[index].data();
      const state = stateSnaps[index].exists ? stateSnaps[index].data() : null;
      if (!ledger || ledger.companyId !== companyId || ledger.operationId !== row.operationId
        || ledger.operationType !== 'OUTBOUND' || ledger.documentId !== row.dispatchId
        || ledger.warehouseId !== row.warehouseId || ledger.productId !== row.productId
        || ledger.unit !== row.unit) {
        fail('return_inventory_evidence_invalid', 'Dòng sổ kho xuất không khớp chứng từ.', 409);
      }
      const deliveredQuantity = quantity(ledger.quantity ?? (ledger.beforeQuantity - ledger.afterQuantity));
      const returnedQuantity = quantity(state?.returnedQuantity || 0);
      if (!Number.isFinite(deliveredQuantity) || deliveredQuantity <= 0
        || !Number.isFinite(returnedQuantity) || returnedQuantity < 0 || returnedQuantity > deliveredQuantity
        || (state && (state.companyId !== companyId || state.sourceOperationId !== row.operationId
          || state.sourceMovementIndex !== row.movementIndex))) {
        fail('return_state_reconciliation_required', 'Số lượng xuất/trả cần được đối soát trước.', 409);
      }
      return {
        ...row,
        ledger,
        state,
        stateRef: stateRefs[index],
        deliveredQuantity,
        returnedQuantity,
        remainingQuantity: quantity(deliveredQuantity - returnedQuantity),
      };
    });

    const allocations = [];
    for (const line of lines) {
      let remaining = line.quantity;
      for (const source of availableRows) {
        if (remaining <= 0) break;
        if (source.productId !== line.productId || text(source.unit).toLowerCase() !== line.unit
          || (line.warehouseId && source.warehouseId !== line.warehouseId)) continue;
        const alreadyAllocated = allocations
          .filter(row => row.sourceOperationId === source.operationId && row.sourceMovementIndex === source.movementIndex)
          .reduce((sum, row) => quantity(sum + row.quantity), 0);
        const capacity = quantity(source.remainingQuantity - alreadyAllocated);
        if (capacity <= 0) continue;
        const accepted = quantity(Math.min(remaining, capacity));
        allocations.push({
          productId: line.productId,
          warehouseId: source.warehouseId,
          unit: line.unit,
          condition: line.condition,
          quantity: accepted,
          sourceOperationId: source.operationId,
          sourceMovementIndex: source.movementIndex,
          sourceDispatchId: source.dispatchId,
          balanceId: source.balanceId || buildInventoryBalanceId({ companyId, ...source }),
        });
        remaining = quantity(remaining - accepted);
      }
      if (remaining > 0) {
        fail('return_quantity_exceeds_delivered', 'Tổng số lượng trả vượt quá số đã giao còn có thể trả.', 409, {
          productId: line.productId,
          unit: line.unit,
          requested: line.quantity,
          unavailable: remaining,
        });
      }
    }

    const allocationsBySource = new Map();
    allocations.forEach((allocation) => {
      const key = `${allocation.sourceOperationId}:${allocation.sourceMovementIndex}`;
      const current = allocationsBySource.get(key) || { total: 0, sellable: 0, damaged: 0 };
      current.total = quantity(current.total + allocation.quantity);
      current[allocation.condition === 'DAMAGED' ? 'damaged' : 'sellable'] = quantity(
        current[allocation.condition === 'DAMAGED' ? 'damaged' : 'sellable'] + allocation.quantity,
      );
      allocationsBySource.set(key, current);
    });
    const balanceDeltas = new Map();
    allocations.filter(row => row.condition === 'SELLABLE').forEach((allocation) => {
      balanceDeltas.set(allocation.balanceId, quantity((balanceDeltas.get(allocation.balanceId) || 0) + allocation.quantity));
    });
    const timestamp = FieldValue?.serverTimestamp ? FieldValue.serverTimestamp() : new Date().toISOString();
    const balanceEvidence = [];
    for (const [balanceId, delta] of balanceDeltas) {
      const balanceSnap = balanceSnapshots.get(balanceId);
      const balance = balanceSnap?.data();
      if (!balance || balance.companyId !== companyId || !Number.isFinite(Number(balance.availableQuantity))
        || Number(balance.availableQuantity) < 0 || !Number.isSafeInteger(Number(balance.revision))) {
        fail('return_balance_reconciliation_required', 'Tồn kho bán được cần được đối soát trước khi nhập hàng trả.', 409);
      }
      const beforeQuantity = quantity(balance.availableQuantity);
      const afterQuantity = quantity(beforeQuantity + delta);
      transaction.set(uniqueBalanceRefs.get(balanceId), {
        availableQuantity: afterQuantity,
        revision: Number(balance.revision) + 1,
        lastOperationId: returnId,
        updatedAt: timestamp,
      }, { merge: true });
      const ledgerId = buildInventoryLedgerId(returnId, balanceEvidence.length);
      transaction.create(ref('inventoryLedger', ledgerId), {
        id: ledgerId,
        companyId,
        operationId: returnId,
        operationType: 'RETURN_INBOUND',
        documentId: returnId,
        collectionName: 'orderReturns',
        warehouseId: balance.warehouseId,
        productId: balance.productId,
        unit: balance.unit,
        quantity: delta,
        beforeQuantity,
        afterQuantity,
        sequence: Number(balance.revision) + 1,
        createdAt: timestamp,
        createdByEmployeeId: employeeId,
      });
      balanceEvidence.push({ balanceId, warehouseId: balance.warehouseId, productId: balance.productId, unit: balance.unit, beforeQuantity, afterQuantity });
    }

    availableRows.forEach((source) => {
      const delta = allocationsBySource.get(`${source.operationId}:${source.movementIndex}`);
      if (!delta) return;
      const nextReturned = quantity(source.returnedQuantity + delta.total);
      transaction.set(source.stateRef, {
        id: source.stateRef.id,
        companyId,
        orderId,
        sourceDispatchId: source.dispatchId,
        sourceOperationId: source.operationId,
        sourceMovementIndex: source.movementIndex,
        warehouseId: source.warehouseId,
        productId: source.productId,
        unit: source.unit,
        deliveredQuantity: source.deliveredQuantity,
        returnedQuantity: nextReturned,
        sellableReturnedQuantity: quantity((source.state?.sellableReturnedQuantity || 0) + delta.sellable),
        damagedReturnedQuantity: quantity((source.state?.damagedReturnedQuantity || 0) + delta.damaged),
        revision: Number(source.state?.revision || 0) + 1,
        lastReturnId: returnId,
        updatedAt: timestamp,
      }, { merge: false });
    });

    let damagedIndex = 0;
    allocations.filter(row => row.condition === 'DAMAGED').forEach((allocation) => {
      const id = damagedEvidenceId(returnId, damagedIndex);
      damagedIndex += 1;
      transaction.create(ref('inventoryDamagedReturns', id), {
        id,
        companyId,
        type: 'RETURN_DAMAGED',
        returnId,
        orderId,
        sourceDispatchId: allocation.sourceDispatchId,
        sourceOperationId: allocation.sourceOperationId,
        productId: allocation.productId,
        warehouseId: allocation.warehouseId,
        unit: allocation.unit,
        quantity: allocation.quantity,
        reason,
        actor: employeeId,
        createdAt: timestamp,
        sellableStockDelta: 0,
      });
    });

    const afterReturnedBySource = availableRows.map((source) => {
      const delta = allocationsBySource.get(`${source.operationId}:${source.movementIndex}`)?.total || 0;
      return {
        sourceOperationId: source.operationId,
        sourceMovementIndex: source.movementIndex,
        productId: source.productId,
        warehouseId: source.warehouseId,
        unit: source.unit,
        deliveredQuantity: source.deliveredQuantity,
        returnedQuantity: quantity(source.returnedQuantity + delta),
      };
    });
    const isFullReturn = afterReturnedBySource.every(row => sameQuantity(row.returnedQuantity, row.deliveredQuantity));
    const returnStatus = isFullReturn ? 'FULL_RETURN' : 'PARTIAL_RETURN';
    const previousOrderState = orderStateSnap.exists ? orderStateSnap.data() : {};
    if (orderStateSnap.exists && (previousOrderState.companyId !== companyId || previousOrderState.orderId !== orderId)) {
      fail('return_state_reconciliation_required', 'Trạng thái trả hàng của đơn không hợp lệ.', 409);
    }

    transaction.create(returnRef, {
      id: returnId,
      companyId,
      customerId: text(order.customerId || order.customer?.id),
      orderId,
      clientMutationId,
      requestHash,
      type: 'ORDER_RETURN',
      returnStatus,
      reason,
      lines,
      allocations,
      balances: balanceEvidence,
      damagedEvidenceCount: damagedIndex,
      goodsReturnedConfirmed: true,
      financialStatus: 'BUSINESS_RULE_REQUIRED',
      creditAmount: 0,
      createdAt: timestamp,
      createdByEmployeeId: employeeId,
    });
    transaction.set(orderStateRef, {
      id: orderStateRef.id,
      companyId,
      customerId: text(order.customerId || order.customer?.id),
      orderId,
      status: returnStatus,
      revision: Number(previousOrderState.revision || 0) + 1,
      transactionCount: Number(previousOrderState.transactionCount || 0) + 1,
      returnedBySource: afterReturnedBySource,
      lastReturnId: returnId,
      updatedAt: timestamp,
    }, { merge: false });
    transaction.set(orderRef, {
      returnStatus,
      returnStatusLabel: isFullReturn ? 'Đã trả toàn bộ hàng' : 'Đã trả một phần hàng',
      returnTransactionCount: Number(previousOrderState.transactionCount || 0) + 1,
      lastReturnId: returnId,
      returnFinancialStatus: 'BUSINESS_RULE_REQUIRED',
      returnUpdatedAt: timestamp,
      updatedAt: timestamp,
    }, { merge: true });
    transaction.create(ref('activityLogs', `audit_${returnId}`), {
      id: `audit_${returnId}`,
      companyId,
      actor: employeeId,
      action: 'ORDER_RETURN_COMMITTED',
      entityType: 'order',
      entityId: orderId,
      returnId,
      returnStatus,
      sellableQuantity: quantity(allocations.filter(row => row.condition === 'SELLABLE').reduce((sum, row) => sum + row.quantity, 0)),
      damagedQuantity: quantity(allocations.filter(row => row.condition === 'DAMAGED').reduce((sum, row) => sum + row.quantity, 0)),
      createdAt: timestamp,
    });

    return { success: true, duplicate: false, returnId, orderId, returnStatus, transactionAttempts };
  }, { maxAttempts: 12 });

  let lastTransientError;
  for (let outerAttempt = 0; outerAttempt < 3; outerAttempt += 1) {
    try {
      return await runReturnAttempt();
    } catch (error) {
      if (!isRetryableTransactionError(error)) throw error;
      lastTransientError = error;
      await new Promise(resolve => setTimeout(resolve, 25 * (outerAttempt + 1)));
    }
  }
  throw lastTransientError;
};

module.exports = {
  executeOrderReturnTransaction,
  normalizeReturnLines,
};
