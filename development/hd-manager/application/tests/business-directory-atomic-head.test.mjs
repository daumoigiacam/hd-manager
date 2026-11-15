import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createOfflineBusinessDirectory} from '../src/data/offlineBusinessDirectory.js';

function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE offline_home_head_v1(tenant_id,principal_id,revision,generation,captured_at,day_key,snapshot_json);
 CREATE TABLE offline_home_feed_checkpoint_v1(tenant_id,principal_id,revision,generation,applied_seq,reported_seq);
 CREATE TABLE offline_home_feed_records_v1(tenant_id,principal_id,generation,source,id,seq,body);`);
 const scope={tenantId:'tenant-a',principalId:'principal-a',permissionRevision:'r1',sessionId:'session-a',deviceId:'device-a'};
 const head={feedGeneration:'g1',feedSeq:3,sourceProfile:'legacy-v1',availableSources:['payments','expenses'],sourceCounts:{payments:2,expenses:1},reportBody:'x'.repeat(2*1024*1024)};
 const update=()=>sql.prepare('UPDATE offline_home_head_v1 SET snapshot_json=?').run(JSON.stringify(head));
 sql.prepare('INSERT INTO offline_home_head_v1 VALUES(?,?,?,?,?,?,?)').run(scope.tenantId,scope.principalId,'r1','g1',100,'2026-11-15',JSON.stringify(head));
 sql.prepare('INSERT INTO offline_home_feed_checkpoint_v1 VALUES(?,?,?,?,?,?)').run(scope.tenantId,scope.principalId,'r1','g1',3,3);
 const insert=(tenant,principal,source,id,amount)=>sql.prepare('INSERT INTO offline_home_feed_records_v1 VALUES(?,?,?,?,?,?,?)').run(tenant,principal,'g1',source,id,1,JSON.stringify({id,companyId:tenant,date:'2026-11-15',amount,note:id}));
 insert(scope.tenantId,scope.principalId,'payments','p1',67000);insert(scope.tenantId,scope.principalId,'payments','p2',0);insert(scope.tenantId,scope.principalId,'expenses','e1',-1000);
 insert('tenant-b','principal-b','payments','foreign',57000);
 insert(scope.tenantId,'principal-b','payments','other-principal',57000);
 let current=true;const statements=[];
 const query=async(statement,params=[])=>sql.prepare(statement).all(...params);
 const session={scope,isCurrent:()=>current};
 const authorize=async()=>({...scope,expiresAtMs:Date.now()+60000,capabilities:['home.read','home.cashflow.read']});
 const fallback=createOfflineBusinessDirectory({database:{transaction:work=>work({query})},session,authorize});
 const native=createOfflineBusinessDirectory({database:{transaction:work=>work({query}),readQuery:async(statement,params)=>{statements.push(statement);return query(statement,params);}},session,authorize});
 return {sql,head,scope,update,native,fallback,statements,revoke:()=>{current=false;},close:()=>sql.close()};
}
test('native atomic pages match the existing transaction reader with a 2MiB report head, zero and negative values; foreign scopes stay absent',async()=>{
 const f=fixture();try{
  for(const source of ['payments','expenses']){
   const first=await f.native.page(source,{limit:1});
   assert.deepEqual(first,await f.fallback.page(source,{limit:1}));
   if(first.hasMore)assert.deepEqual(await f.native.page(source,{limit:1,cursor:first.nextCursor}),await f.fallback.page(source,{limit:1,cursor:first.nextCursor}));
   assert(first.items.every(row=>row.document.companyId==='tenant-a'&&!['foreign','other-principal'].includes(row.id)));
  }
  const before=f.statements.length;
  const batch=await f.native.pageBatch([{source:'payments',options:{limit:15}},{source:'expenses',options:{limit:15}}]);
  assert.equal(f.statements.length-before,1,'visible pair remains one SQLite snapshot');
  assert.deepEqual(batch,await f.fallback.pageBatch([{source:'payments',options:{limit:15}},{source:'expenses',options:{limit:15}}]));
  assert.deepEqual(batch[0].items.map(row=>row.document.amount),[0,67000]);
  assert.equal(batch[1].items[0].document.amount,-1000);
  assert(!JSON.stringify(batch).includes('x'.repeat(1024)),'large report body never crosses the bounded directory interface');
 }finally{f.close();}
});
test('live checkpoint, malformed source metadata, session revocation and cross-generation cursors still fail closed',async()=>{
 const changes=[head=>{head.feedSeq=4;},head=>{head.sourceProfile='native-isolation-v1';},head=>{head.availableSources=['expenses'];},head=>{head.sourceCounts.payments='2';},head=>{head.feedGeneration='g-other';}];
 for(const change of changes){const f=fixture();try{change(f.head);f.update();await assert.rejects(f.native.page('payments'));await assert.rejects(f.fallback.page('payments'));}finally{f.close();}}
 const f=fixture();try{
  const first=await f.native.page('payments',{limit:1});
  f.head.feedSeq=4;f.update();f.sql.exec('UPDATE offline_home_feed_checkpoint_v1 SET applied_seq=4,reported_seq=4');
  await assert.rejects(f.native.page('payments',{limit:1,cursor:first.nextCursor}));
  f.revoke();await assert.rejects(f.native.page('payments'));
 }finally{f.close();}
});
