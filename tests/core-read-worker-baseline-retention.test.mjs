import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import {createInitialReadAdmission} from '../src/services/initialReadAdmission.js';
import {createBudgetedTransferChunks,getWorkerTransferPolicy} from '../src/services/workerTransferBudget.js';
import {sendBoundedWorkerChunks} from '../performance/upgrade-20261103/rejected-pilots/boundedWorkerTransfer.js';

// Run the actual worker protocol against deterministic snapshots. SDK type,
// Rules and network behaviour are covered separately by the emulator suite.
const source = readFileSync(new URL('../src/services/firestoreReadWorker.js', import.meta.url), 'utf8');
const imports = parse(source, {sourceType:'module'}).program.body.filter(node => node.type === 'ImportDeclaration');
let executable = source;
for (const node of imports.reverse()) executable = executable.slice(0,node.start) + executable.slice(node.end);
executable=executable.replace('import.meta.env','transferEnv');
const turn = () => new Promise(resolve => setImmediate(resolve));

async function fixture({holdBegins=false,cacheOnly=false,transferEnv={}}={}) {
  const scopeId='synthetic-worker', packets=[], records=new Map(),held=[],startedCollections=[],receivers=new Map();
  const self={onmessage:null,close(){},postMessage(message){
    packets.push(message);
    if(message.packetId){
      if(holdBegins&&message.type==='begin')held.push(message);
      else queueMicrotask(()=>self.onmessage({data:{type:'ack',scopeId,streamId:message.streamId,packetId:message.packetId}}));
    }
  }};
  const query=(target,...constraints)=>({...target,constraints});
  const dependencies={self,createInitialReadAdmission,createBudgetedTransferChunks,getWorkerTransferPolicy,sendBoundedWorkerChunks,transferEnv, initializeApp:()=>({}), initializeAuth:()=>({authStateReady:async()=>{},currentUser:{}}),
    getIdTokenResult:async()=>({claims:{}}),onIdTokenChanged:()=>()=>{},initializeFirestore:()=>({}),
    connectAuthEmulator(){},connectFirestoreEmulator(){},
    createWorkerAuthPersistence:()=>({Persistence:class {},clear(){}}),assertWorkerIdentity(){},
    getFirestoreTransportOptions:()=>({}),encodeFirestoreWorkerValue:value=>value,
    collection:(_db,...parts)=>({name:parts.at(-1)}),doc:(_db,...parts)=>({name:parts.at(-2),document:true}),
    query,where:(...args)=>args,orderBy:(...args)=>args,limit:value=>value,
    snapshotEqual:(left,right)=>left.id===right.id&&left.value===right.value,
    onSnapshot(target,_options,receive){
      startedCollections.push(target.name);
      const docs=(records.get(target.name)||[]).map(([id,value])=>({id,value,data:()=>({value})}));
      const server=()=>receive({size:docs.length,docs,metadata:{fromCache:false,hasPendingWrites:false},docChanges:()=>[]});
      receivers.set(target.name,server);
      queueMicrotask(()=>cacheOnly?receive({size:docs.length,docs,metadata:{fromCache:true,hasPendingWrites:false},docChanges:()=>[]}):server());
      return ()=>{};
    },
  };
  new Function(...Object.keys(dependencies),executable)(...Object.values(dependencies));
  const send=data=>self.onmessage({data:{scopeId,...data}});
  await send({type:'init',config:{apiKey:'synthetic',projectId:'demo-worker-retention'},scope:{accountType:'employee',appId:'synthetic',companyId:'synthetic',apiKey:'synthetic',projectId:'demo-worker-retention'}});
  assert(packets.some(packet=>packet.type==='ready'));
  let sequence=0;
  return {records,packets,send,startedCollections,
    deliverServer:name=>receivers.get(name)(),
    releaseBegin(){const message=held.shift();assert(message);return send({type:'ack',streamId:message.streamId,packetId:message.packetId})},
    async open(collectionName,baselineId=null){
      const id=String(++sequence),offset=packets.length;
      await send({type:'subscribe',streamId:id,collectionName,baselineId});
      for(let attempt=0;attempt<50&&!packets.some(packet=>packet.streamId===id&&packet.type==='complete');attempt++)await turn();
      await turn();
      const received=packets.slice(offset).filter(packet=>packet.streamId===id);
      assert(received.some(packet=>packet.type==='complete'),'worker must publish a complete transfer');
      return {id,received,baselineId:received.find(packet=>packet.type==='complete').baselineId,
        rows:received.filter(packet=>packet.type==='chunk').flatMap(packet=>packet.rows)};
    },
    stop:stream=>send({type:'unsubscribe',streamId:stream.id}),
    close:()=>send({type:'close'}),
  };
}

