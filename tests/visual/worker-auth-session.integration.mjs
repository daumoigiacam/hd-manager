import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const project='demo-hdm-cache-lab',firestore='http://127.0.0.1:9195',auth='http://127.0.0.1:9196';
const output=process.env.HD_WORKER_AUTH_INTEGRATION_OUTPUT||'test-results/worker-auth-session-integration';await fs.mkdir(output,{recursive:true});
// This fixture and rule change are confined to the manually launched local demo
// emulator. No production Firebase config, credential or password is imported.
const seed=await fetch(`${firestore}/v1/projects/${project}/databases/(default)/documents:commit`,{
  method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer owner'},
  body:JSON.stringify({writes:[{update:{name:`projects/${project}/databases/(default)/documents/orders/fixture-0`,fields:{companyId:{stringValue:'fixture'},amount:{integerValue:'1'}}}},{update:{name:`projects/${project}/databases/(default)/documents/orders/worker-other-company`,fields:{companyId:{stringValue:'other'},amount:{integerValue:'777'}}}}]}),
  signal:AbortSignal.timeout(10000),
});assert.equal(seed.ok,true,'Local other-company fixture seed');
const rules=`rules_version = '2';service cloud.firestore {match /databases/{database}/documents {match /orders/{id} {allow read: if request.auth != null && request.auth.token.companyId == resource.data.companyId;allow write: if false;}}}`;
const ruleResponse=await fetch(`${firestore}/emulator/v1/projects/${project}:securityRules`,{
  method:'PUT',body:JSON.stringify({rules:{files:[{content:rules}]}}),signal:AbortSignal.timeout(10000),
});assert.equal(ruleResponse.ok,true,'Local tenant isolation rules load');
const config={projectId:project,apiKey:'synthetic-worker-auth-key',appId:'synthetic-worker-auth'};
const worker=await build({stdin:{resolveDir:process.cwd(),contents:`
  import {initializeApp}from'firebase/app';
  import {initializeAuth,connectAuthEmulator,getIdTokenResult,signOut}from'firebase/auth';
  import {initializeFirestore,connectFirestoreEmulator,getDocFromServer,doc}from'firebase/firestore';
  import {createWorkerAuthPersistence,assertWorkerIdentity}from'./src/services/workerAuthSession.js';
  let initialized=false;
  onmessage=async function(event){
    if(initialized){postMessage({ok:false,error:'Already initialized'});return}initialized=true;
    const {envelope,scope,scenario}=event.data;
    try{
      const adapter=createWorkerAuthPersistence(envelope,scope),app=initializeApp(${JSON.stringify(config)});
      const auth=initializeAuth(app,{persistence:adapter.Persistence});
      connectAuthEmulator(auth,${JSON.stringify(auth)},{disableWarnings:true});
      await auth.authStateReady();
      const result=await getIdTokenResult(auth.currentUser);assertWorkerIdentity(auth.currentUser,result.claims,scope);
      const db=initializeFirestore(app,{experimentalAutoDetectLongPolling:false,useFetchStreams:true});
      connectFirestoreEmulator(db,'127.0.0.1',9195);
      const own=await getDocFromServer(doc(db,'orders','fixture-0'));
      if(!own.exists() || own.data().amount!==1)throw Error('Own fixture mismatch');
      let otherDenied=false;
      try{await getDocFromServer(doc(db,'orders','worker-other-company'))}catch(error){otherDenied=error.code==='permission-denied'}
      if(!otherDenied)throw Error('Server tenant isolation failed');
      const refreshed=await getIdTokenResult(auth.currentUser,true);assertWorkerIdentity(auth.currentUser,refreshed.claims,scope);
      await signOut(auth);adapter.clear();
      const store=new adapter.Persistence();
      const cleared=auth.currentUser===null && await store._get('firebase:authUser:'+scope.apiKey+':'+scope.appName)===null;
      postMessage({ok:true,restored:true,ownRead:true,otherDenied,refreshed:true,cleared,scenario});
    }catch(error){postMessage({ok:false,error:error.message,scenario})}
  };
`},bundle:true,write:false,format:'iife',target:'chrome74',define:{'process.env.NODE_ENV':'"production"'}});
const main=await build({stdin:{resolveDir:process.cwd(),contents:`
  import {initializeApp}from'firebase/app';
  import {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithCustomToken}from'firebase/auth';
  import {createWorkerAuthEnvelope}from'./src/services/workerAuthSession.js';
  window.run=async function(scenario){
    const app=initializeApp(${JSON.stringify(config)}),auth=initializeAuth(app,{persistence:inMemoryPersistence});
    connectAuthEmulator(auth,${JSON.stringify(auth)},{disableWarnings:true});
    // Strict JSON fake custom tokens are supported only by Auth Emulator.
    const credential=await signInWithCustomToken(auth,JSON.stringify({uid:'fixture-worker-user',claims:{companyId:'fixture',accountType:'employee'}}));
    const scope={uid:credential.user.uid,companyId:'fixture',accountType:'employee',apiKey:app.options.apiKey,appName:app.name};
    const envelope=createWorkerAuthEnvelope(credential.user,scope);
    if(scenario==='wrong-company')scope.companyId='other';
    if(scenario==='wrong-user')scope.uid='different-user';
    if(scenario==='wrong-type')scope.accountType='customer';
    const result=await new Promise((resolve,reject)=>{
      const worker=new Worker('/worker.js'),timer=setTimeout(()=>{worker.terminate();reject(Error('Worker auth test timeout'))},45000);
      worker.onmessage=event=>{clearTimeout(timer);worker.terminate();resolve(event.data)};
      worker.onerror=event=>{clearTimeout(timer);worker.terminate();reject(Error(event.message))};
      worker.postMessage({scope,envelope,scenario});
    });
    return {...result,mainSessionPreserved:auth.currentUser===credential.user};
  };
`},bundle:true,write:false,format:'iife',target:'chrome74',define:{'process.env.NODE_ENV':'"production"'}});
const server=http.createServer((request,response)=>{
  if(request.url==='/main.js'||request.url==='/worker.js'){response.setHeader('Content-Type','application/javascript');response.end((request.url==='/main.js'?main:worker).outputFiles[0].text)}
  else{response.setHeader('Content-Type','text/html');response.end('<script src="/main.js"></script>')}
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const checks=[],failures=[];
try{
  for(const scenario of ['same-scope','wrong-company','wrong-user','wrong-type']){
    const context=await browser.newContext();
    await context.route('**/*',route=>{
      const requested=new URL(route.request().url()).origin;
      if([origin,firestore,auth].includes(requested))return route.continue();
      failures.push({scenario,error:'Blocked unexpected origin: '+requested});return route.abort();
    });
    const page=await context.newPage();page.on('pageerror',error=>failures.push({scenario,error:error.message}));
    await page.goto(origin);
    const result=await page.evaluate(scenario=>window.run(scenario),scenario);
    assert.equal(result.mainSessionPreserved,true);
    if(scenario==='same-scope')assert.deepEqual(result,{ok:true,restored:true,ownRead:true,otherDenied:true,refreshed:true,cleared:true,scenario,mainSessionPreserved:true});
    else{assert.equal(result.ok,false);assert.match(result.error,/scope/)}
    checks.push({scenario,status:'PASS',...result});await context.close();
  }
  assert.deepEqual(failures,[]);
}finally{await fs.writeFile(output+'/result.json',JSON.stringify({checks,failures,
  scope:'Real pinned Firebase Auth and Firestore SDKs, classic worker, local Auth/Firestore emulators only. Auth session transfer/refresh/tenant-denial/logout tested with synthetic credentials; no real user token or business data captured. Not Android/cloud/performance acceptance.'},null,2));
  await browser.close();await new Promise(resolve=>server.close(resolve));}
console.log(JSON.stringify({checks,failures}));
