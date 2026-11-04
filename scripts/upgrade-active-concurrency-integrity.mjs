import fs from'node:fs/promises';import path from'node:path';import crypto from'node:crypto';import assert from'node:assert/strict';import{createRequire}from'node:module';
import{parse}from'@babel/parser';import traverseModule from'@babel/traverse';
import{initializeTestEnvironment}from'@firebase/rules-unit-testing';import{doc,runTransaction,terminate}from'firebase/firestore';
import{commitOrderRequestWithDefaults,payloadFingerprint,configScopeFingerprint,orderRevision}from'../src/utils/customerProductAutoSync.js';
import{commitIdempotentWarehouseDispatchCreate}from'../src/features/warehouse/warehouseDispatchCreateRepository.js';
import{commitAtomicWrites}from'../src/utils/atomicSave.js';import{isWarehouseDispatchAlreadyLinked}from'../src/utils/warehouseDispatchOrders.js';
import{productStockBalance}from'../src/utils/productMeasures.js';import{appFunction}from'../tests/helpers/app-source-function.mjs';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8185')throw Error('Only isolated demo Emulator allowed');
const project='demo-hdm-perf-verification',appId=`upgrade-integrity-${Date.now()}`,companyId='synthetic-integrity',root=`artifacts/${appId}/public/data`;
const require=createRequire(import.meta.url),admin=require('../functions/node_modules/firebase-admin'),app=admin.initializeApp({projectId:project},appId),seed=app.firestore();
const env=await initializeTestEnvironment({projectId:project,firestore:{host:'127.0.0.1',port:8185}}),clients=[];
const out='test-results/performance-upgrade-20261103/active-concurrency-integrity.json',report={at:new Date().toISOString(),status:'RUNNING',project,appId,syntheticOnly:true,productionRequests:0,
 limitations:['Mocked SDK employee auth, not identity/password throughput.','Local Emulator integrity experiment; not a 500-user cloud capacity or UI latency claim.','Uses exact current App transaction callback for dispatch-to-order conversion; other stages call active repositories.'],cases:[]};
