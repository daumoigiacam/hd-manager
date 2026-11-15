import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createOfflineBusinessDirectory} from '../src/data/offlineBusinessDirectory.js';
import {backfillCashflowSortPage,CASHFLOW_SORT_TABLE} from '../src/data/cashflowSortProjection.js';
import {createHomeFeedStorage} from '../src/data/offlineHomeFeedStorage.js';
import {HOME_FEED_SOURCES} from '../src/data/homeFeedContract.js';

function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE offline_home_head_v1(tenant_id,principal_id,revision,generation,captured_at,day_key,snapshot_json,PRIMARY KEY(tenant_id,principal_id,revision));
 CREATE TABLE offline_home_feed_checkpoint_v1(tenant_id,principal_id,revision,generation,applied_seq,reported_seq);
 CREATE TABLE offline_home_feed_records_v1(tenant_id,principal_id,generation,source,id,seq,body,PRIMARY KEY(tenant_id,principal_id,generation,source,id));`);
 const scope={tenantId:'tenant-a',principalId:'person-a',permissionRevision:'r1',sessionId:'s1'};
 const head={feedGeneration:'g1',feedSeq:3,sourceProfile:'legacy-v1',availableSources:['warehouseDispatches'],sourceCounts:{warehouseDispatches:6000},reportBody:'x'.repeat(2*1024*1024)};
 sql.prepare('INSERT INTO offline_home_head_v1 VALUES(?,?,?,?,?,?,?)').run('tenant-a','person-a','r1','g1',100,'2026-11-15',JSON.stringify(head));
 sql.prepare('INSERT INTO offline_home_feed_checkpoint_v1 VALUES(?,?,?,?,?,?)').run('tenant-a','person-a','r1','g1',3,3);
 const insert=sql.prepare('INSERT INTO offline_home_feed_records_v1 VALUES(?,?,?,?,?,?,?)');
 sql.exec('BEGIN');for(let n=0;n<6000;n++){const id=String(n).padStart(5,'0');insert.run('tenant-a','person-a','g1','warehouseDispatches',id,1,JSON.stringify({id,companyId:'tenant-a',date:n%2?'2026-11-15':'2026-11-14',customerId:'c'+n%3,productName:'Gà '+n,quantity:n,status:n%2?'pending':'completed',empId:'e'+n%2}));}sql.exec('COMMIT');
 for(const[t,p,id]of[['tenant-b','person-b','foreign'],['tenant-a','person-b','other-principal']])insert.run(t,p,'g1','warehouseDispatches',id,1,JSON.stringify({id,companyId:t,date:'2026-11-15',quantity:999999}));
 let current=true,capabilities=['home.read','home.dispatches.read'],expireOnRead=false;const statements=[];
 const query=async(s,p=[])=>sql.prepare(s).all(...p),session={scope,isCurrent:()=>current},authorize=async()=>({...scope,expiresAtMs:100000,capabilities});
 const common={session,authorize,clock:()=>1000};
 const native=createOfflineBusinessDirectory({...common,database:{transaction:fn=>fn({query}),readQuery:async(s,p)=>{statements.push({statement:s,params:p});const rows=await query(s,p);if(expireOnRead)current=false;return rows;}}});
 const fallback=createOfflineBusinessDirectory({...common,database:{transaction:fn=>fn({query})}});
 return{sql,head,native,fallback,statements,db:{query,run:async(s,p=[])=>sql.prepare(s).run(...p)},update:()=>sql.prepare('UPDATE offline_home_head_v1 SET snapshot_json=?').run(JSON.stringify(head)),revoke:()=>{capabilities=['home.read'];},expireOnRead:()=>{expireOnRead=true;}};
}

test('dispatch bounded read matches transaction reader on 6000 rows, pagination and filters without exposing the large report',async()=>{
 const f=fixture();try{
  for(const options of [{limit:25},{limit:25,from:'2026-11-15',to:'2026-11-16'},{limit:25,status:'completed'},{limit:25,employeeId:'e1'},{limit:25,customerId:'c1'}]){
   const first=await f.native.page('warehouseDispatches',options),expected=await f.fallback.page('warehouseDispatches',options);assert.deepEqual(first,expected);
   if(first.hasMore)assert.deepEqual(await f.native.page('warehouseDispatches',{...options,cursor:first.nextCursor}),await f.fallback.page('warehouseDispatches',{...options,cursor:expected.nextCursor}));
   assert(first.items.every(row=>row.document.companyId==='tenant-a'&&!['foreign','other-principal'].includes(row.id)));
   assert(!JSON.stringify(first).includes('x'.repeat(1024)));
  }
  const batch=[{source:'warehouseDispatches',options:{limit:15}},{source:'warehouseDispatches',options:{limit:15,status:'completed'}}];
  assert.deepEqual(await f.native.pageBatch(batch),await f.fallback.pageBatch(batch));
  assert(f.statements[0].statement.includes('directory_ready AS MATERIALIZED'));
 }finally{f.sql.close();}
});

test('dispatch reuses existing date keys only when every live record matches seq; partial, updated and deleted keys retain exact results',async()=>{
 const f=fixture(),batch=()=>backfillCashflowSortPage(f.db,{keys:['tenant-a','person-a'],head:{generation:'g1',seq:3},source:'warehouseDispatches',limit:16,check(){}});
 try{
  const before=await f.native.page('warehouseDispatches',{limit:25});assert.deepEqual(before,await f.fallback.page('warehouseDispatches',{limit:25}));
  assert.equal((await batch()).processed,16);
  assert.deepEqual(await f.native.page('warehouseDispatches',{limit:25}),before,'partial index never publishes a partial/empty list');
  let complete=false,total=16;while(!complete){const r=await batch();assert(r.processed<=16);total+=r.processed;complete=r.complete;}assert.equal(total,6000);
  // A fresh directory represents a new process, avoiding the deliberate
  // missing-schema retry cooldown exercised by the original reader above.
  const scope={tenantId:'tenant-a',principalId:'person-a',permissionRevision:'r1',sessionId:'s1'};
  const fast=createOfflineBusinessDirectory({database:{transaction:fn=>fn(f.db),readQuery:async(s,p)=>{f.statements.push({statement:s,params:p});return f.db.query(s,p);}},session:{scope,isCurrent:()=>true},authorize:async()=>({...scope,expiresAtMs:100000,capabilities:['home.read','home.dispatches.read']}),clock:()=>1000});
  const actual=await fast.page('warehouseDispatches',{limit:25});assert.deepEqual(actual,before);
  const plan=f.sql.prepare('EXPLAIN QUERY PLAN '+f.statements.at(-1).statement).all(...f.statements.at(-1).params);
  assert(plan.some(x=>x.detail.includes('COVERING INDEX offline_home_feed_keys_seq_v2')));
  for(const o of [{limit:25,from:'2026-11-15',to:'2026-11-16'},{limit:25,status:'completed'},{limit:25,employeeId:'e1'},{limit:25,customerId:'c1'}])assert.deepEqual(await fast.page('warehouseDispatches',o),await f.fallback.page('warehouseDispatches',o));
  f.sql.exec("UPDATE offline_home_feed_records_v1 SET seq=2,body=json_set(body,'$.date','2026-11-16') WHERE tenant_id='tenant-a' AND principal_id='person-a' AND id='00000'");
  assert.deepEqual(await fast.page('warehouseDispatches',{limit:25}),await f.fallback.page('warehouseDispatches',{limit:25}),'stale seq forces original reader');
  assert.equal((await batch()).processed,1,'only changed document is reindexed');
  f.sql.exec("DELETE FROM offline_home_feed_records_v1 WHERE tenant_id='tenant-a' AND principal_id='person-a' AND id='00001'");f.head.sourceCounts.warehouseDispatches--;f.update();
  assert.deepEqual(await fast.page('warehouseDispatches',{limit:25}),await f.fallback.page('warehouseDispatches',{limit:25}),'orphaned derived key cannot resurrect deleted record');
  f.sql.exec("UPDATE offline_home_feed_records_v1 SET body=json_set(body,'$.companyId','tenant-b') WHERE tenant_id='tenant-a' AND principal_id='person-a' AND id='00003'");
  assert.deepEqual(await fast.page('warehouseDispatches',{limit:25}),await f.fallback.page('warehouseDispatches',{limit:25}),'same-seq foreign document fails coverage and original tenant gate');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM '+CASHFLOW_SORT_TABLE+" WHERE tenant_id!='tenant-a' OR principal_id!='person-a'").get().n,0);
 }finally{f.sql.close();}
});

test('dispatch current checkpoint, malformed metadata, revocation and changed session still fail closed',async()=>{
 for(const change of [h=>h.feedSeq=4,h=>h.feedGeneration='other',h=>h.availableSources=[],h=>h.sourceCounts.warehouseDispatches='6000',h=>h.sourceProfile='native-isolation-v1']){
  const f=fixture();try{change(f.head);f.update();await assert.rejects(f.native.page('warehouseDispatches'));await assert.rejects(f.fallback.page('warehouseDispatches'));}finally{f.sql.close();}
 }
 const f=fixture();try{const first=await f.native.page('warehouseDispatches',{limit:1});f.head.feedSeq=4;f.update();f.sql.exec('UPDATE offline_home_feed_checkpoint_v1 SET applied_seq=4,reported_seq=4');await assert.rejects(f.native.page('warehouseDispatches',{limit:1,cursor:first.nextCursor}));f.revoke();await assert.rejects(f.native.page('warehouseDispatches'),{code:'permission-denied'});}finally{f.sql.close();}
 const g=fixture();try{g.expireOnRead();await assert.rejects(g.native.page('warehouseDispatches'),{code:'permission-denied'});}finally{g.sql.close();}
});

test('dispatch feed and derived date key update/delete in the existing atomic transaction; failed checkpoint rolls both back',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE offline_home_head_v1(tenant_id TEXT,principal_id TEXT,revision TEXT,generation TEXT,captured_at INTEGER,day_key TEXT,snapshot_json TEXT,PRIMARY KEY(tenant_id,principal_id,revision))');
 let fail=false;const db={query:async(s,p=[])=>sql.prepare(s).all(...p),run:async(s,p=[])=>{if(fail&&s.startsWith('UPDATE offline_home_feed_checkpoint_v1 SET applied_seq'))throw Error('Controlled disk failure');return sql.prepare(s).run(...p);}};
 const transaction=async work=>{sql.exec('BEGIN');try{const r=await work(db);sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}};
 const scope={tenantId:'tenant-a',principalId:'person-a',permissionRevision:'r1'},keys=['tenant-a','person-a'];
 try{
  const feed=await createHomeFeedStorage({transaction,keys,scope});
  const head={...scope,ready:true,generation:'g1',seq:1,asOfDay:'2026-11-15',counts:Object.fromEntries(HOME_FEED_SOURCES.map(s=>[s,s==='warehouseDispatches'?1:0])),sources:HOME_FEED_SOURCES};
  const event={seq:1,generation:'g1',source:'warehouseDispatches',id:'wd1',operation:'upsert',document:{id:'wd1',companyId:'tenant-a',date:'2026-11-15',totalKg:30,unitPrice:67000,amount:2010000}};
  const page={...scope,generation:'g1',after:0,target:1,events:[event]};
  await feed.applyPage(head,page);await feed.publish(head,{snapshot:{finance:{todayKey:head.asOfDay}},overview:{snapshot:{finance:{todayKey:head.asOfDay}}},reports:{},counts:head.counts});
  assert.equal((await feed.backfillSearchPage(head,{source:'warehouseDispatches',cashflowSort:true,limit:16})).processed,1);
  const next={...head,seq:2},update={...page,after:1,target:2,events:[{...event,seq:2,document:{...event.document,date:'2026-11-14'}}]};
  fail=true;await assert.rejects(feed.applyPage(next,update),/Controlled disk failure/);fail=false;
  assert.equal(sql.prepare('SELECT sort_key FROM '+CASHFLOW_SORT_TABLE).get().sort_key,'2026-11-15');assert.equal(sql.prepare('SELECT seq FROM offline_home_feed_records_v1').get().seq,1);
  await feed.applyPage(next,update);assert.equal(sql.prepare('SELECT sort_key FROM '+CASHFLOW_SORT_TABLE).get().sort_key,'2026-11-14');
  assert.equal(JSON.parse(sql.prepare('SELECT body FROM offline_home_feed_records_v1').get().body).amount,2010000);
  await feed.applyPage({...next,seq:3,counts:{...head.counts,warehouseDispatches:0}},{...page,after:2,target:3,events:[{...event,seq:3,operation:'delete',document:null}]});
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM '+CASHFLOW_SORT_TABLE).get().n,0);assert.equal(sql.prepare('SELECT COUNT(*) n FROM offline_home_feed_records_v1').get().n,0);
 }finally{sql.close();}
});
