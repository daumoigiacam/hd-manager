import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function SecurityDialog({ title, busy, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const viewport = window.visualViewport;
    const resize = () => {
      dialog.style.maxHeight = `${Math.max(120, (viewport?.height || window.innerHeight) - 24)}px`;
      dialog.style.top = `${(viewport?.offsetTop || 0) + 12}px`;
    };
    resize();
    dialog.showModal();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    return () => {
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      dialog.close();
    };
  }, []);
  return createPortal(<dialog ref={ref} aria-labelledby="security-dialog-title"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    style={{ position: 'fixed', margin: '0 auto', width: 'calc(100% - 24px)', maxWidth: 480, overflowY: 'auto', border: 0, borderRadius: 8, padding: 16, background: 'white', color: '#1f2937' }}>
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 id="security-dialog-title" className="text-base font-semibold">{title}</h2>
      <button type="button" aria-label="Đóng" title="Đóng" disabled={busy} onClick={onClose} className="p-2"><X size={20} /></button>
    </div>
    {children}
  </dialog>, document.body);
}
