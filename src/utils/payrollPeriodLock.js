const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;

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
  responsibilitySalary: employee?.responsibilitySalary ?? 0
});

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
  employee = {},
  salaryDetails = {},
  orderIndex = 0,
  lockedAt = '',
  lockedByEmployeeId = ''
} = {}) => {
  const normalizedMonthKey = normalizePayrollMonthKey(monthKey);
  const employeeId = `${employee?.id || ''}`;
  const id = buildPayrollSnapshotId(companyId, normalizedMonthKey, employeeId);
  if (!id || !employeeId) return null;

  return {
    id,
    companyId: `${companyId || ''}`,
    periodId: buildPayrollPeriodId(companyId, normalizedMonthKey),
    monthKey: normalizedMonthKey,
    employeeId,
    orderIndex: Math.max(0, Number(orderIndex) || 0),
    employee: toSnapshotValue(pickEmployeeSnapshot(employee)),
    salaryDetails: toSnapshotValue({ ...salaryDetails, monthKey: normalizedMonthKey }),
    lockedAt: `${lockedAt || ''}`,
    lockedByEmployeeId: `${lockedByEmployeeId || ''}`,
    isArchived: false
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
  if (!id) return null;

  return {
    id,
    companyId: `${companyId || ''}`,
    monthKey: normalizedMonthKey,
    status: 'locked',
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
    && period?.status === 'locked'
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
      && !snapshot?.isArchived
      && (!allowedIds || allowedIds.has(snapshot.employeeId))
    ))
    .sort((left, right) => (Number(left?.orderIndex) || 0) - (Number(right?.orderIndex) || 0))
    .map(snapshot => ({
      emp: toSnapshotValue(snapshot.employee),
      details: toSnapshotValue(snapshot.salaryDetails),
      snapshotId: snapshot.id
    }));
};
