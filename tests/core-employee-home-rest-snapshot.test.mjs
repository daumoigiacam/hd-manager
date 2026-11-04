import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{Timestamp,GeoPoint}=createRequire(new URL('../functions/package.json',import.meta.url))('firebase-admin/firestore');
const {readHomeQueryObjects}=require('../functions/employeeHomeJsonStream');
const {loadEmployeeHomeRestSnapshot,decodeHomeRestValue}=require('../functions/employeeHomeRestSnapshot');
const {EMPLOYEE_HOME_SOURCE_COLLECTIONS:collections}=require('../functions/employeeHomeReadModel');
const encode=new TextEncoder(),scope={appId:'synthetic-app',companyId:'company-a',employeeId:'employee-a'},time=new Timestamp(1793590000,123456789),readTime='2026-11-02T03:26:40.123456789Z';
const stream=(text,size=7)=>new ReadableStream({start(controller){const b=encode.encode(text);for(let i=0;i<b.length;i+=size)controller.enqueue(b.slice(i,i+size));controller.close()}});
const collect=async body=>{const rows=[];for await(const row of readHomeQueryObjects(body))rows.push(row);return rows};

test('bounded array stream parser preserves quotes, escapes, brackets, Unicode and all byte boundaries, without whole-response parsing',async()=>{
 const expected=[{a:'Tiếng Việt 😀 [braces] { "quote" \\ tail',b:[{c:'\\"'}]}, {empty:{},nil:null}];
 for(const size of [1,2,3,7,31,999])assert.deepEqual(await collect(stream(JSON.stringify(expected),size)),expected);
 assert.deepEqual(await collect(stream(' \n [ ] \r')),[]);
 for(const text of ['{}','[1]','[{"a":1},]','[{"a":1}]{}','[{"a":1}','[{} {}]','[{"a":NaN}]','[{"a":[}]'])await assert.rejects(collect(stream(text)),{code:'invalid_home_stream'});
 await assert.rejects((async()=>{for await(const value of readHomeQueryObjects(stream('[{"long":"0123456789"}]'),{maxEntryCodeUnits:8}))assert.fail('must not yield oversized '+typeof value)})(),{code:'invalid_home_stream'});
 await assert.rejects(collect(new ReadableStream({start(c){c.enqueue(new Uint8Array([91,123,34,97,34,58,34,255,34,125,93]));c.close()}})),{code:'invalid_home_stream'});
});

test('REST values preserve SDK types, nanoseconds, bytes, special doubles and literal user keys; unsupported values fail closed',()=>{
 const date=decodeHomeRestValue({timestampValue:'2026-11-02T03:26:40.123456789Z'});assert(date instanceof Timestamp);assert.equal(date.nanoseconds,123456789);
 assert.equal(decodeHomeRestValue({timestampValue:'2026-11-02T03:26:40.123Z'}).nanoseconds,123000000);
 const geo=decodeHomeRestValue({geoPointValue:{latitude:10,longitude:106}});assert(geo instanceof GeoPoint);
 assert.deepEqual(decodeHomeRestValue({bytesValue:'aGQ='}),Buffer.from('hd'));
 assert(Number.isNaN(decodeHomeRestValue({doubleValue:'NaN'})));assert.equal(decodeHomeRestValue({doubleValue:'-Infinity'}),-Infinity);
 const value=decodeHomeRestValue(JSON.parse('{"mapValue":{"fields":{"__proto__":{"stringValue":"literal"}}}}'));
 assert.equal(Object.getPrototypeOf(value),null);assert.equal(Object.hasOwn(value,'__proto__'),true);assert.equal(value.__proto__,'literal');
 for(const input of [{referenceValue:'projects/foreign/documents/a/b'},{vectorValue:{}},{mapValue:{fields:{__type__:{stringValue:'__vector__'},value:{arrayValue:{values:[]}}}}},{integerValue:'1.5'},{timestampValue:'2026-02-30T01:00:00Z'},{bytesValue:'%%%'}])assert.throws(()=>decodeHomeRestValue(input));
});

test('16-KiB decode batches preserve split UTF-8/escapes, enforce every raw byte and cancel before publishing',async()=>{
 const expected=[{long:'Tiếng Việt 😀 \\" [ ] { } '.repeat(2000)}, {next:true}];
 const text=JSON.stringify(expected),bytes=encode.encode(text);
 for(const size of [1,7,16383,16384,16385,bytes.length]){
  let observedBytes=0,checks=0;const result=[];
  for await(const row of readHomeQueryObjects(stream(text,size),{onBytes:n=>{observedBytes+=n},check:()=>{checks++}}))result.push(row);
  assert.deepEqual(result,expected);assert.equal(observedBytes,bytes.length);assert(checks>=Math.ceil(bytes.length/size));
 }
 // Deadline enforcement happens between fixed decode blocks even when one
 // HTTP chunk contains a large object which has not reached its closing brace.
 let checks=0,closed=false;const input=stream(text,bytes.length);
 const cancelled=Object.assign(new Error('synthetic cancellation'),{code:'home_snapshot_timeout'});
 await assert.rejects((async()=>{try{for await(const row of readHomeQueryObjects(input,{check:()=>{if(++checks===3)throw cancelled}}))assert.fail('cancelled input must not publish '+typeof row)}finally{closed=true}})(),{code:'home_snapshot_timeout'});
 assert.equal(closed,true);assert.equal(input.locked,false);
 let chunks=0;const tiny=new ReadableStream({pull(c){chunks++;c.enqueue(encode.encode(chunks===1?'[{"a":"':'incomplete'))},cancel(){closed=true}});
 checks=0;closed=false;
 await assert.rejects((async()=>{for await(const row of readHomeQueryObjects(tiny,{check:()=>{if(++checks===3)throw cancelled}}))assert.fail(typeof row)})(),{code:'home_snapshot_timeout'});
 assert.equal(closed,true);assert.equal(tiny.locked,false);
});

