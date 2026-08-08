import { buildPayrollPeriodId, normalizePayrollMonthKey } from './payrollPeriodLock.js';

const toMoney = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

const toSignedMoney = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};

const sanitizeIdPart = (value = '') => (
  `${value || ''}`.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
);

export const getNextPayrollMonthKey = (monthKey = '') => {
  const normalizedMonthKey = normalizePayrollMonthKey(monthKey);
  if (!normalizedMonthKey) return '';
  const [year, month] = normalizedMonthKey.split('-').map(Number);
  const next = new Date(year, month, 1);
  return `${next.getFullYear()}-${`${next.getMonth() + 1}`.padStart(2, '0')}`;
};

export const getPreviousPayrollMonthKey = (monthKey = '') => {
  const normalizedMonthKey = normalizePayrollMonthKey(monthKey);
  if (!normalizedMonthKey) return '';
  const [year, month] = normalizedMonthKey.split('-').map(Number);
  const previous = new Date(year, month - 2, 1);
  return `${previous.getFullYear()}-${`${previous.getMonth() + 1}`.padStart(2, '0')}`;
};

export const buildPayrollDebtCarryoverId = (companyId = '', targetMonthKey = '', employeeId = '') => {
  const safeCompanyId = sanitizeIdPart(companyId);
  const safeTargetMonthKey = normalizePayrollMonthKey(targetMonthKey);
  const safeEmployeeId = sanitizeIdPart(employeeId);
  return safeCompanyId && safeTargetMonthKey && safeEmployeeId
    ? `payroll_debt_${safeCompanyId}_${safeTargetMonthKey}_${safeEmployeeId}`
    : '';
};

export const buildPayrollAutoLockPlanId = (companyId = '', monthKey = '') => {
  const safeCompanyId = sanitizeIdPart(companyId);
  const safeMonthKey = normalizePayrollMonthKey(monthKey);
  return safeCompanyId && safeMonthKey ? `payroll_auto_lock_${safeCompanyId}_${safeMonthKey}` : '';
};

export const buildPayrollAutoLockPlanSnapshotId = (planId = '', employeeId = '') => {
  const safePlanId = sanitizeIdPart(planId);
  const safeEmployeeId = sanitizeIdPart(employeeId);
  return safePlanId && safeEmployeeId ? `${safePlanId}_${safeEmployeeId}` : '';
};

export const getPayrollEndingDebt = (salaryDetails = {}) => {
  const explicitEndingDebt = toMoney(salaryDetails?.endingDebt);
  if (explicitEndingDebt > 0) return explicitEndingDebt;
  return Math.max(0, -toSignedMoney(salaryDetails?.netSalary));
};

export const getEmployeePayrollOpeningDebt = (
  carryovers = [],
  companyId = '',
  monthKey = '',
  employeeId = ''
) => {
  const normalizedMonthKey = normalizePayrollMonthKey(monthKey);
  const matchingCarryover = (Array.isArray(carryovers) ? carryovers : []).find(carryover => (
    !carryover?.isArchived
    && `${carryover?.companyId || ''}` === `${companyId || ''}`
    && normalizePayrollMonthKey(carryover?.targetMonthKey) === normalizedMonthKey
    && `${carryover?.employeeId || ''}` === `${employeeId || ''}`
  ));

  return matchingCarryover ? toMoney(matchingCarryover.amount) : 0;
};

// Keep the existing salary formula intact. This adapter only applies a previous,
// locked debt against the positive amount that is actually payable this month.
export const applyPayrollOpeningDebtToSalaryDetails = (salaryDetails = null, openingDebt = 0) => {
  if (!salaryDetails) return null;

  const netSalaryBeforeOpeningDebt = toSignedMoney(salaryDetails.netSalary);
  const normalizedOpeningDebt = toMoney(openingDebt);
  const payableBeforeOpeningDebt = Math.max(0, netSalaryBeforeOpeningDebt);
  const currentPeriodDebt = Math.max(0, -netSalaryBeforeOpeningDebt);
  const openingDebtApplied = Math.min(normalizedOpeningDebt, payableBeforeOpeningDebt);
  const endingDebt = Math.max(0, normalizedOpeningDebt - openingDebtApplied) + currentPeriodDebt;
  const existingDeductionTotal = toMoney(salaryDetails.deductionTotal);

  return {
    ...salaryDetails,
    netSalaryBeforeOpeningDebt,
    openingDebt: normalizedOpeningDebt,
    openingDebtApplied,
    currentPeriodDebt,
    endingDebt,
    deductionTotal: existingDeductionTotal + openingDebtApplied,
    netSalary: Math.max(0, payableBeforeOpeningDebt - openingDebtApplied)
  };
};

