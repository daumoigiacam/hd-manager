import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import{DatabaseSync}from'node:sqlite';import{createHash}from'node:crypto';
import{DEFAULT_PROCESSING_INVENTORY_GROUPS,existingImportGroups}from'../src/features/warehouse/warehouseImportOriginalPlan.js';
import{createOfflineWarehouseImportRepository}from'../src/data/offlineWarehouseImportRepository.js';
test('Offline import defaults equal the existing App business defaults; no fabricated company settings',()=>{
 const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const literal=app.match(/const DEFAULT_PROCESSING_INVENTORY_GROUPS = (\[[^;]+\]);/)[1];
 assert.deepEqual([...DEFAULT_PROCESSING_INVENTORY_GROUPS],JSON.parse(literal.replaceAll("'",'"')));
 assert.deepEqual(existingImportGroups({}),[...DEFAULT_PROCESSING_INVENTORY_GROUPS]);
 assert.deepEqual(existingImportGroups({productGroups:['Gà','  Custom group  ',null]}),[...DEFAULT_PROCESSING_INVENTORY_GROUPS,'Custom group']);
});
test('scoped committed company without optional productGroups retains default import choices; revoked session rejects',async()=>{
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE offline_home_head_v1(tenant_id,principal_id,revision,generation,captured_at,day_key,snapshot_json);CREATE TABLE offline_home_feed_checkpoint_v1(tenant_id,principal_id,revision,generation,applied_seq,reported_seq);CREATE TABLE offline_home_feed_records_v1(tenant_id,principal_id,generation,source,id,seq,body);');
 const scope={tenantId:'t1',principalId:'u1',permissionRevision:'r1',sessionId:'s1'},keys=['t1','u1'];let current=true;
 sql.prepare('INSERT INTO offline_home_head_v1 VALUES(?,?,?,?,?,?,?)').run(...keys,'r1','g1',1,'2026-11-15',JSON.stringify({feedGeneration:'g1',feedSeq:1,availableSources:['warehouseImports','expenses','companies'],sourceCounts:{warehouseImports:0,expenses:0,companies:1}}));
 sql.prepare('INSERT INTO offline_home_feed_checkpoint_v1 VALUES(?,?,?,?,?,?)').run(...keys,'r1','g1',1,1);
 const insert=sql.prepare('INSERT INTO offline_home_feed_records_v1 VALUES(?,?,?,?,?,?,?)');
 insert.run(...keys,'g1','companies','t1',1,JSON.stringify({id:'t1',companyId:'t1'}));
 insert.run('t2','u2','g1','companies','t2',1,JSON.stringify({id:'t2',companyId:'t2',productGroups:['Foreign only']}));
 const db={query:async(s,p=[])=>sql.prepare(s).all(...p),run:async(s,p=[])=>sql.prepare(s).run(...p)};
 const authorize=async()=>({...scope,projectId:'demo-test',expiresAtMs:100000,capabilities:['home.read','home.imports.read','home.cashflow.read'],appSession:{user:{id:'e1',companyId:'t1'}}});
 try{
  const repo=await createOfflineWarehouseImportRepository({database:{transaction:async work=>work(db)},session:{scope,isCurrent:()=>current},deviceId:'d1',employeeId:'e1',projectId:'demo-test',development:true,now:()=>1000,digest:s=>createHash('sha256').update(s).digest('hex'),authorize});
  assert.deepEqual((await repo.groups()).items,[...DEFAULT_PROCESSING_INVENTORY_GROUPS]);
  assert(!JSON.parse(sql.prepare("SELECT body FROM offline_home_feed_records_v1 WHERE tenant_id='t1'").get().body).productGroups,'no configuration is written or invented');
  current=false;await assert.rejects(repo.groups(),{code:'permission-denied'});
 }finally{sql.close();}
});
