import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getListPage } from '../utils/listPage.js';

export const getDefaultListPageSize = (scope = globalThis) => (
  scope.document?.documentElement?.classList?.contains('hd-low-power-ui')
    || scope.matchMedia?.('(max-width: 600px)')?.matches ? 20 : 50
);

export const usePagedList = (items, resetKey = '', pageSize) => {
  // Bound mounted card DOM on phones; totals/search still use the full list.
  // Resolve once per mounted list to avoid page shifts during keyboard resize.
  const [defaultPageSize] = useState(getDefaultListPageSize);
  const [selection, setSelection] = useState({ key: resetKey, page: 0 });
  const info = getListPage(items.length, selection.key === resetKey ? selection.page : 0, pageSize ?? defaultPageSize);
  const visibleItems = useMemo(() => items.slice(info.start, info.end), [items, info.start, info.end]);
  const setPage = useCallback(page => setSelection({ key: resetKey, page }), [resetKey]);
  return { ...info, items: visibleItems, setPage };
};

const DEFAULT_DEBOUNCE_MS = 160;
const DEFAULT_THROTTLE_MS = 120;

const getTimerScope = () => (typeof window !== 'undefined' ? window : globalThis);

const scheduleIdleWork = (callback) => {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    return { type: 'idle', id: window.requestIdleCallback(callback, { timeout: 180 }) };
  }
  return { type: 'timeout', id: getTimerScope().setTimeout(callback, 24) };
};

const cancelIdleWork = (handle) => {
  if (!handle) return;
  if (handle.type === 'idle' && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(handle.id);
    return;
  }
  getTimerScope().clearTimeout(handle.id);
};

export const useDebouncedValue = (value, delayMs = DEFAULT_DEBOUNCE_MS, { leading = false } = {}) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  const burstActive = useRef(false);

  useEffect(() => {
    const timerScope = getTimerScope();
    if (leading && !burstActive.current && !Object.is(value, debouncedValue)) {
      burstActive.current = true;
      setDebouncedValue(value);
    }
    if (!leading) burstActive.current = false;
    const timerId = timerScope.setTimeout(() => {
      burstActive.current = false;
      setDebouncedValue(value);
    }, Math.max(0, Number(delayMs) || 0));
    return () => timerScope.clearTimeout(timerId);
  }, [value, delayMs, leading]);

  return debouncedValue;
};

export const useThrottledCallback = (callback, waitMs = DEFAULT_THROTTLE_MS) => {
  const callbackRef = useRef(callback);
  const lastRunAtRef = useRef(0);
  const trailingTimerRef = useRef(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => () => {
    if (trailingTimerRef.current) {
      getTimerScope().clearTimeout(trailingTimerRef.current);
      trailingTimerRef.current = null;
    }
  }, []);

  return useCallback((...args) => {
    const now = Date.now();
    const wait = Math.max(0, Number(waitMs) || 0);
    const remaining = wait - (now - lastRunAtRef.current);

    if (remaining <= 0) {
      if (trailingTimerRef.current) {
        getTimerScope().clearTimeout(trailingTimerRef.current);
        trailingTimerRef.current = null;
      }
      lastRunAtRef.current = now;
      callbackRef.current?.(...args);
      return;
    }

    if (trailingTimerRef.current) return;
    trailingTimerRef.current = getTimerScope().setTimeout(() => {
      trailingTimerRef.current = null;
      lastRunAtRef.current = Date.now();
      callbackRef.current?.(...args);
    }, remaining);
  }, [waitMs]);
};

export const useChunkedList = (items, initialCount = 80, stepCount = 80, resetKey = '', enabled = true) => {
  const safeItems = Array.isArray(items) ? items : [];
  const total = safeItems.length;
  const initial = Math.max(1, Number(initialCount) || 80);
  const step = Math.max(1, Number(stepCount) || initial);
  const [visibleCount, setVisibleCount] = useState(enabled ? Math.min(total, initial) : 0);

  useEffect(() => {
    // Closed dialogs must not enqueue background state updates on their parent.
    if (!enabled) return undefined;
    let cancelled = false;
    let idleHandle = null;

    setVisibleCount(Math.min(total, initial));

    const scheduleMore = () => {
      idleHandle = scheduleIdleWork(() => {
        if (cancelled) return;
        setVisibleCount((current) => {
          const nextCount = Math.min(total, current + step);
          if (nextCount < total) scheduleMore();
          return nextCount;
        });
      });
    };

    if (total > initial) scheduleMore();

    return () => {
      cancelled = true;
      cancelIdleWork(idleHandle);
    };
  }, [total, initial, step, resetKey, enabled]);

  return useMemo(() => enabled ? safeItems.slice(0, visibleCount) : [], [safeItems, visibleCount, enabled]);
};
