const crypto = require('node:crypto');

const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;
const LOCKED_PAYROLL_STATUSES = new Set(['LOCKED', 'ADJUSTED']);
const PAYROLL_RULES_VERSION = 'PAYROLL_FREEZE_RULES_V2';
const PAYROLL_AUTO_LOCK_PLAN_STATUS = Object.freeze({
  OPEN: 'OPEN',
  CLOSING: 'CLOSING',
  SNAPSHOT_VALIDATED: 'SNAPSHOT_VALIDATED',
  READY_FOR_LOCK: 'READY_FOR_LOCK',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  LOCKED: 'LOCKED'
});

const sanitizeIdPart = (value = '') => (
  `${value || ''}`.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
);

const toMoney = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

const toSignedMoney = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};

const getEndingDebt = (salaryDetails = {}) => {
  const explicitDebt = toMoney(salaryDetails?.endingDebt);
  if (explicitDebt > 0) return explicitDebt;
  return Math.max(0, -toSignedMoney(salaryDetails?.netSalary));
};

const isLockedPayrollStatus = (status = '') => LOCKED_PAYROLL_STATUSES.has(`${status || ''}`.toUpperCase());

const isRecord = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const hasText = value => `${value || ''}`.trim().length > 0;
const hasNumber = value => Number.isFinite(Number(value));
const sameMoney = (left, right) => Math.round(Number(left) || 0) === Math.round(Number(right) || 0);

const inspectFinalPayrollSnapshot = (snapshot = {}) => {
  const issues = [];
  ['companyId', 'periodId', 'monthKey', 'employeeId', 'formulaVersion', 'policyVersion', 'lockedAt'].forEach(field => {
    if (!hasText(snapshot?.[field])) issues.push(field);
  });
  if (Number(snapshot?.schemaVersion || 0) < 2) issues.push('schemaVersion');
  if (!isRecord(snapshot?.employee)) issues.push('employee');
  if (!isRecord(snapshot?.salaryDetails)) issues.push('salaryDetails');
  if (!hasNumber(snapshot?.salaryDetails?.netSalary)) issues.push('salaryDetails.netSalary');
  if (!hasNumber(snapshot?.salaryDetails?.endingDebt)) issues.push('salaryDetails.endingDebt');

  const policy = snapshot?.policySnapshot;
  if (!isRecord(policy)) issues.push('policySnapshot');
  if (!isRecord(policy?.values) || Object.keys(policy.values).length === 0) issues.push('policySnapshot.values');
  if (!hasText(policy?.version)) issues.push('policySnapshot.version');
  if (!hasText(policy?.formulaVersion)) issues.push('policySnapshot.formulaVersion');
  if (hasText(snapshot?.policyVersion) && policy?.version !== snapshot.policyVersion) issues.push('policyVersion.mismatch');
  if (hasText(snapshot?.formulaVersion) && policy?.formulaVersion !== snapshot.formulaVersion) issues.push('formulaVersion.mismatch');

  const calculation = snapshot?.calculationSnapshot;
  if (!isRecord(calculation)) issues.push('calculationSnapshot');
  ['inputs', 'additions', 'deductions', 'results'].forEach(field => {
    if (!isRecord(calculation?.[field])) issues.push(`calculationSnapshot.${field}`);
  });
  ['grossSalary', 'netSalary', 'endingDebt'].forEach(field => {
    if (!hasNumber(calculation?.results?.[field])) issues.push(`calculationSnapshot.results.${field}`);
  });
  if (hasNumber(calculation?.results?.netSalary) && hasNumber(snapshot?.salaryDetails?.netSalary)
    && !sameMoney(calculation.results.netSalary, snapshot.salaryDetails.netSalary)) {
    issues.push('calculationSnapshot.results.netSalary.mismatch');
  }
  if (hasNumber(calculation?.results?.endingDebt) && hasNumber(snapshot?.salaryDetails?.endingDebt)
    && !sameMoney(calculation.results.endingDebt, snapshot.salaryDetails.endingDebt)) {
    issues.push('calculationSnapshot.results.endingDebt.mismatch');
  }
  if (hasNumber(calculation?.results?.grossSalary) && hasNumber(snapshot?.salaryDetails?.grossSalary)
    && !sameMoney(calculation.results.grossSalary, snapshot.salaryDetails.grossSalary)) {
    issues.push('calculationSnapshot.results.grossSalary.mismatch');
  }
  if (hasText(calculation?.inputs?.monthKey) && calculation.inputs.monthKey !== snapshot.monthKey) {
    issues.push('calculationSnapshot.inputs.monthKey');
  }

  return { isComplete: issues.length === 0, issues: [...new Set(issues)] };
};

