import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,runTransaction,setDoc,serverTimestamp,setLogLevel} from 'firebase/firestore';
import {prepareSettingsMutation,commitSettingsMutation} from '../src/utils/settingsMutationIntegrity.js';
import {employeeReviewFeaturePatch} from '../src/utils/companyEmployeeReviews.js';
import {hasCompanyRolePermissionAction} from '../src/features/payroll/payrollOriginalDomain.js';

const endpoint=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8185';
if(!/^(?:127\.0\.0\.1|localhost):8185$/.test(endpoint))throw Error('Only loopback Firestore port 8185 is allowed');
const projectId=`demo-settings-integrity-${process.pid}`;
if(!/^demo-settings-integrity-\d+$/.test(projectId))throw Error('An owned demo settings project is required');
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8185';
setLogLevel('silent');
const rules=fs.readFileSync(new URL('../../../../firestore.rules',import.meta.url),'utf8');
console.log(`FENCE emulator=127.0.0.1:8185 project=${projectId} rootRulesSHA256=${createHash('sha256').update(rules).digest('hex')}`);
const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8185,rules}});
const companyId='settings-company-a',foreignCompanyId='settings-company-b',appId='settings-integrity-only';
const owner={id:'owner-a',companyId,role:'owner',position:'Chủ doanh nghiệp'};
const staff={id:'staff-a',companyId,role:'employee',position:'Kế toán'};
const outsider={id:'outsider-b',companyId:foreignCompanyId,role:'owner',position:'Chủ doanh nghiệp'};
const client=actor=>env.authenticatedContext(actor.id,{companyId:actor.companyId,appUserId:actor.id,
  identityId:'identity-'+actor.id,accountType:'employee',role:actor.role}).firestore();
