import test from 'node:test';import assert from 'node:assert/strict';
import {canonicalQueryValue,createInstantDataEngine,normalizeDataPageSize} from '../src/data/instantDataEngine.js';
const scope={principalId:'synthetic-user-a',tenantId:'company-a',permissionRevision:'verified-v1'};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
const row=id=>({id:String(id),companyId:'company-a',amount:Number(id)||0});
const page=(items=[row(1)],extra={})=>({items,hasMore:false,nextCursor:null,readCount:items.length,coverage:'all-query-matches',source:'server',...extra});
const setup=(readPage,options={})=>createInstantDataEngine({scope,transport:{readPage},...options});

test('nested drafts cannot mutate shared cached records or the transport-owned response',async()=>{
 const incoming={...row(1),items:[{quantity:3}],profile:{name:'Synthetic'}};
 const engine=setup(async()=>page([incoming]));
 try{
  const resource=engine.openQuery({collection:'orders'});await resource.load();const cached=resource.getSnapshot().items[0];
  assert.notEqual(cached.items,incoming.items);assert.notEqual(cached.profile,incoming.profile);
  assert.throws(()=>{cached.items[0].quantity=9},TypeError);assert.throws(()=>{cached.profile.name='edited'},TypeError);
  incoming.items[0].quantity=4;assert.equal(cached.items[0].quantity,3);
 }finally{engine.close()}
});

test('lazy keyset pages contain 20 records, never a truncated dataset total or accumulated collection',async()=>{
 const calls=[],records=Array.from({length:47},(_,i)=>row(i));
 const engine=setup(async request=>{calls.push(request);const start=request.cursor===null?0:Number(request.cursor.slice(2));return page(records.slice(start,start+request.query.pageSize),{hasMore:start+20<records.length,nextCursor:start+20<records.length?'c-'+(start+20):null})});
 try{
  const resource=engine.openQuery({collection:'orders'});assert.equal(calls.length,0);
  assert.equal(resource.getSnapshot(),resource.getSnapshot());
  await resource.load();assert.equal(resource.getSnapshot().items.length,20);
  await resource.next();assert.deepEqual(resource.getSnapshot().items.map(x=>x.id),records.slice(20,40).map(x=>x.id));
  await resource.next();assert.equal(resource.getSnapshot().items.length,7);assert.equal(resource.getSnapshot().hasMore,false);
  await resource.next();assert.deepEqual(calls.map(x=>x.cursor),[null,'c-20','c-40']);
  assert.ok(calls.every(x=>x.query.pageSize===20));assert.equal('total' in resource.getSnapshot(),false);
 }finally{engine.close()}
});

test('cache display is synchronous, stale refresh keeps rows and server metrics never count cache hits',async()=>{
 let time=100,calls=0;const later=deferred(),metrics=[];
 const engine=setup(()=>++calls===1?Promise.resolve(page()):later.promise,{wallNow:()=>time,staleMs:100,onMetric:x=>metrics.push(x)});
 try{
  const query=engine.openQuery({collection:'orders'});await query.load();await query.load();assert.equal(calls,1);assert.equal(query.getSnapshot().dataSource,'cache');
  time=250;const refresh=query.load();assert.equal(query.getSnapshot().status,'refreshing');assert.equal(query.getSnapshot().items[0].id,'1');
  later.resolve(page([row(2)]));await refresh;assert.equal(query.getSnapshot().items[0].id,'2');
  assert.equal(metrics.filter(x=>x.kind==='transport-read').length,2);assert.equal(metrics.filter(x=>x.kind==='cache-display').length,2);
 }finally{engine.close()}
});

test('deduplicated consumers cancel independently and only the final cancellation aborts transport',async()=>{
 const pending=deferred(),requests=[];
 const engine=setup(request=>{requests.push(request);return pending.promise});
 try{
  const q=engine.openQuery({collection:'customers'}),a=new AbortController(),b=new AbortController();
  assert.equal(q,engine.openQuery({collection:'customers'}));
  const first=q.load({signal:a.signal}),rejected=assert.rejects(first,{name:'AbortError'}),second=q.load({signal:b.signal});
  await tick();assert.equal(requests.length,1);a.abort();await rejected;assert.equal(requests[0].signal.aborted,false);
  pending.resolve(page());await second;assert.equal(q.getSnapshot().status,'ready');
 }finally{engine.close()}
});

