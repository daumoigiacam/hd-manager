// This is a lifecycle binding, not authentication. Callers must supply identity
// from verified authenticated state; persisted UI identity is not verification.
export function getVerifiedDataSessionKey(scope) {
  return JSON.stringify(Object.values(normalizeScope(scope)));
}

function normalizeScope(scope) {
  if (!scope || typeof scope !== 'object') throw new TypeError('A verified data session is required.');
  const principalId = scope.principalId ?? scope.uid;
  if (scope.uid !== undefined && scope.principalId !== undefined && scope.uid !== scope.principalId) {
    throw new TypeError('Conflicting verified principal identity.');
  }
  const identity = {
    principalId,
    tenantId: scope.tenantId,
    permissionRevision: scope.permissionRevision,
    sessionId: scope.sessionId,
  };
  if (!Object.values(identity).every(value => typeof value === 'string' && value.trim().length > 0)) {
    throw new TypeError('Verified principal, tenant, permission revision and session ID are required.');
  }
  return Object.freeze(identity);
}

export function createVerifiedDataSession(scope, { onClose = () => {} } = {}) {
  const identity = normalizeScope(scope);
  const key = getVerifiedDataSessionKey(identity);
  const listeners = new Set();
  let snapshot = Object.freeze({ scope: identity, key, closed: false });
  let owners = 0, revision = 0;
  const close = () => {
    if (snapshot.closed) return;
    snapshot = Object.freeze({ scope: identity, key, closed: true });
    revision++;
    try { onClose(); }
    finally {
      for (const listener of [...listeners]) {
        try { listener(); } catch { /* Observers cannot prevent other revocation notifications. */ }
      }
      listeners.clear();
    }
  };
  return Object.freeze({
    scope: identity,
    key,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('A session listener is required.');
      if (snapshot.closed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isCurrent(candidate = identity) {
      if (snapshot.closed) return false;
      try { return getVerifiedDataSessionKey(candidate) === key; }
      catch { return false; }
    },
    // Only effect cleanup is deferred. Access changes call close() synchronously
    // before constructing a replacement owner, including same-UID relogin.
    retain() {
      if (snapshot.closed) throw Object.assign(new Error('Verified data session closed.'), { code: 'cancelled' });
      owners++;
      revision++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        owners--;
        const ticket = ++revision;
        void Promise.resolve().then(() => {
          if (!owners && ticket === revision) close();
        });
      };
    },
    close,
  });
}
