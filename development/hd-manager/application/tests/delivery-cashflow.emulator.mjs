import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, runTransaction } from 'firebase/firestore';
import { commitAtomicWrites } from '../src/utils/atomicSave.js';
import { deliveryCashflowRevision } from '../src/utils/deliveryCashflow.js';
import { payloadFingerprint } from '../src/utils/customerProductAutoSync.js';

const configuredHost=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8185';
if(!/^(?:127\.0\.0\.1|localhost):8185$/.test(configuredHost))throw Error('Only the loopback Firestore emulator on port 8185 is allowed');
const projectId='demo-delivery-cashflow-'+process.pid;
if(!/^demo-delivery-cashflow-\d+$/.test(projectId))throw Error('An isolated demo delivery project is required');
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8185';
const rules=fs.readFileSync(new URL('../../../../firestore.rules',import.meta.url),'utf8');
console.log(`FENCE emulator=127.0.0.1:8185 project=${projectId} rootRulesSHA256=${createHash('sha256').update(rules).digest('hex')}`);
const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8185,rules}});
const companyId='qa-a',foreignCompanyId='qa-b',appId='delivery-cashflow-qa';
const db=env.authenticatedContext('owner-a',{companyId,appUserId:'owner-a',identityId:'qa-identity',accountType:'employee',role:'owner'}).firestore();
const ref=(store,name,id)=>doc(store,'artifacts',appId,'public','data',name,id);
const receipt={id:'p_delivery_r',companyId,relatedDeliveryReportId:'r',customerId:'c',amount:500000,method:'Tiền mặt',date:'2026-11-21',requiresApproval:true,approvalStatus:'pending_handover',handoverStatus:'pending',isArchived:false};
async function seed() {await env.clearFirestore();await env.withSecurityRulesDisabled(async context=>{
  const store=context.firestore();await setDoc(ref(store,'companies',companyId),{id:companyId,name:'QA delivery cashflow'});
  await setDoc(ref(store,'employees','owner-a'),{id:'owner-a',companyId,position:'Chủ doanh nghiệp'});
  await setDoc(ref(store,'deliveryReports','r'),{id:'r',companyId,collectedAmount:500000});
  await setDoc(ref(store,'payments',receipt.id),receipt);
});}
function writes() {const command={id:'stable-delivery-edit',fingerprint:'a'.repeat(64)};return[
  {collectionName:'deliveryReports',documentId:'r',payload:{companyId,collectedAmount:550000,lastDeliveryCommand:command},options:{merge:true},deliveryCommand:command},
  {collectionName:'payments',documentId:receipt.id,payload:{companyId,amount:550000,lastDeliveryCommand:command},options:{merge:true},expectedDeliveryCashflow:deliveryCashflowRevision(receipt),deliveryCommand:command}
];}
const commit=rows=>commitAtomicWrites({writes:rows,companyId,transaction:fn=>runTransaction(db,fn),reference:row=>ref(db,row.collectionName,row.documentId)});
const read=async(name,id)=>(await getDoc(ref(db,name,id))).data();

