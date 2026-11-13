// Permission-scoped adapter for existing screens over the SAME encrypted
// SQLite owner. Only server-confirmed read projections live here, never money
// mutations, business totals, sessions, an Outbox or a second connection.
import {SCOPED_BUSINESS_SOURCES as specs,scopedSources,scopedQuery,scopedSearch} from './scopedBusinessContract.js';
import {businessDayKey} from '../utils/businessDate.js';
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function createScopedBusinessReadSource({database,session,authorize,digest,transport,online,foreground,onFatal,onChange=()=>{}}){
 const scope=Object.freeze({...session.scope}),keys=[scope.tenantId,scope.principalId,scope.permissionRevision];
 let closed=false,controller=null,tail=Promise.resolve(),ready=false,wanted='',activeKey='',lastPlan=null,lastError='';const pending=new Map();
 const current=()=>{if(closed||!session.isCurrent(scope))fail('permission-denied','Module session closed');};
 async function access(source){current();const g=await authorize({scope,kind:'app.session'});current();if(Object.entries(scope).some(([k,v])=>g[k]!==v)||Date.now()>=g.expiresAtMs||g.capabilities.includes('home.read')||source&&!g.capabilities.includes(specs[source]?.cap))fail('permission-denied','Module permission changed');return g;}
 const grant=await access(),sources=scopedSources(grant.capabilities),generation='sm_'+await digest(JSON.stringify(scope));
 const transaction=work=>foreground.run(()=>database.transaction(async db=>{await access();const result=await work(db);await access();return result;}));
 await transaction(async db=>{
  await db.run('CREATE TABLE IF NOT EXISTS offline_module_rows_v1 (tenant_id TEXT,principal_id TEXT,revision TEXT,source TEXT,id TEXT,body TEXT,date_key TEXT,status TEXT,search_text TEXT,employee_keys TEXT,customer_id TEXT,version TEXT,captured_at INTEGER,server_updated_at INTEGER,PRIMARY KEY(tenant_id,principal_id,revision,source,id))');
  await db.run('CREATE INDEX IF NOT EXISTS offline_module_directory_v1 ON offline_module_rows_v1(tenant_id,principal_id,revision,source,date_key DESC,id DESC)');
  await db.run('CREATE TABLE IF NOT EXISTS offline_module_pages_v1 (tenant_id TEXT,principal_id TEXT,revision TEXT,query_key TEXT,payload TEXT,captured_at INTEGER,PRIMARY KEY(tenant_id,principal_id,revision,query_key))');
  await db.run('CREATE TABLE IF NOT EXISTS offline_module_scope_v1 (tenant_id TEXT,principal_id TEXT,revision TEXT,seq INTEGER,captured_at INTEGER,PRIMARY KEY(tenant_id,principal_id,revision))');
  await db.run('INSERT OR IGNORE INTO offline_module_scope_v1 VALUES (?,?,?,?,?)',[...keys,0,Date.now()]);
 });
 const metadata=(source,head,mode)=>({source,serverConfirmedOnly:true,financialCalculationAllowed:false,projection:'bounded-directory-scalars-v1',timeZone:'Asia/Ho_Chi_Minh',coverage:{mode,completeSource:false,allHomeSourcesComplete:false,serverOrder:'document-id-desc'},checkpoint:{...scope,generation,seq:head.seq,capturedAt:head.captured_at,dayKey:businessDayKey(head.captured_at),sourceProfile:'legacy-v1'}});
 const row=r=>({id:r.id,document:JSON.parse(r.body),businessDate:r.date_key||null,state:'SERVER_CONFIRMED'});
 const key=(source,q,ids)=>JSON.stringify([source,q,ids||null]);
 async function stored(plan){return transaction(async db=>{
  const [head]=await db.query('SELECT seq,captured_at FROM offline_module_scope_v1 WHERE tenant_id=? AND principal_id=? AND revision=?',keys),results=[];
  for(const p of plan){await access(p.source);const q=scopedQuery(p.options),[page]=p.ids?[]:await db.query('SELECT payload,captured_at FROM offline_module_pages_v1 WHERE tenant_id=? AND principal_id=? AND revision=? AND query_key=?',[...keys,key(p.source,q)]);
   if(p.options?.checkpoint&&!same(p.options.checkpoint,metadata(p.source,head,'stored').checkpoint))fail('stale-checkpoint','Stored module snapshot changed; reload the page');
   if(page){const saved=JSON.parse(page.payload);const rows=saved.ids.length?await db.query('SELECT * FROM offline_module_rows_v1 WHERE tenant_id=? AND principal_id=? AND revision=? AND source=? AND id IN ('+saved.ids.map(()=>'?').join(',')+')',[...keys,p.source,...saved.ids]):[];const found=new Map(rows.map(r=>[r.id,r]));if(saved.ids.every(id=>found.has(id))){results.push({items:saved.ids.map(id=>row(found.get(id))),hasMore:saved.hasMore,nextCursor:saved.nextCursor,metadata:metadata(p.source,head,'cached-server-page'),cachedAt:page.captured_at});continue;}}
   let localCursor=null;if(q.cursor&&!p.ids){try{const c=JSON.parse(q.cursor);if(c.local===true&&c.generation===generation&&c.key===await digest(key(p.source,{...q,cursor:null})))localCursor=c;}catch{}if(!localCursor){if(!online())fail('offline-page-unavailable','This server page has not been stored');results.push({items:[],hasMore:false,nextCursor:null,metadata:metadata(p.source,head,'not-stored'),cachedAt:null});continue;}}
   const where=['tenant_id=?','principal_id=?','revision=?','source=?'],params=[...keys,p.source];
   if(p.ids){if(!p.ids.length||p.ids.length>25)fail('invalid-argument','Invalid exact record lookup');where.push('id IN ('+p.ids.map(()=>'?').join(',')+')');params.push(...p.ids);}else{
    where.push("COALESCE(json_extract(body,'$.isArchived'),0)<>1");
    for(const token of scopedSearch({q:q.text}).split(' ').filter(Boolean)){where.push('instr(search_text,?)>0');params.push(token);}
    if(q.from){where.push('date_key>=?');params.push(q.from);}if(q.to){where.push('date_key<?');params.push(q.to);}if(q.monthKey){where.push('substr(date_key,1,7)=?');params.push(q.monthKey);}
    if(q.customerId){where.push('customer_id=?');params.push(q.customerId);}if(q.employeeId){where.push('EXISTS (SELECT 1 FROM json_each(employee_keys) WHERE value=?)');params.push(q.employeeId);}if(q.status){where.push('status=?');params.push(q.status);}
    if(localCursor){if(!Array.isArray(localCursor.after)||localCursor.after.length!==2)fail('invalid-argument','Invalid stored cursor');where.push('(COALESCE(date_key,\'\'),id)<(?,?)');params.push(...localCursor.after);}
   }
   const rows=await db.query('SELECT * FROM offline_module_rows_v1 WHERE '+where.join(' AND ')+' ORDER BY date_key DESC,id DESC LIMIT ?',[...params,q.limit+1]);
   const hasMore=rows.length>q.limit,last=rows[q.limit-1];results.push({items:rows.slice(0,q.limit).map(row),hasMore,nextCursor:hasMore?JSON.stringify({local:true,generation,key:await digest(key(p.source,{...q,cursor:null})),after:[last.date_key||'',last.id]}):null,metadata:metadata(p.source,head,'stored-coverage-only'),cachedAt:localCursor?Date.now():null});
  }
  return results;
 });}
 async function remote(plan){
  current();if(!online())return false;for(const p of plan)await access(p.source);
  controller=new AbortController();const timer=setTimeout(()=>controller?.abort(),15000);
  try{const response=await transport.businessSource({plan},controller.signal,scope);current();if(!same(response.scope,scope)||response.financialCalculationAllowed!==false||response.allHomeSourcesComplete!==false||response.results.length!==plan.length)fail('invalid-data','Invalid scoped module page');
   let published=false;await transaction(async db=>{let changed=false;
    for(let i=0;i<plan.length;i++){
     const result=response.results[i],p=plan[i],q=scopedQuery(p.options);await access(p.source);
     if(result.source!==p.source||result.key!==await digest(JSON.stringify([scope,p.source,{...q,cursor:null}]))||!same(result.query,q)||!Array.isArray(result.items)||result.items.length>q.limit||result.scanned>100||typeof result.hasMore!=='boolean'||result.hasMore&&typeof result.nextCursor!=='string'||!result.hasMore&&result.nextCursor!==null)fail('invalid-data','Invalid bounded module result');
     const ids=[];let bytes=0;for(const item of result.items){
      if(item.document?.id!==item.id||item.document.companyId!==scope.tenantId||ids.includes(item.id)||!/^[a-f0-9]{64}$/.test(item.version)||!Number.isSafeInteger(item.serverUpdatedAt))fail('invalid-data','Module row scope mismatch');
      const [old]=await db.query('SELECT version,server_updated_at FROM offline_module_rows_v1 WHERE tenant_id=? AND principal_id=? AND revision=? AND source=? AND id=?',[...keys,p.source,item.id]);if(!old||old.version!==item.version&&old.server_updated_at<=item.serverUpdatedAt)changed=true;
      const body=JSON.stringify(item.document);bytes+=new TextEncoder().encode(body).length;if(bytes>500000)fail('invalid-data','Unbounded module payload');ids.push(item.id);
      await db.run('INSERT INTO offline_module_rows_v1 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,principal_id,revision,source,id) DO UPDATE SET body=excluded.body,date_key=excluded.date_key,status=excluded.status,search_text=excluded.search_text,employee_keys=excluded.employee_keys,customer_id=excluded.customer_id,version=excluded.version,captured_at=excluded.captured_at,server_updated_at=excluded.server_updated_at WHERE excluded.server_updated_at>=offline_module_rows_v1.server_updated_at',[...keys,p.source,item.id,body,item.businessDate,item.approval,item.search,JSON.stringify(item.employeeKeys),item.document.customerId||null,item.version,item.capturedAt,item.serverUpdatedAt]);
     }
     if(!p.ids){const payload=JSON.stringify({ids,hasMore:result.hasMore,nextCursor:result.nextCursor});const [old]=await db.query('SELECT payload FROM offline_module_pages_v1 WHERE tenant_id=? AND principal_id=? AND revision=? AND query_key=?',[...keys,key(p.source,q)]);if(old?.payload!==payload)published=true;await db.run('INSERT OR REPLACE INTO offline_module_pages_v1 VALUES (?,?,?,?,?,?)',[...keys,key(p.source,q),payload,Date.now()]);}
    }
    if(changed){published=true;await db.run('UPDATE offline_module_scope_v1 SET seq=seq+1,captured_at=? WHERE tenant_id=? AND principal_id=? AND revision=?',[Date.now(),...keys]);}
    // Bounded page envelopes only. Server-confirmed rows and ALL existing
    // business/Outbox tables are retained; other predicates can query stored rows.
    await db.run('DELETE FROM offline_module_pages_v1 WHERE tenant_id=? AND principal_id=? AND revision=? AND query_key NOT IN (SELECT query_key FROM offline_module_pages_v1 WHERE tenant_id=? AND principal_id=? AND revision=? ORDER BY captured_at DESC,query_key LIMIT 32)',[...keys,...keys]);
   });lastError='';if(published&&!closed)onChange('home');return true;
  }catch(error){if(['permission-denied','unauthenticated'].includes(error.code)){await onFatal();}throw error;}
  finally{clearTimeout(timer);controller=null;}
 }
 const enqueue=plan=>{const requestKey=JSON.stringify(plan);wanted=requestKey;if(pending.has(requestKey))return pending.get(requestKey);if(controller&&activeKey!==requestKey)controller.abort();const work=tail.then(()=>{if(closed||wanted!==requestKey)return false;activeKey=requestKey;return remote(plan);});pending.set(requestKey,work);tail=work.catch(error=>{lastError=error.code||error.name||'unavailable';}).finally(()=>{pending.delete(requestKey);});return work;};
 async function pages(plan){for(const p of plan)await access(p.source);lastPlan=plan;const result=await stored(plan);if(online()&&result.some(r=>r.cachedAt===null||Date.now()-r.cachedAt>30000))void enqueue(plan).catch(()=>{});return result.map(({cachedAt,...r})=>r);}
 const sourceMetadata=Object.fromEntries(sources.map(source=>[source,{capability:specs[source].cap,requiredCapabilities:[specs[source].cap],statusFilter:['payments','expenses'].includes(source)?'cashflow-approval-v1':'raw-status'}]));
 const directory=Object.freeze({sourceScope:'module-pages-v1',sources:Object.freeze(sourceMetadata),readSources:Object.freeze(sources),
  verifyAccess:async source=>{await access(source);return true;},
  async page(source,options={}){return (await pages([{source,options}]))[0];},
  async pageBatch(plan){if(!Array.isArray(plan)||plan.length>2)fail('invalid-argument','Unbounded module batch');return pages(plan);},
  async lookup(source,ids,options={}){await access(source);let [result]=await stored([{source,ids,options:{...options,limit:25}}]);if(result.items.length!==ids.length&&online()){await enqueue([{source,ids,options:{limit:25}}]);[result]=await stored([{source,ids,options:{limit:25}}]);}return result;},
  async detail(source,id,{checkpoint,cursor=null,limit=25}={}){const result=await this.lookup(source,[id],{checkpoint});const document=result.items[0]?.document;if(!document)return {document:null,items:[],hasMore:false,nextCursor:null,metadata:result.metadata};const all=document.items||document.lines||document.products||[document],start=cursor?Number(cursor):0;return {document,items:all.slice(start,start+limit).map((document,i)=>({ordinal:start+i,document})),measures:{},hasMore:start+limit<all.length,nextCursor:start+limit<all.length?String(start+limit):null,metadata:{...result.metadata,projection:'warehouse-stored-detail-v1'}};},
 });
 const orderProduct=Object.freeze({async detail(id){const result=await directory.lookup('orders',[id]);const body=result.items[0]?.document;if(!body)fail('source-unavailable','Đơn hàng chưa có trong dữ liệu được cấp');return {id:body.id,code:String(body.code||body.orderCode||body.id),date:body.date||'',customerId:body.customerId,customerName:body.customerName||'',amount:[body.amount,body.totalAmount,body.grandTotal,body.total].find(v=>typeof v==='number')??null,note:body.note||'',archived:body.isArchived===true,checkpoint:result.metadata.checkpoint,localSyncState:'SERVER_CONFIRMED',mutation:{protocolReady:false},items:(body.items||[]).map(line=>({productId:line.productId,name:line.productNameSnapshot||line.productName||line.description,quantity:line.actualQuantity??line.quantity,unit:line.orderedUnit||line.orderUnit||line.actualUnit,billingQuantity:line.billingQuantity??line.pricingQuantity,billingUnit:line.billingUnit||line.pricingUnit,unitPrice:line.unitPrice,amount:line.lineTotal??line.amount}))};},async ledger(){return {status:'withheld',reason:'Phiên này chỉ được cấp dữ liệu đơn hàng, chưa có nguồn công nợ đầy đủ.'};}});
 ready=true;return Object.freeze({directory:()=>directory,orderProduct,sources,async sync(){if(lastPlan&&online())await enqueue(lastPlan);else await tail;},close(){closed=true;controller?.abort();return tail;},inspect:()=>({ready,closed,sources,connectionOwned:false,listeners:0,pending:pending.size,lastError})});
}
