import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExecutiveDashboardSnapshot } from '../src/services/executiveDashboardService.js';
import { aggregateReportRows, getExpenseSourceRows, getPayrollPeriodSummary, getPeriodGuidance, getReportPeriod, getTopSalesEmployees } from '../src/features/business-report/reportViewModel.js';

test('payroll period summary includes every employee and only dates in the selected period', () => {
  const { finance } = buildExecutiveDashboardSnapshot({ now: '2026-09-26T12:00:00', payrollCosts: [
    ...Array.from({ length: 25 }, (_, i) => ({ employeeId: `e${i}`, employeeName: `Employee ${i}`, date: '2026-09-26', amount: 10 })),
    ...['2026-09-22', '2026-09-01', '2026-07-01', '2026-01-01'].map(date => ({ employeeId: 'e0', date, amount: 100 })),
  ] });
  for (const [period, expected] of [['today', 250], ['week', 350], ['month', 450], ['quarter', 550], ['year', 650]]) {
    const summary = getPayrollPeriodSummary(finance, getReportPeriod(finance, period));
    assert.equal(summary.total, expected, period);
    assert.equal(summary.employees.length, 25, period);
  }
});

test('expense drilldown preserves individual vouchers and the selected date range', () => {
  const { finance } = buildExecutiveDashboardSnapshot({ now: '2026-10-01T12:00:00', expenses: [
    { id: 'one', date: '2026-10-01', name: 'Fuel', category: 'Xăng dầu', amount: 100, note: 'Receipt one' },
    { id: 'two', date: '2026-10-01', name: 'Fuel', category: 'Xăng dầu', amount: 200 },
    { id: 'old', date: '2026-09-30', name: 'Fuel', category: 'Xăng dầu', amount: 300 },
    { id: 'other', date: '2026-10-01', name: 'Water', amount: 50 },
  ] });
  const rows = getExpenseSourceRows(finance.expenseDetailRows, getReportPeriod(finance, 'today'), { name: 'Fuel' });
  assert.deepEqual(rows.map(row => row.sourceId).sort(), ['one', 'two']);
  assert.equal(rows.reduce((sum, row) => sum + row.value, 0), 300);
  assert.equal(rows.find(row => row.sourceId === 'one').detail, 'Receipt one');
  assert.equal(rows.find(row => row.sourceId === 'two').originalAmount, 200);
});

test('October 1 month and quarter match today but year includes earlier months', () => {
  const { finance } = buildExecutiveDashboardSnapshot({
    now: '2026-10-01T18:00:00',
    orders: [
      { date: '2026-10-01', amount: 60 },
      { date: '2026-09-30', amount: 100 },
      { date: '2026-01-15', amount: 200 },
      { date: '2025-12-31', amount: 900 },
    ],
    expenses: [
      { date: '2026-10-01', category: 'Xăng dầu', amount: 10 },
      { date: '2026-09-30', category: 'Xăng dầu', amount: 20 },
    ],
  });
  for (const period of ['today', 'month', 'quarter']) {
    const report = getReportPeriod(finance, period);
    assert.equal(report.revenue, 60, period);
    assert.equal(report.expense, 10, period);
  }
  const year = getReportPeriod(finance, 'year');
  assert.equal(year.startDate, '2026-01-01');
  assert.equal(year.revenue, 360);
  assert.equal(year.expense, 30);
  assert.equal(year.profit, 330);
});

test('home product breakdown and rankings use the selected day/week/month/quarter/year', () => {
  const finance = { todayKey: '2026-09-26', currentMonthKey: '2026-09', weekStartKey: '2026-09-21', weekEndKey: '2026-09-26' };
  const rows = ['2026-09-26', '2026-09-22', '2026-09-01', '2026-07-01', '2026-01-01', '2025-12-31'].map((date, index) => ({ date, id: String(index), name: `Product ${index}`, revenue: 10, profit: 2, quantity: 1 }));
  for (const [period, count] of [['today', 1], ['week', 2], ['month', 3], ['quarter', 4], ['year', 5]]) {
    const result = aggregateReportRows(rows, getReportPeriod(finance, period), { groupBy: 'id', valueFields: ['revenue', 'profit', 'quantity'] });
    assert.equal(result.length, count, period);
    assert.equal(result.reduce((sum, row) => sum + row.revenue, 0), count * 10);
  }
});

