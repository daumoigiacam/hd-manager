import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getListPage } from '../src/utils/listPage.js';

test('page bounds include every record exactly once, including a partial last page', () => {
  const rows = Array.from({ length: 602 }, (_, i) => i);
  const collected = [];
  for (let index = 0; index < 13; index++) {
    const page = getListPage(rows.length, index);
    assert.ok(page.end - page.start <= 50);
    collected.push(...rows.slice(page.start, page.end));
  }
  assert.deepEqual(collected, rows);
});
test('deleting last-page records clamps the page, without changing aggregate input', () => {
  assert.deepEqual(getListPage(50, 4), { page: 0, pageSize: 50, pageCount: 1, total: 50, start: 0, end: 50 });
  assert.equal(getListPage(0, 12).page, 0);
  assert.equal(getListPage(100, -2).page, 0);
  assert.equal(getListPage(51, 1).end, 51);
});
