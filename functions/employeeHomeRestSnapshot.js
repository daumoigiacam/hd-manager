const {Timestamp,GeoPoint}=require('firebase-admin/firestore');const {serialize}=require('node:v8');
const {EMPLOYEE_HOME_SOURCE_COLLECTIONS}=require('./employeeHomeReadModel');
const {EMPLOYEE_HOME_ACTOR_READ_OPTIONS}=require('./employeeHomeActorFields');
const {encodeEmployeeHomePrivateValue}=require('./employeeHomePrivateValues');const {readHomeQueryObjects}=require('./employeeHomeJsonStream');
const fail=code=>Object.assign(new Error(code),{code,statusCode:503});
const id=v=>typeof v==='string'&&v.length>0&&v.length<=512&&!v.includes('/')&&!['.','..'].includes(v);
function restTimestamp(text){
 const match=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(text||'');
 if(!match||Number.isNaN(Date.parse(match[1]+'Z'))||new Date(match[1]+'Z').toISOString().slice(0,19)!==match[1])throw fail('invalid_home_timestamp');
 return new Timestamp(Date.parse(match[1]+'Z')/1000,Number((match[2]||'').padEnd(9,'0')));
}
function decodeHomeRestValue(value,depth=0){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||depth>64)throw fail('invalid_home_rest_value');
 const [type]=Object.keys(value),raw=value[type];
 if(type==='nullValue'&&(raw===null||raw==='NULL_VALUE'))return null;
 if(type==='booleanValue'&&typeof raw==='boolean'||type==='stringValue'&&typeof raw==='string')return raw;
 if(type==='integerValue'&&/^-?\d+$/.test(String(raw))){const n=Number(raw);if(Number.isFinite(n))return n}
 if(type==='doubleValue'){
  if(typeof raw==='number')return raw;if(raw==='NaN')return NaN;if(raw==='Infinity')return Infinity;if(raw==='-Infinity')return -Infinity;
 }
 if(type==='timestampValue')return restTimestamp(raw);
 if(type==='geoPointValue'&&raw&&Object.keys(raw).every(k=>k==='latitude'||k==='longitude'))return new GeoPoint(raw.latitude===undefined?0:raw.latitude,raw.longitude===undefined?0:raw.longitude);
 if(type==='bytesValue'&&typeof raw==='string'){const b=Buffer.from(raw,'base64');if(b.toString('base64')===raw)return b}
 if(type==='arrayValue'&&raw&&Object.keys(raw).every(k=>k==='values')&&(raw.values===undefined||Array.isArray(raw.values)))return (raw.values||[]).map(v=>decodeHomeRestValue(v,depth+1));
 if(type==='mapValue'&&raw&&Object.keys(raw).every(k=>k==='fields')){
  if(raw.fields?.__type__?.stringValue==='__vector__')throw fail('unsupported_home_rest_value');
  return decodeHomeRestFields(raw.fields===undefined?{}:raw.fields,depth+1);
 }
 // References/vectors are unsupported by the existing private calculation
 // protocol as well. Never flatten them into guessed strings or plain maps.
 throw fail('unsupported_home_rest_value');
}
function decodeHomeRestFields(fields,depth=0){
 if(!fields||Array.isArray(fields)||typeof fields!=='object'||depth>64)throw fail('invalid_home_rest_value');
 const output=Object.create(null);for(const key of Object.keys(fields))Object.defineProperty(output,key,{enumerable:true,writable:true,configurable:true,value:decodeHomeRestValue(fields[key],depth)});return output;
}
const timestampKey=time=>{
 if(!time||!Number.isSafeInteger(time.seconds)||!Number.isInteger(time.nanoseconds)||time.nanoseconds<0||time.nanoseconds>=1e9)throw fail('home_snapshot_unconfirmed');
 return time.seconds+':'+time.nanoseconds;
};

