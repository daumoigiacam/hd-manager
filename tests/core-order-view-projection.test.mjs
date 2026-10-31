import test from 'node:test';
import assert from 'node:assert/strict';
import {appFunction} from './helpers/app-source-function.mjs';
import {legacyViewModels,legacySnapshots} from './fixtures/order-view-projection.baseline.mjs';
import {runCooperativeReportProjection} from '../src/services/cooperativeReportProjection.js';
const parseLooseMoneyValue=appFunction('parseLooseMoneyValue');
const outstanding=appFunction('getOrderOutstandingBalance',{parseLooseMoneyValue});
const normalize=appFunction('normalizeOrderPaymentSnapshot',{parseLooseMoneyValue,getOrderOutstandingBalance:outstanding});
const buildView=appFunction('buildOrderViewModel');
const steps=appFunction('buildOrderViewProjectionSteps',{buildOrderViewModel:buildView,normalizeOrderPaymentSnapshot:normalize});
function fixture(){
 const orders=Array.from({length:300},(_,i)=>({id:'o'+i,customerId:'c'+i%3,empId:'e',createdByEmpId:i%2?'creator':'',salesEmpId:i%4?'sales':'',
 amount:i%13?10000+i+0.7:'10.000 đ',paidAmount:i%5?100:0,creditApplied:i%7?0:500,sourceDispatchIds:['d'+i],items:[{description:'Vịt',quantity:1}],
 zaloSendStatus:i%11?'not_queued':'sent'}));
 orders.push({...orders[0],amount:99999}, {...orders[1],id:'__proto__',paidAmount:2000});
 const context={customerLookup:new Map([['c0',{name:'Khách thử',empId:'sales'}]]),employeeLookup:new Map([['e',{name:'NV'}],['sales',{name:'NVKD'}],['creator',{name:'Người tạo'}]]),
 ledgerOrderById:new Map([['o1',{appliedAmount:1234,outstandingAmount:8767,status:'partial'}],['o2',{appliedAmount:10002,outstandingAmount:0,status:'paid'}]]),
 paymentHistoryByOrderId:new Map([['o3',[{allocatedToOrder:1000,amount:1000}]]]),
 deliveryReportIssueByDispatch:new Map([['d0',{issueType:'missing'}]]),zaloQueueByOrderId:new Map([['o5',{status:'sent',sentAt:'2026-10-24'}]])};
 return {orders,context};
}
const evaluate=(expression,bindings)=>new Function(...Object.keys(bindings),'return '+expression)(...Object.values(bindings));
test('complete order projection preserves frozen payment, debt, employee, delivery and Zalo semantics including duplicate and special IDs',async()=>{
 const {orders,context}=fixture(),before=structuredClone(orders),useMemo=f=>f();
 const expectedViews=evaluate(legacyViewModels,{...context,activeOrders:orders,useMemo});
 const expectedSnapshots=evaluate(legacySnapshots,{activeOrders:orders,orderViewModels:expectedViews,normalizeOrderPaymentSnapshot:normalize,useMemo});
 let clock=0,yields=0;
 const result=await runCooperativeReportProjection(steps(orders,context),{now:()=>clock++,budgetMs:1,yieldWork:async()=>{yields++}});
 assert.deepEqual(result.byId,expectedViews);assert.deepEqual(result.snapshots,expectedSnapshots);assert.ok(yields>20);
 assert.deepEqual(orders,before);assert.equal(Object.getPrototypeOf(result.byId),Object.prototype);
 assert.equal(Object.hasOwn(result.byId,'__proto__'),true);
 assert.equal(result.snapshots[0].amount,99999,'duplicate IDs preserve the original last-record mapping');
});
test('concurrent source replacement cancels old totals; live editor derivation sees fresh allocation before the list job completes',async()=>{
 const {orders,context}=fixture();let current=true,clock=0,yields=0,completed=false;
 await assert.rejects(runCooperativeReportProjection(steps(orders,context),{isCurrent:()=>current,now:()=>clock++,budgetMs:1,
  yieldWork:async()=>{if(++yields===3)current=false}}).then(()=>{completed=true}),{name:'AbortError'});
 assert.equal(completed,false);
 context.ledgerOrderById.set('o1',{appliedAmount:10001,outstandingAmount:0,status:'paid'});
 const live=normalize(buildView(orders[1],context));assert.equal(live.outstandingAmount,0);assert.equal(live.status,'paid');
 const next=await runCooperativeReportProjection(steps(orders,context),{yieldWork:async()=>{}});
 assert.deepEqual(normalize(next.byId.o1),live);
});
