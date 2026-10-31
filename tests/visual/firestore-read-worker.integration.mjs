import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const output=process.env.HD_FIRESTORE_WORKER_INTEGRATION_OUTPUT||'test-results/firestore-read-worker-integration',project='demo-hdm-cache-lab',appId='worker-fixture';
const collectionName=process.env.HD_FIRESTORE_WORKER_INTEGRATION_COLLECTION||'orders';
assert.ok(['orders','notifications'].includes(collectionName),'Only isolated fixture collections');
const firestore='http://127.0.0.1:9195',auth='http://127.0.0.1:9196';await fs.mkdir(output,{recursive:true});
const base=`projects/${project}/databases/(default)/documents/artifacts/${appId}/public/data/${collectionName}`;
const response=await fetch(`${firestore}/v1/projects/${project}/databases/(default)/documents:commit`,{
  method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer owner'},
  body:JSON.stringify({writes:[{delete:`${base}/r-050a`},{update:{name:`${base}/foreign`,fields:{companyId:{stringValue:'foreign'},amount:{integerValue:'999999'}}}},...Array.from({length:130},(_,i)=>({update:{name:`${base}/r-${String(i).padStart(3,'0')}`,fields:{
    companyId:{stringValue:'fixture'},amount:{integerValue:String(i+1)},
    stamp:{timestampValue:'2026-10-31T01:02:03.123456789Z'},
    detail:{mapValue:{fields:{stamp:{timestampValue:'1969-12-31T23:59:59.999999999Z'}}}},
    link:{referenceValue:`${base}/r-000`},
  }}}))]}),signal:AbortSignal.timeout(10000),
});assert.equal(response.ok,true,'Local nested source seed');
const rules=`rules_version='2';service cloud.firestore{match /databases/{database}/documents{
  match /orders/{id}{allow read:if request.auth!=null&&request.auth.token.companyId==resource.data.companyId;}
  match /artifacts/{app}/public/data/{col}/{id}{
    allow read,delete:if request.auth!=null&&request.auth.token.companyId==resource.data.companyId;
    allow create,update:if request.auth!=null&&request.auth.token.companyId==request.resource.data.companyId;
  }}}`;
