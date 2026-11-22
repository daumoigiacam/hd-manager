import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {collection,doc,getDocFromServer,getDocsFromServer,onSnapshot,orderBy,limit,query,setDoc,setLogLevel,where} from 'firebase/firestore';
import {planMessageReadQueries} from '../src/services/messageReadAccessPlan.js';
import {roleDomain} from './helpers/role-permission-domain.mjs';
const {hasCompanyRolePermissionAction}=roleDomain;
const endpoint=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8185';
if(!/^(?:127\.0\.0\.1|localhost):8185$/.test(endpoint))throw Error('Loopback Firestore port 8185 only');
const projectId=`demo-message-read-rules-${process.pid}`;
if(!/^demo-message-read-rules-\d+$/.test(projectId))throw Error('Owned demo message read project only');
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8185';setLogLevel('silent');
const rules=fs.readFileSync(new URL('../../../../firestore.rules',import.meta.url),'utf8');
console.log(`FENCE emulator=127.0.0.1:8185 project=${projectId} rootRulesSHA256=${createHash('sha256').update(rules).digest('hex')}`);
const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8185,rules}});
const companyId='a',otherCompanyId='b',appId='message-read-rules';
const employee={id:'employee',companyId,position:'Tài xế',role:'employee'};
const manager={id:'manager',companyId,position:'Kế toán & nhân sự',role:'accounting'};
const owner={id:'owner',companyId,position:'Chủ doanh nghiệp',role:'owner'};
const client=(actor,claims={})=>env.authenticatedContext(actor.id,{companyId:actor.companyId,appUserId:actor.id,
  identityId:'identity-'+actor.id,accountType:'employee',role:actor.role,...claims}).firestore();
const staff=client(employee),admin=client(manager),boss=client(owner);
const portal=env.authenticatedContext('portal',{companyId,appUserId:'portal',customerId:'customer',identityId:'portal-identity',accountType:'customer',role:'customer'}).firestore();
const ref=(db,name,id)=>doc(db,'artifacts',appId,'public','data',name,id);
const messages=db=>collection(db,'artifacts',appId,'public','data','messages');
const typed=(db,types)=>query(messages(db),where('companyId','==',companyId),where('conversationType',Array.isArray(types)?'in':'==',types),orderBy('createdAt','desc'),limit(200));
const assigned=db=>query(messages(db),where('companyId','==',companyId),where('conversationType','==','customer_support'),
  where('assignmentState','==','assigned'),where('assignedEmployeeId','==',employee.id),orderBy('createdAt','desc'),limit(200));
