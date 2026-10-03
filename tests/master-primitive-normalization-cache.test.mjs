import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from '@babel/parser';

const revision = '5f162f5ce85fd4dc746382f13a6a4170e4a29775';
const currentSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const baselineSource = execFileSync('git', ['show', `${revision}:src/App.jsx`], {
  cwd: new URL('..', import.meta.url), encoding: 'utf8', maxBuffer: 30 * 1024 * 1024,
});
const cacheNames = ['LOOKUP_NORMALIZATION_CACHE_LIMIT', 'LOOKUP_NORMALIZATION_MAX_LENGTH', 'lookupNormalizationCache',
  'ENTITY_TIMESTAMP_CACHE_LIMIT', 'ENTITY_TIMESTAMP_CACHE_MAX_LENGTH', 'entityTimestampStringCache'];
const functionNames = ['normalizeLookupText', 'parseVietnameseDateTimeString', 'parseEntityTimestampValue'];

function extract(source) {
  const declarations = new Map();
  for (const statement of parse(source, { sourceType: 'module', plugins: ['jsx'] }).program.body) {
    if (statement.type !== 'VariableDeclaration') continue;
    for (const entry of statement.declarations) {
      if (entry.id.type === 'Identifier' && [...cacheNames, ...functionNames].includes(entry.id.name)) {
        declarations.set(entry.id.name, entry.init);
      }
    }
  }
  return ({ Date: DateBinding = Date, Map: MapBinding = Map } = {}) => {
    const bindings = { Date: DateBinding, Map: MapBinding };
    const evaluate = name => {
      const node = declarations.get(name);
      assert.ok(node, `Missing actual AST declaration ${name}`);
      const environment = Object.entries(bindings).filter(([key]) => key !== name);
      // A named local binding preserves the parser's existing self-recursion.
      return new Function(...environment.map(([key]) => key),
        `"use strict"; const ${name} = (${source.slice(node.start, node.end)}); return ${name};`)(...environment.map(([, value]) => value));
    };
    for (const name of cacheNames) {
      if (!declarations.has(name)) continue;
      const node = declarations.get(name);
      assert.ok(node.type === 'NumericLiteral' || (node.type === 'NewExpression'
        && node.callee.type === 'Identifier' && node.callee.name === 'Map' && node.arguments.length === 0),
      `Only numeric constants and empty Maps may initialize: ${name}`);
      bindings[name] = evaluate(name);
    }
    for (const name of functionNames) {
      assert.equal(declarations.get(name)?.type, 'ArrowFunctionExpression');
      bindings[name] = evaluate(name);
    }
    return { lookup: bindings.normalizeLookupText, timestamp: bindings.parseEntityTimestampValue,
      lookupCache: bindings.lookupNormalizationCache, timestampCache: bindings.entityTimestampStringCache, bindings };
  };
}

const current = extract(currentSource);
const baseline = extract(baselineSource);
const outcome = (fn, input) => {
  try { return { value: fn(input) }; } catch (error) { return { error: error.name, message: error.message }; }
};
const parity = (name, fixtures) => {
  const before = baseline();
  const after = current();
  for (const input of fixtures) {
    assert.deepStrictEqual(outcome(after[name], input), outcome(before[name], input));
    assert.deepStrictEqual(outcome(after[name], input), outcome(before[name], input), 'Repeated-call exact Git parity');
  }
  return after;
};

function countedDate() {
  let calls = 0;
  class ObservedDate extends Date {
    constructor(...args) { super(...args); calls += 1; }
  }
  return { Date: ObservedDate, get calls() { return calls; } };
}

test('actual AST caches have exact bounds and independent frozen Git functions', () => {
  const after = current();
  const before = baseline();
  assert.equal(after.bindings.LOOKUP_NORMALIZATION_CACHE_LIMIT, 2048);
  assert.equal(after.bindings.LOOKUP_NORMALIZATION_MAX_LENGTH, 256);
  assert.equal(after.bindings.ENTITY_TIMESTAMP_CACHE_LIMIT, 2048);
  assert.equal(after.bindings.ENTITY_TIMESTAMP_CACHE_MAX_LENGTH, 64);
  assert.ok(after.lookupCache instanceof Map);
  assert.ok(after.timestampCache instanceof Map);
  assert.equal(before.lookupCache, undefined);
  assert.equal(before.timestampCache, undefined);
  assert.notStrictEqual(after.lookup, before.lookup);
  assert.notStrictEqual(after.timestamp, before.timestamp);
});

