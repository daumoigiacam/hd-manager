import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,runTransaction} from 'firebase/firestore';
import {commitAtomicWrites} from '../src/utils/atomicSave.js';
import {prepareAssetMutation,prepareAssetCostMutation} from '../src/utils/assetMutationIntegrity.js';

const endpoint=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8185';
if(!/^(?:127\.0\.0\.1|localhost):8185$/.test(endpoint))throw Error('Only the loopback emulator on port 8185 is allowed');
const projectId=`demo-asset-integrity-${process.pid}`;
if(!/^demo-asset-integrity-\d+$/.test(projectId))throw Error('An owned demo asset project is required');
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8185';
const rules=fs.readFileSync(new URL('../../../../firestore.rules',import.meta.url),'utf8');
console.log(`FENCE emulator=127.0.0.1:8185 project=${projectId} rootRulesSHA256=${createHash('sha256').update(rules).digest('hex')}`);
const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8185,rules}});
const companyId='asset-company-a',appId='asset-integrity-only',now='2026-11-22T01:00:00.000Z';
const client=(id,company=companyId)=>env.authenticatedContext(id,{companyId:company,appUserId:id,identityId:`identity-${id}`,accountType:'employee',role:'owner'}).firestore();
const a=client('owner-a'),b=client('owner-b'),foreign=client('owner-foreign','asset-company-b');
const ref=(store,collectionName,documentId)=>doc(store,'artifacts',appId,'public','data',collectionName,documentId);
const asset={id:'vehicle',companyId,name:'Isolated vehicle',currentKm:12000,fuelNorm:11,tankCapacity:90,assignedDriverIds:['driver'],handoverHistory:[{id:'original'}],isArchived:false};
const log={id:'cost',companyId,assetId:'vehicle',expenseId:'expense',type:'fuel',amount:50000,liters:2.5,unitPrice:20000,date:'2026-11-22',isArchived:false};
const expense={id:'expense',companyId,assetId:'vehicle',assetCostLogId:'cost',relatedAssetCostLogId:'cost',amount:50000,
  category:'Đổ xăng/dầu',note:'Original',requiresApproval:true,approvalStatus:'pending_handover',handoverStatus:'pending',isArchived:false};
