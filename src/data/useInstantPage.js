import { useCallback, useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react';
import { canonicalQueryValue } from './instantDataEngine.js';
const empty = Object.freeze([]),
  subscribeIdle = () => () => {};
const idle = Object.freeze({
  status: 'idle',
  items: empty,
  hasMore: null,
  cursor: null,
  nextCursor: null,
  dataSource: null,
  error: null
});

// Query-local subscriptions keep page/refresh updates out of the application
// root. Hidden/cancelled consumers detach; shared transport stays for others.
export function useInstantPage(engine, spec, {
  enabled = true,
  realtime = false,
  viewKey
} = {}) {
  const id = useId(),
    key = canonicalQueryValue(spec);
  const entry = useMemo(() => {
    if (!enabled || !engine) return {
      resource: null,
      snapshot: idle
    };
    try {
      return {
        resource: engine.openQuery(JSON.parse(key), {
          viewKey: viewKey || id
        }),
        snapshot: idle
      };
    } catch (error) {
      return {
        resource: null,
        snapshot: Object.freeze({
          ...idle,
          status: 'error',
          error: Object.freeze({
            code: error.code || 'invalid-query',
            message: 'Không thể mở danh sách. Vui lòng kiểm tra bộ lọc hoặc thử lại.'
          })
        })
      };
    }
  }, [engine, key, id, viewKey, enabled]);
  const read = useCallback(() => entry.resource?.getSnapshot() || entry.snapshot, [entry]);
  const snapshot = useSyncExternalStore(entry.resource?.subscribe || subscribeIdle, read, read);
  const [live, setLive] = useState({
    entry: null,
    status: 'idle',
    error: null
  });
  const [liveRetry, setLiveRetry] = useState(0);
  const canObserve = Boolean(realtime && entry.resource && ['ready', 'refreshing'].includes(snapshot.status));
  useEffect(() => {
    if (!entry.resource) return undefined;
    const controller = new AbortController();
    void entry.resource.load({
      signal: controller.signal
    }).catch(() => {/* Resource exposes read errors; no unhandled event promise. */});
    return () => controller.abort();
  }, [entry]);
  useEffect(() => {
    if (!canObserve) return undefined;
    // This effect subscribes only after a complete first page. Callback data
    // enters the resource store, not an extra root state copy.
    const controller = new AbortController();
    let disposed = false,
      off;
    const status = (value, error = null) => {
      if (disposed) return;
      setLive(previous => previous.entry === entry && previous.status === value && previous.error?.code === error?.code ? previous : {
        entry,
        status: value,
        error
      });
    };
    const error = value => status('error', {
      code: value.code || 'realtime-failed',
      message: 'Đồng bộ trực tiếp bị gián đoạn. Bạn có thể tải lại danh sách.'
    });
    try {
      off = engine.observePage(JSON.parse(key), {
        cursor: snapshot.cursor,
        signal: controller.signal,
        onStatus: status,
        onError: error
      });
    } catch (value) {
      error(value);
    }
    return () => {
      disposed = true;
      controller.abort();
      off?.();
    };
  }, [engine, entry, key, canObserve, snapshot.cursor, liveRetry]);
  const run = useCallback(async (method, options) => {
    if (!entry.resource) return null;
    try {
      return await entry.resource[method](options);
    } catch {
      return null;
    }
  }, [entry]);
  const refresh = useCallback(async options => {
    const result = await run('refresh', options);
    setLiveRetry(value => value + 1);
    return result;
  }, [run]);
  return useMemo(() => ({
    ...snapshot,
    realtimeStatus: canObserve && live.entry === entry ? live.status : 'idle',
    realtimeError: canObserve && live.entry === entry ? live.error : null,
    refresh,
    next: options => run('next', options),
    load: options => run('load', options)
  }), [snapshot, run, refresh, live, entry, canObserve]);
}
