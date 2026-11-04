// Local QA candidate. Same verified point-in-time inputs and budgets as the
// REST experiment; use Firebase Admin's public v1 streaming client to avoid
// converting the complete query through a typed JSON array. No writes/cache.
const {Timestamp,GeoPoint}=require('firebase-admin/firestore');
const {serialize}=require('node:v8');
const {EMPLOYEE_HOME_SOURCE_COLLECTIONS:collections}=require('./employeeHomeReadModel');
const {EMPLOYEE_HOME_ACTOR_READ_OPTIONS}=require('./employeeHomeActorFields');
const {createHomePrivateByteBudget}=require('./employeeHomeByteBudget');
const {validateEmployeeHomeFieldSpec}=require('./employeeHomeFieldSpec');
const fail=code=>Object.assign(new Error(code),{code,statusCode:503});
const validId=v=>typeof v==='string'&&v.length>0&&v.length<=512&&!v.includes('/')&&!['.','..'].includes(v);
const longText=value=>{
 if(['string','number','bigint'].includes(typeof value))return String(value);
 if(value&&Number.isInteger(value.low)&&Number.isInteger(value.high)&&typeof value.toString==='function')return value.toString();
 throw fail('invalid_home_proto_value');
};
function decodeHomeProtoTimestamp(value){
 if(!value||typeof value!=='object')throw fail('invalid_home_timestamp');
 const text=longText(value.seconds??0),seconds=Number(text),nanos=value.nanos??0;
 if(!/^-?\d+$/.test(text)||!Number.isSafeInteger(seconds)||!Number.isInteger(nanos)||nanos<0||nanos>=1e9)throw fail('invalid_home_timestamp');
 try{return new Timestamp(seconds,nanos)}catch{throw fail('invalid_home_timestamp')}
}
function decodeHomeProtoFields(fields,depth=0){
 if(!fields||typeof fields!=='object'||Array.isArray(fields)||![Object.prototype,null].includes(Object.getPrototypeOf(fields))||depth>64)throw fail('invalid_home_proto_value');
 const out=Object.create(null);
 for(const key of Object.keys(fields))out[key]=decodeHomeProtoValue(fields[key],depth);
 return out;
}
function decodeHomeProtoValue(value,depth=0){
 if(!value||typeof value!=='object'||Array.isArray(value)||depth>64)throw fail('invalid_home_proto_value');
 const keys=Object.keys(value).filter(k=>k!=='valueType');
 if(keys.length!==1||value.valueType!==undefined&&value.valueType!==keys[0])throw fail('invalid_home_proto_value');
 const type=keys[0],raw=value[type];
 if(type==='nullValue'&&(raw===0||raw===null||raw==='NULL_VALUE'))return null;
 if(type==='stringValue'&&typeof raw==='string'||type==='booleanValue'&&typeof raw==='boolean'||type==='doubleValue'&&typeof raw==='number')return raw;
 if(type==='integerValue'){const text=longText(raw),number=Number(text);if(/^-?\d+$/.test(text)&&Number.isFinite(number))return number}
 if(type==='timestampValue')return decodeHomeProtoTimestamp(raw);
 if(type==='geoPointValue'&&raw&&Object.keys(raw).every(k=>['latitude','longitude'].includes(k)))return new GeoPoint(raw.latitude??0,raw.longitude??0);
 if(type==='bytesValue'&&raw instanceof Uint8Array)return Buffer.from(raw);
 if(type==='arrayValue'&&raw&&Object.keys(raw).every(k=>k==='values')&&(raw.values===undefined||Array.isArray(raw.values)))return (raw.values||[]).map(v=>decodeHomeProtoValue(v,depth+1));
 if(type==='mapValue'&&raw&&Object.keys(raw).every(k=>k==='fields')){
  if(raw.fields?.__type__?.stringValue==='__vector__')throw fail('unsupported_home_proto_value');
  return decodeHomeProtoFields(raw.fields??{},depth+1);
 }
 throw fail('unsupported_home_proto_value');
}
const timeKey=value=>`${value.seconds}:${value.nanoseconds}`;

