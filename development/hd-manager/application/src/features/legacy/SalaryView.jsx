import { useState, useEffect, useMemo, useRef } from "react";
import { useAppScreenBack } from "../../hooks/useAppScreenBack.js";
import { PAYROLL_AUTO_LOCK_PLAN_STATUS, PAYROLL_RULES_VERSION, canLockPayrollPeriodAtDate, getPayrollLockBlockers, createPayrollEmployeeSnapshot, createPayrollPeriodRecord, getLockedPayrollPeriod, getPayrollMonthEndDateKey, getVietnamPayrollDateKey, mapPayrollSnapshotsToRows, normalizePayrollMonthKey } from "../../utils/payrollPeriodLock.js";
import { getPreviousPayrollMonthKey } from "../../utils/payrollDebtCarryover.js";
import { applyEmployeePayrollPolicyForMonth } from "../../utils/payrollPolicyHistory.js";
import { getReadOnlyModuleProjectionEntry, getLocalProjectionClockScope, EMPTY_MODULE_PROJECTION_SOURCE } from "../../services/moduleProjectionCaches.js";
import { useCooperativeProjection } from "../../hooks/useCooperativeProjection.js";
import { useCallback } from "react";
import { projectEvaluationSummaryToPayroll } from "../../utils/payrollEvaluationBonus.js";
import payrollAutomationConfig from "../../../functions/payrollAutomationConfig.json";
import { getSalaryAdvanceMonth, isSalaryAdvanceInMonth, normalizeSalaryAdvanceMonth } from "../../utils/salaryAdvancePeriod.js";
import { Clock, Plus, X, ChevronDown, ChevronUp, Edit3, Lock, Trash2 } from "lucide-react";
// Transitional bundle boundary. Only stable local module bindings are injected;
// all actor/company/business data continues to arrive through current props.
// Generated binding contract is checked against the real source AST.
export function createSalaryView(runtime) {
  const {EMPTY_PAYROLL_VIEW,ModuleDependencyService,PayrollCloseDialog,PayrollCompactMetric,PayrollEvaluationDetailDialog,PayrollWorkspace,SALARY_ADVANCE_DEPARTMENT_OPTIONS,buildPayrollViewProjectionSteps,capitalizeFirst,formatCommissionPercentLabel,formatCurrency,formatDateTimeLabel,formatInputCurrency,formatMonthYearLabel,formatPercentValue,formatTime,getCompanySalaryAdvancePercentByDepartment,getEmployeePositionSummary,getEmployeeSalaryAdvanceLimitConfig,getEmployeeSalaryAdvancePercent,getFriendlyFirebaseErrorMessage,getTodayString,isAccountingPosition,isEmployeeSalesPosition,isOwnerAccountUser,isOwnerPosition,isSalesCollaboratorPosition,normalizeSalaryAdvancePercent,parseInputCurrency,parseLooseMoneyValue,roundMoneyValue} = runtime;
  function SalaryView({
  selectedPayrollEmployeeId, setSelectedPayrollEmployeeId,
  reportPayrollTarget,
  payrollScreen, setPayrollScreen, payrollSearchKeyword, payrollFilterOpen,
  currentCompany,
  currentUser,
  currentEmployee,
  employees,
  employeeReviews = [],
  payrollPeriods = [],
  payrollDebtCarryovers = [],
  payrollAutoLockPlans = [],
  attendance,
  financials,
  performance,
  customers,
  orders,
  payments,
  holidays,
  deliveryReports = [],
  customerComplaints = null,
  attendanceLoaded = false,
  complaintsLoaded = false,
  onAddFinancial,
  onEditFinancial,
  onDeleteFinancial,
  onUpdatePerformance,
  onAddAdvanceRequest,
  advanceRequests,
  onApproveAdvance,
  onRejectAdvance,
  onDeleteAdvance,
  onUpdateCompanySettings,
  onLockPayrollPeriod,
  onAdjustLockedPayroll,
  onPreparePayrollAutoLockPlan,
  onLoadPayrollPeriodSnapshots,
  canViewSalaryAdvance = true,
  canViewAllPayroll = false,
  canCreateSalaryAdvanceRequest = true,
  canCreateSalaryAdvanceForOthers = false,
  canViewSalaryAdvanceRequests = false,
  canApproveSalaryAdvance = false,
  canRejectSalaryAdvance = false,
  canDeleteSalaryAdvance = false,
  canConfigureSalaryAdvanceLimit = false,
  canAddBonusPenalty = false,
  canEditBonusPenalty = false,
  canDeleteBonusPenalty = false,
  canEditOvertimePerformance = false,
  canRecordEmployeePurchase = false,
  canEditEmployeePurchase = false,
  canDeleteEmployeePurchase = false
}) {
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showAdvanceRequestModal, setShowAdvanceRequestModal] = useState(false);
  const [expandedAdvanceEmp, setExpandedAdvanceEmp] = useState(null);
  const [expandedAttendanceEmp, setExpandedAttendanceEmp] = useState(null);
  const [modalType, setModalType] = useState('bonus');
  const [amountInput, setAmountInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [overtimeInput, setOvertimeInput] = useState('');
  const [expandedEmp, setExpandedEmp] = useState(null);
  const [financialDateInput, setFinancialDateInput] = useState(getTodayString());
  const [editingFinancialRecord, setEditingFinancialRecord] = useState(null);
  const [financialModalError, setFinancialModalError] = useState('');
  const [advanceRequestAmount, setAdvanceRequestAmount] = useState('');
  const [advanceRequestReason, setAdvanceRequestReason] = useState('');
  const [advanceRequestSalaryMonth, setAdvanceRequestSalaryMonth] = useState(getTodayString().substring(0, 7));
  const [advanceRequestTargetEmployeeId, setAdvanceRequestTargetEmployeeId] = useState(currentEmployee?.id || '');
  const [advanceRequestStatus, setAdvanceRequestStatus] = useState('');
  const [isSubmittingAdvanceRequest, setIsSubmittingAdvanceRequest] = useState(false);
  const [reviewingAdvanceId, setReviewingAdvanceId] = useState('');
  const [advancePercentInputs, setAdvancePercentInputs] = useState({});
  const [advancePercentStatus, setAdvancePercentStatus] = useState('');
  const [evaluationDetailEmployeeId, setEvaluationDetailEmployeeId] = useState('');
  const [showPayrollLockConfirm, setShowPayrollLockConfirm] = useState(false);
  const [isLockingPayroll, setIsLockingPayroll] = useState(false);
  const payrollLockInFlightRef = useRef(false);
  const [payrollLockStatus, setPayrollLockStatus] = useState('');
  const [payrollCloseReport, setPayrollCloseReport] = useState(null);
  const [payrollAdjustmentRow, setPayrollAdjustmentRow] = useState(null);
  const [payrollAdjustmentNetSalary, setPayrollAdjustmentNetSalary] = useState('');
  const [payrollAdjustmentEndingDebt, setPayrollAdjustmentEndingDebt] = useState('');
  const [payrollAdjustmentReason, setPayrollAdjustmentReason] = useState('');
  const [payrollAdjustmentStatus, setPayrollAdjustmentStatus] = useState('');
  const [isSavingPayrollAdjustment, setIsSavingPayrollAdjustment] = useState(false);
  const [lockedSnapshotRows, setLockedSnapshotRows] = useState([]);
  const [lockedSnapshotLoadState, setLockedSnapshotLoadState] = useState('idle');
  const [lockedSnapshotLoadError, setLockedSnapshotLoadError] = useState('');
  const [lockedSnapshotIntegrityReport, setLockedSnapshotIntegrityReport] = useState(null);
  const [lockedSnapshotReloadToken, setLockedSnapshotReloadToken] = useState(0);
  const [payrollAutoLockPlanStatus, setPayrollAutoLockPlanStatus] = useState('');
  const [payrollAutoLockPlanSyncToken, setPayrollAutoLockPlanSyncToken] = useState(0);
  const payrollAutoLockPlanSignatureRef = useRef('');
  const payrollAutoLockPlanSavingRef = useRef(false);
  const canManagePayrollByRole =
    isOwnerAccountUser(currentEmployee, currentUser)
    || currentUser?.role === 'super_admin'
    || currentEmployee?.role === 'super_admin'
    || isAccountingPosition(currentEmployee?.position);
  const canViewCompanyPayroll = Boolean(canViewAllPayroll || canManagePayrollByRole);
  const canAddSalaryAdjustmentsByRole = Boolean(canManagePayrollByRole || canAddBonusPenalty);
  const canEditSalaryAdjustmentsByRole = Boolean(canManagePayrollByRole || canEditBonusPenalty);
  const canDeleteSalaryAdjustmentsByRole = Boolean(canManagePayrollByRole || canDeleteBonusPenalty);
  const canEditOvertimePerformanceRecordsByRole = Boolean(canManagePayrollByRole || canEditOvertimePerformance);
  const canManageEmployeePurchasesByRole = Boolean(canManagePayrollByRole || canRecordEmployeePurchase);
  const canEditEmployeePurchaseRecordsByRole = Boolean(canManagePayrollByRole || canEditEmployeePurchase);
  const canDeleteEmployeePurchaseRecordsByRole = Boolean(canManagePayrollByRole || canDeleteEmployeePurchase);
  const payrollConfigNoticeStorageKey = `hd_payroll_config_notice_hidden_${currentCompany?.id || currentCompany?.companyId || currentCompany?.code || 'default'}`;
  const [payrollConfigNoticeHidden, setPayrollConfigNoticeHidden] = useState(false);

  const [salaryMonth, setSalaryMonth] = useState(getTodayString().substring(0, 7));
  const handledReportPayrollTarget = useRef(null);
  useEffect(() => {
    if (handledReportPayrollTarget.current === reportPayrollTarget) return;
    const id = reportPayrollTarget?.employeeId;
    if (!id || (!canViewCompanyPayroll && id !== currentEmployee?.id)) return;
    if (!(employees || []).some(item => item.id === id)) return;
    handledReportPayrollTarget.current = reportPayrollTarget;
    setSelectedPayrollEmployeeId(id);
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(reportPayrollTarget.monthKey || '')) setSalaryMonth(reportPayrollTarget.monthKey);
    setPayrollScreen('detail');
  }, [reportPayrollTarget, canViewCompanyPayroll, currentEmployee?.id, employees, setPayrollScreen]);
  useAppScreenBack(() => {
    if (showPayrollLockConfirm) {
      setShowPayrollLockConfirm(false);
      return true;
    }
    if (showAdvanceRequestModal) {
      setShowAdvanceRequestModal(false);
      return true;
    }
    if (payrollScreen === 'detail') {
      setPayrollScreen('list');
      return true;
    }
    if (payrollScreen !== 'overview') {
      setPayrollScreen('overview');
      return true;
    }
    return false;
  });
  useEffect(() => {
    const scrollArea = document.querySelector('.hd-app-content');
    if (scrollArea) scrollArea.scrollTop = 0;
  }, [payrollScreen]);
  const currentMonth = salaryMonth || getTodayString().substring(0, 7);
  const currentMonthLabel = `Tháng ${currentMonth.substring(5, 7)}/${currentMonth.substring(0, 4)}`;
  const payrollCompanyId = currentCompany?.id || currentCompany?.companyId || currentEmployee?.companyId || currentUser?.companyId || '';
  const lockedPayrollPeriod = useMemo(
    () => getLockedPayrollPeriod(payrollPeriods, payrollCompanyId, currentMonth),
    [currentMonth, payrollCompanyId, payrollPeriods]
  );
  const isPayrollLocked = Boolean(lockedPayrollPeriod);
  const previousPayrollMonth = useMemo(
    () => getPreviousPayrollMonthKey(currentMonth),
    [currentMonth]
  );
  const previousLockedPayrollPeriod = useMemo(
    () => getLockedPayrollPeriod(payrollPeriods, payrollCompanyId, previousPayrollMonth),
    [payrollCompanyId, payrollPeriods, previousPayrollMonth]
  );
  const shouldReviewPreviousPayrollPeriod = Boolean(
    canManagePayrollByRole
    && canViewCompanyPayroll
    && currentMonth === getVietnamPayrollDateKey().substring(0, 7)
    && previousPayrollMonth
    && !previousLockedPayrollPeriod
  );
  const payrollPolicyEmployees = useMemo(
    () => isPayrollLocked
      ? []
      : (employees || []).map(emp => applyEmployeePayrollPolicyForMonth(emp, currentMonth)),
    [currentMonth, employees, isPayrollLocked]
  );
  const activePayrollAutoLockPlan = useMemo(() => (
    (payrollAutoLockPlans || []).find(plan => (
      !plan?.isArchived
      && `${plan?.companyId || ''}` === `${payrollCompanyId || ''}`
      && normalizePayrollMonthKey(plan?.monthKey) === currentMonth
    )) || null
  ), [currentMonth, payrollAutoLockPlans, payrollCompanyId]);
  const payrollMonthEndDateKey = getPayrollMonthEndDateKey(currentMonth);
  const isPayrollLockDateEligible = canLockPayrollPeriodAtDate(currentMonth, getVietnamPayrollDateKey());
  const canAddSalaryAdjustments = !isPayrollLocked && canAddSalaryAdjustmentsByRole;
  const canEditSalaryAdjustments = !isPayrollLocked && canEditSalaryAdjustmentsByRole;
  const canDeleteSalaryAdjustments = !isPayrollLocked && canDeleteSalaryAdjustmentsByRole;
  const canEditOvertimePerformanceRecords = !isPayrollLocked && canEditOvertimePerformanceRecordsByRole;
  const canManageEmployeePurchases = !isPayrollLocked && canManageEmployeePurchasesByRole;
  const canEditEmployeePurchaseRecords = !isPayrollLocked && canEditEmployeePurchaseRecordsByRole;
  const canDeleteEmployeePurchaseRecords = !isPayrollLocked && canDeleteEmployeePurchaseRecordsByRole;
  const salaryAdvancePercentByDepartment = useMemo(
    () => getCompanySalaryAdvancePercentByDepartment(currentCompany),
    [currentCompany]
  );
  const salaryAdvanceLimitConfig = getEmployeeSalaryAdvanceLimitConfig(currentCompany, currentEmployee, null);
  const salaryAdvancePercent = salaryAdvanceLimitConfig.percent ?? getEmployeeSalaryAdvancePercent(currentCompany, currentEmployee, null);
  const canReviewSalaryAdvances = !isPayrollLocked && Boolean(canManagePayrollByRole || canViewSalaryAdvanceRequests || canApproveSalaryAdvance || canRejectSalaryAdvance || canDeleteSalaryAdvance);
  const canApproveAdvanceRequest = !isPayrollLocked && Boolean(canManagePayrollByRole || canApproveSalaryAdvance);
  const canRejectAdvanceRequest = !isPayrollLocked && Boolean(canManagePayrollByRole || canRejectSalaryAdvance);
  const canDeleteAdvanceRequest = !isPayrollLocked && Boolean(canManagePayrollByRole || canDeleteSalaryAdvance);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      setPayrollConfigNoticeHidden(window.localStorage.getItem(payrollConfigNoticeStorageKey) === '1');
    } catch (error) {
      setPayrollConfigNoticeHidden(false);
    }
  }, [payrollConfigNoticeStorageKey]);

  useEffect(() => {
    setAdvancePercentInputs(SALARY_ADVANCE_DEPARTMENT_OPTIONS.reduce((acc, department) => {
      const value = salaryAdvancePercentByDepartment?.[department.key];
      acc[department.key] = value === null || value === undefined ? '' : `${value}`.replace('.', ',');
      return acc;
    }, {}));
  }, [salaryAdvancePercentByDepartment]);

  const currentEmployeeId = currentEmployee?.id || '';
  const canCreateOwnSalaryAdvanceRequest = !isPayrollLocked && Boolean(currentEmployeeId && (canCreateSalaryAdvanceRequest || currentEmployee?.id === currentEmployeeId));
  const canCreateSalaryAdvanceForOthersInPeriod = !isPayrollLocked && Boolean(canCreateSalaryAdvanceForOthers);
  const visibleSalaryEmployees = useMemo(() => {
    if (isPayrollLocked) return [];
    if (!currentEmployeeId) return [];
    if (canViewCompanyPayroll) {
      return payrollPolicyEmployees.filter(emp =>
        emp?.id &&
        !emp?.isArchived &&
        emp.role !== 'super_admin' &&
        !isOwnerPosition(emp.position)
      );
    }
    const ownEmployee = payrollPolicyEmployees.find(emp => emp.id === currentEmployeeId);
    return ownEmployee ? [ownEmployee] : [];
  }, [payrollPolicyEmployees, currentEmployeeId, canViewCompanyPayroll, isPayrollLocked]);
  const payrollSnapshotLoaderRef = useRef(onLoadPayrollPeriodSnapshots);

  useEffect(() => {
    payrollSnapshotLoaderRef.current = onLoadPayrollPeriodSnapshots;
  }, [onLoadPayrollPeriodSnapshots]);

  useEffect(() => {
    let isActive = true;
    if (!isPayrollLocked) {
      setLockedSnapshotRows([]);
      setLockedSnapshotLoadState('idle');
      setLockedSnapshotLoadError('');
      setLockedSnapshotIntegrityReport(null);
      return () => {
        isActive = false;
      };
    }

    const loadSnapshots = async () => {
      setLockedSnapshotLoadState('loading');
      setLockedSnapshotLoadError('');
      setLockedSnapshotIntegrityReport(null);
      const loader = payrollSnapshotLoaderRef.current;
      if (typeof loader !== 'function') {
        if (isActive) {
          setLockedSnapshotRows([]);
          setLockedSnapshotLoadState('error');
          setLockedSnapshotLoadError('Không thể tải ảnh chụp kỳ lương trên thiết bị này.');
        }
        return;
      }

      const result = await loader({ monthKey: currentMonth });
      if (!isActive) return;
      if (result?.success === false) {
        setLockedSnapshotRows([]);
        setLockedSnapshotLoadState('error');
        setLockedSnapshotLoadError(result.message || 'Không tải được ảnh chụp kỳ lương.');
        return;
      }

      const allowedEmployeeIds = canViewCompanyPayroll ? null : new Set([currentEmployeeId].filter(Boolean));
      setLockedSnapshotRows(mapPayrollSnapshotsToRows(result?.snapshots || [], allowedEmployeeIds));
      setLockedSnapshotIntegrityReport(result?.integrityReport || null);
      setLockedSnapshotLoadState('loaded');
    };

    loadSnapshots().catch(error => {
      if (!isActive) return;
      setLockedSnapshotRows([]);
      setLockedSnapshotLoadState('error');
      setLockedSnapshotLoadError(getFriendlyFirebaseErrorMessage(error, 'Không tải được ảnh chụp kỳ lương.'));
    });

    return () => {
      isActive = false;
    };
  }, [canViewCompanyPayroll, currentEmployeeId, currentMonth, isPayrollLocked, lockedPayrollPeriod?.id, lockedSnapshotReloadToken]);
  const missingPayrollConfigEmployees = useMemo(
    () => ModuleDependencyService.getEmployeesMissingPayrollConfig(visibleSalaryEmployees),
    [visibleSalaryEmployees]
  );
  const showPayrollConfigNotice = !isPayrollLocked && canViewCompanyPayroll && !payrollConfigNoticeHidden && missingPayrollConfigEmployees.length > 0;
  const handleHidePayrollConfigNotice = () => {
    setPayrollConfigNoticeHidden(true);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(payrollConfigNoticeStorageKey, '1');
    } catch (error) {
      // Chỉ ảnh hưởng việc ẩn thông báo trên thiết bị, không ảnh hưởng dữ liệu lương.
    }
  };

  const [payrollCalculationAttempt,setPayrollCalculationAttempt]=useState(0);
  const preparePayrollView=useMemo(()=>()=>buildPayrollViewProjectionSteps({isPayrollLocked, currentMonth, employeeReviews, orders, deliveryReports, complaintsLoaded, customerComplaints, payrollCompanyId, attendance, attendanceLoaded, currentCompany, employees, visibleSalaryEmployees, payrollDebtCarryovers, payrollPolicyEmployees, financials, performance, customers, payments, holidays}),[isPayrollLocked, currentMonth, employeeReviews, orders, deliveryReports, complaintsLoaded, customerComplaints, payrollCompanyId, attendance, attendanceLoaded, currentCompany, employees, visibleSalaryEmployees, payrollDebtCarryovers, payrollPolicyEmployees, financials, performance, customers, payments, holidays,payrollCalculationAttempt]);
  const payrollProjectionEntry=!isPayrollLocked?getReadOnlyModuleProjectionEntry('payroll',
    [currentCompany,currentEmployee,employees,employeeReviews,attendance,financials,performance,customers,orders,payments,holidays,deliveryReports,customerComplaints||EMPTY_MODULE_PROJECTION_SOURCE,payrollDebtCarryovers,payrollPeriods],
    {companyId:payrollCompanyId,employeeId:currentEmployeeId,permissionKey:JSON.stringify([canViewCompanyPayroll,Boolean(attendanceLoaded),Boolean(complaintsLoaded)]),
      periodKey:currentMonth,clockKey:getLocalProjectionClockScope(getTodayString())}):undefined;
  const payrollViewProjection=useCooperativeProjection(preparePayrollView,payrollProjectionEntry);
  const payrollViewReady=isPayrollLocked || (!payrollViewProjection.pending && !payrollViewProjection.error);
  const payrollView=payrollViewProjection.value?.detailsByEmployee ? payrollViewProjection.value : EMPTY_PAYROLL_VIEW;
  const payrollEvaluationResultsByEmployee=payrollView.evaluations;
  const buildPayrollSalaryDetails=useCallback(employeeId=>payrollView.detailsByEmployee.get(employeeId) || null,[payrollView]);
  const liveSalaryRows=payrollView.rows;

  const salaryRows = isPayrollLocked ? lockedSnapshotRows : liveSalaryRows;

  const aggregateData = useMemo(() => {
    const totals = salaryRows.reduce((acc, row) => {
      acc.totalSalary += row.details.netSalary;
      acc.totalDays += row.details.workDays;
      acc.totalAdvance += row.details.totalAdvance;
      acc.totalEmployeePurchase += row.details.totalEmployeePurchase || 0;
      acc.totalPenalty += row.details.totalPenalty;
      acc.totalBonus += row.details.totalBonus || 0;
      acc.totalEvaluationBonus += row.details.evaluationBonus || 0;
      acc.totalOpeningDebt += row.details.openingDebt || 0;
      acc.totalOpeningDebtApplied += row.details.openingDebtApplied || 0;
      acc.totalEndingDebt += row.details.endingDebt || 0;
      return acc;
    }, {
      totalSalary: 0,
      totalDays: 0,
      totalAdvance: 0,
      totalEmployeePurchase: 0,
      totalPenalty: 0,
      totalBonus: 0,
      totalEvaluationBonus: 0,
      totalOpeningDebt: 0,
      totalOpeningDebtApplied: 0,
      totalEndingDebt: 0
    });

    const calculatedTotals = {
      ...totals,
      avgDaily: totals.totalDays > 0 ? totals.totalSalary / totals.totalDays : 0
    };
    if (!isPayrollLocked || !lockedPayrollPeriod?.totals) return calculatedTotals;
    return {
      ...calculatedTotals,
      ...lockedPayrollPeriod.totals
    };
  }, [isPayrollLocked, lockedPayrollPeriod?.totals, salaryRows]);

  const currentSalaryDetails = useMemo(() => (
    currentEmployeeId
      ? (isPayrollLocked
          ? salaryRows.find(row => row.emp?.id === currentEmployeeId)?.details || null
          : buildPayrollSalaryDetails(currentEmployeeId))
      : null
  ), [buildPayrollSalaryDetails, currentEmployeeId, isPayrollLocked, salaryRows]);
  const selectedEvaluationDetail = useMemo(() => {
    if (!evaluationDetailEmployeeId) return null;
    const lockedRow = isPayrollLocked
      ? salaryRows.find(row => row.emp?.id === evaluationDetailEmployeeId)
      : null;
    const targetEmployee = isPayrollLocked
      ? lockedRow?.emp
      : (employees || []).find(emp => emp.id === evaluationDetailEmployeeId);
    if (!targetEmployee) return null;
    return {
      employee: targetEmployee,
      result: isPayrollLocked
        ? (lockedRow?.details?.evaluationResult || null)
        : (payrollEvaluationResultsByEmployee.get(evaluationDetailEmployeeId)
          || projectEvaluationSummaryToPayroll(null, {
            employeeId: evaluationDetailEmployeeId,
            monthKey: currentMonth
          }))
    };
  }, [currentMonth, employees, evaluationDetailEmployeeId, isPayrollLocked, payrollEvaluationResultsByEmployee, salaryRows]);
  const closeEvaluationDetail = useCallback(() => setEvaluationDetailEmployeeId(''), []);
  const payrollMonthEndLabel = payrollMonthEndDateKey
    ? payrollMonthEndDateKey.split('-').reverse().join('/')
    : '';
  const canLockSelectedPayrollPeriod = Boolean(
    payrollViewReady &&
    canManagePayrollByRole
    && canViewCompanyPayroll
    && !isPayrollLocked
    && isPayrollLockDateEligible
    && liveSalaryRows.length > 0
    && typeof onLockPayrollPeriod === 'function'
  );
  const canPreparePayrollAutoLock = Boolean(
    payrollViewReady &&
    payrollAutomationConfig.autoLockEnabled
    && canManagePayrollByRole
    && canViewCompanyPayroll
    && !isPayrollLocked
    && currentMonth <= getVietnamPayrollDateKey().substring(0, 7)
    && liveSalaryRows.length > 0
    && typeof onPreparePayrollAutoLockPlan === 'function'
  );

  const buildPayrollLockPayload = useCallback((lockedAt = new Date().toISOString()) => {
    const lockedByEmployeeId = currentEmployeeId || currentUser?.employeeId || currentUser?.id || '';
    const lockedByName = currentEmployee?.name || currentUser?.name || currentUser?.displayName || 'Người quản lý';
    const snapshots = liveSalaryRows.map((row, orderIndex) => createPayrollEmployeeSnapshot({
      companyId: payrollCompanyId,
      monthKey: currentMonth,
      employee: row.emp,
      salaryDetails: row.details,
      orderIndex,
      lockedAt,
      lockedByEmployeeId
    })).filter(Boolean);
    const period = createPayrollPeriodRecord({
      companyId: payrollCompanyId,
      monthKey: currentMonth,
      snapshots,
      totals: aggregateData,
      lockedAt,
      lockedByEmployeeId,
      lockedByName,
      lockedByRole: currentEmployee?.position || currentUser?.role || ''
    });
    return { period, snapshots };
  }, [aggregateData, currentEmployee, currentEmployeeId, currentMonth, currentUser, liveSalaryRows, payrollCompanyId]);

  const payrollLockBlockers = useMemo(() => getPayrollLockBlockers(
    buildPayrollLockPayload().snapshots, activePayrollAutoLockPlan
  ), [buildPayrollLockPayload, activePayrollAutoLockPlan]);

  const payrollAutoLockPlanSignature = useMemo(() => JSON.stringify({
    companyId: payrollCompanyId,
    monthKey: currentMonth,
    rows: liveSalaryRows.map(({ emp, details }) => ({
      employeeId: emp?.id || '',
      employeeName: emp?.name || '',
      employeePosition: emp?.position || '',
      payrollPolicies: emp?.payrollPolicies || emp?.salaryPolicyHistory || [],
      salaryDetails: details
    }))
  }), [currentMonth, liveSalaryRows, payrollCompanyId]);

  useEffect(() => {
    setShowPayrollLockConfirm(false);
    setPayrollLockStatus('');
    setPayrollCloseReport(null);
  }, [currentMonth]);

  useEffect(() => {
    if (!canPreparePayrollAutoLock || !payrollAutoLockPlanSignature || typeof window === 'undefined') {
      payrollAutoLockPlanSignatureRef.current = '';
      return undefined;
    }
    const activePlanStatus = `${activePayrollAutoLockPlan?.status || ''}`.trim().toUpperCase();
    if (activePayrollAutoLockPlan && (
      ![PAYROLL_AUTO_LOCK_PLAN_STATUS.OPEN, 'READY'].includes(activePlanStatus)
      || activePayrollAutoLockPlan.rulesVersion !== PAYROLL_RULES_VERSION
    )) {
      payrollAutoLockPlanSignatureRef.current = payrollAutoLockPlanSignature;
      setPayrollAutoLockPlanStatus('Kế hoạch đang được máy chủ xử lý hoặc cần rà soát; không tự ghi đè dữ liệu đã kiểm tra.');
      return undefined;
    }
    if (
      [PAYROLL_AUTO_LOCK_PLAN_STATUS.OPEN, 'READY'].includes(activePlanStatus)
      && activePayrollAutoLockPlan?.sourceSignature === payrollAutoLockPlanSignature
    ) {
      payrollAutoLockPlanSignatureRef.current = payrollAutoLockPlanSignature;
      return undefined;
    }
    if (
      payrollAutoLockPlanSavingRef.current
      || payrollAutoLockPlanSignatureRef.current === payrollAutoLockPlanSignature
    ) {
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      const payload = buildPayrollLockPayload();
      if (!payload?.period || payload.snapshots.length === 0) {
        setPayrollAutoLockPlanStatus(getPayrollLockBlockers(payload.snapshots).join(' '));
        return;
      }
      payrollAutoLockPlanSavingRef.current = true;
      try {
        const result = await onPreparePayrollAutoLockPlan({
          ...payload,
          sourceSignature: payrollAutoLockPlanSignature
        });
        if (result?.success === false) {
          setPayrollAutoLockPlanStatus(result.message || 'Chưa chuẩn bị được khóa tự động.');
          return;
        }
        payrollAutoLockPlanSignatureRef.current = payrollAutoLockPlanSignature;
        setPayrollAutoLockPlanStatus('Đã chuẩn bị khóa tự động cuối tháng.');
        setPayrollAutoLockPlanSyncToken(token => token + 1);
      } catch (error) {
        setPayrollAutoLockPlanStatus(getFriendlyFirebaseErrorMessage(error, 'Chưa chuẩn bị được khóa tự động.'));
      } finally {
        payrollAutoLockPlanSavingRef.current = false;
      }
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [
    activePayrollAutoLockPlan?.sourceSignature,
    activePayrollAutoLockPlan?.status,
    activePayrollAutoLockPlan?.rulesVersion,
    buildPayrollLockPayload,
    canPreparePayrollAutoLock,
    onPreparePayrollAutoLockPlan,
    payrollAutoLockPlanSignature,
    payrollAutoLockPlanSyncToken
  ]);

  const handleConfirmPayrollLock = async () => {
    if (!canLockSelectedPayrollPeriod || isLockingPayroll || payrollLockInFlightRef.current) return;
    const { period, snapshots } = buildPayrollLockPayload();

    if (!period || snapshots.length === 0) {
      setPayrollLockStatus(getPayrollLockBlockers(snapshots).join(' '));
      return;
    }

    payrollLockInFlightRef.current = true;
    setIsLockingPayroll(true);
    setPayrollLockStatus('Đang lưu ảnh chụp và khóa kỳ lương...');
    try {
      const result = await onLockPayrollPeriod({ period, snapshots });
      if (result?.success === false) {
        setPayrollLockStatus(result.message || 'Không khóa được kỳ lương.');
        return;
      }
      const allowedEmployeeIds = canViewCompanyPayroll ? null : new Set([currentEmployeeId].filter(Boolean));
      setLockedSnapshotRows(mapPayrollSnapshotsToRows(result?.snapshots || snapshots, allowedEmployeeIds));
      setLockedSnapshotLoadState('loaded');
      setLockedSnapshotLoadError('');
      setShowPayrollLockConfirm(false);
      setPayrollCloseReport({
        monthKey: currentMonth,
        employeeCount: result?.period?.employeeCount || snapshots.length,
        workDays: Number(result?.period?.totals?.totalDays) || 0,
        payable: Number(result?.period?.totals?.totalSalary) || 0,
        carryCount: result?.debtCarryovers?.length || 0,
        carryForward: Number(result?.period?.totalEndingDebt) || 0
      });
      setPayrollLockStatus(`Đã khóa ${currentMonthLabel.toLowerCase()}. Dữ liệu kỳ này chuyển sang chế độ chỉ đọc.`);
    } catch (error) {
      setPayrollLockStatus(getFriendlyFirebaseErrorMessage(error, 'Không khóa được kỳ lương. Dữ liệu hiện tại vẫn được giữ nguyên.'));
    } finally {
      payrollLockInFlightRef.current = false;
      setIsLockingPayroll(false);
    }
  };
  const openPayrollAdjustmentDialog = (row) => {
    if (!row?.snapshotId || !isPayrollLocked || !canManagePayrollByRole) return;
    setPayrollAdjustmentRow(row);
    setPayrollAdjustmentNetSalary(`${Math.max(0, Number(row?.details?.netSalary || 0))}`);
    setPayrollAdjustmentEndingDebt(`${Math.max(0, Number(row?.details?.endingDebt || 0))}`);
    setPayrollAdjustmentReason('');
    setPayrollAdjustmentStatus('');
  };

  const handleSubmitPayrollAdjustment = async (event) => {
    event.preventDefault();
    if (!payrollAdjustmentRow?.snapshotId || isSavingPayrollAdjustment || typeof onAdjustLockedPayroll !== 'function') return;
    const normalizedReason = `${payrollAdjustmentReason || ''}`.trim();
    if (!normalizedReason) {
      setPayrollAdjustmentStatus('Vui lòng nhập lý do điều chỉnh.');
      return;
    }
    setIsSavingPayrollAdjustment(true);
    setPayrollAdjustmentStatus('Đang lưu phiếu điều chỉnh và nhật ký kiểm toán...');
    try {
      const result = await onAdjustLockedPayroll({
        monthKey: currentMonth,
        snapshotId: payrollAdjustmentRow.snapshotId,
        nextNetSalary: parseInputCurrency(payrollAdjustmentNetSalary),
        nextEndingDebt: parseInputCurrency(payrollAdjustmentEndingDebt),
        reason: normalizedReason
      });
      if (result?.success === false) {
        setPayrollAdjustmentStatus(result.message || 'Không lưu được phiếu điều chỉnh.');
        return;
      }
      setPayrollAdjustmentRow(null);
      setPayrollAdjustmentStatus('');
      setLockedSnapshotReloadToken(token => token + 1);
      setPayrollLockStatus('Đã lưu phiếu điều chỉnh chính thức; snapshot gốc không thay đổi.');
    } catch (error) {
      setPayrollAdjustmentStatus(getFriendlyFirebaseErrorMessage(error, 'Không lưu được phiếu điều chỉnh.'));
    } finally {
      setIsSavingPayrollAdjustment(false);
    }
  };
  const pendingAdvances = useMemo(() => (
    advanceRequests
      ? advanceRequests.filter(r => r.empId === currentEmployeeId && r.status === 'pending' && isSalaryAdvanceInMonth(r, currentMonth))
      : []
  ), [advanceRequests, currentEmployeeId, currentMonth]);
  const reviewAdvanceRequests = useMemo(() => (
    canReviewSalaryAdvances && advanceRequests
      ? advanceRequests.filter(r => r.status === 'pending' && isSalaryAdvanceInMonth(r, currentMonth))
      : []
  ), [advanceRequests, canReviewSalaryAdvances, currentMonth]);
  const pendingAdvanceAmount = pendingAdvances.reduce((sum, req) => sum + parseLooseMoneyValue(req.amount), 0);
  const salaryAdvanceBaseAmount = Math.max(0, roundMoneyValue(currentSalaryDetails?.grossSalary || currentSalaryDetails?.netSalary || 0));
  const salaryAdvanceIsUnlimited = Boolean(salaryAdvanceLimitConfig.isUnlimited);
  const salaryAdvanceLimitAmount = salaryAdvanceIsUnlimited ? null : roundMoneyValue(salaryAdvanceBaseAmount * (salaryAdvancePercent / 100));
  const salaryAdvanceUsedAmount = roundMoneyValue((currentSalaryDetails?.totalAdvance || 0) + pendingAdvanceAmount);
  const salaryAdvanceRemainingAmount = salaryAdvanceIsUnlimited ? null : Math.max(0, roundMoneyValue(salaryAdvanceLimitAmount - salaryAdvanceUsedAmount));

  const advanceTargetEmployees = useMemo(() => {
    if (!canCreateSalaryAdvanceForOthersInPeriod) return [];
    return (employees || []).filter(emp => (
      emp?.id
      && !emp?.isArchived
      && emp.role !== 'super_admin'
      && !isOwnerPosition(emp.position)
    ));
  }, [canCreateSalaryAdvanceForOthersInPeriod, employees]);
  const advanceTargetSelectEmployees = useMemo(() => {
    if (!canCreateSalaryAdvanceForOthersInPeriod) return [];
    const targets = [...advanceTargetEmployees];
    if (currentEmployee?.id && canCreateOwnSalaryAdvanceRequest && !targets.some(emp => emp.id === currentEmployee.id)) {
      targets.unshift(currentEmployee);
    }
    return targets;
  }, [advanceTargetEmployees, canCreateSalaryAdvanceForOthersInPeriod, canCreateOwnSalaryAdvanceRequest, currentEmployee]);

  const advanceRequestTargetSummary = useMemo(() => {
    const targetId = advanceRequestTargetEmployeeId || currentEmployeeId;
    const targetEmployee = (employees || []).find(emp => emp.id === targetId) || null;
    if (!targetEmployee?.id) return null;
    const targetDetails = buildPayrollSalaryDetails(targetEmployee.id);
    const targetLimitConfig = getEmployeeSalaryAdvanceLimitConfig(currentCompany, targetEmployee, null);
    const targetPercent = targetLimitConfig.percent ?? getEmployeeSalaryAdvancePercent(currentCompany, targetEmployee, null);
    const targetPendingAdvances = (advanceRequests || []).filter(req => (
      req.empId === targetEmployee.id
      && req.status === 'pending'
      && isSalaryAdvanceInMonth(req, currentMonth)
    ));
    const targetPendingAmount = targetPendingAdvances.reduce((sum, req) => sum + parseLooseMoneyValue(req.amount), 0);
    const targetBaseAmount = Math.max(0, roundMoneyValue(targetDetails?.grossSalary || targetDetails?.netSalary || 0));
    const targetIsUnlimited = Boolean(targetLimitConfig.isUnlimited);
    const targetLimitAmount = targetIsUnlimited ? null : roundMoneyValue(targetBaseAmount * (targetPercent / 100));
    const targetUsedAmount = roundMoneyValue((targetDetails?.totalAdvance || 0) + targetPendingAmount);
    const targetRemainingAmount = targetIsUnlimited ? null : Math.max(0, roundMoneyValue(targetLimitAmount - targetUsedAmount));
    return {
      targetEmployee,
      targetDetails,
      targetPercent,
      targetIsUnlimited,
      targetBaseAmount,
      targetLimitAmount,
      targetUsedAmount,
      targetRemainingAmount
    };
  }, [advanceRequestTargetEmployeeId, currentCompany, currentEmployeeId, employees, currentMonth, advanceRequests, buildPayrollSalaryDetails]);

  const openFinancialModal = (emp, type) => {
    if (type === 'employee_purchase') {
      if (!canManageEmployeePurchases) return;
    } else if (type === 'performance') {
      if (!canEditOvertimePerformanceRecords) return;
    } else if (!canAddSalaryAdjustments) {
      return;
    }
    setSelectedEmp(emp);
    setModalType(type);
    setEditingFinancialRecord(null);
    setAmountInput('');
    setReasonInput(type === 'employee_purchase' ? 'Mua hàng công ty' : '');
    if (type === 'performance') {
      const existingDetails = buildPayrollSalaryDetails(emp.id);
      setOvertimeInput(`${existingDetails?.perf?.overtime || 0}`);
    } else {
      setOvertimeInput('');
    }
    setFinancialDateInput(getTodayString());
    setFinancialModalError('');
    setShowModal(true);
  };

  const openEditFinancialModal = (emp, record) => {
    if (!record) return;
    if (record.type === 'employee_purchase') {
      if (!canEditEmployeePurchaseRecords) return;
    } else if (!canEditSalaryAdjustments) {
      return;
    }
    setSelectedEmp(emp);
    setModalType(record.type || 'bonus');
    setEditingFinancialRecord(record);
    setAmountInput(record.amount || '');
    setReasonInput(record.reason || '');
    setFinancialDateInput(record.date || getTodayString());
    setFinancialModalError('');
    setShowModal(true);
  };

  const handleDeleteFinancialRecord = async (record) => {
    if (!record?.id) return;
    const isAdvanceRecord = record.type === 'advance';
    const isEmployeePurchaseRecord = record.type === 'employee_purchase';
    if (isAdvanceRecord) {
      if (!canDeleteAdvanceRequest) return;
    } else if (isEmployeePurchaseRecord) {
      if (!canDeleteEmployeePurchaseRecords || !onDeleteFinancial) return;
    } else if (!canDeleteSalaryAdjustments || !onDeleteFinancial) {
      return;
    }
    if (!window.confirm(isAdvanceRecord ? 'Xóa khoản ứng này?' : isEmployeePurchaseRecord ? 'Xóa khoản mua hàng cấn lương này?' : 'Xóa khoản thưởng/phạt này?')) return;
    if (isAdvanceRecord && record.linkedAdvanceRequestId && onDeleteAdvance) {
      const result = await onDeleteAdvance(record.linkedAdvanceRequestId);
      if (result?.success === false) setAdvanceRequestStatus(result.message || 'Không xóa được khoản ứng.');
      return;
    }
    await onDeleteFinancial(record.id);
  };

  const handleDeleteAdvanceRequest = async (reqId) => {
    if (!canDeleteAdvanceRequest || !onDeleteAdvance || !reqId) return;
    if (!window.confirm('Xóa lệnh ứng này?')) return;
    const result = await onDeleteAdvance(reqId);
    setAdvanceRequestStatus(result?.success === false ? (result.message || 'Không xóa được lệnh ứng.') : 'Đã xóa lệnh ứng.');
  };

  const handleReviewAdvanceRequest = async (reqId, action) => {
    if (!reqId || reviewingAdvanceId) return;
    const isApprove = action === 'approve';
    const allowed = isApprove ? canApproveAdvanceRequest : canRejectAdvanceRequest;
    const handler = isApprove ? onApproveAdvance : onRejectAdvance;
    if (!allowed || !handler) {
      setAdvanceRequestStatus('Tài khoản hiện tại chưa có quyền xử lý lệnh ứng.');
      return;
    }
    setReviewingAdvanceId(reqId);
    setAdvanceRequestStatus(isApprove ? 'Đang duyệt lệnh ứng...' : 'Đang hủy lệnh ứng...');
    try {
      const result = await handler(reqId);
      if (result?.success === false) {
        setAdvanceRequestStatus(result.message || (isApprove ? 'Không duyệt được lệnh ứng.' : 'Không hủy được lệnh ứng.'));
        return;
      }
      setAdvanceRequestStatus(result?.warning || (isApprove ? 'Đã duyệt lệnh ứng và ghi vào bảng lương.' : 'Đã hủy lệnh ứng.'));
    } catch (error) {
      setAdvanceRequestStatus(getFriendlyFirebaseErrorMessage(error, isApprove ? 'Không duyệt được lệnh ứng.' : 'Không hủy được lệnh ứng.'));
    } finally {
      setReviewingAdvanceId('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!payrollViewReady) { setFinancialModalError('Đang cập nhật bảng lương. Vui lòng chờ tính xong rồi lưu.');return; }
    if (!selectedEmp) return;

    if (modalType === 'performance') {
      if (!canEditOvertimePerformanceRecords) return;
      await onUpdatePerformance(selectedEmp.id, overtimeInput, currentMonth);
    } else {
      const val = parseInputCurrency(amountInput);
      if (!val || isNaN(val)) return;
      if (modalType === 'employee_purchase') {
        if (editingFinancialRecord?.id && !canEditEmployeePurchaseRecords) return;
        if (!editingFinancialRecord?.id && !canManageEmployeePurchases) return;
      } else {
        if (editingFinancialRecord?.id && !canEditSalaryAdjustments) return;
        if (!editingFinancialRecord?.id && !canAddSalaryAdjustments) return;
      }
      if (editingFinancialRecord?.id && onEditFinancial) {
        await onEditFinancial(editingFinancialRecord.id, {
          type: modalType,
          amount: val,
          reason: capitalizeFirst(reasonInput),
          date: financialDateInput || getTodayString()
        });
      } else {
        await onAddFinancial(selectedEmp.id, modalType, val, capitalizeFirst(reasonInput), financialDateInput || getTodayString());
      }
    }

    setEditingFinancialRecord(null);
    setFinancialModalError('');
    setShowModal(false);
  };

  const getFinancialModalTitle = () => {
    if (modalType === 'performance') return 'Cập nhật giờ tăng ca đã duyệt';
    if (modalType === 'employee_purchase') {
      return editingFinancialRecord ? 'Sửa mua hàng cấn lương' : 'Ghi mua hàng cấn lương';
    }
    if (modalType === 'bonus') return editingFinancialRecord ? 'Sửa tiền thưởng' : 'Thêm tiền thưởng';
    return editingFinancialRecord ? 'Sửa tiền phạt' : 'Trừ tiền phạt';
  };

  const openAdvanceRequestModal = (targetEmployeeId = currentEmployeeId) => {
    const targetId = targetEmployeeId || currentEmployeeId;
    const isOwnRequest = targetId === currentEmployeeId;
    if (!isOwnRequest && !canCreateSalaryAdvanceForOthersInPeriod) return;
    if (isOwnRequest && !canCreateOwnSalaryAdvanceRequest) return;
    const targetSummary = targetId === advanceRequestTargetEmployeeId
      ? advanceRequestTargetSummary
      : (() => {
          const targetEmployee = (employees || []).find(emp => emp.id === targetId);
          if (!targetEmployee?.id) return null;
          const targetDetails = buildPayrollSalaryDetails(targetEmployee.id);
          const targetLimitConfig = getEmployeeSalaryAdvanceLimitConfig(currentCompany, targetEmployee, null);
          const targetPercent = targetLimitConfig.percent ?? getEmployeeSalaryAdvancePercent(currentCompany, targetEmployee, null);
          const targetPendingAmount = (advanceRequests || [])
            .filter(req => req.empId === targetEmployee.id && req.status === 'pending' && isSalaryAdvanceInMonth(req, currentMonth))
            .reduce((sum, req) => sum + parseLooseMoneyValue(req.amount), 0);
          const targetBaseAmount = Math.max(0, roundMoneyValue(targetDetails?.grossSalary || targetDetails?.netSalary || 0));
          const targetIsUnlimited = Boolean(targetLimitConfig.isUnlimited);
          const targetLimitAmount = targetIsUnlimited ? null : roundMoneyValue(targetBaseAmount * (targetPercent / 100));
          const targetUsedAmount = roundMoneyValue((targetDetails?.totalAdvance || 0) + targetPendingAmount);
          return {
            targetEmployee,
            targetIsUnlimited,
            targetRemainingAmount: targetIsUnlimited ? null : Math.max(0, roundMoneyValue(targetLimitAmount - targetUsedAmount))
          };
        })();
    if (!targetSummary?.targetEmployee) return;
    if (!targetSummary.targetIsUnlimited && targetSummary.targetRemainingAmount <= 0) return;
    setAdvanceRequestTargetEmployeeId(targetId);
    setAdvanceRequestAmount('');
    setAdvanceRequestReason('');
    setAdvanceRequestSalaryMonth(currentMonth);
    setAdvanceRequestStatus('');
    setShowAdvanceRequestModal(true);
  };

  const handleAdvanceRequestSubmit = async (event) => {
    event.preventDefault();
    if (!payrollViewReady) { setAdvanceRequestStatus('Đang đối chiếu lại lương. Vui lòng chờ tính xong rồi gửi.');return; }
    const targetId = advanceRequestTargetEmployeeId || currentEmployeeId;
    const isOwnRequest = targetId === currentEmployeeId;
    if (!onAddAdvanceRequest || !targetId) return;
    if (!isOwnRequest && !canCreateSalaryAdvanceForOthersInPeriod) {
      setAdvanceRequestStatus('Tài khoản hiện tại chưa có quyền tạo lệnh ứng hộ.');
      return;
    }
    if (isOwnRequest && !canCreateOwnSalaryAdvanceRequest) {
      setAdvanceRequestStatus('Tài khoản hiện tại chưa có quyền tạo lệnh ứng lương.');
      return;
    }
    const targetSummary = advanceRequestTargetSummary;
    if (!targetSummary?.targetEmployee) {
      setAdvanceRequestStatus('Chưa chọn nhân sự nhận ứng.');
      return;
    }
    const requestedAmount = parseInputCurrency(advanceRequestAmount);
    const salaryMonth = normalizeSalaryAdvanceMonth(advanceRequestSalaryMonth);
    if (!requestedAmount || requestedAmount <= 0) {
      setAdvanceRequestStatus('Vui lòng nhập số tiền ứng hợp lệ.');
      return;
    }
    if (!salaryMonth) {
      setAdvanceRequestStatus('Vui lòng chọn tháng trừ vào lương.');
      return;
    }
    if (salaryMonth !== currentMonth || isPayrollLocked) {
      setAdvanceRequestStatus('Kỳ lương đã thay đổi hoặc đã khóa. Vui lòng chọn lại tháng trừ lương.');
      return;
    }
    if (!targetSummary.targetIsUnlimited && requestedAmount > targetSummary.targetRemainingAmount) {
      setAdvanceRequestStatus(`Số tiền ứng không được vượt ${formatCurrency(targetSummary.targetRemainingAmount)} đ.`);
      return;
    }

    setIsSubmittingAdvanceRequest(true);
    setAdvanceRequestStatus('');
    try {
      const result = await onAddAdvanceRequest(targetId, requestedAmount, advanceRequestReason || (isOwnRequest ? 'Ứng lương' : 'Ứng hộ'), {
        salaryMonth,
        salaryAdvancePercent: targetSummary.targetIsUnlimited ? null : targetSummary.targetPercent,
        salaryAdvanceLimitMode: targetSummary.targetIsUnlimited ? 'unlimited' : 'percent',
        salaryAdvanceBaseAmount: targetSummary.targetBaseAmount,
        salaryAdvanceLimitAmount: targetSummary.targetLimitAmount,
        salaryAdvanceRemainingBeforeRequest: targetSummary.targetIsUnlimited ? null : targetSummary.targetRemainingAmount,
        createdOnBehalf: !isOwnRequest,
        createdByEmployeeId: currentEmployeeId || null
      });
      if (result?.success === false) throw new Error(result.message || 'Không tạo được lệnh ứng lương.');
      setShowAdvanceRequestModal(false);
      setAdvanceRequestAmount('');
      setAdvanceRequestReason('');
      setAdvanceRequestStatus('Đã gửi lệnh ứng lương chờ duyệt.');
    } catch (error) {
      setAdvanceRequestStatus(getFriendlyFirebaseErrorMessage(error, 'Không tạo được lệnh ứng lương.'));
    } finally {
      setIsSubmittingAdvanceRequest(false);
    }
  };

  const handleSaveAdvancePercent = async (departmentKey) => {
    if (!canConfigureSalaryAdvanceLimit || !onUpdateCompanySettings) return;
    const department = SALARY_ADVANCE_DEPARTMENT_OPTIONS.find(item => item.key === departmentKey);
    if (!department) return;
    const rawPercentInput = `${advancePercentInputs?.[departmentKey] ?? ''}`.trim();
    const nextPercent = rawPercentInput === '' ? null : normalizeSalaryAdvancePercent(rawPercentInput);
    const nextPercentByDepartment = {
      ...salaryAdvancePercentByDepartment,
      [departmentKey]: nextPercent
    };
    setAdvancePercentStatus(`Đang lưu ${department.label}...`);
    const result = await onUpdateCompanySettings({ salaryAdvancePercentByDepartment: nextPercentByDepartment });
    if (result?.success === false) {
      setAdvancePercentStatus(result.message || 'Không lưu được mức ứng lương.');
      return;
    }
    setAdvancePercentStatus(`Đã lưu ${department.label}: ${formatPercentValue(nextPercent)}%.`);
  };

  const getAttendanceStatusLabel = (entry) => {
    if (entry.status === 'late') return { label: 'Đi trễ', classes: 'bg-amber-50 text-amber-700 border-amber-200' };
    if (entry.status === 'leave') return { label: 'Nghỉ phép', classes: 'bg-gray-100 text-gray-600 border-gray-200' };
    if (entry.status === 'present') return { label: 'Có mặt', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    return { label: 'Chưa chấm công', classes: 'bg-red-50 text-red-700 border-red-200' };
  };

  const renderFinancialList = (records, emptyLabel, toneClasses, emp) => {
    if (!records.length) {
      return <p className="text-xs text-gray-400">{emptyLabel}</p>;
    }

    return (
      <div className="space-y-2">
        {records.map(record => {
          const isEmployeePurchaseRecord = record.type === 'employee_purchase';
          const canEditRecord = Boolean(emp) && (
            (['bonus', 'penalty'].includes(record.type) && canEditSalaryAdjustments)
            || (isEmployeePurchaseRecord && canEditEmployeePurchaseRecords)
          );
          const canDeleteRecord = Boolean(emp) && (
            (['bonus', 'penalty'].includes(record.type) && canDeleteSalaryAdjustments)
            || (record.type === 'advance' && canDeleteAdvanceRequest)
            || (isEmployeePurchaseRecord && canDeleteEmployeePurchaseRecords)
          );
          const recordAriaLabel = isEmployeePurchaseRecord ? 'khoản mua hàng cấn lương' : 'khoản thưởng/phạt';
          return (
          <div
            key={record.id}
            role={canEditRecord ? 'button' : undefined}
            tabIndex={canEditRecord ? 0 : undefined}
            onClick={() => canEditRecord && openEditFinancialModal(emp, record)}
            onKeyDown={(event) => {
              if (canEditRecord && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                openEditFinancialModal(emp, record);
              }
            }}
            className={`rounded-xl border p-3 ${toneClasses} ${canEditRecord ? 'cursor-pointer transition hover:shadow-sm' : ''}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-bold">{record.reason || 'Không có ghi chú'}</p>
                <p className="text-[11px] mt-1 opacity-75">{record.date ? new Date(record.date).toLocaleDateString('vi-VN') : currentMonthLabel}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-black">{formatCurrency(record.amount)} đ</p>
                {(canEditRecord || canDeleteRecord) && (
                  <div className="mt-2 flex items-center justify-end gap-1">
                    {canEditRecord && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditFinancialModal(emp, record);
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/70 bg-white/70 text-slate-700 shadow-sm"
                        aria-label={`Sửa ${recordAriaLabel}`}
                        title="Sửa"
                      >
                        <Edit3 size={13} />
                      </button>
                    )}
                    {canDeleteRecord && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteFinancialRecord(record);
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/70 bg-white/70 text-red-600 shadow-sm"
                        aria-label={`Xóa ${recordAriaLabel}`}
                        title="Xóa"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          );
        })}
      </div>
    );
  };

  const payrollPendingNotice = (
    <div className="payroll-workspace space-y-4 pb-16" aria-busy={payrollViewProjection.pending || Boolean(payrollViewProjection.error)}>
      <label className="block text-sm font-bold text-slate-700">Kỳ lương
        <input type="month" value={currentMonth} onChange={event=>setSalaryMonth(event.target.value)} className="ml-3 rounded-xl border border-slate-200 p-2" />
      </label>
      {payrollViewProjection.error
        ? <div role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Chưa tính xong bảng lương. Dữ liệu chưa được chốt.
            <button type="button" onClick={()=>setPayrollCalculationAttempt(n=>n+1)} className="ml-3 font-bold underline">Thử lại</button>
          </div>
        : <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Đang tính lương, đánh giá và đối chiếu công nợ…</p>}
    </div>
  );

  return (
    <div className="payroll-workspace space-y-4 animate-in fade-in pb-16" aria-busy={!payrollViewReady}>
      {!payrollViewReady ? payrollPendingNotice : <>
      {payrollScreen === 'overview' && showPayrollConfigNotice && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-4 text-amber-900 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-600">Lưu ý bảng lương</p>
              <h2 className="mt-1 text-base font-black text-slate-900">Một số nhân sự chưa cài lương cố định</h2>
              <p className="mt-1 text-sm leading-relaxed text-amber-800">
                Bảng lương vẫn mở bình thường. Cộng tác viên hưởng theo doanh thu không bắt buộc có lương cơ bản, chỉ cần cài % hoa hồng trong hồ sơ nhân sự.
              </p>
            </div>
            <button
              type="button"
              onClick={handleHidePayrollConfigNotice}
              className="shrink-0 rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-black text-amber-700 shadow-sm"
            >
              Ẩn
            </button>
          </div>
          <p className="mt-3 text-xs font-semibold text-amber-700">
            Cần kiểm tra: {missingPayrollConfigEmployees.slice(0, 4).map(emp => emp.name || emp.phone || 'Nhân sự').join(', ')}
            {missingPayrollConfigEmployees.length > 4 ? ` và ${missingPayrollConfigEmployees.length - 4} nhân sự khác` : ''}.
          </p>
        </div>
      )}
      {payrollScreen === 'overview' && canReviewSalaryAdvances && reviewAdvanceRequests.length > 0 && (
        <div className="bg-white border border-blue-100 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600">Ứng lương</p>
              <h2 className="font-black text-slate-900">Lệnh chờ duyệt</h2>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{reviewAdvanceRequests.length}</span>
          </div>
          {advanceRequestStatus && (
            <p className="mb-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
              {advanceRequestStatus}
            </p>
          )}
          <div className="space-y-2">
            {reviewAdvanceRequests.map(req => {
              const e = employees.find(emp => emp.id === req.empId);
              const requestIsUnlimited = req.salaryAdvanceLimitMode === 'unlimited' || req.salaryAdvancePercent === null;
              const isReviewingThisAdvance = reviewingAdvanceId === req.id;
              const isReviewingAnotherAdvance = Boolean(reviewingAdvanceId && reviewingAdvanceId !== req.id);
              return (
                <div key={req.id} className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">{e?.name || 'Nhân sự'}</p>
                      <p className="mt-1 text-xs text-slate-500">{req.reason || 'Ứng lương'} • {req.date ? new Date(req.date).toLocaleDateString('vi-VN') : currentMonthLabel}</p>
                      <p className="mt-1 text-[11px] font-bold text-orange-700">Trừ lương: {formatMonthYearLabel(getSalaryAdvanceMonth(req) || currentMonth)}</p>
                      <p className="mt-1 text-[11px] text-blue-700">
                        {requestIsUnlimited
                          ? 'Không giới hạn ứng • Chờ chủ doanh nghiệp duyệt'
                          : `Hạn mức lúc gửi: ${formatPercentValue(req.salaryAdvancePercent ?? salaryAdvancePercent)}% • Còn được ứng trước lệnh: ${formatCurrency(req.salaryAdvanceRemainingBeforeRequest || 0)} đ`}
                      </p>
                    </div>
                    <p className="shrink-0 text-right text-sm font-black text-blue-700">{formatCurrency(req.amount)} đ</p>
                  </div>
                  {(canApproveAdvanceRequest || canRejectAdvanceRequest || canDeleteAdvanceRequest) && (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {canRejectAdvanceRequest && (
                        <button
                          type="button"
                          disabled={isReviewingThisAdvance || isReviewingAnotherAdvance}
                          onClick={() => handleReviewAdvanceRequest(req.id, 'reject')}
                          className="rounded-xl border border-red-100 bg-white py-2 text-xs font-bold text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isReviewingThisAdvance ? 'Đang xử lý...' : 'Hủy bỏ'}
                        </button>
                      )}
                      {canDeleteAdvanceRequest && (
                        <button
                          type="button"
                          disabled={isReviewingThisAdvance || isReviewingAnotherAdvance}
                          onClick={() => handleDeleteAdvanceRequest(req.id)}
                          className="rounded-xl border border-slate-200 bg-white py-2 text-xs font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Xóa
                        </button>
                      )}
                      {canApproveAdvanceRequest && (
                        <button
                          type="button"
                          disabled={isReviewingThisAdvance || isReviewingAnotherAdvance}
                          onClick={() => handleReviewAdvanceRequest(req.id, 'approve')}
                          className="rounded-xl bg-blue-600 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isReviewingThisAdvance ? 'Đang duyệt...' : 'Duyệt ứng'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <PayrollWorkspace
        screen={payrollScreen}
        searchText={payrollSearchKeyword}
        filterOpen={payrollFilterOpen}
        onScreenChange={setPayrollScreen}
        rows={salaryRows}
        monthKey={currentMonth}
        onMonthChange={setSalaryMonth}
        isLocked={isPayrollLocked}
        lockedPeriod={lockedPayrollPeriod}
        periods={canViewCompanyPayroll ? payrollPeriods : []}
        carryovers={canViewCompanyPayroll ? payrollDebtCarryovers : payrollDebtCarryovers.filter(item => item.employeeId === currentEmployee?.id)}
        employees={canViewCompanyPayroll ? employees : visibleSalaryEmployees}
        companyId={payrollCompanyId}
        canManage={canManagePayrollByRole && canViewCompanyPayroll}
        canViewCompany={canViewCompanyPayroll}
        canClose={canLockSelectedPayrollPeriod}
        closeDateLabel={payrollMonthEndLabel}
        onCloseRequest={() => setShowPayrollLockConfirm(true)}
        onEmployeeOpen={(employeeId) => {
          setSelectedPayrollEmployeeId(employeeId);
          setExpandedEmp(employeeId);
          setPayrollScreen('detail');
        }}
        selectedEmployeeId={selectedPayrollEmployeeId}
        onOpenAdvance={openAdvanceRequestModal}
      />

      {payrollScreen === 'overview' && payrollCloseReport?.monthKey === currentMonth && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950" aria-label="Báo cáo chốt lương">
          <h2 className="font-bold">Chốt lương thành công</h2>
          <p className="mt-1 text-xs">{currentMonthLabel} đã khóa và lưu lịch sử.</p>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
            <span>Nhân viên</span><strong className="text-right">{payrollCloseReport.employeeCount}</strong>
            <span>Ngày công</span><strong className="text-right">{payrollCloseReport.workDays.toLocaleString('vi-VN')}</strong>
            <span>Tổng chi phí</span><strong className="text-right">{formatCurrency(payrollCloseReport.payable)} đ</strong>
            <span>Lương âm</span><strong className="text-right">{payrollCloseReport.carryCount} nhân viên</strong>
            <span>Chuyển kỳ sau</span><strong className="text-right">{formatCurrency(payrollCloseReport.carryForward)} đ</strong>
          </div>
          <div className="mt-3 flex flex-wrap gap-4">
            <button type="button" className="min-h-10 text-sm font-semibold text-blue-700" onClick={() => setPayrollScreen('list')}>Xem bảng lương</button>
            {payrollCloseReport.carryForward > 0 && <button type="button" className="min-h-10 text-sm font-semibold text-blue-700" onClick={() => setPayrollScreen('carryover')}>Xem chi tiết chuyển kỳ</button>}
          </div>
        </section>
      )}

      {payrollScreen === 'overview' && payrollLockStatus && (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${payrollLockStatus.startsWith('Đã khóa') ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          {payrollLockStatus}
        </div>
      )}

      {payrollScreen === 'overview' && isPayrollLocked && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-emerald-900 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><Lock size={17} /></span>
            <div className="min-w-0">
              <p className="text-sm font-black">{currentMonthLabel} đã khóa và chuyển sang chỉ đọc</p>
              <p className="mt-1 text-xs leading-relaxed text-emerald-700">
                Khóa bởi {lockedPayrollPeriod?.lockedByName || 'người quản lý'}
                {lockedPayrollPeriod?.lockedAt ? ` lúc ${formatDateTimeLabel(lockedPayrollPeriod.lockedAt)}` : ''}. Các thay đổi phát sinh sau thời điểm này không làm đổi bảng lương đã chốt.
              </p>
            </div>
          </div>
        </div>
      )}

      {payrollScreen === 'overview' && shouldReviewPreviousPayrollPeriod && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-amber-950 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-black">Tháng {previousPayrollMonth.substring(5, 7)}/{previousPayrollMonth.substring(0, 4)} chưa được chốt</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-800">
                App chưa thể chuyển số âm sang mục Ứng + nợ đầu kỳ vì chưa có snapshot lịch sử đã khóa. Hãy kiểm tra lương, ứng và công nợ khách hàng của kỳ trước; chỉ khi khóa kỳ thành công thì nợ mới tự xuất hiện ở kỳ này và không bị trừ hai lần.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSalaryMonth(previousPayrollMonth)}
              className="min-h-11 shrink-0 rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-amber-600"
            >
              Kiểm tra tháng {previousPayrollMonth.substring(5, 7)}
            </button>
          </div>
        </div>
      )}

      {payrollAutomationConfig.autoLockEnabled && payrollScreen === 'overview' && canManagePayrollByRole && canViewCompanyPayroll && !isPayrollLocked && (
        <div className="rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-3 text-sky-900 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white"><Clock size={17} /></span>
            <div className="min-w-0">
              <p className="text-sm font-black">Khóa lương tự động cuối tháng</p>
              <p className="mt-1 text-xs leading-relaxed text-sky-700">
                Kỳ {currentMonthLabel.toLowerCase()} đến hạn khóa lúc 23:59:59 ngày {payrollMonthEndLabel || 'cuối tháng'}. Máy chủ chỉ khóa sau khi kế hoạch và dữ liệu được kiểm tra hợp lệ.
              </p>
              <p className={`mt-1 text-[11px] font-bold ${payrollAutoLockPlanStatus && !activePayrollAutoLockPlan ? 'text-amber-700' : 'text-sky-700'}`}>
                {[PAYROLL_AUTO_LOCK_PLAN_STATUS.OPEN, 'READY'].includes(`${activePayrollAutoLockPlan?.status || ''}`.toUpperCase())
                  ? 'Kỳ lương đang mở; dữ liệu xem trước sẽ được kiểm tra lại khi đến thời điểm chốt.'
                  : (payrollAutoLockPlanStatus || 'Đang chuẩn bị ảnh chụp khóa tự động...')}
              </p>
              {payrollLockBlockers.length > 0 && <ul className="mt-2 space-y-1 break-words text-xs text-amber-800" aria-label="Lý do chưa thể khóa lương">{payrollLockBlockers.map(reason => <li key={reason}>{reason}</li>)}</ul>}
            </div>
          </div>
        </div>
      )}

      {isPayrollLocked && lockedSnapshotLoadState === 'loading' && salaryRows.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-sm font-semibold text-slate-500 shadow-sm">
          Đang tải ảnh chụp kỳ lương...
        </div>
      )}

      {isPayrollLocked && lockedSnapshotLoadState === 'error' && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
          <p className="font-bold">{lockedSnapshotLoadError || 'Không tải được ảnh chụp kỳ lương.'}</p>
          <button
            type="button"
            onClick={() => setLockedSnapshotReloadToken(token => token + 1)}
            className="mt-3 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-700"
          >
            Tải lại dữ liệu đã khóa
          </button>
        </div>
      )}

      {payrollScreen === 'detail' && (
      <details className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold text-blue-700">Bảng tính chi tiết và tác vụ</summary>
      <div className="mt-3 space-y-3">
        {salaryRows.filter(row => row.emp?.id === selectedPayrollEmployeeId).map((row) => {
          const {
            emp,
            details,
            snapshotId = '',
            policySnapshot = null,
            latestAdjustment = null,
            snapshotNeedsReview = false,
            snapshotMissingFields = []
          } = row;
          const isExpanded = expandedEmp === emp.id;
          const isSales = isEmployeeSalesPosition(emp);
          const isSalesCollaborator = isSalesCollaboratorPosition(emp.position);
          const endingPayrollDebt = Math.max(0, Number(details?.endingDebt || 0));
          const hasEndingPayrollDebt = endingPayrollDebt > 0;
          const isAdvanceExpanded = expandedAdvanceEmp === emp.id;
          const isAttendanceExpanded = expandedAttendanceEmp === emp.id;
          const canSeeEmployeeAdvanceQueue = canReviewSalaryAdvances || emp.id === currentEmployeeId;
          const employeePendingAdvances = canSeeEmployeeAdvanceQueue
            ? (advanceRequests || []).filter(req => req.empId === emp.id && req.status === 'pending' && isSalaryAdvanceInMonth(req, currentMonth))
            : [];
          const employeePendingAdvanceAmount = employeePendingAdvances.reduce((sum, req) => sum + parseLooseMoneyValue(req.amount), 0);
          const employeeAdvanceBaseAmount = Math.max(0, roundMoneyValue(details?.grossSalary || details?.netSalary || 0));
          const employeeAdvanceLimitConfig = getEmployeeSalaryAdvanceLimitConfig(currentCompany, emp, null);
          const employeeAdvanceIsUnlimited = Boolean(employeeAdvanceLimitConfig.isUnlimited);
          const employeeSalaryAdvancePercent = employeeAdvanceLimitConfig.percent ?? getEmployeeSalaryAdvancePercent(currentCompany, emp, null);
          const employeeAdvanceLimitAmount = employeeAdvanceIsUnlimited ? null : roundMoneyValue(employeeAdvanceBaseAmount * (employeeSalaryAdvancePercent / 100));
          const employeeAdvanceUsedAmount = roundMoneyValue((details?.totalAdvance || 0) + employeePendingAdvanceAmount);
          const employeeAdvanceRemainingAmount = employeeAdvanceIsUnlimited ? null : Math.max(0, roundMoneyValue(employeeAdvanceLimitAmount - employeeAdvanceUsedAmount));
          const canCreateThisAdvanceRequest = (
            (canCreateOwnSalaryAdvanceRequest && emp.id === currentEmployeeId)
            || (canCreateSalaryAdvanceForOthersInPeriod && emp.id !== currentEmployeeId)
          );
          const compactPayrollMetrics = [
            {
              id: 'work',
              label: isSalesCollaborator ? 'Doanh thu' : 'Tổng ngày công',
              value: isSalesCollaborator ? `${formatCurrency(details.salesRevenue)} đ` : details.workDays,
              tone: 'slate',
            },
            {
              id: 'advance',
              label: 'Ứng + nợ đầu kỳ',
              value: `${formatCurrency((details.totalAdvance || 0) + (details.openingDebt || 0))} đ`,
              tone: 'orange',
            },
            {
              id: 'purchase',
              label: 'Mua hàng',
              value: `${formatCurrency(details.totalEmployeePurchase || 0)} đ`,
              tone: 'violet',
            },
            {
              id: 'penalty',
              label: 'Tổng phạt',
              value: `${formatCurrency(details.totalPenalty)} đ`,
              tone: 'red',
            },
            {
              id: 'overtime',
              label: isSalesCollaborator ? '% hoa hồng' : 'Tăng ca',
              value: isSalesCollaborator
                ? formatCommissionPercentLabel(emp.commissionRate)
                : `${(details.approvedOvertimeHours || 0) + (details.automaticOvertimeHours || details.earlyOvertimeHours || 0)} giờ`,
              tone: 'blue',
            },
          ];

          return (
            <div key={emp.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all">
              <div className="cursor-pointer p-3 sm:p-4" onClick={() => setExpandedEmp(isExpanded ? null : emp.id)}>
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <h3 className="font-bold text-gray-800 text-sm">{emp.name}</h3>
                    <p className="text-[11px] text-gray-500 mt-1">{getEmployeePositionSummary(emp)}</p>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <div>
                      <p className="text-[10px] uppercase text-gray-400">{hasEndingPayrollDebt ? 'Còn nợ chuyển kỳ' : 'Lương còn lại'}</p>
                      <p className={`font-black ${hasEndingPayrollDebt || details.netSalary < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{formatCurrency(hasEndingPayrollDebt ? endingPayrollDebt : details.netSalary)} đ</p>
                    </div>
                    {isPayrollLocked && canManagePayrollByRole && snapshotId && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openPayrollAdjustmentDialog(row);
                        }}
                        className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] font-black text-amber-800"
                      >
                        Điều chỉnh
                      </button>
                    )}
                    {isExpanded ? <ChevronUp size={16} className="text-gray-400"/> : <ChevronDown size={16} className="text-gray-400"/>}
                  </div>
                </div>

                <div data-payroll-compact-metrics="true" className="mt-3 grid grid-cols-3 gap-1.5 sm:gap-2">
                  {compactPayrollMetrics.map(metric => (
                    <PayrollCompactMetric key={metric.id} {...metric} />
                  ))}
                  {canCreateThisAdvanceRequest ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openAdvanceRequestModal(emp.id);
                      }}
                      disabled={!employeeAdvanceIsUnlimited && employeeAdvanceRemainingAmount <= 0}
                      data-payroll-compact-action="true"
                      className="flex h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-orange-200 bg-orange-50 px-1.5 py-2 text-center text-[9px] font-black uppercase leading-tight text-orange-700 transition-colors hover:bg-orange-100 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <Plus size={15} aria-hidden="true" />
                      <span>Tạo lệnh ứng</span>
                    </button>
                  ) : (
                    <PayrollCompactMetric label="Tổng thưởng" value={`${formatCurrency(details.totalBonus || 0)} đ`} tone="emerald" />
                  )}
                </div>
                     {!isSalesCollaborator && (
                       <div className="mt-2 grid grid-cols-3 gap-1.5 sm:gap-2">
                         <div className="flex h-14 min-w-0 flex-col items-center justify-center rounded-lg border border-blue-100 bg-blue-50 px-1.5 py-1.5 text-center">
                           <p className="truncate text-[8px] font-bold uppercase text-blue-600">Cơ bản</p>
                           <p className="mt-0.5 max-w-full truncate text-[10px] font-black text-blue-800" title={`${formatCurrency(details.baseSalaryCalc)} đ`}>{formatCurrency(details.baseSalaryCalc)} đ</p>
                         </div>
                         <div className="flex h-14 min-w-0 flex-col items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 px-1.5 py-1.5 text-center">
                           <p className="truncate text-[8px] font-bold uppercase text-emerald-600">Hỗ trợ</p>
                           <p className="mt-0.5 max-w-full truncate text-[10px] font-black text-emerald-800" title={`${formatCurrency(details.supportSalary)} đ`}>{formatCurrency(details.supportSalary)} đ</p>
                         </div>
                         <div className="flex h-14 min-w-0 flex-col items-center justify-center rounded-lg border border-indigo-100 bg-indigo-50 px-1.5 py-1.5 text-center">
                           <p className="truncate text-[8px] font-bold uppercase text-indigo-600">Trách nhiệm</p>
                           <p className="mt-0.5 max-w-full truncate text-[10px] font-black text-indigo-800" title={`${formatCurrency(details.responsibilitySalary)} đ`}>{formatCurrency(details.responsibilitySalary)} đ</p>
                         </div>
                       </div>
                     )}
                   </div>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-4 bg-gray-50/60 space-y-4">
                  <div className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <h4 className="font-bold text-gray-800">Chi tiết các phần lương</h4>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${details.netSalary < 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>Thực lĩnh {formatCurrency(details.netSalary)} đ</span>
                    </div>
                    {isPayrollLocked && (
                      <div className="mb-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                        <p>
                          Chính sách: <strong>{policySnapshot?.version || row?.snapshot?.policyVersion || 'NEEDS_REVIEW'}</strong>
                          {(policySnapshot?.effectiveFrom || row?.snapshot?.policyEffectiveFrom)
                            ? ` • hiệu lực từ ${policySnapshot?.effectiveFrom || row?.snapshot?.policyEffectiveFrom}`
                            : ''}
                        </p>
                        {snapshotNeedsReview && (
                          <p className="mt-1 font-bold text-red-700">
                            Snapshot lịch sử thiếu dữ liệu: {(snapshotMissingFields || []).join(', ') || 'cần rà soát'}.
                          </p>
                        )}
                        {latestAdjustment && (
                          <p className="mt-1 text-amber-700">
                            Đã điều chỉnh lần {latestAdjustment.sequence || 1}: {latestAdjustment.reason}
                          </p>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                      {!isSalesCollaborator && <div className="flex justify-between"><span>Lương cơ bản</span><strong>{formatCurrency(details.baseSalaryCalc)} đ</strong></div>}
                      {!isSalesCollaborator && <div className="flex justify-between"><span>Lương hỗ trợ</span><strong>{formatCurrency(details.supportSalary)} đ</strong></div>}
                      {!isSalesCollaborator && <div className="flex justify-between"><span>Lương trách nhiệm</span><strong>{formatCurrency(details.responsibilitySalary)} đ</strong></div>}
                      {!isSalesCollaborator && <div className="flex justify-between"><span>Lương kinh nghiệm</span><strong>{formatCurrency(details.experienceSalary)} đ</strong></div>}
                      {!isSalesCollaborator && details.roleSalary > 0 && <div className="flex justify-between text-sky-600"><span>Lương kiêm nhiệm</span><strong>{formatCurrency(details.roleSalary)} đ</strong></div>}
                      <div className="flex justify-between"><span>Lương hoa hồng</span><strong>{formatCurrency(details.commission)} đ</strong></div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEvaluationDetailEmployeeId(emp.id);
                        }}
                        className="col-span-2 flex min-h-11 items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2 text-left transition-colors hover:bg-amber-100/70 focus:outline-none focus:ring-2 focus:ring-amber-300"
                      >
                        <span className="min-w-0">
                          <span className="block font-bold text-amber-800">Lương đánh giá</span>
                          <span className="mt-0.5 block text-[10px] font-medium text-amber-700/80">
                            {details.evaluationResult?.hasEvaluation
                              ? `${details.evaluationResult.stars} sao • Điểm bình quân ${Number(details.evaluationResult.averageScore || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}/5`
                              : 'Chưa có dữ liệu đánh giá'}
                          </span>
                        </span>
                        <strong className="shrink-0 text-amber-800">{formatCurrency(details.evaluationBonus || 0)} đ</strong>
                      </button>
                      {!isSalesCollaborator && <div className="flex justify-between"><span>Tăng ca</span><strong>{formatCurrency(details.overtimePay)} đ</strong></div>}
                      {!isSalesCollaborator && details.earlyOvertimeHours > 0 && <div className="flex justify-between text-blue-600"><span>Đi sớm tính tăng ca</span><strong>+{details.earlyOvertimeHours} giờ</strong></div>}
                      {!isSalesCollaborator && details.afterShiftOvertimeHours > 0 && <div className="flex justify-between text-blue-600"><span>Ra sau ca tính tăng ca</span><strong>+{details.afterShiftOvertimeHours} giờ</strong></div>}
                      {!isSalesCollaborator && details.approvedOvertimeHours > 0 && <div className="flex justify-between text-blue-600"><span>Tăng ca duyệt thêm</span><strong>+{details.approvedOvertimeHours} giờ</strong></div>}
                      <div className="flex items-center justify-between gap-2">
                        <span>Thưởng khác</span>
                        <div className="flex items-center gap-2">
                          <strong>{formatCurrency(Math.max(0, details.totalBonus - details.holidayBonus))} đ</strong>
                          {canAddSalaryAdjustments && (
                            <button type="button" onClick={() => openFinancialModal(emp, 'bonus')} className="h-7 w-7 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center hover:bg-emerald-100" aria-label="Thêm thưởng">
                              <Plus size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-between"><span>Thưởng ngày lễ</span><strong>{formatCurrency(details.holidayBonus)} đ</strong></div>
                      {details.holidayRecords?.length > 0 && (
                        <div className="col-span-2 rounded-xl border border-purple-100 bg-purple-50 p-2 text-[11px] text-purple-800">
                          {details.holidayRecords.map(record => (
                            <div key={`${record.id}-${record.date}`} className="flex items-center justify-between gap-3">
                              <span className="truncate">{record.name} • {new Date(record.date).toLocaleDateString('vi-VN')}</span>
                              <strong>+{formatCurrency(record.amount || 0)} đ</strong>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex justify-between text-orange-600"><span>Tiền ứng</span><strong>-{formatCurrency(details.totalAdvance)} đ</strong></div>
                      <div className="flex items-center justify-between gap-2 text-violet-600">
                        <span>Mua hàng công ty</span>
                        <div className="flex items-center gap-2">
                          <strong>-{formatCurrency(details.totalEmployeePurchase || 0)} đ</strong>
                          {canManageEmployeePurchases && (
                            <button type="button" onClick={() => openFinancialModal(emp, 'employee_purchase')} className="h-7 w-7 rounded-full bg-violet-50 text-violet-600 border border-violet-100 flex items-center justify-center hover:bg-violet-100" aria-label="Ghi mua hàng cấn lương">
                              <Plus size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-red-600">
                        <span>Phạt / đi muộn</span>
                        <div className="flex items-center gap-2">
                          <strong>-{formatCurrency(details.totalPenalty)} đ</strong>
                          {canAddSalaryAdjustments && (
                            <button type="button" onClick={() => openFinancialModal(emp, 'penalty')} className="h-7 w-7 rounded-full bg-red-50 text-red-600 border border-red-100 flex items-center justify-center hover:bg-red-100" aria-label="Thêm phạt">
                              <Plus size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                      {details.latePenaltyTotal > 0 && <div className="flex justify-between text-red-600"><span>Phạt đi muộn tự động</span><strong>-{formatCurrency(details.latePenaltyTotal)} đ</strong></div>}
                      <div className="flex justify-between text-red-600"><span>Công nợ khách hàng</span><strong>-{formatCurrency(details.badDebt)} đ</strong></div>
                      {(details.openingDebt || 0) > 0 && (
                        <>
                          <div className="flex justify-between text-rose-600"><span>Dư nợ đầu kỳ</span><strong>{formatCurrency(details.openingDebt)} đ</strong></div>
                          {(details.openingDebtApplied || 0) > 0 && (
                            <div className="flex justify-between text-rose-600"><span>Đã khấu trừ nợ đầu kỳ</span><strong>-{formatCurrency(details.openingDebtApplied)} đ</strong></div>
                          )}
                        </>
                      )}
                      <div className="flex justify-between"><span>Tổng cộng trước trừ</span><strong>{formatCurrency(details.grossSalary)} đ</strong></div>
                      {!isSalesCollaborator && (details.roleSalaryRows || []).some(row => row.calculatedAmount > 0) && (
                        <div className="col-span-2 rounded-xl bg-sky-50 border border-sky-100 p-2 text-[11px] text-sky-700">
                          {(details.roleSalaryRows || [])
                            .filter(row => row.calculatedAmount > 0)
                            .map(row => (
                              <div key={row.position} className="flex justify-between">
                                <span>{row.position}</span>
                                <strong>{formatCurrency(row.calculatedAmount)} đ</strong>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                        <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">Tổng khấu trừ</p>
                        <p className="text-sm font-black text-red-600">{formatCurrency(details.deductionTotal)} đ</p>
                      </div>
                      <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                        <p className="text-[10px] uppercase font-bold text-emerald-600 mb-1">Lương còn lại</p>
                        <p className="text-sm font-black text-emerald-700">{formatCurrency(details.netSalary)} đ</p>
                      </div>
                    </div>
                    {hasEndingPayrollDebt && (
                      <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        <span>Còn nợ chuyển kỳ sau</span>
                        <strong className="float-right">{formatCurrency(endingPayrollDebt)} đ</strong>
                      </div>
                    )}
                    {details.workDaysProbation > 0 && (
                      <p className="text-[11px] text-gray-500 mt-3">Có {details.workDaysProbation} ngày thử việc và {details.workDaysOfficial} ngày chính thức trong kỳ này.</p>
                    )}
                    {details.downlineCommissionRows?.length > 0 && (
                      <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/70 p-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-700">Hoa hồng cấp dưới</p>
                        <div className="mt-2 space-y-2">
                          {details.downlineCommissionRows.map(row => (
                            <div key={row.employeeId} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-[11px] text-slate-700">
                              <span className="font-bold">{row.employeeName}</span>
                              <span>{formatCurrency(row.revenue)} đ x {row.commissionPercent}% = <strong>{formatCurrency(row.commission)} đ</strong></span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {!isSalesCollaborator && (
                  <div className="bg-white rounded-2xl border border-gray-100 p-4">
                    <button
                      type="button"
                      onClick={() => setExpandedAttendanceEmp(isAttendanceExpanded ? null : emp.id)}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <div className="min-w-0">
                        <h4 className="font-bold text-gray-800">Danh sách chấm công các ngày đi làm</h4>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {details.attendanceEntries.length} ngày trong {currentMonthLabel.toLowerCase()}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-black text-slate-600">
                          {details.attendanceEntries.length}
                        </span>
                        {isAttendanceExpanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                      </div>
                    </button>
                    {isAttendanceExpanded && (
                      details.attendanceEntries.length === 0 ? (
                        <p className="mt-3 text-sm text-gray-400">Chưa có bản ghi chấm công trong {currentMonthLabel.toLowerCase()}.</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {details.attendanceEntries.map(entry => {
                            const statusMeta = getAttendanceStatusLabel(entry);
                            return (
                              <div key={`${emp.id}_${entry.date}`} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-bold text-gray-800">{new Date(entry.date).toLocaleDateString('vi-VN')}</p>
                                    <p className="text-[11px] text-gray-500 mt-1">Vào: <strong className="text-gray-700">{formatTime(entry.checkIn)}</strong> • Ra: <strong className="text-gray-700">{formatTime(entry.checkOut)}</strong></p>
                                    {(entry.lateMinutes > 0 || entry.earlyOvertimeMinutes > 0 || entry.noSalaryDay) && (
                                      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold">
                                        {entry.lateMinutes > 0 && <span className="rounded-full bg-red-50 px-2 py-1 text-red-600">Muộn {entry.lateMinutes} phút</span>}
                                        {entry.latePenaltyAmount > 0 && <span className="rounded-full bg-red-50 px-2 py-1 text-red-600">Phạt {formatCurrency(entry.latePenaltyAmount)} đ</span>}
                                        {entry.noSalaryDay && <span className="rounded-full bg-orange-50 px-2 py-1 text-orange-700">Không tính lương ngày</span>}
                                        {entry.earlyOvertimeMinutes > 0 && <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-600">Đi sớm +{entry.earlyOvertimeMinutes} phút</span>}
                                      </div>
                                    )}
                                  </div>
                                  <span className={`text-[11px] font-bold px-2 py-1 rounded-full border ${statusMeta.classes}`}>{statusMeta.label}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )
                    )}
                  </div>
                  )}

                  <div className="grid grid-cols-1 gap-3">
                    <div className="bg-white rounded-2xl border border-orange-100 p-4">
                      <button
                        type="button"
                        onClick={() => setExpandedAdvanceEmp(isAdvanceExpanded ? null : emp.id)}
                        className="flex w-full items-center justify-between gap-3 text-left"
                      >
                        <div className="min-w-0">
                          <h4 className="font-bold text-orange-700">Danh sách tiền ứng</h4>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {canViewSalaryAdvance
                              ? (employeeAdvanceIsUnlimited ? 'Không giới hạn, chờ chủ duyệt' : `Còn được ứng ${formatCurrency(employeeAdvanceRemainingAmount)} đ`)
                              : 'Bấm để xem lịch sử ứng tiền'}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-700">
                            {formatCurrency(details.totalAdvance + employeePendingAdvanceAmount)} đ
                          </span>
                          {isAdvanceExpanded ? <ChevronUp size={16} className="text-orange-500" /> : <ChevronDown size={16} className="text-orange-500" />}
                        </div>
                      </button>

                      {isAdvanceExpanded && (
                        <div className="mt-4 space-y-3">
                          {canViewSalaryAdvance && (
                            <>
                              <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-orange-600">Hạn mức ứng lương</p>
                                    <p className="mt-1 text-sm font-black text-slate-900">
                                      {employeeAdvanceIsUnlimited ? 'Không giới hạn ứng' : `Được ứng tối đa ${formatCurrency(employeeAdvanceLimitAmount)} đ`}
                                    </p>
                                    <p className="mt-1 text-[11px] text-slate-500">
                                      {employeeAdvanceIsUnlimited
                                        ? 'Nhân sự có thể gửi yêu cầu ứng linh hoạt, chủ doanh nghiệp sẽ phê duyệt sau.'
                                        : `${formatPercentValue(employeeSalaryAdvancePercent)}% x ${formatCurrency(employeeAdvanceBaseAmount)} đ lương tháng hiện tại.`}
                                    </p>
                                  </div>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                  <div className="rounded-xl bg-white p-3 text-center">
                                    <p className="text-[10px] font-bold uppercase text-slate-500">Đã ứng</p>
                                    <p className="mt-1 text-sm font-black text-slate-900">{formatCurrency(details.totalAdvance || 0)} đ</p>
                                  </div>
                                  <div className="rounded-xl bg-white p-3 text-center">
                                    <p className="text-[10px] font-bold uppercase text-slate-500">Chờ duyệt</p>
                                    <p className="mt-1 text-sm font-black text-slate-900">{formatCurrency(employeePendingAdvanceAmount)} đ</p>
                                  </div>
                                  <div className="rounded-xl bg-white p-3 text-center">
                                    <p className="text-[10px] font-bold uppercase text-slate-500">Còn được ứng</p>
                                    <p className="mt-1 text-sm font-black text-orange-700">{employeeAdvanceIsUnlimited ? 'Không giới hạn' : `${formatCurrency(employeeAdvanceRemainingAmount)} đ`}</p>
                                  </div>
                                  <div className="rounded-xl bg-white p-3 text-center">
                                    <p className="text-[10px] font-bold uppercase text-slate-500">Tỷ lệ</p>
                                    <p className="mt-1 text-sm font-black text-slate-900">{employeeAdvanceIsUnlimited ? 'Tự do' : `${formatPercentValue(employeeSalaryAdvancePercent)}%`}</p>
                                  </div>
                                </div>
                              </div>

                              {canConfigureSalaryAdvanceLimit && (
                                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Cấu hình % ứng theo bộ phận</p>
                                  <div className="mt-2 space-y-2">
                                    {SALARY_ADVANCE_DEPARTMENT_OPTIONS.map(department => (
                                      <div key={department.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl bg-white px-3 py-2">
                                        <span className="truncate text-xs font-bold text-slate-700">{department.label}</span>
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            value={advancePercentInputs?.[department.key] ?? ''}
                                            onChange={(event) => setAdvancePercentInputs(prev => ({
                                              ...prev,
                                              [department.key]: event.target.value
                                            }))}
                                            className="h-10 w-20 rounded-xl border border-slate-200 bg-slate-50 px-2 text-center text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-orange-300"
                                            placeholder="30"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => handleSaveAdvancePercent(department.key)}
                                            className="h-10 rounded-xl bg-slate-900 px-3 text-xs font-bold text-white"
                                          >
                                            Lưu
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  {advancePercentStatus && <p className="mt-2 text-xs font-semibold text-slate-600">{advancePercentStatus}</p>}
                                </div>
                              )}

                              {advanceRequestStatus && <p className="rounded-xl border border-orange-100 bg-orange-50 px-3 py-2 text-xs font-bold text-orange-700">{advanceRequestStatus}</p>}
                            </>
                          )}

                          {employeePendingAdvances.length > 0 && (
                            <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3">
                              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-amber-700">Lệnh đang chờ duyệt</p>
                              <div className="space-y-2">
                                {employeePendingAdvances.map(req => (
                                  <div key={req.id} className="rounded-xl bg-white px-3 py-2 text-xs text-slate-700">
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="truncate font-bold">{req.reason || 'Ứng lương'}</span>
                                      <div className="flex shrink-0 items-center gap-2">
                                        <strong className="text-orange-700">{formatCurrency(req.amount)} đ</strong>
                                        {canDeleteAdvanceRequest && (
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteAdvanceRequest(req.id)}
                                            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-100 bg-red-50 text-red-600"
                                            aria-label="Xóa lệnh ứng"
                                            title="Xóa"
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    <p className="mt-1 text-[11px] text-slate-400">
                                      {req.date ? new Date(req.date).toLocaleDateString('vi-VN') : currentMonthLabel}
                                      {' • Trừ lương: '}{formatMonthYearLabel(getSalaryAdvanceMonth(req) || currentMonth)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div>
                            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-orange-600">Lịch sử ứng tiền</p>
                            {renderFinancialList(details.advanceRecords, 'Chưa có khoản ứng nào trong kỳ này.', 'bg-orange-50 border-orange-100 text-orange-900', emp)}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="bg-white rounded-2xl border border-violet-100 p-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                          <h4 className="font-bold text-violet-700">Mua hàng cấn lương</h4>
                          <p className="mt-1 text-[11px] text-slate-500">Hàng nhân viên mua của công ty, tự trừ vào thực lĩnh tháng này.</p>
                        </div>
                        {canManageEmployeePurchases && (
                          <button type="button" onClick={() => openFinancialModal(emp, 'employee_purchase')} className="h-8 w-8 rounded-full bg-violet-50 text-violet-600 border border-violet-100 flex items-center justify-center hover:bg-violet-100" aria-label="Ghi mua hàng cấn lương">
                            <Plus size={16} />
                          </button>
                        )}
                      </div>
                      {renderFinancialList(details.employeePurchaseRecords || [], 'Chưa có khoản mua hàng nào trong kỳ này.', 'bg-violet-50 border-violet-100 text-violet-900', emp)}
                    </div>
                    <div className="bg-white rounded-2xl border border-red-100 p-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <h4 className="font-bold text-red-700">Danh sách phạt vi phạm</h4>
                        {canAddSalaryAdjustments && (
                          <button type="button" onClick={() => openFinancialModal(emp, 'penalty')} className="h-8 w-8 rounded-full bg-red-50 text-red-600 border border-red-100 flex items-center justify-center hover:bg-red-100" aria-label="Thêm phạt vi phạm">
                            <Plus size={16} />
                          </button>
                        )}
                      </div>
                      {renderFinancialList(details.penaltyRecords, 'Chưa có khoản phạt nào trong kỳ này.', 'bg-red-50 border-red-100 text-red-900', emp)}
                      {details.latePenaltyRecords?.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-red-500">Phạt đi muộn tự động</p>
                          {details.latePenaltyRecords.map(record => (
                            <div key={record.id} className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[11px] text-red-800">
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-bold">{record.reason}</span>
                                <strong>{record.noSalaryDay ? 'Không tính lương' : `-${formatCurrency(record.amount)} đ`}</strong>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="bg-white rounded-2xl border border-emerald-100 p-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <h4 className="font-bold text-emerald-700">Danh sách thưởng</h4>
                        {canAddSalaryAdjustments && (
                          <button type="button" onClick={() => openFinancialModal(emp, 'bonus')} className="h-8 w-8 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center hover:bg-emerald-100" aria-label="Thêm thưởng">
                            <Plus size={16} />
                          </button>
                        )}
                      </div>
                      {renderFinancialList(details.bonusRecords, 'Chưa có thưởng nào trong kỳ này.', 'bg-emerald-50 border-emerald-100 text-emerald-900', emp)}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-800">
                    Bảng lương chỉ dùng để xem lương cá nhân. Nếu cần điều chỉnh, hãy báo kế toán nhân sự xử lý theo quy trình.
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {salaryRows.length === 0 && (!isPayrollLocked || lockedSnapshotLoadState === 'loaded') && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-sm text-gray-400">
            {canViewCompanyPayroll ? 'Chưa có nhân viên nào để tính lương trong kỳ hiện tại.' : 'Chưa có dữ liệu lương của tài khoản này trong kỳ hiện tại.'}
          </div>
        )}
      </div>
      </details>
      )}

      </>}
      <PayrollEvaluationDetailDialog
        detail={selectedEvaluationDetail}
        monthLabel={currentMonthLabel}
        onClose={closeEvaluationDetail}
      />

      {payrollAdjustmentRow && isPayrollLocked && canManagePayrollByRole && (
        <div className="fixed inset-0 z-[72] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSubmitPayrollAdjustment}
            className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-amber-100 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">Phiếu điều chỉnh chính thức</p>
                <h3 className="mt-1 text-lg font-black text-slate-900">{payrollAdjustmentRow.emp?.name || 'Nhân sự'}</h3>
                <p className="mt-1 text-xs text-slate-500">Snapshot gốc vẫn bất biến; thay đổi này được lưu riêng và có audit log.</p>
              </div>
              <button
                type="button"
                disabled={isSavingPayrollAdjustment}
                onClick={() => setPayrollAdjustmentRow(null)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"
                aria-label="Đóng phiếu điều chỉnh"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">Thực nhận sau điều chỉnh</label>
                  <input
                    required
                    type="tel"
                    value={formatInputCurrency(payrollAdjustmentNetSalary)}
                    onChange={event => setPayrollAdjustmentNetSalary(parseInputCurrency(event.target.value))}
                    className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">Dư nợ chuyển kỳ</label>
                  <input
                    required
                    type="tel"
                    value={formatInputCurrency(payrollAdjustmentEndingDebt)}
                    onChange={event => setPayrollAdjustmentEndingDebt(parseInputCurrency(event.target.value))}
                    className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">Lý do điều chỉnh</label>
                <textarea
                  required
                  rows={3}
                  value={payrollAdjustmentReason}
                  onChange={event => setPayrollAdjustmentReason(event.target.value)}
                  className="w-full resize-none rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="Mô tả sai lệch và căn cứ điều chỉnh"
                />
              </div>
              {payrollAdjustmentStatus && (
                <p className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">{payrollAdjustmentStatus}</p>
              )}
            </div>
            <div className="sticky bottom-0 grid grid-cols-2 gap-3 border-t border-slate-100 bg-white px-5 py-4">
              <button
                type="button"
                disabled={isSavingPayrollAdjustment}
                onClick={() => setPayrollAdjustmentRow(null)}
                className="min-h-11 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSavingPayrollAdjustment}
                className="min-h-11 rounded-2xl bg-amber-600 px-4 py-3 text-sm font-black text-white disabled:bg-slate-300"
              >
                {isSavingPayrollAdjustment ? 'Đang lưu...' : 'Lưu điều chỉnh'}
              </button>
            </div>
          </form>
        </div>
      )}

      {isPayrollLocked && lockedSnapshotLoadState === 'loaded' && lockedSnapshotIntegrityReport?.needsReviewSnapshotCount > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">
          <p className="font-bold">Kỳ lương lịch sử cần rà soát snapshot</p>
          <p className="mt-1 text-xs leading-relaxed">
            Có {lockedSnapshotIntegrityReport.needsReviewSnapshotCount} bản ghi thiếu dữ liệu snapshot. App chỉ hiển thị số liệu gốc đã lưu và không dùng cấu hình lương hiện tại để tự điền hoặc tính lại.
          </p>
        </div>
      )}

      {showPayrollLockConfirm && !isPayrollLocked && (
        <PayrollCloseDialog
          monthKey={currentMonth}
          closeDateLabel={payrollMonthEndLabel}
          rows={liveSalaryRows}
          eligible={canLockSelectedPayrollPeriod}
          busy={isLockingPayroll}
          status={payrollLockStatus}
          onCancel={() => setShowPayrollLockConfirm(false)}
          onConfirm={handleConfirmPayrollLock}
        />
      )}

      {showAdvanceRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-600">Ứng lương</p>
                <h3 className="mt-1 text-xl font-black text-slate-900">Tạo lệnh ứng</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {advanceRequestTargetSummary?.targetIsUnlimited
                    ? 'Không giới hạn số tiền ứng, lệnh sẽ chờ chủ doanh nghiệp duyệt.'
                    : `Còn được ứng tối đa ${formatCurrency(advanceRequestTargetSummary?.targetRemainingAmount || 0)} đ.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAdvanceRequestModal(false)}
                className="rounded-full bg-slate-100 p-2 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAdvanceRequestSubmit} className="space-y-3">
              {canCreateSalaryAdvanceForOthersInPeriod && (
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">Nhân sự nhận ứng</label>
                  <select
                    required
                    value={advanceRequestTargetEmployeeId}
                    onChange={(event) => setAdvanceRequestTargetEmployeeId(event.target.value)}
                    className="w-full rounded-2xl border border-orange-100 bg-orange-50/40 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-orange-300"
                  >
                    <option value="">Chọn nhân sự</option>
                    {advanceTargetSelectEmployees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name || emp.phone || 'Nhân sự'}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">Tháng trừ vào lương</label>
                <input
                  type="month"
                  required
                  value={advanceRequestSalaryMonth}
                  onChange={(event) => {
                    const nextMonth = normalizeSalaryAdvanceMonth(event.target.value);
                    setAdvanceRequestSalaryMonth(nextMonth);
                    if (nextMonth && nextMonth !== currentMonth) setSalaryMonth(nextMonth);
                  }}
                  className="w-full rounded-2xl border border-orange-100 bg-orange-50/40 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-orange-300"
                />
                <p className="mt-1 text-[11px] text-slate-500">Khoản ứng chỉ được tính và khấu trừ trong kỳ này.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">Số tiền ứng</label>
                <input
                  type="tel"
                  required
                  value={formatInputCurrency(advanceRequestAmount)}
                  onChange={(event) => setAdvanceRequestAmount(parseInputCurrency(event.target.value))}
                  className="w-full rounded-2xl border border-orange-100 bg-orange-50/40 px-4 py-3 text-lg font-black text-slate-900 outline-none focus:ring-2 focus:ring-orange-300"
                  placeholder="Ví dụ: 2.000.000"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">Lý do</label>
                <input
                  type="text"
                  value={advanceRequestReason}
                  onChange={(event) => setAdvanceRequestReason(capitalizeFirst(event.target.value))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-orange-300"
                  placeholder="Ứng lương"
                />
              </div>
              {advanceRequestStatus && <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-600">{advanceRequestStatus}</p>}
              <button
                type="submit"
                disabled={isSubmittingAdvanceRequest || !payrollViewReady}
                className="w-full rounded-2xl bg-orange-500 py-3 font-black text-white shadow-sm disabled:bg-slate-300"
              >
                {isSubmittingAdvanceRequest ? 'Đang gửi...' : 'Gửi lệnh ứng'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm">
            <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-lg text-gray-800">{getFinancialModalTitle()}</h3><button onClick={() => setShowModal(false)} className="text-gray-400"><X /></button></div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {modalType === 'performance' ? (
                <>
                  <div><label className="block text-xs font-semibold text-gray-700 mb-1">Số giờ tăng ca đã duyệt</label><input type="number" min="0" step="0.5" value={overtimeInput} onChange={(e) => setOvertimeInput(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500" /></div>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] leading-relaxed text-amber-900">
                    Không tự suy ra từ việc quên chấm ra hoặc ra ca muộn. Chỉ nhập số giờ đã xác minh sau khi đối chiếu chấm công thực tế.
                  </div>
                </>
              ) : (
                <>
                  <div><label className="block text-xs font-semibold text-gray-700 mb-1">Số tiền (VNĐ)</label><input type="tel" required value={formatInputCurrency(amountInput)} onChange={(e) => setAmountInput(parseInputCurrency(e.target.value))} className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500" /></div>
                  <div><label className="block text-xs font-semibold text-gray-700 mb-1">Lý do</label><input type="text" required value={reasonInput} onChange={(e) => setReasonInput(capitalizeFirst(e.target.value))} placeholder={modalType === 'employee_purchase' ? 'Ví dụ: Mua hàng công ty' : 'Nhập lý do'} className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500" /></div>
                  <div><label className="block text-xs font-semibold text-gray-700 mb-1">Ngày áp dụng</label><input type="date" value={financialDateInput} onChange={(e) => setFinancialDateInput(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500" /></div>
                  {financialModalError && <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{financialModalError}</p>}
                </>
              )}
              <button type="submit" disabled={!payrollViewReady} className="w-full bg-emerald-500 hover:bg-emerald-600 transition-colors text-white py-3 rounded-lg font-semibold mt-4 disabled:opacity-50">{editingFinancialRecord ? 'Lưu thay đổi' : 'Xác nhận'}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
  return SalaryView;
}
