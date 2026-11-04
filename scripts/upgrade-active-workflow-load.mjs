import fs from 'node:fs/promises';import os from 'node:os';import assert from 'node:assert/strict';import {createRequire}from'node:module';
import {performance,monitorEventLoopDelay}from'node:perf_hooks';
import {initializeTestEnvironment}from'@firebase/rules-unit-testing';
import {doc,getDocFromServer,runTransaction,collection,query,where,onSnapshot,terminate}from'firebase/firestore';
import {commitOrderRequestWithDefaults,payloadFingerprint,configScopeFingerprint}from'../src/utils/customerProductAutoSync.js';
import {commitIdempotentWarehouseDispatchCreate}from'../src/features/warehouse/warehouseDispatchCreateRepository.js';
import {commitAtomicWrites}from'../src/utils/atomicSave.js';
import {createSearchRecordIndex,getProductSearchFields}from'../src/services/searchEngine.js';
import {createPendingWriteScheduler}from'../src/services/pendingWriteScheduler.js';
import {pendingWriteFailure,canAutomaticallyRetryWrite}from'../src/utils/pendingWriteRetry.js';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8185')throw Error('Exact local verification Emulator required');
const require=createRequire(import.meta.url),admin=require('../functions/node_modules/firebase-admin');
const project='demo-hdm-perf-verification',appId=`upgrade-active-${Date.now()}`,companyId='synthetic-active-company';
const app=admin.initializeApp({projectId:project},appId),seedDb=app.firestore();
// No rules text supplied: retain the existing Emulator rules exactly.
const env=await initializeTestEnvironment({projectId:project,firestore:{host:'127.0.0.1',port:8185}});
const root=`artifacts/${appId}/public/data`,ref=(db,c,id)=>doc(db,root,c,id);
const recovery=process.argv.includes('--retry-recovery');
const output=`test-results/performance-upgrade-20261103/active-workflow-load${recovery?'-recovery':''}.json`;
const report={at:new Date().toISOString(),appId,project,syntheticOnly:true,productionRequests:0,status:'RUNNING',recoveryPolicy:recovery?'Actual app pending-write scheduler and finite jittered retry; latency includes waiting and all failed attempts':'Single SDK transaction call (SDK internal retries only)',tiers:[],
 workload:'Distinct SDK clients with mocked employee authentication; actual current request/config-sync, dispatch-create and order/payment atomic repositories; Emulator Rules enforced. Read, local search, per-client realtime, replay and payload integrity checked.',
 limitations:['Mocked authentication is not identityLogin/password/OTP throughput.','No deployed backend or cloud-capacity conclusion.','Client and Emulator share the Windows host.','Database counters are logical SDK calls, not billed reads/writes.','Inventory is document-derived in the active app; legacy server inventory endpoints are not used.','UI responsiveness and browser/WebView memory are tested separately.']};
