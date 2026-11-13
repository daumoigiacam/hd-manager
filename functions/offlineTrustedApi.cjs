const {randomUUID,sign,createPrivateKey,createPublicKey}=require('node:crypto');
const {isTrustedOfflineServerEnvironment}=require('./offlineServerEnvironment.cjs');
const {createTrustedOfflineActorResolver}=require('./offlineTrustedActor.cjs');
const {createOfflineCustomerCommandService,fingerprint}=require('./offlineCustomerCommands.cjs');
const {readOfflineCustomerHistory}=require('./offlineCustomerHistory.cjs');
const {acquireOfflineFeedLease}=require('./offlineFeedLease.cjs');
const {sanitizeOfflineDocument:clean}=require('./offlineDocumentSanitizer.cjs');
const denied=()=>Object.assign(Error('Current Offline authority denied'),{code:'permission-denied'});
const customerKind={'customer.create':'customers.create','customer.update':'customers.update','customer.archive':'customers.archive'};
const supportedWrite=cap=>!(/\.(create|update|archive)$/.test(cap))||cap.startsWith('customers.');
const segment=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(x);

// Production-capable factory, NOT exported by index.js and NOT deployed.
// Uses real Firebase Identity Center bindings and original role/calculation
// functions. Unsupported write domains are denied, never blindly forwarded.
function createTrustedOfflineApi({environment,projector,mapping,getSigningKey,createHomeFeed,createReadSources,deriveReadCapabilities,createCommands,deriveBusinessCapabilities,identityCenter,now=Date.now}){
 const {db,projectId,appId,maxOfflineMs}=environment||{};
 if(!isTrustedOfflineServerEnvironment(environment,projectId,appId,db)||typeof getSigningKey!=='function'||typeof createHomeFeed!=='function'||!mapping||!Object.keys(mapping).length)throw Error('Trusted API dependencies are required');
 const actors=createTrustedOfflineActorResolver({environment,db,projector,mapping,now,deriveReadCapabilities,deriveBusinessCapabilities}),feeds=new Map(),contexts=new WeakMap();let closed=false;
 const get=(source,id)=>db.doc(`artifacts/${appId}/public/data/${source}/${id}`);
 const date=()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now());const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day;};
 const capability=(actor,cap)=>{if(!actor.capabilities.includes(cap))throw denied();};
 const currentScope=(actor,scope)=>{if(scope&&((scope.principalId&&scope.principalId!==actor.uid)||(scope.tenantId&&scope.tenantId!==actor.tenantId)||(scope.permissionRevision&&scope.permissionRevision!==actor.permissionRevision)))throw denied();};
 const fresh=async(tx,actor,cap)=>{const decoded=contexts.get(actor);if(!decoded)throw denied();const value=await actors.read(tx,decoded);if(value.tenantId!==actor.tenantId||value.permissionRevision!==actor.permissionRevision)throw denied();if(cap)capability(value,cap);return value;};
 const commands=typeof createCommands==='function'?createCommands({environment,projector,readAuthority:fresh,identityCenter}):null;
 const applyCustomer=createOfflineCustomerCommandService({db,projectId,appId,environment,authorize:async(tx,actor,kind,command)=>{
  const current=await fresh(tx,actor,customerKind[kind]);
  const employeeId=command.payload?.empId;
  if(kind==='customer.create'&&employeeId!==undefined){
   if(!segment(employeeId))throw denied();
   if(employeeId!==current.subject.employee.id)capability(current,'customers.assign');
   const employee=(await tx.get(get('employees',employeeId))).data();
   if(!employee||employee.companyId!==current.tenantId||employee.isArchived||['blocked','inactive'].includes(employee.status))throw denied();
  }
 }});
 async function feedFor(actor){
  if(closed)throw Error('Offline API closed');const day=date();let entry=feeds.get(actor.tenantId);
  if(entry&&entry.day!==day){await entry.promise.then(x=>x.close());feeds.delete(actor.tenantId);entry=null;}
  if(entry){entry.used=now();return entry.promise;}
  if(feeds.size>=2){const oldest=[...feeds.entries()].sort((a,b)=>a[1].used-b[1].used)[0];feeds.delete(oldest[0]);await oldest[1].promise.then(x=>x.close()).catch(()=>{});}
  const value={day,used:now()};
  value.promise=(async()=>{
   let feed;const lease=await acquireOfflineFeedLease({db,tenantId:actor.tenantId,environment,now,onLost:()=>{feed?.close();if(feeds.get(actor.tenantId)===value)feeds.delete(actor.tenantId);}});
   try{feed=await createHomeFeed({db:lease.db,verifiedDatabase:db,environment,projectId,appId,tenantId:actor.tenantId,asOfDay:day,projector,authenticate:actors.verifyToken,resolveCurrentActor:actors.resolve,payrollSources:!!commands});await feed.ready();return {...feed,async close(){feed.close();try{await feed.settle();}finally{await lease.close();}}};}
   catch(error){await lease.close().catch(()=>{});throw error;}
  })().catch(error=>{if(feeds.get(actor.tenantId)===value)feeds.delete(actor.tenantId);throw error;});
  feeds.set(actor.tenantId,value);return value.promise;
 }
 async function handleRaw({action,token,body={}}){
  if(closed)throw Error('Offline API closed');
  const decoded=await actors.verifyToken(token),actor=await db.runTransaction(tx=>actors.read(tx,decoded),{readOnly:true});contexts.set(actor,decoded);currentScope(actor,body.scope);
  if(action==='grant'){
   if(!segment(body.deviceId))throw Error('Invalid Offline device ID');
   const grant=await db.runTransaction(async tx=>{
    const freshActor=await actors.read(tx,decoded),caps=freshActor.capabilities.filter(commands?commands.supports:supportedWrite);
    if(!caps.some(cap=>['customers.read','home.read','attendancePeriod.read','attendanceRequest.read','salarySettlement.read'].includes(cap)))throw denied();
    const issuedAtMs=now(),scope={projectId,principalId:freshActor.uid,tenantId:freshActor.tenantId,permissionRevision:freshActor.permissionRevision,deviceId:body.deviceId,sessionId:randomUUID()};
    const user=freshActor.subject.employee,company=freshActor.subject.company;
    // The existing CRM validates assignments against this signed tenant
    // directory. Never infer it from a previous account's cache or return an
    // unbounded/partially truncated list as if complete.
    let employees;
    if(caps.includes('customers.read')){
     const directory=await tx.get(db.collection(`artifacts/${appId}/public/data/employees`).where('companyId','==',freshActor.tenantId).limit(501));
     if(directory.docs.length>500)throw Object.assign(Error('Signed employee directory requires an approved paginated protocol'),{code:'resource-exhausted'});
     employees=directory.docs.filter(doc=>!doc.data().isArchived).map(doc=>{const e=doc.data();return {id:doc.id,companyId:freshActor.tenantId,name:String(e.name||''),position:String(e.position||''),...(Array.isArray(e.positions)?{positions:e.positions}:{}),...(Array.isArray(e.additionalPositions)?{additionalPositions:e.additionalPositions}:{})};});
    }
    return {...scope,issuedAtMs,expiresAtMs:issuedAtMs+maxOfflineMs,capabilities:caps,appSession:{user:{identityKey:decoded.identityId,id:user.id,firebaseUid:freshActor.uid,companyId:freshActor.tenantId,accountType:'employee',role:'employee',name:String(user.name||''),position:String(user.position||'')},company:{id:freshActor.tenantId,name:String(company.name||'')},...(employees?{employees}:{})}};
   },{readOnly:true});
   const privateKey=createPrivateKey(await getSigningKey()),pub=createPublicKey(privateKey).export({format:'jwk'});
   if(pub.n!==environment.publicKey.n||pub.e!==environment.publicKey.e)throw Error('Offline issuer key differs from pinned verifier');
   const confirmed=await db.runTransaction(tx=>actors.read(tx,decoded),{readOnly:true});if(confirmed.permissionRevision!==grant.permissionRevision||confirmed.tenantId!==grant.tenantId||now()>=grant.expiresAtMs)throw denied();
   const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),message=encode({alg:'RS256',typ:'JWT'})+'.'+encode(grant);
   const {issuedAtMs,expiresAtMs,capabilities,appSession,...scope}=grant;
   return {scope,signedGrant:message+'.'+sign('RSA-SHA256',Buffer.from(message),privateKey).toString('base64url'),issuedAtMs};
  }
  if(action==='sync'){
   if(body.command&&Object.hasOwn(customerKind,body.command.kind))return applyCustomer(actor,body.command);
   if(!body.command||!commands)throw Object.assign(Error('Write domain has not passed the trusted server release gate'),{code:'failed-precondition'});
   return commands.apply(actor,body.command,{action,token,body});
  }
  if(['business-source','attendance-period','payroll-settlement','attendance-adjustment','warehouse-import-head','warehouse-import-page'].includes(action)){
   if(typeof createReadSources!=='function')throw Object.assign(Error('Trusted business read adapter is not configured'),{code:'failed-precondition'});
   const read=await createReadSources({environment,db,projectId,appId,actor,projector,readActor:tx=>fresh(tx,actor)});
   const result=await read({action,token,body});
   await db.runTransaction(tx=>fresh(tx,actor),{readOnly:true});return result;
  }
  if(action==='home-head'||action==='home-page'||action==='home-report'){capability(actor,'home.read');const result=await(await feedFor(actor)).handle({action,token,body});await db.runTransaction(tx=>fresh(tx,actor,'home.read'),{readOnly:true});return result;}
  if(action==='customer-delta'){
   capability(actor,'customers.read');await feedFor(actor);
   const head=(await db.doc('offlineHomeFeeds/'+actor.tenantId).get()).data();if(!head?.ready)throw Object.assign(Error('Customer journal initializing'),{code:'unavailable'});
   if(body.head){await db.runTransaction(tx=>fresh(tx,actor,'customers.read'),{readOnly:true});return {generation:head.generation,through:head.seq};}
   const {generation,after,through,limit=50}=body;
   if(generation!==head.generation){await db.runTransaction(tx=>fresh(tx,actor,'customers.read'),{readOnly:true});return {reset:true,generation:head.generation,through:head.seq};}
   if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(through)||through<after||through>head.seq||!Number.isInteger(limit)||limit<1||limit>50)throw Error('Invalid customer delta checkpoint');
   const data=await db.collection('offlineHomeFeeds/'+actor.tenantId+'/changes').where('source','==','customers').where('seq','>',after).where('seq','<=',through).orderBy('seq').limit(limit).get();
   const events=data.docs.map(doc=>{const e=doc.data();return {...e,...(e.document?{fingerprint:fingerprint(e.document)}:{})};});
   await db.runTransaction(tx=>fresh(tx,actor,'customers.read'),{readOnly:true});
   return {events,hasMore:events.length===limit,after:events.length===limit?events.at(-1).seq:through};
  }
  if(action==='history'){capability(actor,'customers.history.read');const result=await readOfflineCustomerHistory({db,appId,actor,body,now});await db.runTransaction(tx=>fresh(tx,actor,'customers.history.read'),{readOnly:true});return result;}
  if(action==='detail'||action==='page')return db.runTransaction(async tx=>{
   await fresh(tx,actor,'customers.read');
   if(action==='detail'){if(!segment(body.id))throw Error('Invalid customer ID');const doc=await tx.get(get('customers',body.id));if(!doc.exists||doc.data().companyId!==actor.tenantId)throw denied();return {document:clean({...doc.data(),id:doc.id}),fingerprint:fingerprint(doc.data())};}
   const limit=body.limit??20,after=body.after??'';if(!Number.isInteger(limit)||limit<1||limit>100||(after&&!segment(after)))throw Error('Invalid customer page');
   let query=db.collection(`artifacts/${appId}/public/data/customers`).where('companyId','==',actor.tenantId).orderBy('__name__').limit(limit);if(after)query=query.startAfter(get('customers',after));const snap=await tx.get(query);
   return {records:snap.docs.map(doc=>({document:clean({...doc.data(),id:doc.id}),fingerprint:fingerprint(doc.data())})),after:snap.docs.at(-1)?.id||null,hasMore:snap.size===limit};
  },{readOnly:true});
  throw Error('Unsupported Offline action');
 }
 return {handle:async request=>clean(await handleRaw(request)),async close(){closed=true;const pending=[...feeds.values()];feeds.clear();await Promise.all(pending.map(x=>x.promise.then(feed=>feed.close()).catch(()=>{})));}};
}
module.exports={createTrustedOfflineApi};