const persist=()=>fs.writeFile(out,JSON.stringify(report,null,2));
const source=await fs.readFile('src/App.jsx','utf8'),tree=parse(source,{sourceType:'module',plugins:['jsx']}),traverse=traverseModule.default||traverseModule;let callback;
traverse(tree,{CallExpression(p){if(p.node.callee.name==='runTransaction'&&p.node.arguments[1]?.type==='ArrowFunctionExpression'){const text=source.slice(p.node.arguments[1].start,p.node.arguments[1].end);if(text.includes('isWarehouseDispatchAlreadyLinked(dispatch)')&&text.includes('newOrderDocument')){assert.equal(callback,undefined,'Exact warehouse conversion callback must be unique');callback=text}}}});
if(!callback)throw Error('Current warehouse conversion callback missing');report.appCallbackSha256=crypto.createHash('sha256').update(callback).digest('hex');report.appSourceSha256=crypto.createHash('sha256').update(source).digest('hex');
const isPlainSerializableObject=appFunction('isPlainSerializableObject');let sanitizeValue;sanitizeValue=appFunction('sanitizeFirestoreWriteValue',{isPlainSerializableObject,sanitizeFirestoreWriteValue:(...args)=>sanitizeValue(...args)});
const sanitizeFirestoreWritePayload=appFunction('sanitizeFirestoreWritePayload',{sanitizeFirestoreWriteValue:sanitizeValue});
const ref=(db,c,id)=>doc(db,root,c,id),product={id:'p',companyId,name:'Synthetic product',unit:'Con',stockUnit:'Con',openingStock:1000,sellingPrice:100000};
const customer=i=>({id:`c${i}`,companyId,name:`Synthetic customer ${i}`,priceOverrides:{p:{billingUnit:'Con',pricingUnit:'Con',unitPrice:90000,price:90000,defaultOrderUnit:'Con'}}});
const dispatch=(id,customerId='c0')=>({id,companyId,clientMutationId:id.slice(`wd_${companyId}_`.length),customerId,productId:'p',quantity:3,pieceCount:3,quantityUnit:'Con',weightKg:6,date:'2026-11-03',empId:'u0'});
const transaction=db=>fn=>runTransaction(db,fn);
async function convert(db,dispatchId,orderId,customerId){
 const order={id:orderId,companyId,customerId,empId:'u0',date:'2026-11-03',amount:300000,total:300000,items:[{productId:'p',quantity:3,quantityUnit:'Con',unitPrice:100000,sourceDispatchId:dispatchId}],sourceDispatchIds:[dispatchId]};
 const paymentId=`payment_${orderId}`,payment={id:paymentId,companyId,customerId,orderId,amount:100000,date:'2026-11-03',method:'Tiền mặt',approvalStatus:'approved',status:'completed'};
 const context={doc,db,appId,id:orderId,myCompanyId:companyId,isWarehouseDispatchAlreadyLinked,sanitizeFirestoreWritePayload,orderRef:ref(db,'orders',orderId),dispatchRefs:[ref(db,'warehouseDispatches',dispatchId)],newOrderDocument:order,
  dispatchLinkPatch:{companyId,linkedOrderId:orderId,linkedOrderCreatedAt:'2026-11-03T00:00:00.000Z'},financialWrites:[{collectionName:'payments',documentId:paymentId,payload:payment,options:{merge:true}}]};
 const fn=new Function('context',`const{${Object.keys(context).join(',')}}=context;return (${callback});`)(context);
 await runTransaction(db,fn);return{orderId,paymentId};
}
try{
 let batch=seed.batch();batch.set(seed.doc(`${root}/companies/${companyId}`),{id:companyId,companyId,ownerId:'u0',name:'Synthetic integrity company'});batch.set(seed.doc(`${root}/products/p`),product);
 for(let i=0;i<50;i++){batch.set(seed.doc(`${root}/employees/u${i}`),{id:`u${i}`,companyId,role:'super_admin',status:'active'});batch.set(seed.doc(`${root}/customers/c${i}`),customer(i));clients.push(env.authenticatedContext(`integrity-${i}`,{companyId,appUserId:`u${i}`,identityId:`id-${i}`,accountType:'employee',role:'super_admin'}).firestore())}await batch.commit();
 const start=performance.now();const outcomes=await Promise.all(clients.map(async(db,i)=>{const requestId=`request-${i}`,payload={id:requestId,companyId,customerId:`c${i}`,date:'2026-11-03',items:[{productId:'p',quantity:3,quantityUnit:'Con',billingUnit:'Con',unitPrice:100000,sizeLabel:'To'}]};
  const command={companyId,requestId,payload,mutationId:`request-command-${i}`,fingerprint:await payloadFingerprint(payload),expectedOrderRevision:null,expectedCustomerConfig:configScopeFingerprint(customer(i)),syncDefaults:true,actorId:`u${i}`,now:'2026-11-03T00:00:00.000Z'};
  await commitOrderRequestWithDefaults({command,companyId,transaction:transaction(db),reference:(c,id)=>ref(db,c,id)});
  const id=`wd_${companyId}_command-${i}`,payloadDispatch=dispatch(id,`c${i}`);await commitIdempotentWarehouseDispatchCreate({runTransaction:transaction(db),reference:()=>ref(db,'warehouseDispatches',id),payload:payloadDispatch,companyId,documentId:id});
  await convert(db,id,`order-${i}`,`c${i}`);return{i,dispatchId:id,orderId:`order-${i}`};}));
 report.cases.push({case:'50 simultaneous complete request/config -> scale dispatch -> guarded order/payment workflows',completed:outcomes.length,durationMs:performance.now()-start});await persist();
 const replayId=`wd_${companyId}_shared-create`,payload=dispatch(replayId);const creations=await Promise.all(clients.slice(0,10).map(db=>commitIdempotentWarehouseDispatchCreate({runTransaction:transaction(db),reference:()=>ref(db,'warehouseDispatches',replayId),payload,companyId,documentId:replayId})));
 assert.equal(creations.filter(x=>!x.replay).length,1);report.cases.push({case:'10 simultaneous identical dispatch commands',created:1,replayed:9});
 const races=await Promise.allSettled(clients.slice(0,10).map((db,i)=>convert(db,replayId,`race-order-${i}`,'c0')));assert.equal(races.filter(r=>r.status==='fulfilled').length,1);
 assert.ok(races.filter(r=>r.status==='rejected').every(r=>/đã được lên đơn|không còn khả dụng/.test(r.reason.message)));report.cases.push({case:'10 competing orders for one dispatch',accepted:1,businessConflicts:9});
 const base=(await seed.doc(`${root}/payments/payment_order-0`).get()).data(),write={collectionName:'payments',documentId:base.id,payload:base,ifAbsent:true};
 await Promise.all(clients.slice(0,10).map(db=>commitAtomicWrites({writes:[write],companyId,transaction:transaction(db),reference:w=>ref(db,w.collectionName,w.documentId)})));
 await assert.rejects(commitAtomicWrites({writes:[{...write,payload:{...base,amount:777}}],companyId,transaction:transaction(clients[0]),reference:w=>ref(clients[0],w.collectionName,w.documentId)}),e=>e.code==='firestore/payment-command-conflict');report.cases.push({case:'payment replay and different-amount collision',identicalReplays:10,differentAmountRejected:true});
 const originalRequest=(await seed.doc(`${root}/orderRequests/request-49`).get()).data(),originalCustomer=(await seed.doc(`${root}/customers/c49`).get()).data();
 const edits=await Promise.allSettled(clients.slice(0,10).map(async(db,i)=>{const payload={...originalRequest,items:originalRequest.items.map(item=>({...item,unitPrice:110000+i}))};
  const command={companyId,requestId:originalRequest.id,payload,mutationId:`competing-price-${i}`,fingerprint:await payloadFingerprint(payload),expectedOrderRevision:orderRevision(originalRequest),expectedCustomerConfig:configScopeFingerprint(originalCustomer),syncDefaults:true,actorId:`u${i}`,now:'2026-11-03T00:01:00.000Z'};
  return commitOrderRequestWithDefaults({command,companyId,transaction:transaction(db),reference:(c,id)=>ref(db,c,id)});
 }));
 assert.equal(edits.filter(e=>e.status==='fulfilled').length,1);assert.ok(edits.filter(e=>e.status==='rejected').every(e=>/vừa được người khác sửa|Cấu hình khách vừa thay đổi/.test(e.reason.message)));
 const edited=(await seed.doc(`${root}/orderRequests/request-49`).get()).data(),configured=(await seed.doc(`${root}/customers/c49`).get()).data();
 assert.equal(edited.syncVersion,2);assert.equal(configured.priceOverrides.p.price,edited.items[0].unitPrice);report.cases.push({case:'10 competing request-price/default edits with the same source revision',accepted:1,businessConflicts:9,requestVersion:2,winningPrice:edited.items[0].unitPrice,historicalOrdersUnchanged:true});
 const collections={};for(const c of['orders','payments','warehouseDispatches','orderRequests','customers'])collections[c]=(await seed.collection(`${root}/${c}`).get()).docs.map(d=>d.data());
 const used=new Set();let amount=0,paid=0;
 for(const order of collections.orders){assert.equal(order.items.reduce((sum,row)=>sum+row.quantity*row.unitPrice,0),order.amount);amount+=order.amount;for(const id of order.sourceDispatchIds){assert.equal(used.has(id),false);used.add(id);const d=collections.warehouseDispatches.find(d=>d.id===id);assert.equal(d.linkedOrderId,order.id);assert.equal(d.customerId,order.customerId)}}
 for(const p of collections.payments){assert.equal(p.amount,100000);assert.equal(collections.orders.find(o=>o.id===p.orderId).customerId,p.customerId);paid+=p.amount}
 const stock=productStockBalance(product,[],collections.warehouseDispatches);assert.equal(stock.remaining,1000-51*3);assert.equal(amount-paid,51*200000);assert.equal(collections.orders.length,51);assert.equal(collections.payments.length,51);
 report.integrity={orders:collections.orders.length,payments:collections.payments.length,dispatches:collections.warehouseDispatches.length,requests:collections.orderRequests.length,duplicateDispatchUse:0,orphanPayments:0,salesAmount:amount,paidAmount:paid,salesLessPayments:amount-paid,stock,exactStockAndAmounts:true};
 report.status='LOCAL_ACTIVE_PATH_INTEGRITY_PASS_NOT_CAPACITY_ACCEPTANCE';
}catch(e){report.status='FAILED';report.error={name:e.name,code:e.code,message:e.message,stack:e.stack};process.exitCode=1}
finally{report.endedAt=new Date().toISOString();await persist();await Promise.allSettled(clients.map(db=>typeof db.terminate==='function'?db.terminate():terminate(db)));await env.cleanup();await app.delete();console.log(JSON.stringify({status:report.status,cases:report.cases,integrity:report.integrity,error:report.error?.message}))}
