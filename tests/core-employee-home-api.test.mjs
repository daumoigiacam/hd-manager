import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {validateEmployeeHomeScreenDto} from '../src/services/employeeHomeScreenDto.js';
const require=createRequire(import.meta.url),{createEmployeeHomeApi}=require('../functions/employeeHomeApi.js');
const verified=()=>({identityId:'identity-a',decoded:{uid:'uid-a',identityId:'identity-a',companyId:'company-a',appUserId:'employee-a',accountType:'employee'},
 identity:{status:'active',accountType:'employee',companyId:'company-a',appUserId:'employee-a',publicCollection:'employees',publicId:'employee-a'}});
const actor=()=>({company:{documentId:'company-a',data:{name:'PRIVATE_COMPANY_SENTINEL'}},employee:{documentId:'employee-a',data:{companyId:'company-a',passwordHash:'PRIVATE_PASSWORD_SENTINEL'}}});
const model=()=>({version:1,monthKey:'2026-11',positionLabel:'Synthetic employee',reviewStars:null,
 salary:{netSalary:123,workDays:1,salesRevenue:456,rows:[]},sales:{show:false,orderCount:0,customerCount:0},
 assets:{show:false,count:0,monthCost:0,latest:null,rows:[]},attendance:{status:'Chưa chấm',tone:'rose',shiftLabel:'Synthetic shift',in:{value:'-',source:'',tone:'bad'},out:{value:'-',source:'',tone:'warn'},lateMinutes:0,autoOvertimeMinutes:0},
 delivery:{income:0,expense:0,reportCount:0,rows:[]}});
const req=(patch={})=>({method:'POST',headers:{authorization:'Bearer synthetic-only'},body:{appId:'synthetic-app',date:'2026-11-02',timeZone:'Asia/Ho_Chi_Minh',nonce:'a'.repeat(16)},...patch});
const res=()=>({headers:{},statusCode:null,body:null,set(name,value){this.headers[name]=value;return this},status(code){this.statusCode=code;return this},send(value){this.body=value?JSON.parse(value):null;return this},json(value){this.body=value;return this}});
const deferred=()=>{let resolve;const promise=new Promise(yes=>resolve=yes);return{promise,resolve}};
function fixture(overrides={}){
 const counts={verified:0,loaded:0,projected:0,actor:0,cors:0};
 const handler=createEmployeeHomeApi({allowedAppId:'synthetic-app',verifyIdentity:async()=>{counts.verified++;return verified()},
  load:async()=>{counts.loaded++;return {...actor(),sources:{secret:'PRIVATE_SOURCE_SENTINEL'},readTime:'2026-11-02T01:00:00.123456789Z'}},
  project:async()=>{counts.projected++;return{kind:'hd-employee-home-model-v1',domainVersion:'a'.repeat(64),model:model()}},
  loadCurrentActor:async scope=>{assert.equal(scope.companyId,'company-a');assert.equal(scope.employeeId,'employee-a');counts.actor++;return actor()},
  applyCors:(_req,r)=>{counts.cors++;r.set('Access-Control-Allow-Origin','https://synthetic.example')},validateModel:validateEmployeeHomeScreenDto,...overrides});
 return {handler,counts,run:async request=>{const response=res();await handler(request||req(),response);return response}};
}

test('protected API returns only own validated complete display model and a nonce/read-time scope, with no shared cache headers',async()=>{
 const h=fixture(),response=await h.run();assert.equal(response.statusCode,200);assert.equal(response.body.success,true);
 assert.equal(response.body.model.salary.netSalary,123);assert.equal(response.body.scope.nonce,'a'.repeat(16));
 assert.equal(response.body.readTime,'2026-11-02T01:00:00.123456789Z');assert.deepEqual(h.counts,{verified:2,loaded:1,projected:1,actor:1,cors:1});
 assert.match(response.headers['Cache-Control'],/private.*no-store/);assert.equal(response.headers.Vary,'Origin');
 assert.doesNotMatch(JSON.stringify(response.body),/PRIVATE_|passwordHash|sources|employeeReviews/);
});

