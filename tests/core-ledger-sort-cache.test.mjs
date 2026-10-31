import test from 'node:test';
import assert from 'node:assert/strict';
import { appFunction } from './helpers/app-source-function.mjs';

test('ledger sort preserves order, ties and inputs while parsing each row only once per build', () => {
  let dates = 0, timestamps = 0;
  const compare = appFunction('compareLedgerItems', {
    getPaymentDateKey: item => { dates++; return item.day || ''; },
    getDateKeyFromAnyValue: value => value || '',
    getEntityTimestamp: item => item.epoch || 0,
    getPaymentTimestamp: item => { timestamps++; return item.time || 0; },
  });
  const rows = Array.from({ length: 1000 }, (_, i) => Object.freeze({
    id: `row-${i % 19}`, day: i % 13 ? `2026-10-${String(i % 28 + 1).padStart(2, '0')}` : '',
    time: i % 17, epoch: i % 11, amount: i,
  })).reverse();
  const baseline = [...rows].sort(compare);
  const beforeReads = dates;
  dates = 0; timestamps = 0;
  const sortKeys = new Map();
  const actual = [...rows].sort((a, b) => compare(a, b, sortKeys));
  assert.deepEqual(actual, baseline);
  actual.forEach((row, index) => assert.equal(row, baseline[index]));
  assert.equal(dates, rows.length);
  assert.ok(beforeReads > dates * 5, 'test must exercise repeated comparator pairs');
  assert.ok(timestamps <= rows.length);
  assert.deepEqual(rows.map(row => row.amount), Array.from({ length: 1000 }, (_, i) => 999 - i));
});

test('new ledger build sees changed dates and no ordering keys survive the call', () => {
  const compare = appFunction('compareLedgerItems', {
    getPaymentDateKey: item => item.day,
    getDateKeyFromAnyValue: value => value,
    getEntityTimestamp: () => 0,
    getPaymentTimestamp: item => item.time || 0,
  });
  const a = { id: 'a', day: '2026-10-01' }, b = { id: 'b', day: '2026-10-02' };
  assert.deepEqual([a, b].sort((x,y) => compare(x,y,new Map())), [a,b]);
  a.day = '2026-10-03';
  const freshKeys = new Map();
  assert.deepEqual([a,b].sort((x,y) => compare(x,y,freshKeys)), [b,a]);
});
