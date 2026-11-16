import test from'node:test';import assert from'node:assert/strict';
import{getOrderRequestWorkspaceReadCollections as plan}from'../src/services/orderRequestWorkspaceReadPlan.js';
test('list prerequisites precede historical dispatch demand; reconciliation retains every original source',()=>{
 assert.deepEqual(plan(false),['orderRequests','customers','products','employees']);
 assert.deepEqual(plan(true),[...plan(false),'warehouseDispatches']);
 assert(Object.isFrozen(plan(true)));assert.equal(plan(undefined).includes('warehouseDispatches'),false);
});
