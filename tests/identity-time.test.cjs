const { test } = require('node:test');
const assert = require('node:assert/strict');
const { asIso } = require('../functions/identityTime');

test('identity dates accept Firestore timestamps and legacy date formats', () => {
  const iso = '2026-10-02T00:00:00.000Z';
  const date = new Date(iso);
  assert.equal(asIso(date), iso);
  assert.equal(asIso(iso), iso);
  assert.equal(asIso({ toDate: () => date }), iso);
  assert.equal(asIso({ seconds: date.getTime() / 1000, nanoseconds: 0 }), iso);
  assert.equal(asIso({ _seconds: date.getTime() / 1000, _nanoseconds: 0 }), iso);
});
test('malformed dates do not break the devices endpoint', () => {
  for (const value of [null, '', 'invalid', {}, new Date(NaN), { toDate() { throw Error('invalid'); } }]) {
    assert.equal(asIso(value), null);
  }
});
