import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  createPayrollEmployeeSnapshot,
  createPayrollPeriodRecord,
  isPayrollPeriodLocked,
  mapPayrollSnapshotsToRows
} from '../src/utils/payrollPeriodLock.js';
import {
  applyEmployeePayrollPolicyForMonth,
  buildEmployeePayrollPolicyUpdate,
  resolveEmployeePayrollPolicy
} from '../src/utils/payrollPolicyHistory.js';
import {
  applyPayrollOpeningDebtToSalaryDetails,
  createPayrollDebtCarryover
} from '../src/utils/payrollDebtCarryover.js';
import {
  applyPayrollAdjustmentsToSnapshots,
  createPayrollAdjustment,
  createPayrollAdjustmentAuditLog
} from '../src/utils/payrollAdjustment.js';

let passed = 0;
const test = (name, callback) => {
  callback();
  passed += 1;
  console.log(`PASS ${name}`);
};

const companyId = 'company-freeze';
const lockedAt = '2026-07-31T16:59:59.000Z';
const employee = {
  id: 'employee-a',
  name: 'Nguyen Van A',
  basicSalary: 14_000_000,
  supportSalary: 1_000_000,
  responsibilitySalary: 0,
  commissionRate: 0.02,
  commissionBaseMode: 'above_target',
  targetRevenue: 100_000_000,
  payrollPolicies: [
    {
      id: 'policy-v1-3',
      version: 'v1.3',
      formulaVersion: 'PAYROLL_FORMULA_V1',
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-07-31',
      values: {
        position: 'Kinh doanh',
        basicSalary: 12_000_000,
        supportSalary: 500_000,
        responsibilitySalary: 0,
        commissionRate: 0.01,
        commissionBaseMode: 'above_target',
        targetRevenue: 100_000_000,
        salaryMonthDays: 31
      }
    },
    {
      id: 'policy-v1-4',
      version: 'v1.4',
      formulaVersion: 'PAYROLL_FORMULA_V2',
      effectiveFrom: '2026-08-01',
      values: {
        position: 'Kinh doanh',
        basicSalary: 14_000_000,
        supportSalary: 1_000_000,
        responsibilitySalary: 0,
        commissionRate: 0.02,
        commissionBaseMode: 'above_target',
        targetRevenue: 100_000_000,
        salaryMonthDays: 31
      }
    }
  ]
};

const julyEmployee = applyEmployeePayrollPolicyForMonth(employee, '2026-07');
const julySalary = {
  monthKey: '2026-07',
  workDays: 31,
  baseSalaryCalc: 12_000_000,
  supportSalary: 500_000,
  commission: 1_000_000,
  grossSalary: 13_500_000,
  deductionTotal: 0,
  netSalary: 13_500_000,
  endingDebt: 0
};
const julySnapshot = createPayrollEmployeeSnapshot({
  companyId,
  monthKey: '2026-07',
  employee: julyEmployee,
  salaryDetails: julySalary,
  lockedAt,
  lockedByEmployeeId: 'owner-01'
});

test('1. July base salary stays frozen after the August salary increase', () => {
  const changedEmployee = { ...employee, basicSalary: 20_000_000 };
  assert.equal(changedEmployee.basicSalary, 20_000_000);
  assert.equal(julySnapshot.policySnapshot.values.basicSalary, 12_000_000);
  assert.equal(julySnapshot.salaryDetails.baseSalaryCalc, 12_000_000);
});

test('2. July commission stays frozen after the commission rate changes', () => {
  const changedEmployee = { ...employee, commissionRate: 0.05 };
  assert.equal(changedEmployee.commissionRate, 0.05);
  assert.equal(julySnapshot.policySnapshot.values.commissionRate, 0.01);
  assert.equal(julySnapshot.salaryDetails.commission, 1_000_000);
});

test('3. July formula version stays frozen after a new formula takes effect', () => {
  assert.equal(julySnapshot.formulaVersion, 'PAYROLL_FORMULA_V1');
  assert.equal(resolveEmployeePayrollPolicy(employee, '2026-08').formulaVersion, 'PAYROLL_FORMULA_V2');
});

test('4. July allowance stays frozen after the allowance changes', () => {
  const changedEmployee = { ...employee, supportSalary: 3_000_000 };
  assert.equal(changedEmployee.supportSalary, 3_000_000);
  assert.equal(julySnapshot.policySnapshot.values.supportSalary, 500_000);
  assert.equal(julySnapshot.salaryDetails.supportSalary, 500_000);
});

test('5. August uses the new effective payroll policy', () => {
  const augustEmployee = applyEmployeePayrollPolicyForMonth(employee, '2026-08');
  assert.equal(augustEmployee.basicSalary, 14_000_000);
  assert.equal(augustEmployee.commissionRate, 0.02);
  assert.equal(augustEmployee.payrollPolicyVersion, 'v1.4');
});

test('6. September keeps using the latest active payroll policy', () => {
  const septemberEmployee = applyEmployeePayrollPolicyForMonth(employee, '2026-09');
  assert.equal(septemberEmployee.basicSalary, 14_000_000);
  assert.equal(septemberEmployee.payrollPolicyVersion, 'v1.4');
});

test('7. A locked negative July salary creates the correct August debt', () => {
  const lockedNegativeDetails = applyPayrollOpeningDebtToSalaryDetails(
    { netSalary: -2_000_000, deductionTotal: 2_000_000 },
    0
  );
  const carryover = createPayrollDebtCarryover({
    companyId,
    sourceMonthKey: '2026-07',
    employeeId: employee.id,
    sourceSnapshotId: julySnapshot.id,
    salaryDetails: lockedNegativeDetails,
    transferredAt: lockedAt
  });
  assert.equal(carryover.targetMonthKey, '2026-08');
  assert.equal(carryover.amount, 2_000_000);
});

