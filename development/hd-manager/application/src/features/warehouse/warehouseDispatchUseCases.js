/** @param {string} empId @param {import("./warehouseDispatchContracts.js").DispatchDraft} dispatchData
 * @param {import("./warehouseDispatchContracts.js").DispatchCreateContext} context
 */
export async function createWarehouseDispatch(empId, dispatchData, context) {
  const { myCompanyId, customers, products, rawWarehouseDispatches, parseLooseQuantityValue, normalizeLeadingLabel, normalizeLookupText, getTodayString, getEntityTimestamp, pendingFirebaseWritesRef, enqueuePendingFirebaseWrite, setRawWarehouseDispatches, rememberRecentLocalWrite, requireSharedWriteConfirmation } = context;
  const nowMs = Date.now();
  const createdAtIso = dispatchData.createdAt || new Date(nowMs).toISOString();
  const clientMutationId = `${dispatchData.clientMutationId || ''}`.trim();
  const customer = customers.find(c => c.id === dispatchData.customerId);
  const product = products.find(p => p.id === dispatchData.productId);
  const quantity = parseLooseQuantityValue(dispatchData.quantity ?? dispatchData.pieceCount ?? dispatchData.quantityCount);
  const weightKg = parseLooseQuantityValue(dispatchData.weightKg ?? dispatchData.totalKg);
  const quantityUnit = normalizeLeadingLabel(dispatchData.quantityUnit || dispatchData.unit || (quantity > 0 ? 'Con' : ''));
  const normalizedDate = dispatchData.date || getTodayString();
  /** @param {import("./warehouseDispatchContracts.js").DispatchDraft} item */
  const buildDispatchDuplicateKey = (item = {}) => [
    item.companyId || myCompanyId || '',
    item.date || normalizedDate,
    item.customerId || normalizeLookupText(item.customerNameSnapshot || item.customerName || ''),
    item.branchId || item.customerBranchId || normalizeLookupText(item.branchName || item.customerBranchName || ''),
    item.productId || normalizeLookupText(item.productNameSnapshot || item.productName || ''),
    normalizeLookupText(item.assignedDriverId || item.driverId || item.assignedDriverNameSnapshot || item.driverNameSnapshot || ''),
    normalizeLookupText(item.quantityUnit || item.unit || ''),
    parseLooseQuantityValue(item.quantity ?? item.pieceCount ?? item.quantityCount),
    parseLooseQuantityValue(item.weightKg ?? item.totalKg),
    normalizeLookupText(item.sourceOrderRequestId || ''),
    normalizeLookupText(item.sourceOrderRequestRowKey || '')
  ].join('__');
  const duplicateKey = buildDispatchDuplicateKey({
    ...dispatchData,
    companyId: myCompanyId,
    date: normalizedDate,
    quantity,
    pieceCount: parseLooseQuantityValue(dispatchData.pieceCount ?? quantity),
    quantityCount: parseLooseQuantityValue(dispatchData.quantityCount ?? quantity),
    weightKg,
    quantityUnit
  });
  const duplicateCandidate = (rawWarehouseDispatches || []).find((item) => {
    if (!item || item.isArchived) return false;
    if ((item.companyId || myCompanyId) !== myCompanyId) return false;
    if (clientMutationId && item.clientMutationId) return item.clientMutationId === clientMutationId;
    if (buildDispatchDuplicateKey(item) !== duplicateKey) return false;
    const itemTimestamp = getEntityTimestamp(item);
    return itemTimestamp ? Math.abs(nowMs - itemTimestamp) <= 20000 : false;
  });
  if (duplicateCandidate?.id) {
    const queued = pendingFirebaseWritesRef.current.some(write => (
      write.companyId === myCompanyId
      && write.collectionName === 'warehouseDispatches'
      && write.documentId === duplicateCandidate.id
    ));
    if (queued && clientMutationId && duplicateCandidate.clientMutationId === clientMutationId) {
      await requireSharedWriteConfirmation({ queued: true, companyId: myCompanyId }, 'warehouseDispatches', duplicateCandidate.id);
      return { id: duplicateCandidate.id, queued: false, duplicate: true };
    }
    return { id: duplicateCandidate.id, queued, duplicate: true };
  }
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(clientMutationId)) {
    throw new Error('Mã thao tác xuất kho không hợp lệ. Vui lòng thử lại.');
  }
  const id = `wd_${myCompanyId}_${clientMutationId}`;
  /** @type {import("./warehouseDispatchContracts.js").DispatchCreateDocument} */
  const normalizedPayload = {
    ...dispatchData,
    id,
    clientMutationId,
    empId,
    createdByEmpId: empId,
    customerNameSnapshot: dispatchData.customerNameSnapshot || customer?.name || '',
    productNameSnapshot: dispatchData.productNameSnapshot || product?.name || '',
    weightKg,
    quantity,
    pieceCount: parseLooseQuantityValue(dispatchData.pieceCount ?? quantity),
    quantityCount: parseLooseQuantityValue(dispatchData.quantityCount ?? quantity),
    quantityUnit,
    date: normalizedDate,
    companyId: myCompanyId,
    isArchived: false,
    createdAt: createdAtIso,
    updatedAt: createdAtIso
  };
  // Publish only after durable enqueue so a rejected draft cannot reappear
  // through the recent-write overlay during snapshot reconciliation.
  const saveResult = enqueuePendingFirebaseWrite({ collectionName: 'warehouseDispatches', documentId: id, payload: normalizedPayload, options: { dispatchCreate: true }, durable: true });
  setRawWarehouseDispatches(prev => [
    ...prev.filter(item => item.id !== id),
    { ...normalizedPayload, __pendingFirebaseSync: true }
  ]);
  rememberRecentLocalWrite('warehouseDispatches', id, { ...normalizedPayload, __pendingFirebaseSync: true });
  await requireSharedWriteConfirmation(saveResult, 'warehouseDispatches', id);
  return { id, queued: false };
}

