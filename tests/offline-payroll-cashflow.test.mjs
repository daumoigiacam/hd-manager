// Transactional adapter contracts. Not HTTPS, APK or Production acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {trustedCommandFixture,command} from './helpers/trusted-offline-command-fixture.mjs';
import {buildExecutiveDashboardSnapshot} from '../development/hd-manager/application/src/services/executiveDashboardService.js';
import {getCashExpenseFinance} from '../development/hd-manager/application/src/features/business-report/reportViewModel.js';
import projector from '../functions/generated/offlineOriginalDomain.cjs';
function fixture(){
 const f=trustedCommandFixture();
 const salaryDetails={grossSalary:1000,netSalary:1000,endingDebt:0};
 f.seed('payrollSnapshots','salary-a',{companyId:'tenant-a',employeeId:'employee-a',employee:{id:'employee-a',name:'Contract only'},periodId:'period-a',monthKey:'2026-10',schemaVersion:2,status:'LOCKED',formulaVersion:'HD_PAYROLL_FORMULA_V1',policyVersion:'v1',policySnapshot:{version:'v1',formulaVersion:'HD_PAYROLL_FORMULA_V1',values:{basicSalary:1000}},salaryDetails,calculationSnapshot:{inputs:{monthKey:'2026-10'},additions:{grossSalary:1000},deductions:{deductionTotal:0},results:salaryDetails},lockedAt:'2026-10-31T16:59:00Z'});
 f.seed('payrollPeriods','period-a',{companyId:'tenant-a',status:'LOCKED',monthKey:'2026-10',snapshotIds:['salary-a']});
 const view=(token='a')=>f.call('payroll-settlement',{action:'read',snapshotId:'salary-a'},token);
 const intent=(action,view,key,extra={})=>command(key,'salarySettlement.'+action,'salary-a',{snapshotId:'salary-a',sourceFingerprint:view.sourceFingerprint,expectedRevision:view.revision,amountVnd:null,reference:null,method:null,note:'Adapter contract only',paymentId:null,...extra},view.revision);
 return {...f,view,intent,pay:(v,key,amount=1000,extra={})=>f.call('sync',{command:intent('pay',v,key,{amountVnd:amount,reference:key,method:'Tiền mặt',fundingAccountId:'cash',...extra})})};
}
test('one approved expense, salary binding and immutable receipt commit together; payable is derived from expenses',async()=>{
 const f=fixture();try{
  const original=structuredClone(f.rows.get(f.root+'payrollSnapshots/salary-a'));
  let v=await f.view();const c=f.intent('pay',v,'pay-once',{amountVnd:1000,reference:'VOUCHER-ONCE',method:'Tiền mặt'});
  const r=await f.call('sync',{command:c});assert.equal(r.outcome,'accepted');assert.equal(r.document.paidVnd,1000);assert.equal(r.document.remainingVnd,0);
  for(let n=0;n<3;n++)assert.deepEqual(await f.call('sync',{command:c}),r);
  const expenses=[...f.rows].filter(([path])=>path.startsWith(f.root+'expenses/'));assert.equal(expenses.length,1);
  const [path,expense]=expenses[0],payment=r.document.payments[0];assert.equal(path,f.root+'expenses/'+payment.expenseId);assert.equal(expense.payrollSnapshotId,'salary-a');assert.equal(expense.payrollSettlement.periodId,'period-a');assert.equal(expense.payrollSettlement.employeeId,'employee-a');assert.equal(expense.amount,1000);assert.equal(expense.approvalStatus,'approved');assert.equal(expense.handoverStatus,'confirmed');
  assert.equal([...f.rows.keys()].filter(k=>k.startsWith('payrollSettlementPayments/')).length,0);
  const head=[...f.rows].find(([k])=>k.startsWith('payrollSettlementHeads/'))[1];assert.equal(head.financialSource,'expenses');assert(!Object.hasOwn(head,'paidVnd'));
  v=await f.view();await assert.rejects(f.call('sync',{command:f.intent('reconcile',v,'too-early')}),{code:'failed-precondition'});
  await f.call('sync',{command:f.intent('acknowledge',v,'ack',{paymentId:payment.id})});v=await f.view();const done=await f.call('sync',{command:f.intent('reconcile',v,'reconcile')});assert.equal(done.document.confirmedVnd,1000);assert.ok(done.document.reconciledAt);
  assert.deepEqual(f.rows.get(f.root+'payrollSnapshots/salary-a'),original);
 }finally{await f.close();}
});
test('financial approval permission is required by grant AND direct sync; revocation also denies receipt replay',async()=>{
 const f=fixture();try{
  const v=await f.view(),c=f.intent('pay',v,'restricted-pay',{amountVnd:1000,reference:'restricted',method:'Tiền mặt'});
  const company=f.rows.get(f.root+'companies/tenant-a');company.employeeRolePermissions={'employee-a':{payroll:true,finance:true}};company.employeeRolePermissionActions={'employee-a':{payroll:{view_all_payroll:true,view_own_payroll:true},finance:{create_expense:true,approve_driver_cashflow:false}}};
  const employee=f.rows.get(f.root+'employees/employee-a');employee.role='employee';employee.position='Kế toán & nhân sự';
  const grant=await f.call('grant',{deviceId:'unit-device'});assert(!JSON.parse(Buffer.from(grant.signedGrant.split('.')[1],'base64url')).capabilities.includes('salarySettlement.pay'));
  await assert.rejects(f.call('sync',{command:c}),{code:'permission-denied'});
  company.employeeRolePermissionActions['employee-a'].finance.approve_driver_cashflow=true;
  const result=await f.call('sync',{command:c});assert.equal(result.outcome,'accepted');company.employeeRolePermissionActions['employee-a'].finance.approve_driver_cashflow=false;
  await assert.rejects(f.call('sync',{command:c}),{code:'permission-denied'});
 }finally{await f.close();}
});
test('partial payment, overpayment, wrong bank account and other tenant cannot corrupt the source',async()=>{
 const f=fixture();try{
  const company=f.rows.get(f.root+'companies/tenant-a');company.companyBankAccounts=[{id:'configured-bank',bankName:'Unit fixture',bankAccountName:'CONTRACT ONLY',bankAccountNumber:'UNIT-NOT-REAL'}];
  let v=await f.view();await assert.rejects(f.pay(v,'bad-bank',400,{method:'Chuyển khoản',fundingAccountId:'other-tenant-bank'}));
  const first=await f.pay(v,'part-one',400,{method:'Chuyển khoản',fundingAccountId:'configured-bank'});assert.equal(first.document.remainingVnd,600);assert.equal(first.document.payments[0].fundingAccount.bankAccountNumber,'UNIT-NOT-REAL');
  v=await f.view();await assert.rejects(f.pay(v,'over',601));await assert.rejects(f.view('b'),{code:'permission-denied'});
  const second=await f.pay(v,'part-two',600);assert.equal(second.document.remainingVnd,0);assert.equal(second.document.payments.length,2);
  await assert.rejects(f.call('sync',{command:f.intent('acknowledge',second.document,'other-ack',{paymentId:'part-one'})},'b'),{code:'permission-denied'});
 }finally{await f.close();}
});
test('receipt failure rolls back the expense and every linked write',async()=>{
 const f=fixture();try{const v=await f.view(),before=structuredClone([...f.rows]);f.failWrite('payrollSettlementReceipts/');await assert.rejects(f.pay(v,'rollback'),/Injected transaction failure/);assert.deepEqual([...f.rows],before);}finally{await f.close();}
});
test('unconfirmed/tampered vouchers and old Local payments block reconciliation, never repost historical money',async()=>{
 const f=fixture();try{await f.pay(await f.view(),'tamper');const [key,expense]=[...f.rows].find(([k])=>k.startsWith(f.root+'expenses/'));expense.approvalStatus='pending';await assert.rejects(f.view(),/unconfirmed/);expense.approvalStatus='approved';expense.amount=999;await assert.rejects(f.view(),/inconsistent/);f.rows.delete(key);f.rows.set('payrollSettlementPayments/old',{tenantId:'tenant-a',snapshotId:'salary-a',amountVnd:420000});const before=structuredClone([...f.rows]);await assert.rejects(f.view(),/Legacy salary payment/);assert.deepEqual([...f.rows],before);}finally{await f.close();}
});
test('late-month settlement changes cash only, not salary cost or profit; canonical server/client projections agree',()=>{
 const now=new Date('2026-11-14T05:00:00Z'),base={company:{id:'tenant-a'},now};
 const expense={id:'new-salary-voucher',companyId:'tenant-a',date:'2026-11-14',amount:1000,category:'Thanh toán lương',sourceType:'payroll_settlement',payrollSnapshotId:'prior-month-snapshot',payrollPaymentId:'new-payment',requiresApproval:false,approvalStatus:'approved',handoverStatus:'confirmed'};
 const before=buildExecutiveDashboardSnapshot({...base,expenses:[],cashExpenseRecords:[]}),after=buildExecutiveDashboardSnapshot({...base,expenses:[expense],cashExpenseRecords:[expense]});
 assert.equal(after.finance.cashBalance-before.finance.cashBalance,-1000);
 assert(Number.isFinite(after.finance.expenseToday));assert(Number.isFinite(after.finance.profitToday));assert.equal(after.finance.profitToday,before.finance.profitToday);assert.equal(after.finance.expenseToday,before.finance.expenseToday);assert.deepEqual(getCashExpenseFinance(after.finance).reportExpenseRows,getCashExpenseFinance(before.finance).reportExpenseRows);
 const sources=Object.fromEntries(projector.HOME_FEED_SOURCES.map(k=>[k,[]]));sources.companies=[{id:'tenant-a'}];const online=projector.projectCompanyHome({sources,tenantId:'tenant-a',asOfDay:'2026-11-14'});sources.expenses=[expense];const settled=projector.projectCompanyHome({sources,tenantId:'tenant-a',asOfDay:'2026-11-14'});assert.deepEqual(settled.reports,online.reports);assert.equal(settled.snapshot.finance.cashBalance-online.snapshot.finance.cashBalance,-1000);
 const unlinked={...expense,category:'Chi phí khác'};delete unlinked.payrollSnapshotId;delete unlinked.payrollPaymentId;
 const historical=buildExecutiveDashboardSnapshot({...base,expenses:[unlinked],cashExpenseRecords:[unlinked]});assert.equal(historical.finance.expenseToday-before.finance.expenseToday,1000);
});
