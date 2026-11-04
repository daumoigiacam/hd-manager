import test from 'node:test';import assert from 'node:assert/strict';
import {readOrderDirectoryProjection} from '../src/services/orderDirectoryProjection.js';
import {getReadOnlyModuleProjectionEntry} from '../src/services/moduleProjectionCaches.js';
const scope={companyId:'synthetic-company',employeeId:'synthetic-employee',permissionKey:'own',periodKey:'',clockKey:'2026-11-02:Asia/Saigon'};
const entry=(input,context=scope)=>getReadOnlyModuleProjectionEntry('orderDirectory',[input.orders,input.customers,input.products],context);

test('directory cache preserves current record references, archive filtering and distinct first/last duplicate lookup semantics',()=>{
 const firstProduct={id:'duplicate',price:10},lastProduct={id:'duplicate',price:20};
 const input={orders:[{id:1,amount:100},{id:'1',amount:200},{id:'archived',isArchived:true}],
  customers:[{id:'same',name:'first'},{id:'same',name:'last'}],products:[firstProduct,lastProduct,{id:'archived',isArchived:true},{id:NaN,price:30}]};
 const result=readOrderDirectoryProjection(entry(input),input);
 assert.deepEqual(result.activeOrders,input.orders.slice(0,2));assert.equal(result.activeOrders[0],input.orders[0]);
 assert.equal(result.activeOrderById.get('1'),input.orders[1],'existing String(id) map uses last occurrence');
 assert.equal(result.customerLookup.get('same'),input.customers[1]);assert.equal(result.activeProductLookup.get('duplicate'),lastProduct);
 assert.equal(result.orderSearchProductLookup.get('duplicate'),firstProduct);assert.equal(result.activeProductLookup.has(NaN),true);
 assert.equal(result.orderSearchProductLookup.has(NaN),false,'original strict first-find semantics exclude NaN');
 assert.equal(result.activeProductLookup.has('archived'),false);assert.equal(result.activeOrderById.has('archived'),false);
});

test('reopening 6000 unchanged records performs no new property reads; source/actor/permission/clock changes rebuild and edit commands remain current',()=>{
 let reads=0;const orders=Array.from({length:6000},(_,i)=>({get id(){reads++;return String(i)},get isArchived(){reads++;return false},amount:i}));
 const input={orders,customers:[],products:[]};const first=readOrderDirectoryProjection(entry(input),input);assert(reads>=12000);
 reads=0;assert.equal(readOrderDirectoryProjection(entry(input),input),first);assert.equal(reads,0,'no row walking/allocation on immutable cache reuse');
 for(const field of ['companyId','employeeId','permissionKey','clockKey']){
  const changed=readOrderDirectoryProjection(entry(input,{...scope,[field]:'changed'}),input);assert.notEqual(changed,first);assert.equal(changed.activeOrderById.get('5999'),orders[5999]);
 }
 const updated={...input,orders:[{id:'5999',amount:999999}]};const next=readOrderDirectoryProjection(entry(updated),updated);
 assert.equal(next.activeOrderById.get('5999'),updated.orders[0]);assert.equal(next.activeOrderById.get('5999').amount,999999);
 assert.equal(first.activeOrderById.get('5999'),orders[5999],'new snapshot never mutates a prior cached result');
});
