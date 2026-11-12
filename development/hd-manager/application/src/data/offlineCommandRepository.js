// Adapter contract: transaction(callback) serializes BEGIN IMMEDIATE/COMMIT;
// callback receives query(sql,params)->rows and run(sql,params). Native adapters
// must execute this work off the WebView main thread and open encrypted storage.
export function createOfflineCommandRepository({ database, session, deviceId, digest, authorize, uuid, now = Date.now, onEnqueue, onReceipt, onStateChange }) {
  if(typeof deviceId!=='string'||!deviceId.trim())throw new TypeError('Verified device identity required');
  const scope = Object.freeze({...session.scope});
  const keys = [scope.tenantId, scope.principalId];
  function check(candidate = scope) {
    if (!session.isCurrent(scope) || Object.keys(scope).some(k=>candidate[k]!==scope[k])) {
      throw Object.assign(new Error('Offline scope closed'), {code:'permission-denied'});
    }
  }
  async function tx(work) {
    check();
    return database.transaction(async db=>{check();const result=await work(db);check();return result;});
  }
  async function event(db,id,state,reason=null) {
    await db.run('INSERT INTO command_events(tenant_id,principal_id,command_id,at,state,reason_code) VALUES (?,?,?,?,?,?)',[...keys,id,now(),state,reason]);
    if(onStateChange)await onStateChange(db,{commandId:id,state});
  }
  async function owned(db,command) {
    const rows=await db.query('SELECT c.*,o.lease_owner FROM local_commands c JOIN outbox o USING(tenant_id,principal_id,command_id) WHERE c.tenant_id=? AND c.principal_id=? AND c.command_id=?',[...keys,command.commandId]);
    const record=rows[0];
    if (!record || record.state!=='SYNCING' || record.lease_owner!==command.leaseOwner) throw new Error('Stale sync lease');
    return record;
  }
  return Object.freeze({
    async enqueue({kind,entityId,baseRevision,payload,dependencies=[]}) {
      check();
      await authorize({scope,kind,entityId,baseRevision,payload,now:now()});
      check();
      if (!Number.isSafeInteger(baseRevision) || baseRevision<0 || !kind || !entityId) throw new TypeError('Invalid command');
      const payloadJson=JSON.stringify(payload);
      if (!payloadJson || payloadJson.length>512000) throw new TypeError('Invalid command payload');
      const id=uuid();
      if(typeof id!=='string'||!id)throw new TypeError('Invalid command identity');
      await tx(async db=>{
        await db.run('INSERT INTO local_commands VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [...keys,id,scope.sessionId,scope.permissionRevision,deviceId,kind,entityId,baseRevision,now(),payloadJson,id,'PENDING_SYNC']);
        for(const dependency of new Set(dependencies)) {
          // Only existing same-account commands can be dependencies. New commands
          // point backward, so this API cannot introduce a dependency cycle.
          await db.run('INSERT INTO command_dependencies VALUES (?,?,?,?)',[...keys,id,dependency]);
        }
        if(onEnqueue)await onEnqueue(db,{commandId:id,kind,entityId,payload});
      });
      return {commandId:id,state:'PENDING_SYNC',serverConfirmed:false};
    },
    async claimDue(candidate,{now:at,leaseMs,maxAttempts}) {
      check(candidate);
      return tx(async db=>{
        // Expired leases represent an unknown remote outcome, not a new intent.
        const expired=await db.query("SELECT c.command_id FROM local_commands c JOIN outbox o USING(tenant_id,principal_id,command_id) WHERE c.tenant_id=? AND c.principal_id=? AND c.state='SYNCING' AND o.lease_until<=?",[...keys,at]);
        for(const row of expired) {
          await db.run("UPDATE local_commands SET state='PENDING_SYNC' WHERE tenant_id=? AND principal_id=? AND command_id=?",[...keys,row.command_id]);
          await event(db,row.command_id,'PENDING_SYNC','lease-expired');
        }
        const exhausted=await db.query("SELECT c.command_id FROM local_commands c JOIN outbox o USING(tenant_id,principal_id,command_id) WHERE c.tenant_id=? AND c.principal_id=? AND c.state='PENDING_SYNC' AND o.attempts>=?",[...keys,maxAttempts]);
        for(const row of exhausted) {
          await db.run("UPDATE local_commands SET state='SYNC_FAILED' WHERE tenant_id=? AND principal_id=? AND command_id=?",[...keys,row.command_id]);
          await event(db,row.command_id,'SYNC_FAILED','retry-exhausted');
        }
        const rows=await db.query(`SELECT c.*,o.attempts FROM local_commands c JOIN outbox o USING(tenant_id,principal_id,command_id)
          WHERE c.tenant_id=? AND c.principal_id=? AND c.state='PENDING_SYNC' AND o.next_attempt_at<=? AND o.attempts<?
          AND NOT EXISTS (SELECT 1 FROM command_dependencies d JOIN local_commands p ON p.tenant_id=d.tenant_id AND p.principal_id=d.principal_id AND p.command_id=d.depends_on
          WHERE d.tenant_id=c.tenant_id AND d.principal_id=c.principal_id AND d.command_id=c.command_id AND p.state!='SYNCED')
          ORDER BY c.created_at,c.command_id LIMIT 1`,[...keys,at,maxAttempts]);
        if(!rows.length)return null;
        const r=rows[0], leaseOwner=uuid();
        await db.run("UPDATE local_commands SET state='SYNCING' WHERE tenant_id=? AND principal_id=? AND command_id=?",[...keys,r.command_id]);
        await db.run('UPDATE outbox SET attempts=attempts+1,lease_owner=?,lease_until=? WHERE tenant_id=? AND principal_id=? AND command_id=?',[leaseOwner,at+leaseMs,...keys,r.command_id]);
        await event(db,r.command_id,'SYNCING');
        return {commandId:r.command_id,idempotencyKey:r.idempotency_key,payloadDigest:await digest(r.payload_json),payload:JSON.parse(r.payload_json),kind:r.kind,entityId:r.entity_id,baseRevision:r.base_revision,attempts:r.attempts+1,leaseOwner};
      });
    },
    async failLease(candidate,command,{state,code,nextAttemptAt}) {
      check(candidate);
      if(!['PENDING_SYNC','SYNC_FAILED'].includes(state))throw new TypeError('Invalid failure state');
      await tx(async db=>{
        await owned(db,command);
        await db.run('UPDATE local_commands SET state=? WHERE tenant_id=? AND principal_id=? AND command_id=?',[state,...keys,command.commandId]);
        await db.run('UPDATE outbox SET next_attempt_at=?,last_error_code=?,lease_owner=NULL,lease_until=NULL WHERE tenant_id=? AND principal_id=? AND command_id=?',[nextAttemptAt || 0,code,...keys,command.commandId]);
        await event(db,command.commandId,state,code);
      });
    },
    async applyReceipt(candidate,command,receipt) {
      check(candidate);
      await tx(async db=>{
        const r=await owned(db,command);
        if(receipt.tenantId!==scope.tenantId||receipt.principalId!==scope.principalId||receipt.commandId!==r.command_id||receipt.idempotencyKey!==r.idempotency_key||receipt.payloadDigest!==await digest(r.payload_json)||!['accepted','conflict','rejected'].includes(receipt.outcome)) throw new Error('Invalid authoritative receipt');
        const state={accepted:'SYNCED',conflict:'CONFLICT_REQUIRES_REVIEW',rejected:'SYNC_FAILED'}[receipt.outcome];
        await db.run('UPDATE local_commands SET state=? WHERE tenant_id=? AND principal_id=? AND command_id=?',[state,...keys,r.command_id]);
        await db.run('UPDATE outbox SET lease_owner=NULL,lease_until=NULL,last_error_code=? WHERE tenant_id=? AND principal_id=? AND command_id=?',[receipt.outcome,...keys,r.command_id]);
        await event(db,r.command_id,state,receipt.outcome);
        if(onReceipt)await onReceipt(db,{commandId:r.command_id,entityId:r.entity_id,state,receipt});
      });
    },
    async countPending() {
      check();const initial=database.takeInitialPending?.({...scope,deviceId});check();
      if(initial!==null&&initial!==undefined)return initial;
      const sql="SELECT COUNT(*) AS n FROM local_commands WHERE tenant_id=? AND principal_id=? AND state!='SYNCED'";
      if(!database.readQuery)return tx(async db=>(await db.query(sql,keys))[0].n);
      // A single SELECT already owns an atomic SQLite read snapshot. Use the
      // same serialized native owner, retaining BOTH session checks and scope
      // predicates, without separate bridge BEGIN/COMMIT messages for a count.
      check();const rows=await database.readQuery(sql,keys);check();return rows[0].n;
    },
    async list() {return tx(db=>db.query('SELECT command_id,kind,entity_id,state,created_at FROM local_commands WHERE tenant_id=? AND principal_id=? ORDER BY created_at,command_id',keys));},
  });
}
