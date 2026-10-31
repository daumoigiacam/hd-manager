import test from 'node:test';
import assert from 'node:assert/strict';
import {appFunction} from './helpers/app-source-function.mjs';
import {withSalesRevenueIndex,calculateEmployeeSalesRevenueForMonth} from '../src/utils/salesRevenuePeriod.js';

test('monthly revenue projection does not overwrite source snapshot records or previous report output', () => {
  const record=Object.freeze({id:'employee-a',companyId:'fixture-company',overtime:5,revenue:17,note:'keep'});
  const records=Object.freeze({'employee-a':record});
  const employees=[{id:'employee-a'},{id:'employee-b'}];
  const project=amount=>appFunction('aggregatedPerformance',{
    performanceRecords:records,employees,orders:[],customers:[],withSalesRevenueIndex,calculateMonthRevenue:id=>id==='employee-a'?amount:0,
  },{memoCallback:true})();
  const first=project(100),next=project(200);
  assert.equal(records['employee-a'].revenue,17);
  assert.equal(first['employee-a'].revenue,100);
  assert.equal(next['employee-a'].revenue,200);
  assert.equal(next['employee-a'].overtime,5);
  assert.equal(next['employee-a'].note,'keep');
  assert.deepEqual(next['employee-b'],{overtime:0,revenue:0});
  assert.notEqual(first['employee-a'],record);
});

test('root employee projection shares one per-call source index and keeps uncached revenue results',()=>{
  let customerReads=0;
  const customers=Array.from({length:20},(_,i)=>({get id(){customerReads++;return `c-${i}`},empId:`e-${i}`}));
  const orders=Array.from({length:2000},(_,i)=>({id:`o-${i}`,customerId:`c-${i%20}`,date:'2026-10-31',amount:i+1}));
  const employees=Array.from({length:20},(_,i)=>({id:`e-${i}`}));
  const calculate=employeeId=>calculateEmployeeSalesRevenueForMonth({employeeId,orders,customers,monthKey:'2026-10'});
  const expected=employees.map(e=>calculate(e.id));const uncachedReads=customerReads;
  customerReads=0;
  const actual=appFunction('aggregatedPerformance',{performanceRecords:{},employees,orders,customers,withSalesRevenueIndex,
    calculateMonthRevenue:calculate},{memoCallback:true})();
  assert.deepEqual(employees.map(e=>actual[e.id].revenue),expected);
  assert.equal(customerReads,uncachedReads/employees.length);
});
