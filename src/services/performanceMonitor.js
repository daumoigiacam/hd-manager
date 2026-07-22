const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off', 'disabled']);

const DEFAULT_LOG_LIMIT = 800;
const SLOW_API_MS = 500;
const SLOW_SCREEN_MS = 2000;
const SLOW_RENDER_MS = 16;
const MEMORY_SAMPLE_MS = 15000;
const LOW_FPS_THRESHOLD = 50;

let monitorEnabled = false;
let monitorInitialized = false;
let fetchPatched = false;
let historyPatched = false;
let eventSeq = 0;
let logLimit = DEFAULT_LOG_LIMIT;
let originalFetch = null;
let memoryTimer = null;
let fpsRafId = null;
let fpsLastTs = 0;
let fpsFrames = 0;
let longTaskBudgetMs = 0;
let currentScreen = '';
let lastNavigationTs = 0;
const performanceEvents = [];
const observers = [];
const runtimeCleanups = [];

const getWindow = () => (typeof window !== 'undefined' ? window : null);
const getPerformance = () => (typeof performance !== 'undefined' ? performance : null);

const safeJson = (value) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
};

const toBooleanFlag = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return null;
};

const envFlag = (name) => {
  try {
    return import.meta.env?.[name];
  } catch {
    return undefined;
  }
};

const readUrlFlag = (name) => {
  const win = getWindow();
  if (!win) return null;
  try {
    return toBooleanFlag(new URLSearchParams(win.location.search).get(name));
  } catch {
    return null;
  }
};

const shouldEnableMonitor = () => {
  const explicitParam = readUrlFlag('perfMonitor');
  if (explicitParam !== null) return explicitParam;

  const perfCheckParam = readUrlFlag('perfCheck');
  if (perfCheckParam !== null) return perfCheckParam;

  const envValue = toBooleanFlag(envFlag('VITE_PERFORMANCE_MONITOR'));
  if (envValue !== null) return envValue;

  const win = getWindow();
  if (win?.localStorage) {
    return toBooleanFlag(win.localStorage.getItem('hd_performance_monitor')) === true;
  }

  return false;
};

const readLogLimit = () => {
  const value = Number(envFlag('VITE_PERFORMANCE_LOG_LIMIT'));
  return Number.isFinite(value) && value > 50 ? Math.floor(value) : DEFAULT_LOG_LIMIT;
};

const sanitizeUrl = (rawUrl) => {
  if (!rawUrl) return '';
  try {
    const base = getWindow()?.location?.origin || 'http://local.invalid';
    const url = new URL(String(rawUrl), base);
    const sensitiveKeys = ['api_key', 'apikey', 'key', 'token', 'secret', 'password', 'checksum', 'client_id'];
    sensitiveKeys.forEach((key) => {
      if (url.searchParams.has(key)) url.searchParams.set(key, '[redacted]');
    });
    return url.href.replace(base, '');
  } catch {
    return String(rawUrl).replace(/([?&](?:api_key|apikey|key|token|secret|password|checksum|client_id)=)[^&]+/gi, '$1[redacted]');
  }
};

const normalizeError = (error) => ({
  name: error?.name || 'Error',
  message: error?.message || String(error || ''),
  stack: error?.stack ? String(error.stack).slice(0, 2000) : '',
});

const now = () => getPerformance()?.now?.() ?? Date.now();

const pushEvent = (type, detail = {}, level = 'info') => {
  if (!monitorEnabled) return null;

  const entry = {
    id: ++eventSeq,
    type,
    level,
    at: new Date().toISOString(),
    msSinceOpen: Math.round(now()),
    screen: currentScreen || undefined,
    detail: safeJson(detail),
  };

  performanceEvents.push(entry);
  while (performanceEvents.length > logLimit) performanceEvents.shift();

  const win = getWindow();
  if (win?.dispatchEvent) {
    win.dispatchEvent(new CustomEvent('hd-performance-event', { detail: entry }));
  }

  if (toBooleanFlag(envFlag('VITE_PERFORMANCE_CONSOLE')) === true) {
    const method = level === 'error' ? 'warn' : 'debug';
    // eslint-disable-next-line no-console
    console[method]('[HD Performance]', type, entry.detail);
  }

  return entry;
};

export const isPerformanceMonitorEnabled = () => monitorEnabled;

