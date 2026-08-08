import {
  resolveStoredEmployeePayrollPolicy
} from './payrollPolicyHistory.js';
import { inspectPayrollSnapshot } from './payrollSnapshotIntegrity.js';

const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;

export const PAYROLL_PERIOD_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  REVIEW: 'REVIEW',
  LOCKED: 'LOCKED',
  ADJUSTED: 'ADJUSTED'
});

export const PAYROLL_SNAPSHOT_SCHEMA_VERSION = 2;
export const PAYROLL_RULES_VERSION = 'PAYROLL_FREEZE_RULES_V2';

export const PAYROLL_AUTO_LOCK_PLAN_STATUS = Object.freeze({
  OPEN: 'OPEN',
  CLOSING: 'CLOSING',
  SNAPSHOT_VALIDATED: 'SNAPSHOT_VALIDATED',
  READY_FOR_LOCK: 'READY_FOR_LOCK',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  LOCKED: 'LOCKED'
});

const normalizeDateKey = (value = '') => {
  const raw = `${value || ''}`.trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
};

const sanitizeDocumentIdPart = (value = '') => (
  `${value || ''}`.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
);

const toSnapshotValue = (value) => {
  if (value === null || value === undefined) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toSnapshotValue);
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (typeof value?.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (typeof value === 'object') {
    return Object.entries(value).reduce((result, [key, nestedValue]) => {
      const safeValue = toSnapshotValue(nestedValue);
      if (safeValue !== undefined) result[key] = safeValue;
      return result;
    }, {});
  }
  return `${value}`;
};

const pickEmployeeSnapshot = (employee = {}) => ({
  id: `${employee?.id || ''}`,
  name: employee?.name || employee?.displayName || employee?.phone || 'Nhân sự',
  phone: employee?.phone || employee?.phoneNumber || '',
  position: employee?.position || '',
  role: employee?.role || '',
  department: employee?.department || '',
  commissionRate: employee?.commissionRate ?? 0,
  startDate: employee?.startDate || '',
  basicSalary: employee?.basicSalary ?? 0,
  supportSalary: employee?.supportSalary ?? 0,
  responsibilitySalary: employee?.responsibilitySalary ?? 0,
  experienceSalary: employee?.experienceSalary ?? 0,
  experienceSalaryPeriod: employee?.experienceSalaryPeriod || 'months',
  salaryMonthDays: employee?.salaryMonthDays ?? '',
  targetRevenue: employee?.targetRevenue ?? 0,
  commissionBaseMode: employee?.commissionBaseMode || 'above_target'
});

const buildCalculationSnapshot = (salaryDetails = {}) => ({
  inputs: {
    monthKey: salaryDetails?.monthKey || '',
    workDays: salaryDetails?.workDays ?? 0,
    workDaysProbation: salaryDetails?.workDaysProbation ?? 0,
    workDaysOfficial: salaryDetails?.workDaysOfficial ?? 0,
    attendanceEntries: salaryDetails?.attendanceEntries || [],
    performance: salaryDetails?.perf || {},
    salesRevenue: salaryDetails?.salesRevenue ?? 0,
    bonusRecords: salaryDetails?.bonusRecords || [],
    penaltyRecords: salaryDetails?.penaltyRecords || [],
    advanceRecords: salaryDetails?.advanceRecords || [],
    employeePurchaseRecords: salaryDetails?.employeePurchaseRecords || [],
    openingDebt: salaryDetails?.openingDebt ?? 0,
    evaluationResult: salaryDetails?.evaluationResult || null
  },
  additions: {
    baseSalary: salaryDetails?.baseSalaryCalc ?? 0,
    supportSalary: salaryDetails?.supportSalary ?? 0,
    responsibilitySalary: salaryDetails?.responsibilitySalary ?? 0,
    roleSalary: salaryDetails?.roleSalary ?? 0,
    experienceSalary: salaryDetails?.experienceSalary ?? 0,
    commission: salaryDetails?.commission ?? 0,
    overtimePay: salaryDetails?.overtimePay ?? 0,
    totalBonus: salaryDetails?.totalBonus ?? 0,
    evaluationBonus: salaryDetails?.evaluationBonus ?? 0
  },
  deductions: {
    totalPenalty: salaryDetails?.totalPenalty ?? 0,
    totalAdvance: salaryDetails?.totalAdvance ?? 0,
    totalEmployeePurchase: salaryDetails?.totalEmployeePurchase ?? 0,
    badDebt: salaryDetails?.badDebt ?? 0,
    openingDebtApplied: salaryDetails?.openingDebtApplied ?? 0,
    deductionTotal: salaryDetails?.deductionTotal ?? 0
  },
  results: {
    grossSalary: salaryDetails?.grossSalary ?? 0,
    netSalaryBeforeOpeningDebt: salaryDetails?.netSalaryBeforeOpeningDebt ?? salaryDetails?.netSalary ?? 0,
    netSalary: salaryDetails?.netSalary ?? 0,
    endingDebt: salaryDetails?.endingDebt ?? 0
  }
});

