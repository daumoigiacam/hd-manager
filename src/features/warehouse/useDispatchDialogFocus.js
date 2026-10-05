import { useEffect, useRef } from 'react';

/** @param {() => void} onClose */
export function useDispatchDialogFocus(onClose) {
  const rootRef = useRef(/** @type {HTMLElement | null} */ (null));
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const previous = document.activeElement;
    const controls = () => Array.from(root.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'))
      .filter(/** @returns {element is HTMLElement} */ element => element instanceof HTMLElement && element.getClientRects().length > 0);
    (controls()[0] || root).focus();
    /** @param {KeyboardEvent} event */
    const handleKey = event => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); closeRef.current();
      } else if (event.key === 'Tab') {
        const items = controls();
        const first = items[0];
        const last = items[items.length - 1];
        if (!first) { event.preventDefault(); root.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    };
    root.addEventListener('keydown', handleKey);
    return () => {
      root.removeEventListener('keydown', handleKey);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return rootRef;
}
