// Select a reader; this never grants access. The SQLite adapter still checks
// principal/tenant and the signed runtime before every protected read.
export function shouldRequestCustomerSupplements(props, committedDirectoryScope) {
  return typeof props.privacyScope === 'string' && props.privacyScope.length > 0
    && committedDirectoryScope === props.privacyScope && !props.localFirstRequired
    && props.localOnline !== false && !props.supplementsRequested
    && ['canViewCustomerDebt','canViewCustomerStats','canViewCustomerOrderHistory',
      'canViewCustomerPaymentHistory','canViewSupplierImports','canViewCustomerLoyalty',
      'canViewCustomerLoans','canManageCustomerDebtLimit','canViewCustomerDebtLimitAlerts']
      .some(permission => props[permission] === true);
}

export function customerReadiness({localFirstRequired=false, runtimeCurrent=false,
  supplementsRequested=false, online=true, setupError=''}={}) {
  if(localFirstRequired && (!supplementsRequested || !online)) {
    if(runtimeCurrent)return 'sqlite';
    return !online || setupError ? 'authorization-unavailable' : 'restoring';
  }
  // A cloud directory response is not a durable, authorized Offline snapshot.
  if(!online)return 'offline-not-configured';
  return 'cloud';
}
