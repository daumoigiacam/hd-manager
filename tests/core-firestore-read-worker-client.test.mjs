import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createReadWorkerActivityStore } from '../src/services/readWorkerActivity.js';
const bundled = await build({ entryPoints:['src/services/firestoreReadWorkerClient.js'],bundle:true,write:false,format:'esm',platform:'node',
  plugins:[{name:'worker-client-test-aliases',setup(b){
    b.onResolve({filter:/^@hd\/firestore-/},args=>({path:args.path,namespace:'stub'}));
    b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:args.path.endsWith('read-worker')
      ? 'export const createFirestoreReadWorker=()=>{throw Error("Test must supply worker")}'
      : 'export const decodeFirestoreWorkerValue=x=>x;export const decodeFirestoreNativeValue=x=>x;export const retainFirestoreWorkerValue=(a,b)=>a.amount===b.amount?a:b;'}));
  }}] });
const {createFirestoreReadWorkerClient,canUseFirestoreReadWorker}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const turn=()=>new Promise(resolve=>setTimeout(resolve,0));
const metadata={fromCache:false,hasPendingWrites:false};
function fixture(extra={}){
  const messages=[],published=[],errors=[],fallbacks=[],pending=[];let stopped=0,terminated=0,authInvalid=0;
  const worker={postMessage:message=>messages.push(message),terminate(){terminated++}};
  const user={uid:'fixture-user',auth:{app:{name:'[DEFAULT]'}},getIdToken:async()=>{},toJSON:()=>({uid:'fixture-user',apiKey:'fixture-api',appName:'[DEFAULT]',
    emailVerified:false,isAnonymous:false,stsTokenManager:{accessToken:'synthetic-access',refreshToken:'synthetic-refresh',expirationTime:Date.now()+3600000}})};
  const client=createFirestoreReadWorkerClient({user,config:{projectId:'demo-worker-client',apiKey:'fixture-api'},appId:'fixture-app',companyId:'fixture-company',accountType:'employee',
    workerFactory:()=>worker,onAuthInvalid:()=>authInvalid++,onFallback:value=>fallbacks.push(value),onPending:value=>pending.push(value),...extra});
  const subscribe=()=>client.subscribe('orders',{publish:(snapshot,items)=>published.push({snapshot,items}),error:error=>errors.push(error),fallback:()=>{fallbacks.push('started');return()=>stopped++}});
  const receive=async message=>{worker.onmessage({data:{scopeId:messages.find(m=>m.type==='init').scopeId,...message}});await turn()};
  return {client,messages,published,errors,fallbacks,pending,subscribe,receive,worker,stats:()=>({stopped,terminated,authInvalid})};
}

test('pending callback precedes physical worker subscription and reopens cached sources without confirming cache metadata',async()=>{
 let states={},commits=[];
 const f=fixture({getCommittedStates:()=>states,onCommitted:value=>commits.push(value)});
 const publish=(snapshot,items)=>{
  f.published.push({snapshot,items});
  if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites)return;
  const version=f.client.beginPublication('orders');f.client.expectCommit('orders',version,items);f.client.publicationScheduled('orders');
 };
 const subscribe=()=>f.client.subscribe('orders',{publish,error:()=>{},fallback:()=>()=>{}});
 const off=subscribe();assert.deepEqual(f.pending,[{collectionName:'orders',generation:0}]);
 assert.equal(f.messages.some(message=>message.type==='subscribe'),false);
 await turn();await f.receive({type:'ready'});const first=f.messages.find(message=>message.type==='subscribe').streamId;
 await f.receive({type:'begin',streamId:first,packetId:1,revision:1,mode:'full',count:1,changeCount:null,metadata});
 await f.receive({type:'chunk',streamId:first,packetId:2,revision:1,index:0,rows:[{id:'a',type:'full',value:{amount:1}}]});
 await f.receive({type:'complete',streamId:first,packetId:3,revision:1,chunks:1,baselineId:'confirmed-one'});
 assert.equal(commits.length,0);const rows=f.published[0].items;states={orders:rows};f.client.confirmCommitted(states);
 assert.equal(commits.length,1);off();const pendingBefore=f.pending.length;subscribe();
 assert.equal(f.pending.length,pendingBefore+1);assert.equal(f.client.getReadinessDiagnostics().streams[0].pending,true);
 await turn();const next=f.messages.filter(message=>message.type==='subscribe').at(-1).streamId;
 await f.receive({type:'cache',streamId:next,packetId:4,count:1,metadata:{fromCache:true,hasPendingWrites:false}});
 f.client.confirmCommitted(states);assert.equal(commits.length,1,'old committed rows and cache receipt cannot confirm this subscription');
 await f.receive({type:'begin',streamId:next,packetId:5,revision:1,mode:'metadata',count:1,changeCount:0,metadata,baselineId:'confirmed-one'});
 await f.receive({type:'complete',streamId:next,packetId:6,revision:1,chunks:0,baselineId:'confirmed-one'});
 assert.equal(f.published.at(-1).items,rows);assert.equal(commits.length,2,'a complete new server publication may reuse an exact committed identity');
 const count=f.pending.length;f.client.beginPublication('orders',true);assert.equal(f.pending.length,count,'unchanged ACK is not a new pending generation');
 f.client.close();assert.equal(f.pending.length,count);
});