function fixture(overrides={}){
 const counts={queries:0,active:0,maxActive:0},company={id:scope.companyId,exists:true,readTime:time,data:()=>({name:'Synthetic company'})},employee={id:scope.employeeId,exists:true,readTime:time,data:()=>({companyId:scope.companyId})};
 const db={doc:path=>({path}),runTransaction:async(fn,options)=>{assert.deepEqual(options,{readOnly:true});return fn({getAll:async(...args)=>{assert.equal(args.length,3);assert.deepEqual(args[2].fieldMask,['companyId','isArchived','disabled','lockedAt','status','accountStatus']);return [company,employee]}})}};
 const fetchImpl=async(url,options)=>{
  assert.equal(url,'https://firestore.googleapis.com/v1/projects/synthetic-project/databases/(default)/documents/artifacts/synthetic-app/public/data:runQuery');
  assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer synthetic-service-token');
  const body=JSON.parse(options.body),name=body.structuredQuery.from[0].collectionId;
  assert.equal(body.readTime,readTime);assert(Number.isInteger(body.structuredQuery.limit)&&body.structuredQuery.limit>=1&&body.structuredQuery.limit<=10000);assert.equal(body.structuredQuery.where.fieldFilter.value.stringValue,scope.companyId);
  counts.queries++;counts.active++;counts.maxActive=Math.max(counts.maxActive,counts.active);
  const rows=name==='orders'?Array.from({length:201},(_,i)=>({readTime,document:{name:`projects/synthetic-project/databases/(default)/documents/artifacts/synthetic-app/public/data/orders/${String(i).padStart(4,'0')}`,
   fields:{companyId:{stringValue:scope.companyId},amount:{integerValue:String(i)},createdAt:{timestampValue:readTime}}}})):[{readTime}];
  const limited=name==='orders'?rows.slice(0,body.structuredQuery.limit):rows;
  const text=JSON.stringify(overrides.rows?overrides.rows(name,limited):limited),bytes=encode.encode(text);let offset=0;
  const bodyStream=new ReadableStream({async pull(controller){
   if(options.signal.aborted){counts.active--;controller.error(new DOMException('aborted','AbortError'));return}
   if(offset>=bytes.length){counts.active--;controller.close();return}
   controller.enqueue(bytes.slice(offset,offset+=1024));await new Promise(r=>setTimeout(r,0));
  },cancel(){counts.active--}});
  return {ok:true,body:bodyStream};
 };
 return {counts,company,employee,read:patch=>loadEmployeeHomeRestSnapshot({db,scope,projectId:'synthetic-project',getAccessToken:async()=>({access_token:'synthetic-service-token'}),fetchImpl,...patch})};
}

test('streamed complete snapshot pins all bounded queries to exact actor read-time and retains full rows with only two live streams',async()=>{
 const h=fixture(),result=await h.read();assert.equal(result.counts.orders,201);assert.equal(h.counts.queries,14);assert(h.counts.maxActive<=2);assert.equal(h.counts.active,0);
 assert.equal(Object.keys(result.sources).length,collections.length);assert.equal(result.sources.orders[200].data.amount,200);
 assert(result.sources.orders[0].data.createdAt instanceof Timestamp);assert.equal(result.readTime,readTime);
});

test('changed/missing snapshot time, foreign/duplicate rows, malformed transport and global budgets never yield partial financial input',async()=>{
 const changed=fixture({rows:(name,rows)=>name==='orders'?[{...rows[0],readTime:'2026-11-02T03:26:40.123456788Z'}]:rows});await assert.rejects(changed.read(),{code:'home_snapshot_changed'});
 await assert.rejects(fixture({rows:()=>[]}).read(),{code:'home_snapshot_unconfirmed'});
 await assert.rejects(fixture({rows:(name,rows)=>name==='orders'?[rows[0],rows[0]]:rows}).read(),{code:'unordered_home_source'});
 await assert.rejects(fixture({rows:(name,rows)=>name==='orders'?[{...rows[0],document:{...rows[0].document,name:'projects/foreign/documents/a/b'}}]:rows}).read(),{code:'foreign_home_source'});
 await assert.rejects(fixture().read({maxDocuments:1}),{code:'home_snapshot_document_limit'});
 await assert.rejects(fixture().read({maxDocuments:3}),{code:'home_snapshot_document_limit'});
 await assert.rejects(fixture().read({maxDocuments:30}),{code:'home_snapshot_query_limit'});
 await assert.rejects(fixture().read({maxPrivateBytes:1}),{code:'home_snapshot_byte_limit'});
 await assert.rejects(fixture().read({maxWireBytes:1}),{code:'home_snapshot_wire_limit'});
 await assert.rejects(fixture().read({deadlineMs:1}),{code:'home_snapshot_timeout'});
 await assert.rejects(fixture().read({getAccessToken:async()=>({access_token:'invalid\r\ncredential'})}),{code:'home_service_credential_unavailable'});
});
