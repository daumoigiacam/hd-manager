import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import path from 'node:path';import {build} from 'esbuild';
import {buildEmployeeHomeSnapshotInput} from '../src/services/employeeHomeSnapshotInput.js';
import {extractEmployeeHomeScreenModel} from '../scripts/helpers/employee-home-model-extraction.mjs';
import {buildEmployeeHomeScreenDto} from '../src/services/employeeHomeScreenDto.js';
import {appFunction} from './helpers/app-source-function.mjs';
import {parse} from '@babel/parser';
const source=readFileSync('src/App.jsx','utf8');
const app=parse(source,{sourceType:'module',plugins:['jsx']}).program.body.find(n=>n.type==='ExportDefaultDeclaration'&&n.declaration?.id?.name==='App').declaration;
const rootMemo=(name,context)=>{
 const declaration=app.body.body.filter(n=>n.type==='VariableDeclaration').flatMap(n=>n.declarations).find(n=>n.id.name===name);
 const callback=declaration?.init?.arguments?.[0];assert(callback&&['ArrowFunctionExpression','FunctionExpression'].includes(callback.type),'Original App memo required: '+name);
 return new Function(...Object.keys(context),`return (${source.slice(callback.start,callback.end)})();`)(...Object.values(context));
};
const roots=['withSalesRevenueIndex','calculateMonthRevenue','isCashflowOfficial','resolveAttendanceAnomalyForDate',
 'parseLooseMoneyValue','getAssetDisplayLabel','getAssetStatusLabel','formatShiftRangeLabel','formatAttendanceMomentForWorkDate','getAttendanceCompactSource'];
const extracted=extractEmployeeHomeScreenModel(source,path.resolve('src'),roots);
const bundle=await build({stdin:{contents:extracted.code,resolveDir:path.resolve('src')},bundle:true,write:false,platform:'node',format:'esm'});
const domain=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const scope={companyId:'company-a',employeeId:'employee-a',date:'2026-11-02'};
function fixture(){
 const snapshot={company:{documentId:'company-a',data:{}},employee:{documentId:'employee-a',data:{companyId:'company-a'}},sources:{},counts:{}};
 for(const name of ['employees','customers','orders','payments','expenses','financials','attendance','performance','employeeReviews','deliveryReports','holidays','advances','assets','assetCostLogs'])snapshot.sources[name]=[];
 const row=(documentId,data)=>({documentId,data:{companyId:'company-a',...data}});
 snapshot.sources.employees=[row('employee-a',{id:'forged-data-id',name:'Synthetic employee',position:'Kinh doanh',basicSalary:6200000}),row('archived',{isArchived:true})];
 snapshot.sources.customers=[row('customer-a',{empId:'employee-a',openingDebt:12345}),row('archived',{isArchived:true})];
 snapshot.sources.orders=[row('order-a',{customerId:'customer-a',date:'2026-11-02',amount:2000000}),row('archived',{isArchived:true,amount:999999})];
 snapshot.sources.payments=[row('payment-a',{customerId:'customer-a',date:'2026-11-02',amount:500000}),row('pending',{amount:999999,approvalStatus:'pending'})];
 snapshot.sources.financials=[row('bonus',{empId:'employee-a',date:'2026-11-02',amount:5000,type:'bonus'}),row('archived',{isArchived:true})];
 snapshot.sources.attendance=[row('2026-11-02_employee-a',{empId:'employee-a',date:'2026-11-02',status:'present',checkIn:'2026-11-02T01:00:00Z',checkOut:null})];
 snapshot.sources.performance=[row('employee-a',{overtime:2,revenue:123})];
 for(const [name,rows]of Object.entries(snapshot.sources))snapshot.counts[name]=rows.length;
 return snapshot;
}
test('private snapshot adapter preserves original App filtering, current performance aggregation, attendance and complete Home maths',()=>{
 const snapshot=fixture(),actual=buildEmployeeHomeSnapshotInput(snapshot,scope,domain),raw={};
 const normalize=appFunction('normalizeFirestoreSnapshotData');
 for(const [name,rows]of Object.entries(snapshot.sources))raw[name]=rows.map(row=>({...normalize(row.data),id:row.documentId}));
 const expected={date:scope.date};
 const names={employees:'rawEmployees',customers:'rawCustomers',orders:'rawOrders',payments:'rawPayments',expenses:'rawExpenses',financials:'rawFinancials',holidays:'rawHolidays',employeeReviews:'rawEmployeeReviews',deliveryReports:'rawDeliveryReports',advanceRequests:'rawAdvanceRequests',assets:'rawAssets',assetCostLogs:'rawAssetCostLogs'};
 for(const [name,rawName]of Object.entries(names))expected[name]=rootMemo(name,{[rawName]:raw[name==='advanceRequests'?'advances':name],myCompanyId:scope.companyId});
 expected.employee=expected.employees.find(row=>row.id===scope.employeeId);
 const rawAttendance=Object.fromEntries(raw.attendance.map(row=>[row.id,{...row,checkIn:row.checkIn?new Date(row.checkIn):null,checkOut:row.checkOut?new Date(row.checkOut):null}]));
 expected.attendance=rootMemo('attendanceRecords',{rawAttendance,myCompanyId:scope.companyId});
 const rawPerformance=Object.fromEntries(raw.performance.map(row=>[row.id,row]));
 const performanceRecords=rootMemo('performanceRecords',{rawPerformance,myCompanyId:scope.companyId});
 expected.performance=rootMemo('aggregatedPerformance',{performanceRecords,employees:expected.employees,orders:expected.orders,customers:expected.customers,...domain});
 expected.payments=expected.payments.filter(domain.isCashflowOfficial);expected.expenses=expected.expenses.filter(domain.isCashflowOfficial);
 expected.record=domain.resolveAttendanceAnomalyForDate(expected.employee,expected.attendance,scope.date)?.record||null;
 // Map prototypes carry no business value; compare all own data and exact Date values.
 assert.deepEqual({...actual.attendance},expected.attendance);assert.deepEqual(actual.performance,expected.performance);
 for(const name of Object.keys(expected).filter(n=>n!=='attendance'))assert.deepEqual(actual[name],expected[name],name);
 assert.equal(actual.employee.id,'employee-a');assert.equal(actual.financials.length,2,'financial archive semantics remain in the original calculator');
 const calculated=domain.buildEmployeeHomeScreenModel(actual),reference=domain.buildEmployeeHomeScreenModel(expected);
 assert.deepEqual(buildEmployeeHomeScreenDto(calculated,actual,domain),buildEmployeeHomeScreenDto(reference,expected,domain));
});
test('missing, mismatched and foreign source pages fail closed rather than calculate partial salary/debt',()=>{
 for(const mutate of [s=>{delete s.sources.payments},s=>{s.counts.orders++},s=>{s.sources.orders[0].data.companyId='foreign'},s=>{s.employee.documentId='other'},s=>{s.sources.employees[0].data.isArchived=true}]){
  const snapshot=fixture();mutate(snapshot);assert.throws(()=>buildEmployeeHomeSnapshotInput(snapshot,scope,domain),TypeError);
 }
});
