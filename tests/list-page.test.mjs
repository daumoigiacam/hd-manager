import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getListPage } from '../src/utils/listPage.js';
import { readApplicationSource } from '../scripts/helpers/application-source.cjs';
import { getDefaultListPageSize } from '../src/services/renderOptimization.js';
import { appFunction } from './helpers/app-source-function.mjs';

test('small and low-power screens bound card DOM while desktop retains its page size', () => {
  assert.equal(getDefaultListPageSize({ matchMedia: () => ({ matches: true }) }), 20);
  assert.equal(getDefaultListPageSize({ document: { documentElement: { classList: { contains: () => true } } } }), 15);
  assert.equal(getDefaultListPageSize({ matchMedia: () => ({ matches: false }) }), 20);
  const records = Array.from({ length: 603 }, (_, id) => id);
  for (const size of [15,20,50]) {
    const seen = [];
    for (let page = 0; page < Math.ceil(records.length/size); page++) {
      const bounds = getListPage(records.length, page, size);
      seen.push(...records.slice(bounds.start, bounds.end));
    }
    assert.deepEqual(seen, records);
  }
});

test('page bounds include every record exactly once, including a partial last page', () => {
  const rows = Array.from({ length: 602 }, (_, i) => i);
  const collected = [];
  for (let index = 0; index < Math.ceil(rows.length/20); index++) {
    const page = getListPage(rows.length, index);
    assert.ok(page.end - page.start <= 20);
    collected.push(...rows.slice(page.start, page.end));
  }
  assert.deepEqual(collected, rows);
});

test('large financial/customer lists paginate rendering, not business totals', () => {
  const source = readApplicationSource();
  for (const [name, renderedName] of [['orderPage', 'orderPage'], ['customerPage', 'customerPage'], ['supplierPage', 'supplierPage'],
    ['debtCustomerPage', 'displayedDebtPage'], ['bankTransactionPage', 'bankTransactionPage']]) {
    assert.match(source, new RegExp(`const ${name} = usePagedList\\(`));
    assert.match(source, new RegExp(`${renderedName}\\.items\\.map\\(`));
    assert.match(source, new RegExp(`pagination=\\{${renderedName}\\}`));
  }
  const currentPage = { items: Array.from({ length: 20 }, (_, id) => ({ id })) };
  const retainedPage = { items: currentPage.items.slice(0, 15) };
  for (const retainedDebtPage of [null, retainedPage]) {
    assert.strictEqual(appFunction('displayedDebtPage', { retainedDebtPage, debtCustomerPage: currentPage }, { scope: 'DebtManagementView' }),
      retainedDebtPage || currentPage, 'The rendered debt rows and pagination use an actual bounded page, including retained search results');
  }
  assert.match(source, /dailyOrderRevenueSummary = useMemo\(\(\) => \{\s*const ordersForDate = normalizedOrderSnapshots/);
  assert.match(source, /debtOverviewSummary = useMemo\(\(\) => debtOverviewCustomers.reduce/);
  assert.doesNotMatch(source, /false && activeOrders\.reverse/);
});
test('deleting last-page records clamps the page, without changing aggregate input', () => {
  assert.deepEqual(getListPage(50, 4), { page: 2, pageSize: 20, pageCount: 3, total: 50, start: 40, end: 50 });
  assert.equal(getListPage(0, 12).page, 0);
  assert.equal(getListPage(100, -2).page, 0);
  assert.equal(getListPage(51, 1).end, 40);
});