const isCompleteFinalPayrollSnapshot = snapshot => inspectFinalPayrollSnapshot(snapshot).isComplete;

const normalizePayrollMonthKey = (value = '') => {
  const match = `${value || ''}`.trim().match(MONTH_KEY_PATTERN);
  if (!match) return '';
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? `${match[1]}-${match[2]}` : '';
};

const getNextPayrollMonthKey = (monthKey = '') => {
  const normalizedMonthKey = normalizePayrollMonthKey(monthKey);
  if (!normalizedMonthKey) return '';
  const [year, month] = normalizedMonthKey.split('-').map(Number);
  const next = new Date(year, month, 1);
  return `${next.getFullYear()}-${`${next.getMonth() + 1}`.padStart(2, '0')}`;
};

const getPayrollMonthEndDateKey = (monthKey = '') => {
  const normalizedMonthKey = normalizePayrollMonthKey(monthKey);
  if (!normalizedMonthKey) return '';
  const [year, month] = normalizedMonthKey.split('-').map(Number);
  return `${normalizedMonthKey}-${`${new Date(year, month, 0).getDate()}`.padStart(2, '0')}`;
};

const buildPayrollDebtCarryoverId = (companyId = '', targetMonthKey = '', employeeId = '') => {
  const safeCompanyId = sanitizeIdPart(companyId);
  const safeMonthKey = normalizePayrollMonthKey(targetMonthKey);
  const safeEmployeeId = sanitizeIdPart(employeeId);
  return safeCompanyId && safeMonthKey && safeEmployeeId
    ? `payroll_debt_${safeCompanyId}_${safeMonthKey}_${safeEmployeeId}`
    : '';
};

const getVietnamClock = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(safeDate);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour || 0),
    minute: Number(values.minute || 0),
    second: Number(values.second || 0)
  };
};

const normalizePayrollAutoLockStatus = (status = '') => {
  const normalized = `${status || ''}`.trim().toUpperCase();
  // Legacy READY was only a staging state. It must never skip validation.
  if (normalized === 'READY') return PAYROLL_AUTO_LOCK_PLAN_STATUS.OPEN;
  // Legacy ELIGIBLE is deliberately sent back through full validation.
  if (normalized === 'ELIGIBLE') return PAYROLL_AUTO_LOCK_PLAN_STATUS.CLOSING;
  return Object.values(PAYROLL_AUTO_LOCK_PLAN_STATUS).includes(normalized) ? normalized : '';
};

