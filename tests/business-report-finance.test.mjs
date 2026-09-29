import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExecutiveDashboardSnapshot } from '../src/services/executiveDashboardService.js';
import { aggregateReportRows, getReportPeriod, getTopSalesEmployees } from '../src/features/business-report/reportViewModel.js';

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
