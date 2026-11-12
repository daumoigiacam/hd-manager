import {createOfflineCustomerAuthorizer} from './offlineCustomerGrant.js';

// Read-only, process-local lease. The secure clock watermark is reserved at
// its END before publication, within the existing 5s clock-skew policy. Thus a
// kill/restart cannot extend a grant by rolling the clock back through a lease.
// Writes always retain the original full signature/native-store validation.
export async function createOfflineReadLease({publicKey,secureStore,expected,isCurrent,onInvalid,fullAuthorize,maxLifetimeMs=86400000,now=Date.now,mono=()=>performance.now(),leaseMs=4000,initialRecord=null}){
 if(leaseMs<1||leaseMs>4000||!secureStore.revision)throw Error('Invalid read lease policy');
 let reservation=null;
 const reservedStore={...secureStore,withRecord:verify=>secureStore.withRecord((record,advance)=>verify(record,(signature,at)=>{
  // Queue wait is not lease lifetime. Anchor only after the verifier checked
  // the signed grant and immediately before its durable watermark write.
  reservation={wall:at,mono:mono()};
  const reservedUntil=secureStore.reservedUntil?.(record);
  const deadline=Number.isSafeInteger(reservedUntil)&&reservedUntil>at?Math.min(at+leaseMs,reservedUntil):at+leaseMs;
  reservation.duration=deadline-at;
  return advance(signature,deadline);
 }))};
 const verifyRead=await createOfflineCustomerAuthorizer({publicKey,secureStore:reservedStore,expected,maxLifetimeMs,clockSkewMs:5000,now});
 // Public Runtime scopes deliberately contain four identity fields; project
 // and device stay pinned in the verified owner/grant. Reject conflicting
 // optional fields without requiring callers to invent a second scope shape.
 const scopeKey=scope=>JSON.stringify([scope.projectId===undefined?expected.projectId:scope.projectId,scope.principalId,scope.tenantId,scope.permissionRevision,scope.sessionId,scope.deviceId===undefined?expected.deviceId:scope.deviceId]);
 const expectedKey=scopeKey(expected);let lease=null,pending=null,timer=null,readers=0,closed=false;
 function valid(scope){const at=now(),elapsed=mono()-(lease?.mono||0);return !closed&&isCurrent()&&scopeKey(scope)===expectedKey&&lease&&lease.revision===secureStore.revision()&&at>=lease.wall&&at<lease.grant.expiresAtMs&&elapsed>=0&&elapsed<lease.duration;}
 function plan(){clearTimeout(timer);timer=null;if(!readers||closed||!lease)return;timer=setTimeout(()=>{timer=null;void renew(expected).catch(()=>{});},Math.max(0,lease.duration-(mono()-lease.mono)-1500));}
 function renew(scope){
  if(pending)return pending;
  const revision=secureStore.revision();
  pending=verifyRead({scope,kind:'app.session'}).then(grant=>{
   if(closed||!isCurrent()||revision!==secureStore.revision()||scopeKey(scope)!==expectedKey)throw Error('Read lease owner changed');
   const duration=Math.min(leaseMs,grant.expiresAtMs-reservation.wall,reservation.duration);
   if(duration<=mono()-reservation.mono)throw Object.assign(Error('Secure storage is busy; retry local read'),{code:'read-lease-busy'});
   lease={grant,revision,mono:reservation.mono,wall:reservation.wall,duration};plan();return grant;
  }).catch(error=>{lease=null;clearTimeout(timer);if(error.code!=='read-lease-busy')onInvalid?.(error);throw error;}).finally(()=>{pending=null;});return pending;
 }
 // The initial record is held by the existing secure-store exclusive queue.
 // Verify its signature and ownership, and commit the same bounded watermark
 // reservation used by normal renewal. Later renewal always rereads the store.
 let initialGrant=null;
 if(initialRecord){
  const revision=secureStore.revision();
  const initialVerifier=await createOfflineCustomerAuthorizer({publicKey,expected,maxLifetimeMs,clockSkewMs:5000,now,secureStore:{withRecord:verify=>verify(initialRecord.record,(signature,at)=>{
   reservation={wall:at,mono:mono()};
   const until=initialRecord.reservedUntil;
   const deadline=Number.isSafeInteger(until)&&until>at?Math.min(at+leaseMs,until):at+leaseMs;
   reservation.duration=deadline-at;
   return initialRecord.advance(signature,deadline);
  })}});
  const grant=await initialVerifier({scope:expected,kind:'app.session'});
  if(closed||!isCurrent()||revision!==secureStore.revision())throw Error('Initial read owner changed');
  const duration=Math.min(leaseMs,grant.expiresAtMs-reservation.wall,reservation.duration);
  if(duration<=mono()-reservation.mono)throw Object.assign(Error('Secure storage is busy; retry local read'),{code:'read-lease-busy'});
  initialGrant=grant;lease={grant,revision,mono:reservation.mono,wall:reservation.wall,duration};
 }
 return Object.freeze({
  initialGrant,
  async authorize(request){
   const capability=request.kind==='customer.read'?'customers.read':request.kind==='home.read'?'home.read':null;
   if(!capability&&request.kind!=='app.session')return fullAuthorize(request);
   if(!isCurrent()||scopeKey(request.scope)!==expectedKey)throw Error('Read scope closed');
   const grant=valid(request.scope)?lease.grant:await renew(request.scope);
   if(capability&&!grant.capabilities?.includes(capability))throw Error('Offline capability denied');
   return grant;
  },
  activate(){readers++;if(lease)plan();return()=>{readers=Math.max(0,readers-1);if(!readers){clearTimeout(timer);timer=null;}};},
  close(){closed=true;readers=0;lease=null;clearTimeout(timer);},
 });
}
