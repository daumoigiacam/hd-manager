import { normalizeCompanyDepartments } from './companyDepartments.js';

export function attendanceRoster(employees, company, currentEmployee, canViewTeam) {
  const companyId = company?.id;
  const rows = canViewTeam ? employees : [currentEmployee];
  return (rows || []).filter(employee => employee?.id && companyId && employee.companyId === companyId && !employee.isArchived);
}

export function attendanceDepartment(employee, company) {
  const departments = normalizeCompanyDepartments(company?.employeeDepartments);
  const matched = departments.find(item => item.id === employee.companyDepartmentId);
  return matched?.name || employee.companyDepartmentName || employee.companyDepartment || employee.position || 'Chưa phân bộ phận';
}