test('period guidance replaces monthly financial advice and keeps current operational alerts explicit', () => {
  const snapshot = { alerts: [{ id: 'negativeProfit', message: 'stale month' }, { id: 'attendance', message: 'Absent today' }], recommendations: [{ id: 'cost-control', impact: 'stale month' }, { id: 'collect-debt', impact: 'Current debt' }] };
  const positive = getPeriodGuidance(snapshot, { label: 'Tuần này', profit: 10, expense: 100 }, [], [{ name: 'Fuel', value: 40 }]);
  assert.equal(positive.alerts.some(row => row.id === 'negativeProfit'), false);
  assert.match(positive.alerts[0].message, /Hiện tại/);
  assert.match(positive.recommendations.find(row => row.id === 'cost-control').impact, /Tuần này.*40%/);
  const empty = getPeriodGuidance(snapshot, { label: 'Hôm nay', profit: 0, expense: 0 }, [], []);
  assert.equal(empty.recommendations.some(row => row.id === 'cost-control'), false);
  const negative = getPeriodGuidance(snapshot, { label: 'Quý 3', profit: -10, expense: 50 }, [], []);
  assert.match(negative.alerts.find(row => row.id === 'negativeProfit').message, /Quý 3/);
});

test('all report periods include payroll once while cash outflow stays unchanged', () => {
  const snapshot = buildExecutiveDashboardSnapshot({
    now: '2026-09-26T12:00:00',
    expenses: [
      { date: '2026-09-26', category: 'Lương nhân sự', amount: 350 },
      { date: '2026-09-26', category: 'Xăng dầu', amount: 70 },
    ],
    payrollCosts: [
      { date: '2026-09-26', amount: 150 },
      { date: '2026-09-24', amount: 200 },
      { date: '2026-08-30', amount: 100 },
    ],
  });
  const { finance } = snapshot;
  assert.equal(finance.cashExpenseToday, 420);
  assert.equal(finance.salaryExpenseMonth, 350);
  assert.equal(finance.expenseToday, 220);
  assert.equal(finance.expenseWeek, 420);
  assert.equal(finance.expenseMonth, 420);
  assert.equal(finance.expenseQuarter, 520);
  assert.equal(finance.expenseYear, 520);
  assert.equal(finance.expensePreviousMonth, 100);
  for (const [period, total] of [['today', 220], ['week', 420], ['month', 420], ['quarter', 520], ['year', 520]]) {
    assert.equal(getReportPeriod(finance, period).expense, total, period);
  }
  assert.equal(finance.series30Days.find(row => row.date === '2026-09-26').expense, 220);
  assert.equal(finance.series12Months.find(row => row.month === '2026-09').expense, 420);
  assert.equal(finance.costBreakdown.reduce((sum, row) => sum + row.value, 0), 420);
});

test('Vietnamese single-digit date strings are included in report period totals', () => {
  const { finance } = buildExecutiveDashboardSnapshot({
    now: '2026-09-26T12:00:00',
    orders: [{ date: '26/9/2026 13:52', amount: 100 }],
    expenses: [{ date: '25/9/2026 08:05', category: 'Xăng dầu', amount: 30 }],
  });

  assert.equal(finance.revenueToday, 100);
  for (const period of ['week', 'month', 'quarter', 'year']) {
    const report = getReportPeriod(finance, period);
    assert.equal(report.revenue, 100, `${period} revenue`);
    assert.equal(report.expense, 30, `${period} expense`);
    assert.equal(report.profit, 70, `${period} profit`);
  }
});

