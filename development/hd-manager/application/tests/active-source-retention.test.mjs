import test from'node:test';import assert from'node:assert/strict';
import{createActiveSourceRetention}from'../src/services/activeSourceRetention.js';
import{planForegroundRealtimeActivation}from'../src/services/realtimeListenerPlanner.js';
test('only a completed active source leaving the current module is reusable',()=>{
 let now=0;const owner=createActiveSourceRetention({clock:()=>now});
 assert.deepEqual(owner.update(['orders','payments','cold'],['orders','payments'],x=>x!=='payments'),[]);
 assert.deepEqual(owner.update(['products'],['orders','payments'],x=>x!=='payments'),['orders']);
 assert.equal(owner.nextDeadline(),10000);
 now=5000;assert.deepEqual(owner.update(['products'],['orders','payments'],()=>true),['orders']);
 assert.equal(owner.nextDeadline(),10000,'repeated route effects never extend idle retention');
 now=10000;assert.deepEqual(owner.update(['products'],['orders','payments'],()=>true),[]);
 now=10001;assert.deepEqual(owner.update(['products'],['orders','payments'],()=>true),[],'expired source is not revived');
});
test('current demand wins the same fixed budget; retention never starts a cold source',()=>{
 const plan=planForegroundRealtimeActivation({requestedNames:['products','imports'],activeNames:['orders','payments'],retainedActiveNames:['cold','orders','payments'],availableNames:['products','imports','orders','payments','cold'],limit:3,retainRecent:false});
 assert.deepEqual(plan.liveNames,['products','imports','orders']);assert.deepEqual(plan.evictedNames,['payments']);assert.deepEqual(plan.overflowNames,[]);
});
test('returning to a live source cancels its deadline without duplicating it',()=>{
 let now=0;const owner=createActiveSourceRetention({clock:()=>now});owner.update(['orders'],['orders'],()=>true);
 owner.update(['products'],['orders'],()=>true);now=5000;
 assert.deepEqual(owner.update(['orders'],['orders','products'],()=>true),['products']);
 assert.equal(owner.nextDeadline(),15000);
 const plan=planForegroundRealtimeActivation({requestedNames:['orders'],activeNames:['orders','products'],retainedActiveNames:['orders','products'],limit:2,retainRecent:false});assert.deepEqual(plan.liveNames,['orders','products']);
});
test('permission invalidation or owner closure clears all retention and cannot restart it',()=>{
 for(const invalidate of ['scope','close']){let current=true;const owner=createActiveSourceRetention({isCurrent:()=>current});owner.update(['orders'],['orders'],()=>true);owner.update([],['orders'],()=>true);if(invalidate==='scope')current=false;else owner.close();assert.deepEqual(owner.update(['orders'],['orders'],()=>true),[]);current=true;assert.deepEqual(owner.update([],['orders'],()=>true),[]);assert.equal(owner.nextDeadline(),null);}
});
test('a source becoming unconfirmed or evicted is immediately removed from retention',()=>{
 const owner=createActiveSourceRetention();owner.update(['orders','payments'],['orders','payments'],()=>true);owner.update([],['orders','payments'],()=>true);
 assert.deepEqual(owner.update([],['orders'],()=>false),[]);assert.equal(owner.nextDeadline(),null);
});