const broad=db=>query(messages(db),where('companyId','==',companyId),orderBy('createdAt','desc'),limit(200));
const denied=promise=>assert.rejects(promise,error=>error.code==='permission-denied'&&!/maximum of 1000 expressions/.test(error.message));
const individual=(id,module,actions)=>({employeeRolePermissions:{[id]:{messages:module}},employeeRolePermissionActions:{[id]:{messages:actions}}});
async function seed(company={}){
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();await setDoc(ref(db,'companies',companyId),{id:companyId,...company});
    await setDoc(ref(db,'companies',otherCompanyId),{id:otherCompanyId});
    for(const actor of [employee,manager,owner])await setDoc(ref(db,'employees',actor.id),actor);
    await setDoc(ref(db,'employees','foreign'),{id:'foreign',companyId:otherCompanyId,position:'Tài xế',role:'employee'});
    await setDoc(ref(db,'customers','customer'),{id:'customer',companyId,empId:employee.id});
    const rows=[['internal','internal'],['group','internal_group'],['platform','support'],['assigned','customer_support'],['unclassified','customer_support'],['legacy','']];
    for(const [index,[id,type]]of rows.entries())await setDoc(ref(db,'messages',id),{id,companyId,createdAt:index+1,text:id,
      ...(type?{conversationType:type}:{}),...(type==='customer_support'?{customerId:'customer',conversationId:'customer_customer',
        assignmentState:id==='assigned'?'assigned':'unclassified',assignedEmployeeId:id==='assigned'?employee.id:''}:{})});
  });
}
const setCompany=patch=>env.withSecurityRulesDisabled(context=>setDoc(ref(context.firestore(),'companies',companyId),{id:companyId,...patch}));
async function readPlan(actor,db,company,isManager){
  const descriptors=planMessageReadQueries({company:{id:companyId,...company},employee:actor,currentUser:{...actor,accountType:'employee'},isManager},hasCompanyRolePermissionAction);
  const snapshots=await Promise.all(descriptors.map(plan=>getDocsFromServer(query(messages(db),where('companyId','==',companyId),
    ...plan.filters.map(filter=>where(...filter)),orderBy('createdAt','desc'),limit(200)))));
  return new Set(snapshots.flatMap(snapshot=>snapshot.docs.map(item=>item.id)));
}
try{
  await test('empty-company SDK read/query defaults match actual App for every department, including default support denials',{timeout:30000},async()=>{
    await seed();
    for(const department of roleDomain.ROLE_PERMISSION_DEPARTMENTS){
      const actor={...employee,id:'default-'+department.key,position:department.positions[0],role:['owner','accounting'].includes(department.key)?department.key:'employee'};
      await env.withSecurityRulesDisabled(context=>setDoc(ref(context.firestore(),'employees',actor.id),actor));
      const db=client(actor),subject={company:{id:companyId},employee:actor,currentUser:actor};
      for(const [action,ids,types]of [['view_internal_messages',['internal','group'],['internal','internal_group']],
        ['view_support_messages',['platform','assigned'],['support']]]){
        const allowed=roleDomain.hasCompanyRolePermissionAction(subject,'messages',action);
        for(const id of ids){
          const read=getDocFromServer(ref(db,'messages',id));
          // Default support readers are owner/accounting managers. Other
          // departments must deny even the platform-support document.
          if(allowed)assert.equal((await read).exists(),true,department.key+'/'+id);else await denied(read);
        }
        if(allowed)assert.ok((await getDocsFromServer(typed(db,types))).size>0);else await denied(getDocsFromServer(typed(db,types)));
      }
      const isManager=department.key==='owner'||department.key==='accounting';
      const expected=isManager?['internal','group','platform','assigned','unclassified','legacy']:['internal','group'];
      assert.deepEqual(await readPlan(actor,db,{},isManager),new Set(expected),department.key);
      if(!isManager){await denied(getDocsFromServer(assigned(db)));await denied(getDocsFromServer(broad(db)));}
    }
  });
  await test('each actual staff department role key revokes the corresponding SDK message reads',{timeout:30000},async()=>{
    for(const department of roleDomain.ROLE_PERMISSION_DEPARTMENTS.filter(row=>row.key!=='owner')){
      await seed({rolePermissionActions:{[department.key]:{messages:{view_internal_messages:false,view_support_messages:false}}}});
      await env.withSecurityRulesDisabled(context=>setDoc(ref(context.firestore(),'employees',employee.id),{...employee,position:department.positions[0]}));
      try{await denied(getDocFromServer(ref(staff,'messages','internal')));await denied(getDocsFromServer(typed(staff,'internal')));}
      catch(error){error.message=department.key+': '+error.message;throw error;}
    }
  });
  await test('role action revocation blocks direct and typed-query reads immediately in the same authenticated session',{timeout:30000},async()=>{
    await seed();assert.equal((await getDocFromServer(ref(staff,'messages','internal'))).exists(),true);
    await setCompany({rolePermissions:{driver:{messages:true}},rolePermissionActions:{driver:{messages:{view_internal_messages:false,view_support_messages:false}}}});
    for(const id of ['internal','group','platform','assigned','legacy'])await denied(getDocFromServer(ref(staff,'messages',id)));
    await denied(getDocsFromServer(typed(staff,['internal','internal_group'])));await denied(getDocsFromServer(assigned(staff)));
  });
  await test('individual module/action revocation overrides prior role grants without revoking the customer own-message query',{timeout:30000},async()=>{
    await seed(individual(employee.id,true,{view_support_messages:true}));await getDocsFromServer(assigned(staff));
    for(const company of [individual(employee.id,false,{}),individual(employee.id,true,{view_internal_messages:false,view_support_messages:false})]){
      await setCompany(company);await denied(getDocsFromServer(assigned(staff)));await denied(getDocFromServer(ref(staff,'messages','assigned')));await denied(getDocsFromServer(typed(staff,'internal')));
      const own=await getDocsFromServer(query(messages(portal),where('companyId','==',companyId),where('customerId','==','customer'),where('conversationType','==','customer_support')));assert.equal(own.size,2);
    }
  });
  await test('partial manager grants accept helper-generated typed plans and reject the old broader company inbox',{timeout:30000},async()=>{
    for(const [actions,expected]of [[{view_internal_messages:true,view_support_messages:false},['internal','group']],
      [{view_internal_messages:false,view_support_messages:true},['platform','assigned','unclassified']]]){
      const company=individual(manager.id,true,actions);await seed(company);
      assert.deepEqual(await readPlan(manager,admin,company,true),new Set(expected));await denied(getDocsFromServer(broad(admin)));
    }
    await seed();assert.equal((await getDocsFromServer(broad(admin))).size,6);assert.equal((await getDocsFromServer(broad(boss))).size,6);
  });
  await test('partial employee grants preserve assignment scope and never mix a revoked platform-support category',{timeout:30000},async()=>{
    for(const [actions,expected]of [[{view_internal_messages:true,view_support_messages:false},['internal','group']],
      [{view_internal_messages:false,view_support_messages:true},['platform','assigned']]]){
      const company=individual(employee.id,true,actions);await seed(company);
      assert.deepEqual(await readPlan(employee,staff,company,false),new Set(expected));
      await denied(getDocsFromServer(typed(staff,['internal','internal_group','support'])));await denied(getDocFromServer(ref(staff,'messages','unclassified')));
    }
    await seed();assert.deepEqual(await readPlan(employee,staff,{},false),new Set(['internal','group']));
    await denied(getDocsFromServer(broad(staff)));
  });
  await test('explicit action grants override disabled modules; individual replacement uses catalog fallback; nonboolean values cannot grant Rules reads',{timeout:30000},async()=>{
    await seed(individual(employee.id,false,{view_internal_messages:true,view_support_messages:false}));await getDocsFromServer(typed(staff,['internal','internal_group']));await denied(getDocsFromServer(assigned(staff)));
    await setCompany({rolePermissionActions:{driver:{messages:{view_internal_messages:false,view_support_messages:false}}},...individual(employee.id,true,{})});
    await getDocsFromServer(typed(staff,'internal'));await denied(getDocsFromServer(assigned(staff)));
    await setCompany(individual(employee.id,false,{view_internal_messages:'true',view_support_messages:false}));await denied(getDocFromServer(ref(staff,'messages','internal')));
  });
  await test('active listener cannot receive new message data after its role view action is revoked',{timeout:15000},async()=>{
    await seed();let unsubscribe,timer;const seen=[];
    const initial=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Expected initial server snapshot')),7000);
      unsubscribe=onSnapshot(typed(staff,'internal'),{includeMetadataChanges:true},snapshot=>{seen.push(...snapshot.docs.map(item=>item.data().text));if(!snapshot.metadata.fromCache){clearTimeout(timer);resolve();}},reject);});
    try{
      await initial;unsubscribe();
      let ready;
      const started=new Promise(resolve=>{ready=resolve;});
      const revoked=new Promise((resolve,reject)=>{
        timer=setTimeout(()=>reject(Error('Expected active listener revocation')),7000);
        unsubscribe=onSnapshot(typed(staff,'internal'),{includeMetadataChanges:true},snapshot=>{seen.push(...snapshot.docs.map(item=>item.data().text));if(!snapshot.metadata.fromCache)ready();},error=>{clearTimeout(timer);ready();resolve(error);});
      });
      await started;
      await setCompany({rolePermissionActions:{driver:{messages:{view_internal_messages:false}}}});
      await env.withSecurityRulesDisabled(context=>setDoc(ref(context.firestore(),'messages','new-after-revoke'),{id:'new-after-revoke',companyId,conversationType:'internal',text:'MUST NOT LEAK',createdAt:99}));
      assert.equal((await revoked).code,'permission-denied');assert.equal(seen.includes('MUST NOT LEAK'),false);
    }finally{clearTimeout(timer);unsubscribe?.();}
  });
  await test('archived/foreign employees, spoofed owner claims and cross-tenant reads cannot bypass a current read revoke',{timeout:30000},async()=>{
    await seed(individual(employee.id,true,{view_internal_messages:false,view_support_messages:false}));
    await denied(getDocsFromServer(broad(client(employee,{role:'owner'}))));
    await setCompany({});await env.withSecurityRulesDisabled(context=>setDoc(ref(context.firestore(),'employees',employee.id),{...employee,isArchived:true}));
    await denied(getDocFromServer(ref(staff,'messages','internal')));
    const foreign=client({id:'foreign',companyId:otherCompanyId,role:'employee'});await denied(getDocFromServer(ref(foreign,'messages','internal')));await denied(getDocsFromServer(typed(foreign,'internal')));
  });
}finally{await env.cleanup();}
