import {createOfflineCustomerAuthorizer} from './offlineCustomerGrant.js';

const denied=()=>Object.assign(Error('Online permission changed; reauthentication required'),{code:'permission-denied'});
const stable=value=>JSON.stringify(value,(_,entry)=>entry&&typeof entry==='object'&&!Array.isArray(entry)?Object.fromEntries(Object.keys(entry).sort().map(key=>[key,entry[key]])):entry);

// A renewed signature is accepted only for the current six-field owner and
// identical signed authority. Never extend a date from an unsigned response.
export async function renewOfflineGrant({publicKey,secureStore,expected,currentGrant,fresh,maxLifetimeMs,isCurrent,now=Date.now}){
 if(!fresh?.scope||Object.keys(expected).some(key=>fresh.scope[key]!==expected[key])||!secureStore.renewGrant)throw denied();
 let verified;
 await secureStore.renewGrant(expected,async record=>{
  if(!isCurrent()||now()>=currentGrant.expiresAtMs)throw denied();
  const verifyStored=await createOfflineCustomerAuthorizer({publicKey,expected,maxLifetimeMs,clockSkewMs:5000,now,secureStore:{load:async()=>record,advanceHighWater:async()=>{}}});
  let previous;try{previous=await verifyStored({scope:expected,kind:'app.session'});}catch{throw denied();}
  const candidate={...record,signedGrant:fresh.signedGrant};
  const verify=await createOfflineCustomerAuthorizer({publicKey,expected,maxLifetimeMs,clockSkewMs:5000,now,secureStore:{load:async()=>candidate,advanceHighWater:async()=>{}}});
  try{verified=await verify({scope:expected,kind:'app.session'});}catch{throw denied();}
  if(stable([...verified.capabilities].sort())!==stable([...currentGrant.capabilities].sort())||stable(verified.appSession)!==stable(currentGrant.appSession)||!isCurrent()||now()>=currentGrant.expiresAtMs)throw denied();
  if(verified.issuedAtMs<Math.max(previous.issuedAtMs,currentGrant.issuedAtMs)||verified.expiresAtMs<Math.max(previous.expiresAtMs,currentGrant.expiresAtMs))throw denied();
  return {...record,signedGrant:fresh.signedGrant,highWaterMs:Math.max(record.highWaterMs,now(),verified.issuedAtMs)};
 });
 return verified;
}
