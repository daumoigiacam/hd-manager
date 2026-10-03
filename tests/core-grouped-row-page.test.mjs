import test from 'node:test';
import assert from 'node:assert/strict';
import { getGroupedRowPage } from '../src/services/groupedRowPage.js';

test('one 10000-line customer stays bounded on every page without losing or cloning rows', () => {
  const rows = Array.from({ length: 10000 }, (_, id) => ({ id }));
  const groups = [{ key: 'customer', rows, rowSpan: rows.length }];
  const visited = [];
  for (let offset = 0; offset < rows.length; offset += 100) {
    const page = getGroupedRowPage(groups, offset);
    assert.equal(page.items[0].rowSpan, 100);
    assert.equal(page.items[0].rows.length, 100);
    visited.push(...page.items[0].rows);
  }
  assert.deepEqual(visited, rows);
  assert.ok(visited.every((row, index) => row === rows[index]));
  assert.equal(groups[0].rowSpan, 10000);
});

test('group boundaries, removal on last page, empty results and backward paging', () => {
  const groups = [3, 4, 6].map((count, i) => ({ key: i, rows: Array.from({ length: count }, (_, j) => `${i}-${j}`) }));
  const first = getGroupedRowPage(groups, 0, 5);
  assert.deepEqual(first.items.map(group => group.rows), [['0-0', '0-1', '0-2'], ['1-0', '1-1']]);
  const next = getGroupedRowPage(groups, 5, 5);
  assert.deepEqual(next.items.map(group => group.rows), [['1-2', '1-3'], ['2-0', '2-1', '2-2']]);
  assert.deepEqual(getGroupedRowPage(groups, next.offset - next.size, 5), first);
  assert.equal(getGroupedRowPage(groups.slice(0, 1), 10, 5).offset, 0);
  assert.deepEqual(getGroupedRowPage([], 100).items, []);
});
