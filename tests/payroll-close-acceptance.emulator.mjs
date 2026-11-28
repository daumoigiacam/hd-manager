import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,updateDoc,query,where} from 'firebase/firestore';
import {createPayrollParentCommands} from './helpers/payroll-close-command-fixture.mjs';
import {payrollPolicyReviewSignature} from '../development/hd-manager/application/src/utils/payrollPolicyCompletion.js';
import {createPayrollEmployeeSnapshot,createPayrollPeriodRecord,buildPayrollPeriodId} from '../development/hd-manager/application/src/utils/payrollPeriodLock.js';
import {applyPayrollOpeningDebtToSalaryDetails} from '../development/hd-manager/application/src/utils/payrollDebtCarryover.js';
import {applyPayrollCustomerDebtReconciliation,payrollCustomerDebtBasis} from '../development/hd-manager/application/src/utils/payrollCustomerDebt.js';

if (!/^(?:127\.0\.0\.1|localhost):8185$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Payroll acceptance requires loopback Firestore emulator');
const projectId=`demo-payroll-close-acceptance-${process.pid}`,companyId='qa-payroll-company',appId='qa-payroll-close';
const pathFor=(name,id)=>`artifacts/${appId}/public/data/${name}/${id}`;

test('actual parent closes a 14-employee period atomically, transfers once, freezes results and rejects stale/backdated writes',async()=>{
  const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8185,rules:readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}});
  const owner={id:'qa-owner',companyId,name:'Chủ doanh nghiệp QA',position:'Chủ doanh nghiệp',role:'owner'};
  const staff=Array.from({length:14},(_,index)=>index+1).map(number=>({id:`qa-staff-${number}`,companyId,name:`Nhân viên QA ${number}`,position:'Sản xuất',startDate:'2025-01-01',basicSalary:6000000,salaryMonthDays:26}));
  const state={employees:[owner,...staff],payrollPeriods:[],payrollDebtCarryovers:[],payrollSnapshots:[],activityLogs:[]};
  const db=env.authenticatedContext('qa-owner-uid',{companyId,appUserId:owner.id,identityId:'qa-owner-identity',accountType:'employee',role:'owner'}).firestore();
  try {
    await env.withSecurityRulesDisabled(async ctx=>{const seed=ctx.firestore();await setDoc(doc(seed,pathFor('companies',companyId)),{id:companyId,ownerId:owner.id});for(const emp of state.employees)await setDoc(doc(seed,pathFor('employees',emp.id)),emp);});
    const parent=()=>createPayrollParentCommands({db,appId,isVpsStagingMode:false,firebaseUser:{uid:'qa-owner-uid'},myCompanyId:companyId,
      rawEmployees:state.employees,rawPayrollPeriods:state.payrollPeriods,currentCompany:{id:companyId},appCurrentEmployee:owner,currentUser:owner,
      activeTenantScopeRef:{current:companyId},pendingFirebaseWritesRef:{current:[]},canCurrentUserManagePayrollByRole:()=>true,
      hasCompanyRolePermissionAction:()=>true,isOwnerPosition:position=>position==='Chủ doanh nghiệp',
      setRawEmployees:update=>{state.employees=update(state.employees);},scheduleCollectionRefresh(){},
      getFriendlyFirebaseErrorMessage:error=>error.message,
      applyLocalCollectionWrite:(name,id,value)=>{state[name]=[...(state[name] || []).filter(row=>row.id!==id),value];}});
    const complete=async(monthKey,emp)=>{
      const result=await parent().handleCompletePayrollPolicy({employeeId:emp.id,monthKey,expectedSignature:payrollPolicyReviewSignature(emp),confirmed:true,reason:'QA: đối chiếu hợp đồng trong môi trường giả lập'});
      assert.equal(result.success,true,result.message);
    };
    const payload=(monthKey,opening=0)=>{
      const snapshots=state.employees.filter(emp=>emp.id!==owner.id).map((emp,index)=>createPayrollEmployeeSnapshot({companyId,monthKey,employee:emp,
        salaryDetails:applyPayrollOpeningDebtToSalaryDetails(applyPayrollCustomerDebtReconciliation({monthKey,workDays:26,baseSalaryCalc:6000000,grossSalary:6000000,totalAdvance:monthKey==='2026-09' && index===0?10000000:0,
          deductionTotal:monthKey==='2026-09' && index===0?10000000:0,netSalary:monthKey==='2026-09' && index===0?-4000000:6000000},payrollCustomerDebtBasis(state.payrollPeriods,companyId,monthKey,emp.id)),index===0?opening:0),lockedAt:new Date().toISOString(),lockedByEmployeeId:owner.id}));
      return {snapshots,period:createPayrollPeriodRecord({companyId,monthKey,snapshots,lockedAt:new Date().toISOString(),lockedByEmployeeId:owner.id,totals:{totalSalary:snapshots.reduce((s,row)=>s+row.salaryDetails.netSalary,0),totalDays:staff.length*26}})};
    };
    for(const emp of staff)await complete('2026-09',emp);
    const september=payload('2026-09');
    const [first,second]=await Promise.all([parent().handleLockPayrollPeriod(september),parent().handleLockPayrollPeriod(september)]);
    assert.equal([first,second].filter(result=>result.success).length,1,'one concurrent close wins');
    const stored=await getDoc(doc(db,pathFor('payrollPeriods',buildPayrollPeriodId(companyId,'2026-09'))));
    assert.equal(stored.data().status,'LOCKED');assert.ok(stored.data().closedAtServer.toMillis()>0);assert.equal(stored.data().totalEndingDebt,4000000);
    assert.equal((await getDocs(query(collection(db,`artifacts/${appId}/public/data/payrollDebtCarryovers`),where('companyId','==',companyId)))).size,1);
    assert.equal((await getDocs(query(collection(db,`artifacts/${appId}/public/data/payrollSnapshots`),where('companyId','==',companyId)))).size,14);
    assert.equal((await parent().handleLockPayrollPeriod(september)).success,false,'retry does not duplicate');
    const before=await getDoc(doc(db,pathFor('payrollSnapshots',september.snapshots[0].id)));
    await assertFails(updateDoc(doc(db,pathFor('payrollSnapshots',before.id)),{salaryDetails:{netSalary:1}}));
    assert.equal((await parent().handleCompletePayrollPolicy({employeeId:staff[0].id,monthKey:'2026-09',confirmed:true,reason:'late change',expectedSignature:payrollPolicyReviewSignature(state.employees[1])})).success,false);
    for(const emp of [...state.employees].filter(emp=>emp.id!==owner.id))await complete('2026-10',emp);
    const october=payload('2026-10',4000000),next=await parent().handleLockPayrollPeriod(october);
    assert.equal(next.success,true,next.message);assert.equal(next.snapshots[0].salaryDetails.netSalary,2000000);assert.equal(next.snapshots[0].salaryDetails.endingDebt,0);
    assert.equal((await getDoc(doc(db,pathFor('payrollSnapshots',before.id)))).data().salaryDetails.endingDebt,4000000,'earlier month unchanged');
    const backdated=await parent().handleLockPayrollPeriod({period:{monthKey:'2026-08'},snapshots:[]});
    assert.equal(backdated.success,false);assert.match(backdated.message,/kỳ sau đã chốt/i);
    assert.equal((await getDoc(doc(db,pathFor('payrollPeriods',buildPayrollPeriodId(companyId,'2026-08'))))).exists(),false);
  } finally {await env.cleanup();}
});
