import test from 'node:test';
import assert from 'node:assert/strict';
import {appFunction} from './helpers/app-source-function.mjs';
import {createProjectionCache} from '../src/services/cooperativeProjection.js';
import {buildFrozenDispatchOrderRows} from './fixtures/dispatch-order-rows-pre-cache.mjs';

test('actual expanded dispatch rows preserve the frozen branch, attribute, quantity and billing values across reopening',()=>{
 const item=Object.freeze({id:'line',productId:'p',quantity:3,unitPrice:104000,sizeLabel:'To',attributeLabel:'To',actualQuantity:3,billingUnit:'Con',billingQuantity:3,billingSnapshotVersion:2});
 const requests=Object.freeze([Object.freeze({id:'r',customerId:'c',branchId:'branch',items:Object.freeze([item])})]);
 const customers=Object.freeze([Object.freeze({id:'c',name:'Customer'})]),products=Object.freeze([Object.freeze({id:'p',name:'Product',unit:'Kg'})]);let reads=0;
 const bindings={orderRequests:requests,customers,products,todayOrderRequests:requests,
  warehouseOrderRowsCache:createProjectionCache({maxScopes:1}),dispatchOrderRowsScope:'company:actor:date',
  customerLookup:new Map(customers.map(x=>[x.id,x])),productLookup:new Map(products.map(x=>[x.id,x])),
  getCustomerDisplayName:c=>c?.name||'',resolveRequestDateKey:()=>{reads++;return'2026-11-01'},
  getDispatchOrderBranchRef:()=>({branchId:'branch',branchName:'Branch',branchAddress:'Address'}),
  getProductShortName:()=> 'VKM',getOrderLineUnitPriceValue:i=>i.unitPrice,getOrderLineQuantityValue:i=>i.quantity,
  getOrderLineWeightKgValue:()=>8.5,getOrderLineSizeLabel:i=>i.sizeLabel,getOrderLineAttributeLabel:i=>i.attributeLabel};
 const run=()=>appFunction('dispatchOrderRows',bindings,{memoCallback:true,scope:'WarehouseDispatchView'})();
 const expected=buildFrozenDispatchOrderRows(bindings),first=run(),after=reads;assert.deepEqual(first,expected);
 assert.equal(first[0].branchId,'branch');assert.equal(first[0].unitPrice,104000);assert.equal(first[0].sizeLabel,'To');assert.equal(first[0].item,item);
 assert.equal(run(),first);assert.equal(reads,after,'remount must not re-expand every historical request line');
 for(const key of ['orderRequests','customers','products']){
  bindings[key]=[...bindings[key]];const next=run();assert.notEqual(next,first);assert.deepEqual(next,buildFrozenDispatchOrderRows(bindings));
 }
 const old=run();bindings.dispatchOrderRowsScope='company:other-actor:other-date';const other=run();assert.notEqual(other,old);
 bindings.dispatchOrderRowsScope='company:actor:date';assert.notEqual(run(),old,'large row arrays keep only one scope per source set');
});

test('projection scope capacity is explicit and invalid or unbounded configurations fail',()=>{
 for(const maxScopes of [0,-1,9,Infinity,1.5])assert.throws(()=>createProjectionCache({maxScopes}),RangeError);
 const source={},cache=createProjectionCache({maxScopes:1}),old=cache([source],'old');
 assert.equal(cache([source],'old'),old);const latest=cache([source],'latest');assert.equal(cache([source],'latest'),latest);
 assert.notEqual(cache([source],'old'),old);
});
