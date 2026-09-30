import { useEffect } from 'react';

let activeModalLocks = 0;
let previousBodyOverflow = '';
let previousDocumentOverflow = '';

export function useModalScrollLock(active) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined;
    if (activeModalLocks === 0) {
      previousBodyOverflow = document.body.style.overflow;
      previousDocumentOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    }
    activeModalLocks += 1;
    document.documentElement.dataset.hdOpenModalCount = String(activeModalLocks);
    window.dispatchEvent(new CustomEvent('hd-modal-visibility', { detail: { count: activeModalLocks } }));

    const blockBackgroundScroll = (event) => {
      if (!event.target?.closest?.('.hd-modal-body')) event.preventDefault();
    };
    document.addEventListener('wheel', blockBackgroundScroll, { capture: true, passive: false });
    document.addEventListener('touchmove', blockBackgroundScroll, { capture: true, passive: false });

    return () => {
      document.removeEventListener('wheel', blockBackgroundScroll, true);
      document.removeEventListener('touchmove', blockBackgroundScroll, true);
      activeModalLocks -= 1;
      document.documentElement.dataset.hdOpenModalCount = String(activeModalLocks);
      window.dispatchEvent(new CustomEvent('hd-modal-visibility', { detail: { count: activeModalLocks } }));
      if (activeModalLocks === 0) {
        document.body.style.overflow = previousBodyOverflow;
        document.documentElement.style.overflow = previousDocumentOverflow;
      }
    };
  }, [active]);
}
