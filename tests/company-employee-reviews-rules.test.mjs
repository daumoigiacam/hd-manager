import fs from 'node:fs';import assert from 'node:assert/strict';
import{initializeTestEnvironment,assertSucceeds,assertFails}from'@firebase/rules-unit-testing';
import{doc,setDoc,updateDoc,getDoc,getDocFromServer,deleteDoc,serverTimestamp,runTransaction}from'firebase/firestore';
const projectId='demo-hdmanager-review-toggle-'+process.pid,appId='review-feature-local-test';
const endpoint=new URL('http://'+(process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8285'));
if(!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname))throw Error('Review feature tests require a loopback Firestore Emulator');
const env=await initializeTestEnvironment({projectId,firestore:{host:endpoint.hostname,port:Number(endpoint.port),rules:fs.readFileSync('firestore.rules','utf8')}});
const path=(collection,id)=>`artifacts/${appId}/public/data/${collection}/${id}`;
const db=(id,company,role='employee')=>env.authenticatedContext(id,{identityId:'identity-'+id,companyId:company,accountType:'employee',appUserId:id,role}).firestore();
const a=db('owner-a','a','owner'),b=db('owner-b','b','owner'),staff=db('staff-a','a');let passed=0;
const check=async(name,body)=>{await body();passed++;console.log('PASS '+name);};
const patch=(enabled,id)=>({employeeReviewsEnabled:enabled,employeeReviewsUpdatedByEmpId:id,employeeReviewsUpdatedAt:serverTimestamp()});
try{
 await env.withSecurityRulesDisabled(async context=>{const s=context.firestore();for(const [company,owner]of[['a','owner-a'],['b','owner-b']]){await setDoc(doc(s,path('companies',company)),{id:company,name:company,salaryPolicy:{amount:420000}});await setDoc(doc(s,path('employees',owner)),{companyId:company,position:'Chủ doanh nghiệp'});}await setDoc(doc(s,path('employees','staff-a')),{companyId:'a',position:'Kinh doanh'});await setDoc(doc(s,path('employeeReviews','old-a')),{companyId:'a',targetEmployeeId:'staff-a',rating:4});await setDoc(doc(s,path('payrollSnapshots','locked-a')),{companyId:'a',employeeId:'staff-a',periodId:'locked-period',netSalary:420000,status:'locked'});});
 await check('legacy company with no flag keeps existing review creation',()=>assertSucceeds(setDoc(doc(staff,path('employeeReviews','before-off')),{companyId:'a',targetEmployeeId:'owner-a',rating:4})));
 await check('staff cannot change company review preference through direct API',()=>assertFails(updateDoc(doc(staff,path('companies','a')),patch(false,'staff-a'))));
 await check('owner cannot change another tenant preference',()=>assertFails(updateDoc(doc(b,path('companies','a')),patch(false,'owner-b'))));
 await check('owner disables only own company in a real Firestore transaction',()=>assertSucceeds(runTransaction(a,async tx=>{const ref=doc(a,path('companies','a'));await tx.get(ref);tx.update(ref,patch(false,'owner-a'));})));
 await check('disabled company rejects direct create, update and delete of reviews',async()=>{await assertFails(setDoc(doc(staff,path('employeeReviews','off-create')),{companyId:'a',rating:5}));await assertFails(updateDoc(doc(a,path('employeeReviews','old-a')),{rating:1}));await assertFails(deleteDoc(doc(a,path('employeeReviews','old-a'))));});
 await check('review history and locked payroll remain readable and financially unchanged',async()=>{assert.equal((await assertSucceeds(getDoc(doc(a,path('employeeReviews','old-a'))))).data().rating,4);assert.equal((await assertSucceeds(getDoc(doc(a,path('payrollSnapshots','locked-a'))))).data().netSalary,420000);assert.deepEqual((await getDoc(doc(a,path('companies','a')))).data().salaryPolicy,{amount:420000});});
 await check('invalid boolean and forged audit actor/time are rejected',async()=>{await assertFails(updateDoc(doc(a,path('companies','a')),patch('false','owner-a')));await assertFails(updateDoc(doc(a,path('companies','a')),patch(true,'staff-a')));await assertFails(updateDoc(doc(a,path('companies','a')),{employeeReviewsEnabled:true,employeeReviewsUpdatedByEmpId:'owner-a',employeeReviewsUpdatedAt:'2026-01-01'}));});
 await check('another company stays enabled; company A remains disabled',async()=>{await assertSucceeds(setDoc(doc(b,path('employeeReviews','b-review')),{companyId:'b',rating:5}));assert.equal((await getDoc(doc(a,path('companies','a')))).data().employeeReviewsEnabled,false);await assertFails(getDoc(doc(b,path('employeeReviews','old-a'))));});
 await check('unrelated settings do not reset the flag',async()=>{await assertSucceeds(updateDoc(doc(a,path('companies','a')),{displayName:'A local test'}));assert.equal((await getDoc(doc(a,path('companies','a')))).data().employeeReviewsEnabled,false);});
 await check('a fresh authenticated session restores the persisted company preference',async()=>{const restored=env.authenticatedContext('owner-a-new-session',{identityId:'identity-owner-a',companyId:'a',accountType:'employee',appUserId:'owner-a',role:'owner'}).firestore();assert.equal((await assertSucceeds(getDocFromServer(doc(restored,path('companies','a'))))).data().employeeReviewsEnabled,false);assert.equal((await getDocFromServer(doc(restored,path('payrollSnapshots','locked-a')))).data().netSalary,420000);});
 await check('owner reenables own feature and employee review creation resumes',async()=>{await assertSucceeds(updateDoc(doc(a,path('companies','a')),patch(true,'owner-a')));await assertSucceeds(setDoc(doc(staff,path('employeeReviews','after-on')),{companyId:'a',rating:4}));assert.equal((await getDoc(doc(a,path('payrollSnapshots','locked-a')))).data().netSalary,420000);});
 await check('an explicit role action grants only the company review switch',async()=>{
  await assertSucceeds(updateDoc(doc(a,path('companies','a')),{rolePermissionActions:{sales:{settings:{manage_employee_review_settings:true}}}}));
  await assertSucceeds(runTransaction(staff,async tx=>{const r=doc(staff,path('companies','a'));await tx.get(r);tx.update(r,patch(false,'staff-a'));}));
  assert.equal((await getDocFromServer(doc(a,path('companies','a')))).data().employeeReviewsEnabled,false);
  await assertSucceeds(updateDoc(doc(staff,path('companies','a')),patch(true,'staff-a')));
 });
 await check('delegated user cannot grant permissions, forge actor, or change another tenant',async()=>{
  await assertFails(updateDoc(doc(staff,path('companies','a')),{...patch(false,'staff-a'),rolePermissions:{sales:{role_permissions:true}}}));
  await assertFails(updateDoc(doc(staff,path('companies','a')),patch(false,'owner-a')));
  await assertFails(updateDoc(doc(staff,path('companies','b')),patch(false,'staff-a')));
 });
 await check('delegated setting action cannot self-promote an employee to company owner',async()=>{
  for(const change of [{isOwner:true},{isCompanyOwner:true},{role:'owner'},{role:'super_admin'},{position:'Chủ doanh nghiệp'}])await assertFails(updateDoc(doc(staff,path('employees','staff-a')),change));
  await assertFails(setDoc(doc(staff,path('employees','forged-owner')),{companyId:'a',role:'owner'}));
  await assertFails(deleteDoc(doc(staff,path('companies','a'))));
  assert.equal((await getDoc(doc(a,path('employees','staff-a')))).data().position,'Kinh doanh');
 });
 await check('role revocation denies the next direct write with the same authenticated session',async()=>{
  await assertSucceeds(updateDoc(doc(a,path('companies','a')),{rolePermissionActions:{sales:{settings:{manage_employee_review_settings:false}}}}));
  await assertFails(updateDoc(doc(staff,path('companies','a')),patch(false,'staff-a')));
 });
 await check('individual grant works independently and a personal deny replaces role permission',async()=>{
  await assertSucceeds(updateDoc(doc(a,path('companies','a')),{rolePermissionActions:{sales:{settings:{manage_employee_review_settings:true}}},employeeRolePermissions:{'staff-a':{settings:false}},employeeRolePermissionActions:{'staff-a':{settings:{manage_employee_review_settings:false}}}}));
  await assertFails(updateDoc(doc(staff,path('companies','a')),patch(false,'staff-a')));
  await assertSucceeds(updateDoc(doc(a,path('companies','a')),{employeeRolePermissionActions:{'staff-a':{settings:{manage_employee_review_settings:true}}}}));
  await assertSucceeds(updateDoc(doc(staff,path('companies','a')),patch(false,'staff-a')));
 });
 await check('archived employee is rejected even with an explicit permission',async()=>{
  await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),path('employees','staff-a')),{isArchived:true}));
  await assertFails(updateDoc(doc(staff,path('companies','a')),patch(true,'staff-a')));
  await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),path('employees','staff-a')),{isArchived:false}));
 });
 await check('individual revoke and non-boolean grant do not permit a write',async()=>{
  for(const grant of [false,'true']){
   await assertSucceeds(updateDoc(doc(a,path('companies','a')),{employeeRolePermissionActions:{'staff-a':{settings:{manage_employee_review_settings:grant}}}}));
   await assertFails(updateDoc(doc(staff,path('companies','a')),patch(true,'staff-a')));
  }
 });
 await check('customer claims cannot toggle reviews and history remains unchanged after delegation',async()=>{
  const customer=env.authenticatedContext('customer-a',{identityId:'identity-customer',companyId:'a',accountType:'customer',appUserId:'staff-a',role:'owner'}).firestore();
  await assertFails(updateDoc(doc(customer,path('companies','a')),patch(true,'staff-a')));
  await assertSucceeds(updateDoc(doc(a,path('companies','a')),patch(true,'owner-a')));
  assert.equal((await getDoc(doc(a,path('payrollSnapshots','locked-a')))).data().netSalary,420000);
 });
 console.log(JSON.stringify({status:'PASS_LOCAL_FIRESTORE_EMULATOR_ONLY',tests:passed,projectId,host:endpoint.host,productionTouched:false}));
}finally{await env.cleanup();}
