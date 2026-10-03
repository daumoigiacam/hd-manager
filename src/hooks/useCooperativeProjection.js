import { useEffect, useState } from 'react';
import { runCooperativeProjection } from '../services/cooperativeProjection.js';

const EMPTY = [];
export function useCooperativeProjection(factory, cacheEntry) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (cacheEntry?.complete) return;
    const controller = new AbortController();
    runCooperativeProjection(factory, { signal: controller.signal })
      .then(value => {
        if (controller.signal.aborted) return;
        if (cacheEntry) { cacheEntry.value = value; cacheEntry.complete = true; }
        setResult({ factory, value });
      })
      .catch(error => { if (!controller.signal.aborted) setResult({ factory, error }); });
    return () => controller.abort();
  }, [factory, cacheEntry]);
  if (cacheEntry?.complete) return { value: cacheEntry.value, pending: false, error: null };
  const current = result?.factory === factory;
  return { value: current && !result.error ? result.value : EMPTY,
    pending: !current, error: current ? result.error : null };
}
