export const OFFLINE_HOME_SCHEMA=[
    'CREATE TABLE IF NOT EXISTS offline_home_head_v1 (tenant_id TEXT,principal_id TEXT,revision TEXT,generation TEXT,captured_at INTEGER,day_key TEXT,snapshot_json TEXT,PRIMARY KEY(tenant_id,principal_id))',
    'CREATE TABLE IF NOT EXISTS offline_home_rows_v1 (tenant_id TEXT,principal_id TEXT,generation TEXT,source TEXT,ordinal INTEGER,body TEXT,PRIMARY KEY(tenant_id,principal_id,generation,source,ordinal))',
  ];
// Mirrors the existing, completed Online dashboard projection. No second
// accounting implementation: the snapshot and its exact calculation inputs are
// committed under one generation, in the same encrypted account database.
import {HOME_FEED_SOURCES,NATIVE_HOME_SOURCES,PAYROLL_FEED_ADDITIONS} from './homeFeedContract.js';
import {ensureExactSQLiteTables} from './exactSQLiteSchema.js';
export const HOME_SOURCES = Object.freeze([
  'orders','payments','expenses','financials','payrollCosts','debtLedger',
  'warehouseImports','warehouseDispatches','warehouseStockCounts',
  'customers','employees','products','attendance','performance','payrollPeriods',
  'lockedPayroll','holidays','deliveryReports','employeeReviews','customerComplaints',
  'cashExpenseRecords',
]);
const PRIMARY_SOURCES=Object.freeze(['orders','payments','expenses','payrollCosts','debtLedger','cashExpenseRecords','customers','employees']);
const clean = value => JSON.parse(JSON.stringify(value, (key, item) =>
  /^(password|loginPassword|passwordHash|salt|idToken|refreshToken|accessToken|customToken|secret)$/i.test(key) ? undefined : item));
const pending = row => row?.__pendingFirebaseSync === true || row?.__pendingLocalSync === true
  || ['LOCAL_ONLY','PENDING_SYNC','SYNCING','SYNC_FAILED','CONFLICT','CONFLICT_REQUIRES_REVIEW'].includes(row?.localSyncState);
const values = value => Array.isArray(value) ? value : Object.values(value);

