import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '@babel/parser';
import * as integrity from '../src/utils/assetMutationIntegrity.js';
import {commitAtomicWrites,mergeAtomicWrites,validateAtomicWrites,ATOMIC_SAVE_COLLECTION} from '../src/utils/atomicSave.js';
import {hasCompanyRolePermissionAction} from '../src/features/payroll/payrollOriginalDomain.js';
import {isRetryableWriteError} from '../src/utils/pendingWriteRetry.js';

const source=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8'),tree=parse(source,{sourceType:'module',plugins:['jsx']});
const declarations=new Map();
function collect(node){if(!node||typeof node!=='object')return;if(node.type==='VariableDeclarator'&&node.id?.name)declarations.set(node.id.name,node.init);
  for(const[key,value]of Object.entries(node)){if(['loc','comments','extra'].includes(key))continue;if(Array.isArray(value))value.forEach(collect);else if(value?.type)collect(value);}}
collect(tree);
const actual=(name,env)=>{const node=declarations.get(name);assert.ok(node,name);return Function(...Object.keys(env),`return (${source.slice(node.start,node.end)});`)(...Object.values(env));};
const shared=fs.readFileSync(new URL('../src/features/customers/productCRMShared.jsx',import.meta.url),'utf8');
const assignment=()=>{const ast=parse(shared,{sourceType:'module',plugins:['jsx']});const node=ast.program.body.filter(n=>n.type==='VariableDeclaration').flatMap(n=>n.declarations).find(n=>n.id.name==='getDeliveryAssignmentIds');return Function(`return (${shared.slice(node.init.start,node.init.end)})`)();};
const assignmentIds=assignment(),clone=structuredClone,companyId='tenant-a',now='2026-11-22T01:00:00.000Z';
const asset={id:'vehicle',companyId,name:'Vehicle QA',assignedDriverId:'driver',driverId:'driver',assignedDriverIds:['driver'],driverIds:['driver'],
  currentKm:12000,fuelNorm:11,tankCapacity:90,maintenanceIntervalKm:5000,lastMaintenanceKm:10000,nextMaintenanceKm:15000,handoverKm:9000,
  handoverHistory:[{id:'original'}],qaMetadata:{retain:true},isArchived:false};
const log={id:'cost',companyId,assetId:asset.id,expenseId:'expense',type:'fuel',amount:50000,liters:2.5,unitPrice:20000,date:'2026-11-22',note:'Original',isArchived:false};
const expense={id:'expense',companyId,assetId:asset.id,assetCostLogId:log.id,relatedAssetCostLogId:log.id,amount:50000,date:log.date,
  category:'Đổ xăng/dầu',note:'Original',approvalStatus:'pending_handover',requiresApproval:true,handoverStatus:'pending',isArchived:false};
const metadata=id=>({clientCommandId:id,clientMutationAt:now});
const owner={id:'owner',companyId,role:'owner',position:'Chủ doanh nghiệp'};
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));

function fixture(){
  const docs=new Map([['assets/vehicle',clone(asset)],['assetCostLogs/cost',clone(log)],['expenses/expense',clone(expense)]]),queue=[],ack=[],staged=[];
  const env={...integrity,firebaseUser:{uid:'auth-owner'},myCompanyId:companyId,currentCompany:{id:companyId},currentUser:owner,appCurrentEmployee:owner,
    rawAssets:[clone(asset)],rawAssetCostLogs:[clone(log)],rawExpenses:[clone(expense)],getDeliveryAssignmentIds:assignmentIds,
    readOwnerKey:'owner-a',readOwnerRef:{current:'owner-a'},activeTenantScopeRef:{current:companyId},hasCompanyRolePermissionAction,
    getAssetDisplayLabel:row=>row.name,normalizeExpenseCategoryLabel:value=>value,
    getAssetCostTypeLabel:value=>({fuel:'Đổ xăng/dầu',repair:'Sửa chữa',maintenance:'Bảo dưỡng'}[value]||value),
    ATOMIC_SAVE_COLLECTION,isRetryableWriteError,withTimeout:promise=>promise,
    saveAtomicDocuments:(key,writes)=>{validateAtomicWrites(writes,companyId);queue.push({key,writes});return{queued:true,companyId};},
    flushPendingFirebaseWriteNow:(...args)=>new Promise((resolve,reject)=>ack.push({args,resolve,reject}))};
  env.requireSharedWriteConfirmation=actual('requireSharedWriteConfirmation',env);
  const reference=write=>`${write.collectionName}/${write.documentId}`;
  const commit=writes=>commitAtomicWrites({writes,companyId,reference,transaction:async callback=>{
    const pending=[];const result=await callback({get:async key=>({exists:()=>docs.has(key),data:()=>clone(docs.get(key))}),
      set:(key,payload)=>pending.push([key,clone(payload)])});
    for(const[key,payload]of pending){docs.set(key,{...docs.get(key),...payload});staged.push(key);}return result;
  }});
  return {env,docs,queue,ack,staged,commit,call:(name,...args)=>actual(name,env)(...args),
    refresh(){env.rawAssets=[...docs.entries()].filter(([key])=>key.startsWith('assets/')).map(([,row])=>clone(row));
      env.rawAssetCostLogs=[...docs.entries()].filter(([key])=>key.startsWith('assetCostLogs/')).map(([,row])=>clone(row));
      env.rawExpenses=[...docs.entries()].filter(([key])=>key.startsWith('expenses/')).map(([,row])=>clone(row));}};
}
async function confirm(f,index=0){await tick();assert.ok(f.queue[index]);const result=await f.commit(f.queue[index].writes);f.ack[index].resolve(result);return result;}

