import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {parse} from '@babel/parser';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {collection,doc,getDoc,getDocs,query,runTransaction,setDoc,setLogLevel,where} from 'firebase/firestore';
import * as integrity from '../src/utils/messageMutationIntegrity.js';
import {roleDomain} from './helpers/role-permission-domain.mjs';
const {hasCompanyRolePermissionAction}=roleDomain;

const endpoint=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8185';
if(!/^(?:127\.0\.0\.1|localhost):8185$/.test(endpoint))throw Error('Only the loopback Firestore emulator on port 8185 is allowed');
const projectId=`demo-message-integrity-${process.pid}`;
if(!/^demo-message-integrity-\d+$/.test(projectId))throw Error('An owned demo message project is required');
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8185';
setLogLevel('silent'); // Expected denied-write oracles still inspect each error.
const rules=fs.readFileSync(new URL('../../../../firestore.rules',import.meta.url),'utf8');
console.log(`FENCE emulator=127.0.0.1:8185 project=${projectId} rootRulesSHA256=${createHash('sha256').update(rules).digest('hex')}`);
const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8185,rules}});
const source=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');let handler;
function walk(node){if(!node||typeof node!=='object')return;if(node.type==='VariableDeclarator'&&node.id?.name==='handleAddMessage')handler=node.init;
  for(const[key,value]of Object.entries(node)){if(['loc','comments','extra'].includes(key))continue;if(Array.isArray(value))value.forEach(walk);else if(value?.type)walk(value);}}
walk(parse(source,{sourceType:'module',plugins:['jsx']}));assert.ok(handler,'Actual canonical parent callback');
const companyId='message-company-a',otherCompanyId='message-company-b',appId='message-integrity-only';
const owner={id:'owner-a-with-hyphens',companyId,name:'Trusted owner',position:'Chủ doanh nghiệp',role:'owner'};
const driver={id:'driver-a-with-hyphens',companyId,name:'Trusted driver',position:'Tài xế',role:'employee'};
const foreignEmployee={id:'foreign-employee',companyId:otherCompanyId,name:'Other tenant employee',position:'Tài xế',role:'employee'};
const assigned={id:'customer-assigned',companyId,name:'Assigned QA customer',empId:driver.id};
const unclassified={id:'customer-unclassified',companyId,name:'Unclassified QA customer'};
const employeeClient=employee=>env.authenticatedContext(employee.id,{companyId:employee.companyId,appUserId:employee.id,
  identityId:`identity-${employee.id}`,accountType:'employee',role:employee.role}).firestore();
const portalClient=customer=>env.authenticatedContext(`portal-${customer.id}`,{companyId:customer.companyId,customerId:customer.id,
  appUserId:`portal-${customer.id}`,identityId:`identity-portal-${customer.id}`,accountType:'customer',role:'customer'}).firestore();
const a=employeeClient(owner),second=employeeClient(owner),staff=employeeClient(driver),foreign=employeeClient(foreignEmployee);
const ref=(store,name,id)=>doc(store,'artifacts',appId,'public','data',name,id);
const meta=id=>({clientMutationId:id,clientMutationAt:'2026-11-22T03:04:05.000Z'});
const internal=id=>({conversationType:'internal',conversationId:`internal-${[owner.id,driver.id].sort().join('-')}`,
  recipientEmpId:driver.id,receiverEmpId:driver.id,text:'Synthetic message',...meta(id)});