test('actual worker admits two initial SDK sources and waits for the first complete server ACK before opening the third',async()=>{
  const f=await fixture({holdBegins:true});try{
    for(const letter of 'ABC')await f.send({type:'subscribe',streamId:letter,collectionName:'source_'+letter});
    await turn();assert.deepEqual(f.startedCollections,['source_A','source_B']);
    await f.releaseBegin();
    for(let attempt=0;attempt<50&&f.startedCollections.length<3;attempt++)await turn();
    assert.deepEqual(f.startedCollections,['source_A','source_B','source_C']);
    assert(f.packets.some(packet=>packet.streamId==='A'&&packet.type==='complete'));
  }finally{await f.close()}
});

test('four-read experiment is explicit and bounded; the fifth source still waits for a full server ACK',async()=>{
 const f=await fixture({holdBegins:true,transferEnv:{VITE_WORKER_INITIAL_CONCURRENCY:'4'}});try{
  for(const letter of 'ABCDE')await f.send({type:'subscribe',streamId:letter,collectionName:'source_'+letter});
  await turn();assert.deepEqual(f.startedCollections,['source_A','source_B','source_C','source_D']);
  await f.releaseBegin();for(let n=0;n<50&&f.startedCollections.length<5;n++)await turn();
  assert.deepEqual(f.startedCollections,['source_A','source_B','source_C','source_D','source_E']);
 }finally{await f.close()}
});

test('actual worker experimental profile keeps every row and reduces packet count without weakening server metadata',async()=>{
 const f=await fixture({transferEnv:{VITE_WORKER_TRANSFER_PROFILE:'balanced-64k'}});
 try{
  const rows=Array.from({length:128},(_,i)=>[String(i),i]);f.records.set('orders',rows);
  const stream=await f.open('orders');
  assert.equal(stream.received.filter(packet=>packet.type==='chunk').length,2);
  assert.deepEqual(stream.rows.map(row=>[row.id,row.value.value]),rows);
  const begin=stream.received.find(packet=>packet.type==='begin');
  assert.deepEqual(begin.metadata,{fromCache:false,hasPendingWrites:false});assert.equal(begin.count,128);
  f.records.set('employees',rows.slice(0,3));const core=await f.open('employees');
  assert.equal(core.received.filter(packet=>packet.type==='chunk').length,3,'personnel remain isolated');
 }finally{await f.close()}
});

test('actual worker queued unsubscribe cancels admission; stopping an active initial source admits the next without a late ACK',async()=>{
  const f=await fixture({holdBegins:true});try{
    for(const letter of 'ABCD')await f.send({type:'subscribe',streamId:letter,collectionName:'source_'+letter});
    await turn();assert.deepEqual(f.startedCollections,['source_A','source_B']);
    await f.send({type:'unsubscribe',streamId:'C'});await f.send({type:'unsubscribe',streamId:'A'});await turn();
    assert.deepEqual(f.startedCollections,['source_A','source_B','source_D']);
    assert(!f.packets.some(packet=>packet.streamId==='C'));
  }finally{await f.close()}
});

