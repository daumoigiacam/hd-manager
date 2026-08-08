import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import {
  createPayrollEmployeeSnapshot,
  mapPayrollSnapshotsToRows
} from '../src/utils/payrollPeriodLock.js';
import {
  applyPayrollOpeningDebtToSalaryDetails,
  createPayrollDebtCarryover
} from '../src/utils/payrollDebtCarryover.js';
import {
  applyPayrollAdjustmentsToSnapshots,
  createPayrollAdjustment
} from '../src/utils/payrollAdjustment.js';
import {
  PAYROLL_SNAPSHOT_INTEGRITY,
  auditPayrollHistoricalData,
  inspectPayrollSnapshot
} from '../src/utils/payrollSnapshotIntegrity.js';

const require = createRequire(import.meta.url);
const { isCompleteFinalPayrollSnapshot } = require('../functions/payrollAutoLock.js');

let passed = 0;
const test = (name, callback) => {
  callback();
  passed += 1;
  console.log(`PASS ${name}`);
};

const companyId = 'company-hardening';
const monthKey = '2026-07';
const lockedAt = '2026-07-31T16:59:59.000Z';
const employee = {
  id: 'employee-01',
  name: 'Nguyen Van A',
  position: 'Kinh doanh',
  basicSalary: 12_000_000,
  supportSalary: 500_000,
  responsibilitySalary: 250_000,
  commissionRate: 0.01,
  payrollPolicies: [{
    id: 'policy-v1',
    version: 'v1',
    formulaVersion: 'PAYROLL_FORMULA_V1',
    effectiveFrom: '2026-01-01',
    values: {
      position: 'Kinh doanh',
      basicSalary: 12_000_000,
      supportSalary: 500_000,
      responsibilitySalary: 250_000,
      commissionRate: 0.01
    }
  }]
};
const salaryDetails = {
  monthKey,
  workDays: 31,
  baseSalaryCalc: 12_000_000,
  supportSalary: 500_000,
  responsibilitySalary: 250_000,
  commission: 1_000_000,
  grossSalary: 13_750_000,
  deductionTotal: 0,
  netSalary: 13_750_000,
  endingDebt: 0
};
const fullSnapshot = createPayrollEmployeeSnapshot({
  companyId,
  monthKey,
  employee,
  salaryDetails,
  lockedAt,
  lockedByEmployeeId: 'owner-01'
});

test('classifies a complete historical payroll snapshot as FULL', () => {
  const result = inspectPayrollSnapshot(fullSnapshot);
  assert.equal(result.status, PAYROLL_SNAPSHOT_INTEGRITY.FULL);
  assert.equal(result.isComplete, true);
  assert.deepEqual(result.missingFields, []);
});

test('marks a displayable legacy record as NEEDS_REVIEW without inventing policy history', () => {
  const legacy = structuredClone(fullSnapshot);
  delete legacy.schemaVersion;
  delete legacy.policySnapshot;
  delete legacy.calculationSnapshot;
  delete legacy.formulaVersion;
  delete legacy.policyVersion;
  const result = inspectPayrollSnapshot(legacy);
  assert.equal(result.status, PAYROLL_SNAPSHOT_INTEGRITY.LEGACY_NEEDS_REVIEW);
  assert.equal(result.hasFrozenDisplayResult, true);
  assert.equal(result.canMigrateMetadataOnly, false);
  assert.ok(result.missingFields.includes('policySnapshot'));
  assert.ok(result.missingFields.includes('calculationSnapshot'));
});

test('never classifies an incomplete result as safe for automatic reconstruction', () => {
  const invalid = {
    id: 'legacy-invalid',
    companyId,
    periodId: fullSnapshot.periodId,
    monthKey,
    employeeId: employee.id,
    employee: { id: employee.id, name: employee.name }
  };
  const result = inspectPayrollSnapshot(invalid);
  assert.equal(result.status, PAYROLL_SNAPSHOT_INTEGRITY.INVALID_NEEDS_REVIEW);
  assert.equal(result.hasFrozenDisplayResult, false);
  assert.equal(result.canMigrateMetadataOnly, false);
});