test('actual asset PATCH keeps omitted assignments, numeric values, metadata and history; waits for exact ACK',async()=>{
  for(const patch of [{maintenanceSchedule:[{id:'new',title:'Service'}]},{assetDocuments:[{id:'doc',type:'Insurance'}]}]){
    const f=fixture(),before=clone(f.env.rawAssets),input={...patch,...metadata('partial'),expectedAssetUpdatedAt:''};let settled=false;
    const pending=f.call('handleEditAsset',asset.id,input,'forged-actor').then(result=>{settled=true;return result;});await tick();
    assert.equal(settled,false);assert.deepEqual(f.docs.get('assets/vehicle'),asset);
    assert.deepEqual(f.ack[0].args.slice(0,2),[ATOMIC_SAVE_COLLECTION,f.queue[0].key]);
    await confirm(f);assert.equal((await pending).confirmed,true);
    const saved=f.docs.get('assets/vehicle');for(const key of ['assignedDriverIds','currentKm','fuelNorm','tankCapacity','handoverHistory','qaMetadata'])assert.deepEqual(saved[key],asset[key]);
    assert.equal(saved.updatedByEmpId,owner.id);assert.deepEqual(f.env.rawAssets,before);assert.deepEqual(input,{...patch,...metadata('partial'),expectedAssetUpdatedAt:''});
    for(const key of ['clientCommandId','clientMutationAt','expectedAssetUpdatedAt'])assert.equal(Object.hasOwn(saved,key),false);
    f.refresh();const replay=f.call('handleEditAsset',asset.id,input);await confirm(f,1);await replay;
    assert.deepEqual(f.docs.get('assets/vehicle'),saved,'Retry with the old UI timestamp recognizes its confirmed command');
  }
});

test('actual asset create lost-ack retry keeps one ID; edit/delete receipts reject failed ACKs and replay without overwriting later edits',async()=>{
  const f=fixture(),input={name:'New QA',clientMutationId:'new-entity',...metadata('new-command')};
  const first=f.call('handleAddAsset',owner.id,input);await tick();await f.commit(f.queue[0].writes);
  f.ack[0].reject(Error('offline acknowledgement'));await assert.rejects(first,{code:'firestore/sync-pending'});
  const id='asset_new-entity';f.docs.get(`assets/${id}`).name='Later name';
  const retry=f.call('handleAddAsset',owner.id,input);await confirm(f,1);assert.equal(await retry,id);
  assert.equal(f.docs.get(`assets/${id}`).name,'Later name');assert.equal([...f.docs.keys()].filter(key=>key===`assets/${id}`).length,1);
  const deletion=f.call('handleDeleteAsset',asset.id,metadata('archive-asset'));await confirm(f,2);assert.equal((await deletion).confirmed,true);
  f.refresh();const replay=f.call('handleDeleteAsset',asset.id,metadata('archive-asset'));await confirm(f,3);await replay;
  assert.equal(f.docs.get('assets/vehicle').isArchived,true);
});

