import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
import {buildEmployeeHomeProjector} from '../scripts/helpers/employee-home-projector-build.mjs';
import {Readable} from 'node:stream';
const require=createRequire(import.meta.url),{loadVerifiedEmployeeHomeArtifact,createEmployeeHomeRuntime}=require('../functions/employeeHomeRuntime.js');
const output='test-results/perf-target-20261102/private-home-runtime-unit';

test('runtime loads a portable hash-verified pure calculation artifact, ignoring host build paths',{timeout:15000},async()=>{
 const built=await buildEmployeeHomeProjector(output+'/built'),target=path.resolve(output,'relocated');await mkdir(target,{recursive:true});
 await copyFile(built.modulePath,path.join(target,built.fileName));
 const manifest={...built,modulePath:'Z:/untrusted-build-host/ignored.cjs'};await writeFile(path.join(target,'manifest.json'),JSON.stringify(manifest));
 const loaded=loadVerifiedEmployeeHomeArtifact(target);assert.equal(loaded.domainVersion,built.domainVersion);assert.equal(loaded.modulePath,path.join(target,built.fileName));
 assert.equal(typeof loaded.validate,'function');
 await writeFile(path.join(target,built.fileName),(await readFile(built.modulePath,'utf8'))+'\n// changed');
 assert.throws(()=>loadVerifiedEmployeeHomeArtifact(target),/hash mismatch/);
 manifest.fileName='../outside.cjs';await writeFile(path.join(target,'manifest.json'),JSON.stringify(manifest));assert.throws(()=>loadVerifiedEmployeeHomeArtifact(target),/manifest/);
 assert.throws(()=>loadVerifiedEmployeeHomeArtifact('relative-directory'),TypeError);
});

test('composed runtime is inert until an authorized request, never initializes or writes Firebase and rejects unauthenticated calls',{timeout:15000},async()=>{
 const built=await buildEmployeeHomeProjector(output+'/inert'),db={runTransaction(){throw Error('Unverified source access')},getAll(){throw Error('Unverified actor access')}};
 let verifies=0;
 const handler=createEmployeeHomeRuntime({db,admin:{firestore:{FieldPath:{documentId:()=>Symbol('id')}}},appId:'synthetic-app',artifactDirectory:path.dirname(built.modulePath),qaActorSha256:'a'.repeat(64),
  identityCenter:{getVerifiedIdentity:async value=>{verifies++;assert.equal(value,'Bearer synthetic-token');throw Object.assign(new Error('Private auth message'),{statusCode:401,code:'unauthorized'})}},applyCors(){}});
 assert.equal(verifies,0);const response={statusCode:0,payload:null,set(){return this},status(n){this.statusCode=n;return this},json(value){this.payload=value;return this}};
 await handler({method:'POST',headers:{authorization:'Bearer synthetic-token'}},response);
 assert.equal(verifies,1);assert.equal(response.statusCode,401);assert.equal(response.payload.success,false);assert.doesNotMatch(JSON.stringify(response.payload),/Private auth/);
});