test('legacy audit reports exact full, review, metadata-only and unsafe counts', () => {
  const metadataOnly = structuredClone(fullSnapshot);
  delete metadataOnly.schemaVersion;
  metadataOnly.id = `${fullSnapshot.id}_metadata`;
  const unsafeLegacy = structuredClone(fullSnapshot);
  delete unsafeLegacy.schemaVersion;
  delete unsafeLegacy.policySnapshot;
  unsafeLegacy.id = `${fullSnapshot.id}_unsafe`;
  const period = {
    id: fullSnapshot.periodId,
    companyId,
    monthKey,
    status: 'LOCKED',
    snapshotIds: [fullSnapshot.id, metadataOnly.id, unsafeLegacy.id]
  };
  const report = auditPayrollHistoricalData({
    periods: [period],
    snapshots: [fullSnapshot, metadataOnly, unsafeLegacy]
  });
  assert.equal(report.totalPayrollRecords, 3);
  assert.equal(report.fullSnapshotCount, 1);
  assert.equal(report.needsReviewSnapshotCount, 2);
  assert.equal(report.safelyMigratableMetadataOnlyCount, 1);
  assert.equal(report.unsafeAutomaticMigrationCount, 1);
  assert.equal(report.lockedPeriodsNeedingReviewCount, 1);
});

test('locked rows render only frozen values and never read a changed employee profile', () => {
  const currentEmployee = {
    ...employee,
    basicSalary: 99_000_000,
    supportSalary: 9_000_000,
    responsibilitySalary: 8_000_000,
    commissionRate: 0.15
  };
  const [row] = mapPayrollSnapshotsToRows([fullSnapshot]);
  assert.equal(currentEmployee.basicSalary, 99_000_000);
  assert.equal(row.details.baseSalaryCalc, 12_000_000);
  assert.equal(row.details.supportSalary, 500_000);
  assert.equal(row.details.responsibilitySalary, 250_000);
  assert.equal(row.details.commission, 1_000_000);
  assert.equal(row.policySnapshot.values.commissionRate, 0.01);
});

test('July negative salary creates exactly 2,000,000 opening debt for August', () => {
  const july = applyPayrollOpeningDebtToSalaryDetails({
    grossSalary: 10_000_000,
    deductionTotal: 12_000_000,
    netSalary: -2_000_000
  }, 0);
  const carry = createPayrollDebtCarryover({
    companyId,
    sourceMonthKey: '2026-07',
    employeeId: employee.id,
    sourceSnapshotId: fullSnapshot.id,
    sourcePeriodId: fullSnapshot.periodId,
    salaryDetails: july,
    transferredAt: lockedAt
  });
  assert.equal(july.netSalary, 0);
  assert.equal(july.endingDebt, 2_000_000);
  assert.equal(carry.amount, 2_000_000);
});

test('August 12,000,000 net pays a 2,000,000 carry exactly once', () => {
  const august = applyPayrollOpeningDebtToSalaryDetails({
    grossSalary: 12_000_000,
    deductionTotal: 0,
    netSalary: 12_000_000
  }, 2_000_000);
  assert.equal(august.openingDebtApplied, 2_000_000);
  assert.equal(august.deductionTotal, 2_000_000);
  assert.equal(august.netSalary, 10_000_000);
  assert.equal(august.endingDebt, 0);
});

test('an unpaid 1,000,000 remainder becomes the only September carry', () => {
  const august = applyPayrollOpeningDebtToSalaryDetails({
    grossSalary: 1_000_000,
    deductionTotal: 0,
    netSalary: 1_000_000
  }, 2_000_000);
  const carry = createPayrollDebtCarryover({
    companyId,
    sourceMonthKey: '2026-08',
    employeeId: employee.id,
    sourceSnapshotId: 'snapshot-2026-08',
    sourcePeriodId: 'period-2026-08',
    salaryDetails: august
  });
  assert.equal(august.netSalary, 0);
  assert.equal(august.endingDebt, 1_000_000);
  assert.equal(carry.targetMonthKey, '2026-09');
  assert.equal(carry.amount, 1_000_000);
});

test('refresh, reopen, recalculate and retry resolve to one deterministic carry ID', () => {
  const ids = Array.from({ length: 8 }, () => createPayrollDebtCarryover({
    companyId,
    sourceMonthKey: '2026-07',
    employeeId: employee.id,
    sourceSnapshotId: fullSnapshot.id,
    sourcePeriodId: fullSnapshot.periodId,
    salaryDetails: { endingDebt: 2_000_000 }
  }).id);
  assert.equal(new Set(ids).size, 1);
  assert.equal(ids[0], `payroll_debt_${companyId}_2026-08_${employee.id}`);
});

