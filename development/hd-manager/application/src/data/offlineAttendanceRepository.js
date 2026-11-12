import {createOfflineCommandRepository} from './offlineCommandRepository.js';
import {createAttendanceExplicitRetry} from './attendanceExplicitRetry.js';

export const ATTENDANCE_PROTOCOL='offline-attendance-v1';
export const ATTENDANCE_COMMANDS=Object.freeze({'attendance.check_in':'in','attendance.check_out':'out'});
export function canonicalAttendance(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonicalAttendance).join(',')+']';
  return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalAttendance(value[key])).join(',')+'}';
}
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const fail=message=>{throw Error(message);};
const rev=body=>body?.offlineAttendanceRevision??0;
const known=kind=>Object.hasOwn(ATTENDANCE_COMMANDS,kind);
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const same=(a,b)=>['generation','seq','capturedAt','dayKey'].every(key=>a?.[key]===b?.[key]);
function validateMethod(method){
  const keys=method?.type==='wifi'?['type','ssid','bssid']:['type','latitude','longitude','accuracy'];
  if(!method||!['wifi','gps'].includes(method.type)||Object.keys(method).some(key=>!keys.includes(key))
    ||(method.type==='wifi'&&(typeof method.ssid!=='string'||method.ssid.length>256||typeof method.bssid!=='string'||method.bssid.length>64))
    ||(method.type==='gps'&&(![method.latitude,method.longitude].every(Number.isFinite)||Math.abs(method.latitude)>90||Math.abs(method.longitude)>180
      ||(method.accuracy!==undefined&&(!Number.isFinite(method.accuracy)||method.accuracy<0)))))fail('Chưa có bằng chứng WiFi/GPS hợp lệ từ bộ thu gốc.');
}

