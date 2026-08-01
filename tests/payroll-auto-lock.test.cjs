const assert = require('node:assert/strict');

const {
  buildPayrollDebtCarryoverId,
  createDebtRolloverArtifacts,
  createFinalPayrollSnapshot,
  getPayrollMonthEndDateKey,
  getVietnamClock,
  isPayrollAutoLockDue
} = require('../functions/payrollAutoLock.js');

const test = (name, callback) => {
  callback();
  console.log(`PASS ${name}`);
};

test('uses the correct final date for every payroll month', () => {
  assert.equal(getPayrollMonthEndDateKey('2026-02'), '2026-02-28');
  assert.equal(getPayrollMonthEndDateKey('2028-02'), '2028-02-29');
  assert.equal(getPayrollMonthEndDateKey('2026-12'), '2026-12-31');
});

test('does not auto-lock before 23:59 on the final Vietnam payroll day', () => {
  assert.equal(isPayrollAutoLockDue('2026-07', { dateKey: '2026-07-31', hour: 23, minute: 58, second: 59 }), false);
  assert.equal(isPayrollAutoLockDue('2026-07', { dateKey: '2026-07-31', hour: 23, minute: 59, second: 0 }), true);
  assert.equal(isPayrollAutoLockDue('2026-07', { dateKey: '2026-08-01', hour: 0, minute: 0, second: 0 }), true);
});

test('converts a staged snapshot to its final immutable snapshot id', () => {
  const stagedSnapshot = {
    id: 'payroll_auto_lock_company-01_2026-07_employee-01',
    snapshotId: 'payroll_snapshot_company-01_2026-07_employee-01',
    planId: 'payroll_auto_lock_company-01_2026-07',
    preparedAt: '2026-07-31T10:00:00.000Z',
    companyId: 'company-01',
    employeeId: 'employee-01',
    periodId: 'payroll_company-01_2026-07',
    monthKey: '2026-07',
    salaryDetails: { netSalary: 8_000_000 }
  };
  const finalSnapshot = createFinalPayrollSnapshot(stagedSnapshot, '2026-07-31T16:59:59.000Z');
  assert.equal(finalSnapshot.id, stagedSnapshot.snapshotId);
  assert.equal(finalSnapshot.lockedAt, '2026-07-31T16:59:59.000Z');
  assert.equal(finalSnapshot.preparedAt, undefined);
  assert.equal(stagedSnapshot.id, 'payroll_auto_lock_company-01_2026-07_employee-01');
});

test('creates no transfer data when the finalized payroll has no ending debt', () => {
  const artifacts = createDebtRolloverArtifacts({
    companyId: 'company-01',
    monthKey: '2026-07',
    snapshot: {
      id: 'snapshot-01',
      employeeId: 'employee-01',
      periodId: 'period-01',
      salaryDetails: { netSalary: 8_000_000 }
    },
    lockedAt: '2026-07-31T16:59:59.000Z'
  });
  assert.equal(artifacts, null);
});

test('creates deterministic transfer and journal records from a finalized debt', () => {
  const artifacts = createDebtRolloverArtifacts({
    companyId: 'company-01',
    monthKey: '2026-07',
    snapshot: {
      id: 'snapshot-01',
      employeeId: 'employee-01',
      periodId: 'period-01',
      employee: { name: 'Nguyen Van A' },
      salaryDetails: { endingDebt: 10_000_000 }
    },
    lockedAt: '2026-07-31T16:59:59.000Z'
  });
  assert.equal(artifacts.carryover.id, buildPayrollDebtCarryoverId('company-01', '2026-08', 'employee-01'));
  assert.equal(artifacts.carryover.amount, 10_000_000);
  assert.equal(artifacts.journalEntry.amount, 10_000_000);
  assert.match(artifacts.journalEntry.message, /2026-08/);
});

test('reads a Vietnam clock in a deployable timezone-safe format', () => {
  const clock = getVietnamClock('2026-07-31T16:59:59.000Z');
  assert.deepEqual(clock, { dateKey: '2026-07-31', hour: 23, minute: 59, second: 59 });
});

console.log('\nPayroll auto lock: 6/6 cases PASS');
