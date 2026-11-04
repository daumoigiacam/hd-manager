import { useCallback, useEffect, useRef } from 'react';

// Reset the old, already-laid-out scroller before switching its contents. A
// write in the new page's first animation frame forces synchronous new layout.
export function useModuleScrollReset({
  activeTab,
  mainContentRef,
  onChange
}) {
  const latest = useRef(activeTab),
    previous = useRef(activeTab),
    prepared = useRef(null);
  latest.current = activeTab;
  const navigate = useCallback(next => {
    const target = typeof next === 'function' ? next(latest.current) : next;
    if (target === latest.current) return;
    if (mainContentRef.current) mainContentRef.current.scrollTop = 0;
    prepared.current = target;
    latest.current = target;
    onChange(target);
  }, [mainContentRef, onChange]);
  useEffect(() => {
    if (previous.current === activeTab) return undefined;
    previous.current = activeTab;
    if (prepared.current === activeTab) {
      prepared.current = null;
      return undefined;
    }
    // A route restored/changed by the parent bypasses navigate. Preserve the
    // prior behavior for that path, and cancel it if another route supersedes it.
    const frame = requestAnimationFrame(() => {
      if (mainContentRef.current) mainContentRef.current.scrollTop = 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab, mainContentRef]);
  return navigate;
}
