// Presentation only. Callers still require the current signed Runtime/session.
// Keep an Offline editing workspace mounted on reconnect; switching is an
// explicit navigation action, never a side effect of background synchronization.
export const initialLocalWorkspace = ({native,online}) => native || !online;
export function localWorkspaceTab(tab,available) {
  const target=({warehouse_import:'warehouseImports',warehouse_dispatch:'warehouseDispatches',delivery_reports:'delivery',employees:'hr',company_attendance:'hr',payroll:'hr'})[tab]||tab;
  return ['home','customers','more'].includes(target)||available.some(route=>route.id===target)?target:null;
}
// Keep the requested HR view when several existing menu entries share one
// repository/module. This is presentation state, never a permission grant.
export function localWorkspaceInitialSource(tab) {
  return ({employees:'employees',company_attendance:'attendance',payroll:'payrollSnapshots'})[tab];
}
export function restoredWorkspaceEntryTab({requested,requestedPrincipalId,principalId,accountType,fallback}) {
  return accountType !== 'customer' && requestedPrincipalId && requestedPrincipalId === principalId
    && ['home','more'].includes(requested) ? requested : fallback;
}
// A request changes presentation only. The full product still uses its normal
// authenticated read-owner gate and per-module RBAC. A menu intent is never a
// signed Offline permission or a way to open another actor's cached data.
export function canPresentFullWorkspace({intent,runtime,firebaseUid,tenantId,companyId,biometricUnlocked,online}) {
  return Boolean(online&&biometricUnlocked&&runtime?.isCurrent?.()
    &&intent&&['home','more'].includes(intent.tab)
    &&intent.principalId===runtime.scope.principalId&&firebaseUid===runtime.scope.principalId
    &&intent.tenantId===runtime.scope.tenantId&&tenantId===runtime.scope.tenantId&&companyId===tenantId);
}
export function showRestoredWorkspace({native,localMode,restored,online,hasCurrentUser,minimalEntry,enabled,firebaseUid,principalId,biometricUnlocked,fullWorkspaceAuthorized=false}) {
  if (!native) return localMode && (!firebaseUid || firebaseUid === principalId);
  if(fullWorkspaceAuthorized&&!localMode)return false;
  return restored || (!online && !hasCurrentUser)
    || (minimalEntry && enabled && firebaseUid === principalId && biometricUnlocked);
}
