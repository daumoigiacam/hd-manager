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
  const messages=[],published=[],errors=[],fallbacks=[];let stopped=0,terminated=0,authInvalid=0;
  const worker={postMessage:message=>messages.push(message),terminate(){terminated++}};
  const user={uid:'fixture-user',auth:{app:{name:'[DEFAULT]'}},getIdToken:async()=>{},toJSON:()=>({uid:'fixture-user',apiKey:'fixture-api',appName:'[DEFAULT]',
    emailVerified:false,isAnonymous:false,stsTokenManager:{accessToken:'synthetic-access',refreshToken:'synthetic-refresh',expirationTime:Date.now()+3600000}})};
  const client=createFirestoreReadWorkerClient({user,config:{projectId:'demo-worker-client',apiKey:'fixture-api'},appId:'fixture-app',companyId:'fixture-company',accountType:'employee',
    workerFactory:()=>worker,onAuthInvalid:()=>authInvalid++,onFallback:value=>fallbacks.push(value),...extra});
  const subscribe=()=>client.subscribe('orders',{publish:(snapshot,items)=>published.push({snapshot,items}),error:error=>errors.push(error),fallback:()=>{fallbacks.push('started');return()=>stopped++}});
  const receive=async message=>{worker.onmessage({data:{scopeId:messages.find(m=>m.type==='init').scopeId,...message}});await turn()};
  return {client,messages,published,errors,fallbacks,subscribe,receive,worker,stats:()=>({stopped,terminated,authInvalid})};
}

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

test('close during token refresh cannot spawn a later worker or publish a previous tenant',async()=>{
  let resolve,spawns=0;const promise=new Promise(r=>resolve=r);
  const f=fixture({user:{uid:'fixture-user',getIdToken:()=>promise},workerFactory:()=>{spawns++;throw Error('Must not spawn')}});
  f.subscribe();f.client.close();resolve();await turn();assert.equal(spawns,0);assert.equal(f.published.length,0);
});

test('identity, bounded inbox and customer-scoped sources keep the existing proven subscription path',()=>{
  for(const col of ['companies','employees','messages'])assert.equal(canUseFirestoreReadWorker(col,1,false),false);
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
