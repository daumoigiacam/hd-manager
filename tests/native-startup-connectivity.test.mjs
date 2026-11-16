import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {build} from 'esbuild';

class WindowEvents extends EventTarget {
  listeners=new Map();
  addEventListener(type,listener,...args){super.addEventListener(type,listener,...args);if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(listener);}
  removeEventListener(type,listener,...args){super.removeEventListener(type,listener,...args);this.listeners.get(type)?.delete(listener);}
  count(type){return this.listeners.get(type)?.size||0;}
}
async function waitFor(predicate){const until=Date.now()+3000;while(!predicate()){if(Date.now()>until)throw Error('Controller did not settle');await new Promise(resolve=>setTimeout(resolve,5));}}
async function controller(enabled,fixture={}) {
  const source=await readFile('development/hd-manager/application/src/services/nativeStartupController.js','utf8');
  const stubs={
    '@hd/native-bootstrap-core':'export const preloadedNativeCore=null;',
    './offlineStartupTrace.js':'export const startupMark=()=>{};',
    '@capacitor/core':"export const Capacitor={getPlatform:()=>'android'};export const registerPlugin=()=>({});",
    './nativeConnectivity.js':'export const runtimeOnline=()=>navigator.onLine;export const createNativeConnectivityObserver=()=>({start(){},close(){}});',
    './startupTelemetry.js':'export const recordStartupEvent=()=>{};',
    '../config/offlineRuntimeBuildConfig.js':`export const trustedOfflineEnabled=${enabled};export const trustedOfflineEnvironment={apiBaseUrl:'https://app.hdconnect.net/api/offline/',publicKey:{}};`,
    './firebaseClientRuntime.js':'export const auth=fixture.auth;',
    'firebase/auth':'export function onAuthStateChanged(auth,listener){fixture.observers++;listener(auth.currentUser);return()=>fixture.observers--;}',
    '../features/hr/nativeAttendanceProviders.js':'export const createNativeAttendanceProviders=()=>{};',
    '../data/webOfflinePlatform.js':'export const createWebCustomerPlatform=async()=>fixture.platform;',
    '../data/nativeOfflineCustomerPlatform.js':'export const createNativeCustomerPlatform=async()=>fixture.platform;',
    '../data/bootstrapOfflineCustomer.js':'export const bootstrapOfflineCustomer=(options)=>fixture.bootstrap(options);',
    '../data/offlineAppSession.js':'export const createOfflineRuntimeOwner=()=>{fixture.owners++;return fixture.owner;};',
    '../data/offlineCustomerTransport.js':'export const createOfflineCustomerTransport=()=>fixture.transport;',
    './offlineHomeSync.js':'export const createOfflineHomeSync=()=>{};',
  };
  const bundled=await build({stdin:{contents:source,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs',
    define:{'import.meta.env':JSON.stringify({MODE:'production',VITE_FIREBASE_PROJECT_ID:'hd-manager-c5839'})},
    plugins:[{name:'test-boundaries',setup(b){b.onResolve({filter:/.*/},args=>{assert.ok(Object.hasOwn(stubs,args.path),args.path);return {path:args.path,namespace:'stub'};});b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path]}));}}]});
  const window=new WindowEvents(),navigator={onLine:true},module={exports:{}};
  vm.runInNewContext(bundled.outputFiles[0].text,{module,exports:module.exports,fixture,window,navigator,
    setTimeout,clearTimeout,crypto:globalThis.crypto,console:{info(){},warn(){}}});
  const store=module.exports.getNativeStartupController(fixture.auth);
  return {store,window,navigator,getAgain:()=>module.exports.getNativeStartupController(fixture.auth)};
}
test('Cloud-only controller publishes connectivity without initializing a database and removes its listeners',async()=>{
  const fixture={owners:0};const {store,window,navigator,getAgain}=await controller(false,fixture);
  assert.equal(getAgain(),store);assert.equal(window.count('online'),1);assert.equal(window.count('offline'),1);
  let events=0;const release=store.subscribe(()=>events++);
  navigator.onLine=false;window.dispatchEvent(new Event('offline'));assert.equal(store.getSnapshot().online,false);
  navigator.onLine=true;window.dispatchEvent(new Event('online'));assert.equal(store.getSnapshot().online,true);
  assert.equal(events,2);assert.equal(fixture.owners,0);release();
  const cached=new Event('pagehide');Object.defineProperty(cached,'persisted',{value:true});window.dispatchEvent(cached);
  assert.equal(window.count('online'),1);
  window.dispatchEvent(new Event('pagehide'));assert.equal(window.count('online'),0);assert.equal(window.count('offline'),0);
});
test('A failed initial grant retries on reconnect without a second Auth observer or Runtime owner',async()=>{
  let installed=false,available=false,requests=0,starts=0;
  const runtime={scope:{principalId:'A',tenantId:'tenant-A'},isCurrent:()=>true,subscribe:()=>()=>{},startNetwork(){starts++;},close(){}};
  const fixture={owners:0,observers:0,auth:{currentUser:{uid:'A',isAnonymous:false},authStateReady:async()=>{}},
    platform:{secureStore:{readIdentity:async()=>null},installOnlineGrant:async()=>{installed=true;},discardPreparedDatabase:async()=>{}},
    owner:{replace:factory=>factory(),close:async()=>{},dispose:async()=>{}},
    transport:{grant:async()=>{requests++;if(!available)throw Error('network unavailable');return {};}},
    bootstrap:async()=>{if(!installed)throw Error('No verified session');return runtime;}};
  const {store,window,navigator,getAgain}=await controller(true,fixture);store.attachUI();
  await waitFor(()=>requests===1&&store.getSnapshot().error==='network unavailable');
  assert.equal(store.getSnapshot().runtime,null);assert.equal(getAgain(),store);
  available=true;navigator.onLine=false;window.dispatchEvent(new Event('offline'));
  navigator.onLine=true;window.dispatchEvent(new Event('online'));
  await waitFor(()=>store.getSnapshot().runtime===runtime);
  assert.equal(requests,2);assert.equal(starts,1);assert.equal(fixture.owners,1);assert.equal(fixture.observers,1);
  window.dispatchEvent(new Event('pagehide'));await waitFor(()=>fixture.observers===0);
});