// Same point-in-time financial snapshot, but without a separate network trip
// per 100/200 documents. All server queries have a finite limit and stream
// through shared record/byte/deadline budgets. No raw collection reaches HTTP.
async function loadEmployeeHomeRestSnapshot({db,scope,projectId,getAccessToken,fetchImpl=globalThis.fetch,
 deadlineMs=3000,maxDocuments=20000,maxPrivateBytes=24*1024*1024,maxWireBytes=32*1024*1024,onReadMetrics=()=>{}}){
 if(!db?.runTransaction||!scope||![scope.appId,scope.companyId,scope.employeeId].every(id)||!/^[a-z][a-z0-9-]{3,62}$/.test(projectId)
  ||typeof getAccessToken!=='function'||typeof fetchImpl!=='function'||!Number.isSafeInteger(deadlineMs)||deadlineMs<1||deadlineMs>3500
  ||!Number.isSafeInteger(maxDocuments)||maxDocuments<1||maxDocuments>20000||!Number.isSafeInteger(maxPrivateBytes)||maxPrivateBytes<1||maxPrivateBytes>24*1024*1024
  ||!Number.isSafeInteger(maxWireBytes)||maxWireBytes<1||maxWireBytes>32*1024*1024)throw new TypeError('Verified bounded Home stream dependencies required.');
 let timedOut=false;
 const controller=new AbortController(),deadline=Date.now()+deadlineMs,timer=setTimeout(()=>{timedOut=true;controller.abort()},deadlineMs);
 const check=()=>{if(controller.signal.aborted||Date.now()>=deadline)throw fail('home_snapshot_timeout')};
 const root=`artifacts/${scope.appId}/public/data`,sources=Object.create(null),counts=Object.create(null),metrics=[];
 let documents=0,reserved=0,privateBytes=0,wireBytes=0,next=0,stopped=false;
 const admit=data=>{check();if(++documents>maxDocuments)throw fail('home_snapshot_document_limit');privateBytes+=serialize(encodeEmployeeHomePrivateValue(data)).byteLength;if(privateBytes>maxPrivateBytes)throw fail('home_snapshot_byte_limit')};
 try{
  const {company,employee,readTime,key}=await db.runTransaction(async tx=>{
   const [c,e]=await tx.getAll(db.doc(`${root}/companies/${scope.companyId}`),db.doc(`${root}/employees/${scope.employeeId}`),EMPLOYEE_HOME_ACTOR_READ_OPTIONS);check();
   if(!c?.exists||!e?.exists||e.data()?.companyId!==scope.companyId||c.data()?.isArchived||e.data()?.isArchived)throw fail('home_actor_unavailable');
   const key=timestampKey(c.readTime);if(timestampKey(e.readTime)!==key)throw fail('home_snapshot_changed');
   return {company:{documentId:c.id,data:c.data()},employee:{documentId:e.id,data:e.data()},key,
    readTime:new Date(c.readTime.seconds*1000).toISOString().slice(0,19)+'.'+String(c.readTime.nanoseconds).padStart(9,'0')+'Z'};
  },{readOnly:true});
  admit(company.data);admit(employee.data);
  const credential=await getAccessToken();check();const token=typeof credential==='string'?credential:credential?.access_token;
  if(typeof token!=='string'||!token||token.length>65536||!/^[-._~+/A-Za-z0-9]+=*$/.test(token))throw fail('home_service_credential_unavailable');
  const prefix=`projects/${projectId}/databases/(default)/documents/${root}/`;
  const read=async name=>{
   // Reserve finite server-side query limits from one shared document budget,
   // not just a client-side counter after Firestore has already read the rows.
   // A source reaching its reservation is unconfirmed/truncated and MUST fail;
   // it is never returned as a complete financial input. This compatibility
   // experiment deliberately rejects datasets beyond its proven budget.
   const available=maxDocuments-documents-reserved;if(available<1)throw fail('home_snapshot_document_limit');
   const limit=Math.max(1,Math.floor(available/2));reserved+=limit;
   const metric={collection:name,pages:0,rows:0,durationMs:0,processingMs:0,decodedBytes:0,complete:false},started=Date.now();metrics.push(metric);
   try{
    check();const response=await fetchImpl(`https://firestore.googleapis.com/v1/${prefix.slice(0,-1)}:runQuery`,{
     method:'POST',redirect:'error',cache:'no-store',signal:controller.signal,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
     body:JSON.stringify({structuredQuery:{from:[{collectionId:name}],where:{fieldFilter:{field:{fieldPath:'companyId'},op:'EQUAL',value:{stringValue:scope.companyId}}},
      orderBy:[{field:{fieldPath:'__name__'},direction:'ASCENDING'}],limit},readTime})});check();
    metric.requestMs=Date.now()-started;metric.httpStatus=response.status;metric.encoding=response.headers?.get?.('content-encoding')||'none';
    if(!response.ok)throw fail('home_snapshot_http_error');metric.pages=1;
    const rows=[];let confirmed=false,previous=null;
    for await(const entry of readHomeQueryObjects(response.body,{check,onBytes:n=>{metric.decodedBytes+=n;wireBytes+=n;if(wireBytes>maxWireBytes)throw fail('home_snapshot_wire_limit')}})){
     const processingStarted=performance.now();try{
     check();if(entry.readTime){if(timestampKey(restTimestamp(entry.readTime))!==key)throw fail('home_snapshot_changed');confirmed=true}
     if(entry.skippedResults)throw fail('invalid_home_snapshot');
     if(!entry.document)continue;
     if(!entry.readTime||typeof entry.document.name!=='string'||!entry.document.name.startsWith(prefix+name+'/'))throw fail('foreign_home_source');
     const documentId=entry.document.name.slice((prefix+name+'/').length),data=decodeHomeRestFields(entry.document.fields||{});
     if(!id(documentId)||data.companyId!==scope.companyId)throw fail('foreign_home_source');
     if(previous!==null&&Buffer.compare(Buffer.from(previous),Buffer.from(documentId))>=0)throw fail('unordered_home_source');
     if(metric.rows>=limit)throw fail('home_snapshot_query_limit');
     admit(data);reserved--;rows.push({documentId,data});metric.rows++;previous=documentId;
     }finally{metric.processingMs+=performance.now()-processingStarted}
    }
    if(!confirmed)throw fail('home_snapshot_unconfirmed');if(rows.length===limit)throw fail('home_snapshot_query_limit');
    check();sources[name]=rows;counts[name]=rows.length;metric.complete=true;
   }catch(error){stopped=true;controller.abort();throw error}
   finally{reserved-=Math.max(0,limit-metric.rows);metric.durationMs=Date.now()-started}
  };
  const worker=async()=>{while(!stopped&&next<EMPLOYEE_HOME_SOURCE_COLLECTIONS.length){check();await read(EMPLOYEE_HOME_SOURCE_COLLECTIONS[next++])}};
  const workers=Array.from({length:2},()=>worker());
  try{await Promise.all(workers)}catch(error){stopped=true;controller.abort();await Promise.allSettled(workers);throw error}
  check();return {company,employee,sources,counts,readTime};
 }catch(error){if(timedOut&&!/^home_/.test(error?.code||''))throw fail('home_snapshot_timeout');if(error?.code)throw error;if(controller.signal.aborted)throw fail('home_snapshot_timeout');throw fail('home_snapshot_read_failed')}
 finally{clearTimeout(timer);controller.abort();onReadMetrics(metrics)}
}
module.exports={loadEmployeeHomeRestSnapshot,decodeHomeRestValue,decodeHomeRestFields,restTimestamp};
