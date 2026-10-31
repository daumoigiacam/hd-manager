import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appFunction} from './helpers/app-source-function.mjs';
import {runCooperativeProjection} from '../src/services/cooperativeProjection.js';
import {buildEmployeeReviewSourceIndexes} from '../src/utils/employeeReviewSourceIndex.js';
import {applyPayrollOpeningDebtToSalaryDetails,getEmployeePayrollOpeningDebt} from '../src/utils/payrollDebtCarryover.js';
const empty={rows:[],evaluations:new Map(),detailsByEmployee:new Map()};
let debtReads=0;
const salaryBindings={
  isSalesCollaboratorPosition:()=>false,isEmployeeSalesPosition:emp=>emp.position==='sales',
  resolveSalaryMonthDays:()=>26,parseLooseMoneyValue:value=>Number(value)||0,
  resolveProbationEndDate:()=>null,getWorkRoleMonthEntries:()=>[],calculateAttendanceTiming:()=>({}),
  normalizeEmployeeRoleSalaryComponents:()=>[],calculateWorkRoleSalary:()=>({calculatedAmount:0}),
  calculateExperienceSalaryAtDate:()=>({total:0,expMonths:0,experienceCycles:0,experienceCycleLabel:''}),
  getMonthEndDateInputValue:month=>month+'-31',calculateRevenueForMonth:()=>0,
  calculateDirectSalesCommission:()=>0,buildSalesDownlineCommissionRows:()=>[],roundMoneyValue:Math.round,
  getTodayString:()=> '2026-10-24',isSalaryAdvanceInMonth:(row,month)=>row.date?.startsWith(month),
  getCustomerDebt:customer=>{debtReads++;return customer.debt || 0;},
};
const buildSalaryDetails=appFunction('buildSalaryDetails',salaryBindings);
const bindings={...salaryBindings,buildSalaryDetails,EMPTY_PAYROLL_VIEW:empty,
  getEntityTimestamp:row=>row.createdAt || '',normalizeEmployeeReviewMonthKey:value=>String(value||'').slice(0,7),
  buildEmployeeReviewSourceIndexes,getEmployeeReviewCriteriaList:()=>[],
  buildEmployeeReviewSummary:(emp,context)=>({employeeId:emp.id,month:context.monthKey,bonus:context.orders.length+context.reviews.length,
    attendanceKeys:Object.keys(context.attendance),complaints:context.complaints}),
  projectEvaluationSummaryToPayroll:summary=>summary,
  applyEvaluationBonusToSalaryDetails:(details,evaluation)=>details&&({...details,evaluationResult:evaluation,grossSalary:details.grossSalary+(evaluation?.bonus||0),netSalary:details.netSalary+(evaluation?.bonus||0)}),
  getEmployeePayrollOpeningDebt,applyPayrollOpeningDebtToSalaryDetails,
};
const prepare=appFunction('buildPayrollViewProjectionSteps',bindings);
const frozen=readFileSync(new URL('./fixtures/payroll-view-preparation.baseline.mjs',import.meta.url),'utf8');
const baseline=new Function(...Object.keys(bindings),'return '+frozen.slice(frozen.indexOf('export default ')+15))(...Object.values(bindings));
const drain=iterator=>{for(;;){const next=iterator.next();if(next.done)return next.value;}};
function input(){
  const employees=[{id:'a',position:'sales',basicSalary:10000},{id:'b',position:'sales'},{id:'c',position:'driver'},{id:'archived',isArchived:true}];
  return {isPayrollLocked:false,currentMonth:'2026-10',employeeReviews:[{monthKey:'2026-10'},{monthKey:'2026-09'}],
    orders:Array.from({length:300},(_,i)=>({id:'o'+i,empId:'a',date:i%2?'2026-10-03':'2026-09-01'})),deliveryReports:[],
    complaintsLoaded:true,customerComplaints:[{companyId:'one',date:'2026-10-03'},{companyId:'foreign',date:'2026-10-03'}],
    payrollCompanyId:'one',attendance:{'2026-10-01_a':{date:'2026-09-01'},'old_key':{date:'2026-10-02'}},attendanceLoaded:true,
    currentCompany:{id:'one'},employees,visibleSalaryEmployees:employees.slice(0,3),payrollPolicyEmployees:employees,
    payrollDebtCarryovers:[],financials:[{empId:'a',type:'bonus',amount:100,date:'2026-10-02'}],performance:{},
    customers:[{id:'same',empId:'a',debt:100},{id:'same',empId:'a',debt:-40},{id:'other',empId:'b',debt:25}],payments:[],holidays:[]};
}
test('payroll month projection preserves frozen salaries, debt balances, evaluation and visible row order',async()=>{
  for(const complaintsLoaded of [true,false])for(const currentMonth of ['2026-10','2026-09']){
    const source={...input(),complaintsLoaded,currentMonth},before=structuredClone(source);let yields=0;
    const actual=await runCooperativeProjection(()=>prepare(source),{maxOperations:1,yieldTask:async()=>{yields++;}});
    assert.deepEqual(actual,baseline(source));assert.ok(yields>10);assert.deepEqual(source,before);
    assert.equal(actual.rows[0].details.badDebt,60,'negative customer credits are summed before employee clamp; duplicate IDs stay distinct');
  }
});
test('salary helper cache uses the exact record balance and safely falls back for a missing record',()=>{
  const source=input(),args=['a',source.employees,{},source.financials,{},source.customers,[],[],[],'2026-10'];
  const original=buildSalaryDetails(...args);debtReads=0;
  const balances=new Map([[source.customers[0],100]]);
  assert.deepEqual(buildSalaryDetails(...args,{customerDebtByRecord:balances}),original);
  assert.equal(debtReads,1);debtReads=0;
  assert.equal(buildSalaryDetails(...args,{skipDebt:true,customerDebtByRecord:balances}).badDebt,0);
  assert.equal(debtReads,0);
});
test('locked payroll does not read historical rows or recalculate salaries',()=>{
  const forbidden=new Proxy({}, {get(){throw Error('Locked payroll history accessed');}});
  assert.equal(drain(prepare({isPayrollLocked:true,orders:forbidden,customers:forbidden})),empty);
});
test('superseded payroll month cancels without publishing a partial result',async()=>{
  const source=input(),before=structuredClone(source);const controller=new AbortController();let turns=0,published=false;
  await assert.rejects(runCooperativeProjection(()=>prepare(source),{signal:controller.signal,maxOperations:1,
    yieldTask:async()=>{if(++turns===3)controller.abort();}}).then(()=>{published=true;}),{name:'AbortError'});
  assert.equal(published,false);assert.deepEqual(source,before);
});
