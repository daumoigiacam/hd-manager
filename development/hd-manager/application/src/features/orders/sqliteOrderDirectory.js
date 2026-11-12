import {validateOfflineOrderDocument} from '../../utils/offlineOrderDocument.js';
import {buildCustomerProductBillingSnapshot,summarizeOrderBillingItems} from '../../services/customerProductBilling.js';
import {normalizeProductPricingUnit} from '../../services/productPricingUnits.js';
import {canonicalOrder,ORDER_MUTATION_RULES} from './orderMutationProtocol.js';

const fail=(message,code='permission-denied')=>{throw Object.assign(new Error(message),{code});};
const id=value=>{if(typeof value!=='string'||!value||value.length>256)throw new TypeError('Định danh không hợp lệ');return value;};
const text=value=>String(value??'');
const escaped=value=>value.replace(/[\\%_]/g,'\\$&');
const date=value=>{if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value))throw new TypeError('Ngày không hợp lệ');return value;};
const states=['SERVER_CONFIRMED','LOCAL_ONLY','PENDING_SYNC','SYNCING','SYNCED','SYNC_FAILED','CONFLICT_REQUIRES_REVIEW'];
const ledgerSources=['customers','orders','payments','warehouseImports','expenses'];
const ledgerCaps=['home.read','home.orders.read','home.debt.read','home.cashflow.read','home.imports.read','customers.read','customers.history.read','customers.history.orders.read','customers.history.payments.read'];
const safeSummary=(body,state)=>({id:body.id,customerId:body.customerId,customerName:text(body.customerName),date:text(body.date),
  code:text(body.code||body.orderCode||body.id),amount:typeof body.amount==='number'?body.amount:null,
  archived:body.isArchived===true||body.archived===true,localSyncState:state});

