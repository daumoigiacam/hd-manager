import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectAssetExpenses } from '../src/features/assets/assetExpenseProjection.js';

const expense = { id: 'e1', companyId: 'c1', assetId: 'truck1', amount: 500000, category: 'Đổ xăng/dầu', date: '2026-10-15' };
const confirmed = row => !['pending', 'rejected'].includes(row.approvalStatus);
const run = (logs, expenses) => projectAssetExpenses(logs, expenses, 'c1', confirmed);

test('finance expense projects to the selected asset without creating a second transaction', () => {
  const input = structuredClone(expense);
  const rows = run([], [input]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].assetId, 'truck1');
  assert.equal(rows[0].type, 'fuel');
  assert.equal(rows[0].expenseId, 'e1');
  assert.equal(rows[0].financeProjection, true);
  assert.deepEqual(input, expense);
});
test('linked cost uses authoritative finance values once, including vehicle changes', () => {
  const logs = [{ id: 'l1', companyId: 'c1', expenseId: 'e1', assetId: 'truck1', amount: 1, liters: 20 }];
  const rows = run(logs, [{ ...expense, assetId: 'truck2', amount: 600000 }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].assetId, 'truck2');
  assert.equal(rows[0].amount, 600000);
  assert.equal(rows[0].liters, 20);
  assert.equal(rows[0].financeProjection, false);
  for (const patch of [{ isArchived: true }, { approvalStatus: 'pending' }, { approvalStatus: 'rejected' }, { assetId: '' }]) {
    assert.deepEqual(run(logs, [{ ...expense, ...patch }]), []);
  }
});
test('reverse links deduplicate; unrelated tenants and unassigned expenses are excluded', () => {
  const log = { id: 'l1', companyId: 'c1', assetId: 'truck1', amount: 1 };
  assert.equal(run([log], [{ ...expense, relatedAssetCostLogId: 'l1' }]).length, 1);
  assert.deepEqual(run([], [{ ...expense, companyId: 'c2' }, { ...expense, assetId: '' }]), []);
  assert.deepEqual(run([log], []), [log]);
  assert.equal(run([], [{ ...expense, assetId: undefined, vehicleId: 'truck3' }])[0].assetId, 'truck3');
});
