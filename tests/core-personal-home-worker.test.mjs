import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
import {initializeApp,deleteApp} from 'firebase/app';
import {initializeFirestore,Timestamp,doc} from 'firebase/firestore';
import {extractEmployeeHomeDomain} from '../scripts/helpers/employee-home-domain-extraction.mjs';
import {createPersonalHomeWorkerHandler} from '../src/services/personalHomeWorkerHandler.js';
import {getPersonalHomeInputCounts,personalHomeInputRows,createPersonalHomeInputAssembler} from '../src/services/personalHomeProjectionProtocol.js';
import {encodeFirestoreNativeValue,decodeFirestoreNativeValue} from '../src/services/firestoreNativeWireValues.js';
const source=readFileSync('src/App.jsx','utf8');
const clientBundle=await build({entryPoints:['src/services/personalHomeProjectionClient.js'],bundle:true,write:false,platform:'node',format:'esm',
 plugins:[{name:'personal-worker-fixture-factory',setup(b){b.onResolve({filter:/^@hd\/personal-home-worker$/},()=>({path:'fixture',namespace:'stub'}));
  b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const createPersonalHomeWorker=()=>{throw Error("Inject test transport")}'}))}}]});
const {runPersonalHomeProjection}=await import('data:text/javascript;base64,'+Buffer.from(clientBundle.outputFiles[0].text).toString('base64'));
const domainSource=extractEmployeeHomeDomain(source,path.resolve('src'));
const built=await build({stdin:{contents:domainSource,resolveDir:path.resolve('src')},bundle:true,write:false,platform:'node',format:'esm'});
const domain=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const selectionBundle=await build({stdin:{contents:extractEmployeeHomeDomain(source,path.resolve('src'),['preparePersonalHomeProjectionInput']),resolveDir:path.resolve('src')},bundle:true,write:false,platform:'node',format:'esm'});
const {preparePersonalHomeProjectionInput}=await import('data:text/javascript;base64,'+Buffer.from(selectionBundle.outputFiles[0].text).toString('base64'));
const calculate=input=>({details:domain.buildSalaryDetails(input.employee.id,input.employees,input.attendance,input.financials,input.performance,input.customers,input.orders,input.payments,input.holidays,input.monthKey),
 reviewSummary:domain.buildEmployeeReviewSummary(input.employee,{attendance:input.attendance,orders:input.orders,deliveryReports:input.deliveryReports,reviews:input.employeeReviews,monthKey:input.monthKey})});
const config={projectId:'demo-personal-home',apiKey:'synthetic'};
const app=initializeApp(config,'personal-home-codec-test'),db=initializeFirestore(app,{});
const codec={encode:value=>encodeFirestoreNativeValue(value,db),decode:value=>decodeFirestoreNativeValue(value,db)};
test.after(()=>deleteApp(app));
const fixture=(index=0)=>{
 const employee={id:'employee-a',name:'Synthetic employee',position:['Nhân viên kinh doanh','Tài xế','Nhân viên'][index%3],basicSalary:6200000,
  supportSalary:620000,commissionRate:0.01,targetRevenue:1000000,startDate:'2025-01-01',salaryDaysMode:'actual_calendar_days'};
 return {employee,employees:[employee],attendance:{'2026-10-01_employee-a':{empId:employee.id,date:'2026-10-01',status:'present',checkIn:'06:00',checkOut:'17:00'}},
  financials:[{id:'bonus',empId:employee.id,type:'bonus',date:'2026-10-02',amount:500000},{id:'advance',empId:employee.id,type:'advance',date:'2026-10-02',amount:200000}],
  performance:{'2026-10_employee-a':{revenue:3000000,overtime:2}},customers:[{id:'customer-a',empId:employee.id}],
  orders:[{id:'order-a',date:'2026-10-02',customerId:'customer-a',empId:employee.id,salesEmpId:employee.id,amount:3000000,
   createdAt:Timestamp.fromDate(new Date('2026-10-02T01:00:00Z')),unusedReference:doc(db,'synthetic/record'),items:[]}],
  payments:[{id:'payment-a',orderId:'order-a',customerId:'customer-a',amount:2000000,date:'2026-10-03'}],holidays:[],employeeReviews:[],deliveryReports:[],monthKey:'2026-10'};
};
function transport({hang=false}={}){
 let worker,stopped=0,calculated=0;const sent=[];
 const handle=createPersonalHomeWorkerHandler({initialize:()=>codec,calculate:input=>{calculated++;return calculate(input)},
  post:message=>queueMicrotask(()=>worker.onmessage?.({data:structuredClone(message)}))});
 worker={onmessage:null,onerror:null,postMessage(message){sent.push(message);if(!hang)queueMicrotask(()=>handle(structuredClone(message)))},terminate(){stopped++}};
 return {worker,sent,stats:()=>({stopped,calculated})};
}

test('worker transport preserves actual salary/review output with timestamps, references and each position',async()=>{
 for(let index=0;index<3;index++){
  const input=fixture(index),expected=calculate(input),before=codec.encode(input),t=transport();let clock=0,yields=0;
  const actual=await runPersonalHomeProjection({input,config,...codec,workerFactory:()=>t.worker,now:()=>clock+=5,yieldTask:async()=>{yields++}});
  assert.deepEqual(codec.encode(actual),codec.encode(expected));assert.deepEqual(codec.encode(input),before,'caller sources stay immutable');
  assert.equal(t.stats().calculated,1);assert.equal(t.stats().stopped,1);assert(yields>0);
  assert.equal(t.sent.at(-1).type,'complete');
 }
});

test('missing/reordered/duplicate rows cannot produce a completed financial projection',()=>{
 const input=fixture(),counts=getPersonalHomeInputCounts(input),rows=[...personalHomeInputRows(input,codec.encode)];
 const make=()=>createPersonalHomeInputAssembler({decode:codec.decode,monthKey:input.monthKey,expectedCounts:counts});
 const missing=make();missing.chunk({index:0,rows:rows.slice(0,-1)});
 assert.throws(()=>missing.finish({chunks:1,counts}),TypeError);
 assert.throws(()=>make().chunk({index:1,rows}),TypeError);
 const duplicate=make();assert.throws(()=>duplicate.chunk({index:0,rows:[rows[0],rows[0]]}),TypeError);
 const full=make();full.chunk({index:0,rows});assert.equal(full.finish({chunks:1,counts}).orders.length,1);
 assert.throws(()=>full.finish({chunks:1,counts}),TypeError);
 const tooMany=make();assert.throws(()=>tooMany.chunk({index:0,rows:[...rows,{name:'orders',key:1,value:codec.encode({})}]}),TypeError);
});

test('cancellation and worker failure terminate the calculation without persisting or returning partial values',async()=>{
 const input=fixture(),t=transport({hang:true}),controller=new AbortController();
 const pending=runPersonalHomeProjection({input,config,...codec,signal:controller.signal,workerFactory:()=>t.worker});
 controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(t.stats().calculated,0);assert.equal(t.stats().stopped,0,'cancelled admission never constructs a worker');
 const broken=transport({hang:true});const failed=runPersonalHomeProjection({input,config,...codec,workerFactory:()=>broken.worker});
 await new Promise(resolve=>setImmediate(resolve));broken.worker.onerror();await assert.rejects(failed,/khởi tạo/);assert.equal(broken.stats().stopped,1);
 const timed=transport({hang:true});await assert.rejects(runPersonalHomeProjection({input,config,...codec,workerFactory:()=>timed.worker,timeoutMs:1}),/quá thời gian/);
 assert.equal(timed.stats().stopped,1);
});

test('formula extraction is closed over existing pure bindings and refuses UI or unexpected globals',()=>{
 assert(domainSource.includes('export {buildSalaryDetails,buildEmployeeReviewSummary}'));
 assert.throws(()=>extractEmployeeHomeDomain(source.replace('const buildSalaryDetails = (','const buildSalaryDetails = (...args) => window.fetch(args); const replacedSalaryDetails = ('),path.resolve('src')),/Unapproved.*window/);
 assert.doesNotMatch(domainSource,/PersonalHomeProjectionGate|function MainApp|initializeFirestore/);
 const factory=readFileSync('src/services/personalHomeWorkerFactory.js','utf8');
 assert.match(factory,/import HomeWorker from '\.\/personalHomeWorker\.js\?worker'/);
 assert.match(factory,/new HomeWorker\(\)/);assert.doesNotMatch(factory,/type\s*:\s*['"]module['"]/);
});

test('scoped calculation inputs preserve full original salary, historical debt and review output across roles and downlines', async()=>{
 for(const position of ['Kinh doanh','Nhân viên kinh doanh','Tài xế','Sản xuất','Nhân viên']){
  const input=fixture();input.employee.position=position;
  input.employees.push({id:'downline',position:'Kinh doanh',salesLeaderId:input.employee.id,salesLeaderCommissionPercent:3},
   {id:'other',position:'Kinh doanh',salesLeaderId:'other-leader'});
  input.customers.push({id:'downline-customer',empId:'downline'},{id:'foreign',empId:'other'},
   {id:'duplicate',empId:input.employee.id},{id:'duplicate',empId:'other'});
  input.orders.push({id:'historical',date:'2020-01-01',customerId:'customer-a',amount:123456},
   {id:'historical',date:'2020-01-01',customerId:'customer-a',amount:654321},
   {id:'child',date:'2026-10-02',customerId:'downline-customer',amount:789123},
   {id:'legacy-direct',date:'2026-10-02',empId:input.employee.id,amount:54321},
   {id:'duplicate-customer',date:'2026-10-02',customerId:'duplicate',amount:1234});
  for(const key of ['empId','employeeId','salesEmployeeId','createdByEmpId','createdBy','ownerEmpId','salesPersonId'])
   input.orders.push({id:'review-'+key,date:'2026-10-03',customerId:'foreign',[key]:input.employee.id,amount:9876});
  input.payments.push({id:'old-payment',date:'2021-01-01',customerId:'customer-a',amount:11111},
   {id:'old-payment',date:'2021-01-01',customerId:'customer-a',amount:22222},
   {id:'pending',date:'2026-10-01',customerId:'customer-a',amount:33333,approvalStatus:'pending'});
  for(let i=0;i<1200;i++){
   input.orders.push({id:'unrelated-'+i,customerId:'foreign',empId:'other',amount:i,date:'2026-10-02'});
   input.payments.push({id:'foreign-'+i,customerId:'foreign',amount:i,date:'2026-10-02'});
  }
  const before=codec.encode(input),expected=calculate(input),t=transport();let yields=0;
  const actual=await runPersonalHomeProjection({input,config,...codec,prepareInput:preparePersonalHomeProjectionInput,
   workerFactory:()=>t.worker,now:()=>0,yieldTask:async()=>{yields++}});
  assert.deepEqual(codec.encode(actual),codec.encode(expected),position);
  assert.deepEqual(codec.encode(input),before,'selection cannot mutate source snapshots');
  const init=t.sent.find(m=>m.type==='init');
  assert(init.counts.orders<input.orders.length/10);assert(init.counts.payments<input.payments.length/10);
  assert(yields>0,'scanning input identities must yield, even before encoding starts');
  const transferred=t.sent.filter(m=>m.type==='chunk').flatMap(m=>m.rows);
  assert.equal(transferred.filter(r=>r.name==='orders'&&codec.decode(r.value).id==='historical').length,2,'identical IDs are not deduplicated');
  assert.equal(transferred.filter(r=>r.name==='payments'&&codec.decode(r.value).id==='old-payment').length,2);
  input.payments=[...input.payments,{id:'new-payment',customerId:'customer-a',amount:123456,date:'2026-10-04'}];
  const changed=await runPersonalHomeProjection({input,config,...codec,prepareInput:preparePersonalHomeProjectionInput,workerFactory:()=>transport().worker});
  assert.deepEqual(codec.encode(changed),codec.encode(calculate(input)),'replacement payment inputs must rebuild the live result');
 }
});

test('malformed legacy customer identities retain the full calculation instead of guessing debt ownership',()=>{
 const input=fixture();input.customers.push({id:'',empId:input.employee.id});
 const iterator=preparePersonalHomeProjectionInput(input);let step;do{step=iterator.next()}while(!step.done);
 assert.equal(step.value,input);
});

test('cancellation during input selection terminates before any financial input is transferred',async()=>{
 const input=fixture(),controller=new AbortController(),t=transport();let visited=0;
 await assert.rejects(runPersonalHomeProjection({input,config,...codec,signal:controller.signal,workerFactory:()=>t.worker,
  prepareInput:function*(){for(let i=0;i<1000;i++){visited++;yield}return input},now:()=>0,
  yieldTask:async()=>controller.abort()}),{name:'AbortError'});
 assert(visited<1000);assert.equal(t.sent.length,0);assert.equal(t.stats().stopped,1);
});
