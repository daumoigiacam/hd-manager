import test from 'node:test';
import assert from 'node:assert/strict';
import {completePayrollPolicyForMonth,payrollPolicyReviewSignature} from '../src/utils/payrollPolicyCompletion.js';
import {buildEmployeePayrollPolicyUpdate,resolveStoredEmployeePayrollPolicy,getStoredEmployeePayrollPolicyHistory} from '../src/utils/payrollPolicyHistory.js';
import {createPayrollEmployeeSnapshot,createPayrollPeriodRecord,getPayrollLockBlockers} from '../src/utils/payrollPeriodLock.js';
import {assertPayrollCloseSnapshots,assertPayrollSnapshotPolicies} from '../src/utils/payrollCloseTransaction.js';

const employee = {id:'qa-employee',companyId:'qa-company',name:'Nhân sự thử nghiệm',position:'Sản xuất',startDate:'2025-01-01',basicSalary:6000000,salaryMonthDays:26};
const review = emp => ({employee:emp,companyId:employee.companyId,monthKey:'2026-10',expectedSignature:payrollPolicyReviewSignature(emp),
  confirmed:true,reason:'Đối chiếu hợp đồng tháng 10',reviewedAt:'2026-11-28T06:00:00Z',actorId:'qa-owner',actorName:'Người rà soát QA'});
const details = {monthKey:'2026-10',grossSalary:6000000,deductionTotal:8000000,netSalary:0,endingDebt:2000000,openingDebt:0,workDays:26,customerDebtReconciliationVersion:1,customerDebtBalance:0};
const snapshotFor = emp => createPayrollEmployeeSnapshot({companyId:emp.companyId,monthKey:'2026-10',employee:emp,salaryDetails:details,lockedAt:'2026-11-28T06:00:00Z',lockedByEmployeeId:'qa-owner'});

test('legacy employee cannot close until a person explicitly reviews and stores the missing monthly policy',()=>{
  const before = snapshotFor(employee);
  assert.equal(createPayrollPeriodRecord({companyId:employee.companyId,monthKey:'2026-10',snapshots:[before]}),null);
  assert.match(getPayrollLockBlockers([before]).join(' '),/Rà soát chính sách/);
  const patch = completePayrollPolicyForMonth(review(employee));
  const saved = {...employee,...patch};
  const policy = resolveStoredEmployeePayrollPolicy(saved,'2026-10');
  assert.equal(policy.effectiveFrom,'2026-10-01');assert.equal(policy.effectiveTo,'2026-10-31');
  assert.equal(policy.review.actorId,'qa-owner');assert.equal(policy.values.basicSalary,6000000);
  assert.equal(resolveStoredEmployeePayrollPolicy(saved,'2026-09'),null);
  assert.equal(resolveStoredEmployeePayrollPolicy(saved,'2026-11'),null);
  assertPayrollCloseSnapshots({companyId:employee.companyId,monthKey:'2026-10',employees:[saved],snapshots:[snapshotFor(saved)]});
});

test('completion preserves current fields, existing policies and future commission policy',()=>{
  const future = {...employee,...buildEmployeePayrollPolicyUpdate({nextEmployee:{...employee,basicSalary:8000000},effectiveFrom:'2026-11-01',changedAt:'2026-11-01T00:00:00Z'})};
  const original = structuredClone(future);
  const patch = completePayrollPolicyForMonth(review(future));
  assert.deepEqual(future,original);
  assert.equal(patch.basicSalary,undefined);assert.equal(patch.salaryPolicyEffectiveFrom,undefined);
  assert.deepEqual(patch.payrollPolicies[0],getStoredEmployeePayrollPolicyHistory(future)[0]);
  assert.equal(resolveStoredEmployeePayrollPolicy({...future,...patch},'2026-11').id,resolveStoredEmployeePayrollPolicy(future,'2026-11').id);
  assert.equal(patch.payrollPolicies[1].review.type,'MISSING_MONTH_POLICY_CONFIRMED');
});

test('refuses unconfirmed, stale, foreign, archived, duplicate and future-hire monthly completion',()=>{
  for (const change of [{confirmed:false},{reason:''},{actorId:''},{expectedSignature:'old'},
    {companyId:'another-company'},{employee:{...employee,isArchived:true}},{employee:{...employee,startDate:'2026-11-01'}}]) {
    assert.throws(()=>completePayrollPolicyForMonth({...review(employee),...change}));
  }
  const saved={...employee,...completePayrollPolicyForMonth(review(employee))};
  assert.throws(()=>completePayrollPolicyForMonth(review(saved)),/đã có chính sách/);
});

test('saving an unchanged legacy employee creates a policy without changing salary values',()=>{
  const patch=buildEmployeePayrollPolicyUpdate({employee,nextEmployee:employee,effectiveFrom:'2026-11-28',changedAt:'2026-11-28T00:00:00Z'});
  assert.equal(patch.payrollPolicies.length,1);assert.equal(patch.payrollPolicies[0].values.basicSalary,6000000);
  assert.equal(resolveStoredEmployeePayrollPolicy({...employee,...patch},'2026-10'),null);
});

test('empty modern alias does not hide valid historical policies',()=>{
  const patch=completePayrollPolicyForMonth(review(employee));
  const aliased={...employee,salaryPolicyHistory:patch.salaryPolicyHistory,payrollPolicies:[]};
  assert.equal(resolveStoredEmployeePayrollPolicy(aliased,'2026-10').version,'v1');
});

test('close rejects missing employees, duplicate snapshots, foreign scope and changed source policy',()=>{
  const saved={...employee,...completePayrollPolicyForMonth(review(employee))},snapshot=snapshotFor(saved);
  const command={companyId:employee.companyId,monthKey:'2026-10',employees:[saved],snapshots:[snapshot]};
  assert.throws(()=>assertPayrollCloseSnapshots({...command,snapshots:[snapshot,snapshot]}));
  assert.throws(()=>assertPayrollCloseSnapshots({...command,employees:[saved,{...saved,id:'another'}]}));
  assert.throws(()=>assertPayrollCloseSnapshots({...command,snapshots:[{...snapshot,companyId:'foreign'}]}));
  assert.throws(()=>assertPayrollCloseSnapshots({...command,snapshots:[{...snapshot,id:'arbitrary'}]}));
  const changed=structuredClone(saved);changed.payrollPolicies[0].values.basicSalary=1;
  assert.throws(()=>assertPayrollSnapshotPolicies([snapshot],[changed],saved.companyId,'2026-10'));
  assert.throws(()=>assertPayrollSnapshotPolicies([snapshot],[{...saved,isArchived:true}],saved.companyId,'2026-10'));
});
