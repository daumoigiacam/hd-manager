const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const PAYROLL_POLICY_SCHEMA_VERSION = 1;
export const PAYROLL_FORMULA_VERSION = 'HD_PAYROLL_FORMULA_V1';

// These are the employee fields consumed by the existing payroll formula.
// Keeping the list here prevents a later profile edit from changing a locked period.
export const PAYROLL_POLICY_FIELDS = Object.freeze([
  'position',
  'primaryPosition',
  'secondaryPositions',
  'additionalPositions',
  'departments',
  'startDate',
  'probationDuration',
  'probationUnit',
  'probationRate',
  'basicSalary',
  'salaryMonthDays',
  'supportSalary',
  'responsibilitySalary',
  'experienceSalary',
  'experienceSalaryPeriod',
  'roleSalaryComponents',
  'departmentSalaryComponents',
  'salaryByDepartment',
  'commissionRate',
  'commissionBaseMode',
  'targetRevenue',
  'salesLeaderId',
  'salesManagerId',
  'parentSalesEmpId',
  'managerEmpId',
  'salesLeaderCommissionPercent',
  'leaderCommissionPercent',
  'managerCommissionPercent',
  'overtimeRate',
  'latePenaltyRate',
  'latePenaltyTiers',
  'autoEarlyOvertimeEnabled',
  'autoLateCheckoutOvertimeEnabled',
  'shiftName',
  'shiftStart',
  'shiftEnd',
  'shiftIsOvernight',
  'graceMinutes'
]);

const cloneValue = (value) => {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneValue);
  return Object.entries(value).reduce((result, [key, nestedValue]) => {
    const cloned = cloneValue(nestedValue);
    if (cloned !== undefined) result[key] = cloned;
    return result;
  }, {});
};

const normalizeDateKey = (value = '') => {
  const raw = `${value || ''}`.trim().slice(0, 10);
  if (!DATE_KEY_PATTERN.test(raw)) return '';
  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : raw;
};