export const normalizePayrollPeriodStatus = (status = '') => {
  const normalized = `${status || ''}`.trim().toUpperCase();
  const knownStatuses = /** @type {string[]} */ (Object.values(PAYROLL_PERIOD_STATUS));
  if (knownStatuses.includes(normalized)) return normalized;
  return ['CLOSED', 'AUTO_LOCKED'].includes(normalized)
    ? PAYROLL_PERIOD_STATUS.LOCKED
    : PAYROLL_PERIOD_STATUS.DRAFT;
};

export const isPayrollPeriodLocked = (periodOrStatus = '') => {
  const safePeriodOrStatus = /** @type {any} */ (periodOrStatus);
  const status = safePeriodOrStatus && typeof safePeriodOrStatus === 'object'
    ? safePeriodOrStatus.status
    : safePeriodOrStatus;
  const normalized = normalizePayrollPeriodStatus(status || '');
  return normalized === PAYROLL_PERIOD_STATUS.LOCKED || normalized === PAYROLL_PERIOD_STATUS.ADJUSTED;
};

export const normalizePayrollMonthKey = (value = '') => {
  const raw = `${value || ''}`.trim();
  const match = raw.match(MONTH_KEY_PATTERN);
  if (!match) return '';
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? `${match[1]}-${match[2]}` : '';
};

