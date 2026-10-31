// Frozen payroll generator from APK 9e0be28c before preparation yields.
export default function* ({
  employees = [], attendance = {}, financials = [], performance = {}, customers = [],
  orders = [], payments = [], holidays = [], now = new Date(), company = {}, payrollPeriods = [], lockedPayroll = {}, employeeReviews = [], deliveryReports = [], customerComplaints = null, attendanceLoaded = false, complaintsLoaded = false
} = {}) {
  const firstMonth = new Date(now.getFullYear(), Math.min(0, now.getMonth() - 11), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const todayKey = getDateKeyFromAnyValue(now);
  const rows = [];

  for (let cursor = firstMonth; cursor <= lastMonth; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
    const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    const policyEmployees = employees.map(emp => applyEmployeePayrollPolicyForMonth(emp, monthKey));
    const monthAttendance = Object.fromEntries(Object.entries(attendance).filter(([key]) => key.startsWith(monthKey) && key.slice(0, 10) <= todayKey));
    const monthFinancials = financials.filter(record => {
      const key = getDateKeyFromAnyValue(record?.date);
      return !key || (key.startsWith(monthKey) && key <= todayKey);
    });
    const monthOrders = orders.filter(order => {
      const key = getDateKeyFromAnyValue(order.date || order.orderDate || order.createdAt);
      return key.startsWith(monthKey) && key <= todayKey;
    });
    const locked = getLockedPayrollPeriod(payrollPeriods, company.id, monthKey);
    const snapshotRows = lockedPayroll[monthKey]?.snapshots || [];
    const salaryEmployees = locked ? snapshotRows.map(snapshot => ({ ...snapshot.employee, id: snapshot.employeeId })) : policyEmployees;
    const monthDeliveryReports = deliveryReports.filter(row => normalizeEmployeeReviewMonthKey(row.date || row.createdAt) === monthKey);
    const evaluationContext = {
      attendance: monthAttendance, orders: monthOrders,
      deliveryReports: monthDeliveryReports,
      ...(!locked ? buildEmployeeReviewSourceIndexes(monthOrders, monthDeliveryReports) : {}),
      reviews: employeeReviews.filter(row => normalizeEmployeeReviewMonthKey(row.monthKey || row.date || row.createdAt) === monthKey),
      complaints: complaintsLoaded && Array.isArray(customerComplaints) ? customerComplaints.filter(row => row.companyId === company.id && normalizeEmployeeReviewMonthKey(row.monthKey || row.date || row.createdAt) === monthKey) : null,
      attendanceLoaded, complaintsLoaded, companyId: company.id, currentCompany: company,
      criteriaList: getEmployeeReviewCriteriaList(company), monthKey
    };
    yield;
    for (const emp of salaryEmployees.filter(emp => emp?.id && !emp.isArchived && emp.role !== 'super_admin' && !isOwnerPosition(emp.position))) {
        const details = locked
          ? snapshotRows.find(snapshot => snapshot.employeeId === emp.id)?.salaryDetails
          : applyEvaluationBonusToSalaryDetails(
            buildSalaryDetails(emp.id, policyEmployees, monthAttendance, monthFinancials, performance, customers, monthOrders, payments, holidays, monthKey, { skipDebt: true }),
            projectEvaluationSummaryToPayroll(buildEmployeeReviewSummary(emp, evaluationContext), { employeeId: emp.id, monthKey })
          );
        const amount = Math.max(0, roundMoneyValue((details?.grossSalary || 0) - (details?.totalPenalty || 0)));
        if (!amount) { yield; continue; }
        const earningDays = [...new Set((details.attendanceEntries || [])
          .filter(entry => (entry.status === 'present' || entry.status === 'late') && !entry.noSalaryDay && entry.date <= todayKey)
          .map(entry => entry.date))];
        const fallbackDate = monthKey === todayKey.slice(0, 7)
          ? todayKey
          : getDateKeyFromAnyValue(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0));
        const dates = earningDays.length ? earningDays : [fallbackDate];
        const baseAmount = Math.floor(amount / dates.length);
        dates.forEach((date, index) => rows.push({
          date,
          employeeId: emp.id,
          employeeName: emp.name,
          amount: index === dates.length - 1 ? amount - baseAmount * (dates.length - 1) : baseAmount
        }));
        yield;
      }
  }
  return rows;
};