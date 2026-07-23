import { getPerformance, trace } from 'firebase/performance';
import { recordPerformanceEvent } from './performanceMonitor.js';

const toBooleanFlag = (value) => {
  const normalized = `${value ?? ''}`.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const isFirebasePerformanceEnabled = () => {
  const envEnabled = toBooleanFlag(import.meta.env.VITE_FIREBASE_PERFORMANCE);
  if (envEnabled) return true;

  try {
    const params = new URLSearchParams(window.location.search || '');
    return ['1', 'true', 'yes', 'on'].includes(`${params.get('firebasePerf') || ''}`.toLowerCase());
  } catch {
    return false;
  }
};

let performanceInstance = null;
let firebasePerformanceReady = false;
let firebasePerformanceInitPromise = null;

export const initFirebaseObservability = (firebaseApp, context = {}) => {
  if (!firebaseApp || firebasePerformanceInitPromise) return firebasePerformanceInitPromise;

  firebasePerformanceInitPromise = (async () => {
    if (!isFirebasePerformanceEnabled()) {
      recordPerformanceEvent('firebase.performance.disabled', {
        reason: 'disabled_by_env',
        projectId: context.projectId || '',
      });
      return false;
    }

    try {
      performanceInstance = getPerformance(firebaseApp);
      firebasePerformanceReady = true;
      recordPerformanceEvent('firebase.performance.enabled', {
        projectId: context.projectId || '',
        appName: context.appName || 'HD Manager',
      });
      return true;
    } catch (error) {
      firebasePerformanceReady = false;
      recordPerformanceEvent('firebase.performance.init_error', {
        message: error?.message || String(error),
      }, 'error');
      return false;
    }
  })();

  return firebasePerformanceInitPromise;
};

export const startFirebaseTrace = (name, attributes = {}) => {
  if (!firebasePerformanceReady || !performanceInstance || !name) {
    return {
      putMetric: () => {},
      stop: () => {},
    };
  }

  let activeTrace = null;
  try {
    activeTrace = trace(performanceInstance, String(name).slice(0, 100));
    Object.entries(attributes || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      activeTrace.putAttribute(String(key).slice(0, 32), String(value).slice(0, 100));
    });
    activeTrace.start();
  } catch (error) {
    recordPerformanceEvent('firebase.performance.trace_start_error', {
      name,
      message: error?.message || String(error),
    }, 'warn');
  }

  return {
    putMetric: (metricName, value) => {
      try {
        if (activeTrace && Number.isFinite(value)) activeTrace.putMetric(String(metricName).slice(0, 100), Math.round(value));
      } catch {
        // Metric recording should never break the business flow.
      }
    },
    stop: () => {
      try {
        activeTrace?.stop();
      } catch (error) {
        recordPerformanceEvent('firebase.performance.trace_stop_error', {
          name,
          message: error?.message || String(error),
        }, 'warn');
      }
    },
  };
};

export const recordCrashDiagnostic = (error, context = {}) => {
  recordPerformanceEvent('crash.diagnostic', {
    message: error?.message || String(error || ''),
    name: error?.name || '',
    stack: `${error?.stack || ''}`.slice(0, 1500),
    ...context,
  }, 'error');
};
