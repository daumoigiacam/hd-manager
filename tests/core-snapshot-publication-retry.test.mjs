import test from 'node:test';
import assert from 'node:assert/strict';
import {appFunction} from './helpers/app-source-function.mjs';

function fixture(outcomes,sources=1){
  const calls=[],confirmed=[],received=new Map(),committed=new Map();let generation=0;
  const apply=appFunction('applySnapshot',{
    cancelled:false,isReadAccessCurrent:()=>true,customerSession:false,listenerActive:true,colName:'orders',collectionRefs:Array.from({length:sources},()=>({})),snapshotItemCollectors:[()=>{throw Error('Use complete supplied items')}],
    decodeWarehouseDispatchItems:()=>{},lastRealtimeSnapshotAtRef:{current:new Map()},lastRealtimeServerSnapshotAtRef:{current:new Map()},
    isServerConfirmedRealtimeSnapshot:()=>true,collectionReadRevisions:new Map(),collectionReadControllers:new Map(),
    workerEligible:true,markCollectionServerConfirmed:name=>confirmed.push(name),shouldApplyRealtimeSnapshot:()=>true,
    sourceItemsByIndex:received,committedSourceItemsByIndex:committed,serverConfirmedSourceIndexes:new Set(),
    getRealtimeDataChangeCount:snapshot=>snapshot.changes,hasAppliedDataSnapshot:false,
    recentLocalWritesRef:{current:new Map()},recentLocalDeletesRef:{current:new Map()},
    readWorker:{beginPublication:()=>++generation,publicationScheduled(){}},
    applyCollectionItems:async(_name,_setter,items)=>{calls.push(items);return await outcomes.shift()();},
    setFn:()=>{},isObject:false,parser:null,updateRealtimeStatusLightly:()=>{},markCollectionLoaded:()=>{},
  });
  const send=(items,changes,index=0)=>apply({metadata:{fromCache:false,hasPendingWrites:false},changes},index,items);
  return {send,calls,confirmed,committed};
}
const rows=value=>[{id:'same',data:{amount:value}}];

test('cancelled initial publication must be retried by unchanged server metadata instead of leaving worker readiness pending forever',async()=>{
  const f=fixture([()=>false,()=>true]);const first=rows(1);
  await f.send(first,null);assert.equal(f.calls.length,1);
  await f.send(first,0);assert.equal(f.calls.length,2,'not applied is not an unchanged committed snapshot');
  assert.deepEqual(f.calls[1],first);assert.deepEqual(f.confirmed,[],'server receipt alone cannot fake a React commit');
});

test('cancelled replacement must compare metadata with the last successful union, not the last received union',async()=>{
  const f=fixture([()=>true,()=>false,()=>true]);const old=rows(1),next=rows(2);
  await f.send(old,null);await f.send(next,1);await f.send(next,0);
  assert.equal(f.calls.length,3);assert.equal(f.calls[2][0].data.amount,2);
});

test('a late cancelled attempt cannot replace the successful newer source baseline',async()=>{
  let release;const pending=new Promise(resolve=>{release=resolve});
  const f=fixture([()=>pending,()=>true]);const old=rows(1),next=rows(2);
  const earlier=f.send(old,null);await f.send(next,1);release(false);await earlier;
  await f.send(next,0);assert.equal(f.calls.length,2,'confirmed latest metadata must remain deduplicated');
});

test('metadata on either query retries an unpublished secondary source without dropping the complete union',async()=>{
  const f=fixture([()=>true,()=>false,()=>true],2),a=rows(1),b=[{id:'other',data:{amount:2}}];
  await f.send(a,null,0);await f.send(b,null,1);await f.send(a,0,0);
  assert.deepEqual(f.calls[2],[...a,...b]);
  await f.send(b,0,1);assert.equal(f.calls.length,3);
});

test('even a late successful callback cannot install an older comparison baseline after the source advanced',async()=>{
  let release;const pending=new Promise(resolve=>{release=resolve});
  const f=fixture([()=>pending,()=>true]),old=rows(1),next=rows(2);
  const earlier=f.send(old,null);await f.send(next,1);release(true);await earlier;
  await f.send(next,0);assert.equal(f.calls.length,2);assert.deepEqual(f.committed.get(0),next);
});
