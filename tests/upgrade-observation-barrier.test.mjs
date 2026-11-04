import test from'node:test';import assert from'node:assert/strict';import{assertNoActiveUpgradeSoak}from'../scripts/helpers/upgrade-observation-barrier.mjs';
test('active candidate observation blocks subsequent APK mutation; ended failed runs remain diagnosable',async()=>{
 for(const status of['VERIFYING_CANDIDATE','STARTING','RUNNING'])await assert.rejects(assertNoActiveUpgradeSoak({readFile:async()=>JSON.stringify({status,elapsedMs:100})}),/collector is active/);
 for(const status of['FAILED','TWO_HOUR_OBSERVATION_COMPLETE_NOT_ACCEPTANCE'])await assertNoActiveUpgradeSoak({readFile:async()=>JSON.stringify({status,endedAt:'2026-11-03T08:00:00Z'})});
 await assertNoActiveUpgradeSoak({readFile:async()=>{throw Object.assign(Error('not present'),{code:'ENOENT'})}});await assert.rejects(assertNoActiveUpgradeSoak({readFile:async()=>'{broken'}),SyntaxError);
});
test('post-span heap capture and replacement candidate observation both block mutation',async()=>{
 for(const lock of['post-soak-retention-retry-lock.json','soak-editor-cleanup/sdk-soak-status.json','soak-listener-scope/sdk-soak-status.json'])await assert.rejects(assertNoActiveUpgradeSoak({readFile:async file=>file.endsWith(lock)?JSON.stringify(lock.includes('retry')?{active:true}:{status:'RUNNING'}):JSON.stringify({endedAt:'2026-11-03T08:00:00Z'})}),/active/);
});