test('actual asset/cost parents reject negative, nonfinite, missing and foreign inputs before queueing any write',async()=>{
  const f=fixture();for(const value of ['-50000',-1,'Infinity',Infinity,NaN,'NaN','bad']){
    await assert.rejects(f.call('handleAddAsset',owner.id,{name:'Invalid',clientMutationId:'invalid',fuelNorm:value}));
    await assert.rejects(f.call('handleAddAssetCostLog',owner.id,{clientMutationId:'invalid-cost',assetId:asset.id,amount:value}));
  }
  for(const amount of [0,'0',0.1])await assert.rejects(f.call('handleAddAssetCostLog',owner.id,{clientMutationId:'zero',assetId:asset.id,amount}));
  f.env.rawAssets.push({id:'foreign',companyId:'tenant-b',name:'Foreign'});
  for(const id of ['missing','foreign']){
    await assert.rejects(f.call('handleEditAsset',id,{name:'Wrong'}));await assert.rejects(f.call('handleDeleteAsset',id));
    await assert.rejects(f.call('handleAddAssetCostLog',owner.id,{clientMutationId:'invalid-link',assetId:id,amount:50000}));
  }
  await assert.rejects(f.call('handleEditAsset',asset.id,{companyId:'tenant-b'}));
  f.env.rawAssets[0].updatedAt='2026-11-22T02:00:00.000Z';
  await assert.rejects(f.call('handleEditAsset',asset.id,{maintenanceSchedule:[],expectedAssetUpdatedAt:'',...metadata('stale-child')}),{code:'asset/conflict'});
  for(const value of [false,{},[],undefined])await assert.rejects(f.call('handleEditAsset',asset.id,{expectedAssetUpdatedAt:value,...metadata('invalid-scalar')}));
  f.env.rawAssetCostLogs[0].updatedAt='2026-11-22T02:00:00.000Z';
  for(const [name,patch]of [['handleEditAssetCostLog',{amount:60000}],['handleDeleteAssetCostLog',{}]]){
    await assert.rejects(f.call(name,log.id,{...patch,expectedAssetUpdatedAt:'',...metadata('stale-cost-form')}),{code:'asset/conflict'});
  }
  for(const value of [false,{},[],undefined])await assert.rejects(f.call('handleEditAssetCostLog',log.id,{expectedAssetUpdatedAt:value,...metadata('invalid-cost-scalar')}));
  assert.equal(f.queue.length,0);assert.deepEqual([...f.docs.values()],[asset,log,expense]);
});

test('actual parents enforce each catalog action and refuse stale tenant/account closures before queueing',async()=>{
  const calls=[['handleAddAsset',owner.id,{name:'New',clientMutationId:'new'}],['handleEditAsset',asset.id,{name:'Edit'}],
    ['handleDeleteAsset',asset.id],['handleAddAssetCostLog',owner.id,{clientMutationId:'new-cost',assetId:asset.id,amount:100}],
    ['handleEditAssetCostLog',log.id,{amount:100}],['handleDeleteAssetCostLog',log.id]];
  for(const args of calls){const f=fixture();f.env.currentUser={id:'reader',role:'employee'};f.env.appCurrentEmployee={id:'reader',position:'Tài xế'};
    await assert.rejects(f.call(...args),{code:'asset/permission-denied'});assert.equal(f.queue.length,0);}
  for(const change of [f=>{f.env.readOwnerRef.current='another-account';},f=>{f.env.activeTenantScopeRef.current='tenant-b';}]){
    const f=fixture();change(f);await assert.rejects(f.call(...calls[0]),{code:'asset/scope'});assert.equal(f.queue.length,0);}
});

