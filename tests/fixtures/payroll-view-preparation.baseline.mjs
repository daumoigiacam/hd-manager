// Frozen candidate9b6f622a; synchronous payroll view preparation.
export default function frozenPayrollView({isPayrollLocked, currentMonth, employeeReviews, orders, deliveryReports, complaintsLoaded, customerComplaints, payrollCompanyId, attendance, attendanceLoaded, currentCompany, employees, visibleSalaryEmployees, payrollDebtCarryovers, payrollPolicyEmployees, financials, performance, customers, payments, holidays}) {
  const useMemo = factory => factory();
  const useCallback = factory => factory;
  const payrollEvaluationContext = useMemo(() => {
    if (isPayrollLocked) {
      return { attendance: {}, orders: [], deliveryReports: [], reviews: [], monthKey: currentMonth };
    }
    const reviewsForMonth = (employeeReviews || []).filter(review => (
      normalizeEmployeeReviewMonthKey(review?.monthKey || review?.date || review?.createdAt) === currentMonth
    ));
    const ordersForMonth = (orders || []).filter(order => (
      normalizeEmployeeReviewMonthKey(order?.date || order?.createdAt || getEntityTimestamp(order)) === currentMonth
    ));
    const deliveryReportsForMonth = (deliveryReports || []).filter(report => (
      normalizeEmployeeReviewMonthKey(report?.date || report?.createdAt || getEntityTimestamp(report)) === currentMonth
    ));
    const complaintsForMonth = complaintsLoaded && Array.isArray(customerComplaints)
      ? customerComplaints.filter(complaint => {
        const complaintCompanyId = complaint?.companyId || complaint?.appId || complaint?.tenantId || '';
        return (!payrollCompanyId || `${complaintCompanyId}` === `${payrollCompanyId}`)
          && normalizeEmployeeReviewMonthKey(
            complaint?.monthKey || complaint?.date || complaint?.createdAt || complaint?.updatedAt || getEntityTimestamp(complaint)
          ) === currentMonth;
      })
      : null;
    const attendanceForMonth = Object.fromEntries(
      Object.entries(attendance || {}).filter(([key, record]) => (
        `${key || ''}`.startsWith(currentMonth)
        || normalizeEmployeeReviewMonthKey(record?.date || record?.dateKey || record?.createdAt) === currentMonth
      ))
    );
    return {
      attendance: attendanceForMonth,
      orders: ordersForMonth,
      deliveryReports: deliveryReportsForMonth,
      ...buildEmployeeReviewSourceIndexes(ordersForMonth, deliveryReportsForMonth),
      reviews: reviewsForMonth,
      complaints: complaintsForMonth,
      attendanceLoaded: Boolean(attendanceLoaded),
      complaintsLoaded: Boolean(complaintsLoaded && Array.isArray(customerComplaints)),
      companyId: payrollCompanyId,
      currentCompany,
      criteriaList: getEmployeeReviewCriteriaList(currentCompany),
      monthKey: currentMonth
    };
  }, [attendance, attendanceLoaded, complaintsLoaded, currentCompany, customerComplaints, deliveryReports, employeeReviews, orders, currentMonth, isPayrollLocked, payrollCompanyId]);

  const payrollEvaluationResultsByEmployee = useMemo(() => {
    const results = new Map();
    if (isPayrollLocked) return results;
    (employees || []).forEach(emp => {
      if (!emp?.id || emp?.isArchived) return;
      const summary = buildEmployeeReviewSummary(emp, payrollEvaluationContext);
      results.set(emp.id, projectEvaluationSummaryToPayroll(summary, {
        employeeId: emp.id,
        monthKey: currentMonth
      }));
    });
    return results;
  }, [employees, payrollEvaluationContext, currentMonth, isPayrollLocked]);

  const payrollOpeningDebtByEmployee = useMemo(() => {
    if (isPayrollLocked) return new Map();
    return new Map((visibleSalaryEmployees || []).map(emp => [
      emp.id,
      getEmployeePayrollOpeningDebt(
        payrollDebtCarryovers,
        payrollCompanyId,
        currentMonth,
        emp.id
      )
    ]));
  }, [currentMonth, isPayrollLocked, payrollCompanyId, payrollDebtCarryovers, visibleSalaryEmployees]);

  const buildPayrollSalaryDetails = useCallback((employeeId) => {
    if (isPayrollLocked) return null;
    const salaryDetails = buildSalaryDetails(
      employeeId,
      payrollPolicyEmployees,
      attendance,
      financials,
      performance,
      customers,
      orders,
      payments,
      holidays,
      currentMonth
    );
    const detailsWithEvaluationBonus = applyEvaluationBonusToSalaryDetails(
      salaryDetails,
      payrollEvaluationResultsByEmployee.get(employeeId)
    );
    return applyPayrollOpeningDebtToSalaryDetails(
      detailsWithEvaluationBonus,
      payrollOpeningDebtByEmployee.get(employeeId) || 0
    );
  }, [attendance, customers, financials, holidays, currentMonth, isPayrollLocked, orders, payments, payrollEvaluationResultsByEmployee, payrollOpeningDebtByEmployee, payrollPolicyEmployees, performance]);

  const liveSalaryRows = useMemo(() => {
    if (isPayrollLocked) return [];
    return visibleSalaryEmployees
      .map(emp => ({
        emp,
        details: buildPayrollSalaryDetails(emp.id)
      }))
      .filter(row => row.details);
  }, [visibleSalaryEmployees, buildPayrollSalaryDetails, isPayrollLocked]);

  return { rows:liveSalaryRows, evaluations:payrollEvaluationResultsByEmployee, detailsByEmployee:new Map(payrollPolicyEmployees.map(emp => [emp.id,buildPayrollSalaryDetails(emp.id)])) };
}
