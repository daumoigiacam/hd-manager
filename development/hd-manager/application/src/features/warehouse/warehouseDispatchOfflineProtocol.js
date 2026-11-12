import {canonicalStockCount} from './stockCountProtocol.js';
import {parseLooseQuantityValue,normalizeLeadingLabel,capitalizeFirst} from './stockCountProtocol.js';
import {parseLooseMoneyValue} from './warehouseImportOriginalPlan.js';
import {originalDispatchCreate,originalDispatchUpdate,originalDispatchArchive} from './warehouseDispatchOriginalPlan.js';
import {coordinateDispatchBilling} from './coordinateDispatchBilling.js';
import {getCustomerBranchProductConfigSource} from './dispatchOriginalBranchRules.js';
import {resolveCustomerProductBillingConfiguration,getCustomerDisplayName,normalizeCustomerBranches,isEmployeeDeliveryParticipant} from './dispatchOriginalCustomerRules.js';
import * as billing from '../../services/customerProductBilling.js';
import {normalizeProductPricingUnit} from '../../services/productPricingUnits.js';
import {businessDayKey} from '../../utils/businessDate.js';
export const dispatchToday=businessDayKey;
export {productStockBalance,measureQuantity} from '../../utils/productMeasures.js';
export {getWarehouseDispatchIds} from '../../utils/warehouseDispatchOrders.js';
import {DISPATCH_RULES,DISPATCH_HISTORY_CAP,DISPATCH_OUTSIDE_CAP} from './warehouseDispatchAccess.js';
export {DISPATCH_RULES,DISPATCH_HISTORY_CAP,DISPATCH_OUTSIDE_CAP} from './warehouseDispatchAccess.js';
export const canonicalDispatch=canonicalStockCount;
export const dispatchIdentifier=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(v);
export const dispatchFail=(message,code='dispatch-unsupported-contract')=>{throw Object.assign(Error(message),{code});};
export function plainDispatch(v){
 const check=x=>{if(x===null||['string','boolean'].includes(typeof x))return;if(typeof x==='number'&&Number.isFinite(x))return;if(Array.isArray(x)){x.forEach(check);return;}if(x&&typeof x==='object'){for(const [k,v]of Object.entries(x)){if(/(password|token|secret|apikey)$/i.test(k))dispatchFail('Nguồn chứa trường bí mật ngoài giao thức.');check(v);}return;}dispatchFail('Cần chứng từ JSON đầy đủ, không suy dữ liệu lịch sử.');};
 check(v);return JSON.parse(JSON.stringify(v));
}
export function dispatchRevision(doc){const n=doc?.offlineRevision??0;if(!Number.isSafeInteger(n)||n<0||n>=Number.MAX_SAFE_INTEGER)dispatchFail('Phiên bản phiếu xuất không hợp lệ.');return n;}
export function assertLegacyDispatch(doc,tenant,id){
 if(doc===null)return;
 plainDispatch(doc);
 if(!doc||Array.isArray(doc)||doc.id!==id||doc.companyId!==tenant||doc.__pendingFirebaseSync||doc.readOnlyLedger||doc.nativeModel||doc.sourceArchiveSha256||doc.sourceSystem==='hd-connect-vps'||['inventoryOperationId','inventoryOperationVersion','inventoryMovements','ledgerId','stockLedgerId','inventoryLedgerId','inventoryTransactionId','ledgerTransactionId','inventoryCommittedAt'].some(k=>doc[k]!==undefined))dispatchFail('Phiếu sổ kho/VPS cần hợp đồng đảo sổ gốc; không sửa/lưu trữ một phần.');
 // Even items:[] overrides scalar fields in the original stock calculator.
 // Such a historical shape needs its own explicit reconciliation contract.
 if(doc.items!==undefined&&doc.items!==null||['lines','products'].some(k=>doc[k]?.length)||['linkedOrderId','orderId','invoiceId','deliveryReportId','sourceOrderRequestId','orderRequestId','requestId','sourceRequestId','sourceOrderRequestRowKey','orderRequestRowKey','requestRowKey'].some(k=>doc[k]))dispatchFail('Phiếu cấu trúc dòng hoặc gắn đơn đặt/hóa đơn/giao hàng cần hợp đồng cập nhật quan hệ và đối soát đầy đủ.');
 if(!doc.isOutsideOrderRequest&&!doc.createdWithoutOrderRequest&&!doc.sourceOrderRequestMissing&&!String(doc.sourceType||'').endsWith('_without_order_request'))dispatchFail('Nguồn chưa xác định ngoài đơn đặt; cần luồng khớp đơn đặt gốc.');
 dispatchRevision(doc);
}
const fields=['customerId','productId','branchId','pieceCount','quantityUnit','weightKg','assignedDriverId','note','date','weightEntries'];
export function buildDispatchValues(draft){
 if(!draft||Array.isArray(draft)||typeof draft!=='object'||Object.keys(draft).some(k=>!fields.includes(k)))dispatchFail('Chỉ hỗ trợ phiếu một dòng ngoài đơn đặt; không nhận trường giá/quan hệ do client tự đặt.');
 for(const k of ['customerId','productId'])if(!dispatchIdentifier(draft[k]))dispatchFail('Cần khách hàng và sản phẩm hiện có.','invalid-argument');
 for(const k of ['branchId','assignedDriverId'])if(draft[k]&&!dispatchIdentifier(draft[k]))dispatchFail('Mã chi nhánh/người giao không hợp lệ.','invalid-argument');
 if(typeof draft.quantityUnit!=='string'||!draft.quantityUnit.trim())dispatchFail('Ghi rõ đơn vị thực tế; không đoán đơn vị lịch sử.','invalid-argument');
 const pieceCount=parseLooseQuantityValue(draft.pieceCount),weightKg=parseLooseQuantityValue(draft.weightKg);
 if(![pieceCount,weightKg].every(n=>Number.isFinite(n)&&n>=0&&n<=1e12)||pieceCount<=0&&weightKg<=0)dispatchFail('Cần số lượng hoặc khối lượng dương hợp lệ.','invalid-argument');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(draft.date||'')||businessDayKey(Date.parse(draft.date+'T12:00:00+07:00'))!==draft.date)dispatchFail('Ngày xuất không hợp lệ.','invalid-argument');
 if(draft.weightEntries!==undefined&&(!Array.isArray(draft.weightEntries)||draft.weightEntries.length>100||draft.weightEntries.some(x=>!Number.isFinite(Number(x))||Number(x)<0)))dispatchFail('Lần cân không hợp lệ.','invalid-argument');
 const note=String(draft.note||'').trim();if(note.length>4000||draft.quantityUnit.length>40)dispatchFail('Nội dung phiếu vượt giới hạn.','invalid-argument');
 const weightEntries=(draft.weightEntries||[]).map(Number).filter(n=>n>0);
 if(weightEntries.length&&Math.abs(weightEntries.reduce((a,b)=>a+b,0)-weightKg)>0.0001)dispatchFail('Tổng các lần cân phải bằng khối lượng thực tế.','invalid-argument');
 return {customerId:draft.customerId,productId:draft.productId,branchId:draft.branchId||'',pieceCount,quantityUnit:normalizeLeadingLabel(draft.quantityUnit),weightKg,assignedDriverId:draft.assignedDriverId||'',note,date:draft.date,weightEntries};
}
export function dispatchDraftFromDocument(d){
 // Refuse unknown historical units/prices instead of silently changing them.
 if(!d.quantityUnit||!d.billingUnit||typeof d.unitPrice!=='number'||d.unitPrice<=0||d.billingSnapshotVersion!==1)dispatchFail('Thiếu snapshot đơn vị/giá lịch sử; cần trình sửa đầy đủ.');
 return buildDispatchValues({customerId:d.customerId,productId:d.productId,branchId:d.branchId||d.customerBranchId||'',pieceCount:d.pieceCount??d.quantity,quantityUnit:d.quantityUnit,weightKg:d.weightKg,assignedDriverId:d.assignedDriverId||d.driverId||'',note:d.note||'',date:d.date,weightEntries:d.weightEntries||[]});
}
export async function planDispatch(base,kind,values,{id,tenantId,employeeId,editedAt,mutationId,customer,product,driver=null}){
 if(!DISPATCH_RULES[kind]||!dispatchIdentifier(id)||!dispatchIdentifier(employeeId)||!Number.isFinite(Date.parse(editedAt)))dispatchFail('Định danh/thời gian phiếu xuất không hợp lệ.');
 assertLegacyDispatch(base,tenantId,id);
 if(kind==='warehouseDispatch.create'&&base!==null||kind!=='warehouseDispatch.create'&&!base)dispatchFail('Bản nguồn phiếu xuất không hợp lệ.');
 if(base?.isArchived)dispatchFail('Phiếu đã lưu trữ; cần luồng khôi phục riêng.');
 const writes=[],capture=async(collectionName,documentId,payload,options)=>{writes.push({collectionName,documentId,payload,options});return {queued:true};};
 const context={myCompanyId:tenantId,customers:customer?[customer]:[],products:product?[product]:[],rawWarehouseDispatches:base?[base]:[],parseLooseQuantityValue,parseLooseMoneyValue,normalizeLeadingLabel,normalizeLookupText:v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(),normalizeProductPricingUnit,isSameBillingUnit:billing.isSameBillingUnit,getTodayString:()=>values?.date,getEntityTimestamp:()=>0,pendingFirebaseWritesRef:{current:[]},enqueuePendingFirebaseWrite:w=>{writes.push(w);return {queued:true};},setRawWarehouseDispatches:()=>{},rememberRecentLocalWrite:()=>{},requireSharedWriteConfirmation:async()=>{},saveDataDocument:capture,currentUser:{id:employeeId},editedAt};
 if(kind==='warehouseDispatch.archive')await originalDispatchArchive(id,context);
 else{
  const v=buildDispatchValues(values);
  if(!customer||!product||customer.id!==v.customerId||product.id!==v.productId||[customer,product].some(x=>x.companyId!==tenantId||x.isArchived))dispatchFail('Quan hệ khách hàng/sản phẩm không hợp lệ.','permission-denied');
  if(v.assignedDriverId&&(!driver||driver.id!==v.assignedDriverId||driver.companyId!==tenantId||driver.isArchived||!isEmployeeDeliveryParticipant(driver)))dispatchFail('Người giao không thuộc công ty hiện tại.','permission-denied');
  if(base){dispatchDraftFromDocument(base);if(base.customerId!==v.customerId||base.productId!==v.productId||(base.branchId||base.customerBranchId||'')!==v.branchId||base.date!==v.date)dispatchFail('Đổi khách/sản phẩm/chi nhánh/ngày cần hợp đồng chuyển quan hệ và tồn kho riêng.');}
  const branch=v.branchId?normalizeCustomerBranches(customer,[product]).find(x=>x.id===v.branchId):null;
  if(v.branchId&&!branch)dispatchFail('Chi nhánh không thuộc khách hàng.');
  const snapshot=coordinateDispatchBilling({customer,product,existingRecord:base,actualQuantity:v.pieceCount,actualUnit:v.quantityUnit,actualWeightKg:v.weightKg,branchId:v.branchId},{products:[product],getCustomerBranchProductConfigSource,resolveCustomerProductBillingConfiguration,...billing});
  if(!snapshot.billingSnapshotValid)dispatchFail('Cấu hình đơn vị/giá không hợp lệ: '+snapshot.billingSnapshotError,'invalid-argument');
  const payload={...snapshot,clientMutationId:mutationId,createdAt:editedAt,date:v.date,customerId:customer.id,customerNameSnapshot:getCustomerDisplayName(customer)||customer.name,productId:product.id,productNameSnapshot:product.name,branchId:v.branchId,branchName:branch?.name||'',branchAddress:branch?.address||'',customerBranchId:v.branchId,customerBranchName:branch?.name||'',customerBranchAddress:branch?.address||'',pieceCount:v.pieceCount,weightKg:v.weightKg,weightEntries:v.weightEntries,assignedDriverId:v.assignedDriverId,driverId:v.assignedDriverId,assignedDriverNameSnapshot:driver?.name||'',driverNameSnapshot:driver?.name||'',note:capitalizeFirst(v.note),sourceOrderRequestId:'',sourceOrderRequestRowKey:'',sourceOrderRequestDate:v.date,price:snapshot.unitPrice,sourceOrderRequestUnitPrice:snapshot.unitPrice,orderRequestUnitPrice:snapshot.unitPrice,requestUnitPrice:snapshot.unitPrice,isOutsideOrderRequest:true,createdWithoutOrderRequest:true,sourceOrderRequestMissing:true,sourceType:base?.sourceType?.includes('voice')?'voice_without_order_request':'manual_without_order_request'};
  if(kind==='warehouseDispatch.create')await originalDispatchCreate(employeeId,payload,{...context,rawWarehouseDispatches:[]});
  else{delete payload.createdAt;delete payload.clientMutationId;await originalDispatchUpdate(id,payload,employeeId,context);}
 }
 if(writes.length!==1||writes[0].collectionName!=='warehouseDispatches'||writes[0].documentId!==id)dispatchFail('Kế hoạch gốc không khớp phiếu xuất.');
 const document={...(writes[0].options?.merge?base:{}),...writes[0].payload,offlineRevision:dispatchRevision(base)+1};
 assertLegacyDispatch(document,tenantId,id);return plainDispatch(document);
}
export function validateDispatchPayload(kind,p){
 if(!DISPATCH_RULES[kind]||!p||Object.keys(p).sort().join(',')!=='base,baseFingerprint,baseRevision,editedAt,employeeId,planned,resolvesConflictId,values,version'||p.version!==1||!dispatchIdentifier(p.employeeId)||!Number.isSafeInteger(p.baseRevision)||p.baseRevision!==dispatchRevision(p.base)||!/^[a-f0-9]{64}$/.test(p.baseFingerprint)||!/^\d{4}-\d{2}-\d{2}T/.test(p.editedAt)||!Number.isFinite(Date.parse(p.editedAt))||!(p.resolvesConflictId===null||dispatchIdentifier(p.resolvesConflictId)))dispatchFail('Payload phiếu xuất không hợp lệ.','invalid-argument');
 if(kind==='warehouseDispatch.create'&&p.base!==null||kind!=='warehouseDispatch.create'&&!p.base||kind==='warehouseDispatch.archive'&&p.values!==null)dispatchFail('Bản CAS phiếu xuất không hợp lệ.');
 if(kind!=='warehouseDispatch.archive'&&canonicalDispatch(buildDispatchValues(p.values))!==canonicalDispatch(p.values))dispatchFail('Giá trị phiếu xuất chưa chuẩn hóa.');
 plainDispatch(p);if(JSON.stringify(p).length>512000)dispatchFail('Phiếu xuất vượt giới hạn.');return p;
}
