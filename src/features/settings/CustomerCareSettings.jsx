import { useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';

export const CARE_RULES = [
  ['inactive', 'Khách lâu chưa mua', 'Em chào anh/chị, lâu rồi chưa được phục vụ mình. Khi nào anh/chị cần hàng, cứ nhắn em để em hỗ trợ ạ.'],
  ['first_order', 'Khách mới', 'Em chào anh/chị, cảm ơn anh/chị đã tin tưởng và ủng hộ. Có gì cần hỗ trợ, anh/chị cứ liên hệ em ạ.'],
  ['delivered', 'Sau khi giao hàng', 'Em chào anh/chị, em xin phép hỏi thăm đơn hàng mình nhận đã đầy đủ và thuận tiện chưa ạ?'],
  ['birthday', 'Sinh nhật khách hàng', 'HD CONNECT kính chúc anh/chị sinh nhật vui vẻ, nhiều sức khỏe, hạnh phúc và thành công ạ!'],
  ['holiday', 'Ngày lễ', 'HD CONNECT kính chúc anh/chị và gia đình một ngày lễ vui vẻ, bình an và nhiều sức khỏe ạ!'],
  ['payment', 'Sau khi nhận khoản thanh toán', 'Em cảm ơn anh/chị đã thanh toán. Rất cảm ơn anh/chị đã luôn tin tưởng và đồng hành cùng chúng em ạ.'],
];

export default function CustomerCareSettings({ company, selected, onSelect, onSave, canEdit }) {
  const rule = CARE_RULES.find(([id]) => id === selected);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const lock = useRef(false);
  const open = (id, message) => {
    setDraft({ enabled: false, sender: 'company', inactiveDays: 7, holidayDates: [], message, ...company?.customerCareRules?.[id] });
    setStatus('');
    onSelect(id);
  };
  const save = async event => {
    event.preventDefault();
    if (!canEdit || lock.current) return;
    if (!draft.message.trim()) { setStatus('Vui lòng nhập nội dung tin nhắn.'); return; }
    if (selected === 'holiday' && !draft.holidayDates.length) { setStatus('Vui lòng chọn ít nhất một ngày lễ.'); return; }
    lock.current = true;
    setBusy(true);
    setStatus('');
    try {
      const previous = company?.customerCareRules?.[selected];
      const result = await onSave({ customerCareRules: {
        ...company?.customerCareRules,
        [selected]: { ...draft, message: draft.message.trim(), inactiveDays: Math.max(1, Number(draft.inactiveDays) || 7), enabledAt: draft.enabled ? (previous?.enabled && previous.enabledAt || new Date().toISOString()) : null },
      } });
      setStatus(result?.success ? 'Đã lưu.' : result?.message || 'Chưa lưu được.');
    } catch (error) { setStatus(error?.code === 'firestore/sync-pending' ? 'Máy chủ chưa xác nhận. Cài đặt đang chờ đồng bộ.' : error.message || 'Không thể lưu.'); }
    finally { lock.current = false; setBusy(false); }
  };
  if (!rule || !draft) return <div className="divide-y divide-gray-200">
    {CARE_RULES.map(([id, title, message]) => <button key={id} type="button" onClick={() => open(id, message)} className="flex w-full items-center gap-3 py-4 text-left">
      <input type="checkbox" checked={company?.customerCareRules?.[id]?.enabled === true} readOnly tabIndex={-1} aria-label={`${title}: trạng thái đã lưu`} className="pointer-events-none h-4 w-4" />
      <span className="min-w-0 flex-1 text-sm font-semibold">{title}</span><ChevronRight size={18} />
    </button>)}
  </div>;
  return <form onSubmit={save} className="space-y-5">
    <fieldset disabled={!canEdit || busy} className="space-y-5">
      <label className="flex items-center justify-between gap-4 text-sm">Trạng thái<input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} className="h-5 w-5" /></label>
      <label className="block text-sm">Người gửi<select className="mt-2 w-full rounded-lg border p-3" value={draft.sender} onChange={e => setDraft({ ...draft, sender: e.target.value })}><option value="company">Tài khoản công ty</option><option value="assigned_employee">Nhân viên phụ trách khách hàng</option></select></label>
      {selected === 'inactive' && <label className="block text-sm">Số ngày chưa mua<input type="number" min="1" max="3650" required value={draft.inactiveDays} onChange={e => setDraft({ ...draft, inactiveDays: e.target.value })} className="mt-2 w-full rounded-lg border p-3" /></label>}
      {selected === 'holiday' && <div className="space-y-2 text-sm"><label htmlFor="care-holiday">Ngày lễ</label><input id="care-holiday" type="date" className="w-full rounded-lg border p-3" onChange={e => { if (e.target.value) setDraft({ ...draft, holidayDates: [...new Set([...draft.holidayDates, e.target.value])].sort() }); }} />{draft.holidayDates.map(date => <label key={date} className="flex items-center gap-2"><input type="checkbox" checked onChange={() => setDraft({ ...draft, holidayDates: draft.holidayDates.filter(item => item !== date) })} />{date}</label>)}</div>}
      <label className="block text-sm">Nội dung tin nhắn<textarea required maxLength={2000} rows={6} value={draft.message} onChange={e => setDraft({ ...draft, message: e.target.value })} className="mt-2 w-full resize-y rounded-lg border p-3" /></label>
    </fieldset>
    {status && <p role="status" className="text-sm">{status}</p>}
    <button disabled={busy || !canEdit} type="submit" className="w-full rounded-lg bg-blue-600 p-3 font-semibold text-white disabled:opacity-50">{busy ? 'Đang lưu...' : 'Lưu'}</button>
  </form>;
}
