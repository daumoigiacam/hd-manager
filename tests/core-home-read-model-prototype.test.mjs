import test from 'node:test';
import assert from 'node:assert/strict';
import { createHomeReadModelPrototype, buildHomeReadModelProjection, HOME_READ_MODEL_PROJECT, HOME_READ_MODEL_REVISION_KEYS } from '../performance/upgrade-20261103/pilots/home-read-model.mjs';
import { buildExecutiveDashboardSnapshot } from '../src/services/executiveDashboardService.js';
import { getCashExpenseFinance, getReportPeriod } from '../src/features/business-report/reportViewModel.js';

// Finance's existing Date getters require the runner to execute in this zone.
// This affects only this isolated Node test process, not application source.
process.env.TZ = 'Asia/Ho_Chi_Minh';
const copy = value => JSON.parse(JSON.stringify(value));
const initialNow = Date.parse('2026-11-04T05:00:00Z');
const initialScope = { principalId: 'fictional-owner', tenantId: 'fictional-tenant', permissionKey: 'owner-grants-1', sessionId: 'verified-session-1',
  dayKey: '2026-11-04', timeZone: 'Asia/Ho_Chi_Minh', timezoneOffsetMinutes: -420 };
function inputs() {
  const cashExpenseRecords = [
    { id: 'purchase', date: '2026-11-04', amount: 7000000000, category: 'Chi mua hàng' },
    { id: 'salary-settlement', date: '2026-11-04', amount: 3000000, category: 'Lương' },
    { id: 'previous', date: '2026-10-31', amount: 17 },
    { id: 'future-day', date: '2026-11-30', amount: 19 },
    { id: 'future-month', date: '2026-12-31', amount: 23 },
    { id: 'debt-repayment', date: '2026-11-04', amount: 999, sourceType: 'customer_debt_repayment' },
  ];
  return { employees: [{ id: 'e', name: 'Fictional employee' }], customers: [{ id: 'c', currentDebt: 999999999 }],
    orders: [{ id: 'o', date: '2026-11-04', amount: 120000000 }, { id: 'previous-order', date: '2026-10-31', amount: 31 }],
    payments: [{ date: '2026-11-04', amount: 40000000 }], expenses: cashExpenseRecords, cashExpenseRecords,
    // Supplied daily earned rows are outputs of the existing payroll builder.
    // The prototype deliberately never substitutes settlement/net salary math.
    payrollCosts: [{ date: '2026-11-04', employeeId: 'e', amount: 2000000 }, { date: '2026-10-31', employeeId: 'e', amount: 29 }],
    debtLedger: [{ id: 'c', debt: 80000000 }, { id: 'credit', debt: -100 }],
  };
}
function fixture(options = {}) {
  let now = initialNow, allowed = true, scope = copy(initialScope), headError = false, snapshotError = false;
  let input = inputs();
  let version = { schemaVersion: 1, readTime: now, revisions: Object.fromEntries(HOME_READ_MODEL_REVISION_KEYS.map(key => [key, 1])) };
  const records = new Map();
  const stats = { reads: 0, builds: 0, writes: 0, conflicts: 0 };
  let beforePublish = null, onSnapshot = null, onHead = null, onRead = null;
  const context = () => ({ verified: true, allowed, projectId: HOME_READ_MODEL_PROJECT, appId: 'fictional-company-home', scope: copy(scope) });
  const versionEqual = (a, b) => HOME_READ_MODEL_REVISION_KEYS.every(key => a.revisions[key] === b.revisions[key]);
  const storage = {
    async read(key) { stats.reads++; if (onRead) await onRead(); return records.has(key) ? copy(records.get(key)) : null; },
    async publishIfCurrent({ key, record, expectedVersion, context: actor }) {
      if (beforePublish) await beforePublish();
      // This comparison and write form one synchronous fake transaction. A real
      // adapter must provide the same atomic version guard in its existing owner.
      if (!allowed || JSON.stringify(actor.scope) !== JSON.stringify(scope) || !versionEqual(expectedVersion, version)) {
        stats.conflicts++; return { status: 'conflict' };
      }
      const previous = records.get(key);
      if (previous && versionEqual(previous.sourceVersion, expectedVersion) && previous.expiresAt > now) return { status: 'replayed', record: copy(previous) };
      records.set(key, copy(record)); stats.writes++;
      return { status: 'published', record: copy(record) };
    },
  };
  const callbacks = {
    verifyContext: async () => context(),
    readVersion: async () => { if (onHead) await onHead(); if (headError) throw Error('synthetic source outage'); return copy(version); },
    readInputs: async () => {
      stats.builds++; if (onSnapshot) await onSnapshot();
      if (snapshotError) throw Object.assign(Error('synthetic snapshot failure'), { retryable: true });
      return { verified: true, complete: true, version: copy(version), inputs: copy(input),
        derivedFor: Object.fromEntries(['cashExpenseRecords', 'payrollCosts', 'debtLedger'].map(name => [name, copy(version.revisions)])) };
    }, storage, clock: () => now, ttlMs: 60000, maxAttempts: 2, ...options,
  };
  const api = createHomeReadModelPrototype(callbacks);
  return { api, callbacks, records, stats, context, input: () => input, version: () => copy(version),
    setInput: value => { input = value; }, setTime: value => { now = value; }, now: () => now,
    setScope: change => { scope = { ...scope, ...change }; }, revoke: () => { allowed = false; },
    outage: () => { headError = true; }, snapshotFailure: () => { snapshotError = true; },
    beforePublish: fn => { beforePublish = fn; }, onSnapshot: fn => { onSnapshot = fn; }, onHead: fn => { onHead = fn; }, onRead: fn => { onRead = fn; },
    update: (name = 'orders') => { version.revisions[name]++; version.readTime = now; },
  };
}
const rows = items => items.map(({ date, month, revenue, expense, profit }) => ({ date, month, revenue, expense, profit }));
function visible(snapshot, period) {
  const report = getReportPeriod(getCashExpenseFinance(snapshot.finance), period, { start: '2026-10-20', end: '2026-11-30' });
  return { ...report, rows: rows(report.rows), chartRows: rows(report.chartRows) };
}

