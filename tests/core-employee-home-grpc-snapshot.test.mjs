import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),fromFunctions=createRequire(new URL('../functions/package.json',import.meta.url));
const {Timestamp,GeoPoint,v1}=fromFunctions('firebase-admin/firestore'),Long=fromFunctions('long');
const {loadEmployeeHomeGrpcSnapshot:load,decodeHomeProtoValue:decode}=require('../functions/employeeHomeGrpcSnapshot');
const {validateEmployeeHomeFieldSpec}=require('../functions/employeeHomeFieldSpec');
const scope={appId:'synthetic-app',companyId:'company-a',employeeId:'employee-a'},time=new Timestamp(1793590000,123456789),protoTime={seconds:Long.fromNumber(time.seconds),nanos:time.nanoseconds};
const prefix='projects/synthetic-project/databases/(default)/documents/artifacts/synthetic-app/public/data';
const entry=i=>({readTime:protoTime,document:{name:prefix+'/orders/'+String(i).padStart(5,'0'),fields:{companyId:{stringValue:scope.companyId,valueType:'stringValue'},amount:{integerValue:Long.fromNumber(i)},stamp:{timestampValue:protoTime}}}});
function fixture({alter=(_name,rows)=>rows,hang=false}={}){
 const counts={queries:0,active:0,maxActive:0,cancelled:0},metrics=[];
 const actor=id=>({id,exists:true,readTime:time,data:()=>id===scope.employeeId?{companyId:scope.companyId}:{}});
 const db={doc:path=>({path}),runTransaction:async(fn,options)=>{assert.deepEqual(options,{readOnly:true});return fn({getAll:async(c,e,options)=>{
  assert(c.path.endsWith('/companies/company-a'));assert(e.path.endsWith('/employees/employee-a'));
  assert.deepEqual(options.fieldMask,['companyId','isArchived','disabled','lockedAt','status','accountStatus']);return [actor(scope.companyId),actor(scope.employeeId)];
 }})}};
 const queryClient={runQuery(request,options){
  assert.equal(request.parent,prefix);assert.deepEqual(request.readTime,{seconds:String(time.seconds),nanos:time.nanoseconds});
  assert.equal(request.structuredQuery.where.fieldFilter.value.stringValue,scope.companyId);assert.equal(request.structuredQuery.orderBy[0].field.fieldPath,'__name__');
  assert.equal(options.retry,null);assert.equal(options.retryRequestOptions.retries,0);assert.equal(options.retryRequestOptions.noResponseRetries,0);assert.equal(options.retryRequestOptions.shouldRetryFn({code:14}),false);assert(options.timeout>0&&options.timeout<=3000);assert(request.structuredQuery.limit.value>0&&request.structuredQuery.limit.value<=10000);
  const name=request.structuredQuery.from[0].collectionId;counts.queries++;
  const rows=alter(name,name==='orders'?Array.from({length:201},(_,i)=>entry(i)):[{readTime:protoTime}]).slice(0,request.structuredQuery.limit.value);
  let cancelled=false;
  const stream=hang?new Readable({objectMode:true,read(){}}):Readable.from((async function*(){
   counts.active++;counts.maxActive=Math.max(counts.maxActive,counts.active);
   try{for(const row of rows){if(cancelled)break;yield row;await new Promise(r=>setImmediate(r))}}finally{counts.active--}
  })(),{objectMode:true,highWaterMark:1});
  stream.cancel=()=>{if(cancelled)return;cancelled=true;counts.cancelled++;stream.destroy()};
  stream.on('error',()=>{});
  return stream;
 }};
 return {db,queryClient,counts,metrics,read:patch=>load({db,scope,projectId:'synthetic-project',queryClient,onReadMetrics:rows=>metrics.push(...rows),...patch})};
}

test('public Firebase Admin v1 client is available; native values preserve exact existing SDK semantics and reject unknown values',()=>{
 assert.equal(typeof v1.FirestoreClient,'function');
 const stamp=decode({timestampValue:protoTime,valueType:'timestampValue'});assert(stamp.isEqual(time));
 assert.equal(decode({integerValue:Long.fromString('9223372036854775807')}),Number('9223372036854775807'));
 assert.deepEqual(decode({bytesValue:Buffer.from([0,255])}),Buffer.from([0,255]));assert(decode({geoPointValue:{latitude:10,longitude:106}}) instanceof GeoPoint);
 assert(Number.isNaN(decode({doubleValue:NaN})));assert.equal(decode({nullValue:0}),null);
 const map=decode({mapValue:{fields:JSON.parse('{"__proto__":{"stringValue":"literal"}}')}});
 assert.equal(Object.getPrototypeOf(map),null);assert.equal(map.__proto__,'literal');assert.equal({}.literal,undefined);
 assert.deepEqual(decode({arrayValue:{values:[{booleanValue:false},{stringValue:'Tiếng Việt'}]}}),[false,'Tiếng Việt']);
 assert.throws(()=>decode({mapValue:{fields:Object.create({unexpectedInheritedField:{stringValue:'must not silently disappear'}})}}),{code:'invalid_home_proto_value'});
 for(const value of [{integerValue:'1.5'},{stringValue:'a',valueType:'integerValue'},{referenceValue:'private'},{vectorValue:{}},{mapValue:{fields:{__type__:{stringValue:'__vector__'},value:{arrayValue:{values:[]}}}}},{timestampValue:{seconds:'1',nanos:-1}}])assert.throws(()=>decode(value));
});