test('lookup normalization exactly preserves defaults, falsy/numeric values, coercion errors and Unicode', () => {
  const before = baseline();
  const after = current();
  assert.equal(after.lookup(), before.lookup());
  parity('lookup', [undefined, null, false, true, 0, -0, 17, -3.5, NaN, Infinity, -Infinity, 7n,
    '', ' ', '\t\n', '0', 'undefined', 'null', '__proto__', 'constructor', 'toString', '  G\u00c0---TA  ',
    '\u0110\u1eb7ng \u0111\u1ed7', 'A\u0301', '\u0130', '\u00df', '\u212b', '\u03a3', '\u4e2d',
    '\ud800', '\udc00', '\ud800\udc00', '\u034f A\u200dB', 'a/b_c-d', Symbol('label'), Object(Symbol('label')),
    new String('G\u00e0'), new Number(17), new Boolean(false), [], {}, new Date('2026-10-03T00:00:00Z')]);
});

test('lookup hits skip actual Unicode normalization, including cached empty outputs', () => {
  const after = current();
  const nativeNormalize = String.prototype.normalize;
  let calls = 0;
  String.prototype.normalize = function (...args) {
    calls += 1;
    return nativeNormalize.apply(this, args);
  };
  try {
    assert.equal(after.lookup('  G\u00c0  '), 'ga');
    assert.equal(calls, 1);
    assert.equal(after.lookup('  G\u00c0  '), 'ga');
    assert.equal(calls, 1, 'A cross-call hit skips the normalization operation');
    assert.equal(after.lookup('---'), '');
    assert.equal(calls, 2);
    assert.equal(after.lookup('---'), '');
    assert.equal(calls, 2, 'An empty string result is still a cache hit');
    assert.equal(after.lookup(0), '0');
    assert.equal(after.lookup(0), '0');
    assert.equal(calls, 4, 'Numbers are never cached by their coerced string');
    assert.equal(after.lookupCache.has(0), false);
  } finally {
    String.prototype.normalize = nativeNormalize;
  }
});

test('lookup cache is exact-key FIFO, bounded above 2048 labels and bypasses long strings', () => {
  const before = baseline();
  const after = current();
  for (let i = 0; i < 2048; i += 1) {
    const label = `Label ${i}`;
    assert.equal(after.lookup(label), before.lookup(label));
  }
  assert.equal(after.lookupCache.size, 2048);
  assert.equal(after.lookup('Label 0'), before.lookup('Label 0'));
  assert.equal(after.lookupCache.keys().next().value, 'Label 0', 'Hits do not promote FIFO entries');
  after.lookup('Label 2048');
  assert.equal(after.lookupCache.size, 2048);
  assert.equal(after.lookupCache.has('Label 0'), false);
  assert.equal(after.lookupCache.has('Label 1'), true);
  assert.equal(after.lookup('Label 0'), before.lookup('Label 0'));
  assert.equal(after.lookupCache.has('Label 1'), false);
  const boundaries = ['x'.repeat(255), 'x'.repeat(256), 'x'.repeat(257), '\u0110'.repeat(10000)];
  for (const label of boundaries) {
    assert.equal(after.lookup(label), before.lookup(label));
    assert.equal(after.lookup(label), before.lookup(label));
    assert.equal(after.lookupCache.has(label), label.length <= 256);
    assert.ok(after.lookupCache.size <= 2048);
  }
  const distinct = current();
  distinct.lookup('Ga');
  distinct.lookup('g\u00e0');
  assert.deepStrictEqual([...distinct.lookupCache.keys()], ['Ga', 'g\u00e0'], 'Equivalent outputs do not merge raw keys');
});

test('mutable lookup objects/functions retain exact string-hint coercion on every call', () => {
  const before = baseline();
  const after = current();
  const fixture = () => {
    let text = 'First';
    const hints = [];
    const input = { [Symbol.toPrimitive](hint) { hints.push(hint); return text; } };
    return { input, hints, set: value => { text = value; } };
  };
  const expected = fixture();
  const actual = fixture();
  for (const text of ['First', 'Second', '  G\u00c0  ', 'First']) {
    expected.set(text);
    actual.set(text);
    assert.equal(after.lookup(actual.input), before.lookup(expected.input));
  }
  assert.deepStrictEqual(actual.hints, expected.hints);
  assert.deepStrictEqual(actual.hints, ['string', 'string', 'string', 'string']);
  let text = 'A';
  const boxed = new String('ignored');
  boxed.toString = () => text;
  function callable() {}
  callable.toString = () => text;
  for (const value of ['A', 'B']) {
    text = value;
    assert.equal(after.lookup(boxed), before.lookup(boxed));
    assert.equal(after.lookup(callable), before.lookup(callable));
  }
  const broken = { [Symbol.toPrimitive]() { throw new RangeError('coercion refused'); } };
  assert.deepStrictEqual(outcome(after.lookup, broken), outcome(before.lookup, broken));
  assert.equal(after.lookupCache.size, 0, 'No object/function graph or coerced key is retained');
});

