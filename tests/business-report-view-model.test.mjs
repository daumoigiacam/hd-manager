import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatCompactVnd, formatVnd, getChangePercent, getReportPeriod, getRevenueGroups,
} from '../src/features/business-report/reportViewModel.js';
import { buildProductDailyReportSeries } from '../src/services/executiveDashboardService.js';

const finance = {
  todayKey: '2026-09-26', currentMonthKey: '2026-09', weekStartKey: '2026-09-21', weekEndKey: '2026-09-27',
  revenueToday: 150000, profitToday: 100000, expenseToday: 50000,
  revenueYesterday: 100000, profitYesterday: 70000, expenseYesterday: 30000,
  revenueWeek: 250000, profitWeek: 170000, expenseWeek: 80000,
  revenueMonth: 350000, profitMonth: 230000, expenseMonth: 120000,
  revenuePreviousMonth: 300000, profitPreviousMonth: 200000, expensePreviousMonth: 100000,
  revenueQuarter: 650000, quarterProfit: 430000, expenseQuarter: 220000,
  revenueYear: 900000, yearProfit: 600000, expenseYear: 300000,
  receivables: 80000, overdueReceivables: 10000,
  series7Days: [
    { date: '2026-09-25', revenue: 100000, profit: 70000, expense: 30000 },
    { date: '2026-09-26', revenue: 150000, profit: 100000, expense: 50000 },
  ],
  series30Days: [
    { date: '2026-08-31', revenue: 300000, profit: 200000, expense: 100000 },
    { date: '2026-09-25', revenue: 100000, profit: 70000, expense: 30000 },
    { date: '2026-09-26', revenue: 150000, profit: 100000, expense: 50000 },
  ],
  series12Months: [
    { month: '2026-08', revenue: 300000, profit: 200000, expense: 100000 },
    { month: '2026-09', revenue: 350000, profit: 230000, expense: 120000 },
  ],
};

test('business report periods preserve financial snapshot totals and select the matching chart window', () => {
  const today = getReportPeriod(finance, 'today');
  assert.equal(today.revenue, 150000);
  assert.equal(today.chartRows.length, 2);
  assert.equal(today.receivables, 80000);
  assert.equal(getReportPeriod(finance, 'week').rows.length, 2);
  assert.equal(getReportPeriod(finance, 'month').revenue, 350000);
  assert.equal(getReportPeriod(finance, 'quarter').chartRows.length, 2);
  assert.equal(getReportPeriod(finance, 'year').profit, 600000);
  const custom = getReportPeriod(finance, 'custom', { start: '2026-09-25', end: '2026-09-26' });
  assert.equal(custom.revenue, 250000);
  assert.equal(custom.expense, 80000);
  assert.equal(custom.rows.length, 2);
});

test('money, comparison, and revenue shares remain truthful', () => {
  assert.equal(formatVnd(2386621991), '2.386.621.991 đ');
  assert.equal(formatCompactVnd(2386621991), '2,39 tỷ');
  assert.equal(getChangePercent(150, 100), 50);
  assert.equal(getChangePercent(0, 0), null);
  const groups = getRevenueGroups([
    { name: 'Gà', revenue: 60 }, { name: 'Vịt', revenue: 30 }, { name: 'Khác', revenue: 10 },
  ], 2);
  assert.deepEqual(groups.map((row) => row.name), ['Gà', 'Vịt', 'Khác']);
  assert.equal(groups.reduce((sum, row) => sum + row.share, 0), 100);
});

test('product trend includes only that product and ignores archived orders', () => {
  const rows = buildProductDailyReportSeries({
    dateKeys: ['2026-09-25', '2026-09-26'],
    product: { id: 'chicken', name: 'Gà ta' },
    products: [{ id: 'chicken', name: 'Gà ta' }, { id: 'duck', name: 'Vịt sống' }],
    orders: [
      { date: '2026-09-25', items: [{ productId: 'chicken', quantity: 2, unitPrice: 50000, costPrice: 30000 }] },
      { date: '2026-09-25', items: [{ productId: 'duck', quantity: 4, unitPrice: 50000, costPrice: 30000 }] },
      { date: '2026-09-26', archived: true, items: [{ productId: 'chicken', quantity: 1, unitPrice: 50000 }] },
    ],
  });
  assert.deepEqual(rows.map((row) => row.revenue), [100000, 0]);
  assert.deepEqual(rows.map((row) => row.profit), [40000, 0]);
});
