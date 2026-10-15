import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changeExpenseCategory, isFuelExpenseCategory, searchExpenseCategories } from '../src/features/assets/expenseCategory.js';

test('only fuel categories expose vehicle selection', () => {
  for (const label of ['Chi xăng dầu', 'Đổ xăng/dầu', 'chi xang dau', 'Nhiên liệu']) assert.equal(isFuelExpenseCategory(label), true, label);
  for (const label of ['', 'Chi mua hàng hóa', 'Chi phí khác', 'Sửa xe', 'Chi dầu ăn']) assert.equal(isFuelExpenseCategory(label), false, label);
});
test('changing away from fuel clears stale asset association', () => {
  const previous = { category: 'Chi xăng dầu', assetId: 'truck1', amount: 100 };
  assert.equal(changeExpenseCategory(previous, 'Chi phí khác').assetId, '');
  assert.equal(changeExpenseCategory(previous, 'Đổ xăng/dầu').assetId, 'truck1');
  assert.equal(previous.assetId, 'truck1');
});
test('category search supports accents, exact ranking and bounded results', () => {
  const choices = ['Chi xăng dầu', 'Xăng dầu', 'Chi mua hàng hóa'];
  assert.deepEqual(searchExpenseCategories(choices, 'xang dau'), ['Xăng dầu', 'Chi xăng dầu']);
  assert.deepEqual(searchExpenseCategories(choices, ''), choices);
  assert.deepEqual(searchExpenseCategories(choices, 'Khác mới'), []);
  assert.equal(searchExpenseCategories(Array.from({ length: 1000 }, (_, i) => `Chi ${i}`), '').length, 30);
});