test('closed and obsolete owner clients cannot issue pending or commit notifications',async()=>{
 for(const close of[false,true]){
  let current=true;const f=fixture({isCurrent:()=>current});f.subscribe();await turn();
  const count=f.pending.length;if(close)f.client.close();else current=false;
  f.client.beginPublication('orders');f.subscribe();f.client.confirmCommitted({orders:[]});
  assert.equal(f.pending.length,count);f.client.close();
 }
});

test('worker transport defers subscription until SDK Auth ready, publishes only complete snapshots and reuses confirmed rows after reopening',async()=>{
  const f=fixture();const off=f.subscribe();await turn();
  assert.equal(f.messages.filter(m=>m.type==='subscribe').length,0);
  await f.receive({type:'ready'});const id=f.messages.find(m=>m.type==='subscribe').streamId;
  await f.receive({type:'ready'});assert.equal(f.messages.filter(m=>m.type==='subscribe').length,1);
  await f.receive({type:'begin',streamId:id,packetId:1,revision:1,mode:'full',count:2,changeCount:null,metadata});
  await f.receive({type:'chunk',streamId:id,packetId:2,revision:1,index:0,rows:[{id:'a',type:'full',value:{amount:1}},{id:'b',type:'full',value:{amount:2}}]});
  assert.equal(f.published.length,0);
  await f.receive({type:'complete',streamId:id,packetId:3,revision:1,chunks:1});
  assert.equal(f.published.length,1);const first=f.published[0].items;
  off();f.subscribe();await turn();const next=f.messages.filter(m=>m.type==='subscribe').at(-1).streamId;
  await f.receive({type:'begin',streamId:next,packetId:4,revision:1,mode:'full',count:2,changeCount:null,metadata});
  await f.receive({type:'chunk',streamId:next,packetId:5,revision:1,index:0,rows:[{id:'a',type:'full',value:{amount:1}},{id:'b',type:'full',value:{amount:2}}]});
  await f.receive({type:'complete',streamId:next,packetId:6,revision:1,chunks:1});
  assert.equal(f.published[1].items,first);
  await f.receive({type:'begin',streamId:id,packetId:7,revision:2,mode:'full',count:0,changeCount:0,metadata});
  assert.equal(f.published.length,2,'old subscription IDs cannot publish into the reopened source');
  assert.deepEqual(f.errors,[]);f.client.close();
});

