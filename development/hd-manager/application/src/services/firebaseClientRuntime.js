// Sole Firebase client initialization. ESM live exports share the same instances with every consumer.
import { normalizeCustomerPhone } from "../features/customers/productCRMShared.jsx";
import { getFirestoreTransportOptions } from "./firestoreTransport.js";
import { NativeSessionPersistence, rememberedNativeUid } from "./nativeSessionPersistence.js";
import { initializeApp } from "firebase/app";
import { getFirebaseEmulatorConfig } from "../config/firebase-endpoints.js";
import { getAuth, initializeAuth, setPersistence, indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence, connectAuthEmulator } from "firebase/auth";
import { initializeFirestore, getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { Capacitor } from "@capacitor/core";
import { recordStartupEvent } from "./startupTelemetry.js";
import { initFirebaseObservability } from "./firebaseObservability.js";
import { isVpsMode, vpsDataMode } from "@hd/hd-connect-runtime";
import { resolveDataAppId, resolveFirebaseRuntimeConfig } from "@hd/firebase-runtime";

const LOGIN_DEBUG_STORAGE_KEY = 'hd-manager-login-debug';
const isLoginDebugEnabled = () => {
  try {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search || '');
    return params.get('loginDebug') === '1' || window.localStorage?.getItem(LOGIN_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

const maskLoginPhone = (value = '') => {
  const digits = normalizeCustomerPhone(value);
  if (!digits) return '';
  if (digits.length <= 4) return '*'.repeat(digits.length);
  return `${digits.slice(0, 3)}***${digits.slice(-2)}`;
};

const buildSafeLoginDiagnosticPayload = (payload = {}) => {
  const safePayload = {};
  Object.entries(payload || {}).forEach(([key, value]) => {
    const lowerKey = `${key}`.toLowerCase();
    if (lowerKey.includes('phone')) {
      safePayload[key] = maskLoginPhone(value);
    } else if (value instanceof Error) {
      safePayload[key] = { code: value.code || '', message: value.message || '' };
    } else {
      safePayload[key] = value;
    }
  });
  return safePayload;
};

const logLoginStep = (step, payload = {}, level = 'info') => {
  if (!isLoginDebugEnabled()) return;
  const safePayload = buildSafeLoginDiagnosticPayload(payload);
  if (typeof window !== 'undefined') {
    const previousEntries = Array.isArray(window.__HD_LOGIN_DEBUG__) ? window.__HD_LOGIN_DEBUG__ : [];
    window.__HD_LOGIN_DEBUG__ = [
      ...previousEntries.slice(-59),
      { step, payload: safePayload, at: new Date().toISOString() },
    ];
  }
  const logger = level === 'warn' ? console.warn : level === 'error' ? console.error : console.info;
  // Keep diagnostics readable in browser log collectors without exposing
  // credentials, tokens or unmasked phone numbers.
  logger(`[HD Login] ${step} ${JSON.stringify(safePayload)}`);
};

// BAO VE CRASH: Kiem tra va khoi tao Firebase an toan
let app, auth, db;
let isFirebaseConfigured = true;
let activeFirebaseConfig = {};
let firebaseAuthPersistencePromise = Promise.resolve('unavailable');

const configureFirebaseAuthPersistence = async (firebaseAuth) => {
  if (!firebaseAuth) return 'unavailable';
  if (Capacitor.isNativePlatform()) {
    await setPersistence(firebaseAuth, rememberedNativeUid() ? NativeSessionPersistence : inMemoryPersistence);
    return rememberedNativeUid() ? 'native-encrypted' : 'memory';
  }
  try {
    await setPersistence(firebaseAuth, indexedDBLocalPersistence);
    recordStartupEvent('auth.persistence.ready', { mode: 'indexedDB' });
    return 'indexedDB';
  } catch (indexedDbError) {
    try {
      await setPersistence(firebaseAuth, browserLocalPersistence);
      recordStartupEvent('auth.persistence.ready', { mode: 'localStorage', fallback: true });
      return 'localStorage';
    } catch (localStorageError) {
      recordStartupEvent('auth.persistence.fallback_failed', {
        indexedDbError: indexedDbError?.message || String(indexedDbError),
        localStorageError: localStorageError?.message || String(localStorageError),
      }, 'warn');
      return 'unavailable';
    }
  }
};

if (isVpsMode) {
  // VPS modes must not initialize Firebase or let a core request fall back to it.
  isFirebaseConfigured = false;
  recordStartupEvent('firebase.initialization.skipped', { dataMode: vpsDataMode });
  logLoginStep('Firebase initialization skipped for VPS mode', { dataMode: vpsDataMode });
} else {
  try {
    const firebaseConfig = resolveFirebaseRuntimeConfig();
    activeFirebaseConfig = firebaseConfig;
    logLoginStep('Firebase initialize', {
      configured: Boolean(firebaseConfig?.apiKey),
      projectId: firebaseConfig?.projectId || '',
      authDomain: firebaseConfig?.authDomain || '',
      dataMode: import.meta.env.VITE_DATA_MODE || 'cloud'
    });

    if (Object.keys(firebaseConfig).length === 0 || !firebaseConfig.apiKey) {
      isFirebaseConfigured = false;
      logLoginStep('Firebase initialize missing config', { configured: false }, 'warn');
    } else {
      app = initializeApp(firebaseConfig);
      recordStartupEvent('firebase.initialized', {
        projectId: firebaseConfig?.projectId || '',
        authDomain: firebaseConfig?.authDomain || '',
      });
      if (!getFirebaseEmulatorConfig(firebaseConfig.projectId)) initFirebaseObservability(app, {
        appName: 'HD Manager',
        projectId: firebaseConfig?.projectId || '',
      });
      try {
        // Let Firebase select the first persistence layer supported by the
        // device during Auth construction so WebView IndexedDB startup does
        // not block registration of the initial auth-state listener.
        auth = initializeAuth(app, {
          persistence: Capacitor.isNativePlatform() ? (rememberedNativeUid() ? NativeSessionPersistence : inMemoryPersistence) : [indexedDBLocalPersistence, browserLocalPersistence]
        });
        firebaseAuthPersistencePromise = Promise.resolve('indexedDB-or-localStorage');
        recordStartupEvent('auth.persistence.configured', {
          mode: 'indexedDB-or-localStorage'
        });
      } catch (authInitializationError) {
        console.warn('Khong the khoi tao Firebase Auth voi persistence tu dong:', authInitializationError);
        auth = getAuth(app);
        firebaseAuthPersistencePromise = configureFirebaseAuthPersistence(auth);
      }
      try {
        db = initializeFirestore(app, {
          // Auto-detect can overlap watch target teardown with short-lived reads
          // in WebKit/WebView and poison Firestore's internal AsyncQueue (ca9/b815).
          experimentalAutoDetectLongPolling: false,
          ...getFirestoreTransportOptions(),
        });
      } catch (firestoreInitError) {
        console.warn('Firestore da duoc khoi tao truoc do, dung instance hien co:', firestoreInitError);
        db = getFirestore(app);
      }
      const emulator = getFirebaseEmulatorConfig(firebaseConfig.projectId);
      if (emulator) {
        connectAuthEmulator(auth, `http://${emulator.host}:${emulator.authPort}`, { disableWarnings: true });
        connectFirestoreEmulator(db, emulator.host, emulator.firestorePort);
      }
    }
  } catch (error) {
    console.error("Lỗi khởi tạo Firebase:", error);
    logLoginStep('Firebase initialize error', { error }, 'error');
    isFirebaseConfigured = false;
  }
}

const appId = resolveDataAppId();
logLoginStep('Data app id', { appId, projectId: activeFirebaseConfig?.projectId || '' });

export { LOGIN_DEBUG_STORAGE_KEY, isLoginDebugEnabled, maskLoginPhone, buildSafeLoginDiagnosticPayload, logLoginStep, app, auth, db, isFirebaseConfigured, activeFirebaseConfig, firebaseAuthPersistencePromise, configureFirebaseAuthPersistence, appId };
