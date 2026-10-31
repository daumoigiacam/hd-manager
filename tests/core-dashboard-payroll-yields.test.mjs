import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appFunction} from './helpers/app-source-function.mjs';
import {buildEmployeeReviewSourceIndexes} from '../src/utils/employeeReviewSourceIndex.js';
import {runCooperativeReportProjection} from '../src/services/cooperativeReportProjection.js';

const bindings={
  getDateKeyFromAnyValue:v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'':`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`},
  applyEmployeePayrollPolicyForMonth:(employee,month)=>({...employee,policyMonth:month}),
  normalizeEmployeeReviewMonthKey:v=>String(v||'').slice(0,7),
  getLockedPayrollPeriod:(periods,company,month)=>periods.find(p=>p.companyId===company&&p.monthKey===month&&p.status==='locked'),
  isOwnerPosition:position=>position==='owner',
  buildEmployeeReviewSourceIndexes,
  getEmployeeReviewCriteriaList:()=>[],
  buildSalaryDetails:(id,employees,attendance,financials,performance,customers,orders)=>({
    grossSalary:orders.reduce((s,r)=>s+r.amount,0)+financials.reduce((s,r)=>s+r.amount,0),
    totalPenalty:0,attendanceEntries:Object.entries(attendance).map(([key,row])=>({...row,date:key.slice(0,10)})),
  }),
  buildEmployeeReviewSummary:(_employee,context)=>({bonus:context.deliveryReports.length+context.reviews.length+(context.complaints?.length||0)}),
  projectEvaluationSummaryToPayroll:summary=>summary,
  applyEvaluationBonusToSalaryDetails:(details,summary)=>({...details,grossSalary:details.grossSalary+summary.bonus}),
  roundMoneyValue:Math.round,
};
const current=appFunction('buildDashboardPayrollCostSteps',bindings);
const frozen=readFileSync(new URL('./fixtures/dashboard-payroll-steps.baseline.mjs',import.meta.url),'utf8');
const baseline=new Function(...Object.keys(bindings),'return '+frozen.slice(frozen.indexOf('export default ')+15))(...Object.values(bindings));
function drain(iterator){let steps=0;for(;;){const row=iterator.next();if(row.done)return {value:row.value,steps};steps++}}
function input(){return {
  now:new Date(2026,9,24),company:{id:'one'},employees:[{id:'a',name:'A'},{id:'b',name:'B'},{id:'owner',position:'owner'}],
  orders:Array.from({length:900},(_,i)=>({id:'o'+i,amount:i+1,date:['2026-09-15','2026-10-01','2026-10-25','invalid'][i%4]})),
  financials:[{amount:100,date:'invalid'},{amount:50,date:'2026-10-01'},{amount:900,date:'2026-10-30'}],
  attendance:{'2026-10-01_a':{status:'present'},'2026-10-02_b':{status:'late'},'2026-10-30_a':{status:'present'}},
  deliveryReports:[{id:'d',date:'2026-10-01'},{id:'d2',date:'2026-09-01'}],
  employeeReviews:[{id:'r',monthKey:'2026-10'},{id:'r2',monthKey:'2026-09'}],
  customerComplaints:[{companyId:'one',date:'2026-10-02'},{companyId:'foreign',date:'2026-10-02'}],complaintsLoaded:true,
}}

test('payroll preparation yields preserve filtering, row order, salary rounding and locked snapshots',()=>{
  for(const locked of [false,true])for(const complaintsLoaded of [false,true]){
    const source=input();source.complaintsLoaded=complaintsLoaded;
    if(locked){source.payrollPeriods=[{companyId:'one',monthKey:'2026-10',status:'locked'}];source.lockedPayroll={'2026-10':{snapshots:[{employeeId:'a',employee:{name:'A'},salaryDetails:{grossSalary:475,totalPenalty:11,attendanceEntries:[]}}]}}}
    const before=structuredClone(source),actual=drain(current(source)),expected=drain(baseline(source));
    assert.deepEqual(actual.value,expected.value);assert.ok(actual.steps>expected.steps);
    assert.deepEqual(source,before);
  }
});

test('superseded payroll preparation aborts before a full result without changing source records',async()=>{
  const source=input(),before=structuredClone(source);let active=true,yields=0;
  await assert.rejects(runCooperativeReportProjection(current(source),{isCurrent:()=>active,budgetMs:1,now:()=>0,yieldWork:async()=>{if(++yields===2)active=false}}),{name:'AbortError'});
  assert.equal(yields,2);assert.deepEqual(source,before);
});
