import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdaptivePerformanceController,installAdaptivePerformance,getAdaptivePerformancePolicy,subscribeAdaptivePerformance} from '../src/services/adaptivePerformance.js';
import {createRequestAdmission} from '../src/data/requestAdmission.js';
import {createInstantDataEngine} from '../src/data/instantDataEngine.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
test('adaptive controller has dwell, consecutive hysteresis, immutable bounds and invalid-clock fallback',()=>{
 let time=0;const p=createAdaptivePerformanceController({now:()=>time}),good={responseP95Ms:20,memoryPressure:.4},bad={responseP95Ms:90,memoryPressure:.85};
 for(let i=0;i<20;i++)assert.equal(p.observe(good).mode,'conservative');time=60000;
 assert.equal(p.observe(good).mode,'balanced');assert.equal(p.observe(bad).mode,'balanced');assert.equal(p.observe(bad).mode,'balanced');time=120000;
 const low=p.observe(bad);assert.equal(low.mode,'conservative');assert.equal(low.readConcurrency,1);assert.equal(low.prefetch,0);assert.ok(Object.isFrozen(low));
 time=180000;for(let i=0;i<10;i++)p.observe(good);assert.equal(p.getPolicy().mode,'balanced');
 assert.equal(p.observe({responseP95Ms:NaN}).mode,'conservative');time=1;assert.equal(p.observe(good).mode,'conservative');
 assert.throws(()=>createAdaptivePerformanceController({dwellMs:100}),RangeError);
});
test('runtime observer owns bounded samples and releases frames/listeners/observer on stop',()=>{
 let time=0,seq=0,disconnected=false;const listeners=new Map(),frames=new Map();
 const doc={hidden:false,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 const win={document:doc,performance:{now:()=>time},requestAnimationFrame:fn=>{frames.set(++seq,fn);return seq},cancelAnimationFrame:id=>frames.delete(id),PerformanceObserver:class{observe(){}disconnect(){disconnected=true}}};
 const stop=installAdaptivePerformance({windowScope:win});assert.equal(getAdaptivePerformancePolicy().mode,'conservative');
 let notifications=0;const unsubscribe=subscribeAdaptivePerformance(()=>notifications++);
 for(let i=0;i<12;i++){time+=6000;listeners.get('pointerdown')({isTrusted:true});for(let f=0;f<2;f++){time+=5;const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn())}}
 assert.equal(getAdaptivePerformancePolicy().mode,'balanced');assert.equal(notifications,1);
 listeners.get('pointerdown')({isTrusted:true});assert.ok(frames.size);doc.hidden=true;listeners.get('visibilitychange')();assert.equal(frames.size,0);assert.equal(getAdaptivePerformancePolicy().mode,'conservative');
 unsubscribe();stop();stop();assert.equal(listeners.size,0);assert.equal(disconnected,true);assert.equal(getAdaptivePerformancePolicy().mode,'disabled');
});
test('lowering request concurrency keeps real in-flight slots until they settle, without dropping queued work',async()=>{
 const admission=createRequestAdmission({maxConcurrent:2}),waits=[deferred(),deferred(),deferred()];let started=0;
 const run=i=>admission.run(()=>{started++;return waits[i].promise});const tasks=[run(0),run(1),run(2)];await tick();assert.equal(started,2);
 admission.setConcurrency(1);waits[0].resolve('a');await tick();assert.equal(started,2);
 waits[1].resolve('b');await tick();assert.equal(started,3);waits[2].resolve('c');assert.deepEqual(await Promise.all(tasks),['a','b','c']);
 assert.throws(()=>admission.setConcurrency(3),RangeError);admission.close();
});
test('cache budget evicts only readonly cache entries and does not truncate active snapshots or bypass scope',async()=>{
 const scope={principalId:'fixture-user',tenantId:'fixture-company',permissionRevision:'v1'};let current=true,reads=0;
 const engine=createInstantDataEngine({scope,isCurrent:()=>current,maxConcurrent:2,maxCachePages:3,transport:{readPage:async({query})=>{reads++;return{items:[{id:query.collection,companyId:scope.tenantId,amount:10}],hasMore:false,nextCursor:null,coverage:'all-query-matches',source:'server'}}}});
 try{
  const first=engine.openQuery({collection:'orders'}),second=engine.openQuery({collection:'products'});await first.load();await second.load();assert.equal(engine.getDiagnostics().cachedPages,2);
  engine.setResourceBudget({readConcurrency:1,cachePages:1});assert.equal(engine.getDiagnostics().cachedPages,1);assert.equal(first.getSnapshot().items[0].amount,10);assert.equal(second.getSnapshot().items.length,1);assert.equal(reads,2);
  assert.throws(()=>engine.setResourceBudget({readConcurrency:3,cachePages:1}),RangeError);
  current=false;assert.throws(()=>engine.setResourceBudget({readConcurrency:1,cachePages:1}),{name:'AbortError'});
 }finally{engine.close()}
});