test('uncancellable SDK RPC retains its concurrency slot; cancelled results cannot publish or enter cache',async()=>{
 const waits=[],requests=[];
 const engine=setup(request=>{const wait=deferred();waits.push(wait);requests.push(request);return wait.promise},{maxConcurrent:1});
 try{
  const first=engine.openQuery({collection:'orders'}),a=new AbortController(),p=first.load({signal:a.signal}),rejected=assert.rejects(p,{name:'AbortError'});
  await tick();a.abort();await rejected;
  const second=engine.openQuery({collection:'customers'}),next=second.load();await tick();assert.equal(requests.length,1);
  assert.equal(engine.getDiagnostics().activeRequests,1);waits[0].resolve(page([row(9)]));await tick();await tick();assert.equal(requests.length,2);
  waits[1].resolve(page());await next;assert.equal(first.getSnapshot().items.length,0);assert.equal(engine.getDiagnostics().cachedPages,1);
 }finally{engine.close()}
});

test('refresh rejects late older data and invalidates only the affected query cache',async()=>{
 const first=deferred(),second=deferred();let calls=0;
 const engine=setup(request=>request.query.collection==='products'?Promise.resolve(page([row(3)])):++calls===1?first.promise:second.promise);
 try{
  const other=engine.openQuery({collection:'products'});await other.load();
  const q=engine.openQuery({collection:'orders'}),old=q.load(),rejected=assert.rejects(old,{name:'AbortError'});await tick();
  const fresh=q.refresh();await rejected;second.resolve(page([row(2)]));await fresh;first.resolve(page([row(1)]));await tick();
  assert.equal(q.getSnapshot().items[0].id,'2');await other.load();assert.equal(other.getSnapshot().dataSource,'cache');
 }finally{engine.close()}
});

test('revocation and backend permission denial hide cached records and reject all late publication',async()=>{
 let current=true;const engine=setup(async()=>page(),{isCurrent:()=>current});
 const q=engine.openQuery({collection:'orders'});await q.load();current=false;assert.equal(q.getSnapshot().items.length,0);await assert.rejects(q.load(),{name:'AbortError'});engine.close();
 let deny=false;const second=setup(async()=>{if(deny)throw Object.assign(Error('denied'),{code:'permission-denied'});return page()});
 try{
  const a=second.openQuery({collection:'orders'}),b=second.openQuery({collection:'customers'});await a.load();await b.load();deny=true;
  await assert.rejects(a.refresh(),{code:'permission-denied'});assert.equal(a.getSnapshot().items.length,0);assert.equal(b.getSnapshot().items.length,0);assert.equal(second.getDiagnostics().cachedPages,0);
 }finally{second.close()}
});

test('same-tenant different principals cannot share cache and query page limits/search coverage fail closed',async()=>{
 let calls=0;const transport={readPage:async()=>{calls++;return page()}};
 const a=createInstantDataEngine({scope,transport}),b=createInstantDataEngine({scope:{...scope,principalId:'synthetic-user-b'},transport});
 try{
  await a.openQuery({collection:'orders'}).load();await b.openQuery({collection:'orders'}).load();assert.equal(calls,2);
  assert.throws(()=>a.openQuery({collection:'orders',pageSize:50}),RangeError);
  assert.throws(()=>a.openQuery({collection:'customers',search:{text:'outside-first-page'}}),{code:'search-not-configured'});
  assert.equal(normalizeDataPageSize(15),15);assert.equal(normalizeDataPageSize(),20);
  assert.throws(()=>canonicalQueryValue({date:new Date()}),TypeError);assert.throws(()=>canonicalQueryValue(Infinity),TypeError);
  assert.notEqual(canonicalQueryValue(-0),canonicalQueryValue(0));assert.equal(canonicalQueryValue({b:2,a:1}),canonicalQueryValue({a:1,b:2}));
 }finally{a.close();b.close()}
});

