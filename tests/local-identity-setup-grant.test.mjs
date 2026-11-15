import test from'node:test';import assert from'node:assert/strict';import{randomBytes,randomInt,randomUUID}from'node:crypto';
import{localEnvironment}from'../tools/local-development/environment.mjs';
import policy from'../functions/identitySetupPolicy.cjs';

test('setup readiness uses the existing Identity policy and fails closed for incomplete accounts',()=>{
 const complete={setup:{pinSet:true,trustedDevice:true},requiresPasswordChange:false};
 assert.equal(policy.requiresIdentitySetup(complete),false);
 for(const identity of [undefined,{}, {...complete,requiresPasswordChange:true},{setup:{pinSet:false,trustedDevice:true}},{setup:{pinSet:true,trustedDevice:false}}])assert.equal(policy.requiresIdentitySetup(identity),true);
});
test('actual Local registration cannot get a grant before setup; completing setup permits the same tenant',async()=>{
 const c=await localEnvironment();assert.match(c.projectId,/^demo-hdmanager-/);assert.equal(new URL(c.apiEndpoint).hostname,'127.0.0.1');
 const device={deviceId:'local-setup-test-'+randomUUID(),platform:'web'},password='Qa'+randomBytes(18).toString('hex')+'7!',phone='090'+randomInt(1000000,9999999);
 const identityUrl=name=>c.apiEndpoint+c.projectId+'/us-central1/'+name;
 const post=(url,body,token)=>fetch(url,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
 const registered=await post(identityUrl('identityRegisterCompany'),{companyName:'QA setup contract '+randomUUID(),phone,password,device,appId:c.appId});assert.equal(registered.status,200);
 const session=await registered.json();assert.equal(session.requiresSetup,true);assert(session.customToken);
 const exchange=await post(`http://${c.auth.host}:${c.auth.port}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=local-emulator-only`,{token:session.customToken,returnSecureToken:true});assert.equal(exchange.status,200);
 const {idToken}=await exchange.json();assert(idToken);
 assert.equal((await post(c.apiEndpoint+'grant',{deviceId:device.deviceId},idToken)).status,403,'an authenticated but incomplete identity is not an activated Offline workspace');
 const completed=await post(identityUrl('identityCompleteSetup'),{pin:String(randomInt(134581,987541)),trustDevice:true,biometricEnabled:false,device},idToken);assert.equal(completed.status,200);
 const secret=await completed.json();assert(secret.success!==false);
 const login=await post(identityUrl('identityLogin'),{identifier:phone,password,appId:c.appId,device,...(secret.deviceSecret?{deviceSecret:secret.deviceSecret}:{})});assert.equal(login.status,200);assert.equal((await login.json()).requiresSetup,false);
 const granted=await post(c.apiEndpoint+'grant',{deviceId:device.deviceId},idToken);assert.equal(granted.status,200);
 const grant=await granted.json();assert.equal(grant.scope.tenantId,session.identity.companyId);assert.equal(typeof grant.signedGrant,'string');assert(grant.signedGrant.length>100);
});
