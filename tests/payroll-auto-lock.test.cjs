const assert = require('node:assert/strict');

const {
  PAYROLL_AUTO_LOCK_PLAN_STATUS,
  PAYROLL_RULES_VERSION,
  buildPayrollDebtCarryoverId,
  createDebtRolloverArtifacts,
  createFinalPayrollSnapshot,
  getPayrollMonthEndDateKey,
  getVietnamClock,
  inspectPayrollAutoLockCandidate,
  isCompleteFinalPayrollSnapshot,
  isPayrollAutoLockDue,
  normalizePayrollAutoLockStatus
} = require('../functions/payrollAutoLock.js');

let passed = 0;
const test = (name, callback) => {
  callback();
  passed += 1;
  console.log(`PASS ${name}`);
};

const dueClock = { dateKey: '2026-07-31', hour: 23, minute: 59, second: 59 };
const plan = {
  id: 'payroll_auto_lock_company-01_2026-07',
  companyId: 'company-01',
  periodId: 'payroll_company-01_2026-07',
  monthKey: '2026-07',
  status: PAYROLL_AUTO_LOCK_PLAN_STATUS.OPEN,
  rulesVersion: PAYROLL_RULES_VERSION,
  autoLockAt: '2026-07-31T23:59:59+07:00',
  closingSchedule: {
    mode: 'MONTH_END',
    timeZone: 'Asia/Ho_Chi_Minh',
    time: '23:59:59',
    source: 'SYSTEM_MONTH_END'
  },
  stagedSnapshotIds: ['payroll_auto_lock_company-01_2026-07_employee-01'],
  expectedEmployeeIds: ['employee-01'],
  snapshotCount: 1
};
const stagedSnapshot = {
  id: plan.stagedSnapshotIds[0],
  snapshotId: 'payroll_company-01_2026-07_employee-01',
  planId: plan.id,
  preparedAt: '2026-07-31T10:00:00.000Z',
  companyId: plan.companyId,
  employeeId: 'employee-01',
  periodId: plan.periodId,
  monthKey: plan.monthKey,
  status: 'STAGED',
  schemaVersion: 2,
  formulaVersion: 'HD_PAYROLL_FORMULA_V1',
  policyVersion: 'v1',
  policySnapshot: {
    version: 'v1',
    formulaVersion: 'HD_PAYROLL_FORMULA_V1',
    effectiveFrom: '2026-07-01',
    values: { basicSalary: 12_000_000, commissionRate: 0.01 }
  },
  employee: { id: 'employee-01', name: 'Nguyen Van A' },
  salaryDetails: { grossSalary: 13_000_000, netSalary: 11_000_000, endingDebt: 0 },
  calculationSnapshot: {
    inputs: { monthKey: '2026-07', workDays: 31 },
    additions: { baseSalary: 12_000_000, commission: 1_000_000 },
    deductions: { totalAdvance: 2_000_000 },
    results: { grossSalary: 13_000_000, netSalary: 11_000_000, endingDebt: 0 }
  },
  isArchived: false
};

const inspect = (overrides = {}) => inspectPayrollAutoLockCandidate({
  plan: overrides.plan || plan,
  stagedSnapshots: overrides.stagedSnapshots || [stagedSnapshot],
  activeEmployeeIds: overrides.activeEmployeeIds || ['employee-01'],
  adjustments: overrides.adjustments || [],
  runtimeRulesVersion: overrides.runtimeRulesVersion === undefined
    ? PAYROLL_RULES_VERSION
    : overrides.runtimeRulesVersion,
  clock: overrides.clock || dueClock
});

const inspectAtStatus = (status, overrides = {}) => inspect({
  ...overrides,
  plan: { ...plan, ...(overrides.plan || {}), status }
});

test('uses the correct final date for every payroll month', () => {
  assert.equal(getPayrollMonthEndDateKey('2026-02'), '2026-02-28');
  assert.equal(getPayrollMonthEndDateKey('2028-02'), '2028-02-29');
  assert.equal(getPayrollMonthEndDateKey('2026-12'), '2026-12-31');
});

test('does not auto-lock before the configured final second', () => {
  assert.equal(isPayrollAutoLockDue('2026-07', { ...dueClock, second: 0 }), false);
  assert.equal(isPayrollAutoLockDue('2026-07', dueClock), true);
  assert.equal(isPayrollAutoLockDue('2026-07', { dateKey: '2026-08-01', hour: 0, minute: 0, second: 0 }), true);
  assert.equal(isPayrollAutoLockDue('2026-07', dueClock, plan.autoLockAt), true);
});

test('an open period remains OPEN before the configured close time', () => {
  const result = inspect({ clock: { ...dueClock, second: 58 } });
  assert.equal(result.state, PAYROLL_AUTO_LOCK_PLAN_STATUS.OPEN);
  assert.equal(result.due, false);
});