const runPayrollAutoLockPlanStateMachine = async ({
  initialStatus = '',
  evaluateEligibility,
  finalizeLock,
  maxTransitions = 4
} = {}) => {
  if (typeof evaluateEligibility !== 'function' || typeof finalizeLock !== 'function') {
    throw new TypeError('Payroll auto-lock requires eligibility and finalize handlers.');
  }

  let status = normalizePayrollAutoLockStatus(initialStatus);
  if (!status) return { state: 'skipped', status: '', transitionCount: 0, transitions: [] };
  if ([PAYROLL_AUTO_LOCK_PLAN_STATUS.LOCKED, PAYROLL_AUTO_LOCK_PLAN_STATUS.NEEDS_REVIEW].includes(status)) {
    return { state: status, transitionCount: 0, transitions: [] };
  }

  const safeTransitionLimit = Math.max(1, Math.min(8, Math.floor(Number(maxTransitions) || 4)));
  const transitions = [];
  let lastOutcome = { state: status };

  for (let index = 0; index < safeTransitionLimit; index += 1) {
    const action = status === PAYROLL_AUTO_LOCK_PLAN_STATUS.READY_FOR_LOCK ? 'finalize' : 'evaluate';
    const outcome = await (action === 'finalize' ? finalizeLock() : evaluateEligibility());
    lastOutcome = outcome && typeof outcome === 'object' ? outcome : { state: 'unknown' };
    const rawState = `${lastOutcome.state || ''}`.trim();
    transitions.push({ action, state: rawState, status: `${lastOutcome.status || ''}`.trim() });

    if (lastOutcome.gateState === 'RULES_PENDING' || lastOutcome.due === false) {
      return { ...lastOutcome, transitionCount: transitions.length, transitions };
    }
    if (rawState === 'already_locked') {
      return {
        ...lastOutcome,
        state: PAYROLL_AUTO_LOCK_PLAN_STATUS.LOCKED,
        completionReason: 'period_already_locked',
        transitionCount: transitions.length,
        transitions
      };
    }
    if (rawState === 'skipped') {
      const concurrentStatus = normalizePayrollAutoLockStatus(lastOutcome.status);
      if (concurrentStatus && concurrentStatus !== status) {
        status = concurrentStatus;
        if ([PAYROLL_AUTO_LOCK_PLAN_STATUS.LOCKED, PAYROLL_AUTO_LOCK_PLAN_STATUS.NEEDS_REVIEW].includes(status)) {
          return { ...lastOutcome, state: status, transitionCount: transitions.length, transitions };
        }
        continue;
      }
      return { ...lastOutcome, transitionCount: transitions.length, transitions };
    }
    if (['missing_plan', 'failed', 'unknown'].includes(rawState)) {
      return { ...lastOutcome, transitionCount: transitions.length, transitions };
    }

    const nextStatus = normalizePayrollAutoLockStatus(rawState);
    if (!nextStatus) return { ...lastOutcome, transitionCount: transitions.length, transitions };
    status = nextStatus;
    if ([PAYROLL_AUTO_LOCK_PLAN_STATUS.LOCKED, PAYROLL_AUTO_LOCK_PLAN_STATUS.NEEDS_REVIEW].includes(status)) {
      return { ...lastOutcome, state: status, transitionCount: transitions.length, transitions };
    }
  }

  return {
    ...lastOutcome,
    state: 'transition_limit',
    lastStatus: status,
    transitionCount: transitions.length,
    transitions
  };
};

const getClockComparableKey = (clock = {}) => (
  `${clock?.dateKey || ''}T${`${Number(clock?.hour) || 0}`.padStart(2, '0')}:${`${Number(clock?.minute) || 0}`.padStart(2, '0')}:${`${Number(clock?.second) || 0}`.padStart(2, '0')}`
);

const isValidPayrollClosingSchedule = (plan = {}) => {
  const monthKey = normalizePayrollMonthKey(plan?.monthKey);
  const monthEndDateKey = getPayrollMonthEndDateKey(monthKey);
  const autoLockAt = `${plan?.autoLockAt || ''}`.trim();
  const schedule = plan?.closingSchedule;
  return Boolean(
    monthEndDateKey
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2}|Z)$/.test(autoLockAt)
    && autoLockAt.startsWith(`${monthEndDateKey}T`)
    && isRecord(schedule)
    && schedule.mode === 'MONTH_END'
    && schedule.timeZone === 'Asia/Ho_Chi_Minh'
    && /^\d{2}:\d{2}:\d{2}$/.test(`${schedule.time || ''}`)
    && autoLockAt.slice(11, 19) === schedule.time
  );
};