test('actual granular permissions allow unchanged full defaults and gate changed handover/assignment/receipt images',async()=>{
  const f=fixture();f.env.currentUser={id:'staff',role:'employee'};f.env.appCurrentEmployee={id:'staff',position:'Kế toán & nhân sự'};
  f.env.currentCompany.employeeRolePermissions={staff:{asset_management:true}};
  f.env.currentCompany.employeeRolePermissionActions={staff:{asset_management:{create_asset:true,edit_asset:true,edit_asset_cost_log:true,
    create_asset_cost_log:true,manage_asset_handover:false,upload_asset_cost_images:false}}};
  for(const patch of [{assignedDriverIds:['other-driver']},{handoverNote:'Changed'},{handoverImageUrl:'new-handover'}]){
    await assert.rejects(f.call('handleEditAsset',asset.id,patch),{code:'asset/permission-denied'});
  }
  for(const field of ['receiptImageUrl','odometerImageUrl'])await assert.rejects(f.call('handleEditAssetCostLog',log.id,{[field]:'new-image'}),{code:'asset/permission-denied'});
  assert.equal(f.queue.length,0);
  const unchanged=f.call('handleEditAsset',asset.id,{name:asset.name,assignedDriverIds:['driver'],assignedDriverId:'driver',
    handoverKm:'9000',handoverDate:'',handoverCondition:'',handoverNote:'',handoverImageUrl:'',currentKm:'12000',...metadata('unchanged-defaults')});
  await confirm(f);await unchanged;
  f.env.rawAssetCostLogs[0].receiptImageUrl='existing-image';f.docs.get('assetCostLogs/cost').receiptImageUrl='existing-image';
  Object.assign(f.env.rawExpenses[0],{approvalStatus:'approved',approvedByEmpId:'finance'});
  Object.assign(f.docs.get('expenses/expense'),f.env.rawExpenses[0]);
  const cost=f.call('handleEditAssetCostLog',log.id,{amount:55000,receiptImageUrl:'existing-image',odometerImageUrl:'',...metadata('unchanged-images')});
  await confirm(f,1);await cost;assert.equal(f.docs.get('expenses/expense').approvalStatus,'approved');
  assert.equal(f.docs.get('expenses/expense').approvedByEmpId,'finance');assert.equal(f.docs.get('expenses/expense').amount,55000);
  assert.equal(f.docs.get('assets/vehicle').assignedDriverId,'driver');
});

test('actual cost create computes decimal-comma fuel, and edit/delete update only the linked pair without approval rewrites',async()=>{
  const f=fixture(),before=clone([f.env.rawAssets,f.env.rawAssetCostLogs,f.env.rawExpenses]);
  const create=f.call('handleAddAssetCostLog',owner.id,{assetId:asset.id,clientMutationId:'fuel-new',type:'fuel',liters:'2,5',unitPrice:'20.000',amount:'',...metadata('fuel-create')});
  await confirm(f);assert.equal((await create).confirmed,true);assert.equal(f.docs.get('assetCostLogs/fuel-new').amount,50000);
  const edit=f.call('handleEditAssetCostLog',log.id,{amount:55000,type:'other',costType:'repair',note:'',...metadata('repair')},owner.id);
  await tick();const payload=f.queue[1].writes.find(write=>write.collectionName==='expenses').payload;
  assert.equal(payload.category,'Sửa chữa');assert.equal(payload.note,'');
  for(const key of ['approvalStatus','requiresApproval','handoverStatus','isArchived'])assert.equal(Object.hasOwn(payload,key),false);
  await confirm(f,1);await edit;assert.equal(f.docs.get('expenses/expense').approvalStatus,expense.approvalStatus);
  f.refresh();const deletion=f.call('handleDeleteAssetCostLog',log.id,metadata('delete-cost'));await confirm(f,2);await deletion;
  assert.equal(f.docs.get('expenses/expense').isArchived,true);assert.equal(f.docs.get('assetCostLogs/cost').isArchived,true);
  f.refresh();const replay=f.call('handleDeleteAssetCostLog',log.id,metadata('delete-cost'));await confirm(f,3);await replay;
  assert.deepEqual(before,[[asset],[log],[expense]]);
  const g=fixture();Object.assign(g.env.rawExpenses[0],{amount:65000,category:'Sửa chữa',date:'2026-11-21'});
  Object.assign(g.docs.get('expenses/expense'),g.env.rawExpenses[0]);
  const partial=g.call('handleEditAssetCostLog',log.id,{note:'Only note',...metadata('note-only')});await confirm(g);await partial;
  assert.equal(g.docs.get('expenses/expense').amount,65000);assert.equal(g.docs.get('expenses/expense').category,'Sửa chữa');
  assert.equal(g.docs.get('expenses/expense').date,'2026-11-21');
});

