import {resolveWarehouseDispatchDeliveryStatus} from '../../utils/warehouseDispatchGrouping.js';

export const DELIVERY_PAGE_SIZE = 25;
export const DELIVERY_DIRECTORY_REQUIREMENTS = Object.freeze({
  source:'deliveryReports',
  existingServerPolicy:'functions/offlineHomeFeed.mjs HOME_PERMISSION_MAPPING.deliveryReports = [home, view_quick_report]; access also verifies the full Home source policy.',
  capability:'Directory owner must explicitly approve/map this source to existing signed capabilities; no delivery.read capability is currently issued.',
  page:'page(deliveryReports,{from,to,text,employeeId,status,limit:25,cursor}) using SQL [from,to), original empId/createdByEmpId; status is the WEIGHT status, never completion.',
  fields:['companyId','date','empId','createdByEmpId','dispatchId','warehouseDispatchId','orderId','customerId','customerNameSnapshot','productId','productNameSnapshot','status','reviewStatus','resolutionStatus','deliveryStatus','trackingStatus','deliveredAt','driverId','assignedDriverId','driverNameSnapshot','assignedDriverNameSnapshot','expectedWeightKg','actualWeightKg','differenceKg','expectedQuantity','expectedQuantityUnit','actualQuantity','actualQuantityUnit','actualPackageCount','actualPackageUnit','orderedUnit','pricingUnit','unitPrice','pricingQuantity','pricingAmount','amount','collectedAmount','collectedMethod','note','isArchived'],
  relations:'lookup(warehouseDispatches,[dispatchId],{checkpoint}); lookup(orders,[explicitOrderId],{checkpoint}); optional deliveryOrders(dispatchId,{checkpoint,limit:25,cursor}) for exact SQL sourceDispatchId/sourceDispatchIds/item sourceDispatchIds links. Must return metadata.relation={kind:dispatch-orders,dispatchId}. All source-specific permissions required.',
  excluded:'No guessed completion, driver from reporter ID, customer-only order joins, financial totals, new grants, write protocol or listeners.',
});

const fault = (code,message) => Object.assign(Error(message),{code});
export function assertDeliverySession(runtime) {
  const scope=runtime?.scope,user=runtime?.appSession?.currentUser;
  if(!runtime?.isCurrent?.() || !scope?.tenantId || !scope.principalId || !scope.permissionRevision || !scope.sessionId ||
    !Number.isFinite(runtime.expiresAtMs) || Date.now() >= runtime.expiresAtMs || user?.accountType !== 'employee' ||
    user.companyId !== scope.tenantId || user.firebaseUid !== scope.principalId || runtime.appSession.currentCompany?.id !== scope.tenantId) throw fault('permission-denied','Delivery session closed');
  if(runtime.appSession.sourceProfile === 'native-isolation-v1') throw fault('source-unavailable','Legacy delivery source unsupported by native profile');
}
export function deliveryReadAccess(runtime,directory,source='deliveryReports') {
  assertDeliverySession(runtime);
  const spec=directory?.sources?.[source];
  if(typeof directory?.page !== 'function' || typeof directory?.lookup !== 'function' || !spec ||
    !Array.isArray(spec.requiredCapabilities) || !spec.requiredCapabilities.includes('home.read')) throw fault('source-unavailable','Approved delivery directory specification missing');
  if(!spec.requiredCapabilities.every(cap=>runtime.capabilities?.includes(cap))) throw fault('permission-denied','Delivery capability denied');
}
function validateHead(runtime,metadata,source,checkpoint) {
  const cp=metadata?.checkpoint;
  if(metadata?.source !== source || metadata?.serverConfirmedOnly !== true || metadata?.financialCalculationAllowed !== false ||
    metadata?.timeZone !== 'Asia/Ho_Chi_Minh' || !cp?.generation || cp.sourceProfile !== 'legacy-v1' || !Number.isSafeInteger(cp.seq) || cp.seq < 0 ||
    !Number.isFinite(cp.capturedAt) || !/^\d{4}-\d{2}-\d{2}$/.test(cp.dayKey || '') ||
    !['tenantId','principalId','permissionRevision','sessionId'].every(key=>cp[key] === runtime.scope[key]) ||
    (checkpoint && JSON.stringify(checkpoint) !== JSON.stringify(cp))) throw fault('stale-checkpoint','Delivery checkpoint mismatch');
}
function validateRows(runtime,rows,limit=DELIVERY_PAGE_SIZE) {
  if(!Array.isArray(rows) || rows.length > limit) throw fault('invalid-data','Unbounded delivery directory result');
  for(const row of rows) if(!row?.id || !row.document || row.document.companyId !== runtime.scope.tenantId ||
    (row.document.id && row.document.id !== row.id) || row.state !== 'SERVER_CONFIRMED') throw fault('permission-denied','Delivery row scope changed');
}
export async function readOfflineDeliveryPage({runtime,directory,options={}}) {
  deliveryReadAccess(runtime,directory);
  const result=await directory.page('deliveryReports',{...options,limit:DELIVERY_PAGE_SIZE});
  deliveryReadAccess(runtime,directory);validateHead(runtime,result.metadata,'deliveryReports');validateRows(runtime,result.items);
  if(result.hasMore && typeof result.nextCursor !== 'string') throw fault('invalid-data','Missing delivery cursor');
  return result;
}
async function lookup(runtime,directory,source,ids,checkpoint) {
  deliveryReadAccess(runtime,directory,source);
  const result=await directory.lookup(source,ids,{checkpoint});
  deliveryReadAccess(runtime,directory,source);validateHead(runtime,result.metadata,source,checkpoint);validateRows(runtime,result.items);
  if(result.items.some(row=>!ids.includes(row.id))) throw fault('invalid-data','Unrelated delivery record');
  return result;
}
export async function readOfflineDeliveryDetail({runtime,directory,id,checkpoint,orderCursor=null}) {
  if(typeof id !== 'string' || !id || id.length > 256) throw fault('invalid-argument','Invalid delivery report');
  const selected=await lookup(runtime,directory,'deliveryReports',[id],checkpoint),report=selected.items[0];
  if(!report) return {report:null,dispatch:null,orders:[],ordersState:'unknown',metadata:selected.metadata};
  let dispatch=null,dispatchState='not-linked',orders=[],ordersState='unknown',nextOrderCursor=null;
  const dispatchId=report.document.dispatchId || report.document.warehouseDispatchId;
  if(dispatchId) {
    try {const result=await lookup(runtime,directory,'warehouseDispatches',[dispatchId],checkpoint);dispatch=result.items[0] || null;dispatchState=dispatch?'found':'missing';}
    catch(error) {if(error.code!=='source-unavailable' && error.code!=='permission-denied') throw error;dispatchState='unavailable';}
  }
  const orderId=report.document.orderId || dispatch?.document.orderId;
  if(orderId) {
    try {const result=await lookup(runtime,directory,'orders',[orderId],checkpoint);orders=result.items;ordersState=orders.length?'found':'missing';}
    catch(error) {if(error.code!=='source-unavailable' && error.code!=='permission-denied') throw error;ordersState='unavailable';}
  } else if(dispatchId && typeof directory.deliveryOrders === 'function') {
    try {
      deliveryReadAccess(runtime,directory,'orders');
      const result=await directory.deliveryOrders(dispatchId,{checkpoint,limit:DELIVERY_PAGE_SIZE,cursor:orderCursor});
      deliveryReadAccess(runtime,directory,'orders');validateHead(runtime,result.metadata,'orders',checkpoint);validateRows(runtime,result.items);
      if(result.metadata.relation?.kind!=='dispatch-orders' || result.metadata.relation.dispatchId!==dispatchId) throw fault('invalid-data','Unproven delivery order relation');
      if(result.hasMore && typeof result.nextCursor !== 'string') throw fault('invalid-data','Missing related order cursor');
      orders=result.items;ordersState=orders.length?'found':'missing';nextOrderCursor=result.hasMore?result.nextCursor:null;
    } catch(error) {if(error.code!=='source-unavailable' && error.code!=='permission-denied') throw error;ordersState='unavailable';}
  }
  // Re-check the original report after all related reads; revocation/checkpoint
  // change must not publish a mixed-scope or mixed-generation detail.
  await lookup(runtime,directory,'deliveryReports',[id],checkpoint);
  return {report,dispatch,dispatchState,orders,ordersState,nextOrderCursor,metadata:selected.metadata};
}

