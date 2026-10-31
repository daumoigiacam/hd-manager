import test from 'node:test';
import assert from 'node:assert/strict';
import {retainCollectionRecordIdentity} from '../src/utils/collectionIdentity.js';
import {retainCollectionRecordIdentityAsync} from '../src/utils/cooperativeCollectionIdentity.js';
import {appFunction} from './helpers/app-source-function.mjs';
const turn=()=>new Promise(resolve=>setTimeout(resolve,0));
const records=n=>Array.from({length:n},(_,i)=>({id:'r-'+i,amount:i,nested:{details:Array.from({length:12},(_,j)=>({quantity:j/10,name:'Vịt 🦆'}))}}));

test('cooperative complete reconciliation matches the synchronous reference, including duplicate IDs, order, deletes and local markers',async()=>{
  const before=records(150),equal=structuredClone(before),changed=structuredClone(before);
  changed.reverse();changed[30].amount=900;delete changed[31].nested;changed[40].__pendingFirebaseSync=true;
  const duplicate=[{id:'same',amount:1},{id:'same',amount:2}],date=new Date(0);
  for(const [a,b] of [[before,equal],[before,changed],[duplicate,structuredClone(duplicate)],
    [before,[]],[[],before],[{a:before},{a:equal}],[{date},{date:new Date(0)}],
    [[{id:1,amount:NaN}],[{id:1,amount:NaN}]],[[{id:'a',amount:-0}],[{id:'a',amount:0}]],
    [[null],[null]],[[{id:''}],[{id:''}]]]){
    const expected=retainCollectionRecordIdentity(a,b),actual=await retainCollectionRecordIdentityAsync(a,b);
    assert.deepEqual(actual,expected);assert.equal(actual===a,expected===a);
    if(Array.isArray(actual)&&Array.isArray(expected))actual.forEach((row,i)=>assert.equal(row===a[i],expected[i]===a[i]));
  }
  assert.equal(before[119].amount,119);assert.equal(changed[30].amount,900);
});

test('deep comparison yields inside a single large record and aborts without mutating or publishing either input',async()=>{
  const a=[{id:'one',nested:{details:Array.from({length:2000},(_,quantity)=>({quantity}))}}],b=structuredClone(a);
  b[0].nested.details[1999].quantity=9900;
  let clock=0,yields=0,current=true;
  await assert.rejects(retainCollectionRecordIdentityAsync(a,b,{now:()=>clock++,isCurrent:()=>current,
    yieldWork:async()=>{yields++;current=false}}),{name:'AbortError'});
  assert.ok(yields>0);assert.equal(a[0].nested.details[1999].quantity,1999);assert.equal(b[0].nested.details[1999].quantity,9900);
  // Same length forces traversal deep within one row instead of an early bail.
  const c=[{id:'one',items:Array.from({length:2000},(_,n)=>({amount:n}))}],d=structuredClone(c);
  clock=0;yields=0;
  assert.equal(await retainCollectionRecordIdentityAsync(c,d,{now:()=>clock++,yieldWork:async()=>{yields++}}),c);
  assert.ok(yields>0,'one deep record must still yield before completion');
});

test('actual App publication waits for complete comparison and preserves a concurrent local state edit',async()=>{
  let state=records(100),committed=state,version=1,resolve,preparedAgainst,loaded=0,expected;
  const input=structuredClone(state);input[3].amount=800;
  const queue=[];
  const recent=new Map(),deleted=new Set();
  const merge=appFunction('mergePendingArrayItems',{
    expandPendingWrites:rows=>rows,pendingFirebaseWritesRef:{current:[]},pruneRecentLocalMutations(){},
    getRecentLocalDeleteIds:()=>deleted,recentLocalWritesRef:{current:recent},
  });
  const worker={isPublicationCurrent:(_name,v)=>v===version,expectCommit:(_name,_v,value)=>expected=value,publicationScheduled(){}};
  const apply=appFunction('setCollectionSafely',{
    readWorker:worker,cancelled:false,readWorkerCommittedStateRef:{current:{orders:committed}},mergePendingArrayItems:merge,
    retainCollectionRecordIdentity,retainCollectionRecordIdentityAsync:async(previous,next)=>{
      preparedAgainst=previous;await new Promise(r=>resolve=r);return retainCollectionRecordIdentity(previous,next);
    },runNonBlockingStateUpdate:fn=>queue.push(fn),
    hasCollectionValue:value=>value?.length>0,getPreviousStableCollectionValue:()=>committed,rememberStableCollectionValue(){},markCollectionLoaded(){loaded++},
  });
  apply('orders',updater=>{state=updater(state)},input,false,{workerCommitVersion:1});
  assert.equal(queue.length,0);assert.equal(loaded,0);assert.equal(preparedAgainst,committed);
  resolve();await turn();assert.equal(queue.length,1);
  // The raw React state changed while the comparison was yielding. It must be
  // reconciled against the actual updater argument rather than the stale ref.
  recent.set('orders:r-0',{collectionName:'orders',documentId:'r-0',payload:{amount:444}});deleted.add('r-1');
  state=[{...state[0],amount:444,__pendingFirebaseSync:true},...state.slice(2)];
  const concurrent=state;queue.shift()();
  assert.deepEqual(state,retainCollectionRecordIdentity(concurrent,merge('orders',input)));
  assert.equal(state.find(row=>row.id==='r-3').amount,800);assert.equal(state[0].amount,444);
  assert.equal(state.some(row=>row.id==='r-1'),false,'concurrent deletion cannot resurrect');
  assert.equal(expected,state);assert.equal(loaded,0,'worker readiness belongs to the post-commit callback, not the queued setter');
  apply('orders',updater=>{state=updater(state)},input,false,{workerCommitVersion:1});
  version=2;resolve();await turn();assert.equal(queue.length,0,'superseded result cannot queue a state update');
});

test('memoized full company order projection includes archived orders, isolates tenants and invalidates immutable replacements',()=>{
  let oldDeps,oldValue;
  const useMemo=(factory,deps)=>{
    if(!oldDeps||deps.some((dep,i)=>!Object.is(dep,oldDeps[i]))){oldValue=factory();oldDeps=deps}
    return oldValue;
  };
  const rows=[{id:'a',companyId:'one'},{id:'b',companyId:'one',isArchived:true},{id:'foreign',companyId:'two'}];
  const project=(rawOrders,myCompanyId)=>appFunction('allCompanyOrders',{rawOrders,myCompanyId,useMemo});
  const first=project(rows,'one');assert.deepEqual(first.map(row=>row.id),['a','b']);
  assert.equal(project(rows,'one'),first);assert.deepEqual(project(rows,'two').map(row=>row.id),['foreign']);
  assert.deepEqual(project(rows.slice(1),'one').map(row=>row.id),['b']);
});
