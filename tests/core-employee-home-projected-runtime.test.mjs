import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {Readable} from 'node:stream';import path from 'node:path';import {createHash} from 'node:crypto';
import {buildProjectedEmployeeHomeProjector} from '../scripts/helpers/employee-home-projected-projector-build.mjs';
const require=createRequire(import.meta.url),{createEmployeeHomeRuntime,loadVerifiedEmployeeHomeArtifact}=require('../functions/employeeHomeRuntime');
test('verified projected artifact composes with authorization, selected native queries, private child and original financial DTO',{timeout:15000},async()=>{
 const built=await buildProjectedEmployeeHomeProjector('test-results/perf-target-20261102/projected-runtime-unit'),loaded=loadVerifiedEmployeeHomeArtifact(path.dirname(built.modulePath));
 const original=require(built.baselineModulePath);
 assert.deepEqual(loaded.fieldProjection,built.fieldProjection);
 const uid='synthetic-qa',time={seconds:1793590000,nanoseconds:123456789},root='artifacts/synthetic-app/public/data',prefix='projects/synthetic-project/databases/(default)/documents/'+root;
 const company={id:'company-a',exists:true,readTime:time,data:()=>({})},employee={id:'employee-a',exists:true,readTime:time,data:()=>({companyId:'company-a',name:'Synthetic employee',position:'Kinh doanh',basicSalary:6200000})};
 const datasets={employees:[{documentId:employee.id,data:employee.data()}],customers:[{documentId:'customer-a',data:{companyId:'company-a',empId:'employee-a',productPreferences:{privateUnused:'must not enter the projected stream'}}}],
  orders:[{documentId:'order-a',data:{companyId:'company-a',customerId:'customer-a',date:'2026-11-02',amount:3000000,items:[{privateUnused:999999999}]} }],
  payments:[{documentId:'payment-a',data:{companyId:'company-a',customerId:'customer-a',date:'2026-11-02',amount:1000000}}]};
 let queries=0,verifies=0;
 const db={doc:path=>({path}),getAll:async()=>[company,employee],runTransaction:async(fn,options)=>{assert.deepEqual(options,{readOnly:true});return fn({getAll:async()=>[company,employee]})}};
 const handler=createEmployeeHomeRuntime({db,admin:{firestore:{FieldPath:{documentId:()=>Symbol('id')}}},appId:'synthetic-app',applyCors(){},projectId:'synthetic-project',
  artifactDirectory:path.dirname(built.modulePath),qaActorSha256:createHash('sha256').update(uid).digest('hex'),identityCenter:{getVerifiedIdentity:async()=>{verifies++;return {identityId:'identity-a',decoded:{uid,identityId:'identity-a',companyId:'company-a',appUserId:'employee-a',accountType:'employee'},identity:{status:'active',accountType:'employee',companyId:'company-a',appUserId:'employee-a',publicCollection:'employees',publicId:'employee-a'}}}},
  getQueryClient:()=>({runQuery(request,options){queries++;assert.equal(options.retryRequestOptions.retries,0);assert.equal(request.readTime.nanos,time.nanoseconds);
   const name=request.structuredQuery.from[0].collectionId,selected=request.structuredQuery.select?.fields.map(f=>f.fieldPath),readTime={seconds:String(time.seconds),nanos:time.nanoseconds};
   const rows=(datasets[name]||[]).map(row=>({readTime,document:{name:prefix+'/'+name+'/'+row.documentId,
    fields:Object.fromEntries(Object.entries(row.data).filter(([key])=>!selected||selected.includes(key)).map(([key,value])=>[key,typeof value==='number'?{integerValue:String(value)}:{stringValue:value}]))}}));
   const stream=Readable.from(rows.length?rows:[{readTime}],{objectMode:true});stream.cancel=()=>stream.destroy();return stream;
  }})});
 const response=()=>({statusCode:0,payload:null,set(){return this},status(value){this.statusCode=value;return this},json(value){this.payload=value;return this},send(value){this.payload=JSON.parse(value);return this}});
 const request={method:'POST',body:{appId:'synthetic-app',date:'2026-11-02',timeZone:'Asia/Ho_Chi_Minh',nonce:'a'.repeat(16)}};
 const denied=response();await handler({...request,body:{...request.body,fieldsByCollection:{orders:[]}}},denied);assert.equal(denied.statusCode,400);assert.equal(queries,0);
 const result=response();await handler(request,result);assert.equal(result.statusCode,200,result.payload?.code);assert.equal(queries,14);assert(verifies>=3);
 const snapshot={company:{documentId:company.id,data:company.data()},employee:{documentId:employee.id,data:employee.data()},sources:Object.fromEntries(['employees','customers','orders','payments','expenses','financials','attendance','performance','employeeReviews','deliveryReports','holidays','advances','assets','assetCostLogs'].map(name=>[name,datasets[name]||[]])),counts:{}};
 for(const [name,rows]of Object.entries(snapshot.sources))snapshot.counts[name]=rows.length;
 assert.deepEqual(result.payload.model,original.projectEmployeeHomeSnapshot({companyId:'company-a',employeeId:'employee-a',date:'2026-11-02'},snapshot));
 assert.doesNotMatch(JSON.stringify(result.payload),/privateUnused|productPreferences|sources|fieldProjection/);
 assert.doesNotMatch(JSON.stringify(result.payload.model),/employee-a|company-a/);
});
