import test from'node:test';import assert from'node:assert/strict';import{assertVerificationFixtureReady}from'../scripts/helpers/verification-fixture-preflight.mjs';
const base={status:'READY',project:'demo-hdm-perf-verification',appId:'verification-fixture',realAccounts:false,expiresAt:new Date(12*3600000).toISOString()};
const fixture=extra=>({readFile:async()=>JSON.stringify({...base,...extra}),now:()=>0,request:async url=>({status:({'8185':404,'9199':200,'5002':204})[new URL(url).port]})});
test('a READY record requires live local endpoints and enough actual service lifetime',async()=>{
 const ready=await assertVerificationFixtureReady({...fixture(),requiredRemainingMs:7200000});assert.deepEqual(ready.ports.map(r=>r.port),[8185,9199,5002]);
 await assert.rejects(assertVerificationFixtureReady(fixture({expiresAt:new Date(1000).toISOString()})),/expires/);
 await assert.rejects(assertVerificationFixtureReady(fixture({project:'production-project'})),/fictional/);
 await assert.rejects(assertVerificationFixtureReady({...fixture(),request:async()=>{throw Error('ECONNREFUSED')}}),/ECONNREFUSED/);
 await assert.rejects(assertVerificationFixtureReady({...fixture(),request:async()=>({status:500})}),/Unexpected/);
});
