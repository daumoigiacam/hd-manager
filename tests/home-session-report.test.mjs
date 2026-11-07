import test from 'node:test';import assert from 'node:assert/strict';
import {restoreHomeSessionReport,saveHomeSessionReport,clearHomeSessionReport} from '../src/services/homeSessionReport.js';
const scope={privacyScope:'verified-user-tenant-grants-session',company:{id:'tenant'},employee:{id:'employee'},dashboardDayKey:'2026-11-07'};
const projection={inputs:scope,snapshot:{generatedAt:'2026-11-07T12:00:00Z',finance:{todayKey:scope.dashboardDayKey,revenueToday:100,cashExpenseRows:[],payrollAccrualRows:[],series7Days:[],series30Days:[],series12Months:[]},business:{privateCustomerDirectory:['not persisted']}}};
const memory=()=>{const map=new Map();return {getItem:key=>map.get(key),setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key),map}};
test('completed report restores financial DTO only, never raw sources or authoritative state',()=>{
 const store=memory();assert.equal(saveHomeSessionReport(projection,{store,now:1000}),true);
 const restored=restoreHomeSessionReport(scope,{store,now:2000});assert.deepEqual(restored.snapshot.finance,projection.snapshot.finance);
 assert.equal(restored.restored,true);assert.equal(restored.mode,'primary');assert.equal(restored.snapshot.kind,'home-primary-v1');
 assert.equal(restored.snapshot.business,undefined);assert.equal(restored.inputs.orders,undefined);
 clearHomeSessionReport(store);assert.equal(restoreHomeSessionReport(scope,{store,now:2000}),null);
});
test('principal/tenant/permissions/session/day/clock mismatches and expiry fail closed',()=>{
 const store=memory();saveHomeSessionReport(projection,{store,now:1000});
 for(const patch of [{privacyScope:'other-uid'},{privacyScope:'changed-grants'},{privacyScope:'new-login-session'},{company:{id:'other-tenant'}},{employee:{id:'other-user'}},{dashboardDayKey:'2026-11-08'},{dashboardClockScope:'other-zone'}])assert.equal(restoreHomeSessionReport({...scope,...patch},{store,now:2000}),null,JSON.stringify(patch));
 assert.equal(restoreHomeSessionReport(scope,{store,now:1000+30*60*1000+1}),null);
 assert.equal(restoreHomeSessionReport(scope,{store,now:999}),null);
});
test('malformed, oversized and unavailable storage cannot break Home or clear business data',()=>{
 const store=memory();assert.equal(saveHomeSessionReport({...projection,snapshot:{...projection.snapshot,finance:{...projection.snapshot.finance,cashExpenseRows:[{detail:'x'.repeat(750001)}]}}},{store}),false);
 store.setItem('hd-home-completed-report-v1','invalid-json');assert.equal(restoreHomeSessionReport(scope,{store}),null);
 const denied={getItem(){throw Error('blocked')},setItem(){throw Error('quota')},removeItem(){throw Error('blocked')}};
 assert.equal(saveHomeSessionReport(projection,{store:denied}),false);assert.equal(restoreHomeSessionReport(scope,{store:denied}),null);clearHomeSessionReport(denied);
 assert.equal(saveHomeSessionReport({...projection,inputs:{...scope,privacyScope:''}},{store}),false);
});
