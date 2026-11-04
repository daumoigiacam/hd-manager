import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as dashboard from '../src/services/executiveDashboardService.js';
import { getCashExpenseFinance, getReportPeriod, getPayrollPeriodSummary } from '../src/features/business-report/reportViewModel.js';
import { runCooperativeReportProjection } from '../src/services/cooperativeReportProjection.js';

function fixture() {
  const cashExpenseRecords = [
    { id: 'purchase', date: '2026-10-24', amount: 1000, category: 'Chi mua hàng', sourceWarehouseImportId: 'import' },
    { id: 'fuel', date: '2026-10-24', amount: 120, category: 'Xăng dầu', note: 'Receipt', payee: 'Driver' },
    { id: 'salary', date: '2026-10-24', amount: 700, category: 'Lương', employeeId: 'e' },
    { id: 'advance', date: '2026-10-24', amount: 50, category: 'Tạm ứng lương' },
    { id: 'yesterday', date: '2026-10-23', amount: 80, category: 'Điện nước' },
    { id: 'month-start', date: '2026-10-01', amount: 30 },
    { id: 'previous-month', date: '2026-09-30', amount: 40 },
    { id: 'year-start', date: '2026-01-01', amount: 60 },
    { id: 'future-day', date: '2026-10-31', amount: 200 },
    { id: 'future-month', date: '2026-12-31', amount: 300 },
    { id: 'archived', date: '2026-10-24', amount: 99999, isArchived: true },
    { id: 'debt-repayment', date: '2026-10-24', amount: 900, sourceType: 'customer_debt_repayment' },
  ];
  return {
    now: '2026-10-24T12:00:00', company: { id: 'tenant' },
    employees: [{ id: 'e', name: 'Lan', department: 'sales', basicSalary: 1000 }],
    customers: [{ id: 'c', name: 'Customer', currentDebt: 99999 }],
    products: [{ id: 'p', name: 'Product', unit: 'Kg' }],
    orders: [
      { id: 'today', date: '2026-10-24', customerId: 'c', totalAmount: 2500, paidAmount: 200, dueDate: '2026-10-20', items: [{ productId: 'p', quantity: 5, price: 500, costPrice: 100 }] },
      { id: 'yesterday', date: '2026-10-23', total: 1200 },
      { id: 'week', date: '2026-10-20', amount: 800 },
      { id: 'month', date: '2026-10-01', items: [{ quantity: 2, unitPrice: 200 }] },
      { id: 'previous', date: '2026-09-30', amount: 600 },
      { id: 'year', date: '2026-01-01', amount: 700 },
      { id: 'old', date: '2025-12-31', amount: 900 },
      { id: 'cancelled', date: '2026-10-24', amount: 99999, status: 'cancelled' },
      { id: 'archived', date: '2026-10-24', amount: 99999, archived: true },
    ],
    expenses: cashExpenseRecords, cashExpenseRecords,
    payments: [{ id: 'receipt', date: '2026-10-24', amount: 200 }],
    payrollCosts: [
      { date: '2026-10-24', employeeId: 'e', amount: 901 },
      { date: '2026-10-23', employeeId: 'e', amount: 101 },
      { date: '2026-10-01', employeeId: 'e', amount: 200 },
      { date: '2026-09-30', staffId: 'e', total: 300 },
      { date: '2026-01-01', employeeId: 'e', employeeName: 'Snapshot name', amount: 400 },
      { date: '2026-10-25', employeeId: 'e', amount: 99999 },
      { date: '2026-10-24', employeeId: 'e', amount: -10 },
      { date: '2026-10-24', employeeId: 'e', amount: 99999, isArchived: true },
    ],
    debtLedger: [{ id: 'c', debt: 321 }, { id: 'credit', debt: -80 }],
    warehouseImports: [{ id: 'import', date: '2026-09-01', productId: 'p', quantity: 100, amount: 10000 }],
    warehouseDispatches: [{ date: '2026-10-24', productId: 'p', quantity: 5 }],
    warehouseStockCounts: [{ quantity: 95 }], assets: [{ id: 'asset', status: 'active' }],
    orderRequests: [{ id: 'request', date: '2026-10-24' }],
  };
}

