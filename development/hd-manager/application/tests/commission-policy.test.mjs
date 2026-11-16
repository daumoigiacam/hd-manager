import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {normalizeCommissionPolicy,commissionPolicyFromDraft,commissionPolicyToDraft,hdSampleCommissionPolicy,calculateCommissionPolicy,commissionPolicySavePatch,parseCommissionPercent,buildCommissionRollbackPatch} from '../src/utils/commissionPolicy.js';
import {reconcileCommissionRevenue,buildCommissionCalculation} from '../src/utils/commissionRevenue.js';
import {buildEmployeePayrollPolicyUpdate,applyEmployeePayrollPolicyForMonth} from '../src/utils/payrollPolicyHistory.js';
import {createPayrollEmployeeSnapshot,getPayrollLockBlockers} from '../src/utils/payrollPeriodLock.js';
import {buildPayrollViewProjectionSteps} from '../src/features/payroll/payrollOriginalDomain.js';

const sample=()=>({...commissionPolicyFromDraft(hdSampleCommissionPolicy('2026-11-01')),status:'active'});
const employee={id:'sales-a',companyId:'tenant-a',position:'Kinh doanh',name:'Commission QA',commissionRate:0.015,targetRevenue:500e6,startDate:'2026-01-01'};
const customers=[{id:'customer-a',companyId:'tenant-a',empId:employee.id}];
const require=createRequire(import.meta.url);
const order=(id,amount,extra={})=>({id,companyId:'tenant-a',customerId:'customer-a',salesEmpId:employee.id,date:'2026-11-16',reviewStatus:'confirmed',amount,...extra});
test('all requested KPI/tier boundaries use exact arithmetic and count each dong once',()=>{
 const cases=[[499999999,0],[500000000,0],[500000001,0.02],[1000000000,10000000],[1000000001,10000000.03],[1500000000,22500000],[1500000001,22500000.03],[1200000000,15000000]];
 for(const [revenue,expected] of cases)assert.equal(calculateCommissionPolicy(sample(),revenue).commission,expected,String(revenue));
 const result=calculateCommissionPolicy(sample(),1200000000);assert.equal(result.rows.reduce((sum,row)=>sum+row.amountWithinTier,0),700e6);assert.deepEqual(result.rows.map(row=>row.commission),[10e6,5e6,0]);
});
test('fixed, above-KPI, progressive and retrospective are distinct selectable methods',()=>{
 const base=sample();assert.equal(calculateCommissionPolicy({...base,method:'fixed',tiers:[]},400e6).commission,8e6);
 assert.equal(calculateCommissionPolicy({...base,method:'above_kpi',tiers:[]},600e6).commission,2e6);
 assert.equal(calculateCommissionPolicy({...base,method:'retrospective'},1200e6).commission,17.5e6);
 assert.equal(calculateCommissionPolicy({...base,method:'retrospective'},1000e6).commission,10e6);
 assert.equal(calculateCommissionPolicy({...base,method:'retrospective'},1000e6+1).commission,12.5e6+0.03);
 assert.equal(calculateCommissionPolicy({...base,status:'paused'},1200e6).commission,0);
 assert.equal(calculateCommissionPolicy({...base,status:'draft'},1200e6).commission,0);
});
test('locale percent input, decimal percent and suffixes round-trip through the saved schema',()=>{
 for(const input of ['2.5','2,5','2.5%','2,5 %'])assert.equal(parseCommissionPercent(input),0.025);
 for(const input of ['','%','2x','-2','101%','2%%'])assert.throws(()=>parseCommissionPercent(input));
 const policy=sample();assert.deepEqual(commissionPolicyFromDraft(commissionPolicyToDraft(policy)),policy);
});
test('gaps, overlaps, duplicate IDs, unbounded middle tiers, invalid dates and undefined cycles cannot be applied',()=>{
 for(const patch of [{tiers:[{...sample().tiers[0],from:1},...sample().tiers.slice(1)]},{tiers:[sample().tiers[0],{...sample().tiers[1],from:499999999},sample().tiers[2]]},{tiers:[{...sample().tiers[0],to:null},...sample().tiers.slice(1)]},{tiers:[sample().tiers[0],{...sample().tiers[1],id:'hd-tier-1'},sample().tiers[2]]},{effectiveFrom:'2026-11-16'},{effectiveTo:'2026-11-29'},{effectiveTo:'2026-02-30'},{cycle:'quarters'},{rate:2}])assert.throws(()=>normalizeCommissionPolicy({...sample(),...patch}));
});
test('fixed bonuses are earned once per occupied tier; disabled tiers contribute no money',()=>{
 const policy=sample();policy.tiers[0].fixedBonus=100000;policy.tiers[1].fixedBonus=200000;
 assert.equal(calculateCommissionPolicy(policy,500e6).commission,0);
 assert.equal(calculateCommissionPolicy(policy,1200e6).commission,15300000);
 policy.tiers[1].enabled=false;assert.equal(calculateCommissionPolicy(policy,1200e6).commission,10100000);
 const retro=calculateCommissionPolicy({...policy,method:'retrospective'},1200e6);assert.equal(retro.commission,0);assert.equal(retro.rows[0].fixedBonus,0);
});
test('fractional-dong rows reconcile to the exact rounded total with an explicit rounding adjustment',()=>{
 const policy={...sample(),targetRevenue:0,tiers:[{id:'one',from:0,to:1,rate:0.025,fixedBonus:0,enabled:true},{id:'two',from:1,to:null,rate:0.025,fixedBonus:0,enabled:true}]};
 const result=calculateCommissionPolicy(policy,2);assert.equal(result.commission,0.05);assert.equal(result.roundingAdjustment,-0.01);assert.equal(Math.round((result.rows.reduce((sum,row)=>sum+row.commission,0)+result.roundingAdjustment)*100),5);
});
test('recognized revenue uses the final order amount once, excludes drafts/cancellations/reversals and deduplicates IDs',()=>{
 const valid=order('net-order',1200e6,{discount:100e6});const orders=[valid,{...valid},order('draft',999e6,{reviewStatus:'draft'}),order('canceled',999e6,{status:'cancelled'}),order('reversed',999e6,{isReversed:true}),order('other-tenant',999e6,{companyId:'tenant-b'})];
 const result=buildCommissionCalculation({employee:{...employee,commissionPolicy:sample()},orders,customers,payments:[],monthKey:'2026-11'});
 assert(result.ready);assert.equal(result.actualRevenue,1200e6);assert.equal(result.commission,15e6);assert.deepEqual(result.sourceEvidence.rows.map(row=>row.orderId),['net-order']);assert.equal(result.sourceEvidence.excluded.length,3);
 const adjusted=buildCommissionCalculation({employee:{...employee,commissionPolicy:sample()},orders:[order('net-order',1100e6,{discount:200e6})],customers,payments:[],monthKey:'2026-11'});assert.equal(adjusted.commission,12500000);
});
test('unconfirmed return financials and conflicting source versions block payroll instead of inventing a deduction',()=>{
 for(const orders of [[order('returned',1200e6,{returnTransactionCount:1,returnFinancialStatus:'BUSINESS_RULE_REQUIRED'})],[order('same-id',1200e6),order('same-id',1100e6)]]){
  const result=buildCommissionCalculation({employee:{...employee,commissionPolicy:sample()},orders,customers,payments:[],monthKey:'2026-11'});assert.equal(result.ready,false);assert(result.sourceEvidence.blockers.length);
  const salaryDetails={commissionCalculation:result,netSalary:0,grossSalary:0,endingDebt:0};
  const employeeWithHistory={...employee,...buildEmployeePayrollPolicyUpdate({employee:null,nextEmployee:{...employee,commissionPolicy:sample()},effectiveFrom:'2026-11-01'})};
  const snapshot=createPayrollEmployeeSnapshot({companyId:'tenant-a',monthKey:'2026-11',employee:employeeWithHistory,salaryDetails,lockedAt:'2026-11-30T17:00:00Z',lockedByEmployeeId:'owner-test'});
  assert(getPayrollLockBlockers([snapshot]).some(reason=>reason.includes('commission.reconciliation_required')));
 }
});
test('actual collected revenue reuses official payment allocations and never counts overpayment or the same receipt twice',()=>{
 const policy={...sample(),revenueBasis:'collected'},orders=[order('o',1200e6)],payment={id:'p-1',companyId:'tenant-a',customerId:'customer-a',amount:700e6,date:'2026-11-17',matchedOrderId:'o',approvalStatus:'approved'};
 const payments=[payment,{...payment},{...payment,id:'p-2',amount:700e6,date:'2026-11-18'}];
 const revenue=reconcileCommissionRevenue({employee,policy,orders,customers,payments,monthKey:'2026-11'});assert(revenue.ready);assert.equal(revenue.revenue,1200e6);assert.equal(revenue.rows.length,2);assert.equal(calculateCommissionPolicy(policy,revenue.revenue).commission,15e6);
});
test('multiple employees, months and tenants never share a revenue or commission cache entry',()=>{
 const orders=[order('a',1200e6),order('a-oct',2e9,{date:'2026-10-10'}),order('b',700e6,{salesEmpId:'sales-b'}),order('tenant-b',9e9,{companyId:'tenant-b',salesEmpId:'sales-b'})],payments=[];
 const a=reconcileCommissionRevenue({employee,policy:sample(),orders,customers,payments,monthKey:'2026-11'}),b=reconcileCommissionRevenue({employee:{...employee,id:'sales-b'},policy:sample(),orders,customers,payments,monthKey:'2026-11'});
 assert.equal(a.revenue,1200e6);assert.equal(b.revenue,700e6);assert.equal(reconcileCommissionRevenue({employee,policy:sample(),orders,customers,payments,monthKey:'2026-10'}).revenue,2e9);
});
test('drafts preserve the live policy; activation is effective-dated and does not mutate locked historical snapshots',()=>{
 const history=buildEmployeePayrollPolicyUpdate({employee:null,nextEmployee:employee,effectiveFrom:'2026-01-01'}),current={...employee,...history};
 const draft=hdSampleCommissionPolicy('2026-11-01'),draftPatch=commissionPolicySavePatch(current,draft);assert(!Object.hasOwn(draftPatch,'commissionPolicy'));assert.equal(draftPatch.commissionPolicyDraft.status,'draft');
 const activated={...current,...commissionPolicySavePatch(current,{...draft,status:'active'})};Object.assign(activated,buildEmployeePayrollPolicyUpdate({employee:current,nextEmployee:activated,effectiveFrom:'2026-11-01'}));
 assert.equal(applyEmployeePayrollPolicyForMonth(activated,'2026-10').commissionPolicy,null);assert.equal(applyEmployeePayrollPolicyForMonth(activated,'2026-11').commissionPolicy.method,'progressive');
 const locked=createPayrollEmployeeSnapshot({companyId:'tenant-a',monthKey:'2026-11',employee:activated,salaryDetails:{commission:15e6,commissionCalculation:calculateCommissionPolicy(sample(),1200e6),netSalary:15e6,grossSalary:15e6,endingDebt:0},lockedAt:'2026-11-30T17:00:00Z',lockedByEmployeeId:'owner-test'}),before=JSON.stringify(locked);
 activated.commissionPolicy.tiers[0].rate=0.5;assert.equal(JSON.stringify(locked),before);
 const used={...current,commissionPolicy:sample(),payrollPolicies:[{values:{commissionPolicy:sample()}}]};assert.throws(()=>commissionPolicySavePatch(used,{...commissionPolicyToDraft(sample()),tiers:commissionPolicyToDraft(sample()).tiers.slice(0,2).map((tier,i)=>i?{...tier,to:null}:tier)}),/không được xóa/);
});
test('the real payroll projection and the UI preview agree on the HD example',()=>{
 const emp={...employee,commissionPolicy:sample()},orders=[order('actual-payroll',1200e6)],context={currentMonth:'2026-11',employees:[emp],visibleSalaryEmployees:[emp],payrollPolicyEmployees:[emp],attendance:{},financials:[],performance:{},customers,orders,payments:[],holidays:[],deliveryReports:[],employeeReviews:[],customerComplaints:[],payrollDebtCarryovers:[],payrollCompanyId:'tenant-a',currentCompany:{id:'tenant-a'},attendanceLoaded:true,complaintsLoaded:true};
 const iterator=buildPayrollViewProjectionSteps(context);let next;do{next=iterator.next();}while(!next.done);const details=next.value.rows[0].details;
 assert.equal(details.directCommission,15e6);assert.equal(details.commissionCalculation.commission,calculateCommissionPolicy(sample(),1200e6).commission);assert.equal(details.commissionCalculation.sourceEvidence.rows[0].orderId,'actual-payroll');
});
test('canonical salary configuration writes use an optimistic transaction and strip UI-only state',()=>{
 const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8'),view=fs.readFileSync(new URL('../src/features/legacy/EmployeeView.jsx',import.meta.url),'utf8');
 assert.match(app,/await runTransaction\(db,async transaction=>[\s\S]*?current.data\(\).salaryPolicyVersion[\s\S]*?transaction.set\(employeeRef,employeePayload/);
 assert.match(app,/delete employeePayload.commissionExpectedPolicyVersion/);assert.match(view,/delete pData.commissionPolicyForm/);
});
test('Firestore key ordering and repeated saves do not manufacture policy versions',()=>{
 const live={...employee,commissionPolicy:sample()};Object.assign(live,buildEmployeePayrollPolicyUpdate({employee:null,nextEmployee:live,effectiveFrom:'2026-11-01'}));
 const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>b.localeCompare(a)).map(([key,item])=>[key,reorder(item)])):value;
 const fromServer=reorder(live),next={...fromServer,commissionPolicy:commissionPolicyFromDraft(commissionPolicyToDraft(fromServer.commissionPolicy))};
 const update=buildEmployeePayrollPolicyUpdate({employee:fromServer,nextEmployee:next,effectiveFrom:'2026-11-01'});assert.equal(update.salaryPolicyVersion,live.salaryPolicyVersion);assert.equal(update.payrollPolicies.length,1);
});
test('rollback is an effective-dated new version and never removes old policy history',()=>{
 const live={...employee,commissionPolicy:sample()};Object.assign(live,buildEmployeePayrollPolicyUpdate({employee:null,nextEmployee:live,effectiveFrom:'2026-11-01'}));
 const before=JSON.stringify(live.payrollPolicies),patch=buildCommissionRollbackPatch(live,{effectiveFrom:'2026-12-01',changedByEmployeeId:'qa-owner'}),restored={...live,...patch};
 assert.throws(()=>buildCommissionRollbackPatch(live,{effectiveFrom:'2026-10-01'}),/Không khôi phục lùi/);
 assert.equal(JSON.stringify(live.payrollPolicies),before);assert.equal(restored.payrollPolicies.length,2);assert.equal(applyEmployeePayrollPolicyForMonth(restored,'2026-11').commissionPolicy.method,'progressive');assert.equal(applyEmployeePayrollPolicyForMonth(restored,'2026-12').commissionPolicy,null);assert.equal(restored.commissionRate,0.015);
});
test('pausing commission does not zero the independent sales revenue or performance metric',()=>{
 const emp={...employee,commissionPolicy:{...sample(),status:'paused'}},iterator=buildPayrollViewProjectionSteps({currentMonth:'2026-11',employees:[emp],visibleSalaryEmployees:[emp],payrollPolicyEmployees:[emp],attendance:{},financials:[],performance:{},customers,orders:[order('paused-order',1200e6)],payments:[],holidays:[],deliveryReports:[],employeeReviews:[],customerComplaints:[],payrollDebtCarryovers:[],payrollCompanyId:'tenant-a',currentCompany:{id:'tenant-a'},attendanceLoaded:true,complaintsLoaded:true});
 let next;do{next=iterator.next();}while(!next.done);const details=next.value.rows[0].details;assert.equal(details.directCommission,0);assert.equal(details.salesRevenue,1200e6);assert.equal(details.commissionCalculation.revenueNotEvaluated,true);assert.equal(details.commissionCalculation.actualRevenue,null);
});
test('the generated trusted backend matches the UI preview at every financial boundary',()=>{
 const backend=require('../../../../functions/generated/offlineOriginalDomain.cjs');
 for(const revenue of [499999999,500000000,500000001,1000000000,1000000001,1200000000,1500000000,1500000001]){
  const details=backend.buildSalaryDetails(employee.id,[{...employee,commissionPolicy:sample()}],{},[],{},customers,[order('server-'+revenue,revenue)],[],[],'2026-11');
  assert.equal(details.directCommission,calculateCommissionPolicy(sample(),revenue).commission,String(revenue));assert(details.commissionCalculation.ready);
 }
 const guard=require('../../../../functions/payrollAutoLock.js');assert(guard.inspectFinalPayrollSnapshot({salaryDetails:{commissionCalculation:{ready:false}}}).issues.includes('commission.reconciliation_required'));
});
