import {storedLocalBusinessDayKey} from '../utils/businessDate.js';
/**
 * Customer history projection v1. Owns only the offline_customer_history_*_v1
 * tables below. Uses the supplied encrypted database/transaction owner, verified
 * session and SIGNED grant authorizer; never opens storage or writes commands.
 * authorize must verify kind `customer.history.read` (including on ingestion).
 * The supplied authorizer must map that kind to a signed history capability
 * (offlineCustomerGrant.js uses `customers.history.read`); generic customer read
 * permission is insufficient. Missing mappings/capabilities must fail closed.
 * Each transaction verifies twice, after dequeue and before commit/publication.
 * Native timing impact: two signature verifications and secure-store watermark
 * operations per transaction. This deliberately retains revocation/expiry safety.
 *
 * ingestPage({customerId, source: 'orders'|'payments'|'expenses', from, to,
 *   snapshotRevision, sourceCursor: null|string, nextSourceCursor: null|string,
 *   complete: boolean, records: [{document, serverRevision, serverCursor}]})
 * All dates are real calendar YYYY-MM-DD keys; document.date is the ONLY business
 * date. No createdAt/paymentDate coercion, financial derivation or fake fallback.
 * Revisions are nonnegative safe integers from the server, not local timestamps.
 * serverCursor identifies an immutable record revision; sourceCursor identifies
 * a page within a server snapshot. A new snapshot starts at null; continuations
 * must match the preceding nextSourceCursor. complete is an explicit server
 * assertion, accepted only after that contiguous chain, never inferred by size.
 * Immutable pages/revisions survive replay; newer snapshots do not erase them.
 *
 * page({customerId, from, to, limit=20, after=null}) returns
 * {records, nextCursor, completeness:[{source, status, snapshotRevision, ...}]}.
 * Dates use [from,to); records are ordered ASC by (businessDate, historyId).
 * historyId = source + ':' + document.id disambiguates IDs across collections.
 * Cursor binds scope/customer/range and a projection epoch. Changed projections
 * reject stale cursors; callers restart instead of silently skipping/mixing rows.
 * Completeness describes the EXACT requested interval at each source snapshot,
 * not present-day freshness, overlapping ranges, missing sources or local edits.
 * Metadata and payloads are separate; document is the received/local source JSON.
 * Non-SYNCED projection rows belong to a separate local workflow: ingestion stores
 * the received server revision but never replaces their JSON, date or sync state.
 * No local financial mutation workflow is provided here.
 *
 * Profile repository SQL API (inside the SAME authorized transaction):
 *   history.withHistoryFilter({from,to,profileAlias:'c'}, async (db, filter) =>
 *     db.query(`SELECT c.id FROM offline_customers AS c
 *       WHERE c.tenant_id=? AND c.principal_id=? AND ${filter.sql}
 *       AND c.id>? ORDER BY c.id LIMIT ?`,
 *       [tenantId,principalId,...filter.params,afterId,20]));
 * filter.sql is exactly:
 *   EXISTS (SELECT 1 FROM offline_customer_history_entries_v1 AS h
 *     WHERE h.tenant_id=? AND h.principal_id=?
 *     AND h.tenant_id=c.tenant_id AND h.principal_id=c.principal_id
 *     AND h.customer_id=c.id AND h.business_date>=? AND h.business_date<?)
 * filter.params = [session.scope.tenantId, session.scope.principalId, from, to].
 * Only profileAlias (a validated SQL identifier) is interpolated. This tests
 * actual history dates, never profile.createdAt, coverage or an in-memory scan.
 * The callback gets query only, must bound its SELECT and must not retain db or
 * SQL for execution outside this authorized transaction. Do not nest transactions.
 * filterCustomerIds offers the same EXISTS predicate for <=100 candidate IDs.
 *
 * Limits bound each page, serialized payload and SQL result; retained server
 * evidence is append-only, not subject to an implicit retention/eviction policy.
 */

