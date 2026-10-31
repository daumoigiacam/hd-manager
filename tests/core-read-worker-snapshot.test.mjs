import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadWorkerSnapshotAssembler } from '../src/services/readWorkerSnapshotAssembler.js';

const metadata={fromCache:false,hasPendingWrites:false};
const start=(revision,mode,count,changeCount=count)=>({revision,mode,count,changeCount,metadata});
const row=(id,amount)=>({id,type:'full',value:{amount}});
const assembler=options=>createReadWorkerSnapshotAssembler({decode:value=>({...value}),retain:(a,b)=>a.amount===b.amount?a:b,...options});

test('worker rows publish atomically, keep unchanged identities and preserve a validated ordered delta', async()=>{
  const a=assembler();await a.begin(start(1,'full',2));
  await a.chunk({revision:1,index:0,rows:[row('a',1),row('b',2)]});
  const first=a.finish({revision:1,chunks:1});
  await a.begin(start(2,'full',2,0));await a.chunk({revision:2,index:0,rows:[row('a',1),row('b',2)]});
  const same=a.finish({revision:2,chunks:1});assert.equal(same.items,first.items);
  await a.begin(start(3,'delta',3,2));
  await a.chunk({revision:3,index:0,rows:[{id:'b',type:'modified',oldIndex:1,newIndex:0,value:{amount:20}},
    {id:'c',type:'added',oldIndex:-1,newIndex:2,value:{amount:3}}]});
  assert.deepEqual(first.items.map(r=>[r.id,r.data.amount]),[['a',1],['b',2]],'unpublished work never mutates earlier views');
  const next=a.finish({revision:3,chunks:1});assert.deepEqual(next.items.map(r=>[r.id,r.data.amount]),[['b',20],['a',1],['c',3]]);
  assert.equal(next.items[1],first.items[0]);
  await a.begin(start(4,'metadata',3,0));const ack=a.finish({revision:4,chunks:0});assert.equal(ack.items,next.items);
  assert.equal(ack.snapshot.dataChangeCount,0);
});

test('missing/duplicate chunks, IDs, revisions and incorrect delta indexes cannot publish a partial snapshot',async()=>{
  for(const action of ['incomplete','duplicate','wrong-chunk','bad-index','gap']){
    const a=assembler();await a.begin(start(1,'full',2));
    await a.chunk({revision:1,index:0,rows:[row('a',1),row('b',2)]});a.finish({revision:1,chunks:1});
    if(action==='gap'){await assert.rejects(a.begin(start(3,'delta',2,1)),/Invalid/);continue}
    await a.begin(start(2,action==='bad-index'?'delta':'full',2,2));
    if(action==='incomplete')assert.throws(()=>a.finish({revision:2,chunks:0}),/Invalid/);
    if(action==='duplicate')await assert.rejects(a.chunk({revision:2,index:0,rows:[row('a',1),row('a',2)]}),/Invalid/);
    if(action==='wrong-chunk')await assert.rejects(a.chunk({revision:2,index:1,rows:[row('a',1)]}),/Invalid/);
    if(action==='bad-index')await assert.rejects(a.chunk({revision:2,index:0,rows:[{id:'b',type:'modified',oldIndex:0,newIndex:0,value:{amount:9}}]}),/Invalid/);
  }
});

test('closing during cooperative work prevents a stale result and releases source state',async()=>{
  let a;let time=0,yields=0;
  a=assembler({now:()=>time++,budgetMs:1,yieldWork:async()=>{yields++;a.close()}});
  await a.begin(start(1,'full',2));
  await assert.rejects(a.chunk({revision:1,index:0,rows:[row('a',1),row('b',2)]}),{name:'AbortError'});
  assert.equal(yields,1);assert.throws(()=>a.finish({revision:1,chunks:1}),{name:'AbortError'});
});
