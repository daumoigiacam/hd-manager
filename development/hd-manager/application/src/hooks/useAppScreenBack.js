import { useEffect, useRef } from 'react';

const SCREEN_BACK_EVENT = 'hd-manager-screen-back';

export function useAppScreenBack(handler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const handleBack = (event) => {
      if (event.defaultPrevented || event.detail?.handled) return;
      if (!handlerRef.current?.()) return;
      if (event.detail) event.detail.handled = true;
      event.preventDefault();
    };
    window.addEventListener(SCREEN_BACK_EVENT, handleBack);
    return () => window.removeEventListener(SCREEN_BACK_EVENT, handleBack);
  }, []);
}
