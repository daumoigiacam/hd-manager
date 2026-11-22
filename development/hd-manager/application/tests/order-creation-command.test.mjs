import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '@babel/parser';
import {createBusinessMutationId} from '../src/utils/businessMutationIds.js';
import {orderCreationIntent,assertOrderCreationReplay} from '../src/utils/orderCreationCommand.js';
import {commitAtomicWrites,validateAtomicWrites,mergeAtomicWrites} from '../src/utils/atomicSave.js';

function fixture(command='order-qa-1'){
  const input={companyId:'qa',employeeId:'e',orderData:{clientMutationId:command,customerId:'c',items:[{quantity:2,unitPrice:67000}],finalTotal:134000},financialData:{upfrontPayment:10000}};
  const intent=orderCreationIntent(input),order={collectionName:'orders',documentId:intent.id,payload:{...input.orderData,id:intent.id,companyId:'qa',orderCreationCommand:intent.command}};
  const payment={collectionName:'payments',documentId:`p_order_upfront_${intent.id}`,payload:{id:`p_order_upfront_${intent.id}`,companyId:'qa',customerId:'c',sourceOrderId:intent.id,orderId:intent.id,amount:10000,approvalStatus:'approved'}};
  const expense={collectionName:'expenses',documentId:`exp_order_${intent.id}`,payload:{id:`exp_order_${intent.id}`,companyId:'qa',sourceOrderId:intent.id,amount:5000}};
  return {input,intent,writes:[order,payment,expense].map(row=>({...row,orderCreationCommand:intent.command}))};
}
function store(){
  const docs=new Map();let commits=0;
  const reference=row=>row.collectionName+'/'+row.documentId;
  return {docs,reference,get commits(){return commits;},transaction:async callback=>{
    const sets=[];let wrote=false;
    const result=await callback({get:async key=>{assert.equal(wrote,false,'Read phase precedes every write');const data=docs.get(key);return {exists:()=>data!==undefined,data:()=>structuredClone(data)};},
      set:(key,data)=>{wrote=true;sets.push([key,structuredClone(data)]);}});
    for(const [key,data]of sets)docs.set(key,data);
    commits+=sets.length>0?1:0;return result;
  }};
}
const save=(f,s)=>commitAtomicWrites({writes:f.writes,companyId:'qa',transaction:s.transaction,reference:s.reference});