// Additive overlay inside the SAME encrypted owner. Only intents are queued;
// no local timestamp/status is ever written into confirmed attendance/Home rows.
export async function createOfflineAttendanceRepository(options){
  const {database,session,authorize,digest,employeeId,deviceId,projectId,development,captureMethod}=options;
  if(development!==true||!/^demo-[a-z0-9-]+$/.test(projectId||'')||!id(employeeId)||!id(deviceId)
    ||typeof captureMethod!=='function'||typeof digest!=='function')fail('Cần chủ Runtime Development và bộ thu bằng chứng chấm công gốc.');
  const scope=Object.freeze({...session.scope}),keys=[scope.tenantId,scope.principalId];
  const current=()=>{if(!session.isCurrent(scope)||Object.entries(scope).some(([key,value])=>session.scope[key]!==value))fail('Phiên chấm công đã đổi.');};
  const access=async(kind='read')=>{
    current();const grant=await authorize({scope,kind:kind==='read'?'home.read':kind});current();
    if(!grant||grant.projectId!==projectId||Object.entries(scope).some(([key,value])=>grant[key]!==value)
      ||!Number.isSafeInteger(grant.expiresAtMs)||(options.now||Date.now)()>=grant.expiresAtMs
      ||grant.appSession?.user?.id!==employeeId||grant.appSession?.user?.companyId!==scope.tenantId
      ||grant.appSession?.sourceProfile!==undefined
      ||!['home.read','home.payroll.read',...(kind==='read'?[]:[kind])].every(cap=>grant.capabilities?.includes(cap)))fail('Thiếu quyền chấm công có chữ ký còn hiệu lực.');
    return grant;
  };
  const tx=work=>database.transaction(async db=>{await access();const value=await work(db);await access();return value;});
  await access();
  await tx(db=>db.run(`CREATE TABLE IF NOT EXISTS offline_attendance_overlay_v1 (
    tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,command_id TEXT NOT NULL,entity_id TEXT NOT NULL,
    kind TEXT NOT NULL,intent_json TEXT NOT NULL,server_json TEXT,receipt_json TEXT,
    PRIMARY KEY(tenant_id,principal_id,command_id))`));
  const select=`SELECT o.*,c.state,c.created_at FROM offline_attendance_overlay_v1 o JOIN local_commands c
    ON c.tenant_id=o.tenant_id AND c.principal_id=o.principal_id AND c.command_id=o.command_id
    WHERE o.tenant_id=? AND o.principal_id=?`;
  const decode=row=>row?{commandId:row.command_id,entityId:row.entity_id,kind:row.kind,state:row.state,
    intent:JSON.parse(row.intent_json),serverDocument:row.server_json?JSON.parse(row.server_json):null,
    receipt:row.receipt_json?JSON.parse(row.receipt_json):null,provisional:row.state!=='SYNCED'}:null;
  const owned=(db,commandId)=>db.query(select+' AND o.command_id=? LIMIT 1',[...keys,commandId]).then(rows=>rows[0]);
  async function head(db){
    const h=(await db.query(`SELECT h.generation,h.captured_at,h.day_key,
      json_extract(h.snapshot_json,'$.feedGeneration','$.feedSeq','$.sourceProfile','$.availableSources') AS meta,
      c.applied_seq,c.reported_seq FROM offline_home_head_v1 h JOIN offline_home_feed_checkpoint_v1 c
      ON c.tenant_id=h.tenant_id AND c.principal_id=h.principal_id AND c.revision=h.revision AND c.generation=h.generation
      WHERE h.tenant_id=? AND h.principal_id=? AND h.revision=? LIMIT 1`,[...keys,scope.permissionRevision]))[0];
    const meta=h&&JSON.parse(h.meta);
    if(!h||meta[0]!==h.generation||!Number.isSafeInteger(meta[1])||h.applied_seq!==meta[1]||h.reported_seq!==meta[1]
      ||(meta[2]??'legacy-v1')!=='legacy-v1'||!meta[3]?.includes('attendance'))fail('Nguồn chấm công đang đổi/chưa hoàn tất.');
    return {generation:h.generation,seq:meta[1],capturedAt:h.captured_at,dayKey:h.day_key};
  }
  async function base(db,entityId){
    const cp=await head(db);
    const source=(await db.query(`SELECT CASE WHEN length(CAST(body AS BLOB))<=65536 THEN body END AS body,
      length(CAST(body AS BLOB)) AS bytes FROM offline_home_feed_records_v1
      WHERE tenant_id=? AND principal_id=? AND generation=? AND source='attendance' AND id=? AND seq<=? LIMIT 1`,
      [...keys,cp.generation,entityId,cp.seq]))[0];
    if(source&&!source.body)fail('Bản chấm công gốc quá lớn; không dùng bản bị cắt.');
    let document=source?JSON.parse(source.body):null;
    if(document&&(document.id!==entityId||document.companyId!==scope.tenantId))fail('Bản chấm công không thuộc phạm vi tài khoản.');
    const accepted=(await db.query(select+" AND o.entity_id=? AND c.state='SYNCED' AND o.server_json IS NOT NULL ORDER BY json_extract(o.server_json,'$.offlineAttendanceRevision') DESC,c.created_at DESC,o.command_id DESC LIMIT 1",[...keys,entityId]))[0];
    const confirmed=accepted&&JSON.parse(accepted.server_json);
    if(confirmed&&(!document||rev(confirmed)>rev(document)))document=confirmed;
    if(!same(cp,await head(db)))fail('Nguồn chấm công đã đổi trong khi đọc.');
    return document;
  }
  async function proof(db,entityId){
    const document=await base(db,entityId);
    if(!Number.isSafeInteger(rev(document))||rev(document)<0)fail('Phiên bản chấm công không hợp lệ.');
    return {document,baseFingerprint:document?await digest(canonicalAttendance(document)):null,baseRevision:rev(document),resolvesConflictId:null};
  }
  const commands=createOfflineCommandRepository({...options,authorize:request=>access(request.kind),
    async onEnqueue(db,command){
      if(!known(command.kind))fail('Không hỗ trợ thao tác chấm công này.');await access(command.kind);
      const p=command.payload;
      if(!p||p.version!==1||Object.keys(p).some(key=>!['version','employeeId','deviceId','workDate','workRole','method','baseRevision','baseFingerprint','resolvesConflictId'].includes(key))
        ||p.employeeId!==employeeId||p.deviceId!==deviceId||command.entityId!==`${p.workDate}_${employeeId}`||!day(p.workDate)
        ||!p.workRole?.trim()||p.workRole.length>160||!Number.isSafeInteger(p.baseRevision)||p.baseRevision<0)fail('Yêu cầu chấm công không khớp danh tính.');
      validateMethod(p.method);
      const pending=await db.query(select+" AND o.entity_id=? AND c.state IN ('PENDING_SYNC','SYNCING') LIMIT 1",[...keys,command.entityId]);
      if(pending.length)fail('Đã có yêu cầu chấm công ngày này đang chờ. Không ghi đè ý định.');
      if(p.resolvesConflictId){
        const row=await owned(db,p.resolvesConflictId),r=row?.receipt_json&&JSON.parse(row.receipt_json);
        if(row?.state==='SYNC_FAILED'&&r?.outcome==='rejected'&&row.entity_id===command.entityId){
          const refreshed=await proof(db,command.entityId);
          if(refreshed.baseFingerprint!==p.baseFingerprint||refreshed.baseRevision!==p.baseRevision)fail('Bản chấm công đã đổi sau khi xem biên nhận từ chối.');
        }else if(row?.state!=='CONFLICT_REQUIRES_REVIEW'||row.entity_id!==command.entityId||r.currentFingerprint!==p.baseFingerprint
          ||r.currentRevision!==p.baseRevision)fail('Bản xung đột đã đổi; cần xem lại bản máy chủ.');
      }else{
        // Retain old error rows permanently, but an accepted explicit review
        // settles that exact parent chain. Do not block all future checkout
        // requests merely because an already-resolved conflict still exists.
        const latest=(await db.query(`WITH RECURSIVE settled(id) AS (
          SELECT json_extract(s.intent_json,'$.resolvesConflictId') FROM offline_attendance_overlay_v1 s
          JOIN local_commands sc ON sc.tenant_id=s.tenant_id AND sc.principal_id=s.principal_id AND sc.command_id=s.command_id
          WHERE s.tenant_id=? AND s.principal_id=? AND s.entity_id=? AND sc.state='SYNCED' AND json_type(s.intent_json,'$.resolvesConflictId')='text'
          UNION SELECT json_extract(p.intent_json,'$.resolvesConflictId') FROM offline_attendance_overlay_v1 p JOIN settled r ON p.command_id=r.id
          WHERE p.tenant_id=? AND p.principal_id=? AND p.entity_id=? AND json_type(p.intent_json,'$.resolvesConflictId')='text') `+select+
          " AND o.entity_id=? AND c.state IN ('CONFLICT_REQUIRES_REVIEW','SYNC_FAILED') AND o.command_id NOT IN (SELECT id FROM settled) LIMIT 1",[...keys,command.entityId,...keys,command.entityId,...keys,command.entityId]))[0];
        if(latest)fail('Giữ nguyên yêu cầu lỗi/xung đột; cần xem biên nhận trước khi lập yêu cầu khác.');
        const currentProof=await proof(db,command.entityId);
        if(currentProof.baseFingerprint!==p.baseFingerprint||currentProof.baseRevision!==p.baseRevision)fail('Bản chấm công đã đổi. Bản nhập vẫn được giữ.');
      }
      await db.run('INSERT INTO offline_attendance_overlay_v1 VALUES (?,?,?,?,?,?,NULL,NULL)',[...keys,command.commandId,command.entityId,command.kind,JSON.stringify(p)]);
      await options.beforeEnqueueCommit?.(db,command);await access(command.kind);
    },
    async onReceipt(db,{commandId,entityId,receipt}){
      await access();const row=await owned(db,commandId);
      if(!row||row.entity_id!==entityId||receipt.entityId!==entityId||receipt.kind!==row.kind)fail('Biên nhận chấm công không khớp ý định.');
      const p=JSON.parse(row.intent_json);
      if(receipt.baseRevision!==p.baseRevision||receipt.workRole!==p.workRole)fail('Biên nhận chấm công sai ca/phiên bản.');
      if(receipt.outcome==='accepted'){
        const document=receipt.document,record=document?.workRoles?.[p.workRole]||document;
        if(!document||document.companyId!==scope.tenantId||document.id!==entityId||receipt.workDate!==p.workDate
          ||!record?.[row.kind==='attendance.check_in'?'checkIn':'checkOut']
          ||rev(document)!==p.baseRevision+(receipt.duplicate===true?0:1)
          ||await digest(canonicalAttendance(document))!==receipt.fingerprint)fail('Bản chấm công được xác nhận không hợp lệ.');
      }
      if(receipt.currentDocument&&(receipt.currentDocument.id!==entityId||receipt.currentDocument.companyId!==scope.tenantId))fail('Xung đột chấm công khác phạm vi.');
      if(receipt.currentDocument&&await digest(canonicalAttendance(receipt.currentDocument))!==receipt.currentFingerprint)fail('Dấu kiểm chứng bản chấm công xung đột không khớp.');
      await db.run('UPDATE offline_attendance_overlay_v1 SET server_json=?,receipt_json=? WHERE tenant_id=? AND principal_id=? AND command_id=?',
        [receipt.outcome==='accepted'?JSON.stringify(receipt.document):null,JSON.stringify(receipt),...keys,commandId]);
      await options.beforeReceiptCommit?.(db,{commandId,receipt});await access();
    },
  });
  const retry=createAttendanceExplicitRetry({database,session,digest,uuid:options.uuid,authorize:kind=>access(kind),validate:row=>{const p=JSON.parse(row.payload_json);if(!known(row.kind)||p.version!==1||p.employeeId!==employeeId||p.deviceId!==deviceId||row.entity_id!==`${p.workDate}_${employeeId}`||!day(p.workDate)||!p.workRole?.trim())fail('Yêu cầu chấm công không khớp danh tính.');validateMethod(p.method);}});
  return Object.freeze({protocol:ATTENDANCE_PROTOCOL,employeeId,claimFailed:retry.claim,authorizeExplicitRetry:retry.authorize,
    async retryFailed(commandId){if(typeof options.retryFailedCommand!=='function')fail('Chưa nối gửi lại cùng ý định.');return options.retryFailedCommand(await retry.prepare(commandId));},
    claimDue:commands.claimDue,failLease:commands.failLease,countPending:commands.countPending,
    async prepare({workDate,workRole}){
      if(!day(workDate)||typeof workRole!=='string'||!workRole.trim()||workRole.length>160)fail('Chọn ngày ca và công việc hợp lệ.');
      await access();return tx(async db=>({...await proof(db,`${workDate}_${employeeId}`),workDate,workRole,entityId:`${workDate}_${employeeId}`}));
    },
    async request({kind,workDate,workRole,reviewedConflict=null}){
      if(!known(kind)||!day(workDate)||typeof workRole!=='string'||!workRole.trim()||workRole.length>160)fail('Chỉ hỗ trợ tự chấm vào/ra với ngày ca/công việc hợp lệ.');await access(kind);
      let prepared;
      if(reviewedConflict){
        const row=await tx(db=>owned(db,reviewedConflict.commandId)),r=row?.receipt_json&&JSON.parse(row.receipt_json);
        if(row?.state==='SYNC_FAILED'&&r?.outcome==='rejected'&&reviewedConflict.outcome==='rejected'&&row.entity_id===`${workDate}_${employeeId}`){
          prepared={...await this.prepare({workDate,workRole}),resolvesConflictId:row.command_id};
        }else{
          if(row?.state!=='CONFLICT_REQUIRES_REVIEW'||r.reason!=='attendance-changed'||r.currentFingerprint!==reviewedConflict.currentFingerprint
            ||r.currentRevision!==reviewedConflict.currentRevision||row.entity_id!==`${workDate}_${employeeId}`)fail('Phải xem đúng bản máy chủ xung đột trước khi gửi lại.');
          prepared={baseRevision:r.currentRevision,baseFingerprint:r.currentFingerprint,resolvesConflictId:row.command_id};
        }
      }else prepared=await this.prepare({workDate,workRole});
      // This adapter must call original WiFi/GPS collection, not typed coordinates.
      // No ID token or trusted-device secret is accepted in durable method data.
      const method=JSON.parse(JSON.stringify(await captureMethod({kind,workRole})));validateMethod(method);await access(kind);
      const payload={version:1,employeeId,deviceId,workDate,workRole,method,baseRevision:prepared.baseRevision,
        baseFingerprint:prepared.baseFingerprint,resolvesConflictId:prepared.resolvesConflictId||null};
      return {...await commands.enqueue({kind,entityId:`${workDate}_${employeeId}`,baseRevision:payload.baseRevision,payload}),localDurable:true};
    },
    async command(commandId){if(!id(commandId))fail('Mã yêu cầu không hợp lệ.');await access();return tx(async db=>decode(await owned(db,commandId)));},
    async page({limit=20}={}){if(!Number.isInteger(limit)||limit<1||limit>40)fail('Giới hạn yêu cầu không hợp lệ.');await access();return tx(async db=>(await db.query(select+' ORDER BY c.created_at DESC,o.command_id DESC LIMIT ?',[...keys,limit])).map(decode));},
    async applyReceipt(candidate,command,receipt){if(!known(command.kind)||receipt.kind!==command.kind)fail('Sai loại biên nhận chấm công.');return commands.applyReceipt(candidate,command,receipt);},
  });
}
