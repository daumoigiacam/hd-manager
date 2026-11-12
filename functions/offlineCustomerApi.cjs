const {sign,randomUUID}=require('node:crypto');
const {createOfflineCustomerCommandService,fingerprint}=require('./offlineCustomerCommands.cjs');
const {readOfflineCustomerHistory}=require('./offlineCustomerHistory.cjs');
const permission={'customer.history.read':'customers.history.read','customer.create':'customers.create','customer.update':'customers.update','customer.archive':'customers.archive','customer.read':'customers.read'};
// Local server adapter only. No registration in the Production Functions entry.
function createOfflineCustomerApi({db,projectId,appId,authenticate,privateKey,now=Date.now,lifetimeMs=3600000,authorizeCurrentActor}){
 // Legacy Customer-only callers keep their existing optional callback. A new
 // Core-only grant always requires an explicit fresh original-role verifier.
 const verifyActor=authorizeCurrentActor|| (async()=>{});
 if(!/^demo-[a-z0-9-]+$/.test(projectId)||!process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Offline API requires Firebase Emulator');
 if(!Number.isInteger(lifetimeMs)||lifetimeMs<1000||lifetimeMs>86400000)throw new Error('Invalid grant lifetime');
 const accessRef=uid=>db.doc(`offlineCustomerAccess/${uid}`);
 function validate(access,actor,kind){
  if(!access?.active||access.tenantId!==actor.tenantId||access.permissionRevision!==actor.permissionRevision||access.readScope!=='tenant'||!access.capabilities?.includes(permission[kind]))throw Object.assign(new Error('Customer access denied'),{code:'permission-denied'});
 }
 const apply=createOfflineCustomerCommandService({db,projectId,appId,authorize:async(tx,actor,kind,command)=>{
  const snapshot=await tx.get(accessRef(actor.uid));validate(snapshot.exists?snapshot.data():null,actor,kind);await verifyActor(tx,actor,kind,command);
 }});
 return async function handle({action,token,body={}}){
  const identity=await authenticate(token);
  if(!identity?.uid||identity.projectId!==projectId)throw new Error('Verified demo identity required');
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(identity.uid))throw new Error('Invalid identity');
  const accessSnapshot=await accessRef(identity.uid).get();
  const access=accessSnapshot.exists?accessSnapshot.data():null;
  const actor={uid:identity.uid,tenantId:access?.tenantId,permissionRevision:access?.permissionRevision};
  if(action==='grant'){
   if(access?.capabilities?.includes('customers.read'))validate(access,actor,'customer.read');
   else {
    if(!access?.active||access.tenantId!==actor.tenantId||access.permissionRevision!==actor.permissionRevision||!actor.tenantId||!actor.permissionRevision||access.readScope!=='tenant'||!Array.isArray(access.capabilities)||access.capabilities.some(cap=>typeof cap!=='string'||!cap)||!access.appIdentity||typeof authorizeCurrentActor!=='function')throw Object.assign(Error('Signed Core grant access denied'),{code:'permission-denied'});
    await db.runTransaction(tx=>authorizeCurrentActor(tx,actor,'app.session',body,access),{readOnly:true});
   }
   if(typeof body.deviceId!=='string'||!body.deviceId||body.deviceId.length>160)throw new Error('Invalid device identity');
   const scope={projectId,principalId:identity.uid,tenantId:actor.tenantId,permissionRevision:actor.permissionRevision,deviceId:body.deviceId,sessionId:randomUUID()};
   // Emulator policy may shorten a grant to exercise expiry on the APK.
   const ttl=access.offlineLifetimeMs??lifetimeMs;
   if(!Number.isInteger(ttl)||ttl<1000||ttl>lifetimeMs)throw new Error('Invalid offline policy lifetime');
   const issuedAtMs=now(),grant={...scope,issuedAtMs,expiresAtMs:issuedAtMs+ttl,capabilities:access.capabilities};
   // Explicit Emulator policy metadata; no client-supplied roles or identities.
   if(access.appIdentity){
    const profile=access.appIdentity;
    if(typeof profile.id!=='string'||!profile.id||profile.companyId!==actor.tenantId)throw Error('Invalid App identity policy');
    grant.appSession={user:{...(typeof profile.identityKey==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(profile.identityKey)?{identityKey:profile.identityKey}:{}),id:profile.id,firebaseUid:identity.uid,companyId:actor.tenantId,accountType:'employee',role:'employee',name:String(profile.name||''),position:String(profile.position||'')},company:{id:actor.tenantId,name:String(profile.companyName||'')}};
    if(profile.managers){if(!Array.isArray(profile.managers)||profile.managers.length>500||profile.managers.some(row=>!row.id||row.companyId!==actor.tenantId))throw Error('Invalid signed manager directory');grant.appSession.employees=profile.managers;}
    if(profile.homeSourceProfile==='native-isolation-v1')grant.appSession.sourceProfile=profile.homeSourceProfile;
   }
   const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
   const message=encode({alg:'RS256',typ:'JWT'})+'.'+encode(grant);
   return {scope,signedGrant:message+'.'+sign('RSA-SHA256',Buffer.from(message),privateKey).toString('base64url'),issuedAtMs};
  }
  if(action==='sync')return apply(actor,body.command);
  if(action==='history'){
   validate(access,actor,'customer.history.read');
   // A signed history grant does not replace the current server permission.
   await db.runTransaction(tx=>verifyActor(tx,actor,'customer.history.read',body),{readOnly:true});
   return readOfflineCustomerHistory({db,appId,actor,body,now});
  }
  if(action==='detail'){
   validate(access,actor,'customer.read');
   if(typeof body.id!=='string'||! /^[A-Za-z0-9_-]{1,160}$/.test(body.id))throw Error('Invalid customer ID');
   const doc=await db.doc(`artifacts/${appId}/public/data/customers/${body.id}`).get();
   if(!doc.exists||doc.data().companyId!==actor.tenantId)throw Object.assign(new Error('Customer unavailable'),{code:'permission-denied'});
   return {document:{...doc.data(),id:doc.id},fingerprint:fingerprint(doc.data())};
  }
  if(action==='page'){
   validate(access,actor,'customer.read');
   const limit=body.limit??20,after=body.after??'';
   if(!Number.isInteger(limit)||limit<1||limit>100||typeof after!=='string'||after.length>160||after.includes('/'))throw new Error('Invalid page');
   let query=db.collection(`artifacts/${appId}/public/data/customers`).where('companyId','==',actor.tenantId).orderBy('__name__').limit(limit);
   if(after)query=query.startAfter(db.doc(`artifacts/${appId}/public/data/customers/${after}`));
   const snapshot=await query.get();
   const records=snapshot.docs.map(doc=>({document:{...doc.data(),id:doc.id},fingerprint:fingerprint(doc.data())}));
   return {records,after:snapshot.docs.at(-1)?.id||null,hasMore:records.length===limit};
  }
  throw new Error('Unsupported offline action');
 };
}
module.exports={createOfflineCustomerApi};
