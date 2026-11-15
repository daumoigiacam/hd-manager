import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createOfflineBusinessDirectory} from '../src/data/offlineBusinessDirectory.js';
import {backfillCashflowSortPage,cashflowSortUpserts,CASHFLOW_SORT_TABLE} from '../src/data/cashflowSortProjection.js';
import {createHomeFeedStorage} from '../src/data/offlineHomeFeedStorage.js';
import {HOME_FEED_SOURCES} from '../src/data/homeFeedContract.js';

function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE offline_home_head_v1(tenant_id,principal_id,revision,generation,captured_at,day_key,snapshot_json,PRIMARY KEY(tenant_id,principal_id,revision));
 CREATE TABLE offline_home_feed_checkpoint_v1(tenant_id,principal_id,revision,generation,applied_seq,reported_seq);
 CREATE TABLE offline_home_feed_records_v1(tenant_id,principal_id,generation,source,id,seq,body,PRIMARY KEY(tenant_id,principal_id,generation,source,id));`);
 const scope={tenantId:'tenant-a',principalId:'person-a',permissionRevision:'r1',sessionId:'s1'},keys=[scope.tenantId,scope.principalId];
 const dates=[{date:'2026-11-15'},{cashflowDate:'2026-11-14',date:'2026-11-15'},{paymentDate:'2026-11-14T18:30:00Z'},
  {date:'15/11/2026'},{date:{seconds:1794672000}},{date:'invalid',createdAt:'2026-11-15'},
  {paymentProvider:'payos',date:'2026-11-15',rawWebhook:{data:{paymentLink:{transactions:[{transactionDateTime:'2026-11-14T18:30:00Z'},{transactionDateTime:'2026-11-13T18:30:00Z'}]}}}},
  {paymentProvider:'sepay',paymentDate:'2026-11-14T18:30:00Z',date:'2026-11-14'}];
 const head={generation:'g1',seq:1,counts:{payments:80,expenses:40}};
 const saveHead=()=>{
  sql.prepare('INSERT OR REPLACE INTO offline_home_head_v1 VALUES(?,?,?,?,?,?,?)').run(...keys,'r1','g1',100,'2026-11-15',JSON.stringify({feedGeneration:'g1',feedSeq:head.seq,availableSources:['payments','expenses'],sourceCounts:head.counts}));
  sql.exec('DELETE FROM offline_home_feed_checkpoint_v1');sql.prepare('INSERT INTO offline_home_feed_checkpoint_v1 VALUES(?,?,?,?,?,?)').run(...keys,'r1','g1',head.seq,head.seq);
 };
 const insert=(source,id,document,tenant=keys[0],principal=keys[1],seq=1)=>sql.prepare('INSERT OR REPLACE INTO offline_home_feed_records_v1 VALUES(?,?,?,?,?,?,?)').run(tenant,principal,'g1',source,id,seq,JSON.stringify({id,companyId:tenant,...document}));
 for(const[source,count]of Object.entries(head.counts))for(let i=0;i<count;i++)insert(source,String(i).padStart(3,'0'),{...dates[i%dates.length],amount:i%3===0?0:i*67000,empId:'e'+i%3,status:'approved',note:'row '+i});
 insert('payments','foreign',{date:'2026-11-15',amount:999},'tenant-b','person-b');
 insert('payments','other-principal',{date:'2026-11-15',amount:888},'tenant-a','person-b');saveHead();
 const db={query:async(s,p=[])=>sql.prepare(s).all(...p),run:async(s,p=[])=>sql.prepare(s).run(...p)};
 let allowed=true,now=1000,queries=[];
 const session={scope,isCurrent:()=>allowed},authorize=async()=>({...scope,expiresAtMs:100000,capabilities:['home.read','home.cashflow.read']});
 const reader=()=>createOfflineBusinessDirectory({database:{transaction:fn=>fn(db),readQuery:async(s,p)=>{queries.push({statement:s,params:p});return db.query(s,p);}},session,authorize,clock:()=>now});
 const original=createOfflineBusinessDirectory({database:{transaction:fn=>fn(db)},session,authorize,clock:()=>now});
 const backfill=async(source)=>{let total=0;for(let n=0;n<20;n++){sql.exec('BEGIN');try{const result=await backfillCashflowSortPage(db,{keys,head,source,limit:16,check(){}});sql.exec('COMMIT');assert(result.processed<=16);total+=result.processed;if(result.complete)return total;}catch(e){sql.exec('ROLLBACK');throw e;}}throw Error('Unbounded backfill');};
 return{sql,db,head,keys,reader,original,backfill,insert,saveHead,queries,revoke:()=>{allowed=false;},advanceClock:()=>{now+=6000;}};
}

test('optional date index preserves exact original pages before, during and after bounded backfill',async()=>{
 const f=fixture();try{
  const before=f.reader();const first=await before.page('payments',{from:'2026-11-15',to:'2026-11-16',limit:15});
  assert.deepEqual(first,await f.original.page('payments',{from:'2026-11-15',to:'2026-11-16',limit:15}));
  const partial=await backfillCashflowSortPage(f.db,{keys:f.keys,head:f.head,source:'payments',limit:16,check(){}});assert.equal(partial.processed,16);
  assert.deepEqual(await f.reader().page('payments',{limit:15}),await f.original.page('payments',{limit:15}),'uncovered complement remains exact');
  assert.equal(await f.backfill('payments'),64);assert.equal(await f.backfill('expenses'),40);
  f.advanceClock();
  for(const source of ['payments','expenses'])for(const options of [{limit:15,includeCount:true},{from:'2026-11-15',to:'2026-11-16',limit:11},{from:'2026-11-14',to:'2026-11-15',limit:7},{text:'row 2',limit:9},{employeeId:'e1',limit:13},{status:'approved',limit:17}]){
   let page=await f.reader().page(source,options),expected=await f.original.page(source,options);assert.deepEqual(page,expected);
   while(page.hasMore){page=await f.reader().page(source,{...options,cursor:page.nextCursor});expected=await f.original.page(source,{...options,cursor:expected.nextCursor});assert.deepEqual(page,expected);}
  }
  const batch=[{source:'payments',options:{limit:15}},{source:'expenses',options:{limit:15}}];
  assert.deepEqual(await f.reader().pageBatch(batch),await f.original.pageBatch(batch));
  const full=f.queries.find(q=>q.statement.includes('cashflow_feed_keys')&&!q.statement.includes('row 2'));
  assert(f.sql.prepare('EXPLAIN QUERY PLAN '+full.statement).all(...full.params).some(row=>String(row.detail).includes('COVERING INDEX offline_home_feed_keys_seq_v2')));
 }finally{f.sql.close();}
});

test('changed and deleted live keys cannot publish obsolete indexed rows; no tenant/principal expansion',async()=>{
 const f=fixture();try{
  await f.backfill('payments');await f.backfill('expenses');
  f.head.seq=2;f.insert('payments','079',{date:'2026-11-13',amount:12345},undefined,undefined,2);f.saveHead();
  assert.deepEqual(await f.reader().page('payments',{from:'2026-11-15',to:'2026-11-16',limit:100}),await f.original.page('payments',{from:'2026-11-15',to:'2026-11-16',limit:100}),'stale projection uses original date');
  f.sql.prepare("DELETE FROM offline_home_feed_records_v1 WHERE tenant_id=? AND principal_id=? AND source='payments' AND id='078'").run(...f.keys);f.head.counts.payments--;f.saveHead();
  f.sql.prepare("UPDATE offline_home_feed_records_v1 SET body=json_set(body,'$.companyId','tenant-b') WHERE tenant_id=? AND principal_id=? AND source='payments' AND id='077'").run(...f.keys);
  const actual=await f.reader().page('payments',{limit:100});assert.deepEqual(actual,await f.original.page('payments',{limit:100}));assert(!actual.items.some(row=>['foreign','other-principal','078','077'].includes(row.id)));
  assert.equal(await f.backfill('payments'),1,'unrelated completed rows are not reparsed');
  const row=f.sql.prepare("SELECT tenant_id,principal_id,generation,source,id,seq,body FROM offline_home_feed_records_v1 WHERE tenant_id=? AND principal_id=? AND source='payments' AND id='079'").get(...f.keys);
  for(const set of cashflowSortUpserts([Object.values(row)]))await f.db.run(set.statement,set.values);
  assert.deepEqual(await f.reader().page('payments',{limit:100}),await f.original.page('payments',{limit:100}));
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM '+CASHFLOW_SORT_TABLE+' WHERE tenant_id<>? OR principal_id<>?').get(...f.keys).n,0);
  f.revoke();await assert.rejects(f.reader().page('payments'),{code:'permission-denied'});
 }finally{f.sql.close();}
});

test('existing feed transaction updates/deletes date keys atomically with canonical records and checkpoint',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE offline_home_head_v1(tenant_id TEXT,principal_id TEXT,revision TEXT,generation TEXT,captured_at INTEGER,day_key TEXT,snapshot_json TEXT,PRIMARY KEY(tenant_id,principal_id,revision))');
 let fail=false;const db={query:async(s,p=[])=>sql.prepare(s).all(...p),run:async(s,p=[])=>{if(fail&&s.startsWith('UPDATE offline_home_feed_checkpoint_v1 SET applied_seq'))throw Error('Controlled disk failure');return sql.prepare(s).run(...p);}};
 const transaction=async work=>{sql.exec('BEGIN');try{const value=await work(db);sql.exec('COMMIT');return value;}catch(error){sql.exec('ROLLBACK');throw error;}};
 const scope={tenantId:'tenant-a',principalId:'person-a',permissionRevision:'r1'},keys=['tenant-a','person-a'];
 try{
  const feed=await createHomeFeedStorage({transaction,keys,scope});
  const head={...scope,ready:true,generation:'g1',seq:1,asOfDay:'2026-11-15',counts:Object.fromEntries(HOME_FEED_SOURCES.map(source=>[source,source==='payments'?1:0])),sources:HOME_FEED_SOURCES};
  const event={seq:1,generation:'g1',source:'payments',id:'p1',operation:'upsert',document:{id:'p1',companyId:'tenant-a',date:'2026-11-15',amount:67000}};
  const page={...scope,generation:'g1',after:0,target:1,events:[event]};
  await feed.applyPage(head,page);await feed.publish(head,{snapshot:{finance:{todayKey:head.asOfDay}},overview:{snapshot:{finance:{todayKey:head.asOfDay}}},reports:{},counts:head.counts});
  sql.exec("DELETE FROM offline_business_search_v1; DELETE FROM offline_business_search_coverage_v1 WHERE source='payments' AND version=1");
  const backfill=await feed.backfillSearchPage(head,{source:'payments',cashflowSort:true,limit:16});assert.equal(backfill.processed,1);assert.equal(backfill.complete,false);
  const searchBackfill=await feed.backfillSearchPage(head,{source:'payments',cashflowSort:true,limit:16});assert.equal(searchBackfill.processed,1);assert.equal(searchBackfill.complete,true);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM offline_business_search_v1 WHERE source='payments'").get().n,1);
  assert((await feed.backfillSearchPage(head,{source:'payments',cashflowSort:true,limit:16})).complete,'original search coverage remains part of completion');
  const next={...head,seq:2},update={...page,after:1,target:2,events:[{...event,seq:2,document:{...event.document,date:'2026-11-14'}}]};
  fail=true;await assert.rejects(feed.applyPage(next,update),/Controlled disk failure/);fail=false;
  assert.equal(sql.prepare('SELECT sort_key FROM '+CASHFLOW_SORT_TABLE).get().sort_key,'2026-11-15');assert.equal(sql.prepare('SELECT seq FROM offline_home_feed_records_v1').get().seq,1);
  await feed.applyPage(next,update);assert.equal(sql.prepare('SELECT sort_key FROM '+CASHFLOW_SORT_TABLE).get().sort_key,'2026-11-14');
  assert.equal(JSON.parse(sql.prepare('SELECT body FROM offline_home_feed_records_v1').get().body).amount,67000);
  await feed.applyPage({...next,seq:3,counts:{...head.counts,payments:0}},{...page,after:2,target:3,events:[{...event,seq:3,operation:'delete',document:null}]});
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM '+CASHFLOW_SORT_TABLE).get().n,0);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM offline_home_feed_records_v1').get().n,0);
 }finally{sql.close();}
});
