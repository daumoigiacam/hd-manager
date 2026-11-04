import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {buildProjectedEmployeeHomeProjector} from '../scripts/helpers/employee-home-projected-projector-build.mjs';
const require=createRequire(import.meta.url),built=await buildProjectedEmployeeHomeProjector('test-results/perf-target-20261102/projected-private-unit');
const projected=require(built.modulePath),original=require(built.baselineModulePath);
const {createEmployeeHomeProcessProjector}=require('../functions/employeeHomeProcessProjector');
const names=['employees','customers','orders','payments','expenses','financials','attendance','performance','employeeReviews','deliveryReports','holidays','advances','assets','assetCostLogs'];
const scope={companyId:'company-a',employeeId:'employee-a',date:'2026-11-02'};
function fixture(position,date){
 const snapshot={company:{documentId:scope.companyId,data:{}},employee:{documentId:scope.employeeId,data:{companyId:scope.companyId}},sources:Object.fromEntries(names.map(n=>[n,[]])),counts:{}};
 const row=(documentId,data)=>({documentId,data:{companyId:scope.companyId,...data}}),sources=snapshot.sources;
 sources.employees=[row('employee-a',{name:'Synthetic employee',position,basicSalary:6200000,startDate:'2025-01-01',salaryDaysMode:'actual_calendar_days'})];
 sources.customers=[row('customer-a',{name:'Synthetic customer',empId:'employee-a',openingDebt:12345,productPreferences:{unneeded:'synthetic'.repeat(2000)}})];
 sources.orders=[row('order-a',{customerId:'customer-a',date,amount:3000000,empId:'employee-a',items:[{productId:'synthetic-only',quantity:999}],privateUnused:'synthetic'.repeat(1000)}),
  row('order-b',{customerId:'customer-a',date,amount:4000000,salesEmpId:'employee-a'}),row('old',{customerId:'customer-a',date:'2026-01-01',amount:6000}),row('archived',{isArchived:true,customerId:'customer-a',date,amount:999999999})];
 sources.payments=[row('payment-a',{customerId:'customer-a',date,amount:2000000}),row('payment-b',{customerId:'customer-a',date,amount:1000,matchedOrderId:'order-b'}),row('pending',{amount:999999999,approvalStatus:'pending',customerId:'customer-a',date})];
 sources.financials=[row('bonus',{empId:'employee-a',type:'bonus',amount:500000,date}),row('advance',{empId:'employee-a',type:'advance',amount:100000,date})];
 sources.attendance=[row(date+'_employee-a',{empId:'employee-a',date,status:'present',checkIn:date+'T01:00:00Z',checkOut:date+'T10:00:00Z'})];
 sources.assets=[row('asset-a',{name:'Synthetic asset',assignedEmployeeId:'employee-a',status:'active'})];
 sources.expenses=[row('expense-a',{amount:1000,assetId:'asset-a',date,sourceType:'driver_delivery_standalone_expense',empId:'employee-a'})];
 sources.deliveryReports=[row('report-a',{empId:'employee-a',date,collectedAmount:12345,deliveryExpenseAmount:234})];
 for(const name of names)snapshot.counts[name]=sources[name].length;return snapshot;
}
function select(snapshot){return {...snapshot,fieldProjection:built.fieldProjection,sources:Object.fromEntries(Object.entries(snapshot.sources).map(([name,rows])=>{
 const fields=built.fieldProjection.fieldsByCollection[name];return [name,fields?rows.map(row=>({...row,data:Object.fromEntries(Object.entries(row.data).filter(([key])=>fields.includes(key)))})):rows];
}))}}
test('guarded projected calculation equals the unprojected original formula/DTO across roles, months, credit/debt allocations, attendance and driver assets',()=>{
 for(const position of ['Kinh doanh','Tài xế','Sản xuất','Nhân viên'])for(const date of ['2026-11-02','2026-10-03']){
  const snapshot=fixture(position,date),actor={...scope,date},before=JSON.stringify(snapshot);
  const expected=original.projectEmployeeHomeSnapshot(actor,snapshot),actual=projected.projectEmployeeHomeSnapshot(actor,select(snapshot));
  assert.deepEqual(actual,expected,position+'/'+date);assert.equal(JSON.stringify(snapshot),before,'input source values stay unchanged');
 }
 assert(built.instrumentedSpreads>20);assert(!built.fieldProjection.fieldsByCollection.orders.includes('items'));
});
test('missing/changed projection specification is rejected; omitted source values cannot silently return guessed salary/debt',()=>{
 const snapshot=fixture('Kinh doanh',scope.date);assert.throws(()=>projected.projectEmployeeHomeSnapshot(scope,snapshot),/Unverified/);
 const selected=select(snapshot);selected.fieldProjection={...selected.fieldProjection,schemaId:'0'.repeat(64)};assert.throws(()=>projected.projectEmployeeHomeSnapshot(scope,selected),/Unverified/);
 const extra=select(snapshot);extra.sources.orders[0].data.unrequestedCost=1;assert.throws(()=>projected.projectEmployeeHomeSnapshot(scope,extra),{code:'unproven_home_field_projection'});
});
test('guarded original math survives the actual private child transport, with no proxy markers or records in the DTO',async()=>{
 const actor={...scope,timeZone:'Asia/Ho_Chi_Minh'},snapshot=fixture('Kinh doanh',scope.date);
 // The child deliberately uses the verified actor timezone. Build its oracle
 // in that same timezone, rather than accidentally using the CI host's UTC.
 const previousTimeZone=process.env.TZ;let expected;
 try{process.env.TZ=actor.timeZone;expected=original.projectEmployeeHomeSnapshot(actor,snapshot)}
 finally{if(previousTimeZone===undefined)delete process.env.TZ;else process.env.TZ=previousTimeZone}
 const calculate=createEmployeeHomeProcessProjector({...built,validate:projected.validateEmployeeHomeScreenDto});
 const reply=await calculate({scope:actor,snapshot:select(snapshot)});assert.deepEqual(reply.model,expected);
 assert.doesNotMatch(JSON.stringify(reply),/private-home-projection|synthetic-only|synthetic-company|productPreferences|sources/);
});
