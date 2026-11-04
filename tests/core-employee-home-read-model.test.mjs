import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {EMPLOYEE_HOME_SOURCE_COLLECTIONS:collections,createEmployeeHomeReadModel,loadEmployeeHomeSources}=require('../functions/employeeHomeReadModel.js');
const scope={appId:'synthetic-app',companyId:'synthetic-company',employeeId:'synthetic-employee'};
const claims={uid:'synthetic-user',identityId:'synthetic-identity',appUserId:scope.employeeId,companyId:scope.companyId,accountType:'employee'};
const request=(nonce='a'.repeat(16),patch={})=>({body:{appId:scope.appId,date:'2026-11-02',timeZone:'Asia/Ho_Chi_Minh',nonce},claims:{...claims},...patch});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const timestamp={seconds:1793590000,nanoseconds:123456789};
const document=(id,data)=>({id,exists:true,data:()=>data,readTime:timestamp});
const fixture=(rows=[],alter=()=>{})=>{
 const calls=[],field=Symbol('public-document-id'),datasets=Object.fromEntries(collections.map(name=>[name,[]]));
 datasets.orders=rows;
 const company=document(scope.companyId,{name:'Synthetic',companyId:scope.companyId});
 const employee=document(scope.employeeId,{companyId:scope.companyId});
 class Query{
  constructor(name,cursor=null){this.name=name;this.cursor=cursor}
  where(key,op,value){assert.deepEqual([key,op,value],['companyId','==',scope.companyId]);return this}
  orderBy(value){assert.equal(value,field);return this}
  limit(size){this.size=size;return this}
  startAfter(cursor){assert(cursor&&cursor.id);const next=new Query(this.name,cursor);next.size=this.size;return next}
 }
 const db={doc:path=>({path}),collection(path){assert(path.startsWith(`artifacts/${scope.appId}/public/data/`));return new Query(path.split('/').at(-1))},
  async runTransaction(callback,options){assert.deepEqual(options,{readOnly:true});
   const frozen=Object.fromEntries(Object.entries(datasets).map(([key,rows])=>[key,rows.slice()]));
   return callback({async getAll(...args){const options=args.pop();assert.deepEqual(options.fieldMask,['companyId','isArchived','disabled','lockedAt','status','accountStatus']);assert.deepEqual(args.map(r=>r.path.split('/').slice(-2).join('/')),['companies/'+scope.companyId,'employees/'+scope.employeeId]);return [company,employee]},
    async get(query){calls.push({name:query.name,cursor:query.cursor?.id??null,size:query.size});
     const documents=(frozen[query.name]||[]).filter(row=>!query.cursor||Buffer.compare(Buffer.from(row.id),Buffer.from(query.cursor.id))>0).slice(0,query.size);
     const snapshot={docs:documents,readTime:timestamp};alter({query,snapshot,datasets,calls});return snapshot;}
   });
  }};
 return {db,field,calls,company,employee,read:options=>loadEmployeeHomeSources({db,documentIdField:field,scope,...options})};
};

test('server aggregation uses a single read-only transaction and complete bounded cursors, including empty collections',async()=>{
 const rows=Array.from({length:201},(_,index)=>document(String(index).padStart(4,'0'),{companyId:scope.companyId,amount:index}));
 const h=fixture(rows),result=await h.read({pageSize:100});
 assert.deepEqual(result.sources.orders.map(row=>row.documentId),rows.map(row=>row.id));
 assert.deepEqual(h.calls.filter(c=>c.name==='orders').map(c=>c.cursor),[null,'0099','0199']);
 assert.equal(Object.keys(result.sources).length,collections.length);assert.equal(result.counts.orders,201);
 assert.equal(result.readTime,'2026-11-02T03:26:40.123456789Z');
 assert.equal(result.sources.payments.length,0);assert(h.calls.every(c=>c.size===100));
});

test('document cursors preserve Firestore UTF-8 order and the snapshot does not silently advance between pages',async()=>{
 const ids=['a','é','中','😀','\uE000'].sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b)));
 const h=fixture(ids.map(id=>document(id,{companyId:scope.companyId})),({datasets,calls})=>{
  if(calls.length===1)datasets.orders.push(document('new-live-record',{companyId:scope.companyId}));
 });
 assert.deepEqual((await h.read({pageSize:2})).sources.orders.map(r=>r.documentId),ids);
 const changed=fixture([document('a',{companyId:scope.companyId})],({snapshot,query})=>{if(query.name==='orders')snapshot.readTime={...timestamp,nanoseconds:1}});
 await assert.rejects(changed.read(),{code:'home_snapshot_changed'});
});

test('failure, foreign rows, order violation, scope expiry and limits reject instead of yielding partial financial inputs',async()=>{
 const rows=[document('a',{companyId:scope.companyId}),document('b',{companyId:scope.companyId})];
 await assert.rejects(fixture(rows).read({pageSize:1,maxPages:1}),{code:'home_snapshot_limit'});
 await assert.rejects(fixture([document('a',{companyId:'foreign'})]).read(),{code:'foreign_home_source'});
 await assert.rejects(fixture(rows,({snapshot,query})=>{if(query.name==='orders')snapshot.docs.reverse()}).read(),{code:'unordered_home_source'});
 await assert.rejects(fixture(rows,({query})=>{if(query.name==='payments')throw Error('synthetic transport failure')}).read(),/synthetic transport/);
 let current=true;const obsolete=fixture(rows,()=>{current=false});
 await assert.rejects(obsolete.read({isCurrent:()=>current}),{code:'home_request_cancelled'});
 const actor=fixture();actor.employee.data=()=>({companyId:'foreign'});await assert.rejects(actor.read(),{code:'home_actor_unavailable'});
 const missingTime=fixture();missingTime.company.readTime=null;await assert.rejects(missingTime.read(),{code:'home_snapshot_unconfirmed'});
});

