import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '@babel/parser';
import * as integrity from '../src/utils/messageMutationIntegrity.js';
import {roleDomain} from './helpers/role-permission-domain.mjs';
const {hasCompanyRolePermissionAction}=roleDomain;

const source=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');let handler;
function find(node){if(!node||typeof node!=='object')return;if(node.type==='VariableDeclarator'&&node.id?.name==='handleAddMessage')handler=node.init;
  for(const[key,value]of Object.entries(node)){if(['loc','comments','extra'].includes(key))continue;if(Array.isArray(value))value.forEach(find);else if(value?.type)find(value);}}
find(parse(source,{sourceType:'module',plugins:['jsx']}));assert.ok(handler);
const bind=env=>Function(...Object.keys(env),`return (${source.slice(handler.start,handler.end)});`)(...Object.values(env));
const clone=structuredClone,companyId='tenant-a';
const actor={id:'employee-owner-with-hyphens',companyId,role:'owner',position:'Chủ doanh nghiệp',name:'Trusted actor'};
const recipient={id:'employee-driver-with-hyphens',companyId,position:'Tài xế',name:'Driver'};
const foreign={id:'foreign',companyId:'tenant-b',position:'Tài xế'};
const customer={id:'customer-a',companyId,name:'Trusted customer',empId:recipient.id};
const meta=id=>({clientMutationId:id,clientMutationAt:'2026-11-22T02:03:04.000Z'});
const draft=id=>({conversationType:'internal',conversationId:`internal-${[actor.id,recipient.id].sort().join('-')}`,
  receiverEmpId:recipient.id,recipientEmpId:recipient.id,text:'Checked message',...meta(id)});
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
function fixture(){
  const docs=new Map(),writes=[],publications=[],remembered=[],acks=[];let rows=[],defer=false,failAfterCommit=false,deny=false;
  const env={...integrity,firebaseUser:{uid:'auth-owner'},myCompanyId:companyId,currentCompany:{id:companyId},currentUser:{...actor},
    appCurrentEmployee:{...actor},employeeInfo:{...actor},currentCustomerInfo:null,rawCustomers:[clone(customer)],rawEmployees:[clone(actor),clone(recipient),clone(foreign)],
    hasCompanyRolePermissionAction,readOwnerKey:'owner-account',readOwnerRef:{current:'owner-account'},activeTenantScopeRef:{current:companyId},
    db:{},appId:'messages-unit',sanitizeFirestoreWritePayload:clone,doc:(_db,...path)=>path.join('/'),
    runTransaction:async(_db,callback)=>{
      if(deny)throw Object.assign(Error('Denied'),{code:'permission-denied'});
      const staged=[];const result=await callback({get:async ref=>({exists:()=>docs.has(ref),data:()=>clone(docs.get(ref))}),set:(ref,payload)=>staged.push([ref,clone(payload)])});
      for(const[ref,payload]of staged){docs.set(ref,payload);writes.push({ref,payload});}
      if(failAfterCommit)throw Error('Lost acknowledgement');
      if(defer)await new Promise((resolve,reject)=>acks.push({resolve,reject}));
      return result;
    },
    setRawMessages:update=>{rows=update(rows);publications.push(clone(rows));},rememberRecentLocalWrite:(...args)=>remembered.push(args)};
  return {env,docs,writes,publications,remembered,acks,get rows(){return rows;},
    set defer(value){defer=value;},set lostAck(value){failAfterCommit=value;},set denied(value){deny=value;},
    send:input=>bind(env)(input),captured:()=>bind(env)};
}

test('actual parent waits for transaction ACK before publication and derives actor/status from trusted context',async()=>{
  const f=fixture();f.defer=true;const input={...draft('confirmed'),senderName:'Spoofed',senderEmpId:foreign.id,senderType:'customer',status:'sent',isArchived:true};
  const before=clone(input);let settled=false;const pending=f.send(input).then(receipt=>{settled=true;return receipt;});await tick();
  assert.equal(settled,false);assert.equal(f.writes.length,1);assert.equal(f.publications.length,0);assert.equal(f.remembered.length,0);
  const payload=f.writes[0].payload;assert.equal(payload.companyId,companyId);assert.equal(payload.senderEmpId,actor.id);
  assert.equal(payload.senderName,'Trusted actor');assert.equal(payload.senderType,'employee');assert.equal(payload.status,'read');assert.equal(payload.isArchived,false);
  for(const key of ['clientMutationId','clientMutationAt'])assert.equal(Object.hasOwn(payload,key),false);
  f.acks[0].resolve();assert.deepEqual(await pending,{id:'msg_confirmed',success:true,confirmed:true,queued:false,duplicate:false});
  assert.equal(f.rows.length,1);assert.equal(f.remembered.length,1);assert.deepEqual(input,before);
});