test('complete composed read-only path enumerates the snapshot and runs the real private child, restricted to the approved QA identity',{timeout:15000},async()=>{
 const built=await buildEmployeeHomeProjector(output+'/authorized'),time={seconds:1793590000,nanoseconds:123456789};
 const company={id:'company-a',exists:true,readTime:time,data:()=>({name:'Synthetic company'})};
 const employee={id:'employee-a',exists:true,readTime:time,data:()=>({companyId:'company-a',name:'Synthetic employee',position:'Nhân viên',basicSalary:6200000,startDate:'2025-01-01'})};
 const identity=uid=>({identityId:'identity-a',decoded:{uid,identityId:'identity-a',companyId:'company-a',appUserId:'employee-a',accountType:'employee'},
  identity:{status:'active',accountType:'employee',companyId:'company-a',appUserId:'employee-a',publicCollection:'employees',publicId:'employee-a'}});
 const counts={transactions:0,queries:0,actorChecks:0};let uid='approved-qa-uid',currentCompanyPatch={},currentEmployeePatch={};
 const masked=(doc,options,patch={})=>{
  assert.deepEqual(options.fieldMask,['companyId','isArchived','disabled','lockedAt','status','accountStatus']);
  const data={...doc.data(),...patch,avatar:'synthetic-media'.repeat(10000)};
  return {...doc,data:()=>Object.fromEntries(options.fieldMask.filter(key=>Object.hasOwn(data,key)).map(key=>[key,data[key]]))};
 };
 class Query{constructor(name){this.name=name}where(){return this}orderBy(){return this}limit(){return this}}
 const db={doc:p=>({path:p}),collection:p=>new Query(p.split('/').at(-1)),
  async getAll(c,e,options){assert(c.path.endsWith('/companies/company-a'));assert(e.path.endsWith('/employees/employee-a'));counts.actorChecks++;return [masked(company,options,currentCompanyPatch),masked(employee,options,currentEmployeePatch)]},
  async runTransaction(fn,options){assert.deepEqual(options,{readOnly:true});counts.transactions++;
   return fn({async getAll(c,e,options){assert(c.path.endsWith('/companies/company-a'));assert(e.path.endsWith('/employees/employee-a'));return [masked(company,options),masked(employee,options)]},async get(query){counts.queries++;return {readTime:time,docs:query.name==='employees'?[employee]:[]}}})}};
 const makeHandler=()=>createEmployeeHomeRuntime({db,admin:{firestore:{FieldPath:{documentId:()=>Symbol('id')}}},identityCenter:{getVerifiedIdentity:async()=>identity(uid)},
  appId:'synthetic-app',applyCors(){},artifactDirectory:path.dirname(built.modulePath),qaActorSha256:createHash('sha256').update(uid).digest('hex')});
 const handler=makeHandler();
 const request={method:'POST',headers:{authorization:'Bearer synthetic-only'},body:{appId:'synthetic-app',date:'2026-11-02',timeZone:'Asia/Ho_Chi_Minh',nonce:'a'.repeat(16)}};
 const response=()=>({statusCode:0,payload:null,set(){return this},status(n){this.statusCode=n;return this},send(v){this.payload=JSON.parse(v);return this},json(v){this.payload=v;return this}});
 uid='another-valid-employee';const rejected=response();await handler(request,rejected);assert.equal(rejected.statusCode,403);assert.equal(counts.transactions,0);
 uid='approved-qa-uid';const accepted=response();await handler(request,accepted);assert.equal(accepted.statusCode,200);
 assert.equal(accepted.payload.domainVersion,built.domainVersion);assert.equal(accepted.payload.model.monthKey,'2026-11');assert.equal(accepted.payload.model.version,1);
 assert.equal(counts.transactions,1);assert.equal(counts.queries,14);assert.equal(counts.actorChecks,1);assert.doesNotMatch(JSON.stringify(accepted.payload),/Synthetic employee|sources|password/);
 // Exercise the actual deployed streaming branch through HTTP composition and
 // the real child too, and compare it with the original SDK snapshot path.
 let streamed=0,credentials=0;const originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://firestore.googleapis.com/v1/projects/synthetic-project/databases/(default)/documents/artifacts/synthetic-app/public/data:runQuery');
  assert.equal(options.headers.Authorization,'Bearer synthetic-service-token');
  const body=JSON.parse(options.body),name=body.structuredQuery.from[0].collectionId;streamed++;
  const readTime='2026-11-02T03:26:40.123456789Z';
  const fields=Object.fromEntries(Object.entries(employee.data()).map(([key,value])=>[key,typeof value==='number'?{integerValue:String(value)}:{stringValue:value}]));
  const entries=name==='employees'?[{readTime,document:{name:'projects/synthetic-project/databases/(default)/documents/artifacts/synthetic-app/public/data/employees/employee-a',fields}}]:[{readTime}];
  return new Response(JSON.stringify(entries),{status:200});
 };
 try{
  const streamHandler=createEmployeeHomeRuntime({db,admin:{firestore:{FieldPath:{documentId:()=>Symbol('id')}}},identityCenter:{getVerifiedIdentity:async()=>identity(uid)},
   appId:'synthetic-app',projectId:'synthetic-project',getAccessToken:async()=>{credentials++;return {access_token:'synthetic-service-token'}},applyCors(){},
   artifactDirectory:path.dirname(built.modulePath),qaActorSha256:createHash('sha256').update(uid).digest('hex')});
  const streamResponse=response();await streamHandler(request,streamResponse);assert.equal(streamResponse.statusCode,200);
  assert.deepEqual(streamResponse.payload.model,accepted.payload.model);assert.equal(streamed,14);assert.equal(credentials,1);
 }finally{globalThis.fetch=originalFetch}
 let nativeQueries=0;
 const nativeHandler=createEmployeeHomeRuntime({db,admin:{firestore:{FieldPath:{documentId:()=>Symbol('id')}}},identityCenter:{getVerifiedIdentity:async()=>identity(uid)},
  appId:'synthetic-app',projectId:'synthetic-project',getQueryClient:()=>({runQuery(request,options){
   nativeQueries++;assert.equal(options.retry,null);assert.equal(options.retryRequestOptions.retries,0);assert.equal(request.readTime.nanos,time.nanoseconds);
   const name=request.structuredQuery.from[0].collectionId,readTime={seconds:String(time.seconds),nanos:time.nanoseconds};
   const fields=Object.fromEntries(Object.entries(employee.data()).map(([key,value])=>[key,typeof value==='number'?{integerValue:String(value)}:{stringValue:value}]));
   const entries=name==='employees'?[{readTime,document:{name:'projects/synthetic-project/databases/(default)/documents/artifacts/synthetic-app/public/data/employees/employee-a',fields}}]:[{readTime}];
   const stream=Readable.from(entries,{objectMode:true});stream.cancel=()=>stream.destroy();return stream;
  }}),getAccessToken:()=>{assert.fail('native path must not fall back to REST')},applyCors(){},artifactDirectory:path.dirname(built.modulePath),qaActorSha256:createHash('sha256').update(uid).digest('hex')});
 const nativeResponse=response();await nativeHandler(request,nativeResponse);assert.equal(nativeResponse.statusCode,200,nativeResponse.payload?.code);
 assert.deepEqual(nativeResponse.payload.model,accepted.payload.model);assert.equal(nativeQueries,14);
 // All authorization flags must survive the mask on a fresh actor check after
 // calculation. Neither media stripping nor a previously valid snapshot may
 // publish for an actor who was locked/revoked while the calculation ran.
 for(const flag of [{isArchived:true},{disabled:true},{lockedAt:'synthetic-lock'},{status:'blocked'},{accountStatus:'revoked'}]){
  for(const kind of ['company','employee']){
   currentCompanyPatch=kind==='company'?flag:{};currentEmployeePatch=kind==='employee'?flag:{};
   const result=response();await makeHandler()({...request},result);assert.equal(result.statusCode,403,result.payload?.code);assert.equal(result.payload.code,'home_actor_denied');
  }
 }
});