test('genuine projection miss builds exact proposal oracle; prepared read does not rebuild', async () => {
  const f = fixture();
  const missing = await f.api.read({});
  assert.equal(missing.state, 'missing'); assert.equal(missing.snapshot, null); assert.equal(f.stats.builds, 0);
  const built = await f.api.refresh({});
  assert.equal(built.state, 'current', built.reason); assert.equal(f.stats.builds, 1); assert.equal(f.stats.writes, 1);
  const today = visible(built.snapshot, 'today');
  assert.deepEqual([today.revenue, today.expense, today.profit, today.receivables], [120000000, 7002000000, -6882000000, 80000000]);
  const full = buildExecutiveDashboardSnapshot({ ...f.input(), now: new Date(f.now()).toISOString() });
  for (const period of ['today', 'week', 'month', 'quarter', 'year', 'custom']) assert.deepEqual(visible(built.snapshot, period), visible(full, period), period);
  const ready = await f.api.read({}); assert.equal(ready.current, true); assert.equal(f.stats.builds, 1);
  assert.deepEqual(ready.sourceVersion, f.version()); assert.equal(ready.projectionVersion, 1);
  const record = [...f.records.values()][0];
  assert.equal(record.projectionVersion, 1); assert.deepEqual(record.sourceVersion, f.version());
  assert.equal(record.generatedAt, new Date(initialNow).toISOString());
  assert.doesNotMatch(record.compact, /Fictional employee|salary-settlement|previous-order/);
  assert.deepEqual(Object.keys(ready.snapshot).sort(), ['finance', 'generatedAt', 'kind']);
});

test('event replay and older delivery are idempotent; future event cannot claim current', async () => {
  const f = fixture(); await f.api.refresh({});
  const original = JSON.stringify([...f.records.values()]);
  for (const revision of [1, 1, 0]) {
    const result = await f.api.refresh({}, { source: 'orders', revision });
    assert.equal(result.state, 'current'); assert.equal(result.replayed, true);
  }
  assert.equal(f.stats.builds, 1); assert.equal(f.stats.writes, 1); assert.equal(JSON.stringify([...f.records.values()]), original);
  const future = await f.api.refresh({}, { source: 'orders', revision: 2 });
  assert.equal(future.state, 'stale'); assert.equal(future.current, false); assert.equal(future.snapshot, null);
});

test('source update during cooperative build discards old output and retries exact latest inputs', async () => {
  let f, changed = false;
  f = fixture({ yieldWork: async () => {
    if (!changed) { changed = true; f.input().orders[0].amount += 11; f.update(); }
  } });
  const result = await f.api.refresh({});
  assert.equal(result.state, 'current', result.reason); assert.equal(result.attempts, 2);
  assert.equal(visible(result.snapshot, 'today').revenue, 120000011);
  assert.equal(f.stats.builds, 2); assert.equal(f.stats.writes, 1);
  assert.deepEqual([...f.records.values()][0].sourceVersion.revisions, f.version().revisions);
});

