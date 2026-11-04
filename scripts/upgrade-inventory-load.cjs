// Runs the unchanged production inventory transaction against a throwaway
// local namespace. This is a domain contention test, not full app capacity.
const fs=require('node:fs/promises');
const os=require('node:os');
const assert=require('node:assert/strict');
const {performance,monitorEventLoopDelay}=require('node:perf_hooks');
const admin=require('../functions/node_modules/firebase-admin');
const {executeAtomicInventoryOperation,buildInventoryBalanceId}=require('../functions/inventoryTransactions');
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8185')throw Error('Exact local verification Emulator required');
const project='demo-hdm-perf-verification',appId=`upgrade-inventory-${Date.now()}`,companyId='synthetic-company';
const app=admin.initializeApp({projectId:project},appId),db=app.firestore();
db.settings({preferRest:false});
const collectionPath=(id,name)=>`artifacts/${id}/public/data/${name}`;
const ref=(name,id)=>db.collection(collectionPath(appId,name)).doc(id);
const output='test-results/performance-upgrade-20261103/inventory-domain-load.json';
const report={startedAt:new Date().toISOString(),project,appId,syntheticOnly:true,productionRequests:0,
 conditions:'Unmodified executeAtomicInventoryOperation, Admin SDK gRPC → loopback Firestore Emulator. 50/100/300/500 distinct employee identities; 10% share one stock balance. No deployed endpoint, app auth, browser or cloud latency simulated.',
 limitations:['This is inventory domain integration, not full mixed-workflow capacity acceptance.','Admin SDK bypasses Rules; authorization inside the real transaction is exercised.','Logical transaction get/set calls include retries and are not billed reads/writes.','Generator CPU/RAM is measured; Java Emulator CPU/RAM is not included.','No claim about Production capacity or 500 concurrent authenticated UI sessions.'],tiers:[],status:'RUNNING'};
