import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { chromiumLaunchOptions } from '../helpers/chromium-launch-options.mjs';

const output=process.env.HD_MANAGER_INBOX_WORKER_OUTPUT||'test-results/manager-inbox-worker-sdk';
const project='demo-hdm-cache-lab',appId='manager-inbox-fixture',firestore='http://127.0.0.1:9195',auth='http://127.0.0.1:9196';
const parent=`projects/${project}/databases/(default)/documents/artifacts/${appId}/public/data/messages`;
await fs.mkdir(output,{recursive:true});
const seed=await fetch(`${firestore}/v1/projects/${project}/databases/(default)/documents:commit`,{
 method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer owner'},
 body:JSON.stringify({writes:[...Array.from({length:230},(_,index)=>({update:{name:`${parent}/m-${String(index).padStart(3,'0')}`,fields:{companyId:{stringValue:'fixture'},amount:{integerValue:String(index)},createdAt:{timestampValue:new Date(Date.UTC(2026,10,1)+index*1000).toISOString()},text:{stringValue:'x'.repeat(30000)}}}})),
 {update:{name:`${parent}/foreign`,fields:{companyId:{stringValue:'foreign'},createdAt:{timestampValue:'2026-12-01T00:00:00Z'}}}},
 {update:{name:`${parent}/missing-time`,fields:{companyId:{stringValue:'fixture'}}}}]}),signal:AbortSignal.timeout(20000),
});assert.equal(seed.ok,true);
const rules=`rules_version='2';service cloud.firestore{match /databases/{database}/documents{
match /artifacts/{app}/public/data/messages/{id}{allow read:if request.auth!=null&&request.auth.token.role=='accounting'&&resource.data.companyId==request.auth.token.companyId;
allow create,update:if request.auth!=null&&request.auth.token.role=='accounting'&&request.resource.data.companyId==request.auth.token.companyId;}
}}`;
const loaded=await fetch(`${firestore}/emulator/v1/projects/${project}:securityRules`,{method:'PUT',body:JSON.stringify({rules:{files:[{content:rules}]}}),signal:AbortSignal.timeout(10000)});assert.equal(loaded.ok,true);
const worker=await build({entryPoints:['src/services/firestoreReadWorker.js'],bundle:true,write:false,format:'iife',target:'chrome74',define:{'process.env.NODE_ENV':'"production"'}});
const main=await build({stdin:{resolveDir:process.cwd(),contents:`
import{initializeApp}from'firebase/app';import{initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithCustomToken}from'firebase/auth';
import{initializeFirestore,connectFirestoreEmulator,doc,getDocFromServer,setDoc}from'firebase/firestore';
import{createFirestoreReadWorkerClient}from'./src/services/firestoreReadWorkerClient.js';
const app=initializeApp({projectId:${JSON.stringify(project)},apiKey:'synthetic-manager-inbox',appId:'synthetic-manager-inbox'}),auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,${JSON.stringify(auth)},{disableWarnings:true});
const db=initializeFirestore(app,{experimentalAutoDetectLongPolling:false,useFetchStreams:true});connectFirestoreEmulator(db,'127.0.0.1',9195);
const reference=id=>doc(db,'artifacts',${JSON.stringify(appId)},'public','data','messages',id);let client;
window.snapshots=[];window.errors=[];window.fallbacks=[];window.batchSizes=[];
window.prepare=async()=>{const user=(await signInWithCustomToken(auth,JSON.stringify({uid:'fixture-manager',claims:{companyId:'fixture',accountType:'employee',role:'accounting'}}))).user;
client=createFirestoreReadWorkerClient({user,config:app.options,appId:${JSON.stringify(appId)},companyId:'fixture',accountType:'employee',db,emulator:{host:'127.0.0.1',authPort:9196,firestorePort:9195},
workerFactory:()=>{const w=new Worker('/worker.js');w.addEventListener('message',event=>{if(event.data.type==='chunk')window.batchSizes.push(event.data.rows.length)});return w},onAuthInvalid:()=>window.errors.push('Unexpected auth invalidation'),onFallback:()=>window.fallbacks.push('unexpected fallback')});
client.subscribe('messages',{publish:(snapshot,items)=>{if(!snapshot.metadata.fromCache)window.snapshots.push(items)},error:error=>window.errors.push(error.code||'read-error'),fallback:()=>{window.fallbacks.push('unexpected fallback');return()=>{}}})};
window.foreign=async()=>{try{await getDocFromServer(reference('foreign'));return 'UNEXPECTED_ACCESS'}catch(error){return error.code}};
window.promote=()=>setDoc(reference('m-000'),{createdAt:new Date('2026-11-02T00:00:00Z')},{merge:true});
window.stop=()=>client.close();
`},bundle:true,write:false,format:'iife',target:'chrome74',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'actual-manager-worker-aliases',setup(b){
b.onResolve({filter:/^@hd\/firestore-read-worker$/},()=>({path:'actual-worker',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const createFirestoreReadWorker=()=>new Worker("/worker.js")'}));
b.onResolve({filter:/^@hd\/firestore-worker-values$/},()=>({path:path.resolve('src/services/firestoreWorkerValues.js')}));
}}]});
const server=http.createServer((request,response)=>{response.setHeader('Content-Type',request.url==='/'?'text/html':'text/javascript');response.end(request.url==='/worker.js'?worker.outputFiles[0].contents:request.url==='/main.js'?main.outputFiles[0].contents:'<script src="/main.js"></script>')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch(chromiumLaunchOptions()),checks=[],errors=[];
try{
const context=await browser.newContext();await context.route('**/*',route=>[origin,firestore,auth].includes(new URL(route.request().url()).origin)?route.continue():route.abort());const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
await page.goto(origin);await page.evaluate(()=>window.prepare());await page.waitForFunction(()=>window.snapshots.length>0,null,{timeout:30000});
const initial=await page.evaluate(()=>({ids:window.snapshots[0].map(item=>item.id),payloads:window.snapshots[0].map(item=>item.data.text.length),batchSizes:window.batchSizes}));
assert.deepEqual(initial.ids,Array.from({length:200},(_,index)=>`m-${String(229-index).padStart(3,'0')}`));assert(initial.payloads.every(size=>size===30000));assert(initial.batchSizes.every(size=>size===1));checks.push('same companyId filter, createdAt descending and limit 200; complete large rows delivered in single-record batches');
assert.equal(await page.evaluate(()=>window.foreign()),'permission-denied');checks.push('foreign company denied and missing createdAt excluded exactly as the original ordered query');
await page.evaluate(()=>window.promote());await page.waitForFunction(()=>window.snapshots.at(-1)[0]?.id==='m-000',null,{timeout:30000});
const latest=await page.evaluate(()=>({ids:window.snapshots.at(-1).map(item=>item.id),firstIds:window.snapshots[0].map(item=>item.id),errors:window.errors,fallbacks:window.fallbacks}));
assert.equal(latest.ids.length,200);assert.equal(latest.ids[0],'m-000');assert(!latest.ids.includes('m-030'));assert.deepEqual(latest.firstIds,initial.ids);assert.deepEqual(latest.errors,[]);assert.deepEqual(latest.fallbacks,[]);assert.deepEqual(errors,[]);checks.push('out-of-window record promoted by timestamp enters the ordered bounded result without mutating the previous snapshot');await page.evaluate(()=>window.stop());
}finally{await fs.writeFile(output+'/result.json',JSON.stringify({checks,errors,scope:'Real SDK on isolated demo Auth/Firestore emulators. Tests only the one-query manager inbox with unchanged company/order/limit constraints. Assigned-employee two-query and customer paths are not moved by this change. Not production latency.'},null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
console.log(JSON.stringify({checks:checks.length,errors}));
