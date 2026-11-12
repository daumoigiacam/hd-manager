import {HDButton,HDCard,HDDateInput,HDInput} from '../../design-system/index.js';
import {attendanceRejectionMessage} from './attendanceRejectionMessage.js';

export default function OfflineAttendanceEditor({draft,onChange,onSave,onClose,onRefresh,onReview,onNew,onRetry}){
  const conflict=draft.row?.state==='CONFLICT_REQUIRES_REVIEW',receipt=draft.row?.receipt;
  const record=receipt?.currentDocument?.workRoles?.[draft.workRole]||receipt?.currentDocument;
  return <HDCard className="space-y-3 p-4" aria-label="Yêu cầu tự chấm công">
    <h2 className="font-bold">{draft.kind==='attendance.check_in'?'Yêu cầu chấm vào':'Yêu cầu chấm ra'}</h2>
    <p className="text-sm text-amber-900">Đây là yêu cầu chờ máy chủ, chưa phải giờ công. Máy chủ quyết định ngày ca, giờ và trạng thái theo ca gốc khi xử lý; không ghi giờ quá khứ. Chỉ tự chấm công, không chấm hộ, sửa công hay báo nghỉ.</p>
    <form className="space-y-3" onSubmit={event=>{event.preventDefault();void onSave();}}>
      <HDDateInput label="Ngày ca dự kiến (máy chủ sẽ kiểm tra)" value={draft.workDate} disabled={draft.saving||draft.submitted} onChange={event=>onChange('workDate',event.target.value)}/>
      <HDInput label="Công việc đã được phân công" value={draft.workRole} maxLength={160} disabled={draft.saving||draft.submitted} onChange={event=>onChange('workRole',event.target.value)}/>
      <p className="text-xs text-slate-600">WiFi/GPS cần được thu mới bởi bộ chấm công gốc khi gửi máy chủ. Không phát lại vị trí cũ để ghi giờ công; nếu chưa xác thực được thiết bị/vị trí hiện tại, yêu cầu vẫn chờ. Không nhập tọa độ hay lưu mật khẩu thiết bị trong bản nhập.</p>
      {draft.commandId&&<p className="break-words text-sm">Mã yêu cầu: {draft.commandId} · {draft.row?.state||'PENDING_SYNC'}</p>}
      {draft.row?.state==='SYNC_FAILED'&&!receipt&&<p role="alert">Chưa có biên nhận xác nhận. Yêu cầu vẫn được giữ; kiểm tra kết nối và đăng ký thiết bị trước khi gửi lại cùng mã.</p>}
      {receipt?.outcome==='accepted'&&<p role="status" className="text-sm text-emerald-800">Máy chủ đã xác nhận. Giờ nguồn: {(receipt.document?.workRoles?.[draft.workRole]||receipt.document)?.[draft.kind==='attendance.check_in'?'checkIn':'checkOut']||'Xem bản nguồn'}.</p>}
      {receipt?.outcome==='rejected'&&<p role="alert" className="text-sm text-rose-700">{attendanceRejectionMessage(receipt)} Không có giờ công mới; yêu cầu và bản nhập được giữ.</p>}
      {receipt?.outcome==='rejected'&&!draft.reviewedConflict&&<HDButton variant="secondary" onClick={onReview}>Đã xem biên nhận từ chối, chuẩn bị yêu cầu mới</HDButton>}
      {conflict&&<section className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm">
        <p>Công đã thay đổi hoặc ngày ca máy chủ khác ngày dự kiến. Không ghi đè bản máy chủ.</p>
        {receipt.reason==='server-work-date-changed'&&<p>Ngày ca máy chủ: {receipt.serverWorkDate}. Chọn lại ngày phù hợp trước khi lập yêu cầu mới.</p>}
        {draft.reviewedConflict&&<><strong>Bản máy chủ đã xem</strong><p>Chấm vào: {record?.checkIn||'Chưa có'} · Chấm ra: {record?.checkOut||'Chưa có'}</p><p>Gửi lại tạo lệnh CAS mới; thay đổi mới hơn vẫn sẽ xung đột.</p></>}
        {receipt.reason==='attendance-changed'&&!draft.reviewedConflict&&<HDButton variant="secondary" onClick={onReview}>Xem bản máy chủ để xử lý xung đột</HDButton>}
      </section>}
      {draft.error&&<p role="alert" className="text-sm text-rose-700">{draft.error} Nội dung nhập vẫn được giữ.</p>}
      {draft.message&&<p role="status" className="text-sm">{draft.message}</p>}
      <div className="flex flex-wrap gap-2">
        <HDButton type="submit" loading={draft.saving} disabled={draft.submitted||((conflict&&receipt.reason==='attendance-changed'||receipt?.outcome==='rejected')&&!draft.reviewedConflict)}>{draft.reviewedConflict?'Gửi yêu cầu mới theo biên nhận đã xem':'Lưu yêu cầu chờ máy chủ'}</HDButton>
        {draft.commandId&&<HDButton variant="secondary" disabled={draft.saving} onClick={onRefresh}>Kiểm tra biên nhận</HDButton>}
        {draft.row?.state==='SYNC_FAILED'&&!receipt&&onRetry&&<HDButton variant="secondary" disabled={draft.saving} onClick={onRetry}>Gửi lại cùng yêu cầu đã lưu</HDButton>}
        {receipt&&<HDButton variant="secondary" disabled={draft.saving} onClick={onNew}>Yêu cầu mới, giữ lịch sử cũ</HDButton>}
        <HDButton variant="secondary" onClick={onClose}>Đóng, giữ bản nhập</HDButton>
      </div>
    </form>
  </HDCard>;
}
