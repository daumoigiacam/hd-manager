import test from 'node:test';
import assert from 'node:assert/strict';
import {createRealtimeSnapshotItemsCollector,createRealtimeSnapshotPipeline,createSnapshotRecordMaterializer} from '../src/services/realtimeSnapshotItems.js';
const source={};
const rows=n=>Array.from({length:n},(_,i)=>({id:`doc-${i}`,data:{companyId:'tenant-a',amount:i,nested:{value:i},text:'Vịt 🦆'}}));
function fixture(records,changes=[]){
  let reads=0;
  return {get reads(){return reads},snapshot:{query:source,metadata:{fromCache:false,hasPendingWrites:false},
    docs:records.map(row=>({id:row.id,data(){reads++;return {...row.data}}})),docChanges:()=>changes}};
}
const changed=(id,index)=>({type:'modified',oldIndex:index,newIndex:index,doc:{id,data:()=>{}}});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};

test('complete async mapping equals full data, yields by operation budget, then decodes one change and zero ACK records',async()=>{
  const records=rows(2049),first=fixture(records),collect=createRealtimeSnapshotItemsCollector();
  let lastReads=0,yields=0,clock=0;
  const options={batchSize:32,budgetMs:4,now:()=>clock++,yieldWork:async()=>{
    assert.ok(first.reads-lastReads<=32);lastReads=first.reads;yields++;
  }};
  const initial=await collect.collectAsync(first.snapshot,source,options);
  assert.deepEqual(initial,records);assert.equal(first.reads,2049);assert.ok(yields>0);
  const updated=records.slice();updated[1000]={...updated[1000],data:{...updated[1000].data,amount:9000}};
  const next=fixture(updated,[changed('doc-1000',1000)]);
  const current=await collect.collectAsync(next.snapshot,source,{yieldWork:async()=>{}});
  assert.deepEqual(current,updated);assert.equal(next.reads,1);assert.equal(initial[1000].data.amount,1000);
  assert.equal(current[0].data,initial[0].data);
  const ack=fixture(updated);
  assert.deepEqual(await collect.collectAsync(ack.snapshot,source,{yieldWork:async()=>{}}),updated);
  assert.equal(ack.reads,0);
});

test('async mapping aborts without committing partial tenant state and resets its next delta baseline',async()=>{
  const collect=createRealtimeSnapshotItemsCollector(),data=rows(200),before=fixture(data);
  collect(before.snapshot,source);
  let current=true;
  await assert.rejects(collect.collectAsync(fixture(data).snapshot,source,{batchSize:5,isCurrent:()=>current,
    yieldWork:async()=>{current=false}}),{name:'AbortError'});
  const next=fixture(data.map(r=>({...r,data:{...r.data,companyId:'tenant-b'}})));
  const actual=await collect.collectAsync(next.snapshot,{}, {yieldWork:async()=>{}});
  assert.equal(next.reads,200);assert.ok(actual.every(r=>r.data.companyId==='tenant-b'));
});

test('one active and one latest pending snapshot; dropping data-only events forces full normalization',async()=>{
  const gate=deferred(),done=deferred(),published=[],collect=createRealtimeSnapshotItemsCollector();
  let first=true;
  const pipeline=createRealtimeSnapshotPipeline({collect,yieldWork:async()=>{if(first){first=false;await gate.promise}},
    publish:(_snapshot,items)=>{published.push(items);if(published.length===2)done.resolve()},onError:error=>{throw error}});
  const a=rows(2),b=a.map(r=>({...r,data:{...r.data,amount:50}}));
  const initial=fixture(a),middle=fixture(b,[changed('doc-0',0),changed('doc-1',1)]),latest=fixture(b);
  pipeline.enqueue(initial.snapshot,source);
  pipeline.enqueue(middle.snapshot,source);assert.equal(pipeline.pendingCount,1);
  pipeline.enqueue(latest.snapshot,source);assert.equal(pipeline.pendingCount,1);
  gate.resolve();await done.promise;
  assert.deepEqual(published,[a,b]);assert.equal(middle.reads,0);assert.equal(latest.reads,2);
  pipeline.dispose();
});

test('unsubscribe discards active and pending mappings before publication',async()=>{
  const gate=deferred(),entered=deferred(),published=[];
  const collect=createRealtimeSnapshotItemsCollector();
  let yields=0;
  const pipeline=createRealtimeSnapshotPipeline({collect,batchSize:3,yieldWork:async()=>{
    if(++yields===2){entered.resolve();await gate.promise}
  },publish:(_snapshot,items)=>published.push(items)});
  pipeline.enqueue(fixture(rows(100)).snapshot,source);await entered.promise;
  pipeline.enqueue(fixture(rows(100)).snapshot,source);pipeline.dispose();gate.resolve();
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(pipeline.pendingCount,0);assert.deepEqual(published,[]);
});

test('mapping errors are reported and reset delta reuse before a later complete publication',async()=>{
  const errors=[],published=[],done=deferred();let reads=0;
  const collect=createRealtimeSnapshotItemsCollector(data=>{if(data.bad)throw Error('fixture-invalid');return data});
  const pipeline=createRealtimeSnapshotPipeline({collect,yieldWork:async()=>{},onError:e=>errors.push(e.message),
    publish:(_snapshot,items)=>{published.push(items);done.resolve()}});
  pipeline.enqueue(fixture([{id:'x',data:{bad:true}}]).snapshot,source);
  await new Promise(resolve=>setTimeout(resolve,0));
  pipeline.enqueue({docs:[{id:'x',data(){reads++;return {amount:7}}}],docChanges:()=>[]},source);
  await done.promise;assert.deepEqual(errors,['fixture-invalid']);assert.equal(reads,1);
  assert.deepEqual(published,[[{id:'x',data:{amount:7}}]]);pipeline.dispose();
});

test('materialized record identities survive unchanged normalized data but invalidate on data/id/parser/tenant changes',()=>{
  const materialize=createSnapshotRecordMaterializer(),otherTenant=createSnapshotRecordMaterializer();
  const data=Object.freeze({amount:10,checkIn:'2026-10-31T01:00:00Z'});
  let parsed=0;const parser=d=>{parsed++;return {...d,checkIn:new Date(d.checkIn)}};
  const one=materialize('a',data,parser);
  assert.equal(materialize('a',data,parser),one);assert.equal(parsed,1);
  assert.notEqual(materialize('b',data,parser),one);
  assert.notEqual(materialize('a',{...data,amount:20},parser),one);
  assert.notEqual(materialize('a',data,d=>d),one);
  assert.notEqual(otherTenant('a',data,parser),one);
  assert.equal(one.amount,10);assert.equal(data.checkIn,'2026-10-31T01:00:00Z');
});