export const recordPerformanceEvent = (type, detail = {}, level = 'info') => pushEvent(type, detail, level);

export const createPerformanceSpan = (type, detail = {}) => {
  if (!monitorEnabled) {
    return {
      end: () => null,
      fail: () => null,
    };
  }

  const startTs = now();
  const startAt = Date.now();
  let finished = false;

  return {
    end(extra = {}) {
      if (finished) return null;
      finished = true;
      const durationMs = Math.round(now() - startTs);
      const level = durationMs >= SLOW_SCREEN_MS ? 'warn' : 'info';
      return pushEvent(type, {
        ...detail,
        ...extra,
        durationMs,
        startedAt: new Date(startAt).toISOString(),
      }, level);
    },
    fail(error, extra = {}) {
      if (finished) return null;
      finished = true;
      return pushEvent(type, {
        ...detail,
        ...extra,
        durationMs: Math.round(now() - startTs),
        error: normalizeError(error),
      }, 'error');
    },
  };
};

export const measurePerformance = async (type, detail, task) => {
  const span = createPerformanceSpan(type, detail);
  try {
    const result = await task();
    span.end({ status: 'ok' });
    return result;
  } catch (error) {
    span.fail(error);
    throw error;
  }
};

export const recordFirestoreOperation = async (operation, detail, task) => {
  const span = createPerformanceSpan('database.query', { provider: 'firestore', operation, ...detail });
  try {
    const result = await task();
    span.end({
      status: 'ok',
      docs: typeof result?.size === 'number' ? result.size : undefined,
      empty: typeof result?.empty === 'boolean' ? result.empty : undefined,
    });
    return result;
  } catch (error) {
    span.fail(error);
    throw error;
  }
};

export const recordReactRender = (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
  if (!monitorEnabled) return;
  const durationMs = Number(actualDuration || 0);
  if (durationMs < SLOW_RENDER_MS && phase !== 'mount') return;

  pushEvent('render.react', {
    component: id,
    phase,
    actualDurationMs: Math.round(durationMs * 100) / 100,
    baseDurationMs: Math.round(Number(baseDuration || 0) * 100) / 100,
    startTimeMs: Math.round(Number(startTime || 0)),
    commitTimeMs: Math.round(Number(commitTime || 0)),
  }, durationMs >= 50 ? 'warn' : 'info');
};

const getFetchUrl = (input) => {
  if (typeof input === 'string') return input;
  if (input?.url) return input.url;
  return String(input || '');
};

const getFetchMethod = (input, init) => {
  return String(init?.method || input?.method || 'GET').toUpperCase();
};

const patchFetch = () => {
  const win = getWindow();
  if (!win?.fetch || fetchPatched) return;

  originalFetch = win.fetch.bind(win);
  fetchPatched = true;
  win.fetch = async (input, init) => {
    const url = sanitizeUrl(getFetchUrl(input));
    const method = getFetchMethod(input, init);
    const span = createPerformanceSpan('api.response', { method, url });
    try {
      const response = await originalFetch(input, init);
      const detail = {
        status: response.status,
        ok: response.ok,
        contentType: response.headers?.get?.('content-type') || '',
      };
      span.end(detail);
      if (!response.ok || response.status >= 500) {
        pushEvent('network.error', { method, url, ...detail }, 'warn');
      }
      return response;
    } catch (error) {
      span.fail(error);
      throw error;
    }
  };
};

const patchHistory = () => {
  const win = getWindow();
  if (!win?.history || historyPatched) return;

  const recordNavigation = (source, target) => {
    const nextScreen = String(target || win.location.pathname + win.location.search + win.location.hash);
    const started = now();
    const previousScreen = currentScreen;
    currentScreen = nextScreen;
    lastNavigationTs = started;
    requestAnimationFrame(() => {
      pushEvent('navigation.time', {
        source,
        from: previousScreen,
        to: nextScreen,
        durationMs: Math.round(now() - started),
      });
    });
  };

  const originalPushState = win.history.pushState.bind(win.history);
  const originalReplaceState = win.history.replaceState.bind(win.history);

  win.history.pushState = (...args) => {
    const result = originalPushState(...args);
    recordNavigation('pushState', args[2]);
    return result;
  };

  win.history.replaceState = (...args) => {
    const result = originalReplaceState(...args);
    recordNavigation('replaceState', args[2]);
    return result;
  };

  const handlePopState = () => recordNavigation('popstate');
  const handleHashChange = () => recordNavigation('hashchange');
  win.addEventListener('popstate', handlePopState);
  win.addEventListener('hashchange', handleHashChange);
  runtimeCleanups.push(() => {
    win.history.pushState = originalPushState;
    win.history.replaceState = originalReplaceState;
    win.removeEventListener('popstate', handlePopState);
    win.removeEventListener('hashchange', handleHashChange);
  });
  historyPatched = true;
};