test('reopened source presents its exact completed baseline; unknown initial metadata falls back without publication',async()=>{
 for(const wrong of [false,true]){
  const f=fixture();const off=f.subscribe();await turn();await f.receive({type:'ready'});const first=f.messages.find(m=>m.type==='subscribe').streamId;
  await f.receive({type:'begin',streamId:first,packetId:1,revision:1,mode:'full',count:1,changeCount:null,metadata});
  await f.receive({type:'chunk',streamId:first,packetId:2,revision:1,index:0,rows:[{id:'a',type:'full',value:{amount:1}}]});
  await f.receive({type:'complete',streamId:first,packetId:3,revision:1,chunks:1,baselineId:'confirmed-one'});
  const original=f.published[0].items;off();f.subscribe();await turn();const request=f.messages.filter(m=>m.type==='subscribe').at(-1);
  assert.equal(request.baselineId,'confirmed-one');
  await f.receive({type:'begin',streamId:request.streamId,packetId:4,revision:1,mode:'metadata',count:1,changeCount:0,metadata,baselineId:wrong?'wrong':'confirmed-one'});
  if(wrong){assert.equal(f.fallbacks.filter(x=>x==='started').length,1);assert.equal(f.published.length,1)}
  else {await f.receive({type:'complete',streamId:request.streamId,packetId:5,revision:1,chunks:0,baselineId:'confirmed-one'});assert.equal(f.published[1].items,original);assert.deepEqual(f.fallbacks,[])}
  f.client.close();
 }
});

test('queued and source-started notifications keep data pending until its actual publication witness',async()=>{
  const f=fixture();f.subscribe();await turn();await f.receive({type:'ready'});
  const id=f.messages.find(message=>message.type==='subscribe').streamId;
  assert.equal(f.client.getReadinessDiagnostics().streams[0].phase,'queued');
  await f.receive({type:'source-started',streamId:id});
  const status=f.client.getReadinessDiagnostics().streams[0];
  assert.equal(status.phase,'subscribing');assert.equal(status.pending,true);assert.equal(status.expectedSet,false);
  assert.equal(f.published.length,0);assert(!f.messages.some(message=>message.type==='ack'));
  f.client.close();
});

test('unsupported or incomplete worker payload falls back once to the original authorized listener, never empty success',async()=>{
  const f=fixture();f.subscribe();await turn();await f.receive({type:'ready'});const id=f.messages.find(m=>m.type==='subscribe').streamId;
  await f.receive({type:'begin',streamId:id,packetId:1,revision:1,mode:'full',count:10,changeCount:null,metadata});
  await f.receive({type:'complete',streamId:id,packetId:2,revision:1,chunks:0});
  await f.receive({type:'fallback',streamId:id,code:'worker-value-unsupported'});
  assert.equal(f.published.length,0);assert.equal(f.fallbacks.filter(x=>x==='started').length,1);
  f.client.close();assert.equal(f.stats().stopped,1);
});

test('complete-snapshot ACK waits for asynchronous publication and cannot escape after unsubscribe',async()=>{
  for(const stopEarly of [false,true]){
    const f=fixture();let release,started=false;
    const off=f.client.subscribe('orders',{publish:()=>{started=true;return new Promise(resolve=>release=resolve)},error:()=>{},fallback:()=>()=>{}});
    await turn();await f.receive({type:'ready'});const id=f.messages.find(m=>m.type==='subscribe').streamId;
    await f.receive({type:'begin',streamId:id,packetId:1,revision:1,mode:'full',count:0,changeCount:null,metadata});
    await f.receive({type:'complete',streamId:id,packetId:2,revision:1,chunks:0});
    assert.equal(started,true);assert.equal(f.messages.some(m=>m.type==='ack'&&m.packetId===2),false);
    if(stopEarly)off();release();await turn();
    assert.equal(f.messages.some(m=>m.type==='ack'&&m.packetId===2),!stopEarly);f.client.close();
  }
});

test('Auth initialization failure uses same-session fallback, but an observed account-scope change closes instead of falling back',async()=>{
  const failed=fixture();failed.subscribe();await turn();await failed.receive({type:'init-failed'});
  assert.equal(failed.fallbacks.filter(x=>x==='started').length,1);failed.client.close();
  const f=fixture();f.subscribe();await turn();await f.receive({type:'ready'});
  await f.receive({type:'auth-invalid'});assert.equal(f.stats().authInvalid,1);
  assert.equal(f.fallbacks.length,0);assert.equal(f.stats().terminated,1);
  await f.receive({type:'ready'});assert.equal(f.messages.filter(m=>m.type==='subscribe').length,1);
});