function recoverableFixture(grant){
 const make=label=>{let valid=true;const listeners=new Set();return{label,scope:{principalId:'A',tenantId:'tenant-A'},
  expiresAtMs:Date.now()+60000,isCurrent:()=>valid,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},startNetwork(){},close(){valid=false;},
  invalidate(){valid=false;for(const listener of [...listeners])listener();},get listeners(){return listeners.size;}};};
 const old=make('old'),fresh=make('new');let installed=false;
 const f={owners:0,observers:0,requests:0,installs:0,old,fresh,
  auth:{currentUser:{uid:'A',isAnonymous:false},authStateReady:async()=>{}},
  platform:{secureStore:{readIdentity:async()=>null},installOnlineGrant:async()=>{f.installs++;installed=true;},discardPreparedDatabase:async()=>{}},
  owner:{replace:factory=>factory(),close:async()=>{},dispose:async()=>{}},
  transport:{grant:async()=>{f.requests++;return grant(f);}},bootstrap:async()=>installed?fresh:old};return f;
}
test('closed signed directory is hidden immediately and reverified online without a second owner or Auth observer',async()=>{
 let accept;const f=recoverableFixture(()=>new Promise(resolve=>{accept=resolve;}));
 const {store,window}=await controller(true,f);store.attachUI();await waitFor(()=>store.getSnapshot().runtime===f.old&&f.observers===1);
 f.old.invalidate();assert.equal(store.getSnapshot().runtime,null);await waitFor(()=>f.requests===1);
 assert.equal(f.installs,0);assert.equal(store.getSnapshot().runtime,null,'old private data cannot return while a new grant is pending');
 accept({});await waitFor(()=>store.getSnapshot().runtime===f.fresh);
 assert.equal(f.installs,1);assert.equal(f.owners,1);assert.equal(f.observers,1);assert.equal(f.old.listeners,0);assert.equal(f.fresh.listeners,1);
 window.dispatchEvent(new Event('pagehide'));await waitFor(()=>f.observers===0);
});
test('server-denied authority recovery fails closed once; repeated closed-owner notifications cannot loop',async()=>{
 const f=recoverableFixture(()=>{throw Object.assign(Error('permission revoked'),{code:'permission-denied'});});
 const {store,window}=await controller(true,f);store.attachUI();await waitFor(()=>store.getSnapshot().runtime===f.old&&f.observers===1);
 f.old.invalidate();await waitFor(()=>f.requests===1&&store.getSnapshot().error==='Phiên hoặc quyền Offline đã kết thúc. Giao dịch đang chờ vẫn được giữ trên máy.');
 for(let i=0;i<20;i++)f.old.invalidate();await new Promise(resolve=>setTimeout(resolve,30));
 assert.equal(f.requests,1);assert.equal(f.installs,0);assert.equal(store.getSnapshot().runtime,null);window.dispatchEvent(new Event('pagehide'));
});
test('offline closure does not request a grant; logout during online recovery cannot republish old account data',async()=>{
 let accept;const f=recoverableFixture(()=>new Promise(resolve=>{accept=resolve;}));
 const {store,window,navigator}=await controller(true,f);store.attachUI();await waitFor(()=>store.getSnapshot().runtime===f.old&&f.observers===1);
 navigator.onLine=false;window.dispatchEvent(new Event('offline'));f.old.invalidate();await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(f.requests,0);assert.equal(store.getSnapshot().runtime,null);
 navigator.onLine=true;window.dispatchEvent(new Event('online'));await waitFor(()=>f.requests===1);
 await store.getSnapshot().controller.logout();accept({});await new Promise(resolve=>setTimeout(resolve,30));
 assert.equal(f.installs,0);assert.equal(store.getSnapshot().runtime,null);window.dispatchEvent(new Event('pagehide'));
});
test('switching A to B while revalidation is pending cannot install or publish the grant for A',async()=>{
 let accept;const f=recoverableFixture(()=>new Promise(resolve=>{accept=resolve;}));
 const {store,window}=await controller(true,f);store.attachUI();await waitFor(()=>store.getSnapshot().runtime===f.old&&f.observers===1);
 f.old.invalidate();await waitFor(()=>f.requests===1);
 await store.getSnapshot().controller.beforeIdentityChange('B');f.auth.currentUser={uid:'B',isAnonymous:false};
 accept({});await new Promise(resolve=>setTimeout(resolve,30));
 assert.equal(f.installs,0);assert.equal(store.getSnapshot().runtime,null);assert.equal(f.old.listeners,0);
 window.dispatchEvent(new Event('pagehide'));
});