const roles=[
  {id:'driver-a',role:'driver',position:'Tài xế'},
  {id:'warehouse-a',role:'warehouse',position:'Xuất kho'},
];
const roleClient=(actor,tenant=companyId)=>env.authenticatedContext(actor.id+(tenant===companyId?'':'-foreign'),{
  companyId:tenant,appUserId:actor.id+(tenant===companyId?'':'-foreign'),identityId:`identity-${actor.id}-${tenant}`,
  accountType:'employee',role:actor.role,
}).firestore();
function roleBundle(actor,tenant=companyId,suffix='') {
  const key=actor.id.replaceAll('-','_')+suffix;
  const reportId=`r_${key}`,orderId=`o_${key}`;
  const payment={...receipt,id:`p_${key}`,companyId:tenant,empId:actor.id,relatedDeliveryReportId:reportId,orderId};
  const expense={...payment,id:`e_${key}`,amount:10000,category:'Xăng xe',note:'Synthetic delivery expense',assetId:'vehicle-a'};
  return [
    {collectionName:'deliveryReports',documentId:reportId,payload:{id:reportId,companyId:tenant,empId:actor.id,customerId:'c',collectedAmount:500000,deliveryExpenseAmount:10000,note:'Original delivery note',isArchived:false}},
    {collectionName:'orders',documentId:orderId,payload:{id:orderId,companyId:tenant,customerId:'c',driverId:actor.id,amount:800000,note:'Original order note',isArchived:false}},
    {collectionName:'payments',documentId:payment.id,ifAbsent:true,payload:payment},
    {collectionName:'expenses',documentId:expense.id,payload:expense},
    {collectionName:'assetCostLogs',documentId:`acl_${key}`,payload:{id:`acl_${key}`,companyId:tenant,empId:actor.id,assetId:'vehicle-a',expenseId:expense.id,relatedDeliveryReportId:reportId,amount:10000,note:'Original vehicle cost',isArchived:false}},
  ];
}
async function seedRole(actor,records=[]) {
  // clearFirestore affects only the generated demo project, never the user's QA project.
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
    const store=context.firestore();
    await setDoc(ref(store,'companies',companyId),{id:companyId,companyId,name:'Isolated delivery company A'});
    await setDoc(ref(store,'companies',foreignCompanyId),{id:foreignCompanyId,companyId:foreignCompanyId,name:'Isolated delivery company B'});
    await setDoc(ref(store,'employees',actor.id),{id:actor.id,companyId,position:actor.position,role:actor.role,isArchived:false});
    await setDoc(ref(store,'employees',actor.id+'-foreign'),{id:actor.id+'-foreign',companyId:foreignCompanyId,position:actor.position,role:actor.role,isArchived:false});
    for(const row of records)await setDoc(ref(store,row.collectionName,row.documentId),row.payload);
  });
}
const markCommand=async(rows,id)=>{
  const deliveryCommand={id,fingerprint:await payloadFingerprint(rows)};
  return rows.map(row=>({...row,deliveryCommand,payload:{...row.payload,lastDeliveryCommand:deliveryCommand}}));
};
const commitRole=(store,rows,tenant=companyId)=>commitAtomicWrites({writes:rows,companyId:tenant,
  transaction:callback=>runTransaction(store,callback),reference:row=>ref(store,row.collectionName,row.documentId),
});
const readBundle=async(store,rows)=>Promise.all(rows.map(async row=>(await getDoc(ref(store,row.collectionName,row.documentId))).data()));
function editRoleRows(records) {
  const amounts={payments:550000,expenses:12000,assetCostLogs:12000};
  return records.map(row=>({collectionName:row.collectionName,documentId:row.documentId,options:{merge:true},
    payload:{companyId:row.payload.companyId,
      ...(row.collectionName==='deliveryReports'?{collectedAmount:550000,deliveryExpenseAmount:12000}:{
        ...(amounts[row.collectionName]===undefined?{}:{amount:amounts[row.collectionName]}),
      }),note:'Edited delivery command'},
    ...(['payments','expenses'].includes(row.collectionName)?{expectedDeliveryCashflow:deliveryCashflowRevision(row.payload)}:{}),
  }));
}
try {
await test('real transaction edits report and its sole receipt atomically; lost-ack replay preserves later approval',async()=>{
  await seed();const command=writes();await commit(command);
  assert.equal((await read('deliveryReports','r')).collectedAmount,550000);assert.equal((await read('payments',receipt.id)).amount,550000);
  await env.withSecurityRulesDisabled(context=>setDoc(ref(context.firestore(),'payments',receipt.id),{approvalStatus:'approved',handoverStatus:'confirmed',approvedByEmpId:'accountant'},{merge:true}));
  const replay=await commit(command);assert.equal(replay.existingDocuments.length,2);
  assert.equal((await read('payments',receipt.id)).approvalStatus,'approved');
});
await test('real transaction rejects intervening approval before either report or payment changes',async()=>{
  await seed();await env.withSecurityRulesDisabled(context=>setDoc(ref(context.firestore(),'payments',receipt.id),{approvalStatus:'approved',handoverStatus:'confirmed'},{merge:true}));
  await assert.rejects(commit(writes()),error=>error.code==='firestore/delivery-cashflow-conflict');
  assert.equal((await read('deliveryReports','r')).collectedAmount,500000);assert.equal((await read('payments',receipt.id)).amount,500000);
});
await test('real transaction rejects an intervening amount edit without writing half the command',async()=>{
  await seed();await env.withSecurityRulesDisabled(context=>setDoc(ref(context.firestore(),'payments',receipt.id),{amount:600000},{merge:true}));
  await assert.rejects(commit(writes()),error=>error.code==='firestore/delivery-cashflow-conflict');
  assert.equal((await read('deliveryReports','r')).collectedAmount,500000);assert.equal((await read('payments',receipt.id)).amount,600000);
});
for(const actor of roles) {
  await test(`${actor.role}: actual command creates report, order, receipt, expense and vehicle cost with replay metadata`,{timeout:30000},async()=>{
    const records=roleBundle(actor);
    await seedRole(actor);
    const store=roleClient(actor);
    const employee=(await getDoc(ref(store,'employees',actor.id))).data();
    assert.equal(employee.position,actor.position);
    assert.equal(employee.role,actor.role);
    assert.notEqual(employee.role,'owner');
    const command=await markCommand(records,`create_${actor.role}`);
    await commitRole(store,command);
    const saved=await readBundle(store,records);
    for(const [index,data] of saved.entries())assert.deepEqual(data,{...records[index].payload,lastDeliveryCommand:command[index].deliveryCommand});
    const replay=await commitRole(store,command);
    assert.equal(replay.existingDocuments.length,records.length);
    assert.deepEqual(await readBundle(store,records),saved,'Create retry never adds or replaces a document');
  });
  await test(`${actor.role}: actual guarded command edits pending cashflow and adds lastDeliveryCommand to legacy documents`,{timeout:30000},async()=>{
    const records=roleBundle(actor);
    await seedRole(actor,records);
    const store=roleClient(actor),command=await markCommand(editRoleRows(records),`edit_${actor.role}`);
    await commitRole(store,command);
    const saved=await readBundle(store,records);
    for(const [index,data] of saved.entries())assert.deepEqual(data,{...records[index].payload,...command[index].payload});
    assert.equal(saved[0].collectedAmount,550000);
    assert.equal(saved[2].amount,550000);
    assert.equal(saved[3].amount,12000);
    assert.equal(saved[4].amount,12000);
    assert.equal(saved[2].approvalStatus,'pending_handover');
    assert.equal(saved[3].approvalStatus,'pending_handover');
  });
  await test(`${actor.role}: lost-ack replay reads every command document and preserves later approval and notes`,{timeout:30000},async()=>{
    const records=roleBundle(actor);
    await seedRole(actor,records);
    const store=roleClient(actor),command=await markCommand(editRoleRows(records),`replay_${actor.role}`);
    await commitRole(store,command);
    await env.withSecurityRulesDisabled(async context=>{
      const admin=context.firestore();
      for(const row of records)await setDoc(ref(admin,row.collectionName,row.documentId),{
        note:`Later ${row.collectionName} note`,
        ...(['payments','expenses'].includes(row.collectionName)?{approvalStatus:'approved',handoverStatus:'confirmed',approvedByEmpId:'finance-actor'}:{}),
      },{merge:true});
    });
    const later=await readBundle(store,records);
    const replay=await commitRole(store,command);
    assert.equal(replay.existingDocuments.length,records.length);
    assert.deepEqual(replay.existingDocuments.map(row=>row.payload),later);
    assert.deepEqual(await readBundle(store,records),later,'Replay must not restore pending approval or older notes');
  });
  await test(`${actor.role}: unchanged Rules deny cross-tenant command create and edit without partial writes`,{timeout:30000},async()=>{
    const own=roleBundle(actor),foreign=roleBundle(actor,foreignCompanyId,'_foreign');
    const deniedCreate=roleBundle(actor,foreignCompanyId,'_foreign_new');
    await seedRole(actor,[...own,...foreign]);
    const ownStore=roleClient(actor),foreignStore=roleClient(actor,foreignCompanyId);
    const denied=error=>error.code==='permission-denied';
    // Payload validation is deliberately given the payload tenant, so these
    // failures must come from the actual Rules and authenticated tenant claim.
    await assert.rejects(commitRole(ownStore,await markCommand(deniedCreate,`denied_create_${actor.role}`),foreignCompanyId),denied);
    await assert.rejects(commitRole(ownStore,await markCommand(editRoleRows(foreign),`denied_edit_${actor.role}`),foreignCompanyId),denied);
    await assert.rejects(commitRole(foreignStore,await markCommand(editRoleRows(own),`denied_reverse_${actor.role}`)),denied);
    await env.withSecurityRulesDisabled(async context=>{
      const store=context.firestore();
      assert.deepEqual(await readBundle(store,own),own.map(row=>row.payload));
      assert.deepEqual(await readBundle(store,foreign),foreign.map(row=>row.payload));
      for(const row of deniedCreate)assert.equal((await getDoc(ref(store,row.collectionName,row.documentId))).exists(),false);
    });
  });
}
} finally {await env.cleanup();}
