// Authorization failure state only. Business records, drafts and durable
// commands remain with their existing owners. A denied owner cannot be reset;
// recovery requires a different verified readOwnerKey.
export function createReadOwnerAccess({ ownerKey, isOwnerCurrent, isPermissionError }) {
  if (typeof ownerKey !== 'string' || !ownerKey || typeof isOwnerCurrent !== 'function'
    || typeof isPermissionError !== 'function') throw new TypeError('A read owner and error classifier are required.');
  let failure = null;
  const listeners = new Set(), cleanups = new Set();
  return Object.freeze({
    ownerKey,
    isCurrent: () => !failure && isOwnerCurrent(),
    getSnapshot: () => failure,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    onDenied(cleanup) {
      if (failure) cleanup(failure);
      else cleanups.add(cleanup);
      return () => cleanups.delete(cleanup);
    },
    reject(error, collection = '') {
      if (!isOwnerCurrent() || !isPermissionError(error)) return false;
      if (failure) return true;
      // Latch before cleanup or React notification. Already queued state
      // updaters, metadata witnesses and transport completions now fail closed.
      failure = Object.freeze({ ownerKey, collection, code: error?.code || 'permission-denied' });
      try {
        for (const cleanup of [...cleanups]) {
          try { cleanup(failure); } catch { /* One cleanup cannot prevent the remaining read teardown. */ }
        }
      } finally {
        cleanups.clear();
        for (const listener of [...listeners]) {
          try { listener(); } catch { /* One observer cannot suppress the access failure screen. */ }
        }
      }
      return true;
    },
  });
}
