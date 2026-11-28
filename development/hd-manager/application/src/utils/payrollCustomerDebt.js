import {buildPayrollSnapshotId,getLockedPayrollPeriod,isPayrollPeriodLocked} from './payrollPeriodLock.js';
import {getPreviousPayrollMonthKey,getNextPayrollMonthKey} from './payrollDebtCarryover.js';

const money = value => Math.max(0,Math.round(Number(value) || 0));
export const getPayrollEarnedIncome = details => Math.max(0,Math.round(Number(details?.grossSalary === undefined
  ? details?.netSalary : Number(details.grossSalary || 0) - Number(details.customerDebtCredit || 0)) || 0));

export function getPayrollSequenceBlocker(periods,companyId,monthKey) {
  const locked = (periods || []).filter(period => period.companyId === companyId && !period.isArchived && isPayrollPeriodLocked(period));
  if (locked.some(period => period.monthKey > monthKey)) return 'Có kỳ sau đã chốt. Không thể chốt lùi làm thay đổi số dư kỳ đã khóa.';
  const previous = locked.filter(period => period.monthKey < monthKey).sort((a,b) => a.monthKey.localeCompare(b.monthKey)).at(-1);
  return previous && getNextPayrollMonthKey(previous.monthKey) !== monthKey
    ? `Cần chốt kỳ ${getNextPayrollMonthKey(previous.monthKey)} trước để chuyển dư nợ liên tục.` : '';
}

export function payrollCustomerDebtBasis(periods,companyId,monthKey,employeeId) {
  const previousMonth = getPreviousPayrollMonthKey(monthKey);
  const previous = getLockedPayrollPeriod(periods,companyId,previousMonth);
  if (!previous) return {ready:true,balance:0,sourcePeriodId:''};
  const hasEmployee = previous.snapshotIds?.includes(buildPayrollSnapshotId(companyId,previousMonth,employeeId));
  const balance = previous.customerDebtBalances?.[employeeId];
  if (hasEmployee && (previous.customerDebtReconciliationVersion !== 1 || !Number.isSafeInteger(balance) || balance < 0)) {
    return {ready:false,balance:0,sourcePeriodId:previous.id,message:'Kỳ trước thiếu số đối chiếu công nợ khách hàng đã khấu trừ. Cần rà soát kỳ trước trước khi chốt tiếp.'};
  }
  return {ready:true,balance:money(balance),sourcePeriodId:previous.id};
}

// Opening payroll debt already contains the preceding month's shortfall.
// Charge only the movement in the customer balance; repayments credit back
// deductions previously borne by the employee. The first period uses base 0.
export function applyPayrollCustomerDebtReconciliation(details,basis = {ready:true,balance:0,sourcePeriodId:''}) {
  if (!details) return details;
  if (details.customerDebtReconciliationVersion === 1) return details;
  const balance = money(details.badDebt),previous = money(basis.balance);
  const movement = balance - previous,credit = Math.max(0,-movement);
  return {...details,
    customerDebtReconciliationVersion:1,customerDebtReconciliationReady:basis.ready,
    ...(basis.message ? {customerDebtReconciliationMessage:basis.message} : {}),
    customerDebtSourcePeriodId:basis.sourcePeriodId || '',
    customerDebtBalance:balance,previousCustomerDebtBalance:previous,
    customerDebtMovement:movement,customerDebtCredit:credit,badDebt:Math.max(0,movement),
    grossSalary:Math.round(Number(details.grossSalary) || 0) + credit,
    deductionTotal:Math.round(Number(details.deductionTotal) || 0) - balance + Math.max(0,movement),
    netSalary:Math.round(Number(details.netSalary) || 0) + previous
  };
}
