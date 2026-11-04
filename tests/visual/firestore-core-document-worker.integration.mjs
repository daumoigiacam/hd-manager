import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { chromiumLaunchOptions } from '../helpers/chromium-launch-options.mjs';

const output=process.env.HD_CORE_DOCUMENT_WORKER_OUTPUT||'test-results/core-document-worker-sdk';
const project='demo-hdm-cache-lab',appId='core-document-fixture';
const firestore='http://127.0.0.1:9195',auth='http://127.0.0.1:9196';
const parent=`projects/${project}/databases/(default)/documents/artifacts/${appId}/public/data/companies`;
await fs.mkdir(output,{recursive:true});
const seed=await fetch(`${firestore}/v1/projects/${project}/databases/(default)/documents:commit`,{
  method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer owner'},
  body:JSON.stringify({writes:[{update:{name:`${parent}/fixture`,fields:{label:{stringValue:'original'},payload:{stringValue:'x'.repeat(350000)},nested:{mapValue:{fields:{stamp:{timestampValue:'2026-10-31T01:02:03.123456789Z'},link:{referenceValue:`${parent}/fixture`}}}}}}},
    {update:{name:`${parent}/foreign`,fields:{companyId:{stringValue:'fixture'},label:{stringValue:'foreign must remain denied'}}}}]}),signal:AbortSignal.timeout(10000),
});assert.equal(seed.ok,true);
const rules=`rules_version='2';service cloud.firestore{match /databases/{database}/documents{
 match /artifacts/{app}/public/data/companies/{id}{allow read,write:if request.auth!=null&&id==request.auth.token.companyId;}
}}`;
const loaded=await fetch(`${firestore}/emulator/v1/projects/${project}:securityRules`,{method:'PUT',body:JSON.stringify({rules:{files:[{content:rules}]}}),signal:AbortSignal.timeout(10000)});
assert.equal(loaded.ok,true);
const worker=await build({entryPoints:['src/services/firestoreReadWorker.js'],bundle:true,write:false,format:'iife',target:'chrome74',define:{'process.env.NODE_ENV':'"production"'}});
const main=await build({stdin:{resolveDir:process.cwd(),contents:`
 import{initializeApp}from'firebase/app';
 import{initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithCustomToken}from'firebase/auth';
 import{initializeFirestore,connectFirestoreEmulator,doc,getDocFromServer,setDoc,deleteDoc,Timestamp,DocumentReference}from'firebase/firestore';
 import{createFirestoreReadWorkerClient}from'./src/services/firestoreReadWorkerClient.js';
 const app=initializeApp({projectId:${JSON.stringify(project)},apiKey:'synthetic-core-worker',appId:'synthetic-core-worker'}),auth=initializeAuth(app,{persistence:inMemoryPersistence});
 connectAuthEmulator(auth,${JSON.stringify(auth)},{disableWarnings:true});
 const db=initializeFirestore(app,{experimentalAutoDetectLongPolling:false,useFetchStreams:true});connectFirestoreEmulator(db,'127.0.0.1',9195);
 const reference=id=>doc(db,'artifacts',${JSON.stringify(appId)},'public','data','companies',id);
 let client,off;window.snapshots=[];window.errors=[];window.fallbacks=[];window.chunkCount=0;window.reuses=0;
 window.prepare=async()=>{
  const user=(await signInWithCustomToken(auth,JSON.stringify({uid:'fixture-core-user',claims:{companyId:'fixture',accountType:'employee'}}))).user;
  window.baseline=(await getDocFromServer(reference('fixture'))).data();
  client=createFirestoreReadWorkerClient({user,config:app.options,appId:${JSON.stringify(appId)},companyId:'fixture',accountType:'employee',db,
   emulator:{host:'127.0.0.1',authPort:9196,firestorePort:9195},
   workerFactory:()=>{const w=new Worker('/worker.js');w.addEventListener('message',event=>{if(event.data.type==='chunk')window.chunkCount++;if(event.data.type==='begin'&&event.data.baselineId)window.reuses++});return w},
   onAuthInvalid:()=>window.errors.push('Unexpected auth invalidation'),onFallback:()=>window.fallbacks.push('unexpected fallback')});
  window.subscribe();
 };
 window.subscribe=()=>{off=client.subscribe('companies',{publish:(snapshot,items)=>{if(!snapshot.metadata.fromCache)window.snapshots.push({snapshot,items})},error:error=>window.errors.push(error.code||'read-error'),fallback:()=>{window.fallbacks.push('unexpected fallback');return()=>{}}})};
 window.unsubscribe=()=>off();window.stop=()=>client.close();
 window.modify=()=>setDoc(reference('fixture'),{label:'changed'},{merge:true});
 window.remove=()=>deleteDoc(reference('fixture'));
 window.recreate=()=>setDoc(reference('fixture'),{label:'recreated'});
 window.foreign=async()=>{try{await getDocFromServer(reference('foreign'));return 'UNEXPECTED_ACCESS'}catch(error){return error.code}};
 window.inspect=()=>{const first=window.snapshots[0].items[0],last=window.snapshots.at(-1).items;return{firstId:first.id,payloadChars:first.data.payload.length,nestedNanos:first.data.nested.stamp.nanoseconds,baselineNanos:window.baseline.nested.stamp.nanoseconds,nestedMatches:first.data.nested.stamp.isEqual(window.baseline.nested.stamp),isTimestamp:first.data.nested.stamp instanceof Timestamp,isReference:first.data.nested.link instanceof DocumentReference,reference:first.data.nested.link.path,firstLabel:first.data.label,lastIds:last.map(item=>item.id),lastLabels:last.map(item=>item.data.label),errors:window.errors,fallbacks:window.fallbacks}};
 `},bundle:true,write:false,format:'iife',target:'chrome74',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'actual-core-worker-aliases',setup(b){
 b.onResolve({filter:/^@hd\/firestore-read-worker$/},()=>({path:'actual-worker',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const createFirestoreReadWorker=()=>new Worker("/worker.js")'}));
 b.onResolve({filter:/^@hd\/firestore-worker-values$/},()=>({path:path.resolve('src/services/firestoreWorkerValues.js')}));
 }}]});
const server=http.createServer((request,response)=>{response.setHeader('Content-Type',request.url==='/'?'text/html':'text/javascript');response.end(request.url==='/worker.js'?worker.outputFiles[0].contents:request.url==='/main.js'?main.outputFiles[0].contents:'<script src="/main.js"></script>')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch(chromiumLaunchOptions()),checks=[],errors=[];
try{
 const context=await browser.newContext();await context.route('**/*',route=>[origin,firestore,auth].includes(new URL(route.request().url()).origin)?route.continue():route.abort());
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);await page.evaluate(()=>window.prepare());
 await page.waitForFunction(()=>window.snapshots.length>0,null,{timeout:30000});
 const initial=await page.evaluate(()=>window.inspect());assert.equal(initial.firstId,'fixture');assert.equal(initial.payloadChars,350000);assert.equal(initial.nestedNanos,initial.baselineNanos);assert(initial.nestedMatches);assert(initial.isTimestamp&&initial.isReference);assert.equal(initial.reference,`artifacts/${appId}/public/data/companies/fixture`);
 assert.equal(await page.evaluate(()=>window.foreign()),'permission-denied');checks.push('exact company document with no companyId field; foreign document denied; complete large payload and native nested types preserved');
 await page.evaluate(()=>window.modify());await page.waitForFunction(()=>window.snapshots.at(-1).items[0]?.data.label==='changed');
 assert.equal((await page.evaluate(()=>window.inspect())).firstLabel,'original');checks.push('document change publishes a full atomic new value without mutating its previous snapshot');
 const before=await page.evaluate(()=>({chunks:window.chunkCount,reuses:window.reuses}));await page.evaluate(()=>window.unsubscribe());await page.waitForTimeout(100);await page.evaluate(()=>window.subscribe());
 await page.waitForFunction(count=>window.reuses>count,before.reuses);assert.equal(await page.evaluate(()=>window.chunkCount),before.chunks);checks.push('unchanged direct document reopens using its exact acknowledged baseline with no duplicate row transfer');
 await page.evaluate(()=>window.remove());await page.waitForFunction(()=>window.snapshots.at(-1).items.length===0);
 await page.evaluate(()=>window.recreate());await page.waitForFunction(()=>window.snapshots.at(-1).items[0]?.data.label==='recreated');checks.push('missing and recreated company documents publish correct empty/full snapshots without QuerySnapshot-only APIs');
 const final=await page.evaluate(()=>window.inspect());assert.deepEqual(final.lastIds,['fixture']);assert.deepEqual(final.errors,[]);assert.deepEqual(final.fallbacks,[]);assert.deepEqual(errors,[]);await page.evaluate(()=>window.stop());
}finally{await fs.writeFile(output+'/result.json',JSON.stringify({checks,errors,scope:'Actual pinned Firebase SDK Auth and Firestore on isolated demo emulators only; exact-company-document read, typed large payload, denial, update/delete/reopen. No production requests, real credentials, or latency certification.'},null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
console.log(JSON.stringify({checks:checks.length,errors}));
