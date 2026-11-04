import test from'node:test';import assert from'node:assert/strict';
import{createPendingWriteScheduler}from'../src/services/pendingWriteScheduler.js';
import{pendingWriteFailure,canAutomaticallyRetryWrite}from'../src/utils/pendingWriteRetry.js';
function clock(){let id=0,time=0;const jobs=new Map();return{jobs,now:()=>time,schedule:(fn,delay)=>{jobs.set(++id,{fn,at:time+delay});return id},cancel:id=>jobs.delete(id),async advance(ms){time+=ms;for(const[key,job]of[...jobs])if(job.at<=time){jobs.delete(key);await job.fn()}}}}
test('retry wakes at its deadline instead of the former 30-second poll, with one timer and finite actor-safe attempts',async()=>{
 const c=clock();let write={actorUid:'fixture'},calls=0;const errors=[];
 const scheduler=createPendingWriteScheduler({schedule:c.schedule,cancel:c.cancel,nextDelay:()=>write?Math.max(0,(write.nextRetryAt||0)-c.now()):null,flush:async()=>{
  if(write&&canAutomaticallyRetryWrite(write,'fixture',c.now())){calls++;if(calls===1)write={...write,...pendingWriteFailure(write,{code:'unavailable'},c.now(),()=>.5)};else write=null}
 },onError:e=>errors.push(e)});
 scheduler.wake();scheduler.wake();assert.equal(c.jobs.size,1);await c.advance(0);assert.equal(calls,1);assert.equal(write.nextRetryAt,1500);
 await c.advance(1499);assert.equal(calls,1);await c.advance(1);assert.equal(calls,2);assert.equal(c.jobs.size,0);scheduler.close();assert.equal(errors.length,0);
 for(const random of[0,.5,1,NaN]){const first=pendingWriteFailure({}, {code:'aborted'},1000,()=>random);assert.ok(first.nextRetryAt>=1750&&first.nextRetryAt<=3250)}
 assert.equal(canAutomaticallyRetryWrite({...pendingWriteFailure({attempts:5},{code:'unavailable'}),actorUid:'fixture'},'fixture',Infinity),false);
 assert.equal(canAutomaticallyRetryWrite({actorUid:'other'},'fixture',Infinity),false);assert.equal(pendingWriteFailure({}, {code:'permission-denied'}).syncState,'blocked');
});
test('online wakes do not overlap physical writes; close/unmount cannot leave a timer or start another write',async()=>{
 const c=clock();let finish,calls=0;const physical=new Promise(r=>finish=r);
 const scheduler=createPendingWriteScheduler({schedule:c.schedule,cancel:c.cancel,nextDelay:()=>1000,flush:async()=>{calls++;await physical}});
 scheduler.wake();const running=c.advance(0);await Promise.resolve();scheduler.wake();scheduler.wake();assert.equal(calls,1);assert.equal(c.jobs.size,0);
 scheduler.close();finish();await running;assert.equal(c.jobs.size,0);scheduler.wake();await c.advance(10000);assert.equal(calls,1);
});
