import {businessDayKey} from '../../utils/businessDate.js';
import {canonicalStockCount} from './stockCountProtocol.js';
import {originalImportCreate,originalImportUpdate,originalImportArchive,parseLooseQuantityValue,parseLooseMoneyValue,normalizeLeadingLabel,buildWarehouseImportMeasureEntries,purchaseAmount,normalizeWarehouseImportSourceType} from './warehouseImportOriginalPlan.js';
export {normalizeLeadingLabel};
export const IMPORT_RULES=Object.freeze({
  'warehouseImport.create':{capability:'warehouseImports.create',action:'create_warehouse_import'},
  'warehouseImport.update':{capability:'warehouseImports.update',action:'edit_warehouse_import'},
  'warehouseImport.archive':{capability:'warehouseImports.archive',action:'delete_warehouse_import'},
}); // Requirements only; this module never issues a grant.
export const canonicalImport=canonicalStockCount;
export const importIdentifier=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(v);
const invalid=message=>{throw Object.assign(Error(message),{code:'invalid-argument'});};
const sensitive=value=>value&&typeof value==='object'&&Object.entries(value).some(([key,v])=>/(password|token|secret|apikey)$/i.test(key)||sensitive(v));
export function plainImport(value){if(value===undefined||sensitive(value))invalid('Nguồn nhập kho chứa trường không thuộc giao thức.');return JSON.parse(JSON.stringify(value));}
export function importRevision(document){const n=document?.offlineRevision??0;if(!Number.isSafeInteger(n)||n<0||n>=Number.MAX_SAFE_INTEGER)invalid('Phiên bản nhập kho không hợp lệ.');return n;}
export function assertImportPair(pair,tenantId,id){
  if(!pair||Object.keys(pair).sort().join(',')!=='document,expense')invalid('Cần cả phiếu nhập và phiếu chi nguồn.');
  plainImport(pair);
  for(const [key,doc]of Object.entries(pair)){
    if(doc===null)continue;
    if(!doc||typeof doc!=='object'||Array.isArray(doc)||doc.companyId!==tenantId||doc.id!==(key==='document'?id:`exp_warehouse_import_${id}`)||doc.readOnlyLedger||doc.sourceSystem==='hd-connect-vps'||doc.nativeModel||doc.sourceArchiveSha256||doc.__pendingFirebaseSync||['ledgerId','stockLedgerId','inventoryLedgerId','ledgerTransactionId','inventoryTransactionId'].some(k=>doc[k]))invalid('Nguồn nhập/chi ngoài phạm vi hoặc cần hợp đồng sổ kho riêng.');
    if(key==='expense'&&doc.sourceWarehouseImportId!==id)invalid('Phiếu chi không thuộc phiếu nhập này.');
    if(key==='expense'&&(doc.sourceType!==undefined?doc.sourceType!=='warehouse_import_purchase':doc.isArchived!==true))invalid('Mã chi phí bị chiếm bởi nguồn khác; không sửa lịch sử.');
  }
  importRevision(pair.document);
  return pair;
}
const fields=['groupName','quantity','totalKg','quantityUnit','purchaseUnit','unitPrice','amount','sourceType','sourceLabel','supplier','supplierCustomerId','supplierPhone','productId','productName','productNameSnapshot','productCode','productBarcode','barcode','date','note','extraMeasures','orderedUnit','pricingUnit'];
export function buildImportValues(draft){
  if(!draft||typeof draft!=='object'||Array.isArray(draft)||Object.keys(draft).some(key=>!fields.includes(key)))invalid('Trường phiếu nhập chưa được hỗ trợ.');
  for(const key of ['quantityUnit','purchaseUnit'])if(typeof draft[key]!=='string'||!draft[key].trim())invalid('Cần ghi rõ đơn vị số lượng và đơn vị nhập; không suy đơn vị lịch sử.');
  const values={...draft,groupName:normalizeLeadingLabel(draft.groupName||''),quantity:parseLooseQuantityValue(draft.quantity),totalKg:parseLooseQuantityValue(draft.totalKg),unitPrice:parseLooseMoneyValue(draft.unitPrice)};
  if(!values.groupName)invalid('Vui lòng chọn nhóm hàng trước khi lưu.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(values.date||'')||!Number.isFinite(Date.parse(values.date+'T12:00:00+07:00'))||businessDayKey(Date.parse(values.date+'T12:00:00+07:00'))!==values.date)invalid('Ngày nghiệp vụ không hợp lệ.');
  if(draft.extraMeasures!==undefined&&(!Array.isArray(draft.extraMeasures)||draft.extraMeasures.length>100||draft.extraMeasures.some(m=>!m||Object.keys(m).some(k=>!['unit','quantity'].includes(k))||typeof m.unit!=='string'||!m.unit.trim())))invalid('Số đo bổ sung cần đơn vị rõ ràng.');
  values.extraMeasures=(draft.extraMeasures||[]).map(m=>({unit:m.unit,quantity:parseLooseQuantityValue(m.quantity)}));
  for(const key of fields)if(key in values&&typeof values[key]==='string'&&values[key].length>(key==='note'?4000:256))invalid('Trường nhập kho vượt giới hạn.');
  for(const key of ['productId','supplierCustomerId'])if(values[key]&&!importIdentifier(values[key]))invalid('Mã sản phẩm/nhà cung cấp không hợp lệ.');
  const measures=buildWarehouseImportMeasureEntries(values);
  if(!measures.length)invalid('Cần nhập ít nhất một chỉ số tồn kho như số con, số kg, số bao hoặc số thùng.');
  // Original product form supplies suggestedAmount explicitly to the App handler;
  // its explicit-amount branch applies parseLooseMoneyValue (including rounding).
  values.amount=parseLooseMoneyValue(draft.amount!=null?draft.amount:purchaseAmount(values,values.purchaseUnit));
  if(![values.quantity,values.totalKg,values.unitPrice,values.amount,...measures.map(m=>m.quantity)].every(n=>Number.isFinite(n)&&n>=0))invalid('Số lượng hoặc số tiền không hợp lệ.');
  if(values.unitPrice>0&&values.amount<=0)invalid(`Vui lòng nhập số lượng theo đơn vị nhập ${values.purchaseUnit} để tính tiền.`);
  values.sourceType=normalizeWarehouseImportSourceType(values.sourceType);
  return plainImport(values);
}
export function applyImportIntent(base,kind,values,{id,tenantId,employeeId,editedAt,mutationId}){
  if(!IMPORT_RULES[kind]||!importIdentifier(id)||!importIdentifier(employeeId)||!/^\d{4}-\d{2}-\d{2}T/.test(editedAt||'')||!Number.isFinite(Date.parse(editedAt)))invalid('Định danh hoặc thời gian nhập kho không hợp lệ.');
  assertImportPair(base,tenantId,id);
  if(kind==='warehouseImport.create'&&(base.document||base.expense))invalid('Phiếu mới đã tồn tại.');
  if(kind!=='warehouseImport.create'&&!base.document)invalid('Thiếu bản nguồn để sửa/lưu trữ.');
  if(kind==='warehouseImport.update'){
    const doc=base.document;
    if(doc.isArchived||['items','lines','products'].some(k=>doc[k]?.length))invalid('Phiếu lưu trữ hoặc nhiều dòng cần luồng sửa đầy đủ.');
    if(doc.measures&&canonicalImport(doc.measures)!==canonicalImport(buildWarehouseImportMeasureEntries({totalKg:parseLooseQuantityValue(doc.totalKg??doc.weightKg),quantity:parseLooseQuantityValue(doc.quantity??doc.totalQuantity),quantityUnit:doc.quantityUnit||'',extraMeasures:doc.extraMeasures||[]})))invalid('Số đo lịch sử không khớp trường gốc; cần luồng sửa đầy đủ, không bỏ hoặc đoán đơn vị.');
  }
  const data=kind==='warehouseImport.archive'?{}:buildImportValues(values);
  const planner=kind==='warehouseImport.create'?originalImportCreate:kind==='warehouseImport.update'?originalImportUpdate:originalImportArchive;
  // The original product form does not submit empId/createdByEmpId on edit;
  // the expense planner therefore attributes that edit to the current employee.
  const writes=planner({...data,...(kind==='warehouseImport.archive'?{}:{clientMutationId:mutationId||id.slice(3)})},{id,tenantId,employeeId,editedAt});
  const result={document:base.document,expense:base.expense};
  for(const write of writes){const key=write.collectionName==='warehouseImports'?'document':'expense';result[key]=write.options?.merge?{...result[key],...write.payload}:write.payload;}
  result.document={...result.document,offlineRevision:importRevision(base.document)+1};
  return {pair:plainImport(result),expenseWritten:writes.some(w=>w.collectionName==='expenses')};
}
export function validateImportPayload(kind,p){
  if(!IMPORT_RULES[kind]||!p||Object.keys(p).sort().join(',')!=='base,baseFingerprint,baseRevision,editedAt,employeeId,resolvesConflictId,values,version'||p.version!==1||!importIdentifier(p.employeeId)||!Number.isSafeInteger(p.baseRevision)||p.baseRevision<0||!(p.resolvesConflictId===null||importIdentifier(p.resolvesConflictId))||!/^\d{4}-\d{2}-\d{2}T/.test(p.editedAt||'')||!Number.isFinite(Date.parse(p.editedAt)))invalid('Lệnh nhập kho không hợp lệ.');
  if(!/^[a-f0-9]{64}$/.test(p.baseFingerprint)||importRevision(p.base?.document)!==p.baseRevision)invalid('Thiếu bản CAS nhập kho/chi phí.');
  if(kind==='warehouseImport.create'&&(p.base?.document!==null||p.base?.expense!==null||p.resolvesConflictId!==null))invalid('Phiếu mới không ghi đè nguồn.');
  if(kind==='warehouseImport.archive'){if(p.values!==null)invalid('Lưu trữ không sửa số đo hoặc tài chính.');}
  else if(canonicalImport(buildImportValues(p.values))!==canonicalImport(p.values))invalid('Payload nhập kho chưa chuẩn hóa.');
  if(JSON.stringify(p).length>512000)invalid('Phiếu nhập vượt giới hạn giao thức.');return p;
}
export function importDraftFromPair(pair){
  const d=pair.document||{},draft=Object.fromEntries(fields.filter(k=>k in d).map(k=>[k,d[k]]));
  // Original form recomputes suggested amount, never rounds a previous amount anew.
  delete draft.amount;delete draft.sourceLabel;
  return {...draft,quantityUnit:d.quantityUnit||'',purchaseUnit:d.purchaseUnit||'',extraMeasures:plainImport(d.extraMeasures||[])};
}
