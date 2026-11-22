import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDocFromServer,updateDoc,deleteField,runTransaction,setLogLevel} from 'firebase/firestore';
import {orderCreationIntent,assertOrderCreationReplay} from '../src/utils/orderCreationCommand.js';
import {parse} from '@babel/parser';
import {getWarehouseDispatchIds,findDuplicateWarehouseDispatchIds,resolveOrderCreationDateKey,isWarehouseDispatchAlreadyLinked} from '../src/utils/warehouseDispatchOrders.js';
import {roleDomain} from './helpers/role-permission-domain.mjs';
import {commitAtomicWrites} from '../src/utils/atomicSave.js';

const host=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8185';
if(!/^(?:127\.0\.0\.1|localhost):8185$/.test(host))throw Error('Local QA port8185 only');
const projectId=`demo-order-create-${process.pid}`;
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8185';setLogLevel('silent');
const rules=fs.readFileSync(new URL('../../../../firestore.rules',import.meta.url),'utf8');
console.log(`FENCE emulator=127.0.0.1:8185 project=${projectId} rootRulesSHA256=${createHash('sha256').update(rules).digest('hex')}`);
const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8185,rules}});
const companyId='qa-a',appId='order-creation-qa';
const db=env.authenticatedContext('owner',{companyId,appUserId:'owner',identityId:'qa-identity',accountType:'employee',role:'owner'}).firestore();
const ref=(store,name,id)=>doc(store,'artifacts',appId,'public','data',name,id);
const reference=row=>ref(db,row.collectionName,row.documentId);
async function seed(){await env.clearFirestore();await env.withSecurityRulesDisabled(async context=>{
  const store=context.firestore();await setDoc(ref(store,'companies',companyId),{id:companyId,name:'Synthetic order-create QA'});
  await setDoc(ref(store,'employees','owner'),{id:'owner',companyId,position:'Chủ doanh nghiệp',role:'owner',isArchived:false});
});}
function writes(){
  const orderData={clientMutationId:'order-sdk-qa',customerId:'c',finalTotal:134000,items:[{quantity:2,unitPrice:67000}]};
  const {id,command}=orderCreationIntent({companyId,employeeId:'owner',orderData,financialData:{upfrontPayment:10000}});
  return[
    {collectionName:'orders',documentId:id,payload:{...orderData,id,companyId,orderCreationCommand:command}},
    {collectionName:'payments',documentId:`p_order_upfront_${id}`,payload:{id:`p_order_upfront_${id}`,companyId,customerId:'c',orderId:id,sourceOrderId:id,amount:10000,isArchived:false}},
    {collectionName:'expenses',documentId:`exp_order_${id}`,payload:{id:`exp_order_${id}`,companyId,sourceOrderId:id,amount:5000,isArchived:false}},
  ].map(row=>({...row,orderCreationCommand:command}));
}
const commit=rows=>commitAtomicWrites({writes:rows,companyId,transaction:callback=>runTransaction(db,callback),reference});
const read=async row=>(await getDocFromServer(reference(row))).data();
const denied=promise=>assert.rejects(promise,error=>error.code==='permission-denied');
function actualOrderHandler(){
  const source=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');let declaration,archiveDeclaration;
  function walk(node){if(!node||typeof node!=='object')return;if(node.type==='VariableDeclarator'&&node.id?.name==='handleAddOrder')declaration=node.init;
    if(node.type==='VariableDeclarator'&&node.id?.name==='handleDeleteOrder')archiveDeclaration=node.init;
    for(const [key,value]of Object.entries(node)){if(['loc','comments','extra'].includes(key))continue;if(Array.isArray(value))value.forEach(walk);else if(value?.type)walk(value);}}
  walk(parse(source,{sourceType:'module',plugins:['jsx']}));assert.ok(declaration);
  const rawOrders=[];let pending,publications=0,loyaltyCalls=0;
  const noop=()=>{};
  const env={orderCreationIntent,assertOrderCreationReplay,getWarehouseDispatchIds,findDuplicateWarehouseDispatchIds,resolveOrderCreationDateKey,isWarehouseDispatchAlreadyLinked,
    rawOrders,customers:[{id:'c',empId:'owner'}],products:[],payments:[],isVpsStagingMode:false,myCompanyId:companyId,firebaseUser:{uid:'owner'},currentCompany:{id:companyId},currentUser:{id:'owner',name:'QA owner'},
    orderCreateInFlightRef:{current:new Set()},getTodayString:()=> '2026-11-22',buildDateTimeFromDateKey:date=>date+'T09:00:00Z',getDateKeyFromDateTime:date=>date.slice(0,10),
    parseLooseMoneyValue:Number,normalizeLookupText:value=>String(value||'').toLowerCase(),formatOrderCode:String,CASHFLOW_APPROVAL_STATUS:{approved:'approved'},capitalizeFirst:String,
    buildOrderDuplicateSignature:()=> 'same-synthetic-order',ATOMIC_SAVE_COLLECTION:'__atomicSave',
    saveAtomicDocuments:(_id,rows)=>{pending=commit(rows);return {queued:true,companyId};},requireSharedWriteConfirmation:async()=>await pending,
    flushPendingFirebaseWriteNow:async()=>{await pending;},activeTenantScopeRef:{current:companyId},scheduleOrderShareWarmup:noop,syncCustomerLoyaltyPoints:async()=>{loyaltyCalls++;},handleEnsureOrderPayosPayment:noop,
    setRawOrders:()=>{publications++;},setRealtimeStatus:noop,getFriendlyFirebaseErrorMessage:error=>error.message,recordStartupEvent:noop,
    db,doc,appId,runTransaction,sanitizeFirestoreWritePayload:value=>value,notifyFirestoreDocumentChanged:noop,queueActivityAuditLog:noop,scheduleCollectionRefresh:noop,
    setRawWarehouseDispatches:noop,rememberRecentLocalWrite:noop,applyLocalCollectionWrite:noop,
    auth:{currentUser:{uid:'owner'}},hasCompanyRolePermissionAction:roleDomain.hasCompanyRolePermissionAction};
  const compile=node=>Function(...Object.keys(env),'return ('+source.slice(node.start,node.end)+');')(...Object.values(env));
  return {save:compile(declaration),archive:compile(archiveDeclaration),rawOrders,context:env,get publications(){return publications;},get loyaltyCalls(){return loyaltyCalls;}};
}
try{
  await test('actual archive handler waits for current server permission/commit; retry retains first archive timestamp and does not repeat loyalty effects',{timeout:30000},async()=>{
    await seed();const rows=writes();await commit(rows);const handler=actualOrderHandler();
    const receipt=await handler.archive(rows[0].documentId);assert.deepEqual(receipt,{success:true,confirmed:true});
    const archived=await read(rows[0]);assert.equal(archived.isArchived,true);assert.equal(handler.loyaltyCalls,1);
    await handler.archive(rows[0].documentId);assert.deepEqual(await read(rows[0]),archived);assert.equal(handler.loyaltyCalls,1);
    assert.equal((await read(rows[1])).amount,10000,'Archive never rewrites payment');
    assert.equal((await read(rows[2])).amount,5000,'Archive never rewrites expense');
  });
  await test('stale cached owner role cannot archive after current profile/policy revoke and failed archive never hides the order locally',{timeout:30000},async()=>{
    await seed();const rows=writes();await commit(rows);const handler=actualOrderHandler();
    await env.withSecurityRulesDisabled(async context=>{
      await setDoc(ref(context.firestore(),'employees','owner'),{id:'owner',companyId,role:'employee',position:'Kế toán & nhân sự'});
      await setDoc(ref(context.firestore(),'companies',companyId),{id:companyId,rolePermissionActions:{accounting:{orders:{delete_order:false}}}});
    });
    await assert.rejects(handler.archive(rows[0].documentId));assert.equal(handler.publications,0);assert.equal(handler.loyaltyCalls,0);
    assert.notEqual((await read(rows[0])).isArchived,true);
    await denied(updateDoc(reference(rows[0]),{isArchived:true}));
    await updateDoc(reference(rows[0]),{note:'Normal edit preserves archive flag'});
    handler.context.activeTenantScopeRef.current='other';await assert.rejects(handler.archive(rows[0].documentId));assert.equal(handler.publications,0);
  });
  await test('actual App creation handler uses its stable form command on manual and warehouse orders and preserves later invoice edits on replay',{timeout:30000},async()=>{
    for(const warehouse of [false,true]){
      await seed();if(warehouse)await env.withSecurityRulesDisabled(context=>setDoc(ref(context.firestore(),'warehouseDispatches','dispatch-qa'),{id:'dispatch-qa',companyId,customerId:'c',date:'2026-11-22',weightKg:2}));
      const handler=actualOrderHandler(),orderData={clientMutationId:'order-parent-qa',customerId:'c',date:'2026-11-22',items:[{quantity:2,unitPrice:67000}],finalTotal:134000,
        ...(warehouse?{sourceDispatchIds:['dispatch-qa'],sourceType:'warehouse_dispatch'}:{})};
      const id=await handler.save('owner',orderData,{upfrontPayment:10000,paymentMethod:'Tiền mặt'});
      const target=ref(db,'orders',id),payment=ref(db,'payments',`p_order_upfront_${id}`);
      const saved=(await getDocFromServer(target)).data();assert.equal(saved.clientMutationId,orderData.clientMutationId);assert.ok(saved.orderCreationCommand);
      assert.equal(handler.loyaltyCalls,1,'Only the first confirmed creation runs its loyalty effect');
      await updateDoc(target,{finalTotal:160000,note:'Later parent-handler edit'});await updateDoc(payment,{amount:9000,isRead:true});
      handler.rawOrders.push((await getDocFromServer(target)).data());
      assert.equal(await handler.save('owner',orderData,{upfrontPayment:10000,paymentMethod:'Tiền mặt'}),id);
      assert.equal((await getDocFromServer(target)).data().finalTotal,160000);assert.equal((await getDocFromServer(payment)).data().amount,9000);
      assert.equal(handler.loyaltyCalls,1,'A replay never recomputes loyalty from the obsolete submitted amount');
    }
  });
  await test('actual SDK concurrent retry creates one order and one linked upfront/expense batch',{timeout:30000},async()=>{
    await seed();const rows=writes();await Promise.all([commit(rows),commit(rows)]);
    for(const row of rows)assert.deepEqual(await read(row),row.payload);
  });
  await test('SDK lost-ACK replay preserves later invoice amount, read status and finance changes',{timeout:30000},async()=>{
    await seed();const rows=writes();await commit(rows);
    await updateDoc(reference(rows[0]),{finalTotal:160000,note:'Later invoice edit'});
    await updateDoc(reference(rows[1]),{amount:9000,isRead:true,notificationSent:true});
    await updateDoc(reference(rows[2]),{amount:6000,isArchived:true});
    const before=await Promise.all(rows.map(read)),receipt=await commit(rows);
    assert.deepEqual(await Promise.all(rows.map(read)),before);assert.equal(receipt.existingDocuments.length,3);
  });
  await test('real Rules keep an existing creation marker/client ID immutable while permitting normal invoice edits and archive',{timeout:30000},async()=>{
    await seed();const rows=writes();await commit(rows);
    await denied(updateDoc(reference(rows[0]),{orderCreationCommand:deleteField()}));
    await denied(updateDoc(reference(rows[0]),{clientMutationId:'other'}));
    await denied(updateDoc(reference(rows[0]),{'orderCreationCommand.fingerprint':'replacement'}));
    await updateDoc(reference(rows[0]),{finalTotal:150000,isArchived:true});
    assert.equal((await read(rows[0])).isArchived,true);
  });
  await test('orphan or foreign financial document causes no partial invoice/expense creation',{timeout:30000},async()=>{
    for(const tenant of [companyId,'foreign']){
      await seed();const rows=writes();await env.withSecurityRulesDisabled(context=>setDoc(ref(context.firestore(),'payments',rows[1].documentId),{...rows[1].payload,companyId:tenant}));
      await assert.rejects(commit(rows));
      assert.equal((await getDocFromServer(reference(rows[0]))).exists(),false);
      assert.equal((await getDocFromServer(reference(rows[2]))).exists(),false);
    }
  });
}finally{await env.cleanup();}
