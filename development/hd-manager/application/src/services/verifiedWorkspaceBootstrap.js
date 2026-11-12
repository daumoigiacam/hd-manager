// Only call with the live HTTPS login response AFTER Firebase accepted its
// custom token. Never call with localStorage/cached UI data. This short-lived
// Online witness is deliberately not an Offline permission grant.
export function acceptWorkspaceBootstrap({workspace,identity,user,appId,now=Date.now()}) {
  if (!workspace) return null; // backward-compatible with deployed login APIs
  if (!user?.uid || user.isAnonymous || identity?.firebaseUid !== user.uid
    || identity.accountType !== 'employee' || workspace.version !== 1 || workspace.appId !== appId
    || workspace.tenantId !== identity.companyId || workspace.employeeId !== identity.id
    || workspace.company?.id !== identity.companyId || workspace.employee?.id !== identity.id
    || workspace.employee.companyId !== identity.companyId || workspace.employee.isArchived === true
    || workspace.company.isArchived === true || (workspace.employee.role || 'employee') !== (identity.role || 'employee')
    || !Number.isSafeInteger(workspace.issuedAtMs) || now < workspace.issuedAtMs - 5000
    || now - workspace.issuedAtMs > 60000) throw new Error('Không xác minh được dữ liệu khởi động tài khoản.');
  return Object.freeze({uid:user.uid,tenantId:identity.companyId,employeeId:identity.id,
    expiresAtMs:workspace.issuedAtMs+60000,company:workspace.company,employee:workspace.employee});
}

export function hasCurrentWorkspaceBootstrap(value,{uid,tenantId,employeeId,now=Date.now()}) {
  return Boolean(value&&value.uid===uid&&value.tenantId===tenantId&&value.employeeId===employeeId
    && Number.isSafeInteger(value.expiresAtMs)&&now<value.expiresAtMs);
}
