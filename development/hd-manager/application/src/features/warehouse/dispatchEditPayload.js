/**
 * @typedef {{actualQuantity: number, actualUnit: string, unitPrice: number}} BillingSnapshot
 * @typedef {{branchId: string, branchName: string, branchAddress: string}} BranchRef
 */
/**
 * Preserve billing snapshots; validation and pricing stay with their existing owner.
 * @template {BillingSnapshot} T
 * @param {{billingSnapshot: T, customer: {id: string, name: string}, product: {id: string, name: string},
 * branchRef: BranchRef, weightKg: number, pieceCount: number,
 * inlineEditingDispatchDraft: {weightEntries?: (string | number)[], note?: string},
 * nextDriverId: string, nextDriverName: string, row: {transcript?: string, sourceOrderRequestDate?: string, date?: string},
 * baseSourceType: string, matchedOrderRow: {requestDate?: string, requestId?: string, rowKey?: string} | null,
 * selectedOrderRequestDateKey: string, workingDate: string, isOutsideOrderRequest: boolean,
 * getCustomerDisplayName: (customer: {id: string, name: string}) => string,
 * normalizeWarehouseWeightEntries: (entries: (string | number)[]) => number[],
 * capitalizeFirst: (value: string) => string,
 * buildWarehouseDispatchSourceType: (base: string, order: {requestDate?: string, requestId?: string, rowKey?: string} | null) => string}} context
 */
export function buildDispatchEditPayload({billingSnapshot,customer,product,branchRef,weightKg,pieceCount,
  inlineEditingDispatchDraft,nextDriverId,nextDriverName,row,baseSourceType,matchedOrderRow,
  selectedOrderRequestDateKey,workingDate,isOutsideOrderRequest,getCustomerDisplayName,
  normalizeWarehouseWeightEntries,capitalizeFirst,buildWarehouseDispatchSourceType}) {
  return {
      ...billingSnapshot,
      customerId: customer.id,
      customerNameSnapshot: getCustomerDisplayName(customer) || customer.name,
      branchId: branchRef.branchId,
      branchName: branchRef.branchName,
      branchAddress: branchRef.branchAddress,
      customerBranchId: branchRef.branchId,
      customerBranchName: branchRef.branchName,
      customerBranchAddress: branchRef.branchAddress,
      productId: product.id,
      productNameSnapshot: product.name,
      weightKg,
      weightEntries: normalizeWarehouseWeightEntries(inlineEditingDispatchDraft.weightEntries || []),
      pieceCount,
      quantity: billingSnapshot.actualQuantity,
      quantityCount: billingSnapshot.actualQuantity,
      quantityUnit: billingSnapshot.actualUnit,
      assignedDriverId: nextDriverId,
      assignedDriverNameSnapshot: nextDriverName,
      driverId: nextDriverId,
      driverNameSnapshot: nextDriverName,
      note: capitalizeFirst(inlineEditingDispatchDraft.note || '').trim(),
      transcript: row.transcript || '',
      sourceType: buildWarehouseDispatchSourceType(baseSourceType, matchedOrderRow),
      sourceOrderRequestDate: matchedOrderRow?.requestDate || row.sourceOrderRequestDate || selectedOrderRequestDateKey,
      sourceOrderRequestId: matchedOrderRow?.requestId || '',
      sourceOrderRequestRowKey: matchedOrderRow?.rowKey || '',
      price: billingSnapshot.unitPrice,
      sourceOrderRequestUnitPrice: billingSnapshot.unitPrice,
      orderRequestUnitPrice: billingSnapshot.unitPrice,
      requestUnitPrice: billingSnapshot.unitPrice,
      isOutsideOrderRequest,
      createdWithoutOrderRequest: isOutsideOrderRequest,
      sourceOrderRequestMissing: isOutsideOrderRequest,
      date: row.date || workingDate
    };
}