test('seeded Unicode label sequences retain exact repeated-call Git parity through eviction', () => {
  const before = baseline();
  const after = current();
  const alphabet = ['A', 'b', 'Z', '0', ' ', '\t', '\n', '-', '_', '\u0111', '\u00e9', '\u0301',
    '\u1ea1', '\u0130', '\u00df', '\u03a3', '\u4e2d', '\ud800', '\udc00', '\u200d', '\u034f', '\u212b'];
  let state = 0x5eed1234;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
  for (let i = 0; i < 2400; i += 1) {
    const label = Array.from({ length: random() % 320 }, () => alphabet[random() % alphabet.length]).join('');
    assert.equal(after.lookup(label), before.lookup(label));
    assert.equal(after.lookup(label), before.lookup(label));
    assert.ok(after.lookupCache.size <= 2048);
  }
});

test('timestamp parsing preserves all existing primitive, ambiguous, local and invalid string results', () => {
  const after = parity('timestamp', [undefined, null, false, true, 0, -0, -1, 1, 9999999999, 10000000000,
    NaN, Infinity, -Infinity, 1n, Symbol('time'), '', ' ', '0', '123', '1760000000', '1760000000000',
    '17600000000', '03/10/2026 08:09:10', '31/02/2026', '2026-10-03', '2026-10-03T08:09:10',
    'October 3, 2026', 'invalid', '2026-10-03T08:09:10z', '2026-10-03t08:09:10Z',
    '26-10-03T08:09:10Z', '+002026-10-03T08:09:10Z', '2026-10-03T08:09Z',
    '2026-10-03T08:09:10+0700', '2026-10-03T08:09:10.1234567890Z',
    '2026-99-03T08:09:10Z', '2026-10-03T08:09:10+99:99']);
  assert.equal(after.timestampCache.size, 0, 'Noncanonical or invalid strings are not cached');
});

test('full-year zoned timestamp hits skip parsing and retain finite zero/negative epochs', () => {
  const before = baseline();
  const observed = countedDate();
  const after = current({ Date: observed.Date });
  const fixtures = ['0000-01-01T00:00:00Z', '0099-01-01T00:00:00Z', '1600-01-01T00:00:00Z',
    '1969-12-31T23:59:59Z', '1970-01-01T00:00:00Z', '2026-10-03T08:09:10Z',
    '2026-10-03T08:09:10+07:00', '2026-10-03T08:09:10-03:30',
    '2026-10-03T08:09:10.1Z', '2026-10-03T08:09:10.123Z', '2026-10-03T08:09:10.123456789Z',
    '2024-02-29T00:00:00Z', '2026-02-30T00:00:00Z', '2026-10-03T24:00:00Z', '9999-12-31T23:59:59Z'];
  for (const input of fixtures) {
    const expected = before.timestamp(input);
    assert.ok(Number.isFinite(expected));
    const initialCalls = observed.calls;
    assert.equal(after.timestamp(input), expected);
    assert.equal(observed.calls, initialCalls + 1);
    assert.equal(after.timestamp(input), expected);
    assert.equal(observed.calls, initialCalls + 1, 'A cross-call hit constructs no Date');
  }
  assert.equal(after.timestampCache.get('1970-01-01T00:00:00Z'), 0);
  assert.ok(after.timestampCache.get('1969-12-31T23:59:59Z') < 0);
  const initialCalls = observed.calls;
  const padded = '   2026-10-03T08:09:10Z\t';
  assert.equal(after.timestamp(padded), before.timestamp(padded));
  assert.equal(observed.calls, initialCalls);
  assert.equal(after.timestampCache.has(padded), false, 'Only the bounded trimmed key is retained');
  const longPadded = `${' '.repeat(1000)}2026-10-03T08:09:10Z`;
  assert.equal(after.timestamp(longPadded), before.timestamp(longPadded));
  assert.equal(after.timestamp(longPadded), before.timestamp(longPadded));
  assert.equal(observed.calls, initialCalls + 2, 'Oversized raw strings bypass caching even if trim produces a short key');
  assert.equal(after.timestampCache.has(longPadded), false);
});