export const storedDeliveryValue=value=>value === null || value === undefined || value === '' ? 'Chưa ghi nhận' : typeof value === 'string' || typeof value === 'number' && Number.isFinite(value) ? String(value) : 'Dữ liệu không hợp lệ';
export function deliveryWeightStatus(record) {
  return ({matched:'Khớp',short:'Lệch',over:'Lệch',not_measured:'Chưa nhập kg',reported:'Đã ghi báo cáo'})[record.status] || record.status || 'Chưa ghi trạng thái cân';
}
export function deliveryMovementStatus(record) {
  const status=record.deliveryStatus || record.trackingStatus || record.fulfillmentStatus;
  if(!status) return 'Chưa ghi trạng thái giao';
  return resolveWarehouseDispatchDeliveryStatus({deliveryStatus:status}).label;
}
export function deliveryDriverLabel(record,employees=[]) {
  const id=record.assignedDriverId || record.driverId || record.deliveryDriverId || record.driverEmployeeId;
  return record.assignedDriverNameSnapshot || record.driverNameSnapshot || record.assignedDriverName || record.driverName ||
    (id ? employees.find(employee=>employee.id===id)?.name || id : 'Chưa ghi tài xế trên phiếu');
}
export function deliveryDateRange(from='',through='') {
  const valid=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  if((from&&!valid(from))||(through&&!valid(through))||(from&&through&&from>through)) throw fault('invalid-argument','Invalid delivery date range');
  const to=through?new Date(Date.parse(through+'T00:00:00Z')+86400000).toISOString().slice(0,10):null;
  if(to&&!valid(to)) throw fault('invalid-argument','Delivery date range overflow');
  return {from:from||null,to};
}
export function deliveryReadError(error) {
  if(error?.code==='permission-denied'||error?.code==='unauthenticated') return 'Phiên hoặc quyền xem giao hàng đã thay đổi. Vui lòng mở lại khu vực làm việc.';
  if(error?.code==='source-unavailable') return 'Nguồn báo cáo giao hàng chưa được kết nối với bộ đọc Offline đã cấp quyền của phiên này.';
  if(error?.code==='stale-checkpoint') return 'Nguồn giao hàng đã đổi hoặc chưa hoàn tất. Hãy tải lại từ trang đầu.';
  return 'Chưa đọc được báo cáo giao hàng đã lưu. Hãy thử tải lại danh sách.';
}
