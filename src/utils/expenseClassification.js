// Repayments settle an existing liability; they are cash outflows, not new costs.
export const isCustomerDebtRepayment = (expense) => expense?.sourceType === 'customer_debt_repayment';
