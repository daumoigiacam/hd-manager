import test from'node:test';import assert from'node:assert/strict';import{readWorkerHeaps}from'../performance/phase2-verification/worker-heap.mjs';
test('legacy worker discovery reads real Runtime heap without pausing and always removes its auto-attach session',async()=>{
 const handlers=new Set(),calls=[];let enabled=false;
 const cdp={onEvent:fn=>{handlers.add(fn);return()=>handlers.delete(fn)},async send(method,params){calls.push({method,params});
  if(method==='Target.getTargets')return{targetInfos:[]};
  if(method==='Target.setAutoAttach'){enabled=params.autoAttach;assert.equal(params.waitForDebuggerOnStart,false);
   if(enabled)for(const fn of handlers)fn({method:'Target.attachedToTarget',params:{sessionId:'s',targetInfo:{targetId:'t',type:'worker',url:'https://localhost/assets/worker.js'}}});return{}}
  if(method==='Target.sendMessageToTarget'){for(const fn of handlers)fn({method:'Target.receivedMessageFromTarget',params:{sessionId:'s',message:JSON.stringify({id:9001,result:{usedSize:123,totalSize:456}})}});return{}}
 }};
 const value=await readWorkerHeaps(cdp);assert.equal(value.targets[0].usedSize,123);assert.equal(enabled,false);assert.equal(handlers.size,0);assert.equal(calls.filter(c=>c.method==='Target.setAutoAttach').length,2);
});
