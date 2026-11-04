import test from'node:test';import assert from'node:assert/strict';import vm from'node:vm';import fs from'node:fs';import{instrumentSearchPhases}from'../performance/upgrade-20261103/search-phase-transform.mjs';
test('diagnostic wrapper preserves references, thrown error, cancellation and cooperative yields; records no values',async()=>{
 const code=`const entries=[1,2];const searchAsync=async(query='',{signal,yieldTask=async()=>{}}={})=>{const scheduler={yieldTask};try{await scheduler.yieldTask();if(signal&&signal.aborted)throw new Error('cancelled');return entries}finally{}};const createSearchRecordIndexAsync=async(records,getFields,{signal,yieldTask=async()=>{}}={})=>{await yieldTask();getFields(records[0]);return records};globalThis.api={searchAsync,createSearchRecordIndexAsync};`;
 const result=instrumentSearchPhases(code,'/repo/src/services/searchEngine.js'),scope={window:{__hdVerification:{}},performance:{now:()=>performance.now()},Error};vm.runInNewContext(result.code,scope);
 const rows=[{private:'do not log'}];let calls=0;assert.equal(await scope.api.createSearchRecordIndexAsync(rows,()=>{},{yieldTask:async()=>{calls++}}),rows);assert.equal(calls,1);
 const error=Error('original');await assert.rejects(scope.api.createSearchRecordIndexAsync(rows,()=>{throw error}),e=>e===error);await assert.rejects(scope.api.searchAsync('secret query',{signal:{aborted:true}}),/cancelled/);
 let receiverPreserved=false;const custom=function(){receiverPreserved=this.yieldTask===custom};await scope.api.searchAsync('secret query',{yieldTask:custom});assert.equal(receiverPreserved,true);
 for(let i=0;i<310;i++)await scope.api.searchAsync('secret query');const log=scope.window.__hdVerification.searchPhases;assert.equal(log.length,300);assert.ok(log.every(e=>e.phase==='query.rank'&&e.yields===1));assert.ok(!JSON.stringify(log).includes('secret'));assert.ok(!JSON.stringify(log).includes('private'));
});
test('only actual source-owned engine/hook functions are instrumented; changed contracts fail closed',()=>{
 for(const name of['src/services/searchEngine.js','src/hooks/usePreparedSearch.js'])assert.ok(instrumentSearchPhases(fs.readFileSync(name,'utf8'),'/repo/'+name).code.includes('__hdSearchPhaseRecord'));
 assert.equal(instrumentSearchPhases('const x=1','/unrelated.js'),null);assert.throws(()=>instrumentSearchPhases('const x=1','/repo/src/services/searchEngine.js'),/boundary count/);
});
