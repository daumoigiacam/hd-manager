import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeHomePrimaryCompactCache as encode, decodeHomePrimaryCompactCache as decode, readHomePrimaryCompactCacheEntry } from '../src/services/homePrimaryCompactCache.js';
import { buildHomePrimaryProjection } from '../src/services/executiveDashboardService.js';
import { getCashExpenseFinance, getReportPeriod, getChangePercent } from '../src/features/business-report/reportViewModel.js';
import { createProjectionCache } from '../src/services/cooperativeProjection.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';

const now = Date.parse('2026-10-24T05:00:00Z');
const scope = { principalId: 'fictional-principal', tenantId: 'fictional-tenant', permissionKey: 'owner-v1', sessionId: 'session-epoch-1', dayKey: '2026-10-24', timeZone: 'Asia/Ho_Chi_Minh', timezoneOffsetMinutes: -420 };
const options = { now };
function fixture(count = 100) {
  const dates = ['2026-01-01', '2026-09-30', '2026-10-01', '2026-10-20', '2026-10-23', '2026-10-24', '2026-10-31', '2026-12-31'];
  const cashExpenseRecords = Array.from({ length: count }, (_, index) => ({ id: `private-voucher-${index}`, date: dates[index % dates.length], amount: index + 1,
    name: 'Private recipient name', recipient: 'Private recipient', note: 'Private explanation', category: index % 5 === 0 ? 'Lương' : 'Xăng dầu' }));
  cashExpenseRecords.push({ date: '2026-10-30', amount: 19 }, { date: '2026-10-30', amount: -19 });
  const snapshot = buildHomePrimaryProjection({ now: '2026-10-24T12:00:00', cashExpenseRecords,
    orders: dates.map((date, index) => ({ id: `private-order-${index}`, date, amount: (index + 1) * 100 + 0.25 })),
    payrollCosts: Array.from({ length: count }, (_, index) => ({ date: dates[index % 6], employeeId: `private-employee-${index}`, employeeName: 'Private employee name', amount: index + 3 })),
    debtLedger: [{ debt: 345.25 }, { debt: -90 }],
  });
  snapshot.generatedAt = new Date(now - 1000).toISOString();
  return snapshot;
}
const values = rows => rows.map(({ date, month, revenue, expense, profit }) => ({ date, month, revenue, expense, profit }));
function visible(finance, period, range) {
  const report = getReportPeriod(finance, period, range);
  return { ...report, rows: values(report.rows), chartRows: values(report.chartRows), changes: ['revenue', 'expense', 'profit'].map(key => getChangePercent(report[key], report.previous?.[key])) };
}

test('integer aggregation round trip preserves every period, comparison and future chart row', () => {
  const original = fixture();
  const encoded = encode(original, scope, options);
  assert.equal(encoded.ok, true, encoded.reason);
  const restored = decode(encoded.serialized, scope, options);
  assert.equal(restored.ok, true, restored.reason);
  assert.equal(restored.requiresRevalidation, true);
  assert.equal(restored.capabilities, 'four-cards-line-only');
  const before = getCashExpenseFinance(original.finance);
  const after = getCashExpenseFinance(restored.snapshot.finance);
  for (const period of ['today', 'week', 'month', 'quarter', 'year', 'custom']) {
    for (const range of [{ start: '2026-10-01', end: '2026-10-24' }, { start: '2026-10-25', end: '2026-10-31' }]) {
      assert.deepEqual(visible(after, period, range), visible(before, period, range), period);
    }
  }
  // Exercise all custom subranges, not only ranges represented by preset KPIs.
  for (const start of before.series30Days) for (const end of before.series30Days) {
    if (start.date <= end.date) assert.deepEqual(visible(after, 'custom', { start: start.date, end: end.date }), visible(before, 'custom', { start: start.date, end: end.date }));
  }
  for (const key of ['series7Days', 'series30Days', 'series12Months']) assert.deepEqual(values(after[key]), values(before[key]));
  assert.equal(after.series30Days.find(row => row.date === '2026-10-30').expense, 0, 'zero-sum future day is retained');
  assert.deepEqual(Object.keys(restored.snapshot).sort(), ['finance', 'generatedAt', 'kind']);
});