test('incomplete staging is allowed while the payroll period is open', () => {
  const incomplete = { ...stagedSnapshot };
  delete incomplete.policySnapshot;
  delete incomplete.calculationSnapshot;
  const result = inspect({ stagedSnapshots: [incomplete], clock: { ...dueClock, second: 58 } });
  assert.equal(result.state, PAYROLL_AUTO_LOCK_PLAN_STATUS.OPEN);
  assert.deepEqual(result.snapshotIssues, []);
});

test('OPEN moves only to CLOSING when the close time arrives', () => {
  const result = inspect();
  assert.equal(result.state, PAYROLL_AUTO_LOCK_PLAN_STATUS.CLOSING);
  assert.equal(result.digest, '');
});

test('legacy READY is treated as OPEN and cannot skip CLOSING', () => {
  assert.equal(normalizePayrollAutoLockStatus('READY'), PAYROLL_AUTO_LOCK_PLAN_STATUS.OPEN);
  const result = inspect({ plan: { ...plan, status: 'READY' } });
  assert.equal(result.state, PAYROLL_AUTO_LOCK_PLAN_STATUS.CLOSING);
});

test('CLOSING validates a complete frozen policy and calculation snapshot', () => {
  const result = inspectAtStatus(PAYROLL_AUTO_LOCK_PLAN_STATUS.CLOSING);
  assert.equal(result.state, PAYROLL_AUTO_LOCK_PLAN_STATUS.SNAPSHOT_VALIDATED);
  assert.equal(result.blockers.length, 0);
  assert.match(result.digest, /^[a-f0-9]{64}$/);
});

test('SNAPSHOT_VALIDATED reaches READY_FOR_LOCK only after a second validation', () => {
  const validated = inspectAtStatus(PAYROLL_AUTO_LOCK_PLAN_STATUS.CLOSING);
  const result = inspectAtStatus(PAYROLL_AUTO_LOCK_PLAN_STATUS.SNAPSHOT_VALIDATED, {
    plan: { snapshotValidationDigest: validated.digest }
  });
  assert.equal(result.state, PAYROLL_AUTO_LOCK_PLAN_STATUS.READY_FOR_LOCK);
  assert.equal(result.digest, validated.digest);
});

test('READY_FOR_LOCK remains the only state eligible for finalization', () => {
  const result = inspectAtStatus(PAYROLL_AUTO_LOCK_PLAN_STATUS.READY_FOR_LOCK);
  assert.equal(result.state, PAYROLL_AUTO_LOCK_PLAN_STATUS.READY_FOR_LOCK);
  assert.match(result.digest, /^[a-f0-9]{64}$/);
});

test('the complete close flow cannot skip any state', () => {
  const closing = inspectAtStatus(PAYROLL_AUTO_LOCK_PLAN_STATUS.OPEN);
  const validated = inspectAtStatus(closing.state);
  const ready = inspectAtStatus(validated.state, {
    plan: { snapshotValidationDigest: validated.digest }
  });
  const finalSnapshot = createFinalPayrollSnapshot(stagedSnapshot, '2026-07-31T16:59:59.000Z');
  assert.deepEqual(
    [PAYROLL_AUTO_LOCK_PLAN_STATUS.OPEN, closing.state, validated.state, ready.state, finalSnapshot.status],
    ['OPEN', 'CLOSING', 'SNAPSHOT_VALIDATED', 'READY_FOR_LOCK', 'LOCKED']
  );
});

test('production Rules confirmation is mandatory during CLOSING', () => {
  const result = inspectAtStatus(PAYROLL_AUTO_LOCK_PLAN_STATUS.CLOSING, { runtimeRulesVersion: '' });
  assert.equal(result.state, PAYROLL_AUTO_LOCK_PLAN_STATUS.CLOSING);
  assert.equal(result.gateState, 'RULES_PENDING');
  assert.equal(result.rulesReady, false);
});

test('a pending adjustment blocks snapshot validation', () => {
  const result = inspectAtStatus(PAYROLL_AUTO_LOCK_PLAN_STATUS.CLOSING, {
    adjustments: [{ id: 'adjustment-01', status: 'PENDING' }]
  });
  assert.equal(result.state, PAYROLL_AUTO_LOCK_PLAN_STATUS.NEEDS_REVIEW);
  assert.ok(result.blockers.includes('adjustments.pending'));
});

test('a changed active employee set blocks the entire period', () => {
  const result = inspectAtStatus(PAYROLL_AUTO_LOCK_PLAN_STATUS.CLOSING, {
    activeEmployeeIds: ['employee-01', 'employee-02']
  });
  assert.equal(result.state, PAYROLL_AUTO_LOCK_PLAN_STATUS.NEEDS_REVIEW);
  assert.ok(result.blockers.includes('employees.changed'));
});