test('timestamp cache is bounded FIFO and never stores invalid parses', () => {
  const before = baseline();
  const observed = countedDate();
  const after = current({ Date: observed.Date });
  const timestamps = Array.from({ length: 2049 }, (_, i) => new Date(i * 1000).toISOString());
  for (const input of timestamps.slice(0, 2048)) assert.equal(after.timestamp(input), before.timestamp(input));
  assert.equal(after.timestampCache.size, 2048);
  assert.equal(after.timestamp(timestamps[0]), 0);
  assert.equal(observed.calls, 2048);
  assert.equal(after.timestampCache.keys().next().value, timestamps[0]);
  assert.equal(after.timestamp(timestamps[2048]), before.timestamp(timestamps[2048]));
  assert.equal(after.timestampCache.size, 2048);
  assert.equal(after.timestampCache.has(timestamps[0]), false);
  assert.equal(after.timestamp(timestamps[0]), 0);
  assert.equal(observed.calls, 2050);
  assert.equal(after.timestampCache.has(timestamps[1]), false);
  for (const invalid of ['2026-99-03T08:09:10Z', '2026-10-03T08:09:10+99:99']) {
    const calls = observed.calls;
    assert.equal(after.timestamp(invalid), before.timestamp(invalid));
    assert.equal(after.timestamp(invalid), before.timestamp(invalid));
    assert.equal(observed.calls, calls + 2, 'Invalid parsing is not negative-cached');
    assert.equal(after.timestampCache.has(invalid), false);
  }
  assert.ok([...after.timestampCache.keys()].every(key => typeof key === 'string' && key.length <= 64));
});

test('timestamp raw objects remain live, including toDate, seconds/nanos and nested primitive fields', () => {
  const before = baseline();
  const after = current();
  let milliseconds = 1000;
  let calls = 0;
  const sdk = { toDate() { calls += 1; return new Date(milliseconds); } };
  for (const value of [1000, 2000, 0, -1000]) {
    milliseconds = value;
    assert.equal(after.timestamp(sdk), before.timestamp(sdk));
  }
  assert.equal(calls, 8, 'SDK conversion occurs separately on every current and frozen invocation');
  const seconds = { seconds: 1, nanoseconds: 123456789 };
  assert.equal(after.timestamp(seconds), before.timestamp(seconds));
  seconds.seconds = -2;
  seconds.nanoseconds = 987654321;
  assert.equal(after.timestamp(seconds), before.timestamp(seconds));
  const nested = { timestampValue: '2026-10-03T08:09:10Z' };
  assert.equal(after.timestamp(nested), before.timestamp(nested));
  nested.timestampValue = '2026-10-04T08:09:10Z';
  assert.equal(after.timestamp(nested), before.timestamp(nested));
  nested.timestampValue = '03/10/2026 08:09:10';
  assert.equal(after.timestamp(nested), before.timestamp(nested));
  const cyclic = {};
  cyclic.value = cyclic;
  for (const input of [cyclic, new String('2026-10-03T08:09:10Z'), new Date(0), {},
    { _seconds: '2', _nanoseconds: '1000000' }, { seconds: NaN, value: '1760000000' },
    { stringValue: 'invalid' }, { integerValue: '1760000000' }, { doubleValue: 2 },
    { toDate() { throw new Error('SDK conversion refused'); } }]) {
    assert.deepStrictEqual(outcome(after.timestamp, input), outcome(before.timestamp, input));
  }
  assert.ok([...after.timestampCache.keys()].every(key => typeof key === 'string'));
});

test('explicit-zone cache stays stable across timezone changes while local/Vietnamese strings remain uncached', () => {
  const oldTimezone = process.env.TZ;
  const before = baseline();
  const after = current();
  try {
    process.env.TZ = 'UTC';
    const zoned = '2026-10-03T08:09:10+07:00';
    const epoch = after.timestamp(zoned);
    assert.equal(epoch, before.timestamp(zoned));
    const local = '2026-10-03T08:09:10';
    const vietnamese = '03/10/2026 08:09:10';
    const utcLocal = after.timestamp(local);
    const utcVietnamese = after.timestamp(vietnamese);
    process.env.TZ = 'Asia/Ho_Chi_Minh';
    assert.equal(after.timestamp(zoned), epoch);
    assert.equal(after.timestamp(zoned), before.timestamp(zoned));
    assert.equal(after.timestamp(local), before.timestamp(local));
    assert.equal(after.timestamp(vietnamese), before.timestamp(vietnamese));
    assert.notEqual(after.timestamp(local), utcLocal);
    assert.notEqual(after.timestamp(vietnamese), utcVietnamese);
    assert.equal(after.timestampCache.has(local), false);
    assert.equal(after.timestampCache.has(vietnamese), false);
  } finally {
    if (oldTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = oldTimezone;
  }
});
