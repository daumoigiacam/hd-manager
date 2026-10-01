import React, { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Share2, X } from 'lucide-react';

function EmployeeBankQr({ payload, name, bankName, accountNumber, accountName, generateImage, shareFile }) {
  const host = useRef(null);
  const [visible, setVisible] = useState(false);
  const [image, setImage] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!host.current || !payload) return;
    if (!window.IntersectionObserver) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '100px' });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [payload]);
  useEffect(() => {
    let cancelled = false;
    setImage(null);
    setError('');
    if (visible && payload) {
      generateImage(payload, { width: 600 }).then(async url => {
        if (!url) throw new Error('QR unavailable');
        const blob = await (await fetch(url)).blob();
        if (!cancelled) setImage({ payload, url, blob });
      }).catch(() => { if (!cancelled) setError('Không tạo được QR. Hãy kiểm tra tài khoản.'); });
    }
    return () => { cancelled = true; };
  }, [payload, visible, generateImage]);
  useEffect(() => {
    if (!open) return;
    const onKey = event => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const currentImage = image?.payload === payload ? image : null;
  const share = async () => {
    if (!currentImage || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await shareFile({ filename: 'QR-ngan-hang.png', blob: currentImage.blob, title: `QR ngân hàng - ${name}`, text: `${bankName} - ${accountNumber} - ${accountName || name}` });
      if (result?.status === 'unsupported') setError('Thiết bị chưa hỗ trợ chia sẻ ảnh.');
    } catch (err) {
      if (err?.name !== 'AbortError') setError('Không chia sẻ được QR. Vui lòng thử lại.');
    } finally { setBusy(false); }
  };
  return <div ref={host} className="w-20 shrink-0 text-center" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    {payload ? <>
      <button type="button" disabled={!currentImage} onClick={() => setOpen(true)} aria-label={`Mở QR ngân hàng ${name}`} className="flex h-20 w-20 items-center justify-center bg-white p-1">
        {currentImage ? <img src={currentImage.url} alt={`QR ngân hàng ${name}`} className="h-full w-full" /> : <span className="text-xs text-gray-500">{error ? 'QR lỗi' : 'Đang tạo QR'}</span>}
      </button>
      <button type="button" onClick={share} disabled={!currentImage || busy} aria-label={`Chia sẻ QR ngân hàng ${name}`} title="Chia sẻ QR ngân hàng" className="mx-auto flex h-9 w-9 items-center justify-center disabled:opacity-40"><Share2 size={18} /></button>
    </> : <div className="flex min-h-24 items-center justify-center text-xs text-gray-500">Chưa đủ thông tin ngân hàng</div>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    {open && currentImage && createPortal(<div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
      <section role="dialog" aria-modal="true" aria-label={`QR ngân hàng ${name}`} className="max-h-[90dvh] w-full max-w-sm overflow-auto rounded-lg bg-white p-5 text-center" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3"><h2 className="min-w-0 break-words font-semibold">{name}</h2><button autoFocus type="button" aria-label="Đóng QR" onClick={() => setOpen(false)} className="p-2"><X size={20} /></button></div>
        <img src={currentImage.url} alt={`QR chuyển khoản ${name}`} className="mx-auto aspect-square w-full max-w-72" />
        <p className="break-words text-sm">{bankName}</p><p className="break-all font-semibold">{accountNumber}</p><p className="break-words text-sm">{accountName || name}</p>
        <button type="button" onClick={share} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded border px-4 py-2"><Share2 size={18} />Chia sẻ QR</button>
        {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      </section>
    </div>, document.body)}
  </div>;
}

export default memo(EmployeeBankQr);
