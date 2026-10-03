import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFirstRecordLookup } from '../src/utils/firstRecordLookup.js';

test('request lookup preserves first-match strict ID semantics and duplicate ordering', () => {
  const ids = ['a', 'a', 1, '1', undefined, null, 0, -0, NaN];
  const records = ids.map((id, index) => ({ id, index }));
  const lookup = buildFirstRecordLookup(records);
  for (const id of [...ids, 'missing']) {
    assert.equal(lookup.get(id), records.find(record => record.id === id));
  }
});

test('rebuilding reflects replacement, edits, deletion and tenant-scoped input', () => {
  const before = [{ id: 'c', companyId: 'one', name: 'Before' }];
  const after = [{ ...before[0], name: 'After' }];
  assert.equal(buildFirstRecordLookup(before).get('c'), before[0]);
  assert.equal(buildFirstRecordLookup(after).get('c'), after[0]);
  assert.equal(buildFirstRecordLookup([]).get('c'), undefined);
  assert.equal(buildFirstRecordLookup(before).get('foreign'), undefined);
});
