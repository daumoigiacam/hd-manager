import test from'node:test';import assert from'node:assert/strict';
import{createModuleReadinessTrace}from'../src/services/moduleReadinessTrace.js';
test('shell commit cannot substitute for source readiness; slow samples and the original input timestamp are retained',()=>{
 let clock=100;const rows=[],trace=createModuleReadinessTrace({active:true,clock:()=>clock,origin:()=>10000,emit:v=>rows.push(v)});
 trace.start('orders','owner',95);clock=120;trace.observe({tab:'orders',scope:'owner',sourcesReady:false,pendingUi:false});assert.equal(rows.length,0);
 clock=5000;trace.start('orders','owner');trace.observe({tab:'orders',scope:'owner',sourcesReady:true,pendingUi:true});assert.equal(rows.length,0);
 clock=6380;trace.observe({tab:'orders',scope:'owner',sourcesReady:true,pendingUi:false});assert.equal(rows[0].readyMs,6285);assert.equal(rows[0].shellMs,25);assert.equal(Object.hasOwn(rows[0],'scope'),false);
});
test('an account change discards previous measurements; close does not report an abandoned transition as ready',()=>{
 const rows=[],trace=createModuleReadinessTrace({active:true,clock:()=>200,origin:()=>10000,emit:v=>rows.push(v)});
 trace.start('orders','a');trace.observe({tab:'orders',scope:'b',sourcesReady:true,pendingUi:false});assert.equal(rows.length,0);
 trace.start('products','b');trace.close();trace.observe({tab:'products',scope:'b',sourcesReady:true,pendingUi:false});assert.equal(rows.length,0);
});
