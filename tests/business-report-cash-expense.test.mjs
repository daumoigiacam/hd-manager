import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildExecutiveDashboardSnapshot } from '../src/services/executiveDashboardService.js';
import { getCashExpenseFinance, getReportPeriod, aggregateReportRows, getPayrollPeriodSummary, getOperatingExpenseItems } from '../src/features/business-report/reportViewModel.js';
import { appFunction, appObject } from './helpers/app-source-function.mjs';

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
  const sets=name=>new Set(appObject(name).arguments[0].elements.map(n=>n.value));
  const approvals=Object.fromEntries(appObject('CASHFLOW_APPROVAL_STATUS').properties.map(n=>[n.key.name,n.value.value]));
  const requiresCashflowApproval=appFunction('requiresCashflowApproval',{CASHFLOW_APPROVAL_STATUS:approvals});
  const isUnconfirmedPaymentIntent=appFunction('isUnconfirmedPaymentIntent',{PAYMENT_INTENT_SOURCE_TYPES:sets('PAYMENT_INTENT_SOURCE_TYPES'),UNCONFIRMED_PAYMENT_STATUSES:sets('UNCONFIRMED_PAYMENT_STATUSES')});
  const isCashflowOfficial=appFunction('isCashflowOfficial',{requiresCashflowApproval,isUnconfirmedPaymentIntent,CASHFLOW_APPROVAL_STATUS:approvals});
  const getDateKeyFromAnyValue=appFunction('getDateKeyFromAnyValue',{toDateInputString:appFunction('toDateInputString'),parseVietnameseDateTimeString:appFunction('parseVietnameseDateTimeString')});
  const resolveCashflowDateKey=appFunction('resolveCashflowDateKey',{getDateKeyFromAnyValue,isPayosPaymentRecord:appFunction('isPayosPaymentRecord')});
  const expenses=Object.freeze([
    Object.freeze({id:'approved',amount:100,date:'2026-10-12',cashflowDate:'2026-10-24',requiresApproval:true,approvalStatus:'approved'}),
    Object.freeze({id:'pending',amount:999,date:'2026-10-24',approvalStatus:'pending_handover'}),
    Object.freeze({id:'intent',amount:999,date:'2026-10-24',isPaymentIntent:true}),
    Object.freeze({id:'ordinary',amount:200,date:'2026-10-12',paymentDate:'2026-10-23'}),
  ]);
  const dashboardCache={},dashboardDayKey='2026-10-24',getCachedDashboardValue=appFunction('getCachedDashboardValue');
  const prepare=values=>appFunction('cashExpenseRecords',{expenses:values,isCashflowOfficial,resolveCashflowDateKey,dashboardCache,dashboardDayKey,getCachedDashboardValue},{memoCallback:true,scope:'FullExecutiveDashboardView'})();
  const prepared=prepare(expenses);assert.equal(prepare(expenses),prepared,'reopening Home reuses the normalized rows when vouchers and day are unchanged');
  const refreshed=prepare([...expenses]);assert.notEqual(refreshed,prepared);assert.deepEqual(refreshed,prepared,'source identity invalidates cache without changing accounting values');
  assert.deepEqual(prepared.map(r=>[r.id,r.amount,r.date]),[['approved',100,'2026-10-24'],['ordinary',200,'2026-10-23']]);
  assert.equal(expenses[0].date,'2026-10-12','date normalization cannot mutate cash vouchers');
  const properties=appObject('projectionInputs').arguments[0].body.properties;
  const bindings=Object.fromEntries(properties.filter(p=>p.value?.type==='Identifier').map(p=>[p.value.name,[]]));bindings.cashExpenseRecords=prepared;bindings.lockedPayroll={};bindings.dashboardCache=dashboardCache;bindings.getCachedDashboardValue=getCachedDashboardValue;
  assert.equal(appFunction('projectionInputs',bindings,{memoCallback:true})().cashExpenseRecords,prepared,'the report receives the exact normalized approved rows');
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
