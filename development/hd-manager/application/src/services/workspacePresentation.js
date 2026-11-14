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
export function showRestoredWorkspace({native,localMode,restored,online,hasCurrentUser,minimalEntry,enabled,firebaseUid,principalId,biometricUnlocked}) {
  if (!native) return localMode && (!firebaseUid || firebaseUid === principalId);
  return restored || (!online && !hasCurrentUser)
    || (minimalEntry && enabled && firebaseUid === principalId && biometricUnlocked);
}