test('atomic publication guard rejects the check/write race and never writes old financial data', async () => {
  const f = fixture(); let changed = false;
  f.beforePublish(async () => { if (!changed) { changed = true; f.input().debtLedger[0].debt = 77; f.update('debtLedger'); } });
  const result = await f.api.refresh({});
  assert.equal(result.state, 'current'); assert.equal(result.attempts, 2);
  assert.equal(result.snapshot.finance.receivables, 77); assert.equal(f.stats.conflicts, 1); assert.equal(f.stats.writes, 1);
});

test('continuous source changes and retryable snapshot failures are bounded, never current', async () => {
  let f;
  f = fixture({ yieldWork: async () => f.update() });
  const changed = await f.api.refresh({});
  assert.equal(changed.current, false); assert.equal(changed.reason, 'retry-exhausted'); assert.equal(changed.attempts, 2);
  assert.equal(f.stats.writes, 0); assert.equal(f.stats.builds, 2);
  const failed = fixture(); failed.snapshotFailure();
  const unavailable = await failed.api.refresh({});
  assert.equal(unavailable.current, false); assert.equal(unavailable.snapshot, null);
  assert.equal(failed.stats.builds, 2); assert.equal(failed.stats.writes, 0);
});

test('concurrent same-version refresh deduplicates at the owner, not in a new cache', async () => {
  const f = fixture();
  const results = await Promise.all([f.api.refresh({}), f.api.refresh({})]);
  assert.ok(results.every(result => result.current)); assert.equal(f.stats.writes, 1);
  assert.ok(results.some(result => result.replayed));
});

test('stale source revision, expired record and projection schema mismatch never become current', async () => {
  const f = fixture(); await f.api.refresh({}); f.update();
  const stale = await f.api.read({}); assert.equal(stale.state, 'stale'); assert.equal(stale.current, false); assert.ok(stale.snapshot);
  f.setTime(initialNow + 60000);
  const expired = await f.api.read({}); assert.equal(expired.current, false); assert.equal(expired.snapshot, null);
  const fresh = fixture(); await fresh.api.refresh({});
  [...fresh.records.values()][0].projectionVersion = 2;
  const mismatch = await fresh.api.read({}); assert.equal(mismatch.state, 'stale'); assert.equal(mismatch.snapshot, null);
});

test('source outage retains only unexpired verified same-scope data, visibly revalidating', async () => {
  const f = fixture(); await f.api.refresh({}); f.outage();
  const cached = await f.api.read({}); assert.equal(cached.state, 'revalidating'); assert.equal(cached.current, false); assert.ok(cached.snapshot);
  assert.equal(cached.generatedAt, new Date(initialNow).toISOString());
  f.setTime(initialNow + 60000);
  const expired = await f.api.read({}); assert.equal(expired.snapshot, null); assert.equal(expired.current, false);
  const missing = fixture(); missing.outage(); assert.equal((await missing.api.read({})).state, 'error');
});

test('principal/tenant/grants/session scope isolation and revocation hide prior financial data', async () => {
  for (const key of ['principalId', 'tenantId', 'permissionKey', 'sessionId']) {
    const f = fixture(); await f.api.refresh({}); f.setScope({ [key]: 'different-verified-value' });
    const other = await f.api.read({}); assert.equal(other.state, 'missing', key); assert.equal(other.snapshot, null);
  }
  const f = fixture(); await f.api.refresh({}); f.revoke();
  const revoked = await f.api.read({}); assert.equal(revoked.state, 'hidden'); assert.equal(revoked.snapshot, null);
});

test('identity changes during build or owner publication never expose a previous-scope result', async () => {
  for (const atPublish of [false, true]) {
    let f, changed = false;
    f = fixture({ yieldWork: async () => { if (!atPublish && !changed) { changed = true; f.revoke(); } } });
    if (atPublish) f.beforePublish(async () => f.setScope({ sessionId: 'new-session' }));
    const result = await f.api.refresh({}); assert.equal(result.state, 'hidden'); assert.equal(result.snapshot, null);
    assert.equal(f.stats.writes, 0);
  }
});

