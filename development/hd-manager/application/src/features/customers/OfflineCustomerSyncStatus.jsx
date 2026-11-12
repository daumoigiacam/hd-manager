import React, {useState} from 'react';

const labels = {
  LOCAL_ONLY: 'Đã lưu trên máy', PENDING_SYNC: 'Đã lưu trên máy · Chờ đồng bộ',
  SYNCING: 'Đang đồng bộ', SYNCED: 'Đã đồng bộ',
  SYNC_FAILED: 'Đồng bộ thất bại · Dữ liệu vẫn trên máy',
  CONFLICT_REQUIRES_REVIEW: 'Cần xử lý xung đột',
};

// Uses the existing repository conflict command and receipt. No second queue or
// automatic last-write-wins choice; the user explicitly chooses profile fields.
export default function OfflineCustomerSyncStatus({runtime, record, canResolve, onCommitted, onError}) {
  const [conflict, setConflict] = useState(null);
  const [busy, setBusy] = useState(false);
  const current = () => {if (!runtime.isCurrent()) throw new Error('Phiên CRM đã hết hiệu lực.');};
  async function inspect(event) {
    event.stopPropagation(); setBusy(true);
    try {
      current();
      const local = await runtime.repository.detail(record.id);
      const server = await runtime.repository.conflict(record.id);
      current();
      if (!local || !server) throw new Error('Không còn xung đột cần xử lý.');
      setConflict({local, server});
    } catch (error) {onError(error.message);} finally {setBusy(false);}
  }
  async function resolve(choice) {
    setBusy(true);
    try {
      current();
      if (!canResolve) throw new Error('Không có quyền chỉnh sửa khách hàng.');
      const value = choice === 'server' ? conflict.server.currentDocument : conflict.local;
      if (!value) throw new Error('Hồ sơ máy chủ không còn tồn tại; cần xử lý riêng.');
      await onCommitted(runtime.repository.resolveConflict(record.id, {
        name: value.name, phone: value.phone, address: value.address || '',
      }));
      current(); setConflict(null);
    } catch (error) {onError(error.message);} finally {setBusy(false);}
  }
  return <div className="text-xs text-slate-600 py-2" data-sync-state={record.localSyncState}>
    {labels[record.localSyncState] || record.localSyncState}
    {record.localSyncState === 'CONFLICT_REQUIRES_REVIEW' && <button type="button" disabled={busy} className="ml-2 text-blue-700 underline" onClick={inspect}>Xem và xử lý</button>}
    {conflict && <div role="dialog" aria-label="Xử lý xung đột khách hàng" className="fixed inset-0 z-50 bg-white p-6 overflow-auto" onClick={event => event.stopPropagation()}>
      <h2>Xác nhận dữ liệu khách hàng</h2>
      <p>Máy chủ: {conflict.server.currentDocument?.name} · {conflict.server.currentDocument?.phone} · {conflict.server.currentDocument?.address}</p>
      <p>Trên máy: {conflict.local.name} · {conflict.local.phone} · {conflict.local.address}</p>
      <p>Chọn tên, điện thoại và địa chỉ muốn gửi. Máy chủ vẫn kiểm tra lại trước khi ghi. Receipt xung đột cũ được giữ nguyên.</p>
      {['server', 'local'].map(choice => <button type="button" className="block p-3" disabled={busy || !canResolve} key={choice} onClick={() => void resolve(choice)}>{choice === 'server' ? 'Giữ thông tin máy chủ' : 'Gửi tên, điện thoại, địa chỉ trên máy'}</button>)}
      <button type="button" disabled={busy} onClick={() => setConflict(null)}>Đóng, chưa xử lý</button>
    </div>}
  </div>;
}
