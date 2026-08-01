const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;

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

const isPayrollAutoLockDue = (monthKey = '', clock = getVietnamClock()) => {
  const monthEndDateKey = getPayrollMonthEndDateKey(monthKey);
  if (!monthEndDateKey || !clock?.dateKey) return false;
  if (clock.dateKey > monthEndDateKey) return true;
  if (clock.dateKey < monthEndDateKey) return false;
  return Number(clock.hour) === 23 && Number(clock.minute) >= 59;
};

const createFinalPayrollSnapshot = (stagedSnapshot = {}, lockedAt = '') => {
  const {
    id: stagedSnapshotId,
    snapshotId,
    planId,
    preparedAt,
    ...snapshot
  } = stagedSnapshot || {};
  if (!snapshotId || !snapshot?.employeeId || !snapshot?.companyId || !snapshot?.periodId) return null;
  return {
    ...snapshot,
    id: snapshotId,
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
    companyId: carryover.companyId,
    employeeId,
    type: 'payroll_debt_rollover',
    action: 'payroll_period_locked',
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
  buildPayrollDebtCarryoverId,
  createDebtRolloverArtifacts,
  createFinalPayrollSnapshot,
  getPayrollMonthEndDateKey,
  getVietnamClock,
  isPayrollAutoLockDue,
  normalizePayrollMonthKey
};
