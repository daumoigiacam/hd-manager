// Fictional/local prototype only. Callbacks own transport, source extraction and
// the existing projection store. This module creates no database/cache/listener.
import { createHomePrimarySnapshotIterator } from '../../../src/services/executiveDashboardService.js';
import { encodeHomePrimaryCompactCache, decodeHomePrimaryCompactCache, HOME_PRIMARY_COMPACT_MAX_TTL_MS } from '../../../src/services/homePrimaryCompactCache.js';

export const HOME_READ_MODEL_PROJECT = 'demo-hdm-home-projection-local';
export const HOME_READ_MODEL_VERSION = 1;
export const HOME_READ_MODEL_REVISION_KEYS = Object.freeze([
  'companies', 'employees', 'customers', 'orders', 'payments', 'expenses', 'financials',
  'attendance', 'performance', 'warehouseImports', 'payrollPeriods', 'employeeReviews',
  'customerComplaints', 'holidays', 'deliveryReports', 'cashExpenseRecords', 'payrollCosts', 'debtLedger',
]);
const scopeKeys = ['principalId', 'tenantId', 'permissionKey', 'sessionId', 'dayKey', 'timeZone', 'timezoneOffsetMinutes'];
const derivedKeys = ['cashExpenseRecords', 'payrollCosts', 'debtLedger'];
const inputKeys = ['employees', 'customers', 'orders', 'payments', 'expenses', ...derivedKeys];
const fail = code => { throw Object.assign(new Error(code), { code }); };
const check = (ok, code) => { if (!ok) fail(code); };
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const copy = value => JSON.parse(JSON.stringify(value, (key, item) => {
  check(typeof item !== 'function' && typeof item !== 'undefined' && typeof item !== 'bigint'
    && (typeof item !== 'number' || Number.isFinite(item)), 'non-json-input');
  return item;
}));
const revisionsEqual = (a, b) => HOME_READ_MODEL_REVISION_KEYS.every(key => a[key] === b[key]);
function revisions(value) {
  check(value && Object.keys(value).length === HOME_READ_MODEL_REVISION_KEYS.length
    && HOME_READ_MODEL_REVISION_KEYS.every(key => own(value, key) && Number.isSafeInteger(value[key]) && value[key] >= 0), 'invalid-revisions');
  return Object.fromEntries(HOME_READ_MODEL_REVISION_KEYS.map(key => [key, value[key]]));
}
function versionFor(value, now, ttlMs) {
  check(value && value.schemaVersion === HOME_READ_MODEL_VERSION, 'source-version-mismatch');
  check(Number.isSafeInteger(value.readTime) && value.readTime <= now && now - value.readTime < ttlMs, 'source-stale');
  return { schemaVersion: HOME_READ_MODEL_VERSION, readTime: value.readTime, revisions: revisions(value.revisions) };
}
function scopeFor(value, now) {
  check(value && scopeKeys.every(key => own(value, key)), 'invalid-scope');
  check(scopeKeys.slice(0, -1).every(key => typeof value[key] === 'string' && value[key].trim() && value[key].length <= 512), 'invalid-scope');
  const date = new Date(now);
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  // Existing finance formulas use local Date getters. Never silently compute
  // another timezone's calendar on the local runner's host timezone.
  let expectedZone, actualZone;
  try {
    expectedZone = new Intl.DateTimeFormat('en', { timeZone: value.timeZone }).resolvedOptions().timeZone;
    actualZone = new Intl.DateTimeFormat('en').resolvedOptions().timeZone;
  } catch { fail('invalid-timezone'); }
  check(expectedZone === actualZone, 'runtime-timezone-mismatch');
  check(value.dayKey === day && value.timezoneOffsetMinutes === date.getTimezoneOffset(), 'clock-scope-mismatch');
  return Object.fromEntries(scopeKeys.map(key => [key, value[key]]));
}
function settings(now, ttlMs) {
  check(Number.isSafeInteger(now) && now >= 0, 'invalid-clock');
  check(Number.isSafeInteger(ttlMs) && ttlMs > 0 && ttlMs <= HOME_PRIMARY_COMPACT_MAX_TTL_MS, 'invalid-ttl');
}

