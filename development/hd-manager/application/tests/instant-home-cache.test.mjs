import test from 'node:test';import assert from 'node:assert/strict';
import {saveHomeSessionReport,restoreHomeSessionReport} from '../src/services/homeSessionReport.js';
const now=Date.parse('2026-11-12T05:00:00Z');
const inputs={privacyScope:'tenant-A:account-A:verified-permission-1:session-1',company:{id:'A'},employee:{id:'account-A'},dashboardDayKey:'2026-11-12',dashboardClockScope:'verified-clock'};
const snapshot={kind:'home-primary-v1',generatedAt:new Date(now).toISOString(),finance:{todayKey:'2026-11-12',cashExpenseRows:[],payrollAccrualRows:[],series7Days:[],series30Days:[],series12Months:[]}};
const storage=()=>{const items=new Map();return {getItem:key=>items.get(key),setItem:(key,value)=>items.set(key,value)};};
test('Home presentation cache is unavailable across tenant, principal, session and permission epochs',()=>{
 const store=storage();assert.equal(saveHomeSessionReport({inputs,snapshot},{store,now}),true);
 assert.ok(restoreHomeSessionReport(inputs,{store,now}));
 for(const modified of [{...inputs,company:{id:'B'}},{...inputs,employee:{id:'account-B'}},{...inputs,privacyScope:'tenant-A:account-A:permission-revoked:session-1'},{...inputs,privacyScope:'tenant-A:account-A:verified-permission-1:session-2'}])assert.equal(restoreHomeSessionReport(modified,{store,now}),null);
});
test('Home cache expires and cannot label yesterday or another clock as today',()=>{
 const store=storage();saveHomeSessionReport({inputs,snapshot},{store,now});
 assert.equal(restoreHomeSessionReport(inputs,{store,now:now+30*60*1000+1}),null);
 assert.equal(restoreHomeSessionReport({...inputs,dashboardDayKey:'2026-11-13'},{store,now}),null);
 assert.equal(restoreHomeSessionReport({...inputs,dashboardClockScope:'different-timezone'},{store,now}),null);
});
