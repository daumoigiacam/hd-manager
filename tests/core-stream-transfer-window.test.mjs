import test from 'node:test';import assert from 'node:assert/strict';
import {transferWithWindow} from '../src/services/streamTransferWindow.js';
test('bounded in-flight packets cannot complete before ACK and retain ordered rows',async()=>{
 const release=[],sent=[];let complete=false;
 const work=transferWithWindow([0,1,2,3,4,5],value=>{sent.push(value);return new Promise(resolve=>release.push(resolve))},{size:4}).then(()=>{complete=true});
 const turn=()=>new Promise(resolve=>setImmediate(resolve));await turn();assert.deepEqual(sent,[0,1,2,3]);assert.equal(complete,false);
 release[1]();release[2]();release[3]();await turn();assert.equal(sent.length,4,'FIFO window is bounded by oldest unresolved packet');release[0]();await turn();assert.deepEqual(sent,[0,1,2,3,4,5]);assert.equal(complete,false);release[4]();release[5]();await work;assert.equal(complete,true);
});
test('failed ACK and cancellation cannot publish a completed transfer',async()=>{
 await assert.rejects(transferWithWindow([1,2,3],value=>value===2?Promise.reject(Error('ACK failed')):Promise.resolve(),{size:2}),/ACK failed/);
 let current=true;await assert.rejects(transferWithWindow([1,2],async()=>{current=false},{size:1,isCurrent:()=>current}),{name:'AbortError'});
});
