import test from 'node:test';import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import {getFirestore,collection,query,queryEqual,where,orderBy,documentId,limit,startAfter} from 'firebase/firestore';
import {createFirestorePageTransport} from '../src/data/firestorePageTransport.js';
import {createInstantDataEngine} from '../src/data/instantDataEngine.js';
const scope={principalId:'synthetic-admin',tenantId:'tenant-a',permissionRevision:'v1'};
const descriptor={collection:'products',pageSize:20};
const policy=()=>({...scope,allowed:true,allowedFilterFields:['category'],filters:[]});
const documents=length=>({size:length,docs:Array.from({length},(_,i)=>({id:'document-'+String(i).padStart(2,'0'),data:()=>({companyId:scope.tenantId,id:'payload-cannot-spoof-document-identity',category:'fixture'})}))});

test('Firestore adapter uses actual SDK tenant + keyset cursor + limit20 and public document IDs',async()=>{
 const app=initializeApp({projectId:'demo-instant-transport'},'instant-transport'),db=getFirestore(app),targets=[];
 try{
  const transport=createFirestorePageTransport({db,appId:'fixture',authorize:policy,read:async target=>{targets.push(target);return documents(targets.length===1?20:2)}});
  const first=await transport.readPage({scope,query:descriptor});
  const target=collection(db,'artifacts','fixture','public','data','products');
  assert.ok(queryEqual(targets[0],query(target,where('companyId','==','tenant-a'),orderBy(documentId(),'asc'),limit(20))));
  assert.equal(first.items[0].id,'document-00');assert.equal(first.hasMore,true);assert.equal(first.coverage,'all-query-matches');
  await transport.readPage({scope,query:descriptor,cursor:first.nextCursor});
  assert.ok(queryEqual(targets[1],query(target,where('companyId','==','tenant-a'),orderBy(documentId(),'asc'),startAfter('document-19'),limit(20))));
  await assert.rejects(transport.readPage({scope,query:{...descriptor,filters:[{field:'category',op:'==',value:'fixture'}]},cursor:first.nextCursor}),{code:'invalid-cursor'});
  await assert.rejects(transport.readPage({scope,query:descriptor,cursor:first.nextCursor.replace('tenant-a','tenant-b')}),{code:'invalid-cursor'});
  assert.equal(targets.length,2);
 }finally{await deleteApp(app)}
});

test('unsupported search, foreign policy, company overrides and changed mid-request permissions fail before publication',async()=>{
 const app=initializeApp({projectId:'demo-instant-transport-denial'},'instant-transport-denial'),db=getFirestore(app);let reads=0,allowed=policy();
 try{
  const transport=createFirestorePageTransport({db,appId:'fixture',authorize:()=>allowed,read:async()=>{reads++;allowed={...allowed,filters:[{field:'category',op:'==',value:'narrower'}]};return documents(1)}});
  await assert.rejects(transport.readPage({scope,query:{...descriptor,search:{text:'not-in-first-page'}}}),{code:'search-not-configured'});
  await assert.rejects(transport.readPage({scope,query:{...descriptor,filters:[{field:'companyId',op:'==',value:'foreign'}]}}),{code:'permission-denied'});
  assert.equal(reads,0);
  await assert.rejects(transport.readPage({scope,query:descriptor}),{code:'permission-denied'});
  allowed={...policy(),principalId:'another-identity'};await assert.rejects(transport.readPage({scope,query:descriptor}),{code:'permission-denied'});
  assert.equal(reads,1);
 }finally{await deleteApp(app)}
});

test('SDK page cancellation is explicit and cannot turn an unreturned RPC into a successful read',async()=>{
 const app=initializeApp({projectId:'demo-instant-transport-abort'},'instant-transport-abort'),db=getFirestore(app);let resolve,calls=0;
 try{
  const transport=createFirestorePageTransport({db,appId:'fixture',authorize:policy,read:()=>{calls++;return new Promise(done=>{resolve=done})}});
  const control=new AbortController(),pending=transport.readPage({scope,query:descriptor,signal:control.signal});control.abort();resolve(documents(1));
  await assert.rejects(pending,{name:'AbortError'});assert.equal(calls,1);
  await assert.rejects(transport.readPage({scope,query:descriptor,signal:control.signal}),{name:'AbortError'});assert.equal(calls,1);
  assert.equal(transport.capabilities.cancellation,'discard-publication-only');
 }finally{await deleteApp(app)}
});

test('a cache hit cannot outlive a changed authorization policy, even without a caller scope-epoch update',async()=>{
 const app=initializeApp({projectId:'demo-instant-cache-policy'},'instant-cache-policy'),db=getFirestore(app);let allowed=policy(),reads=0;
 const transport=createFirestorePageTransport({db,appId:'fixture',authorize:()=>allowed,read:async()=>{reads++;return documents(2)}});
 const engine=createInstantDataEngine({scope,transport});
 try{
  const old=engine.openQuery(descriptor);await old.load();assert.equal(reads,1);
  allowed={...allowed,filters:[{field:'category',op:'==',value:'fixture'}]};
  assert.equal(old.getSnapshot().items.length,0);await assert.rejects(old.load(),{code:'permission-denied'});
  const narrower=engine.openQuery(descriptor);assert.notEqual(narrower,old);assert.equal(narrower.getSnapshot().items.length,0);
  await narrower.load();assert.equal(reads,2);
 }finally{engine.close();await deleteApp(app)}
});
