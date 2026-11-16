import fs from'node:fs';import{initializeTestEnvironment,assertSucceeds,assertFails}from'@firebase/rules-unit-testing';import{doc,setDoc,updateDoc,getDoc}from'firebase/firestore';
import {hdSampleCommissionPolicy,commissionPolicyFromDraft} from '../development/hd-manager/application/src/utils/commissionPolicy.js';
const projectId='demo-hdmanager-commission-'+process.pid,appId='commission-local-test',endpoint=new URL('http://'+(process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8285'));
if(!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname))throw Error('Commission tests require a loopback Firestore Emulator');
const env=await initializeTestEnvironment({projectId,firestore:{host:endpoint.hostname,port:Number(endpoint.port),rules:fs.readFileSync('firestore.rules','utf8')}});
const path=(collection,id)=>`artifacts/${appId}/public/data/${collection}/${id}`;
const actor=(id,company='a',role='employee')=>env.authenticatedContext(id,{identityId:'identity-'+id,companyId:company,appUserId:id,accountType:'employee',role}).firestore();
const owner=actor('owner-a','a','owner'),accounting=actor('accounting-a','a','accounting'),staff=actor('staff-a'),revoked=actor('revoked-a','a','accounting'),other=actor('owner-b','b','owner');
const tier={minExcessRevenue:500000000,rate:0.02};let passed=0;const check=async(name,run)=>{await run();passed++;console.log('PASS '+name)};
try{
 await env.withSecurityRulesDisabled(async context=>{const db=context.firestore();for(const[id,company,position]of[['owner-a','a','Chủ doanh nghiệp'],['owner-b','b','Chủ doanh nghiệp'],['accounting-a','a','Kế toán & nhân sự'],['revoked-a','a','Kế toán & nhân sự'],['staff-a','a','Kinh doanh']])await setDoc(doc(db,path('employees',id)),{id,companyId:company,position,commissionRate:0.015,targetRevenue:500000000});await setDoc(doc(db,path('companies','a')),{companyId:'a',employeeRolePermissions:{'revoked-a':{employees:true}},employeeRolePermissionActions:{'revoked-a':{employees:{edit_employee_salary_policy:false}}}});await setDoc(doc(db,path('companies','b')),{companyId:'b'});});
 await check('owner saves valid canonical tiers',()=>assertSucceeds(updateDoc(doc(owner,path('employees','staff-a')),{commissionTiers:[tier]})));
 await check('accounting with current permission can edit the tiers',()=>assertSucceeds(updateDoc(doc(accounting,path('employees','staff-a')),{commissionTiers:[{...tier,rate:0.025}]})));
 await check('all five supported tiers are validated without exhausting the rule budget',async()=>{const tiers=Array.from({length:5},(_,n)=>({minExcessRevenue:(n+1)*1000000,rate:0.02+n*0.001}));await assertSucceeds(updateDoc(doc(accounting,path('employees','staff-a')),{commissionTiers:tiers}));await assertSucceeds(setDoc(doc(owner,path('employees','new-sales-a')),{companyId:'a',position:'Kinh doanh',commissionRate:0.015,commissionTiers:tiers}));});
 await check('staff cannot change own tier or rate through direct SDK calls',async()=>{await assertFails(updateDoc(doc(staff,path('employees','staff-a')),{commissionTiers:[{...tier,rate:0.5}]}));await assertFails(updateDoc(doc(staff,path('employees','staff-a')),{commissionRate:0.5}));});
 await check('staff cannot inject tiers through policy history while leaving top-level tiers untouched',()=>assertFails(updateDoc(doc(staff,path('employees','staff-a')),{payrollPolicies:[{effectiveFrom:'2026-11-01',values:{commissionTiers:[{...tier,rate:0.5}]}}]})));
 await check('accounting role name does not override an explicitly revoked salary action',()=>assertFails(updateDoc(doc(revoked,path('employees','staff-a')),{commissionTiers:[tier]})));
 await check('another tenant owner cannot change or read this employee',async()=>{await assertFails(updateDoc(doc(other,path('employees','staff-a')),{commissionTiers:[tier]}));await assertFails(getDoc(doc(other,path('employees','staff-a'))));});
 await check('duplicate, descending, fractional, malformed and excessive tiers are rejected on server',async()=>{for(const value of[[tier,tier],[tier,{minExcessRevenue:600000000,rate:0.01}],[{...tier,minExcessRevenue:0.5}],[{...tier,rate:2}],Array.from({length:6},(_,n)=>({minExcessRevenue:n+1,rate:0.02})),{bad:true}])await assertFails(updateDoc(doc(owner,path('employees','staff-a')),{commissionTiers:value}));});
 await check('unrelated own contact edits still work without salary permission',()=>assertSucceeds(updateDoc(doc(staff,path('employees','staff-a')),{phone:'local-commission-test'})));
 await check('advanced progressive policy persists and reads back under actual salary permission',async()=>{
  const policy={...commissionPolicyFromDraft(hdSampleCommissionPolicy('2026-11-01')),status:'active'};
  await assertSucceeds(updateDoc(doc(accounting,path('employees','staff-a')),{commissionPolicy:policy}));
  const saved=(await assertSucceeds(getDoc(doc(owner,path('employees','staff-a'))))).data();
  if(saved.commissionPolicy.tiers[1].rate!==0.025||saved.commissionPolicy.targetRevenue!==500000000)throw Error('Policy persistence mismatch');
  await assertSucceeds(updateDoc(doc(accounting,path('employees','staff-a')),{commissionPolicyDraft:{...policy,status:'draft'},commissionPolicy:policy}));
 });
 await check('five advanced ranges fit the Rules budget and survive a profile payload with unchanged legacy tiers',async()=>{
  const policy={...commissionPolicyFromDraft(hdSampleCommissionPolicy('2026-11-01')),status:'active',tiers:Array.from({length:5},(_,n)=>({id:'r-'+n,from:n*100000000,to:n===4?null:(n+1)*100000000,rate:0.02,fixedBonus:0,enabled:true}))};
  await assertSucceeds(updateDoc(doc(accounting,path('employees','staff-a')),{commissionPolicy:policy,commissionPolicyDraft:null}));
 });
 await check('advanced policy, approval and draft cannot bypass revoked action or tenant isolation',async()=>{
  const policy={...commissionPolicyFromDraft(hdSampleCommissionPolicy('2026-11-01')),status:'active'};
  for(const db of [staff,revoked,other])await assertFails(updateDoc(doc(db,path('employees','staff-a')),{commissionPolicy:policy}));
  await assertFails(updateDoc(doc(staff,path('employees','staff-a')),{commissionPolicyDraft:{...policy,status:'draft'}}));
 });
 await check('advanced gaps, overlaps and active policy masquerading as a draft are rejected',async()=>{
  const policy={...commissionPolicyFromDraft(hdSampleCommissionPolicy('2026-11-01')),status:'active'};
  for(const tiers of [[{...policy.tiers[0],from:1},...policy.tiers.slice(1)],[policy.tiers[0],{...policy.tiers[1],from:500000001},policy.tiers[2]]])await assertFails(updateDoc(doc(owner,path('employees','staff-a')),{commissionPolicy:{...policy,tiers}}));
  await assertFails(updateDoc(doc(owner,path('employees','staff-a')),{commissionPolicyDraft:policy}));
 });
 await check('explicit employee-level salary grant works and revocation immediately blocks the next write',async()=>{await env.withSecurityRulesDisabled(context=>updateDoc(doc(context.firestore(),path('companies','a')),{'employeeRolePermissions.staff-a':{employees:true},'employeeRolePermissionActions.staff-a':{employees:{edit_employee_salary_policy:true}}}));await assertSucceeds(updateDoc(doc(staff,path('employees','staff-a')),{commissionTiers:[tier]}));await env.withSecurityRulesDisabled(context=>updateDoc(doc(context.firestore(),path('companies','a')),{'employeeRolePermissionActions.staff-a.employees.edit_employee_salary_policy':false}));await assertFails(updateDoc(doc(staff,path('employees','staff-a')),{commissionTiers:[{...tier,rate:0.03}]}));});
 console.log(JSON.stringify({status:'PASS_LOCAL_FIRESTORE_EMULATOR_ONLY',tests:passed,projectId,productionTouched:false}));
}finally{await env.cleanup();}
