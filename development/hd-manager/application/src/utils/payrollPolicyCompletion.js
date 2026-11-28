import {
  captureEmployeePayrollPolicy, getStoredEmployeePayrollPolicyHistory,
  resolveStoredEmployeePayrollPolicy, PAYROLL_FORMULA_VERSION, PAYROLL_POLICY_SCHEMA_VERSION
} from './payrollPolicyHistory.js';
import { getPayrollMonthEndDateKey, normalizePayrollMonthKey } from './payrollPeriodLock.js';

const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

// Compare the exact reviewed values AND history, not just a possibly absent vN.
export const payrollPolicyReviewSignature = employee => JSON.stringify(canonical({
  values: captureEmployeePayrollPolicy(employee),
  history: getStoredEmployeePayrollPolicyHistory(employee),
  isArchived: employee?.isArchived === true
}));

/** @param {{employee?: Record<string, any>, companyId?: string, monthKey?: string, expectedSignature?: string, confirmed?: boolean, reason?: string, reviewedAt?: string, actorId?: string, actorName?: string}} [input] */
export function completePayrollPolicyForMonth({employee, companyId, monthKey, expectedSignature,
  confirmed = false, reason = '', reviewedAt = '', actorId = '', actorName = ''} = {}) {
  const month = normalizePayrollMonthKey(monthKey);
  if (!month || !employee?.id || employee.companyId !== companyId || employee.isArchived) throw Error('Không tìm thấy nhân sự đang làm việc trong công ty này.');
  if (!confirmed || !reason.trim() || !actorId || !reviewedAt) throw Error('Cần xác nhận thông số lương và nhập căn cứ áp dụng cho kỳ này.');
  if (payrollPolicyReviewSignature(employee) !== expectedSignature) throw Error('Hồ sơ lương vừa thay đổi. Mở lại phần rà soát trước khi lưu.');
  if (resolveStoredEmployeePayrollPolicy(employee, month)) throw Error('Kỳ này đã có chính sách lương. Hãy tải lại bảng lương.');
  const values = captureEmployeePayrollPolicy(employee);
  if (!values.position || !Object.hasOwn(values, 'basicSalary') || !Number.isFinite(Number(values.basicSalary)) || Number(values.basicSalary) < 0) throw Error('Hồ sơ cần có bộ phận và lương cơ bản hợp lệ, kể cả mức 0 đã được xác nhận.');
  const history = getStoredEmployeePayrollPolicyHistory(employee);
  const number = Math.max(0, ...history.map(policy => policy.versionNumber)) + 1;
  const end = getPayrollMonthEndDateKey(month);
  const effectiveFrom = employee.startDate && employee.startDate > `${month}-01` ? employee.startDate : `${month}-01`;
  if (effectiveFrom > end) throw Error('Nhân sự chưa bắt đầu làm việc trong kỳ này.');
  const policy = {
    id: `payroll-policy-${number}-${month}-review`, version: `v${number}`, versionNumber: number,
    schemaVersion: PAYROLL_POLICY_SCHEMA_VERSION, formulaVersion: PAYROLL_FORMULA_VERSION,
    effectiveFrom, effectiveTo: end, values,
    createdAt: reviewedAt, createdByEmployeeId: actorId, createdByName: actorName, supersededAt: '',
    review: {type: 'MISSING_MONTH_POLICY_CONFIRMED', monthKey: month, reason: reason.trim(), reviewedAt, actorId}
  };
  const policies = [...history, policy];
  // Historical completion changes only history. Today's salary and its default
  // effective date remain untouched, as do existing policy records and snapshots.
  return {payrollPolicies: policies, salaryPolicyHistory: policies, salaryPolicyVersion: policy.version};
}
