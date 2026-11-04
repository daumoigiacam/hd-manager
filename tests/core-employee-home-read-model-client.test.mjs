import test from 'node:test';import assert from 'node:assert/strict';
import {readEmployeeHomeScreenModel,getEmployeeHomeReadModelUrl} from '../src/services/employeeHomeReadModelClient.js';
const actor={uid:'uid-a',companyId:'company-a',employeeId:'employee-a'},date='2026-11-02',timeZone='Asia/Ho_Chi_Minh',domainVersion='a'.repeat(64),nonce='n'.repeat(16);
const model=()=>({version:1,monthKey:'2026-11',positionLabel:'Synthetic employee',reviewStars:null,
 salary:{netSalary:123,workDays:1,salesRevenue:456,rows:[{label:'Synthetic salary',amount:123,tone:'good'}]},sales:{show:false,orderCount:0,customerCount:0},
 assets:{show:false,count:0,monthCost:0,latest:null,rows:[]},attendance:{status:'Chưa chấm',tone:'rose',shiftLabel:'Synthetic shift',in:{value:'-',source:'',tone:'bad'},out:{value:'-',source:'',tone:'warn'},lateMinutes:0,autoOvertimeMinutes:0},
 delivery:{income:0,expense:0,reportCount:0,rows:[]}});
const reply=()=>({success:true,kind:'hd-employee-home-model-v1',domainVersion,model:model(),readTime:'2026-11-02T01:00:00.123456789Z',scope:{...actor,date,timeZone,monthKey:'2026-11',nonce}});
const response=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
const options=(patch={})=>({projectId:'demo-private-home',appId:'synthetic-app',actor:{...actor},date,timeZone,domainVersion,getIdToken:async()=>'synthetic.token.only',isCurrent:()=>true,
 nonceFactory:()=>nonce,fetchImpl:async()=>response(reply()),...patch});
const deferred=()=>{let resolve;const promise=new Promise(yes=>resolve=yes);return{promise,resolve}};

test('client sends token only to the fixed regional endpoint and publishes one frozen, scope/version-bound DTO without source flags',async()=>{
 let captured;
 const result=await readEmployeeHomeScreenModel(options({fetchImpl:async(url,init)=>{captured={url,init};return response(reply())}}));
 assert.equal(captured.url,'https://asia-southeast1-demo-private-home.cloudfunctions.net/employeeHomeBootstrapRegional');
 assert.equal(captured.init.headers.Authorization,'Bearer synthetic.token.only');assert.equal(captured.init.credentials,'omit');assert.equal(captured.init.cache,'no-store');
 assert.deepEqual(JSON.parse(captured.init.body),{appId:'synthetic-app',date,timeZone,nonce});
 assert.equal(result.model.salary.netSalary,123);assert(Object.isFrozen(result));assert(Object.isFrozen(result.model.salary.rows[0]));
 assert.equal(result.serverConfirmedCollectionState,undefined);assert.equal(result.sources,undefined);
});

test('foreign actor, stale nonce, different period/timezone/domain, unknown fields and malformed server time never publish',async()=>{
 for(const mutate of [r=>{r.scope.uid='foreign'},r=>{r.scope.companyId='foreign'},r=>{r.scope.employeeId='foreign'},r=>{r.scope.nonce='old'.repeat(8)},
  r=>{r.scope.date='2026-11-01'},r=>{r.scope.timeZone='UTC'},r=>{r.domainVersion='b'.repeat(64)},r=>{r.scope.extra=true},r=>{r.sources=[]},
  r=>{r.model.salary.secret='PRIVATE_SENTINEL'},r=>{r.model.monthKey='2026-10'},r=>{r.readTime='2026-02-30T01:00:00.000000000Z'},r=>{r.readTime='2026-11-02T01:00:00Z'}]){
  const value=reply();mutate(value);let published=0;
  await assert.rejects(readEmployeeHomeScreenModel(options({fetchImpl:async()=>response(value)})).then(v=>{published++;return v}));assert.equal(published,0);
 }
});

