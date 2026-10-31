import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEmployeeReviewSourceIndexes} from '../src/utils/employeeReviewSourceIndex.js';
import {appFunction} from './helpers/app-source-function.mjs';
const calculate=appFunction('calculateEmployeeSystemReview',{
 getEmployeeAttendanceEntriesForMonth:()=>[],isEmployeeReviewLeaveRecord:()=>false,getDateKeyFromAnyValue:v=>String(v).slice(0,10),
 getEntityTimestamp:()=>0,calculateAttendanceTiming:()=>({lateMinutes:0}),parseMinutesInput:()=>0,
 isOrderRelatedToEmployeeReview:appFunction('isOrderRelatedToEmployeeReview'),
 isDeliveryReportRelatedToEmployeeReview:appFunction('isDeliveryReportRelatedToEmployeeReview'),
 normalizeEmployeeReviewMonthKey:v=>String(v).slice(0,7),getEmployeeReviewOrderAmount:o=>Number(o.totalAmount??o.total??o.amount??o.finalAmount??o.grandTotal??o.revenue??0),
 formatCurrency:n=>String(n),getEmployeeReviewStars:score=>score/20,
});
test('batch indexes preserve every relationship alias, source order, repeated entries, numeric IDs and month/tenant predicates',()=>{
 const fields=['empId','employeeId','salesEmployeeId','createdByEmpId','createdBy','ownerEmpId','salesPersonId'];
 const orders=fields.map((field,i)=>({id:'o'+i,[field]:'a',companyId:'one',date:'2026-10-24',amount:100+i}));
 orders.push({id:'both',empId:'a',createdBy:'a',ownerEmpId:'b',date:'2026-10-24',companyId:'one',amount:400},
 {empId:7,date:'2026-10-24',companyId:'one',amount:700},{empId:'a',date:'2026-09-24',companyId:'one',amount:9999},
 {empId:'a',date:'2026-10-24',companyId:'foreign',amount:99999});
 orders.push(orders[0]);
 const deliveryReports=['empId','employeeId','driverId','createdByEmpId','createdBy'].map(field=>({[field]:'a',date:'2026-10-24',companyId:'one'}));
 const context={orders,deliveryReports,companyId:'one',monthKey:'2026-10'},index=buildEmployeeReviewSourceIndexes(orders,deliveryReports);
 for(const id of ['a','b',7,'absent',''])assert.deepEqual(calculate({id},{...context,...index}),calculate({id},context));
 assert.deepEqual(index.reviewOrdersByEmployee.get('a').map(o=>o.id),orders.filter(o=>fields.some(f=>String(o[f]||'')==='a')).map(o=>o.id));
 const before=calculate({id:'a'},{...context,...index});
 orders[0].empId='b';orders.splice(1,1);orders.push({empId:'a',date:'2026-10-24',companyId:'one',amount:321});
 const updated=buildEmployeeReviewSourceIndexes(orders,deliveryReports);
 assert.deepEqual(calculate({id:'a'},{...context,...updated}),calculate({id:'a'},context));
 assert.notDeepEqual(calculate({id:'a'},{...context,...updated}),before);
});

test('one batch index avoids scanning unrelated order relationships for each employee without changing revenue or delivery evaluation',()=>{
 let reads=0;const employees=Array.from({length:50},(_,i)=>({id:'e'+i}));
 const orders=Array.from({length:1500},(_,i)=>({get empId(){reads++;return 'e'+i%50},date:'2026-10-24',companyId:'one',amount:i+1}));
 const context={orders,deliveryReports:[],monthKey:'2026-10',companyId:'one'};
 const expected=employees.map(emp=>calculate(emp,context)),oldReads=reads;reads=0;
 const indexes=buildEmployeeReviewSourceIndexes(orders,[]);
 assert.deepEqual(employees.map(emp=>calculate(emp,{...context,...indexes})),expected);
 assert.equal(oldReads,75000);assert.equal(reads,3000);
});