test('actual transaction lost-ack replay uses one ID and never overwrites later read/archive state',async()=>{
  const f=fixture(),input=draft('stable-retry');f.lostAck=true;await assert.rejects(f.send(input),/Lost acknowledgement/);
  assert.equal(f.docs.size,1);assert.equal(f.publications.length,0);f.lostAck=false;
  const [ref]=f.docs.keys();Object.assign(f.docs.get(ref),{status:'unread',isArchived:true,employeeReadAt:'later',employeeReadById:recipient.id});
  const later=clone(f.docs.get(ref));const result=await f.send(input);
  assert.equal(result.duplicate,true);assert.equal(f.writes.length,1);assert.deepEqual(f.docs.get(ref),later);assert.deepEqual(f.rows[0],later);
  await assert.rejects(f.send({...input,text:'Different intent under same ID'}),{code:'message/conflict'});assert.deepEqual(f.docs.get(ref),later);
  const other=await f.send({...input,...meta('another-intent')});assert.equal(other.id,'msg_another-intent');assert.equal(f.docs.size,2);
});

test('actual parent rejects foreign/missing recipients, mismatched conversations, archived employees and stale tenant before writes',async()=>{
  const cases=[_f=>({...draft('foreign-company'),companyId:'tenant-b'}),
    _f=>({...draft('foreign-recipient'),receiverEmpId:foreign.id,recipientEmpId:foreign.id}),
    _f=>({...draft('missing'),receiverEmpId:'missing',recipientEmpId:'missing'}),
    _f=>({...draft('wrong-conversation'),conversationId:'internal-forged'}),
    f=>{f.env.rawEmployees[1].isArchived=true;return draft('archived');},
    f=>{f.env.activeTenantScopeRef.current='tenant-b';return draft('scope');}];
  for(const prepare of cases){const f=fixture();await assert.rejects(f.send(prepare(f)));assert.equal(f.writes.length,0);assert.equal(f.publications.length,0);}
});

test('actual catalog support/internal and attachment permissions are checked separately, including image content hidden under another type',async()=>{
  const f=fixture();f.env.currentUser={id:actor.id,role:'employee'};f.env.appCurrentEmployee={...actor,role:'employee',position:'Tài xế'};
  f.env.currentCompany.employeeRolePermissions={[actor.id]:{messages:true}};
  const actions={send_internal_messages:false,send_support_messages:false,send_image_attachment:false,send_contact_attachment:false,
    send_location_attachment:false,send_bank_qr_attachment:false,send_order_attachment:false,send_order_request_attachment:false,send_report_attachment:false};
  f.env.currentCompany.employeeRolePermissionActions={[actor.id]:{messages:actions}};
  await assert.rejects(f.send(draft('no-internal')),{code:'message/permission-denied'});
  actions.send_internal_messages=true;
  for(const type of ['image','contact','customer','location','bank','order','order_request','report']){
    await assert.rejects(f.send({...draft(`no-${type}`),attachmentType:type,attachmentText:'Data'}),{code:'message/permission-denied'});
  }
  actions.send_order_attachment=true;
  await assert.rejects(f.send({...draft('hidden-image'),attachmentType:'order',attachmentImage:'image-data'}),{code:'message/permission-denied'});
  await assert.rejects(f.send({conversationType:'support',conversationId:'support-hd-manager',text:'Support',...meta('no-support')}),{code:'message/permission-denied'});
  await assert.rejects(f.send({conversationType:'customer_support',customerId:customer.id,text:'Support',...meta('no-customer-support')}),{code:'message/permission-denied'});
  assert.equal(f.writes.length,0);
});

