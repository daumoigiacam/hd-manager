import assert from 'node:assert/strict';

import {
  applyPayrollOpeningDebtToSalaryDetails,
  buildPayrollDebtCarryoverId,
  createPayrollDebtCarryover,
  createPayrollDebtCarryovers,
  createPayrollPeriodLockJournalEntry,
  getEmployeePayrollOpeningDebt,
  getNextPayrollMonthKey,
  getPreviousPayrollMonthKey
} from '../src/utils/payrollDebtCarryover.js';

const test = (name, callback) => {
  callback();
  console.log(`PASS ${name}`);
};

const baseSalary = { grossSalary: 15_000_000, deductionTotal: 0, netSalary: 15_000_000 };

test('moves across year boundaries with calendar-correct month keys', () => {
  assert.equal(getNextPayrollMonthKey('2026-12'), '2027-01');
  assert.equal(getPreviousPayrollMonthKey('2027-01'), '2026-12');
});

test('uses one deterministic carryover document for company, employee, and target month', () => {
  assert.equal(
    buildPayrollDebtCarryoverId('company-01', '2026-08', 'employee-01'),
    'payroll_debt_company-01_2026-08_employee-01'
  );
});

test('keeps full net salary when there is no opening debt', () => {
  const result = applyPayrollOpeningDebtToSalaryDetails(baseSalary, 0);
  assert.equal(result.netSalary, 15_000_000);
  assert.equal(result.endingDebt, 0);
  assert.equal(result.openingDebtApplied, 0);
});

test('deducts a smaller opening debt from the current payable salary', () => {
  const result = applyPayrollOpeningDebtToSalaryDetails(baseSalary, 10_000_000);
  assert.equal(result.netSalary, 5_000_000);
  assert.equal(result.openingDebtApplied, 10_000_000);
  assert.equal(result.endingDebt, 0);
  assert.equal(result.deductionTotal, 10_000_000);
});

test('carries the unpaid portion forward when opening debt is greater than salary', () => {
  const result = applyPayrollOpeningDebtToSalaryDetails({ ...baseSalary, grossSalary: 6_000_000, netSalary: 6_000_000 }, 10_000_000);
  assert.equal(result.netSalary, 0);
  assert.equal(result.openingDebtApplied, 6_000_000);
  assert.equal(result.endingDebt, 4_000_000);
});

test('carries debt across consecutive payroll months without changing the locked source snapshot', () => {
  const julyLockedDetails = { grossSalary: 8_000_000, deductionTotal: 18_000_000, netSalary: -10_000_000 };
  const julySnapshotBeforeCarryover = { ...julyLockedDetails };
  const augustOpening = createPayrollDebtCarryover({
    companyId: 'company-01',
    sourceMonthKey: '2026-07',
    employeeId: 'employee-01',
    sourceSnapshotId: 'snapshot-2026-07',
    salaryDetails: applyPayrollOpeningDebtToSalaryDetails(julyLockedDetails, 0)
  });
  const augustDetails = applyPayrollOpeningDebtToSalaryDetails(
    { grossSalary: 6_000_000, deductionTotal: 0, netSalary: 6_000_000 },
    augustOpening.amount
  );
  const septemberOpening = createPayrollDebtCarryover({
    companyId: 'company-01',
    sourceMonthKey: '2026-08',
    employeeId: 'employee-01',
    sourceSnapshotId: 'snapshot-2026-08',
    salaryDetails: augustDetails
  });

  assert.equal(augustOpening.amount, 10_000_000);
  assert.equal(augustDetails.netSalary, 0);
  assert.equal(augustDetails.endingDebt, 4_000_000);
  assert.equal(septemberOpening.targetMonthKey, '2026-09');
  assert.equal(septemberOpening.amount, 4_000_000);
  assert.deepEqual(julyLockedDetails, julySnapshotBeforeCarryover);
});

test('adds a current-period shortfall to the carried debt without paying a negative wage', () => {
  const result = applyPayrollOpeningDebtToSalaryDetails({ grossSalary: 3_000_000, deductionTotal: 5_000_000, netSalary: -2_000_000 }, 4_000_000);
  assert.equal(result.netSalary, 0);
  assert.equal(result.openingDebtApplied, 0);
  assert.equal(result.currentPeriodDebt, 2_000_000);
  assert.equal(result.endingDebt, 6_000_000);
});

test('creates no carryover record when the employee has no ending debt', () => {
  const carryover = createPayrollDebtCarryover({
    companyId: 'company-01',
    sourceMonthKey: '2026-07',
    employeeId: 'employee-01',
    salaryDetails: { netSalary: 1_000_000 }
  });
  assert.equal(carryover, null);
});

test('creates an immutable carryover from a locked salary snapshot', () => {
  const carryover = createPayrollDebtCarryover({
    companyId: 'company-01',
    sourceMonthKey: '2026-07',
    employeeId: 'employee-01',
    sourceSnapshotId: 'snapshot-01',
    sourcePeriodId: 'period-01',
    salaryDetails: { endingDebt: 10_000_000 },
    transferredAt: '2026-07-31T16:59:59.000Z'
  });
  assert.equal(carryover.targetMonthKey, '2026-08');
  assert.equal(carryover.amount, 10_000_000);
  assert.equal(carryover.sourceSnapshotId, 'snapshot-01');
});

test('reads only the matching opening balance and ignores archived or unrelated records', () => {
  const amount = getEmployeePayrollOpeningDebt([
    { companyId: 'company-01', targetMonthKey: '2026-08', employeeId: 'employee-01', amount: 5_000_000, isArchived: true },
    { companyId: 'company-02', targetMonthKey: '2026-08', employeeId: 'employee-01', amount: 8_000_000 },
    { companyId: 'company-01', targetMonthKey: '2026-08', employeeId: 'employee-01', amount: 4_000_000 }
  ], 'company-01', '2026-08', 'employee-01');
  assert.equal(amount, 4_000_000);
});

test('creates one carryover and one journal record per indebted employee', () => {
  const rows = createPayrollDebtCarryovers({
    companyId: 'company-01',
    monthKey: '2026-07',
    lockedAt: '2026-07-31T16:59:59.000Z',
    employees: [{ id: 'employee-01', name: 'Nguyen Van A' }],
    snapshots: [{
      id: 'snapshot-01',
      periodId: 'period-01',
      employeeId: 'employee-01',
      salaryDetails: { endingDebt: 4_000_000 }
    }]
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].carryover.amount, 4_000_000);
  assert.match(rows[0].journalEntry.message, /4000000/);
});

test('creates one deterministic lock journal without modifying salary details', () => {
  const salaryDetails = { endingDebt: 4_000_000, netSalary: 0 };
  const entry = createPayrollPeriodLockJournalEntry({
    companyId: 'company-01',
    periodId: 'payroll_company-01_2026-07',
    monthKey: '2026-07',
    lockedAt: '2026-07-31T16:59:59.000Z',
    employeeCount: 1,
    totalEndingDebt: salaryDetails.endingDebt
  });
  assert.equal(entry.id, 'payroll_period_lock_payroll_company-01_2026-07');
  assert.equal(entry.amount, 4_000_000);
  assert.match(entry.message, /2026-07/);
  assert.deepEqual(salaryDetails, { endingDebt: 4_000_000, netSalary: 0 });
});

console.log('\nPayroll debt carryover: 12/12 cases PASS');