test('derived payroll/locked rows and debt must be complete for the same revision vector', async () => {
  for (const corrupt of ['missing-payroll', 'old-payroll-revisions', 'old-debt-revisions', 'incomplete']) {
    const f = fixture(); const originalRead = f.callbacks.readInputs;
    const api = createHomeReadModelPrototype({ ...f.callbacks, readInputs: async context => {
      const source = await originalRead(context);
      if (corrupt === 'missing-payroll') delete source.inputs.payrollCosts;
      if (corrupt === 'old-payroll-revisions') source.derivedFor.payrollCosts.orders--;
      if (corrupt === 'old-debt-revisions') source.derivedFor.debtLedger.payments--;
      if (corrupt === 'incomplete') source.complete = false;
      return source;
    } });
    const result = await api.refresh({}); assert.equal(result.current, false, corrupt); assert.equal(result.snapshot, null); assert.equal(f.stats.writes, 0);
  }
});

test('calendar/TZ/version/unsafe aggregation guards fail closed', async () => {
  for (const change of [{ dayKey: '2026-11-03' }, { timeZone: 'UTC', timezoneOffsetMinutes: 0 }, { timezoneOffsetMinutes: 0 }]) {
    const f = fixture(); f.setScope(change);
    const result = await f.api.refresh({}); assert.equal(result.current, false); assert.equal(result.snapshot, null);
  }
  const f = fixture(); f.input().cashExpenseRecords[0].amount = 0.1;
  assert.equal((await f.api.refresh({})).reason, 'non-integer-expense'); assert.equal(f.stats.writes, 0);
  const incompatible = fixture();
  const api = createHomeReadModelPrototype({ ...incompatible.callbacks, readVersion: async () => ({ ...incompatible.version(), schemaVersion: 2 }) });
  assert.equal((await api.refresh({})).current, false);
});

test('detached inputs preserve build stability and direct builder stays storage/transport independent', async () => {
  const f = fixture();
  const input = f.input(); let changed = false;
  const record = await buildHomeReadModelProjection(input, { scope: initialScope, version: f.version(), now: initialNow, yieldWork: async () => {
    if (!changed) { changed = true; input.orders[0].amount = 1; }
  } });
  const envelope = JSON.parse(record.compact);
  assert.equal(envelope.finance.revenueToday, 120000000);
  assert.equal(f.records.size, 0); assert.equal(f.stats.writes, 0);
});

test('prototype rejects non-demo project and missing ownership callbacks', async () => {
  assert.throws(() => createHomeReadModelPrototype({}), /invalid-callbacks/);
  const f = fixture();
  const api = createHomeReadModelPrototype({ ...f.callbacks, verifyContext: async () => ({ ...f.context(), projectId: 'real-project' }) });
  assert.equal((await api.refresh({})).state, 'hidden'); assert.equal(f.stats.writes, 0);
  assert.throws(() => createHomeReadModelPrototype({ ...f.callbacks, maxAttempts: 4 }), /invalid-retry-bound/);
});

test('expiry during build never publishes an already expired projection', async () => {
  let f, changed = false;
  f = fixture({ yieldWork: async () => {
    if (!changed) { changed = true; f.setTime(initialNow + 60000); }
  } });
  // A newly observed head can be fresh without changing source revisions. The
  // built candidate is still tied to the older read and must not be published.
  const api = createHomeReadModelPrototype({ ...f.callbacks, readVersion: async () => ({ ...f.version(), readTime: f.now() }) });
  const result = await api.refresh({});
  assert.equal(result.current, false); assert.equal(result.snapshot, null); assert.equal(f.stats.writes, 0);
});

test('locked daily payroll supplied by the existing builder preserves all report-period totals', async () => {
  const f = fixture();
  f.input().payrollCosts = [
    { date: '2026-11-04', employeeId: 'e', employeeName: 'Frozen payroll name', amount: 900003 },
    { date: '2026-11-03', employeeId: 'e', employeeName: 'Frozen payroll name', amount: 900002 },
    { date: '2026-10-31', employeeId: 'e', amount: 800001 },
  ];
  const built = await f.api.refresh({}); assert.equal(built.current, true);
  const full = buildExecutiveDashboardSnapshot({ ...f.input(), now: new Date(f.now()).toISOString() });
  for (const period of ['today', 'week', 'month', 'quarter', 'year', 'custom']) assert.deepEqual(visible(built.snapshot, period), visible(full, period), period);
});

test('source event during stored-model read is detected, and corrupted cross-scope stored response cannot leak', async () => {
  const f = fixture(); await f.api.refresh({});
  f.onRead(async () => f.update());
  assert.equal((await f.api.read({})).state, 'stale');
  f.onRead(null);
  const stored = [...f.records.values()][0]; stored.scope.principalId = 'other-actor';
  const result = await f.api.read({}); assert.equal(result.state, 'error'); assert.equal(result.snapshot, null);
});
