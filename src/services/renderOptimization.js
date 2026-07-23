import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

export const useDebouncedValue = (value, delayMs = DEFAULT_DEBOUNCE_MS) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timerScope = getTimerScope();
    const timerId = timerScope.setTimeout(() => setDebouncedValue(value), Math.max(0, Number(delayMs) || 0));
    return () => timerScope.clearTimeout(timerId);
  }, [value, delayMs]);

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

export const useChunkedList = (items, initialCount = 80, stepCount = 80, resetKey = '') => {
  const safeItems = Array.isArray(items) ? items : [];
  const total = safeItems.length;
  const initial = Math.max(1, Number(initialCount) || 80);
  const step = Math.max(1, Number(stepCount) || initial);
  const [visibleCount, setVisibleCount] = useState(Math.min(total, initial));

  useEffect(() => {
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
  }, [total, initial, step, resetKey]);

  return useMemo(() => safeItems.slice(0, visibleCount), [safeItems, visibleCount]);
};