/** @param {string} dispatchId @param {import("./warehouseDispatchContracts.js").DispatchDraft} updatedData @param {string} empId
 * @param {import("./warehouseDispatchContracts.js").DispatchUpdateContext} context
 */
export async function updateWarehouseDispatch(dispatchId, updatedData, empId, context) {
  const { rawWarehouseDispatches, customers, products, parseLooseQuantityValue, normalizeLeadingLabel, normalizeProductPricingUnit, parseLooseMoneyValue, isSameBillingUnit, getTodayString, myCompanyId, saveDataDocument, requireSharedWriteConfirmation } = context;
  const previousDispatch = rawWarehouseDispatches.find(item => item.id === dispatchId);
  const mergedData = { ...(previousDispatch || {}), ...(updatedData || {}) };
  const customer = customers.find(c => c.id === mergedData.customerId);
  const product = products.find(p => p.id === mergedData.productId);
  const quantity = parseLooseQuantityValue(mergedData.quantity ?? mergedData.pieceCount ?? mergedData.quantityCount);
  const weightKg = parseLooseQuantityValue(mergedData.weightKg ?? mergedData.totalKg);
  const quantityUnit = normalizeLeadingLabel(mergedData.quantityUnit || mergedData.unit || (quantity > 0 ? 'Con' : ''));
  const hasWeightPatch = Object.prototype.hasOwnProperty.call(updatedData || {}, 'weightKg')
    || Object.prototype.hasOwnProperty.call(updatedData || {}, 'totalKg');
  const billingUnit = normalizeProductPricingUnit(mergedData.billingUnit || mergedData.pricingUnit || '');
  const unitPrice = parseLooseMoneyValue(mergedData.unitPrice ?? mergedData.price);
  const weightBillingPatch = hasWeightPatch
    ? {
        actualWeightKg: weightKg,
        ...(isSameBillingUnit(billingUnit, 'Kg') ? {
          billingQuantity: weightKg,
          pricingQuantity: weightKg,
          amount: Math.round(weightKg * unitPrice),
          pricingAmount: Math.round(weightKg * unitPrice),
          lineTotal: Math.round(weightKg * unitPrice)
        } : {})
      }
    : {};
  const normalizedPayload = {
    ...updatedData,
    ...weightBillingPatch,
    customerNameSnapshot: updatedData.customerNameSnapshot || mergedData.customerNameSnapshot || customer?.name || '',
    productNameSnapshot: updatedData.productNameSnapshot || mergedData.productNameSnapshot || product?.name || '',
    weightKg,
    quantity,
    pieceCount: parseLooseQuantityValue(mergedData.pieceCount ?? quantity),
    quantityCount: parseLooseQuantityValue(mergedData.quantityCount ?? quantity),
    quantityUnit,
    date: mergedData.date || getTodayString(),
    companyId: mergedData.companyId || myCompanyId,
    updatedAt: new Date().toISOString(),
    updatedByEmpId: empId || ''
  };
  // The durable save layer owns publication. Never restore a captured record over a newer edit.
  const saveResult = await saveDataDocument('warehouseDispatches', dispatchId, normalizedPayload, { merge: true });
  await requireSharedWriteConfirmation(saveResult, 'warehouseDispatches', dispatchId);
}

/** @param {string} dispatchId
 * @param {import("./warehouseDispatchContracts.js").DispatchDeleteContext} context
 */
export async function deleteWarehouseDispatch(dispatchId, context) {
  const { currentUser, saveDataDocument, requireSharedWriteConfirmation } = context;
  const archivedPayload = {
    isArchived: true,
    archivedAt: new Date().toISOString(),
    archivedByEmpId: currentUser?.id || ''
  };
  const saveResult = await saveDataDocument('warehouseDispatches', dispatchId, archivedPayload, { merge: true });
  await requireSharedWriteConfirmation(saveResult, 'warehouseDispatches', dispatchId);
}
