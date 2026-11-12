// Bounded metadata protocol. Financial mutations require their original compound
// workflow; never normalize/reprice historical items while changing a note/flag.
export const ORDER_MUTATION_RULES=Object.freeze({
 'order.update':Object.freeze({capability:'orders.update',module:'orders',action:'edit_order_items'}),
 'order.archive':Object.freeze({capability:'orders.archive',module:'orders',action:'delete_order'}),
});
const reject=message=>{throw Object.assign(Error(message),{code:'invalid-argument'});};
export function canonicalOrder(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonicalOrder).join(',')+']';
 return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalOrder(value[key])).join(',')+'}';
}
// Same credential redaction as the existing full Home feed, not a new source
// projection. CAS fingerprints still cover the ORIGINAL server body + virtual ID.
export const publicOrder=value=>JSON.parse(JSON.stringify(value,(key,item)=>/(password|token|secret|apikey|map.*key)$/i.test(key)?undefined:item));
export function validateOrderMutationPatch(kind,patch){
 if(!ORDER_MUTATION_RULES[kind]||!patch||typeof patch!=='object'||Array.isArray(patch))reject('Unsupported order mutation');
 const fields=Object.keys(patch);
 if(kind==='order.update'&&(fields.length!==1||fields[0]!=='note'||typeof patch.note!=='string'||patch.note.length>4000))reject('Chỉ sửa ghi chú; số lượng/giá, phí, thu tiền, khách hàng và trả hàng cần luồng nghiệp vụ nguyên khối');
 if(kind==='order.archive'&&(fields.length!==1||fields[0]!=='isArchived'||typeof patch.isArchived!=='boolean'))reject('Lưu trữ chỉ thay đổi isArchived; không xóa đơn hoặc chứng từ liên quan');
 return patch;
}
export function orderRevision(document){
 const revision=document.offlineRevision===undefined?0:document.offlineRevision;
 if(!Number.isSafeInteger(revision)||revision<0||revision>=Number.MAX_SAFE_INTEGER)reject('Order revision is invalid');
 return revision;
}
export function applyOrderMetadataPatch(document,kind,patch,editedAt){
 validateOrderMutationPatch(kind,patch);
 if(!document||typeof document!=='object'||typeof document.companyId!=='string')reject('Order document is invalid');
 if(typeof editedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(editedAt)||!Number.isFinite(Date.parse(editedAt)))reject('Mutation time is invalid');
 return {...document,...patch,...(kind==='order.update'?{updatedAt:editedAt,zaloContentEditedAt:editedAt}:{}),offlineRevision:orderRevision(document)+1};
}
export function validateOrderMutationPayload(kind,payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(key=>!['version','baseFingerprint','baseCommandId','baseRevision','patch','editedAt','resolvesConflictId'].includes(key)))reject('Invalid CAS order payload');
 if(payload.version!==1||!Number.isSafeInteger(payload.baseRevision)||payload.baseRevision<0||!/^\d{4}-\d{2}-\d{2}T/.test(payload.editedAt)||!Number.isFinite(Date.parse(payload.editedAt)))reject('Invalid CAS version/revision/time');
 const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,160}$/.test(value);
 if((payload.baseCommandId!==null&&!identifier(payload.baseCommandId))||(payload.resolvesConflictId!==null&&!identifier(payload.resolvesConflictId))||!(/^[a-f0-9]{64}$/.test(payload.baseFingerprint)))reject('Original order fingerprint is required');
 if(payload.resolvesConflictId&&payload.baseCommandId)reject('Conflict resolution must use the reviewed server fingerprint');
 validateOrderMutationPatch(kind,payload.patch);return payload;
}
