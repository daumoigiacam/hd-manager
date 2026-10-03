import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { isCustomerDebtRepayment } from '../src/utils/expenseClassification.js';
import { buildExecutiveDashboardSnapshot } from '../src/services/executiveDashboardService.js';

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('daily finance separates historical repayment from costs without removing cash records', () => {
  const officialTransactions = [
    { transactionType: 'expense', sourceType: 'warehouse_import_purchase', amount: 91140400 },
    { transactionType: 'expense', sourceType: 'customer_debt_repayment', amount: 81197409 },
    { transactionType: 'payment', amount: 55748300 },
  ];
  const start = source.indexOf('  const totalExpense = officialTransactions');
  const end = source.indexOf('\n', source.indexOf('  const debtRepaymentTotal =', start));
  assert.ok(start > 0 && end > start);
  const result = vm.runInNewContext(`${source.slice(start, end)}; ({ totalExpense, debtRepaymentTotal })`, { officialTransactions, isCustomerDebtRepayment });
  assert.equal(result.totalExpense, 91140400);
  assert.equal(result.debtRepaymentTotal, 81197409);
  assert.equal(55748300 - result.totalExpense, -35392100);
  assert.equal(officialTransactions.length, 3);
  assert.equal(isCustomerDebtRepayment({ category: 'Chi trả nợ khách hàng' }), false);
});

test('home direct costs exclude repayments and inventory purchases but retain ordinary expenses', () => {
  const start = source.indexOf('  const directExpense = Math.max(0, datedExpenses');
  const end = source.indexOf('  const payrollExpense =', start);
  assert.ok(start > 0 && end > start);
  const result = vm.runInNewContext(`${source.slice(start, end)}; directExpense`, {
    datedExpenses: [{ amount: 100, sourceType: 'warehouse_import_purchase' }, { amount: 80, sourceType: 'customer_debt_repayment' }, { amount: 20 }],
    isCustomerDebtRepayment,
    isInventoryPurchaseExpense: item => item.sourceType === 'warehouse_import_purchase',
  });
  assert.equal(result, 20);
});

test('executive costs and profit do not change on partial or full repayment; cash outflow does', () => {
  const baseline = { now: '2026-10-02T12:00:00', expenses: [{ id: 'cost', date: '2026-10-02', amount: 100 }] };
  for (const amount of [300, 1000]) {
    const { finance } = buildExecutiveDashboardSnapshot({ ...baseline, expenses: [...baseline.expenses,
      { id: 'repay', date: '2026-10-02', amount, sourceType: 'customer_debt_repayment' }] });
    assert.equal(finance.cashExpenseToday, 100 + amount);
    for (const period of ['Today', 'Week', 'Month', 'Quarter', 'Year']) assert.equal(finance[`expense${period}`], 100, period);
    assert.equal(finance.expenseDetailRows.some(row => row.sourceId === 'repay'), false);
  }
});
