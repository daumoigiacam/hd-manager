// Pure codec for the existing cache owner. No storage, database, listeners or
// cache instance is created here. Restored data is for four cards/line chart only;
// it must remain visibly cached until current sources have been revalidated.
const SCHEMA = 'home-primary-compact-v1';
export const HOME_PRIMARY_COMPACT_MAX_BYTES = 64 * 1024;
export const HOME_PRIMARY_COMPACT_MAX_TTL_MS = 15 * 60 * 1000;
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const scopeKeys = ['principalId', 'tenantId', 'permissionKey', 'sessionId', 'dayKey', 'timeZone', 'timezoneOffsetMinutes'];
const dayKeys = ['todayKey', 'yesterdayKey', 'weekStartKey', 'weekEndKey'];
const monthKeys = ['currentMonthKey', 'previousMonthKey'];
const amountKeys = ['revenueToday', 'revenueYesterday', 'revenueWeek', 'revenueMonth', 'revenuePreviousMonth', 'revenueQuarter', 'revenueYear', 'receivables', 'overdueReceivables'];
const series = [['series7Days', 'date', 7], ['series30Days', 'date', 30], ['series12Months', 'month', 12]];
const byteLength = value => {
  check(typeof TextEncoder === 'function', 'utf8-encoder-unavailable');
  return new TextEncoder().encode(value).byteLength;
};
const reject = reason => { throw new Error(reason); };
const check = (condition, reason) => { if (!condition) reject(reason); };
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const pick = (value, keys) => {
  const result = {};
  for (const key of keys) result[key] = value[key];
  return result;
};
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => hasOwn(value, key));
const finite = value => typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0);
const validMonth = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

function optionsFor({ now = Date.now(), maxBytes = HOME_PRIMARY_COMPACT_MAX_BYTES } = {}) {
  check(Number.isSafeInteger(now) && now >= 0 && now <= 8640000000000000, 'invalid-clock');
  check(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= HOME_PRIMARY_COMPACT_MAX_BYTES, 'invalid-byte-budget');
  return { now, maxBytes };
}