const options={companyId,actorId:'owner-a',now,assetLabel:row=>row.name,costLabel:value=>value};
const metadata=id=>({clientCommandId:id,clientMutationAt:now});
const costPlan=(kind,input,id='cost',state={assets:[asset],logs:[log],expenses:[expense]})=>prepareAssetCostMutation({...options,...state,kind,id,input});
const apply=(store,plan)=>commitAtomicWrites({writes:plan.writes,companyId,transaction:callback=>runTransaction(store,callback),reference:write=>ref(store,write.collectionName,write.documentId)});
const read=async(collection,id)=>(await getDoc(ref(a,collection,id))).data();
const alter=(collection,id,patch)=>env.withSecurityRulesDisabled(context=>setDoc(ref(context.firestore(),collection,id),patch,{merge:true}));
async function seed(){
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
    const store=context.firestore();
    for(const company of [companyId,'asset-company-b'])await setDoc(ref(store,'companies',company),{id:company,name:'Isolated asset company'});
    for(const id of ['owner-a','owner-b','owner-foreign'])await setDoc(ref(store,'employees',id),{id,companyId:id==='owner-foreign'?'asset-company-b':companyId,position:'Chủ doanh nghiệp'});
    for(const[collection,row]of [['assets',asset],['assetCostLogs',log],['expenses',expense]])await setDoc(ref(store,collection,row.id),row);
  });
}
try{
  await test('real transactions allow one of two stale partial-array clients and preserve omitted asset fields',{timeout:30000},async()=>{
    await seed();
    const base={...options,kind:'edit',id:'vehicle',assets:[asset],assignmentIds:row=>row.assignedDriverIds||[]};
    const plans=await Promise.all(['first','second'].map(id=>prepareAssetMutation({...base,input:{maintenanceSchedule:[{id}],...metadata(id),expectedAssetUpdatedAt:''}})));
    const results=await Promise.allSettled([apply(a,plans[0]),apply(b,plans[1])]);
    assert.equal(results.filter(row=>row.status==='fulfilled').length,1);assert.equal(results.filter(row=>row.reason?.code==='asset/conflict').length,1);
    const saved=await read('assets','vehicle');assert.equal(saved.maintenanceSchedule.length,1);
    for(const key of ['currentKm','fuelNorm','tankCapacity','assignedDriverIds','handoverHistory'])assert.deepEqual(saved[key],asset[key]);
    assert.equal(Object.hasOwn(saved,'expectedAssetUpdatedAt'),false);assert.equal(Object.hasOwn(saved,'clientCommandId'),false);
  });
  await test('real command creates one cost/expense pair; lost-ack create replay preserves later finance edits',{timeout:30000},async()=>{
    await seed();const input={clientMutationId:'fuel-created',assetId:'vehicle',type:'fuel',liters:'2,5',unitPrice:20000,amount:'',...metadata('create-fuel')};
    const original=structuredClone(input),plan=await costPlan('create',input);await apply(a,plan);
    await alter('expenses','exp_asset_cost_fuel-created',{note:'Later finance edit',approvalStatus:'rejected'});
    const before=await read('expenses','exp_asset_cost_fuel-created'),replay=await apply(a,plan);
    assert.equal(replay.existingDocuments.length,2);assert.deepEqual(await read('expenses','exp_asset_cost_fuel-created'),before);
    assert.equal((await read('assetCostLogs','fuel-created')).amount,50000);assert.deepEqual(input,original);
  });
  await test('real approval/amount races reject stale edit and delete without partial writes',{timeout:30000},async()=>{
    for(const[kind,patch]of [['edit',{approvalStatus:'approved',handoverStatus:'confirmed'}],['delete',{amount:90000}]]){
      await seed();const plan=await costPlan(kind,kind==='edit'?{amount:60000,...metadata('stale-edit')}:metadata('stale-delete'));
      await alter('expenses','expense',patch);const before=await read('expenses','expense');
      await assert.rejects(apply(a,plan),error=>error.code==='asset/conflict');
      assert.deepEqual(await read('assetCostLogs','cost'),log);assert.deepEqual(await read('expenses','expense'),before);
    }
  });
  await test('real edit replay preserves later approval; delete archives exactly the pair and replays safely',{timeout:30000},async()=>{
    await seed();const input={amount:60000,note:'Asset edit',expectedAssetUpdatedAt:'',...metadata('edit-cost')};
    const edit=await costPlan('edit',input);await apply(a,edit);
    await alter('expenses','expense',{approvalStatus:'approved',handoverStatus:'confirmed',note:'Later approval'});
    const later=await read('expenses','expense');await apply(a,edit);assert.deepEqual(await read('expenses','expense'),later);
    const currentLog=await read('assetCostLogs','cost');
    const rebuilt=await costPlan('edit',input,'cost',{assets:[asset],logs:[currentLog],expenses:[later]});
    await apply(a,rebuilt);assert.deepEqual(await read('expenses','expense'),later);
    assert.equal(Object.hasOwn(currentLog,'expectedAssetUpdatedAt'),false);
    const remove=await costPlan('delete',metadata('archive-cost'),'cost',{assets:[asset],logs:[currentLog],expenses:[later]});await apply(a,remove);
    assert.equal((await read('assetCostLogs','cost')).isArchived,true);assert.equal((await read('expenses','expense')).isArchived,true);
    assert.equal((await read('expenses','expense')).approvalStatus,'approved');await apply(a,remove);
    assert.equal((await read('expenses','expense')).note,'Later approval');
  });
  await test('negative/missing references reject before write; server-side asset archive aborts the entire pair',{timeout:30000},async()=>{
    await seed();for(const input of [{amount:'-50000',assetId:'vehicle'},{amount:Infinity,assetId:'vehicle'},{amount:50000,assetId:'missing'}]){
      await assert.rejects(costPlan('create',{...input,clientMutationId:'invalid',...metadata('invalid')}));
    }
    const plan=await costPlan('create',{amount:50000,assetId:'vehicle',clientMutationId:'asset-race',...metadata('asset-race')});
    await alter('assets','vehicle',{isArchived:true});await assert.rejects(apply(a,plan));
    assert.equal(await read('assetCostLogs','asset-race'),undefined);assert.equal(await read('expenses','exp_asset_cost_asset-race'),undefined);
    assert.deepEqual(await read('assetCostLogs','cost'),log);
  });
  await test('checked-in tenant Rules deny foreign clients and normal asset commands cannot mutate delivery mirrors',{timeout:30000},async()=>{
    await seed();const plan=await costPlan('edit',{amount:60000,...metadata('foreign-attempt')});
    await assert.rejects(apply(foreign,plan),error=>error.code==='permission-denied');
    await alter('assetCostLogs','cost',{relatedDeliveryReportId:'delivery-report'});
    const forged=await costPlan('edit',{amount:60000,...metadata('delivery-attempt')});
    // Even with an exact current guard, the transactional business check owns this boundary.
    const row=await read('assetCostLogs','cost');
    const {assetDocumentRevision}=await import('../src/utils/assetMutationIntegrity.js');
    forged.writes.find(write=>write.collectionName==='assetCostLogs').expectedAssetDocument=await assetDocumentRevision(row);
    await assert.rejects(apply(a,forged),error=>error.code==='asset/delivery-owned');
    assert.equal((await read('assetCostLogs','cost')).amount,50000);assert.deepEqual(await read('expenses','expense'),expense);
  });
}finally{await env.cleanup();}
