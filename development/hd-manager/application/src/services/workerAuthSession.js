// The read worker receives an already authenticated Firebase SDK session only.
// No password/custom-token replay, disk persistence or cross-account migration.
const text = (value, limit = 512) => typeof value === 'string' && value.length > 0 && value.length <= limit;
const copy = value => value === null ? null : JSON.parse(JSON.stringify(value));
const invalid = () => { throw new Error('Invalid read-worker authentication scope.'); };

function sanitize(record, scope) {
  if (!record || !scope || !text(scope.uid) || !text(scope.apiKey) || !text(scope.appName)
    || record.uid !== scope.uid || record.apiKey !== scope.apiKey || record.appName !== scope.appName
    || record.isAnonymous !== false || typeof record.emailVerified !== 'boolean') return invalid();
  const token = record.stsTokenManager;
  if (!token || !text(token.accessToken, 65536) || !text(token.refreshToken, 65536)
    || !Number.isFinite(token.expirationTime) || token.expirationTime <= 0) return invalid();
  return { uid: record.uid, apiKey: record.apiKey, appName: record.appName,
    emailVerified: record.emailVerified, isAnonymous: false, providerData: [],
    ...(typeof record.tenantId === 'string' ? { tenantId: record.tenantId } : {}),
    stsTokenManager: { accessToken: token.accessToken, refreshToken: token.refreshToken, expirationTime: token.expirationTime } };
}

export function createWorkerAuthEnvelope(user, scope) {
  if (!user || user.uid !== scope?.uid || typeof user.toJSON !== 'function') return invalid();
  return sanitize(user.toJSON(), scope);
}

// Adapter contract matches the pinned Firebase Auth SDK and the existing native
// persistence adapter. Integration tests must exercise actual initializeAuth;
// passing a plain object to updateCurrentUser or private UserImpl is forbidden.
export function createWorkerAuthPersistence(envelope, scope) {
  const expected = { uid: scope?.uid, apiKey: scope?.apiKey, appName: scope?.appName };
  let record = sanitize(envelope, expected), closed = false;
  const userKey = `firebase:authUser:${expected.apiKey}:${expected.appName}`;
  class WorkerAuthPersistence {
    static type = 'NONE';
    type = 'NONE';
    _shouldAllowMigration = false;
    async _isAvailable() { return !closed; }
    async _get(key) { return !closed && key === userKey ? copy(record) : null; }
    async _set(key, value) {
      if (closed || key !== userKey) return invalid();
      record = sanitize(value, expected);
    }
    async _remove(key) { if (key === userKey) record = null; }
    _addListener() {}
    _removeListener() {}
  }
  return { Persistence: WorkerAuthPersistence, clear() { closed = true; record = null; } };
}

export function assertWorkerIdentity(user, claims, scope) {
  if (!user || user.isAnonymous || user.uid !== scope?.uid
    || !text(scope?.companyId) || claims?.companyId !== scope.companyId
    || !['employee', 'customer'].includes(scope?.accountType)
    || claims?.accountType !== scope.accountType) return invalid();
}