export async function buildHomeReadModelProjection(input, { scope, version, now = Date.now(), ttlMs = 60000, yieldWork = async () => {} } = {}) {
  settings(now, ttlMs);
  const identity = scopeFor(scope, now);
  const sourceVersion = versionFor(version, now, ttlMs);
  check(input && inputKeys.every(key => own(input, key) && input[key] && typeof input[key] === 'object'), 'missing-inputs');
  check(Array.isArray(input.cashExpenseRecords), 'missing-inputs');
  const detached = copy(input);
  const iterator = createHomePrimarySnapshotIterator({ ...detached, now: new Date(now).toISOString() });
  let snapshot;
  try {
    for (;;) {
      const step = iterator.next();
      if (step.done) { snapshot = step.value; break; }
      await yieldWork();
    }
  } finally { iterator.return(); }
  // Freshness is bounded by the source read, never renewed by building/replay.
  snapshot.generatedAt = new Date(sourceVersion.readTime).toISOString();
  const encoded = encodeHomePrimaryCompactCache(snapshot, identity, { now, ttlMs });
  check(encoded.ok, encoded.reason);
  const compactEnvelope = JSON.parse(encoded.serialized);
  return { kind: 'home-read-model-local-v1', projectionVersion: HOME_READ_MODEL_VERSION,
    scope: identity, sourceVersion, generatedAt: snapshot.generatedAt, builtAt: now,
    expiresAt: compactEnvelope.expiresAt, compact: encoded.serialized };
}