export const getPayrollMonthEndDateKey = (monthKey = '') => {
  const normalizedMonthKey = normalizePayrollMonthKey(monthKey);
  if (!normalizedMonthKey) return '';
  const [year, month] = normalizedMonthKey.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${normalizedMonthKey}-${`${lastDay}`.padStart(2, '0')}`;
};

export const canLockPayrollPeriodAtDate = (monthKey = '', todayKey = '') => {
  const monthEndDateKey = getPayrollMonthEndDateKey(monthKey);
  const normalizedTodayKey = normalizeDateKey(todayKey);
  return Boolean(monthEndDateKey && normalizedTodayKey && normalizedTodayKey >= monthEndDateKey);
};

export const buildPayrollPeriodId = (companyId = '', monthKey = '') => {
  const safeCompanyId = sanitizeDocumentIdPart(companyId);
  const safeMonthKey = normalizePayrollMonthKey(monthKey);
  return safeCompanyId && safeMonthKey ? `payroll_${safeCompanyId}_${safeMonthKey}` : '';
};

export const buildPayrollSnapshotId = (companyId = '', monthKey = '', employeeId = '') => {
  const periodId = buildPayrollPeriodId(companyId, monthKey);
  const safeEmployeeId = sanitizeDocumentIdPart(employeeId);
  return periodId && safeEmployeeId ? `${periodId}_${safeEmployeeId}` : '';
};

export const createPayrollEmployeeSnapshot = ({
  companyId = '',
  monthKey = '',
  employee = /** @type {Record<string, any>} */ ({}),
  salaryDetails = /** @type {Record<string, any>} */ ({}),
  orderIndex = 0,
  lockedAt = '',
  lockedByEmployeeId = ''
} = {}) => {
  const normalizedMonthKey = normalizePayrollMonthKey(monthKey);
  const employeeId = `${employee?.id || ''}`;
  const id = buildPayrollSnapshotId(companyId, normalizedMonthKey, employeeId);
  if (!id || !employeeId) return null;
  const resolvedPolicy = resolveStoredEmployeePayrollPolicy(employee, normalizedMonthKey);
  const policySnapshot = resolvedPolicy
    ? {
        ...resolvedPolicy,
        values: resolvedPolicy.values || {}
      }
    : null;

  const snapshot = {
    id,
    companyId: `${companyId || ''}`,
    periodId: buildPayrollPeriodId(companyId, normalizedMonthKey),
    monthKey: normalizedMonthKey,
    employeeId,
    orderIndex: Math.max(0, Number(orderIndex) || 0),
    status: policySnapshot ? PAYROLL_PERIOD_STATUS.LOCKED : PAYROLL_PERIOD_STATUS.REVIEW,
    schemaVersion: PAYROLL_SNAPSHOT_SCHEMA_VERSION,
    formulaVersion: policySnapshot?.formulaVersion || '',
    policyVersion: policySnapshot?.version || '',
    policyEffectiveFrom: policySnapshot?.effectiveFrom || '',
    policyEffectiveTo: policySnapshot?.effectiveTo || '',
    policySnapshot: toSnapshotValue(policySnapshot),
    employee: toSnapshotValue(pickEmployeeSnapshot(employee)),
    salaryDetails: toSnapshotValue({ ...salaryDetails, monthKey: normalizedMonthKey }),
    calculationSnapshot: toSnapshotValue(buildCalculationSnapshot({ ...salaryDetails, monthKey: normalizedMonthKey })),
    lockedAt: `${lockedAt || ''}`,
    lockedByEmployeeId: `${lockedByEmployeeId || ''}`,
    isArchived: false
  };
  const integrity = inspectPayrollSnapshot(snapshot);
  return {
    ...snapshot,
    integrityStatus: integrity.status,
    needsReview: integrity.needsReview,
    missingSnapshotFields: integrity.missingFields
  };
};

export const createPayrollPeriodRecord = ({
  companyId = '',
  monthKey = '',
  snapshots = [],
  totals = {},
  lockedAt = '',
  lockedByEmployeeId = '',
  lockedByName = '',
  lockedByRole = ''
} = {}) => {
  const normalizedMonthKey = normalizePayrollMonthKey(monthKey);
  const id = buildPayrollPeriodId(companyId, normalizedMonthKey);
  const validSnapshots = (Array.isArray(snapshots) ? snapshots : []).filter(Boolean);
  if (!id || validSnapshots.length === 0 || validSnapshots.some(snapshot => !inspectPayrollSnapshot(snapshot).isComplete)) {
    return null;
  }
  const formulaVersions = [...new Set(validSnapshots.map(snapshot => snapshot.formulaVersion))];

  return {
    id,
    companyId: `${companyId || ''}`,
    monthKey: normalizedMonthKey,
    status: PAYROLL_PERIOD_STATUS.LOCKED,
    schemaVersion: PAYROLL_SNAPSHOT_SCHEMA_VERSION,
    formulaVersion: formulaVersions.length === 1 ? formulaVersions[0] : 'MIXED',
    formulaVersions,
    policyVersions: [...new Set(validSnapshots.map(snapshot => snapshot.policyVersion))],
    employeeCount: validSnapshots.length,
    snapshotIds: validSnapshots.map(snapshot => snapshot.id),
    totals: toSnapshotValue(totals || {}),
    lockedAt: `${lockedAt || ''}`,
    lockedByEmployeeId: `${lockedByEmployeeId || ''}`,
    lockedByName: `${lockedByName || ''}`,
    lockedByRole: `${lockedByRole || ''}`,
    createdAt: `${lockedAt || ''}`,
    updatedAt: `${lockedAt || ''}`,
    isArchived: false
  };
};

export const getLockedPayrollPeriod = (periods = [], companyId = '', monthKey = '') => {
  const normalizedMonthKey = normalizePayrollMonthKey(monthKey);
  return (Array.isArray(periods) ? periods : []).find(period => (
    period?.companyId === companyId
    && normalizePayrollMonthKey(period?.monthKey) === normalizedMonthKey
    && isPayrollPeriodLocked(period)
    && !period?.isArchived
  )) || null;
};

export const mapPayrollSnapshotsToRows = (snapshots = [], allowedEmployeeIds = null) => {
  const allowedIds = allowedEmployeeIds instanceof Set ? allowedEmployeeIds : null;
  return (Array.isArray(snapshots) ? snapshots : [])
    .filter(snapshot => (
      snapshot?.employeeId
      && snapshot?.employee
      && snapshot?.salaryDetails
      && inspectPayrollSnapshot(snapshot).hasFrozenDisplayResult
      && !snapshot?.isArchived
      && (!allowedIds || allowedIds.has(snapshot.employeeId))
    ))
    .sort((left, right) => (Number(left?.orderIndex) || 0) - (Number(right?.orderIndex) || 0))
    .map(snapshot => {
      const integrity = inspectPayrollSnapshot(snapshot);
      return {
        emp: toSnapshotValue(snapshot.employee),
        details: toSnapshotValue(snapshot.effectiveSalaryDetails || snapshot.salaryDetails),
        snapshotId: snapshot.id,
        snapshot: toSnapshotValue(snapshot),
        policySnapshot: toSnapshotValue(snapshot.policySnapshot || null),
        latestAdjustment: toSnapshotValue(snapshot.latestAdjustment || null),
        snapshotIntegrity: integrity.status,
        snapshotNeedsReview: integrity.needsReview,
        snapshotMissingFields: integrity.missingFields
      };
    });
};
