// Owner decision in chat, 2026-11-12. No new payroll formula or historical edit.
export const salarySettlementPolicy=Object.freeze({version:1,ownerApproved:true,effect:'reduce-salary-payable-only',recognizeExpenseAgain:false,changeFrozenSalary:false});
// Existing action IDs, not role/title guesses. Salary reconciliation confirms
// employee cashflow under the same approval authority as employee-reported cash.
export const salarySettlementPermissionActions=Object.freeze({readOwn:[['payroll','view_own_payroll']],readAll:[['payroll','view_all_payroll']],pay:[['payroll','view_all_payroll'],['finance','create_expense']],acknowledge:[['payroll','view_own_payroll']],reconcile:[['payroll','view_all_payroll'],['finance','approve_driver_cashflow']]});
export function deriveSalarySettlementAccess(subject,hasAction){return Object.fromEntries(Object.entries(salarySettlementPermissionActions).map(([name,actions])=>[name,actions.every(([module,action])=>hasAction(subject,module,action)===true)]));}
export function salarySettlementCapabilities(subject,hasAction){const a=deriveSalarySettlementAccess(subject,hasAction);return[...(a.readOwn||a.readAll?['salarySettlement.read']:[]),...['pay','acknowledge','reconcile'].filter(k=>a[k]).map(k=>'salarySettlement.'+k)];}