const isPayrollAutoLockDue = (monthKey = '', clock = getVietnamClock(), autoLockAt = '') => {
  const monthEndDateKey = getPayrollMonthEndDateKey(monthKey);
  if (!monthEndDateKey || !clock?.dateKey) return false;
  const configuredClose = `${autoLockAt || ''}`.trim().slice(0, 19);
  if (configuredClose) return getClockComparableKey(clock) >= configuredClose;
  if (clock.dateKey > monthEndDateKey) return true;
  if (clock.dateKey < monthEndDateKey) return false;
  return Number(clock.hour) === 23 && Number(clock.minute) === 59 && Number(clock.second) >= 59;
};

const stableSerialize = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
};

const buildPayrollAutoLockDigest = (plan = {}, stagedSnapshots = []) => {
  const canonicalSnapshots = (Array.isArray(stagedSnapshots) ? stagedSnapshots : [])
    .map(snapshot => ({
      snapshotId: snapshot?.snapshotId || '',
      employeeId: snapshot?.employeeId || '',
      companyId: snapshot?.companyId || '',
      periodId: snapshot?.periodId || '',
      monthKey: snapshot?.monthKey || '',
      schemaVersion: snapshot?.schemaVersion || 0,
      formulaVersion: snapshot?.formulaVersion || '',
      policyVersion: snapshot?.policyVersion || '',
      employee: snapshot?.employee || null,
      salaryDetails: snapshot?.salaryDetails || null,
      policySnapshot: snapshot?.policySnapshot || null,
      calculationSnapshot: snapshot?.calculationSnapshot || null
    }))
    .sort((left, right) => `${left.employeeId}`.localeCompare(`${right.employeeId}`));
  const payload = {
    planId: plan?.id || '',
    companyId: plan?.companyId || '',
    periodId: plan?.periodId || '',
    monthKey: plan?.monthKey || '',
    rulesVersion: plan?.rulesVersion || '',
    autoLockAt: plan?.autoLockAt || '',
    closingSchedule: plan?.closingSchedule || null,
    expectedEmployeeIds: [...new Set((plan?.expectedEmployeeIds || []).map(id => `${id || ''}`).filter(Boolean))].sort(),
    stagedSnapshots: canonicalSnapshots
  };
  return crypto.createHash('sha256').update(stableSerialize(payload)).digest('hex');
};

const isPendingPayrollAdjustment = (adjustment = {}) => {
  if (adjustment?.isArchived) return false;
  const status = `${adjustment?.status || ''}`.trim().toUpperCase();
  return ['PENDING', 'DRAFT', 'REVIEW', 'PROCESSING'].includes(status);
};

