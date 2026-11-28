import {completePayrollPolicyForMonth} from './payrollPolicyCompletion.js';
import {buildPayrollPeriodId, buildPayrollSnapshotId, isPayrollPeriodLocked} from './payrollPeriodLock.js';
import {resolveStoredEmployeePayrollPolicy} from './payrollPolicyHistory.js';
import {isCompletePayrollSnapshot} from './payrollSnapshotIntegrity.js';

const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key,item[key]])) : item);

export function assertPayrollSnapshotPolicies(snapshots, employees, companyId, monthKey) {
  const byId = new Map(employees.map(employee => [employee.id,employee]));
  for (const snapshot of snapshots) {
    const employee = byId.get(snapshot.employeeId);
    const policy = employee && resolveStoredEmployeePayrollPolicy(employee,monthKey);
    if (!employee || employee.isArchived || employee.companyId !== companyId || !policy
      || canonical(policy) !== canonical(snapshot.policySnapshot)) throw Error('Nhân sự hoặc chính sách lương vừa thay đổi. Tải lại và rà soát bảng lương trước khi chốt.');
  }
}

export function assertPayrollCloseSnapshots({snapshots, employees, companyId, monthKey}) {
  if (!Array.isArray(snapshots) || !snapshots.length) throw Error('Chưa có dữ liệu nhân sự để chốt kỳ lương.');
  const ids = snapshots.map(snapshot => snapshot?.employeeId);
  if (new Set(ids).size !== ids.length || snapshots.some(snapshot => snapshot?.companyId !== companyId
    || snapshot.monthKey !== monthKey || snapshot.periodId !== buildPayrollPeriodId(companyId,monthKey)
    || snapshot.id !== buildPayrollSnapshotId(companyId,monthKey,snapshot.employeeId)
    || !isCompletePayrollSnapshot(snapshot)
    || snapshot.salaryDetails.customerDebtReconciliationVersion !== 1
    || !Number.isSafeInteger(snapshot.salaryDetails.customerDebtBalance)
    || snapshot.salaryDetails.customerDebtBalance < 0)) throw Error('Danh sách chốt bị trùng, sai kỳ hoặc thiếu dữ liệu. Tải lại bảng lương trước khi chốt.');
  const expected = employees.map(employee => employee.id).sort();
  if (canonical([...ids].sort()) !== canonical(expected)) throw Error('Danh sách nhân sự đã thay đổi hoặc chưa tải đủ. Tải lại bảng lương trước khi chốt.');
  assertPayrollSnapshotPolicies(snapshots,employees,companyId,monthKey);
}

// Uses the same Firestore transaction in the app and the emulator acceptance
// test. Never queues a historical policy approval as an offline write.
export async function commitMissingPayrollPolicy({db, appId, doc, runTransaction,
  employeeId, companyId, monthKey, ...review}) {
  const periodId = buildPayrollPeriodId(companyId, monthKey);
  if (!periodId || !employeeId) throw Error('Kỳ lương hoặc nhân sự không hợp lệ.');
  const employeeRef = doc(db, 'artifacts', appId, 'public', 'data', 'employees', employeeId);
  const periodRef = doc(db, 'artifacts', appId, 'public', 'data', 'payrollPeriods', periodId);
  return runTransaction(db, async transaction => {
    const [employeeDoc, periodDoc] = await Promise.all([transaction.get(employeeRef), transaction.get(periodRef)]);
    if (periodDoc.exists() && isPayrollPeriodLocked(periodDoc.data())) throw Error('Kỳ lương đã chốt. Không thể bổ sung chính sách vào kỳ đã khóa.');
    if (!employeeDoc.exists()) throw Error('Nhân sự không còn tồn tại.');
    const employee = {...employeeDoc.data(), id: employeeDoc.id};
    const patch = completePayrollPolicyForMonth({employee, companyId, monthKey, ...review});
    transaction.update(employeeRef, patch);
    return {...employee, ...patch};
  });
}