test('private snapshot has global record, byte and wall-time budgets and stops new work on failure',async()=>{
 const rows=Array.from({length:8},(_,i)=>document(String(i),{companyId:scope.companyId,note:'x'.repeat(500)}));
 const records=fixture(rows);await assert.rejects(records.read({maxDocuments:5,pageSize:2}),{code:'home_snapshot_document_limit'});
 assert(records.calls.filter(c=>c.name==='orders').length<=2,'no pages after the exhausted record budget');
 await assert.rejects(fixture(rows).read({maxPrivateBytes:600}),{code:'home_snapshot_byte_limit'});
 let clock=0;const expired=fixture(rows,()=>{clock+=5});
 await assert.rejects(expired.read({deadlineMs:4,now:()=>clock}),{code:'home_snapshot_timeout'});
 for(const options of [{deadlineMs:3501},{maxDocuments:50001},{maxPrivateBytes:25*1024*1024},{queryConcurrency:3}])
  await assert.rejects(fixture().read(options),TypeError);
 // Budgets never turn a failed complete history into a partial success. A
 // fresh independent reader can still enumerate the same data correctly.
 assert.equal((await fixture(rows).read()).sources.orders.length,8);
});

function model(overrides={}){
 const stats={verified:0,loaded:0,projected:0,authorized:0};
 const snapshot={readTime:'2026-11-02T00:00:00.000000000Z',sources:{employees:[{password:'must-stay-private'}]}};
 const service=createEmployeeHomeReadModel({allowedAppId:scope.appId,
  verify:async req=>{stats.verified++;return req.claims},
  load:async()=>{stats.loaded++;return snapshot},
  authorizeSnapshotActor:async({claims})=>{stats.authorized++;return !claims.denied},
  project:async()=>{stats.projected++;return {kind:'hd-employee-home-model-v1',domainVersion:'synthetic-only',model:{visibleAmount:123}}},...overrides});
 return {service,stats,snapshot};
}

test('only verified employee/app/actor/date/timezone/nonce scopes are admitted; body cannot select another employee',async()=>{
 const h=model();
 for(const bad of [request(undefined,{claims:{...claims,accountType:'customer'}}),request(undefined,{claims:{...claims,isAnonymous:true}}),
  request(undefined,{claims:{...claims,appUserId:'../foreign'}}),request(undefined,{claims:{...claims,identityId:''}})])
  await assert.rejects(h.service(bad));
 for(const patch of [{appId:'other'},{employeeId:'someone-else'},{date:'2026-02-30'},{nonce:'bad'},{timeZone:'../anything'}]){
  const req=request();Object.assign(req.body,patch);await assert.rejects(h.service(req));
 }
 assert.equal(h.stats.loaded,0);const reply=await h.service(request());
 assert.equal(reply.scope.employeeId,claims.appUserId);assert.equal(reply.scope.monthKey,'2026-11');
 assert(!JSON.stringify(reply).includes('must-stay-private'));assert.equal(Object.hasOwn(reply,'sources'),false);
});

test('same-actor concurrent reads share only pending work; every reply is authorized and nonce-bound, completed results are not cached',async()=>{
 const pending=deferred();let loads=0,verified=0,projected=0;
 const h=model({verify:async req=>{verified++;return req.claims},load:()=>{loads++;return pending.promise},
  project:async()=>{projected++;return {kind:'hd-employee-home-model-v1',domainVersion:'synthetic',model:{visibleAmount:123}}}});
 const a=h.service(request()),b=h.service(request('b'.repeat(16)));
 await new Promise(resolve=>setImmediate(resolve));assert.equal(loads,1);assert.equal(verified,2);
 pending.resolve(h.snapshot);const [first,second]=await Promise.all([a,b]);
 assert.equal(first.scope.nonce,'a'.repeat(16));assert.equal(second.scope.nonce,'b'.repeat(16));assert.equal(projected,1);
 assert.equal(h.stats.authorized,3,'first before projection, then independent authorization for both replies');
 await h.service(request());assert.equal(loads,2,'no completed snapshot is labeled freshly read');
});

test('joining a read cannot borrow prior permission; cancellation affects only its own reply',async()=>{
 const pending=deferred(),h=model({load:()=>pending.promise});let current=true;
 const a=h.service(request(),{isCurrent:()=>current});
 const denied=request('b'.repeat(16));denied.claims.denied=true;
 const b=h.service(denied),c=h.service(request('c'.repeat(16)));
 const failedA=assert.rejects(a,{code:'home_request_cancelled'}),failedB=assert.rejects(b,{code:'home_actor_denied'});
 await new Promise(resolve=>setImmediate(resolve));current=false;pending.resolve(h.snapshot);
 await Promise.all([failedA,failedB]);assert.equal((await c).scope.nonce,'c'.repeat(16));
});

test('different actors never share pending private snapshots, admission is bounded and failed reads can retry',async()=>{
 const pending=deferred(),h=model({maxInflight:1,load:()=>pending.promise});const a=h.service(request());
 await new Promise(resolve=>setImmediate(resolve));const other=request();other.claims.uid='other-user';
 await assert.rejects(h.service(other),{code:'home_read_busy'});pending.resolve(h.snapshot);await a;
 let attempts=0;const retry=model({load:async()=>{if(++attempts===1)throw Error('synthetic failed read');return h.snapshot}});
 await assert.rejects(retry.service(request()),/synthetic failed read/);await retry.service(request());assert.equal(attempts,2);
 const malformed=model({project:async()=>({model:{visibleAmount:123}})});await assert.rejects(malformed.service(request()),{code:'invalid_home_projection'});
});
