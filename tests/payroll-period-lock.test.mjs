import assert from 'node:assert/strict';

import {
  buildPayrollPeriodId,
  buildPayrollSnapshotId,
  canLockPayrollPeriodAtDate,
  createPayrollEmployeeSnapshot,
  createPayrollPeriodRecord,
  getLockedPayrollPeriod,
  getPayrollMonthEndDateKey,
  mapPayrollSnapshotsToRows,
  normalizePayrollMonthKey
} from '../src/utils/payrollPeriodLock.js';

const test = (name, callback) => {
  callback();
  console.log(`PASS ${name}`);
};

const companyId = 'company-01';
const monthKey = '2026-08';
const lockedAt = '2026-08-31T16:59:59.000Z';
const employee = {
  id: 'employee-01',
  name: 'Nguyen Van A',
  phone: '0900000001',
  position: 'San xuat',
  basicSalary: 12_000_000,
  payrollPolicies: [{
    id: 'policy-v1',
    version: 'v1',
    formulaVersion: 'HD_PAYROLL_FORMULA_V1',
    effectiveFrom: '2026-01-01',
    values: { position: 'San xuat', basicSalary: 12_000_000 }
  }]
};
const salaryDetails = {
  monthKey,
  totalWorkDays: 27,
  basicSalary: 10_451_613,
  evaluationBonus: 100_000,
  grossSalary: 10_551_613,
  totalAdvance: 1_000_000,
  netSalary: 9_551_613,
  endingDebt: 0
};

test('normalizes only valid payroll month keys', () => {
  assert.equal(normalizePayrollMonthKey('2026-08'), '2026-08');
  assert.equal(normalizePayrollMonthKey('2026-13'), '');
  assert.equal(normalizePayrollMonthKey('08/2026'), '');
});

test('calculates the final calendar day for regular months', () => {
  assert.equal(getPayrollMonthEndDateKey('2026-08'), '2026-08-31');
  assert.equal(getPayrollMonthEndDateKey('2026-04'), '2026-04-30');
});

test('calculates leap-year February correctly', () => {
  assert.equal(getPayrollMonthEndDateKey('2028-02'), '2028-02-29');
  assert.equal(getPayrollMonthEndDateKey('2027-02'), '2027-02-28');
});

test('does not allow locking before the final day', () => {
  assert.equal(canLockPayrollPeriodAtDate('2026-08', '2026-08-30'), false);
});

test('allows locking on the final day and later dates', () => {
  assert.equal(canLockPayrollPeriodAtDate('2026-08', '2026-08-31'), true);
  assert.equal(canLockPayrollPeriodAtDate('2026-08', '2026-09-01'), true);
});

test('uses deterministic IDs to prevent duplicate periods and employee snapshots', () => {
  assert.equal(buildPayrollPeriodId(companyId, monthKey), 'payroll_company-01_2026-08');
  assert.equal(buildPayrollSnapshotId(companyId, monthKey, employee.id), 'payroll_company-01_2026-08_employee-01');
  assert.notEqual(buildPayrollPeriodId('company-02', monthKey), buildPayrollPeriodId(companyId, monthKey));
});

test('creates a detached immutable salary snapshot payload', () => {
  const sourceEmployee = structuredClone(employee);
  const sourceSalary = structuredClone(salaryDetails);
  const snapshot = createPayrollEmployeeSnapshot({
    companyId,
    monthKey,
    employee: sourceEmployee,
    salaryDetails: sourceSalary,
    lockedAt,
    lockedByEmployeeId: 'owner-01'
  });

  sourceEmployee.name = 'Changed later';
  sourceSalary.netSalary = 1;

  assert.equal(snapshot.employee.name, employee.name);
  assert.equal(snapshot.salaryDetails.netSalary, salaryDetails.netSalary);
  assert.equal(snapshot.periodId, buildPayrollPeriodId(companyId, monthKey));
});

test('stores final totals and snapshot count in locked-period metadata', () => {
  const snapshot = createPayrollEmployeeSnapshot({ companyId, monthKey, employee, salaryDetails, lockedAt });
  const period = createPayrollPeriodRecord({
    companyId,
    monthKey,
    snapshots: [snapshot],
    totals: { totalSalary: salaryDetails.netSalary, totalDays: salaryDetails.totalWorkDays },
    lockedAt,
    lockedByEmployeeId: 'owner-01',
    lockedByName: 'Owner'
  });

  assert.equal(period.status, 'LOCKED');
  assert.equal(period.employeeCount, 1);
  assert.equal(period.totals.totalSalary, salaryDetails.netSalary);
  assert.deepEqual(period.snapshotIds, [snapshot.id]);
});

test('finds only the active locked period for the matching company and month', () => {
  const matching = { id: 'matching', companyId, monthKey, status: 'locked', isArchived: false };
  const periods = [
    { ...matching, id: 'archived', isArchived: true },
    { ...matching, id: 'other-company', companyId: 'company-02' },
    { ...matching, id: 'draft', status: 'draft' },
    matching
  ];
  assert.equal(getLockedPayrollPeriod(periods, companyId, monthKey)?.id, 'matching');
});

test('maps snapshots in saved order and can restrict rows to the signed-in employee', () => {
  const employeeB = { ...employee, id: 'employee-02', name: 'Nguyen Van B' };
  const snapshotA = createPayrollEmployeeSnapshot({ companyId, monthKey, employee, salaryDetails, orderIndex: 1, lockedAt });
  const snapshotB = createPayrollEmployeeSnapshot({ companyId, monthKey, employee: employeeB, salaryDetails, orderIndex: 0, lockedAt });

  assert.deepEqual(mapPayrollSnapshotsToRows([snapshotA, snapshotB]).map(row => row.emp.id), ['employee-02', 'employee-01']);
  assert.deepEqual(mapPayrollSnapshotsToRows([snapshotA, snapshotB], new Set(['employee-01'])).map(row => row.emp.id), ['employee-01']);
});

test('locked payroll stays fixed when live salary data changes later', () => {
  const liveSalary = structuredClone(salaryDetails);
  const snapshot = createPayrollEmployeeSnapshot({ companyId, monthKey, employee, salaryDetails: liveSalary, lockedAt });
  liveSalary.evaluationBonus = 500_000;
  liveSalary.netSalary += 400_000;

  const [lockedRow] = mapPayrollSnapshotsToRows([snapshot]);
  assert.equal(lockedRow.details.evaluationBonus, 100_000);
  assert.equal(lockedRow.details.netSalary, 9_551_613);
});

console.log('\nPayroll period lock: 11/11 cases PASS');