function digest(snapshot) {
  const { generatedAt, ...stable } = snapshot;
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

test('full builder retains its pre-extraction complete contract', () => {
  // Captured from the original service before extracting the two shared helpers.
  // Only the wall-clock publication timestamp is excluded from this comparison.
  assert.equal(digest(dashboard.buildExecutiveDashboardSnapshot(fixture())), '20b61920210c3441baea2a2fe5ce047fc28bb3d1ced3560a10f66975ee61e7bf');
  assert.equal(digest(dashboard.buildExecutiveDashboardSnapshot({ now: '2026-10-24T12:00:00' })), 'db9a7a5b6d5d84f10aa7c40fb689b9c841fd575692382554e06ac9b33745aa4d');
});

const chartValues = rows => rows.map(({ date, month, revenue, expense, profit }) => ({ date, month, revenue, expense, profit }));
function visibleReport(finance, period, range) {
  const report = getReportPeriod(finance, period, range);
  return { ...report, rows: chartValues(report.rows), chartRows: chartValues(report.chartRows) };
}
function primaryInput(input) {
  const { warehouseDispatches, warehouseStockCounts, assets, orderRequests, products, ...primary } = input;
  return primary;
}

for (const period of ['today', 'week', 'month', 'quarter', 'year', 'custom']) {
  test(`primary four KPIs and chart match full builder: ${period}`, () => {
    const input = fixture();
    const full = getCashExpenseFinance(dashboard.buildExecutiveDashboardSnapshot(input).finance);
    const primary = dashboard.buildHomePrimaryProjection(primaryInput(input));
    const finance = getCashExpenseFinance(primary.finance);
    const range = { start: '2026-10-01', end: '2026-10-24' };
    assert.equal(primary.kind, 'home-primary-v1');
    assert.deepEqual(visibleReport(finance, period, range), visibleReport(full, period, range));
    assert.deepEqual(getPayrollPeriodSummary(finance, getReportPeriod(finance, period, range)),
      getPayrollPeriodSummary(full, getReportPeriod(full, period, range)));
    for (const key of ['series7Days', 'series30Days', 'series12Months']) assert.deepEqual(chartValues(finance[key]), chartValues(full[key]));
    assert.deepEqual(primary.finance.cashExpenseRows, full.cashExpenseRows);
    assert.deepEqual(primary.finance.payrollAccrualRows, full.payrollAccrualRows);
  });
}

test('future vouchers and payroll/payment overlap retain exact totals and row metadata', () => {
  const primary = dashboard.buildHomePrimaryProjection(primaryInput(fixture()));
  const finance = getCashExpenseFinance(primary.finance);
  assert.equal(getReportPeriod(finance, 'today').expense, 2021);
  assert.equal(getReportPeriod(finance, 'month').expense, 2632);
  assert.equal(getReportPeriod(finance, 'quarter').expense, 2932);
  assert.equal(getReportPeriod(finance, 'year').expense, 3732);
  assert.equal(getReportPeriod(finance, 'month').previous.expense, 340);
  assert.equal(finance.receivables, 321);
  assert.equal(finance.series30Days.find(row => row.date === '2026-10-31').expense, 200);
  assert.equal(finance.series12Months.find(row => row.month === '2026-12').expense, 300);
  assert.equal(finance.cashExpenseRows.find(row => row.sourceId === 'salary').value, 700);
  assert.equal(finance.payrollAccrualRows.find(row => row.date === '2026-10-24').value, 901);
  assert.deepEqual(finance.payrollAccrualRows.find(row => row.date === '2026-01-01'), {
    date: '2026-01-01', employeeId: 'e', name: 'Snapshot name', department: 'Kinh doanh', value: 400,
  });
});

test('confirmed empty sources are real zeros and primary never claims secondary analytics', () => {
  const input = { now: '2026-10-24T12:00:00', cashExpenseRecords: [], payrollCosts: [], debtLedger: [] };
  const primary = dashboard.buildHomePrimaryProjection(input);
  assert.deepEqual(Object.keys(primary).sort(), ['finance', 'generatedAt', 'kind']);
  const finance = getCashExpenseFinance(primary.finance);
  const full = getCashExpenseFinance(dashboard.buildExecutiveDashboardSnapshot(input).finance);
  for (const period of ['today', 'week', 'month', 'quarter', 'year', 'custom']) {
    const range = { start: '2026-10-01', end: '2026-10-24' };
    assert.deepEqual(visibleReport(finance, period, range), visibleReport(full, period, range));
    for (const field of ['revenue', 'profit', 'expense', 'receivables']) assert.equal(getReportPeriod(finance, period, range)[field], 0);
  }
  for (const key of ['costOfGoodsToday', 'operatingExpenseToday', 'profitToday', 'expenseToday', 'cashBalance']) assert.equal(Object.hasOwn(primary.finance, key), false, key);
});

test('primary requires explicit completed voucher/payroll/debt inputs', () => {
  for (const key of ['cashExpenseRecords', 'payrollCosts', 'debtLedger']) {
    const input = { cashExpenseRecords: [], payrollCosts: [], debtLedger: [] };
    delete input[key];
    assert.throws(() => dashboard.buildHomePrimaryProjection(input), new RegExp(key));
  }
});

test('primary does not read P2/P3 inputs or mutate frozen source records', () => {
  const input = primaryInput(fixture());
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  freeze(input);
  const guarded = { ...input };
  for (const key of ['products', 'warehouseDispatches', 'warehouseStockCounts', 'assets', 'assetCostLogs', 'orderRequests', 'advances']) {
    Object.defineProperty(guarded, key, { get() { throw Error(`P2/P3 accessed: ${key}`); } });
  }
  const result = dashboard.buildHomePrimaryProjection(guarded);
  assert.equal(getReportPeriod(getCashExpenseFinance(result.finance), 'today').revenue, 2500);
});

test('cooperative primary returns only completed results and matches synchronous primary', async () => {
  assert.equal(dashboard.createHomePrimarySnapshotIterator, dashboard.createHomePrimaryProjectionIterator);
  const input = primaryInput(fixture());
  let clock = 0, yields = 0;
  const actual = await runCooperativeReportProjection(dashboard.createHomePrimarySnapshotIterator(input), {
    budgetMs: 1, now: () => clock++, yieldWork: async () => { yields++; },
  });
  const expected = dashboard.buildHomePrimaryProjection(input);
  assert.equal(digest(actual), digest(expected));
  assert.ok(yields > 0);
  let current = true;
  await assert.rejects(runCooperativeReportProjection(dashboard.createHomePrimaryProjectionIterator(input), {
    isCurrent: () => current, budgetMs: 1, now: () => clock++, yieldWork: async () => { current = false; },
  }), { name: 'AbortError' });
});

for (const day of ['2026-01-01', '2024-02-29', '2026-12-31']) {
  test(`calendar boundary parity for every period: ${day}`, () => {
    const input = fixture();
    input.now = `${day}T12:00:00`;
    input.orders.push({ id: 'boundary-order', date: day, amount: 1777 });
    input.payrollCosts.push({ date: day, employeeId: 'e', amount: 13 });
    input.cashExpenseRecords.push({ id: 'boundary-voucher', date: day, amount: 17 });
    const full = getCashExpenseFinance(dashboard.buildExecutiveDashboardSnapshot(input).finance);
    const finance = getCashExpenseFinance(dashboard.buildHomePrimaryProjection(primaryInput(input)).finance);
    for (const period of ['today', 'week', 'month', 'quarter', 'year', 'custom']) {
      const range = { start: `${day.slice(0, 7)}-01`, end: day };
      assert.deepEqual(visibleReport(finance, period, range), visibleReport(full, period, range), period);
    }
  });
}

test('frozen billing, collection maps and new source revisions keep exact revenue and debt', () => {
  const input = {
    now: '2026-10-24T12:00:00',
    orders: { frozen: { date: '2026-10-24', items: [{
      productId: 'p', quantity: 7, actualUnit: 'Con', billingUnit: 'Kg',
      billingQuantity: 20, unitPrice: 60000, billingSnapshotVersion: 1,
    }] } },
    payrollCosts: { daily: { date: '2026-10-24', staffId: 'e', total: '123' } },
    employees: { e: { id: 'e', fullName: 'Full name', position: 'driver' } },
    debtLedger: { current: { debt: 42 }, credit: { debt: -10 } },
    cashExpenseRecords: [],
  };
  const full = getCashExpenseFinance(dashboard.buildExecutiveDashboardSnapshot(input).finance);
  const first = dashboard.buildHomePrimaryProjection(input);
  assert.equal(first.finance.revenueToday, 1200000, 'billing uses 20 Kg rather than 7 Con');
  assert.deepEqual(visibleReport(getCashExpenseFinance(first.finance), 'today'), visibleReport(full, 'today'));
  input.orders.frozen.items[0].unitPrice = 70000;
  input.debtLedger.current.debt = 73;
  const next = dashboard.buildHomePrimaryProjection(input);
  assert.equal(next.finance.revenueToday, 1400000);
  assert.equal(next.finance.receivables, 73);
  assert.equal(first.finance.revenueToday, 1200000, 'a completed DTO stays detached from source edits');
});

test('interleaved primary iterators retain separate calculation caches', () => {
  const leftInput = primaryInput(fixture());
  const rightInput = primaryInput(fixture());
  rightInput.orders[0].totalAmount = 71;
  rightInput.debtLedger[0].debt = 19;
  const left = dashboard.createHomePrimaryProjectionIterator(leftInput);
  const right = dashboard.createHomePrimaryProjectionIterator(rightInput);
  let a = left.next(), b = right.next();
  while (!a.done || !b.done) {
    if (!a.done) a = left.next();
    if (!b.done) b = right.next();
  }
  assert.equal(a.value.finance.revenueToday, 2500);
  assert.equal(b.value.finance.revenueToday, 71);
  assert.equal(a.value.finance.receivables, 321);
  assert.equal(b.value.finance.receivables, 19);
});
