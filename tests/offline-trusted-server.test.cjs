// New trusted-adapter unit contracts only. In-memory DAO/token doubles here
// are explicitly NOT Firebase/HTTPS Production Readiness evidence.
const test=require('node:test'),assert=require('node:assert/strict');
const {generateKeyPairSync,createHash,verify}=require('node:crypto');
const {createOfflineServerEnvironment}=require('../functions/offlineServerEnvironment.cjs');
const {createTrustedOfflineApi}=require('../functions/offlineTrustedApi.cjs');
const {createTrustedOfflineActorResolver}=require('../functions/offlineTrustedActor.cjs');
const {acquireOfflineFeedLease}=require('../functions/offlineFeedLease.cjs');
const projector=require('../functions/generated/offlineOriginalDomain.cjs');
const {sanitizeOfflineDocument}=require('../functions/offlineDocumentSanitizer.cjs');
async function fixture(){
 const records=new Map(),projectId='hd-manager-offline-contract-test',appId='hd-manager-development';
 const snapshot=ref=>({id:ref.path.split('/').at(-1),exists:records.has(ref.path),data:()=>structuredClone(records.get(ref.path))});
 const db={projectId,doc:path=>({path,get:async()=>snapshot({path})}),async runTransaction(work){const writes=[];const result=await work({get:async ref=>ref.directory?{docs:[...records].filter(([path,body])=>path.startsWith(`artifacts/${appId}/public/data/employees/`)&&body.companyId===ref.tenantId).slice(0,ref.limit).map(([path])=>snapshot({path}))}:snapshot(ref),set:(ref,data)=>writes.push([ref.path,structuredClone(data)]),delete:ref=>writes.push([ref.path,null])});for(const[p,v]of writes)if(v===null)records.delete(p);else records.set(p,v);return result;}};
 // Only the bounded signed employee lookup is supported here. Unrelated
 // collection queries fail rather than pretending to return server data.
 db.collection=path=>{assert.equal(path,`artifacts/${appId}/public/data/employees`);return {where(field,op,tenantId){assert.equal(field,'companyId');assert.equal(op,'==');return {limit(n){assert.equal(n,501);return {directory:true,tenantId,limit:n};}};}};};
 const at=Date.now(),tokens={};
 for(const name of ['a','b']){
  const identityId='employee_emp-'+name,uid='identity_'+identityId,tenant='tenant-'+name,employee='emp-'+name;
  tokens[name]={uid,sub:uid,aud:projectId,iss:'https://securetoken.google.com/'+projectId,identityId,companyId:tenant,appUserId:employee,accountType:'employee',exp:Math.floor(at/1000)+3600};
  records.set('identity_accounts/'+identityId,{status:'active',accountType:'employee',companyId:tenant,appUserId:employee});
  records.set(`artifacts/${appId}/public/data/companies/${tenant}`,{name:'Unit contract tenant '+name});
  records.set(`artifacts/${appId}/public/data/employees/${employee}`,{companyId:tenant,name:'Unit owner',role:'super_admin',position:'Chủ doanh nghiệp'});
 }
 const revocationChecks=[],auth={app:{options:{projectId}},verifyIdToken:async(token,revoked)=>{revocationChecks.push(revoked);if(!tokens[token])throw Object.assign(Error('Invalid fixture token'),{code:'auth/invalid-id-token'});return tokens[token];}};
 const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const environment=createOfflineServerEnvironment({db,auth,projectId,appId,environment:'development',appOrigin:'https://offline-contract.example.com',publicKey:{...publicKey.export({format:'jwk'}),alg:'RS256'}});
 const {HOME_PERMISSION_MAPPING:mapping}=await import('../functions/offlineHomeFeed.mjs');
 const api=createTrustedOfflineApi({environment,projector,mapping,getSigningKey:async()=>privateKey.export({type:'pkcs8',format:'pem'}),createHomeFeed:async()=>{throw Error('Home source integration not under this unit contract');}});
 const envelope=require('./helpers/trusted-api-envelope.cjs').bindTestEnvelopes(api);api.handle=envelope.handle;
 return {db,records,projectId,appId,tokens,environment,api,publicKey,revocationChecks};
}
test('trusted grant signs current original role and pins real Firebase project, not caller tenant',async()=>{
 const f=await fixture();try{const r=await f.api.handle({action:'grant',token:'a',body:{deviceId:'unit-browser'}});assert.equal(r.scope.tenantId,'tenant-a');const [h,p,s]=r.signedGrant.split('.');assert(verify('RSA-SHA256',Buffer.from(h+'.'+p),f.publicKey,Buffer.from(s,'base64url')));const grant=JSON.parse(Buffer.from(p,'base64url'));assert(grant.capabilities.includes('customers.create'));assert(grant.capabilities.includes('home.read'));assert(!grant.capabilities.includes('orders.create'),'Unsupported trusted write protocol must not be granted');assert.equal(grant.appSession.user.firebaseUid,f.tokens.a.uid);assert(f.revocationChecks.every(Boolean));await assert.rejects(f.api.handle({action:'grant',token:'a',body:{deviceId:'unit-browser',scope:{tenantId:'tenant-b'}}}),e=>e.code==='permission-denied');}finally{await f.api.close();}
});
test('customer trusted dispatcher uses original transactional receipt/idempotency and preserves conflict',async()=>{
 const f=await fixture();const payload={id:'customer-unit',companyId:'tenant-a',name:'Unit profile',phone:'0900000000'},command={kind:'customer.create',commandId:'intent-unit',idempotencyKey:'intent-unit',entityId:payload.id,payload,payloadDigest:createHash('sha256').update(JSON.stringify(payload)).digest('hex')};
 try{const first=await f.api.handle({action:'sync',token:'a',body:{command}});assert.equal(first.outcome,'accepted');assert.deepEqual(await f.api.handle({action:'sync',token:'a',body:{command}}),first);assert.equal([...f.records.keys()].filter(p=>p.includes('/customers/')).length,1);assert.equal([...f.records.keys()].filter(p=>p.startsWith('offlineCustomerReceipts/')).length,1);await assert.rejects(f.api.handle({action:'sync',token:'b',body:{command}}));const editPayload={baseFingerprint:'stale-read',patch:{name:'Should not overwrite'}},edit={...command,kind:'customer.update',commandId:'edit-unit',idempotencyKey:'edit-unit',payload:editPayload,payloadDigest:createHash('sha256').update(JSON.stringify(editPayload)).digest('hex')};const collision=await f.api.handle({action:'sync',token:'a',body:{command:edit}});assert.equal(collision.outcome,'conflict');assert.equal(f.records.get(`artifacts/${f.appId}/public/data/customers/customer-unit`).name,'Unit profile');}finally{await f.api.close();}
});
test('fresh identity revocation denies even receipt replay without deleting committed records',async()=>{
 const f=await fixture();try{f.records.get('identity_accounts/employee_emp-a').lockedAt=Date.now();await assert.rejects(f.api.handle({action:'grant',token:'a',body:{deviceId:'unit-browser'}}),e=>e.code==='permission-denied');assert.equal(f.records.size,6);}finally{await f.api.close();}
});
test('wrong token audience, issuer, subject binding and expiry are denied',async()=>{
 const f=await fixture();try{for(const patch of [{aud:'other-project'},{iss:'https://other.example.com'},{uid:'other-principal'},{exp:1}]){const original=f.tokens.a;f.tokens.a={...original,...patch};await assert.rejects(f.api.handle({action:'grant',token:'a',body:{deviceId:'unit-browser'}}));f.tokens.a=original;}}finally{await f.api.close();}
});
test('customer assignment cannot cross a tenant even with owner create/assignment permissions',async()=>{
 const f=await fixture();try{
  const payload={id:'cross-assignment',companyId:'tenant-a',empId:'emp-b',name:'Contract customer',phone:'0900000000'},command={kind:'customer.create',commandId:'cross-assignment',idempotencyKey:'cross-assignment',entityId:payload.id,payload,payloadDigest:createHash('sha256').update(JSON.stringify(payload)).digest('hex')};
  await assert.rejects(f.api.handle({action:'sync',token:'a',body:{command}}),e=>e.code==='permission-denied');
  assert.equal(f.records.size,6,'No business record or receipt after an unauthorized assignment');
 }finally{await f.api.close();}
});
test('fenced journal refuses a second live owner and stale owner writes',async()=>{
 const f=await fixture();let first,second;try{first=await acquireOfflineFeedLease({db:f.db,environment:f.environment,tenantId:'tenant-a'});await assert.rejects(acquireOfflineFeedLease({db:f.db,environment:f.environment,tenantId:'tenant-a'}),e=>e.code==='unavailable');await first.db.doc('offlineHomeFeeds/tenant-a').set({seq:1});f.records.set('offlineHomeFeedLeases/tenant-a',{owner:'other-writer',until:Date.now()+60000});await assert.rejects(first.db.doc('offlineHomeFeeds/tenant-a').set({seq:2}),e=>e.code==='unavailable');assert.equal(f.records.get('offlineHomeFeeds/tenant-a').seq,1);f.records.set('offlineHomeFeedLeases/tenant-a',{owner:'other-writer',until:0});second=await acquireOfflineFeedLease({db:f.db,environment:f.environment,tenantId:'tenant-a'});await second.db.doc('offlineHomeFeeds/tenant-a').set({seq:3});assert.equal(f.records.get('offlineHomeFeeds/tenant-a').seq,3);}finally{await second?.close();await first?.close();await f.api.close();}
});
test('server refuses emulator credentials in a trusted environment',async()=>{
 const f=await fixture(),old=process.env.FIRESTORE_EMULATOR_HOST;try{process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8385';assert.throws(()=>createOfflineServerEnvironment({...f.environment,db:f.db,auth:f.environment.auth}));}finally{if(old===undefined)delete process.env.FIRESTORE_EMULATOR_HOST;else process.env.FIRESTORE_EMULATOR_HOST=old;await f.api.close();}
});
test('privacy redaction preserves money/quantities but removes nested credentials',()=>{
 const input={amount:12345,qty:7,customer:{name:'Unit',passwordHash:'unit-credential',accessToken:'unit-token'},company:{apiKey:'unit-key',revenue:42}};
 assert.deepEqual(sanitizeOfflineDocument(input),{amount:12345,qty:7,customer:{name:'Unit'},company:{revenue:42}});assert.equal(input.customer.passwordHash,'unit-credential');
});
