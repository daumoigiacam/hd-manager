import { findIdentitySessionOwner } from '../services/identityCenter.js';

const nonEmptyArray = value => (Array.isArray(value) ? value.filter(Boolean) : []);

// Keep VPS JWT claims authoritative while resolving the HR profile used by UI workflows.
export const resolveEmployeeSessionProfile = (employees = [], currentUser = null) => {
  if (!currentUser) return null;

  const employee = findIdentitySessionOwner(employees, currentUser);
  if (!employee) return currentUser;

  const sessionRoles = nonEmptyArray(currentUser.roles);
  const employeeRoles = nonEmptyArray(employee.roles);
  const sessionPermissions = nonEmptyArray(currentUser.permissions);
  const employeePermissions = nonEmptyArray(employee.permissions);

  return {
    ...employee,
    ...currentUser,
    id: employee.id || employee.employeeId || currentUser.employeeId || currentUser.id || '',
    employeeId: employee.employeeId || employee.id || currentUser.employeeId || '',
    userId: employee.userId || employee.user_id || currentUser.id || currentUser.userId || '',
    authUserId: currentUser.id || employee.userId || employee.user_id || '',
    companyId: currentUser.companyId || currentUser.company_id || employee.companyId || employee.company_id || '',
    name: employee.name || employee.displayName || currentUser.name || currentUser.displayName || '',
    phone: employee.phone || employee.phoneNumber || currentUser.phone || currentUser.phoneNumber || '',
    position: employee.position || currentUser.position || '',
    role: currentUser.role || currentUser.userRole || employee.role || employee.userRole || 'employee',
    roles: sessionRoles.length ? sessionRoles : employeeRoles,
    permissions: sessionPermissions.length ? sessionPermissions : employeePermissions,
    isOwner: currentUser.isOwner === true || currentUser.isCompanyOwner === true || employee.isOwner === true || employee.isCompanyOwner === true,
    isCompanyOwner: currentUser.isCompanyOwner === true || currentUser.isOwner === true || employee.isCompanyOwner === true || employee.isOwner === true,
  };
};
