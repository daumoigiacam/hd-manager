const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {setImmediate:turn}=require('node:timers/promises');
const {parse}=require('@babel/parser');
const source=readFileSync('functions/identityCenter.js','utf8');
const tree=parse(source,{sourceType:'script'});
const center=tree.program.body.find(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name==='createIdentityCenter')).declarations[0].init;
const node=center.body.body.flatMap(n=>n.type==='VariableDeclaration'?n.declarations:[]).find(n=>n.id.name==='issueSession').init;
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
function harness({claimsImpl}={}){
 const claims=deferred(),token=deferred(),device=deferred(),commit=deferred(),events=[],writes=[];
 const auth={setCustomUserClaims:(uid,value)=>{events.push('claims-start');return claimsImpl?claimsImpl(uid,value):claims.promise},
  createUser:async()=>{events.push('create-user')},createCustomToken:()=>{events.push('token-start');return token.promise}};
 const getIdentityRef=id=>({id,collection:()=>({doc:()=>({get:()=>{events.push('device-start');return device.promise}})})});
 const db={collection:()=>({doc:()=>({audit:true})}),batch:()=>({set:(ref,value)=>writes.push({ref,value}),commit:()=>{events.push('commit-start');return commit.promise}})};
 const issue=new Function('db','admin','getIdentityRef','sanitizeDevice','safeIdPart','buildPublicIdentity','IDENTITY_AUDIT_COLLECTION',`return (${source.slice(node.start,node.end)})`)(
  db,{auth:()=>auth},getIdentityRef,v=>v,v=>v,v=>({companyId:v.companyId,accountType:v.accountType}),'audit-fixture');
 const input={identityId:'employee-a',identity:{companyId:'company-a',appUserId:'employee-a',role:'employee',accountType:'employee',setup:{pinSet:true,trustedDevice:true}},
  device:{deviceId:'device-a',platform:'android'},loginRateRef:{rate:true}};
 return {claims,token,device,commit,events,writes,auth,run:()=>issue(input)};
}
test('IAM signing overlaps claims RPC but session waits for claims, device and durable audit/rate commit',async()=>{
 const h=harness();let finished=false;const pending=h.run().then(v=>{finished=true;return v});await turn();
 assert(h.events.includes('token-start'),'signing must start without waiting for Auth claims RPC');
 h.token.resolve('signed-token');h.device.resolve({exists:true,data:()=>({trusted:true,createdAtIso:'original'})});await turn();
 assert.equal(finished,false);assert.equal(h.events.includes('commit-start'),false);
 h.claims.resolve();await turn();assert(h.events.includes('commit-start'));assert.equal(finished,false);
 assert(h.writes.some(w=>w.ref.rate&&w.value.attempts===0));assert(h.writes.some(w=>w.ref.audit&&w.value.action==='login'));
 h.commit.resolve();const result=await pending;assert.equal(result.customToken,'signed-token');assert.equal(result.device.trusted,true);
});
test('concurrent token and claims failures are observed; claims failure cannot release or commit a session',async()=>{
 const h=harness(),job=h.run(),rejected=assert.rejects(job,/claims denied/);await turn();
 h.token.reject(Error('IAM unavailable'));h.device.reject(Error('device unavailable'));h.claims.reject(Error('claims denied'));await rejected;await turn();
 assert.equal(h.events.includes('commit-start'),false);
});
test('token failure or audit commit failure never returns a successful session',async()=>{
 for(const failure of ['token','commit']){
  const h=harness(),job=h.run(),rejected=assert.rejects(job,new RegExp(failure+' failed'));
  h.claims.resolve();h.device.resolve({exists:false});await turn();
  if(failure==='token'){h.token.reject(Error('token failed'));h.commit.resolve()}
  else{h.token.resolve('must-not-escape');h.commit.reject(Error('commit failed'))}
  await rejected;
 }
});
test('first Auth user creation race still persists the exact claims before session release',async()=>{
 let calls=0;const h=harness({claimsImpl:async()=>{if(++calls===1)throw Object.assign(Error('missing'),{code:'auth/user-not-found'})}});
 h.auth.createUser=async()=>{h.events.push('create-user');throw Object.assign(Error('raced'),{code:'auth/uid-already-exists'})};
 const job=h.run();h.device.resolve({exists:false});h.token.resolve('signed-token');await turn();h.commit.resolve();
 const result=await job;assert.equal(calls,2);assert(h.events.includes('create-user'));assert.equal(result.customToken,'signed-token');
});
