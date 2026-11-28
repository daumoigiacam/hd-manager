import test from 'node:test';
import assert from 'node:assert/strict';
import {applyPayrollCustomerDebtReconciliation,payrollCustomerDebtBasis,getPayrollSequenceBlocker,getPayrollEarnedIncome} from '../src/utils/payrollCustomerDebt.js';
import {applyPayrollOpeningDebtToSalaryDetails} from '../src/utils/payrollDebtCarryover.js';
import {buildPayrollPeriodId,buildPayrollSnapshotId} from '../src/utils/payrollPeriodLock.js';

const companyId='qa-company',employeeId='qa-sales';
const salary=(balance,wage=20000000)=>({grossSalary:wage,badDebt:balance,deductionTotal:balance,netSalary:wage-balance});
const settle=(balance,prior=0,opening=0)=>applyPayrollOpeningDebtToSalaryDetails(applyPayrollCustomerDebtReconciliation(salary(balance),{ready:true,balance:prior,sourcePeriodId:prior?'prior':''}),opening);
test('approved example: debt 100m and monthly wage 20m carry 80m then 60m, without charging the same 100m twice',()=>{
  const first=settle(100000000);
  assert.equal(first.endingDebt,80000000);assert.equal(first.netSalary,0);
  const second=settle(100000000,100000000,first.endingDebt);
  assert.equal(second.endingDebt,60000000);assert.equal(second.badDebt,0);assert.equal(second.netSalary,0);
  const third=settle(100000000,100000000,second.endingDebt);
  assert.equal(third.endingDebt,40000000);
});
test('new customer debt, partial repayment and full repayment reconcile with the frozen preceding balance',()=>{
  assert.equal(settle(130000000,100000000,80000000).endingDebt,90000000);
  const partial=settle(70000000,100000000,80000000);
  assert.equal(partial.customerDebtCredit,30000000);assert.equal(partial.endingDebt,30000000);
  const full=settle(0,100000000,80000000);
  assert.equal(full.endingDebt,0);assert.equal(full.netSalary,40000000);assert.equal(full.customerDebtCredit,100000000);
  assert.equal(full.grossSalary-full.deductionTotal,full.netSalary);
  assert.equal(getPayrollEarnedIncome(full),20000000,'repayments do not increase the salary advance limit');
  assert.equal(getPayrollEarnedIncome({grossSalary:100000000,customerDebtCredit:100000000,netSalary:20000000}),0);
});
test('zero balance, independent advances and repeated adapter calls preserve exact money and inputs',()=>{
  const raw={...salary(100000000),totalAdvance:5000000,deductionTotal:105000000,netSalary:-85000000};
  const before=structuredClone(raw),adjusted=applyPayrollCustomerDebtReconciliation(raw,{ready:true,balance:100000000,sourcePeriodId:'prior'});
  const settled=applyPayrollOpeningDebtToSalaryDetails(adjusted,80000000);
  assert.equal(settled.endingDebt,65000000);assert.deepEqual(raw,before);
  assert.deepEqual(applyPayrollCustomerDebtReconciliation(adjusted),adjusted);
  assert.equal(settle(0).netSalary,20000000);
});
test('keeps employee/tenant balances separate and blocks incomplete legacy evidence and skipped periods',()=>{
  const monthKey='2026-10',id=buildPayrollPeriodId(companyId,monthKey);
  const period={id,companyId,monthKey,status:'LOCKED',snapshotIds:[buildPayrollSnapshotId(companyId,monthKey,employeeId)],customerDebtReconciliationVersion:1,customerDebtBalances:{[employeeId]:100000000}};
  assert.equal(payrollCustomerDebtBasis([period],companyId,'2026-11',employeeId).balance,100000000);
  assert.equal(payrollCustomerDebtBasis([period],companyId,'2026-11','new-employee').balance,0);
  assert.equal(payrollCustomerDebtBasis([period],'foreign','2026-11',employeeId).balance,0);
  assert.equal(payrollCustomerDebtBasis([{...period,customerDebtBalances:{}}],companyId,'2026-11',employeeId).ready,false);
  assert.match(getPayrollSequenceBlocker([period],companyId,'2026-12'),/2026-11/);
  assert.match(getPayrollSequenceBlocker([period],companyId,'2026-09'),/kỳ sau/i);
  assert.equal(getPayrollSequenceBlocker([period],companyId,'2026-11'),'');
});