export const CUSTOMER_HISTORY_LIMITS = Object.freeze({
  page: 100, recordBytes: 65536, batchBytes: 1048576, cursorLength: 2048,
});
const sources = Object.freeze(['orders', 'payments', 'expenses']);
const states = "'LOCAL_ONLY','PENDING_SYNC','SYNCING','SYNCED','SYNC_FAILED','CONFLICT_REQUIRES_REVIEW'";
const entries = 'offline_customer_history_entries_v1';
const revisions = 'offline_customer_history_revisions_v1';
const pages = 'offline_customer_history_pages_v1';
const coverage = 'offline_customer_history_coverage_v1';
const epochs = 'offline_customer_history_epochs_v1';
const fail = message => { throw new TypeError(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 256
  && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
const revision = value => Number.isSafeInteger(value) && value >= 0;
const token = value => value === null || (typeof value === 'string' && value.length > 0
  && value.length <= CUSTOMER_HISTORY_LIMITS.cursorLength && !/[\u0000-\u001f\u007f]/.test(value));
function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function interval(from, to) {
  if (!day(from) || !day(to) || from >= to) fail('Invalid history date interval');
}
function customer(value) { if (!identifier(value)) fail('Invalid history customerId'); }
function limitValue(value) {
  if (!Number.isInteger(value) || value < 1 || value > CUSTOMER_HISTORY_LIMITS.page) fail('Invalid history page limit');
}
// Canonical JSON avoids mistaking harmless object-key reordering for a changed
// immutable revision; rejects lossy Date/toJSON/undefined/non-finite conversions.
function canonical(value, seen = new Set(), depth = 0) {
  if (depth > 32) fail('History JSON is too deeply nested');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (!object(value) && !Array.isArray(value)) fail('History records require plain JSON');
  if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) fail('History records require plain JSON');
  if (seen.has(value)) fail('Cyclic history JSON');
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) fail('Invalid history JSON array');
    for (let i = 0; i < value.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(value, i)) fail('Invalid history JSON array');
    }
    result = '[' + Array.from(value, item => canonical(item, seen, depth + 1)).join(',') + ']';
  } else {
    result = '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key], seen, depth + 1)).join(',') + '}';
  }
  seen.delete(value);
  return result;
}
const bytes = value => new TextEncoder().encode(value).length;
function prepareBatch(input, tenantId) {
  if (!object(input)) fail('Invalid history page');
  const {customerId, source, from, to, snapshotRevision, sourceCursor, nextSourceCursor, complete, records} = input;
  customer(customerId); interval(from, to);
  if (!sources.includes(source) || !revision(snapshotRevision) || !token(sourceCursor) || !token(nextSourceCursor)
    || typeof complete !== 'boolean' || (complete && nextSourceCursor !== null)
    || (nextSourceCursor !== null && nextSourceCursor === sourceCursor)
    || !Array.isArray(records) || records.length > CUSTOMER_HISTORY_LIMITS.page) fail('Invalid server history page metadata');
  const ids = new Set();
  const prepared = records.map(item => {
    if (!object(item) || !object(item.document)) fail('Invalid history source record');
    const {document, serverRevision, serverCursor} = item;
    if (!identifier(document.id) || document.companyId !== tenantId || document.customerId !== customerId) fail('History document identity/scope mismatch');
    const businessDate=storedLocalBusinessDayKey(document.date);
    if (!businessDate || businessDate < from || businessDate >= to) fail('Invalid history business date');
    if (!revision(serverRevision) || serverRevision > snapshotRevision || !token(serverCursor) || serverCursor === null) fail('Invalid history server revision/cursor');
    if (ids.has(document.id)) fail('Duplicate history document in page');
    ids.add(document.id);
    const json = canonical(document);
    if (bytes(json) > CUSTOMER_HISTORY_LIMITS.recordBytes) fail('History record exceeds byte limit');
    return {id: document.id, date: businessDate, json, serverRevision, serverCursor};
  });
  const batch = {customerId, source, from, to, snapshotRevision, sourceCursor, nextSourceCursor, complete, records: prepared};
  const json = canonical(batch);
  if (bytes(json) > CUSTOMER_HISTORY_LIMITS.batchBytes) fail('History page exceeds byte limit');
  return {...batch, json};
}

