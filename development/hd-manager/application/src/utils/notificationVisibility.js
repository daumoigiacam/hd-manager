const normalizeNotificationValue = (value) => `${value ?? ''}`.trim().toLowerCase();

export const isEmployeeNotificationVisible = (
  notice = {},
  { currentEmployeeId = '', isOwnerAccount = false } = {}
) => {
  const recipientType = normalizeNotificationValue(notice.recipientType);
  const audience = normalizeNotificationValue(notice.audience || notice.targetAudience || notice.scope);
  if (recipientType === 'customer' || audience === 'customer') return false;

  const directTargets = [
    notice.targetEmpId,
    notice.targetEmployeeId,
    notice.recipientEmpId,
    notice.receiverEmpId,
    notice.employeeId,
    notice.empId
  ].filter(Boolean).map(String);
  const listTargets = Array.isArray(notice.targetEmployeeIds)
    ? notice.targetEmployeeIds.filter(Boolean).map(String)
    : [];
  const hasEmployeeTarget = directTargets.length > 0 || listTargets.length > 0;

  return isOwnerAccount
    || directTargets.includes(String(currentEmployeeId))
    || listTargets.includes(String(currentEmployeeId))
    || (!hasEmployeeTarget && ['all', 'employees', 'employee', 'company'].includes(audience));
};

export const dedupePaymentNotifications = (notices = []) => {
  const seenPaymentIds = new Set();
  return (Array.isArray(notices) ? notices : []).filter((notice) => {
    const paymentId = `${notice?.paymentId || ''}`.trim();
    if (!paymentId) return true;
    if (seenPaymentIds.has(paymentId)) return false;
    seenPaymentIds.add(paymentId);
    return true;
  });
};
