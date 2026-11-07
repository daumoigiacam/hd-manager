import test from 'node:test';
import assert from 'node:assert/strict';
import {hasSameDashboardProjectionScope} from '../src/services/homeProjectionScope.js';
test('retains a pending report across recreated source arrays but not an account, permission or day change',()=>{
 const before={privacyScope:'permission-version-1',company:{id:'a'},employee:{id:'e'},dashboardDayKey:'2026-11-07',dashboardClockScope:'Asia/Ho_Chi_Minh',expenses:[],lockedPayroll:{}};
 assert.equal(hasSameDashboardProjectionScope(before,{...before,expenses:[],lockedPayroll:{}}),true);
 for(const patch of [{privacyScope:'permission-version-2'},{company:{id:'b'}},{employee:{id:'f'}},{dashboardDayKey:'2026-11-08'},{dashboardClockScope:'other'}])assert.equal(hasSameDashboardProjectionScope(before,{...before,...patch}),false);
 assert.equal(hasSameDashboardProjectionScope(before,{...before,privacyScope:undefined}),false);
 assert.equal(hasSameDashboardProjectionScope(undefined,before),false);
});