const a=client(owner),b=client(owner),staffDb=client(staff),foreign=client(outsider);
const ref=(db,name,id)=>doc(db,'artifacts',appId,'public','data',name,id);
const read=async(db=a)=>(await getDoc(ref(db,'companies',companyId))).data();
async function seed(){
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await setDoc(ref(db,'companies',companyId),{id:companyId,name:'Original',bankAccountNumber:'111',customerLoyaltyEnabled:true,
      salaryAdvancePercent:20,employeeReviewsEnabled:true,employeeRolePermissions:{[staff.id]:{settings:true}},
      employeeRolePermissionActions:{[staff.id]:{settings:{edit_company_profile:true,manage_bank_accounts:false,manage_employee_review_settings:true,manage_attendance_wifi:true}}}});
    await setDoc(ref(db,'companies',foreignCompanyId),{id:foreignCompanyId,name:'Foreign'});
    for(const actor of [owner,staff,outsider])await setDoc(ref(db,'employees',actor.id),actor);
  });
}
async function plan(patch,id,{db=a,actor=owner,base,options}={}){
  const company=base||await read(db);
  return prepareSettingsMutation({patch,options:options||{clientCommandId:id,clientMutationAt:'2026-11-22T03:04:05.000Z',
    expectedSettings:Object.fromEntries(Object.keys(patch).map(key=>[key,Object.hasOwn(company,key)?{exists:true,value:company[key]}:{exists:false}]))},
    company,companyId,actorId:actor.id,context:{company,employee:actor,currentUser:actor},hasPermission:hasCompanyRolePermissionAction});
}
async function commit(prepared,{db=a,actor=owner,transaction=runTransaction}={}){
  return commitSettingsMutation({plan:prepared,db,companyRef:ref(db,'companies',companyId),employeeRef:ref(db,'employees',actor.id),
    commandRef:ref(db,'companySettingsCommands',companyId+'_'+actor.id+'_'+prepared.commandId),runTransaction:transaction,
    isCurrent:()=>true,hasPermission:hasCompanyRolePermissionAction,context:{currentUser:actor},
    buildPatch:patch=>Object.hasOwn(patch,'employeeReviewsEnabled')?employeeReviewFeaturePatch(patch.employeeReviewsEnabled,actor.id,serverTimestamp()):{...patch,updatedAt:prepared.mutationAt}});
}
try {
  await test('real transaction patches only supplied fields and rejects raw invalid inputs before writes',{timeout:30000},async()=>{
    await seed();const before=await read(),patch={name:'Changed'},input=structuredClone(patch),p=await plan(patch,'strict');
    await commit(p);const saved=await read();assert.equal(saved.name,'Changed');
    for(const key of Object.keys(before).filter(key=>key!=='name'))assert.deepEqual(saved[key],before[key]);
    for(const key of ['expectedSettings','clientCommandId','clientMutationAt'])assert.equal(Object.hasOwn(saved,key),false);
    for(const invalid of [{salaryAdvancePercent:-1},{customerLoyaltyEnabled:'false'},{loyaltyEarnAmountPerPoint:Infinity},{ownerId:'forged'}])await assert.rejects(plan(invalid,'invalid'));
    assert.deepEqual(patch,input);assert.deepEqual(await read(),saved);
  });
  await test('concurrent clients from one field snapshot yield one commit and one CAS conflict; disjoint patches coexist',{timeout:30000},async()=>{
    await seed();const base=await read();const one=await plan({name:'One'},'one',{base}),two=await plan({name:'Two'},'two',{base,db:b});
    const results=await Promise.allSettled([commit(one),commit(two,{db:b})]);
    assert.equal(results.filter(row=>row.status==='fulfilled').length,1);
    assert.equal(results.find(row=>row.status==='rejected').reason.code,'settings_conflict');
    const p=await plan({bankAccountNumber:'222'},'bank',{base}),q=await plan({customerLoyaltyEnabled:false},'loyalty',{base,db:b});
    await Promise.all([commit(p),commit(q,{db:b})]);const current=await read();assert.equal(current.bankAccountNumber,'222');assert.equal(current.customerLoyaltyEnabled,false);
  });
  await test('lost-ACK replay after a later command preserves later company fields and its timestamp',{timeout:30000},async()=>{
    await seed();const first=await plan({name:'First'},'lost');
    await assert.rejects(commit(first,{transaction:async(db,callback)=>{await runTransaction(db,callback);throw Error('Lost ACK');}}),/Lost ACK/);
    const later=await plan({name:'Later'},'later');await commit(later);const before=await read();
    assert.equal((await commit(first,{db:b})).replay,true);assert.deepEqual(await read(),before);
    const changed=await plan({name:'Different'},'lost');await assert.rejects(commit(changed),{code:'settings_command_conflict'});assert.deepEqual(await read(),before);
  });
  await test('review switch obeys exact Rules audit fields; owner WiFi works and nonowner WiFi is denied atomically',{timeout:30000},async()=>{
    await seed();const review=await plan({employeeReviewsEnabled:false},'review',{db:staffDb,actor:staff});
    await commit(review,{db:staffDb,actor:staff});const saved=await read();
    assert.equal(saved.employeeReviewsEnabled,false);assert.equal(saved.employeeReviewsUpdatedByEmpId,staff.id);assert.equal(typeof saved.employeeReviewsUpdatedAt.toDate,'function');
    assert.equal(Object.hasOwn(saved,'lastSettingsCommand'),false);
    await commit(await plan({attendanceWifiSsid:'QA',attendanceWifiBssid:'aa:bb:cc:dd:ee:12',attendanceWifiEnabled:true},'wifi'));
    const before=await read(),denied=await plan({attendanceWifiSsid:'Denied'},'wifi-denied',{db:staffDb,actor:staff});
    await assert.rejects(commit(denied,{db:staffDb,actor:staff}),error=>error.code==='permission-denied');assert.deepEqual(await read(),before);
    assert.equal((await getDoc(ref(a,'companySettingsCommands',companyId+'_'+staff.id+'_wifi-denied'))).exists(),false);
  });
  await test('server permission revocation and cross-tenant SDK access are denied without a partial command receipt',{timeout:30000},async()=>{
    await seed();const stale=await plan({name:'Stale grant'},'revoked',{db:staffDb,actor:staff});
    await env.withSecurityRulesDisabled(async context=>{
      const current=await read();current.employeeRolePermissionActions[staff.id].settings.edit_company_profile=false;
      await setDoc(ref(context.firestore(),'companies',companyId),current);
    });
    const before=await read();await assert.rejects(commit(stale,{db:staffDb,actor:staff}),{code:'permission-denied'});assert.deepEqual(await read(),before);
    await assert.rejects(getDoc(ref(foreign,'companies',companyId)),error=>error.code==='permission-denied');
    await assert.rejects(setDoc(ref(foreign,'companies',companyId),{name:'Foreign'},{merge:true}),error=>error.code==='permission-denied');
    assert.equal((await getDoc(ref(a,'companySettingsCommands',companyId+'_'+staff.id+'_revoked'))).exists(),false);
  });
} finally { await env.cleanup(); }
