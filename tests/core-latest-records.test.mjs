import test from 'node:test';
import assert from 'node:assert/strict';
import { selectLatestRecords } from '../src/utils/latestRecords.js';

test('bounded recent selection equals stable full sorting including ties and nonfinite timestamp fallbacks', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const times = [0, -1, 1, Infinity, -Infinity, NaN, null, undefined, 1700000000000];
    const rows = Object.freeze(Array.from({ length: 900 }, (_, i) => Object.freeze({ id: `${seed}-${i}`, time: times[(i * seed + Math.floor(i / 7)) % times.length] })));
    const sorted = [...rows].sort((a, b) => (b.time || 0) - (a.time || 0));
    for (const limit of [0, 1, 8, 20, 40, 899, 950]) {
      assert.deepEqual(selectLatestRecords(rows, limit, row => row.time), sorted.slice(0, limit));
    }
  }
  assert.deepEqual(selectLatestRecords([], 40, row => row.time), []);
  assert.throws(() => selectLatestRecords([], -1, () => 0), /Invalid/);
});

test('history timestamps are evaluated once and selected rows keep identity through edits and deletions', () => {
  let reads = 0;
  const rows = Array.from({ length: 10000 }, (_, i) => ({ id: `r${i}`, time: i % 600 }));
  const latest = selectLatestRecords(rows, 40, row => { reads++; return row.time; });
  assert.equal(reads, rows.length);
  assert.strictEqual(latest[0], rows[599]);
  const changed = rows.slice(0, 500).map((row, i) => i === 0 ? { ...row, time: 5000 } : row);
  assert.strictEqual(selectLatestRecords(changed, 40, row => row.time)[0], changed[0]);
  assert.strictEqual(selectLatestRecords(rows, 40, row => row.time)[0], rows[599]);
});
