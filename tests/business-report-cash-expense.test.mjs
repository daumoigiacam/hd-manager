import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildExecutiveDashboardSnapshot } from '../src/services/executiveDashboardService.js';
import { getCashExpenseFinance, getReportPeriod, aggregateReportRows, getPayrollPeriodSummary, getOperatingExpenseItems } from '../src/features/business-report/reportViewModel.js';

test('report adds payroll payable once to non-payroll vouchers, without adding inventory valuation', () => {
  const cashExpenseRecords = [
    { id: 'purchase', date: '2026-10-24', category: 'Chi mua hàng', amount: 1000, sourceWarehouseImportId: 'import' },
    { id: 'fuel', date: '2026-10-24', category: 'Xăng dầu', amount: 200 },
    { id: 'salary', date: '2026-10-24', category: 'Lương', amount: 300 },
    { id: 'other', date: '2026-10-24', category: 'Chi phí khác', amount: 200 },
    { id: 'archived', date: '2026-10-24', amount: 9999, isArchived: true },
    { id: 'debt-return', date: '2026-10-24', amount: 777, sourceType: 'customer_debt_repayment' },
  ];
  const snapshot = buildExecutiveDashboardSnapshot({ now: '2026-10-24T12:00:00', cashExpenseRecords,
    expenses: cashExpenseRecords, payrollCosts: [{ date: '2026-10-24', amount: 900 }],
  });
  const finance = getCashExpenseFinance(snapshot.finance);
  const report = getReportPeriod(finance, 'month');
  assert.equal(report.expense, 2300);
  assert.equal(report.profit, report.revenue - 2300);
  assert.equal(getPayrollPeriodSummary(finance, report).total, 900);
  assert.equal(aggregateReportRows(finance.expenseCategoryRows, report, { limit: Infinity }).reduce((s, r) => s + r.value, 0), 2300);
  assert.equal(getOperatingExpenseItems(finance.expenseDetailRows, report).reduce((s, r) => s + r.value, 0), 400);
  assert.equal(finance.expenseDetailRows.filter(r => r.sourceType === 'costOfGoods').length, 0);
  assert.equal(finance.cashExpenseRows.find(r => r.sourceId === 'salary').value, 300, 'cash payment remains intact');
  assert.equal(finance.series7Days.at(-1).expense, 2300);
  assert.equal(snapshot.finance.salaryExpenseMonth, 900, 'underlying payroll analytics unchanged');
});

test('full calendar periods include recorded future dates and are not limited by the chart window', () => {
  const { finance: original } = buildExecutiveDashboardSnapshot({ now: '2026-10-24T12:00:00', cashExpenseRecords: [
    { date: '2026-01-01', amount: 5 }, { date: '2026-09-01', amount: 7 },
    { date: '2026-10-01', amount: 10 }, { date: '2026-10-24', amount: 20 },
    { date: '2026-10-31', amount: 30 }, { date: '2026-12-31', amount: 40 },
  ] });
  const finance = getCashExpenseFinance(original);
  for (const [period, expected] of [['today', 20], ['month', 60], ['quarter', 100], ['year', 112]]) {
    assert.equal(getReportPeriod(finance, period).expense, expected, period);
  }
  assert.equal(getReportPeriod(finance, 'month').previous.expense, 7);
  assert.equal(getReportPeriod(finance, 'month').chartRows.reduce((sum, row) => sum + row.expense, 0), 60);
  assert.equal(getReportPeriod(finance, 'custom', { start: '2026-10-01', end: '2026-10-24' }).expense, 30);
  assert.equal(getReportPeriod(getCashExpenseFinance({ ...original, cashExpenseRows: [] }), 'month').expense, 0);
});

test('home and cash ledger share official-approval and date rules at the application boundary', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.equal((app.match(/const resolveCashflowDateKey =/g) || []).length, 1);
  assert.match(app, /cashExpenseRecords: expenses\.filter\(isCashflowOfficial\)\.map/);
  assert.match(app, /date: resolveCashflowDateKey\(expense\)/);
  assert.match(app, /const officialTransactions = matchingTransactions\.filter\(item => isCashflowOfficial\(item\)\)/);
});

test('payroll payable follows the selected period independently of payment date', () => {
  const { finance: original } = buildExecutiveDashboardSnapshot({ now: '2026-10-24T12:00:00',
    payrollCosts: [
      { date: '2026-01-10', employeeId: 'a', amount: 100 },
      { date: '2026-09-30', employeeId: 'a', amount: 200 },
      { date: '2026-10-01', employeeId: 'a', amount: 300 },
      { date: '2026-10-24', employeeId: 'a', amount: 400 },
    ],
    cashExpenseRecords: [
      { id: 'paid-previous-salary', date: '2026-10-24', category: 'Lương', amount: 200 },
      { id: 'operating', date: '2026-10-24', category: 'Điện nước', amount: 10 },
    ],
  });
  const finance = getCashExpenseFinance(original);
  for (const [period, salary] of [['today', 400], ['week', 400], ['month', 700], ['quarter', 700], ['year', 1000]]) {
    const report = getReportPeriod(finance, period);
    assert.equal(getPayrollPeriodSummary(finance, report).total, salary, period);
    assert.equal(report.expense, salary + 10, period);
    assert.equal(aggregateReportRows(finance.expenseCategoryRows, report).reduce((sum, row) => sum + row.value, 0), report.expense);
  }
  const custom = getReportPeriod(finance, 'custom', { start: '2026-10-01', end: '2026-10-01' });
  assert.equal(custom.expense, 300);
  assert.equal(getPayrollPeriodSummary(finance, custom).total, 300);
  assert.equal(getReportPeriod(finance, 'month').previous.expense, 200);
  assert.equal(finance.series7Days.at(-1).expense, 410);
  assert.equal(finance.cashExpenseRows.reduce((sum, row) => sum + row.value, 0), 210);
});