test('a staged snapshot for the wrong employee blocks the entire period', () => {
  const wrongEmployee = { ...stagedSnapshot, employeeId: 'employee-02' };
  const result = inspectAtStatus(PAYROLL_AUTO_LOCK_PLAN_STATUS.CLOSING, { stagedSnapshots: [wrongEmployee] });
  assert.equal(result.state, PAYROLL_AUTO_LOCK_PLAN_STATUS.NEEDS_REVIEW);
  assert.ok(result.blockers.includes('stagedSnapshots.employeeMismatch'));
});

test('an incomplete staged snapshot becomes NEEDS_REVIEW only during CLOSING', () => {
  const incomplete = { ...stagedSnapshot };
  delete incomplete.policySnapshot;
  delete incomplete.calculationSnapshot;
  const result = inspectAtStatus(PAYROLL_AUTO_LOCK_PLAN_STATUS.CLOSING, { stagedSnapshots: [incomplete] });
  assert.equal(result.state, PAYROLL_AUTO_LOCK_PLAN_STATUS.NEEDS_REVIEW);
  assert.ok(result.snapshotIssues.some(issue => issue.includes('policySnapshot')));
});

test('snapshot mutation after validation changes the digest', () => {
  const validated = inspectAtStatus(PAYROLL_AUTO_LOCK_PLAN_STATUS.CLOSING);
  const mutated = structuredClone(stagedSnapshot);
  mutated.salaryDetails.netSalary = 10_000_000;
  mutated.calculationSnapshot.results.netSalary = 10_000_000;
  const recheck = inspectAtStatus(PAYROLL_AUTO_LOCK_PLAN_STATUS.SNAPSHOT_VALIDATED, {
    plan: { snapshotValidationDigest: validated.digest },
    stagedSnapshots: [mutated]
  });
  assert.equal(recheck.state, PAYROLL_AUTO_LOCK_PLAN_STATUS.READY_FOR_LOCK);
  assert.notEqual(recheck.digest, validated.digest);
});

test('converts staging to a complete immutable official snapshot', () => {
  const finalSnapshot = createFinalPayrollSnapshot(stagedSnapshot, '2026-07-31T16:59:59.000Z');
  assert.equal(finalSnapshot.id, stagedSnapshot.snapshotId);
  assert.equal(finalSnapshot.status, 'LOCKED');
  assert.equal(finalSnapshot.lockedAt, '2026-07-31T16:59:59.000Z');
  assert.equal(finalSnapshot.preparedAt, undefined);
  assert.equal(isCompleteFinalPayrollSnapshot(finalSnapshot), true);
});

test('a locked snapshot remains byte-for-byte independent from later policy changes', () => {
  const finalSnapshot = createFinalPayrollSnapshot(stagedSnapshot, '2026-07-31T16:59:59.000Z');
  const frozenBytes = JSON.stringify(finalSnapshot);
  const currentEmployeePolicy = { basicSalary: 14_000_000, commissionRate: 0.02, allowance: 500_000 };
  currentEmployeePolicy.basicSalary = 20_000_000;
  assert.equal(JSON.stringify(finalSnapshot), frozenBytes);
});

test('creates no transfer data when finalized payroll has no ending debt', () => {
  const artifacts = createDebtRolloverArtifacts({
    companyId: 'company-01',
    monthKey: '2026-07',
    snapshot: { id: 'snapshot-01', employeeId: 'employee-01', periodId: 'period-01', salaryDetails: { netSalary: 8_000_000 } },
    lockedAt: '2026-07-31T16:59:59.000Z'
  });
  assert.equal(artifacts, null);
});

test('creates deterministic carry and journal records from ending debt', () => {
  const artifacts = createDebtRolloverArtifacts({
    companyId: 'company-01',
    monthKey: '2026-07',
    snapshot: {
      id: 'snapshot-01', employeeId: 'employee-01', periodId: 'period-01',
      employee: { name: 'Nguyen Van A' }, salaryDetails: { endingDebt: 10_000_000 }
    },
    lockedAt: '2026-07-31T16:59:59.000Z'
  });
  assert.equal(artifacts.carryover.id, buildPayrollDebtCarryoverId('company-01', '2026-08', 'employee-01'));
  assert.equal(artifacts.carryover.amount, 10_000_000);
  assert.equal(artifacts.journalEntry.amount, 10_000_000);
});

test('reads a Vietnam clock in a timezone-safe format', () => {
  const clock = getVietnamClock('2026-07-31T16:59:59.000Z');
  assert.deepEqual(clock, dueClock);
});

console.log(`\nPayroll auto lock: ${passed}/${passed} cases PASS`);