const persist=()=>fs.writeFile(output,JSON.stringify(report,null,2));
const summary=values=>{const a=[...values].sort((a,b)=>a-b);return{n:a.length,p50:a[Math.ceil(a.length*.5)-1]??null,p95:a[Math.ceil(a.length*.95)-1]??null,max:a.at(-1)??null}};
async function seed(users){
 await ref('companies',companyId).set({companyId});
 let batch=db.batch(),writes=0;
 const put=async(r,v)=>{batch.set(r,v);if(++writes===400){await batch.commit();batch=db.batch();writes=0}};
 const warehouses=new Set(['shared']);
 for(let i=0;i<users;i++){
  await put(ref('employees',`u${i}`),{companyId,role:'owner',position:'Chủ doanh nghiệp'});
  if(i%10!==0)warehouses.add(`w${i}`);
 }
 for(const warehouseId of warehouses){const id=buildInventoryBalanceId({companyId,warehouseId,productId:`p${users}`,unit:'con'});
  await put(ref('inventoryBalances',id),{id,companyId,warehouseId,productId:`p${users}`,unit:'con',availableQuantity:users+10,revision:0});
 }
 if(writes)await batch.commit();
}
async function main(){try{
 for(const users of[50,100,300,500]){
  if(os.freemem()<1024**3){report.tiers.push({users,status:'BLOCKED_HOST_MEMORY_GUARD'});await persist();break}
  await seed(users);
  const counters={attempts:0,getCalls:0,setCalls:0,activeTransactions:0,peakActiveTransactions:0};
  const measuredDb={collection:path=>db.collection(path),runTransaction:callback=>db.runTransaction(async tx=>{
   counters.attempts++;counters.activeTransactions++;counters.peakActiveTransactions=Math.max(counters.peakActiveTransactions,counters.activeTransactions);
   const wrapped={get:r=>{counters.getCalls++;return tx.get(r)},set:(...args)=>{counters.setCalls++;return tx.set(...args)}};
   try{return await callback(wrapped)}finally{counters.activeTransactions--}
  })};
  const samples=[],sample=()=>samples.push({at:new Date().toISOString(),rss:process.memoryUsage().rss,heapUsed:process.memoryUsage().heapUsed,hostFree:os.freemem()});
  const loop=monitorEventLoopDelay({resolution:20});loop.enable();sample();const timer=setInterval(sample,1000),cpu=process.cpuUsage(),start=performance.now();
  const outcomes=await Promise.all(Array.from({length:users},async(_,i)=>{
   const claims={companyId,appUserId:`u${i}`,accountType:'employee',role:'owner'},key=`tier-${users}-user-${i}`,warehouseId=i%10===0?'shared':`w${i}`;
   const payload={operationType:'OUTBOUND',clientMutationId:key,documentId:key,collectionName:'warehouseDispatches',document:{customerId:`c${i}`,quantity:1,weightKg:2,sourceOrderRequestId:`or${i}`},movements:[{warehouseId,productId:`p${users}`,unit:'con',quantity:1}]};
   const before=performance.now();
   try{
    const value=await executeAtomicInventoryOperation({db:measuredDb,FieldValue:admin.firestore.FieldValue,collectionPath,appId,claims,payload});
    let replay=null;
    if(i%10===1)replay=await executeAtomicInventoryOperation({db:measuredDb,FieldValue:admin.firestore.FieldValue,collectionPath,appId,claims,payload});
    return{i,warehouseId,ok:true,ms:performance.now()-before,operationId:value.operationId,replayed:replay?.duplicate===true};
   }catch(e){return{i,warehouseId,ok:false,ms:performance.now()-before,code:e.code||e.name}}
  }));
  clearInterval(timer);sample();loop.disable();const durationMs=performance.now()-start,cpuUsage=process.cpuUsage(cpu);
  const accepted=outcomes.filter(x=>x.ok),expected=new Map();for(const row of accepted)expected.set(row.warehouseId,(expected.get(row.warehouseId)||0)+1);
  const balances=await db.collection(collectionPath(appId,'inventoryBalances')).where('productId','==',`p${users}`).get();
  for(const balance of balances.docs){const b=balance.data();assert.equal(b.availableQuantity,users+10-(expected.get(b.warehouseId)||0));assert.equal(b.revision,expected.get(b.warehouseId)||0)}
  const docs=await db.collection(collectionPath(appId,'warehouseDispatches')).get();
  const tierDocs=docs.docs.filter(d=>d.id.startsWith(`tier-${users}-`));assert.equal(tierDocs.length,accepted.length);
  const ledger=await db.collection(collectionPath(appId,'inventoryLedger')).where('productId','==',`p${users}`).get();assert.equal(ledger.size,accepted.length);
  for(const row of accepted)if(row.i%10===1)assert.equal(row.replayed,true);
  report.tiers.push({users,durationMs,latencyMs:summary(outcomes.map(x=>x.ms)),accepted:accepted.length,errors:outcomes.filter(x=>!x.ok),errorRate:(users-accepted.length)/users,
   counters,generatorCpuMicroseconds:cpuUsage,generatorCpuOneCorePercent:(cpuUsage.user+cpuUsage.system)/durationMs/10,eventLoopP95Ms:loop.percentile(95)/1e6,samples,
   integrity:{balances:balances.size,dispatches:tierDocs.length,ledger:ledger.size,replayed:accepted.filter(x=>x.replayed).length,negativeStock:0,missingOrDuplicatedCommittedDocuments:0},
   status:accepted.length===users?'DOMAIN_INTEGRITY_MEASURED_NOT_FULL_APP_ACCEPTANCE':'DOMAIN_CAPACITY_NOT_PASS_INTEGRITY_CHECKED'});
  await persist();
 }
 report.status='MEASURED_LOCAL_DOMAIN_SUBSET_NOT_FULL_APP_ACCEPTANCE';
}catch(e){report.status='FAILED';report.error={name:e.name,message:e.message};process.exitCode=1}
finally{report.endedAt=new Date().toISOString();await persist();await app.delete();console.log(JSON.stringify({status:report.status,tiers:report.tiers.map(t=>({users:t.users,accepted:t.accepted,latencyMs:t.latencyMs,status:t.status}))}))}}
main().catch(error=>{console.error(error.message);process.exitCode=1});