export async function createOfflineHomeRepository({database,session,authorize,uuid,clock=Date.now,sourceProfile}) {
  const scope=session.scope,keys=[scope.tenantId,scope.principalId];
  const access=async()=>{if(!session.isCurrent())throw Error('Home session closed');return authorize({scope,kind:'home.read'});};
  const streamRead=async work=>{
    const grant=await access();
    const check=()=>{if(!session.isCurrent()||!Number.isSafeInteger(grant?.expiresAtMs)||clock()>=grant.expiresAtMs)throw Object.assign(Error('Home read permission expired or session changed'),{code:'permission-denied'});};
    // A signed authorization brackets the complete read. Each bounded page
    // releases SQLite so durable user writes can run between read batches.
    const readPage=async(sql,params)=>{check();const rows=database.readQuery?await database.readQuery(sql,params):await database.transaction(db=>db.query(sql,params));check();return rows;};
    check();const result=await work(readPage,check);await access();check();return result;
  };
  const transaction=work=>database.transaction(async db=>{await access();const result=await work(db);await access();return result;});
  let schemaReady=null;
  const schemaStatements=OFFLINE_HOME_SCHEMA;
  const cleanupWhere='tenant_id=? AND principal_id=? AND generation NOT IN (SELECT generation FROM offline_home_head_v1 WHERE tenant_id=? AND principal_id=?)';
  const cleanup=db=>db.run('DELETE FROM offline_home_rows_v1 WHERE '+cleanupWhere,[...keys,...keys]);
  const schemaRead=(sql,params)=>streamRead(query=>query(sql,params));
  const ensureSchema=()=>schemaReady||=(async()=>{
    const result=await ensureExactSQLiteTables({statements:schemaStatements,read:schemaRead,transaction,afterCreate:cleanup});
    if(!result.created){
      // Preserve the original scoped DELETE when it has work. A read proves a
      // no-op cleanup needs no write transaction; capture also retains its GC.
      const rows=await schemaRead('SELECT EXISTS(SELECT 1 FROM offline_home_rows_v1 WHERE '+cleanupWhere+' LIMIT 1) AS needed',[...keys,...keys]);
      if(rows[0]?.needed===1)await transaction(cleanup);
    }
  })().catch(error=>{schemaReady=null;throw error;});
  let serial=null,queued=null;
  let overviewMigration=null;
  const prepareOverview=(payload,row)=>{
    if(overviewMigration||payload.overviewVersion||payload.sourceProfile==='native-isolation-v1'||!payload.snapshot?.finance)return;
    // Additive, resumable local projection upgrade. The original full JSON and
    // all business rows/outbox remain untouched; an older APK can still read it.
    overviewMigration=new Promise(resolve=>setTimeout(resolve,50)).then(async()=>{
      if(!session.isCurrent())return;
      const {buildOfflineHomeOverview}=await import('./offlineHomeOverview.js');
      const overview={...payload,...buildOfflineHomeOverview(payload.snapshot)};
      await transaction(db=>db.run("UPDATE offline_home_head_v1 SET snapshot_json=json_set(snapshot_json,'$.overview',json(?)) WHERE tenant_id=? AND principal_id=? AND revision=? AND generation=? AND captured_at=? AND json_extract(snapshot_json,'$.feedSeq') IS ? AND json_type(snapshot_json,'$.overview') IS NULL",[JSON.stringify(overview),...keys,scope.permissionRevision,row.generation,row.captured_at,payload.feedSeq??null]));
    }).catch(()=>{console.warn('Home overview upgrade deferred; full report retained');}).finally(()=>{overviewMigration=null;});
  };
  let feed;
  return Object.freeze({
    async feed(){await ensureSchema();if(!feed)feed=import('./offlineHomeFeedStorage.js').then(({createHomeFeedStorage})=>createHomeFeedStorage({transaction,keys,scope,sourceProfile,streamRead}));return feed;},
    capture(value) {
      // Read projections may be superseded, durable commands may not. Retain
      // at most the running projection and the latest requested projection.
      queued=value;
      if(serial)return serial;
      const persist=async({inputs,payrollCosts,snapshot})=>{
        await ensureSchema();
        await access();
        if(inputs.company?.id!==scope.tenantId || !snapshot?.finance || snapshot.finance.todayKey!==inputs.dashboardDayKey || !/^\d{4}-\d{2}-\d{2}$/.test(inputs.dashboardDayKey||''))throw Error('Incomplete Home projection identity');
        const source={...inputs,payrollCosts};
        const required=snapshot.kind==='home-primary-v1'?PRIMARY_SOURCES:HOME_SOURCES;
        const available=HOME_SOURCES.filter(key=>source[key]&&typeof source[key]==='object');
        for(const key of required)if(!available.includes(key))throw Error('Home source unavailable: '+key);
        for(const key of available) {
          if(!source[key]||typeof source[key]!=='object')throw Error('Home source unavailable: '+key);
          if(values(source[key]).some(pending))throw Error('Home contains unconfirmed local transactions: '+key);
          if(values(source[key]).some(row=>row?.companyId && row.companyId!==scope.tenantId))throw Error('Home source tenant mismatch: '+key);
        }
        const generation=uuid(),capturedAt=clock();
        for(const name of available){
          // Attendance/performance/locked payroll are keyed maps. Preserve their
          // keys as well as array order; a values-only mirror loses relations.
          const rows=Object.entries(source[name]);
          // Bounded bridge work; the published head still points at the previous
          // complete generation until every source and snapshot is committed.
          for(let offset=0;offset<rows.length;offset+=50){
            await transaction(async db=>{for(let i=offset;i<Math.min(rows.length,offset+50);i++)await db.run('INSERT INTO offline_home_rows_v1 VALUES (?,?,?,?,?,?)',[...keys,generation,name,i,JSON.stringify({format:'source-entry-v1',sourceKey:rows[i][0],document:clean(rows[i][1])})]);});
            await new Promise(resolve=>setTimeout(resolve,0));
          }
        }
        await transaction(async db=>{
          await db.run('INSERT OR REPLACE INTO offline_home_head_v1 VALUES (?,?,?,?,?,?,?)',[...keys,scope.permissionRevision,generation,capturedAt,inputs.dashboardDayKey,JSON.stringify({schemaVersion:1,snapshot:clean(snapshot),availableSources:available})]);
          await db.run('DELETE FROM offline_home_rows_v1 WHERE tenant_id=? AND principal_id=? AND generation<>?',[...keys,generation]);
        });
        return {generation,capturedAt};
      };
      serial=Promise.resolve().then(async()=>{let result;while(queued){const next=queued;queued=null;result=await persist(next);}return result;}).finally(()=>{serial=null;queued=null;});
      return serial;
    },
    async productDetail(product){
      const result=await this.read({details:true});if(!result?.feedSeq)throw Error('Home sources not ready');
      const head={...scope,ready:true,generation:result.generation,seq:result.feedSeq,asOfDay:result.dayKey,sources:result.availableSources,counts:result.sourceCounts};
      const storage=await this.feed(),catalog=[],lines=[],selectedOrders=[],dispatches=[],requests=[];
      const {buildHomeProductDetail,buildProductDailyReportSeries}=await import('../services/executiveDashboardService.js');
      await storage.streamSource(head,'products',rows=>catalog.push(...rows));
      await storage.streamSource(head,'orders',rows=>{const detail=buildHomeProductDetail({orders:rows,products:catalog,product});lines.push(...detail.lines);const ids=new Set(detail.lines.map(line=>line.orderId));selectedOrders.push(...rows.filter(row=>ids.has(row.id)));});
      const dispatchIds=new Set(selectedOrders.flatMap(order=>[...(order.sourceDispatchIds||[]),...(order.items||order.lines||order.products||[]).flatMap(item=>item.sourceDispatchIds||[])]));
      await storage.streamSource(head,'warehouseDispatches',rows=>dispatches.push(...rows.filter(row=>dispatchIds.has(row.id))));
      const requestIds=new Set(dispatches.map(row=>row.sourceOrderRequestId).filter(Boolean));
      await storage.streamSource(head,'orderRequests',rows=>requests.push(...rows.filter(row=>requestIds.has(row.id))));
      const confirmed=await this.read({details:true});if(confirmed.feedSeq!==result.feedSeq||confirmed.generation!==result.generation||confirmed.dayKey!==result.dayKey||confirmed.capturedAt!==result.capturedAt)throw Error('Home changed while reading product detail; retry');
      const dailyRows=buildProductDailyReportSeries({orders:selectedOrders,products:catalog,profitability:result.snapshot.profitability,product,dateKeys:(result.snapshot.finance.series30Days||[]).map(row=>row.date)});
      const detailed=buildHomeProductDetail({orders:selectedOrders,products:catalog,product,orderRequests:requests,warehouseDispatches:dispatches});
      return {generation:result.generation,seq:result.feedSeq,productId:product.id,lines:detailed.lines,dailyRows};
    },
    async read({details=false}={}){
     // Validate the complete supported schema once per owner before publishing
     // any cached head, including when its SELECT would otherwise succeed.
     await ensureSchema();
     const load=()=>streamRead(async query=>{
      // A completed head is published atomically. This single SELECT needs no
      // write transaction/bridge BEGIN+COMMIT; permission brackets remain.
      const body=details?'snapshot_json':"COALESCE(json_extract(snapshot_json,'$.overview'),snapshot_json)";
      const row=(await query('SELECT generation,captured_at,day_key,'+body+' AS snapshot_json FROM offline_home_head_v1 WHERE tenant_id=? AND principal_id=? AND revision=?',[...keys,scope.permissionRevision]))[0];
      if(!row)return null;
      const payload=JSON.parse(row.snapshot_json);
      if(payload.kind==='warehouse-imports-pages-v2')return null; // Explicit module-only head is never a financial Home report.
      if((payload.sourceProfile||'legacy-v1')!==(sourceProfile||'legacy-v1'))throw Error('Stored Home source profile differs from signed session');
      if(!details)prepareOverview(payload,row);
      return {snapshot:payload.snapshot||payload,overviewVersion:payload.overviewVersion,periodReports:payload.periodReports,sourceProfile:payload.sourceProfile,reports:payload.reports,feedSeq:payload.feedSeq,deviceTimezoneOffset:payload.deviceTimezoneOffset,sourceCounts:payload.sourceCounts,availableSources:payload.availableSources||[],generation:row.generation,capturedAt:row.captured_at,dayKey:row.day_key,status:'LOCAL_COPY',pendingIncluded:false};
     });
     return load();
    },
    async page(source,{after=-1,limit=50}={}){await ensureSchema();return transaction(async db=>{
      if(![...HOME_SOURCES,...HOME_FEED_SOURCES,...NATIVE_HOME_SOURCES,...PAYROLL_FEED_ADDITIONS].includes(source)||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid local Home source page');
      const head=(await db.query("SELECT json_object('availableSources',json_extract(snapshot_json,'$.availableSources'),'feedGeneration',json_extract(snapshot_json,'$.feedGeneration'),'feedSeq',json_extract(snapshot_json,'$.feedSeq')) AS snapshot_json FROM offline_home_head_v1 WHERE tenant_id=? AND principal_id=? AND revision=?",[...keys,scope.permissionRevision]))[0];
      if(!head)return [];
      const payload=JSON.parse(head.snapshot_json);
      if(!payload.availableSources?.includes(source))throw Error('Home source not downloaded: '+source);
      if(payload.feedGeneration){
       const cp=(await db.query('SELECT applied_seq FROM offline_home_feed_checkpoint_v1 WHERE tenant_id=? AND principal_id=? AND revision=? AND generation=?',[...keys,scope.permissionRevision,payload.feedGeneration]))[0];
       if(cp?.applied_seq!==payload.feedSeq)throw Error('Home source is updating; use the completed report');
       if(after!==-1&&typeof after!=='string')throw Error('Home source requires an ID cursor');
       return (await db.query('SELECT id,body,seq FROM offline_home_feed_records_v1 WHERE tenant_id=? AND principal_id=? AND generation=? AND source=? AND id>? ORDER BY id LIMIT ?',[...keys,payload.feedGeneration,source,after===-1?'':after,limit])).map(row=>({id:row.id,sourceKey:row.id,document:JSON.parse(row.body),seq:row.seq,state:'SERVER_CONFIRMED'}));
      }
      if(!Number.isInteger(after)||after< -1)throw Error('Invalid legacy Home cursor');
      return db.query('SELECT r.ordinal,r.body FROM offline_home_rows_v1 r JOIN offline_home_head_v1 h ON h.tenant_id=r.tenant_id AND h.principal_id=r.principal_id AND h.generation=r.generation WHERE r.tenant_id=? AND r.principal_id=? AND h.revision=? AND r.source=? AND r.ordinal>? ORDER BY r.ordinal LIMIT ?',[...keys,scope.permissionRevision,source,after,limit]).then(rows=>rows.map(r=>{const body=JSON.parse(r.body);return {ordinal:r.ordinal,sourceKey:body.format==='source-entry-v1'?body.sourceKey:String(r.ordinal),document:body.format==='source-entry-v1'?body.document:body,state:'SERVER_SOURCE_COPY'};}));
    });},
  });
}