function scopeFor(scope, now) {
  check(scope && scopeKeys.every(key => hasOwn(scope, key)) && scopeKeys.slice(0, -1).every(key => typeof scope[key] === 'string' && scope[key].trim() && scope[key].length <= 512), 'invalid-scope');
  check(validDay(scope.dayKey) && Number.isInteger(scope.timezoneOffsetMinutes) && Math.abs(scope.timezoneOffsetMinutes) <= 840, 'invalid-scope');
  // WebView 74: use ES2019 and numeric formatToParts, not longOffset,
  // hourCycle, optional chaining, nullish coalescing or Object.hasOwn.
  // Bound calendar arithmetic to modern years; never guess a zone/UTC fallback
  // when a reduced Intl implementation cannot provide unambiguous civil parts.
  check(new Date(now).getUTCFullYear() >= 2000 && new Date(now).getUTCFullYear() <= 2099, 'unsupported-timezone-clock');
  let parts;
  try {
    check(typeof Intl === 'object' && typeof Intl.DateTimeFormat === 'function', 'timezone-unavailable');
    const formatter = new Intl.DateTimeFormat('en-GB-u-ca-gregory-nu-latn', {
      timeZone: scope.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    check(typeof formatter.formatToParts === 'function', 'timezone-unavailable');
    parts = formatter.formatToParts(now);
  } catch { reject('timezone-unavailable'); }
  check(Array.isArray(parts), 'unsupported-timezone-parts');
  const civil = {};
  for (const key of ['year', 'month', 'day', 'hour', 'minute', 'second']) {
    const matches = parts.filter(part => part.type === key);
    check(matches.length === 1 && /^\d{1,4}$/.test(matches[0].value), 'unsupported-timezone-parts');
    civil[key] = Number(matches[0].value);
  }
  const day = `${civil.year}-${String(civil.month).padStart(2, '0')}-${String(civil.day).padStart(2, '0')}`;
  check(civil.year >= 2000 && civil.year <= 2099 && validDay(day) && civil.hour >= 0 && civil.hour <= 23
    && civil.minute >= 0 && civil.minute <= 59 && civil.second >= 0 && civil.second <= 59, 'unsupported-timezone-parts');
  const wallClock = Date.UTC(civil.year, civil.month - 1, civil.day, civil.hour, civil.minute, civil.second);
  const minutes = (Math.floor(now / 1000) * 1000 - wallClock) / 60000;
  check(Number.isInteger(minutes) && Math.abs(minutes) <= 840, 'unsupported-timezone-offset');
  check(day === scope.dayKey && minutes === scope.timezoneOffsetMinutes, 'clock-scope-mismatch');
  // sessionId is a non-secret session epoch, never an authentication token.
  return pick(scope, scopeKeys);
}

function packFinance(finance) {
  check(finance && dayKeys.every(key => validDay(finance[key])) && monthKeys.every(key => validMonth(finance[key])), 'invalid-calendar');
  check(amountKeys.every(key => finite(finance[key])), 'invalid-financial-number');
  const packed = pick(finance, [...dayKeys, ...monthKeys, ...amountKeys]);
  for (const [key, field, length] of series) {
    check(Array.isArray(finance[key]) && finance[key].length === length, 'invalid-series');
    const seen = new Set();
    packed[key] = finance[key].map(row => {
      check(row && (field === 'date' ? validDay(row[field]) : validMonth(row[field])) && finite(row.revenue) && !seen.has(row[field]), 'invalid-series');
      seen.add(row[field]);
      return [row[field], row.revenue];
    });
  }
  check(Array.isArray(finance.cashExpenseRows) && Array.isArray(finance.payrollAccrualRows), 'missing-expense-sources');
  // Bounding the sum of absolute values proves every possible intermediate
  // date/month/period sum remains exact, even with refunds and reordered days.
  let absoluteTotal = 0;
  const aggregate = (rows, cash) => {
    const days = new Map();
    for (const row of rows) {
      check(row && typeof row === 'object', 'invalid-expense-row');
      if (cash && (!row.date || row.category === 'Lương')) continue;
      check(validDay(row.date), 'invalid-expense-date');
      check(Number.isSafeInteger(row.value) && !Object.is(row.value, -0), 'non-integer-expense');
      check(Math.abs(row.value) <= Number.MAX_SAFE_INTEGER - absoluteTotal, 'unsafe-expense-sum');
      absoluteTotal += Math.abs(row.value);
      days.set(row.date, (days.get(row.date) || 0) + row.value);
      check(days.size <= 4096, 'too-many-expense-dates');
    }
    // Retain zero-sum days too: they can introduce future chart rows.
    return [...days.entries()];
  };
  packed.cash = aggregate(finance.cashExpenseRows, true);
  packed.payroll = aggregate(finance.payrollAccrualRows, false);
  return packed;
}

function unpackFinance(packed) {
  const keys = [...dayKeys, ...monthKeys, ...amountKeys, ...series.map(([key]) => key), 'cash', 'payroll'];
  check(exactKeys(packed, keys), 'invalid-finance-schema');
  const finance = pick(packed, [...dayKeys, ...monthKeys, ...amountKeys]);
  for (const [key, field] of series) {
    check(Array.isArray(packed[key]), 'invalid-series');
    finance[key] = packed[key].map(tuple => {
      check(Array.isArray(tuple) && tuple.length === 2, 'invalid-series');
      return { [field]: tuple[0], revenue: tuple[1] };
    });
  }
  for (const [key, field] of [['cash', 'cashExpenseRows'], ['payroll', 'payrollAccrualRows']]) {
    check(Array.isArray(packed[key]) && packed[key].length <= 4096, 'invalid-expense-schema');
    finance[field] = packed[key].map(tuple => {
      check(Array.isArray(tuple) && tuple.length === 2, 'invalid-expense-schema');
      return { date: tuple[0], value: tuple[1] };
    });
  }
  check(JSON.stringify(packFinance(finance)) === JSON.stringify(packed), 'noncanonical-finance');
  return finance;
}

export function encodeHomePrimaryCompactCache(snapshot, scope, options = {}) {
  try {
    const { now, maxBytes } = optionsFor(options);
    const ttlMs = options.ttlMs === undefined || options.ttlMs === null ? DEFAULT_TTL_MS : options.ttlMs;
    check(Number.isSafeInteger(ttlMs) && ttlMs > 0 && ttlMs <= HOME_PRIMARY_COMPACT_MAX_TTL_MS, 'invalid-ttl');
    check(snapshot && snapshot.kind === 'home-primary-v1', 'not-home-primary');
    const generated = Date.parse(snapshot.generatedAt);
    check(typeof snapshot.generatedAt === 'string' && Number.isFinite(generated) && generated <= now, 'invalid-generated-at');
    const expiresAt = generated + ttlMs;
    check(expiresAt > now, 'expired');
    const identity = scopeFor(scope, now);
    const finance = packFinance(snapshot.finance);
    check(finance.todayKey === identity.dayKey, 'clock-scope-mismatch');
    const serialized = JSON.stringify({ schema: SCHEMA, scope: identity, generatedAt: snapshot.generatedAt, savedAt: now, expiresAt, finance });
    const bytes = byteLength(serialized);
    check(bytes <= maxBytes, 'byte-budget-exceeded');
    return { ok: true, serialized, bytes };
  } catch (error) { return { ok: false, reason: error.message }; }
}

export function decodeHomePrimaryCompactCache(serialized, scope, options = {}) {
  try {
    const { now, maxBytes } = optionsFor(options);
    check(typeof serialized === 'string', 'missing-cache');
    check(serialized.length <= maxBytes && byteLength(serialized) <= maxBytes, 'byte-budget-exceeded');
    let envelope;
    try { envelope = JSON.parse(serialized); } catch { reject('invalid-json'); }
    check(exactKeys(envelope, ['schema', 'scope', 'generatedAt', 'savedAt', 'expiresAt', 'finance']) && envelope.schema === SCHEMA, 'invalid-schema');
    check(exactKeys(envelope.scope, scopeKeys), 'invalid-scope');
    const identity = scopeFor(scope, now);
    check(scopeKeys.every(key => Object.is(identity[key], envelope.scope[key])), 'scope-mismatch');
    const generated = Date.parse(envelope.generatedAt);
    check(typeof envelope.generatedAt === 'string' && Number.isFinite(generated) && Number.isSafeInteger(envelope.savedAt) && Number.isSafeInteger(envelope.expiresAt)
      && generated <= envelope.savedAt && envelope.savedAt <= now && envelope.expiresAt > envelope.savedAt
      && envelope.expiresAt - generated <= HOME_PRIMARY_COMPACT_MAX_TTL_MS, 'invalid-lifetime');
    check(now < envelope.expiresAt, 'expired');
    const finance = unpackFinance(envelope.finance);
    check(finance.todayKey === identity.dayKey, 'clock-scope-mismatch');
    return { ok: true, requiresRevalidation: true, capabilities: 'four-cards-line-only',
      snapshot: { kind: 'home-primary-v1', generatedAt: envelope.generatedAt, finance } };
  } catch (error) { return { ok: false, reason: error.message }; }
}

// Accept the existing createProjectionCache entry contract; never allocate or
// populate another cache. The owning layer decides whether/where to save bytes.
export function readHomePrimaryCompactCacheEntry(entry, scope, options) {
  if (!entry || entry.complete !== true) return { ok: false, reason: 'incomplete-cache' };
  return decodeHomePrimaryCompactCache(entry.value, scope, options);
}