test('native stream keeps complete ordered rows, exact nanosecond read time, finite server limits and two active streams',async()=>{
 const h=fixture(),snapshot=await h.read();assert.equal(snapshot.counts.orders,201);assert.equal(snapshot.sources.orders[200].data.amount,200);
 assert(snapshot.sources.orders[200].data.stamp.isEqual(time));assert.equal(snapshot.readTime,'2026-11-02T03:26:40.123456789Z');
 assert.equal(h.counts.queries,14);assert.equal(h.counts.active,0);assert(h.counts.maxActive<=2);assert(h.metrics.every(m=>m.complete&&m.transport==='grpc'));
 assert(h.metrics.find(m=>m.collection==='orders').protoBytes>0);
});

test('verified private field specification selects fields without filtering rows, keeps doc IDs/counts and rejects tampering before reading',async()=>{
 const fieldsByCollection=Object.fromEntries(['customers','orders','payments'].map(name=>[name,['amount','companyId','id','isArchived','stamp']]));
 const spec={version:1,fieldsByCollection,schemaId:createHash('sha256').update(JSON.stringify(fieldsByCollection)).digest('hex')},verified=validateEmployeeHomeFieldSpec(spec);
 assert(Object.isFrozen(verified));assert(Object.isFrozen(verified.fieldsByCollection.orders));assert.throws(()=>verified.fieldsByCollection.orders.push('new'));
 const h=fixture(),run=h.queryClient.runQuery;h.queryClient.runQuery=(request,options)=>{
  const name=request.structuredQuery.from[0].collectionId;
  if(fieldsByCollection[name])assert.deepEqual(request.structuredQuery.select.fields.map(f=>f.fieldPath),['amount','companyId','isArchived','stamp']);else assert.equal(request.structuredQuery.select,undefined);
  return run(request,options);
 };
 const snapshot=await h.read({fieldProjection:spec});assert.equal(snapshot.counts.orders,201);assert.equal(snapshot.sources.orders[200].documentId,'00200');assert.deepEqual(snapshot.fieldProjection,verified);
 assert.equal(h.metrics.find(m=>m.collection==='orders').selectedFields,4);
 for(const invalid of [{...spec,schemaId:'0'.repeat(64)},{...spec,fieldsByCollection:{orders:['amount']}},{...spec,unexpected:true}]){
  const x=fixture();x.db.runTransaction=()=>assert.fail('invalid projection must not read actors');await assert.rejects(x.read({fieldProjection:invalid}),TypeError);assert.equal(x.counts.queries,0);
 }
});

test('native read errors, foreign/stale/missing snapshots and limits fail closed, cancel siblings and never return partial money',async()=>{
 for(const [alter,code] of [
  [(name,rows)=>name==='orders'?[rows[0],rows[0]]:rows,'unordered_home_source'],
  [(name,rows)=>name==='orders'?[{...rows[0],readTime:{...protoTime,nanos:123456788}}]:rows,'home_snapshot_changed'],
  [()=>[],'home_snapshot_unconfirmed'],
  [(name,rows)=>name==='orders'?[{...rows[0],document:{...rows[0].document,name:prefix+'/orders/foreign/child'}}]:rows,'foreign_home_source'],
  [(name,rows)=>name==='orders'?[{...rows[0],document:{...rows[0].document,fields:{companyId:{stringValue:'another-company'}}}}]:rows,'foreign_home_source'],
 ]){const h=fixture({alter});await assert.rejects(h.read(),{code});await new Promise(r=>setImmediate(r));assert.equal(h.counts.active,0);assert(h.metrics.some(m=>!m.complete))}
 for(const [patch,code] of [[{maxDocuments:1},'home_snapshot_document_limit'],[{maxDocuments:30},'home_snapshot_query_limit'],[{maxPrivateBytes:1},'home_snapshot_byte_limit'],[{maxProtoBytes:1},'home_snapshot_proto_limit']])await assert.rejects(fixture().read(patch),{code});
 const h=fixture({hang:true});await assert.rejects(h.read({deadlineMs:10}),{code:'home_snapshot_timeout'});assert.equal(h.counts.cancelled,2);
 const bad=fixture();bad.queryClient.runQuery=()=>{throw Object.assign(new Error('private transport credentials must not escape'),{code:14})};await assert.rejects(bad.read(),{code:'home_snapshot_read_failed'});assert.equal(bad.counts.queries,0);
 const missing=fixture();missing.db.runTransaction=async fn=>fn({getAll:async()=>[{id:scope.companyId,exists:true,data:()=>({})},{id:scope.employeeId,exists:true,data:()=>({companyId:scope.companyId})}]});
 await assert.rejects(missing.read(),{code:'home_snapshot_unconfirmed'});
});

