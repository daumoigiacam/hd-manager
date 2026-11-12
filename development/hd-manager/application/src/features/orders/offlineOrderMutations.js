import {createOfflineCommandRepository} from '../../data/offlineCommandRepository.js';
import {ORDER_MUTATION_RULES,canonicalOrder,publicOrder,orderRevision,applyOrderMetadataPatch,validateOrderMutationPayload} from './orderMutationProtocol.js';

const deny=message=>{throw Object.assign(Error(message),{code:'permission-denied'});};
const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,160}$/.test(value);
export async function createOfflineOrderMutations(options){
 const {database,session,authorize,digest,deviceId,mutationProtocol}=options,scope=Object.freeze({...session.scope}),keys=[scope.tenantId,scope.principalId];
 const check=()=>{if(!session.isCurrent(scope))deny('Phiên sửa đơn đã đóng');};
 const enabled=()=>{if(mutationProtocol?.version!==1||mutationProtocol?.receiptDispatch!==true||mutationProtocol?.serverCAS!==true)deny('Chưa nối CAS order.update/archive, quyền đã ký và định tuyến receipt; không ghi generic/LWW');};
 const tx=work=>database.transaction(async db=>{check();const value=await work(db);check();return value;});
 await tx(async db=>{
  await db.run('CREATE TABLE IF NOT EXISTS offline_order_mutations_v1 (tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,id TEXT NOT NULL,local_json TEXT NOT NULL,base_json TEXT NOT NULL,last_command_id TEXT NOT NULL,server_json TEXT,receipt_json TEXT,PRIMARY KEY(tenant_id,principal_id,id))');
  await db.run('CREATE TABLE IF NOT EXISTS offline_order_mutation_receipts_v1 (tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,command_id TEXT NOT NULL,id TEXT NOT NULL,receipt_json TEXT NOT NULL,PRIMARY KEY(tenant_id,principal_id,command_id))');
 });
 const get=async(db,id)=>(await db.query('SELECT m.*,c.state FROM offline_order_mutations_v1 m JOIN local_commands c ON c.tenant_id=m.tenant_id AND c.principal_id=m.principal_id AND c.command_id=m.last_command_id WHERE m.tenant_id=? AND m.principal_id=? AND m.id=?',[...keys,id]))[0];
 const assertCurrentSource=async(db,id,source)=>{
  const rows=await db.query("SELECT r.body FROM offline_home_feed_records_v1 r JOIN offline_home_head_v1 h ON h.tenant_id=r.tenant_id AND h.principal_id=r.principal_id AND h.generation=r.generation JOIN offline_home_feed_checkpoint_v1 c ON c.tenant_id=h.tenant_id AND c.principal_id=h.principal_id AND c.revision=h.revision AND c.generation=h.generation WHERE r.tenant_id=? AND r.principal_id=? AND h.revision=? AND r.source='orders' AND r.id=? AND c.applied_seq=json_extract(h.snapshot_json,'$.feedSeq') AND c.reported_seq=c.applied_seq",[...keys,scope.permissionRevision,id]);
  if(rows.length!==1||canonicalOrder(JSON.parse(rows[0].body))!==canonicalOrder(source))throw Error('Order source changed; reload before saving');
 };
 const commands=createOfflineCommandRepository({...options,async onReceipt(db,{commandId,entityId,receipt}){
  const command=(await db.query('SELECT kind,payload_json FROM local_commands WHERE tenant_id=? AND principal_id=? AND command_id=?',[...keys,commandId]))[0];
  if(!command||!ORDER_MUTATION_RULES[command.kind]||receipt.kind!==command.kind||receipt.entityId!==entityId)throw Error('Order mutation receipt scope mismatch');
  const row=await get(db,entityId);if(!row)throw Error('Missing immutable order mutation projection');
  const payload=validateOrderMutationPayload(command.kind,JSON.parse(command.payload_json));
  if(receipt.outcome==='accepted'){
   if(!receipt.document||receipt.document.id!==entityId||receipt.document.companyId!==scope.tenantId||!/^[a-f0-9]{64}$/.test(receipt.fingerprint))throw Error('Invalid authoritative order snapshot');
   const expected=applyOrderMetadataPatch(JSON.parse(row.base_json),command.kind,payload.patch,payload.editedAt);
   if(canonicalOrder(publicOrder(expected))!==canonicalOrder(receipt.document))throw Error('Mutation receipt changed protected order fields');
  }else if(receipt.outcome==='conflict'){
   if(receipt.currentDocument&&(receipt.currentDocument.id!==entityId||receipt.currentDocument.companyId!==scope.tenantId||!/^[a-f0-9]{64}$/.test(receipt.currentFingerprint)))throw Error('Conflict snapshot scope mismatch');
  }
  await db.run('INSERT INTO offline_order_mutation_receipts_v1 VALUES (?,?,?,?,?)',[...keys,commandId,entityId,JSON.stringify(receipt)]);
  // A receipt for an older intent may never overwrite a newer local intent.
  if(row.last_command_id===commandId)await db.run('UPDATE offline_order_mutations_v1 SET local_json=?,server_json=?,receipt_json=? WHERE tenant_id=? AND principal_id=? AND id=?',[
   receipt.outcome==='accepted'?JSON.stringify(receipt.document):row.local_json,receipt.outcome==='accepted'?JSON.stringify(receipt.document):row.server_json,JSON.stringify(receipt),...keys,entityId]);
 }});
 return Object.freeze({
  protocolVersion:mutationProtocol?.version===1&&mutationProtocol.receiptDispatch===true&&mutationProtocol.serverCAS===true?1:0,
  applyReceipt:commands.applyReceipt,
  async conflict(id){await authorize({scope,kind:'order.read'});return tx(async db=>{const row=await get(db,id);return row?.receipt_json?JSON.parse(row.receipt_json):null;});},
  async enqueue({mutationId,kind,id,baseDocument,baseCommandId=null,baseFingerprint=null,editedAt,patch,resolvesConflictId=null}){
   enabled();check();if(!identifier(mutationId)||!identifier(id)||!ORDER_MUTATION_RULES[kind]||baseDocument?.id!==id||baseDocument?.companyId!==scope.tenantId)deny('Invalid order mutation scope');
   const source=publicOrder(baseDocument),fingerprint=baseFingerprint||await digest(canonicalOrder(source));
   const payload=validateOrderMutationPayload(kind,{version:1,baseFingerprint:fingerprint,baseCommandId,baseRevision:orderRevision(source),editedAt,patch:structuredClone(patch),resolvesConflictId});
   const next=applyOrderMetadataPatch(source,kind,payload.patch,editedAt),payloadJson=JSON.stringify(payload);
   if(payloadJson.length>512000)throw Error('Order mutation too large');
   const grant=await authorize({scope,kind,entityId:id,baseRevision:payload.baseRevision,payload});check();
   if(!grant?.capabilities?.includes(ORDER_MUTATION_RULES[kind].capability)||!grant.capabilities.includes('orders.read')||!Number.isSafeInteger(grant.expiresAtMs)||(options.now||Date.now)()>=grant.expiresAtMs)deny('Thiếu quyền đã ký hoặc quyền sửa đơn hết hạn');
   return tx(async db=>{
    const retry=(await db.query('SELECT kind,entity_id,payload_json,state FROM local_commands WHERE tenant_id=? AND principal_id=? AND command_id=?',[...keys,mutationId]))[0];
    if(retry){if(retry.kind!==kind||retry.entity_id!==id||retry.payload_json!==payloadJson)throw Error('Immutable mutation ID already has another intent');return {commandId:mutationId,entityId:id,state:retry.state,serverConfirmed:retry.state==='SYNCED'};}
    const existing=await get(db,id);let dependency=null;
    if(resolvesConflictId){
     if(existing?.last_command_id!==resolvesConflictId||existing.state!=='CONFLICT_REQUIRES_REVIEW')throw Error('Review the current order conflict before resolving');
     const conflict=JSON.parse(existing.receipt_json||'null');
     if(!conflict?.currentDocument||conflict.currentFingerprint!==fingerprint||canonicalOrder(conflict.currentDocument)!==canonicalOrder(source))throw Error('Conflict resolution requires the reviewed authoritative snapshot');
    }else if(existing){
     if(existing.state!=='SYNCED')throw Error('Một thay đổi đơn đang chờ/đối soát; không ghi đè ý định cũ');
     if(baseCommandId===existing.last_command_id&&canonicalOrder(JSON.parse(existing.local_json))===canonicalOrder(source))dependency=existing.last_command_id;
     else if(baseCommandId===null)await assertCurrentSource(db,id,source);
     else throw Error('Order base changed; reload before saving');
    }else if(baseCommandId){
     const parent=(await db.query('SELECT c.kind,c.entity_id,c.state,o.body,o.server_json FROM local_commands c JOIN offline_orders_v1 o ON o.tenant_id=c.tenant_id AND o.principal_id=c.principal_id AND o.command_id=c.command_id WHERE c.tenant_id=? AND c.principal_id=? AND c.command_id=?',[...keys,baseCommandId]))[0];
     if(!parent||parent.kind!=='order.create'||parent.entity_id!==id||!['LOCAL_ONLY','PENDING_SYNC','SYNCING','SYNCED'].includes(parent.state)||canonicalOrder(JSON.parse(parent.state==='SYNCED'&&parent.server_json?parent.server_json:parent.body))!==canonicalOrder(source))throw Error('Create dependency changed or requires reconciliation');
     dependency=baseCommandId;
    }else{
     await assertCurrentSource(db,id,source);
    }
    await db.run('INSERT INTO local_commands VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[...keys,mutationId,scope.sessionId,scope.permissionRevision,deviceId,kind,id,payload.baseRevision,(options.now||Date.now)(),payloadJson,mutationId,'PENDING_SYNC']);
    if(dependency)await db.run('INSERT INTO command_dependencies VALUES (?,?,?,?)',[...keys,mutationId,dependency]);
    await db.run('INSERT INTO offline_order_mutations_v1 VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,principal_id,id) DO UPDATE SET local_json=excluded.local_json,base_json=excluded.base_json,last_command_id=excluded.last_command_id,receipt_json=NULL',[
     ...keys,id,JSON.stringify(next),JSON.stringify(source),mutationId,existing?.server_json||null,null]);
    return {commandId:mutationId,entityId:id,state:'PENDING_SYNC',serverConfirmed:false};
   });
  },
 });
}
