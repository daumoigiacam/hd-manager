/**
 * @param {{preventDefault: () => void}} e
 * @param {import('./dispatchWorkflowContracts.js').CreatePorts} ports
 */
export async function submitDispatchForm(e, {canCreate, employee, customerLookup, productLookup, employeeLookup, dispatchDraft, normalizeDispatchQuantityUnit, setDispatchError, dispatchSaveLockRef, setIsSavingDispatch, findMatchingOrderRequestRowForDispatch, getDispatchOrderBranchRef, buildDispatchBillingSnapshot, effectiveDispatchDriverId, canCreateDispatchWithoutOrderRequest, canUseManualDispatchProductOverride, workingDate, selectedOrderRequestDateKey, normalizeWarehouseWeightEntries, capitalizeFirst, dispatchCreateMutationRef, vpsUnits, getCustomerDisplayName, buildWarehouseDispatchSourceType, onAddWarehouseDispatch, setDispatchPickerOpen, setDispatchDriverSelectionTouched, setDispatchDraft, createEmptyDispatchDraft, getFriendlyFirebaseErrorMessage}) {
    e.preventDefault();
    if (!canCreate || !employee?.id) return;
    const customer = customerLookup.get(dispatchDraft.customerId);
    const product = productLookup.get(dispatchDraft.productId);
    const weightKg = parseFloat(`${dispatchDraft.weightKg || ''}`.replace(',', '.')) || 0;
    const pieceCount = parseFloat(`${dispatchDraft.pieceCount || ''}`.replace(',', '.')) || 0;
    const quantityUnit = normalizeDispatchQuantityUnit(dispatchDraft.quantityUnit || 'Con');

    if (!customer || !product || (weightKg <= 0 && pieceCount <= 0)) {
      setDispatchError('Vui long chon dung khach hang, loai hang va nhap so kg hop le.');
      return;
    }

    if (dispatchSaveLockRef.current) return;
    dispatchSaveLockRef.current = true;
    setIsSavingDispatch(true);
    try {
    const dispatchLikeForOrderMatch = {
      ...dispatchDraft,
      customerId: customer.id,
      productId: product.id,
      weightKg,
      pieceCount,
      quantity: pieceCount,
      quantityCount: pieceCount,
      quantityUnit
    };
    const matchedOrderRow = findMatchingOrderRequestRowForDispatch(customer.id, product.id, dispatchLikeForOrderMatch);
    const isOutsideOrderRequest = !matchedOrderRow;
    const baseSourceType = dispatchDraft.transcript ? 'voice' : 'manual';
    const branchRef = getDispatchOrderBranchRef(customer, matchedOrderRow || dispatchDraft, dispatchDraft);
    const billingSnapshot = buildDispatchBillingSnapshot({
      customer,
      product,
      matchedOrderRow,
      actualQuantity: pieceCount,
      actualUnit: quantityUnit,
      actualWeightKg: weightKg,
      branchId: branchRef.branchId,
    });
    const assignedDriverId = effectiveDispatchDriverId;
    const assignedDriver = assignedDriverId ? employeeLookup.get(assignedDriverId) : null;
    const assignedDriverName = assignedDriver?.name || '';
    const canSaveOutsideMatchedOrder = Boolean(
      canCreateDispatchWithoutOrderRequest
      || canUseManualDispatchProductOverride(customer.id)
    );
    if (isOutsideOrderRequest && !canSaveOutsideMatchedOrder) {
      setDispatchError('Loại hàng này không có trong đơn đặt. Tài khoản cần quyền chọn loại hàng hoặc quyền tạo phiếu ngoài đơn để lưu.');
      return;
    }
    if (!billingSnapshot.billingSnapshotValid) {
      setDispatchError(billingSnapshot.billingSnapshotError === 'MISSING_BILLING_QUANTITY'
        ? `Vui lòng nhập số kg thực tế để tính tiền ${product.name}.`
        : `Đơn vị hoặc đơn giá của ${product.name} chưa đúng cấu hình sản phẩm cố định.`);
      return;
    }

    const intentFingerprint = JSON.stringify({
      workingDate,
      warehouseId: dispatchDraft.warehouseId || '',
      unitId: dispatchDraft.unitId || '',
      customerId: customer.id,
      productId: product.id,
      pieceCount,
      quantityUnit: billingSnapshot.actualUnit,
      weightKg,
      weightEntries: normalizeWarehouseWeightEntries(dispatchDraft.weightEntries || []),
      assignedDriverId,
      note: capitalizeFirst(dispatchDraft.note || '').trim(),
      billing: {
        quantity: billingSnapshot.actualQuantity,
        unitPrice: billingSnapshot.unitPrice,
        amount: billingSnapshot.amount,
        billingUnit: billingSnapshot.billingUnit,
      },
      sourceOrderRequestId: matchedOrderRow?.requestId || '',
      sourceOrderRequestRowKey: matchedOrderRow?.rowKey || '',
    });
    if (dispatchCreateMutationRef.current?.fingerprint !== intentFingerprint) {
      dispatchCreateMutationRef.current = {
        fingerprint: intentFingerprint,
        clientMutationId: `wd_${employee.id}_${workingDate}_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`}`,
        createdAt: new Date().toISOString(),
      };
    }
    const createMutation = dispatchCreateMutationRef.current;
    await onAddWarehouseDispatch(employee.id, {
      ...billingSnapshot,
      warehouseId: dispatchDraft.warehouseId || '',
      unitId: dispatchDraft.unitId || '',
      unitLabel: vpsUnits.find(unit => unit.id === dispatchDraft.unitId)?.symbol
        || vpsUnits.find(unit => unit.id === dispatchDraft.unitId)?.name
        || '',
      clientMutationId: createMutation.clientMutationId,
      createdAt: createMutation.createdAt,
      date: workingDate,
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
      pieceCount,
      quantity: billingSnapshot.actualQuantity,
      quantityCount: billingSnapshot.actualQuantity,
      quantityUnit: billingSnapshot.actualUnit,
      assignedDriverId,
      assignedDriverNameSnapshot: assignedDriverName,
      driverId: assignedDriverId,
      driverNameSnapshot: assignedDriverName,
      weightEntries: normalizeWarehouseWeightEntries(dispatchDraft.weightEntries || []),
      note: capitalizeFirst(dispatchDraft.note || '').trim(),
      transcript: dispatchDraft.transcript || '',
      sourceOrderRequestDate: matchedOrderRow?.requestDate || selectedOrderRequestDateKey,
      sourceOrderRequestId: matchedOrderRow?.requestId || '',
      sourceOrderRequestRowKey: matchedOrderRow?.rowKey || '',
      price: billingSnapshot.unitPrice,
      sourceOrderRequestUnitPrice: billingSnapshot.unitPrice,
      orderRequestUnitPrice: billingSnapshot.unitPrice,
      requestUnitPrice: billingSnapshot.unitPrice,
      isOutsideOrderRequest,
      createdWithoutOrderRequest: isOutsideOrderRequest,
      sourceOrderRequestMissing: isOutsideOrderRequest,
      sourceType: buildWarehouseDispatchSourceType(baseSourceType, matchedOrderRow)
    });

    setDispatchError('');
    setDispatchPickerOpen('');
    dispatchCreateMutationRef.current = null;
    setDispatchDriverSelectionTouched(false);
    setDispatchDraft(createEmptyDispatchDraft(assignedDriverId));
    } catch (error) {
      setDispatchError(getFriendlyFirebaseErrorMessage(
        error,
        'Không thể lưu phiếu xuất kho. Vui lòng kiểm tra mạng rồi thử lại.'
      ));
    } finally {
      dispatchSaveLockRef.current = false;
      setIsSavingDispatch(false);
    }

}
