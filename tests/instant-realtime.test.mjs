import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, Timestamp } from 'firebase/firestore';
import { createInstantDataEngine } from '../src/data/instantDataEngine.js';
import { createFirestorePageTransport } from '../src/data/firestorePageTransport.js';

const scope={principalId:'synthetic-a',tenantId:'company-a',permissionRevision:'fixture-v1'};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
const page=(value=1)=>({items:[{id:'one',companyId:scope.tenantId,value}],hasMore:false,nextCursor:null,source:'server',coverage:'all-query-matches'});
const query={collection:'products'};
function fixture(options={}){
  const {transport:extraTransport,...engineOptions}=options;
  const subscriptions=[];
  const transport={readPage:async()=>page(),subscribePage:request=>{const entry={...request,stops:0};subscriptions.push(entry);return()=>{entry.stops++}},...extraTransport};
  const engine=createInstantDataEngine({scope,transport,...engineOptions});
  return {engine,subscriptions};
}

test('realtime queries share one bounded transport, queue fairly, unsubscribe after the last consumer and close cleanly',()=>{
  const {engine,subscriptions}=fixture({maxRealtimeQueries:1,maxQueued:1}),seen=[];
  try {
    const first=engine.observePage(query,{onData:value=>seen.push(['a',value.items[0].value])});
    const second=engine.observePage(query,{onData:value=>seen.push(['b',value.items[0].value])});
    const third=engine.observePage({collection:'customers'});
    assert.equal(subscriptions.length,1);assert.equal(engine.getDiagnostics().queuedRealtimeQueries,1);
    assert.throws(()=>engine.observePage({collection:'orders'}),error=>error.code==='realtime-capacity');
    subscriptions[0].onData(page(3));assert.deepEqual(seen,[['a',3],['b',3]]);
    first();assert.equal(subscriptions[0].stops,0);second();
    assert.equal(subscriptions[0].stops,1);assert.equal(subscriptions.length,2);
    third();assert.equal(subscriptions[1].stops,1);
    assert.equal(engine.getDiagnostics().activeRealtimeQueries,0);
    const signal=new AbortController();engine.observePage(query,{signal:signal.signal});signal.abort();
    assert.equal(subscriptions[2].stops,1);
  }finally{engine.close()}
});

test('a live server page retires an older physical read; late read cannot overwrite it or release the RPC slot early',async()=>{
  const pending=deferred();
  const {engine,subscriptions}=fixture({transport:{readPage:()=>pending.promise}});
  try {
    const resource=engine.openQuery(query),load=resource.load();const rejected=assert.rejects(load,error=>error.name==='AbortError');await tick();
    const off=engine.observePage(query);subscriptions[0].onData(page(5));await rejected;
    assert.equal(resource.getSnapshot().items[0].value,5);assert.equal(resource.getSnapshot().dataSource,'server-realtime');
    assert.equal(engine.getDiagnostics().activeRequests,1);
    pending.resolve(page(1));await tick();await tick();
    assert.equal(engine.getDiagnostics().activeRequests,0);assert.equal(resource.getSnapshot().items[0].value,5);
    off();
  }finally{engine.close()}
});

test('confirmed write retires old streams and refreshes subscribed pages; failed writes never roll back concurrent server data',async()=>{
  const write=deferred();let next=1;
  const {engine,subscriptions}=fixture({transport:{readPage:async()=>page(next),capabilities:{idempotentWrites:true},write:()=>write.promise}});
  try {
    const resource=engine.openQuery(query);await resource.load();const unsubscribe=resource.subscribe(()=>{});
    const off=engine.observePage(query);subscriptions[0].onData(page(2));
    const command={operationId:'synthetic-write-1',expectedVersion:'v1',amount:1};
    const saving=engine.mutate(command);await tick();command.operationId='caller-changed';
    subscriptions[0].onData(page(3));next=4;write.resolve({confirmed:true,operationId:'synthetic-write-1'});await saving;await tick();await tick();
    assert.equal(subscriptions[0].stops,1);assert.equal(subscriptions.length,2);assert.equal(resource.getSnapshot().items[0].value,4);
    subscriptions[0].onData(page(1));assert.equal(resource.getSnapshot().items[0].value,4,'retired stream cannot restore old data');
    subscriptions[1].onData(page(6));assert.equal(resource.getSnapshot().items[0].value,6);
    off();unsubscribe();
  }finally{engine.close()}
  const failed=deferred(),fixture2=fixture({transport:{capabilities:{idempotentWrites:true},write:()=>failed.promise}});
  try {
    const resource=fixture2.engine.openQuery(query);await resource.load();fixture2.engine.observePage(query);
    const saving=fixture2.engine.mutate({operationId:'failed-write',expectedVersion:'v1'});
    const rejected=assert.rejects(saving,error=>error.code==='aborted');await tick();
    fixture2.subscriptions[0].onData(page(9));failed.reject(Object.assign(new Error('Concurrent edit'),{code:'aborted'}));await rejected;
    assert.equal(resource.getSnapshot().items[0].value,9);
  }finally{fixture2.engine.close()}
});

test('Firestore live adapter ignores cache/unacknowledged local data, preserves typed values, and rejects changed policy',async()=>{
  const app=initializeApp({projectId:'demo-instant-realtime'},'fixture-'+Date.now());
  const events=[],errors=[];let listener,stops=0,allowed=true;
  const stamp=new Timestamp(10,123);
  const transport=createFirestorePageTransport({db:getFirestore(app),appId:'synthetic',authorize:()=>({allowed,...scope,filters:[],allowedFilterFields:[]}),
    watch:(_query,options,onData)=>{assert.deepEqual(options,{includeMetadataChanges:true});listener=onData;return()=>stops++}});
  const snapshot=metadata=>({size:1,metadata,docs:[{id:'real-id',data:()=>({id:'spoofed',companyId:scope.tenantId,stamp})}]});
  try {
    const controller=new AbortController();
    transport.subscribePage({scope,query:{collection:'products',pageSize:20},signal:controller.signal,onData:value=>events.push(value),onError:error=>errors.push(error.code)});
    listener(snapshot({fromCache:true,hasPendingWrites:false}));listener(snapshot({fromCache:false,hasPendingWrites:true}));assert.equal(events.length,0);
    listener(snapshot({fromCache:false,hasPendingWrites:false}));assert.equal(events[0].items[0].id,'real-id');assert.equal(events[0].items[0].stamp,stamp);
    allowed=false;listener(snapshot({fromCache:false,hasPendingWrites:false}));assert.deepEqual(errors,['permission-denied']);assert.equal(stops,1);
    controller.abort();listener(snapshot({fromCache:false,hasPendingWrites:false}));assert.equal(stops,1);assert.equal(events.length,1);
  }finally{await deleteApp(app)}
});
