import test from 'node:test';import assert from 'node:assert/strict';
import {createBudgetedTransferChunks,estimateTransferWork,getWorkerTransferPolicy} from '../src/services/workerTransferBudget.js';

test('larger transfer profile is opt-in and preserves isolation for identity and inbox records',()=>{
 for(const collection of ['orders','payments','attendance']){
  assert.deepEqual(getWorkerTransferPolicy(collection),{maxRows:16,maxWork:16384});
  assert.deepEqual(getWorkerTransferPolicy(collection,{VITE_WORKER_TRANSFER_PROFILE:'unknown'}),{maxRows:16,maxWork:16384});
  assert.deepEqual(getWorkerTransferPolicy(collection,{VITE_WORKER_TRANSFER_PROFILE:'balanced-64k'}),{maxRows:64,maxWork:65536});
 }
 for(const collection of ['companies','employees','messages'])
  assert.deepEqual(getWorkerTransferPolicy(collection,{VITE_WORKER_TRANSFER_PROFILE:'balanced-64k'}),{maxRows:1,maxWork:16384});
 const rows=Array.from({length:5572},(_,id)=>({id,text:'x'.repeat(2700)}));
 const chunks=[...createBudgetedTransferChunks(rows,row=>row,getWorkerTransferPolicy('orders',{VITE_WORKER_TRANSFER_PROFILE:'balanced-64k'}))];
 assert.deepEqual(chunks.flat(),rows);
 assert(chunks.length<[...createBudgetedTransferChunks(rows,row=>row)].length/3);
 assert(chunks.every(chunk=>chunk.length<=64&&chunk.reduce((sum,row)=>sum+estimateTransferWork(row,65536),0)<=65536));
 const large=[{text:'x'.repeat(100000)},{text:'y'.repeat(100000)}];
 assert.deepEqual([...createBudgetedTransferChunks(large,row=>row,{maxRows:64,maxWork:65536})].map(chunk=>chunk.length),[1,1]);
});

test('small native rows coalesce; ordered values and identities survive all budget boundaries',()=>{
 const rows=Array.from({length:5572},(_,id)=>Object.freeze({id,data:{amount:id-10,name:'Vịt 🦆'}}));
 const chunks=[...createBudgetedTransferChunks(rows,row=>row)];
 assert.equal(chunks.length,349);assert.deepEqual(chunks.flat(),rows);
 chunks.flat().forEach((row,index)=>assert.equal(row,rows[index]));
 assert(chunks.every(chunk=>chunk.length<=16&&chunk.reduce((n,row)=>n+estimateTransferWork(row),0)<=16384));
 assert.equal([...createBudgetedTransferChunks([],row=>row)].length,0);
});

test('large text/containers stay isolated and unsupported budget configuration fails closed',()=>{
 const rows=[{text:'a'.repeat(15000)},{text:'b'.repeat(15000)},{text:'c'.repeat(80000)},{tiny:true}];
 const chunks=[...createBudgetedTransferChunks(rows,row=>row)];assert.deepEqual(chunks.map(chunk=>chunk.length),[1,1,1,1]);
 assert.deepEqual(chunks.flat(),rows);assert.equal(estimateTransferWork({nested:Array.from({length:10000},()=>({x:'y'}))}),16384);
 for(const config of [{maxRows:0},{maxRows:65},{maxWork:0},{maxWork:Infinity}])assert.throws(()=>[...createBudgetedTransferChunks(rows,row=>row,config)],TypeError);
 const iterator=createBudgetedTransferChunks([1,2,3],row=>{if(row===3)throw new TypeError('unsupported');return row},{maxRows:1});
 assert.deepEqual(iterator.next().value,[1]);assert.throws(()=>iterator.next(),TypeError,'unsupported value cannot become partial success');
});
