// Additional LOCAL-only boundary over the unchanged repository Rules. Cash
// writes use the existing authorized transactional APIs, not a second ledger.
export function buildLocalFirestoreRules(source,configuration){
 if(configuration.name!=='local'||!/^demo-hdmanager-/.test(configuration.projectId)||configuration.flags.productionAccess!==false)throw Error('Local finance Rules fence only');
 const marker='    match /artifacts/{appId}/public/data/{collectionId}/{docId} {';if(source.split(marker).length!==2||source.includes('localFinanceAuthorityCurrent'))throw Error('Unexpected original Rules structure');
 const functions=`
    function localIndividualPermission(company, field, employeeId) {
      return company.get(field, null) is map ? company.get(field, {}).get(employeeId, null) : null;
    }
    function localFinanceAuthorityCurrent(appId) {
      let access = get(/databases/$(database)/documents/offlineCustomerAccess/$(request.auth.uid)).data;
      let a = access.get('localAuthority', {});
      let company = get(/databases/$(database)/documents/artifacts/$(appId)/public/data/companies/$(request.auth.token.companyId)).data;
      let employee = get(/databases/$(database)/documents/artifacts/$(appId)/public/data/employees/$(request.auth.token.appUserId)).data;
      let identity = get(/databases/$(database)/documents/identity_accounts/$(request.auth.token.identityId)).data;
      let c = a.get('companyInputs', {});
      let e = a.get('employeeInputs', {});
      return access.active == true && a.version == 1 && a.environment == 'local'
        && a.projectId == '${configuration.projectId}' && a.appId == appId
        && a.principalId == request.auth.uid && a.tenantId == request.auth.token.companyId
        && a.employeeId == request.auth.token.appUserId && a.identityId == request.auth.token.identityId
        && access.tenantId == a.tenantId && access.appIdentity.id == a.employeeId
        && a.expiresAtMs > request.time.toMillis()
        && company.get('isArchived', false) != true && employee.companyId == a.tenantId
        && employee.get('isArchived', false) != true && !(employee.get('status', '') in ['blocked', 'inactive'])
        && identity.status == 'active' && identity.get('lockedAt', null) == null
        && identity.accountType == 'employee' && identity.companyId == a.tenantId && identity.appUserId == a.employeeId
        && company.get('rolePermissions', null) == c.get('rolePermissions', null)
        && company.get('rolePermissionActions', null) == c.get('rolePermissionActions', null)
        && localIndividualPermission(company, 'employeeRolePermissions', a.employeeId) == c.get('individualPermissions', null)
        && localIndividualPermission(company, 'employeeRolePermissionActions', a.employeeId) == c.get('individualActions', null)
        && employee.get('role', null) == e.get('role', null) && employee.get('position', null) == e.get('position', null)
        && employee.get('positions', null) == e.get('positions', null) && employee.get('additionalPositions', null) == e.get('additionalPositions', null)
        && employee.get('rolePermissions', null) == e.get('rolePermissions', null)
        && employee.get('rolePermissionActions', null) == e.get('rolePermissionActions', null)
        && employee.get('permissionOverrides', null) == e.get('permissionOverrides', null)
        && employee.get('isArchived', null) == e.get('isArchived', null) && employee.get('status', null) == e.get('status', null);
    }
    function localFinanceReadAllowed(appId, collectionId, data) {
      let money = collectionId in ['expenses', 'payments'];
      let a = money && isEmployeeIdentity()
        ? get(/databases/$(database)/documents/offlineCustomerAccess/$(request.auth.uid)).data.get('localAuthority', {}) : {};
      return !money || !isEmployeeIdentity() || (localFinanceAuthorityCurrent(appId)
        && (a.finance.readAll == true || (a.finance.readOwn == true && data is map
          && (data.get('empId', '') == request.auth.token.appUserId || data.get('createdByEmpId', '') == request.auth.token.appUserId))));
    }
    function localFinanceDirectWriteAllowed(collectionId) {
      // Existing Local business APIs check ORIGINAL current RBAC, money,
      // approval, CAS, tenant and idempotency inside their server transaction.
      return !(collectionId in ['expenses', 'payments']);
    }
    function localSensitivePayrollReadAllowed(appId, collectionId, docId, data) {
      let sensitive = collectionId in ['employees', 'attendance', 'performance', 'financials', 'advances',
        'payrollPeriods', 'payrollSnapshots', 'payrollAdjustments', 'payrollDebtCarryovers',
        'employeeReviews', 'customerComplaints'];
      let ownIdentity = collectionId == 'employees' && docId == request.auth.token.appUserId;
      let a = sensitive && isEmployeeIdentity()
        ? get(/databases/$(database)/documents/offlineCustomerAccess/$(request.auth.uid)).data.get('localAuthority', {}) : {};
      return !sensitive || !isEmployeeIdentity() || ownIdentity || (localFinanceAuthorityCurrent(appId)
        && (a.get('payroll', {}).get('readAll', false) == true
          || (collectionId != 'employees' && a.get('payroll', {}).get('readOwn', false) == true && data is map
            && (data.get('empId', '') == request.auth.token.appUserId || data.get('employeeId', '') == request.auth.token.appUserId))));
    }
`;
 let result=source.replace(marker,functions+'\n'+marker);const start=result.indexOf(marker),head=result.slice(0,start),tail=result.slice(start);
 let guarded=tail;for(const op of ['get','list','create','update','delete']){const rule=`allow ${op}: if hasIdentitySession()`;if(guarded.split(rule).length!==2)throw Error('Original '+op+' rule changed');const guard=['get','list'].includes(op)?"localFinanceReadAllowed(appId, collectionId, resource == null ? null : resource.data)\n        && localSensitivePayrollReadAllowed(appId, collectionId, docId, resource == null ? null : resource.data)":"localFinanceDirectWriteAllowed(collectionId)";guarded=guarded.replace(rule,rule+'\n        && '+guard);}
 return head+guarded;
}
