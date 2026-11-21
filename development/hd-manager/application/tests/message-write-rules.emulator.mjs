import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {collection,deleteDoc,doc,getDoc,getDocs,query,setDoc,setLogLevel,updateDoc,where} from 'firebase/firestore';
import {roleDomain} from './helpers/role-permission-domain.mjs';
const {hasCompanyRolePermissionAction}=roleDomain;

const endpoint=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8185';
if(!/^(?:127\.0\.0\.1|localhost):8185$/.test(endpoint))throw Error('Only loopback Firestore on port 8185 is allowed');
const projectId=`demo-message-write-rules-${process.pid}`;
if(!/^demo-message-write-rules-\d+$/.test(projectId))throw Error('An owned demo Rules project is required');
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8185';setLogLevel('silent');
const rules=fs.readFileSync(new URL('../../../../firestore.rules',import.meta.url),'utf8');
console.log(`FENCE emulator=127.0.0.1:8185 project=${projectId} rootRulesSHA256=${createHash('sha256').update(rules).digest('hex')}`);
const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8185,rules}});
const appId='message-write-rules',companyId='company-a',otherCompanyId='company-b';
const employee=(id,position='Tài xế')=>({id,companyId,position,role:'employee',name:`Trusted ${id}`});
const owner={...employee('owner','Chủ doanh nghiệp'),role:'owner'},staff=employee('staff'),other=employee('recipient');
const foreign={...employee('foreign'),companyId:otherCompanyId};
const ref=(store,name,id)=>doc(store,'artifacts',appId,'public','data',name,id);
const client=(actor,claims={})=>env.authenticatedContext(actor.id,{companyId:actor.companyId,appUserId:actor.id,identityId:`identity-${actor.id}`,
  accountType:'employee',role:actor.role,...claims}).firestore();
const portal=(id,claims={})=>env.authenticatedContext(`portal-${id}`,{companyId,customerId:id,appUserId:`portal-${id}`,identityId:`portal-identity-${id}`,
  accountType:'customer',role:'customer',...claims}).firestore();
const a=client(staff),admin=client(owner);
const payload=(id,actor=staff,recipient=other)=>({id,companyId,conversationType:'internal',conversationId:`internal-${[actor.id,recipient.id].sort().join('-')}`,
  senderType:'employee',senderEmpId:actor.id,senderCustomerId:'',senderName:actor.name,recipientEmpId:recipient.id,receiverEmpId:recipient.id,
  text:'Synthetic direct SDK message',status:'read',createdAt:100,isArchived:false});
