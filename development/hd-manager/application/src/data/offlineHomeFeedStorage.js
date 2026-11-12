import {homeFeedSources,homeCalculationBodySql} from './homeFeedContract.js';
import {createProjectionScheduler} from '../services/cooperativeProjection.js';
import {BUSINESS_SEARCH_SCHEMA,BUSINESS_SEARCH_VERSION,BUSINESS_SEARCH_FIELDS,businessSearchUpserts,runSearchStatements,hasOrderSearchProjection,businessOrderSearchUpserts,backfillOrderSearchPage,publishOrderSearchCoverage,ORDER_SEARCH_TABLE} from './offlineBusinessSearchProjection.js';
import {ensureExactSQLiteTables} from './exactSQLiteSchema.js';
export async function createHomeFeedStorage({transaction,keys,scope,sourceProfile,streamRead}){
 await ensureExactSQLiteTables({transaction,read:streamRead?((sql,params)=>streamRead(query=>query(sql,params))):undefined,statements:[
  'CREATE TABLE IF NOT EXISTS offline_home_feed_checkpoint_v1 (tenant_id TEXT,principal_id TEXT,revision TEXT,generation TEXT,applied_seq INTEGER,reported_seq INTEGER,PRIMARY KEY(tenant_id,principal_id,revision,generation))',
  'CREATE TABLE IF NOT EXISTS offline_home_feed_records_v1 (tenant_id TEXT,principal_id TEXT,generation TEXT,source TEXT,id TEXT,seq INTEGER,body TEXT,PRIMARY KEY(tenant_id,principal_id,generation,source,id))',
  ...BUSINESS_SEARCH_SCHEMA,
 ]});
 // Owner-local schema presence only, never row/checkpoint/permission authority.
 // Lazy first mutation probe; Orders-demand migration flips it only AFTER the
 // existing transaction commits. A cancelled migration cannot publish a flag.
 let orderProjectionPresent;
 const orderProjectionEnabled=async db=>{
  if(orderProjectionPresent===undefined)orderProjectionPresent=await hasOrderSearchProjection(db);
  return orderProjectionPresent;
 };
 const validate=head=>{
  const sources=homeFeedSources(head?.sourceProfile,head?.sources);
  if((head.sourceProfile||'legacy-v1')!==(sourceProfile||'legacy-v1'))throw Object.assign(Error('Home source profile differs from signed grant'),{code:'permission-denied'});
  if(head?.tenantId!==scope.tenantId||head?.principalId!==scope.principalId||head?.permissionRevision!==scope.permissionRevision)throw Object.assign(Error('Home permission scope changed'),{code:'permission-denied'});
  if(!head.ready||typeof head.generation!=='string'||!Number.isSafeInteger(head.seq)||head.seq<0||!/^\d{4}-\d{2}-\d{2}$/.test(head.asOfDay)||!head.counts||!Array.isArray(head.sources)||sources.some(s=>!Number.isSafeInteger(head.counts[s])||head.counts[s]<0)||head.sources.length!==sources.length||!sources.every(s=>head.sources.includes(s)))throw Error('Home source manifest rejected');
 };
 const checkpoint=async(db,head)=>{
  validate(head);const values=[...keys,scope.permissionRevision,head.generation];
  await db.run('INSERT OR IGNORE INTO offline_home_feed_checkpoint_v1 VALUES (?,?,?,?,0,-1)',values);
  const result=(await db.query('SELECT applied_seq,reported_seq FROM offline_home_feed_checkpoint_v1 WHERE tenant_id=? AND principal_id=? AND revision=? AND generation=?',values))[0];if(result.applied_seq>head.seq)throw Error('Home feed revision rollback');
  const published=(await db.query("SELECT day_key,json_extract(snapshot_json,'$.availableSources') AS sources,json_extract(snapshot_json,'$.sourceCounts') AS counts,COALESCE(json_extract(snapshot_json,'$.sourceProfile'),'legacy-v1') AS profile FROM offline_home_head_v1 WHERE tenant_id=? AND principal_id=? AND revision=? AND generation=?",values))[0];
  let reportedManifestMatches=false;
  if(published){try{const names=JSON.parse(published.sources),counts=JSON.parse(published.counts);reportedManifestMatches=Array.isArray(names)&&names.length===head.sources.length&&head.sources.every(source=>names.includes(source)&&counts?.[source]===head.counts[source])&&published.profile===(head.sourceProfile||'legacy-v1');}catch{/* An incomplete old manifest is not published as current coverage. */}}
  return {...result,reported_day:published?.day_key,reported_manifest_matches:reportedManifestMatches};
 };
 const projectionCoverage=async(db,head,source=null)=>{
  const counts=Object.fromEntries((await db.query(`SELECT r.source,COUNT(*) AS n,COUNT(p.id) AS projected FROM offline_home_feed_records_v1 r
   LEFT JOIN offline_business_search_v1 p ON p.tenant_id=r.tenant_id AND p.principal_id=r.principal_id AND p.generation=r.generation AND p.source=r.source AND p.id=r.id AND p.seq=r.seq AND p.version=?
   WHERE r.tenant_id=? AND r.principal_id=? AND r.generation=?${source?' AND r.source=?':''} GROUP BY r.source`,[BUSINESS_SEARCH_VERSION,...keys,head.generation,...(source?[source]:[])])).map(row=>[row.source,row]));
  const sources=(source?[source]:Object.keys(BUSINESS_SEARCH_FIELDS)).filter(name=>head.sources.includes(name)&&(counts[name]?.n||0)===head.counts[name]&&(counts[name]?.projected||0)===head.counts[name]);
  await runSearchStatements(db,sources.map(name=>({statement:'INSERT OR REPLACE INTO offline_business_search_coverage_v1 VALUES (?,?,?,?,?,?,?,?,1)',values:[...keys,scope.permissionRevision,head.generation,name,BUSINESS_SEARCH_VERSION,head.seq,'']})));
  return sources;
 };
 return Object.freeze({
  checkpoint:head=>transaction(db=>checkpoint(db,head)),
  backfillSearchPage(head,{source,limit=16,signal,orderSort=false,shouldContinue}={}){return transaction(async ownerDb=>{
   const check=()=>{if(signal?.aborted)throw Object.assign(Error('Search projection backfill cancelled'),{name:'AbortError'});if(shouldContinue&&shouldContinue()!==true)throw Object.assign(Error('Foreground read preempted derived batch'),{code:'foreground-yield'});};
   if(shouldContinue!==undefined&&typeof shouldContinue!=='function')throw new TypeError('Synchronous foreground continuation required');
   // Guard every native await, including checkpoint/schema helpers. Throwing
   // rolls back only this derived batch on the SAME existing transaction owner.
   const db={...ownerDb};
   for(const method of ['query','run','runSet','execute'])if(typeof ownerDb[method]==='function')db[method]=async(...args)=>{check();const result=await ownerDb[method](...args);check();return result;};
   check();validate(head);
   if(!Object.hasOwn(BUSINESS_SEARCH_FIELDS,source)||!head.sources.includes(source)||!Number.isInteger(limit)||limit<1||limit>100||typeof orderSort!=='boolean'||(orderSort&&source!=='orders'))throw Error('Invalid search backfill batch');
   let saved;try{saved=await checkpoint(db,head);}catch(failure){if(failure.message==='Home feed revision rollback')failure.code='stale-checkpoint';throw failure;}check();
   if(saved.applied_seq!==head.seq||saved.reported_seq!==head.seq||saved.reported_day!==head.asOfDay)throw Object.assign(Error('Completed search backfill checkpoint changed'),{code:'stale-checkpoint'});
   const published=(await db.query("SELECT json_extract(snapshot_json,'$.feedGeneration') AS generation,json_extract(snapshot_json,'$.feedSeq') AS seq,json_extract(snapshot_json,'$.sourceCounts') AS counts,json_extract(snapshot_json,'$.availableSources') AS sources,COALESCE(json_extract(snapshot_json,'$.sourceProfile'),'legacy-v1') AS profile FROM offline_home_head_v1 WHERE tenant_id=? AND principal_id=? AND revision=? AND generation=?",[...keys,scope.permissionRevision,head.generation]))[0];
   if(published?.generation!==head.generation||published?.seq!==head.seq)throw Object.assign(Error('Search backfill snapshot differs'),{code:'stale-checkpoint'});
   let counts,sources;try{counts=JSON.parse(published.counts);sources=JSON.parse(published.sources);}catch{throw Object.assign(Error('Search backfill manifest is invalid'),{code:'stale-checkpoint'});}
   if(published.profile!==(sourceProfile||'legacy-v1')||counts?.[source]!==head.counts[source]||!Array.isArray(sources)||!sources.includes(source))throw Object.assign(Error('Search backfill manifest differs'),{code:'stale-checkpoint'});
   if(source==='orders'&&orderSort){
    if(counts.customers!==head.counts.customers||!sources.includes('customers'))throw Object.assign(Error('Orders customer manifest differs'),{code:'stale-checkpoint'});
    const result=await backfillOrderSearchPage(db,{keys,scope,head,limit,check});check();
    if(result.complete)await projectionCoverage(db,head,'orders');check();return result;
   }
   const coverageKeys=[...keys,scope.permissionRevision,head.generation,source,BUSINESS_SEARCH_VERSION];
   const progress=(await db.query('SELECT target_seq,after_id,complete FROM offline_business_search_coverage_v1 WHERE tenant_id=? AND principal_id=? AND revision=? AND generation=? AND source=? AND version=?',coverageKeys))[0];
   if(progress?.target_seq===head.seq&&progress.complete===1)return {source,processed:0,complete:true,generation:head.generation,seq:head.seq,version:BUSINESS_SEARCH_VERSION};
   const after=progress?.target_seq===head.seq?progress.after_id:'';
   const rows=await db.query('SELECT id,seq,body FROM offline_home_feed_records_v1 WHERE tenant_id=? AND principal_id=? AND generation=? AND source=? AND id>? ORDER BY id LIMIT ?',[...keys,head.generation,source,after,limit]);check();
   const next=rows.at(-1)?.id??after;
   await runSearchStatements(db,[...businessSearchUpserts(rows.map(row=>[...keys,head.generation,source,row.id,row.seq,row.body])),
    {statement:'INSERT OR REPLACE INTO offline_business_search_coverage_v1 VALUES (?,?,?,?,?,?,?,?,0)',values:[...coverageKeys,head.seq,next]}]);check();
   const complete=rows.length<limit&&(await projectionCoverage(db,head,source)).includes(source);check();
   if(rows.length<limit&&!complete)throw Object.assign(Error('Search projection coverage differs from completed feed'),{code:'stale-checkpoint'});
   return {source,processed:rows.length,complete,generation:head.generation,seq:head.seq,version:BUSINESS_SEARCH_VERSION};
  }).then(result=>{if(orderSort)orderProjectionPresent=true;return result;});},
  applyPage(head,page){return transaction(async db=>{
   const saved=await checkpoint(db,head);
   const orderProjection=await orderProjectionEnabled(db);
   if(page.generation!==head.generation||page.tenantId!==scope.tenantId||page.principalId!==scope.principalId||page.permissionRevision!==scope.permissionRevision||page.after!==saved.applied_seq||page.target!==head.seq||!Array.isArray(page.events)||!page.events.length||page.events.length>100)throw Error('Home feed checkpoint mismatch');
   let seq=saved.applied_seq,upserts=[];
   const flush=async()=>{if(!upserts.length)return;await runSearchStatements(db,[{statement:'INSERT INTO offline_home_feed_records_v1 VALUES '+upserts.map(()=>'(?,?,?,?,?,?,?)').join(',')+' ON CONFLICT(tenant_id,principal_id,generation,source,id) DO UPDATE SET seq=excluded.seq,body=excluded.body WHERE excluded.seq>offline_home_feed_records_v1.seq',values:upserts.flat()},...businessSearchUpserts(upserts),...(orderProjection?businessOrderSearchUpserts(upserts):[])]);upserts=[];};
   for(const event of page.events){
    if(event.seq!==++seq||seq>head.seq||event.generation!==head.generation||!homeFeedSources(head.sourceProfile,head.sources).includes(event.source)||typeof event.id!=='string')throw Error('Noncontiguous Home feed');
    if(event.operation==='delete'){await flush();const values=[...keys,head.generation,event.source,event.id];await runSearchStatements(db,[{statement:'DELETE FROM offline_home_feed_records_v1 WHERE tenant_id=? AND principal_id=? AND generation=? AND source=? AND id=?',values},...(Object.hasOwn(BUSINESS_SEARCH_FIELDS,event.source)?[{statement:'DELETE FROM offline_business_search_v1 WHERE tenant_id=? AND principal_id=? AND generation=? AND source=? AND id=?',values}]:[]),...(orderProjection?[{statement:`DELETE FROM ${ORDER_SEARCH_TABLE} WHERE tenant_id=? AND principal_id=? AND generation=? AND source=? AND id=?`,values}]:[])]);}
    else if(event.operation==='upsert'){
     if(!event.document||event.document.id!==event.id||(event.source==='companies'?event.id!==scope.tenantId:event.document.companyId!==scope.tenantId))throw Error('Home event tenant mismatch');
     upserts.push([...keys,head.generation,event.source,event.id,seq,JSON.stringify(event.document)]);if(upserts.length===50)await flush();
    }else throw Error('Invalid Home operation');
   }
   await flush();await db.run('UPDATE offline_home_feed_checkpoint_v1 SET applied_seq=? WHERE tenant_id=? AND principal_id=? AND revision=? AND generation=?',[seq,...keys,scope.permissionRevision,head.generation]);return seq;
  });},
  page(head,source,{after='',limit=100}={}){return transaction(async db=>{
   const saved=await checkpoint(db,head);if(saved.applied_seq!==head.seq||!homeFeedSources(head.sourceProfile,head.sources).includes(source)||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Home sources incomplete');
   return (await db.query('SELECT id,body FROM offline_home_feed_records_v1 WHERE tenant_id=? AND principal_id=? AND generation=? AND source=? AND id>? ORDER BY id LIMIT ?',[...keys,head.generation,source,after,limit])).map(r=>JSON.parse(r.body));
  });},
  streamSource(head,source,onPage){return transaction(async db=>{
   const saved=await checkpoint(db,head);if(saved.applied_seq!==head.seq||!homeFeedSources(head.sourceProfile,head.sources).includes(source))throw Error('Home sources incomplete');
   // One authorized operation per source, with bounded bridge pages. The outer
   // transaction verifies the signed permission both before and after reading.
   let after='';for(;;){const rows=await db.query('SELECT id,body FROM offline_home_feed_records_v1 WHERE tenant_id=? AND principal_id=? AND generation=? AND source=? AND id>? ORDER BY id LIMIT 100',[...keys,head.generation,source,after]);onPage(rows.map(row=>JSON.parse(row.body)));if(rows.length<100)break;after=rows[rows.length-1].id;}
  });},
  streamPackedSources:streamRead?async(head,onPacket)=>{
   validate(head);
   return streamRead(async(read,check)=>{
    const values=[...keys,scope.permissionRevision,head.generation];
    const verify=async()=>{if((await read('SELECT applied_seq FROM offline_home_feed_checkpoint_v1 WHERE tenant_id=? AND principal_id=? AND revision=? AND generation=?',values))[0]?.applied_seq!==head.seq)throw Error('Home sources changed while streaming');};
    await verify();
    const bodySql=homeCalculationBodySql(head.sourceProfile);
    let source='',id='';for(;;){check();
     // Return one JSON packet from native SQLite. Parsing and object creation
     // belong to the calculation worker, rather than the input/UI thread.
     const [page]=await read('WITH page AS (SELECT source,id,'+bodySql+' AS body FROM offline_home_feed_records_v1 WHERE tenant_id=? AND principal_id=? AND generation=? AND (source,id)>(?,?) ORDER BY source,id LIMIT 500) SELECT COUNT(*) AS n,json_group_array(json_object(\'source\',source,\'document\',json(body))) AS packet,(SELECT source FROM page ORDER BY source DESC,id DESC LIMIT 1) AS last_source,(SELECT id FROM page ORDER BY source DESC,id DESC LIMIT 1) AS last_id FROM page',[...keys,head.generation,source,id]);
     if(!page||!Number.isInteger(page.n)||page.n<0||page.n>500||typeof page.packet!=='string')throw Error('Invalid Home packet');
     if(page.n)onPacket(page.packet);
     if(page.n<500)break;source=page.last_source;id=page.last_id;
    }
    await verify();
   });
  }:undefined,
  streamAllSources:streamRead?async(head,onPage)=>{
   validate(head);const scheduler=createProjectionScheduler();try{return await streamRead(async(read,check)=>{
    const checkpointSql='SELECT applied_seq FROM offline_home_feed_checkpoint_v1 WHERE tenant_id=? AND principal_id=? AND revision=? AND generation=?';
    const values=[...keys,scope.permissionRevision,head.generation];
    const verify=async()=>{if((await read(checkpointSql,values))[0]?.applied_seq!==head.seq)throw Error('Home sources changed while streaming');};
    await verify();for(const source of head.sources)onPage(source,[]);
    const bodySql=homeCalculationBodySql(head.sourceProfile);
    let source='',id='';for(;;){check();const rows=await read('SELECT source,id,'+bodySql+' AS body FROM offline_home_feed_records_v1 WHERE tenant_id=? AND principal_id=? AND generation=? AND (source,id)>(?,?) ORDER BY source,id LIMIT 500',[...keys,head.generation,source,id]);
     let sliceStarted=performance.now();for(let offset=0;offset<rows.length;offset+=25){check();const batches=new Map();for(const row of rows.slice(offset,offset+25)){if(!head.sources.includes(row.source))throw Error('Unexpected scoped Home source');if(!batches.has(row.source))batches.set(row.source,[]);batches.get(row.source).push(JSON.parse(row.body));}for(const [name,batch]of batches)onPage(name,batch);if(performance.now()-sliceStarted>=4){await scheduler.yieldTask();sliceStarted=performance.now();}}
     if(rows.length<500)break;source=rows.at(-1).source;id=rows.at(-1).id;
    }
    await verify();
   });}finally{scheduler.close();}
  }:undefined,
  publish(head,result){return transaction(async db=>{
   const native=head.sourceProfile==='native-isolation-v1',saved=await checkpoint(db,head);if(saved.applied_seq!==head.seq||(native?result.snapshot?.kind!=='native-source-inventory-v1':!result.snapshot?.finance||result.snapshot.finance.todayKey!==head.asOfDay))throw Error('Incomplete Home calculation');
   const actual=Object.fromEntries((await db.query('SELECT source,COUNT(*) AS n FROM offline_home_feed_records_v1 WHERE tenant_id=? AND principal_id=? AND generation=? GROUP BY source',[...keys,head.generation])).map(r=>[r.source,r.n]));
   for(const source of homeFeedSources(head.sourceProfile,head.sources))if((actual[source]||0)!==head.counts[source]||result.counts[source]!==head.counts[source])throw Error('Home source count mismatch: '+source);
   const payload={schemaVersion:1,snapshot:result.snapshot,sourceProfile:head.sourceProfile,availableSources:homeFeedSources(head.sourceProfile,head.sources),feedGeneration:head.generation,feedSeq:head.seq,deviceTimezoneOffset:result.deviceTimezoneOffset,reports:result.reports,sourceCounts:head.counts};
   if(!native){if(!result.overview||result.overview.snapshot?.finance?.todayKey!==head.asOfDay)throw Error('Home overview missing/mismatched');payload.overview={...payload,...result.overview};}
   await db.run('INSERT OR REPLACE INTO offline_home_head_v1 VALUES (?,?,?,?,?,?,?)',[...keys,scope.permissionRevision,head.generation,Date.now(),head.asOfDay,JSON.stringify(payload)]);
   await db.run('UPDATE offline_home_feed_checkpoint_v1 SET reported_seq=? WHERE tenant_id=? AND principal_id=? AND revision=? AND generation=?',[head.seq,...keys,scope.permissionRevision,head.generation]);
   await projectionCoverage(db,head);
   const orderProjection=await orderProjectionEnabled(db);
   if(orderProjection)await publishOrderSearchCoverage(db,{keys,scope,head});
   await db.run('DELETE FROM offline_home_feed_records_v1 WHERE tenant_id=? AND principal_id=? AND generation<>?',[...keys,head.generation]);
   await runSearchStatements(db,['offline_business_search_v1','offline_business_search_coverage_v1'].map(table=>({statement:`DELETE FROM ${table} WHERE tenant_id=? AND principal_id=? AND generation<>?`,values:[...keys,head.generation]})));
   if(orderProjection)await db.run(`DELETE FROM ${ORDER_SEARCH_TABLE} WHERE tenant_id=? AND principal_id=? AND generation<>?`,[...keys,head.generation]);
   return {generation:head.generation,seq:head.seq};
  });},
 });
}
