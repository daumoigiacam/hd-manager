import {orderBusinessSortSql} from './businessDirectoryDateSql.js';
// Derived search inputs only. Feed records/checkpoints and signed grants remain
// authoritative. No connection, scheduler, listener or result cache. v2 dates
// use the shared original SQL expression only inside the existing feed owner.
export const BUSINESS_SEARCH_VERSION=1;
export const BUSINESS_SEARCH_FIELDS=Object.freeze(Object.fromEntries(Object.entries({
  orders:['code','orderCode','invoiceCode','paymentCode','customerName','customerPhone','branchName','customerBranchName','salesEmpName','note','notes'],
  payments:['customerName','orderCode','paymentCode','collectorName','note','sourceLabel'],
  expenses:['customerName','category','note','sourceLabel','assetName','assetPlate'],
  warehouseImports:['productName','supplierName','warehouseName','note'],
  warehouseDispatches:['customerName','customerNameSnapshot','productName','branchName','note'],
  warehouseStockCounts:['productName','warehouseName','note','reason'],
  deliveryReports:['customerNameSnapshot','productNameSnapshot','driverNameSnapshot','assignedDriverNameSnapshot','note'],
  employees:['name','displayName','employeeCode','code','phone','position','department'],
  attendance:['employeeName','status','workRole'],payrollPeriods:['monthKey','status','lockedByName'],
  payrollSnapshots:['monthKey','employeeName'],customers:['name','phone','address'],products:['name','code','sku'],
  advances:['reason'],
  orderRequests:['customerName','productName','branchName','note'],
}).map(([source,fields])=>[source,Object.freeze(fields)])));
export const BUSINESS_SEARCH_FOLDS=[];
for(let code=0xc0;code<=0x1eff;code++){
  const ch=String.fromCharCode(code),folded=ch.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(/^[a-zA-Z]$/.test(folded)&&ch!==folded)BUSINESS_SEARCH_FOLDS.push(Object.freeze([ch,folded]));
}
BUSINESS_SEARCH_FOLDS.push(Object.freeze(['đ','d']),Object.freeze(['Đ','D']));
for(let code=0x300;code<=0x36f;code++)BUSINESS_SEARCH_FOLDS.push(Object.freeze([String.fromCharCode(code),'']));
Object.freeze(BUSINESS_SEARCH_FOLDS);
const replacements=new Map(BUSINESS_SEARCH_FOLDS);
const pattern=new RegExp('['+BUSINESS_SEARCH_FOLDS.map(([ch])=>ch).join('')+']','gu');
export const normalizeBusinessSearch=text=>text.replace(pattern,ch=>replacements.get(ch)).replace(/[A-Z]/g,ch=>ch.toLowerCase());
const scalar=value=>value==null||(typeof value==='string'&&!value.includes('\0'));
const itemFields=['description','productName','productCode','sku'];
export function deriveBusinessSearch({tenantId,source,id,seq,document}){
  const fields=BUSINESS_SEARCH_FIELDS[source];if(!fields)return null;
  const strings=[id,...fields.map(field=>document?.[field])];
  let eligible=document?.companyId===tenantId&&document?.id===id&&Number.isSafeInteger(seq)&&seq>=0&&strings.every(scalar),items=[];
  const customerKey=source==='orders'?document?.customerId:null;
  if(source==='orders'&&!scalar(customerKey))eligible=false;
  if(source==='orders'||source==='orderRequests'){
    const raw=document?.items??document?.lines??document?.products??[];
    if(!Array.isArray(raw)||raw.length>1000)eligible=false;
    else for(const item of raw){
      if(!item||typeof item!=='object'||Array.isArray(item)||!itemFields.every(field=>scalar(item[field]))){eligible=false;break;}
      items.push(normalizeBusinessSearch(itemFields.map(field=>item[field]??'').join(' ')));
    }
  }
  let root=eligible?normalizeBusinessSearch(strings.map(value=>value??'').join(' ')):'';
  let itemsJson=eligible?JSON.stringify(items):'[]';
  // Oversize derived inputs are rejected as a whole, never truncated.
  if(root.length+itemsJson.length>262144){eligible=false;root='';itemsJson='[]';}
  let linked=source==='customers'&&document?.companyId===tenantId&&[document?.name,document?.phone].every(scalar);
  let linkedText=linked?normalizeBusinessSearch([document.name??'',document.phone??''].join(' ')):'';
  if(linkedText.length>262144){linked=false;linkedText='';}
  return {id,seq,eligible:eligible?1:0,root:eligible?root:'',customerKey:typeof customerKey==='string'?customerKey:null,
    linkedEligible:linked?1:0,linkedText,itemsJson:eligible?itemsJson:'[]'};
}
export const BUSINESS_SEARCH_SCHEMA=[
  `CREATE TABLE IF NOT EXISTS offline_business_search_v1 (tenant_id TEXT,principal_id TEXT,generation TEXT,source TEXT,id TEXT,seq INTEGER,version INTEGER,eligible INTEGER,root_text TEXT,customer_key TEXT,linked_eligible INTEGER,linked_text TEXT,items_json TEXT,PRIMARY KEY(tenant_id,principal_id,generation,source,id))`,
  `CREATE TABLE IF NOT EXISTS offline_business_search_coverage_v1 (tenant_id TEXT,principal_id TEXT,revision TEXT,generation TEXT,source TEXT,version INTEGER,target_seq INTEGER,after_id TEXT,complete INTEGER,PRIMARY KEY(tenant_id,principal_id,revision,generation,source,version))`,
];
export async function runSearchStatements(db,set){
  if(!set.length)return;
  if(typeof db.runSet==='function')await db.runSet(set);
  else for(const {statement,values=[]} of set)await db.run(statement,values);
}
export function businessSearchUpserts(feedRows){
  const rows=[];
  for(const [tenant,principal,generation,source,id,seq,body] of feedRows){
    if(!Object.hasOwn(BUSINESS_SEARCH_FIELDS,source))continue;
    let document;try{document=JSON.parse(body);}catch{document=null;}
    const projection=deriveBusinessSearch({tenantId:tenant,source,id,seq,document});
    // JSON1 duplicate-key and numeric/text serialization ambiguities stay on
    // the original SQL path; only canonical Home-feed JSON is projected.
    if(projection&&JSON.stringify(document)!==body){projection.eligible=0;projection.root='';projection.itemsJson='[]';projection.linkedEligible=0;projection.linkedText='';}
    if(projection)rows.push([tenant,principal,generation,source,id,seq,BUSINESS_SEARCH_VERSION,projection.eligible,projection.root,projection.customerKey,projection.linkedEligible,projection.linkedText,projection.itemsJson]);
  }
  const statements=[];
  for(let offset=0;offset<rows.length;offset+=50){const batch=rows.slice(offset,offset+50);
    statements.push({statement:'INSERT INTO offline_business_search_v1 VALUES '+batch.map(()=>'(?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',')+
      ' ON CONFLICT(tenant_id,principal_id,generation,source,id) DO UPDATE SET seq=excluded.seq,version=excluded.version,eligible=excluded.eligible,root_text=excluded.root_text,customer_key=excluded.customer_key,linked_eligible=excluded.linked_eligible,linked_text=excluded.linked_text,items_json=excluded.items_json WHERE excluded.seq>=offline_business_search_v1.seq',values:batch.flat()});
  }
  return statements;
}

// Additive companion of the SAME canonical projection, in the existing DB and
// feed transaction. v1 schema/rows remain intact for rollback/older readers.
// Created only by the existing Orders-demand backfill; never at startup.
export const ORDER_SEARCH_VERSION=2;
export const ORDER_SEARCH_TABLE='offline_business_search_order_v2';
export const ORDER_FEED_KEYS_INDEX='offline_home_feed_keys_seq_v2';
// SQLite maintains these source-scope expressions even for a legacy writer
// changing company/id without changing seq. They preserve the ORIGINAL live
// company/id predicate without parsing every source body on the read path.
export function orderFeedScopeSql(body='r.body',field='companyId'){
 if(!['companyId','id'].includes(field))throw new TypeError('Fixed feed scope field required');
 return `CASE WHEN json_valid(${body}) THEN json_extract(${body},'$.${field}') END`;
}
export const ORDER_SEARCH_SCHEMA=Object.freeze([
 `CREATE TABLE IF NOT EXISTS offline_business_search_order_v2 (tenant_id TEXT,principal_id TEXT,generation TEXT,source TEXT,id TEXT,seq INTEGER,version INTEGER,eligible INTEGER,scope_valid INTEGER,sort_key TEXT,customer_key TEXT,status TEXT,sales_emp_id TEXT,created_emp_id TEXT,emp_id TEXT,PRIMARY KEY(tenant_id,principal_id,generation,source,id))`,
 `CREATE INDEX IF NOT EXISTS offline_home_feed_keys_seq_v2 ON offline_home_feed_records_v1 (tenant_id,principal_id,generation,source,id,seq,${orderFeedScopeSql('body')},${orderFeedScopeSql('body','id')})`,
 `CREATE INDEX IF NOT EXISTS offline_business_order_sort_v2 ON offline_business_search_order_v2 (tenant_id,principal_id,generation,source,version,eligible,scope_valid,sort_key COLLATE BINARY DESC,id COLLATE BINARY DESC,seq,customer_key,status,sales_emp_id,created_emp_id,emp_id)`,
]);
export async function hasOrderSearchProjection(db){
 return (await db.query("SELECT name FROM sqlite_master WHERE type='table' AND name=?",[ORDER_SEARCH_TABLE])).length===1;
}
async function ensureOrderSearchProjection(db){
 const signature=sql=>sql.toLowerCase().replace(/\bif\s+not\s+exists\s+/g,'').replace(/\s+/g,'');
 const names=[ORDER_SEARCH_TABLE,ORDER_FEED_KEYS_INDEX,'offline_business_order_sort_v2'];
 const inspect=async()=>{
  const rows=await db.query('SELECT type,name,sql FROM sqlite_master WHERE name IN (?,?,?)',names);
  for(const row of rows){const index=names.indexOf(row.name);if(index<0||row.type!==(index?'index':'table')||signature(row.sql||'')!==signature(ORDER_SEARCH_SCHEMA[index]))throw Object.assign(Error('Unsupported Orders projection schema'),{code:'schema-incompatible'});}
  return rows.length===names.length;
 };
 if(await inspect())return;
 for(const statement of ORDER_SEARCH_SCHEMA)await db.run(statement);
 if(!await inspect())throw Object.assign(Error('Orders projection schema incomplete'),{code:'schema-incompatible'});
}
export function businessOrderSearchUpserts(feedRows){
 const input=[];
 for(const [tenant,principal,generation,source,id,seq,body]of feedRows){
  if(source!=='orders'&&source!=='customers')continue;
  let document;try{document=JSON.parse(body);}catch{document=null;}
  // All comparison fields retain their original NULL/string semantics. Typed
  // legacy values and noncanonical JSON are whole-row original-SQL fallback.
  const fields=source==='orders'?['customerId','status','salesEmpId','createdByEmpId','empId']:['empId'];
  const eligible=!!document&&JSON.stringify(document)===body&&Number.isSafeInteger(seq)&&seq>=0&&fields.every(field=>scalar(document[field]));
  input.push([tenant,principal,generation,source,id,seq,body,eligible?1:0]);
 }
 const set=[];
 for(let i=0;i<input.length;i+=16){const batch=input.slice(i,i+16);
  set.push({statement:`WITH input(tenant_id,principal_id,generation,source,id,seq,body,eligible) AS (VALUES ${batch.map(()=>'(?,?,?,?,?,?,?,?)').join(',')})
   INSERT INTO offline_business_search_order_v2
   SELECT r.tenant_id,r.principal_id,r.generation,r.source,r.id,r.seq,2,r.eligible,
    CASE WHEN r.eligible=1 AND json_extract(r.body,'$.companyId')=r.tenant_id AND (r.source='customers' OR json_extract(r.body,'$.id')=r.id) THEN 1 ELSE 0 END,
    CASE WHEN r.eligible=1 AND r.source='orders' THEN ${orderBusinessSortSql()} ELSE '' END,
    CASE WHEN r.eligible=1 THEN json_extract(r.body,'$.customerId') END,
    CASE WHEN r.eligible=1 THEN json_extract(r.body,'$.status') END,
    CASE WHEN r.eligible=1 THEN json_extract(r.body,'$.salesEmpId') END,
    CASE WHEN r.eligible=1 THEN json_extract(r.body,'$.createdByEmpId') END,
    CASE WHEN r.eligible=1 THEN json_extract(r.body,'$.empId') END FROM input r WHERE 1
   ON CONFLICT(tenant_id,principal_id,generation,source,id) DO UPDATE SET seq=excluded.seq,version=excluded.version,
    eligible=excluded.eligible,scope_valid=excluded.scope_valid,sort_key=excluded.sort_key,customer_key=excluded.customer_key,
    status=excluded.status,sales_emp_id=excluded.sales_emp_id,created_emp_id=excluded.created_emp_id,emp_id=excluded.emp_id
   WHERE excluded.seq>=offline_business_search_order_v2.seq`,values:batch.flat()});
 }
 return set;
}
export async function publishOrderSearchCoverage(db,{keys,scope,head},source=null){
 const complete=[];
 for(const name of source?[source]:['customers','orders']){
  if(!head.sources.includes(name))continue;
  const [row]=await db.query(`SELECT COUNT(*) AS n,COUNT(p.id) AS projected FROM offline_home_feed_records_v1 r INDEXED BY offline_home_feed_keys_seq_v2
   LEFT JOIN offline_business_search_order_v2 p ON p.tenant_id=r.tenant_id AND p.principal_id=r.principal_id AND p.generation=r.generation
    AND p.source=r.source AND p.id=r.id AND p.seq=r.seq AND p.version=2
   WHERE r.tenant_id=? AND r.principal_id=? AND r.generation=? AND r.source=? AND r.seq<=?`,[...keys,head.generation,name,head.seq]);
  if(row.n!==head.counts[name]||row.projected!==head.counts[name])continue;
  await db.run('INSERT OR REPLACE INTO offline_business_search_coverage_v1 VALUES (?,?,?,?,?,?,?,?,1)',[...keys,scope.permissionRevision,head.generation,name,2,head.seq,'']);complete.push(name);
 }
 return complete;
}
export async function backfillOrderSearchPage(db,{keys,scope,head,limit,check}){
 check();await ensureOrderSearchProjection(db);check();
 // Date rows first: search already has canonical v1 customer linkage with a
 // live company/PK/seq proof. Employee filters fall back until customer v2 is
 // available. One existing bounded batch, never a second scheduler.
 for(const source of ['orders','customers']){
  if(!head.sources.includes(source)||!Number.isSafeInteger(head.counts[source]))throw Object.assign(Error('Orders projection source missing'),{code:'source-unavailable'});
  const values=[...keys,scope.permissionRevision,head.generation,source,2];
  const [progress]=await db.query('SELECT target_seq,after_id,complete FROM offline_business_search_coverage_v1 WHERE tenant_id=? AND principal_id=? AND revision=? AND generation=? AND source=? AND version=?',values);check();
  if(progress?.target_seq===head.seq&&progress.complete===1)continue;
  // Global Home seq also advances for unrelated modules. Resume by exact live
  // keys/seq, not a global target cursor: valid rows are NEVER reparsed merely
  // because dispatch/expense changed, including during an incomplete migration.
  const rows=await db.query(`WITH missing AS MATERIALIZED (SELECT r.id,r.seq FROM offline_home_feed_records_v1 r INDEXED BY offline_home_feed_keys_seq_v2
   WHERE r.tenant_id=?1 AND r.principal_id=?2 AND r.generation=?3 AND r.source=?4 AND r.seq<=?5
    AND NOT EXISTS (SELECT 1 FROM offline_business_search_order_v2 p WHERE p.tenant_id=r.tenant_id AND p.principal_id=r.principal_id
     AND p.generation=r.generation AND p.source=r.source AND p.id=r.id AND p.seq=r.seq AND p.version=2) ORDER BY r.id LIMIT ?6)
   SELECT r.id,r.seq,r.body FROM missing m CROSS JOIN offline_home_feed_records_v1 r
    WHERE r.tenant_id=?1 AND r.principal_id=?2 AND r.generation=?3 AND r.source=?4 AND r.id=m.id AND r.seq=m.seq ORDER BY r.id`,[...keys,head.generation,source,head.seq,limit]);check();
  const feedRows=rows.map(row=>[...keys,head.generation,source,row.id,row.seq,row.body]);
  await runSearchStatements(db,[...businessSearchUpserts(feedRows),...businessOrderSearchUpserts(feedRows),
   {statement:'INSERT OR REPLACE INTO offline_business_search_coverage_v1 VALUES (?,?,?,?,?,?,?,?,0)',values:[...values,head.seq,rows.at(-1)?.id??'']}]);check();
  const complete=rows.length<limit&&(await publishOrderSearchCoverage(db,{keys,scope,head},source)).includes(source);check();
  if(rows.length<limit&&!complete)throw Object.assign(Error('Orders projection coverage changed'),{code:'stale-checkpoint'});
  if(rows.length)return {source:'orders',processed:rows.length,complete:source==='customers'&&complete,generation:head.generation,seq:head.seq,version:2};
 }
 return {source:'orders',processed:0,complete:true,generation:head.generation,seq:head.seq,version:2};
}
