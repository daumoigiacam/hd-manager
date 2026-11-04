// Canonical access identity for retaining a completed read-only report. Display,
// backup timestamps and other company metadata must not blank it. Effective
// grants, principal/tenant and the current employee hierarchy remain boundaries.
const opaqueScopeValues=new WeakMap();
let nextOpaqueScopeValue=0;
const scopeValue=v=>{
  if(v===undefined||v===null)return '';
  if(typeof v!=='object')return v;
  if(Array.isArray(v))return v.map(scopeValue).sort((a,b)=>String(a).localeCompare(String(b)));
  // Unknown access-field shapes fail closed on replacement; never traverse a
  // Firestore reference or collapse two distinct access objects to an empty key.
  if(!opaqueScopeValues.has(v))opaqueScopeValues.set(v,++nextOpaqueScopeValue);
  return ['opaque-access-value',opaqueScopeValues.get(v)];
};
export function createDashboardPrivacyScope({companyId,currentUser,employee,rolePermissionKey,sessionId='',
  rolePermissions,rolePermissionActions,employeeScopeIds=[],isOwnerAccount,isSuperAdmin}) {
  const fields=['id','employeeId','uid','userId','companyId','accountType','role','roleName','position','secondaryPositions',
    'department','departmentId','companyDepartmentId','managerId','parentEmployeeId','leaderId','supervisorId',
    'salesLeaderId','salesManagerId','isOwner','isCompanyOwner','isSuperAdmin','isCompanyAccount'];
  // A confirmed owner's company-wide access is defined by the effective grants
  // and ownership flag, not the later hydration of their personnel job record.
  // Employees retain the stricter hierarchy/job boundary above.
  const accessFields=isOwnerAccount?['id','employeeId','companyId']:fields;
  return JSON.stringify(['dashboard-read-scope-v1',companyId||'',sessionId,
    ['id','employeeId','companyId','role','accountType'].map(key=>scopeValue(currentUser?.[key])),
    accessFields.map(key=>scopeValue(employee?.[key])),rolePermissionKey,rolePermissions,rolePermissionActions,
    isOwnerAccount?[]:[...employeeScopeIds].map(String).sort(),Boolean(isOwnerAccount),Boolean(isSuperAdmin)]);
}