const inspectPayrollAutoLockCandidate = ({
  plan = {},
  stagedSnapshots = [],
  activeEmployeeIds = [],
  adjustments = [],
  runtimeRulesVersion = '',
  clock = getVietnamClock()
} = {}) => {
  const status = normalizePayrollAutoLockStatus(plan?.status);
  const due = isPayrollAutoLockDue(plan?.monthKey, clock, plan?.autoLockAt);
  const rulesReady = runtimeRulesVersion === PAYROLL_RULES_VERSION;

  if (status === PAYROLL_AUTO_LOCK_PLAN_STATUS.LOCKED) {
    return {
      state: PAYROLL_AUTO_LOCK_PLAN_STATUS.LOCKED,
      due,
      rulesReady,
      blockers: [],
      snapshotIssues: [],
      digest: '',
      finalizedSnapshots: []
    };
  }

  // An open period may contain incomplete preview data. Strict validation starts
  // only after the configured closing second and never turns an open preview
  // into historical NEEDS_REVIEW data before that point.
  if (!due) {
    return {
      state: PAYROLL_AUTO_LOCK_PLAN_STATUS.OPEN,
      due: false,
      rulesReady,
      blockers: [],
      snapshotIssues: [],
      digest: '',
      finalizedSnapshots: []
    };
  }

  if (status === PAYROLL_AUTO_LOCK_PLAN_STATUS.OPEN) {
    return {
      state: PAYROLL_AUTO_LOCK_PLAN_STATUS.CLOSING,
      due: true,
      rulesReady,
      blockers: [],
      snapshotIssues: [],
      digest: '',
      finalizedSnapshots: []
    };
  }

  const blockers = [];
  const stagedIds = [...new Set((plan?.stagedSnapshotIds || []).map(id => `${id || ''}`.trim()).filter(Boolean))];
  const expectedEmployeeIds = [...new Set((plan?.expectedEmployeeIds || []).map(id => `${id || ''}`.trim()).filter(Boolean))].sort();
  const currentEmployeeIds = [...new Set((activeEmployeeIds || []).map(id => `${id || ''}`.trim()).filter(Boolean))].sort();
  const stagedById = new Map((Array.isArray(stagedSnapshots) ? stagedSnapshots : []).map(snapshot => [`${snapshot?.id || ''}`, snapshot]));
  const finalizedSnapshots = stagedIds.map(id => createFinalPayrollSnapshot(stagedById.get(id), 'eligibility-check'));
  const stagedEmployeeIds = finalizedSnapshots
    .map(snapshot => `${snapshot?.employeeId || ''}`.trim())
    .filter(Boolean)
    .sort();

  if (![PAYROLL_AUTO_LOCK_PLAN_STATUS.CLOSING,
    PAYROLL_AUTO_LOCK_PLAN_STATUS.SNAPSHOT_VALIDATED,
    PAYROLL_AUTO_LOCK_PLAN_STATUS.READY_FOR_LOCK].includes(status)) blockers.push('plan.status');
  if (!hasText(plan?.id) || !hasText(plan?.companyId) || !hasText(plan?.periodId) || !normalizePayrollMonthKey(plan?.monthKey)) blockers.push('plan.identity');
  if (plan?.rulesVersion !== PAYROLL_RULES_VERSION) blockers.push('plan.rulesVersion');
  if (!isValidPayrollClosingSchedule(plan)) blockers.push('plan.closingSchedule');
  if (stagedIds.length === 0 || Number(plan?.snapshotCount || 0) !== stagedIds.length) blockers.push('plan.snapshotCount');
  if (stagedIds.some(id => !stagedById.has(id))) blockers.push('stagedSnapshots.missing');
  if (expectedEmployeeIds.length === 0 || expectedEmployeeIds.length !== stagedIds.length) blockers.push('plan.expectedEmployeeIds');
  if (expectedEmployeeIds.join('|') !== currentEmployeeIds.join('|')) blockers.push('employees.changed');
  if (stagedEmployeeIds.length !== stagedIds.length || new Set(stagedEmployeeIds).size !== stagedIds.length) {
    blockers.push('stagedSnapshots.employeeIds');
  } else if (expectedEmployeeIds.join('|') !== stagedEmployeeIds.join('|')) {
    blockers.push('stagedSnapshots.employeeMismatch');
  }
  const snapshotIssues = finalizedSnapshots.flatMap((snapshot, index) => {
    const stagedId = stagedIds[index] || `index-${index}`;
    if (!snapshot) return [`${stagedId}:invalid`];
    if (snapshot.companyId !== plan.companyId || snapshot.periodId !== plan.periodId || snapshot.monthKey !== plan.monthKey) {
      return [`${stagedId}:identity`];
    }
    return inspectFinalPayrollSnapshot(snapshot).issues.map(issue => `${stagedId}:${issue}`);
  });
  blockers.push(...snapshotIssues);
  if ((adjustments || []).some(isPendingPayrollAdjustment)) blockers.push('adjustments.pending');

  const uniqueBlockers = [...new Set(blockers)];
  const digest = uniqueBlockers.length === 0 && rulesReady
    ? buildPayrollAutoLockDigest(plan, stagedSnapshots)
    : '';
  let state = PAYROLL_AUTO_LOCK_PLAN_STATUS.NEEDS_REVIEW;
  let gateState = '';
  if (!rulesReady) {
    state = PAYROLL_AUTO_LOCK_PLAN_STATUS.CLOSING;
    gateState = 'RULES_PENDING';
  } else if (uniqueBlockers.length === 0) {
    state = status === PAYROLL_AUTO_LOCK_PLAN_STATUS.CLOSING
      ? PAYROLL_AUTO_LOCK_PLAN_STATUS.SNAPSHOT_VALIDATED
      : PAYROLL_AUTO_LOCK_PLAN_STATUS.READY_FOR_LOCK;
  }
  return {
    state,
    gateState,
    due,
    rulesReady,
    blockers: uniqueBlockers,
    snapshotIssues,
    digest,
    finalizedSnapshots
  };
};

