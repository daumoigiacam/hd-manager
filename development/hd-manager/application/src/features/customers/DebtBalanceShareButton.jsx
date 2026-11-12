import { useRef, useState } from 'react';
import { Share2 } from 'lucide-react';
import { buildDebtBalanceShare } from '../../utils/debtBalanceShare.js';

export default function DebtBalanceShareButton({ customer, shareText }) {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const share = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setStatus('');
    try {
      const result = await shareText(buildDebtBalanceShare(customer));
      if (result.status === 'copied') setStatus('Đã sao chép công nợ. Bạn có thể dán vào cuộc trò chuyện với khách.');
      else if (result.status === 'unsupported') setStatus('Thiết bị chưa hỗ trợ chia sẻ hoặc sao chép. Vui lòng thử trên trình duyệt khác.');
    } catch {
      setStatus('Không thể chia sẻ công nợ. Vui lòng thử lại.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return <>
    <button type="button" aria-label="Chia sẻ công nợ" aria-busy={busy} disabled={busy} onClick={share} className="flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 disabled:opacity-60">
      <Share2 size={18} className="shrink-0" aria-hidden="true" />{busy ? 'Đang mở...' : 'Chia sẻ'}
    </button>
    {status && <p role="status" className="col-span-full text-sm text-slate-600">{status}</p>}
  </>;
}