const persist=()=>fs.writeFile(output,JSON.stringify(report,null,2));
const stats=values=>{const a=values.slice().sort((a,b)=>a-b);return{n:a.length,p50Ms:a[Math.ceil(.5*a.length)-1]??null,p95Ms:a[Math.ceil(.95*a.length)-1]??null,maxMs:a.at(-1)??null}};
const baseCustomer=i=>({id:`c${i}`,companyId,name:`Synthetic customer ${i}`,priceOverrides:{p:{billingUnit:'Con',pricingUnit:'Con',unitPrice:90000,price:90000,defaultOrderUnit:'Con'}}});
let product;
async function seed(n){
 let batch=seedDb.batch(),count=0;const put=async(c,id,v)=>{batch.set(seedDb.doc(`${root}/${c}/${id}`),v);if(++count===350){await batch.commit();batch=seedDb.batch();count=0}};
 await put('companies',companyId,{id:companyId,companyId,name:'Synthetic load company'});
 product={id:'p',companyId,name:'Synthetic product',unit:'Con',stockUnit:'Con',importUnit:'Con',price:100000,openingStock:n*10};await put('products','p',product);
 for(let i=0;i<n;i++){await put('employees',`u${i}`,{id:`u${i}`,companyId,role:'owner',position:'Chủ doanh nghiệp',status:'active'});await put('customers',`c${i}`,baseCustomer(i))}
 if(count)await batch.commit();
}
try{
 for(const n of[50,100,300,500]){
  if(os.freemem()<1536*1024**2){report.tiers.push({users:n,status:'BLOCKED_HOST_MEMORY_GUARD'});await persist();break}
  await seed(n);
  const clients=Array.from({length:n},(_,i)=>env.authenticatedContext(`active-u${i}`,{companyId,appUserId:`u${i}`,identityId:`active-id${i}`,accountType:'employee',role:'owner'}).firestore());
  const counters={transactionAttempts:0,transactionGetCalls:0,transactionSetCalls:0,transactionUpdateCalls:0,serverReads:0,realtimeStarts:0,realtimeStops:0,queueRetries:0};
  const timings={read:[],request:[],dispatch:[],orderPayment:[],search:[],total:[]},failures=[],samples=[];
  const sample=()=>samples.push({at:new Date().toISOString(),rssBytes:process.memoryUsage().rss,heapBytes:process.memoryUsage().heapUsed,hostFreeBytes:os.freemem()});
  const timer=setInterval(sample,1000),loop=monitorEventLoopDelay({resolution:20});loop.enable();sample();const beforeCpu=process.cpuUsage(),start=performance.now();
  const timed=async(kind,work)=>{const at=performance.now();try{return await work()}finally{timings[kind].push(performance.now()-at)}};
  const outcomes=await Promise.all(clients.map(async(db,i)=>{
   const started=performance.now(),requestId=`r${n}_${i}`,dispatchId=`wd_${companyId}_d${n}_${i}`,orderId=`o${n}_${i}`,paymentId=`pay${n}_${i}`;
   let stop=null,realtimeSeen=false,watchError=null,stage='read',realtimeTimeout;
   const commit=work=>{
    if(!recovery)return work();
    let pending={actorUid:`u${i}`},scheduler;
    return new Promise((resolve,reject)=>{
     scheduler=createPendingWriteScheduler({nextDelay:()=>pending?Math.max(0,(pending.nextRetryAt||0)-Date.now()):null,flush:async()=>{
      if(!pending||!canAutomaticallyRetryWrite(pending,`u${i}`))return;
      try{const value=await work();pending=null;resolve(value)}catch(error){pending={...pending,...pendingWriteFailure(pending,error)};counters.queueRetries++;
       if(!canAutomaticallyRetryWrite(pending,`u${i}`,Infinity)){pending=null;reject(error)}
      }
     },onError:reject});scheduler.wake();
    }).finally(()=>scheduler.close());
   };
   const transaction=callback=>runTransaction(db,tx=>{counters.transactionAttempts++;return callback({get:r=>{counters.transactionGetCalls++;return tx.get(r)},set:(...a)=>{counters.transactionSetCalls++;tx.set(...a)},update:(...a)=>{counters.transactionUpdateCalls++;tx.update(...a)}})});
   try{
    await timed('read',async()=>{const p=await getDocFromServer(ref(db,'products','p'));counters.serverReads++;assert.equal(p.data().price,100000)});
    const ready=new Promise((resolve,reject)=>{realtimeTimeout=setTimeout(()=>reject(Error('Realtime fixture timeout')),recovery?300000:30000);
     stop=onSnapshot(query(collection(db,root,'orderRequests'),where('companyId','==',companyId),where('customerId','==',`c${i}`)),snapshot=>{if(snapshot.docs.some(d=>d.id===requestId)&&!snapshot.metadata.hasPendingWrites&&!snapshot.metadata.fromCache){realtimeSeen=true;clearTimeout(realtimeTimeout);resolve()}},e=>{watchError=e.code;clearTimeout(realtimeTimeout);reject(e)});
    });ready.catch(()=>{});counters.realtimeStarts++;
    const payload={id:requestId,companyId,customerId:`c${i}`,empId:`u${i}`,date:'2026-11-03',items:[{productId:'p',quantity:3,quantityUnit:'Con',billingUnit:'Con',unitPrice:100000,sizeLabel:'To'}]};
    const command={companyId,requestId,payload,mutationId:`cmd${n}_${i}`,fingerprint:await payloadFingerprint(payload),expectedOrderRevision:null,expectedCustomerConfig:configScopeFingerprint(baseCustomer(i)),syncDefaults:true,actorId:`u${i}`,now:'2026-11-03T00:00:00.000Z'};
    stage='request';await timed('request',()=>commit(()=>commitOrderRequestWithDefaults({command,companyId,transaction,reference:(c,id)=>ref(db,c,id)})));
    const dispatch={id:dispatchId,companyId,clientMutationId:`d${n}_${i}`,customerId:`c${i}`,productId:'p',quantity:3,pieceCount:3,quantityUnit:'Con',weightKg:6,sourceOrderRequestId:requestId,date:'2026-11-03',empId:`u${i}`,createdAt:'2026-11-03T00:00:00.000Z'};
    const commitDispatch=()=>commitIdempotentWarehouseDispatchCreate({runTransaction:transaction,reference:()=>ref(db,'warehouseDispatches',dispatchId),payload:dispatch,companyId,documentId:dispatchId});
    stage='dispatch';await timed('dispatch',()=>commit(commitDispatch));
    const order={id:orderId,companyId,customerId:`c${i}`,empId:`u${i}`,amount:300000,date:'2026-11-03',items:payload.items};
    const payment={id:paymentId,companyId,customerId:`c${i}`,orderId,amount:100000,method:'cash',date:'2026-11-03',approvalStatus:'approved',status:'completed',createdByEmpId:`u${i}`};
    const writes=[{collectionName:'orders',documentId:orderId,payload:order},{collectionName:'payments',documentId:paymentId,payload:payment,ifAbsent:true}];
    stage='orderPayment';await timed('orderPayment',()=>commit(()=>commitAtomicWrites({writes,companyId,transaction,reference:w=>ref(db,w.collectionName,w.documentId)})));
    await timed('search',async()=>{const index=createSearchRecordIndex([product],getProductSearchFields);assert.equal(index.search('synthetic product')[0].id,'p')});
    stage='replay';if(i%10===0){const replay=await commit(commitDispatch);assert.equal(replay.replay,true);await commit(()=>commitOrderRequestWithDefaults({command,companyId,transaction,reference:(c,id)=>ref(db,c,id)}))}
    await ready;assert.equal(watchError,null);return{i,ok:true,realtimeSeen,requestId,dispatchId,orderId,paymentId};
   }catch(e){failures.push({i,stage,code:e.code||e.name,message:e.message.slice(0,180)});return{i,ok:false,realtimeSeen}}
   finally{clearTimeout(realtimeTimeout);if(stop){stop();counters.realtimeStops++}timings.total.push(performance.now()-started)}
  }));
  clearInterval(timer);loop.disable();sample();const cpu=process.cpuUsage(beforeCpu),durationMs=performance.now()-start;
  const collections={};for(const name of['orderRequests','warehouseDispatches','orders','payments','customers'])collections[name]=(await seedDb.collection(`${root}/${name}`).get()).docs.map(d=>d.data());
  for(const row of outcomes.filter(r=>r.ok)){
   const request=collections.orderRequests.find(d=>d.id===row.requestId),dispatch=collections.warehouseDispatches.find(d=>d.id===row.dispatchId),order=collections.orders.find(d=>d.id===row.orderId),payment=collections.payments.find(d=>d.id===row.paymentId),customer=collections.customers.find(d=>d.id===`c${row.i}`);
   assert.equal(request.syncVersion,1);assert.equal(request.items[0].quantity,3);assert.equal(request.items[0].sizeLabel,'To');assert.equal(customer.priceOverrides.p.price,100000);
   assert.equal(dispatch.quantity,3);assert.equal(dispatch.sourceOrderRequestId,row.requestId);assert.equal(order.amount-payment.amount,200000);
  }
  const accepted=outcomes.filter(r=>r.ok).length;
  report.tiers.push({users:n,accepted,durationMs,errorRate:failures.length/n,failures,counters,latency:Object.fromEntries(Object.entries(timings).map(([k,v])=>[k,stats(v)])),generatorCpuMicroseconds:cpu,generatorCpuOneCorePercent:(cpu.user+cpu.system)/durationMs/10,eventLoopP95Ms:loop.percentile(95)/1e6,samples,
   integrity:{checkedCompletedWorkflows:accepted,realtimeDelivered:outcomes.filter(r=>r.realtimeSeen).length,listenerBalance:counters.realtimeStarts-counters.realtimeStops,incorrectVerifiedQuantityPriceDebt:0},
   status:accepted===n?'MEASURED_CURRENT_REPOSITORIES_NOT_AUTH_OR_CLOUD_ACCEPTANCE':'NOT_PASS'});await persist();
  // Free each tier's SDK clients/listeners before constructing the next tier.
  await Promise.all(clients.map(db=>typeof db.terminate==='function'?db.terminate():terminate(db)));
  if(!accepted)break;
 }
 report.status='MEASURED_LOCAL_ACTIVE_REPOSITORIES_NOT_FULL_APP_ACCEPTANCE';
}catch(e){report.status='FAILED';report.error={name:e.name,message:e.message};process.exitCode=1}
finally{report.endedAt=new Date().toISOString();await persist();await env.cleanup();await app.delete();console.log(JSON.stringify({status:report.status,tiers:report.tiers.map(t=>({users:t.users,accepted:t.accepted,status:t.status,latency:t.latency?.total,failures:t.failures?.slice(0,2)}))}))}