const createFinalPayrollSnapshot = (stagedSnapshot = {}, lockedAt = '') => {
  const {
    id: stagedSnapshotId,
    snapshotId,
    planId,
    preparedAt,
    integrityStatus,
    needsReview,
    missingSnapshotFields,
    ...snapshot
  } = stagedSnapshot || {};
  if (!snapshotId || !snapshot?.employeeId || !snapshot?.companyId || !snapshot?.periodId) return null;
  return {
    ...snapshot,
    id: snapshotId,
    status: 'LOCKED',
    lockedAt: `${lockedAt || ''}`,
    isArchived: false
  };
};

const createDebtRolloverArtifacts = ({ companyId = '', monthKey = '', snapshot = {}, lockedAt = '' } = {}) => {
  const sourceMonthKey = normalizePayrollMonthKey(monthKey);
  const targetMonthKey = getNextPayrollMonthKey(sourceMonthKey);
  const employeeId = `${snapshot?.employeeId || ''}`.trim();
  const amount = getEndingDebt(snapshot?.salaryDetails || {});
  const carryoverId = buildPayrollDebtCarryoverId(companyId, targetMonthKey, employeeId);
  if (!sourceMonthKey || !targetMonthKey || !employeeId || !amount || !carryoverId) return null;

  const carryover = {
    id: carryoverId,
    companyId: `${companyId || ''}`,
    employeeId,
    sourcePeriodId: snapshot.periodId,
    sourceSnapshotId: snapshot.id,
    sourceMonthKey,
    targetMonthKey,
    amount,
    status: 'carried_over',
    transferredAt: `${lockedAt || ''}`,
    isArchived: false
  };
  const journalEntry = {
    id: `payroll_rollover_${carryoverId}`,
    carryoverId,
    companyId: carryover.companyId,
    employeeId,
    type: 'payroll_debt_rollover',
    action: 'payroll_period_locked',
    sourcePeriodId: carryover.sourcePeriodId,
    sourceSnapshotId: carryover.sourceSnapshotId,
    sourceMonthKey,
    targetMonthKey,
    amount,
    actorType: 'system',
    actorName: 'Hệ thống',
    employeeName: snapshot?.employee?.name || snapshot?.employee?.displayName || '',
    message: `Đã khóa kỳ lương ${sourceMonthKey} và chuyển dư nợ ${amount} sang ${targetMonthKey}.`,
    date: `${lockedAt || ''}`.slice(0, 10),
    createdAt: `${lockedAt || ''}`,
    isArchived: false
  };
  return { carryover, journalEntry };
};

module.exports = {
  PAYROLL_AUTO_LOCK_PLAN_STATUS,
  PAYROLL_RULES_VERSION,
  buildPayrollDebtCarryoverId,
  buildPayrollAutoLockDigest,
  createDebtRolloverArtifacts,
  createFinalPayrollSnapshot,
  getPayrollMonthEndDateKey,
  getVietnamClock,
  inspectFinalPayrollSnapshot,
  inspectPayrollAutoLockCandidate,
  isLockedPayrollStatus,
  isCompleteFinalPayrollSnapshot,
  isPendingPayrollAdjustment,
  isPayrollAutoLockDue,
  isValidPayrollClosingSchedule,
  normalizePayrollAutoLockStatus,
  normalizePayrollMonthKey,
  runPayrollAutoLockPlanStateMachine
};
