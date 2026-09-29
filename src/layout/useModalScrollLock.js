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

    const blockBackgroundScroll = (event) => {
      if (!event.target?.closest?.('.hd-modal-body')) event.preventDefault();
    };
    document.addEventListener('wheel', blockBackgroundScroll, { capture: true, passive: false });
    document.addEventListener('touchmove', blockBackgroundScroll, { capture: true, passive: false });

    return () => {
      document.removeEventListener('wheel', blockBackgroundScroll, true);
      document.removeEventListener('touchmove', blockBackgroundScroll, true);
      activeModalLocks -= 1;
      if (activeModalLocks === 0) {
        document.body.style.overflow = previousBodyOverflow;
        document.documentElement.style.overflow = previousDocumentOverflow;
      }
    };
  }, [active]);
}