const observePerformanceEntries = () => {
  const perf = getPerformance();
  if (!perf || typeof PerformanceObserver === 'undefined') return;

  const observe = (entryTypes, handler) => {
    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach(handler);
      });
      observer.observe({ entryTypes });
      observers.push(observer);
    } catch {
      // Some Android WebView versions do not support every performance entry type.
    }
  };

  observe(['navigation'], (entry) => {
    pushEvent('app.start', {
      type: entry.type,
      durationMs: Math.round(entry.duration),
      domContentLoadedMs: Math.round(entry.domContentLoadedEventEnd - entry.startTime),
      loadEventMs: Math.round(entry.loadEventEnd - entry.startTime),
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
    }, entry.duration > SLOW_SCREEN_MS ? 'warn' : 'info');
  });

  observe(['paint'], (entry) => {
    pushEvent('app.paint', {
      name: entry.name,
      startTimeMs: Math.round(entry.startTime),
      durationMs: Math.round(entry.duration || 0),
    });
  });

  observe(['longtask'], (entry) => {
    longTaskBudgetMs += entry.duration || 0;
    pushEvent('thread.long_task', {
      durationMs: Math.round(entry.duration || 0),
      name: entry.name,
      attribution: entry.attribution?.map?.((item) => ({
        name: item.name,
        containerType: item.containerType,
        containerName: item.containerName,
      })),
    }, 'warn');
  });

  observe(['resource'], (entry) => {
    const durationMs = Math.round(entry.duration || 0);
    const initiatorType = entry.initiatorType || 'resource';
    const url = sanitizeUrl(entry.name);
    if (initiatorType === 'img' || /\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/i.test(url)) {
      pushEvent('image.loading', {
        url,
        durationMs,
        transferSize: entry.transferSize,
        decodedBodySize: entry.decodedBodySize,
      }, durationMs > 1000 ? 'warn' : 'info');
      return;
    }

    if (/firestore|firebase|googleapis|webchannel|sepay|goong|map/i.test(url) || durationMs > 1000) {
      pushEvent('network.resource', {
        initiatorType,
        url,
        durationMs,
        transferSize: entry.transferSize,
        decodedBodySize: entry.decodedBodySize,
      }, durationMs > 1000 ? 'warn' : 'info');
    }
  });

  observe(['gc'], (entry) => {
    pushEvent('garbage_collection', {
      durationMs: Math.round(entry.duration || 0),
      kind: entry.kind,
    }, entry.duration > 50 ? 'warn' : 'info');
  });
};

const startFpsMonitor = () => {
  const win = getWindow();
  if (!win?.requestAnimationFrame) return;

  const tick = (timestamp) => {
    if (!fpsLastTs) fpsLastTs = timestamp;
    fpsFrames += 1;

    const elapsed = timestamp - fpsLastTs;
    if (elapsed >= 1000) {
      const fps = Math.round((fpsFrames * 1000) / elapsed);
      const droppedFrames = Math.max(0, Math.round((60 - fps) * (elapsed / 1000)));
      if (fps < LOW_FPS_THRESHOLD || droppedFrames > 10) {
        pushEvent('fps.sample', {
          fps,
          droppedFrames,
          longTaskBudgetMs: Math.round(longTaskBudgetMs),
        }, 'warn');
      }
      fpsFrames = 0;
      fpsLastTs = timestamp;
      longTaskBudgetMs = 0;
    }

    fpsRafId = win.requestAnimationFrame(tick);
  };

  fpsRafId = win.requestAnimationFrame(tick);
};

const sampleMemory = () => {
  const win = getWindow();
  const perf = getPerformance();
  if (!win || !perf || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) return;

  const memory = perf.memory;
  pushEvent('memory.sample', {
    usedJSHeapSize: memory?.usedJSHeapSize,
    totalJSHeapSize: memory?.totalJSHeapSize,
    jsHeapSizeLimit: memory?.jsHeapSizeLimit,
    deviceMemoryGb: navigator.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
  });
};

