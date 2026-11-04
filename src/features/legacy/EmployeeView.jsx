import { useState, useEffect, useMemo, useRef } from "react";
import { withSalesRevenueIndex } from "../../utils/salesRevenuePeriod.js";
import { summarizeEmployeeSalesRevenueForMonth } from "../../utils/salesRevenuePeriod.js";
import { normalizeCompanyDepartments, removeCompanyDepartment, upsertCompanyDepartment } from "../../utils/companyDepartments.js";
import { buildEmployeePayrollPolicyUpdate } from "../../utils/payrollPolicyHistory.js";
import { Plus, X, ChevronRight, ChevronLeft, ChevronDown, Edit3, Trash2, CalendarDays, Building, Percent, Save, Eye, EyeOff } from "lucide-react";
import EmployeeBankQr from "../employees/EmployeeBankQr.jsx";
import { createPortal } from "react-dom";
// Transitional bundle boundary. Only stable local module bindings are injected;
// all actor/company/business data continues to arrive through current props.
// Generated binding contract is checked against the real source AST.
export function createEmployeeView(runtime) {
  const {AccessDeniedView,BANK_ID_OPTIONS,DEFAULT_ATTENDANCE_LOCATION_RADIUS_METERS,DEFAULT_LATE_PENALTY_TIERS,DEPARTMENT_ACCOUNT_OPTIONS,EMPLOYEE_DOCUMENT_MAX_BYTES,EMPLOYEE_DOCUMENT_TOTAL_MAX_BYTES,EMPLOYEE_PEER_REVIEW_CRITERIA,HolidayConfigCard,buildCustomerLocationFromPosition,buildDefaultEmployeeReviewCriteriaScores,buildLocalPaymentQrDataUrl,buildVietQrEmvPayload,capitalizeFirst,clampEmployeeReviewStar,createEmployeeFormState,employeeRevenueProjectionCache,formatCommissionPercentInput,formatInputCurrency,formatShiftRangeLabel,getEmployeeAttendanceLocationSettings,getEmployeeAvatarUrl,getEmployeeDocumentTypeLabel,getEmployeeLatePenaltyTiers,getEmployeePositionLabel,getEmployeePositionSummary,getEmployeeReviewCriteriaAverage,getEntityTimestamp,getFriendlyFirebaseErrorMessage,getPositionShiftDefaults,getSalesLeaderId,getTodayString,isEmployeeSalesPosition,isOvernightShiftRange,isOwnerPosition,isSalesCollaboratorPosition,isSalesPosition,isSameLoginPhone,normalizeAttendanceFixedLocation,normalizeEmployeeDocuments,normalizeEmployeePosition,normalizeEmployeePositionList,normalizeEmployeeRoleSalaryComponents,normalizeLatePenaltyTiers,normalizeTimeInputValue,parseCommissionPercentInput,parseCustomerLocationInput,parseInputCurrency,parseLooseMoneyValue,parseMinutesInput,readFileAsDataUrl,readImageFileAsDataUrl,requestPreciseAttendanceLocation,resolveEmployeeShiftPolicy,shareBlobFile,toTitleCase} = runtime;
  function EmployeeView({
  showSettings = false,
  setShowSettings = () => {},
  isVpsMode = false,
  currentEmployee = null,
  currentCompany = {},
  employees,
  customers = [],
  attendance = {},
  complaints = null,
  attendanceLoaded = false,
  complaintsLoaded = false,
  orders = [],
  deliveryReports = [],
  employeeReviews = [],
  assets = [],
  assetCostLogs = [],
  holidays = [],
  onAddEmployee,
  onEditEmployee,
  onDeleteEmployee,
  onAddEmployeeReview,
  onAddHoliday,
  onDeleteHoliday,
  onUpdateCompanySettings,
  isSuperAdmin,
  canViewEmployees = false,
  canCreateEmployee = false,
  quickActionIntent = null,
  onQuickActionHandled = () => {},
  canEditEmployee = false,
  canDeleteEmployee = false,
  canEditEmployeeSalaryPolicy = false,
  canEditEmployeeShiftPolicy = false,
  canEditEmployeeLatePenaltyPolicy = false,
  canEditEmployeeEarlyOvertimePolicy = false,
  canManageEmployeeDocuments = false,
  canCreateSalesCollaborator = false,
  canAssignSalesLeader = false,
  canViewEmployeeReviews = false,
  canCreateEmployeeReview = false,
  canViewAllEmployeeReviews = false,
  canManageHolidayConfig = false,
  canResetEmployeePassword = false,
  showDepartmentFilter = false,
  onCloseDepartmentFilter,
  onResetEmployeePassword
}) {
  const employeeAvatarInputRef = useRef(null);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const employeeDocumentInputRef = useRef(null);
  const [showForm, setShowForm] = useState(false);
  const [editingEmp, setEditingEmp] = useState(null);
  const [empData, setEmpData] = useState(createEmployeeFormState());
  const employeeSaveInFlightRef = useRef(false);
  const employeeCreateRequestIdRef = useRef('');
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);
  const [employeeStatus, setEmployeeStatus] = useState('');
  const [resettingEmployeeId, setResettingEmployeeId] = useState('');
  const [temporaryEmployeePassword, setTemporaryEmployeePassword] = useState('');
  const [showEmployeePassword, setShowEmployeePassword] = useState(false);
  const employeeCredentialSession = useRef(0);
  const employeeResetPending = useRef(false);
  useEffect(() => {
    employeeCredentialSession.current += 1;
    setTemporaryEmployeePassword('');
    setShowEmployeePassword(false);
    return () => { employeeCredentialSession.current += 1; };
  }, [editingEmp?.id, showForm, canResetEmployeePassword]);
  const [avatarUploadEmp, setAvatarUploadEmp] = useState(null);
  const [documentUploadEmp, setDocumentUploadEmp] = useState(null);
  const [documentUploadType, setDocumentUploadType] = useState('id_card');
  const [companyDepartmentNameDraft, setCompanyDepartmentNameDraft] = useState('');
  const [editingCompanyDepartmentId, setEditingCompanyDepartmentId] = useState('');
  const [companyDepartmentStatus, setCompanyDepartmentStatus] = useState('');
  const [isSavingCompanyDepartment, setIsSavingCompanyDepartment] = useState(false);
  const [employeeSettingsSection, setEmployeeSettingsSection] = useState('');
  const [reviewMonth, setReviewMonth] = useState(getTodayString().slice(0, 7));
  const salesRevenueMonth = getTodayString().slice(0, 7);
  const [reviewTargetEmp, setReviewTargetEmp] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewCriteriaScores, setReviewCriteriaScores] = useState(() => buildDefaultEmployeeReviewCriteriaScores(5));
  const [reviewReason, setReviewReason] = useState('');
  const [reviewStatus, setReviewStatus] = useState('');
  const isEditingOwner = Boolean(editingEmp) && (editingEmp.role === 'super_admin' || isOwnerPosition(editingEmp.position));
  const editingEmployeeId = editingEmp?.id || '';
  const salesManagerOptions = useMemo(
    () => (employees || [])
      .filter(emp => !emp?.isArchived && emp.id !== editingEmployeeId && isEmployeeSalesPosition(emp))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi')),
    [employees, editingEmployeeId]
  );
  const employeeRevenueScope = JSON.stringify([currentEmployee?.companyId || '',currentEmployee?.id || '',isSuperAdmin,canViewEmployees,salesRevenueMonth]);
  const salesRevenueRows = useMemo(() => {
    const cached = Array.isArray(employees) && Array.isArray(orders) && Array.isArray(customers)
      ? employeeRevenueProjectionCache([employees,orders,customers],employeeRevenueScope) : {complete:false};
    if (cached.complete) return cached.value;
    const rows = withSalesRevenueIndex(() => (employees || [])
      .filter(emp => !emp?.isArchived && isEmployeeSalesPosition(emp))
      .map(emp => ({
        employee: emp,
        summary: summarizeEmployeeSalesRevenueForMonth({
          employeeId: emp.id,
          orders,
          customers,
          monthKey: salesRevenueMonth
        })
      })));
    cached.value = rows;
    cached.complete = true;
    return rows;
  }, [customers, employees, orders, salesRevenueMonth,employeeRevenueScope]);
  const salesRevenueByEmployeeId = useMemo(
    () => new Map(salesRevenueRows.map(row => [row.employee.id, row.summary])),
    [salesRevenueRows]
  );
  useEffect(() => {
    if (!showSettings) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setEmployeeSettingsSection('');
        setShowSettings(false);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [setShowSettings, showSettings]);
  const selectedSecondaryPositions = normalizeEmployeePositionList(empData.secondaryPositions)
    .filter(position => position && position !== normalizeEmployeePosition(empData.position) && !isOwnerPosition(position));
  const draftEmployeeShape = {
    position: empData.position,
    secondaryPositions: selectedSecondaryPositions,
    roleSalaryComponents: empData.roleSalaryComponents
  };
  const isSalesAccountDraft = isEmployeeSalesPosition(draftEmployeeShape);
  const isSalesCollaboratorDraft = isSalesCollaboratorPosition(empData.position);
  const canWriteCurrentEmployee = editingEmp ? canEditEmployee : canCreateEmployee;
  const canManageDocuments = canEditEmployee && canManageEmployeeDocuments;
  const canManageSalaryPolicy = canWriteCurrentEmployee && canEditEmployeeSalaryPolicy && !isSalesCollaboratorDraft;
  const canManageShiftPolicy = canWriteCurrentEmployee && canEditEmployeeShiftPolicy && !isSalesCollaboratorDraft;
  const canManageLatePenaltyPolicy = canWriteCurrentEmployee && canEditEmployeeLatePenaltyPolicy && !isSalesCollaboratorDraft;
  const canManageEarlyOvertimePolicy = canWriteCurrentEmployee && canEditEmployeeEarlyOvertimePolicy && !isSalesCollaboratorDraft;
  const canUseEmployeeReviews = Boolean(canViewEmployeeReviews || canCreateEmployeeReview || canViewAllEmployeeReviews);
  const canOpenEmployeeModule = Boolean(
    isSuperAdmin ||
    canViewEmployees ||
    canCreateEmployee ||
    canEditEmployee ||
    canDeleteEmployee ||
    canEditEmployeeSalaryPolicy ||
    canEditEmployeeShiftPolicy ||
    canEditEmployeeLatePenaltyPolicy ||
    canEditEmployeeEarlyOvertimePolicy ||
    canManageEmployeeDocuments ||
    canCreateSalesCollaborator ||
    canAssignSalesLeader ||
    canManageHolidayConfig ||
    canUseEmployeeReviews
  );
  const employeeDepartmentOptions = useMemo(() => {
    const canKeepCurrentCollaborator = isSalesCollaboratorPosition(empData.position);
    const options = normalizeCompanyDepartments([
      ...DEPARTMENT_ACCOUNT_OPTIONS,
      ...normalizeCompanyDepartments(currentCompany?.employeeDepartments)
        .map(department => normalizeEmployeePosition(department.name)),
    ]).map(department => department.name).filter(option => !isOwnerPosition(option));
    if (canCreateSalesCollaborator || canKeepCurrentCollaborator) return options;
    return options.filter(option => !isSalesCollaboratorPosition(option));
  }, [canCreateSalesCollaborator, empData.position, currentCompany?.employeeDepartments]);
  const companyDepartments = useMemo(
    () => normalizeCompanyDepartments(currentCompany?.employeeDepartments),
    [currentCompany?.employeeDepartments],
  );
  const companyDepartmentById = useMemo(
    () => new Map(normalizeCompanyDepartments([
      ...companyDepartments,
      ...DEPARTMENT_ACCOUNT_OPTIONS,
    ]).map((department) => [department.id, department])),
    [companyDepartments],
  );
  const getEmployeeCompanyDepartment = (employee) => {
    const departmentId = `${employee?.companyDepartmentId || ''}`;
    const matchedById = companyDepartmentById.get(departmentId);
    if (matchedById) return matchedById;
    const legacyName = `${employee?.companyDepartmentName || employee?.companyDepartment || ''}`.trim();
    return companyDepartments.find(
      (department) => department.name.localeCompare(legacyName, 'vi', { sensitivity: 'base' }) === 0,
    );
  };
  const canManageCompanyDepartments = Boolean(isSuperAdmin || canEditEmployee);
  const handleSaveCompanyDepartment = async (event) => {
    event.preventDefault();
    if (!canManageCompanyDepartments || isSavingCompanyDepartment) return;
    const result = upsertCompanyDepartment(companyDepartments, {
      id: editingCompanyDepartmentId,
      name: companyDepartmentNameDraft,
      now: new Date().toISOString(),
      nextId: `department_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    });
    if (result.error) {
      setCompanyDepartmentStatus(result.error);
      return;
    }
    setIsSavingCompanyDepartment(true);
    setCompanyDepartmentStatus('');
    try {
      const saved = await onUpdateCompanySettings?.({ employeeDepartments: result.departments });
      if (!saved || saved.success === false)
        throw new Error(saved?.message || 'Không thể lưu bộ phận công ty.');
      setCompanyDepartmentNameDraft('');
      setEditingCompanyDepartmentId('');
      setCompanyDepartmentStatus('Đã lưu bộ phận công ty.');
    } catch (error) {
      setCompanyDepartmentStatus(
        getFriendlyFirebaseErrorMessage(error, 'Không thể lưu bộ phận công ty.'),
      );
    } finally {
      setIsSavingCompanyDepartment(false);
    }
  };
  const handleRemoveCompanyDepartment = async (departmentId) => {
    if (!canManageCompanyDepartments || isSavingCompanyDepartment) return;
    const assignedDepartmentIds = (employees || [])
      .filter((employee) => !employee?.isArchived)
      .map((employee) => getEmployeeCompanyDepartment(employee)?.id || '');
    const result = removeCompanyDepartment(companyDepartments, {
      id: departmentId,
      assignedDepartmentIds,
    });
    if (result.error) {
      setCompanyDepartmentStatus(result.error);
      return;
    }
    setIsSavingCompanyDepartment(true);
    setCompanyDepartmentStatus('');
    try {
      const saved = await onUpdateCompanySettings?.({ employeeDepartments: result.departments });
      if (!saved || saved.success === false)
        throw new Error(saved?.message || 'Không thể xóa bộ phận công ty.');
      if (editingCompanyDepartmentId === departmentId) {
        setEditingCompanyDepartmentId('');
        setCompanyDepartmentNameDraft('');
      }
      setCompanyDepartmentStatus('Đã xóa bộ phận công ty.');
    } catch (error) {
      setCompanyDepartmentStatus(
        getFriendlyFirebaseErrorMessage(error, 'Không thể xóa bộ phận công ty.'),
      );
    } finally {
      setIsSavingCompanyDepartment(false);
    }
  };
  const draftLatePenaltyTiers = normalizeLatePenaltyTiers(empData.latePenaltyTiers);
  const updateLatePenaltyTier = (index, patch) => {
    if (!canManageLatePenaltyPolicy) return;
    setEmpData(prev => {
      const tiers = normalizeLatePenaltyTiers(prev.latePenaltyTiers);
      tiers[index] = { ...tiers[index], ...patch };
      return { ...prev, latePenaltyTiers: tiers };
    });
  };

  const addLatePenaltyTier = () => {
    if (!canManageLatePenaltyPolicy) return;
    setEmpData(prev => {
      const tiers = normalizeLatePenaltyTiers(prev.latePenaltyTiers);
      const nextLateMinutes = (tiers[tiers.length - 1]?.lateMinutes || 0) + 30;
      return {
        ...prev,
        latePenaltyTiers: [
          ...tiers,
          { id: `late_${Date.now()}`, lateMinutes: nextLateMinutes, penaltyAmount: 0, action: 'fine' }
        ]
      };
    });
  };

  const removeLatePenaltyTier = (index) => {
    if (!canManageLatePenaltyPolicy) return;
    setEmpData(prev => {
      const tiers = normalizeLatePenaltyTiers(prev.latePenaltyTiers).filter((_, tierIndex) => tierIndex !== index);
      return { ...prev, latePenaltyTiers: tiers.length > 0 ? tiers : DEFAULT_LATE_PENALTY_TIERS };
    });
  };

  const getRoleSalaryInputValue = (position) => {
    const normalized = normalizeEmployeePosition(position);
    const row = (empData.roleSalaryComponents || []).find(item => normalizeEmployeePosition(item?.position) === normalized);
    return row?.amount ?? '';
  };

  const setRoleSalaryInputValue = (position, value) => {
    const normalized = normalizeEmployeePosition(position);
    if (!normalized || !canManageSalaryPolicy) return;
    setEmpData(prev => {
      const rows = normalizeEmployeeRoleSalaryComponents(prev.roleSalaryComponents, { keepEmpty: true })
        .filter(row => row.position !== normalized);
      return { ...prev, roleSalaryComponents: [...rows, { id: normalized, position: normalized, amount: value, note: '' }] };
    });
  };

  const toggleSecondaryPosition = (position) => {
    const normalized = normalizeEmployeePosition(position);
    if (!normalized || normalized === normalizeEmployeePosition(empData.position) || isOwnerPosition(normalized)) return;
    setEmpData(prev => {
      const current = normalizeEmployeePositionList(prev.secondaryPositions)
        .filter(item => item !== normalizeEmployeePosition(prev.position));
      const next = current.includes(normalized)
        ? current.filter(item => item !== normalized)
        : [...current, normalized];
      const nextRoleRows = normalizeEmployeeRoleSalaryComponents(prev.roleSalaryComponents, { keepEmpty: true })
        .filter(row => next.includes(row.position));
      const hasSalesWork = isSalesPosition(prev.position) || next.some(isSalesPosition);
      return {
        ...prev,
        secondaryPositions: next,
        roleSalaryComponents: nextRoleRows,
        salesLeaderId: hasSalesWork ? (prev.salesLeaderId || '') : '',
        salesLeaderCommissionPercent: hasSalesWork ? (prev.salesLeaderCommissionPercent || '') : ''
      };
    });
  };

  const visibleEmployeeReviews = useMemo(() => {
    const list = Array.isArray(employeeReviews) ? employeeReviews : [];
    if (isSuperAdmin || canViewAllEmployeeReviews || canViewEmployees) return list;
    const currentId = currentEmployee?.id || '';
    return list.filter(item => item.reviewerEmployeeId === currentId || item.targetEmployeeId === currentId);
  }, [employeeReviews, isSuperAdmin, canViewAllEmployeeReviews, canViewEmployees, currentEmployee?.id]);




  const employeeAssetLookup = useMemo(() => {
    const lookup = new Map();
    (assets || [])
      .filter(asset => asset && !asset.isArchived)
      .forEach(asset => {
        const assigneeIds = [
          asset.assignedDriverId,
          asset.driverId,
          asset.driverEmployeeId,
          asset.assignedEmployeeId,
          asset.employeeId,
          asset.managerId,
          asset.responsibleEmployeeId,
          ...(Array.isArray(asset.driverIds) ? asset.driverIds : []),
          ...(Array.isArray(asset.assignedDriverIds) ? asset.assignedDriverIds : []),
          ...(Array.isArray(asset.assignedEmployeeIds) ? asset.assignedEmployeeIds : [])
        ]
          .map(value => `${value || ''}`.trim())
          .filter(Boolean);
        [...new Set(assigneeIds)].forEach(employeeId => {
          if (!lookup.has(employeeId)) lookup.set(employeeId, []);
          lookup.get(employeeId).push(asset);
        });
      });
    lookup.forEach(list => list.sort((a, b) => (a.name || a.vehicleBrand || '').localeCompare(b.name || b.vehicleBrand || '', 'vi')));
    return lookup;
  }, [assets]);

  const employeeAssetCostLookup = useMemo(() => {
    const lookup = new Map();
    const monthKey = getTodayString().slice(0, 7);
    (assetCostLogs || [])
      .filter(log => log && !log.isArchived && log.assetId)
      .forEach(log => {
        const assetId = `${log.assetId || ''}`.trim();
        const amount = parseLooseMoneyValue(log.amount);
        const dateKey = `${log.date || log.createdAt || ''}`.slice(0, 7);
        const current = lookup.get(assetId) || { total: 0, monthTotal: 0, count: 0, latest: null };
        current.total += amount;
        current.count += 1;
        if (dateKey === monthKey) current.monthTotal += amount;
        const latestTime = getEntityTimestamp(log) || Date.parse(log.date || log.createdAt || '') || 0;
        const previousTime = current.latest ? (getEntityTimestamp(current.latest) || Date.parse(current.latest.date || current.latest.createdAt || '') || 0) : 0;
        if (!current.latest || latestTime >= previousTime) current.latest = log;
        lookup.set(assetId, current);
      });
    return lookup;
  }, [assetCostLogs]);

  const getAssignedAssetsForEmployee = (employeeId) => employeeAssetLookup.get(`${employeeId || ''}`.trim()) || [];
  const reviewCriteriaAverage = getEmployeeReviewCriteriaAverage(reviewCriteriaScores);
  const reviewFinalRating = Math.round(clampEmployeeReviewStar(reviewCriteriaAverage || reviewRating, 5));

  if (!canOpenEmployeeModule) {
    return <AccessDeniedView />;
  }

  const openEmployeeReview = (emp) => {
    if (!canCreateEmployeeReview || !emp) return;
    setReviewTargetEmp(emp);
    setReviewRating(5);
    setReviewCriteriaScores(buildDefaultEmployeeReviewCriteriaScores(5));
    setReviewReason('');
    setReviewStatus('');
  };

  const applyReviewRatingToAllCriteria = (rating) => {
    const nextRating = Math.round(clampEmployeeReviewStar(rating, 5));
    setReviewRating(nextRating);
    setReviewCriteriaScores(buildDefaultEmployeeReviewCriteriaScores(nextRating));
  };

  const updateReviewCriterionScore = (criteriaId, rating) => {
    const nextRating = Math.round(clampEmployeeReviewStar(rating, 5));
    setReviewCriteriaScores(prev => ({ ...buildDefaultEmployeeReviewCriteriaScores(reviewRating), ...(prev || {}), [criteriaId]: nextRating }));
  };

  const handleSubmitEmployeeReview = async (event) => {
    event.preventDefault();
    if (!reviewTargetEmp || !onAddEmployeeReview) return;
    setReviewStatus('Đang lưu đánh giá...');
    try {
      const result = await onAddEmployeeReview({
        targetEmployeeId: reviewTargetEmp.id,
        reviewerEmployeeId: currentEmployee?.id || '',
        reviewerName: currentEmployee?.name || '',
        source: 'peer',
        rating: reviewFinalRating,
        criteriaScores: reviewCriteriaScores,
        criteriaAverage: reviewCriteriaAverage,
        reason: reviewReason,
        monthKey: reviewMonth
      });
      setReviewStatus(result?.message || 'Đã lưu đánh giá.');
      if (result?.success !== false) {
        setReviewTargetEmp(null);
        setReviewReason('');
      }
    } catch (error) {
      setReviewStatus(`Lưu đánh giá bị lỗi: ${error.message}`);
    }
  };

  const openCreateEmployeeForm = () => {
    if (!canCreateEmployee) return;
    employeeCreateRequestIdRef.current = crypto.randomUUID();
    setEditingEmp(null);
    setEmpData(createEmployeeFormState('Kế toán & nhân sự', {
      createLogin: isVpsMode,
      loginPassword: '12345678',
      loginPasswordConfirm: '12345678',
    }));
    setEmployeeStatus('');
    setShowForm(true);
  };

  useEffect(() => {
    if (quickActionIntent?.type !== 'create_employee' || !canCreateEmployee) return;
    openCreateEmployeeForm();
    onQuickActionHandled?.();
  }, [quickActionIntent?.id, quickActionIntent?.requestedAt, quickActionIntent?.type, canCreateEmployee]);

  const handlePositionChange = (position) => {
    const shiftDefaults = getPositionShiftDefaults(position);
    const normalizedPosition = normalizeEmployeePosition(position);
    if (isSalesCollaboratorPosition(normalizedPosition) && !canCreateSalesCollaborator) {
      setEmployeeStatus('Tài khoản này chưa có quyền tạo cộng tác viên kinh doanh.');
      return;
    }
    const nextIsSales = isSalesPosition(normalizedPosition);
    const nextIsCollaborator = isSalesCollaboratorPosition(normalizedPosition);
    setEmpData(prev => {
      const secondaryPositions = normalizeEmployeePositionList(prev.secondaryPositions)
        .filter(item => item !== normalizedPosition);
      const hasSalesWork = nextIsSales || secondaryPositions.some(isSalesPosition);
      const roleSalaryComponents = normalizeEmployeeRoleSalaryComponents(prev.roleSalaryComponents, { keepEmpty: true })
        .filter(row => secondaryPositions.includes(row.position));
      return {
        ...prev,
        position: normalizedPosition,
        secondaryPositions,
        roleSalaryComponents,
        companyDepartmentId: [...companyDepartmentById.values()].find(department => normalizeEmployeePosition(department.name) === normalizedPosition)?.id || '',
        companyDepartmentName: [...companyDepartmentById.values()].find(department => normalizeEmployeePosition(department.name) === normalizedPosition)?.name || '',
        shiftName: shiftDefaults.shiftName,
        shiftStart: shiftDefaults.shiftStart,
        shiftEnd: shiftDefaults.shiftEnd,
        graceMinutes: shiftDefaults.graceMinutes,
        missingAlertMinutes: shiftDefaults.missingAlertMinutes,
        commissionBaseMode: nextIsCollaborator ? 'total_revenue' : (prev.commissionBaseMode || 'above_target'),
        salesLeaderId: hasSalesWork ? (prev.salesLeaderId || '') : '',
        salesLeaderCommissionPercent: hasSalesWork ? (prev.salesLeaderCommissionPercent || '') : ''
      };
    });
  };

  const handleOpenEdit = (emp) => {
    if (!canEditEmployee) return;
    setEditingEmp(emp);
    setEmployeeStatus('');
    const shiftPolicy = resolveEmployeeShiftPolicy(emp);
    const attendanceLocationSettings = getEmployeeAttendanceLocationSettings(emp);
    const primaryPosition = getEmployeePositionLabel(emp.position);
    const salaryRows = normalizeEmployeeRoleSalaryComponents(
      emp.roleSalaryComponents || emp.departmentSalaryComponents || emp.salaryByDepartment,
      { keepEmpty: true }
    );
    const secondaryPositions = normalizeEmployeePositionList([
      ...(Array.isArray(emp.secondaryPositions) ? emp.secondaryPositions : []),
      ...(Array.isArray(emp.additionalPositions) ? emp.additionalPositions : []),
      ...(Array.isArray(emp.departments) ? emp.departments : []),
      ...salaryRows.map(row => row.position)
    ]).filter(position => position && position !== primaryPosition && !isOwnerPosition(position));
    setEmpData({ 
      name: emp.name, phone: emp.phone, position: primaryPosition,
      companyDepartmentId: getEmployeeCompanyDepartment(emp)?.id || '',
      companyDepartmentName: getEmployeeCompanyDepartment(emp)?.name || '',
      createLogin: false,
      loginPassword: '',
      loginPasswordConfirm: '',
      secondaryPositions,
      roleSalaryComponents: salaryRows.map(row => ({ ...row, amount: row.amount ? `${row.amount}` : '' })),
      startDate: emp.startDate || getTodayString(), 
      probationDuration: emp.probationDuration || 0,
      probationUnit: emp.probationUnit || 'days',
      probationRate: emp.probationRate !== undefined ? emp.probationRate : 100,
      avatarUrl: getEmployeeAvatarUrl(emp),
      salaryBankId: emp.salaryBankId || emp.payrollBankId || emp.bankId || '',
      salaryBankName: emp.salaryBankName || emp.payrollBankName || emp.bankName || '',
      salaryBankAccountName: emp.salaryBankAccountName || emp.payrollBankAccountName || emp.bankAccountName || emp.accountName || '',
      salaryBankAccountNumber: emp.salaryBankAccountNumber || emp.payrollBankAccountNumber || emp.bankAccountNumber || emp.accountNumber || '',
      basicSalary: emp.basicSalary,
      salaryMonthDays: emp.salaryMonthDays ?? '',
      salaryPolicyEffectiveFrom: getTodayString(),
      supportSalary: emp.supportSalary || 0, responsibilitySalary: emp.responsibilitySalary || 0, experienceSalary: emp.experienceSalary || 0, experienceSalaryPeriod: emp.experienceSalaryPeriod || 'months', commissionRate: formatCommissionPercentInput(emp.commissionRate), commissionBaseMode: emp.commissionBaseMode || (isSalesCollaboratorPosition(emp.position) ? 'total_revenue' : 'above_target'), targetRevenue: emp.targetRevenue || 0, salesLeaderId: getSalesLeaderId(emp), salesLeaderCommissionPercent: emp.salesLeaderCommissionPercent ?? emp.leaderCommissionPercent ?? emp.managerCommissionPercent ?? '', overtimeRate: emp.overtimeRate || 0, latePenaltyRate: emp.latePenaltyRate || 0, latePenaltyTiers: getEmployeeLatePenaltyTiers(emp), autoEarlyOvertimeEnabled: emp.autoEarlyOvertimeEnabled !== false, autoLateCheckoutOvertimeEnabled: emp.autoLateCheckoutOvertimeEnabled !== false,
      shiftName: shiftPolicy.shiftName,
      shiftStart: shiftPolicy.shiftStart,
      shiftEnd: shiftPolicy.shiftEnd,
      graceMinutes: shiftPolicy.graceMinutes,
      missingAlertMinutes: shiftPolicy.missingAlertMinutes,
      attendanceLocationEnabled: attendanceLocationSettings.enabled,
      attendanceLocationLabel: attendanceLocationSettings.label || '',
      attendanceLocationInput: attendanceLocationSettings.input || (attendanceLocationSettings.location ? `${attendanceLocationSettings.location.lat}, ${attendanceLocationSettings.location.lng}` : ''),
      attendanceLocationRadiusMeters: attendanceLocationSettings.radiusMeters,
      employeeDocuments: normalizeEmployeeDocuments(emp.employeeDocuments || emp.documents || emp.identityDocuments)
    });
    setShowForm(true);
  };

  const closeEmployeeEditor = () => {
    setShowForm(false);
    setEditingEmp(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingEmp && !canEditEmployee) return;
    if (!editingEmp && !canCreateEmployee) return;
    const normalizedPosition = normalizeEmployeePosition(empData.position);
    const secondaryPositions = normalizeEmployeePositionList(empData.secondaryPositions)
      .filter(position => position && position !== normalizedPosition && !isOwnerPosition(position));
    const positionSet = normalizeEmployeePositionList([normalizedPosition, ...secondaryPositions]);
    const isSalesPayload = positionSet.some(isSalesPosition);
    const isCollaboratorPayload = isSalesCollaboratorPosition(normalizedPosition);
    const roleSalaryComponents = isCollaboratorPayload ? [] : normalizeEmployeeRoleSalaryComponents(empData.roleSalaryComponents, { keepEmpty: true })
      .filter(row => secondaryPositions.includes(row.position) && row.amount > 0);
    const salesLeaderId = isSalesPayload ? `${empData.salesLeaderId || ''}`.trim() : '';
    const salesLeaderCommissionPercent = isSalesPayload ? (parseFloat(empData.salesLeaderCommissionPercent) || 0) : 0;
    const attendanceLocationInput = `${empData.attendanceLocationInput || ''}`.trim();
    const attendanceLocation = normalizeAttendanceFixedLocation(parseCustomerLocationInput(attendanceLocationInput));
    const attendanceLocationEnabled = Boolean(empData.attendanceLocationEnabled);
    if (attendanceLocationEnabled && !attendanceLocation) {
      setEmployeeStatus('Vui lòng nhập tọa độ GPS hợp lệ cho vị trí chấm công cố định, ví dụ: 10.123456, 106.123456.');
      return;
    }
    if (isVpsMode && empData.createLogin) {
      if (`${empData.loginPassword || ''}`.length < 8) {
        setEmployeeStatus('Mật khẩu tạm cần ít nhất 8 ký tự.');
        return;
      }
      if (empData.loginPassword !== empData.loginPasswordConfirm) {
        setEmployeeStatus('Mật khẩu nhập lại chưa khớp.');
        return;
      }
      if (editingEmp?.userId) {
        setEmployeeStatus('Nhân sự này đã có tài khoản đăng nhập.');
        return;
      }
      if (editingEmp && !isSameLoginPhone(editingEmp.phone, empData.phone)) {
        setEmployeeStatus('Hãy lưu số điện thoại mới trước, sau đó mở lại hồ sơ để cấp quyền đăng nhập.');
        return;
      }
    }
    const shiftDefaults = getPositionShiftDefaults(normalizedPosition);
    const normalizedShiftStart = normalizeTimeInputValue(empData.shiftStart) || shiftDefaults.shiftStart;
    const normalizedShiftEnd = normalizeTimeInputValue(empData.shiftEnd) || shiftDefaults.shiftEnd;
    const assignedCompanyDepartment = companyDepartmentById.get(
      `${empData.companyDepartmentId || ''}`,
    );
    const pData = { 
      ...empData,
      position: normalizedPosition,
      primaryPosition: normalizedPosition,
      companyDepartmentId: assignedCompanyDepartment?.id || '',
      companyDepartmentName: assignedCompanyDepartment?.name || '',
      secondaryPositions,
      additionalPositions: secondaryPositions,
      departments: positionSet,
      roleSalaryComponents,
      probationDuration: isCollaboratorPayload ? 0 : (parseInt(empData.probationDuration)||0),
      probationRate: isCollaboratorPayload ? 100 : (parseInt(empData.probationRate)||100),
      basicSalary: isCollaboratorPayload ? 0 : (parseInt(empData.basicSalary)||0), 
      salaryMonthDays: isCollaboratorPayload
        ? ''
        : (parseInt(empData.salaryMonthDays, 10) > 0 ? parseInt(empData.salaryMonthDays, 10) : ''),
      supportSalary: isCollaboratorPayload ? 0 : (parseInt(empData.supportSalary)||0), 
      responsibilitySalary: isCollaboratorPayload ? 0 : (parseInt(empData.responsibilitySalary)||0),
      experienceSalary: isCollaboratorPayload ? 0 : (parseInt(empData.experienceSalary)||0), 
      commissionBaseMode: isCollaboratorPayload ? 'total_revenue' : (empData.commissionBaseMode || 'above_target'),
      commissionRate: isSalesPayload ? parseCommissionPercentInput(empData.commissionRate) : 0, 
      targetRevenue: isCollaboratorPayload ? 0 : (parseInt(empData.targetRevenue)||0), 
      salesLeaderId,
      salesManagerId: salesLeaderId,
      salesLeaderCommissionPercent,
      leaderCommissionPercent: salesLeaderCommissionPercent,
      salaryBankId: `${empData.salaryBankId || ''}`.trim().toUpperCase(),
      salaryBankName: `${empData.salaryBankName || ''}`.trim(),
      salaryBankAccountName: `${empData.salaryBankAccountName || ''}`.trim().toUpperCase(),
      salaryBankAccountNumber: `${empData.salaryBankAccountNumber || ''}`.trim().replace(/\s+/g, ''),
      overtimeRate: isCollaboratorPayload ? 0 : (parseInt(empData.overtimeRate)||0),
      latePenaltyRate: isCollaboratorPayload ? 0 : (parseInt(empData.latePenaltyRate)||0),
      latePenaltyTiers: isCollaboratorPayload ? [] : normalizeLatePenaltyTiers(empData.latePenaltyTiers),
      autoEarlyOvertimeEnabled: isCollaboratorPayload ? false : Boolean(empData.autoEarlyOvertimeEnabled),
      autoLateCheckoutOvertimeEnabled: isCollaboratorPayload ? false : Boolean(empData.autoLateCheckoutOvertimeEnabled),
      shiftName: `${empData.shiftName || shiftDefaults.shiftName}`.trim() || shiftDefaults.shiftName,
      shiftStart: normalizedShiftStart,
      shiftEnd: normalizedShiftEnd,
      shiftIsOvernight: isOvernightShiftRange(normalizedShiftStart, normalizedShiftEnd),
      graceMinutes: parseMinutesInput(empData.graceMinutes, shiftDefaults.graceMinutes),
      missingAlertMinutes: parseMinutesInput(empData.missingAlertMinutes, shiftDefaults.missingAlertMinutes),
      attendanceLocationEnabled,
      attendanceLocationLabel: `${empData.attendanceLocationLabel || ''}`.trim(),
      attendanceLocationInput,
      attendanceLocation,
      attendanceLocationRadiusMeters: Math.max(1, parseInt(empData.attendanceLocationRadiusMeters, 10) || DEFAULT_ATTENDANCE_LOCATION_RADIUS_METERS),
      employeeDocuments: normalizeEmployeeDocuments(empData.employeeDocuments)
    };
    if (isVpsMode && empData.createLogin) {
      pData.account = { password: empData.loginPassword };
    }
    if (editingEmp) {
      if (!canEditEmployeeSalaryPolicy) {
        Object.assign(pData, {
          basicSalary: editingEmp.basicSalary,
        salaryMonthDays: editingEmp.salaryMonthDays ?? '',
          supportSalary: editingEmp.supportSalary || 0,
          responsibilitySalary: editingEmp.responsibilitySalary || 0,
          experienceSalary: editingEmp.experienceSalary || 0,
          experienceSalaryPeriod: editingEmp.experienceSalaryPeriod || 'months',
          probationDuration: editingEmp.probationDuration || 0,
          probationUnit: editingEmp.probationUnit || 'days',
          probationRate: editingEmp.probationRate !== undefined ? editingEmp.probationRate : 100,
          commissionRate: editingEmp.commissionRate || 0,
          commissionBaseMode: editingEmp.commissionBaseMode || (isSalesCollaboratorPosition(editingEmp.position) ? 'total_revenue' : 'above_target'),
          targetRevenue: editingEmp.targetRevenue || 0,
          overtimeRate: editingEmp.overtimeRate || 0,
          roleSalaryComponents: normalizeEmployeeRoleSalaryComponents(editingEmp.roleSalaryComponents || editingEmp.departmentSalaryComponents || editingEmp.salaryByDepartment, { keepEmpty: true })
        });
      }
      if (!canEditEmployeeShiftPolicy) {
        const currentShiftPolicy = resolveEmployeeShiftPolicy(editingEmp);
        const currentAttendanceLocationSettings = getEmployeeAttendanceLocationSettings(editingEmp);
        Object.assign(pData, {
          shiftName: currentShiftPolicy.shiftName,
          shiftStart: currentShiftPolicy.shiftStart,
          shiftEnd: currentShiftPolicy.shiftEnd,
          graceMinutes: currentShiftPolicy.graceMinutes,
          missingAlertMinutes: currentShiftPolicy.missingAlertMinutes,
          attendanceLocationEnabled: currentAttendanceLocationSettings.enabled,
          attendanceLocationLabel: currentAttendanceLocationSettings.label || '',
          attendanceLocationInput: currentAttendanceLocationSettings.input || (currentAttendanceLocationSettings.location ? `${currentAttendanceLocationSettings.location.lat}, ${currentAttendanceLocationSettings.location.lng}` : ''),
          attendanceLocation: currentAttendanceLocationSettings.location,
          attendanceLocationRadiusMeters: currentAttendanceLocationSettings.radiusMeters
        });
      }
      if (!canAssignSalesLeader) {
        const currentLeaderId = getSalesLeaderId(editingEmp);
        const currentLeaderCommissionPercent = editingEmp.salesLeaderCommissionPercent ?? editingEmp.leaderCommissionPercent ?? editingEmp.managerCommissionPercent ?? 0;
        Object.assign(pData, {
          salesLeaderId: currentLeaderId,
          salesManagerId: currentLeaderId,
          salesLeaderCommissionPercent: currentLeaderCommissionPercent,
          leaderCommissionPercent: currentLeaderCommissionPercent
        });
      }
      if (!canEditEmployeeLatePenaltyPolicy) {
        Object.assign(pData, {
          latePenaltyRate: editingEmp.latePenaltyRate || 0,
          latePenaltyTiers: getEmployeeLatePenaltyTiers(editingEmp)
        });
      }
      if (!canEditEmployeeEarlyOvertimePolicy) {
        pData.autoEarlyOvertimeEnabled = editingEmp.autoEarlyOvertimeEnabled !== false;
        pData.autoLateCheckoutOvertimeEnabled = editingEmp.autoLateCheckoutOvertimeEnabled !== false;
      }
    }
    if (canEditEmployeeSalaryPolicy || !editingEmp) {
      Object.assign(pData, buildEmployeePayrollPolicyUpdate({
        employee: editingEmp,
        nextEmployee: pData,
        effectiveFrom: empData.salaryPolicyEffectiveFrom,
        changedAt: new Date().toISOString(),
        changedByEmployeeId: currentEmployee?.id || '',
        changedByName: currentEmployee?.name || currentEmployee?.displayName || ''
      }));
    } else if (editingEmp) {
      Object.assign(pData, {
        payrollPolicies: editingEmp.payrollPolicies || editingEmp.salaryPolicyHistory || [],
        salaryPolicyHistory: editingEmp.salaryPolicyHistory || editingEmp.payrollPolicies || [],
        salaryPolicyVersion: editingEmp.salaryPolicyVersion || '',
        salaryPolicyEffectiveFrom: editingEmp.salaryPolicyEffectiveFrom || editingEmp.startDate || ''
      });
    }
    if (employeeSaveInFlightRef.current) return;
    try {
      employeeSaveInFlightRef.current = true;
      setIsSavingEmployee(true);
      setEmployeeStatus('Đang xác nhận với máy chủ...');
      if (!employeeCreateRequestIdRef.current) employeeCreateRequestIdRef.current = crypto.randomUUID();
      const result = editingEmp ? await onEditEmployee(editingEmp.id, pData) : await onAddEmployee({ ...pData, clientMutationId: employeeCreateRequestIdRef.current });
      if (result && result.success === false) {
        setEmployeeStatus(result.message || 'Không thể lưu tài khoản nhân sự.');
        return;
      }
      setEmployeeStatus(result?.message || (editingEmp ? 'Đã lưu thay đổi tài khoản.' : 'Đã tạo tài khoản mới.'));
      setShowForm(false);
    } catch (error) {
      setEmployeeStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể lưu tài khoản nhân sự.'));
    } finally {
      employeeSaveInFlightRef.current = false;
      setIsSavingEmployee(false);
    }
  };

  const handleUseCurrentAttendanceLocation = async () => {
    try {
      setEmployeeStatus('Đang lấy GPS hiện tại để cài vị trí chấm công...');
      const position = await requestPreciseAttendanceLocation();
      const location = buildCustomerLocationFromPosition(position);
      if (!location) {
        setEmployeeStatus('Không lấy được tọa độ GPS hiện tại. Hãy bật vị trí chính xác rồi thử lại.');
        return;
      }
      setEmpData(prev => ({
        ...prev,
        attendanceLocationEnabled: true,
        attendanceLocationInput: `${location.lat}, ${location.lng}`,
        attendanceLocationLabel: prev.attendanceLocationLabel || getEmployeePositionLabel(prev.position),
        attendanceLocationRadiusMeters: prev.attendanceLocationRadiusMeters || DEFAULT_ATTENDANCE_LOCATION_RADIUS_METERS
      }));
      setEmployeeStatus(`Đã lấy vị trí GPS hiện tại: ${location.lat}, ${location.lng}.`);
    } catch (error) {
      setEmployeeStatus(getFriendlyFirebaseErrorMessage(error, 'Không lấy được GPS hiện tại để cài vị trí chấm công.'));
    }
  };

  const handleDeleteEmployeeClick = async (emp) => {
    if (!emp?.id || !canDeleteEmployee) return false;
    if (emp.role === 'super_admin' || isOwnerPosition(emp.position)) {
      setEmployeeStatus('Không thể xóa tài khoản chủ doanh nghiệp.');
      return false;
    }
    const confirmed = window.confirm(`Xóa nhân sự "${emp.name || 'này'}"? Tài khoản này sẽ không đăng nhập được nữa.`);
    if (!confirmed) return false;

    try {
      const result = await onDeleteEmployee?.(emp.id);
      setEmployeeStatus(result?.message || (result?.success ? 'Đã xóa nhân sự.' : 'Không thể xóa nhân sự.'));
      return result?.success !== false;
    } catch (error) {
      setEmployeeStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể xóa nhân sự.'));
      return false;
    }
  };

  const handleResetEmployeePassword = async (emp) => {
    if (!emp?.id || !canResetEmployeePassword || !onResetEmployeePassword || employeeResetPending.current) return;
    if (emp.role === 'super_admin' || isOwnerPosition(emp.position)) {
      setEmployeeStatus('Không thể đặt lại tài khoản chủ doanh nghiệp từ hồ sơ nhân sự.');
      return;
    }
    const confirmed = window.confirm(
      `Đặt lại đăng nhập của "${emp.name || 'nhân sự này'}" về mật khẩu mặc định 12345678?\n\n`
      + 'Toàn bộ phiên đăng nhập, PIN, sinh trắc học và thiết bị tin cậy cũ sẽ bị thu hồi. Nhân sự phải đổi mật khẩu và tạo PIN mới ở lần đăng nhập tiếp theo.'
    );
    if (!confirmed) return;

    employeeResetPending.current = true;
    const credentialSession = employeeCredentialSession.current;
    setTemporaryEmployeePassword('');
    setShowEmployeePassword(false);
    setResettingEmployeeId(emp.id);
    setEmployeeStatus('Đang đặt lại đăng nhập và thu hồi các phiên cũ...');
    try {
      const result = await onResetEmployeePassword(emp.id);
      if (credentialSession !== employeeCredentialSession.current) return;
      if (result?.success) setTemporaryEmployeePassword(result.temporaryPassword || '');
      setEmployeeStatus(result?.success
        ? 'Đã đặt lại tài khoản. Nhân sự phải đổi mật khẩu và PIN khi đăng nhập.'
        : (result?.message || 'Không thể đặt lại đăng nhập cho nhân sự.'));
    } catch (error) {
      if (credentialSession !== employeeCredentialSession.current) return;
      setEmployeeStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể đặt lại đăng nhập cho nhân sự.'));
    } finally {
      employeeResetPending.current = false;
      setResettingEmployeeId('');
    }
  };

  const handleOpenAvatarPicker = (emp) => {
    if (!emp?.id || !canEditEmployee) return;
    setAvatarUploadEmp(emp);
    employeeAvatarInputRef.current?.click();
  };

  const handleEmployeeAvatarSelect = async (event) => {
    const file = event.target.files?.[0];
    const targetEmp = avatarUploadEmp;
    if (!file || !targetEmp?.id) {
      event.target.value = '';
      return;
    }

    try {
      const dataUrl = await readImageFileAsDataUrl(file, 512, 0.82);
      const result = await onEditEmployee?.(targetEmp.id, { avatarUrl: dataUrl });
      setEmployeeStatus(result?.success === false ? (result?.message || 'Không thể lưu ảnh đại diện.') : `Đã cập nhật ảnh đại diện cho ${targetEmp.name || 'nhân sự'}.`);
    } catch (error) {
      setEmployeeStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể lưu ảnh đại diện.'));
    } finally {
      setAvatarUploadEmp(null);
      event.target.value = '';
    }
  };

  const handleOpenDocumentPicker = (emp, type = documentUploadType) => {
    if (!emp?.id || !canManageDocuments) return;
    setDocumentUploadEmp(emp);
    setDocumentUploadType(type || 'other');
    employeeDocumentInputRef.current?.click();
  };

  const handleEmployeeDocumentSelect = async (event) => {
    const file = event.target.files?.[0];
    const targetEmp = documentUploadEmp;
    if (!file || !targetEmp?.id) {
      event.target.value = '';
      return;
    }

    if (file.size > EMPLOYEE_DOCUMENT_MAX_BYTES) {
      setEmployeeStatus('File giay to qua lon. Hay chon file duoi 450 KB de luu an toan tren he thong.');
      setDocumentUploadEmp(null);
      event.target.value = '';
      return;
    }

    try {
      const existingDocuments = normalizeEmployeeDocuments(
        targetEmp.employeeDocuments || targetEmp.documents || empData.employeeDocuments
      );
      const totalSize = existingDocuments.reduce((sum, doc) => sum + Number(doc.size || 0), 0) + Number(file.size || 0);
      if (totalSize > EMPLOYEE_DOCUMENT_TOTAL_MAX_BYTES) {
        setEmployeeStatus('Ho so giay to da gan dat gioi han luu tru. Hay xoa bot file cu hoac chuyen sang Firebase Storage cho file lon.');
        return;
      }
      const dataUrl = await readFileAsDataUrl(file);
      const nextDocument = {
        id: `employee_doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: documentUploadType || 'other',
        typeLabel: getEmployeeDocumentTypeLabel(documentUploadType || 'other'),
        fileName: file.name || 'giay-to-nhan-su',
        mimeType: file.type || 'application/octet-stream',
        size: file.size || 0,
        dataUrl,
        uploadedAt: new Date().toISOString()
      };
      const nextDocuments = [nextDocument, ...existingDocuments];
      const result = await onEditEmployee?.(targetEmp.id, { employeeDocuments: nextDocuments });
      if (result?.success === false) {
        setEmployeeStatus(result?.message || 'Khong the luu giay to nhan su.');
        return;
      }
      setEditingEmp(prev => (prev?.id === targetEmp.id ? { ...prev, employeeDocuments: nextDocuments } : prev));
      setEmpData(prev => ({ ...prev, employeeDocuments: nextDocuments }));
      setEmployeeStatus(`Da tai len ${getEmployeeDocumentTypeLabel(documentUploadType || 'other')} cho ${targetEmp.name || 'nhan su'}.`);
    } catch (error) {
      setEmployeeStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể đọc hoặc lưu file giấy tờ.'));
    } finally {
      setDocumentUploadEmp(null);
      event.target.value = '';
    }
  };

  const handleDeleteEmployeeDocument = async (emp, documentId) => {
    if (!emp?.id || !documentId || !canManageDocuments) return;
    const currentDocuments = normalizeEmployeeDocuments(emp.employeeDocuments || empData.employeeDocuments);
    const nextDocuments = currentDocuments.filter(doc => doc.id !== documentId);
    try {
      const result = await onEditEmployee?.(emp.id, { employeeDocuments: nextDocuments });
      if (result?.success === false) {
        setEmployeeStatus(result?.message || 'Khong the xoa giay to nhan su.');
        return;
      }
      setEditingEmp(prev => (prev?.id === emp.id ? { ...prev, employeeDocuments: nextDocuments } : prev));
      setEmpData(prev => ({ ...prev, employeeDocuments: nextDocuments }));
      setEmployeeStatus('Da xoa giay to nhan su.');
    } catch (error) {
      setEmployeeStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể xóa giấy tờ nhân sự.'));
    }
  };

  const handleDownloadEmployeeDocument = (document) => {
    if (!document?.dataUrl) return;
    const link = window.document.createElement('a');
    link.href = document.dataUrl;
    link.download = document.fileName || 'giay-to-nhan-su';
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
  };

  const visibleEmployeeDocuments = normalizeEmployeeDocuments(
    empData.employeeDocuments || editingEmp?.employeeDocuments || editingEmp?.documents
  );

  return (
    <div data-hd-employee-directory className="space-y-4 animate-in fade-in pb-16">
      {employeeStatus && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {employeeStatus}
        </div>
      )}
      {showSettings && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)] sm:items-center"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setEmployeeSettingsSection('');
              setShowSettings(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-settings-title"
            onMouseDown={(event) => event.stopPropagation()}
            className="flex max-h-[80dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 id="employee-settings-title" className="text-base font-black text-slate-900">Cài đặt nhân sự</h2>
              <button
                type="button"
                onClick={() => {
                  setEmployeeSettingsSection('');
                  setShowSettings(false);
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                aria-label="Đóng cài đặt nhân sự"
                title="Đóng"
              ><X size={18} /></button>
            </header>
            <div className="min-h-0 space-y-2 overflow-y-auto overscroll-contain p-3">
              <button
                type="button"
                aria-expanded={employeeSettingsSection === 'departments'}
                aria-controls="employee-department-settings"
                onClick={() => setEmployeeSettingsSection(current => current === 'departments' ? '' : 'departments')}
                className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left hover:bg-slate-50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Building size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-900">Bộ phận công ty</span>
                  <span className="block text-xs text-slate-500">{companyDepartments.length} bộ phận</span>
                </span>
                {employeeSettingsSection === 'departments' ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </button>
              {employeeSettingsSection === 'departments' && (
                <section id="employee-department-settings" className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  {canManageCompanyDepartments && (
                    <form onSubmit={handleSaveCompanyDepartment} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <input
                        type="text"
                        value={companyDepartmentNameDraft}
                        onChange={(event) => setCompanyDepartmentNameDraft(event.target.value)}
                        placeholder="Tên bộ phận"
                        aria-label="Tên bộ phận công ty"
                        maxLength={60}
                        className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-400"
                      />
                      <div className="flex gap-2">
                        {editingCompanyDepartmentId && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCompanyDepartmentId('');
                              setCompanyDepartmentNameDraft('');
                              setCompanyDepartmentStatus('');
                            }}
                            className="rounded-xl bg-slate-200 px-3 py-2 text-xs font-bold text-slate-600"
                          >Hủy</button>
                        )}
                        <button
                          type="submit"
                          disabled={isSavingCompanyDepartment || !companyDepartmentNameDraft.trim()}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                        >
                          {editingCompanyDepartmentId ? <Save size={14} /> : <Plus size={14} />}
                          {editingCompanyDepartmentId ? 'Lưu' : 'Thêm'}
                        </button>
                      </div>
                    </form>
                  )}
                  {companyDepartmentStatus && (
                    <p role="status" className={`mt-2 text-xs font-semibold ${companyDepartmentStatus.startsWith('Đã') ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {companyDepartmentStatus}
                    </p>
                  )}
                  <div className="mt-3 space-y-2">
                    {companyDepartments.length ? companyDepartments.map((department) => {
                      const assignedCount = (employees || []).filter(
                        (employee) => !employee?.isArchived && getEmployeeCompanyDepartment(employee)?.id === department.id,
                      ).length;
                      return (
                        <div key={department.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-800">{department.name}</p>
                            <p className="text-[11px] text-slate-500">{assignedCount} nhân sự</p>
                          </div>
                          {canManageCompanyDepartments && (
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCompanyDepartmentId(department.id);
                                  setCompanyDepartmentNameDraft(department.name);
                                  setCompanyDepartmentStatus('');
                                }}
                                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-emerald-700"
                                aria-label={`Sửa bộ phận ${department.name}`}
                                title="Sửa"
                              ><Edit3 size={15} /></button>
                              <button
                                type="button"
                                onClick={() => handleRemoveCompanyDepartment(department.id)}
                                disabled={isSavingCompanyDepartment}
                                className="rounded-lg p-2 text-rose-500 hover:bg-slate-100 disabled:opacity-50"
                                aria-label={`Xóa bộ phận ${department.name}`}
                                title={assignedCount ? 'Chuyển nhân sự trước khi xóa' : 'Xóa'}
                              ><Trash2 size={15} /></button>
                            </div>
                          )}
                        </div>
                      );
                    }) : (
                      <p className="rounded-xl bg-white px-3 py-3 text-xs text-slate-500">
                        Chưa có bộ phận. Thêm bộ phận để phân loại hồ sơ nhân sự của công ty.
                      </p>
                    )}
                  </div>
                </section>
              )}
              {(canViewEmployees || canManageHolidayConfig || isSuperAdmin) && (
                <>
                  <button
                    type="button"
                    aria-expanded={employeeSettingsSection === 'holidays'}
                    aria-controls="employee-holiday-settings"
                    onClick={() => setEmployeeSettingsSection(current => current === 'holidays' ? '' : 'holidays')}
                    className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left hover:bg-slate-50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-700"><CalendarDays size={18} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-900">Ngày lễ</span>
                      <span className="block text-xs text-slate-500">{holidays.length} ngày đã cài</span>
                    </span>
                    {employeeSettingsSection === 'holidays' ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </button>
                  {employeeSettingsSection === 'holidays' && (
                    <div id="employee-holiday-settings">
                      <HolidayConfigCard
                        holidays={holidays}
                        onAddHoliday={onAddHoliday}
                        onDeleteHoliday={onDeleteHoliday}
                        canManage={Boolean(isSuperAdmin || canManageHolidayConfig)}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      )}
      <div className="space-y-3">
        {showDepartmentFilter && (
          <div className="flex items-end gap-3 border-b pb-3">
            <label className="min-w-0 flex-1 text-sm font-semibold">Bộ phận
              <select aria-label="Lọc theo bộ phận" value={departmentFilter} onChange={event => setDepartmentFilter(event.target.value)} className="mt-2 w-full rounded-lg border bg-white p-3">
                <option value="">Tất cả bộ phận</option>
                {normalizeCompanyDepartments([...DEPARTMENT_ACCOUNT_OPTIONS, ...companyDepartments, ...employees.map(emp => emp.position).filter(Boolean)]).map(item => <option key={item.id} value={normalizeEmployeePosition(item.name)}>{item.name}</option>)}
              </select>
            </label>
            <button type="button" aria-label="Đóng bộ lọc nhân sự" onClick={onCloseDepartmentFilter} className="p-3"><X size={20} /></button>
          </div>
        )}
        {departmentFilter && <button type="button" onClick={() => setDepartmentFilter('')} className="text-sm underline">{departmentFilter} · Bỏ lọc</button>}
        {employees.filter(emp => !departmentFilter || [emp.position, emp.primaryPosition, ...(emp.secondaryPositions || []), ...(emp.additionalPositions || []), getEmployeeCompanyDepartment(emp)?.name].some(position => normalizeEmployeePosition(position) === departmentFilter)).map(emp => {
          const bankName = emp.salaryBankName || emp.payrollBankName || emp.bankName || '';
          const bankCode = emp.salaryBankId || emp.payrollBankId || emp.bankId || bankName;
          const accountNumber = emp.salaryBankAccountNumber || emp.payrollBankAccountNumber || emp.bankAccountNumber || emp.accountNumber || '';
          const accountName = emp.salaryBankAccountName || emp.payrollBankAccountName || emp.bankAccountName || emp.accountName || emp.name || '';
          const qrPayload = buildVietQrEmvPayload({ bankCode, accountNumber, accountName });
          const shift = resolveEmployeeShiftPolicy(emp);
          const departmentName = getEmployeeCompanyDepartment(emp)?.name || emp.companyDepartmentName || getEmployeePositionSummary(emp);
          const avatarUrl = getEmployeeAvatarUrl(emp);
          const initials = (emp.name || 'NV').trim().split(/\s+/).slice(-2).map(part => part.charAt(0)).join('').toUpperCase();
          return (
            <div key={emp.id} data-employee-list-row className="flex flex-nowrap items-center gap-2 border-b border-gray-300 bg-white py-3 sm:gap-3">
              <button type="button" onClick={() => handleOpenAvatarPicker(emp)} disabled={!canEditEmployee} aria-label={`Đổi ảnh đại diện ${emp.name}`} title="Đổi ảnh đại diện" className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-100 text-xs font-semibold text-gray-700 sm:h-12 sm:w-12">
                {avatarUrl ? <img src={avatarUrl} alt={`Ảnh đại diện ${emp.name}`} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <span>{initials}</span>}
              </button>
              <button type="button" onClick={() => handleOpenEdit(emp)} className="min-w-0 flex-1 self-stretch text-left" aria-label={`Mở hồ sơ ${emp.name}`}>
                <h3 className="break-words text-sm font-semibold text-gray-800">{emp.name}</h3>
                <p className="mt-1 break-words text-xs text-gray-600">{departmentName}</p>
                <p className="mt-2 break-words text-xs text-gray-600">{shift.shiftName}</p>
                <p className="mt-1 text-xs text-gray-600">{formatShiftRangeLabel(shift)}</p>
              </button>
              <EmployeeBankQr payload={qrPayload} name={emp.name} bankName={bankName || bankCode} accountNumber={accountNumber} accountName={accountName} generateImage={buildLocalPaymentQrDataUrl} shareFile={shareBlobFile} />
            </div>
          );
        })}
      </div>
      <input ref={employeeAvatarInputRef} type="file" accept="image/*" onChange={handleEmployeeAvatarSelect} className="hidden" />
      <input ref={employeeDocumentInputRef} type="file" accept="image/*,.pdf,.doc,.docx" onChange={handleEmployeeDocumentSelect} className="hidden" />
      {canCreateEmployee && (
      <div className="hd-employee-module-fab fixed right-4 z-40 pointer-events-none flex justify-end">
        <button type="button" onClick={openCreateEmployeeForm} aria-label="Thêm nhân viên" className="pointer-events-auto h-14 w-14 rounded-full bg-gradient-to-br from-emerald-500 to-blue-600 text-white shadow-2xl shadow-emerald-900/25 flex items-center justify-center border border-white/40 active:scale-95 transition">
          <Plus size={28} strokeWidth={2.8} />
        </button>
      </div>
      )}

      {reviewTargetEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
          <form onSubmit={handleSubmitEmployeeReview} className="my-auto w-full max-w-md animate-in zoom-in-95 rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-600">Chấm sao nhân sự</p>
                <h3 className="text-xl font-black text-gray-900">{reviewTargetEmp.name || 'Nhân sự'}</h3>
                <p className="mt-1 text-xs text-gray-500">Đánh giá tháng {reviewMonth}. Mục tiêu là góp ý xây dựng, khuyến khích hỗ trợ nhau, không dùng để công kích cá nhân.</p>
              </div>
              <button
                type="button"
                onClick={() => setReviewTargetEmp(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
                aria-label="Đóng đánh giá"
              >
                <X size={16} />
              </button>
            </div>

            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-amber-700">Chấm nhanh</p>
                <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-amber-600">
                  Tổng hợp {reviewFinalRating}★
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => applyReviewRatingToAllCriteria(star)}
                    className={`rounded-2xl border px-2 py-3 text-lg font-black transition active:scale-95 ${
                      reviewFinalRating === star
                        ? 'border-amber-300 bg-white text-amber-500 shadow-sm'
                        : 'border-transparent bg-white/60 text-gray-300'
                    }`}
                  >
                    {star}★
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-emerald-700">Tiêu chí công việc</p>
              <p className="mt-1 text-[11px] leading-relaxed text-emerald-700">
                Chấm đúng thực tế để tập thể biết điểm mạnh, điểm cần sửa và cùng làm việc hòa thuận hơn.
              </p>
              <div className="mt-3 space-y-2">
                {EMPLOYEE_PEER_REVIEW_CRITERIA.map(criteria => {
                  const currentScore = Math.round(clampEmployeeReviewStar(reviewCriteriaScores?.[criteria.id], reviewFinalRating));
                  return (
                    <div key={criteria.id} className="rounded-2xl border border-emerald-100 bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-gray-900">{criteria.label}</p>
                          <p className="mt-0.5 text-[11px] leading-snug text-gray-500">{criteria.hint}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">
                          {currentScore}★
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-5 gap-1.5">
                        {[1, 2, 3, 4, 5].map(star => (
                          <button
                            key={`${criteria.id}_${star}`}
                            type="button"
                            onClick={() => updateReviewCriterionScore(criteria.id, star)}
                            className={`rounded-xl border px-1 py-2 text-sm font-black transition active:scale-95 ${
                              currentScore === star
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                : 'border-gray-100 bg-gray-50 text-gray-300'
                            }`}
                            aria-label={`${criteria.label} ${star} sao`}
                          >
                            {star}★
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <textarea
              value={reviewReason}
              onChange={event => setReviewReason(event.target.value)}
              rows={4}
              placeholder="Lý do đánh giá (không bắt buộc): đi làm đều, hỗ trợ đồng đội tốt, giao tiếp lịch sự..."
              className="mt-3 w-full resize-none rounded-2xl border border-gray-100 bg-gray-50 p-3 text-sm outline-none focus:border-amber-300 focus:bg-white focus:ring-2 focus:ring-amber-100"
            />

            {reviewStatus && (
              <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                {reviewStatus}
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setReviewTargetEmp(null)}
                className="rounded-2xl bg-gray-100 py-3 text-sm font-black text-gray-600 active:scale-[0.99]"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="rounded-2xl bg-gradient-to-r from-amber-500 to-emerald-500 py-3 text-sm font-black text-white shadow-lg shadow-amber-200 active:scale-[0.99]"
              >
                Lưu đánh giá
              </button>
            </div>
          </form>
        </div>
      )}

      {showForm && createPortal(
        <div
          className={editingEmp
            ? 'hd-modal-layer fixed inset-0 z-[80] flex flex-col bg-slate-50 pt-[env(safe-area-inset-top)]'
            : 'fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4'}
          data-hd-modal-root="true"
        >
          <div
            role={editingEmp ? 'dialog' : undefined}
            aria-modal={editingEmp ? 'true' : undefined}
            aria-label={editingEmp ? `Hồ sơ nhân sự ${editingEmp.name || ''}` : undefined}
            className={editingEmp
              ? 'employee-profile hd-modal-surface flex min-h-0 w-full flex-1 flex-col bg-slate-50'
              : 'my-auto w-full max-w-md animate-in zoom-in-95 rounded-2xl bg-white p-5'}
          >
            <div className={`mb-4 flex shrink-0 justify-between gap-3 ${editingEmp ? 'items-center border-b border-blue-800 bg-blue-700 px-4 py-3 text-white' : 'items-start'}`}>
              {editingEmp ? (
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={closeEmployeeEditor}
                    aria-label="Quay lại danh sách nhân sự"
                    title="Quay lại danh sách nhân sự"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/15"
                  ><ChevronLeft size={23} /></button>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold">Hồ sơ nhân sự</h3>
                    <p className="truncate text-xs text-blue-100">{editingEmp.name}</p>
                  </div>
                </div>
              ) : (
                <h3 className="font-bold text-lg">Tạo tài khoản bộ phận</h3>
              )}
              <div className="flex items-center gap-2">
                {canDeleteEmployee && editingEmp && !(editingEmp.role === 'super_admin' || isOwnerPosition(editingEmp.position)) && (
                  <button
                    type="button"
                    onClick={async () => {
                      const deleted = await handleDeleteEmployeeClick(editingEmp);
                      if (deleted) {
                        closeEmployeeEditor();
                      }
                    }}
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${editingEmp ? 'bg-white/15 text-white hover:bg-white/25' : 'border border-red-100 bg-red-50 text-red-500 hover:bg-red-100'}`}
                    aria-label="Xóa nhân sự"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                {!editingEmp && (
                  <button type="button" onClick={closeEmployeeEditor} className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200" aria-label="Đóng">
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
            <form onSubmit={handleSubmit} className={editingEmp ? 'flex min-h-0 flex-1 flex-col' : ''}>
              <div className={editingEmp
                ? 'employee-profile-fields min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-4'
                : 'max-h-[70vh] space-y-3 overflow-y-auto pr-2'}>
              {employeeStatus && (
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                  {employeeStatus}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <input required type="text" placeholder={isEditingOwner ? 'Tên chủ doanh nghiệp' : 'Tên nhân sự'} value={empData.name} onChange={e=>setEmpData({...empData, name: toTitleCase(e.target.value)})} className="min-w-0 w-full border p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"/>
                {isEditingOwner ? (
                  <div className="w-full border border-amber-200 bg-amber-50 px-3 py-3 rounded-xl text-sm font-bold text-amber-700 flex items-center">Chủ doanh nghiệp</div>
                ) : (
                  <select aria-label="Bộ phận" value={empData.position} onChange={e=>handlePositionChange(e.target.value)} className="min-w-0 w-full border p-3 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500">
                    {employeeDepartmentOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 items-end">
                <label className="min-w-0 block space-y-1.5">
                  <input required aria-label="Số điện thoại" type="tel" placeholder="SĐT (Đăng nhập)" value={empData.phone} onChange={e=>setEmpData({...empData, phone: e.target.value})} className="min-w-0 w-full border p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"/>
                </label>
              {editingEmp && !isEditingOwner && (
                <label className="min-w-0 block space-y-1.5">
                  <select
                    value={empData.companyDepartmentId || ''}
                    onChange={(event) => {
                      const department = companyDepartmentById.get(event.target.value);
                      setEmpData((previous) => ({
                        ...previous,
                        companyDepartmentId: department?.id || '',
                        companyDepartmentName: department?.name || '',
                      }));
                    }}
                    aria-label="Bộ phận"
                    className="min-w-0 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-emerald-400"
                  >
                    <option value="">Chưa phân bộ phận</option>
                    {[...companyDepartmentById.values()].filter(department => !isOwnerPosition(department.name)).map((department) => (
                      <option key={department.id} value={department.id}>{department.name}</option>
                    ))}
                  </select>
                </label>
              )}
                {!editingEmp && (
                  <input aria-label="Mật khẩu" type="text" value="12345678" readOnly autoComplete="off" className="min-w-0 w-full border border-slate-200 bg-slate-50 p-3 rounded-xl text-sm font-semibold text-slate-700" />
                )}
              </div>
              {isVpsMode && editingEmp && !isEditingOwner && (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3">
                  {editingEmp?.userId ? (
                    <div>
                      <p className="text-sm font-black text-emerald-800">Đã liên kết tài khoản</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-emerald-700">Nhân sự có thể đăng nhập bằng số điện thoại trong hồ sơ và quyền được áp dụng theo bộ phận.</p>
                    </div>
                  ) : (
                    <>
                      <label className="flex cursor-pointer items-center justify-between gap-3">
                        <span>
                          <span className="block text-sm font-black text-slate-900">Cho phép đăng nhập bằng số điện thoại</span>
                          <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">Tài khoản được gắn vào đúng hồ sơ này nên dữ liệu và vai trò vẫn được giữ nguyên.</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={Boolean(empData.createLogin)}
                          onChange={(event) => setEmpData(prev => ({
                            ...prev,
                            createLogin: event.target.checked,
                            loginPassword: event.target.checked ? prev.loginPassword : '',
                            loginPasswordConfirm: event.target.checked ? prev.loginPasswordConfirm : '',
                          }))}
                          className="h-5 w-5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                        />
                      </label>
                      {empData.createLogin && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <input type="password" value={empData.loginPassword} onChange={(event) => setEmpData(prev => ({ ...prev, loginPassword: event.target.value }))} className="w-full rounded-xl border border-emerald-100 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400" placeholder="Mật khẩu tạm" autoComplete="new-password" />
                          <input type="password" value={empData.loginPasswordConfirm} onChange={(event) => setEmpData(prev => ({ ...prev, loginPasswordConfirm: event.target.value }))} className="w-full rounded-xl border border-emerald-100 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400" placeholder="Nhập lại mật khẩu" autoComplete="new-password" />
                          <p className="sm:col-span-2 text-[11px] leading-relaxed text-emerald-700">Người dùng phải đổi mật khẩu ở lần đăng nhập đầu tiên. Không cần SMS OTP.</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              {isEditingOwner && <p className="text-[11px] text-gray-500 leading-relaxed">Tài khoản chủ doanh nghiệp là tài khoản gốc của công ty và không tạo thêm từ màn này.</p>}
              {editingEmp && !isEditingOwner && canResetEmployeePassword && (
                <div>
                  <label htmlFor="employee-temporary-password" className="text-xs font-bold text-slate-600">Mật khẩu</label>
                  <div className="mt-1.5 flex items-center gap-3">
                    <div className="relative min-w-0 flex-1">
                      <input id="employee-temporary-password" type={showEmployeePassword ? 'text' : 'password'} value={temporaryEmployeePassword} readOnly autoComplete="off" placeholder="Không thể xem mật khẩu hiện tại" className="w-full min-w-0 rounded-xl border bg-white py-3 pl-3 pr-11 text-sm" />
                      <button type="button" disabled={!temporaryEmployeePassword} onClick={() => setShowEmployeePassword(value => !value)} aria-label={showEmployeePassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showEmployeePassword} title={showEmployeePassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} className="absolute right-0 top-0 flex h-full w-11 items-center justify-center text-slate-600 disabled:opacity-40">
                        {showEmployeePassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  <button
                    type="button"
                    onClick={() => handleResetEmployeePassword(editingEmp)}
                    disabled={resettingEmployeeId === editingEmp.id}
                    className="shrink-0 rounded-xl bg-amber-500 px-3 py-2 text-[11px] font-black text-white hover:bg-amber-600 disabled:bg-amber-300"
                  >
                    {resettingEmployeeId === editingEmp.id ? 'Đang đặt lại...' : 'Đặt lại'}
                  </button>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">Chỉ xem được mật khẩu mới trong lần đặt lại này. Phiên đăng nhập cũ sẽ bị thu hồi.</p>
                </div>
              )}
              {!isEditingOwner && (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-[0.12em] text-emerald-800">Kiêm nhiệm bộ phận</h4>
                    </div>
                    {selectedSecondaryPositions.length > 0 && (
                      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-emerald-600 border border-emerald-100">
                        {selectedSecondaryPositions.length} kiêm nhiệm
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {employeeDepartmentOptions
                      .filter(option => normalizeEmployeePosition(option) !== normalizeEmployeePosition(empData.position))
                      .map(option => {
                        const normalized = normalizeEmployeePosition(option);
                        const checked = selectedSecondaryPositions.includes(normalized);
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => toggleSecondaryPosition(option)}
                            className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition ${checked ? 'border-emerald-300 bg-white text-emerald-700 shadow-sm' : 'border-emerald-100 bg-emerald-50/50 text-emerald-700/70'}`}
                          >
                            {checked ? 'Đã chọn - ' : '+ '}{option}
                          </button>
                        );
                      })}
                  </div>
                  {selectedSecondaryPositions.length > 0 && (
                    <div className="space-y-2 rounded-xl border border-emerald-100 bg-white p-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Lương kiêm nhiệm theo bộ phận</p>
                      {selectedSecondaryPositions.map(position => (
                        <div key={position} className="grid grid-cols-[1fr_1.15fr] gap-2 items-center">
                          <span className="rounded-lg bg-slate-50 px-2 py-2 text-xs font-bold text-slate-700">{position}</span>
                          <input
                            type="tel"
                            placeholder="Lương/tháng"
                            value={formatInputCurrency(getRoleSalaryInputValue(position))}
                            disabled={!canManageSalaryPolicy}
                            onChange={e => setRoleSalaryInputValue(position, parseInputCurrency(e.target.value))}
                            className="w-full rounded-lg border border-emerald-100 px-2 py-2 text-right text-sm outline-none focus:ring-2 focus:ring-emerald-400 disabled:bg-slate-50 disabled:text-slate-400"
                          />
                        </div>
                      ))}
                      <p className="text-[10px] leading-relaxed text-slate-500">
                        Lương kiêm nhiệm được cộng theo ngày công thực tế trong tháng, phù hợp cho nhân sự vừa sản xuất, vừa giao hàng hoặc kiêm kinh doanh.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {isSalesAccountDraft && !isEditingOwner && canAssignSalesLeader && (
                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 space-y-3">
                  <div className="employee-leader-row grid grid-cols-2 items-end gap-2">
                    <label htmlFor="employee-sales-leader" className="text-sm font-bold">Cấp trên</label>
                    <label htmlFor="employee-sales-leader-percent" className="text-sm font-bold">% cấp trên hưởng</label>
                    <div>
                      <select id="employee-sales-leader" aria-label="Cấp trên" value={empData.salesLeaderId || ''} onChange={e=>setEmpData({...empData, salesLeaderId: e.target.value})} className="w-full border border-emerald-200 p-2.5 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500">
                        <option value="">Không có</option>
                        {salesManagerOptions.map(manager => (
                          <option key={manager.id} value={manager.id}>{manager.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <input id="employee-sales-leader-percent" type="number" min="0" step="0.01" placeholder="Ví dụ: 0.5" value={empData.salesLeaderCommissionPercent} onChange={e=>setEmpData({...empData, salesLeaderCommissionPercent: e.target.value})} className="w-full border border-emerald-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                  </div>
                  {isSalesCollaboratorDraft && (
                    <p className="rounded-lg bg-white/80 border border-emerald-100 px-3 py-2 text-[10px] font-semibold text-emerald-700">
                      Cộng tác viên kinh doanh thường có lương chính theo % trên tổng doanh thu khách hàng phụ trách.
                    </p>
                  )}
                </div>
              )}
              

              {!isSalesCollaboratorDraft && (
              <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-amber-700 uppercase mb-1">Tên ca</label>
                  <input type="text" value={empData.shiftName} disabled={!canManageShiftPolicy} onChange={e=>setEmpData({...empData, shiftName: capitalizeFirst(e.target.value)})} className="w-full border border-amber-200 p-2.5 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-amber-50/60 disabled:text-gray-500" placeholder="Ví dụ: Ca sản xuất sớm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-amber-700 uppercase mb-1">Giờ vào chuẩn (24h)</label>
                    <input type="time" step="60" value={empData.shiftStart} disabled={!canManageShiftPolicy} onChange={e=>setEmpData({...empData, shiftStart: e.target.value})} className="w-full border border-amber-200 p-2.5 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-amber-50/60 disabled:text-gray-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-amber-700 uppercase mb-1">Giờ ra chuẩn (24h)</label>
                    <input type="time" step="60" value={empData.shiftEnd} disabled={!canManageShiftPolicy} onChange={e=>setEmpData({...empData, shiftEnd: e.target.value})} className="w-full border border-amber-200 p-2.5 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-amber-50/60 disabled:text-gray-500" />
                  </div>
                </div>
                <p className="rounded-lg bg-white/80 border border-amber-100 px-3 py-2 text-[10px] font-semibold text-amber-700 leading-relaxed">
                  Nhập giờ theo kiểu 24h. Nếu giờ ra nhỏ hơn giờ vào, ví dụ 22:00 - 11:00, app tự hiểu đây là ca qua ngày và tính đi trễ, về sớm, tăng ca theo sáng hôm sau.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-amber-700 uppercase mb-1">Cho phép trễ (phút)</label>
                    <input type="number" min="0" value={empData.graceMinutes} disabled={!canManageShiftPolicy} onChange={e=>setEmpData({...empData, graceMinutes: e.target.value})} className="w-full border border-amber-200 p-2.5 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-amber-50/60 disabled:text-gray-500" placeholder="Ví dụ: 10" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-amber-700 uppercase mb-1">Nhắc quên chấm sau (phút)</label>
                    <input type="number" min="0" value={empData.missingAlertMinutes} disabled={!canManageShiftPolicy} onChange={e=>setEmpData({...empData, missingAlertMinutes: e.target.value})} className="w-full border border-amber-200 p-2.5 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-amber-50/60 disabled:text-gray-500" placeholder="Ví dụ: 20" />
                  </div>
                </div>
              </div>
              )}


              <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                <label htmlFor="employee-start-date" className="block text-[10px] font-bold text-blue-700 uppercase mb-1">Ngày bắt đầu vào làm (Tính thâm niên)</label>
                <input id="employee-start-date" required type="date" value={empData.startDate} onChange={e=>setEmpData({...empData, startDate: e.target.value})} className="w-full border border-blue-200 p-2.5 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
              {!isSalesCollaboratorDraft && (
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-3 mt-2">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase text-gray-500">Áp dụng chính sách từ ngày</label>
                  <input
                    type="date"
                    value={empData.salaryPolicyEffectiveFrom || getTodayString()}
                    disabled={!canManageSalaryPolicy}
                    onChange={event => setEmpData({ ...empData, salaryPolicyEffectiveFrom: event.target.value })}
                    className="w-full rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100 disabled:text-gray-500"
                  />
                  <p className="mt-1 text-[10px] text-gray-500">Kỳ đã khóa luôn giữ nguyên chính sách trong snapshot.</p>
                </div>
                <h4 className="text-xs font-bold text-gray-700 border-b border-gray-200 pb-1">Chính sách lương & thử việc</h4>
                <div className="grid grid-cols-2 gap-2">
                  <input required type="tel" placeholder={"L\u01b0\u01a1ng c\u01a1 b\u1ea3n"} value={formatInputCurrency(empData.basicSalary)} disabled={!canManageSalaryPolicy} onChange={e=>setEmpData({...empData, basicSalary: parseInputCurrency(e.target.value)})} className="w-full border p-2.5 rounded-lg text-sm outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100 disabled:text-gray-500"/>
                  <input type="number" min="1" placeholder={"S\u1ed1 ng\u00e0y l\u00e0m/th\u00e1ng"} value={empData.salaryMonthDays} disabled={!canManageSalaryPolicy} onChange={e=>setEmpData({...empData, salaryMonthDays: e.target.value})} className="w-full border p-2.5 rounded-lg text-sm outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100 disabled:text-gray-500"/>
                </div>
                
                <div className="bg-white p-3 rounded-lg border border-gray-200 grid grid-cols-2 gap-2 shadow-sm">
                  <p className="col-span-2 text-[10px] font-bold uppercase text-gray-500">Thời gian thử việc</p>
                  <div className="flex min-w-0 overflow-hidden rounded-lg border bg-white focus-within:ring-2 focus-within:ring-emerald-500">
                    <input type="number" placeholder={"S\u1ed1 ng\u00e0y th\u1eed vi\u1ec7c"} value={empData.probationDuration} disabled={!canManageSalaryPolicy} onChange={e=>setEmpData({...empData, probationDuration: e.target.value})} className="min-w-0 flex-1 border-0 p-2.5 text-sm outline-none placeholder:text-gray-400 disabled:bg-gray-100 disabled:text-gray-500"/>
                    <select value={empData.probationUnit} disabled={!canManageSalaryPolicy} onChange={e=>setEmpData({...empData, probationUnit: e.target.value})} className="w-20 shrink-0 border-0 border-l border-gray-100 bg-white px-1 text-xs text-gray-600 outline-none disabled:bg-gray-100">
                      <option value="days">Ngày</option>
                      <option value="weeks">Tuần</option>
                      <option value="months">Tháng</option>
                    </select>
                  </div>
                  <div className="relative min-w-0">
                    <div className="relative">
                      <input type="number" placeholder={"% h\u01b0\u1edfng l\u01b0\u01a1ng"} value={empData.probationRate} disabled={!canManageSalaryPolicy} onChange={e=>setEmpData({...empData, probationRate: e.target.value})} className="w-full border p-2.5 pl-3 pr-8 rounded-lg text-sm outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-500 text-right text-emerald-600 bg-emerald-50/50 disabled:bg-gray-100 disabled:text-gray-500"/>
                      <Percent size={14} className="absolute right-3 top-3 text-emerald-500" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Phụ cấp cố định</label>
                    <input type="tel" placeholder="Nhập tiền phụ cấp" value={formatInputCurrency(empData.supportSalary)} disabled={!canManageSalaryPolicy} onChange={e=>setEmpData({...empData, supportSalary: parseInputCurrency(e.target.value)})} className="w-full border p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100 disabled:text-gray-500"/>
                  </div>
                  <div className="min-w-0">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Lương trách nhiệm</label>
                    <input type="tel" placeholder="Ví dụ: 1.000.000" value={formatInputCurrency(empData.responsibilitySalary)} disabled={!canManageSalaryPolicy} onChange={e=>setEmpData({...empData, responsibilitySalary: parseInputCurrency(e.target.value)})} className="w-full border p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100 disabled:text-gray-500"/>
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 text-[10px] font-black uppercase text-amber-700">Mốc phạt</p>
                    <button type="button" onClick={addLatePenaltyTier} disabled={!canManageLatePenaltyPolicy} className="shrink-0 whitespace-nowrap px-3 py-2 rounded-xl bg-white border border-amber-200 text-amber-700 text-xs font-bold disabled:opacity-50">
                      + Mốc
                    </button>
                  </div>
                  <div className="space-y-2">
                    {draftLatePenaltyTiers.map((tier, index) => (
                      <div key={tier.id || index} className="grid grid-cols-[0.9fr_1.2fr_auto] gap-2 items-end rounded-xl bg-white border border-amber-100 p-2">
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Muộn từ phút</label>
                          <input type="number" min="0" value={tier.lateMinutes} disabled={!canManageLatePenaltyPolicy} onChange={e => updateLatePenaltyTier(index, { lateMinutes: e.target.value })} className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-center outline-none focus:ring-2 focus:ring-amber-300 disabled:bg-gray-50" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Cách xử lý</label>
                          <div className="grid grid-cols-[0.9fr_1.1fr] gap-1">
                            <select value={tier.action || 'fine'} disabled={!canManageLatePenaltyPolicy} onChange={e => updateLatePenaltyTier(index, { action: e.target.value, penaltyAmount: e.target.value === 'no_salary' ? 0 : tier.penaltyAmount })} className="border border-gray-200 rounded-lg px-2 py-2 text-xs bg-white outline-none focus:ring-2 focus:ring-amber-300 disabled:bg-gray-50">
                              <option value="fine">Phạt tiền</option>
                              <option value="no_salary">Không lương</option>
                            </select>
                            <input type="tel" value={tier.action === 'no_salary' ? '' : formatInputCurrency(tier.penaltyAmount)} placeholder={tier.action === 'no_salary' ? 'Không tính lương' : 'Số tiền'} disabled={!canManageLatePenaltyPolicy || tier.action === 'no_salary'} onChange={e => updateLatePenaltyTier(index, { penaltyAmount: parseInputCurrency(e.target.value) })} className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs text-right outline-none focus:ring-2 focus:ring-amber-300 disabled:bg-gray-50" />
                          </div>
                        </div>
                        <button type="button" onClick={() => removeLatePenaltyTier(index)} disabled={!canManageLatePenaltyPolicy || draftLatePenaltyTiers.length <= 1} className="h-10 w-10 rounded-lg bg-red-50 text-red-500 border border-red-100 flex items-center justify-center disabled:opacity-40">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <label className="employee-overtime-toggle flex items-center justify-between gap-3 py-3">
                    <span>
                      <span className="block text-sm font-bold text-gray-800">Tính đi sớm thành tăng ca</span>
                    </span>
                    <input type="checkbox" checked={empData.autoEarlyOvertimeEnabled !== false} disabled={!canManageEarlyOvertimePolicy} onChange={e => setEmpData(prev => ({ ...prev, autoEarlyOvertimeEnabled: e.target.checked }))} className="h-5 w-5 accent-emerald-600 disabled:opacity-40" />
                  </label>
                  <label className="employee-overtime-toggle flex items-center justify-between gap-3 py-3">
                    <span>
                      <span className="block text-sm font-bold text-gray-800">Tính ra sau ca thành tăng ca</span>
                    </span>
                    <input type="checkbox" checked={empData.autoLateCheckoutOvertimeEnabled !== false} disabled={!canManageEarlyOvertimePolicy} onChange={e => setEmpData(prev => ({ ...prev, autoLateCheckoutOvertimeEnabled: e.target.checked }))} className="h-5 w-5 accent-blue-600 disabled:opacity-40" />
                  </label>
                  <div>
                    <label htmlFor="employee-overtime-rate" className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Lương tăng ca / giờ</label>
                    <input id="employee-overtime-rate" type="text" inputMode="numeric" placeholder="Ví dụ: 50.000" value={formatInputCurrency(empData.overtimeRate)} disabled={!canManageSalaryPolicy} onChange={e=>setEmpData({...empData, overtimeRate: parseInputCurrency(e.target.value)})} className="w-full border p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100 disabled:text-gray-500"/>
                  </div>
                </div>


                <div className="employee-experience-row grid grid-cols-2 gap-2 pt-2">
                  <div className="min-w-0 flex flex-col">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Lương kinh nghiệm / chu kỳ</label>
                    <input type="tel" placeholder="Ví dụ: 200.000" value={formatInputCurrency(empData.experienceSalary)} disabled={!canManageSalaryPolicy} onChange={e=>setEmpData({...empData, experienceSalary: parseInputCurrency(e.target.value)})} className="w-full border p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100 disabled:text-gray-500"/>
                  </div>
                  <div className="min-w-0 flex flex-col">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Chu kỳ cộng</label>
                    <select value={empData.experienceSalaryPeriod} disabled={!canManageSalaryPolicy} onChange={e=>setEmpData({...empData, experienceSalaryPeriod: e.target.value})} className="w-full border p-2.5 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100 disabled:text-gray-500">
                      <option value="months">Hằng tháng</option>
                      <option value="quarters">Hằng quý</option>
                      <option value="years">Hằng năm</option>
                    </select>
                  </div>
                </div>
              </div>
              )}

              {isSalesAccountDraft && (
                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 space-y-3 mt-2">
                  <h4 className="text-xs font-bold text-emerald-800 border-b border-emerald-200 pb-1">Hoa hồng kinh doanh</h4>
                  <div className={`grid ${isSalesCollaboratorDraft ? 'grid-cols-1' : 'grid-cols-2'} gap-2`}>
                    <div>
                      <label className="block text-[10px] font-bold text-emerald-700 uppercase mb-1">% Hoa hồng</label>
                      <input type="number" step="0.01" placeholder="Ví dụ: 0.3 = 0.3%" value={empData.commissionRate} disabled={!canManageSalaryPolicy} onChange={e=>setEmpData({...empData, commissionRate: e.target.value})} className="w-full border border-emerald-200 p-2.5 rounded-lg text-sm disabled:bg-emerald-50/60 disabled:text-gray-500"/>
                    </div>
                    {!isSalesCollaboratorDraft && (
                      <div>
                        <label className="block text-[10px] font-bold text-emerald-700 uppercase mb-1">Chỉ tiêu doanh số</label>
                        <input type="tel" placeholder="Ví dụ: 50.000.000" value={formatInputCurrency(empData.targetRevenue)} disabled={!canManageSalaryPolicy} onChange={e=>setEmpData({...empData, targetRevenue: parseInputCurrency(e.target.value)})} className="w-full border border-emerald-200 p-2.5 rounded-lg text-sm disabled:bg-emerald-50/60 disabled:text-gray-500"/>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-emerald-700 leading-relaxed font-medium">
                    {isSalesCollaboratorDraft
                      ? 'Công thức CTV: Hoa hồng = tổng doanh thu khách hàng phụ trách x % hoa hồng. Nhập 0.3 nghĩa là 0.3%.'
                      : 'Công thức: Hoa hồng = (Doanh thu thực tế - Chỉ tiêu doanh số) x % hoa hồng. Nhập 1.55 nghĩa là 1.55%.'}
                  </p>
                </div>
              )}
              
              <div className="bg-sky-50 p-3 rounded-xl border border-sky-100 space-y-3 mt-2">
                <h4 className="text-xs font-bold text-sky-800 border-b border-sky-200 pb-1">Tài khoản ngân hàng nhận lương</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-sky-700 uppercase mb-1">Ngân hàng</label>
                    <select
                      value={empData.salaryBankId || ''}
                      onChange={(event) => {
                        const selectedBank = BANK_ID_OPTIONS.find(option => option.value === event.target.value);
                        setEmpData({
                          ...empData,
                          salaryBankId: event.target.value,
                          salaryBankName: selectedBank?.label || empData.salaryBankName
                        });
                      }}
                      className="w-full border border-sky-200 p-2.5 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="">Chọn ngân hàng</option>
                      {BANK_ID_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-sky-700 uppercase mb-1">Số TK</label>
                    <input
                      type="text"
                      value={empData.salaryBankAccountNumber || ''}
                      onChange={event => setEmpData({ ...empData, salaryBankAccountNumber: event.target.value.replace(/\s+/g, '') })}
                      className="w-full border border-sky-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-sky-500"
                      placeholder="Số tài khoản"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-sky-700 uppercase mb-1">Chủ tài khoản</label>
                  <input
                    type="text"
                    value={empData.salaryBankAccountName || ''}
                    onChange={event => setEmpData({ ...empData, salaryBankAccountName: event.target.value.toUpperCase() })}
                    className="w-full border border-sky-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-sky-500"
                    placeholder="Tên chủ tài khoản nhận lương"
                  />
                </div>
                {(empData.salaryBankName || empData.salaryBankAccountNumber || empData.salaryBankAccountName) && (
                  <div className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-sky-100 bg-white px-3 py-2 text-[11px] font-semibold text-sky-700">
                    <div className="min-w-0">
                      <p className="truncate">
                        {"\u0110ang l\u01b0u: "}
                        {empData.salaryBankName || empData.salaryBankId || 'Ch\u01b0a ch\u1ecdn ng\u00e2n h\u00e0ng'}
                        {" \u2022 "}
                        {empData.salaryBankAccountNumber || 'Ch\u01b0a nh\u1eadp s\u1ed1 TK'}
                      </p>
                      <p className="mt-1 truncate text-sky-600">{empData.salaryBankAccountName || 'Ch\u01b0a nh\u1eadp ch\u1ee7 TK'}</p>
                    </div>
                  </div>
                )}
              </div>

              </div>
              <div className={`mt-4 flex shrink-0 gap-2 pt-2 ${editingEmp ? 'border-t border-slate-200 bg-white px-4 pb-[calc(12px+env(safe-area-inset-bottom))]' : ''}`}>
                <button type="button" onClick={closeEmployeeEditor} className="flex-1 rounded-xl bg-gray-100 py-3 font-bold text-gray-700">Hủy</button>
                <button type="submit" disabled={isSavingEmployee} className="flex-1 rounded-xl bg-emerald-500 py-3 font-bold text-white disabled:opacity-60">{isSavingEmployee ? 'Đang xác nhận...' : 'Lưu'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
  return EmployeeView;
}