const denied=promise=>assert.rejects(promise,error=>error.code==='permission-denied'&&!/maximum of 1000 expressions/.test(error.message));
const setCompany=patch=>env.withSecurityRulesDisabled(context=>setDoc(ref(context.firestore(),'companies',companyId),patch,{merge:true}));
async function seed(){await env.clearFirestore();await env.withSecurityRulesDisabled(async context=>{
  const store=context.firestore();await setDoc(ref(store,'companies',companyId),{id:companyId,name:'Isolated company'});
  await setDoc(ref(store,'companies',otherCompanyId),{id:otherCompanyId,name:'Other company'});
  for(const row of [owner,staff,other,foreign])await setDoc(ref(store,'employees',row.id),row);
  for(const row of [{id:'assigned',companyId,empId:staff.id},{id:'unclassified',companyId},{id:'foreign-customer',companyId:otherCompanyId}])await setDoc(ref(store,'customers',row.id),row);
});}
try{
  await test('direct SDK unclassified creation requires an existing customer in the claimed tenant',{timeout:30000},async()=>{
    await seed();const message=id=>({id:`message-${id}`,companyId,customerId:id,conversationId:`customer_${id}`,conversationType:'customer_support',
      assignmentState:'unclassified',senderType:'customer',senderCustomerId:id,source:'customer_portal',type:'customer_to_employee',text:'Customer message'});
    await setDoc(ref(portal('unclassified'),'messages','own-unclassified'),message('unclassified'));
    for(const id of ['missing','foreign-customer'])await denied(setDoc(ref(portal(id),'messages',`forged-${id}`),message(id)));
    await denied(setDoc(ref(portal('unclassified'),'messages','forged-owner'),{...message('assigned'),assignmentState:'assigned',assignedEmployeeId:staff.id}));
    await denied(setDoc(ref(portal('unclassified',{role:'owner',appUserId:owner.id}),'messages','spoof-role'),{...message('unclassified'),senderType:'employee',senderEmpId:owner.id}));
  });
  await test('direct SDK creation observes role and individual module/action revocation using the same authenticated session',{timeout:30000},async()=>{
    await seed();await setDoc(ref(a,'messages','default-allowed'),payload('default-allowed'));
    await setCompany({rolePermissionActions:{driver:{messages:{send_internal_messages:false}}}});
    await denied(setDoc(ref(a,'messages','role-denied'),payload('role-denied')));
    await setCompany({employeeRolePermissions:{staff:{messages:true}},employeeRolePermissionActions:{staff:{messages:{send_internal_messages:true}}}});
    await setDoc(ref(a,'messages','individual-allowed'),payload('individual-allowed'));
    await setCompany({employeeRolePermissionActions:{staff:{messages:{send_internal_messages:false}}}});
    await denied(setDoc(ref(a,'messages','action-revoked'),payload('action-revoked')));
    await setCompany({employeeRolePermissions:{staff:{messages:false}},employeeRolePermissionActions:{staff:{messages:{send_internal_messages:true}}}});
    assert.equal(hasCompanyRolePermissionAction({company:{employeeRolePermissions:{staff:{messages:false}},employeeRolePermissionActions:{staff:{messages:{send_internal_messages:true}}}},employee:staff,currentUser:staff},'messages','send_internal_messages'),true);
    await setDoc(ref(a,'messages','explicit-action-grant'),payload('explicit-action-grant'));
    await setCompany({employeeRolePermissionActions:{staff:{messages:{}}}});
    await denied(setDoc(ref(a,'messages','module-revoked'),payload('module-revoked')));
    await denied(setDoc(ref(client(staff,{role:'owner'}),'messages','forged-owner-claim'),payload('forged-owner-claim')));
    await denied(updateDoc(ref(a,'messages','default-allowed'),{text:'Body overwrite bypass'}));
    await denied(updateDoc(ref(a,'messages','default-allowed'),{status:'unread'}));
    await denied(deleteDoc(ref(a,'messages','default-allowed')));
  });
  await test('direct SDK attachments require current fine actions, including undeclared image content',{timeout:30000},async()=>{
    await seed();const actions={send_internal_messages:true,send_image_attachment:false,send_contact_attachment:false,send_location_attachment:false,
      send_bank_qr_attachment:false,send_order_attachment:false,send_order_request_attachment:false,send_report_attachment:false};
    await setCompany({employeeRolePermissions:{staff:{messages:true}},employeeRolePermissionActions:{staff:{messages:actions}}});
    for(const type of ['image','contact','customer','location','bank','order','order_request','report'])await denied(setDoc(ref(a,'messages',`denied-${type}`),{
      ...payload(`denied-${type}`),attachmentType:type,attachmentText:'Synthetic attachment'}));
    await setCompany({employeeRolePermissionActions:{staff:{messages:{send_order_attachment:true}}}});
    await setDoc(ref(a,'messages','order-allowed'),{...payload('order-allowed'),attachmentType:'order',attachmentText:'Order snapshot'});
    await denied(setDoc(ref(a,'messages','hidden-image'),{...payload('hidden-image'),attachmentType:'order',attachmentImage:'hidden image'}));
    await setCompany({employeeRolePermissionActions:{staff:{messages:{send_order_attachment:false}}}});
    await denied(setDoc(ref(a,'messages','order-revoked'),{...payload('order-revoked'),attachmentType:'order',attachmentText:'Order snapshot'}));
    await denied(updateDoc(ref(a,'messages','order-allowed'),{attachmentImage:'Overwrite bypass'}));
  });
  await test('direct SDK rejects forged senders and every foreign/missing recipient, while valid groups and empty-recipient platform support remain allowed',{timeout:30000},async()=>{
    await seed();for(const patch of [{senderEmpId:owner.id},{senderType:'customer'},{senderCustomerId:'assigned'},{senderName:'Forged name'},
      {recipientEmpId:foreign.id,receiverEmpId:foreign.id},{recipientEmpId:'missing',receiverEmpId:'missing'},
      {receiverEmpId:owner.id},{targetEmpId:foreign.id},{conversationId:'internal-forged'}])await denied(setDoc(ref(a,'messages',`invalid-${Object.keys(patch).join('-')}-${JSON.stringify(patch).length}`),{...payload('invalid'),...patch}));
    const group={...payload('group'),conversationType:'internal_group',conversationId:'group-qa',groupId:'group-qa',
      recipientEmpId:'',receiverEmpId:'',participantEmpIds:[staff.id,other.id,owner.id]};
    await setDoc(ref(a,'messages','group'),group);
    for(const [index,ids]of [[other.id,owner.id],[staff.id,staff.id],[staff.id,{}],[staff.id,true],[staff.id,17]].entries())await denied(setDoc(ref(a,'messages',`bad-group-${index}`),{...group,participantEmpIds:ids}));
    const members=Array.from({length:41},(_,i)=>employee(`large-group-member-${i}`));
    await env.withSecurityRulesDisabled(async context=>{for(const member of members)await setDoc(ref(context.firestore(),'employees',member.id),member);});
    await setDoc(ref(a,'messages','large-group'),{...group,id:'large-group',participantEmpIds:[staff.id,...members.map(row=>row.id)]});
    assert.equal((await getDoc(ref(admin,'messages','large-group'))).data().participantEmpIds.length,42);
    await setDoc(ref(a,'messages','untrusted-participant-metadata'),{...group,id:'untrusted-participant-metadata',participantEmpIds:[staff.id,foreign.id]});
    await denied(getDoc(ref(client(foreign),'messages','untrusted-participant-metadata')));
    await denied(getDocs(query(collection(client(foreign),'artifacts',appId,'public','data','messages'),where('companyId','==',companyId))));
    await denied(setDoc(ref(a,'messages','forged-group-alias'),{...group,recipientEmpId:foreign.id}));
    await setCompany({employeeRolePermissions:{staff:{messages:true}},employeeRolePermissionActions:{staff:{messages:{send_support_messages:true}}}});
    await setDoc(ref(a,'messages','platform-support'),{...payload('platform-support'),conversationType:'support',conversationId:'support-hd-manager',recipientEmpId:'',receiverEmpId:''});
    await denied(setDoc(ref(a,'messages','platform-foreign'),{...payload('platform-foreign'),conversationType:'support',conversationId:'support-hd-manager',recipientEmpId:foreign.id,receiverEmpId:foreign.id}));
  });
  await test('catalog defaults stay aligned, manager/legacy reads and company queries stay compatible, and old assignments lose write access',{timeout:30000},async()=>{
    await seed();const roles=[['accounting','Kế toán & nhân sự'],['sales','Kinh doanh'],['warehouse','Xuất kho'],['production','Sản xuất'],['driver','Tài xế']];
    for(const[key,position]of roles){const actor=employee(`default-${key}`,position);await env.withSecurityRulesDisabled(context=>setDoc(ref(context.firestore(),'employees',actor.id),actor));
      const store=client(actor),subject={company:{},employee:actor,currentUser:actor};
      for(const [type,action]of [['image','send_image_attachment'],['contact','send_contact_attachment'],['location','send_location_attachment'],
        ['order','send_order_attachment'],['order_request','send_order_request_attachment'],['bank','send_bank_qr_attachment'],['report','send_report_attachment']]){
        const operation=setDoc(ref(store,'messages',`${key}-${type}`),{...payload(`${key}-${type}`,actor),attachmentType:type,attachmentText:'Default action fixture'});
        if(hasCompanyRolePermissionAction(subject,'messages',action))await operation;else await denied(operation);
      }
      const support=setDoc(ref(store,'messages',`${key}-support`),{...payload(`${key}-support`,actor),conversationType:'support',conversationId:'support-hd-manager',recipientEmpId:'',receiverEmpId:''});
      if(hasCompanyRolePermissionAction(subject,'messages','send_support_messages'))await support;else await denied(support);
    }
    await env.withSecurityRulesDisabled(async context=>{const store=context.firestore();await setDoc(ref(store,'messages','legacy'),{id:'legacy',companyId,text:'Legacy history'});
      await setDoc(ref(store,'messages','customer-history'),{id:'customer-history',companyId,customerId:'assigned',conversationType:'customer_support',
        conversationId:'customer_assigned',assignmentState:'assigned',assignedEmployeeId:staff.id,senderType:'customer',senderCustomerId:'assigned',text:'History'});});
    assert.equal((await getDoc(ref(admin,'messages','legacy'))).data().text,'Legacy history');
    assert.equal((await getDoc(ref(admin,'messages','customer-history'))).data().text,'History');
    assert.ok((await getDocs(query(collection(admin,'artifacts',appId,'public','data','messages'),where('companyId','==',companyId)))).size>=2);
    await setCompany({employeeRolePermissions:{staff:{messages:false}}});
    await denied(getDoc(ref(a,'messages','legacy')));
    await env.withSecurityRulesDisabled(context=>setDoc(ref(context.firestore(),'customers','assigned'),{id:'assigned',companyId,empId:owner.id}));
    await denied(setDoc(ref(a,'messages','stale-assignment'),{...payload('stale-assignment'),conversationType:'customer_support',conversationId:'customer_assigned',
      customerId:'assigned',assignmentState:'assigned',assignedEmployeeId:staff.id}));
  });
}finally{await env.cleanup();}
