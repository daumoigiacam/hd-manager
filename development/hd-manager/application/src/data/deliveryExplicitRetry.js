// STAGED56 ONLY. Explicit user retry leases the original immutable command.
// No automatic retry budget reset, new command, payload/base edit or receipt edit.
export function createDeliveryExplicitRetryClaims({database,session,digest,authorizeWrite,clock=Date.now,uuid,validatePayload}){
 const scope=Object.freeze({...session.scope}),keys=[scope.tenantId,scope.principalId];
 const transient=new Set(['network-error','unavailable','deadline-exceeded','resource-exhausted','receipt-accepted-local-transient']);
 const kinds=new Set(['deliveryReport.create','deliveryReport.update','deliveryReport.archive']);
 const fail=()=>{throw Object.assign(Error('Không thể gửi lại ý định giao hàng này.'),{code:'failed-precondition'});};
 const current=()=>{if(!session.isCurrent(scope)||!Object.keys(scope).every(k=>session.scope[k]===scope[k]))throw Object.assign(Error('Phiên giao hàng đã đóng.'),{code:'permission-denied'});};
 const read=async(db,id,commandId)=>(await db.query(`SELECT c.*,o.attempts,o.last_error_code,o.lease_owner,o.lease_until,d.receipt_json
  FROM offline_delivery_commands_v1 d JOIN local_commands c ON c.tenant_id=d.tenant_id AND c.principal_id=d.principal_id AND c.command_id=d.last_command_id
  JOIN outbox o USING(tenant_id,principal_id,command_id)
  WHERE d.tenant_id=? AND d.principal_id=? AND d.id=? AND c.entity_id=d.id AND c.command_id=?`,[...keys,id,commandId]))[0];
 async function eligible(db,id,commandId){
  current();const row=await read(db,id,commandId);
  if(!row||!kinds.has(row.kind)||row.state!=='SYNC_FAILED'||!transient.has(row.last_error_code)||row.receipt_json!==null||row.lease_owner!==null||row.lease_until!==null||!Number.isSafeInteger(row.attempts)||row.attempts<1||row.attempts>=Number.MAX_SAFE_INTEGER)fail();
  if((await db.query('SELECT command_id FROM offline_delivery_receipts_v1 WHERE tenant_id=? AND principal_id=? AND command_id=? LIMIT 1',[...keys,commandId])).length)fail();
  if((await db.query("SELECT d.depends_on FROM command_dependencies d LEFT JOIN local_commands p ON p.tenant_id=d.tenant_id AND p.principal_id=d.principal_id AND p.command_id=d.depends_on WHERE d.tenant_id=? AND d.principal_id=? AND d.command_id=? AND (p.command_id IS NULL OR p.state!='SYNCED') LIMIT 1",[...keys,commandId])).length)fail();
  await authorizeWrite(row.kind);current();validatePayload(row.kind,JSON.parse(row.payload_json));return row;
 }
 async function tx(work){current();return database.transaction(async db=>{current();const result=await work(db);current();return result;});}
 return Object.freeze({
  authorize(candidate,command){return tx(async db=>{if(!candidate||!Object.keys(scope).every(k=>candidate[k]===scope[k]))fail();const r=await read(db,command.entityId,command.commandId);if(!r||r.state!=='SYNCING'||!kinds.has(r.kind)||r.kind!==command.kind||r.lease_owner!==command.leaseOwner||await digest(r.payload_json)!==command.payloadDigest)fail();await authorizeWrite(r.kind);current();});},
  prepare(id,commandId){return tx(async db=>{const r=await eligible(db,id,commandId);return {commandId:r.command_id,entityId:r.entity_id,payloadDigest:await digest(r.payload_json)};});},
  claim(candidate,request,{now=clock(),leaseMs=60000}={}){return tx(async db=>{
   if(!candidate||!Object.keys(scope).every(k=>candidate[k]===scope[k])||!request||!Number.isSafeInteger(now)||!Number.isSafeInteger(leaseMs)||leaseMs<=20000)fail();
   const r=await eligible(db,request.entityId,request.commandId),payloadDigest=await digest(r.payload_json);
   if(payloadDigest!==request.payloadDigest||r.idempotency_key!==request.commandId)fail();
   const leaseOwner=uuid();if(typeof leaseOwner!=='string'||!leaseOwner)fail();
   // Follow the existing schema trigger's legal path, without an intermediate
   // commit or automatic retry budget reset. All steps roll back together.
   await db.run("UPDATE local_commands SET state='PENDING_SYNC' WHERE tenant_id=? AND principal_id=? AND command_id=?",[...keys,r.command_id]);
   await db.run('INSERT INTO command_events(tenant_id,principal_id,command_id,at,state,reason_code) VALUES (?,?,?,?,?,?)',[...keys,r.command_id,now,'PENDING_SYNC','explicit-user-retry-requested']);
   await db.run("UPDATE local_commands SET state='SYNCING' WHERE tenant_id=? AND principal_id=? AND command_id=?",[...keys,r.command_id]);
   await db.run('UPDATE outbox SET attempts=attempts+1,lease_owner=?,lease_until=? WHERE tenant_id=? AND principal_id=? AND command_id=?',[leaseOwner,now+leaseMs,...keys,r.command_id]);
   await db.run('INSERT INTO command_events(tenant_id,principal_id,command_id,at,state,reason_code) VALUES (?,?,?,?,?,?)',[...keys,r.command_id,now,'SYNCING','explicit-user-retry']);
   await authorizeWrite(r.kind);current();
   return {commandId:r.command_id,idempotencyKey:r.idempotency_key,payloadDigest,payload:JSON.parse(r.payload_json),kind:r.kind,entityId:r.entity_id,baseRevision:r.base_revision,attempts:r.attempts+1,leaseOwner};
  });},
 });
}
