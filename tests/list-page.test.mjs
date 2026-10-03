import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getListPage } from '../src/utils/listPage.js';
import { readFileSync } from 'node:fs';

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

test('large financial/customer lists paginate rendering, not business totals', () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  for (const name of ['orderPage', 'customerPage', 'supplierPage', 'debtCustomerPage']) {
    assert.match(source, new RegExp(`const ${name} = usePagedList\\(`));
    assert.match(source, new RegExp(`${name}\\.items\\.map\\(`));
    assert.match(source, new RegExp(`pagination=\\{${name}\\}`));
  }
  assert.match(source, /const normalizedOrderSnapshots = useMemo\(\(\) => activeOrders/);
  assert.match(source, /dailyOrderRevenueSummary = useMemo\(\(\) => \{\s*const ordersForDate = normalizedOrderSnapshots/);
  assert.match(source, /debtOverviewSummary = useMemo\(\(\) => debtOverviewCustomers.reduce/);
  assert.doesNotMatch(source, /false && activeOrders\.reverse/);
});
test('deleting last-page records clamps the page, without changing aggregate input', () => {
  assert.deepEqual(getListPage(50, 4), { page: 0, pageSize: 50, pageCount: 1, total: 50, start: 0, end: 50 });
  assert.equal(getListPage(0, 12).page, 0);
  assert.equal(getListPage(100, -2).page, 0);
  assert.equal(getListPage(51, 1).end, 51);
});
