// Complete-snapshot foundation for the separately approved, restricted QA
// endpoint. Not a general Home rollout or scalable production read model.
// Existing token/actor authorization and the verified projector are required.
const COLLECTIONS=Object.freeze(['employees','customers','orders','payments','expenses','financials','attendance',
 'performance','employeeReviews','deliveryReports','holidays','advances','assets','assetCostLogs']);
const {serialize}=require('node:v8');
const {encodeEmployeeHomePrivateValue}=require('./employeeHomePrivateValues');
const {EMPLOYEE_HOME_ACTOR_READ_OPTIONS}=require('./employeeHomeActorFields');
const failure=(code,statusCode=403)=>Object.assign(new Error(code),{code,statusCode});
const identifier=value=>typeof value==='string'&&value.length>0&&value.length<=512&&!value.includes('/')&&!['.','..'].includes(value);
const readTimeKey=value=>{
 if(!value||!Number.isSafeInteger(value.seconds)||!Number.isSafeInteger(value.nanoseconds)||value.nanoseconds<0||value.nanoseconds>=1e9)
  throw failure('home_snapshot_unconfirmed',503);
 return `${value.seconds}:${value.nanoseconds}`;
};
const calendarDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)
 &&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;

function captureRequest(body,claims,allowedAppId){
 if(!body||Array.isArray(body)||Object.keys(body).some(key=>!['appId','date','timeZone','nonce'].includes(key)))throw failure('invalid_home_request',400);
 if(body.appId!==allowedAppId||!identifier(allowedAppId))throw failure('app_scope_denied');
 if(!claims||claims.accountType!=='employee'||claims.firebase?.sign_in_provider==='anonymous'||claims.isAnonymous
  ||!identifier(claims.uid)||!identifier(claims.companyId)||!identifier(claims.appUserId)||!identifier(claims.identityId))throw failure('employee_identity_required',401);
 if(!calendarDate(body.date)||typeof body.nonce!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(body.nonce)
  ||typeof body.timeZone!=='string'||body.timeZone.length>80)throw failure('invalid_home_request',400);
 try{new Intl.DateTimeFormat('en',{timeZone:body.timeZone}).format(0)}catch{throw failure('invalid_home_timezone',400)}
 return Object.freeze({appId:allowedAppId,uid:claims.uid,companyId:claims.companyId,employeeId:claims.appUserId,
  identityId:claims.identityId,date:body.date,monthKey:body.date.slice(0,7),timeZone:body.timeZone,nonce:body.nonce});
}

// All queries belong to one read-only Firestore transaction. Each page has a
// bounded limit, stable document cursor and complete enumeration. Never return
// a partial collection as a completed financial input after failure/overflow.
// Raw company histories stay on the server and are never the HTTP response.
async function loadEmployeeHomeSources({db,scope,documentIdField,pageSize=100,maxPages=250,isCurrent=()=>true,
 maxDocuments=20000,maxPrivateBytes=24*1024*1024,deadlineMs=3000,now=Date.now,queryConcurrency=2,onReadMetrics=()=>{}}){
 if(!db||typeof db.runTransaction!=='function'||!documentIdField||!scope
  ||!identifier(scope.appId)||!identifier(scope.companyId)||!identifier(scope.employeeId)
  ||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>200||!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>250
  ||!Number.isSafeInteger(maxDocuments)||maxDocuments<1||maxDocuments>50000
  ||!Number.isSafeInteger(maxPrivateBytes)||maxPrivateBytes<1||maxPrivateBytes>24*1024*1024
  ||!Number.isSafeInteger(deadlineMs)||deadlineMs<1||deadlineMs>3500||typeof now!=='function'
  ||!Number.isSafeInteger(queryConcurrency)||queryConcurrency<1||queryConcurrency>2||typeof onReadMetrics!=='function')
  throw new TypeError('Invalid complete Home snapshot reader.');
 const path=name=>`artifacts/${scope.appId}/public/data/${name}`;
 const deadline=now()+deadlineMs;
 let stopped=false;
 const check=()=>{if(stopped||!isCurrent())throw failure('home_request_cancelled',409);if(now()>=deadline)throw failure('home_snapshot_timeout',503)};
 return db.runTransaction(async transaction=>{
  check();
  const [company,employee]=await transaction.getAll(db.doc(path('companies')+'/'+scope.companyId),db.doc(path('employees')+'/'+scope.employeeId),EMPLOYEE_HOME_ACTOR_READ_OPTIONS);
  check();
  if(!company?.exists||!employee?.exists||employee.data()?.companyId!==scope.companyId
   ||company.data()?.isArchived||employee.data()?.isArchived)throw failure('home_actor_unavailable');
  const timestampKey=readTimeKey(company.readTime);
  const assertReadTime=value=>{if(readTimeKey(value)!==timestampKey)throw failure('home_snapshot_changed',503)};
  assertReadTime(employee.readTime);
  const readTime=new Date(company.readTime.seconds*1000).toISOString().slice(0,19)+'.'+String(company.readTime.nanoseconds).padStart(9,'0')+'Z';
  const sources=Object.create(null),counts=Object.create(null),metrics=[];let documents=0,privateBytes=0,nextCollection=0;
  const admit=data=>{
   check();if(++documents>maxDocuments)throw failure('home_snapshot_document_limit',503);
   // Measure the same private wire representation accepted by the calculation
   // child before retaining each record. Never stringify or export raw records.
   privateBytes+=serialize(encodeEmployeeHomePrivateValue(data)).byteLength;
   if(privateBytes>maxPrivateBytes)throw failure('home_snapshot_byte_limit',503);
  };
  admit(company.data());admit(employee.data());
  // Sequential pages within a collection, at most two independent queries.
  // This is server-side compatibility aggregation, not client list pagination.
  const readCollection=async name=>{
   const metric={collection:name,pages:0,rows:0,durationMs:0,complete:false},started=now();metrics.push(metric);
   try{
   const base=db.collection(path(name)).where('companyId','==',scope.companyId).orderBy(documentIdField).limit(pageSize);
   let cursor=null;const rows=[];let complete=false;
   for(let page=0;page<maxPages;page++){
    check();const snapshot=await transaction.get(cursor?base.startAfter(cursor):base);metric.pages++;check();
    assertReadTime(snapshot.readTime);
    if(!Array.isArray(snapshot.docs)||snapshot.docs.length>pageSize)throw failure('invalid_home_snapshot',503);
    for(const doc of snapshot.docs){
     const data=doc.data();
     if(!identifier(doc.id)||data?.companyId!==scope.companyId)throw failure('foreign_home_source',503);
     assertReadTime(doc.readTime);
     if(rows.length&&Buffer.compare(Buffer.from(rows.at(-1).documentId,'utf8'),Buffer.from(doc.id,'utf8'))>=0)throw failure('unordered_home_source',503);
     admit(data);
     rows.push({documentId:doc.id,data});
     metric.rows++;
    }
    if(snapshot.docs.length<pageSize){complete=true;break}
    const next=snapshot.docs.at(-1);if(cursor&&cursor.id===next.id)throw failure('stalled_home_cursor',503);cursor=next;
   }
   if(!complete)throw failure('home_snapshot_limit',503);
   sources[name]=rows;counts[name]=rows.length;
   metric.complete=true;
   }finally{metric.durationMs=now()-started}
  };
  const worker=async()=>{while(nextCollection<COLLECTIONS.length){check();const name=COLLECTIONS[nextCollection++];await readCollection(name)}};
  const workers=Array.from({length:queryConcurrency},()=>worker());
  try{await Promise.all(workers)}catch(error){stopped=true;await Promise.allSettled(workers);throw error}
  finally{onReadMetrics(metrics)}
  check();
  return {company:{documentId:company.id,data:company.data()},employee:{documentId:employee.id,data:employee.data()},
   sources,counts,readTime};
 },{readOnly:true});
}

