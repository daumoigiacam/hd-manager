import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
import {parse} from '@babel/parser';
import {extractEmployeeHomeScreenModel} from '../scripts/helpers/employee-home-model-extraction.mjs';
import {buildEmployeeHomeScreenDto,validateEmployeeHomeScreenDto} from '../src/services/employeeHomeScreenDto.js';
const source=readFileSync('src/App.jsx','utf8');
const helpers=['parseLooseMoneyValue','getAssetDisplayLabel','getAssetStatusLabel','formatShiftRangeLabel','formatAttendanceMomentForWorkDate','getAttendanceCompactSource'];
const extracted=extractEmployeeHomeScreenModel(source,path.resolve('src'),helpers);
const bundled=await build({stdin:{contents:extracted.code,resolveDir:path.resolve('src')},bundle:true,write:false,platform:'node',format:'esm'});
const domain=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const view=parse(source,{sourceType:'module',plugins:['jsx']}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='EmployeePersonalHomeView');
const returned=view.body.body.find(n=>n.type==='ReturnStatement');
// Independent original component statements and original memo callbacks, not
// the extracted closure or a hand-written reimplementation of financial maths.
const original=source.slice(view.start,returned.start)+'return {'+extracted.fields.join(',')+'};}';
const oracle=new Function('domain','input',`const useMemo=f=>f(),useRef=()=>({current:null}),useState=()=>['',()=>{}];with(domain){const component=${original};return component(input)}`);
const fixture=position=>{
 const employee={id:'employee-a',companyId:'company-a',name:'Synthetic employee',position,basicSalary:6200000,
  startDate:'2025-01-01',salaryDaysMode:'actual_calendar_days',passwordHash:'PRIVATE_SENTINEL'};
 return {employee,employees:[employee],date:'2026-10-03',attendance:{'2026-10-03_employee-a':{id:'attendance-a',empId:employee.id,date:'2026-10-03',status:'present',checkIn:new Date('2026-10-02T23:00:00Z'),checkOut:new Date('2026-10-03T10:00:00Z')}},
  financials:[{id:'bonus',empId:employee.id,type:'bonus',date:'2026-10-02',amount:500000,secret:'PRIVATE_SENTINEL'}],performance:{},
  customers:[{id:'customer-a',empId:employee.id,privateNotes:'PRIVATE_SENTINEL'}],orders:[{id:'order-a',date:'2026-10-02',customerId:'customer-a',empId:employee.id,amount:3000000}],
  payments:[{id:'payment-a',customerId:'customer-a',date:'2026-10-02',amount:1000000}],holidays:[],employeeReviews:[],deliveryReports:[],advanceRequests:[],
  assets:[],assetCostLogs:[],expenses:[]};
};

test('extracted complete screen data matches original component statements across roles, dates and attendance states',()=>{
 for(const position of ['Kinh doanh','Tài xế','Sản xuất','Nhân viên']){
  for(const date of ['2026-10-03','2026-11-01']){
   const input=fixture(position);input.date=date;
   const expected=oracle(domain,input),actual=domain.buildEmployeeHomeScreenModel(input);
   for(const field of extracted.fields){
    if(typeof expected[field]==='function')continue;
    assert.deepEqual(actual[field],expected[field],`${position}/${date}/${field}`);
   }
   assert.deepEqual(buildEmployeeHomeScreenDto(actual,input,domain),buildEmployeeHomeScreenDto(expected,input,domain));
  }
 }
});

test('compact allowlist preserves display amounts and labels without raw documents or credentials',()=>{
 const input=fixture('Tài xế');
 // Source assignment format is the existing predicate's contract.
 input.assets=[{id:'asset-a',name:'Synthetic truck',assignedEmployeeId:'employee-a',status:'active',password:'PRIVATE_SENTINEL'}];
 input.expenses=[{id:'expense-a',assetId:'asset-a',amount:1000000,date:'2026-10-02',secret:'PRIVATE_SENTINEL'}];
 input.deliveryReports=Array.from({length:12},(_,i)=>({id:'report-'+i,empId:'employee-a',date:`2026-10-${String(i+1).padStart(2,'0')}`,collectedAmount:i*1234,deliveryExpenseAmount:i*25,secret:'PRIVATE_SENTINEL'}));
 const model=domain.buildEmployeeHomeScreenModel(input),dto=buildEmployeeHomeScreenDto(model,input,domain),json=JSON.stringify(dto);
 assert.equal(dto.salary.netSalary,model.details.netSalary);assert.equal(dto.assets.monthCost,model.employeeAssetMonthCost);
 assert.equal(dto.delivery.income,model.employeeDeliveryMonthSummary.income);assert.equal(dto.delivery.rows.length,8);
 assert.equal(dto.delivery.reportCount,12,'display limit never truncates totals');
 assert.doesNotMatch(json,/PRIVATE_SENTINEL|passwordHash|customer-a|order-a|payment-a|employee-a|privateNotes/);
 assert.doesNotThrow(()=>validateEmployeeHomeScreenDto(JSON.parse(json)));
 for(const mutate of [d=>{d.secret='extra'},d=>{d.salary.password='extra'},d=>{d.salary.netSalary=NaN},d=>{d.delivery.rows[0].income=Infinity},d=>{d.assets.rows=Array(4).fill({})},d=>{d.monthKey='2026-13'},d=>{d.reviewStars=6}]){
  const changed=structuredClone(dto);mutate(changed);assert.throws(()=>validateEmployeeHomeScreenDto(changed),TypeError);
 }
});

test('extraction refuses new browser dependencies and does not silently drop a direct identifier dependency',()=>{
 const replaceView=(before,after)=>source.slice(0,view.start)+source.slice(view.start,view.end).replace(before,after)+source.slice(view.end);
 assert.throws(()=>extractEmployeeHomeScreenModel(replaceView("const positionLabel = getEmployeePositionLabel(employee?.position);","const positionLabel = window.location.href;"),path.resolve('src')),/global.*window/);
 const changed=replaceView('const salesOrderCount = employeeSalesOrderRows.length;','const salesOrderCount = notificationUnreadCount;');
 const result=extractEmployeeHomeScreenModel(changed,path.resolve('src'));
 assert(result.parameters.includes('notificationUnreadCount'));assert.match(result.code,/const salesOrderCount = notificationUnreadCount;/);
});