test('an official adjustment leaves the original snapshot byte-for-byte unchanged', () => {
  const before = structuredClone(fullSnapshot);
  const period = {
    id: fullSnapshot.periodId,
    companyId,
    monthKey,
    status: 'LOCKED'
  };
  const adjustment = createPayrollAdjustment({
    period,
    snapshot: fullSnapshot,
    nextNetSalary: 14_000_000,
    nextEndingDebt: 0,
    reason: 'Approved correction',
    adjustedAt: '2026-08-02T02:00:00.000Z',
    adjustedByEmployeeId: 'owner-01'
  });
  const [effective] = applyPayrollAdjustmentsToSnapshots([fullSnapshot], [adjustment]);
  assert.deepEqual(fullSnapshot, before);
  assert.equal(effective.salaryDetails.netSalary, 13_750_000);
  assert.equal(effective.effectiveSalaryDetails.netSalary, 14_000_000);
  assert.equal(effective.status, 'ADJUSTED');
});

test('the auto-lock worker rejects staged snapshots that lack frozen policy inputs', () => {
  const legacy = structuredClone(fullSnapshot);
  delete legacy.policySnapshot;
  assert.equal(isCompleteFinalPayrollSnapshot(fullSnapshot), true);
  assert.equal(isCompleteFinalPayrollSnapshot(legacy), false);
});

test('the locked UI dependency graph exits before live policy and formula calculation', () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /const payrollPolicyEmployees = useMemo\([\s\S]*?isPayrollLocked\s*\?\s*\[\]/);
  assert.match(source, /const buildPayrollSalaryDetails = useCallback\(\(employeeId\) => \{\s*if \(isPayrollLocked\) return null;/);
  assert.match(source, /const liveSalaryRows = useMemo\(\(\) => \{\s*if \(isPayrollLocked\) return \[\];/);
  assert.match(source, /const salaryRows = isPayrollLocked \? lockedSnapshotRows : liveSalaryRows;/);
});

test('company payroll summary exposes a visible month selector with readable total salary', () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /<span className="mb-1 block[^>]*>Xem tháng<\/span>/);
  assert.match(source, /type="month"\s+value=\{currentMonth\}/);
  assert.match(source, /onChange=\{\(event\) => setSalaryMonth\(event\.target\.value/);
  assert.match(source, /text-3xl font-black text-white drop-shadow/);
  assert.doesNotMatch(source, /ref=\{salaryMonthInputRef\}/);
});

test('manual payroll lock reads only the period document before creating immutable artifacts', () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const handlerStart = source.indexOf('const handleLockPayrollPeriod');
  const handlerEnd = source.indexOf('const handleAdjustLockedPayroll', handlerStart);
  const handlerSource = source.slice(handlerStart, handlerEnd);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  assert.match(handlerSource, /const existingPeriod = await transaction\.get\(periodRef\);/);
  assert.doesNotMatch(handlerSource, /planRef|existingPlan/);
});

test('payroll summary shows opening debt beside current-period advances without changing salary math', () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /Ứng \+ nợ đầu kỳ/);
  assert.match(source, /aggregateData\.totalAdvance \+ aggregateData\.totalOpeningDebt/);
  assert.match(source, /\(details\.totalAdvance \|\| 0\) \+ \(details\.openingDebt \|\| 0\)/);
  assert.match(source, /<span>Dư nợ đầu kỳ<\/span>/);
  assert.match(source, /<span>Đã khấu trừ nợ đầu kỳ<\/span>/);
});

test('current payroll directs owners to review an unlocked previous month instead of inventing history', () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /getPreviousPayrollMonthKey\(currentMonth\)/);
  assert.match(source, /const shouldReviewPreviousPayrollPeriod = Boolean\(/);
  assert.match(source, /chưa được chốt/);
  assert.match(source, /App chưa thể chuyển số âm sang mục Ứng \+ nợ đầu kỳ vì chưa có snapshot lịch sử đã khóa/);
  assert.match(source, /onClick=\{\(\) => setSalaryMonth\(previousPayrollMonth\)\}/);
});

test('Rules make snapshots and payroll audit records immutable after creation', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /isImmutablePayrollCollection/);
  assert.match(rules, /isImmutablePayrollAudit/);
  assert.match(rules, /!isImmutablePayrollCollection\(collectionId\)/);
  assert.match(rules, /!isImmutablePayrollAudit\(collectionId, resource\.data\)/);
});

assert.equal(passed, 17);
console.log(`\nPayroll period hardening: ${passed}/17 cases PASS`);
