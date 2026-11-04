import test from 'node:test';import assert from 'node:assert/strict';
import {hasSameHomeProjectionScope} from '../src/services/useHomePrimaryProjection.js';
test('retained Home values cannot cross authentication/access/day/timezone boundaries',()=>{
 const a={privacyScope:'verified-user-tenant-permission-session',dashboardDayKey:'2026-11-04',dashboardClockScope:'2026-11-04|Asia/Saigon|-420'};
 assert.equal(hasSameHomeProjectionScope(a,{...a}),true);
 for(const key of Object.keys(a)){
  assert.equal(hasSameHomeProjectionScope(a,{...a,[key]:'different'}),false,key);
  assert.equal(hasSameHomeProjectionScope(a,{...a,[key]:undefined}),false,key);
 }
 assert.equal(hasSameHomeProjectionScope(null,a),false);
 assert.equal(hasSameHomeProjectionScope({},{}),false);
});