// Orders-specific full-document/ledger and local-command operations only.
// Server source list/search/filter/paging belongs to offlineBusinessDirectory.
// Same account database and writer as bootstrap. No schema, connection, feed,
// network client, encryption setting or second Outbox is created by this module.
export function createSQLiteOrderProduct({database,session,authorize,orders,business,actorEmployeeId,clock=Date.now,
  digest=async value=>Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join(''),
  loadLedger=()=>import('../customers/productCRMShared.jsx')}){
 if(!database?.transaction||!session?.isCurrent||!authorize||!orders?.repository||!orders?.create)fail('Thiếu kho đơn hiện tại hoặc giao thức order.create → POST /sync','orders-write-unavailable');
 const scope=Object.freeze({...session.scope}),keys=[scope.tenantId,scope.principalId];
 const check=()=>{if(!session.isCurrent())fail('Phiên đơn hàng đã đóng');};
 const checkReadAbort=signal=>{if(signal?.aborted)throw Object.assign(Error('Đã hủy đọc công nợ và lịch sử'),{name:'AbortError',code:'orders-read-aborted'});};
 const access=async(required=[])=>{check();const grant=await authorize({scope,kind:'home.read'});check();
  if(!Number.isSafeInteger(grant?.expiresAtMs)||clock()>=grant.expiresAtMs)fail('Quyền đơn hàng đã hết hạn');
  if((grant.appSession?.sourceProfile||'legacy-v1')!=='legacy-v1')fail('Nguồn native-isolation-v1 chưa có giao thức đơn hàng sản phẩm','orders-source-unsupported');
  for(const cap of ['orders.read',...required])if(!grant.capabilities?.includes(cap))fail('Thiếu quyền đã ký: '+cap);
  return grant;
 };
 let ready,concrete,mutationStore;
 const prepare=()=>ready||=(Promise.resolve().then(async()=>{concrete=await orders.repository();mutationStore=await concrete.mutationRepository?.();}).catch(error=>{ready=null;throw error;}));
 const read=async(required,work,{signal}={})=>{checkReadAbort(signal);const grant=await access(required);checkReadAbort(signal);await prepare();check();checkReadAbort(signal);
  const result=await database.transaction(async db=>{check();checkReadAbort(signal);
   // Only an explicitly cancellable history read receives this query-only
   // adapter. Throwing releases the existing owner's transaction via rollback;
   // native writes, command queues and Outbox are never interrupted.
   const reader=signal?{async query(...args){check();checkReadAbort(signal);const rows=await db.query(...args);checkReadAbort(signal);check();return rows;}}:db;
   const result=await work(reader,grant);checkReadAbort(signal);check();return result;});
  checkReadAbort(signal);await access(required);checkReadAbort(signal);return result;
 };
 async function head(db,sources=['orders']){
  // Return only the five metadata fields, never the full financial snapshot.
  // Checkpoint, exact scoped counts and event watermark share this transaction's
  // single SELECT; source names are bound parameters, not interpolated SQL.
  const counts=sources.map((_,index)=>`(SELECT COUNT(*) FROM offline_home_feed_records_v1 r
    WHERE r.tenant_id=h.tenant_id AND r.principal_id=h.principal_id AND r.generation=h.generation AND r.source=?) AS actual_${index}`);
  const row=(await db.query(`SELECT h.generation,
    json_object('feedGeneration',json_extract(h.snapshot_json,'$.feedGeneration'),
      'feedSeq',CASE WHEN json_type(h.snapshot_json,'$.feedSeq') IN ('integer','real') THEN json_extract(h.snapshot_json,'$.feedSeq') END,
      'sourceProfile',json_extract(h.snapshot_json,'$.sourceProfile'),
      'availableSources',json_extract(h.snapshot_json,'$.availableSources'),
      'sourceCounts',json_extract(h.snapshot_json,'$.sourceCounts')) AS head_metadata,
    c.applied_seq,c.reported_seq,
    (SELECT COALESCE(MAX(e.event_id),0) FROM command_events e WHERE e.tenant_id=h.tenant_id AND e.principal_id=h.principal_id) AS event
    ${counts.length?','+counts.join(','):''}
    FROM offline_home_head_v1 h LEFT JOIN offline_home_feed_checkpoint_v1 c
      ON c.tenant_id=h.tenant_id AND c.principal_id=h.principal_id AND c.revision=h.revision AND c.generation=h.generation
    WHERE h.tenant_id=? AND h.principal_id=? AND h.revision=? LIMIT 1`,[...sources,...keys,scope.permissionRevision]))[0];
  if(!row)fail('Chưa có bản đơn hàng đã tải hoàn chỉnh','orders-source-incomplete');
  const data=JSON.parse(row.head_metadata);
  if((data.sourceProfile||'legacy-v1')!=='legacy-v1')fail('Nguồn native-isolation-v1 chưa có giao thức đơn hàng sản phẩm','orders-source-unsupported');
  if(!data.feedGeneration||data.feedGeneration!==row.generation||!Number.isSafeInteger(data.feedSeq))fail('Nguồn đơn hàng chưa có checkpoint hoàn chỉnh','orders-source-incomplete');
  if(row.applied_seq!==data.feedSeq||row.reported_seq!==data.feedSeq)fail('Dữ liệu đang cập nhật; tải lại danh sách','orders-cursor-stale');
  for(const [index,source]of sources.entries()){
   if(!data.availableSources?.includes(source)||!Number.isSafeInteger(data.sourceCounts?.[source]))fail('Thiếu lịch sử hoàn chỉnh: '+source,'orders-source-incomplete');
   const count=row['actual_'+index];
   if(count!==data.sourceCounts[source])fail('Lịch sử chưa tải đủ: '+source,'orders-source-incomplete');
  }
  return {generation:row.generation,seq:data.feedSeq,event:row.event};
 }
 const localSql=`WITH changes AS (
  SELECT m.id,m.local_json AS body,c.state FROM offline_order_mutations_v1 m JOIN local_commands c
  ON c.tenant_id=m.tenant_id AND c.principal_id=m.principal_id AND c.command_id=m.last_command_id
  WHERE m.tenant_id=? AND m.principal_id=?
 ),local_orders AS (
  SELECT id,body,state FROM changes UNION ALL
  SELECT o.id,CASE WHEN c.state='SYNCED' THEN COALESCE(o.server_json,o.body) ELSE o.body END AS body,c.state
  FROM offline_orders_v1 o JOIN local_commands c ON c.tenant_id=o.tenant_id AND c.principal_id=o.principal_id AND c.command_id=o.command_id
  WHERE o.tenant_id=? AND o.principal_id=? AND c.kind='order.create'
  AND NOT EXISTS (SELECT 1 FROM changes m WHERE m.id=o.id)
 )`;
 const cte=h=>({sql:localSql+`, server_orders AS (
  SELECT r.id,r.body,'SERVER_CONFIRMED' AS state,
  CASE WHEN EXISTS (SELECT 1 FROM local_orders l WHERE l.id=r.id AND l.state='SYNCED'
   AND COALESCE(json_extract(l.body,'$.offlineRevision'),0)>COALESCE(json_extract(r.body,'$.offlineRevision'),0)) THEN 3 ELSE 1 END AS priority
  FROM offline_home_feed_records_v1 r WHERE r.tenant_id=? AND r.principal_id=? AND r.generation=? AND r.source='orders'
 ), candidates AS (
  SELECT id,body,state,CASE WHEN state='SYNCED' THEN 2 ELSE 0 END AS priority FROM local_orders
  UNION ALL SELECT id,body,state,priority FROM server_orders
 ), ranked AS (
  SELECT id,body,state,ROW_NUMBER() OVER (PARTITION BY id ORDER BY priority) AS position FROM candidates
 ), merged AS (SELECT id,body,state FROM ranked WHERE position=1)`,params:[...keys,...keys,...keys,h.generation]});
 const decode=row=>{const body=JSON.parse(row.body);if(body.id!==row.id||body.companyId!==scope.tenantId)fail('Đơn hàng khác phạm vi');return {body,state:row.state};};
 async function allSource(db,h,source,signal){
  const result=[];let after='';
  for(;;){checkReadAbort(signal);check();const rows=await db.query('SELECT id,body FROM offline_home_feed_records_v1 WHERE tenant_id=? AND principal_id=? AND generation=? AND source=? AND id>? ORDER BY id LIMIT 100',[...keys,h.generation,source,after]);checkReadAbort(signal);check();
   for(const row of rows){const body=JSON.parse(row.body);if(body.companyId!==scope.tenantId||body.id!==row.id)fail('Lịch sử khác phạm vi');result.push(body);}
   check();if(rows.length<100)break;after=rows.at(-1).id;
  }return result;
 }
 async function sourceDocument(db,h,source,identity){
  const row=(await db.query('SELECT id,body FROM offline_home_feed_records_v1 WHERE tenant_id=? AND principal_id=? AND generation=? AND source=? AND id=?',[...keys,h.generation,source,identity]))[0];
  if(!row)return null;const body=JSON.parse(row.body);if(body.companyId!==scope.tenantId||body.id!==identity)fail('Danh mục khác phạm vi');return body;
 }
 return Object.freeze({
  scope,
  localPage({search='',from='',to='',state='',archived=false,after=null,limit=25}={}){
   if(typeof search!=='string'||search.length>160||!Number.isInteger(limit)||limit<1||limit>100||typeof archived!=='boolean'||(state&&!states.includes(state)))throw new TypeError('Bộ lọc đơn hàng không hợp lệ');
   date(from);date(to);if(from&&to&&from>to)throw new TypeError('Khoảng ngày không hợp lệ');
   const filter=JSON.stringify([search,from,to,state,archived,limit]);
   return (async()=>{
    const valid=grant=>{check();if(Object.keys(scope).some(key=>session.scope?.[key]!==scope[key]))fail('Phạm vi đơn hàng đã thay đổi');if(!Number.isSafeInteger(grant?.expiresAtMs)||clock()>=grant.expiresAtMs)fail('Quyền đơn hàng đã hết hạn');};
    const grant=await access([]);valid(grant);await prepare();valid(grant);
    const base={sql:localSql,params:[...keys,...keys]},params=[...base.params,...keys,scope.tenantId];
    const where=["json_extract(body,'$.companyId')=?",`(COALESCE(json_extract(body,'$.isArchived'),0)=1 OR COALESCE(json_extract(body,'$.archived'),0)=1)=${archived?1:0}`];
    if(search.trim()){
     // Search only fields the route may display. Searching raw JSON would leak
     // hidden fields through match/no-match results even without returning them.
     where.push("((COALESCE(json_extract(body,'$.orderCode'),'')||' '||COALESCE(json_extract(body,'$.code'),'')||' '||id||' '||COALESCE(json_extract(body,'$.customerName'),'')||' '||COALESCE(json_extract(body,'$.customerId'),'')) LIKE ? ESCAPE '\\' COLLATE NOCASE OR EXISTS (SELECT 1 FROM json_each(CASE WHEN json_type(body,'$.items')='array' THEN json_extract(body,'$.items') ELSE '[]' END) line WHERE (COALESCE(json_extract(line.value,'$.productId'),'')||' '||COALESCE(json_extract(line.value,'$.productNameSnapshot'),'')||' '||COALESCE(json_extract(line.value,'$.productName'),'')||' '||COALESCE(json_extract(line.value,'$.description'),'')) LIKE ? ESCAPE '\\' COLLATE NOCASE))");
     const pattern='%'+escaped(search.trim())+'%';params.push(pattern,pattern);
    }
    if(from){where.push("COALESCE(json_extract(body,'$.date'),'')>=?");params.push(from);}
    if(to){where.push("COALESCE(json_extract(body,'$.date'),'')<=?");params.push(to);}
    if(state){where.push('state=?');params.push(state);}
    if(after){if(after.tenantId!==scope.tenantId||after.principalId!==scope.principalId||after.revision!==scope.permissionRevision||after.filter!==filter||after.generation!=='local-commands'||after.seq!==0||typeof after.date!=='string'||typeof after.id!=='string')fail('Danh sách đã thay đổi; tải lại từ đầu','orders-cursor-stale');
     where.push("(COALESCE(json_extract(body,'$.date'),''),id)<(?,?)");params.push(after.date,after.id);}
    // The event and bounded page share ONE SQLite statement snapshot. LEFT
    // JOIN retains the watermark even when filters/cursor produce no rows.
    const statement=base.sql+", event AS (SELECT COALESCE(MAX(event_id),0) AS n FROM command_events WHERE tenant_id=? AND principal_id=?), page AS (SELECT id,body,state,COALESCE(json_extract(body,'$.date'),'') AS sort_date FROM local_orders WHERE "+where.join(' AND ')+" ORDER BY COALESCE(json_extract(body,'$.date'),'') DESC,id DESC LIMIT ?) SELECT e.n AS event,p.id,p.body,p.state FROM event e LEFT JOIN page p ON 1=1 ORDER BY p.sort_date DESC,p.id DESC";
    const readPage=async db=>{valid(grant);return db.query(statement,[...params,limit+1]);};
    const envelope=typeof database.readQuery==='function'?await database.readQuery(statement,[...params,limit+1]):await database.transaction(readPage);
    valid(await access([]));
    const event=envelope[0]?.event;
    if(!Number.isSafeInteger(event)||event<0||envelope.some(row=>row.event!==event))fail('Mốc hàng chờ không hợp lệ','orders-cursor-stale');
    const h={generation:'local-commands',seq:0,event};
    if(after&&after.event!==event)fail('Danh sách đã thay đổi; tải lại từ đầu','orders-cursor-stale');
    const rows=envelope.filter(row=>row.id!==null);
    const selected=rows.slice(0,limit),last=selected.at(-1);
    return {rows:selected.map(row=>{const {body,state}=decode(row);return safeSummary(body,state);}),
     nextCursor:rows.length>limit?{...h,tenantId:scope.tenantId,principalId:scope.principalId,revision:scope.permissionRevision,filter,date:text(JSON.parse(last.body).date),id:last.id}:null,
     generation:h.generation,seq:h.seq};
   })();
  },
  detail(identity){id(identity);return read(['home.read','home.orders.read'],async(db,grant)=>{const h=await head(db),base=cte(h);
   const row=(await db.query(base.sql+' SELECT id,body,state FROM merged WHERE id=?',[...base.params,identity]))[0];if(!row)return null;
   const {body,state}=decode(row);
   // Explicit presentation projection: no payment tokens, arbitrary nested
   // documents, employee credentials, customer phone or address cross the API.
   const change=(await db.query('SELECT m.receipt_json,c.state FROM offline_order_mutations_v1 m JOIN local_commands c ON c.tenant_id=m.tenant_id AND c.principal_id=m.principal_id AND c.command_id=m.last_command_id WHERE m.tenant_id=? AND m.principal_id=? AND m.id=?',[...keys,identity]))[0];
   const conflict=change?.receipt_json?JSON.parse(change.receipt_json):null;
   const protocolReady=mutationStore?.protocolVersion===1;
   const pending=change&&change.state!=='SYNCED'&&change.state!=='CONFLICT_REQUIRES_REVIEW';
   const completeBilling=Array.isArray(body.items)&&body.items.every(line=>typeof line.unitPrice==='number'&&Number.isFinite(line.unitPrice)&&typeof(line.billingUnit||line.pricingUnit)==='string'&&!!(line.billingUnit||line.pricingUnit)&&typeof(line.billingQuantity??line.pricingQuantity)==='number');
   return {...safeSummary(body,state),checkpoint:h,note:text(body.note),
    billingSummaries:completeBilling?summarizeOrderBillingItems(body.items):null,
    mutation:{protocolReady,pending:!!pending,editToken:await digest(canonicalOrder(body)),canUpdate:protocolReady&&!pending&&grant.capabilities.includes('orders.update'),canArchive:protocolReady&&!pending&&grant.capabilities.includes('orders.archive'),
     conflict:conflict?.outcome==='conflict'?{commandId:conflict.commandId,kind:conflict.kind,reason:conflict.reason,serverNote:conflict.currentDocument?.note??'',serverArchived:conflict.currentDocument?.isArchived===true,canResolve:!!conflict.currentDocument,reviewToken:conflict.currentDocument?await digest(canonicalOrder(conflict.currentDocument)):null}:null},
    items:(body.items||[]).map(line=>({productId:text(line.productId),name:text(line.productNameSnapshot||line.productName||line.description),quantity:line.actualQuantity??line.quantity,unit:text(line.orderedUnit||line.orderUnit||line.actualUnit),billingQuantity:line.billingQuantity??line.pricingQuantity,billingUnit:text(line.billingUnit||line.pricingUnit),unitPrice:line.unitPrice,amount:line.lineTotal??line.amount}))};
  });},
  async change({identity,mutationId,kind,patch,editedAt,baseToken,resolvesConflictId=null}){
   if(!ORDER_MUTATION_RULES[kind])throw Error('Unsupported order edit: compound financial effects need the original workflow');
   const request=await read(['home.read','home.orders.read',ORDER_MUTATION_RULES[kind].capability],async db=>{
    if(mutationStore?.protocolVersion!==1)fail('CAS order.update/archive chưa được nối đầy đủ; không lưu generic/LWW','orders-write-unavailable');
    const retry=(await db.query('SELECT entity_id,kind,payload_json,state FROM local_commands WHERE tenant_id=? AND principal_id=? AND command_id=?',[...keys,mutationId]))[0];
    if(retry){const payload=JSON.parse(retry.payload_json);if(retry.entity_id!==identity||retry.kind!==kind||canonicalOrder(payload.patch)!==canonicalOrder(patch)||payload.editedAt!==editedAt||payload.resolvesConflictId!==resolvesConflictId)throw Error('Immutable mutation ID already has another intent');return {retry:{entityId:identity,commandId:mutationId,state:retry.state,serverConfirmed:retry.state==='SYNCED'}};}
    const h=await head(db),base=cte(h),row=(await db.query(base.sql+' SELECT id,body,state FROM merged WHERE id=?',[...base.params,identity]))[0];if(!row)throw Error('Order not found; never recreate on edit');
    let baseDocument=decode(row).body,baseCommandId=null,baseFingerprint=null;
    const change=(await db.query('SELECT last_command_id,local_json,receipt_json FROM offline_order_mutations_v1 WHERE tenant_id=? AND principal_id=? AND id=?',[...keys,identity]))[0];
    if(resolvesConflictId){const receipt=change?.receipt_json?JSON.parse(change.receipt_json):null;if(receipt?.commandId!==resolvesConflictId||!receipt.currentDocument)throw Error('Reload and review the authoritative conflict first');baseDocument=receipt.currentDocument;baseFingerprint=receipt.currentFingerprint;}
    else if(change&&canonicalOrder(JSON.parse(change.local_json))===canonicalOrder(baseDocument))baseCommandId=change.last_command_id;
    else if(!change){const created=(await db.query('SELECT command_id,body,server_json FROM offline_orders_v1 WHERE tenant_id=? AND principal_id=? AND id=?',[...keys,identity]))[0];if(created&&canonicalOrder(JSON.parse(created.server_json||created.body))===canonicalOrder(baseDocument))baseCommandId=created.command_id;}
    if(!/^[a-f0-9]{64}$/.test(baseToken)||await digest(canonicalOrder(baseDocument))!==baseToken)fail('Đơn đã thay đổi từ lúc mở trình sửa. Đóng trình sửa và xem lại bản hiện tại.','orders-cursor-stale');
    return {baseDocument,baseCommandId,baseFingerprint};
   });
   if(request.retry)return request.retry;
   const base={...request,mutationId,editedAt,resolvesConflictId};
   try{return await(kind==='order.update'?concrete.update(identity,patch,base):concrete.archive(identity,patch.isArchived,base));}catch(error){error.orderCommitAttempted=true;throw error;}
  },
  async ledger(customerId,checkpoint=null,{signal}={}){checkReadAbort(signal);id(customerId);const calculators=await loadLedger();checkReadAbort(signal);
   return read(ledgerCaps,async db=>{const h=await head(db,ledgerSources),customer=await sourceDocument(db,h,'customers',customerId);
    if(checkpoint&&['generation','seq','event'].some(key=>checkpoint[key]!==h[key]))fail('Chi tiết hoặc lịch sử đã thay đổi; mở lại đơn để đối soát','orders-cursor-stale');
    if(!customer)fail('Chưa có hồ sơ khách hàng đầy đủ','orders-source-incomplete');
    const pendingCustomer=(await db.query("SELECT command_id FROM local_commands WHERE tenant_id=? AND principal_id=? AND entity_id=? AND kind IN ('customer.create','customer.update','customer.archive') AND state<>'SYNCED' LIMIT 1",[...keys,customerId]))[0];
    if(pendingCustomer)return {status:'unconfirmed',reason:'Hồ sơ khách hàng có thay đổi chưa được xác nhận. Chưa công bố công nợ.'};
    const outsideCheckpoint=(await db.query("SELECT o.id FROM offline_orders_v1 o JOIN local_commands c ON c.tenant_id=o.tenant_id AND c.principal_id=o.principal_id AND c.command_id=o.command_id WHERE o.tenant_id=? AND o.principal_id=? AND json_extract(o.body,'$.customerId')=? AND c.state='SYNCED' AND NOT EXISTS (SELECT 1 FROM offline_home_feed_records_v1 r WHERE r.tenant_id=o.tenant_id AND r.principal_id=o.principal_id AND r.generation=? AND r.source='orders' AND r.id=o.id) LIMIT 1",[...keys,customerId,h.generation]))[0];
    if(outsideCheckpoint)return {status:'unconfirmed',reason:'Đơn đã xác nhận chưa có trong checkpoint lịch sử đã tải. Chưa công bố công nợ.'};
    const changedOutside=(await db.query("SELECT m.id FROM offline_order_mutations_v1 m JOIN local_commands c ON c.tenant_id=m.tenant_id AND c.principal_id=m.principal_id AND c.command_id=m.last_command_id WHERE m.tenant_id=? AND m.principal_id=? AND json_extract(m.local_json,'$.customerId')=? AND c.state='SYNCED' AND NOT EXISTS (SELECT 1 FROM offline_home_feed_records_v1 r WHERE r.tenant_id=m.tenant_id AND r.principal_id=m.principal_id AND r.generation=? AND r.source='orders' AND r.id=m.id AND COALESCE(json_extract(r.body,'$.offlineRevision'),0)>=json_extract(m.server_json,'$.offlineRevision')) LIMIT 1",[...keys,customerId,h.generation]))[0];
    if(changedOutside)return {status:'unconfirmed',reason:'Thay đổi đơn đã xác nhận chưa có trong checkpoint lịch sử. Chưa công bố công nợ.'};
    const base=cte(h),orderRows=[];let after='';
    for(;;){const rows=await db.query(base.sql+" SELECT id,body,state FROM merged WHERE json_extract(body,'$.customerId')=? AND id>? ORDER BY id LIMIT 100",[...base.params,customerId,after]);
     for(const row of rows){const value=decode(row);if(!['SYNCED','SERVER_CONFIRMED'].includes(value.state))return {status:'unconfirmed',reason:'Khách hàng có đơn chưa được máy chủ xác nhận. Chưa công bố công nợ.'};orderRows.push(value.body);}
     if(rows.length<100)break;after=rows.at(-1).id;check();}
    // All warehouse imports are relevant: the original calculator also matches
    // suppliers by normalized name/phone, not only by customerId.
    const payments=(await allSource(db,h,'payments',signal)).filter(row=>row.customerId===customerId);
    const expenses=(await allSource(db,h,'expenses',signal)).filter(row=>row.customerId===customerId);
    const imports=await allSource(db,h,'warehouseImports',signal);
    checkReadAbort(signal);check();
    const ledger=calculators.buildCustomerReconciledLedger(customer,orderRows,payments,imports,expenses);
    checkReadAbort(signal);check();
    return {status:'complete',generation:h.generation,seq:h.seq,currentDebt:ledger.currentDebt,creditBalance:ledger.creditBalance,
     orders:ledger.orders.map(row=>({id:row.id,appliedAmount:row.appliedAmount,outstandingAmount:row.outstandingAmount,status:row.status}))};
   },{signal});
  },
  async createManual({identity,customerId,salesEmpId,date:day,createdAt,lines,note=''}){
   id(identity);id(customerId);id(salesEmpId);date(day);if(!actorEmployeeId)fail('Thiếu nhân viên từ danh tính phiên đã ký','orders-write-unavailable');
   if(!day||typeof createdAt!=='string'||!Number.isFinite(Date.parse(createdAt))||!Array.isArray(lines)||!lines.length||lines.length>100||typeof note!=='string'||note.length>4000)throw new TypeError('Đơn thủ công không hợp lệ');
   const catalogCaps=['customers','products','employees'].flatMap(source=>{const spec=business?.sources?.[source];if(!spec||typeof spec.capability!=='string'||!spec.capability||!Array.isArray(spec.requiredCapabilities)||!spec.requiredCapabilities.length)fail('Thiếu metadata quyền runtime.business.sources.'+source+'.requiredCapabilities','orders-write-unavailable');return spec.requiredCapabilities;});
   if(catalogCaps.some(cap=>typeof cap!=='string'))fail('Thiếu hợp đồng quyền danh mục runtime.business.sources','orders-write-unavailable');
   const document=await read(['orders.create','home.read',...catalogCaps],async db=>{const h=await head(db,['customers','employees','products']);
    // A retry uses the immutable command payload, not today's mutable product
    // names/configuration. This also survives a route/process restart.
    const prior=(await db.query("SELECT payload_json FROM local_commands WHERE tenant_id=? AND principal_id=? AND entity_id=? AND kind='order.create'",[...keys,identity]))[0];
    if(prior){const saved=validateOfflineOrderDocument(JSON.parse(prior.payload_json),scope.tenantId);
     const same=saved.id===identity&&saved.customerId===customerId&&saved.salesEmpId===salesEmpId&&saved.createdByEmpId===actorEmployeeId&&saved.date===day&&saved.createdAt===createdAt&&saved.note===note&&saved.items.length===lines.length&&lines.every((line,i)=>{const item=saved.items[i];return item.productId===line.productId&&item.quantity===line.quantity&&item.billingQuantity===line.billingQuantity&&item.unitPrice===line.unitPrice&&item.orderedUnit===normalizeProductPricingUnit(line.orderedUnit)&&item.billingUnit===normalizeProductPricingUnit(line.billingUnit);});
     if(!same)throw new Error('Order identity already has another intent');return saved;
    }
    for(const [source,identity]of [['customers',customerId],['employees',salesEmpId],['employees',id(actorEmployeeId)]]){const value=await sourceDocument(db,h,source,identity);if(!value||value.isArchived)fail('Khách hàng hoặc nhân viên không còn hoạt động');}
    const items=[];
    for(const line of lines){const product=await sourceDocument(db,h,'products',id(line.productId));if(!product||product.isArchived)fail('Sản phẩm không còn hoạt động');
     // Explicit quantities/units/prices. Do not infer customer conversion or
     // substitute catalog prices. The existing billing calculator freezes intent.
     if(![line.quantity,line.billingQuantity,line.unitPrice].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0)||!text(line.orderedUnit).trim()||!text(line.billingUnit).trim())throw new TypeError('Nhập đủ số lượng, ĐVT và đơn giá');
     const snapshot=buildCustomerProductBillingSnapshot({product,productId:product.id,productName:product.name,actualQuantity:line.quantity,actualUnit:line.orderedUnit,orderUnit:line.orderedUnit,billingQuantity:line.billingQuantity,billingUnit:line.billingUnit,unitPrice:line.unitPrice});
     if(!snapshot.billingSnapshotValid||snapshot.pricingPendingActual)throw new TypeError('Snapshot tính giá chưa hoàn chỉnh');
     items.push({...snapshot,orderedUnit:snapshot.orderUnit,quantity:snapshot.actualQuantity});
    }
    const amount=items.reduce((sum,line)=>sum+line.amount,0);
    if(!Number.isSafeInteger(amount))throw new TypeError('Tổng tiền vượt giới hạn chính xác');
    return validateOfflineOrderDocument({id:identity,companyId:scope.tenantId,customerId,salesEmpId,empId:salesEmpId,createdByEmpId:actorEmployeeId,createdAt,items,date:day,note,amount,totalAmount:amount,paidAmount:0,discount:0,extraExpenseAmount:0,customerExtraExpense:0,sellerExtraExpense:0,sourceType:'manual',sourceDispatchIds:[],reviewStatus:'draft',zaloSendStatus:'not_queued'},scope.tenantId);
   });
   check();if(typeof orders.create!=='function')fail('Thiếu giao thức order.create → POST /sync','orders-write-unavailable');
   try{
    const receipt=await orders.create(document);check();
    if(!receipt?.commandId||!states.includes(receipt.state)||receipt.serverConfirmed!==(receipt.state==='SYNCED'))fail('Không xác định được kết quả Outbox; giữ nguyên mã đơn để đối soát','orders-write-uncertain');
    return {...receipt,entityId:identity};
   }catch(error){error.orderCommitAttempted=true;throw error;}
  },
 });
}