test('scope change or abort during an uncancellable token request cannot start a later HTTP request',async()=>{
 const token=deferred(),controller=new AbortController();let reads=0;
 const pending=readEmployeeHomeScreenModel(options({signal:controller.signal,getIdToken:()=>token.promise,fetchImpl:async()=>{reads++;return response(reply())}}));
 const rejected=assert.rejects(pending,{name:'AbortError'});controller.abort();await rejected;token.resolve('synthetic.token.only');await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,0);
 const other=deferred();let current=true;
 const changed=readEmployeeHomeScreenModel(options({getIdToken:()=>other.promise,isCurrent:()=>current,fetchImpl:async()=>{reads++;return response(reply())}}));
 const obsolete=assert.rejects(changed,{name:'AbortError'});current=false;other.resolve('synthetic.token.only');await obsolete;assert.equal(reads,0);
});

test('a transport which ignores cancellation still cannot publish its late response',async()=>{
 const gate=deferred(),started=deferred(),controller=new AbortController();let published=0;
 const pending=readEmployeeHomeScreenModel(options({signal:controller.signal,fetchImpl:async()=>{started.resolve();return gate.promise}})).then(value=>{published++;return value});
 const rejected=assert.rejects(pending,{name:'AbortError'});await started.promise;controller.abort();await rejected;gate.resolve(response(reply()));
 await new Promise(resolve=>setImmediate(resolve));assert.equal(published,0);
 const changedActor={...actor},scopeGate=deferred(),scopeStarted=deferred();
 const changed=readEmployeeHomeScreenModel(options({actor:changedActor,fetchImpl:async()=>{scopeStarted.resolve();return scopeGate.promise}}));
 const obsolete=assert.rejects(changed,{name:'AbortError'});await scopeStarted.promise;changedActor.companyId='foreign';scopeGate.resolve(response(reply()));await obsolete;
});

test('deadline includes token acquisition, and oversized streams are cancelled before JSON publication',async()=>{
 const token=deferred();let requests=0;
 await assert.rejects(readEmployeeHomeScreenModel(options({timeoutMs:15,getIdToken:()=>token.promise,fetchImpl:async()=>{requests++;return response(reply())}})),/home_request_timeout/);
 token.resolve('synthetic.token.only');await new Promise(resolve=>setImmediate(resolve));assert.equal(requests,0);
 let cancelled=false;
 const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(131073))},cancel(){cancelled=true}});
 await assert.rejects(readEmployeeHomeScreenModel(options({fetchImpl:async()=>new Response(body,{status:200})})),/home_response_limit/);assert.equal(cancelled,true);
 await assert.rejects(readEmployeeHomeScreenModel(options({fetchImpl:async()=>new Response('{}',{headers:{'Content-Length':'131073'}})})),/home_response_limit/);
});

test('network/Auth/HTTP failures stay failures and do not leak upstream messages or fabricate a successful zero model',async()=>{
 for(const patch of [{fetchImpl:async()=>{throw Error('PRIVATE_TOKEN_SENTINEL')}},{getIdToken:async()=>{throw Error('PRIVATE_TOKEN_SENTINEL')}},
  {fetchImpl:async()=>new Response('PRIVATE_TOKEN_SENTINEL',{status:403})},{fetchImpl:async()=>new Response('<html>PRIVATE_TOKEN_SENTINEL</html>')}]){
  await assert.rejects(readEmployeeHomeScreenModel(options(patch)),error=>!/PRIVATE_TOKEN_SENTINEL/.test(error.message)&&(error.code?.startsWith('home_')||error.code==='invalid_home_response'));
 }
});

test('invalid project, scope, calendar date, timezone, domain or nonce fails before token/network access',async()=>{
 let tokens=0,requests=0;const base={getIdToken:async()=>{tokens++;return 'synthetic.token.only'},fetchImpl:async()=>{requests++;return response(reply())}};
 for(const patch of [{projectId:'evil.example/?'},{actor:{...actor,companyId:''}},{date:'2026-02-30'},{timeZone:'Invalid/Zone'},{domainVersion:'unknown'},{nonceFactory:()=>''},{isCurrent:undefined}])await assert.rejects(readEmployeeHomeScreenModel(options({...base,...patch})));
 assert.equal(tokens,0);assert.equal(requests,0);assert.throws(()=>getEmployeeHomeReadModelUrl('https://external.example'),TypeError);
});
