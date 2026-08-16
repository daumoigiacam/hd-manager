const normalizeMonthKey = (value = '') => {
  const raw = `${value || ''}`.trim();
  const match = raw.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : '';
};

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const hasEvaluationSourceData = (summary = {}) => {
  const peerCount = toFiniteNumber(summary?.peer?.count);
  const customerCount = toFiniteNumber(summary?.customer?.count);
  const system = summary?.system || {};
  return peerCount > 0
    || customerCount > 0
    || toFiniteNumber(system.workDays) > 0
    || toFiniteNumber(system.revenue) > 0
    || toFiniteNumber(system.deliveryCount) > 0;
};

export const createEmptyPayrollEvaluationResult = ({ employeeId = '', monthKey = '' } = {}) => ({
  employeeId: `${employeeId || ''}`,
  monthKey: normalizeMonthKey(monthKey),
  hasEvaluation: false,
  stars: 0,
  averageScore: 0,
  finalScore: 0,
  bonus: 0,
  note: 'Chua co du lieu danh gia',
  status: 'missing_data',
  criterionCount: 0,
  missingData: [],
  criteria: []
});

// Read-only adapter: no star or reward conversion formula belongs in payroll.
export const projectEvaluationSummaryToPayroll = (summary, { employeeId = '', monthKey = '' } = {}) => {
  const expectedEmployeeId = `${employeeId || ''}`;
  const expectedMonthKey = normalizeMonthKey(monthKey);
  const summaryEmployeeId = `${summary?.employee?.id || summary?.employeeId || ''}`;
  const summaryMonthKey = normalizeMonthKey(summary?.monthKey);
  const emptyResult = createEmptyPayrollEvaluationResult({ employeeId: expectedEmployeeId, monthKey: expectedMonthKey });

  if (!summary || !expectedEmployeeId || !expectedMonthKey) return emptyResult;
  if (summaryEmployeeId !== expectedEmployeeId || summaryMonthKey !== expectedMonthKey) return emptyResult;

  // The 13-criterion summary is the single read-only source for payroll.
  // Payroll must never recompute stars, averages, or rewards from live policy.
  const evaluationSummary13 = summary?.evaluationSummary13;
  if (evaluationSummary13) {
    const criterionCount = toFiniteNumber(evaluationSummary13.criterionCount);
    const missingData = Array.isArray(evaluationSummary13.missingData)
      ? evaluationSummary13.missingData
      : [];
    const isComplete = evaluationSummary13.status === 'complete'
      && Number.isFinite(Number(evaluationSummary13.reward));
    if (!isComplete) {
      return {
        ...emptyResult,
        status: 'needs_review',
        note: 'Chua du du lieu danh gia',
        criterionCount,
        missingData,
        criteria: Array.isArray(evaluationSummary13.criteria) ? evaluationSummary13.criteria : [],
        schemaVersion: evaluationSummary13.schemaVersion,
        source: evaluationSummary13.source || 'manual_and_automatic'
      };
    }

    const exactAverage = toFiniteNumber(
      evaluationSummary13.exactAverage ?? evaluationSummary13.displayAverage
    );
    return {
      employeeId: expectedEmployeeId,
      monthKey: expectedMonthKey,
      hasEvaluation: true,
      stars: Math.max(0, Math.min(5, toFiniteNumber(evaluationSummary13.stars))),
      averageScore: Math.max(0, exactAverage),
      // This is a copied display value only; no payroll formula is applied.
      finalScore: Math.max(0, toFiniteNumber(
        evaluationSummary13.finalScore ?? evaluationSummary13.totalScore
      )),
      bonus: Math.max(0, Math.round(toFiniteNumber(evaluationSummary13.reward))),
      note: '',
      status: evaluationSummary13.status,
      criterionCount,
      missingData,
      criteria: Array.isArray(evaluationSummary13.criteria) ? evaluationSummary13.criteria : [],
      schemaVersion: evaluationSummary13.schemaVersion,
      source: evaluationSummary13.source || 'manual_and_automatic'
    };
  }

  if (!hasEvaluationSourceData(summary)) return emptyResult;

  return {
    employeeId: expectedEmployeeId,
    monthKey: expectedMonthKey,
    hasEvaluation: true,
    stars: Math.max(0, Math.min(5, toFiniteNumber(summary.stars))),
    averageScore: Math.max(0, toFiniteNumber(summary.finalCriteriaAverage)),
    finalScore: Math.max(0, toFiniteNumber(summary.finalScore)),
    bonus: Math.max(0, Math.round(toFiniteNumber(summary.bonus))),
    note: ''
  };
};

export const applyEvaluationBonusToSalaryDetails = (salaryDetails, evaluationResult) => {
  if (!salaryDetails) return null;
  const evaluationBonus = evaluationResult?.hasEvaluation
    ? Math.max(0, Math.round(toFiniteNumber(evaluationResult.bonus)))
    : 0;

  return {
    ...salaryDetails,
    evaluationBonus,
    evaluationResult: evaluationResult || createEmptyPayrollEvaluationResult({
      employeeId: '',
      monthKey: salaryDetails.monthKey || ''
    }),
    grossSalary: Math.round(toFiniteNumber(salaryDetails.grossSalary) + evaluationBonus),
    netSalary: Math.round(toFiniteNumber(salaryDetails.netSalary) + evaluationBonus)
  };
};
