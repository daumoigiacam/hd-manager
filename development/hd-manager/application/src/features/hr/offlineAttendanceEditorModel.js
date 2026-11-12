import {ATTENDANCE_PROTOCOL,ATTENDANCE_COMMANDS} from '../../data/offlineAttendanceRepository.js';
import {businessDayKey} from '../../utils/businessDate.js';

export function attendanceWriteAccess(runtime,repository,kind){
  const user=runtime?.appSession?.currentUser;
  if(!user||!runtime?.scope||!runtime?.isCurrent?.()||Date.now()>=runtime.expiresAtMs||!Number.isFinite(runtime.expiresAtMs)
    ||user?.firebaseUid!==runtime.scope?.principalId||user?.companyId!==runtime.scope?.tenantId
    ||runtime.appSession.sourceProfile!==undefined)return 'Phiên tự chấm công không còn hợp lệ.';
  if(!Object.hasOwn(ATTENDANCE_COMMANDS,kind)||!['home.read','home.payroll.read',kind].every(cap=>runtime.capabilities?.includes(cap)))return 'Chưa có quyền tự chấm vào/ra Offline có chữ ký.';
  if(repository?.protocol!==ATTENDANCE_PROTOCOL||repository.employeeId!==user.id||typeof repository.request!=='function'
    ||typeof repository.command!=='function'||typeof repository.page!=='function')return 'Giao thức/bộ thu bằng chứng chấm công gốc chưa được kết nối.';
  return '';
}
export function newAttendanceDraft(runtime,repository,kind,scopeKey){
  return {runtime,repository,scopeKey,kind,workDate:businessDayKey(Date.now()),workRole:runtime.appSession.currentUser.position||'',
    open:true,saving:false,submitted:false,commandId:null,row:null,reviewedConflict:null,error:'',message:''};
}
export async function submitAttendanceDraft(runtime,repository,draft){
  const denied=attendanceWriteAccess(runtime,repository,draft.kind);if(denied)throw Error(denied);
  const result=await repository.request({kind:draft.kind,workDate:draft.workDate,workRole:draft.workRole,reviewedConflict:draft.reviewedConflict});
  const changed=attendanceWriteAccess(runtime,repository,draft.kind);if(changed)throw Error(changed+' Cần kiểm tra hàng chờ trước khi gửi lại.');
  if(result.localDurable!==true||result.state!=='PENDING_SYNC'||typeof result.commandId!=='string')throw Error('Chưa xác nhận được lưu bền yêu cầu trên thiết bị.');
  return result;
}
export function attendanceConflictReview(row){
  const r=row?.receipt;
  if(row?.state==='SYNC_FAILED'&&r?.outcome==='rejected')return {commandId:row.commandId,outcome:'rejected'};
  if(row?.state!=='CONFLICT_REQUIRES_REVIEW'||r?.reason!=='attendance-changed'
    ||!(r.currentFingerprint===null||/^[a-f0-9]{64}$/.test(r.currentFingerprint))||!Number.isSafeInteger(r.currentRevision))throw Error('Xung đột này cần chọn lại ngày ca hoặc quy trình gốc; không tự ghi đè.');
  return {commandId:row.commandId,currentFingerprint:r.currentFingerprint,currentRevision:r.currentRevision};
}