test('salary advances stay in cash flow but do not reduce recognized salary cost', () => {
  const { finance } = buildExecutiveDashboardSnapshot({
    now: '2026-09-26T12:00:00',
    expenses: [
      { date: '2026-09-25', category: 'Ứng lương', amount: 100 },
      { date: '2026-09-26', category: 'Lương nhân sự', amount: 300 },
    ],
    payrollCosts: [{ date: '2026-09-26', amount: 250 }],
  });
  assert.equal(finance.cashExpenseMonth, 400);
  assert.equal(finance.expenseMonth, 300);
  assert.equal(finance.expenseToday, 300);
  assert.equal(finance.series30Days.find(row => row.date === '2026-09-25').expense, 0);
  assert.equal(finance.salaryExpenseMonth, 250);
});

test('future-dated costs are not recognized in current period totals', () => {
  const { finance } = buildExecutiveDashboardSnapshot({
    now: '2026-09-26T12:00:00',
    expenses: [
      { date: '2026-09-26', category: 'Điện nước', amount: 70 },
      { date: '2026-09-27', category: 'Xăng dầu', amount: 900 },
    ],
    payrollCosts: [
      { date: '2026-09-26', amount: 100 },
      { date: '2026-09-27', amount: 500 },
    ],
  });
  for (const period of ['today', 'week', 'month', 'quarter', 'year']) {
    assert.equal(getReportPeriod(finance, period).expense, 170, period);
  }
});

test('total expense combines sold inventory, operating cost and payroll without double counting purchases', () => {
  const { finance } = buildExecutiveDashboardSnapshot({
    now: '2026-09-26T12:00:00',
    warehouseImports: [{ date: '2026-09-25', productId: 'chicken', quantity: 10, amount: 100 }],
    orders: [{ date: '2026-09-26', items: [{ productId: 'chicken', quantity: 2, total: 60 }] }],
    expenses: [
      { date: '2026-09-25', sourceType: 'warehouse_import_purchase', amount: 100 },
      { date: '2026-09-26', category: 'Điện nước', amount: 10 },
    ],
    payrollCosts: [{ date: '2026-09-26', amount: 20 }],
  });
  assert.equal(finance.costOfGoodsToday, 20);
  assert.equal(finance.expenseToday, 50);
  assert.equal(finance.cashExpenseMonth, 110);
  for (const period of ['week', 'month', 'quarter', 'year']) {
    assert.equal(getReportPeriod(finance, period).expense, 50, period);
  }
});

test('receivables and top debtors use reconciled Sổ nợ balances, not order totals', () => {
  const snapshot = buildExecutiveDashboardSnapshot({
    now: '2026-09-26T12:00:00',
    customers: [{ id: 'a', name: 'Khách A', currentDebt: 9000 }],
    orders: [{ date: '2026-09-26', customerId: 'a', amount: 9000 }],
    debtLedger: [
      { id: 'a', name: 'Khách A', debt: 500 },
      { id: 'b', name: 'Khách B', debt: 200 },
      { id: 'c', name: 'Khách C', debt: 0 },
    ],
  });
  assert.equal(snapshot.finance.receivables, 700);
  assert.deepEqual(snapshot.business.topCustomersByDebt.map(row => row.debt), [500, 200]);
  assert.equal(snapshot.business.debtCustomerCount, 2);
  assert.equal(getReportPeriod(snapshot.finance, 'year').receivables, 700);
});

