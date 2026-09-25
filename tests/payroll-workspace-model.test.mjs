import assert from 'node:assert/strict';
import {
  getPayrollCarryoverRows, getPayrollEmployeeState, getPayrollMonthRange, shiftPayrollMonth,
  summarizePayrollWorkspace
} from '../src/features/payroll/payrollWorkspaceModel.js';

assert.deepEqual(getPayrollMonthRange('2026-09'), {
  label: 'Tháng 9, 2026', firstLabel: '01/09/2026', lastLabel: '30/09/2026'
});
assert.equal(shiftPayrollMonth('2026-12', 1), '2027-01');
assert.equal(shiftPayrollMonth('2026-01', -1), '2025-12');

const rows = [
  { emp: { id: 'a' }, details: { workDays: 22, baseSalaryCalc: 7_000_000, supportSalary: 500_000, responsibilitySalary: 100_000, totalBonus: 200_000, evaluationBonus: 100_000, totalPenalty: 50_000, netSalary: 7_850_000, endingDebt: 0 } },
  { emp: { id: 'b' }, details: { workDays: 20, baseSalaryCalc: 5_000_000, totalAdvance: 7_000_000, netSalary: 0, endingDebt: 2_000_000 } },
  { emp: { id: 'c' }, details: { workDays: 0, netSalary: 0, endingDebt: 0 }, snapshotNeedsReview: true }
];
const summary = summarizePayrollWorkspace(rows);
assert.equal(summary.employeeCount, 3);
assert.equal(summary.workDays, 42);
assert.equal(summary.baseSalary, 12_000_000);
assert.equal(summary.allowances, 600_000);
assert.equal(summary.bonus, 300_000);
assert.equal(summary.penalty, 50_000);
assert.equal(summary.payable, rows.reduce((sum, row) => sum + row.details.netSalary, 0));
assert.equal(summary.carryForward, 2_000_000);
assert.deepEqual([summary.readyCount, summary.carryCount, summary.reviewCount], [1, 1, 1]);
assert.equal(getPayrollEmployeeState(rows[1]), 'carry');
assert.equal(getPayrollEmployeeState(rows[2]), 'review');

const preview = getPayrollCarryoverRows({ rows, companyId: 'company-a', monthKey: '2026-09' });
assert.equal(preview.length, 1);
assert.equal(preview[0].amount, 2_000_000);
assert.equal(preview[0].targetMonthKey, '2026-10');
assert.equal(preview[0].status, 'pending_close');

const persisted = getPayrollCarryoverRows({
  rows, companyId: 'company-a', monthKey: '2026-09', isLocked: true,
  employees: [{ id: 'b', companyId: 'company-a', name: 'Nhân viên B' }],
  carryovers: [
    { id: 'a', employeeId: 'b', companyId: 'company-a', sourceMonthKey: '2026-09', targetMonthKey: '2026-10', amount: 2_000_000, status: 'carried_over' },
    { id: 'other', employeeId: 'b', companyId: 'company-b', sourceMonthKey: '2026-09', targetMonthKey: '2026-10', amount: 3_000_000 }
  ]
});
assert.equal(persisted.length, 1);
assert.equal(persisted[0].employeeName, 'Nhân viên B');
assert.equal(persisted[0].status, 'open');

console.log('Payroll workspace model PASS');
