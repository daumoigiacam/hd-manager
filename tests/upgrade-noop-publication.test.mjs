import test from 'node:test';
import assert from 'node:assert/strict';
import {appFunction} from './helpers/app-source-function.mjs';
import {retainCollectionRecordIdentityAsync} from '../src/utils/cooperativeCollectionIdentity.js';
import {createCollectionCommitWitness} from '../src/services/collectionCommitWitness.js';
import {createSourcePhaseDiagnostics} from '../src/services/sourcePhaseDiagnostics.js';

function fixture(initial){
 let state=initial,version=1,dispatches=0;const queue=[],recent=new Map(),deleted=new Set(),expected=[];
 const committed={current:{orders:initial}},pending={current:[]},confirmed=[];
 const witness=createCollectionCommitWitness({getCommittedStates:()=>committed.current,onCommitted:name=>confirmed.push(name)});
 const merge=appFunction('mergePendingArrayItems',{expandPendingWrites:writes=>writes,pendingFirebaseWritesRef:pending,pruneRecentLocalMutations(){},getRecentLocalDeleteIds:()=>deleted,recentLocalWritesRef:{current:recent}});
 const worker={isPublicationCurrent:(_name,v)=>v===version,expectCommit:(_name,v,value)=>{expected.push({v,value});witness.expectCommit('orders',v,value)},publicationScheduled:()=>witness.publicationScheduled()};
 const apply=appFunction('setCollectionSafely',{readWorker:worker,cancelled:false,readWorkerCommittedStateRef:committed,mergePendingArrayItems:merge,retainCollectionRecordIdentityAsync,
  runNonBlockingStateUpdate:fn=>queue.push(fn),hasCollectionValue:(v,object)=>object?Object.keys(v||{}).length>0:v?.length>0,getPreviousStableCollectionValue:()=>committed.current.orders,rememberStableCollectionValue(){},markCollectionLoaded(){throw Error('Source receipt cannot bypass commit witness')}});
 return{recent,pending,deleted,expected,confirmed,committed,queue,get state(){return state},get dispatches(){return dispatches},
  publish:async(value,object=false)=>{version=witness.begin('orders');return apply('orders',updater=>{dispatches++;state=updater(state)},value,object,{workerCommitVersion:version})},
  flush:()=>{while(queue.length)queue.shift()()},close:()=>witness.close()};
}
test('1000 unchanged SDK publications allocate zero React updater actions and confirm the actual committed identity',async()=>{
 const rows=[{id:'one',amount:12}],f=fixture(rows);
 try{for(let i=0;i<1000;i++)await f.publish(structuredClone(rows));assert.equal(f.queue.length,0);assert.equal(f.dispatches,0);assert.equal(f.confirmed.length,1000);assert.equal(f.state,rows);assert.ok(f.expected.every(e=>e.value===rows))}finally{f.close()}
});
test('a newer unchanged snapshot cancels an older queued source replacement without publishing stale data',async()=>{
 const rows=[{id:'one',amount:12}],f=fixture(rows);
 try{await f.publish([{id:'one',amount:20}]);assert.equal(f.queue.length,1);assert.equal(f.confirmed.length,0);await f.publish(structuredClone(rows));assert.equal(f.confirmed.length,1);f.flush();assert.equal(f.state,rows)}finally{f.close()}
});
test('an unchanged server snapshot cannot bypass a new local edit or deletion',async()=>{
 for(const mutation of['edit','delete','pending']){const rows=[{id:'one',amount:12}],f=fixture(rows);
  try{if(mutation==='edit')f.recent.set('orders:one',{collectionName:'orders',documentId:'one',payload:{amount:99}});
   if(mutation==='delete')f.deleted.add('one');if(mutation==='pending')f.pending.current.push({collectionName:'orders',documentId:'one',payload:{amount:88}});
   await f.publish(structuredClone(rows));assert.equal(f.queue.length,1);assert.equal(f.confirmed.length,0);f.flush();assert.equal(f.dispatches,1);
   if(mutation==='delete')assert.equal(f.state.length,0);else assert.equal(f.state[0].amount,mutation==='edit'?99:88);
   assert.equal(rows[0].amount,12);
  }finally{f.close()}
 }
});
test('object-shaped attendance uses the same exact-identity check and still materializes a pending edit',async()=>{
 const initial={one:{amount:12}},f=fixture(initial);
 try{await f.publish(structuredClone(initial),true);assert.equal(f.dispatches,0);assert.equal(f.confirmed.length,1);
  f.recent.set('orders:one',{collectionName:'orders',documentId:'one',payload:{amount:99}});await f.publish(structuredClone(initial),true);assert.equal(f.queue.length,1);f.flush();assert.equal(f.state.one.amount,99);assert.equal(initial.one.amount,12);
 }finally{f.close()}
});
test('unchanged publication diagnostics remain valid when timing is explicitly enabled',()=>{
 const events=[];const diagnostics=createSourcePhaseDiagnostics({enabled:()=>true,record:(...event)=>events.push(event)});
 diagnostics.mark('orders','state-unchanged');assert.equal(events.length,1);assert.deepEqual(events[0][1],{collection:'orders',phase:'state-unchanged'});
});
test('already committed readiness flags do not enqueue repeated state actions; another actor/tenant still schedules readiness',()=>{
 for(const scope of ['same','actor','tenant']){
  const names=new Set(),serverNames=new Set();let scheduled=0,confirmed=0;
  const committed={actorUid:scope==='actor'?'other':'actor',tenantId:scope==='tenant'?'other':'company',loaded:{orders:true},serverConfirmed:{tenantId:scope==='tenant'?'other':'company',collections:{orders:true}}};
  const bindings={activeTenantScopeRef:{current:'company'},tenantCompanyId:'company',firebaseUser:{uid:'actor'},collectionReadinessCommittedRef:{current:committed},
   pendingLoadedCollectionMarks:names,loadedCollectionMarkTimer:null,window:{setTimeout:()=>++scheduled},flushLoadedCollectionMarks(){},pendingServerConfirmedCollectionMarks:serverNames,serverConfirmedCollectionMarkTimer:null,
   startupNotificationBarrier:{confirm:()=>confirmed++},cancelled:true};
  const mark=appFunction('markCollectionLoaded',bindings);bindings.markCollectionLoaded=mark;
  const server=appFunction('markCollectionServerConfirmed',bindings);
  for(let i=0;i<100;i++)server('orders');
  assert.equal(confirmed,100,'source barrier is still confirmed even without a new React update');
  assert.equal(names.size,scope==='same'?0:1);assert.equal(serverNames.size,scope==='same'?0:1);assert.equal(scheduled,scope==='same'?0:1);
 }
});
