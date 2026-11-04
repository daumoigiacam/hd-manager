import test from 'node:test';import assert from 'node:assert/strict';
import {sendBoundedWorkerChunks} from '../performance/upgrade-20261103/rejected-pilots/boundedWorkerTransfer.js';
const turn=()=>new Promise(resolve=>setImmediate(resolve));
test('two packet window stays bounded and waits for every ACK in source order',async()=>{
 const held=[],seen=[];let produced=0,complete=false;
 function* chunks(){for(let i=0;i<107;i++){produced++;yield [i]}}
 const pending=sendBoundedWorkerChunks(chunks(),(rows,index)=>{seen.push({rows,index});return new Promise(resolve=>held.push(resolve))},{windowSize:2}).then(n=>{complete=true;return n});
 await turn();assert.equal(seen.length,2);assert.equal(produced,2);assert.equal(complete,false);
 for(let i=0;i<107;i++){assert.ok(seen.length-i<=2);held[i]();await turn();}
 assert.equal(await pending,107);assert.deepEqual(seen.map(x=>x.index),Array.from({length:107},(_,i)=>i));assert.deepEqual(seen.flatMap(x=>x.rows),Array.from({length:107},(_,i)=>i));
});
test('default remains stop-and-wait, no architecture activation without A/B approval',async()=>{
 let release,dispatched=0;const p=sendBoundedWorkerChunks([[1],[2]],()=>{dispatched++;return new Promise(resolve=>release=resolve)});
 await turn();assert.equal(dispatched,1);release();await turn();assert.equal(dispatched,2);release();assert.equal(await p,2);
});
test('second ACK arriving first cannot release completion or lose the last row',async()=>{
 const held=[];let finished=false;const p=sendBoundedWorkerChunks([[1],[2]],()=>new Promise(resolve=>held.push(resolve)),{windowSize:2}).then(n=>{finished=true;return n});await turn();held[1]();await turn();assert.equal(finished,false);held[0]();assert.equal(await p,2);
});
test('rejected ACK stops further chunks and handles another late failure',async()=>{
 const held=[];let sent=0;const failure=Error('synthetic ACK failure');const p=sendBoundedWorkerChunks([[1],[2],[3],[4]],()=>{sent++;return new Promise((resolve,reject)=>held.push({resolve,reject}))},{windowSize:2});await turn();held[1].reject(failure);held[0].resolve();await assert.rejects(p,error=>error===failure);assert.equal(sent,2);
});
test('closed generation cannot send another packet or return a ready count',async()=>{
 let active=true,release,sent=0;const p=sendBoundedWorkerChunks([[1],[2],[3]],()=>{sent++;return new Promise(resolve=>release=resolve)},{isActive:()=>active});await turn();active=false;release();await assert.rejects(p,{name:'AbortError'});assert.equal(sent,1);
});
test('invalid/unbounded windows are rejected before producing rows',async()=>{
 for(const windowSize of [0,3,Infinity,1.5])await assert.rejects(sendBoundedWorkerChunks([],()=>{}, {windowSize}),RangeError);
});