const getMonthBounds = (monthKey = '') => {
  const match = `${monthKey || ''}`.match(/^(\d{4})-(\d{2})$/);
  if (!match) return { start: '', end: '' };
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return { start: '', end: '' };
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${match[1]}-${match[2]}-01`,
    end: `${match[1]}-${match[2]}-${`${lastDay}`.padStart(2, '0')}`
  };
};

const subtractOneDay = (dateKey = '') => {
  const normalized = normalizeDateKey(dateKey);
  if (!normalized) return '';
  const date = new Date(`${normalized}T00:00:00`);
  date.setDate(date.getDate() - 1);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeVersionNumber = (value) => {
  const match = `${value || ''}`.match(/(\d+)$/);
  return match ? Math.max(1, Number(match[1]) || 1) : 1;
};

export const captureEmployeePayrollPolicy = (employee = {}) => (
  PAYROLL_POLICY_FIELDS.reduce((policy, fieldName) => {
    if (employee?.[fieldName] !== undefined) policy[fieldName] = cloneValue(employee[fieldName]);
    return policy;
  }, {})
);

const normalizePolicyRecord = (policy = {}, index = 0) => {
  const values = policy?.values && typeof policy.values === 'object'
    ? policy.values
    : policy?.policy && typeof policy.policy === 'object'
      ? policy.policy
      : captureEmployeePayrollPolicy(policy);
  const versionNumber = normalizeVersionNumber(policy?.version || policy?.policyVersion || index + 1);
  return {
    id: `${policy?.id || `payroll-policy-${versionNumber}`}`,
    version: `${policy?.version || policy?.policyVersion || `v${versionNumber}`}`,
    versionNumber,
    schemaVersion: Number(policy?.schemaVersion) || PAYROLL_POLICY_SCHEMA_VERSION,
    formulaVersion: `${policy?.formulaVersion || PAYROLL_FORMULA_VERSION}`,
    effectiveFrom: normalizeDateKey(policy?.effectiveFrom) || '1970-01-01',
    effectiveTo: normalizeDateKey(policy?.effectiveTo),
    values: cloneValue(values),
    createdAt: `${policy?.createdAt || ''}`,
    createdByEmployeeId: `${policy?.createdByEmployeeId || ''}`,
    createdByName: `${policy?.createdByName || ''}`,
    supersededAt: `${policy?.supersededAt || ''}`
  };
};

export const getStoredEmployeePayrollPolicyHistory = (employee = {}) => {
  const storedPolicies = Array.isArray(employee?.payrollPolicies)
    ? employee.payrollPolicies
    : Array.isArray(employee?.salaryPolicyHistory)
      ? employee.salaryPolicyHistory
      : [];

  return storedPolicies
    .filter(policy => policy && typeof policy === 'object')
    .map(normalizePolicyRecord)
    .sort((left, right) => (
      left.effectiveFrom.localeCompare(right.effectiveFrom)
      || left.versionNumber - right.versionNumber
    ));
};

export const getEmployeePayrollPolicyHistory = (employee = {}) => {
  const storedPolicies = getStoredEmployeePayrollPolicyHistory(employee);
  if (storedPolicies.length > 0) return storedPolicies;

  // This fallback is only for an unlocked live preview. It is never accepted
  // as historical evidence when a payroll snapshot is staged or locked.
  return [normalizePolicyRecord({
    id: 'unversioned-live-profile-preview',
    version: 'UNVERSIONED_LIVE_PREVIEW',
    effectiveFrom: employee?.salaryPolicyEffectiveFrom || employee?.startDate || '1970-01-01',
    values: captureEmployeePayrollPolicy(employee),
    createdAt: employee?.createdAt || '',
    createdByEmployeeId: employee?.createdByEmpId || ''
  })];
};

const resolvePolicyFromHistory = (history = [], monthKey = '') => {
  const { start, end } = getMonthBounds(monthKey);
  if (!start || !end) return history[history.length - 1] || null;

  const matchingPolicies = history.filter(policy => (
    !policy.supersededAt
    && policy.effectiveFrom <= end
    && (!policy.effectiveTo || policy.effectiveTo >= start)
  ));
  return matchingPolicies[matchingPolicies.length - 1] || null;
};

export const resolveEmployeePayrollPolicy = (employee = {}, monthKey = '') => {
  const history = getEmployeePayrollPolicyHistory(employee);
  return resolvePolicyFromHistory(history, monthKey) || history[0] || null;
};

export const resolveStoredEmployeePayrollPolicy = (employee = {}, monthKey = '') => {
  const history = getStoredEmployeePayrollPolicyHistory(employee);
  return resolvePolicyFromHistory(history, monthKey);
};

export const applyEmployeePayrollPolicyForMonth = (employee = {}, monthKey = '') => {
  const policy = resolveEmployeePayrollPolicy(employee, monthKey);
  if (!policy) return employee;
  return {
    ...employee,
    ...cloneValue(policy.values),
    resolvedPayrollPolicy: cloneValue(policy),
    payrollPolicyVersion: policy.version,
    payrollPolicyEffectiveFrom: policy.effectiveFrom,
    payrollPolicyEffectiveTo: policy.effectiveTo || ''
  };
};

const stablePolicyString = (employee = {}) => JSON.stringify(captureEmployeePayrollPolicy(employee));

export const hasEmployeePayrollPolicyChanged = (employee = {}, nextEmployee = {}) => (
  stablePolicyString(employee) !== stablePolicyString(nextEmployee)
);

export const buildEmployeePayrollPolicyUpdate = ({
  employee = null,
  nextEmployee = /** @type {Record<string, any>} */ ({}),
  effectiveFrom = '',
  changedAt = '',
  changedByEmployeeId = '',
  changedByName = ''
} = {}) => {
  const existingEmployee = employee || {};
  const history = employee ? getStoredEmployeePayrollPolicyHistory(existingEmployee) : [];
  const changed = !employee || hasEmployeePayrollPolicyChanged(existingEmployee, nextEmployee);
  if (!changed) {
    return {
      payrollPolicies: history,
      salaryPolicyHistory: history,
      salaryPolicyVersion: history[history.length - 1]?.version || '',
      salaryPolicyEffectiveFrom: history[history.length - 1]?.effectiveFrom || ''
    };
  }

  const now = `${changedAt || new Date().toISOString()}`;
  const normalizedEffectiveFrom = normalizeDateKey(effectiveFrom)
    || normalizeDateKey(nextEmployee?.salaryPolicyEffectiveFrom)
    || normalizeDateKey(nextEmployee?.startDate)
    || now.slice(0, 10);
  const nextVersionNumber = Math.max(0, ...history.map(policy => policy.versionNumber || 0)) + 1;
  const nextVersion = `v${nextVersionNumber}`;

  const activeHistory = history.map(policy => (
    !policy.supersededAt && policy.effectiveFrom === normalizedEffectiveFrom
      ? { ...policy, supersededAt: now }
      : { ...policy }
  ));
  const nextPolicy = normalizePolicyRecord({
    id: `payroll-policy-${nextVersionNumber}-${normalizedEffectiveFrom}`,
    version: nextVersion,
    effectiveFrom: normalizedEffectiveFrom,
    values: captureEmployeePayrollPolicy(nextEmployee),
    createdAt: now,
    createdByEmployeeId: changedByEmployeeId,
    createdByName: changedByName
  }, nextVersionNumber - 1);
  const combined = [...activeHistory, nextPolicy];
  const activeSorted = combined
    .filter(policy => !policy.supersededAt)
    .sort((left, right) => (
      left.effectiveFrom.localeCompare(right.effectiveFrom)
      || left.versionNumber - right.versionNumber
    ));
  const effectiveToById = new Map();
  activeSorted.forEach((policy, index) => {
    const next = activeSorted[index + 1];
    effectiveToById.set(policy.id, next ? subtractOneDay(next.effectiveFrom) : '');
  });
  const payrollPolicies = combined
    .map(policy => ({
      ...policy,
      effectiveTo: policy.supersededAt ? policy.effectiveTo || '' : effectiveToById.get(policy.id) || ''
    }))
    .sort((left, right) => left.versionNumber - right.versionNumber);

  return {
    payrollPolicies,
    salaryPolicyHistory: payrollPolicies,
    salaryPolicyVersion: nextVersion,
    salaryPolicyEffectiveFrom: normalizedEffectiveFrom
  };
};
