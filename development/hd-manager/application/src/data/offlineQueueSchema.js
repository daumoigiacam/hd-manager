import {sqliteSchemaSignature} from './exactSQLiteSchema.js';

// The Android SDK splits batches on literal ;\n, not ;\r\n. This normalization
// changes neither SQL tokens nor encryption/settings. Also apply it to later DDL.
export const nativeSQLBatch=sql=>String(sql).replace(/\r\n?/g,'\n');
const names=['local_commands','outbox','command_dependencies','command_events','outbox_due','enqueue_command','audit_command_insert','enqueue_draft','validate_sync_transition','immutable_command'];
const fail=()=>Object.assign(Error('Existing Offline queue schema needs reconciliation; saved intents are preserved'),{code:'offline-schema-incompatible'});
export function offlineQueueDefinitions(schema){
 const text=nativeSQLBatch(schema).replace(/^--[^\n]*\n/gm,'').replace(/^PRAGMA [^\n]*;\s*$/gm,'').trim();
 const definitions=text.split(/\n(?=CREATE )/).map(sql=>{
  const match=/^CREATE (TABLE|INDEX|TRIGGER) IF NOT EXISTS (\w+)\b/.exec(sql);
  if(!match||!names.includes(match[2]))throw fail();
  return {name:match[2],type:match[1].toLowerCase(),sql,signature:sqliteSchemaSignature(sql)};
 });
 if(definitions.length!==names.length||new Set(definitions.map(row=>row.name)).size!==names.length)throw fail();
 return definitions;
}
export const offlineQueueMetadataSQL="SELECT type,name,sql FROM sqlite_master WHERE name IN ("+names.map(name=>"'"+name+"'").join(',')+")";
export async function ensureOfflineQueueSchema({schema,scope,read,transaction,initialRows,now=Date.now}){
 const definitions=offlineQueueDefinitions(schema),keys=[scope.tenantId,scope.principalId];
 if(!keys.every(value=>typeof value==='string'&&value))throw fail();
 const inspect=rows=>{
  if(!Array.isArray(rows)||rows.length>names.length)throw fail();
  const seen=new Set();
  for(const row of rows){const expected=definitions.find(value=>value.name===row.name);
   if(!expected||seen.has(row.name)||row.type!==expected.type||sqliteSchemaSignature(row.sql)!==expected.signature)throw fail();seen.add(row.name);
  }
  return seen;
 };
 const initial=inspect(initialRows??await read(offlineQueueMetadataSQL));
 if(initial.size===names.length)return {created:false,recovered:false};
 return transaction(async db=>{
  const existing=inspect(await db.query(offlineQueueMetadataSQL)),missingOutbox=!existing.has('outbox');
  if(existing.has('local_commands')){
   if((await db.query('SELECT 1 FROM local_commands WHERE tenant_id!=? OR principal_id!=? LIMIT 1',keys)).length)throw fail();
   // Only the known incomplete first-open schema can be repaired automatically.
   // Unknown remote attempts/leases must not be reset or fabricated.
   if(missingOutbox&&(await db.query("SELECT 1 FROM local_commands WHERE state!='PENDING_SYNC' AND state!='LOCAL_ONLY' LIMIT 1")).length)throw fail();
  }
  await db.execute(definitions.map(row=>row.sql).join('\n')+'\n');
  if(inspect(await db.query(offlineQueueMetadataSQL)).size!==names.length)throw fail();
  if(missingOutbox){
   const orphan="SELECT c.tenant_id,c.principal_id,c.command_id FROM local_commands c WHERE c.tenant_id=? AND c.principal_id=? AND c.state='PENDING_SYNC' AND NOT EXISTS (SELECT 1 FROM outbox o WHERE o.tenant_id=c.tenant_id AND o.principal_id=c.principal_id AND o.command_id=c.command_id)";
   // Append recovery history at the real recovery time, not a forged old event.
   await db.run("INSERT INTO command_events(tenant_id,principal_id,command_id,at,state,reason_code) SELECT tenant_id,principal_id,command_id,?,'PENDING_SYNC','queue-schema-recovery' FROM ("+orphan+")",[now(),...keys]);
   await db.run('INSERT INTO outbox(tenant_id,principal_id,command_id) '+orphan,keys);
  }
  return {created:true,recovered:missingOutbox&&existing.has('local_commands')};
 });
}
