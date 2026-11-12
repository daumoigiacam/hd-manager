import {createOfflineCommandRepository} from './offlineCommandRepository.js';
import {offlineCustomerQuery} from './offlineCustomerQuery.js';
import {searchMark} from './crmSearchTrace.js';
import {startupSpan} from '../services/offlineStartupTrace.js';
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().trim();
const profileKeys=new Set(['name','phone','address','customerHonorific','note','notes','customerGroup','zaloContact','zaloGroupLink','location','locationUrl','locationInput','locationLat','locationLng','mapLocation','locationUpdatedAt','locationSource','isArchived','archivedAt','updatedAt']);
// Additive development tables: existing commands/outbox remain untouched.
export async function createOfflineCustomerRepository(options){
 const {database,session,authorize}=options,scope=session.scope,keys=[scope.tenantId,scope.principalId];
 const optionsHistory=()=>options.historyProvider?.();
 const current=()=>{if(!session.isCurrent())throw Object.assign(new Error('Customer session closed'),{code:'permission-denied'});};
 const statements=[
  'CREATE TABLE IF NOT EXISTS offline_customer_delta (tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,checkpoint_json TEXT NOT NULL,PRIMARY KEY(tenant_id,principal_id))',
  'CREATE TABLE IF NOT EXISTS offline_customer_sync_seen (tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,snapshot_id TEXT NOT NULL,id TEXT NOT NULL,PRIMARY KEY(tenant_id,principal_id,snapshot_id,id))',
  `CREATE TABLE IF NOT EXISTS offline_customer_conflicts (tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,id TEXT NOT NULL,command_id TEXT NOT NULL,receipt_json TEXT NOT NULL,PRIMARY KEY(tenant_id,principal_id,id))`,
  `CREATE TABLE IF NOT EXISTS offline_customer_cursors (tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,after_id TEXT NOT NULL,has_more INTEGER NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(tenant_id,principal_id))`,
  `CREATE TABLE IF NOT EXISTS offline_customers (
   tenant_id TEXT NOT NULL, principal_id TEXT NOT NULL, id TEXT NOT NULL,
   local_json TEXT NOT NULL, server_json TEXT, server_fingerprint TEXT,
   last_command_id TEXT, state TEXT NOT NULL, search_key TEXT NOT NULL,
   PRIMARY KEY(tenant_id,principal_id,id))`];
 const normalizeSchema=sql=>sql.replace(/IF NOT EXISTS/gi,'').replace(/\s+/g,' ').trim().toLowerCase();
 const savedSchema=database.metadata?.customerSchema;
 const verifiedTables=Boolean(savedSchema)&&statements.every(sql=>{
  const name=sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)?.[1];
  return typeof savedSchema[name]==='string'&&normalizeSchema(savedSchema[name])===normalizeSchema(sql);
 });
 // Existing schema was read in the already-required native configuration query.
 // Skip only an EXACT normalized SQL match; first install/legacy adapters keep
 // their original atomic additive DDL. No table, row, index or schema is changed.
 if(!verifiedTables)await database.transaction(async db=>{
  current();
  // Same transactional DDL, one native round trip. Non-native adapters retain
  // their original statement-by-statement implementation.
  if(db.execute)await db.execute(statements.join(';\n')+';');else for(const statement of statements)await db.run(statement);
  current();
 });
 startupSpan('sqlite.customer-schema-ready')({verifiedExistingTables:verifiedTables});
 const transaction=(work,metadata)=>database.transaction(async db=>{current();const r=await work(db);current();return r;},metadata);
 const getRow=(db,id)=>db.query('SELECT * FROM offline_customers WHERE tenant_id=? AND principal_id=? AND id=?',[...keys,id]);
 const commands=createOfflineCommandRepository({...options,
  async onStateChange(db,{commandId,state}){
   // Publish lease/retry failures in the same transaction as the Outbox state.
   // An older command must never replace the state of a newer local edit.
   await db.run('UPDATE offline_customers SET state=? WHERE tenant_id=? AND principal_id=? AND last_command_id=?',[state,...keys,commandId]);
  },
  async onEnqueue(db,command){
   const row=(await getRow(db,command.entityId))[0];
   let local;
   if(command.kind==='customer.create'){
    if(row)throw new Error('Customer ID already exists locally');
    local=command.payload;
   }else{
    if(!row)throw new Error('Customer missing locally');
    if(['CONFLICT_REQUIRES_REVIEW','SYNC_FAILED'].includes(row.state)){
     const conflict=(await db.query('SELECT command_id,receipt_json FROM offline_customer_conflicts WHERE tenant_id=? AND principal_id=? AND id=?',[...keys,command.entityId]))[0];
     if(!conflict||command.payload.resolvesConflictId!==conflict.command_id||command.payload.baseFingerprint!==JSON.parse(conflict.receipt_json).currentFingerprint)throw new Error('Resolve customer conflict before editing');
    }
    const expected=row.last_command_id;
    if(!command.payload.resolvesConflictId&&command.payload.baseCommandId!==expected)throw new Error('Customer changed during local save');
    local={...JSON.parse(row.local_json),...command.payload.patch};
   }
   await db.run(`INSERT INTO offline_customers VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(tenant_id,principal_id,id) DO UPDATE SET local_json=excluded.local_json,last_command_id=excluded.last_command_id,state=excluded.state,search_key=excluded.search_key`,
    [...keys,command.entityId,JSON.stringify(local),row?.server_json||null,row?.server_fingerprint||null,command.commandId,'PENDING_SYNC',normalize([local.name,local.phone,local.address].join(' '))]);
  },
  async onReceipt(db,{commandId,entityId,state,receipt}){
   const row=(await getRow(db,entityId))[0];if(!row)throw new Error('Missing local customer projection');
   if(receipt.outcome==='accepted'){
    if(!receipt.document||!receipt.fingerprint)throw new Error('Customer acknowledgement missing document');
    const latest=row.last_command_id===commandId;
    const local=latest?receipt.document:JSON.parse(row.local_json);
    await db.run('UPDATE offline_customers SET server_json=?,server_fingerprint=?,local_json=?,state=?,search_key=? WHERE tenant_id=? AND principal_id=? AND id=?',
     [JSON.stringify(receipt.document),receipt.fingerprint,JSON.stringify(local),latest?'SYNCED':row.state,normalize([local.name,local.phone,local.address].join(' ')),...keys,entityId]);
   }else{
    await db.run('UPDATE offline_customers SET state=? WHERE tenant_id=? AND principal_id=? AND id=?',[state,...keys,entityId]);
    if(receipt.outcome==='conflict')await db.run(`INSERT INTO offline_customer_conflicts VALUES (?,?,?,?,?) ON CONFLICT(tenant_id,principal_id,id) DO UPDATE SET command_id=excluded.command_id,receipt_json=excluded.receipt_json`,[...keys,entityId,commandId,JSON.stringify(receipt)]);
   }
   if(options.beforeReceiptCommit)await options.beforeReceiptCommit(db,{commandId,entityId,state});
  },
 });
 async function mutate(id,patch,archive=false){
  current();
  if(!patch||Object.keys(patch).some(k=>!profileKeys.has(k)))throw new Error('Profile patch requires separate online workflow');
  const row=await transaction(async db=>(await getRow(db,id))[0]);if(!row)throw new Error('Customer not found');
  const dependencies=row.last_command_id?[row.last_command_id]:[];
  return commands.enqueue({kind:archive?'customer.archive':'customer.update',entityId:id,baseRevision:0,
   payload:{baseCommandId:row.last_command_id,baseFingerprint:row.server_fingerprint,patch},dependencies});
 }
 return Object.freeze({...commands,
  async conflict(id){
   await authorize({scope,kind:'customer.read',now:Date.now()});
   return transaction(async db=>{const row=(await db.query('SELECT receipt_json FROM offline_customer_conflicts WHERE tenant_id=? AND principal_id=? AND id=?',[...keys,id]))[0];return row?JSON.parse(row.receipt_json):null;});
  },
  async resolveConflict(id,patch){
   if(!patch||Object.keys(patch).some(k=>!profileKeys.has(k)))throw new Error('Invalid conflict resolution patch');
   const receipt=await this.conflict(id);
   if(!receipt?.currentFingerprint)throw new Error('Reload server customer before resolving missing record');
   // Original conflict and immutable command remain in history. The explicit
   // user decision is a NEW command; a later server edit can conflict again.
   return commands.enqueue({kind:'customer.update',entityId:id,baseRevision:0,payload:{baseCommandId:null,baseFingerprint:receipt.currentFingerprint,resolvesConflictId:receipt.commandId,patch}});
  },
  async serverCursor(){await authorize({scope,kind:'customer.read',now:Date.now()});return transaction(async db=>{const row=(await db.query('SELECT after_id,has_more,updated_at FROM offline_customer_cursors WHERE tenant_id=? AND principal_id=?',keys))[0];return row?{after:row.after_id,hasMore:Boolean(row.has_more),updatedAt:row.updated_at}:{after:'',hasMore:true,updatedAt:null};});},
  async syncCheckpoint(){
   await authorize({scope,kind:'customer.read'});
   const sql='SELECT checkpoint_json FROM offline_customer_delta WHERE tenant_id=? AND principal_id=?';
   const rows=database.readQuery?await database.readQuery(sql,keys):await transaction(db=>db.query(sql,keys));
   return rows[0]?JSON.parse(rows[0].checkpoint_json):null;
  },
  async countRetryable(){
   current();const sql="SELECT COUNT(*) AS n FROM local_commands WHERE tenant_id=? AND principal_id=? AND state IN ('PENDING_SYNC','SYNCING')";
   const rows=database.readQuery?await database.readQuery(sql,keys):await transaction(db=>db.query(sql,keys));return rows[0].n;
  },
  async ingestPage(records,cursor,checkpoint=null,deletes=[]){
   await authorize({scope,kind:'customer.read'});
   if(!Array.isArray(records)||records.length>100||!Array.isArray(deletes)||deletes.length>100)throw new Error('Invalid server customer page');
   if(cursor&&(typeof cursor.after!=='string'||typeof cursor.hasMore!=='boolean'))throw new Error('Invalid customer cursor');
   if(checkpoint&&(!checkpoint.generation||!['snapshot','delta'].includes(checkpoint.phase)||!Number.isSafeInteger(checkpoint.seq)))throw Error('Invalid customer checkpoint');
   let changed=0;
   await transaction(async db=>{
    const ids=records.map(r=>r.document?.id);
    if(ids.some(id=>typeof id!=='string'||!id||id.includes('/'))||deletes.some(id=>typeof id!=='string'||!id||id.includes('/')))throw Error('Invalid customer identity');
    const existingRows=ids.length?await db.query('SELECT * FROM offline_customers WHERE tenant_id=? AND principal_id=? AND id IN ('+ids.map(()=>'?').join(',')+')',[...keys,...ids]):[];
    const previous=new Map(existingRows.map(row=>[row.id,row])),set=[];
    for(const item of records){
     const document=item.document;if(document.companyId!==scope.tenantId||typeof item.fingerprint!=='string')throw Error('Server customer scope mismatch');
     const existing=previous.get(document.id);
     if(checkpoint?.snapshotId)set.push({statement:'INSERT OR IGNORE INTO offline_customer_sync_seen VALUES (?,?,?,?)',values:[...keys,checkpoint.snapshotId,document.id]});
     if(existing&&(existing.state!=='SYNCED'||existing.server_fingerprint===item.fingerprint))continue;
     changed++;
     set.push({statement:"INSERT INTO offline_customers VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,principal_id,id) DO UPDATE SET local_json=excluded.local_json,server_json=excluded.server_json,server_fingerprint=excluded.server_fingerprint,last_command_id=NULL,state='SYNCED',search_key=excluded.search_key",values:[...keys,document.id,JSON.stringify(document),JSON.stringify(document),item.fingerprint,null,'SYNCED',normalize([document.name,document.phone,document.address].join(' '))]});
    }
    for(const id of deletes){set.push({statement:"DELETE FROM offline_customers WHERE tenant_id=? AND principal_id=? AND id=? AND state='SYNCED'",values:[...keys,id]});changed++;}
    if(checkpoint?.finishSnapshot){
     set.push({statement:"DELETE FROM offline_customers WHERE tenant_id=? AND principal_id=? AND state='SYNCED' AND id NOT IN (SELECT id FROM offline_customer_sync_seen WHERE tenant_id=? AND principal_id=? AND snapshot_id=?)",values:[...keys,...keys,checkpoint.snapshotId]});
     set.push({statement:'DELETE FROM offline_customer_sync_seen WHERE tenant_id=? AND principal_id=?',values:keys});
     changed++;
    }
    if(cursor)set.push({statement:'INSERT INTO offline_customer_cursors VALUES (?,?,?,?,?) ON CONFLICT(tenant_id,principal_id) DO UPDATE SET after_id=excluded.after_id,has_more=excluded.has_more,updated_at=excluded.updated_at',values:[...keys,cursor.after,cursor.hasMore?1:0,Date.now()]});
    if(checkpoint){const persisted={...checkpoint};delete persisted.finishSnapshot;if(persisted.phase==='delta')delete persisted.snapshotId;set.push({statement:'INSERT INTO offline_customer_delta VALUES (?,?,?) ON CONFLICT(tenant_id,principal_id) DO UPDATE SET checkpoint_json=excluded.checkpoint_json',values:[...keys,JSON.stringify(persisted)]});}
    if(set.length){if(db.runSet)await db.runSet(set);else for(const item of set)await db.run(item.statement,item.values);}
   });return changed;
  },
  async create(customer){
   if(customer.companyId!==scope.tenantId||!customer.id||!customer.name?.trim()||!customer.phone?.trim())throw new Error('Invalid customer');
   if(['account','password','openingDebt','initialDebt','debtBalance','balance'].some(k=>Object.hasOwn(customer,k)))throw new Error('Sensitive fields require separate workflow');
   return commands.enqueue({kind:'customer.create',entityId:customer.id,baseRevision:0,payload:customer});
  },
  update:(id,patch)=>mutate(id,patch),
  archive:(id,at)=>mutate(id,{isArchived:true,archivedAt:at},true),
  async detail(id){await authorize({scope,kind:'customer.read',now:Date.now()});return transaction(async db=>{const r=(await getRow(db,id))[0];return r?{...JSON.parse(r.local_json),localSyncState:r.state}:null;});},
  async managerPage({after='',limit=100}={}){
   if(typeof after!=='string'||!Number.isInteger(limit)||limit<1||limit>100)throw new TypeError('Invalid local manager page');
   await authorize({scope,kind:'customer.read',now:Date.now()});
   // Only assignment IDs already disclosed by this account's customer rows.
   // Do not create a second employee directory or infer staff permissions.
   return transaction(async db=>(await db.query(`SELECT DISTINCT json_extract(local_json,'$.empId') AS id FROM offline_customers WHERE tenant_id=? AND principal_id=? AND json_type(local_json,'$.empId')='text' AND trim(json_extract(local_json,'$.empId'))!='' AND json_extract(local_json,'$.empId')>? ORDER BY id LIMIT ?`,[...keys,after,limit])).map(row=>row.id));
  },
  async page(options={}){
   const permissionEnd=startupSpan('crm.permission');
   const traceId=options.traceId||0;
   searchMark(traceId,'authorize-start');
   await authorize({scope,kind:'customer.read',now:Date.now()});
   permissionEnd();
   searchMark(traceId,'authorize-end');
   searchMark(traceId,'normalize-start');
   const query=offlineCustomerQuery(keys,options);
   searchMark(traceId,'normalize-end');
   const read=async(db,selected=query)=>{const sqlEnd=startupSpan('crm.sqlite-query');const records=await db.query(selected.sql,selected.params);sqlEnd({rows:records.length});const parseEnd=startupSpan('crm.data-conversion');
    searchMark(traceId,'parse-start');
    const result=records.map(r=>({...JSON.parse(r.local_json),localSyncState:r.state}));
    searchMark(traceId,'parse-end',{rows:result.length});parseEnd({rows:result.length});return result;
   };
   if(options.historyFrom||options.historyTo){
    const history=optionsHistory();
    if(!history)throw new Error('Offline history permission unavailable');
    return history.withHistoryFilter({from:options.historyFrom,to:options.historyTo,profileAlias:'offline_customers'},(db,filter)=>read(db,offlineCustomerQuery(keys,options,filter)));
   }
   // A standalone SELECT is already atomic. Reuse the owner's serialized
   // read path without native BEGIN/COMMIT round trips for every keystroke.
   return database.readQuery?read({query:(sql,params)=>database.readQuery(sql,params)}):transaction(read,{traceId});
  },
  async explainSearch(options={}){
   await authorize({scope,kind:'customer.read',now:Date.now()});
   const query=offlineCustomerQuery(keys,options);
   return transaction(db=>db.query('EXPLAIN QUERY PLAN '+query.sql,query.params));
  },
 });
}

