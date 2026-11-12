import {createDeliverySavePlan} from '../../utils/deliverySavePlan.js';
import {resolveTransactionBillingSnapshot} from '../../services/customerProductBilling.js';
import {createOriginalDeliveryPlanners} from './deliveryOriginalPlans.js';
import {originalDeliveryForm} from './deliveryOriginalForm.js';
import {originalDeliveryFinancialOperations} from './deliveryOriginalFinancialForm.js';
import {parseInputCurrency,parseLooseQuantityValue} from './deliveryOriginalRules.js';

export const DELIVERY_RULES=Object.freeze({
 'deliveryReport.create':{capability:'deliveryReports.create',action:'create_delivery_report'},
 'deliveryReport.update':{capability:'deliveryReports.update',action:'edit_delivery_report'},
 'deliveryReport.archive':{capability:'deliveryReports.archive',action:'delete_delivery_report'},
});
export const DELIVERY_FEATURE_CAPS=Object.freeze({income:'deliveryReports.income',expense:'deliveryReports.expense',returns:'deliveryReports.returns',addCost:'deliveryReports.assetCosts.create',editCost:'deliveryReports.assetCosts.update'});
export const DELIVERY_READ_CAPS=Object.freeze(['home.read','home.quick-report.read','home.cashflow.read','home.orders.read','orders.read','home.dispatches.read','home.stock.read','home.debt.read','customers.read']);
export const DELIVERY_CONTEXT_SOURCES=Object.freeze(['companies','customers','products','warehouseDispatches','deliveryReports','orders','payments','expenses','assets','assetCostLogs']);
export const DELIVERY_SLOTS=Object.freeze({report:'deliveryReports',dispatch:'warehouseDispatches',customer:'customers',product:'products',company:'companies',order:'orders',expense:'expenses',orderExpense:'expenses',costExpense:'expenses',asset:'assets',cost:'assetCostLogs'});
export const deliveryId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(v);
export const deliveryFail=(message,code='delivery-unsupported-contract')=>{throw Object.assign(Error(message),{code});};
export function canonicalDelivery(v){return v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonicalDelivery).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalDelivery(v[k])).join(',')+'}';}
// Same feed projection as functions/offlineHomeFeed.mjs. Server uses this on
// read snapshots only; original records are not rewritten/redacted in storage.
export const deliveryFeedClean=value=>JSON.parse(JSON.stringify(value,(key,item)=>/(password|token|secret|apikey|map.*key)$/i.test(key)?undefined:item));
export function deliveryPlain(value){
 const visit=v=>{if(v===null||typeof v==='string'||typeof v==='boolean')return;if(typeof v==='number'&&Number.isFinite(v))return;if(Array.isArray(v)){v.forEach(visit);return;}if(v&&Object.getPrototypeOf(v)===Object.prototype){for(const [k,x]of Object.entries(v)){if(['__proto__','prototype','constructor'].includes(k)||/(password|token|secret|apikey|map.*key)$/i.test(k))deliveryFail('Nguồn ngoài hợp đồng JSON an toàn.');visit(x);}return;}deliveryFail('Cần chứng từ JSON đã hoàn tất, không đoán dữ liệu lịch sử.');};visit(value);return JSON.parse(JSON.stringify(value));
}
export function deliveryRevision(doc){const n=doc?.offlineRevision??0;if(!Number.isSafeInteger(n)||n<0||n>=Number.MAX_SAFE_INTEGER)deliveryFail('Phiên bản báo cáo không hợp lệ.');return n;}
export function assertDeliveryDocument(doc,tenant,id){if(doc===null)return;deliveryPlain(doc);if(!doc||doc.id!==id||doc.companyId!==tenant||doc.isArchived||doc.__pendingFirebaseSync||doc.__pendingLocalSync||doc.sourceArchiveSha256||doc.nativeModel||doc.readOnlyLedger||doc.sourceSystem==='hd-connect-vps'||['inventoryOperationId','stockLedgerId','inventoryLedgerId','ledgerTransactionId'].some(k=>doc[k]!==undefined))deliveryFail('Chứng từ lịch sử/VPS/sổ kho cần quy trình đối soát gốc.');}
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const text=(v,max=2000)=>{if(typeof v!=='string'||v.length>max)deliveryFail('Trường nhập giao hàng không hợp lệ.');return v;};
const measure=v=>{if(!['string','number'].includes(typeof v)||String(v).trim()===''||String(v).length>48||!/^(?:\d+(?:[.,]\d+)?)$/.test(String(v).trim()))deliveryFail('Nhập số đo rõ ràng; không tự suy đơn vị hoặc số lượng.');const n=parseLooseQuantityValue(v);if(!Number.isFinite(n))deliveryFail('Số đo không hợp lệ.');return n;};
const money=v=>{if(!['string','number'].includes(typeof v)||String(v).trim()===''||String(v).length>48||!/^[0-9.,\s]+$/.test(String(v)))deliveryFail('Nhập số tiền VND rõ ràng.');const n=parseInputCurrency(v);if(!Number.isSafeInteger(n)||n<0)deliveryFail('Số tiền vượt giới hạn VND chính xác.');return n;};
export function deliveryValues(input){
 const fields=['dispatchId','date','actualWeight','actualQuantity','actualQuantityUnit','actualPackageCount','actualPackageUnit','note','collectedAmount','collectedMethod','deliveryExpenseAmount','deliveryExpenseCategory','expenseNote','assetId','kmAt','liters','fuelUnitPrice','returnWeightKg','returnQuantity','returnQuantityUnit','shippingAmount','shippingNote'];
 if(!input||Array.isArray(input)||Object.keys(input).some(k=>!fields.includes(k))||!deliveryId(input.dispatchId)||!date(input.date))deliveryFail('Chọn phiếu xuất và ngày nghiệp vụ hợp lệ.');
 const v={...input};for(const key of ['actualWeight','actualQuantity','actualPackageCount']){measure(v[key]);v[key]=String(v[key]);}
 for(const key of ['actualQuantityUnit','actualPackageUnit','returnQuantityUnit']){text(v[key],40);if(!v[key].trim())deliveryFail('Phải ghi rõ đơn vị thực tế/đóng gói/hàng trả.');}
 for(const key of ['kmAt','liters','returnWeightKg','returnQuantity'])v[key]=measure(v[key]);for(const key of ['collectedAmount','deliveryExpenseAmount','fuelUnitPrice','shippingAmount'])v[key]=money(v[key]);
 for(const key of ['note','expenseNote','shippingNote'])text(v[key]);text(v.deliveryExpenseCategory,200);if(!['Tiền mặt','Chuyển khoản'].includes(v.collectedMethod))deliveryFail('Hình thức thu không thuộc giao diện gốc.');if(v.assetId!==''&&!deliveryId(v.assetId))deliveryFail('Mã tài sản không hợp lệ.');
 if(v.deliveryExpenseAmount>0&&!v.deliveryExpenseCategory.trim())deliveryFail('Nhập khoản chi giao hàng.');return deliveryPlain(v);
}
export const deliveryFeatures=caps=>Object.fromEntries(Object.entries(DELIVERY_FEATURE_CAPS).map(([key,cap])=>[key,caps.includes(cap)]));
export const DELIVERY_MEMO_FIELDS=Object.freeze(['id','companyId','customerId','isArchived','orderId','orderCode','code','invoiceCode','paymentCode','paymentOrderCode','payosOrderCode','referenceCode','transferCode','matchedOrderCode','createdAt','updatedAt','timestamp','receivedAt','sentAt','approvedAt','paidAt','lastMessageAt','lastActivityAt','date']);
export function deliveryMemoRows(rows){return rows.map(row=>Object.fromEntries(DELIVERY_MEMO_FIELDS.filter(k=>row[k]!=null).map(k=>[k,row[k]]))).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);}
export function deliveryUnitWitness(record,product){
 const ordered=record?.orderedUnit||record?.orderUnit,actual=record?.actualQuantityUnit||record?.actualUnit||record?.quantityUnit,billing=record?.billingUnit||record?.pricingUnit;
 if(!ordered||!actual||!billing||record.orderedUnit&&record.orderUnit&&record.orderedUnit!==record.orderUnit||record.billingUnit&&record.pricingUnit&&record.billingUnit!==record.pricingUnit||!Number.isFinite(record.unitPrice)||record.unitPrice<=0||!Number.isFinite(record.billingQuantity??record.pricingQuantity)||(record.billingQuantity??record.pricingQuantity)<=0)deliveryFail('Thiếu snapshot đơn vị đặt/thực tế/tính giá hoặc đơn giá. Không sửa bản lịch sử không rõ đơn vị.');
 const frozen=resolveTransactionBillingSnapshot({record,product});if(!frozen.hasFrozenPricing||frozen.billingSnapshotValid===false||frozen.pricingPendingActual)deliveryFail('Snapshot tính giá gốc chưa đầy đủ.');return {ordered,actual,billing,frozen};
}
export function validateDeliveryPayload(kind,p){
 if(!DELIVERY_RULES[kind]||!p||Object.keys(p).some(k=>!['version','base','baseFingerprint','baseRevision','values','editedAt','employeeId','features','planned','resolvesConflictId','memoFingerprint'].includes(k))||p.version!==1||!deliveryId(p.employeeId)||!/^[a-f0-9]{64}$/.test(p.baseFingerprint||'')||!Number.isSafeInteger(p.baseRevision)||p.baseRevision<0||typeof p.editedAt!=='string'||!Number.isFinite(Date.parse(p.editedAt))||p.resolvesConflictId!==null&&!deliveryId(p.resolvesConflictId))deliveryFail('Hợp đồng lệnh giao hàng không hợp lệ.');
 deliveryPlain(p.base);deliveryPlain(p.planned);if(p.baseRevision!==deliveryRevision(p.base.report))deliveryFail('CAS gốc giao hàng không khớp.');if(kind==='deliveryReport.archive'){if(p.values!==null)deliveryFail('Lưu trữ không ghi đè bản nháp.');}else if(canonicalDelivery(deliveryValues(p.values))!==canonicalDelivery(p.values))deliveryFail('Bản nháp chưa chuẩn hóa.');
 if(!p.features||Object.keys(p.features).length!==Object.keys(DELIVERY_FEATURE_CAPS).length||Object.entries(p.features).some(([k,v])=>!Object.hasOwn(DELIVERY_FEATURE_CAPS,k)||typeof v!=='boolean'))deliveryFail('Thiếu cờ quyền giao hàng có chữ ký.');
 if(p.memoFingerprint!==null&&!/^[a-f0-9]{64}$/.test(p.memoFingerprint))deliveryFail('Thiếu dấu nguồn đối chiếu mã đơn.');return p;
}
export async function planDelivery(kind,base,values,{id,tenantId,employee,editedAt,mutationId,features,memoOrders=[],discoverTargets=false}){
 const employeeId=employee.id;if(!DELIVERY_RULES[kind]||!deliveryId(id)||!deliveryId(employeeId)||!deliveryId(mutationId))deliveryFail('Định danh giao hàng không hợp lệ.');
 assertDeliveryDocument(base.report,tenantId,id);if(kind==='deliveryReport.create'&&base.report||kind!=='deliveryReport.create'&&!base.report)deliveryFail('Không tái tạo hoặc ghi đè báo cáo thiếu nguồn.');
 for(const slot of ['dispatch','customer','product','order','expense','cost','orderExpense','costExpense','asset'])if(base[slot])assertDeliveryDocument(base[slot],tenantId,base[slot].id);
 for(const [name,doc]of Object.entries(base).filter(([k])=>!['targets','report','employee'].includes(k))){if(doc===null)continue;if(name==='relations')continue;if(Array.isArray(doc))continue;if(doc.companyId!==tenantId&&!(name==='company'&&doc.id===tenantId))deliveryFail('Nguồn giao hàng khác công ty.','permission-denied');}
 if(base.report&&['accepted','rejected','lost_charged'].includes(base.report.resolutionStatus))deliveryFail('Báo cáo đã xử lý lệch cân cần đúng lệnh giải quyết gốc.');
 const report=base.report,writePlan=[],plannerContext={employeeId,tenantId,editedAt,company:base.company,customer:base.customer,product:base.product,dispatch:base.dispatch,base:report,order:base.order,orders:memoOrders,expenses:[base.expense,base.orderExpense,base.costExpense].filter(Boolean),assets:[base.asset].filter(Boolean),assetCostLogs:[base.cost].filter(Boolean),day:values?.date||report.date},planners=createOriginalDeliveryPlanners(plannerContext);
 if(kind==='deliveryReport.archive')await planners.editReport(id,{isArchived:true,archivedAt:editedAt,archivedByEmpId:employeeId},writePlan);
 else{
  const v=deliveryValues(values);if(!base.dispatch||base.dispatch.id!==v.dispatchId||base.dispatch.customerId!==base.customer?.id||base.dispatch.productId!==base.product?.id||base.dispatch.isArchived||base.customer.isArchived||base.product.isArchived)deliveryFail('Liên kết phiếu xuất/khách/sản phẩm chưa hợp lệ.');
  const source=report||base.dispatch,units=deliveryUnitWitness(source,base.product);if(v.actualQuantityUnit!==units.actual)deliveryFail('Không đổi ngầm đơn vị thực tế của snapshot.');
  if(report&&(v.dispatchId!==report.dispatchId||v.collectedAmount!==(report.collectedAmount||0)||v.collectedMethod!==(report.collectedMethod||'Tiền mặt')))deliveryFail('Đổi phiếu xuất/tiền thu cũ cần quy trình thanh toán gốc.');
  if(v.collectedAmount>0&&!features.income||v.deliveryExpenseAmount>0&&!features.expense)deliveryFail('Thiếu quyền thu/chi giao hàng.','permission-denied');
  if(report&&v.deliveryExpenseAmount!==(report.deliveryExpenseAmount||0)&&!features.expense)deliveryFail('Đổi hoặc bỏ khoản chi cần quyền ghi chi hiện tại.','permission-denied');
  if(report&&(report.returnQuantity>0||report.returnWeightKg>0)&&!features.returns)deliveryFail('Sửa hàng trả cần quyền báo hàng trả hiện tại.','permission-denied');
  if(base.cost&&base.expense&&v.deliveryExpenseAmount===0){
   if(!features.expense||!features.editCost)deliveryFail('Bỏ khoản chi và nhật ký tài sản cần đủ quyền hiện tại.','permission-denied');
   if(!report||base.expense.sourceType!=='driver_delivery_expense'||base.cost.sourceType!=='delivery_report_expense'||!(report.deliveryExpenseAmount>0)||report.expenseId!==base.expense.id||report.assetCostLogId!==base.cost.id||base.cost.expenseId!==base.expense.id||base.expense.relatedDeliveryReportId!==report.id||base.cost.relatedDeliveryReportId!==report.id||base.cost.assetId!==base.asset?.id||base.expense.assetId!==base.cost.assetId||!base.costExpense||canonicalDelivery(base.costExpense)!==canonicalDelivery(base.expense))deliveryFail('Cần đúng cặp nguồn hoàn tất báo cáo / chi phí / nhật ký; không sửa liên kết lịch sử.');
  }
  if((v.returnQuantity>0||v.returnWeightKg>0||report?.returnPhotoUrl)&&(!features.returns||!base.order))deliveryFail('Hàng trả cần hóa đơn liên kết rõ đơn vị và quyền báo hàng trả.');
  if(base.order&&(v.returnQuantity>0||v.returnWeightKg>0||report?.returnPhotoUrl))for(const line of base.order.items||[]){deliveryUnitWitness(line,base.product);}if(base.order&&(v.returnQuantity>0||v.returnWeightKg>0)&&(!Array.isArray(base.order.items)||!base.order.items.length))deliveryFail('Hóa đơn lịch sử thiếu dòng hàng gốc.');
  if(v.assetId&&(!base.asset||base.asset.id!==v.assetId||base.asset.isArchived))deliveryFail('Tài sản hiện tại chưa hợp lệ.');
  for(const doc of [base.expense,base.costExpense].filter(Boolean))if(!doc.isArchived&&(doc.approvalStatus!=='pending_handover'||doc.handoverStatus!=='pending'))deliveryFail('Phiếu chi đã xác nhận cần quy trình điều chỉnh tài chính gốc.');
  const sourceRow={...source,dispatchId:v.dispatchId,orderedUnit:units.ordered,expectedWeightKg:report?.expectedWeightKg??base.dispatch.weightKg,expectedQuantity:report?.expectedQuantity??base.dispatch.quantity??base.dispatch.pieceCount,expectedQuantityUnit:report?.expectedQuantityUnit??base.dispatch.quantityUnit};
  if(!Number.isFinite(sourceRow.expectedWeightKg)||!Number.isFinite(sourceRow.expectedQuantity)||!sourceRow.expectedQuantityUnit)deliveryFail('Thiếu số đo/đơn vị dự kiến gốc.');
  const form=originalDeliveryForm({...base,base:report,sourceRow,editedAt},v),plan=createDeliverySavePlan(mutationId);
  if(kind==='deliveryReport.create')plan.addReport({...form.payload,id});else plan.editReport(id,form.payload);
  await originalDeliveryFinancialOperations({...base,base:report,plan,reportId:id,firstRow:form.row,employee,employeeId,editedAt,features},v);
  for(const op of plan.operations){if(op.type==='addReport')await planners.addReport(employeeId,op.payload,writePlan);else if(op.type==='editReport')await planners.editReport(op.id,op.payload,writePlan);else if(op.type==='editOrder'){const result=await planners.editOrder(op.id,op.payload,null,writePlan);if(!result?.success)deliveryFail(result?.message||'Không tạo được kế hoạch hóa đơn gốc.');}else if(op.type==='addPayment')await planners.addPayment(op.payload,writePlan);else if(op.type==='addExpense')await planners.addExpense(employeeId,op.payload,writePlan);else if(op.type==='editExpense')await planners.editExpense(op.id,op.payload,writePlan);else if(op.type==='addCost')await planners.addCost(employeeId,op.payload,writePlan);else if(op.type==='editCost'){
    let costPlanner=planners;
    if(v.deliveryExpenseAmount===0&&op.payload?.isArchived===true&&base.cost&&base.expense){
     if(op.id!==base.cost.id)deliveryFail('Nhật ký lưu trữ không khớp cặp nguồn.');
     const prior=writePlan.filter(w=>w.collectionName==='expenses'&&w.documentId===base.expense.id);
     const effective=prior.reduce((doc,w)=>({...doc,...w.payload}),{...base.expense});
     if(!prior.some(w=>w.payload.isArchived===true)||effective.isArchived!==true)deliveryFail('Thiếu ý định lưu trữ khoản chi trước nhật ký.');
     // Immutable CAS bases stay unchanged. Only this original callee sees the
     // preceding explicit archive from the SAME command, so it cannot append
     // a stale active expense patch. No money/unit/date formula is changed.
     costPlanner=createOriginalDeliveryPlanners({...plannerContext,expenses:plannerContext.expenses.map(doc=>doc.id===effective.id?effective:doc)});
    }
    await costPlanner.editCost(op.id,op.payload,employeeId,writePlan);
   }else deliveryFail('Thao tác ngoài kế hoạch giao hàng.');}
 }
 if(!writePlan.length||writePlan.length>40)deliveryFail('Kế hoạch giao hàng vượt giới hạn gốc.');
 const documents={},writes=[];for(const w of writePlan){if(!['deliveryReports','orders','payments','expenses','assetCostLogs'].includes(w.collectionName)||!deliveryId(w.documentId))deliveryFail('Chứng từ ngoài giao thức.');const key=w.collectionName+'/'+w.documentId;if(!Object.hasOwn(base.targets,key)&&!discoverTargets)deliveryFail('Thiếu bản gốc tồn tại/vắng mặt của chứng từ liên quan.');const before=Object.hasOwn(documents,key)?documents[key]:base.targets[key]??null;if(!Object.hasOwn(documents,key)&&before!==null&&!Object.values(base).some(doc=>doc&&typeof doc==='object'&&!Array.isArray(doc)&&doc.id===w.documentId&&canonicalDelivery(doc)===canonicalDelivery(base.targets[key])))deliveryFail('Mã chứng từ mới trùng chứng từ không liên quan.');if(!w.options?.merge&&before!==null)deliveryFail('Mã chứng từ mới đã tồn tại; không ghi đè.');documents[key]={...(w.options?.merge?before||{}:{}),...w.payload};if(w.collectionName==='deliveryReports')Object.assign(documents[key],{offlineRevision:deliveryRevision(report)+1,lastDeliveryCommandId:mutationId});writes.push(w);}
 const document=documents['deliveryReports/'+id];if(!document||document.companyId!==tenantId)deliveryFail('Kế hoạch thiếu báo cáo giao hàng.');
 return deliveryPlain({document,documents,writes});
}