test('real public SDK serializes pinned readTime/finite limits and decodes native protobuf over a loopback-only gRPC server',{timeout:15000},async()=>{
 const grpc=fromFunctions('@grpc/grpc-js'),loader=fromFunctions('@grpc/proto-loader'),{OAuth2Client}=fromFunctions('google-auth-library');
 const schema=fromFunctions('@google-cloud/firestore/build/protos/v1.json'),definition=loader.fromJSON(schema,{longs:String,enums:String,defaults:true,oneofs:true});
 const pkg=grpc.loadPackageDefinition(definition),server=new grpc.Server();let requests=0,rejectRequests=false;
 server.addService(pkg.google.firestore.v1.Firestore.service,{runQuery(call){
  requests++;assert.deepEqual(call.request.readTime,{seconds:String(time.seconds),nanos:time.nanoseconds});
  if(rejectRequests){call.emit('error',Object.assign(new Error('synthetic local unavailable'),{code:grpc.status.UNAVAILABLE}));return}
  assert(Number.isInteger(call.request.structuredQuery.limit.value));assert(call.request.structuredQuery.limit.value<=10000);
  const name=call.request.structuredQuery.from[0].collectionId;
  if(name==='orders')for(let i=0;i<3;i++){
   const row=entry(i);Object.assign(row.document.fields,{nil:{nullValue:0},bytes:{bytesValue:Buffer.from([0,255])},special:{doubleValue:NaN},point:{geoPointValue:{latitude:10,longitude:106}}});
   const selected=call.request.structuredQuery.select?.fields?.map(f=>f.fieldPath);
   if(selected)row.document.fields=Object.fromEntries(Object.entries(row.document.fields).filter(([key])=>selected.includes(key)));call.write(row);
  }else call.write({readTime:protoTime});call.end();
 }});
 const port=await new Promise((resolve,reject)=>server.bindAsync('127.0.0.1:0',grpc.ServerCredentials.createInsecure(),(error,port)=>error?reject(error):resolve(port)));
 const authClient=new OAuth2Client();authClient.setCredentials({access_token:'synthetic-loopback-only',expiry_date:Date.now()+3600000});
 const client=new v1.FirestoreClient({projectId:'synthetic-project',apiEndpoint:'127.0.0.1',port,sslCreds:grpc.credentials.createInsecure(),authClient,fallback:false,gaxServerStreamingRetries:false});
 try{
  const h=fixture(),snapshot=await h.read({queryClient:client});assert.equal(snapshot.counts.orders,3);assert.equal(snapshot.sources.orders[2].data.amount,2);
  assert(snapshot.sources.orders[0].data.stamp.isEqual(time));assert.equal(requests,14);assert(h.metrics.every(m=>m.complete));
  assert.equal(snapshot.sources.orders[0].data.nil,null);assert(Number.isNaN(snapshot.sources.orders[0].data.special));assert.deepEqual(snapshot.sources.orders[0].data.bytes,Buffer.from([0,255]));assert(snapshot.sources.orders[0].data.point instanceof GeoPoint);
  const fieldsByCollection={orders:['amount','companyId','id','isArchived','stamp']};
  const projected=await fixture().read({queryClient:client,fieldProjection:{version:1,fieldsByCollection,schemaId:createHash('sha256').update(JSON.stringify(fieldsByCollection)).digest('hex')}});
  assert.equal(projected.counts.orders,3);assert.equal(projected.sources.orders[2].documentId,'00002');assert.equal(projected.sources.orders[2].data.amount,2);
  assert.equal(projected.sources.orders[2].data.bytes,undefined);assert(projected.sources.orders[2].data.stamp.isEqual(time));assert.equal(requests,28);
  rejectRequests=true;const before=requests;await assert.rejects(fixture().read({queryClient:client}),{code:'home_snapshot_read_failed'});
  await new Promise(resolve=>setTimeout(resolve,100));assert(requests-before<=2,'transient failure must not silently retry any of the two native streams');
 }finally{await client.close();server.forceShutdown()}
});
