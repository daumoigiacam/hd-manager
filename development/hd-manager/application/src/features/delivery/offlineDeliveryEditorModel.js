import {DELIVERY_RULES,DELIVERY_READ_CAPS} from './deliveryCommandProtocol.js';
export const deliveryCommandStatus={PENDING_SYNC:'Đã lưu trên thiết bị · Chờ đồng bộ',SYNCING:'Đang chờ máy chủ xác nhận',SYNCED:'Máy chủ đã xác nhận toàn bộ chứng từ',SERVER_CONFIRMED:'Chứng từ nguồn máy chủ',SYNC_FAILED:'Chưa đồng bộ · Ý định vẫn được giữ',CONFLICT_REQUIRES_REVIEW:'Nguồn đã thay đổi · Cần đối chiếu, chưa ghi đè'};
export function deliveryWriteAccess(runtime,repository,kind){
 const s=runtime?.scope,u=runtime?.appSession?.currentUser;
 return Boolean(runtime?.isCurrent?.()&&Date.now()<runtime.expiresAtMs&&u?.firebaseUid===s?.principalId&&u?.companyId===s?.tenantId&&u?.accountType==='employee'&&runtime.appSession.currentCompany?.id===s.tenantId&&runtime.appSession.sourceProfile===undefined&&repository?.ready&&repository.protocolVersion===1&&repository.employeeId===u.id&&['tenantId','principalId','permissionRevision','sessionId'].every(k=>repository.scope?.[k]===s[k])&&[...DELIVERY_READ_CAPS,DELIVERY_RULES[kind]?.capability].every(c=>c&&runtime.capabilities?.includes(c)));
}
// Empty mandatory historical units remain empty. New optional amounts are
// explicitly zero; actual measures come only from this displayed source pair.
export function deliveryDraftFromBase(base){
 const r=base.report,d=base.dispatch,s=r||d;
 return {dispatchId:d.id,date:r?.date||d.date||'',actualWeight:String(r?.actualWeightKg??d.weightKg??''),actualQuantity:String(r?.actualQuantity??d.quantity??d.pieceCount??''),actualQuantityUnit:s.actualQuantityUnit||s.actualUnit||s.quantityUnit||'',actualPackageCount:String(r?.actualPackageCount??0),actualPackageUnit:r?.actualPackageUnit||'',note:r?.note||'',collectedAmount:r?.collectedAmount??0,collectedMethod:r?.collectedMethod||'Tiền mặt',deliveryExpenseAmount:r?.deliveryExpenseAmount??0,deliveryExpenseCategory:r?.deliveryExpenseCategory||'Chi phí giao hàng',expenseNote:base.expense?.note||'',assetId:r?.deliveryExpenseAssetId||'',kmAt:r?.deliveryExpenseKmAt??0,liters:r?.deliveryExpenseLiters??0,fuelUnitPrice:r?.deliveryExpenseUnitPrice??0,returnWeightKg:r?.returnWeightKg??0,returnQuantity:r?.returnQuantity??0,returnQuantityUnit:r?.returnQuantityUnit||'',shippingAmount:r?.shippingAmount??0,shippingNote:r?.shippingNote||''};
}
