// Lightweight permission/presentation boundary; no SQL, planner or product preload.
import {businessDayKey} from '../../utils/businessDate.js';
export const DISPATCH_RULES=Object.freeze({
 'warehouseDispatch.create':{capability:'warehouseDispatches.create',action:'create_warehouse_dispatch'},
 'warehouseDispatch.update':{capability:'warehouseDispatches.update',action:'edit_warehouse_dispatch'},
 'warehouseDispatch.archive':{capability:'warehouseDispatches.archive',action:'delete_warehouse_dispatch'},
}); // Requirements only. Main must explicitly map/sign these; this module never grants permissions.
export const DISPATCH_HISTORY_CAP='warehouseDispatches.archiveHistory';
export const DISPATCH_OUTSIDE_CAP='warehouseDispatches.createWithoutOrderRequest';
export const dispatchStatusLabel={PENDING_SYNC:'Đã lưu trên thiết bị · Chờ máy chủ kiểm tra tồn và xác nhận',SYNCING:'Đang đồng bộ · Chưa xác nhận tồn kho',SYNCED:'Máy chủ đã xác nhận phiếu xuất',SERVER_CONFIRMED:'Phiếu xuất nguồn máy chủ',SYNC_FAILED:'Chưa đồng bộ thành công · Ý định được giữ',CONFLICT_REQUIRES_REVIEW:'Cần đối chiếu · Chưa ghi đè hoặc trừ tồn'};
export function dispatchWriteAccess(runtime,repository,kind,document=null){
 const scope=runtime?.scope,user=runtime?.appSession?.currentUser;
 return Boolean(runtime?.isCurrent?.()&&Number.isFinite(runtime.expiresAtMs)&&Date.now()<runtime.expiresAtMs&&user?.firebaseUid===scope?.principalId&&user.companyId===scope.tenantId&&user.accountType==='employee'&&runtime.appSession.currentCompany?.id===scope.tenantId&&runtime.appSession.sourceProfile===undefined&&repository?.ready&&repository.protocolVersion===1&&repository.employeeId===user.id&&['tenantId','principalId','permissionRevision','sessionId'].every(k=>repository.scope?.[k]===scope[k])&&['home.read','home.dispatches.read','home.stock.read','home.debt.read','customers.read',DISPATCH_RULES[kind]?.capability,...(kind==='warehouseDispatch.archive'?(document?.date&&document.date!==businessDayKey(Date.now())?[DISPATCH_HISTORY_CAP]:[]):[DISPATCH_OUTSIDE_CAP])].every(cap=>cap&&runtime.capabilities?.includes(cap)));
}