async function schema(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS ${revisions} (
    tenant_id TEXT NOT NULL, principal_id TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('orders','payments','expenses')),
    id TEXT NOT NULL, server_revision INTEGER NOT NULL CHECK(server_revision>=0), server_cursor TEXT NOT NULL,
    customer_id TEXT NOT NULL, business_date TEXT NOT NULL, document_json TEXT NOT NULL CHECK(json_valid(document_json)),
    PRIMARY KEY(tenant_id,principal_id,source,id,server_revision))`);
  await db.run(`CREATE TABLE IF NOT EXISTS ${entries} (
    tenant_id TEXT NOT NULL, principal_id TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('orders','payments','expenses')),
    id TEXT NOT NULL, history_id TEXT NOT NULL, customer_id TEXT NOT NULL, business_date TEXT NOT NULL,
    local_json TEXT NOT NULL CHECK(json_valid(local_json)), state TEXT NOT NULL CHECK(state IN (${states})),
    server_revision INTEGER CHECK(server_revision>=0), server_cursor TEXT,
    CHECK(history_id=source||':'||id), CHECK(state<>'SYNCED' OR (server_revision IS NOT NULL AND server_cursor IS NOT NULL)),
    PRIMARY KEY(tenant_id,principal_id,source,id), UNIQUE(tenant_id,principal_id,history_id))`);
  await db.run(`CREATE INDEX IF NOT EXISTS offline_customer_history_date_v1 ON ${entries}
    (tenant_id,principal_id,customer_id,business_date,history_id)`);
  await db.run(`CREATE TABLE IF NOT EXISTS ${pages} (
    tenant_id TEXT NOT NULL, principal_id TEXT NOT NULL, customer_id TEXT NOT NULL, source TEXT NOT NULL,
    from_date TEXT NOT NULL, to_date TEXT NOT NULL, snapshot_revision INTEGER NOT NULL,
    source_cursor TEXT NOT NULL, page_json TEXT NOT NULL CHECK(json_valid(page_json)),
    PRIMARY KEY(tenant_id,principal_id,customer_id,source,from_date,to_date,snapshot_revision,source_cursor))`);
  await db.run(`CREATE TABLE IF NOT EXISTS ${coverage} (
    tenant_id TEXT NOT NULL, principal_id TEXT NOT NULL, customer_id TEXT NOT NULL, source TEXT NOT NULL,
    from_date TEXT NOT NULL, to_date TEXT NOT NULL, snapshot_revision INTEGER NOT NULL,
    next_cursor TEXT, complete INTEGER NOT NULL CHECK(complete IN (0,1)),
    PRIMARY KEY(tenant_id,principal_id,customer_id,source,from_date,to_date))`);
  await db.run(`CREATE TABLE IF NOT EXISTS ${epochs} (
    tenant_id TEXT NOT NULL, principal_id TEXT NOT NULL, epoch INTEGER NOT NULL,
    PRIMARY KEY(tenant_id,principal_id))`);
  for (const table of [revisions, pages]) {
    for (const action of ['UPDATE', 'DELETE']) {
      await db.run(`CREATE TRIGGER IF NOT EXISTS ${table}_${action.toLowerCase()} BEFORE ${action} ON ${table}
        BEGIN SELECT RAISE(ABORT,'immutable-history-evidence'); END`);
    }
  }
  for (const action of ['INSERT', 'UPDATE', 'DELETE']) {
    const row = action === 'DELETE' ? 'OLD' : 'NEW';
    await db.run(`CREATE TRIGGER IF NOT EXISTS offline_customer_history_epoch_${action.toLowerCase()}_v1 AFTER ${action} ON ${entries}
      BEGIN INSERT INTO ${epochs}(tenant_id,principal_id,epoch) VALUES(${row}.tenant_id,${row}.principal_id,1)
      ON CONFLICT(tenant_id,principal_id) DO UPDATE SET epoch=epoch+1; END`);
  }
}

export async function createOfflineCustomerHistoryRepository({database, session, authorize}) {
  if (typeof database?.transaction !== 'function' || typeof session?.isCurrent !== 'function'
    || !identifier(session.scope?.tenantId) || !identifier(session.scope?.principalId)
    || typeof authorize !== 'function') fail('History requires database, verified session and signed authorizer');
  const scope = Object.freeze({...session.scope});
  const keys = [scope.tenantId, scope.principalId];
  const current = () => {
    if (!session.isCurrent(scope)) throw Object.assign(new Error('Customer history session closed'), {code: 'permission-denied'});
  };
  async function checkGrant() {
    current();
    await authorize({scope, kind: 'customer.history.read', now: Date.now()});
    current();
  }
  async function transaction(work) {
    current();
    return database.transaction(async raw => {
      // Verify after dequeue, before ANY SQL. Recheck before commit/publication.
      await checkGrant();
      const db = {
        query(sql, params = []) { current(); return raw.query(sql, params); },
        run(sql, params = []) { current(); return raw.run(sql, params); },
      };
      const result = await work(db);
      await checkGrant();
      return result;
    });
  }
  await transaction(schema);
  async function getCoverage(db, customerId, from, to) {
    const rows = await db.query(`SELECT source,snapshot_revision,next_cursor,complete FROM ${coverage}
      WHERE tenant_id=? AND principal_id=? AND customer_id=? AND from_date=? AND to_date=?`, [...keys, customerId, from, to]);
    return sources.map(source => {
      const row = rows.find(item => item.source === source);
      return {source, status: !row ? 'unknown' : row.complete ? 'complete' : 'partial',
        snapshotRevision: row?.snapshot_revision ?? null, nextSourceCursor: row?.next_cursor ?? null};
    });
  }
  function existsFilter({from, to, profileAlias = 'c'}) {
    interval(from, to);
    if (typeof profileAlias !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(profileAlias) || profileAlias.toLowerCase() === 'h') fail('Invalid history profile alias');
    return {sql: `EXISTS (SELECT 1 FROM ${entries} AS h
      WHERE h.tenant_id=? AND h.principal_id=?
      AND h.tenant_id=${profileAlias}.tenant_id AND h.principal_id=${profileAlias}.principal_id
      AND h.customer_id=${profileAlias}.id AND h.business_date>=? AND h.business_date<?)`, params: [...keys, from, to]};
  }
  return Object.freeze({
    async ingestPage(input) {
      // Snapshot the input before yielding: callers cannot mutate identity/payload
      // while a queued transaction is waiting for authorization.
      current();
      const batch = prepareBatch(input, scope.tenantId);
      return transaction(async db => {
        const {customerId, source, from, to, snapshotRevision, sourceCursor, nextSourceCursor, complete} = batch;
        const rangeKeys = [...keys, customerId, source, from, to];
        const pageKeys = [...rangeKeys, snapshotRevision, sourceCursor ?? ''];
        const replay = (await db.query(`SELECT page_json FROM ${pages} WHERE tenant_id=? AND principal_id=?
          AND customer_id=? AND source=? AND from_date=? AND to_date=? AND snapshot_revision=? AND source_cursor=?`, pageKeys))[0];
        if (replay) {
          if (replay.page_json !== batch.json) fail('Immutable history page changed');
          return {replayed: true, received: batch.records.length, projected: 0};
        }
        const previous = (await db.query(`SELECT snapshot_revision,next_cursor,complete FROM ${coverage}
          WHERE tenant_id=? AND principal_id=? AND customer_id=? AND source=? AND from_date=? AND to_date=?`, rangeKeys))[0];
        if (!previous || snapshotRevision > previous.snapshot_revision) {
          if (sourceCursor !== null) fail('History snapshot must start at null cursor');
        } else if (snapshotRevision !== previous.snapshot_revision || previous.complete
          || previous.next_cursor === null || sourceCursor !== previous.next_cursor) fail('Stale or discontinuous history page');
        if (nextSourceCursor !== null) {
          const loop = await db.query(`SELECT 1 FROM ${pages} WHERE tenant_id=? AND principal_id=? AND customer_id=?
            AND source=? AND from_date=? AND to_date=? AND snapshot_revision=? AND source_cursor=?`, [...rangeKeys, snapshotRevision, nextSourceCursor]);
          if (loop.length) fail('History source cursor loop');
        }
        let projected = 0;
        for (const item of batch.records) {
          const recordKeys = [...keys, source, item.id];
          const received = (await db.query(`SELECT document_json,server_cursor FROM ${revisions}
            WHERE tenant_id=? AND principal_id=? AND source=? AND id=? AND server_revision=?`, [...recordKeys, item.serverRevision]))[0];
          if (received && (received.document_json !== item.json || received.server_cursor !== item.serverCursor)) fail('Immutable history server revision changed');
          if (!received) await db.run(`INSERT INTO ${revisions} VALUES (?,?,?,?,?,?,?,?,?)`,
            [...recordKeys, item.serverRevision, item.serverCursor, customerId, item.date, item.json]);
          const local = (await db.query(`SELECT state,server_revision FROM ${entries}
            WHERE tenant_id=? AND principal_id=? AND source=? AND id=?`, recordKeys))[0];
          if (local && (local.state !== 'SYNCED' || local.server_revision >= item.serverRevision)) continue;
          await db.run(`INSERT INTO ${entries} VALUES (?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(tenant_id,principal_id,source,id) DO UPDATE SET customer_id=excluded.customer_id,
            business_date=excluded.business_date,local_json=excluded.local_json,state='SYNCED',
            server_revision=excluded.server_revision,server_cursor=excluded.server_cursor`,
          [...recordKeys, source + ':' + item.id, customerId, item.date, item.json, 'SYNCED', item.serverRevision, item.serverCursor]);
          projected++;
        }
        await db.run(`INSERT INTO ${pages} VALUES (?,?,?,?,?,?,?,?,?)`, [...pageKeys, batch.json]);
        await db.run(`INSERT INTO ${coverage} VALUES (?,?,?,?,?,?,?,?,?)
          ON CONFLICT(tenant_id,principal_id,customer_id,source,from_date,to_date) DO UPDATE SET
          snapshot_revision=excluded.snapshot_revision,next_cursor=excluded.next_cursor,complete=excluded.complete`,
        [...rangeKeys, snapshotRevision, nextSourceCursor, complete ? 1 : 0]);
        return {replayed: false, received: batch.records.length, projected};
      });
    },
    async page({customerId, from, to, limit = 20, after = null} = {}) {
      customer(customerId); interval(from, to); limitValue(limit);
      // Copy and validate cursor before entering the async transaction.
      const cursor = after === null ? null : {...after};
      if (cursor && (!object(after) || cursor.version !== 1 || cursor.tenantId !== scope.tenantId
        || cursor.principalId !== scope.principalId || cursor.customerId !== customerId
        || cursor.from !== from || cursor.to !== to || !revision(cursor.epoch)
        || !day(cursor.date) || cursor.date < from || cursor.date >= to
        || typeof cursor.id !== 'string' || !sources.some(source => cursor.id.startsWith(source + ':') && identifier(cursor.id.slice(source.length + 1))))) fail('Invalid history cursor scope/range');
      return transaction(async db => {
        const epoch = (await db.query(`SELECT epoch FROM ${epochs} WHERE tenant_id=? AND principal_id=?`, keys))[0]?.epoch ?? 0;
        if (cursor && cursor.epoch !== epoch) throw Object.assign(new Error('History changed; restart pagination'), {code: 'history-cursor-stale'});
        const params = [...keys, customerId, from, to];
        let seek = '';
        if (cursor) { seek = ' AND (business_date,history_id)>(?,?)'; params.push(cursor.date, cursor.id); }
        const rows = await db.query(`SELECT source,history_id,business_date,local_json,state,server_revision,server_cursor
          FROM ${entries} WHERE tenant_id=? AND principal_id=? AND customer_id=? AND business_date>=? AND business_date<?${seek}
          ORDER BY business_date,history_id LIMIT ?`, [...params, limit + 1]);
        const selected = rows.slice(0, limit), last = selected[selected.length - 1];
        return {
          records: selected.map(row => ({source: row.source, historyId: row.history_id, businessDate: row.business_date,
            document: JSON.parse(row.local_json), localSyncState: row.state, serverRevision: row.server_revision, serverCursor: row.server_cursor})),
          nextCursor: rows.length > limit ? {version: 1, tenantId: scope.tenantId, principalId: scope.principalId,
            customerId, from, to, epoch, date: last.business_date, id: last.history_id} : null,
          completeness: await getCoverage(db, customerId, from, to),
        };
      });
    },
    async filterCustomerIds({customerIds, from, to} = {}) {
      interval(from, to);
      if (!Array.isArray(customerIds) || customerIds.length > CUSTOMER_HISTORY_LIMITS.page) fail('Invalid history customer candidates');
      customerIds.forEach(customer);
      const ids = [...new Set(customerIds)];
      return transaction(async db => {
        if (!ids.length) return [];
        const filter = existsFilter({from, to});
        const rows = await db.query(`WITH c(id,tenant_id,principal_id) AS (VALUES ${ids.map(() => '(?,?,?)').join(',')})
          SELECT c.id FROM c WHERE ${filter.sql} ORDER BY c.id`, [...ids.flatMap(id => [id, ...keys]), ...filter.params]);
        return rows.map(row => row.id);
      });
    },
    async withHistoryFilter(options, read) {
      const filter = existsFilter(options);
      if (typeof read !== 'function') fail('History profile read callback required');
      return transaction(db => read(Object.freeze({query: db.query}), filter));
    },
  });
}