test('identity/app/actor mismatch and untrusted extra body fields cannot start a history read',async()=>{
 for(const mutate of [v=>{v.identity.status='blocked'},v=>{v.identity.companyId='foreign'},v=>{v.identity.appUserId='other'},v=>{v.identityId='other'},v=>{v.identity.publicCollection='customers'},v=>{v.decoded.accountType='customer'}]){
  const h=fixture({verifyIdentity:async()=>{const v=verified();mutate(v);return v}}),response=await h.run();
  assert.equal(response.statusCode,403);assert.equal(h.counts.loaded,0);
 }
 for(const patch of [{appId:'foreign'},{employeeId:'other'},{nonce:'short'},{timeZone:'Invalid/Zone'},{date:'2026-02-30'}]){
  const h=fixture(),request=req();Object.assign(request.body,patch);const response=await h.run(request);
  assert([400,403].includes(response.statusCode));assert.equal(h.counts.loaded,0);
 }
});

test('revocation, tenant movement or live public actor disable during calculation prevent publication',async()=>{
 for(const mode of ['revoked','identity-moved','employee-disabled','company-archived','foreign-actor']){
  const gate=deferred(),started=deferred();let verifiedCount=0;
  const h=fixture({verifyIdentity:async()=>{const v=verified();if(++verifiedCount>1){if(mode==='revoked')v.identity.status='blocked';if(mode==='identity-moved'){v.identity.companyId='foreign';v.decoded.companyId='foreign'}}return v},
   project:async()=>{started.resolve();await gate.promise;return{kind:'hd-employee-home-model-v1',domainVersion:'a'.repeat(64),model:model()}},
   loadCurrentActor:async()=>{const a=actor();if(mode==='employee-disabled')a.employee.data.disabled=true;if(mode==='company-archived')a.company.data.isArchived=true;if(mode==='foreign-actor')a.employee.data.companyId='foreign';return a}});
  const result=h.run();await started.promise;gate.resolve();const response=await result;
  assert.equal(response.statusCode,403,mode);assert.equal(response.body.success,false);assert.equal(response.body.model,undefined);
 }
});

test('joined reads remain independently verified, current and nonce-bound; cancelled response publishes nothing',async()=>{
 const gate=deferred(),started=deferred();let loads=0;
 const h=fixture({load:async()=>{loads++;started.resolve();await gate.promise;return{...actor(),readTime:'2026-11-02T01:00:00.000000001Z'}}});
 const a=req(),b=req();b.body.nonce='b'.repeat(16);const ar=res(),br=res();
 const first=h.handler(a,ar);await started.promise;const second=h.handler(b,br);await new Promise(resolve=>setImmediate(resolve));
 a.aborted=true;gate.resolve();await Promise.all([first,second]);assert.equal(loads,1);assert.equal(ar.body,null);assert.equal(br.statusCode,200);assert.equal(br.body.scope.nonce,'b'.repeat(16));
});

test('missing/failed sources and unexpected projection fields stay errors, never zero-valued success or raw error messages',async()=>{
 for(const overrides of [
  {load:async()=>{throw Object.assign(new Error('PRIVATE_FAILURE_SENTINEL'),{statusCode:503,code:'home_snapshot_unconfirmed'})}},
  {project:async()=>({kind:'hd-employee-home-model-v1',domainVersion:'a'.repeat(64),model:{...model(),password:'PRIVATE_PASSWORD_SENTINEL'}})},
  {project:async()=>({kind:'hd-employee-home-model-v1',domainVersion:'wrong',model:model()})},
 ]){const response=await fixture(overrides).run();assert(response.statusCode>=500);assert.equal(response.body.success,false);assert.doesNotMatch(JSON.stringify(response.body),/PRIVATE_/)}
 const h=fixture();assert.equal((await h.run(req({method:'OPTIONS'}))).statusCode,204);assert.equal((await h.run(req({method:'GET'}))).statusCode,405);assert.equal(h.counts.loaded,0);assert.equal(h.counts.verified,0);
});