test('cache-only SDK snapshots do not release initial admission or manufacture server readiness',async()=>{
  const f=await fixture({holdBegins:true,cacheOnly:true});try{
    for(const letter of 'ABC')await f.send({type:'subscribe',streamId:letter,collectionName:'source_'+letter});
    await turn();assert.equal(f.packets.filter(packet=>packet.type==='cache').length,2);
    assert.deepEqual(f.startedCollections,['source_A','source_B']);
    f.deliverServer('source_A');await turn();assert.equal(f.startedCollections.length,2,'server arrival alone is not a completed transfer');
    await f.releaseBegin();
    for(let attempt=0;attempt<50&&f.startedCollections.length<3;attempt++)await turn();
    assert.deepEqual(f.startedCollections,['source_A','source_B','source_C']);
  }finally{await f.close()}
});

test('empty module snapshots cannot evict a reusable nonempty server baseline',async()=>{
  const f=await fixture();try{
    f.records.set('orders',[['a',1000],['b',2000]]);
    const initial=await f.open('orders');assert.equal(initial.rows.length,2);assert(initial.baselineId);
    await f.stop(initial);
    for(const letter of 'ABCDEFGHIJKL'){const empty=await f.open('empty_'+letter);await f.stop(empty);}
    const reopened=await f.open('orders',initial.baselineId);
    assert.equal(reopened.received.find(packet=>packet.type==='begin').mode,'metadata');
    assert.equal(reopened.rows.length,0,'same confirmed rows must not be transferred again after visiting empty modules');
    assert.equal(reopened.baselineId,initial.baselineId);
  }finally{await f.close()}
});

test('active sources cannot consume the closed-source reopen cache or evict a recently closed history',async()=>{
 const f=await fixture();try{
  const active=[];for(let i=0;i<8;i++){const name=`active_${String.fromCharCode(65+i)}`;f.records.set(name,[['one',i]]);active.push(await f.open(name));}
  f.records.set('orders',[['a',1000],['b',2000]]);const history=await f.open('orders');await f.stop(history);
  for(let i=0;i<8;i++){f.deliverServer(`active_${String.fromCharCode(65+i)}`);await turn();await turn();}
  const reopened=await f.open('orders',history.baselineId);
  assert.equal(reopened.received.find(packet=>packet.type==='begin').mode,'metadata');
  assert.equal(reopened.rows.length,0,'active-source ACKs must not force an unchanged history to be sent again');
 }finally{await f.close()}
});

test('changed data after empty module churn is transferred in full, never treated as an unchanged baseline',async()=>{
  const f=await fixture();try{
    f.records.set('orders',[['a',1000]]);const initial=await f.open('orders');await f.stop(initial);
    for(const letter of 'ABCDEFGHIJKL'){const empty=await f.open('empty_'+letter);await f.stop(empty);}
    f.records.set('orders',[['a',1500],['b',2500]]);
    const reopened=await f.open('orders',initial.baselineId);
    assert.equal(reopened.received.find(packet=>packet.type==='begin').mode,'full');
    assert.deepEqual(reopened.rows.map(row=>[row.id,row.value.value]),[['a',1500],['b',2500]]);
    assert.notEqual(reopened.baselineId,initial.baselineId);
  }finally{await f.close()}
});

test('nonempty baseline retention stays bounded and clearing a collection cannot retain a deleted-row token',async()=>{
  const f=await fixture();try{
    f.records.set('orders',[['a',1000]]);const initial=await f.open('orders');await f.stop(initial);
    for(const letter of 'ABCDEFGHI'){const name='data_'+letter;f.records.set(name,[['a',1]]);const other=await f.open(name);await f.stop(other);}
    const evicted=await f.open('orders',initial.baselineId);
    assert.equal(evicted.received.find(packet=>packet.type==='begin').mode,'full','eight-entry nonempty bound still evicts old sources');
    await f.stop(evicted);f.records.set('orders',[]);
    const cleared=await f.open('orders',evicted.baselineId);assert.equal(cleared.rows.length,0);
    assert.equal(cleared.baselineId,null,'empty completion has no reusable payload token');
    await f.stop(cleared);f.records.set('orders',[['b',2000]]);
    const later=await f.open('orders',evicted.baselineId);
    assert.equal(later.received.find(packet=>packet.type==='begin').mode,'full');
    assert.deepEqual(later.rows.map(row=>row.id),['b']);
  }finally{await f.close()}
});
