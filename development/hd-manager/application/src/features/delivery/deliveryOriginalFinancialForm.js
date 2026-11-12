import {capitalizeFirst,normalizeExpenseCategoryLabel,normalizeLeadingLabel,normalizeLookupText,getOrderReturnGoodsRecords,summarizeOrderReturnGoods,RETURN_GOODS_STATUS_LABELS,getOrderReturnProductSummary,formatOrderCode,getPrimaryDeliveryAssignmentId} from './deliveryOriginalRules.js';
const CASHFLOW_APPROVAL_STATUS={pending:'pending_handover',approved:'approved',rejected:'rejected'};
export async function originalDeliveryFinancialOperations({plan,reportId,firstRow,base,customer,employeeId,editedAt,employee,dispatch,order,asset,cost,expense,features},draft){
 const wasEditing=!!base,selectedCustomerId=customer.id,selectedCustomer=customer,workingDate=draft.date;
 const collectedAmountValue=draft.collectedAmount,collectedMethod=draft.collectedMethod,deliveryExpenseAmountValue=draft.deliveryExpenseAmount,deliveryExpenseCategory=draft.deliveryExpenseCategory;
 const standaloneExpenseNote=draft.expenseNote,effectiveDeliveryExpenseAssetId=draft.assetId,selectedExpenseAsset=asset,linkedExpense=expense,linkedAssetCostLog=cost,canEditAssetCostLog=features.editCost; const canCreateAssetCostLog=features.addCost;
 const orders=order?[order]:[],warehouseDispatches=[dispatch],savedReportRefs=[{row:firstRow,reportId}];const returnWeightKgValue=draft.returnWeightKg,returnQuantityValue=draft.returnQuantity,returnQuantityUnit=draft.returnQuantityUnit,returnPhotoUrl=base?.returnPhotoUrl||'';const hasReturnGoods=returnWeightKgValue>0||returnQuantityValue>0||Boolean(returnPhotoUrl); const deliveryExpenseKmAtValue=draft.kmAt,deliveryExpenseLitersValue=draft.liters,deliveryExpenseUnitPriceValue=draft.fuelUnitPrice,shouldSyncAssetCostLog=deliveryExpenseAmountValue>0&&effectiveDeliveryExpenseAssetId&&(canCreateAssetCostLog||canEditAssetCostLog);
 const canRecordDeliveryIncome=features.income,canRecordDeliveryExpense=features.expense,onAddPayment=plan.addPayment,onAddExpense=plan.addExpense,onEditExpense=plan.editExpense,onUpdateDeliveryReport=plan.editReport,onEditOrder=plan.editOrder,onAddAssetCostLog=plan.addCost,onEditAssetCostLog=plan.editCost;
 let reportExpenseId=linkedExpense?.id||'';
if (hasReturnGoods && typeof onEditOrder === 'function') {
        const nowIso = editedAt;
        const touchedOrderIds = new Set();
        for (const savedRef of savedReportRefs) {
          const row = savedRef.row || {};
          const dispatchId = `${row.dispatchId || ''}`.trim();
          if (!dispatchId) continue;
          const dispatch = warehouseDispatches.find(item => item?.id === dispatchId) || {};
          const linkedOrder = orders.find(order => {
            if (!order || order.isArchived) return false;
            const sourceDispatchIds = Array.isArray(order.sourceDispatchIds)
              ? order.sourceDispatchIds.map(String)
              : [];
            return sourceDispatchIds.includes(dispatchId)
              || `${order.sourceDispatchId || order.dispatchId || ''}` === dispatchId;
          });
          if (!linkedOrder?.id || touchedOrderIds.has(linkedOrder.id)) continue;
          touchedOrderIds.add(linkedOrder.id);
          const returnRecordId = `delivery_return_${savedRef.reportId || dispatchId}`;
          const existingReturnGoods = getOrderReturnGoodsRecords(linkedOrder);
          const returnRecord = {
            id: returnRecordId,
            sourceType: 'delivery_report',
            deliveryReportId: savedRef.reportId || '',
            dispatchId,
            pieces: returnQuantityValue,
            quantity: returnQuantityValue,
            quantityUnit: normalizeLeadingLabel(returnQuantityUnit || row.expectedQuantityUnit || 'Con'),
            weightKg: returnWeightKgValue,
            returnWeightKg: returnWeightKgValue,
            reason: 'Tài xế báo trả hàng',
            status: 'pending_pickup',
            statusLabel: RETURN_GOODS_STATUS_LABELS.pending_pickup,
            isRetrievedToWarehouse: false,
            pendingPickup: true,
            discountedSale: false,
            discountAmount: 0,
            productSummary: row.productNameSnapshot || row.productNameInput || dispatch.productNameSnapshot || getOrderReturnProductSummary(linkedOrder),
            productId: row.productId || dispatch.productId || '',
            orderId: linkedOrder.id,
            orderCode: formatOrderCode(linkedOrder.id),
            customerId: selectedCustomerId || linkedOrder.customerId || '',
            customerName: selectedCustomer?.name || linkedOrder.customer?.name || linkedOrder.customerNameSnapshot || '',
            photoUrl: returnPhotoUrl || '',
            createdAt: nowIso,
            createdByEmpId: employee?.id || '',
            createdByName: employee?.name || ''
          };
          const nextReturnGoods = existingReturnGoods.some(item => (
            item?.id === returnRecordId || (savedRef.reportId && item?.deliveryReportId === savedRef.reportId)
          ))
            ? existingReturnGoods.map(item => (
              item?.id === returnRecordId || (savedRef.reportId && item?.deliveryReportId === savedRef.reportId)
                ? { ...item, ...returnRecord, createdAt: item.createdAt || nowIso, updatedAt: nowIso }
                : item
            ))
            : [...existingReturnGoods, returnRecord];
          const returnSummary = summarizeOrderReturnGoods({ returnGoods: nextReturnGoods });
          await onEditOrder(linkedOrder.id, {
            customerId: linkedOrder.customerId || selectedCustomerId || '',
            salesEmpId: linkedOrder.salesEmpId || linkedOrder.empId || '',
            empId: linkedOrder.empId || '',
            createdByEmpId: linkedOrder.createdByEmpId || '',
            date: linkedOrder.date || workingDate,
            sellerExtraExpense: linkedOrder.sellerExtraExpense || 0,
            extraExpenseName: linkedOrder.extraExpenseName || '',
            returnGoods: nextReturnGoods,
            returnGoodsUpdatedAt: nowIso,
            returnDiscountAmount: returnSummary.discountAmount,
            returnPendingPickupPieces: returnSummary.pendingPieces,
            returnPendingPickupWeightKg: returnSummary.pendingWeightKg,
            reviewStatus: linkedOrder.reviewStatus === 'approved' ? 'need_review' : (linkedOrder.reviewStatus || 'draft'),
            reviewStatusLabel: 'Có hàng trả chưa lấy về kho'
          });
        }
      }
if (!wasEditing && collectedAmountValue > 0 && canRecordDeliveryIncome) {
        await onAddPayment?.({
          clientMutationId: `p_delivery_${reportId}`,
          customerId: selectedCustomerId,
          amount: collectedAmountValue,
          method: collectedMethod,
          date: workingDate,
          note: `Tài xế thu khi giao hàng${selectedCustomer?.name ? ` - ${selectedCustomer.name}` : ''}`,
          sourceType: collectedMethod === 'Chuyển khoản' ? 'customer_transfer' : 'driver_cash',
          sourceLabel: 'Thu từ báo cáo giao hàng',
          requiresApproval: true,
          approvalStatus: CASHFLOW_APPROVAL_STATUS.pending,
          handoverStatus: 'pending',
          createdByRole: 'driver',
          relatedDeliveryReportId: reportId || '',
          dispatchId: firstRow.dispatchId || '',
          empId: employee?.id || ''
        });
      }
if (deliveryExpenseAmountValue > 0 && canRecordDeliveryExpense) {
        const expensePayload = {
          amount: deliveryExpenseAmountValue,
          category: normalizeExpenseCategoryLabel(deliveryExpenseCategory || 'Chi phí giao hàng'),
          note: standaloneExpenseNote || deliveryExpenseCategory || 'Chi phí giao hàng',
          date: workingDate,
          assetId: effectiveDeliveryExpenseAssetId || '',
          assetName: selectedExpenseAsset?.name || selectedExpenseAsset?.vehicleName || selectedExpenseAsset?.vehicleModel || '',
          assetPlate: selectedExpenseAsset?.plateNumber || selectedExpenseAsset?.licensePlate || selectedExpenseAsset?.plate || '',
          deliveryExpenseAssetId: effectiveDeliveryExpenseAssetId || '',
          deliveryExpenseAssetNameSnapshot: selectedExpenseAsset?.name || selectedExpenseAsset?.vehicleName || selectedExpenseAsset?.vehicleModel || '',
          deliveryExpenseAssetPlateSnapshot: selectedExpenseAsset?.plateNumber || selectedExpenseAsset?.licensePlate || selectedExpenseAsset?.plate || '',
          sourceType: 'driver_delivery_expense',
          sourceLabel: 'Chi từ báo cáo giao hàng',
          requiresApproval: true,
          approvalStatus: CASHFLOW_APPROVAL_STATUS.pending,
          handoverStatus: 'pending',
          createdByRole: 'driver',
          relatedDeliveryReportId: reportId || '',
          dispatchId: firstRow.dispatchId || ''
        };
        if (linkedExpense) await onEditExpense(linkedExpense.id, expensePayload);
        else reportExpenseId = await onAddExpense(expensePayload);
        if (reportId) await onUpdateDeliveryReport(reportId, { expenseId: reportExpenseId });
      } else if (linkedExpense && canRecordDeliveryExpense) {
        await onEditExpense(linkedExpense.id, { isArchived: true, archivedAt: editedAt });
        if (linkedAssetCostLog && canEditAssetCostLog) {
          await onEditAssetCostLog(linkedAssetCostLog.id, { ...linkedAssetCostLog, isArchived: true, archivedAt: editedAt });
        }
      }
if (shouldSyncAssetCostLog) {
        const normalizedCategory = normalizeExpenseCategoryLabel(deliveryExpenseCategory || 'Chi phí giao hàng');
        const normalizedCategoryKey = normalizeLookupText(normalizedCategory);
        const isFuelCost = ['xang', 'dau', 'nhien lieu', 'fuel'].some(keyword => normalizedCategoryKey.includes(keyword));
        const assetCostPayload = {
          assetId: effectiveDeliveryExpenseAssetId,
          driverId: employee?.id || getPrimaryDeliveryAssignmentId(selectedExpenseAsset) || '',
          type: isFuelCost ? 'fuel' : 'expense',
          costType: isFuelCost ? 'fuel' : normalizedCategory,
          category: normalizedCategory,
          amount: deliveryExpenseAmountValue,
          kmAt: deliveryExpenseKmAtValue,
          liters: deliveryExpenseLitersValue,
          unitPrice: deliveryExpenseUnitPriceValue,
          date: workingDate,
          note: `${normalizedCategory}${selectedCustomer?.name ? ` - ${selectedCustomer.name}` : ''}`,
          sourceType: 'delivery_report_expense',
          sourceLabel: 'Tự động từ báo cáo giao hàng',
          relatedDeliveryReportId: reportId || '',
          expenseId: reportExpenseId,
          dispatchId: firstRow.dispatchId || ''
        };
        if (linkedAssetCostLog?.id && canEditAssetCostLog) {
          await onEditAssetCostLog?.(linkedAssetCostLog.id, assetCostPayload);
        } else if (canCreateAssetCostLog) {
          const assetCostLogId = await onAddAssetCostLog?.(assetCostPayload);
          if (assetCostLogId && reportId && onUpdateDeliveryReport) {
            await onUpdateDeliveryReport(reportId, { assetCostLogId });
          }
        }
      }
 return plan;
}
