import test from 'node:test';
import assert from 'node:assert/strict';
import {runCooperativeReportProjection as runCooperativeProjection} from '../src/services/cooperativeReportProjection.js';
import {createExecutiveDashboardSnapshotIterator,buildExecutiveDashboardSnapshot} from '../src/services/executiveDashboardService.js';
import {createSalesRevenueIndexScope,summarizeEmployeeSalesRevenueForMonth} from '../src/utils/salesRevenuePeriod.js';

test('cooperative dashboard publishes a complete financially identical result and yields between calculation stages',async()=>{
 const input={now:'2026-10-24T12:00:00',products:[{id:'p',name:'Vịt',unit:'Con'}],
  orders:[{id:'o',date:'2026-10-24',amount:300,items:[{productId:'p',quantity:3,price:100}]}],
  warehouseImports:[{id:'i',date:'2026-10-23',productId:'p',quantity:10,amount:500}],
  payrollCosts:[{date:'2026-10-24',employeeId:'e',amount:60}],cashExpenseRecords:[{id:'x',date:'2026-10-24',amount:12}]};
 const expected=buildExecutiveDashboardSnapshot(input);let clock=0,yields=0;
 const actual=await runCooperativeProjection(createExecutiveDashboardSnapshotIterator(input),{budgetMs:1,now:()=>clock++,yieldWork:async()=>{yields++}});
 delete expected.generatedAt;delete actual.generatedAt;
 assert.deepEqual(actual,expected);assert.ok(yields>8);
});

test('supersession aborts before returning any partial result, closes the iterator and permits the next tenant job',async()=>{
 let current=true,closed=false,returned=false;
 function* steps(){try{yield;yield;return {secret:'old-tenant'}}finally{closed=true}}
 await assert.rejects(runCooperativeProjection(steps(),{isCurrent:()=>current,now:()=>100,budgetMs:1,yieldWork:async()=>{current=false}}).then(()=>{returned=true}),{name:'AbortError'});
 assert.equal(returned,false);assert.equal(closed,false,'cancelled before first next never enters generator body');
 current=true;let clock=0,yields=0;
 await assert.rejects(runCooperativeProjection(steps(),{isCurrent:()=>current,now:()=>clock++,budgetMs:1,
  yieldWork:async()=>{if(++yields===2)current=false}}),{name:'AbortError'});
 assert.equal(closed,true);
 const next=await runCooperativeProjection(createExecutiveDashboardSnapshotIterator({now:'2026-10-24',orders:[]}),{yieldWork:async()=>{}});
 assert.equal(next.finance.revenueMonth,0);
});

test('per-job revenue cache is restored before every yield, including when a generator throws',()=>{
 const orders=[{id:'o',date:'2026-10-24',amount:10,salesEmpId:'e'}],customers=[];
 const calculate=()=>summarizeEmployeeSalesRevenueForMonth({employeeId:'e',monthKey:'2026-10',orders,customers}).revenue;
 const scope=createSalesRevenueIndexScope();assert.equal(scope(calculate),10);
 orders[0].amount=20;
 assert.equal(calculate(),20,'no active job context leaks to a caller');
 assert.equal(createSalesRevenueIndexScope()(calculate),20,'a new revision gets a new cache');
 assert.throws(()=>scope(()=>{throw Error('fixture')}),/fixture/);
 assert.equal(calculate(),20);
});
