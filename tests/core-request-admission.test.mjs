import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequestAdmission} from '../src/data/requestAdmission.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};

test('one shared admission bounds parallel reads and starts waiting pages in FIFO order',async()=>{
 const q=createRequestAdmission({maxConcurrent:2,maxQueued:8}),started=[],waits=Array.from({length:5},deferred);
 const requests=waits.map((wait,index)=>q.run(()=>{started.push(index);return wait.promise}));
 await tick();assert.deepEqual(started,[0,1]);
 assert.deepEqual(q.getDiagnostics(),{activeRequests:2,queuedRequests:3,closed:false});
 waits[1].resolve(1);await requests[1];await tick();assert.deepEqual(started,[0,1,2]);
 waits[0].reject(new Error('transport failure'));await assert.rejects(requests[0],/transport failure/);await tick();
 assert.deepEqual(started,[0,1,2,3]);
 waits[2].resolve(2);await requests[2];await tick();assert.deepEqual(started,[0,1,2,3,4]);
 waits[3].resolve(3);waits[4].resolve(4);await Promise.all(requests.slice(2));await tick();
 assert.equal(q.getDiagnostics().activeRequests,0);q.close();
});

test('queued abort rejects immediately and frees capacity without starting a transport',async()=>{
 const q=createRequestAdmission({maxConcurrent:1,maxQueued:1}),wait=deferred(),controller=new AbortController();let started=false;
 const active=q.run(()=>wait.promise);await tick();
 const cancelled=q.run(()=>{started=true},controller.signal),rejected=assert.rejects(cancelled,{name:'AbortError'});
 await assert.rejects(q.run(()=>{}),{code:'queue-capacity'});controller.abort();await rejected;
 assert.equal(q.getDiagnostics().queuedRequests,0);
 const next=q.run(()=>42);wait.resolve();await active;assert.equal(await next,42);assert.equal(started,false);q.close();
});

test('an aborted uncancellable active RPC keeps its physical slot until it settles',async()=>{
 const q=createRequestAdmission({maxConcurrent:1}),wait=deferred(),controller=new AbortController();let nextStarted=false;
 const first=q.run(()=>wait.promise,controller.signal);await tick();controller.abort();
 const second=q.run(()=>{nextStarted=true;return 'next'});await tick();
 assert.equal(q.getDiagnostics().activeRequests,1);assert.equal(nextStarted,false);
 wait.resolve('old');await first;assert.equal(await second,'next');q.close();
});

test('scope expiry and disposal reject queued work without executing it; in-flight cleanup remains accounted',async()=>{
 let current=true;const q=createRequestAdmission({maxConcurrent:1,assertCurrent:()=>{if(!current)throw Object.assign(new Error('scope'),{name:'AbortError'})}});
 const wait=deferred(),active=q.run(()=>wait.promise);await tick();let started=0;
 const pending=q.run(()=>started++),rejected=assert.rejects(pending,{name:'AbortError'});
 current=false;wait.resolve();await active;await rejected;assert.equal(started,0);
 current=true;const wait2=deferred(),running=q.run(()=>wait2.promise);await tick();
 const removed=q.run(()=>started++),closed=assert.rejects(removed,{name:'AbortError'});q.close();await closed;
 assert.deepEqual(q.getDiagnostics(),{activeRequests:1,queuedRequests:0,closed:true});
 await assert.rejects(q.run(()=>started++),{name:'AbortError'});wait2.resolve();await running;await tick();assert.equal(started,0);
});

test('queue time is measured separately; synchronous throw and pre-start cancellation release the slot',async()=>{
 let clock=10;const q=createRequestAdmission({maxConcurrent:1,now:()=>clock}),wait=deferred();
 const first=q.run(()=>wait.promise);await tick();const second=q.run(queueMs=>queueMs);clock=43;
 wait.resolve();await first;assert.equal(await second,33);
 await assert.rejects(q.run(()=>{throw Error('synchronous')}),/synchronous/);await tick();
 const a=new AbortController(),cancelled=q.run(()=>{throw Error('must not start')},a.signal),rejected=assert.rejects(cancelled,{name:'AbortError'});
 a.abort();await rejected;await tick();assert.equal(q.getDiagnostics().activeRequests,0);q.close();
});