async function loadEmployeeHomeGrpcSnapshot({db,scope,projectId,queryClient,deadlineMs=3000,maxDocuments=20000,
 maxPrivateBytes=24*1024*1024,maxProtoBytes=32*1024*1024,onReadMetrics=()=>{},fieldProjection=null}){
 if(!db?.runTransaction||typeof queryClient?.runQuery!=='function'||!scope||![scope.appId,scope.companyId,scope.employeeId].every(validId)
  ||!/^[a-z][a-z0-9-]{3,62}$/.test(projectId)||!Number.isSafeInteger(deadlineMs)||deadlineMs<1||deadlineMs>3500
  ||!Number.isSafeInteger(maxDocuments)||maxDocuments<1||maxDocuments>20000||!Number.isSafeInteger(maxPrivateBytes)||maxPrivateBytes<1||maxPrivateBytes>24*1024*1024
  ||!Number.isSafeInteger(maxProtoBytes)||maxProtoBytes<1||maxProtoBytes>32*1024*1024)throw new TypeError('Verified bounded native Home stream required.');
 const verifiedProjection=validateEmployeeHomeFieldSpec(fieldProjection);
 const deadline=Date.now()+deadlineMs,active=new Set(),metrics=[],sources=Object.create(null),counts=Object.create(null);
 let stopped=false,timeout=false,documents=0,reserved=0,protoBytes=0,next=0;
 const privateBudget=createHomePrivateByteBudget(maxPrivateBytes);
 const stop=()=>{stopped=true;for(const stream of active)try{stream.cancel()}catch{/* preserve the originating failure */}};
 const timer=setTimeout(()=>{timeout=true;stop()},deadlineMs);
 const check=()=>{if(stopped||Date.now()>=deadline)throw fail('home_snapshot_timeout')};
 const admit=data=>{check();if(++documents>maxDocuments)throw fail('home_snapshot_document_limit');privateBudget.admit(data)};
 try{
  const {company,employee,readTime}=await db.runTransaction(async tx=>{
   const [c,e]=await tx.getAll(db.doc(`artifacts/${scope.appId}/public/data/companies/${scope.companyId}`),db.doc(`artifacts/${scope.appId}/public/data/employees/${scope.employeeId}`),EMPLOYEE_HOME_ACTOR_READ_OPTIONS);check();
   if(!c?.exists||!e?.exists||e.data()?.companyId!==scope.companyId||c.data()?.isArchived||e.data()?.isArchived)throw fail('home_actor_unavailable');
   if(!Number.isSafeInteger(c.readTime?.seconds)||!Number.isInteger(c.readTime?.nanoseconds)||!Number.isSafeInteger(e.readTime?.seconds)||!Number.isInteger(e.readTime?.nanoseconds))throw fail('home_snapshot_unconfirmed');
   const readTime=decodeHomeProtoTimestamp({seconds:c.readTime.seconds,nanos:c.readTime.nanoseconds});
   if(timeKey(readTime)!==timeKey(decodeHomeProtoTimestamp({seconds:e.readTime?.seconds,nanos:e.readTime?.nanoseconds})))throw fail('home_snapshot_changed');
   return {company:{documentId:c.id,data:c.data()},employee:{documentId:e.id,data:e.data()},readTime};
  },{readOnly:true});
  admit(company.data);admit(employee.data);
  const parent=`projects/${projectId}/databases/(default)/documents/artifacts/${scope.appId}/public/data`,key=timeKey(readTime);
  const read=async name=>{
   check();const available=maxDocuments-documents-reserved;if(available<1)throw fail('home_snapshot_document_limit');
   const limit=Math.max(1,Math.floor(available/2));reserved+=limit;
   const metric={collection:name,transport:'grpc',rows:0,pages:0,durationMs:0,processingMs:0,protoBytes:0,complete:false},started=Date.now();metrics.push(metric);
   let stream;
   try{
    // No retry/fallback: one approved invocation may not hide extra reads.
    const selected=verifiedProjection?.fieldsByCollection[name]?.filter(field=>field!=='id');
    if(selected)metric.selectedFields=selected.length;
    stream=queryClient.runQuery({parent,structuredQuery:{from:[{collectionId:name}],...(selected?{select:{fields:selected.map(field=>({fieldPath:field}))}}:{}),where:{fieldFilter:{field:{fieldPath:'companyId'},op:'EQUAL',value:{stringValue:scope.companyId}}},
     orderBy:[{field:{fieldPath:'__name__'},direction:'ASCENDING'}],limit:{value:limit}},readTime:{seconds:String(readTime.seconds),nanos:readTime.nanoseconds}},
    {timeout:Math.max(1,deadline-Date.now()),retry:null,retryRequestOptions:{retries:0,noResponseRetries:0,shouldRetryFn:()=>false}});
    if(!stream?.[Symbol.asyncIterator]||typeof stream.cancel!=='function')throw fail('invalid_home_proto_stream');
    active.add(stream);metric.pages=1;const rows=[];let previous=null,confirmed=false;
    for await(const entry of stream){
     const began=performance.now();try{
      check();if(!entry||typeof entry!=='object')throw fail('invalid_home_proto_stream');
      const size=serialize(entry).byteLength;protoBytes+=size;metric.protoBytes+=size;if(protoBytes>maxProtoBytes)throw fail('home_snapshot_proto_limit');
      if(metric.rows===0)metric.firstEntryMs=Date.now()-started;
      if(entry.readTime){if(timeKey(decodeHomeProtoTimestamp(entry.readTime))!==key)throw fail('home_snapshot_changed');confirmed=true}
      if(entry.skippedResults)throw fail('invalid_home_snapshot');if(!entry.document)continue;
      if(!entry.readTime||typeof entry.document.name!=='string'||!entry.document.name.startsWith(parent+'/'+name+'/'))throw fail('foreign_home_source');
      const documentId=entry.document.name.slice((parent+'/'+name+'/').length),data=decodeHomeProtoFields(entry.document.fields||{});
      if(!validId(documentId)||data.companyId!==scope.companyId)throw fail('foreign_home_source');
      if(previous!==null&&Buffer.compare(Buffer.from(previous),Buffer.from(documentId))>=0)throw fail('unordered_home_source');
      if(metric.rows>=limit)throw fail('home_snapshot_query_limit');
      admit(data);reserved--;rows.push({documentId,data});metric.rows++;previous=documentId;
     }finally{metric.processingMs+=performance.now()-began}
    }
    if(!confirmed)throw fail('home_snapshot_unconfirmed');if(rows.length===limit)throw fail('home_snapshot_query_limit');
    check();sources[name]=rows;counts[name]=rows.length;metric.complete=true;
   }catch(error){stop();throw error}
   finally{if(stream){active.delete(stream);if(!stream.readableEnded)try{stream.cancel()}catch{/* preserve original failure */}}reserved-=Math.max(0,limit-metric.rows);metric.durationMs=Date.now()-started}
  };
  const worker=async()=>{while(!stopped&&next<collections.length){check();await read(collections[next++])}};
  const workers=Array.from({length:2},()=>worker());
  try{await Promise.all(workers)}catch(error){stop();await Promise.allSettled(workers);throw error}
  check();return {company,employee,sources,counts,...(verifiedProjection?{fieldProjection:verifiedProjection}:{}),readTime:new Date(readTime.seconds*1000).toISOString().slice(0,19)+'.'+String(readTime.nanoseconds).padStart(9,'0')+'Z'};
 }catch(error){if(timeout||error?.code===4)throw fail('home_snapshot_timeout');if(/^home_|^invalid_home_|^foreign_home_|^unordered_home_|^unsupported_home_/.test(error?.code||''))throw error;throw fail('home_snapshot_read_failed')}
 finally{clearTimeout(timer);stop();onReadMetrics(metrics)}
}
module.exports={loadEmployeeHomeGrpcSnapshot,decodeHomeProtoValue,decodeHomeProtoTimestamp};
