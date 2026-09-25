export const getPayrollEmployeeState = (row = {}) => {
  const details = row.details || {};
  if (row.snapshotNeedsReview || !Number.isFinite(Number(details.netSalary))) return 'review';
  if (Number(details.endingDebt || 0) > 0) return 'carry';
  return 'ready';
};

export const summarizePayrollWorkspace = (rows = []) => {
  const summary = {
    employeeCount: rows.length,
    workDays: 0,
    baseSalary: 0,
    allowances: 0,
    bonus: 0,
    penalty: 0,
    payable: 0,
    carryForward: 0,
    readyCount: 0,
    carryCount: 0,
    reviewCount: 0
  };

  rows.forEach(row => {
    const details = row.details || {};
    const amount = key => Number(details[key] || 0);
    summary.workDays += amount('workDays');
    summary.baseSalary += amount('baseSalaryCalc');
    summary.allowances += amount('supportSalary') + amount('responsibilitySalary')
      + amount('roleSalary') + amount('experienceSalary');
    summary.bonus += amount('totalBonus') + amount('evaluationBonus');
    summary.penalty += amount('totalPenalty');
    summary.payable += amount('netSalary');
    summary.carryForward += amount('endingDebt');
    summary[`${getPayrollEmployeeState(row)}Count`] += 1;
  });
  return summary;
};

export const getPayrollMonthRange = (monthKey = '') => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) return null;
  const [year, month] = monthKey.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    label: `Tháng ${month}, ${year}`,
    firstLabel: `01/${`${month}`.padStart(2, '0')}/${year}`,
    lastLabel: `${lastDay}/${`${month}`.padStart(2, '0')}/${year}`
  };
};

export const shiftPayrollMonth = (monthKey = '', offset = 0) => {
  if (!getPayrollMonthRange(monthKey)) return '';
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`;
};

export const getPayrollCarryoverRows = ({
  carryovers = [], rows = [], employees = [], companyId = '', monthKey = '', isLocked = false
} = {}) => {
  const employeeNames = new Map(employees
    .filter(employee => employee?.id && `${employee.companyId || ''}` === `${companyId}`)
    .map(employee => [employee.id, employee.name || employee.displayName || employee.id]));
  rows.forEach(row => {
    if (row.emp?.id && row.emp.name) employeeNames.set(row.emp.id, row.emp.name);
  });
  const targetMonthKey = shiftPayrollMonth(monthKey, 1);

  if (isLocked) {
    return carryovers
      .filter(item => !item?.isArchived && `${item.companyId || ''}` === `${companyId}`
        && item.sourceMonthKey === monthKey && item.targetMonthKey === targetMonthKey
        && Number(item.amount) > 0)
      .map(item => ({
        id: item.id,
        employeeId: item.employeeId,
        employeeName: employeeNames.get(item.employeeId) || item.employeeId,
        amount: Number(item.amount),
        sourceMonthKey: item.sourceMonthKey,
        targetMonthKey: item.targetMonthKey,
        status: item.status === 'APPLIED' ? 'applied'
          : item.status === 'CANCELLED' ? 'cancelled' : 'open',
        persisted: true
      }));
  }

  return rows
    .filter(row => row.emp?.id && Number(row.details?.endingDebt) > 0)
    .map(row => ({
      id: `preview-${row.emp.id}`,
      employeeId: row.emp.id,
      employeeName: employeeNames.get(row.emp.id) || row.emp.id,
      amount: Number(row.details.endingDebt),
      sourceMonthKey: monthKey,
      targetMonthKey,
      status: 'pending_close',
      persisted: false
    }));
};