test('no raw names, order IDs, voucher IDs or employee IDs are serialized', () => {
  const result = encode(fixture(), scope, options);
  assert.equal(result.ok, true);
  assert.doesNotMatch(result.serialized, /Private|private-|recipient|employee|sourceId|profitability|operations/);
  assert.ok(JSON.parse(result.serialized).finance.payroll.length > 0, 'actual payroll totals remain present');
});

test('fractional and unsafe expense sums are rejected instead of changing float order', () => {
  for (const amount of [0.1, NaN, Infinity, -0, Number.MAX_SAFE_INTEGER + 1]) {
    const snapshot = fixture();
    snapshot.finance.cashExpenseRows.push({ date: scope.dayKey, value: amount });
    assert.equal(encode(snapshot, scope, options).ok, false);
  }
  const overflow = fixture();
  overflow.finance.cashExpenseRows.push({ date: scope.dayKey, value: Number.MAX_SAFE_INTEGER });
  assert.equal(encode(overflow, scope, options).reason, 'unsafe-expense-sum');
  const salaryFraction = fixture();
  salaryFraction.finance.payrollAccrualRows.push({ date: scope.dayKey, value: 0.5 });
  assert.equal(encode(salaryFraction, scope, options).reason, 'non-integer-expense');
});

test('each principal/tenant/permission/session/day/TZ dimension isolates restore', () => {
  const encoded = encode(fixture(), scope, options);
  for (const key of Object.keys(scope)) {
    const other = { ...scope, [key]: key === 'timezoneOffsetMinutes' ? 0 : key === 'dayKey' ? '2026-10-25' : key === 'timeZone' ? 'UTC' : `${scope[key]}-other` };
    assert.equal(decode(encoded.serialized, other, options).ok, false, key);
  }
  assert.equal(encode(fixture(), { ...scope, sessionId: '' }, options).ok, false);
  assert.equal(decode(encoded.serialized, scope, { now: now + 86400000 }).ok, false, 'same stale scope cannot bypass midnight');
});

test('schema, TTL, clock rollback, old source and UTF-8 byte budget fail closed', () => {
  const encoded = encode(fixture(), scope, { now, ttlMs: 2000 });
  assert.equal(decode(encoded.serialized, scope, { now: now + 999 }).ok, true);
  assert.equal(decode(encoded.serialized, scope, { now: now + 1000 }).reason, 'expired');
  assert.equal(decode(encoded.serialized, scope, { now: now - 1 }).ok, false);
  assert.equal(encode(fixture(), scope, { now, ttlMs: 1000 }).reason, 'expired', 'saving does not renew source freshness');
  assert.equal(encode(fixture(), scope, { now, ttlMs: 900001 }).reason, 'invalid-ttl');
  assert.equal(decode('not json', scope, options).reason, 'invalid-json');
  assert.equal(decode(encoded.serialized, scope, { now, maxBytes: encoded.bytes - 1 }).reason, 'byte-budget-exceeded');
  assert.equal(encode(fixture(), scope, { now, maxBytes: 50 }).reason, 'byte-budget-exceeded');
  const unicode = { ...scope, principalId: 'người-dùng' };
  const utf8 = encode(fixture(), unicode, options);
  assert.equal(utf8.bytes, Buffer.byteLength(utf8.serialized, 'utf8'));
  assert.ok(utf8.bytes > utf8.serialized.length);
  assert.equal(decode(utf8.serialized, unicode, { now, maxBytes: utf8.serialized.length }).reason, 'byte-budget-exceeded');
  for (const mutate of [
    e => { e.schema = 'future-schema'; }, e => { e.extra = 'raw'; },
    e => { e.finance.revenueToday = null; }, e => { e.finance.cash[0][1] = 0.1; },
    e => { e.expiresAt = now + 900001; }, e => { e.finance.cash.push(e.finance.cash[0]); },
    e => { e.finance.series7Days[0][0] = 'invalid'; }, e => { e.finance.rawNames = ['raw']; },
  ]) {
    const envelope = JSON.parse(encoded.serialized); mutate(envelope);
    assert.equal(decode(JSON.stringify(envelope), scope, options).ok, false);
  }
});