// Sharing only an in-flight read/project operation avoids duplicate concurrent
// logins by the SAME verified actor. No completed/stale snapshot TTL, polling,
// writes, Auth shortcuts or cross-actor cache. Every request verifies its token.
function createEmployeeHomeReadModel({allowedAppId,verify,authorizeSnapshotActor,load,project,maxInflight=4}){
 if(!identifier(allowedAppId)||[verify,authorizeSnapshotActor,load,project].some(fn=>typeof fn!=='function')
  ||!Number.isSafeInteger(maxInflight)||maxInflight<1||maxInflight>4)throw new TypeError('Verified read-model dependencies required.');
 const inflight=new Map();
 return async function read(req,{isCurrent=()=>true}={}){
  const claims=await verify(req);const scope=captureRequest(req.body,claims,allowedAppId);
  const check=()=>{if(!isCurrent())throw failure('home_request_cancelled',409)};check();
  const key=JSON.stringify([scope.appId,scope.uid,scope.identityId,scope.companyId,scope.employeeId,scope.date,scope.timeZone]);
  let operation=inflight.get(key);
  if(!operation){
   if(inflight.size>=maxInflight)throw failure('home_read_busy',429);
   operation=(async()=>{
    const snapshot=await load(scope);
    if(await authorizeSnapshotActor({scope,claims,snapshot})!==true)throw failure('home_actor_denied');
    const result=await project({scope,snapshot});
    if(result?.kind!=='hd-employee-home-model-v1'||!result.model||typeof result.domainVersion!=='string'||!result.domainVersion)
     throw failure('invalid_home_projection',503);
    return {reply:{kind:result.kind,domainVersion:result.domainVersion,model:result.model,readTime:snapshot.readTime},snapshot};
   })();
   inflight.set(key,operation);
   void operation.finally(()=>{if(inflight.get(key)===operation)inflight.delete(key)}).catch(()=>{});
  }
  const {reply,snapshot}=await operation;check();
  if(await authorizeSnapshotActor({scope,claims,snapshot})!==true)throw failure('home_actor_denied');check();
  // Independent caller cancellation cannot invalidate another caller's shared
  // read. The reply remains bound to this caller's exact request nonce/scope.
  return {...reply,scope:{uid:scope.uid,companyId:scope.companyId,employeeId:scope.employeeId,date:scope.date,
   monthKey:scope.monthKey,timeZone:scope.timeZone,nonce:scope.nonce}};
 };
}

module.exports={EMPLOYEE_HOME_SOURCE_COLLECTIONS:COLLECTIONS,createEmployeeHomeReadModel,loadEmployeeHomeSources};
