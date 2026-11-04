import test from 'node:test';
import assert from 'node:assert/strict';
import {createPolicyPrototype} from '../performance/phase2/adaptive-policy-prototype.mjs';
test('policy design has dwell, consecutive hysteresis, bounded budgets and invalid-signal fallback',()=>{
 let time=0;const p=createPolicyPrototype({now:()=>time}),good={responseP95Ms:20,memoryPressure:.4},bad={responseP95Ms:90,memoryPressure:.85};
 for(let i=0;i<12;i++)assert.equal(p.observe(good).mode,'conservative');
 time=60000;assert.equal(p.observe(good).mode,'balanced');
 assert.equal(p.observe(bad).mode,'balanced');assert.equal(p.observe(bad).mode,'balanced');
 time=120000;let r=p.observe(bad);assert.equal(r.mode,'conservative');assert.equal(r.policy.workerConcurrency,1);
 for(let i=0;i<30;i++){time+=1000;r=p.observe(i%2?good:bad);assert.equal(r.mode,'conservative')}
 time=180000;for(let i=0;i<10;i++)r=p.observe(good);assert.equal(r.mode,'balanced');
 r=p.observe({responseP95Ms:NaN,memoryPressure:.2});assert.equal(r.mode,'conservative');
 assert.equal(r.policy.prefetch,0);assert.ok(Object.isFrozen(r.policy));p.reset();
 assert.equal(p.observe(good).mode,'conservative');
});
