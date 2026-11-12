// Exact App declarations; no formula changes.
import{getEmployeeRolePermissionKey,ROLE_PERMISSION_DEPARTMENTS}from'./payrollOriginalDomain.js';
const SALARY_ADVANCE_DEPARTMENT_OPTIONS=ROLE_PERMISSION_DEPARTMENTS.filter(department=>department.key!=='owner');
const DEFAULT_SALARY_ADVANCE_PERCENT = 30;

const normalizeSalaryAdvancePercent = (value) => {
  if (value === undefined || value === null || value === '') return DEFAULT_SALARY_ADVANCE_PERCENT;
  const parsed = parseFloat(`${value}`.replace(',', '.').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(parsed)) return DEFAULT_SALARY_ADVANCE_PERCENT;
  return Math.max(0, Math.min(100, parsed));
};

const normalizeSalaryAdvancePercentOrNull = (value) => {
  if (value === undefined || value === null || `${value}`.trim() === '') return null;
  const parsed = parseFloat(`${value}`.replace(',', '.').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(100, parsed));
};

const getCompanySalaryAdvancePercent = (company = null) => normalizeSalaryAdvancePercent(
  company?.salaryAdvancePercent ?? company?.payrollAdvancePercent ?? DEFAULT_SALARY_ADVANCE_PERCENT
);

const normalizeCompanySalaryAdvancePercentByDepartment = (source = {}, fallbackPercent = DEFAULT_SALARY_ADVANCE_PERCENT) => {
  const fallback = normalizeSalaryAdvancePercent(fallbackPercent);
  return SALARY_ADVANCE_DEPARTMENT_OPTIONS.reduce((acc, department) => {
    const hasExplicitValue = Object.prototype.hasOwnProperty.call(source || {}, department.key);
    if (!hasExplicitValue) {
      acc[department.key] = fallback;
    } else {
      acc[department.key] = normalizeSalaryAdvancePercentOrNull(source?.[department.key]);
    }
    return acc;
  }, {});
};

const getCompanySalaryAdvancePercentByDepartment = (company = null) => normalizeCompanySalaryAdvancePercentByDepartment(
  company?.salaryAdvancePercentByDepartment || company?.salaryAdvancePercentsByDepartment || {},
  getCompanySalaryAdvancePercent(company)
);

const getEmployeeSalaryAdvancePercent = (company = null, employee = null, currentUser = null) => {
  const departmentKey = getEmployeeRolePermissionKey(employee, currentUser);
  if (departmentKey === 'owner') return getCompanySalaryAdvancePercent(company);
  const byDepartment = getCompanySalaryAdvancePercentByDepartment(company);
  return normalizeSalaryAdvancePercent(byDepartment?.[departmentKey] ?? getCompanySalaryAdvancePercent(company));
};

const getEmployeeSalaryAdvanceLimitConfig = (company = null, employee = null, currentUser = null) => {
  const departmentKey = getEmployeeRolePermissionKey(employee, currentUser);
  const byDepartment = company?.salaryAdvancePercentByDepartment || company?.salaryAdvancePercentsByDepartment || {};
  const hasDepartmentLimit = Object.prototype.hasOwnProperty.call(byDepartment, departmentKey);
  if (departmentKey !== 'owner' && hasDepartmentLimit) {
    const departmentPercent = normalizeSalaryAdvancePercentOrNull(byDepartment?.[departmentKey]);
    return departmentPercent === null
      ? { isUnlimited: true, percent: null, source: 'department' }
      : { isUnlimited: false, percent: departmentPercent, source: 'department' };
  }
  const hasCompanyLimit = company && (
    Object.prototype.hasOwnProperty.call(company, 'salaryAdvancePercent')
    || Object.prototype.hasOwnProperty.call(company, 'payrollAdvancePercent')
  );
  if (!hasCompanyLimit) return { isUnlimited: true, percent: null, source: 'none' };
  const companyPercent = normalizeSalaryAdvancePercentOrNull(company?.salaryAdvancePercent ?? company?.payrollAdvancePercent);
  return companyPercent === null
    ? { isUnlimited: true, percent: null, source: 'company' }
    : { isUnlimited: false, percent: companyPercent, source: 'company' };
};
export{getEmployeeSalaryAdvanceLimitConfig,getEmployeeSalaryAdvancePercent};
