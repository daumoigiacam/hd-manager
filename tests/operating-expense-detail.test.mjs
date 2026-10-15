import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getOperatingExpenseItems, getExpenseSourceRows } from '../src/features/business-report/reportViewModel.js';

test('operating details include all kinds within period and exclude payroll and cost of goods', () => {
  const report = { startDate: '2026-10-01', endDate: '2026-10-31' };
  const row = { date: '2026-10-15', name: 'Xăng xe', category: 'Xăng dầu', value: 100 };
  const rows = [row, { ...row, value: 200 }, { ...row, category: 'Giá vốn', value: 900 },
    { ...row, category: 'Lương' }, { ...row, sourceType: 'payroll' }, { ...row, date: '2026-09-30' }];
  const items = getOperatingExpenseItems(rows, report);
  assert.equal(items.length, 1);
  assert.equal(items[0].value, 300);
  assert.equal(items[0].count, 2);
  assert.equal(getExpenseSourceRows(rows, report, items[0]).length, 2);
  const many = Array.from({ length: 65 }, (_, i) => ({ ...row, name: `Loại ${i}` }));
  assert.equal(getOperatingExpenseItems(many, report).length, 65);
  assert.deepEqual(getOperatingExpenseItems([], report), []);
});
