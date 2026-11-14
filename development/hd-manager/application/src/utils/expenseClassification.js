// Repayments settle an existing liability; they are cash outflows, not new costs.
export const isCustomerDebtRepayment = (expense) => expense?.sourceType === 'customer_debt_repayment';
// Explicit linked payroll vouchers settle an already accrued salary liability.
// Historical salary expenses without this marker keep their existing behavior.
export const isPayrollLiabilitySettlement = expense => expense?.sourceType === 'payroll_settlement'
  && typeof expense.payrollSnapshotId === 'string' && expense.payrollSnapshotId.length > 0
  && typeof expense.payrollPaymentId === 'string' && expense.payrollPaymentId.length > 0;