test('confirmed empty collections retain zeros without fabricating a full snapshot', () => {
  const snapshot = buildHomePrimaryProjection({ now: '2026-10-24T12:00:00', cashExpenseRecords: [], payrollCosts: [], debtLedger: [] });
  snapshot.generatedAt = new Date(now).toISOString();
  const restored = decode(encode(snapshot, scope, options).serialized, scope, options);
  assert.equal(restored.ok, true);
  for (const period of ['today', 'week', 'month', 'quarter', 'year']) {
    const report = getReportPeriod(getCashExpenseFinance(restored.snapshot.finance), period);
    for (const key of ['revenue', 'expense', 'profit', 'receivables']) assert.equal(report[key], 0);
  }
  assert.equal(encode({ ...snapshot, kind: 'executive-dashboard' }, scope, options).reason, 'not-home-primary');
});

test('existing projection cache entry can own the serialized DTO; codec creates no cache/store', () => {
  const cache = createProjectionCache();
  const source = {};
  const entry = cache([source], JSON.stringify(scope));
  assert.equal(readHomePrimaryCompactCacheEntry(entry, scope, options).reason, 'incomplete-cache');
  entry.value = encode(fixture(), scope, options).serialized;
  entry.complete = true;
  const previous = { ...entry };
  assert.equal(readHomePrimaryCompactCacheEntry(entry, scope, options).ok, true);
  assert.deepEqual(entry, previous, 'read adapter does not modify the owning cache');
});

test('fictional serialized size assessment (not a runtime performance measurement)', t => {
  const snapshot = fixture(6000);
  const before = JSON.stringify(snapshot);
  const encoded = encode(snapshot, scope, options);
  assert.equal(encoded.ok, true, encoded.reason);
  const originalBytes = Buffer.byteLength(before, 'utf8');
  assert.ok(encoded.bytes < originalBytes);
  t.diagnostic(JSON.stringify({ fictionalCashRows: snapshot.finance.cashExpenseRows.length, fictionalPayrollRows: snapshot.finance.payrollAccrualRows.length,
    sourceBytes: originalBytes, compactBytes: encoded.bytes, savedBytes: originalBytes - encoded.bytes }));
});

const codecSource = readFileSync(new URL('../src/services/homePrimaryCompactCache.js', import.meta.url), 'utf8');
function legacyRuntime(mode = 'supported') {
  // This is a constrained-runtime test, not an actual WebView/device execution.
  // Runtime intrinsics belong to the VM so removing them cannot affect Node's
  // own test runner. Numeric Intl parts delegate to installed ICU; unsupported
  // options/APIs are explicitly blocked rather than polyfilled/transpiled.
  const context = vm.createContext({ TextEncoder, mode, dateTimeFormat: Intl.DateTimeFormat });
  vm.runInContext(`
    Object.hasOwn = undefined;
    Object.fromEntries = undefined;
    Intl.DateTimeFormat = function(locale, options) {
      if (options.timeZoneName || options.hourCycle) throw new RangeError('Unsupported old WebView option');
      if (mode === 'no-intl') throw new RangeError('Intl unavailable');
      const formatter = new dateTimeFormat(locale, options);
      if (mode === 'no-parts') return { format: formatter.format };
      return { formatToParts: function(now) {
        const parts = formatter.formatToParts(now);
        if (mode === 'hour24') return parts.map(p => p.type === 'hour' ? {type: 'hour', value: '24'} : p);
        if (mode === 'non-latin') return parts.map(p => p.type === 'year' ? {type: 'year', value: '٢٠٢٦'} : p);
        if (mode === 'duplicate') parts.push({type: 'hour', value: '12'});
        return parts;
      }};
    };
    if (mode === 'no-encoder') TextEncoder = undefined;
    ${codecSource.replace(/^export /gm, '')}
    globalThis.codec = {encodeHomePrimaryCompactCache, decodeHomePrimaryCompactCache, readHomePrimaryCompactCacheEntry};
  `, context);
  return context.codec;
}

