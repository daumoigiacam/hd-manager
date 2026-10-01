import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getNonPayrollExpenseItems, getExpenseSourceRows } from '../src/features/business-report/reportViewModel.js';

test('expense list excludes payroll before grouping, keeps all other items and period boundaries', () => {
  const report = { startDate: '2026-10-01', endDate: '2026-10-31' };
  const expenses = Array.from({ length: 35 }, (_, i) => ({ name: `Expense ${i}`, date: '2026-10-01', category: 'Other', value: 100 }));
  const rows = [...expenses,
    { name: 'Expense 0', date: '2026-10-01', sourceType: 'payroll', value: 500 },
    { name: 'Salary voucher', date: '2026-10-01', category: 'Lương', sourceType: 'expense', value: 300 },
    { name: 'Earlier', date: '2026-09-30', value: 200 },
  ];
  const before = structuredClone(rows);
  const result = getNonPayrollExpenseItems(rows, report);
  assert.equal(result.length, 35);
  assert.equal(result.reduce((sum, row) => sum + row.value, 0), 3500);
  assert.deepEqual(getExpenseSourceRows(rows, report, { name: 'Expense 0' }), [expenses[0]]);
  assert.deepEqual(rows, before);
});
