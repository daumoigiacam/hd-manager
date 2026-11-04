import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {parse} from 'acorn';
import {armAuthPipelineTiming} from '../scripts/helpers/auth-pipeline-timing.mjs';
import {armStartupSourceTiming} from '../scripts/helpers/startup-source-timing.mjs';
test('injected diagnostic functions parse unchanged as ES2019 for WebView74',()=>{
 for(const fn of [armAuthPipelineTiming,armStartupSourceTiming])assert.doesNotThrow(()=>parse(`(${fn.toString()})()`,{ecmaVersion:2019}));
});
test('auth timing does not retain secrets, response values, random bytes, or URL queries and restores globals',async()=>{
 let tick=0;const originalFetch=async()=>({status:200,json:async()=>({token:'private-fixture-response'})});const crypto={getRandomValues(value){value.fill(9);return value}},originalRandom=crypto.getRandomValues;
 const window={fetch:originalFetch,crypto};const context=vm.createContext({window,URL,performance:{now:()=>++tick}});vm.runInContext(`(${armAuthPipelineTiming.toString()})()`,context);
 const response=await window.fetch('http://127.0.0.1:5002/demo/identityLogin?private-secret-query',{body:'private-password'});assert.equal((await response.json()).token,'private-fixture-response');window.crypto.getRandomValues(new Uint8Array(16));
 const text=JSON.stringify(window.__upgradeAuthPipeline);assert.doesNotMatch(text,/private|password|token|query|127\.0\.0\.1/);assert.equal(window.__upgradeAuthPipeline.fetches.length,1);assert.equal(window.__upgradeAuthPipeline.random[0].bytes,16);
 window.__upgradeAuthPipelineRestore();assert.equal(window.fetch,originalFetch);assert.equal(window.crypto.getRandomValues,originalRandom);assert.equal(window.__upgradeAuthPipelineRestore,undefined);
});
test('source timing records bounded metadata and releases worker listeners, methods, and timer',()=>{
 class FakeWorker{constructor(){this.listeners=new Set()}addEventListener(_,fn){this.listeners.add(fn)}removeEventListener(_,fn){this.listeners.delete(fn)}postMessage(){}emit(data){this.listeners.forEach(fn=>fn({data}))}}
 let tick=0,cleared=false;const window={Worker:FakeWorker},context=vm.createContext({window,performance:{now:()=>++tick},setInterval:()=>42,clearInterval:id=>{assert.equal(id,42);cleared=true},document:{querySelector:()=>null}});
 vm.runInContext(`(${armStartupSourceTiming.toString()})()`,context);const worker=new window.Worker(),post=FakeWorker.prototype.postMessage;
 worker.postMessage({type:'subscribe',streamId:'1',collectionName:'orders',token:'private-fixture-token'});
 for(let i=0;i<300;i++)worker.emit({type:'begin',streamId:'1',count:107,rows:[{private:'fixture-data'}]});
 assert.equal(window.__upgradeStartupSources.rows.length,256);assert.ok(window.__upgradeStartupSources.dropped>0);assert.doesNotMatch(JSON.stringify(window.__upgradeStartupSources),/private|fixture-data|token/);
 window.__upgradeStartupSourcesRestore();assert.equal(window.Worker,FakeWorker);assert.equal(worker.postMessage,post);assert.equal(worker.listeners.size,0);assert.equal(cleared,true);
});