const read=async id=>(await getDoc(ref(a,'messages',id))).data();
const count=async()=>(await getDocs(query(collection(a,'artifacts',appId,'public','data','messages'),where('companyId','==',companyId)))).size;
async function seed(){
  // Only this generated demo project is cleared; the user's QA project is untouched.
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
    const store=context.firestore();
    await setDoc(ref(store,'companies',companyId),{id:companyId,name:'Isolated messaging company',
      employeeRolePermissions:{[driver.id]:{messages:true}},employeeRolePermissionActions:{[driver.id]:{messages:{
        send_internal_messages:false,send_support_messages:false,send_image_attachment:false,send_order_attachment:false}}}});
    await setDoc(ref(store,'companies',otherCompanyId),{id:otherCompanyId,name:'Isolated other company'});
    for(const employee of [owner,driver,foreignEmployee])await setDoc(ref(store,'employees',employee.id),employee);
    for(const customer of [assigned,unclassified])await setDoc(ref(store,'customers',customer.id),customer);
  });
}
async function fixture(store=a,actor=owner,{portal=false}={}){
  const company=(await getDoc(ref(a,'companies',companyId))).data();
  const employees=await Promise.all([owner,driver].map(async row=>(await getDoc(ref(a,'employees',row.id))).data()));
  const customers=await Promise.all([assigned,unclassified].map(async row=>(await getDoc(ref(a,'customers',row.id))).data()));
  const publications=[],remembered=[],flags={transactions:0,committed:0,lostAck:false,hold:null};let rows=[];
  const currentUser=portal?{id:`portal-${actor.id}`,companyId,customerId:actor.id,name:'Trusted portal customer',role:'customer',accountType:'customer'}:{...actor};
  const bindings={...integrity,firebaseUser:{uid:currentUser.id},myCompanyId:companyId,currentCompany:company,currentUser,
    appCurrentEmployee:portal?null:actor,employeeInfo:portal?null:actor,currentCustomerInfo:portal?actor:null,
    rawCustomers:customers,rawEmployees:[...employees,foreignEmployee],hasCompanyRolePermissionAction,
    readOwnerKey:`scope-${currentUser.id}`,readOwnerRef:{current:`scope-${currentUser.id}`},activeTenantScopeRef:{current:companyId},
    sanitizeFirestoreWritePayload:structuredClone,db:store,appId,doc,
    runTransaction:async(database,callback)=>{
      flags.transactions++;const result=await runTransaction(database,callback);flags.committed++;
      if(flags.lostAck)throw Error('Synthetic lost acknowledgement after real commit');
      if(flags.hold)await flags.hold;
      return result;
    },setRawMessages:update=>{rows=update(rows);publications.push(structuredClone(rows));},
    rememberRecentLocalWrite:(...args)=>remembered.push(args)};
  const send=Function(...Object.keys(bindings),`return (${source.slice(handler.start,handler.end)});`)(...Object.values(bindings));
  return {send,bindings,flags,publications,remembered,get rows(){return rows;}};
}
async function waitFor(predicate){for(let i=0;i<200&&!predicate();i++)await new Promise(resolve=>setTimeout(resolve,10));assert.ok(predicate(),'Expected real commit before releasing ACK');}
try{
  await test('actual parent and checked-in Rules preserve assigned/unclassified portal routing and trusted identity',{timeout:30000},async()=>{
    await seed();
    for(const customer of [assigned,unclassified]){
      console.log(`PORTAL routing=${customer.empId?'assigned':'unclassified'}`);
      const f=await fixture(portalClient(customer),customer,{portal:true}),input={companyId:otherCompanyId,customerId:'forged-customer',
        senderName:'Forged',senderEmpId:foreignEmployee.id,receiverEmpId:foreignEmployee.id,senderType:'employee',status:'read',source:'forged',
        conversationType:'internal_group',participantEmpIds:[foreignEmployee.id],type:'customer_to_employee',text:'Synthetic portal message',...meta(customer.id)};
      const before=structuredClone(input);let receipt;
      try {receipt=await f.send(input);}catch(error){
        // Keep the primary oracle failing. Compare the legacy, marker-free
        // portal payload to distinguish a Rules limit from a parent regression.
        if(!customer.empId){
          const legacyId='legacy-unclassified-probe';
          try {
            await setDoc(ref(portalClient(customer),'messages',legacyId),{id:legacyId,companyId,customerId:customer.id,
              conversationType:'customer_support',conversationId:`customer_${customer.id}`,assignmentState:'unclassified',
              senderCustomerId:customer.id,senderType:'customer',senderEmpId:'',source:'customer_portal',type:'customer_to_employee',text:'Legacy diagnostic',createdAt:100});
            console.log('LEGACY_PORTAL markerFreeCreate=allowed');
          }catch(legacyError){console.log(`LEGACY_PORTAL markerFreeCreate=${legacyError.code} expressionLimit=${/maximum of 1000 expressions/.test(legacyError.message)}`);}
        }
        throw error;
      }
      const saved=await read(receipt.id);
      assert.equal(receipt.confirmed,true);assert.equal(saved.companyId,companyId);assert.equal(saved.customerId,customer.id);
      assert.equal(saved.conversationId,`customer_${customer.id}`);assert.equal(saved.senderCustomerId,customer.id);
      assert.equal(saved.senderName,'Trusted portal customer');assert.equal(saved.senderEmpId,'');assert.equal(saved.status,'unread');assert.equal(saved.source,'customer_portal');
      assert.equal(saved.assignmentState,customer.empId?'assigned':'unclassified');
      if(customer.empId)assert.equal(saved.assignedEmployeeId,driver.id);else assert.equal(Object.hasOwn(saved,'assignedEmployeeId'),false);
      assert.deepEqual(input,before);assert.equal(f.publications.length,1);
      const invalid=[{conversationId:'forged-thread'},{customerId:'another-customer'},
        {senderCustomerId:'another-customer'},{senderType:'employee',senderEmpId:owner.id},{source:'forged-source'},
        {companyId:otherCompanyId},{assignmentState:customer.empId?'unclassified':'assigned'},
        {assignedEmployeeId:customer.empId?owner.id:''}];
      for(const[index,patch]of invalid.entries()){
        const id=`forged-${customer.id}-${index}`;
        await assert.rejects(setDoc(ref(portalClient(customer),'messages',id),{...saved,...patch,id}),error=>error.code==='permission-denied');
      }
      const spoofedRole=env.authenticatedContext(`spoof-role-${customer.id}`,{companyId,customerId:customer.id,
        appUserId:owner.id,identityId:'spoofed-role-identity',accountType:'customer',role:'owner'}).firestore();
      await assert.rejects(setDoc(ref(spoofedRole,'messages',`forged-role-${customer.id}`),{...saved,id:`forged-role-${customer.id}`,
        senderType:'employee',senderEmpId:owner.id}),error=>error.code==='permission-denied');
    }
    assert.equal(await count(),2);
    await assert.rejects(getDoc(ref(portalClient(unclassified),'messages',`msg_${assigned.id}`)),error=>error.code==='permission-denied');
    const assignedMessage=await read(`msg_${assigned.id}`),aliases=['empId','assignedEmployeeId','salesEmpId','managerEmpId','employeeId','responsibleEmployeeId'];
    for(const[index,field]of aliases.entries()){
      const profile={id:assigned.id,companyId,name:'Alias priority QA'};
      aliases.forEach((key,i)=>{profile[key]=i<index?'':i===index?driver.id:owner.id;});
      await env.withSecurityRulesDisabled(context=>setDoc(ref(context.firestore(),'customers',assigned.id),profile));
      await setDoc(ref(portalClient(assigned),'messages',`alias-${field}`),{...assignedMessage,id:`alias-${field}`});
      await assert.rejects(setDoc(ref(portalClient(assigned),'messages',`wrong-alias-${field}`),{...assignedMessage,
        id:`wrong-alias-${field}`,assignedEmployeeId:owner.id}),error=>error.code==='permission-denied');
    }
    await env.withSecurityRulesDisabled(context=>setDoc(ref(context.firestore(),'customers',assigned.id),{...assigned,empId:owner.id}));
    await assert.rejects(setDoc(ref(staff,'messages','revoked-assignment'),{...assignedMessage,id:'revoked-assignment',senderType:'employee',
      senderEmpId:driver.id,senderCustomerId:''}),error=>error.code==='permission-denied');
    await assert.rejects(setDoc(ref(portalClient(assigned),'messages','stale-portal-assignment'),{...assignedMessage,id:'stale-portal-assignment'}),error=>error.code==='permission-denied');
    await setDoc(ref(portalClient(assigned),'messages','fresh-portal-assignment'),{...assignedMessage,id:'fresh-portal-assignment',
      assignedEmployeeId:owner.id,receiverEmpId:owner.id,recipientEmpId:owner.id,targetEmpId:owner.id});
  });
  await test('actual parent rejects foreign/missing recipients and tenant payloads; actual Rules independently deny a foreign SDK client',{timeout:30000},async()=>{
    await seed();const f=await fixture();
    for(const input of [{...internal('wrong-company'),companyId:otherCompanyId},
      {...internal('foreign-recipient'),receiverEmpId:foreignEmployee.id,recipientEmpId:foreignEmployee.id},
      {...internal('missing-recipient'),receiverEmpId:'missing',recipientEmpId:'missing'},
      {conversationType:'internal_group',groupId:'internal_group_foreign',participantEmpIds:[owner.id,foreignEmployee.id],text:'Invalid group',...meta('foreign-group')}])await assert.rejects(f.send(input));
    assert.equal(f.flags.transactions,0);assert.equal(f.publications.length,0);assert.equal(await count(),0);
    const foreignSdk=await fixture(foreign);await assert.rejects(foreignSdk.send(internal('rules-denial')),error=>error.code==='permission-denied');
    assert.equal(foreignSdk.publications.length,0);assert.equal(await count(),0);
  });
  await test('actual persisted catalog grants gate support/internal/attachment sends before transactions',{timeout:30000},async()=>{
    await seed();const denied=await fixture(staff,driver),toOwner={conversationType:'internal',conversationId:`internal-${[driver.id,owner.id].sort().join('-')}`,
      receiverEmpId:owner.id,recipientEmpId:owner.id,text:'Driver message'};
    await assert.rejects(denied.send({...toOwner,...meta('denied-internal')}),{code:'message/permission-denied'});
    await assert.rejects(denied.send({conversationType:'support',conversationId:'support-hd-manager',text:'Support',...meta('denied-support')}),{code:'message/permission-denied'});
    assert.equal(denied.flags.transactions,0);
    await env.withSecurityRulesDisabled(context=>setDoc(ref(context.firestore(),'companies',companyId),{
      employeeRolePermissionActions:{[driver.id]:{messages:{send_internal_messages:true,send_support_messages:true,
        send_order_attachment:true,send_image_attachment:false,send_contact_attachment:false,send_location_attachment:false,
        send_bank_qr_attachment:false,send_order_request_attachment:false,send_report_attachment:false}}}},{merge:true}));
    const allowed=await fixture(staff,driver);
    for(const type of ['image','contact','customer','location','bank','order_request','report']){
      await assert.rejects(allowed.send({...toOwner,attachmentType:type,attachmentText:'Synthetic data',...meta(`denied-${type}`)}),{code:'message/permission-denied'});
    }
    await assert.rejects(allowed.send({...toOwner,attachmentType:'order',attachmentImage:'hidden-image',...meta('hidden-image')}),{code:'message/permission-denied'});
    assert.equal(allowed.flags.transactions,0);
    const receipt=await allowed.send({...toOwner,attachmentType:'order',attachmentText:'Synthetic order snapshot',...meta('allowed-order')});
    assert.equal((await read(receipt.id)).attachmentType,'order');
    await allowed.send({conversationType:'support',conversationId:'support-hd-manager',receiverEmpId:'',recipientEmpId:'',text:'Known platform route',...meta('allowed-support')});
    await allowed.send({conversationType:'customer_support',customerId:assigned.id,text:'Assigned customer reply',...meta('allowed-customer-support')});
    assert.equal(await count(),3);
  });
  await test('concurrent actual parent clients create one message and the second transaction returns the existing receipt',{timeout:30000},async()=>{
    await seed();const first=await fixture(a),other=await fixture(second),input=internal('concurrent');
    const receipts=await Promise.all([first.send(input),other.send(input)]);
    assert.deepEqual(receipts.map(row=>row.duplicate).sort(),[false,true]);assert.equal(await count(),1);
    assert.equal(receipts[0].id,receipts[1].id);assert.equal((await read(receipts[0].id)).text,input.text);
  });
  await test('lost ACK after real commit replays without rewriting later read/archive status; changed content under the same ID conflicts',{timeout:30000},async()=>{
    await seed();const f=await fixture(),input=internal('lost-ack'),original=structuredClone(input);
    f.flags.lostAck=true;await assert.rejects(f.send(input),/lost acknowledgement/);assert.equal(f.publications.length,0);assert.equal(await count(),1);
    const id='msg_lost-ack';await setDoc(ref(staff,'messages',id),{status:'unread',employeeReadAt:1795316645000,employeeReadById:driver.id},{merge:true});
    await setDoc(ref(a,'messages',id),{isArchived:true},{merge:true});
    const later=await read(id);f.flags.lostAck=false;const replay=await f.send(input);
    assert.equal(replay.duplicate,true);assert.deepEqual(await read(id),later);assert.deepEqual(f.rows[0],later);
    await assert.rejects(f.send({...input,text:'Conflicting content'}),{code:'message/conflict'});
    assert.deepEqual(await read(id),later);assert.equal(await count(),1);assert.deepEqual(input,original);
  });
  await test('real server confirmation precedes local publication and late ACKs cannot publish into another actor',{timeout:30000},async()=>{
    await seed();for(const late of [false,true]){
      const f=await fixture();let release;f.flags.hold=new Promise(resolve=>{release=resolve;});
      const pending=f.send(internal(late?'late-actor':'ack-held'));await waitFor(()=>f.flags.committed===1);
      assert.equal(f.publications.length,0);assert.equal(f.remembered.length,0);
      if(late)f.bindings.readOwnerRef.current='replacement-actor';release();
      if(late){await assert.rejects(pending,{code:'message/scope'});assert.equal(f.publications.length,0);assert.equal(f.remembered.length,0);}
      else {assert.equal((await pending).confirmed,true);assert.equal(f.publications.length,1);}
    }
    assert.equal(await count(),2);
  });
}finally{await env.cleanup();}
