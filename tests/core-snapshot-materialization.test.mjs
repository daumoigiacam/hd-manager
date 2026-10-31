import test from 'node:test';
import assert from 'node:assert/strict';
import {materializeSnapshotRecords,createSnapshotRecordMaterializer} from '../src/services/realtimeSnapshotItems.js';
import {retainCollectionRecordIdentityAsync} from '../src/utils/cooperativeCollectionIdentity.js';
import {appFunction} from './helpers/app-source-function.mjs';

const rows=n=>Array.from({length:n},(_,i)=>({id:'r'+i,data:{amount:i,nested:{quantity:i/10},nothing:undefined}}));
const turn=()=>new Promise(resolve=>setTimeout(resolve,0));

test('complete materialization preserves every field, parser/id semantics and weak identity while yielding to input',async()=>{
  const input=rows(200),before=structuredClone(input),materialize=createSnapshotRecordMaterializer();
  let clock=0,yields=0,handledInput=false;
  const parser=value=>({...value,amount:value.amount+3});
  const value=await materializeSnapshotRecords(input,(id,data)=>materialize(id,data,parser),{now:()=>clock++,yieldWork:async()=>{yields++;handledInput=true}});
  assert.ok(handledInput&&yields>2);assert.deepEqual(value,input.map(({id,data})=>({id,...parser(data)})));
  assert.deepEqual(input,before);
  const repeated=await materializeSnapshotRecords(input,(id,data)=>materialize(id,data,parser));
  repeated.forEach((row,i)=>assert.equal(row,value[i]));
  const changedParser=await materializeSnapshotRecords(input,(id,data)=>materialize(id,data,x=>x));
  assert.notEqual(changedParser[0],value[0]);assert.equal(changedParser[0].amount,0);
  const dictionary=await materializeSnapshotRecords([{id:'__proto__',data:{id:'stored-id',amount:-0}}],(id,data)=>({id,...data}),{isObject:true});
  assert.equal(Object.getPrototypeOf(dictionary),Object.prototype);assert.ok(Object.hasOwn(dictionary,'__proto__'));
  assert.equal(dictionary.__proto__.id,'stored-id');assert.ok(Object.is(dictionary.__proto__.amount,-0));
});

test('a superseded batch returns no partial result and the actual App rejects older generations',async()=>{
  let current=true,published=false;
  const input=rows(200),before=structuredClone(input);
  await assert.rejects(materializeSnapshotRecords(input,(id,data)=>({id,...data}),{isCurrent:()=>current,
    yieldWork:async()=>{current=false}}).then(()=>{published=true}),{name:'AbortError'});
  assert.equal(published,false);assert.deepEqual(input,before);
  const gates=[],commits=[],cache=new Map();
  const apply=appFunction('applyCollectionItems',{
    cancelled:false,readWorker:null,materializationRevisions:new Map(),snapshotRecordMaterializers:cache,createSnapshotRecordMaterializer,
    materializeSnapshotRecords:(items,fn,options)=>materializeSnapshotRecords(items,fn,{...options,yieldWork:()=>new Promise(resolve=>gates.push(resolve))}),
    clearConfirmedLocalMutations(){},filterRecentlyDeletedItems:(_name,data)=>data,
    setCollectionSafely:(_name,_setter,value)=>{commits.push(value);return true},
  });
  const first=apply('orders',()=>{},rows(3));assert.equal(commits.length,0);
  const next=rows(3);next[2].data.amount=900;
  const second=apply('orders',()=>{},next);assert.equal(gates.length,2);
  gates.shift()();assert.equal(await first,false);assert.equal(commits.length,0);
  gates.shift()();assert.equal(await second,true);assert.equal(commits.length,1);assert.equal(commits[0][2].amount,900);
});

test('every publication path prepares outside React and merges live edits/deletes without deep-scanning the actual previous array',async()=>{
  for(const workerMode of [false,true]){
    const committed=rows(100).map(({id,data})=>({id,...data}));let state=committed,expected,loaded=0,previousReads=0;
    const recent=new Map(),deleted=new Set(),queue=[];
    const merge=appFunction('mergePendingArrayItems',{expandPendingWrites:x=>x,pendingFirebaseWritesRef:{current:[]},pruneRecentLocalMutations(){},getRecentLocalDeleteIds:()=>deleted,recentLocalWritesRef:{current:recent}});
    const worker=workerMode?{isPublicationCurrent:()=>true,expectCommit:(_name,_version,result)=>expected=result,publicationScheduled(){}}:null;
    const publish=appFunction('setCollectionSafely',{readWorker:worker,cancelled:false,readWorkerCommittedStateRef:{current:{orders:committed}},
      hasCollectionValue:x=>Boolean(x?.length),getPreviousStableCollectionValue:()=>committed,rememberStableCollectionValue(){},
      mergePendingArrayItems:merge,retainCollectionRecordIdentityAsync,runNonBlockingStateUpdate:job=>queue.push(job),markCollectionLoaded(){loaded++}});
    const incoming=structuredClone(committed);incoming[3].amount=800;
    const done=publish('orders',updater=>{state=updater(state)},incoming,false,workerMode?{workerCommitVersion:1}:{});
    await done;assert.equal(queue.length,1);assert.equal(loaded,0);
    recent.set('orders:r0',{collectionName:'orders',documentId:'r0',payload:{amount:444}});deleted.add('r1');
    state=new Proxy(committed.slice(),{get(target,key,receiver){if(/^\d+$/.test(String(key)))previousReads++;return Reflect.get(target,key,receiver)}});
    queue.shift()();assert.equal(previousReads,0,'no full history comparison inside a React updater');
    assert.equal(state[0].amount,444);assert.equal(state.find(r=>r.id==='r3').amount,800);assert.equal(state.some(r=>r.id==='r1'),false);
    assert.equal(state[0].__recentLocalWrite,true);if(workerMode)assert.equal(expected,state);else assert.equal(loaded,1);
  }
});

test('object overlays are lazy and an obsolete queued commit neither publishes nor marks loaded',async()=>{
  const recent=new Map(),deleted=new Set();let expansions=0;
  const merge=appFunction('mergePendingArrayItems',{expandPendingWrites:x=>x,pendingFirebaseWritesRef:{current:[]},pruneRecentLocalMutations(){},getRecentLocalDeleteIds:()=>deleted,recentLocalWritesRef:{current:recent}});
  const makeRows=()=>{expansions++;return [{id:'a',amount:1}]};
  assert.equal(merge('attendance',makeRows),null);assert.equal(expansions,0);
  recent.set('attendance:a',{collectionName:'attendance',documentId:'a',payload:{amount:2}});
  assert.equal(merge('attendance',makeRows)[0].amount,2);assert.equal(expansions,1);
  const queued=[];let current=true,loaded=0,setters=0;
  const publish=appFunction('setCollectionSafely',{readWorker:null,cancelled:false,readWorkerCommittedStateRef:{current:{orders:[]}},
    retainCollectionRecordIdentityAsync,mergePendingArrayItems:(_name,value)=>value,hasCollectionValue:x=>x?.length>0,
    getPreviousStableCollectionValue:()=>[],rememberStableCollectionValue(){},runNonBlockingStateUpdate:job=>queued.push(job),markCollectionLoaded(){loaded++}});
  await publish('orders',()=>{setters++},[{id:'x'}],false,{isCurrent:()=>current});current=false;
  queued.shift()();await turn();assert.equal(setters,0);assert.equal(loaded,0);
});
