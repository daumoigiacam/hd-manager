import { buildPayrollDebtCarryoverId, getNextPayrollMonthKey } from './payrollDebtCarryover.js';

const toMoney = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};

const safeClone = (value) => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(safeClone);
  return Object.entries(value).reduce((result, [key, nestedValue]) => {
    if (nestedValue !== undefined) result[key] = safeClone(nestedValue);
    return result;
  }, {});
};

const sanitizeIdPart = (value = '') => (
  `${value || ''}`.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
);

export const buildPayrollAdjustmentId = (snapshotId = '', createdAt = '') => {
  const safeSnapshotId = sanitizeIdPart(snapshotId);
  const timestamp = new Date(createdAt || Date.now()).getTime();
  return safeSnapshotId && Number.isFinite(timestamp)
    ? `payroll_adjustment_${safeSnapshotId}_${timestamp}`
    : '';
};

export const createPayrollAdjustment = ({
  period = /** @type {Record<string, any>} */ ({}),
  snapshot = /** @type {Record<string, any>} */ ({}),
  previousAdjustment = null,
  nextNetSalary = 0,
  nextEndingDebt = 0,
  reason = '',
  adjustedAt = '',
  adjustedByEmployeeId = '',
  adjustedByName = '',
  adjustedByRole = ''
} = {}) => {
  const normalizedReason = `${reason || ''}`.trim();
  const createdAt = `${adjustedAt || new Date().toISOString()}`;
  const baseDetails = previousAdjustment?.afterSalaryDetails || snapshot?.salaryDetails;
  if (!snapshot?.id || !snapshot?.employeeId || !baseDetails || !normalizedReason) return null;

  const beforeSalaryDetails = safeClone(baseDetails);
  const afterSalaryDetails = {
    ...safeClone(baseDetails),
    netSalary: Math.max(0, toMoney(nextNetSalary)),
    endingDebt: Math.max(0, toMoney(nextEndingDebt)),
    adjustedAfterLock: true
  };
  const id = buildPayrollAdjustmentId(snapshot.id, createdAt);
  if (!id) return null;

  return {
    id,
    companyId: snapshot.companyId || period.companyId || '',
    periodId: snapshot.periodId || period.id || '',
    monthKey: snapshot.monthKey || period.monthKey || '',
    snapshotId: snapshot.id,
    employeeId: snapshot.employeeId,
    sequence: Math.max(1, Number(previousAdjustment?.sequence || 0) + 1),
    status: 'ADJUSTED',
    reason: normalizedReason,
    beforeSalaryDetails,
    afterSalaryDetails,
    differences: {
      netSalary: afterSalaryDetails.netSalary - toMoney(beforeSalaryDetails.netSalary),
      endingDebt: afterSalaryDetails.endingDebt - Math.max(0, toMoney(beforeSalaryDetails.endingDebt))
    },
    adjustedAt: createdAt,
    adjustedByEmployeeId: `${adjustedByEmployeeId || ''}`,
    adjustedByName: `${adjustedByName || ''}`,
    adjustedByRole: `${adjustedByRole || ''}`,
    previousAdjustmentId: previousAdjustment?.id || '',
    isArchived: false
  };
};

export const createPayrollAdjustmentAuditLog = (
  adjustment = /** @type {Record<string, any>} */ ({})
) => {
  if (!adjustment?.id) return null;
  return {
    id: `audit_${adjustment.id}`,
    adjustmentId: adjustment.id,
    companyId: adjustment.companyId,
    type: 'payroll_adjustment',
    action: 'locked_payroll_adjusted',
    periodId: adjustment.periodId,
    monthKey: adjustment.monthKey,
    snapshotId: adjustment.snapshotId,
    employeeId: adjustment.employeeId,
    reason: adjustment.reason,
    before: safeClone(adjustment.beforeSalaryDetails),
    after: safeClone(adjustment.afterSalaryDetails),
    differences: safeClone(adjustment.differences),
    actorType: 'employee',
    actorEmployeeId: adjustment.adjustedByEmployeeId,
    actorName: adjustment.adjustedByName,
    actorRole: adjustment.adjustedByRole,
    date: `${adjustment.adjustedAt || ''}`.slice(0, 10),
    createdAt: adjustment.adjustedAt,
    isArchived: false
  };
};

export const getLatestPayrollAdjustmentsBySnapshot = (adjustments = []) => {
  const latestBySnapshot = new Map();
  (Array.isArray(adjustments) ? adjustments : [])
    .filter(adjustment => adjustment?.snapshotId && !adjustment?.isArchived)
    .forEach(adjustment => {
      const current = latestBySnapshot.get(adjustment.snapshotId);
      const currentSequence = Number(current?.sequence || 0);
      const nextSequence = Number(adjustment?.sequence || 0);
      if (
        !current
        || nextSequence > currentSequence
        || (nextSequence === currentSequence && `${adjustment?.adjustedAt || ''}` > `${current?.adjustedAt || ''}`)
      ) {
        latestBySnapshot.set(adjustment.snapshotId, adjustment);
      }
    });
  return latestBySnapshot;
};

export const applyPayrollAdjustmentsToSnapshots = (snapshots = [], adjustments = []) => {
  const latestBySnapshot = getLatestPayrollAdjustmentsBySnapshot(adjustments);
  return (Array.isArray(snapshots) ? snapshots : []).map(snapshot => {
    const adjustment = latestBySnapshot.get(snapshot?.id);
    if (!adjustment) return snapshot;
    return {
      ...snapshot,
      effectiveSalaryDetails: safeClone(adjustment.afterSalaryDetails),
      latestAdjustment: safeClone(adjustment),
      status: 'ADJUSTED'
    };
  });
};

export const buildAdjustedDebtCarryoverPatch = ({
  adjustment = /** @type {Record<string, any>} */ ({}),
  existingCarryover = null
} = {}) => {
  const targetMonthKey = getNextPayrollMonthKey(adjustment?.monthKey);
  const id = buildPayrollDebtCarryoverId(adjustment?.companyId, targetMonthKey, adjustment?.employeeId);
  if (!id) return null;
  const amount = Math.max(0, toMoney(adjustment?.afterSalaryDetails?.endingDebt));
  if (amount <= 0) {
    return existingCarryover
      ? {
          ...existingCarryover,
          id,
          amount: 0,
          status: 'cleared_by_adjustment',
          isArchived: true,
          adjustedByPayrollAdjustmentId: adjustment.id,
          updatedAt: adjustment.adjustedAt
        }
      : null;
  }
  return {
    ...(existingCarryover || {}),
    id,
    companyId: adjustment.companyId,
    employeeId: adjustment.employeeId,
    sourcePeriodId: adjustment.periodId,
    sourceSnapshotId: adjustment.snapshotId,
    sourceMonthKey: adjustment.monthKey,
    targetMonthKey,
    amount,
    status: 'adjusted_carry_over',
    adjustedByPayrollAdjustmentId: adjustment.id,
    updatedAt: adjustment.adjustedAt,
    transferredAt: existingCarryover?.transferredAt || adjustment.adjustedAt,
    isArchived: false
  };
};
