import {getDeliveryReportWeightStatus,resolveMatchedOrderFromTransfer,normalizeExpenseCategoryLabel,parseInputCurrency,parseLooseMoneyValue,parseLooseQuantityValue,capitalizeFirst,normalizeLeadingLabel,getOrderPaymentDisplayCode,isOrderCodeAutoMatchEnabled,getAssetDisplayLabel,getAssetCostTypeLabel,getOrderReturnGoodsRecords,summarizeOrderReturnGoods,RETURN_GOODS_STATUS_LABELS,getOrderReturnProductSummary,formatOrderCode,normalizeLookupText,getPrimaryDeliveryAssignmentId} from './deliveryOriginalRules.js';
const CASHFLOW_APPROVAL_STATUS={pending:'pending_handover',approved:'approved',rejected:'rejected'};
export function createOriginalDeliveryPlanners(context){
 const {employeeId,tenantId,editedAt,company,customer,product,dispatch,base,orders=[],expenses=[],assets=[],assetCostLogs=[],order=null}=context;
 const firebaseUser=true,isVpsStagingMode=false,myCompanyId=tenantId,currentUser={id:employeeId},employeeInfo={id:employeeId},appCurrentEmployee={id:employeeId},currentCompany=company;
 const customers=[customer].filter(Boolean),products=[product].filter(Boolean),warehouseDispatches=[dispatch].filter(Boolean),deliveryReports=base?[base]:[],rawExpenses=expenses,rawOrders=order?[order]:[];
 const getTodayString=()=>context.day,unsupported=()=>{throw Object.assign(Error('Original linked/VPS/approval workflow not integrated'),{code:'delivery-unsupported-contract'});};
 // Original non-writePlan branches are retained verbatim but have no runtime
 // authority here. Any accidental access fails instead of inventing a source.
 const unavailableSource=new Proxy([],{get:unsupported}),payments=unavailableSource,warehouseImports=unavailableSource,rawPayments=unavailableSource;
 const saveDataDocument=unsupported,saveAtomicDocuments=unsupported,buildPaymentConfirmationWrites=unsupported,getHdConnectStagingApi=unsupported,upsertLocalListRecord=unsupported,hasCompanyRolePermissionAction=unsupported,buildCustomerReconciledLedger=unsupported,setRawExpenses=null;
 const pendingFirebaseWritesRef={current:[]},expandPendingWrites=value=>value;const activeTenantScopeRef={current:tenantId},ATOMIC_SAVE_COLLECTION='unreachable-original-writeplan-only';const flushPendingFirebaseWriteNow=unsupported,syncCustomerLoyaltyPoints=unsupported,scheduleOrderShareWarmup=unsupported,handleEnsureOrderPayosPayment=unsupported,recordStartupEvent=unsupported,setRawOrders=null;
 const crypto={randomUUID:unsupported};
const handleAddDeliveryReport = async (empId, reportData = {}, writePlan = null) => {
    if (!firebaseUser || !myCompanyId) throw new Error('Chưa kết nối phiên làm việc.');
    const idempotencyKey = `${reportData.idempotencyKey || ''}`.trim();
    const mapDeliveryId = reportData.source === 'map_delivery' && reportData.dispatchId
      ? `dr_map_${reportData.dispatchId}`
      : '';
    const id = reportData.id || mapDeliveryId || `dr_${reportData.clientMutationId || crypto.randomUUID()}`;
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Mã báo cáo giao hàng không hợp lệ.');
    const existingReport = (deliveryReports || []).find(report => (
      report.id === id || (idempotencyKey && report.idempotencyKey === idempotencyKey)
    ));
    if (existingReport?.id) return existingReport.id;
    const dispatch = warehouseDispatches.find(item => item.id === reportData.dispatchId);
    const customer = customers.find(c => c.id === (reportData.customerId || dispatch?.customerId));
    const product = products.find(p => p.id === (reportData.productId || dispatch?.productId));
    const expectedWeightKg = parseLooseQuantityValue(reportData.expectedWeightKg ?? dispatch?.weightKg);
    const actualWeightKg = parseLooseQuantityValue(reportData.actualWeightKg);
    const statusMeta = getDeliveryReportWeightStatus({ expectedWeightKg, actualWeightKg });

    const newReportDocument = {
      ...reportData,
      id,
      empId,
      createdByEmpId: empId,
      dispatchId: reportData.dispatchId || dispatch?.id || '',
      customerId: reportData.customerId || dispatch?.customerId || '',
      productId: reportData.productId || dispatch?.productId || '',
      customerNameSnapshot: reportData.customerNameSnapshot || customer?.name || dispatch?.customerNameSnapshot || '',
      productNameSnapshot: reportData.productNameSnapshot || product?.name || dispatch?.productNameSnapshot || '',
      expectedWeightKg,
      actualWeightKg,
      differenceKg: statusMeta.diff,
      status: statusMeta.status,
      reviewStatus: statusMeta.isMismatch ? 'pending' : 'not_required',
      resolutionStatus: statusMeta.isMismatch ? 'pending' : 'not_required',
      date: reportData.date || dispatch?.date || getTodayString(),
      companyId: myCompanyId,
      isArchived: false,
      createdAt: editedAt
    };
    if (writePlan) writePlan.push({ collectionName: 'deliveryReports', documentId: id, payload: newReportDocument });
    else await saveDataDocument('deliveryReports', id, newReportDocument);
    return id;
  };
const handleUpdateDeliveryReport = async (reportId, patch = {}, writePlan = null) => {
    if (!firebaseUser || !myCompanyId) throw new Error('Chưa kết nối phiên làm việc.');
    if (!deliveryReports.some(report => report.id === reportId && report.companyId === myCompanyId)
      && !writePlan?.some(write => write.collectionName === 'deliveryReports' && write.documentId === reportId && write.payload.companyId === myCompanyId)) {
      throw new Error('Không tìm thấy báo cáo giao hàng trong công ty này.');
    }
    const updatePayload = {
      ...patch,
      updatedAt: editedAt
    };
    if (writePlan) {
      writePlan.push({ collectionName: 'deliveryReports', documentId: reportId, payload: updatePayload, options: { merge: true } });
      return { planned: true };
    }
    const result = await saveDataDocument('deliveryReports', reportId, updatePayload, { merge: true });
    return { success: true, queued: Boolean(result?.queued) };
  };
const handleAddPayment = async (paymentData, writePlan = null) => {
    if (isVpsStagingMode) {
      throw new Error('Payment posting is blocked in VPS staging until the finance payment contract is approved.');
    }
    if (!firebaseUser || !myCompanyId) throw new Error('Phiên làm việc không hợp lệ.');
    const id = paymentData.clientMutationId || `p_${crypto.randomUUID()}`;
    const matchedOrder = resolveMatchedOrderFromTransfer({ paymentData, orders, company: currentCompany });
    const resolvedCustomerId = matchedOrder?.customerId || paymentData.customerId || '';
    const normalizedNote = capitalizeFirst(paymentData.note || paymentData.bankContent || '');
    const needsApproval = Boolean(paymentData.requiresApproval || paymentData.approvalStatus === CASHFLOW_APPROVAL_STATUS.pending);
    const approvalStatus = needsApproval
      ? CASHFLOW_APPROVAL_STATUS.pending
      : (paymentData.approvalStatus || CASHFLOW_APPROVAL_STATUS.approved);

    const paymentPayload = {
      ...paymentData,
      customerId: resolvedCustomerId,
      empId: paymentData.empId || currentUser?.id || '',
      note: normalizedNote,
      requiresApproval: needsApproval,
      approvalStatus,
      handoverStatus: needsApproval ? 'pending' : 'confirmed',
      matchedOrderId: matchedOrder?.id || paymentData.matchedOrderId || null,
      matchedOrderCode: matchedOrder ? getOrderPaymentDisplayCode(matchedOrder) : paymentData.matchedOrderCode || '',
      autoMatchedByOrderCode: Boolean(matchedOrder && !paymentData.orderId && isOrderCodeAutoMatchEnabled(currentCompany)),
      bankContent: paymentData.bankContent || normalizedNote,
      id,
      companyId: myCompanyId,
      isArchived: false,
      createdAt: editedAt
    };

    if (!resolvedCustomerId || parseLooseMoneyValue(paymentPayload.amount) <= 0) throw new Error('Vui lòng chọn khách hàng và nhập số tiền lớn hơn 0.');
    const writes = [
      { collectionName: 'payments', documentId: id, ifAbsent: true, payload: paymentPayload },
      ...(approvalStatus === CASHFLOW_APPROVAL_STATUS.approved ? buildPaymentConfirmationWrites(paymentPayload) : []),
    ];
    if (writePlan) { writePlan.push(...writes); return { planned: true }; }
    return saveAtomicDocuments(`payment_${id}`, writes);
  };
const handleAddExpense = async (empId, expenseData, writePlan = null) => {
    if (isVpsStagingMode) {
      const amount = parseLooseMoneyValue(expenseData?.amount);
      if (amount <= 0) throw new Error('VPS expense requires a positive amount.');
      const clientMutationId = `${expenseData?.clientMutationId || `expense-${Date.now()}`}`.trim();
      const code = `${expenseData?.code || `HDM-${clientMutationId}`}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80);
      const result = await getHdConnectStagingApi().createFinanceExpense({
        code,
        expenseType: normalizeExpenseCategoryLabel(expenseData?.category || 'Chi phí khác'),
        amount,
        expenseDate: expenseData?.date || undefined,
        sourceReference: clientMutationId,
        description: normalizeLeadingLabel(expenseData?.note || 'Khoản chi'),
      });
      const normalized = {
        ...result,
        id: result?.id || clientMutationId,
        companyId: result?.companyId || myCompanyId,
        amount: parseLooseMoneyValue(result?.amount ?? amount),
        category: result?.expenseType || expenseData?.category || 'Chi phí khác',
        note: result?.description || expenseData?.note || '',
        date: result?.expenseDate || expenseData?.date || getTodayString(),
        approvalStatus: result?.status === 'APPROVED' || result?.status === 'POSTED'
          ? CASHFLOW_APPROVAL_STATUS.approved
          : CASHFLOW_APPROVAL_STATUS.pending,
        sourceSystem: 'hd-connect-vps',
      };
      upsertLocalListRecord(setRawExpenses, normalized);
      return normalized.id;
    }
    if (!firebaseUser || !myCompanyId) throw new Error('Phiên làm việc không hợp lệ.');
    const id = expenseData.clientMutationId || `exp_${crypto.randomUUID()}`;
    const amount = parseLooseMoneyValue(expenseData.amount);
    if (expenseData.assetId && !assets.some(asset => asset.id === expenseData.assetId && asset.companyId === myCompanyId && !asset.isArchived)) throw new Error('Không tìm thấy xe/tài sản của công ty.');
    if (!/^[A-Za-z0-9_-]+$/.test(id) || amount <= 0) throw new Error('Khoản chi phải có mã hợp lệ và số tiền lớn hơn 0.');
    if (expenseData.sourceType === 'customer_debt_repayment') {
      if (!hasCompanyRolePermissionAction({ company: currentCompany, employee: appCurrentEmployee, currentUser }, 'finance', 'create_expense')) {
        throw new Error('Bạn chưa có quyền ghi nhận khoản chi.');
      }
      const customer = customers.find(item => item.id === expenseData.customerId && item.companyId === myCompanyId);
      if (!customer) throw new Error('Không tìm thấy khách hàng của công ty.');
      const existing = expenses.find(item => item.id === id);
      if (existing && (existing.sourceType !== expenseData.sourceType || existing.customerId !== customer.id || existing.amount !== amount)) {
        throw new Error('Mã khoản chi đã được sử dụng cho dữ liệu khác.');
      }
      const ledger = buildCustomerReconciledLedger(customer, orders, payments, warehouseImports, expenses.filter(item => item.id !== id));
      if (!Number.isFinite(amount) || amount > ledger.creditBalance) throw new Error('Số tiền chi vượt khoản công ty còn nợ khách. Vui lòng kiểm tra lại sổ nợ.');
    }
    const needsApproval = Boolean(expenseData.requiresApproval || expenseData.approvalStatus === CASHFLOW_APPROVAL_STATUS.pending);
    const approvalStatus = needsApproval
      ? CASHFLOW_APPROVAL_STATUS.pending
      : (expenseData.approvalStatus || CASHFLOW_APPROVAL_STATUS.approved);
    const expensePayload = {
      ...expenseData,
      amount,
      category: normalizeExpenseCategoryLabel(expenseData.category || 'Chi phí khác'),
      note: normalizeLeadingLabel(expenseData.note || 'Khoản chi'),
      sourceType: expenseData.sourceType || 'manual_accounting_expense',
      requiresApproval: needsApproval,
      approvalStatus,
      handoverStatus: needsApproval ? 'pending' : 'confirmed',
      empId,
      id,
      companyId: myCompanyId,
      isArchived: false,
      createdAt: editedAt
    };

    if (writePlan) {
      writePlan.push({ collectionName: 'expenses', documentId: id, payload: expensePayload, options: { merge: true } });
      return { planned: true, id };
    }
    const result = await saveDataDocument('expenses', id, expensePayload, { merge: true });
    return { ...result, id };
  };
const handleEditExpense = async (expenseId, expenseData = {}, writePlan = null) => {
    if (isVpsStagingMode) {
      throw new Error('VPS finance expenses are immutable after creation; use the approved expense approval/post workflow.');
    }
    if (!firebaseUser || !myCompanyId) throw new Error('Phiên làm việc không hợp lệ.');
    if (!rawExpenses.some(expense => expense.id === expenseId && expense.companyId === myCompanyId)) {
      throw new Error('Không tìm thấy khoản chi của công ty này.');
    }
    const patch = { ...expenseData, updatedAt: editedAt, updatedByEmpId: currentUser?.id || '' };
    if (expenseData.assetId && !assets.some(asset => asset.id === expenseData.assetId && asset.companyId === myCompanyId && !asset.isArchived)) throw new Error('Không tìm thấy xe/tài sản của công ty.');
    if (expenseData.amount !== undefined) {
      patch.amount = parseLooseMoneyValue(expenseData.amount);
      if (patch.amount <= 0) throw new Error('Số tiền chi phải lớn hơn 0.');
    }
    if (expenseData.category !== undefined) patch.category = normalizeExpenseCategoryLabel(expenseData.category || 'Chi phí khác');
    if (expenseData.note !== undefined) patch.note = normalizeLeadingLabel(expenseData.note || patch.category || 'Khoản chi');
    if (expenseData.approvalStatus === CASHFLOW_APPROVAL_STATUS.approved) {
      patch.requiresApproval = true;
      patch.handoverStatus = 'confirmed';
      patch.approvedAt = editedAt;
      patch.approvedByEmpId = currentUser?.id || '';
    }
    if (expenseData.approvalStatus === CASHFLOW_APPROVAL_STATUS.rejected) {
      patch.requiresApproval = true;
      patch.handoverStatus = 'rejected';
      patch.rejectedAt = editedAt;
      patch.rejectedByEmpId = currentUser?.id || '';
    }
    if (writePlan) {
      writePlan.push({ collectionName: 'expenses', documentId: expenseId, payload: patch, options: { merge: true } });
      return { planned: true };
    }
    return saveDataDocument('expenses', expenseId, patch, { merge: true });
  };
const handleEditOrder = async (orderId, orderData, collectedPaymentData = null, writePlan = null) => {
    if (isVpsStagingMode) {
      if (collectedPaymentData) {
        throw new Error('Payment collection is not enabled in the VPS staging order flow.');
      }
      const existingOrder = rawOrders.find((order) => order.companyId === myCompanyId && order.id === orderId);
      if (!existingOrder) return { success: false, message: 'The order was not found in the current tenant.' };
      const savedOrder = await getHdConnectStagingApi().updateOrder(orderId, {
        ...orderData,
        salesEmpId: orderData.salesEmpId || existingOrder.salesEmpId || currentUser?.id || '',
        clientMutationId: orderData.clientMutationId || `order-${orderId}-${Date.now()}`,
      });
      upsertLocalListRecord(setRawOrders, savedOrder);
      return { success: true, order: savedOrder };
    }

    if (!firebaseUser) return { success: false, message: 'Phiên làm việc không hợp lệ.' };
    const existingOrder = rawOrders.find(order => order.companyId === myCompanyId && order.id === orderId);
    const customer = customers.find(c => c.id === orderData.customerId);
    const salesEmpId = orderData.salesEmpId || customer?.empId || existingOrder?.salesEmpId || existingOrder?.empId || '';
    const now = editedAt;
    const updatedOrderPayload = {
      ...orderData,
      salesEmpId,
      zaloContentEditedAt: now,
      updatedAt: now
    };

    if (!existingOrder) return { success: false, message: 'Không tìm thấy hóa đơn.' };
    const writes = [{ collectionName: 'orders', documentId: orderId, payload: updatedOrderPayload, options: { merge: true } }];
    const updatedOrderForSync = {
      ...(existingOrder || {}),
      ...updatedOrderPayload,
      id: orderId,
      companyId: myCompanyId,
      isArchived: false
    };

    const pendingFinancialWrites = expandPendingWrites(pendingFirebaseWritesRef.current);
    const linkedExpense = [
      ...pendingFinancialWrites.filter(write => write.collectionName === 'expenses').map(write => ({ ...write.payload, id: write.documentId })),
      ...rawExpenses,
    ].find(expense => expense.companyId === myCompanyId && expense.sourceType === 'order_extra_expense' && expense.sourceOrderId === orderId);
    const expenseNote = `Phụ phí đơn hàng (${capitalizeFirst(orderData.extraExpenseName) || 'Không tên'}) - Khách: ${customer?.name || 'Khách hàng'}`;

    if ((orderData.sellerExtraExpense || 0) > 0) {
      const expenseId = linkedExpense?.id || `exp_order_${orderId}`;
      writes.push({ collectionName: 'expenses', documentId: expenseId, payload: {
        id: expenseId,
        companyId: myCompanyId,
        empId: existingOrder?.createdByEmpId || existingOrder?.empId || currentUser?.id || 'admin',
        sourceType: 'order_extra_expense',
        sourceOrderId: orderId,
        category: 'Chi phí khác',
        amount: orderData.sellerExtraExpense,
        note: expenseNote,
        date: orderData.date,
        isArchived: false
      }, options: { merge: true } });
    } else if (linkedExpense) {
      writes.push({ collectionName: 'expenses', documentId: linkedExpense.id, payload: {
        isArchived: true,
        archivedAt: editedAt,
        archivedByEmpId: currentUser?.id || '',
        archiveReason: 'order_extra_expense_removed'
      }, options: { merge: true } });
    }

    if (collectedPaymentData) {
      const nextCollectedAmount = parseLooseMoneyValue(collectedPaymentData.amount);
      const linkedCollectedPayment = [
        ...pendingFinancialWrites.filter(write => write.collectionName === 'payments').map(write => ({ ...write.payload, id: write.documentId })),
        ...rawPayments,
      ].find(payment => payment.companyId === myCompanyId && (
        payment.id === collectedPaymentData.existingPaymentId ||
        payment.sourceOrderId === orderId ||
        payment.matchedOrderId === orderId
      ));

      if (nextCollectedAmount > 0) {
        const paymentId = linkedCollectedPayment?.id || `p_order_upfront_${orderId}`;
        const paymentMethod = collectedPaymentData.method || linkedCollectedPayment?.method || 'Chuyển khoản';
        const paymentNote = capitalizeFirst(collectedPaymentData.note || linkedCollectedPayment?.note || `Khách thanh toán trước - ${paymentMethod}`);

        writes.push({ collectionName: 'payments', documentId: paymentId, payload: {
          ...(linkedCollectedPayment || {}),
          id: paymentId,
          companyId: myCompanyId,
          customerId: orderData.customerId,
          amount: nextCollectedAmount,
          note: paymentNote,
          bankContent: paymentNote,
          method: paymentMethod,
          date: orderData.date,
          matchedOrderId: orderId,
          matchedOrderCode: formatOrderCode(orderId),
          autoMatchedByOrderCode: false,
          sourceType: linkedCollectedPayment?.sourceType || collectedPaymentData.existingSourceType || 'order_upfront',
          sourceLabel: linkedCollectedPayment?.sourceLabel || 'Khách thanh toán khi lên đơn',
          sourceOrderId: orderId,
          isArchived: false
        }, options: { merge: true } });
      } else if (linkedCollectedPayment) {
        writes.push({ collectionName: 'payments', documentId: linkedCollectedPayment.id, payload: {
          isArchived: true,
          archivedAt: editedAt,
          archivedByEmpId: currentUser?.id || '',
          archiveReason: 'order_collected_payment_removed'
        }, options: { merge: true } });
      }
    }

    if (writePlan) {
      writePlan.push(...writes);
      return { success: true, planned: true, order: updatedOrderForSync };
    }
    const writeResult = saveAtomicDocuments(`order_${orderId}`, writes);
    // Derived rewards and share assets follow server confirmation, not the Save UI.
    void flushPendingFirebaseWriteNow(ATOMIC_SAVE_COLLECTION, `order_${orderId}`, 12000, myCompanyId).then(async () => {
      if (activeTenantScopeRef.current !== myCompanyId) return;
      await syncCustomerLoyaltyPoints(updatedOrderForSync.customerId, { extraOrders: [updatedOrderForSync], reason: 'order_updated' });
      if (existingOrder.customerId && existingOrder.customerId !== updatedOrderForSync.customerId) {
        await syncCustomerLoyaltyPoints(existingOrder.customerId, { extraOrders: [{ ...existingOrder, isArchived: true }], archivedOrderIds: [orderId], reason: 'order_moved_customer' });
      }
      scheduleOrderShareWarmup({
      order: updatedOrderForSync,
      company: currentCompany,
      customers,
      orders: [updatedOrderForSync, ...(orders || []).filter(order => order?.id !== orderId)],
      payments,
      products,
      ensurePayment: handleEnsureOrderPayosPayment,
      reason: 'order_updated'
    });
    }).catch(error => recordStartupEvent('order.followup.pending', { code: error?.code || 'pending' }, 'warn'));

    return { success: true, queued: writeResult.queued, order: updatedOrderForSync, shareReady: false };
  };
const handleAddAssetCostLog = async (empId, logData = {}, writePlan = null) => {
    if (!firebaseUser || !myCompanyId) throw new Error('Phiên làm việc không hợp lệ.');
    const id = `${logData.clientMutationId || `acl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`}`.trim();
    const liters = parseLooseQuantityValue(logData.liters);
    const unitPrice = parseLooseMoneyValue(logData.unitPrice);
    const amount = parseLooseMoneyValue(logData.amount) || (liters > 0 && unitPrice > 0 ? liters * unitPrice : parseLooseMoneyValue(logData.totalAmount));
    const nowIso = editedAt;
    const sourceType = `${logData.sourceType || ''}`;
    const linkedAsset = assets.find(asset => `${asset.id || ''}` === `${logData.assetId || ''}`) || {};
    const assetName = logData.assetName || logData.assetNameSnapshot || getAssetDisplayLabel(linkedAsset);
    const costCategory = normalizeExpenseCategoryLabel(logData.category || logData.costType || (logData.type === 'fuel' ? 'Đổ xăng/dầu' : getAssetCostTypeLabel(logData.type || 'other')));
    const shouldSyncExpense = amount > 0
      && !logData.skipExpenseSync
      && !logData.expenseId
      && !logData.relatedExpenseId
      && !logData.relatedDeliveryReportId
      && !sourceType.includes('delivery');
    const expenseId = shouldSyncExpense ? `exp_asset_cost_${id}` : (logData.expenseId || logData.relatedExpenseId || '');
    const logPayload = {
      ...logData,
      id,
      companyId: myCompanyId,
      empId: empId || '',
      createdByEmpId: empId || '',
      assetId: logData.assetId || '',
      assetName,
      assetPlate: logData.assetPlate || linkedAsset.plateNumber || linkedAsset.licensePlate || linkedAsset.plate || '',
      driverId: logData.driverId || '',
      type: logData.type || 'fuel',
      date: logData.date || getTodayString(),
      kmAt: parseLooseQuantityValue(logData.kmAt),
      liters,
      unitPrice,
      amount,
      expenseId,
      isArchived: false,
      createdAt: nowIso
    };
    const expensePayload = shouldSyncExpense ? {
      id: expenseId,
      companyId: myCompanyId,
      type: 'expense',
      amount,
      date: logPayload.date,
      category: costCategory,
      note: normalizeLeadingLabel(logData.note || `${costCategory}${assetName ? ` - ${assetName}` : ''}`),
      sourceType: 'asset_cost_log',
      sourceLabel: 'Chi phí tài sản',
      assetCostLogId: id,
      relatedAssetCostLogId: id,
      assetId: logPayload.assetId,
      assetName: logPayload.assetName,
      assetPlate: logPayload.assetPlate,
      driverId: logPayload.driverId,
      empId: empId || '',
      createdByEmpId: empId || '',
      createdByEmployeeId: empId || '',
      requiresApproval: false,
      approvalStatus: CASHFLOW_APPROVAL_STATUS.approved,
      handoverStatus: 'confirmed',
      isArchived: false,
      createdAt: nowIso
    } : null;

    const writes = [
      { collectionName: 'assetCostLogs', documentId: id, payload: logPayload, options: { merge: true } },
      ...(expensePayload ? [{ collectionName: 'expenses', documentId: expenseId, payload: expensePayload, options: { merge: true } }] : []),
    ];
    if (writePlan) writePlan.push(...writes);
    else saveAtomicDocuments(`asset_cost_${id}`, writes);
    return id;
  };
const handleEditAssetCostLog = async (logId, logData = {}, empId = '', writePlan = null) => {
    if (!firebaseUser || !logId) throw new Error('Phiên làm việc không hợp lệ.');
    const currentLog = assetCostLogs.find(log => `${log.id || ''}` === `${logId}`);
    if (!currentLog || currentLog.companyId !== myCompanyId) throw new Error('Không tìm thấy chi phí của công ty này.');
    const liters = parseLooseQuantityValue(logData.liters);
    const unitPrice = parseLooseMoneyValue(logData.unitPrice);
    const amount = parseLooseMoneyValue(logData.amount) || (liters > 0 && unitPrice > 0 ? liters * unitPrice : parseLooseMoneyValue(logData.totalAmount));
    const linkedAsset = assets.find(asset => `${asset.id || ''}` === `${logData.assetId || currentLog.assetId || ''}`) || {};
    const linkedExpense = expenses.find(expense => (
      `${expense.id || ''}` === `${logData.expenseId || currentLog.expenseId || ''}` ||
      `${expense.assetCostLogId || ''}` === `${logId}` ||
      `${expense.relatedAssetCostLogId || ''}` === `${logId}` ||
      `${expense.sourceAssetCostLogId || ''}` === `${logId}`
    ));
    const nowIso = editedAt;
    const assetName = logData.assetName || logData.assetNameSnapshot || currentLog.assetName || getAssetDisplayLabel(linkedAsset);
    const logPatch = {
      ...logData,
      kmAt: parseLooseQuantityValue(logData.kmAt),
      liters,
      unitPrice,
      amount,
      assetName,
      assetPlate: logData.assetPlate || currentLog.assetPlate || linkedAsset.plateNumber || linkedAsset.licensePlate || linkedAsset.plate || '',
      updatedAt: nowIso,
      updatedByEmpId: empId || employeeInfo?.id || currentUser?.id || ''
    };
    const localLogPayload = { ...currentLog, ...logPatch, id: logId, companyId: currentLog.companyId || myCompanyId };

    let expensePatch = null;
    if (linkedExpense && !linkedExpense.isArchived) {
      const nextCategory = normalizeExpenseCategoryLabel(logData.category || linkedExpense.category || logData.costType || getAssetCostTypeLabel(logData.type || currentLog.type || 'other'));
      expensePatch = {
        ...linkedExpense,
        amount,
        date: logData.date || currentLog.date || linkedExpense.date || getTodayString(),
        category: nextCategory,
        note: normalizeLeadingLabel(logData.note || linkedExpense.note || `${nextCategory}${assetName ? ` - ${assetName}` : ''}`),
        assetId: logData.assetId || currentLog.assetId || linkedExpense.assetId || '',
        assetName,
        assetPlate: logPatch.assetPlate,
        driverId: logData.driverId || currentLog.driverId || linkedExpense.driverId || '',
        assetCostLogId: logId,
        relatedAssetCostLogId: logId,
        updatedAt: nowIso,
        updatedByEmpId: empId || employeeInfo?.id || currentUser?.id || ''
      };
    }
    const writes = [
      { collectionName: 'assetCostLogs', documentId: logId, payload: localLogPayload, options: { merge: true } },
      ...(expensePatch ? [{ collectionName: 'expenses', documentId: linkedExpense.id, payload: expensePatch, options: { merge: true } }] : []),
    ];
    if (writePlan) { writePlan.push(...writes); return { planned: true }; }
    return saveAtomicDocuments(`asset_cost_${logId}`, writes);
  };
 return {addReport:handleAddDeliveryReport,editReport:handleUpdateDeliveryReport,addPayment:handleAddPayment,addExpense:handleAddExpense,editExpense:handleEditExpense,editOrder:handleEditOrder,addCost:handleAddAssetCostLog,editCost:handleEditAssetCostLog};
}