test('budget-exhausted decoding yields through a real task and closing cancels publication and ACK',async()=>{
 for(const cancel of [false,true]){
  let time=0;
  const f=fixture({now:()=>time+=5});f.subscribe();await turn();await f.receive({type:'ready'});
  const id=f.messages.find(m=>m.type==='subscribe').streamId;
  await f.receive({type:'begin',streamId:id,packetId:1,revision:1,mode:'full',count:64,changeCount:null,metadata});
  f.worker.onmessage({data:{scopeId:f.messages[0].scopeId,type:'chunk',streamId:id,packetId:2,revision:1,index:0,
   rows:Array.from({length:64},(_,i)=>({id:String(i),type:'full',value:{amount:i}}))}});
  assert.equal(f.messages.some(m=>m.type==='ack'&&m.packetId===2),false);
  if(cancel)f.client.close();
  for(let turns=0;turns<100&&!cancel&&!f.messages.some(m=>m.type==='ack'&&m.packetId===2);turns++)await turn();
  assert.equal(f.messages.some(m=>m.type==='ack'&&m.packetId===2),!cancel);
  assert.equal(f.published.length,0,'chunks never publish partial data');
  if(!cancel){
   await f.receive({type:'complete',streamId:id,packetId:3,revision:1,chunks:1});
   assert.equal(f.published[0].items.length,64);
   assert.deepEqual(f.published[0].items.map(row=>row.data.amount),Array.from({length:64},(_,i)=>i));
   f.client.close();
  }else await turn();
  assert.deepEqual(f.fallbacks,[]);
 }
});

test('close during token refresh cannot spawn a later worker or publish a previous tenant',async()=>{
  let resolve,spawns=0;const promise=new Promise(r=>resolve=r);
  const f=fixture({user:{uid:'fixture-user',getIdToken:()=>promise},workerFactory:()=>{spawns++;throw Error('Must not spawn')}});
  f.subscribe();f.client.close();resolve();await turn();assert.equal(spawns,0);assert.equal(f.published.length,0);
});

test('single bootstrap and bounded manager inbox sources may use the worker; customer/multi-source paths stay on their existing scope',()=>{
  for(const col of ['companies','employees'])assert.equal(canUseFirestoreReadWorker(col,1,false),true);
  assert.equal(canUseFirestoreReadWorker('companies',1,true),false);
  assert.equal(canUseFirestoreReadWorker('employees',2,false),false);
  assert.equal(canUseFirestoreReadWorker('messages',1,false),true);
  assert.equal(canUseFirestoreReadWorker('messages',2,false),false);
  assert.equal(canUseFirestoreReadWorker('messages',1,true),false);
  assert.equal(canUseFirestoreReadWorker('notifications',1,false),true);
  assert.equal(canUseFirestoreReadWorker('notifications',1,true),false);
  assert.equal(canUseFirestoreReadWorker('notifications',2,false),false);
  assert.equal(canUseFirestoreReadWorker('orders',1,true),false);
  assert.equal(canUseFirestoreReadWorker('orders',2,false),false);
  assert.equal(canUseFirestoreReadWorker('orders/other',1,false),false);
  assert.equal(canUseFirestoreReadWorker('orders',1,false),true);
});

test('refresh stays visible through queued or abandoned React work until the current state reference commits',async()=>{
  const activity=createReadWorkerActivityStore();let states={};const commits=[];
  const f=fixture({activity,getCommittedStates:()=>states,onCommitted:value=>commits.push(value)});const off=f.subscribe();await turn();
  assert.equal(activity.getSnapshot(),1);
  const first=[{amount:1}],second=[{amount:2}];
  const version=f.client.beginPublication('orders');
  assert.equal(f.client.isPublicationCurrent('orders',version),true);
  f.client.expectCommit('orders',version,first);f.client.publicationScheduled('orders');await turn();
  assert.equal(activity.getSnapshot(),1,'queued state is not committed data');
  const next=f.client.beginPublication('orders');
  assert.equal(f.client.isPublicationCurrent('orders',version),false);
  f.client.expectCommit('orders',version,first);
  states={orders:first};f.client.confirmCommitted(states);
  assert.equal(activity.getSnapshot(),1,'an older generation cannot satisfy a new snapshot');
  f.client.expectCommit('orders',next,second);
  f.client.beginPublication('orders',true);await turn();
  assert.equal(activity.getSnapshot(),1,'metadata ACK cannot bypass an uncommitted update');
  assert.equal(commits.length,0);
  states={orders:second};f.client.confirmCommitted(states);
  assert.equal(activity.getSnapshot(),0);
  const diagnostic=f.client.getReadinessDiagnostics().streams[0];
  assert.deepEqual(Object.fromEntries(['collection','pending','generation','fallback','expectedSet','expectedCommitted'].map(k=>[k,diagnostic[k]])),{collection:'orders',pending:false,generation:next,fallback:false,expectedSet:true,expectedCommitted:true});
  assert.equal(diagnostic.phase,'committed');
  assert.equal(JSON.stringify(f.client.getReadinessDiagnostics()).includes('fixture-user'),false);
  assert.deepEqual(commits,[{collectionName:'orders',generation:next}]);
  // React may bail out when a full server snapshot has the same state identity.
  const noop=f.client.beginPublication('orders');f.client.expectCommit('orders',noop,second);
  f.client.publicationScheduled('orders');await turn();assert.equal(activity.getSnapshot(),0);
  f.client.beginPublication('orders');assert.equal(activity.getSnapshot(),1);
  off();assert.equal(activity.getSnapshot(),0);f.client.close();
  assert.equal(f.client.isPublicationCurrent('orders',next),false);
});

