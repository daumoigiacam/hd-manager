import React from 'react';
import {HDButton,HDCard,HDDateInput,HDInput} from '../../design-system/index.js';

// Controlled by the retained Finance workspace. No effect seeds/replaces a
// draft on Activity reattach, source refresh, auth callback or sync receipt.
export default function OfflineCashflowEditor({draft,onChange,onSave,onClose,onDiscard}) {
  const income=draft.source === 'payments';
  return <HDCard className="space-y-4 p-4" aria-label="Bản nhập thu chi">
    <h2 className="text-lg font-bold">{draft.mode === 'create' ? 'Tạo' : draft.mode === 'resolve' ? 'Xử lý xung đột' : 'Sửa'} {income ? 'báo thu tiền mặt' : 'khoản chi thủ công'}</h2>
    <p className="text-sm text-amber-900">{income ? 'Khoản thu sẽ chờ xác nhận; chưa trừ nợ. Không hỗ trợ liên kết đơn hay xác nhận thanh toán.' : 'Chỉ phiếu chi thủ công, không liên kết tài sản/giao hàng/trả nợ. Máy chủ xác định trạng thái theo quyền thực tế.'}</p>
    {draft.serverInput && <div className="rounded-xl bg-amber-50 p-3 text-sm"><strong>Bản máy chủ gây xung đột</strong><p>Số tiền: {draft.serverInput.amount ?? 'Chưa có'} · Ngày: {draft.serverInput.date || 'Chưa có'}</p><p className="break-words">{draft.serverInput.note || 'Chưa có ghi chú'}</p><p>Bản nhập của bạn được giữ ở dưới. Gửi lại tạo lệnh mới dựa trên bản máy chủ đã xem; thay đổi mới hơn vẫn có thể xung đột.</p></div>}
    <form className="space-y-3" onSubmit={event => {event.preventDefault();void onSave();}}>
      <HDInput label="Số tiền (VND nguyên)" inputMode="numeric" value={draft.input.amount} disabled={draft.saving || draft.submitted} onChange={event => onChange('amount',event.target.value)}/>
      <HDDateInput label="Ngày tài chính" value={draft.input.date} disabled={draft.saving || draft.submitted} onChange={event => onChange('date',event.target.value)}/>
      {income ? <><HDInput label="Mã khách hàng" value={draft.input.customerId} maxLength={160} disabled={draft.saving || draft.submitted} onChange={event => onChange('customerId',event.target.value)}/><p className="text-xs text-slate-600">Nhập đúng mã khách hàng; máy chủ kiểm tra quan hệ công ty. Hình thức: Tiền mặt.</p></>
        : <HDInput label="Khoản chi" value={draft.input.category} maxLength={200} disabled={draft.saving || draft.submitted} onChange={event => onChange('category',event.target.value)}/>}
      <HDInput label="Ghi chú" value={draft.input.note} maxLength={2000} disabled={draft.saving || draft.submitted} onChange={event => onChange('note',event.target.value)}/>
      {draft.error && <p role="alert">{draft.error} Nội dung đang nhập được giữ nguyên.</p>}
      {draft.message && <p role="status">{draft.message}</p>}
      <div className="flex flex-wrap gap-2"><HDButton type="submit" loading={draft.saving} disabled={draft.submitted}>Lưu trên thiết bị, chờ máy chủ</HDButton><HDButton variant="secondary" onClick={onClose}>Đóng, giữ bản nhập</HDButton><HDButton variant="secondary" disabled={draft.saving} onClick={onDiscard}>Bỏ bản nhập</HDButton></div>
    </form>
  </HDCard>;
}