test('malformed, foreign-tenant, oversized or nonprogressing pages never publish partial records',async()=>{
 for(const response of [page([row(1),row(1)]),page([{...row(1),companyId:'foreign'}]),page(Array.from({length:21},(_,i)=>row(i))),page([],{hasMore:true,nextCursor:'c-1'}),page([row(1)],{coverage:'loaded-page-only'}),page([row(1)],{source:'cache'})]){
  const e=setup(async()=>response);try{const q=e.openQuery({collection:'orders'});await assert.rejects(q.load(),{code:'invalid-page'});assert.equal(q.getSnapshot().items.length,0);assert.equal(e.getDiagnostics().cachedPages,0);}finally{e.close()}
 }
});

test('bounded retries release slots, never retry permission/conflict errors and keep cache bounded',async()=>{
 let attempts=0;const delays=[];
 const e=setup(async()=>{if(++attempts<3)throw Object.assign(Error('retry'),{code:'unavailable'});return page()},{maxAttempts:3,random:()=>.5,delay:async ms=>delays.push(ms),maxCachePages:2});
 try{await e.openQuery({collection:'orders'}).load();assert.equal(attempts,3);assert.deepEqual(delays,[150,300]);
  await e.openQuery({collection:'products'}).load();await e.openQuery({collection:'customers'}).load();assert.equal(e.getDiagnostics().cachedPages,2);
 }finally{e.close()}
});

test('writes require idempotency/version/ACK, immutable commands, and preserve the operation fingerprint after failures',async()=>{
 const pending=deferred(),sent=[];let fail=false;
 const transport={capabilities:{idempotentWrites:true},readPage:async()=>page(),write:async request=>{sent.push(request);if(fail)throw Object.assign(Error('conflict'),{code:'conflict'});await pending.promise;return{confirmed:true,operationId:request.command.operationId,version:2}}};
 const e=createInstantDataEngine({scope,transport});
 try{
  const command={operationId:'synthetic-op-1',expectedVersion:1,collection:'orders',recordId:'1',patch:{amount:10}};
  const a=e.mutate(command),b=e.mutate(command);command.patch.amount=999;
  assert.equal(a,b);await tick();assert.equal(sent.length,1);assert.equal(sent[0].command.patch.amount,10);
  await assert.rejects(e.mutate({...command,patch:{amount:20}}),{code:'operation-id-conflict'});
  pending.resolve();await a;fail=true;
  const failed={operationId:'synthetic-op-2',expectedVersion:1,patch:{amount:30}};
  await assert.rejects(e.mutate(failed),{code:'conflict'});await assert.rejects(e.mutate({...failed,patch:{amount:40}}),{code:'operation-id-conflict'});
  await assert.rejects(e.mutate(failed),{code:'conflict'});assert.equal(sent.length,3);
 }finally{e.close()}
});

test('many independent requests share the global concurrency limit without starving the queue',async()=>{
 let active=0,max=0,calls=0;
 const e=setup(async()=>{active++;max=Math.max(max,active);await tick();calls++;active--;return page()},{maxConcurrent:2,maxCachePages:5});
 try{await Promise.all(Array.from({length:35},(_,i)=>e.openQuery({collection:'orders',filters:[{field:'sequence',op:'==',value:i}]}).load()));assert.equal(calls,35);assert.equal(max,2);assert.equal(e.getDiagnostics().cachedPages,5);}finally{e.close()}
});

test('separate view cursors share transport/cache without moving another screen to the wrong page',async()=>{
 const pending=deferred();let calls=0;
 const e=setup(request=>{calls++;return request.cursor===null?pending.promise:Promise.resolve(page([row(21)]))});
 try{
  const list=e.openQuery({collection:'customers'},{viewKey:'list'}),picker=e.openQuery({collection:'customers'},{viewKey:'picker'});
  assert.notEqual(list,picker);const a=list.load(),b=picker.load();await tick();assert.equal(calls,1);
  pending.resolve(page([row(1)],{hasMore:true,nextCursor:'second'}));await Promise.all([a,b]);
  await list.next();assert.equal(list.getSnapshot().items[0].id,'21');assert.equal(picker.getSnapshot().items[0].id,'1');
 }finally{e.close()}
});