test('actual creation intent keeps a tenant/form identity and canonical fingerprint across retries and object key order',()=>{
  const f=fixture(),again=orderCreationIntent({...f.input,orderData:{finalTotal:134000,items:f.input.orderData.items,customerId:'c',clientMutationId:f.intent.command.id,createdAt:'later'}});
  assert.deepEqual(again,f.intent);
  assert.notEqual(fixture('order-another').intent.id,f.intent.id);
  assert.notEqual(orderCreationIntent({...f.input,companyId:'other'}).id,f.intent.id);
  assert.throws(()=>orderCreationIntent({...f.input,orderData:{...f.input.orderData,clientMutationId:'../bad'}}));
});
test('atomic order/upfront/expense creates once and lost-ACK replay preserves later invoice and finance edits',async()=>{
  const f=fixture(),s=store();await save(f,s);await save(f,s);assert.equal(s.commits,1);assert.equal(s.docs.size,3);
  const order=s.docs.get(s.reference(f.writes[0])),payment=s.docs.get(s.reference(f.writes[1]));order.finalTotal=160000;payment.amount=9000;payment.isRead=true;payment.approvalStatus='approved';
  const result=await save(f,s);assert.equal(s.commits,1);assert.equal(s.docs.get(s.reference(f.writes[0])).finalTotal,160000);
  assert.equal(s.docs.get(s.reference(f.writes[1])).amount,9000);assert.equal(s.docs.get(s.reference(f.writes[1])).isRead,true);
  assert.equal(result.existingDocuments.find(row=>row.collectionName==='orders').payload.finalTotal,160000);
});
test('reusing a committed form ID for changed financial intent fails without partial writes',async()=>{
  const original=fixture(),s=store();await save(original,s);const changed=fixture();
  changed.input.financialData.upfrontPayment=20000;const next=orderCreationIntent(changed.input);
  changed.writes=changed.writes.map(row=>({...row,orderCreationCommand:next.command,payload:{...row.payload,...(row.collectionName==='orders'?{orderCreationCommand:next.command}:{})}}));
  await assert.rejects(save(changed,s),{code:'firestore/order-command-conflict'});assert.equal(s.commits,1);assert.equal(s.docs.size,3);
});
test('foreign collisions and orphan financial rows block the whole order transaction',async()=>{
  for(const kind of ['foreign-order','foreign-payment','orphan-payment']){
    const f=fixture(),s=store(),row=kind==='foreign-order'?f.writes[0]:f.writes[1];
    s.docs.set(s.reference(row),{...row.payload,...(kind!=='orphan-payment'?{companyId:'foreign'}:{})});
    const before=structuredClone([...s.docs]);await assert.rejects(save(f,s),{code:'firestore/order-command-conflict'});assert.deepEqual([...s.docs],before);assert.equal(s.commits,0);
  }
});
test('command metadata cannot be mixed with unrelated documents or competing atomic workflows',()=>{
  for(const mutate of [rows=>{rows[1].payload.customerId='other';},rows=>{rows[1].documentId='unrelated';},rows=>{rows[2].payload.amount=-1;},
    rows=>{rows[0].payload.clientMutationId='other';},rows=>{rows[0].deliveryCommand={id:'other',fingerprint:'x'};},rows=>{rows[1].orderCreationCommand={id:'other',fingerprint:'x'};}]){
    const f=fixture();mutate(f.writes);assert.throws(()=>validateAtomicWrites(f.writes,'qa'));
  }
});
test('durable JSON round-trip retains the command; merging a competing intent cannot silently replace it',()=>{
  const f=fixture();assert.deepEqual(validateAtomicWrites(JSON.parse(JSON.stringify(f.writes)),'qa'),f.writes);
  const changed=structuredClone(f.writes);changed[0].orderCreationCommand.fingerprint+='changed';
  assert.throws(()=>mergeAtomicWrites(f.writes,changed));
  assert.throws(()=>assertOrderCreationReplay({...f.writes[0].payload,companyId:'foreign'},f.intent.command,'qa'));
});
test('actual manual and bulk form factories create distinct command IDs and retain a seeded retry identity',()=>{
  const source=readFileSync(new URL('../src/features/legacy/OrderManagementView.jsx',import.meta.url),'utf8');
  const declarations=new Map();function walk(node){if(!node||typeof node!=='object')return;if(node.type==='VariableDeclarator'&&node.id?.name)declarations.set(node.id.name,node.init);
    for(const [key,value]of Object.entries(node)){if(['loc','extra','comments'].includes(key))continue;if(Array.isArray(value))value.forEach(walk);else if(value?.type)walk(value);}}
  walk(parse(source,{sourceType:'module',plugins:['jsx']}));
  const env={createBusinessMutationId,createEmptyOrderItem:()=>({}),getTodayString:()=> '2026-11-22',getDefaultSalesEmpId:()=> 'e',capitalizeFirst:String};
  const factory=name=>Function(...Object.keys(env),'return ('+source.slice(declarations.get(name).start,declarations.get(name).end)+');')(...Object.values(env));
  const single=factory('createSingleOrderState'),bulk=factory('createBulkOrderDraft');
  assert.notEqual(single().clientMutationId,single().clientMutationId);assert.notEqual(bulk().clientMutationId,bulk().clientMutationId);
  assert.equal(bulk({clientMutationId:'order-pending'}).clientMutationId,'order-pending');
});