const installErrorHandlers = () => {
  const win = getWindow();
  if (!win) return;

  const handleError = (event) => {
    pushEvent('crash.window_error', {
      message: event.message,
      filename: sanitizeUrl(event.filename),
      line: event.lineno,
      column: event.colno,
      error: normalizeError(event.error),
    }, 'error');
  };

  const handleUnhandledRejection = (event) => {
    pushEvent('crash.unhandled_rejection', {
      reason: normalizeError(event.reason),
    }, 'error');
  };

  const handlePageHide = (event) => {
    pushEvent('background_task.pagehide', {
      persisted: event.persisted,
      elapsedSinceNavigationMs: Math.round(now() - lastNavigationTs),
    });
  };

  const handleVisibilityChange = () => {
    pushEvent('background_task.visibility', {
      state: document.visibilityState,
    });
  };

  win.addEventListener('error', handleError);
  win.addEventListener('unhandledrejection', handleUnhandledRejection);
  win.addEventListener('pagehide', handlePageHide);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  runtimeCleanups.push(() => {
    win.removeEventListener('error', handleError);
    win.removeEventListener('unhandledrejection', handleUnhandledRejection);
    win.removeEventListener('pagehide', handlePageHide);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });
};

export const exportPerformanceLog = (format = 'json') => {
  const events = performanceEvents.slice();
  if (format === 'csv') {
    const header = ['id', 'at', 'msSinceOpen', 'level', 'type', 'screen', 'detail'];
    const rows = events.map((entry) => header.map((key) => {
      const value = key === 'detail' ? JSON.stringify(entry.detail) : entry[key];
      return `"${String(value ?? '').replace(/"/g, '""')}"`;
    }).join(','));
    return [header.join(','), ...rows].join('\n');
  }
  return JSON.stringify(events, null, 2);
};

export const downloadPerformanceLog = (format = 'json') => {
  const win = getWindow();
  if (!win) return;

  const data = exportPerformanceLog(format);
  const blob = new Blob([data], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `hd-performance-${new Date().toISOString().replace(/[:.]/g, '-')}.${format === 'csv' ? 'csv' : 'json'}`;
  anchor.click();
  URL.revokeObjectURL(url);
};

const exposeDebugApi = () => {
  const win = getWindow();
  if (!win) return;

  win.hdPerformanceMonitor = {
    enabled: () => monitorEnabled,
    events: () => performanceEvents.slice(),
    record: recordPerformanceEvent,
    export: exportPerformanceLog,
    download: downloadPerformanceLog,
    clear: () => {
      performanceEvents.splice(0, performanceEvents.length);
      eventSeq = 0;
    },
  };
};

export const initPerformanceMonitor = (options = {}) => {
  if (monitorInitialized) return monitorEnabled;

  monitorEnabled = shouldEnableMonitor();
  logLimit = readLogLimit();
  monitorInitialized = true;
  exposeDebugApi();

  if (!monitorEnabled) return false;

  currentScreen = getWindow()?.location?.pathname + getWindow()?.location?.search + getWindow()?.location?.hash;
  lastNavigationTs = now();

  pushEvent('performance_monitor.enabled', {
    appName: options.appName || 'HD Manager',
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    logLimit,
  });

  patchFetch();
  patchHistory();
  observePerformanceEntries();
  startFpsMonitor();
  installErrorHandlers();
  sampleMemory();
  memoryTimer = setInterval(sampleMemory, MEMORY_SAMPLE_MS);

  return true;
};

export const stopPerformanceMonitor = () => {
  const win = getWindow();
  observers.forEach((observer) => observer.disconnect?.());
  observers.splice(0, observers.length);

  if (memoryTimer) clearInterval(memoryTimer);
  memoryTimer = null;

  if (fpsRafId && win?.cancelAnimationFrame) win.cancelAnimationFrame(fpsRafId);
  fpsRafId = null;

  if (fetchPatched && originalFetch && win) {
    win.fetch = originalFetch;
    fetchPatched = false;
  }

  runtimeCleanups.splice(0, runtimeCleanups.length).forEach(cleanup => cleanup());
  historyPatched = false;

  monitorEnabled = false;
};
