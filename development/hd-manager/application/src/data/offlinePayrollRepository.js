import {createOfflineCommandRepository} from './offlineCommandRepository.js';
import {PAYROLL_INPUT_SOURCES,PAYROLL_COMMAND_CAPS,PAYROLL_COMPANY_READ,payrollId,payrollMonth,payrollFail,plainPayroll,canonicalPayroll,validatePayrollSources,planPayroll,validatePayrollPayload,acceptedPayrollWrites,payrollManager,validPayrollServerTime} from '../features/payroll/offlinePayrollProtocol.js';
export async function createOfflinePayrollRepository(options){
 const {database,session,authorize,authorizeWrite,digest,employeeId,deviceId,projectId,protocol}=options,now=options.now||Date.now;
 if(options.development!==true||!/^demo-[a-z0-9-]+$/.test(projectId||'')||!database?.transaction||!payrollId(employeeId)||!payrollId(deviceId)||typeof digest!=='function'||typeof authorize!=='function')payrollFail('Cần SQLite owner và Runtime Development hiện có.','permission-denied');
 const scope=Object.freeze({...session.scope}),keys=[scope.tenantId,scope.principalId],ready=protocol?.version===1&&protocol.serverRecompute===true&&protocol.compoundCAS===true&&protocol.atomicOutbox===true&&protocol.receiptDispatch===true&&typeof authorizeWrite==='function';
 const check=signal=>{if(signal?.aborted)throw Object.assign(Error('Đã hủy đọc lương.'),{name:'AbortError'});if(!session.isCurrent(scope)||Object.keys(scope).some(k=>scope[k]!==session.scope[k]))payrollFail('Phiên lương đã đóng.','permission-denied');};
 async function access(kind='payroll.read'){
  check();const grant=await(kind==='payroll.read'?authorize:authorizeWrite)({scope,kind:kind==='payroll.read'?'home.read':kind});check();
  if(grant?.projectId!==projectId||!Number.isSafeInteger(grant.expiresAtMs)||now()>=grant.expiresAtMs||!['tenantId','principalId','permissionRevision','sessionId'].every(k=>scope[k]===grant[k])||grant.appSession?.user?.id!==employeeId||grant.appSession.user.companyId!==scope.tenantId||grant.appSession.sourceProfile!==undefined||!['home.read','home.payroll.read',PAYROLL_COMPANY_READ,...(kind==='payroll.read'?[]:[PAYROLL_COMMAND_CAPS[kind]])].every(c=>c&&grant.capabilities?.includes(c)))payrollFail('Thiếu quyền lương toàn công ty có chữ ký hoặc phiên đã hết hạn.','permission-denied');
  if(kind!=='payroll.read'&&!payrollManager(grant.appSession.user,grant.appSession.user))payrollFail('Vai trò không được chốt/điều chỉnh kỳ lương.','permission-denied');return grant;
 }
 const tx=work=>database.transaction(async db=>{await access();const value=await work(db);await access();return value;});
 await tx(async db=>{
  await db.run('CREATE TABLE IF NOT EXISTS offline_payroll_documents_v1 (tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,source TEXT NOT NULL,id TEXT NOT NULL,local_json TEXT NOT NULL,server_json TEXT,last_command_id TEXT NOT NULL,PRIMARY KEY(tenant_id,principal_id,source,id))');
  await db.run('CREATE TABLE IF NOT EXISTS offline_payroll_receipts_v1 (tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,command_id TEXT NOT NULL,entity_id TEXT NOT NULL,receipt_json TEXT NOT NULL,PRIMARY KEY(tenant_id,principal_id,command_id))');
 });
 async function head(db){
  const h=(await db.query(`SELECT h.generation,json_extract(h.snapshot_json,'$.feedGeneration') AS feed_generation,json_extract(h.snapshot_json,'$.feedSeq') AS seq,json_extract(h.snapshot_json,'$.sourceProfile') AS profile,json_extract(h.snapshot_json,'$.availableSources') AS sources,json_extract(h.snapshot_json,'$.sourceCounts') AS counts,c.applied_seq,c.reported_seq FROM offline_home_head_v1 h JOIN offline_home_feed_checkpoint_v1 c ON c.tenant_id=h.tenant_id AND c.principal_id=h.principal_id AND c.revision=h.revision AND c.generation=h.generation WHERE h.tenant_id=? AND h.principal_id=? AND h.revision=?`,[...keys,scope.permissionRevision]))[0];
  if(!h||!payrollId(h.generation)||h.generation!==h.feed_generation||!Number.isSafeInteger(h.seq)||h.seq<0||h.seq!==h.applied_seq||h.seq!==h.reported_seq||(h.profile??'legacy-v1')!=='legacy-v1')payrollFail('Checkpoint lương chưa hoàn tất hoặc nguồn không thuộc mô hình legacy.','source-catchup');
  const available=JSON.parse(h.sources||'null'),counts=JSON.parse(h.counts||'null');for(const source of PAYROLL_INPUT_SOURCES)if(!available?.includes(source)||!Number.isSafeInteger(counts?.[source])||counts[source]<0)payrollFail('Thiếu nguồn lương hoàn tất '+source,'source-catchup');return {generation:h.generation,seq:h.seq,counts};
 }
 async function complete(db,signal,resolvesConflictId=null){
  check(signal);const h=await head(db),rows=await db.query(`SELECT source,id,body FROM offline_home_feed_records_v1 WHERE tenant_id=? AND principal_id=? AND generation=? AND seq<=? AND source IN (${PAYROLL_INPUT_SOURCES.map(()=>'?').join(',')}) ORDER BY source COLLATE BINARY,id COLLATE BINARY`,[...keys,h.generation,h.seq,...PAYROLL_INPUT_SOURCES]);check(signal);
  const sources=Object.fromEntries(PAYROLL_INPUT_SOURCES.map(s=>[s,[]]));let bytes=0;for(const row of rows){bytes+=row.body.length;if(bytes>64*1024*1024)payrollFail('Nguồn lương quá lớn để chốt an toàn trên thiết bị.');const d=JSON.parse(row.body);if(d.id!==row.id)payrollFail('Định danh nguồn lương không khớp.');sources[row.source].push(d);}
  for(const source of PAYROLL_INPUT_SOURCES)if(sources[source].length!==h.counts[source])payrollFail('Nguồn lương thiếu bản ghi '+source,'source-catchup');
  const data=validatePayrollSources(sources,scope.tenantId),next=await head(db);if(next.generation!==h.generation||next.seq!==h.seq)payrollFail('Checkpoint lương đổi trong lúc đọc.','source-catchup');check(signal);
  const inputFingerprint=await digest(canonicalPayroll(data));let reviewed=null;
  if(resolvesConflictId){const row=(await db.query('SELECT receipt_json FROM offline_payroll_receipts_v1 WHERE tenant_id=? AND principal_id=? AND command_id=?',[...keys,resolvesConflictId]))[0];reviewed=row&&JSON.parse(row.receipt_json);if(reviewed?.outcome!=='conflict'||reviewed.currentInputFingerprint!==inputFingerprint)payrollFail('Nguồn chưa khớp receipt đối chiếu hoặc đã đổi tiếp; không tự rebase.','source-catchup');}
  // Official projections require the complete feed to contain accepted compound
  // outputs. Pending local documents never masquerade as closed payroll.
  const accepted=await db.query('SELECT source,id,server_json FROM offline_payroll_documents_v1 WHERE tenant_id=? AND principal_id=? AND server_json IS NOT NULL',[...keys]);
  for(const row of accepted){if(row.source==='activityLogs')continue; // Output-only audit proof remains in the immutable receipt, not a fabricated feed.
   const source=data[row.source]?.find(d=>d.id===row.id)||null,comparison=reviewed?.current.find(w=>w.source===row.source&&w.id===row.id);const expected=comparison?comparison.body:JSON.parse(row.server_json);if(canonicalPayroll(source)!==canonicalPayroll(expected))payrollFail('Chờ Home feed nhận đủ snapshot/kỳ/dư nợ đã chốt hoặc đối chiếu thay đổi nguồn.','source-catchup');}
  return {sources:data,checkpoint:{generation:h.generation,seq:h.seq},inputFingerprint};
 }
 async function pending(db,resolvesConflictId,currentId=null){
  const rows=await db.query(`SELECT c.command_id,c.kind,c.state FROM local_commands c WHERE c.tenant_id=? AND c.principal_id=? AND c.state!='SYNCED' AND NOT EXISTS (SELECT 1 FROM local_commands resolved WHERE resolved.tenant_id=c.tenant_id AND resolved.principal_id=c.principal_id AND json_extract(resolved.payload_json,'$.resolvesConflictId')=c.command_id)`,keys);
  if(rows.some(r=>r.command_id!==currentId&&(r.command_id!==resolvesConflictId||r.state!=='CONFLICT_REQUIRES_REVIEW'||!PAYROLL_COMMAND_CAPS[r.kind])))payrollFail('Còn thao tác chưa xác nhận hoặc xung đột chưa đối chiếu; chưa chốt lương.');
 }
 function store(uuid=options.uuid){return createOfflineCommandRepository({...options,uuid,authorize:request=>access(request.kind),
  async onEnqueue(db,command){
   const p=validatePayrollPayload(command.kind,command.payload);await access(command.kind);await pending(db,p.resolvesConflictId,command.commandId);
   const current=await complete(db,undefined,p.resolvesConflictId);if(canonicalPayroll(current.checkpoint)!==canonicalPayroll(p.checkpoint)||current.inputFingerprint!==p.inputFingerprint)payrollFail('Nguồn lương đã đổi sau khi kiểm tra; nạp lại trước khi lưu.','source-catchup');
   if(p.resolvesConflictId){const row=(await db.query('SELECT receipt_json FROM offline_payroll_receipts_v1 WHERE tenant_id=? AND principal_id=? AND command_id=?',[...keys,p.resolvesConflictId]))[0],receipt=row&&JSON.parse(row.receipt_json);if(receipt?.outcome!=='conflict'||receipt.currentFingerprint!==p.baseFingerprint||receipt.currentInputFingerprint!==p.inputFingerprint)payrollFail('Cần đối chiếu lại cả kế hoạch compound với receipt máy chủ.');}
   for(const w of p.plan.writes)await db.run('INSERT INTO offline_payroll_documents_v1 VALUES (?,?,?,?,?,?,?) ON CONFLICT(tenant_id,principal_id,source,id) DO UPDATE SET local_json=excluded.local_json,last_command_id=excluded.last_command_id',[...keys,w.source,w.id,JSON.stringify(w.body),null,command.commandId]);
  },
  async onReceipt(db,{commandId,entityId,receipt}){
   await access();const saved=(await db.query('SELECT kind,payload_json FROM local_commands WHERE tenant_id=? AND principal_id=? AND command_id=?',[...keys,commandId]))[0];if(!saved||!PAYROLL_COMMAND_CAPS[saved.kind]||receipt.entityId!==entityId||receipt.kind!==saved.kind||receipt.commandId!==commandId||receipt.tenantId!==scope.tenantId||receipt.principalId!==scope.principalId)payrollFail('Receipt compound lương sai lệnh/phạm vi.');
   const p=validatePayrollPayload(saved.kind,JSON.parse(saved.payload_json));
   if(receipt.outcome==='accepted'){
    if(canonicalPayroll(receipt.writes)!==canonicalPayroll(p.plan.writes)||await digest(canonicalPayroll(receipt.writes))!==receipt.fingerprint||!validPayrollServerTime(receipt.closedAtServer))payrollFail('Receipt máy chủ thay kế hoạch lương đã kiểm tra.');
    for(const w of acceptedPayrollWrites(receipt))await db.run('UPDATE offline_payroll_documents_v1 SET local_json=?,server_json=? WHERE tenant_id=? AND principal_id=? AND source=? AND id=? AND last_command_id=?',[JSON.stringify(w.body),JSON.stringify(w.body),...keys,w.source,w.id,commandId]);
   }else if(receipt.outcome==='conflict'){
    if(!Array.isArray(receipt.current)||await digest(canonicalPayroll(receipt.current))!==receipt.currentFingerprint||!/^[a-f0-9]{64}$/.test(receipt.currentInputFingerprint))payrollFail('Bản CAS đối chiếu máy chủ không hợp lệ.');
    for(const row of receipt.current)if(row.body!==null&&(row.body?.companyId!==scope.tenantId||row.body.id!==row.id))payrollFail('Bản xung đột ngoài công ty hoặc sai định danh.','permission-denied');
   }else payrollFail('Receipt lương thiếu kết quả có thể đối chiếu.');
   await db.run('INSERT INTO offline_payroll_receipts_v1 VALUES (?,?,?,?,?)',[...keys,commandId,entityId,JSON.stringify(plainPayroll(receipt))]);
  }
 });}
 const commands=store();
 return Object.freeze({scope,employeeId,ready,protocolVersion:ready?1:0,applyReceipt:commands.applyReceipt,
  verifyReadAccess:()=>access(),
  async load(monthKey,{signal,resolvesConflictId=null}={}){if(!payrollMonth(monthKey))payrollFail('Tháng lương không hợp lệ.');return tx(db=>complete(db,signal,resolvesConflictId));},
  async prepare(kind,values,{mutationId,editedAt,resolvesConflictId=null}={}){
   if(!ready)payrollFail('Chưa nối recompute/CAS/receipt lương; chưa ghi ý định.');await access(kind);if(!payrollId(mutationId))payrollFail('Thiếu mã thao tác bất biến.');
   return tx(async db=>{await pending(db,resolvesConflictId);const input=await complete(db,undefined,resolvesConflictId),plan=planPayroll(input.sources,kind,values,{tenantId:scope.tenantId,employeeId},{editedAt,mutationId}),payload=validatePayrollPayload(kind,{version:1,values:plainPayroll(values),editedAt,employeeId,checkpoint:input.checkpoint,inputFingerprint:input.inputFingerprint,baseFingerprint:await digest(canonicalPayroll(plan.base)),plan,resolvesConflictId});return {mutationId,kind,payload};});
  },
  async enqueue(prepared){
   if(!ready||!payrollId(prepared?.mutationId))payrollFail('Chưa có kế hoạch lương đã kiểm tra.');const {kind,payload:p,mutationId}=prepared;validatePayrollPayload(kind,p);await access(kind);
   const previous=await tx(async db=>(await db.query('SELECT kind,entity_id,payload_json,state FROM local_commands WHERE tenant_id=? AND principal_id=? AND command_id=?',[...keys,mutationId]))[0]);
   if(previous){if(previous.kind!==kind||previous.entity_id!==p.plan.periodId||previous.payload_json!==JSON.stringify(p))payrollFail('Mã thao tác đã dùng cho ý định khác.');return {commandId:mutationId,entityId:p.plan.periodId,state:previous.state};}
   const result={...await store(()=>mutationId).enqueue({kind,entityId:p.plan.periodId,baseRevision:0,payload:p}),entityId:p.plan.periodId};try{options.onQueued?.(result)?.catch?.(()=>{});}catch{}return result;
  },
  async page({after='',limit=20}={}){if(typeof after!=='string'||!Number.isInteger(limit)||limit<1||limit>20)payrollFail('Trang hàng chờ lương không hợp lệ.');return tx(async db=>{const rows=await db.query("SELECT c.command_id,c.entity_id,c.kind,c.state,c.payload_json,r.receipt_json FROM local_commands c LEFT JOIN offline_payroll_receipts_v1 r ON r.tenant_id=c.tenant_id AND r.principal_id=c.principal_id AND r.command_id=c.command_id WHERE c.tenant_id=? AND c.principal_id=? AND c.kind IN ('payroll.lock','payroll.adjust')"+(after?' AND c.command_id<?':'')+' ORDER BY c.command_id DESC LIMIT ?',[...keys,...(after?[after]:[]),limit+1]);return {items:rows.slice(0,limit).map(r=>({commandId:r.command_id,entityId:r.entity_id,kind:r.kind,state:r.state,monthKey:JSON.parse(r.payload_json).values.monthKey,receipt:r.receipt_json?JSON.parse(r.receipt_json):null})),hasMore:rows.length>limit,cursor:rows.length>limit?rows[limit-1].command_id:null};});},
 });
}
