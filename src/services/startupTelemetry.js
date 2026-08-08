import { recordPerformanceEvent } from './performanceMonitor.js';

const MAX_STARTUP_EVENTS = 120;
const startupStartedAt = typeof performance !== 'undefined' && typeof performance.now === 'function'
  ? performance.now()
  : Date.now();
const startupEvents = [];
let emittedEventCount = 0;
let performanceMonitorReady = false;

const toBoolean = (value) => ['1', 'true', 'yes', 'on', 'enabled'].includes(`${value ?? ''}`.trim().toLowerCase());

const isTelemetryEnabled = () => {
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (params.has('perfMonitor')) return toBoolean(params.get('perfMonitor'));
    if (params.has('perfCheck')) return toBoolean(params.get('perfCheck'));
    if (toBoolean(import.meta.env?.VITE_PERFORMANCE_MONITOR)) return true;
    return toBoolean(window.localStorage?.getItem('hd_performance_monitor'));
  } catch {
    return false;
  }
};

const now = () => (
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
);

const safeDetail = (detail = {}) => {
  try {
    return JSON.parse(JSON.stringify(detail || {}));
  } catch {
    return {};
  }
};

const emitToPerformanceMonitor = (entry) => {
  if (!isTelemetryEnabled()) return;
  recordPerformanceEvent(`startup.${entry.name}`, {
    durationMs: entry.durationMs,
    atEpochMs: entry.atEpochMs,
    ...entry.detail,
  }, entry.level || 'info');
};

export const recordStartupEvent = (name, detail = {}, level = 'info') => {
  const entry = {
    name: `${name || 'event'}`,
    durationMs: Math.max(0, Math.round((now() - startupStartedAt) * 100) / 100),
    atEpochMs: Date.now(),
    level,
    detail: safeDetail(detail),
  };
  startupEvents.push(entry);
  while (startupEvents.length > MAX_STARTUP_EVENTS) startupEvents.shift();

  if (typeof window !== 'undefined') {
    window.__HD_STARTUP_TIMING__ = startupEvents;
    window.dispatchEvent?.(new CustomEvent('hd-startup-event', { detail: entry }));
  }
  emitToPerformanceMonitor(entry);
  if (performanceMonitorReady) emittedEventCount = startupEvents.length;
  return entry;
};

export const flushStartupEvents = () => {
  if (!isTelemetryEnabled()) return;
  startupEvents.slice(emittedEventCount).forEach(emitToPerformanceMonitor);
  emittedEventCount = startupEvents.length;
  performanceMonitorReady = true;
};

export const getStartupEvents = () => startupEvents.slice();

export const exportStartupTiming = () => JSON.stringify({
  startedAtEpochMs: startupEvents[0]?.atEpochMs || Date.now(),
  events: startupEvents,
}, null, 2);

if (typeof window !== 'undefined') {
  window.__HD_STARTUP_TIMING__ = startupEvents;
  window.hdStartupTiming = {
    events: getStartupEvents,
    export: exportStartupTiming,
    record: recordStartupEvent,
  };
}
