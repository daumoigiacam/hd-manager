import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),{EMPLOYEE_HOME_QA_OPTIONS,createEmployeeHomeQaEndpoint}=require('../functions/employeeHomeQaEndpoint');
const response=()=>({statusCode:0,payload:null,headers:{},set(k,v){this.headers[k]=v;return this},status(n){this.statusCode=n;return this},send(v){this.payload=v;return this},json(v){this.payload=v;return this}});
test('approved QA endpoint has no idle instance, one request/instance and only its explicit regional export',()=>{
 assert.deepEqual(EMPLOYEE_HOME_QA_OPTIONS,{region:'asia-southeast1',memory:'512MiB',concurrency:1,minInstances:0,maxInstances:1,timeoutSeconds:15,invoker:'public'});
 const index=readFileSync('functions/index.js','utf8');assert.match(index,/exports\.employeeHomeBootstrapRegional=functions\.https\.onRequest\(EMPLOYEE_HOME_QA_OPTIONS/);
});
test('preflight and unsupported methods require no artifact or Firebase read; incomplete QA configuration fails closed',async()=>{
 let cors=0,config=0;const handler=createEmployeeHomeQaEndpoint({applyCors:(_req,res)=>{cors++;res.set('Access-Control-Allow-Origin','https://localhost')},getAppId:()=>{config++;return 'synthetic-app'},getQaActorSha256:()=>'',artifactDirectory:'relative-invalid'});
 const preflight=response();await handler({method:'OPTIONS'},preflight);assert.equal(preflight.statusCode,204);assert.equal(config,0);
 const method=response();await handler({method:'GET'},method);assert.equal(method.statusCode,405);assert.equal(config,0);
 const post=response();await handler({method:'POST'},post);assert.equal(post.statusCode,503);assert.equal(post.payload.code,'home_qa_not_configured');assert.equal(cors,3);
 assert.match(post.headers['Cache-Control'],/private.*no-store/);
});
