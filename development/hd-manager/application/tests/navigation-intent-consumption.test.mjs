import test from'node:test';import assert from'node:assert/strict';
import{createModuleNavigation}from'../src/layout/moduleNavigation.js';
test('a consumed Local workflow does not mutate the retained route or notify full-workspace subscriptions',()=>{
 const seen=[],store=createModuleNavigation('more',tab=>tab!=='attendancePeriods');
 const release=store.subscribe(()=>seen.push(store.getSnapshot()));
 assert.equal(store.set('attendancePeriods'),false);assert.equal(store.getSnapshot(),'more');assert.deepEqual(seen,[]);
 assert.equal(store.set('orders'),true);assert.equal(store.getSnapshot(),'orders');assert.deepEqual(seen,['orders']);
 assert.equal(store.set('orders'),false);assert.deepEqual(seen,['orders']);release();store.set('products');assert.equal(seen.length,1);
});