test('actual known platform support route accepts an empty recipient and internal group validates every participant',async()=>{
  const f=fixture();const receipt=await f.send({conversationType:'support',conversationId:'support-hd-manager',recipientEmpId:'',receiverEmpId:'',text:'Platform support',...meta('support')});
  assert.equal(receipt.confirmed,true);assert.equal(f.writes[0].payload.conversationId,'support-hd-manager');
  const group={conversationType:'internal_group',groupId:'internal_group_UUID',conversationId:'internal_group_UUID',participantEmpIds:[actor.id,recipient.id],text:'Created group',...meta('group')};
  await f.send(group);assert.deepEqual(f.writes[1].payload.participantEmpIds,[actor.id,recipient.id]);
  for(const ids of [[actor.id,foreign.id],[recipient.id],[actor.id,'missing']])await assert.rejects(f.send({...group,participantEmpIds:ids,...meta('bad-group')}));
  assert.equal(f.writes.length,2);
});

test('actual trusted customer-portal routing and reward metadata survive without employee role grants or caller identity spoofing',async()=>{
  for(const assigned of [true,false]){
    const f=fixture();f.env.currentUser={id:'portal-account',customerId:customer.id,companyId,accountType:'customer',role:'customer',name:'Portal customer'};
    f.env.currentCustomerInfo={...customer};if(!assigned){delete f.env.rawCustomers[0].empId;delete f.env.currentCustomerInfo.empId;}
    f.env.appCurrentEmployee=null;f.env.employeeInfo=null;
    await f.send({companyId:'forged-company',customerId:'forged-customer',senderName:'Spoofed',senderEmpId:foreign.id,receiverEmpId:foreign.id,
      conversationType:'internal_group',participantEmpIds:[foreign.id],source:'forged',status:'read',type:'loyalty_point_withdraw_request',
      rewardId:'reward',pointsRequested:100,text:'Customer request',...meta(assigned?'portal-assigned':'portal-unclassified')});
    const row=f.writes[0].payload;assert.equal(row.companyId,companyId);assert.equal(row.customerId,customer.id);
    assert.equal(row.conversationId,`customer_${customer.id}`);assert.equal(row.senderCustomerId,customer.id);assert.equal(row.senderEmpId,'');
    assert.equal(row.source,'customer_portal');assert.equal(row.senderName,'Portal customer');assert.equal(row.status,'unread');
    assert.equal(row.type,'loyalty_point_withdraw_request');assert.equal(row.rewardId,'reward');assert.equal(row.pointsRequested,100);
    assert.equal(row.assignmentState,assigned?'assigned':'unclassified');
    if(assigned)assert.equal(row.assignedEmployeeId,recipient.id);else assert.equal(Object.hasOwn(row,'assignedEmployeeId'),false);
  }
});

test('actual legacy customer sends keep retry IDs until ACK and permit a new identical message after success',async()=>{
  const f=fixture();f.env.currentUser={id:'legacy-portal',customerId:customer.id,companyId,role:'customer'};f.env.currentCustomerInfo={...customer};
  f.env.appCurrentEmployee=null;const input={conversationType:'customer_support',text:'Legacy portal retry'};
  f.lostAck=true;await assert.rejects(f.send(input));const [ref]=f.docs.keys();f.lostAck=false;
  assert.equal((await f.send(input)).duplicate,true);assert.equal(f.docs.size,1);
  await f.send(input);assert.equal(f.docs.size,2);assert.ok(f.docs.has(ref));
});

test('actual failed transactions and late ACKs never publish into the replacement account, including deferred React updaters',async()=>{
  const denied=fixture();denied.denied=true;await assert.rejects(denied.send(draft('denied')),{code:'permission-denied'});
  assert.equal(denied.publications.length,0);assert.equal(denied.docs.size,0);
  const f=fixture();f.defer=true;const old=f.captured(),pending=old(draft('late'));await tick();
  f.env.readOwnerRef.current='replacement-account';f.acks[0].resolve();await assert.rejects(pending,{code:'message/scope'});
  assert.equal(f.publications.length,0);assert.equal(f.remembered.length,0);
  await assert.rejects(old(draft('stale-before-save')),{code:'message/scope'});assert.equal(f.docs.size,1);
  const g=fixture(),updates=[];g.env.setRawMessages=update=>updates.push(update);await g.send(draft('deferred-update'));
  g.env.readOwnerRef.current='replacement';assert.deepEqual(updates[0]([]),[]);
});
