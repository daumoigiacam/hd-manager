import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appFunction } from './helpers/app-source-function.mjs';

// Differential oracle from the published revision, not a rewritten expectation.
const baseline = execFileSync('git', ['show', 'da22deba6e9435e1024f3bd98a84d21e24cb7d9a:src/App.jsx'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const start = baseline.indexOf('const getEntityTimestamp =');
const end = baseline.indexOf('\nconst getOrderPlacedAtLabel', start);
assert.ok(start >= 0 && end > start);
const baselineDeclaration = baseline.slice(start, end);
const fields = ['createdAt', 'updatedAt', 'timestamp', 'receivedAt', 'sentAt', 'approvedAt', 'paidAt', 'lastMessageAt', 'lastActivityAt'];
const runtime = () => {
  let parse;
  parse = appFunction('parseEntityTimestampValue', {
    parseVietnameseDateTimeString: appFunction('parseVietnameseDateTimeString'),
    parseEntityTimestampValue: value => parse(value),
  });
  return {
    current: appFunction('getEntityTimestamp', { parseEntityTimestampValue: parse }),
    old: new Function('parseEntityTimestampValue', `${baselineDeclaration}\nreturn getEntityTimestamp;`)(parse),
  };
};

test('timestamp priority, epoch zero, local dates and ID fallbacks equal published business-record behavior', () => {
  const previousZone = process.env.TZ;
  try {
    for (const zone of ['UTC', 'Asia/Ho_Chi_Minh']) {
      process.env.TZ = zone;
      const r = runtime();
      const values = [undefined, null, '', 0, -1, 1, NaN, Infinity, 1793434144299,
        'invalid', '2026-10-31', '2026-10-31T07:09:04.299Z', '2026-10-31T14:09:04', '31/10/2026 14:09',
        { seconds: 1793434144, nanoseconds: 299000000 }, { seconds: 0, nanoseconds: 0 },
        new Date('2026-10-31T07:09:04Z'), { toMillis: () => 1793434144299 }, { toDate: () => new Date('2026-10-31T07:09:04Z') }];
      const ids = ['', 'plain-guid', 'order_1793434144', 'order_1793434144299', 'prefix_1793434144299_tail'];
      for (let i = 0; i < 12000; i++) {
        const record = { id: ids[i % ids.length], date: i % 3 ? '2026-10-31T00:00:00Z' : 'invalid' };
        fields.forEach((field, index) => { record[field] = values[(i * (index + 3) + index) % values.length]; });
        assert.equal(r.current(record), r.old(record), `${zone} fixture ${i}`);
      }
      for (const value of [...values, {}, [], false, true]) assert.equal(r.current(value), r.old(value));
    }
  } finally {
    if (previousZone === undefined) delete process.env.TZ; else process.env.TZ = previousZone;
  }
});

test('a resolved first timestamp does not read unused later business fields', () => {
  const r = runtime();
  const counts = new Map();
  const record = Object.fromEntries(fields.map(field => [field, undefined]));
  for (const field of fields) Object.defineProperty(record, field, { get() { counts.set(field, (counts.get(field) || 0) + 1); return field === 'createdAt' ? '2026-10-31T07:09:04Z' : undefined; } });
  const expected = r.old(record);
  assert.equal([...counts.values()].reduce((a, b) => a + b, 0), 9);
  counts.clear();
  assert.equal(r.current(record), expected);
  assert.deepEqual([...counts.keys()], ['createdAt']);
});