test('untransformed codec parses as ES2019 and runs without modern Object helpers or Intl offset names', () => {
  // Chrome/WebView 74 syntax gate: optional chaining/nullish coalescing are
  // ES2020, while the remaining module syntax is accepted directly as ES2019.
  assert.doesNotThrow(() => parse(codecSource, { ecmaVersion: 2019, sourceType: 'module' }));
  const legacy = legacyRuntime();
  const snapshot = fixture();
  const oldEncoded = legacy.encodeHomePrimaryCompactCache(snapshot, scope, options);
  const encoded = encode(snapshot, scope, options);
  assert.equal(oldEncoded.ok, true, oldEncoded.reason);
  assert.equal(oldEncoded.serialized, encoded.serialized);
  const restored = legacy.decodeHomePrimaryCompactCache(oldEncoded.serialized, scope, options);
  assert.equal(restored.ok, true, restored.reason);
  const before = getCashExpenseFinance(snapshot.finance);
  const after = getCashExpenseFinance(JSON.parse(JSON.stringify(restored.snapshot.finance)));
  for (const period of ['today', 'week', 'month', 'quarter', 'year', 'custom']) {
    const range = { start: '2026-10-01', end: '2026-10-31' };
    assert.deepEqual(visible(after, period, range), visible(before, period, range));
  }
  assert.equal(legacy.readHomePrimaryCompactCacheEntry(null, scope, options).reason, 'incomplete-cache');
});

test('reduced old Intl, hour-24 output and missing UTF-8 encoder fail closed with explicit reasons', () => {
  const encoded = encode(fixture(), scope, options);
  for (const [mode, reason] of [
    ['no-intl', 'timezone-unavailable'], ['no-parts', 'timezone-unavailable'],
    ['hour24', 'unsupported-timezone-parts'], ['non-latin', 'unsupported-timezone-parts'],
    ['duplicate', 'unsupported-timezone-parts'], ['no-encoder', 'utf8-encoder-unavailable'],
  ]) {
    const legacy = legacyRuntime(mode);
    assert.equal(legacy.encodeHomePrimaryCompactCache(fixture(), scope, options).reason, reason, mode);
    assert.equal(legacy.decodeHomePrimaryCompactCache(encoded.serialized, scope, options).reason, reason, mode);
  }
});

test('numeric timezone calculation handles UTC, fractional offsets, local midnight and DST changes', () => {
  const legacy = legacyRuntime();
  for (const [stamp, timeZone, dayKey, timezoneOffsetMinutes] of [
    ['2026-10-24T00:00:00.999Z', 'UTC', '2026-10-24', 0],
    ['2026-10-23T17:00:00.999Z', 'Asia/Ho_Chi_Minh', '2026-10-24', -420],
    ['2026-10-23T18:15:00.999Z', 'Asia/Kathmandu', '2026-10-24', -345],
    ['2026-03-08T06:59:59.999Z', 'America/New_York', '2026-03-08', 300],
    ['2026-03-08T07:00:00.001Z', 'America/New_York', '2026-03-08', 240],
    ['2026-11-01T05:59:59.999Z', 'America/New_York', '2026-11-01', 240],
    ['2026-11-01T06:00:00.001Z', 'America/New_York', '2026-11-01', 300],
  ]) {
    const snapshot = fixture();
    snapshot.generatedAt = stamp;
    snapshot.finance.todayKey = dayKey;
    const identity = { ...scope, timeZone, dayKey, timezoneOffsetMinutes };
    const clock = { now: Date.parse(stamp) };
    const result = legacy.encodeHomePrimaryCompactCache(snapshot, identity, clock);
    assert.equal(result.ok, true, `${stamp}: ${result.reason}`);
    assert.equal(legacy.decodeHomePrimaryCompactCache(result.serialized, identity, clock).ok, true);
    assert.equal(legacy.decodeHomePrimaryCompactCache(result.serialized, { ...identity, timezoneOffsetMinutes: timezoneOffsetMinutes + 1 }, clock).reason, 'clock-scope-mismatch');
  }
  const snapshot = fixture();
  snapshot.generatedAt = '2100-01-01T00:00:00Z';
  snapshot.finance.todayKey = '2100-01-01';
  assert.equal(encode(snapshot, { ...scope, dayKey: '2100-01-01', timeZone: 'UTC', timezoneOffsetMinutes: 0 }, { now: Date.parse(snapshot.generatedAt) }).reason, 'unsupported-timezone-clock');
  assert.equal(encode(fixture(), { ...scope, timeZone: 'not/a-zone' }, options).reason, 'timezone-unavailable');
});

test('own-property checks tolerate shadowed methods and reject inherited scope fields', () => {
  const encoded = encode(fixture(), { ...scope, hasOwnProperty: null }, options);
  assert.equal(encoded.ok, true);
  assert.equal(decode(encoded.serialized, scope, options).ok, true);
  assert.equal(encode(fixture(), Object.create(scope), options).reason, 'invalid-scope');
});
