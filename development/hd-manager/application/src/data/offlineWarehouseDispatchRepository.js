import {createOfflineCommandRepository} from './offlineCommandRepository.js';
import {DISPATCH_RULES,DISPATCH_OUTSIDE_CAP,DISPATCH_HISTORY_CAP,dispatchToday,canonicalDispatch,dispatchIdentifier,dispatchRevision,dispatchFail,plainDispatch,assertLegacyDispatch,buildDispatchValues,validateDispatchPayload,planDispatch} from '../features/warehouse/warehouseDispatchOfflineProtocol.js';
const readCaps=['home.read','home.dispatches.read','home.stock.read','home.debt.read','customers.read'];
export async function createOfflineWarehouseDispatchRepository(options){
 const {database,session,deviceId,employeeId,authorize,authorizeWrite,digest,protocol,projectId,business}=options,now=options.now||Date.now;
 if(options.development!==true||!/^demo-[a-z0-9-]+$/.test(projectId||'')||!dispatchIdentifier(employeeId)||!dispatchIdentifier(deviceId)||typeof digest!=='function'||!database?.transaction||typeof authorize!=='function')dispatchFail('Cần Runtime Development, SQLite owner và nhân viên đã xác minh.','permission-denied');
 const scope=Object.freeze({...session.scope}),keys=[scope.tenantId,scope.principalId];
 const ready=protocol?.version===1&&protocol.serverCAS===true&&protocol.atomicOutbox===true&&protocol.receiptDispatch===true&&protocol.serverStockValidation===true&&protocol.outsideRequestOnly===true&&typeof authorizeWrite==='function';
 const check=()=>{if(!session.isCurrent(scope)||Object.keys(scope).some(k=>scope[k]!==session.scope[k]))dispatchFail('Phiên xuất kho đã đóng.','permission-denied');};
 async function access(kind='warehouseDispatch.read',driver=false){
  check();const required=[...readCaps,...(kind==='warehouseDispatch.read'?[]:[DISPATCH_RULES[kind]?.capability,...(kind==='warehouseDispatch.archive'?[]:[DISPATCH_OUTSIDE_CAP])]),...(driver?['home.payroll.read']:[])];
  const verify=kind==='warehouseDispatch.read'?authorize:authorizeWrite;
  if(typeof verify!=='function')dispatchFail('Chưa nối xác minh chữ ký ghi xuất kho.','permission-denied');
  const grant=await verify({scope,kind:kind==='warehouseDispatch.read'?'home.read':kind});check();
  if(!Number.isSafeInteger(grant?.expiresAtMs)||now()>=grant.expiresAtMs||grant.projectId!==projectId||!['tenantId','principalId','permissionRevision','sessionId'].every(k=>grant[k]===scope[k])||required.some(cap=>!cap||!grant.capabilities?.includes(cap))||grant.appSession?.user?.id!==employeeId||grant.appSession.user.companyId!==scope.tenantId||grant.appSession.sourceProfile!==undefined)dispatchFail('Thiếu quyền xuất kho có chữ ký còn hiệu lực.','permission-denied');
  return grant;
 }
 const tx=work=>database.transaction(async db=>{await access();const value=await work(db);await access();return value;});
 await tx(async db=>{
  await db.run('CREATE TABLE IF NOT EXISTS offline_warehouse_dispatches_v1 (tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,id TEXT NOT NULL,local_json TEXT NOT NULL,base_json TEXT NOT NULL,last_command_id TEXT NOT NULL,server_json TEXT,receipt_json TEXT,PRIMARY KEY(tenant_id,principal_id,id))');
  await db.run('CREATE TABLE IF NOT EXISTS offline_warehouse_dispatch_receipts_v1 (tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,command_id TEXT NOT NULL,id TEXT NOT NULL,receipt_json TEXT NOT NULL,PRIMARY KEY(tenant_id,principal_id,command_id))');
 });
 const select='SELECT d.*,c.kind,c.state FROM offline_warehouse_dispatches_v1 d JOIN local_commands c ON c.tenant_id=d.tenant_id AND c.principal_id=d.principal_id AND c.command_id=d.last_command_id WHERE d.tenant_id=? AND d.principal_id=?';
 const overlay=async(db,id)=>(await db.query(select+' AND d.id=?',[...keys,id]))[0];
 async function head(db,sources){
  const h=(await db.query(`SELECT h.generation,json_extract(h.snapshot_json,'$.feedGeneration') AS feed_generation,json_extract(h.snapshot_json,'$.feedSeq') AS seq,json_extract(h.snapshot_json,'$.sourceProfile') AS profile,json_extract(h.snapshot_json,'$.availableSources') AS sources,json_extract(h.snapshot_json,'$.sourceCounts') AS counts,c.applied_seq,c.reported_seq FROM offline_home_head_v1 h JOIN offline_home_feed_checkpoint_v1 c ON c.tenant_id=h.tenant_id AND c.principal_id=h.principal_id AND c.revision=h.revision AND c.generation=h.generation WHERE h.tenant_id=? AND h.principal_id=? AND h.revision=?`,[...keys,scope.permissionRevision]))[0];
  if(!h||h.generation!==h.feed_generation||!Number.isSafeInteger(h.seq)||h.seq!==h.applied_seq||h.seq!==h.reported_seq||(h.profile??'legacy-v1')!=='legacy-v1')dispatchFail('Nguồn xuất kho chưa hoàn tất hoặc cần mô hình riêng.','source-catchup');
  const available=JSON.parse(h.sources||'null'),counts=JSON.parse(h.counts||'null');
  for(const source of sources){if(!available?.includes(source)||!Number.isSafeInteger(counts?.[source])||counts[source]<0)dispatchFail('Thiếu nguồn hoàn tất '+source,'source-catchup');
   const actual=(await db.query('SELECT COUNT(*) AS n FROM offline_home_feed_records_v1 WHERE tenant_id=? AND principal_id=? AND generation=? AND source=? AND seq<=?',[...keys,h.generation,source,h.seq]))[0].n;
   if(actual!==counts[source])dispatchFail('Nguồn thiếu bản ghi '+source,'source-catchup');
  }return h;
 }
 async function source(db,h,name,id){
  const rows=await db.query('SELECT body FROM offline_home_feed_records_v1 WHERE tenant_id=? AND principal_id=? AND generation=? AND source=? AND id=? AND seq<=?',[...keys,h.generation,name,id,h.seq]);
  if(rows.length>1)dispatchFail('Nguồn trùng định danh.');
  const doc=rows.length?plainDispatch(JSON.parse(rows[0].body)):null;
  if(doc&&(doc.id!==id||doc.companyId!==scope.tenantId))dispatchFail('Nguồn ngoài tài khoản/công ty.','permission-denied');return doc;
 }
 async function relations(db,values){
  const sources=['customers','products',...(values.assignedDriverId?['employees']:[])],h=await head(db,sources);
  const customer=await source(db,h,'customers',values.customerId),product=await source(db,h,'products',values.productId),driver=values.assignedDriverId?await source(db,h,'employees',values.assignedDriverId):null;
  const ids=[values.customerId,values.productId,...(values.assignedDriverId?[values.assignedDriverId]:[])];
  for(const id of ids){const pending=await db.query("SELECT command_id FROM local_commands WHERE tenant_id=? AND principal_id=? AND entity_id=? AND kind NOT LIKE 'warehouseDispatch.%' AND state!='SYNCED' LIMIT 1",[...keys,id]);if(pending.length)dispatchFail('Danh mục liên quan có thay đổi chưa xác nhận; chưa tạo snapshot.');}
  return {customer,product,driver};
 }
 function store(uuid=options.uuid){return createOfflineCommandRepository({...options,uuid,authorize:request=>access(request.kind,!!request.payload?.values?.assignedDriverId),
  async onEnqueue(db,command){
   await access(command.kind,!!command.payload.values?.assignedDriverId);const p=validateDispatchPayload(command.kind,command.payload),row=await overlay(db,command.entityId);
   if(row&&row.state!=='SYNCED'){
    const dependent=row.kind==='warehouseDispatch.create'&&row.state==='PENDING_SYNC'&&canonicalDispatch(JSON.parse(row.local_json))===canonicalDispatch(p.base);
    const receipt=row.receipt_json&&JSON.parse(row.receipt_json),reviewed=row.state==='CONFLICT_REQUIRES_REVIEW'&&p.resolvesConflictId===row.last_command_id&&receipt?.outcome==='conflict'&&receipt.currentFingerprint===p.baseFingerprint&&canonicalDispatch(receipt.current)===canonicalDispatch(p.base);
    if(!dependent&&!reviewed)dispatchFail('Phiếu có ý định đang chờ hoặc cần đối chiếu; không ghi đè.');
    if(dependent&&!(await db.query('SELECT depends_on FROM command_dependencies WHERE tenant_id=? AND principal_id=? AND command_id=? AND depends_on=?',[...keys,command.commandId,row.last_command_id])).length)dispatchFail('Thiếu dependency của phiếu tạo đang chờ; mở lại ý định.');
   }
   assertLegacyDispatch(p.base,scope.tenantId,command.entityId);assertLegacyDispatch(p.planned,scope.tenantId,command.entityId);
   await db.run('INSERT INTO offline_warehouse_dispatches_v1 VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,principal_id,id) DO UPDATE SET local_json=excluded.local_json,base_json=excluded.base_json,last_command_id=excluded.last_command_id,receipt_json=NULL',[...keys,command.entityId,JSON.stringify(p.planned),canonicalDispatch(p.base),command.commandId,row?.server_json||null,null]);
  },
  async onReceipt(db,{commandId,entityId,receipt}){
   await access();const row=await overlay(db,entityId),saved=(await db.query('SELECT kind,payload_json FROM local_commands WHERE tenant_id=? AND principal_id=? AND command_id=?',[...keys,commandId]))[0];
   if(!row||!saved||!DISPATCH_RULES[saved.kind]||receipt.kind!==saved.kind||receipt.entityId!==entityId)dispatchFail('Receipt xuất kho không khớp lệnh.');
   const p=validateDispatchPayload(saved.kind,JSON.parse(saved.payload_json));
   if(receipt.outcome==='accepted'){assertLegacyDispatch(receipt.document,scope.tenantId,entityId);if(canonicalDispatch(receipt.document)!==canonicalDispatch(p.planned)||await digest(canonicalDispatch(receipt.document))!==receipt.fingerprint)dispatchFail('Receipt không khớp kế hoạch xuất kho đã lưu.');}
   else if(receipt.outcome==='conflict'){assertLegacyDispatch(receipt.current,scope.tenantId,entityId);if(await digest(canonicalDispatch(receipt.current))!==receipt.currentFingerprint||dispatchRevision(receipt.current)!==receipt.currentRevision)dispatchFail('Bản đối chiếu xuất kho không hợp lệ.');}
   await db.run('INSERT INTO offline_warehouse_dispatch_receipts_v1 VALUES (?,?,?,?,?)',[...keys,commandId,entityId,JSON.stringify(receipt)]);
   if(row.last_command_id===commandId)await db.run('UPDATE offline_warehouse_dispatches_v1 SET local_json=?,server_json=?,receipt_json=? WHERE tenant_id=? AND principal_id=? AND id=?',[receipt.outcome==='accepted'?JSON.stringify(receipt.document):row.local_json,receipt.outcome==='accepted'?JSON.stringify(receipt.document):row.server_json,JSON.stringify(receipt),...keys,entityId]);
  }
 });}
 const commands=store();
 async function submit(kind,id,draft,{mutationId,editedAt,base=null,resolvesConflictId=null,expectedPlan=null}={}){
  if(!ready)dispatchFail('Chưa nối CAS, quyền ghi, kiểm tồn máy chủ và receipt xuất kho.');
  if(!DISPATCH_RULES[kind]||!dispatchIdentifier(mutationId)||!dispatchIdentifier(id))dispatchFail('Mã xuất kho không hợp lệ.','invalid-argument');
  const grant=await access(kind,!!draft?.assignedDriverId);
  if(kind==='warehouseDispatch.archive'&&base?.date!==dispatchToday(now())&&!grant.capabilities.includes(DISPATCH_HISTORY_CAP))dispatchFail('Thiếu quyền có chữ ký lưu trữ lịch sử xuất kho.','permission-denied');
  const values=kind==='warehouseDispatch.archive'?null:buildDispatchValues(draft);
  assertLegacyDispatch(base,scope.tenantId,id);
  // An immutable retry reuses its saved plan even if catalog names/prices have
  // moved. A changed user intent must use another ID, never silently replan it.
  const existing=await tx(async db=>(await db.query('SELECT kind,entity_id,payload_json,state FROM local_commands WHERE tenant_id=? AND principal_id=? AND command_id=?',[...keys,mutationId]))[0]);
  if(existing){const p=JSON.parse(existing.payload_json);if(existing.kind!==kind||existing.entity_id!==id||canonicalDispatch(p.values)!==canonicalDispatch(values)||canonicalDispatch(p.base)!==canonicalDispatch(base)||p.editedAt!==editedAt||p.resolvesConflictId!==resolvesConflictId)dispatchFail('Mã thao tác bất biến đã dùng cho ý định khác.');return {commandId:mutationId,entityId:id,state:existing.state,serverConfirmed:existing.state==='SYNCED'};}
  const planned=await tx(async db=>planDispatch(base,kind,values,{id,tenantId:scope.tenantId,employeeId,editedAt,mutationId,...(values?await relations(db,values):{})}));
  if(kind!=='warehouseDispatch.archive'&&canonicalDispatch(planned)!==canonicalDispatch(expectedPlan))dispatchFail('Đơn vị/giá hoặc quan hệ đã đổi sau khi xem trước. Đối chiếu lại trước khi lưu.');
  const payload=validateDispatchPayload(kind,{version:1,base:plainDispatch(base),baseFingerprint:await digest(canonicalDispatch(base)),baseRevision:dispatchRevision(base),values,planned,editedAt,employeeId,resolvesConflictId});
  const dependencies=await tx(async db=>{const row=await overlay(db,id);return row?.kind==='warehouseDispatch.create'&&row.state==='PENDING_SYNC'?[row.last_command_id]:[];});
  const result={...await store(()=>mutationId).enqueue({kind,entityId:id,baseRevision:payload.baseRevision,payload,dependencies}),entityId:id};
  try{options.onQueued?.(result)?.catch?.(()=>{});}catch{}return result;
 }
 return Object.freeze({scope,employeeId,projectId,ready,protocolVersion:ready?1:0,applyReceipt:commands.applyReceipt,
  async preview(draft,{base=null,mutationId,editedAt}={}){const values=buildDispatchValues(draft),kind=base?'warehouseDispatch.update':'warehouseDispatch.create',id=base?.id||`wd_${scope.tenantId}_${mutationId}`;await access(kind,!!values.assignedDriverId);return tx(async db=>planDispatch(base,kind,values,{id,tenantId:scope.tenantId,employeeId,editedAt,mutationId,...await relations(db,values)}));},
  create:(draft,o)=>submit('warehouseDispatch.create',`wd_${scope.tenantId}_${o?.mutationId}`,draft,o),update:(id,draft,o)=>submit('warehouseDispatch.update',id,draft,o),archive:(id,o)=>submit('warehouseDispatch.archive',id,null,o),
  async lookup(sourceName,input={}){await access();if(!['customers','products','employees'].includes(sourceName)||!business?.page)dispatchFail('Chưa nối danh mục nghiệp vụ hiện có.');if(sourceName==='employees')await access('warehouseDispatch.read',true);const page=await business.page(sourceName,{...input,limit:25});check();return {items:page.items.map(item=>({id:item.id,name:item.document?.name||item.id,unit:item.document?.unit||''})),cursor:page.cursor??page.nextCursor??null,hasMore:page.hasMore};},
  async detail(id,{preferFeed=false}={}){if(!dispatchIdentifier(id))dispatchFail('Mã xuất kho không hợp lệ.');return tx(async db=>{
   const row=await overlay(db,id);let document=row?JSON.parse(row.local_json):null,sourceCatchup=false;
   if(!row||preferFeed&&row.state==='SYNCED'){try{const h=await head(db,['warehouseDispatches']),feed=await source(db,h,'warehouseDispatches',id);if(!document||feed&&dispatchRevision(feed)>=dispatchRevision(document))document=feed;else sourceCatchup=true;}catch(e){if(!document||e.code!=='source-catchup')throw e;sourceCatchup=true;}}
   if(!document)return null;assertLegacyDispatch(document,scope.tenantId,id);
   const own=row&&canonicalDispatch(document)===canonicalDispatch(JSON.parse(row.local_json));
   return {document,base:plainDispatch(document),state:own?row.state:'SERVER_CONFIRMED',commandId:own?row.last_command_id:null,receipt:own&&row.receipt_json?JSON.parse(row.receipt_json):null,sourceCatchup};
  });},
  async page({after='',limit=25}={}){if(typeof after!=='string'||!Number.isInteger(limit)||limit<1||limit>25)dispatchFail('Trang hàng chờ không hợp lệ.');return tx(async db=>{const rows=await db.query(select+(after?' AND d.id<?':'')+' ORDER BY d.id DESC LIMIT ?',[...keys,...(after?[after]:[]),limit+1]);return {items:rows.slice(0,limit).map(r=>({id:r.id,document:JSON.parse(r.local_json),state:r.state,commandId:r.last_command_id,receipt:r.receipt_json?JSON.parse(r.receipt_json):null})),hasMore:rows.length>limit,cursor:rows.length>limit?rows[limit-1].id:null};});}
 });
}
