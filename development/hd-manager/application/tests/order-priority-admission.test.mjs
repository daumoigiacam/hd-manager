import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{getOrderWorkspaceReadCollections,ORDER_PRIMARY_COLLECTIONS,runReadyOrderMutation}from'../src/services/orderWorkspaceReadPlan.js';
test('initial list demands only its complete invoice/catalog sources; all original sources are admitted after the committed list',()=>{
 assert.deepEqual(ORDER_PRIMARY_COLLECTIONS,['customers','products','orders','payments']);
 assert.deepEqual([...getOrderWorkspaceReadCollections(true)].sort(),['customers','products','orders','orderRequests','warehouseDispatches','deliveryReports','payments','expenses','warehouseImports','zalo_send_queue'].sort());
 assert.equal(new Set(getOrderWorkspaceReadCollections(true)).size,10);assert(Object.isFrozen(getOrderWorkspaceReadCollections(false)));
});
test('pending reconciliation never calls a business mutation; readiness forwards original arguments/result without retry or alteration',async()=>{
 const args=[{id:'kept',amount:67000}],calls=[];const callback=(...values)=>{calls.push(values);return{same:true};};
 await assert.rejects(runReadyOrderMutation(false,callback,args),{code:'source-not-ready'});assert.equal(calls.length,0);
 assert.deepEqual(runReadyOrderMutation(true,callback,args),{same:true});assert.equal(calls.length,1);assert.strictEqual(calls[0][0],args[0]);
});
test('actual source demand is owner-bound, released by the committed view, and does not bypass warehouse/financial guards',()=>{
 const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8'),orders=fs.readFileSync(new URL('../src/features/legacy/OrderManagementView.jsx',import.meta.url),'utf8');
 assert.match(app,/orderBackgroundRequested=orderListCommittedOwner===readOwnerKey/);assert.match(app,/if\(readOwnerRef.current===readOwnerKey\)setOrderListCommittedOwner\(readOwnerKey\)/);
 assert.match(app,/activeTab==='orders'\?getOrderWorkspaceReadCollections\(orderBackgroundRequested\)/);
 assert.match(orders,/if\(orderViewsReady\)onPrimaryReady\?\.\(\)/);
 assert.match(app,/orderMutationsReady=mainLedgerReady&&orderLedgerSourcesReady/);
 for(const name of ['onAddOrder','onEditOrder','onAddPayment','onDeleteOrder'])assert(app.includes(name+'={(...args)=>runOrderMutation('+name+',args)}'));
 assert.match(orders,/source === 'warehouse' && \(!canUseWarehouseOrderSource\|\|!warehouseSourcesReady\)/);assert.match(orders,/disabled=\{!warehouseSourcesReady\}/);
});