test('activity cleanup is scoped to a client and never clears another tenant stream',async()=>{
  const activity=createReadWorkerActivityStore();const a=fixture({activity}),b=fixture({activity});
  a.subscribe();b.subscribe();await turn();assert.equal(activity.getSnapshot(),2);
  a.client.close();assert.equal(activity.getSnapshot(),1);
  b.client.close();assert.equal(activity.getSnapshot(),0);
});

test('reopen snapshots are bounded, empty collections do not evict useful baselines, and evicted sources require full transfer',async()=>{
  const f=fixture({retainedSnapshotLimit:2});await turn();await f.receive({type:'ready'});
  const open=name=>{
    const off=f.client.subscribe(name,{publish:(snapshot,items)=>f.published.push({snapshot,items}),error:()=>{},fallback:()=>()=>{}});
    return {off,...f.messages.filter(message=>message.type==='subscribe').at(-1)};
  };
  let packetId=0;
  const full=async(entry,rows,revision=1)=>{
    await f.receive({type:'begin',streamId:entry.streamId,packetId:++packetId,revision,mode:'full',count:rows.length,changeCount:null,metadata});
    if(rows.length)await f.receive({type:'chunk',streamId:entry.streamId,packetId:++packetId,revision,index:0,rows:rows.map(([id,amount])=>({id,type:'full',value:{amount}}))});
    await f.receive({type:'complete',streamId:entry.streamId,packetId:++packetId,revision,chunks:rows.length?1:0,baselineId:`${entry.collectionName}-${revision}`});
  };
  const a=open('source_a');await full(a,[['a',1]]);const aItems=f.published.at(-1).items;
  const b=open('source_b');await full(b,[['b',2]]);b.off();
  for(let i=0;i<12;i++){const empty=open(`empty_${i}`);await full(empty,[]);empty.off()}
  const reopenedB=open('source_b');assert.equal(reopenedB.baselineId,'source_b-1');reopenedB.off();
  const c=open('source_c');await full(c,[['c',3]]);c.off();
  const evictedA=open('source_a');assert.equal(evictedA.baselineId,null,'oldest nonempty snapshot must not be retained indefinitely');
  assert.equal(f.published.at(-1).items[0].id,'c','cache eviction must never publish an empty array or replace business state');
  await full(evictedA,[['a',9]]);assert.equal(f.published.at(-1).items[0].data.amount,9);evictedA.off();
  // Evicting reopen state cannot clear a live assembler's independently owned baseline.
  await f.receive({type:'begin',streamId:a.streamId,packetId:++packetId,revision:2,mode:'delta',count:1,changeCount:1,metadata});
  await f.receive({type:'chunk',streamId:a.streamId,packetId:++packetId,revision:2,index:0,rows:[{id:'a',type:'modified',oldIndex:0,newIndex:0,value:{amount:4}}]});
  await f.receive({type:'complete',streamId:a.streamId,packetId:++packetId,revision:2,chunks:1,baselineId:'source_a-2'});
  assert.equal(f.published.at(-1).items[0].data.amount,4);assert.equal(aItems[0].data.amount,1,'already published records stay immutable');
  assert.deepEqual(f.fallbacks,[]);a.off();f.client.close();
});

