import {useEffect, useRef, useState} from 'react';
import {isEmployeeReviewEnabled} from '../../utils/companyEmployeeReviews.js';

export default function EmployeeReviewSettings({company, canManage = false, onSave}) {
  const companyId = company?.id || company?.companyId || '';
  const confirmed = isEmployeeReviewEnabled(company);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const inFlight = useRef(false);
  const lifetime = useRef(0);
  useEffect(() => {
    lifetime.current += 1; inFlight.current = false;
    setDraft(null); setBusy(false); setStatus('');
    return () => { lifetime.current += 1; };
  }, [companyId]);
  const enabled = draft?.companyId === companyId ? draft.enabled : confirmed;
  const changed = enabled !== confirmed;
  const save = async event => {
    event.preventDefault();
    if (!canManage || !companyId || !changed || inFlight.current) return;
    const session = lifetime.current;
    inFlight.current = true; setBusy(true); setStatus('');
    try {
      const result = await onSave?.({employeeReviewsEnabled:enabled});
      if (session !== lifetime.current) return;
      if (!result?.success || result?.queued || result?.pending) {
        setStatus(result?.message || 'Chưa có xác nhận từ máy chủ. Vui lòng kết nối mạng rồi lưu lại.');
        return;
      }
      setDraft(null);
      setStatus(enabled ? 'Đã bật Đánh giá cho công ty.' : 'Đã tắt Đánh giá cho công ty. Lương và lịch sử được giữ nguyên.');
    } catch {
      if (session === lifetime.current) setStatus('Chưa nhận được xác nhận lưu. Vui lòng kiểm tra kết nối và quyền Chủ doanh nghiệp.');
    } finally {
      if (session === lifetime.current) { inFlight.current = false; setBusy(false); }
    }
  };
  return <section className="bg-white p-4" aria-labelledby="employee-review-settings-title">
    <h2 id="employee-review-settings-title" className="text-base font-black text-slate-900">Đánh giá nhân sự</h2>
    <p className="mt-2 text-sm text-slate-600">Bật hoặc tắt riêng cho công ty này. Khi tắt, chức năng Đánh giá được ẩn và không nhận đánh giá mới.</p>
    <p className="mt-2 text-sm text-slate-600">Giữ nguyên dữ liệu lịch sử, cách tính lương và các bảng lương đã chốt.</p>
    <form onSubmit={save} className="mt-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <label id="employee-review-enabled-label" className="text-sm font-bold text-slate-900">Sử dụng Đánh giá</label>
        <button type="button" role="switch" aria-labelledby="employee-review-enabled-label" aria-checked={enabled} disabled={!canManage || busy || !companyId} onClick={() => {setDraft({companyId,enabled:!enabled});setStatus('');}} className="loyalty-power-switch" data-on={enabled}>
          <span className="loyalty-power-switch__label" aria-hidden="true">{enabled ? 'Bật' : 'Tắt'}</span><span className="loyalty-power-switch__thumb" />
        </button>
      </div>
      <p className="text-xs text-slate-500">{changed ? 'Thay đổi chưa lưu.' : confirmed ? 'Công ty đang sử dụng Đánh giá.' : 'Công ty đã tắt Đánh giá.'} Cần kết nối mạng để lưu cấu hình dùng chung.</p>
      {!canManage && <p className="text-sm text-slate-600">Chỉ Chủ doanh nghiệp được bật/tắt tính năng này.</p>}
      <button type="submit" disabled={!canManage || busy || !changed || !companyId} aria-busy={busy} className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Đang lưu…' : 'Lưu cài đặt Đánh giá'}</button>
      {status && <p role="status" className="text-sm text-slate-700">{status}</p>}
    </form>
  </section>;
}
