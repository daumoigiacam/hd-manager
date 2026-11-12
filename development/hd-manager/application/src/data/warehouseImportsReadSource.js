// Same owner/SQLite/feed authority. One bounded page receipt in the existing
// scoped head describes persisted rows; no result cache or fetch-all worker.
import {OFFLINE_HOME_SCHEMA} from './offlineHomeRepository.js';
import {ensureExactSQLiteTables} from './exactSQLiteSchema.js';
import {createHomeFeedStorage} from './offlineHomeFeedStorage.js';
import {createOfflineBusinessDirectory} from './offlineBusinessDirectory.js';
import {createPendingWriteScheduler} from '../services/pendingWriteScheduler.js';
import {IMPORT_SOURCE as source,IMPORT_HEAD_KIND as kind,importQuery,importQueryKey,importHasFilter} from './warehouseImportsReadContract.js';
const fail=(code,message)=>Object.assign(Error(message),{code});
const aborted=()=>fail('query-cancelled','Warehouse query superseded');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const rawOptions=q=>Object.fromEntries(['from','to','text','customerId','employeeId','status','limit','cursor','checkpoint','includeCount'].map(k=>[k,q[k]]));
const requestKey=q=>JSON.stringify([importQueryKey(q),q.cursor,q.checkpoint,q.includeCount]);
export async function createWarehouseImportsReadSource({database,session,authorize,digest,transport,online,foreground,changed,onFatal,clock=Date.now,schedule=setTimeout,cancel=clearTimeout}){
 const scope=Object.freeze({...session.scope}),keys=[scope.tenantId,scope.principalId];
 let closed=false,securityStopped=false,expiresAt=0,version=0,selection=null,lastQuery=null,pending=null,flight=null,wanted=null,checked=null,scheduledTimer=null;
 const live=()=>!closed&&!securityStopped&&session.isCurrent(scope);
 function taskCurrent(task){if(!live()||task&&(task.version!==version||task.controller.signal.aborted))throw aborted();}
 async function access(task){
  if(!live())throw fail('permission-denied','Warehouse source owner closed');taskCurrent(task);
  const grant=await authorize({scope,kind:'app.session'});
  if(!live())throw fail('permission-denied','Warehouse source owner closed');taskCurrent(task);
  if(!Number.isSafeInteger(grant?.expiresAtMs)||clock()>=grant.expiresAtMs||!Object.keys(scope).every(k=>grant[k]===scope[k])||!grant.capabilities?.includes('home.imports.read')||grant.capabilities.includes('home.read')||grant.appSession?.sourceProfile!==undefined)throw fail('permission-denied','Warehouse import permission changed');
  expiresAt=grant.expiresAtMs;return grant;
 }
 const local=work=>foreground.run(work);
 const transaction=async(work,task)=>{await access(task);return database.transaction(async db=>{await access(task);const result=await work(db);await access(task);return result;});};
 const read=async(sql,params,task)=>{await access(task);const rows=database.readQuery?await database.readQuery(sql,params):await transaction(db=>db.query(sql,params),task);await access(task);return rows;};
 await ensureExactSQLiteTables({statements:OFFLINE_HOME_SCHEMA,read,transaction});
 await createHomeFeedStorage({transaction,keys,scope,streamRead:work=>work(read,()=>taskCurrent())});
 const raw=createOfflineBusinessDirectory({database,session,authorize,sourceScope:source});
 const localHead=async task=>{const [row]=await read('SELECT generation,captured_at,snapshot_json FROM offline_home_head_v1 WHERE tenant_id=? AND principal_id=? AND revision=?',[...keys,scope.permissionRevision],task);if(!row)return null;const payload=JSON.parse(row.snapshot_json);return payload.kind===kind?{...row,payload}:null;};
 function validate(head){if(head?.kind!==kind||!head.ready||head.financialCalculationAllowed!==false||head.allHomeSourcesComplete!==false||head.tenantId!==scope.tenantId||head.principalId!==scope.principalId||head.permissionRevision!==scope.permissionRevision||head.sessionId!==scope.sessionId||!/^wi_[a-f0-9]{64}$/.test(head.generation)||!Number.isSafeInteger(head.seq)||head.seq<0||head.sourceAnchor?.seq!==head.seq||!Array.isArray(head.sources)||head.sources.length!==1||head.sources[0]!==source||!Number.isSafeInteger(head.counts?.[source])||head.counts[source]<0||!/^\d{4}-\d{2}-\d{2}$/.test(head.asOfDay)||typeof head.filterAllowed!=='boolean')throw fail('invalid-data','Invalid Imports source metadata');}
 async function decorate(result,mode,task,q){
  const row=await localHead(task);if(!row||row.generation!==result.metadata.checkpoint.generation||row.captured_at!==result.metadata.checkpoint.capturedAt)throw fail('stale-checkpoint','Warehouse coverage changed');
  const coverage={...row.payload.coverage};
  if(mode==='stored-only'){
   // This SQL predicate is valid over the stored coverage; the last remote
   // predicate's page receipt/continuation/exhaustion says nothing about it.
   delete coverage.page;coverage.queryKey=q?importQueryKey(q):null;
   coverage.serverCursor=null;coverage.scanExhausted=null;
   coverage.storedScanExhausted=!result.hasMore;
  }
  return {...result,metadata:{...result.metadata,coverage:{...coverage,mode,matchingScope:mode==='stored-only'?'stored-coverage':'server-query-page'},financialCalculationAllowed:false,allHomeSourcesComplete:false}};
 }
 async function stored(q,task){
  const head=await localHead(task);if(!head)throw fail('source-unavailable','Warehouse Imports have not been stored');
  if(importHasFilter(q)&&!head.payload.coverage.filterAllowed)throw fail('filter-not-authorized','Warehouse filter action unavailable');
  if(q.cursor){let c;try{c=JSON.parse(q.cursor);}catch{throw fail('invalid-argument','Invalid Imports cursor');}if(c.v===2)throw fail('offline-page-unavailable','Server page has not been stored; reload stored coverage');}
  const result=await raw.page(source,rawOptions(q));taskCurrent(task);return decorate(result,'stored-only',task,q);
 }
 async function cached(q,task){
  const saved=await localHead(task);if(!saved)return null;
  const c=saved.payload.coverage,r=c?.page;
  if(q.cursor){let cursor;try{cursor=JSON.parse(q.cursor);}catch{throw fail('invalid-argument','Invalid Imports cursor');}if(cursor.v===1)return stored(q,task);}
  // A new predicate has no server-page receipt yet. Its bounded SQL result is
  // still immediately useful, explicitly limited to stored coverage. A server
  // continuation must never be reinterpreted as a local SQL cursor.
  if(c?.queryKey!==importQueryKey(q))return q.cursor===null?stored(q,task):null;
  if(importHasFilter(q)&&!c.filterAllowed)throw fail('filter-not-authorized','Warehouse filter action unavailable');
  if(!r){
   // 54 lacks request-cursor/IDs. Return explicitly partial stored coverage,
   // never reconstruct a server-page manifest or reuse its unproved cursor.
   return q.cursor===null?stored(q,task):null;
  }
  if(r.v!==1||r.generation!==saved.generation||r.queryKey!==importQueryKey(q))return null;
  if(r.requestCursor!==q.cursor)return q.cursor===null?stored(q,task):null;
  if(!Array.isArray(r.ids)||r.ids.length>25||new Set(r.ids).size!==r.ids.length||r.ids.some(id=>typeof id!=='string'||!id||id.length>256)||typeof r.hasMore!=='boolean'||r.hasMore&&typeof r.nextCursor!=='string'||!r.hasMore&&r.nextCursor!==null)throw fail('invalid-data','Invalid persisted Imports page');
  const queryHash=await digest(JSON.stringify([scope.principalId,scope.permissionRevision,scope.sessionId,saved.generation,importQueryKey(q)]));
  if(queryHash!==r.queryHash)return q.cursor===null?stored(q,task):null;
  const versions=r.ids.length?await read(`SELECT id,json_extract(body,'$.__moduleVersionHash') AS version_hash FROM offline_home_feed_records_v1 WHERE tenant_id=? AND principal_id=? AND generation=? AND source=? AND id IN (${r.ids.map(()=>'?').join(',')})`,[...keys,saved.generation,source,...r.ids],task):[];
  const hashes=new Map(versions.map(row=>[row.id,row.version_hash]));
  if(hashes.size!==r.ids.length||r.pageDigest!==await digest(JSON.stringify([saved.generation,queryHash,q.cursor,r.ids.map(id=>[id,hashes.get(id)])])))throw fail('stale-checkpoint','Persisted Imports page changed');
  const result=r.ids.length?await raw.lookup(source,r.ids,q.checkpoint?{checkpoint:q.checkpoint}:{}):await raw.page(source,{...rawOptions(q),cursor:null});taskCurrent(task);
  if(r.ids.length&&!same(result.items.map(item=>item.id),r.ids))throw fail('stale-checkpoint','Persisted Imports ordering changed');
  return {...await decorate(result,'cached-server-page',task),items:r.ids.length?result.items:[],hasMore:r.hasMore,nextCursor:r.nextCursor};
 }
 // HTTP never holds a SQLite transaction or this helper's foreground pending
 // counter. Deadline/abort settles even a transport that ignores its signal.
 function http(work,task){return new Promise((resolve,reject)=>{
  let timer,done=false;const finish=(error,value)=>{if(done)return;done=true;cancel(timer);task.controller.signal.removeEventListener('abort',abort);error?reject(error):resolve(value);};
  const abort=()=>finish(aborted());task.controller.signal.addEventListener('abort',abort,{once:true});
  if(task.controller.signal.aborted){abort();return;}
  timer=schedule(()=>{finish(fail('unavailable','Warehouse revalidation deadline'));task.controller.abort();},15000);
  Promise.resolve().then(()=>{taskCurrent(task);return work(task.controller.signal);}).then(value=>finish(null,value),finish);
 });}
 async function remote(q,task){
  await access(task);const page=await http(signal=>transport.warehouseImportPage({query:rawOptions(q)},signal,scope),task);await access(task);
  if(page.reset)throw fail('stale-checkpoint','Imports changed; restart from first page');const head=page.head;validate(head);
  if(q.checkpoint&&q.checkpoint.generation!==head.generation)throw fail('stale-checkpoint','Pinned Imports checkpoint changed');
  if(importHasFilter(q)&&!head.filterAllowed)throw fail('filter-not-authorized','Warehouse filter action unavailable');
  const queryHash=await digest(JSON.stringify([scope.principalId,scope.permissionRevision,scope.sessionId,head.generation,importQueryKey(q)]));
  if(page.queryHash!==queryHash||page.requestCursor!==q.cursor||!Array.isArray(page.items)||page.items.length>25||typeof page.hasMore!=='boolean'||page.scanExhausted!==!page.hasMore||page.hasMore&&typeof page.nextCursor!=='string'||!page.hasMore&&page.nextCursor!==null||!Number.isInteger(page.scanned)||page.scanned<page.items.length||page.scanned>100)throw fail('invalid-data','Invalid bounded Imports page');
  let last=null,bytes=0;const ids=new Set();for(const item of page.items){const d=item.document;if(!d||d.companyId!==scope.tenantId||d.id!==item.id||ids.has(item.id)||!/^[a-f0-9]{64}$/.test(d.__moduleVersionHash)||!/^\d{4}-\d{2}-\d{2}$/.test(d.date))throw fail('invalid-data','Invalid Imports row');if(last&&(d.date>last[0]||d.date===last[0]&&item.id>=last[1]))throw fail('invalid-data','Unstable Imports ordering');last=[d.date,item.id];ids.add(item.id);bytes+=new TextEncoder().encode(JSON.stringify(d)).length;}
  if(bytes>500000||page.pageDigest!==await digest(JSON.stringify([head.generation,queryHash,q.cursor,page.items.map(x=>[x.id,x.document.__moduleVersionHash])])))throw fail('invalid-data','Imports page digest mismatch');
  let published=false;
  await local(()=>transaction(async db=>{
   for(const item of page.items){const old=(await db.query('SELECT body FROM offline_home_feed_records_v1 WHERE tenant_id=? AND principal_id=? AND generation=? AND source=? AND id=?',[...keys,head.generation,source,item.id]))[0];const body=JSON.stringify(item.document);if(old&&old.body!==body)throw fail('stale-checkpoint','Imports snapshot content changed');await db.run('INSERT OR IGNORE INTO offline_home_feed_records_v1 VALUES (?,?,?,?,?,?,?)',[...keys,head.generation,source,item.id,head.seq,body]);}
   const cachedRows=(await db.query('SELECT COUNT(*) AS n FROM offline_home_feed_records_v1 WHERE tenant_id=? AND principal_id=? AND generation=? AND source=?',[...keys,head.generation,source]))[0]?.n;if(!Number.isSafeInteger(cachedRows)||cachedRows>head.counts[source])throw fail('invalid-data','Imports coverage count mismatch');
   const previous=(await db.query('SELECT generation,captured_at,snapshot_json FROM offline_home_head_v1 WHERE tenant_id=? AND principal_id=? AND revision=?',[...keys,scope.permissionRevision]))[0],capturedAt=previous?.generation===head.generation?previous.captured_at:clock(),completeSource=cachedRows===head.counts[source];
   if(previous&&JSON.parse(previous.snapshot_json).kind!==kind)throw fail('source-unavailable','Existing financial Home head retained');
   const receipt={v:1,generation:head.generation,queryKey:importQueryKey(q),requestCursor:q.cursor,ids:[...ids],hasMore:page.hasMore,nextCursor:page.nextCursor,queryHash,pageDigest:page.pageDigest};
   const coverage={cachedRows,totalSourceRows:head.counts[source],completeSource,filterAllowed:head.filterAllowed,serverCursor:page.nextCursor,queryKey:importQueryKey(q),scanExhausted:page.scanExhausted,page:receipt};
   const payload=JSON.stringify({schemaVersion:1,kind,sourceProfile:'legacy-v1',availableSources:[source],sourceCounts:head.counts,feedGeneration:head.generation,feedSeq:head.seq,sourceAnchor:head.sourceAnchor,coverage,financialCalculationAllowed:false,allHomeSourcesComplete:false});
   published=previous?.snapshot_json!==payload;
   await db.run('INSERT OR REPLACE INTO offline_home_head_v1 VALUES (?,?,?,?,?,?,?)',[...keys,scope.permissionRevision,head.generation,capturedAt,head.asOfDay,payload]);
   await db.run('INSERT OR REPLACE INTO offline_home_feed_checkpoint_v1 VALUES (?,?,?,?,?,?)',[...keys,scope.permissionRevision,head.generation,head.seq,completeSource?head.seq:-1]);
  },task));
  const result=await local(async()=>{const projected=page.items.length?await raw.lookup(source,page.items.map(x=>x.id),q.checkpoint?{checkpoint:q.checkpoint}:{}):await raw.page(source,{...rawOptions(q),cursor:null});taskCurrent(task);return {...await decorate(projected,'server-page',task),items:page.items.length?projected.items:[],hasMore:page.hasMore,nextCursor:page.nextCursor};});
  taskCurrent(task);checked={key:requestKey(q),generation:head.generation};return {result,published,generation:head.generation};
 }
 async function fatal(error,task){if(live()&&(!task||task.version===version&&!task.controller.signal.aborted)&&['permission-denied','unauthenticated'].includes(error?.code)){securityStopped=true;scheduler.close();flight?.controller.abort();wanted=null;await onFatal?.();}}
 function select(q){const key=requestKey(q);if(selection!==key){version++;selection=key;checked=null;wanted=null;if(scheduledTimer!==null){cancel(scheduledTimer);scheduledTimer=null;}flight?.controller.abort();}return key;}
 async function fetchPage(q,task){
  if(flight){const existing=flight;if(existing.key===requestKey(q)&&existing.type==='page'&&existing.version===version)return existing.promise;await existing.promise.catch(()=>{});taskCurrent(task);const hit=await local(()=>cached(q,task));if(hit)return {result:hit};}
  const record={...task,key:requestKey(q),type:'page'};const promise=remote(q,record).finally(()=>{if(flight===record)flight=null;});record.promise=promise;flight=record;return promise;
 }
 function delay(){return !wanted||!live()||!online()||clock()>=expiresAt?null:Math.max(0,wanted.at-clock());}
 function requestBackground(q,generation,force=false){if(!live()||!online())return;const key=requestKey(q);if(!force&&checked?.key===key&&checked.generation===generation)return;if(wanted?.key===key&&wanted.version===version)return;wanted={q,key,generation,version,at:clock()+100,attempts:0,yields:0};scheduler.wake();}
 async function flush(){
  const job=wanted;if(!job||job.version!==version||!live()||!online()){wanted=null;return;}if(clock()>=expiresAt){wanted=null;return;}
  const task={version:job.version,controller:new AbortController()};
  try{
   await access(task);
   if(foreground.shouldYield?.()){if(++job.yields<=10){job.at=clock()+100;return;}wanted=null;return;}
   if(flight){await flight.promise.catch(()=>{});taskCurrent(task);if(wanted===job)wanted=null;return;}
   const record={...task,key:job.key,type:'head'};flight=record;
   record.promise=(async()=>{
    const head=await http(signal=>transport.warehouseImportHead(signal,scope),record);await access(record);validate(head);
    const saved=await local(()=>localHead(record)),receipt=saved?.payload.coverage?.page;
    if(saved?.generation===head.generation&&receipt?.v===1&&receipt.requestCursor===job.q.cursor&&receipt.queryKey===importQueryKey(job.q)&&receipt.queryHash===await digest(JSON.stringify([scope.principalId,scope.permissionRevision,scope.sessionId,head.generation,importQueryKey(job.q)]))){checked={key:job.key,generation:head.generation};return;}
    const q=importQuery({...rawOptions(job.q),cursor:saved?.generation===head.generation&&job.q.cursor&&JSON.parse(job.q.cursor).v===2?job.q.cursor:null,checkpoint:null});
    const output=await remote(q,record);checked={key:job.key,generation:output.generation};if(output.published){taskCurrent(record);changed('home');}return output;
   })();await record.promise;if(wanted===job)wanted=null;
  }catch(error){await fatal(error,task);if(wanted===job){if(live()&&job.version===version&&['network-error','unavailable','busy','stale-checkpoint'].includes(error?.code)&&++job.attempts<=3){job.at=clock()+[100,250,1000][job.attempts-1];}else wanted=null;}}
  finally{if(flight?.controller===task.controller)flight=null;}
 }
 const scheduler=createPendingWriteScheduler({flush,nextDelay:delay,schedule:(callback,ms)=>{scheduledTimer=schedule(()=>{scheduledTimer=null;return callback();},Math.max(ms,delay()??0));return scheduledTimer;},cancel:id=>{cancel(id);if(scheduledTimer===id)scheduledTimer=null;},onError:()=>{wanted=null;}});
 function queue(q){
  const key=select(q);if(pending?.key===key)return pending.promise;
  const task={version,controller:new AbortController()};
  const promise=(async()=>{await access(task);if(!online())return local(()=>stored(q,task));const hit=await local(()=>cached(q,task));taskCurrent(task);if(hit){requestBackground(q,hit.metadata.checkpoint.generation);return hit;}return (await fetchPage(q,task)).result;})().catch(async error=>{await fatal(error,task);throw error;}).finally(()=>{if(pending?.promise===promise)pending=null;});
  pending={key,promise};return promise;
 }
 function page(name,input={}){if(name!==source)return Promise.reject(fail('permission-denied','Warehouse-only source'));const q=importQuery(input);lastQuery={...rawOptions(q),cursor:null};return queue(q);}
 async function decoratedLookup(args){const result=await raw.lookup(...args);await access();return decorate(result,'stored-only');}
 const directory=Object.freeze({...raw,sourceScope:source,sources:Object.freeze({[source]:Object.freeze({...raw.sources[source],requiredCapabilities:Object.freeze(['home.imports.read']),authorizationKind:'app.session'})}),page,pageBatch:async plan=>{if(!Array.isArray(plan)||plan.length!==1||plan[0].source!==source)throw fail('permission-denied','Warehouse-only source');return [await page(source,plan[0].options)];},lookup:async(...args)=>{await access();return local(()=>decoratedLookup(args));},syncSource:async name=>{if(name!==source)throw fail('permission-denied','Warehouse-only source');await access();checked=null;}});
 async function sync(){if(!live()||!online()||!lastQuery)return;try{await access();const q=importQuery(lastQuery);select(q);const saved=await local(()=>localHead());requestBackground(q,saved?.generation,true);}catch(error){await fatal(error);throw error;}}
 return Object.freeze({directory:async()=>{await access();return directory;},sync,close(){if(closed)return;closed=true;version++;wanted=null;scheduler.close();flight?.controller.abort();}});
}
