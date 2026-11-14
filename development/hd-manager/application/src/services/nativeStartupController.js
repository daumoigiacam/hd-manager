import {preloadedNativeCore} from '@hd/native-bootstrap-core';
import {startupMark} from './offlineStartupTrace.js';
import {Capacitor} from '@capacitor/core';
import {recordStartupEvent} from './startupTelemetry.js';
import {trustedOfflineEnabled,trustedOfflineEnvironment} from '../config/offlineRuntimeBuildConfig.js';

// One App-owned runtime. Trusted builds require explicit HTTPS/public-key
// configuration; the original isolated Emulator route stays opt-in.
const enabled=trustedOfflineEnabled||(import.meta.env.MODE==='emulator'&&import.meta.env.VITE_OFFLINE_CUSTOMER_PILOT==='true'&&Capacitor.getPlatform()==='android'&&/^demo-/.test(import.meta.env.VITE_FIREBASE_PROJECT_ID||''));

let singleton;
const defaultAuth=()=>import('./firebaseClientRuntime.js').then(value=>value.auth);
export function getNativeStartupController(authSource=defaultAuth){
 if(singleton)return singleton;
 let snapshot={runtime:null,verifiedLaunch:null,restored:false,error:'',settled:!enabled,controller:null,enabled,online:navigator.onLine};
 const subscribers=new Set();let uiAttached=false,startUiNetwork=()=>{};
 const emit=patch=>{snapshot={...snapshot,...patch};for(const listener of subscribers)listener();};
 const setState=value=>emit(typeof value==='function'?value(snapshot):value);
 const setController=controller=>emit({controller});const setSettled=settled=>emit({settled});
 const updateOnline=()=>emit({online:navigator.onLine});
 const store={getSnapshot:()=>snapshot,subscribe(listener){subscribers.add(listener);return()=>subscribers.delete(listener);},attachUI(){uiAttached=true;startUiNetwork();},inspect(){return{owners:enabled?1:0,subscribers:subscribers.size,uiAttached};}};
 singleton=store;
 // Connectivity also belongs to cloud-only builds. Otherwise their snapshot
 // stays at the launch value and CRM can wait on Firebase forever while offline.
 window.addEventListener('online',updateOnline);window.addEventListener('offline',updateOnline);
 if(!enabled){
  const pagehide=event=>{if(event.persisted)return;window.removeEventListener('pagehide',pagehide);window.removeEventListener('online',updateOnline);window.removeEventListener('offline',updateOnline);};
  window.addEventListener('pagehide',pagehide);
  return store;
 }
 startupMark('controller.created',{instances:1});
 function initialize(){
  let disposed=false,owner,off=()=>{},release=()=>{},platform,transport,current=null,generation=0,desiredPrincipal=null,networkTimer=null,removeAuthOnline=()=>{},removeIdentity=()=>{};
  let auth=typeof authSource==='function'?null:authSource,authClientPromise=null;
  const authClient=()=>authClientPromise||(authClientPromise=Promise.all([auth?Promise.resolve(auth):authSource(),import('firebase/auth')]).then(([value,fa])=>{if(!value)throw Error('Firebase Auth unavailable');auth=value;return{auth,fa};}));
  let setupResolve;const setupReady=new Promise(resolve=>{setupResolve=resolve;});
  let launchExpiry=null;const clearLaunch=()=>{clearTimeout(launchExpiry);launchExpiry=null;};
  const clearPublished=()=>{release();clearLaunch();if(!disposed)setState({runtime:null,verifiedLaunch:null,restored:false,error:''});};
  setController({
   async beforeIdentityChange(uid){
    // Legacy Identity responses need not carry firebaseUid. Block installation
    // until Firebase itself confirms the replacement identity in that case.
    desiredPrincipal=typeof uid==='string'&&uid?uid:'';generation++;clearPublished();
    if(!await setupReady)throw Error('Không thể xác minh bộ lưu trữ phiên Offline.');
    const identity=await platform.secureStore.readIdentity();
    if(identity&&identity.principalId!==uid)await platform.secureStore.revoke(identity);
    current?.close();current=null;void owner.close();
   },
   async logout(){
    desiredPrincipal='';generation++;clearPublished();
    if(!await setupReady)throw Error('Không thể thu hồi phiên Offline an toàn.');
    const identity=await platform.secureStore.readIdentity();
    if(identity)await platform.secureStore.revoke(identity);
    if(current)await current.close();current=null;await owner.close();
   },
   async acceptFirebaseIdentity(uid){
    const {auth:client}=await authClient(),user=client.currentUser;
    if(!uid||!user||user.isAnonymous||user.uid!==uid)throw Error('Firebase identity confirmation mismatch');
    desiredPrincipal=uid;
    void installObserved(user);
   },
  });
  const projectId=import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const uuid=()=>crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
  const publish=(runtime,restored)=>{
   if(disposed)return;release();current=runtime;
   release=runtime.subscribe(()=>{if(!runtime.isCurrent()&&!disposed)setState({runtime:null,verifiedLaunch:null,restored:false,error:'Phiên hoặc quyền Offline đã kết thúc. Giao dịch đang chờ vẫn được giữ trên máy.'});});
   clearLaunch();setState(previous=>({...previous,runtime,verifiedLaunch:previous.verifiedLaunch&&JSON.stringify(previous.verifiedLaunch.scope)===JSON.stringify(runtime.scope)?previous.verifiedLaunch:null,restored,error:''}));
   console.info('WORKSPACE_LOCAL_READY '+JSON.stringify({restored,tenant:runtime.scope.tenantId,expiresAtMs:runtime.expiresAtMs}));
  };
  let installing=null;
  async function install(user){
   if(disposed||!user||user.isAnonymous||(desiredPrincipal!==null&&desiredPrincipal!==user.uid))return;
   if(installing)return installing.then(()=>{if(!disposed&&auth.currentUser===user&&(!current?.isCurrent()||current.scope.principalId!==user.uid))return install(user);});
   const ticket=generation;
   installing=(async()=>{
    if(current?.scope.principalId!==user.uid){release();await owner.close();current=null;setState({runtime:null,verifiedLaunch:null,restored:false,error:''});}
    if(disposed||ticket!==generation||auth.currentUser!==user)return;
    if(current?.isCurrent()&&current.scope.principalId===user.uid){current.startNetwork();return;}
    const grant=await transport.grant(uuid());
    if(disposed||ticket!==generation||auth.currentUser!==user)return;
    await platform.installOnlineGrant({grant,verifiedUid:user.uid});
    const runtime=await restore();
    if(disposed||ticket!==generation||auth.currentUser!==user){await owner.close(runtime);return;}
    publish(runtime,false);runtime.startNetwork();
   })().finally(()=>{installing=null;});return installing;
  }
  async function installObserved(user){
   const ticket=generation;
   try{await install(user);}catch(error){
    if(!disposed&&ticket===generation&&auth?.currentUser===user)setState(previous=>({...previous,error:previous.error||error.message}));
   }
  }
  const environment=trustedOfflineEnvironment;
  const publicKey=environment?.publicKey||JSON.parse(import.meta.env.VITE_OFFLINE_CUSTOMER_PUBLIC_KEY||'null');
  const verifiedIdToken=async({principalId,forceRefresh}={})=>{
   await authClient();await auth.authStateReady();const user=auth.currentUser;
   if(!user||user.isAnonymous||(principalId&&user.uid!==principalId))throw Error('Account changed');
   const token=await user.getIdToken(forceRefresh);if(auth.currentUser!==user)throw Error('Account changed during refresh');return token;
  };
  let attendanceProviders;
  const loadAttendanceProviders=()=>attendanceProviders||=import('../features/hr/nativeAttendanceProviders.js').then(({createNativeAttendanceProviders})=>createNativeAttendanceProviders({getRuntime:()=>current,getIdToken:verifiedIdToken})).catch(error=>{attendanceProviders=null;throw error;});
  let bootstrap;
  const restore=()=>owner.replace(()=>bootstrap({projectId,publicKey,environment,secureStore:platform.secureStore,openDatabase:platform.openDatabase,transport,digest:platform.digest,uuid,deferNetwork:true,backgroundHomeSync:false,launchCache:platform.launchCache,onVerifiedLaunch:launch=>{if(disposed||restoreTicket!==generation||!launch.isCurrent())return;setState({runtime:null,verifiedLaunch:launch,restored:true,error:''});clearLaunch();launchExpiry=setTimeout(()=>{if(!disposed)setState(previous=>({...previous,verifiedLaunch:null}));},Math.max(0,launch.expiresAtMs-Date.now()));},loadAttendanceProviders,loadHomeSync:()=>import('./offlineHomeSync.js'),onPhase:phase=>{startupMark('bootstrap.'+phase);recordStartupEvent('offline.bootstrap.phase',{phase});console.info('WORKSPACE_LOCAL_PHASE '+phase);}}).catch(async error=>{await platform.discardPreparedDatabase();throw error;}));
  const restoreTicket=generation;
  void (preloadedNativeCore&&Capacitor.getPlatform()==='android'?Promise.resolve(preloadedNativeCore):Promise.all([trustedOfflineEnabled&&Capacitor.getPlatform()==='web'?import('../data/webOfflinePlatform.js'):import('../data/nativeOfflineCustomerPlatform.js'),import('../data/bootstrapOfflineCustomer.js'),import('../data/offlineAppSession.js'),import('../data/offlineCustomerTransport.js')])).then(async([native,boot,session,http])=>{
   if(disposed)return;owner=session.createOfflineRuntimeOwner();bootstrap=boot.bootstrapOfflineCustomer;
   platform=await (native.createWebCustomerPlatform||native.createNativeCustomerPlatform)({projectId,publicKey,environment});
   removeIdentity=platform.subscribeIdentityChanges?.(()=>{const previous=current;void platform.secureStore.readIdentity().then(identity=>{if(!disposed&&previous&&previous===current&&(!identity||identity.sessionId!==previous.scope.sessionId)){release();current=null;void previous.close();setState({runtime:null,verifiedLaunch:null,restored:false,error:'Phiên đã thay đổi ở tab khác. Giao dịch đang chờ vẫn được giữ nguyên.'});}}).catch(()=>{if(previous===current){release();current=null;void previous?.close();}});})||(()=>{});
   if(disposed){removeIdentity();await owner.dispose();platform?.dispose?.();return;}
   setupResolve(true);
   transport=http.createOfflineCustomerTransport({projectId,environment,origin:trustedOfflineEnabled?environment.apiBaseUrl:'http://127.0.0.1:5017/',getIdToken:verifiedIdToken});
   try{if(restoreTicket===generation){const runtime=await restore();if(disposed){await owner.dispose();return;}if(restoreTicket!==generation){await owner.close(runtime);recordStartupEvent('offline.bootstrap.stale_result_discarded');}else publish(runtime,true);}}catch(error){if(!disposed&&restoreTicket===generation)setState({runtime:null,verifiedLaunch:null,restored:false,error:error.message});}
   if(!disposed)setSettled(true);
   if(disposed)return;
   const observeAuth=async()=>{
   startupMark('background.auth-start');const {fa}=await authClient();if(disposed)return;
   let sawAuthenticatedUser=false;
   off=fa.onAuthStateChanged(auth,user=>{
    if(disposed||auth.currentUser!==user)return;
    if(!user&&sawAuthenticatedUser){release();const previous=current;current=null;setState({runtime:null,verifiedLaunch:null,restored:false,error:''});void previous?.logout();return;}
    if(user)sawAuthenticatedUser=true;
    if(user&&current&&user.uid!==current.scope.principalId){setState({runtime:null,verifiedLaunch:null,restored:false,error:''});}
    if(user)void installObserved(user);
   });
   };
   // Local access is already published. Firebase loading/restoration is a
   // background concern and cannot gate the signed offline permission path.
   let observingAuth=false;
   const scheduleAuth=()=>{
    if(!uiAttached||disposed||networkTimer!==null)return;
    if(!navigator.onLine){recordStartupEvent('offline.auth.network_loading_deferred');return;}
    networkTimer=setTimeout(()=>{
     networkTimer=null;if(disposed||!navigator.onLine)return;
     // An initial grant can fail while Auth itself stays signed in. Reconnect
     // must retry that SAME identity; Auth need not emit another state change.
     if(observingAuth){if(auth?.currentUser&&!current?.isCurrent())void installObserved(auth.currentUser);return;}
     observingAuth=true;
     void observeAuth().catch(error=>{observingAuth=false;if(!disposed)setState(previous=>({...previous,error:previous.error||error.message}));});
    },current?1000:0);
   };
   window.addEventListener('online',scheduleAuth);removeAuthOnline=()=>window.removeEventListener('online',scheduleAuth);
   startUiNetwork=scheduleAuth;if(uiAttached)scheduleAuth();
  }).catch(error=>{setupResolve(false);if(!disposed){setSettled(true);setState({runtime:null,verifiedLaunch:null,restored:false,error:error.message});}});
  const dispose=()=>{disposed=true;clearLaunch();setupResolve(false);generation++;clearTimeout(networkTimer);removeAuthOnline();removeIdentity();off();release();void Promise.resolve(owner?.dispose()).finally(()=>platform?.dispose?.());};
  return dispose;
 }
 const dispose=initialize();
 const pagehide=event=>{if(event.persisted)return;window.removeEventListener('pagehide',pagehide);window.removeEventListener('online',updateOnline);window.removeEventListener('offline',updateOnline);dispose();};
 window.addEventListener('pagehide',pagehide);
 return store;
}

// Begin from this pure shared module's evaluation, before React render.
if(import.meta.env.MODE==='emulator'&&import.meta.env.VITE_NATIVE_EARLY_BOOTSTRAP==='true'&&enabled&&Capacitor.getPlatform()==='android')getNativeStartupController();