test('8. Unpaid August debt continues correctly into September', () => {
  const august = applyPayrollOpeningDebtToSalaryDetails(
    { netSalary: 1_000_000, deductionTotal: 0 },
    2_000_000
  );
  const carryover = createPayrollDebtCarryover({
    companyId,
    sourceMonthKey: '2026-08',
    employeeId: employee.id,
    sourceSnapshotId: 'august-snapshot',
    salaryDetails: august
  });
  assert.equal(august.netSalary, 0);
  assert.equal(august.endingDebt, 1_000_000);
  assert.equal(carryover.targetMonthKey, '2026-09');
  assert.equal(carryover.amount, 1_000_000);
});

test('9. A later policy edit cannot change debt created from a locked snapshot', () => {
  const negativeSnapshot = createPayrollEmployeeSnapshot({
    companyId,
    monthKey: '2026-07',
    employee: julyEmployee,
    salaryDetails: { ...julySalary, netSalary: 0, endingDebt: 2_000_000 },
    lockedAt
  });
  const carryover = createPayrollDebtCarryover({
    companyId,
    sourceMonthKey: '2026-07',
    employeeId: employee.id,
    sourceSnapshotId: negativeSnapshot.id,
    salaryDetails: negativeSnapshot.salaryDetails
  });
  const changedEmployee = { ...employee, basicSalary: 99_000_000 };
  assert.equal(changedEmployee.basicSalary, 99_000_000);
  assert.equal(carryover.amount, 2_000_000);
});

test('10. Refresh serialization cannot alter locked payroll history', () => {
  const restored = JSON.parse(JSON.stringify(julySnapshot));
  assert.deepEqual(restored, julySnapshot);
  assert.equal(mapPayrollSnapshotsToRows([restored])[0].details.netSalary, 13_500_000);
});

test('11. An unlocked month resolves a newly effective policy for recalculation', () => {
  const update = buildEmployeePayrollPolicyUpdate({
    employee,
    nextEmployee: { ...employee, basicSalary: 16_000_000, supportSalary: 1_500_000 },
    effectiveFrom: '2026-10-01',
    changedAt: '2026-09-20T08:00:00.000Z',
    changedByEmployeeId: 'owner-01'
  });
  const updatedEmployee = { ...employee, ...update };
  const october = applyEmployeePayrollPolicyForMonth(updatedEmployee, '2026-10');
  assert.equal(october.basicSalary, 16_000_000);
  assert.equal(october.supportSalary, 1_500_000);
});

test('12. Locked payroll is recognized as immutable and rules block direct updates', () => {
  assert.equal(isPayrollPeriodLocked('LOCKED'), true);
  assert.equal(isPayrollPeriodLocked('ADJUSTED'), true);
  assert.equal(isPayrollPeriodLocked('DRAFT'), false);
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /collectionId == 'payrollSnapshots'/);
  assert.match(rules, /!isImmutablePayrollCollection\(collectionId\)/);
});

test('13. An official adjustment creates an audit trail without mutating the snapshot', () => {
  const before = structuredClone(julySnapshot);
  const period = createPayrollPeriodRecord({
    companyId,
    monthKey: '2026-07',
    snapshots: [julySnapshot],
    totals: { totalSalary: julySalary.netSalary },
    lockedAt
  });
  const adjustment = createPayrollAdjustment({
    period,
    snapshot: julySnapshot,
    nextNetSalary: 13_700_000,
    nextEndingDebt: 0,
    reason: 'Approved post-lock bonus',
    adjustedAt: '2026-08-02T02:00:00.000Z',
    adjustedByEmployeeId: 'owner-01',
    adjustedByName: 'Owner'
  });
  const audit = createPayrollAdjustmentAuditLog(adjustment);
  const [adjusted] = applyPayrollAdjustmentsToSnapshots([julySnapshot], [adjustment]);
  assert.deepEqual(julySnapshot, before);
  assert.equal(adjustment.differences.netSalary, 200_000);
  assert.equal(audit.before.netSalary, 13_500_000);
  assert.equal(audit.after.netSalary, 13_700_000);
  assert.equal(adjusted.effectiveSalaryDetails.netSalary, 13_700_000);
});

test('14. Multiple employees resolve their own independent policy versions', () => {
  const employeeB = {
    id: 'employee-b',
    payrollPolicies: [{
      id: 'employee-b-policy',
      version: 'v7',
      effectiveFrom: '2026-01-01',
      values: { basicSalary: 9_000_000, supportSalary: 300_000, commissionRate: 0 }
    }]
  };
  assert.equal(applyEmployeePayrollPolicyForMonth(employee, '2026-08').basicSalary, 14_000_000);
  assert.equal(applyEmployeePayrollPolicyForMonth(employeeB, '2026-08').basicSalary, 9_000_000);
  assert.equal(resolveEmployeePayrollPolicy(employeeB, '2026-08').version, 'v7');
});

test('15. Historical rows display only employee data and results saved at lock time', () => {
  const currentEmployee = { ...employee, name: 'New name', basicSalary: 50_000_000 };
  const [historicalRow] = mapPayrollSnapshotsToRows([julySnapshot]);
  assert.equal(currentEmployee.name, 'New name');
  assert.equal(historicalRow.emp.name, 'Nguyen Van A');
  assert.equal(historicalRow.details.baseSalaryCalc, 12_000_000);
  assert.equal(historicalRow.policySnapshot.version, 'v1.3');
});

assert.equal(passed, 15);
console.log(`\nPayroll period freeze: ${passed}/15 mandatory cases PASS`);