test('detailed product, cost category, and payroll rows reconcile for the selected month', () => {
  const snapshot = buildExecutiveDashboardSnapshot({
    now: '2026-09-26T12:00:00',
    employees: [
      { id: 'e1', name: 'Lan', department: 'Kinh doanh' },
      { id: 'e2', name: 'Minh', department: 'Kho' },
    ],
    products: [
      { id: 'chicken', name: 'Gà ta' },
      { id: 'duck', name: 'Vịt sống' },
    ],
    orders: [
      { id: 'o1', date: '2026-09-26', customerId: 'c1', customerName: 'Khách A', total: 150, profit: 100, items: [
        { productId: 'chicken', productName: 'Gà ta', quantity: 2, unitPrice: 50, costPrice: 30, total: 100 },
        { productId: 'duck', productName: 'Vịt sống', quantity: 1, unitPrice: 50, costPrice: 20, total: 50 },
      ] },
      { id: 'o2', date: '2026-08-31', customerId: 'c2', customerName: 'Khách B', total: 80, profit: 40, items: [
        { productId: 'chicken', productName: 'Gà ta', quantity: 1, unitPrice: 80, costPrice: 40, total: 80 },
      ] },
    ],
    expenses: [
      { id: 'x1', date: '2026-09-26', category: 'Xăng dầu', amount: 70 },
      { id: 'x2', date: '2026-08-31', category: 'Điện nước', amount: 50 },
    ],
    payrollCosts: [
      { id: 'p1', date: '2026-09-26', employeeId: 'e1', amount: 120 },
      { id: 'p2', date: '2026-08-31', employeeId: 'e2', amount: 80 },
    ],
  });
  const { finance, business } = snapshot;
  const report = getReportPeriod(finance, 'month');
  const categories = aggregateReportRows(finance.expenseCategoryRows, report, { groupBy: 'category', valueFields: ['value'] });
  const salaries = aggregateReportRows(finance.salaryEmployeeRows, report, { groupBy: 'employeeId', valueFields: ['value'] });
  const productsForPeriod = aggregateReportRows(business.productPerformanceRows, report, { groupBy: 'id', valueFields: ['revenue', 'profit', 'quantity'] });
  const customersForPeriod = aggregateReportRows(business.customerPerformanceRows, report, { groupBy: 'id', valueFields: ['revenue', 'profit', 'orders'] });

  assert.equal(categories.reduce((sum, row) => sum + row.value, 0), report.expense);
  assert.equal(categories.find(row => row.name === 'Lương').value, finance.salaryExpenseMonth);
  assert.equal(salaries.reduce((sum, row) => sum + row.value, 0), finance.salaryExpenseMonth);
  assert.deepEqual(productsForPeriod.reduce((sum, row) => sum + row.revenue, 0), report.revenue);
  assert.equal(productsForPeriod.reduce((sum, row) => sum + row.profit, 0), 70);
  assert.equal(customersForPeriod.reduce((sum, row) => sum + row.revenue, 0), report.revenue);
  assert.deepEqual(salaries.map(row => row.name), ['Lan']);
});

test('top sales employees change with day, week, month and quarter', () => {
  const snapshot = buildExecutiveDashboardSnapshot({
    now: '2026-09-26T12:00:00',
    employees: [
      { id: 'sales-a', name: 'Lan', position: 'Kinh doanh' },
      { id: 'sales-b', name: 'Minh', position: 'Kinh doanh' },
      { id: 'driver', name: 'Nam', position: 'Tài xế' },
    ],
    customers: [
      { id: 'a', name: 'Khách A', empId: 'sales-a' },
      { id: 'b', name: 'Khách B', empId: 'sales-b' },
      { id: 'c', name: 'Khách C', empId: 'driver' },
    ],
    orders: [
      { id: 'o1', date: '2026-09-26', customerId: 'a', amount: 100 },
      { id: 'o2', date: '2026-09-24', customerId: 'b', amount: 300 },
      { id: 'o3', date: '2026-09-04', customerId: 'a', amount: 200 },
      { id: 'o4', date: '2026-07-11', customerId: 'b', amount: 400 },
      { id: 'o5', date: '2026-09-26', customerId: 'c', amount: 500 },
    ],
  });
  const { business, finance } = snapshot;
  assert.deepEqual(getTopSalesEmployees(business, finance, 'today').map(row => [row.name, row.revenue]), [['Lan', 100]]);
  assert.deepEqual(getTopSalesEmployees(business, finance, 'week').map(row => [row.name, row.revenue]), [['Minh', 300], ['Lan', 100]]);
  assert.deepEqual(getTopSalesEmployees(business, finance, 'month').map(row => [row.name, row.revenue]), [['Lan', 300], ['Minh', 300]]);
  assert.deepEqual(getTopSalesEmployees(business, finance, 'quarter').map(row => [row.name, row.revenue]), [['Minh', 700], ['Lan', 300]]);
});
