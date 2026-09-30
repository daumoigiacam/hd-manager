import { appFunction } from './app-source-function.mjs';
import { coalescePendingWrite } from '../../src/utils/localFirstSave.js';
import { ATOMIC_SAVE_COLLECTION, mergeAtomicWrites, validateAtomicWrites } from '../../src/utils/atomicSave.js';

// Memory storage only: measures serialization and control flow, not device I/O.
export function createSaveQueueHarness(initial = []) {
  const queue = { current: initial };
  const stored = new Map();
  const stats = { writes: 0, reads: 0, bytes: 0, updates: 0 };
  const fault = { full: false, corrupt: false };
  const bindings = {
    firebaseUser: { uid: 'fixture-writer' },
    activeTenantScopeRef: { current: 'fixture' }, pendingFirebaseWritesRef: queue,
    getTenantStorageKey: (key, company) => `${key}:${company}`,
    PENDING_FIREBASE_WRITES_STORAGE_KEY: 'pending',
    window: { localStorage: {
      setItem(key, value) {
        if (fault.full) throw new Error('QuotaExceeded');
        stats.writes++; stats.bytes += Buffer.byteLength(value);
        stored.set(key, value);
      },
      getItem(key) { stats.reads++; return fault.corrupt ? 'invalid' : stored.get(key); },
      removeItem(key) { stored.delete(key); },
    } },
    setPendingFirebaseWriteCount() { stats.updates++; }, setRealtimeStatus() {},
    getFriendlyFirebaseErrorMessage: () => '', isFirestoreInternalAssertionError: () => false,
    coalescePendingWrite, ATOMIC_SAVE_COLLECTION, mergeAtomicWrites, validateAtomicWrites,
  };
  bindings.savePendingFirebaseWrites = appFunction('savePendingFirebaseWrites', bindings);
  bindings.persistPendingFirebaseWrites = appFunction('persistPendingFirebaseWrites', bindings);
  return { queue, stored, stats, fault, enqueue: appFunction('enqueuePendingFirebaseWrite', bindings) };
}