test('emptying a retained collection drops its reopen token without altering its published snapshot',async()=>{
  const f=fixture();let off=f.subscribe();await turn();await f.receive({type:'ready'});const first=f.messages.find(message=>message.type==='subscribe');
  await f.receive({type:'begin',streamId:first.streamId,packetId:1,revision:1,mode:'full',count:1,changeCount:null,metadata});
  await f.receive({type:'chunk',streamId:first.streamId,packetId:2,revision:1,index:0,rows:[{id:'a',type:'full',value:{amount:1}}]});
  await f.receive({type:'complete',streamId:first.streamId,packetId:3,revision:1,chunks:1,baselineId:'nonempty'});
  await f.receive({type:'begin',streamId:first.streamId,packetId:4,revision:2,mode:'full',count:0,changeCount:1,metadata});
  await f.receive({type:'complete',streamId:first.streamId,packetId:5,revision:2,chunks:0,baselineId:'empty-token'});
  assert.deepEqual(f.published.at(-1).items,[]);off();off=f.subscribe();
  assert.equal(f.messages.filter(message=>message.type==='subscribe').at(-1).baselineId,null);
  off();f.client.close();
});

test('reopen retention limit cannot exceed the worker baseline bound',()=>{
  for(const retainedSnapshotLimit of [0,-1,1.5,9,Infinity])assert.throws(()=>fixture({retainedSnapshotLimit}),TypeError);
});

test('active-source publication does not evict an inactive exact reopen baseline',async()=>{
 const f=fixture({retainedSnapshotLimit:2});await turn();await f.receive({type:'ready'});let packet=0;
 const open=name=>{const off=f.client.subscribe(name,{publish:(snapshot,items)=>f.published.push({snapshot,items}),error:()=>{},fallback:()=>()=>{}});return{off,...f.messages.filter(m=>m.type==='subscribe').at(-1)}};
 const full=async(entry,revision)=>{
  await f.receive({type:'begin',streamId:entry.streamId,packetId:++packet,revision,mode:'full',count:1,changeCount:null,metadata});
  await f.receive({type:'chunk',streamId:entry.streamId,packetId:++packet,revision,index:0,rows:[{id:'one',type:'full',value:{amount:revision}}]});
  await f.receive({type:'complete',streamId:entry.streamId,packetId:++packet,revision,chunks:1,baselineId:`${entry.collectionName}-${revision}`});
 };
 const a=open('active_a'),b=open('active_b');await full(a,1);await full(b,1);
 const closed=open('closed_history');await full(closed,1);const original=f.published.at(-1).items;closed.off();
 await full(a,2);await full(b,2);
 const reopened=open('closed_history');assert.equal(reopened.baselineId,'closed_history-1');
 await f.receive({type:'begin',streamId:reopened.streamId,packetId:++packet,revision:1,mode:'metadata',count:1,changeCount:0,metadata,baselineId:'closed_history-1'});
 await f.receive({type:'complete',streamId:reopened.streamId,packetId:++packet,revision:1,chunks:0,baselineId:'closed_history-1'});
 assert.equal(f.published.at(-1).items,original);reopened.off();a.off();b.off();f.client.close();
});

test('opt-in source diagnostics preserve auth envelope and log metadata only',async()=>{
 const oldLocation=globalThis.location,oldInfo=console.info,logs=[];let f;
 try{globalThis.location={search:'?hd_home_sources=1&hd_source_profile=balanced'};console.info=message=>logs.push(message);f=fixture();f.subscribe();await turn();const init=f.messages.find(m=>m.type==='init');assert.equal(init.diagnostics,true);assert.equal(init.transferProfile,'balanced-64k');await f.receive({type:'source-timing',event:'query-start',collection:'orders',logicalQueries:1,initialQueueMs:0});assert(logs.some(line=>line.includes('query-start')));assert(!logs.join('').includes('synthetic-access'));assert(!logs.join('').includes('synthetic-refresh'));assert.equal(f.fallbacks.length,0);}finally{f?.client.close();console.info=oldInfo;if(oldLocation===undefined)delete globalThis.location;else globalThis.location=oldLocation;}
});