export function createHomeReadModelPrototype({ verifyContext, readVersion, readInputs, storage,
  clock = Date.now, ttlMs = 60000, maxAttempts = 2, yieldWork = async () => {} } = {}) {
  check([verifyContext, readVersion, readInputs, clock, yieldWork].every(fn => typeof fn === 'function')
    && storage && typeof storage.read === 'function' && typeof storage.publishIfCurrent === 'function', 'invalid-callbacks');
  check(Number.isInteger(maxAttempts) && maxAttempts >= 1 && maxAttempts <= 3, 'invalid-retry-bound');
  settings(clock(), ttlMs);
  async function contextFor(request) {
    const value = await verifyContext(request);
    check(value && value.verified === true && value.allowed === true, 'access-denied');
    check(value.projectId === HOME_READ_MODEL_PROJECT && typeof value.appId === 'string' && value.appId.startsWith('fictional-'), 'not-fictional-local-project');
    return { projectId: value.projectId, appId: value.appId, scope: scopeFor(value.scope, clock()) };
  }
  const keyFor = context => JSON.stringify([HOME_READ_MODEL_PROJECT, context.appId, HOME_READ_MODEL_VERSION, ...scopeKeys.map(key => context.scope[key])]);
  async function stillCurrent(request, key) { check(keyFor(await contextFor(request)) === key, 'scope-changed'); }
  function inspect(record, context) {
    if (!record) return { state: 'missing', reason: 'projection-missing', snapshot: null };
    if (record.kind !== 'home-read-model-local-v1' || record.projectionVersion !== HOME_READ_MODEL_VERSION) return { state: 'stale', reason: 'projection-version-mismatch', snapshot: null };
    if (JSON.stringify(record.scope) !== JSON.stringify(context.scope)) return { state: 'error', reason: 'scope-mismatch', snapshot: null };
    try {
      revisions(record.sourceVersion.revisions);
      const decoded = decodeHomePrimaryCompactCache(record.compact, context.scope, { now: clock() });
      const envelope = JSON.parse(record.compact);
      check(decoded.ok, decoded.reason);
      check(record.sourceVersion.schemaVersion === HOME_READ_MODEL_VERSION && Number.isSafeInteger(record.sourceVersion.readTime)
        && record.generatedAt === decoded.snapshot.generatedAt && Date.parse(record.generatedAt) === record.sourceVersion.readTime
        && record.expiresAt === envelope.expiresAt && record.expiresAt <= record.sourceVersion.readTime + ttlMs
        && Number.isSafeInteger(record.builtAt) && record.builtAt >= record.sourceVersion.readTime && record.builtAt <= clock(), 'invalid-record');
      return { state: 'cached', reason: 'requires-revalidation', snapshot: decoded.snapshot, generatedAt: record.generatedAt, expiresAt: record.expiresAt };
    } catch (error) { return { state: 'stale', reason: error.code || 'invalid-record', snapshot: null }; }
  }
  const result = (state, reason, snapshot = null, extra = {}) => ({ state, reason, snapshot, current: state === 'current',
    projectionVersion: HOME_READ_MODEL_VERSION, capabilities: 'four-cards-line-only', ...extra });
  async function read(request) {
    let context, key, record;
    try {
      context = await contextFor(request); key = keyFor(context);
      record = await storage.read(key, context);
      const head = versionFor(await readVersion(context), clock(), ttlMs);
      await stillCurrent(request, key);
      const cached = inspect(record, context);
      if (!cached.snapshot) return result(cached.state, cached.reason);
      if (!revisionsEqual(record.sourceVersion.revisions, head.revisions)) return result('stale', 'source-updated', cached.snapshot,
        { generatedAt: cached.generatedAt, expiresAt: cached.expiresAt, sourceVersion: copy(record.sourceVersion) });
      return result('current', 'verified-source-revisions', cached.snapshot,
        { generatedAt: cached.generatedAt, expiresAt: cached.expiresAt, sourceVersion: copy(record.sourceVersion) });
    } catch (error) {
      // A failed source check may retain valid same-scope cached data, but a
      // failed identity check always hides it. Reverify after every async error.
      try {
        if (key) {
          await stillCurrent(request, key);
          const cached = inspect(record, context);
          if (cached.snapshot) return result('revalidating', error.code || 'source-unavailable', cached.snapshot,
            { generatedAt: cached.generatedAt, expiresAt: cached.expiresAt, sourceVersion: copy(record.sourceVersion) });
        }
      } catch { return result('hidden', 'access-or-scope-changed'); }
      return result(context ? 'error' : 'hidden', error.code || 'source-unavailable');
    }
  }
  async function refresh(request, event = null) {
    let attempts = 0;
    for (; attempts < maxAttempts; attempts++) {
      let key;
      try {
        const context = await contextFor(request); key = keyFor(context);
        const head = versionFor(await readVersion(context), clock(), ttlMs);
        await stillCurrent(request, key);
        if (event) {
          check(HOME_READ_MODEL_REVISION_KEYS.includes(event.source) && Number.isSafeInteger(event.revision) && event.revision >= 0, 'invalid-event');
          if (event.revision > head.revisions[event.source]) return result('stale', 'event-ahead-of-source', null, { attempts: attempts + 1 });
        }
        const existing = await storage.read(key, context);
        await stillCurrent(request, key);
        const cached = inspect(existing, context);
        if (cached.snapshot && revisionsEqual(existing.sourceVersion.revisions, head.revisions)) {
          // Check the head again: storage read itself may yield across an event.
          const latest = versionFor(await readVersion(context), clock(), ttlMs);
          await stillCurrent(request, key);
          if (!revisionsEqual(latest.revisions, head.revisions)) continue;
          return result('current', 'idempotent-replay', cached.snapshot, { attempts: attempts + 1, replayed: true,
            generatedAt: cached.generatedAt, expiresAt: cached.expiresAt, sourceVersion: copy(existing.sourceVersion) });
        }
        const source = await readInputs(context);
        await stillCurrent(request, key);
        check(source && source.verified === true && source.complete === true, 'incomplete-source');
        const captured = versionFor(source.version, clock(), ttlMs);
        check(derivedKeys.every(name => source.derivedFor && source.derivedFor[name]
          && revisionsEqual(revisions(source.derivedFor[name]), captured.revisions)), 'derived-input-stale');
        if (HOME_READ_MODEL_REVISION_KEYS.some(name => captured.revisions[name] < head.revisions[name])) continue;
        const record = await buildHomeReadModelProjection(source.inputs, { scope: context.scope, version: captured, now: clock(), ttlMs, yieldWork });
        const latest = versionFor(await readVersion(context), clock(), ttlMs);
        await stillCurrent(request, key);
        if (!revisionsEqual(latest.revisions, captured.revisions)) continue;
        const candidate = inspect(record, context);
        check(candidate.snapshot, 'candidate-expired-or-invalid');
        // Required owner contract: compare source versions AND publish atomically
        // (also deduplicate a record of the same version). No blind set/write.
        const saved = await storage.publishIfCurrent({ key, record, expectedVersion: captured, context });
        await stillCurrent(request, key);
        if (saved && saved.status === 'conflict') continue;
        check(saved && ['published', 'replayed'].includes(saved.status) && saved.record, 'publication-error');
        const finalHead = versionFor(await readVersion(context), clock(), ttlMs);
        await stillCurrent(request, key);
        if (!revisionsEqual(finalHead.revisions, captured.revisions)) continue;
        const verified = inspect(saved.record, context);
        check(verified.snapshot && revisionsEqual(saved.record.sourceVersion.revisions, captured.revisions), 'publication-error');
        return result('current', saved.status, verified.snapshot, { attempts: attempts + 1, replayed: saved.status === 'replayed',
          generatedAt: verified.generatedAt, expiresAt: verified.expiresAt, sourceVersion: copy(saved.record.sourceVersion) });
      } catch (error) {
        if (key) { try { await stillCurrent(request, key); } catch { return result('hidden', 'access-or-scope-changed', null, { attempts: attempts + 1 }); } }
        if (error.retryable === true && attempts + 1 < maxAttempts) continue;
        const cached = await read(request);
        if (cached.state === 'hidden') return { ...cached, attempts: attempts + 1 };
        return result(cached.snapshot ? (cached.current ? 'revalidating' : cached.state) : 'error', error.code || 'build-or-source-error', cached.snapshot,
          { attempts: attempts + 1, generatedAt: cached.generatedAt, expiresAt: cached.expiresAt, sourceVersion: cached.sourceVersion });
      }
    }
    const cached = await read(request);
    if (cached.state === 'hidden') return { ...cached, attempts };
    return result(cached.snapshot ? 'revalidating' : 'stale', 'retry-exhausted', cached.snapshot,
      { attempts, generatedAt: cached.generatedAt, expiresAt: cached.expiresAt, sourceVersion: cached.sourceVersion });
  }
  return Object.freeze({ read, refresh });
}
