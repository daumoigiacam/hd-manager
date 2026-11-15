import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import initSqlJs from 'sql.js';
import {ensureOfflineQueueSchema,offlineQueueDefinitions,offlineQueueMetadataSQL,nativeSQLBatch} from '../src/data/offlineQueueSchema.js';

const schema=await fs.readFile(new URL('../performance/offline-first/schema-v1.sql',import.meta.url),'utf8');
const SQL=await initSqlJs(),scope={tenantId:'qa-tenant',principalId:'qa-user'};
function owner(){
 const db=new SQL.Database();db.run('PRAGMA foreign_keys=ON');let writes=0;
 const query=(sql,values=[])=>{const statement=db.prepare(sql);try{statement.bind(values);const rows=[];while(statement.step())rows.push(statement.getAsObject());return rows;}finally{statement.free();}};
 const adapter={query,run(sql,values=[]){writes++;db.run(sql,values);},execute(sql){writes++;db.run(sql);}};
 return{db,query,get writes(){return writes;},transaction:async work=>{db.run('BEGIN IMMEDIATE');try{const result=await work(adapter);db.run('COMMIT');return result;}catch(error){db.run('ROLLBACK');throw error;}},close:()=>db.close()};
}
function command(db,id='original-command',state='PENDING_SYNC',tenant=scope.tenantId){db.run('INSERT INTO local_commands VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[tenant,scope.principalId,id,'original-session','original-rights','original-device','cashflow.expense.create','original-expense',0,1000,JSON.stringify({input:{amount:1000,date:'2026-11-15',note:'QA pending intent'}}),id,state]);}
test('CRLF batch is normalized for the actual Android SDK delimiter; incomplete version 1 recovers immutable pending intent atomically',async()=>{
 const crlf=nativeSQLBatch(schema).replace(/\n/g,'\r\n');assert.equal(crlf.split(';\n').length,1);assert(nativeSQLBatch(crlf).split(';\n').length>10);
 const o=owner();try{
  const definitions=offlineQueueDefinitions(crlf);assert.equal(definitions.length,10);
  // Native log proves this legacy partial state: first table only, version=1.
  o.db.run(definitions[0].sql);o.db.run('PRAGMA user_version=1');command(o.db);command(o.db,'saved-draft','LOCAL_ONLY');
  const before=o.query('SELECT * FROM local_commands ORDER BY command_id');
  const repair=()=>ensureOfflineQueueSchema({schema:crlf,scope,read:o.query,transaction:o.transaction,now:()=>2000});
  assert.deepEqual(await repair(),{created:true,recovered:true});
  assert.deepEqual(o.query('SELECT * FROM local_commands ORDER BY command_id'),before);
  assert.deepEqual(o.query('SELECT command_id,attempts,next_attempt_at,lease_owner FROM outbox'),[{command_id:'original-command',attempts:0,next_attempt_at:0,lease_owner:null}]);
  assert.deepEqual(o.query('SELECT command_id,at,state,reason_code FROM command_events'),[{command_id:'original-command',at:2000,state:'PENDING_SYNC',reason_code:'queue-schema-recovery'}]);
  const writes=o.writes;assert.deepEqual(await repair(),{created:false,recovered:false});assert.equal(o.writes,writes);
  command(o.db,'next-command');assert.equal(o.query('SELECT COUNT(*) AS n FROM outbox')[0].n,2);
  assert.throws(()=>o.db.run("UPDATE local_commands SET payload_json='{}'"),/immutable-command/);
  assert.throws(()=>o.db.run("UPDATE local_commands SET state='SYNCED' WHERE command_id='original-command'"),/invalid-sync-transition/);
  o.db.run("UPDATE local_commands SET state='SYNCING' WHERE command_id='original-command'");
  o.db.run("UPDATE local_commands SET state='SYNCED' WHERE command_id='original-command'");
  assert.equal(o.query(offlineQueueMetadataSQL).length,10);
 }finally{o.close();}
});
test('recovery refuses a foreign owner or unknown prior sync outcome; no guessed leases or overwritten schema',async()=>{
 for(const mode of ['foreign','unknown-outcome','incompatible']){
  const o=owner();try{
   const definition=offlineQueueDefinitions(schema)[0];o.db.run(definition.sql);
   if(mode==='incompatible')o.db.run('CREATE TABLE outbox(unrelated TEXT)');
   else command(o.db,'preserved',mode==='unknown-outcome'?'SYNCING':'PENDING_SYNC',mode==='foreign'?'other-tenant':scope.tenantId);
   const before=o.query('SELECT * FROM local_commands');
   await assert.rejects(()=>ensureOfflineQueueSchema({schema,scope,read:o.query,transaction:o.transaction}),{code:'offline-schema-incompatible'});
   assert.deepEqual(o.query('SELECT * FROM local_commands'),before);
   assert.equal(o.query("SELECT name FROM sqlite_master WHERE name='command_events'").length,0);
  }finally{o.close();}
 }
});