const loaded=await fetch(`${firestore}/emulator/v1/projects/${project}:securityRules`,{method:'PUT',body:JSON.stringify({rules:{files:[{content:rules}]}}),signal:AbortSignal.timeout(10000)});
assert.equal(loaded.ok,true,'Local tenant rules load');
const worker=await build({entryPoints:['src/services/firestoreReadWorker.js'],bundle:true,write:false,format:'iife',target:'chrome74',define:{'process.env.NODE_ENV':'"production"'}});
const main=await build({stdin:{resolveDir:process.cwd(),contents:`
  import {initializeApp}from'firebase/app';
  import {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithCustomToken}from'firebase/auth';
  import {initializeFirestore,connectFirestoreEmulator,doc,setDoc,deleteDoc,Timestamp,getDocFromServer}from'firebase/firestore';
  import {createFirestoreReadWorkerClient}from'./src/services/firestoreReadWorkerClient.js';
  const app=initializeApp({projectId:${JSON.stringify(project)},apiKey:'synthetic-read-worker-key',appId:'synthetic-read-worker'});
  const auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,${JSON.stringify(auth)},{disableWarnings:true});
  const db=initializeFirestore(app,{experimentalAutoDetectLongPolling:false,useFetchStreams:true});connectFirestoreEmulator(db,'127.0.0.1',9195);
  const reference=id=>doc(db,'artifacts',${JSON.stringify(appId)},'public','data',${JSON.stringify(collectionName)},id);
  let client,off,first,user,clock=0;window.snapshots=[];window.errors=[];window.fallbacks=[];window.statuses=[];window.pause=false;window.paused=false;
  window.prepare=async()=>{
    user=(await signInWithCustomToken(auth,JSON.stringify({uid:'fixture-read-worker-user',claims:{companyId:'fixture',accountType:'employee'}}))).user;
    window.baseline=(await getDocFromServer(reference('r-000'))).data();
    client=createFirestoreReadWorkerClient({user,config:app.options,appId:${JSON.stringify(appId)},companyId:'fixture',accountType:'employee',db,
      emulator:{host:'127.0.0.1',authPort:9196,firestorePort:9195},
      onAuthInvalid:()=>window.errors.push('Unexpected auth invalidation'),onFallback:value=>window.fallbacks.push(value),
      now:()=>clock++,yieldWork:async()=>{if(window.pause){window.paused=true;await new Promise(resolve=>window.release=resolve)}else await new Promise(resolve=>setTimeout(resolve,0))}});
    window.subscribe();
  };
  window.subscribe=()=>{off=client.subscribe(${JSON.stringify(collectionName)},{
    publish:(snapshot,items)=>{
      if(snapshot.metadata.fromCache){window.statuses.push('cache');return}
      window.snapshots.push({snapshot,items});if(!first)first=items;
    },error:error=>window.errors.push(error.code||error.message),fallback:()=>{window.fallbacks.push('Unexpected fallback');return()=>{}}});};
  window.change=async(id,amount)=>{await setDoc(reference(id),{companyId:'fixture',amount},{merge:true})};
  window.remove=async id=>deleteDoc(reference(id));
  window.checkForeignAccess=async()=>{try{await getDocFromServer(reference('foreign'));return 'UNEXPECTED_ACCESS'}catch(error){return error.code}};
  window.burst=async()=>{for(let i=0;i<15;i++)await setDoc(reference('r-001'),{companyId:'fixture',amount:5000+i},{merge:true})};
  window.stop=()=>off();window.close=()=>client.close();
  window.state=()=>{const items=window.snapshots.at(-1)?.items||[];const zero=first?.find(r=>r.id==='r-000'),one=items.find(r=>r.id==='r-001');
    return {snapshots:window.snapshots.length,count:items.length,ids:items.map(r=>r.id),sum:items.reduce((s,r)=>s+r.data.amount,0),one:one?.data.amount,
      firstZero:zero?.data.amount,firstOne:first?.find(r=>r.id==='r-001')?.data.amount,
      topTimestamp:zero?.data.stamp,nestedNanos:zero?.data.detail.stamp.nanoseconds,expectedNestedNanos:window.baseline.detail.stamp.nanoseconds,
      nestedIsTimestamp:zero?.data.detail.stamp instanceof Timestamp,referencePreserved:zero?.data.link.firestore===db&&zero?.data.link.path.endsWith('/r-000'),
      errors:window.errors,fallbacks:window.fallbacks,mainSessionPreserved:auth.currentUser===user}};
`},bundle:true,write:false,format:'iife',target:'chrome74',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'real-worker-transport',setup(b){
  b.onResolve({filter:/^@hd\/firestore-read-worker$/},()=>({path:'factory',namespace:'test'}));
  b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const createFirestoreReadWorker=()=>new Worker("/worker.js")'}));
  b.onResolve({filter:/^@hd\/firestore-worker-values$/},()=>({path:path.resolve('src/services/firestoreWorkerValues.js')}));
}}]});
const server=http.createServer((request,response)=>{
  if(request.url==='/worker.js'||request.url==='/main.js'){response.setHeader('Content-Type','application/javascript');response.end((request.url==='/worker.js'?worker:main).outputFiles[0].text)}
  else{response.setHeader('Content-Type','text/html');response.end('<script src="/main.js"></script>')}
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const checks=[],errors=[];
try{
  const context=await browser.newContext();await context.route('**/*',route=>{
    const requested=new URL(route.request().url()).origin;
    if([origin,firestore,auth].includes(requested))return route.continue();errors.push('Blocked unexpected origin: '+requested);return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);await page.evaluate(()=>window.prepare());
  await page.waitForFunction(()=>window.snapshots.length>0,null,{timeout:30000});
  let state=await page.evaluate(()=>window.state());assert.equal(state.count,130);assert.equal(state.sum,130*131/2);
  assert.equal(state.topTimestamp,'2026-10-31T01:02:03.123Z');assert.equal(state.nestedNanos,state.expectedNestedNanos);
  assert.ok(state.nestedNanos>0,'nested timestamp precision must not disappear');
  assert.equal(state.nestedIsTimestamp,true);assert.equal(state.referencePreserved,true);checks.push('complete initial snapshot and public SDK types');
  assert.equal(await page.evaluate(()=>window.checkForeignAccess()),'permission-denied');checks.push('foreign tenant excluded from query and denied by SDK rules');
  await page.evaluate(()=>window.change('r-001',999));await page.waitForFunction(()=>window.state().one===999);
  state=await page.evaluate(()=>window.state());assert.equal(state.firstOne,2);assert.equal(state.sum,130*131/2-2+999);checks.push('server update without changing previous financial snapshot');
  await page.evaluate(()=>window.change('r-050a',7));await page.waitForFunction(()=>window.state().count===131);
  state=await page.evaluate(()=>window.state());assert.deepEqual(state.ids,[...state.ids].sort());checks.push('inserted row keeps SDK query order');
  await page.evaluate(()=>window.remove('r-000'));await page.waitForFunction(()=>window.state().count===130);
  state=await page.evaluate(()=>window.state());assert.equal(state.firstZero,1);checks.push('server deletion keeps previous snapshot intact');
  // Hold an acknowledgement while updates replace the queued snapshot. A
  // reopened stream must still receive the latest server value in full.
  await page.evaluate(()=>{window.stop();window.pause=true;window.subscribe()});
  await page.waitForFunction(()=>window.paused===true);
  const before=await page.evaluate(()=>window.snapshots.length);
  await page.evaluate(()=>window.burst());
  await page.evaluate(()=>{window.pause=false;window.release()});
  await page.waitForFunction(()=>window.state().one===5014,null,{timeout:30000});
  state=await page.evaluate(()=>window.state());assert.equal(state.count,130);assert.ok(state.snapshots>before);checks.push('bounded queued snapshots recover data-only updates');
  await page.evaluate(()=>{window.stop();window.pause=true;window.paused=false;window.subscribe()});
  await page.waitForFunction(()=>window.paused===true);const oldCount=await page.evaluate(()=>window.snapshots.length);
  await page.evaluate(()=>{window.stop();window.pause=false;window.release()});await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>window.snapshots.length),oldCount);checks.push('unsubscribe during chunk processing suppresses late publication');
  await page.evaluate(()=>window.subscribe());await page.waitForFunction(previous=>window.snapshots.length>previous,oldCount,{timeout:30000});
  state=await page.evaluate(()=>window.state());assert.equal(state.one,5014);assert.equal(state.mainSessionPreserved,true);
  assert.deepEqual(state.errors,[]);assert.deepEqual(state.fallbacks,[]);assert.deepEqual(errors,[]);checks.push('reopen uses complete current server state and same main Auth session');
  await page.evaluate(()=>window.close());const closedCount=await page.evaluate(()=>window.snapshots.length);
  await page.evaluate(()=>window.change('r-001',9000));await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>window.snapshots.length),closedCount);checks.push('closed worker cannot publish after later writes');
  await context.close();
}finally{await fs.writeFile(output+'/result.json',JSON.stringify({collectionName,checks,errors,
  scope:'Actual product read worker + client + Auth persistence, local demo Auth/Firestore SDK integration. Complete data/types/order/edits/deletes/queued-update gaps/cancellation verified. No real credentials or production data. Not Android/performance acceptance.'},null,2));
  await browser.close();await new Promise(resolve=>server.close(resolve));}
console.log(JSON.stringify({checks,errors}));