export const createPayrollDebtCarryover = ({
  companyId = '',
  sourceMonthKey = '',
  employeeId = '',
  sourceSnapshotId = '',
  salaryDetails = {},
  transferredAt = '',
  sourcePeriodId = ''
} = {}) => {
  const normalizedSourceMonthKey = normalizePayrollMonthKey(sourceMonthKey);
  const targetMonthKey = getNextPayrollMonthKey(normalizedSourceMonthKey);
  const normalizedEmployeeId = `${employeeId || ''}`.trim();
  const amount = getPayrollEndingDebt(salaryDetails);
  const id = buildPayrollDebtCarryoverId(companyId, targetMonthKey, normalizedEmployeeId);
  if (!id || !amount) return null;

  return {
    id,
    companyId: `${companyId || ''}`,
    employeeId: normalizedEmployeeId,
    sourcePeriodId: sourcePeriodId || buildPayrollPeriodId(companyId, normalizedSourceMonthKey),
    sourceSnapshotId: `${sourceSnapshotId || ''}`,
    sourceMonthKey: normalizedSourceMonthKey,
    targetMonthKey,
    amount,
    status: 'carried_over',
    transferredAt: `${transferredAt || ''}`,
    isArchived: false
  };
};

export const createPayrollDebtJournalEntry = ({
  carryover = null,
  employee = /** @type {Record<string, any>} */ ({}),
  lockedAt = ''
} = {}) => {
  if (!carryover?.id || !carryover?.amount) return null;
  return {
    id: `payroll_rollover_${carryover.id}`,
    carryoverId: carryover.id,
    companyId: carryover.companyId,
    employeeId: carryover.employeeId,
    type: 'payroll_debt_rollover',
    action: 'payroll_period_locked',
    sourcePeriodId: carryover.sourcePeriodId,
    sourceSnapshotId: carryover.sourceSnapshotId,
    sourceMonthKey: carryover.sourceMonthKey,
    targetMonthKey: carryover.targetMonthKey,
    amount: carryover.amount,
    actorType: 'system',
    actorName: 'Hệ thống',
    employeeName: employee?.name || employee?.displayName || '',
    message: `Đã khóa kỳ lương ${carryover.sourceMonthKey} và chuyển dư nợ ${carryover.amount} sang ${carryover.targetMonthKey}.`,
    date: `${lockedAt || ''}`.slice(0, 10),
    createdAt: `${lockedAt || ''}`,
    isArchived: false
  };
};

export const createPayrollPeriodLockJournalEntry = ({
  companyId = '',
  periodId = '',
  monthKey = '',
  lockedAt = '',
  employeeCount = 0,
  totalEndingDebt = 0
} = {}) => {
  const normalizedMonthKey = normalizePayrollMonthKey(monthKey);
  const safePeriodId = `${periodId || buildPayrollPeriodId(companyId, normalizedMonthKey)}`.trim();
  if (!companyId || !safePeriodId || !normalizedMonthKey) return null;

  const normalizedEndingDebt = toMoney(totalEndingDebt);
  return {
    id: `payroll_period_lock_${safePeriodId}`,
    companyId: `${companyId}`,
    type: 'payroll_period_lock',
    action: 'payroll_period_locked',
    periodId: safePeriodId,
    monthKey: normalizedMonthKey,
    amount: normalizedEndingDebt,
    employeeCount: Math.max(0, Number(employeeCount) || 0),
    actorType: 'system',
    actorName: 'Hệ thống',
    message: normalizedEndingDebt > 0
      ? `Đã khóa kỳ lương ${normalizedMonthKey} và chuyển tổng dư nợ ${normalizedEndingDebt} sang kỳ sau.`
      : `Đã khóa kỳ lương ${normalizedMonthKey}; không có dư nợ cần chuyển sang kỳ sau.`,
    date: `${lockedAt || ''}`.slice(0, 10),
    createdAt: `${lockedAt || ''}`,
    isArchived: false
  };
};

export const createPayrollDebtCarryovers = ({
  companyId = '',
  monthKey = '',
  snapshots = [],
  employees = [],
  lockedAt = ''
} = {}) => {
  const employeesById = new Map((Array.isArray(employees) ? employees : []).map(employee => [employee?.id, employee]));
  return (Array.isArray(snapshots) ? snapshots : [])
    .map(snapshot => {
      const carryover = createPayrollDebtCarryover({
        companyId,
        sourceMonthKey: monthKey,
        employeeId: snapshot?.employeeId,
        sourceSnapshotId: snapshot?.id,
        salaryDetails: snapshot?.salaryDetails,
        transferredAt: lockedAt,
        sourcePeriodId: snapshot?.periodId
      });
      if (!carryover) return null;
      return {
        carryover,
        journalEntry: createPayrollDebtJournalEntry({
          carryover,
          employee: employeesById.get(snapshot?.employeeId) || snapshot?.employee,
          lockedAt
        })
      };
    })
    .filter(Boolean);
};
