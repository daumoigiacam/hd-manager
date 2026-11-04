import test from 'node:test';
import assert from 'node:assert/strict';
import {appFunction} from './helpers/app-source-function.mjs';
import {createProjectionCache} from '../src/services/cooperativeProjection.js';
import {summarizeEmployeeSalesRevenueForMonth,withSalesRevenueIndex} from '../src/utils/salesRevenuePeriod.js';

test('actual employee revenue projection scans orders once, preserves per-employee attribution and reuses unchanged reopen state',()=>{
  let reads=0;
  const order=(id,values)=>Object.freeze({id,...values,get date(){reads++;return '2026-10-15'}});
  const employees=Object.freeze([{id:'sales-a',sales:true},{id:'sales-b',sales:true},{id:'sales-c',sales:true},{id:'archived',sales:true,isArchived:true},{id:'driver'}].map(Object.freeze));
  const customers=Object.freeze([Object.freeze({id:'c1',empId:'sales-b'}),Object.freeze({id:'c2',empId:'sales-c'})]);
  const orders=Object.freeze([order('a',{salesEmpId:'sales-a',customerId:'c1',amount:100}),order('b',{customerId:'c1',amount:20}),
    order('c',{createdByEmpId:'sales-c',amount:30}),order('d',{empId:'sales-a',amount:-5}),order('e',{customerId:'c2',amount:'40'}),
    order('archived',{salesEmpId:'sales-a',amount:999,isArchived:true}),order('unassigned',{amount:1})]);
  const bindings={employees,customers,orders,salesRevenueMonth:'2026-10',employeeRevenueScope:'company:actor:all:2026-10',
    employeeRevenueProjectionCache:createProjectionCache({maxScopes:1}),isEmployeeSalesPosition:employee=>!!employee.sales,
    summarizeEmployeeSalesRevenueForMonth,withSalesRevenueIndex};
  const expected=employees.filter(employee=>!employee.isArchived&&employee.sales).map(employee=>({employee,
    summary:summarizeEmployeeSalesRevenueForMonth({employeeId:employee.id,orders,customers,monthKey:'2026-10'})}));
  reads=0;
  const run=()=>appFunction('salesRevenueRows',bindings,{memoCallback:true,scope:'EmployeeView'})();
  const result=run();assert.deepEqual(result,expected);assert.equal(reads,6,'nonarchived orders must be visited once, not once per salesperson');
  const afterFirst=reads;assert.equal(run(),result);assert.equal(reads,afterFirst,'reopen with unchanged immutable inputs must not rescan orders');
  bindings.orders=Object.freeze([...orders,order('new',{salesEmpId:'sales-a',amount:7})]);
  const changed=run();assert.notEqual(changed,result);assert.equal(changed[0].summary.revenue,102);assert.equal(result[0].summary.revenue,95);
  bindings.employeeRevenueScope='company:other-actor:assigned:2026-10';assert.notEqual(run(),changed,'authorization scope must invalidate retained rows');
  bindings.salesRevenueMonth='2026-11';bindings.employeeRevenueScope='company:other-actor:assigned:2026-11';
  assert(run().every(row=>row.summary.revenue===0&&row.summary.orderCount===0));
});

test('employee revenue projection does not retain stale customer assignments or archived employees',()=>{
  const bindings={employees:Object.freeze([{id:'a',sales:true},{id:'b',sales:true}]),customers:Object.freeze([{id:'c',empId:'a'}]),
    orders:Object.freeze([{id:'o',customerId:'c',date:'2026-10-01',amount:50}]),salesRevenueMonth:'2026-10',employeeRevenueScope:'actor:2026-10',
    employeeRevenueProjectionCache:createProjectionCache({maxScopes:1}),isEmployeeSalesPosition:employee=>!!employee.sales,
    summarizeEmployeeSalesRevenueForMonth,withSalesRevenueIndex};
  const run=()=>appFunction('salesRevenueRows',bindings,{memoCallback:true,scope:'EmployeeView'})();
  const original=run();bindings.customers=Object.freeze([{id:'c',empId:'b'}]);
  const reassigned=run();assert.equal(reassigned[0].summary.revenue,0);assert.equal(reassigned[1].summary.revenue,50);
  assert.equal(original[0].summary.revenue,50);
  bindings.employees=Object.freeze([{id:'a',sales:true,isArchived:true},{id:'b',sales:true}]);
  assert.deepEqual(run().map(row=>row.employee.id),['b']);
});