test('actual atomic cost CAS aborts both writes after approval/amount/asset changes, and lost-ack replay preserves later finance edits',async()=>{
  for(const change of [f=>{f.docs.get('expenses/expense').approvalStatus='approved';},f=>{f.docs.get('expenses/expense').amount=90000;},
    f=>{f.docs.get('assets/vehicle').isArchived=true;}]){
    const f=fixture(),pending=f.call('handleEditAssetCostLog',log.id,{amount:60000,...metadata('stale')});await tick();change(f);
    await assert.rejects(f.commit(f.queue[0].writes));assert.equal(f.staged.length,0);assert.equal(f.docs.get('assetCostLogs/cost').amount,50000);
    f.ack[0].reject(Object.assign(Error('Conflict'),{code:'asset/conflict'}));await assert.rejects(pending);
  }
  const f=fixture(),input={amount:60000,expectedAssetUpdatedAt:'',...metadata('lost-ack')};const first=f.call('handleEditAssetCostLog',log.id,input);await tick();await f.commit(f.queue[0].writes);
  f.ack[0].reject(Error('offline acknowledgement'));await assert.rejects(first);
  Object.assign(f.docs.get('expenses/expense'),{approvalStatus:'approved',note:'Later finance note',amount:65000});
  f.refresh();const later=clone(f.docs.get('expenses/expense')),retry=f.call('handleEditAssetCostLog',log.id,input);await confirm(f,1);await retry;
  assert.deepEqual(f.docs.get('expenses/expense'),later);assert.equal(f.docs.get('assetCostLogs/cost').amount,60000);
  assert.equal(Object.hasOwn(f.docs.get('assetCostLogs/cost'),'expectedAssetUpdatedAt'),false);
});

test('actual delivery mirrors reject asset-route edit/delete, but delivery-owned plans stage only the mirror and preserve expense state',async()=>{
  const f=fixture();f.env.rawAssetCostLogs[0].relatedDeliveryReportId='report';
  f.env.rawExpenses[0].relatedDeliveryReportId='report';
  await assert.rejects(f.call('handleEditAssetCostLog',log.id,{amount:60000}),{code:'asset/delivery-owned'});
  await assert.rejects(f.call('handleDeleteAssetCostLog',log.id),{code:'asset/delivery-owned'});assert.equal(f.queue.length,0);
  const plan=[{collectionName:'expenses',documentId:expense.id,payload:{companyId,isArchived:true}}];
  const before=clone(f.env.rawExpenses);
  await f.call('handleEditAssetCostLog',log.id,{isArchived:true},owner.id,plan);
  assert.equal(plan.length,2);assert.equal(plan[1].collectionName,'assetCostLogs');assert.equal(plan[1].payload.isArchived,true);
  assert.equal(plan[1].assetCommand,undefined);assert.deepEqual(f.env.rawExpenses,before);
  const createPlan=[{collectionName:'expenses',documentId:'delivery-expense',payload:{companyId,relatedDeliveryReportId:'new-report'}}];
  const id=await f.call('handleAddAssetCostLog',owner.id,{clientMutationId:'delivery-cost',assetId:asset.id,amount:50000,
    relatedDeliveryReportId:'new-report',sourceType:'delivery_report_expense',expenseId:'delivery-expense'},createPlan);
  assert.equal(id,'delivery-cost');assert.equal(createPlan.length,2);assert.equal(f.queue.length,0);
});

test('missing/mismatched expense links, malformed metadata and conflicting merge guards fail before mutations',async()=>{
  const f=fixture();f.env.rawExpenses[0].assetCostLogId='another';f.env.rawExpenses[0].relatedAssetCostLogId='another';
  await assert.rejects(f.call('handleEditAssetCostLog',log.id,{amount:100}));assert.equal(f.queue.length,0);
  const g=fixture(),pending=g.call('handleEditAsset',asset.id,{name:'Changed',...metadata('merge')});await tick();
  const write=g.queue[0].writes[0];
  assert.deepEqual(mergeAtomicWrites([write],[{collectionName:write.collectionName,documentId:write.documentId,payload:{companyId,note:'New'},options:{merge:true}}])[0].expectedAssetDocument,write.expectedAssetDocument);
  assert.throws(()=>mergeAtomicWrites([write],[{...write,expectedAssetDocument:{exists:false,fingerprint:''}}]),/Conflicting/);
  for(const value of [null,false,{}, {...write.assetCommand,extra:true}])assert.throws(()=>validateAtomicWrites([{...write,assetCommand:value}],companyId));
  assert.throws(()=>validateAtomicWrites([{...write,expectedAssetDocument:false}],companyId));
  g.ack[0].reject(Object.assign(Error('Denied'),{code:'permission-denied'}));await assert.rejects(pending);assert.equal(g.staged.length,0);
});
