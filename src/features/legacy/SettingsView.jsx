import React, { useState, useEffect, useRef } from "react";
import { useAppScreenBack } from "../../hooks/useAppScreenBack.js";
import { LOYALTY_ELIGIBILITY_CONDITION_DEFINITIONS, normalizeLoyaltyEligibilityConditions } from "../../utils/customerLoyaltyEligibility.js";
import { Check, ChevronRight, ChevronDown, ChevronUp, Lock, CreditCard, Wallet, Banknote, Archive, ArchiveRestore, Database, Bell, PlusCircle, Download, Gift } from "lucide-react";
import CustomerCareSettings, { CARE_RULES } from "../settings/CustomerCareSettings.jsx";
import SyncQueueStatus from "../../layout/SyncQueueStatus.jsx";
import { isVpsMode } from "@hd/hd-connect-runtime";
import CompanyBankAccounts from "../settings/CompanyBankAccounts.jsx";
// Transitional bundle boundary. Only stable local module bindings are injected;
// all actor/company/business data continues to arrive through current props.
// Generated binding contract is checked against the real source AST.
export function createSettingsView(runtime) {
  const {BANK_ID_OPTIONS,DEFAULT_CUSTOMER_CARE_SETTINGS,DEFAULT_CUSTOMER_LOYALTY_SETTINGS,DEFAULT_INVOICE_TRANSFER_PROFILE,LazyIdentitySecurityCenter,RESET_DATA_SCOPE_OPTIONS,SALARY_ADVANCE_DEPARTMENT_OPTIONS,ZaloCampaignPanel,ZaloDispatcherPanel,ZaloInboxPanel,ZaloOrderRequestPanel,buildBackupFilename,buildSalaryAdvanceSettingsForm,countBackupRecords,describeSalaryAdvanceLimitInput,formatCurrency,formatInputCurrency,getAutoBackupStateForCompany,getCustomerCareSettings,getCustomerLoyaltySettings,getFriendlyFirebaseErrorMessage,getInvoiceTransferProfile,getTodayString,getWarehouseOrderAutoCancelDays,identitySecurityApi,isOrderCodeAutoMatchEnabled,normalizeResetDateKey,parseInputCurrency,parseSalaryAdvancePercentSettingInput,readFileAsText,shareContentFile} = runtime;
  function SettingsView({
  currentUser,
  onGetIdentityToken,
  onLogout,
  isAccounting,
  employee,
  currentCompany,
  customers = [],
  products = [],
  onUpdateCompanySettings,
  onResetCompanyDemoData,
  onCreateCompanyBackup,
  onRestoreCompanyBackup,
  orders = [],
  payments = [],
  zaloSendQueue = [],
  zaloCampaigns = [],
  zaloCampaignQueue = [],
  zaloInboxMessages = [],
  zaloInboxBridgeLogs = [],
  zaloOrderRequests = [],
  aiReplyRules = [],
  onCreateZaloCampaign,
  onCancelZaloCampaign,
  onRetryZaloCampaignQueueItem,
  onProcessZaloInboxMessage,
  onSendAiZaloReply,
  onIgnoreZaloInboxMessage,
  onMarkNeedHumanZaloInboxMessage,
  onToggleCustomerAiReply,
  onSaveAiReplyRule,
  onArchiveAiReplyRule,
  onUpdateZaloOrderRequest,
  onConvertZaloOrderRequest,
  setActiveTab,
  canViewBankPayments = false,
  canEditCompanyProfile = false,
  canManageBankAccounts = false,
  canManagePaymentQr = false,
  canManageLoyaltySettings = false,
  canManageCustomerCareSettings = false,
  canManageWarehouseSettings = false,
  canConfigureSalaryAdvanceLimit = false,
  canBackupData = false,
  canRestoreData = false,
  canResetCompanyData = false
}) {
  const [showBankSettings, setShowBankSettings] = useState(false);
  const [showLoyaltySettings, setShowLoyaltySettings] = useState(false);
  const [showCustomerCareSettings, setShowCustomerCareSettings] = useState(false);
  const [showWarehouseSettings, setShowWarehouseSettings] = useState(false);
  const [showAdvanceSettings, setShowAdvanceSettings] = useState(false);
  const [showBubbleSettings, setShowBubbleSettings] = useState(false);
  const [activeSettingsPanel, setActiveSettingsPanel] = useState('');
  const [bankAccountDraft, setBankAccountDraft] = useState(null);
  const [careRuleId, setCareRuleId] = useState('');
  useAppScreenBack(() => {
    if (activeSettingsPanel === 'care' && careRuleId) {
      setCareRuleId('');
      return true;
    }
    if (activeSettingsPanel === 'account' && bankAccountDraft) {
      setBankAccountDraft(null);
      return true;
    }
    if (!activeSettingsPanel) return false;
    setActiveSettingsPanel('');
    return true;
  });
  const [selectedResetScopes, setSelectedResetScopes] = useState(() => RESET_DATA_SCOPE_OPTIONS.map(option => option.id));
  const [resetDateRange, setResetDateRange] = useState({ dateFrom: '', dateTo: '' });
  const [bankSaveStatus, setBankSaveStatus] = useState('');
  const [loyaltySaveStatus, setLoyaltySaveStatus] = useState('');
  const [isSavingLoyalty, setIsSavingLoyalty] = useState(false);
  const loyaltySaveInFlight = useRef(false);
  const [customerCareSaveStatus, setCustomerCareSaveStatus] = useState('');
  const [warehouseSaveStatus, setWarehouseSaveStatus] = useState('');
  const [advanceSaveStatus, setAdvanceSaveStatus] = useState('');
  const [bubbleSaveStatus, setBubbleSaveStatus] = useState('');
  const [backupStatus, setBackupStatus] = useState('');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [resetStatus, setResetStatus] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const backupFileInputRef = useRef(null);
  const [bankForm, setBankForm] = useState(() => {
    const profile = getInvoiceTransferProfile(currentCompany);
    return {
      bankId: profile.bankId || '',
      bankName: profile.bankName || '',
      bankAccountName: profile.accountName || '',
      bankAccountNumber: profile.accountNumber || '',
      sepayVirtualAccountNumber: profile.sepayVirtualAccountNumber || '',
      sepayUseVirtualAccount: Boolean(profile.sepayUseVirtualAccount),
      invoiceQrTemplate: profile.template || DEFAULT_INVOICE_TRANSFER_PROFILE.template,
      autoReconcileByOrderCode: isOrderCodeAutoMatchEnabled(currentCompany)
    };
  });
  const [loyaltyForm, setLoyaltyForm] = useState(() => {
    const loyaltySettings = getCustomerLoyaltySettings(currentCompany);
    return {
      customerLoyaltyEnabled: loyaltySettings.enabled,
      loyaltyEarnMode: loyaltySettings.earnMode,
      loyaltyRevenuePercent: String(loyaltySettings.revenuePercent),
      loyaltyEarnAmountPerPoint: formatInputCurrency(loyaltySettings.earnAmountPerPoint),
      loyaltyRedeemValuePerPoint: formatInputCurrency(loyaltySettings.redeemValuePerPoint),
      loyaltyEligibilityConditions: normalizeLoyaltyEligibilityConditions(loyaltySettings.eligibilityConditions)
    };
  });
  const [customerCareForm, setCustomerCareForm] = useState(() => {
    const customerCareSettings = getCustomerCareSettings(currentCompany);
    return {
      customerCareReminderEnabled: customerCareSettings.enabled,
      customerCareInactiveDays: String(customerCareSettings.inactiveDays)
    };
  });
  const [warehouseForm, setWarehouseForm] = useState(() => ({
    warehouseOrderAutoCancelDays: String(getWarehouseOrderAutoCancelDays(currentCompany) || '')
  }));
  const [advanceForm, setAdvanceForm] = useState(() => buildSalaryAdvanceSettingsForm(currentCompany));
  const [bubbleForm, setBubbleForm] = useState(() => ({
    floatingQuickActionEnabled: currentCompany?.floatingQuickActionEnabled !== false
  }));

  useEffect(() => {
    const profile = getInvoiceTransferProfile(currentCompany);
    const loyaltySettings = getCustomerLoyaltySettings(currentCompany);
    const customerCareSettings = getCustomerCareSettings(currentCompany);
    const warehouseAutoCancelDays = getWarehouseOrderAutoCancelDays(currentCompany);
    setBankForm({
      bankId: profile.bankId || '',
      bankName: profile.bankName || '',
      bankAccountName: profile.accountName || '',
      bankAccountNumber: profile.accountNumber || '',
      sepayVirtualAccountNumber: profile.sepayVirtualAccountNumber || '',
      sepayUseVirtualAccount: Boolean(profile.sepayUseVirtualAccount),
      invoiceQrTemplate: profile.template || DEFAULT_INVOICE_TRANSFER_PROFILE.template,
      autoReconcileByOrderCode: isOrderCodeAutoMatchEnabled(currentCompany)
    });
    setLoyaltyForm({
      customerLoyaltyEnabled: loyaltySettings.enabled,
      loyaltyEarnMode: loyaltySettings.earnMode,
      loyaltyRevenuePercent: String(loyaltySettings.revenuePercent),
      loyaltyEarnAmountPerPoint: formatInputCurrency(loyaltySettings.earnAmountPerPoint),
      loyaltyRedeemValuePerPoint: formatInputCurrency(loyaltySettings.redeemValuePerPoint),
      loyaltyEligibilityConditions: normalizeLoyaltyEligibilityConditions(loyaltySettings.eligibilityConditions)
    });
    setCustomerCareForm({
      customerCareReminderEnabled: customerCareSettings.enabled,
      customerCareInactiveDays: String(customerCareSettings.inactiveDays)
    });
    setWarehouseForm({
      warehouseOrderAutoCancelDays: String(warehouseAutoCancelDays || '')
    });
    setAdvanceForm(buildSalaryAdvanceSettingsForm(currentCompany));
    setBubbleForm({
      floatingQuickActionEnabled: currentCompany?.floatingQuickActionEnabled !== false
    });
    setBankSaveStatus('');
    setLoyaltySaveStatus('');
    setCustomerCareSaveStatus('');
    setWarehouseSaveStatus('');
    setAdvanceSaveStatus('');
    setBubbleSaveStatus('');
    setBackupStatus('');
    setResetStatus('');
  }, [currentCompany]);

  const hasBankConfig = Boolean(
    bankForm.bankId?.trim() &&
    bankForm.bankName?.trim() &&
    bankForm.bankAccountName?.trim() &&
    bankForm.bankAccountNumber?.trim()
  );
  const sepayEffectiveAccountNumber = bankForm.sepayUseVirtualAccount && bankForm.sepayVirtualAccountNumber?.trim()
    ? bankForm.sepayVirtualAccountNumber.trim().replace(/\s+/g, '').toUpperCase()
    : bankForm.bankAccountNumber?.trim().replace(/\s+/g, '');
  const bankAccountDescription = hasBankConfig
    ? `${bankForm.bankName || 'Ngân hàng'} • ${sepayEffectiveAccountNumber || bankForm.bankAccountNumber}${sepayEffectiveAccountNumber && sepayEffectiveAccountNumber !== bankForm.bankAccountNumber ? ' (VA)' : ''}`
    : 'QR và tài khoản nhận tiền';
  const bankStatusClasses = hasBankConfig
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-gray-100 text-gray-500 border-gray-200';
  const loyaltyStatusClasses = loyaltyForm.customerLoyaltyEnabled
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-gray-100 text-gray-500 border-gray-200';
  const loyaltyEarnPreview = parseInputCurrency(loyaltyForm.loyaltyEarnAmountPerPoint) || DEFAULT_CUSTOMER_LOYALTY_SETTINGS.earnAmountPerPoint;
  const loyaltyRedeemPreview = parseInputCurrency(loyaltyForm.loyaltyRedeemValuePerPoint) || DEFAULT_CUSTOMER_LOYALTY_SETTINGS.redeemValuePerPoint;
  const customerCareInactiveDaysPreview = Math.max(1, parseInt(customerCareForm.customerCareInactiveDays, 10) || DEFAULT_CUSTOMER_CARE_SETTINGS.inactiveDays);
  const customerCareStatusClasses = customerCareForm.customerCareReminderEnabled
    ? 'bg-sky-50 text-sky-700 border-sky-200'
    : 'bg-gray-100 text-gray-500 border-gray-200';
  const warehouseAutoCancelDaysPreview = Math.max(0, parseInt(warehouseForm.warehouseOrderAutoCancelDays, 10) || 0);
  const warehouseStatusClasses = warehouseAutoCancelDaysPreview > 0
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-gray-100 text-gray-500 border-gray-200';
  const advanceLimitPreview = describeSalaryAdvanceLimitInput(advanceForm.salaryAdvancePercent);
  const advanceLimitIsUnlimited = parseSalaryAdvancePercentSettingInput(advanceForm.salaryAdvancePercent).isUnlimited;
  const advanceStatusClasses = advanceLimitIsUnlimited
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-orange-50 text-orange-700 border-orange-200';
  const bubbleStatusClasses = bubbleForm.floatingQuickActionEnabled
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-gray-100 text-gray-500 border-gray-200';
  const canManageBankTransferSettings = Boolean(canManageBankAccounts || canManagePaymentQr);
  const canOpenBankPaymentCenter = Boolean(canViewBankPayments || canManageBankTransferSettings || isAccounting);
  const canManageSalaryAdvanceSettings = Boolean(canConfigureSalaryAdvanceLimit || isAccounting);
  const canAccessSettings = Boolean(
    currentUser ||
    isAccounting ||
    canEditCompanyProfile ||
    canManageBankTransferSettings ||
    canOpenBankPaymentCenter ||
    canManageLoyaltySettings ||
    canManageCustomerCareSettings ||
    canManageWarehouseSettings ||
    canManageSalaryAdvanceSettings ||
    canBackupData ||
    canRestoreData ||
    canResetCompanyData
  );
  const settingsPanels = [
    { id: 'security', label: 'Bảo mật tài khoản', description: 'Mật khẩu, PIN và thiết bị tin cậy', icon: Lock, enabled: Boolean(currentUser) },
    { id: 'account', label: 'Tài khoản', description: bankAccountDescription, icon: CreditCard, enabled: canManageBankTransferSettings || isAccounting },
    { id: 'bank_payments', label: 'Ngân hàng', description: 'SePay, giao dịch, đối soát', icon: Wallet, enabled: canOpenBankPaymentCenter },
    { id: 'loyalty', label: 'Tích điểm', description: loyaltyForm.customerLoyaltyEnabled ? 'Đang bật' : 'Đang tắt', icon: Gift, enabled: canManageLoyaltySettings || isAccounting },
    { id: 'care', label: 'Nhắc khách hàng', description: 'Tin nhắn tự động', icon: Bell, enabled: canManageCustomerCareSettings || isAccounting },
    { id: 'warehouse', label: 'Xu\u1ea5t kho', description: warehouseAutoCancelDaysPreview > 0 ? `T\u1ef1 \u1ea9n sau ${warehouseAutoCancelDaysPreview} ng\u00e0y` : 'Kh\u00f4ng t\u1ef1 \u1ea9n \u0111\u01a1n \u0111\u1eb7t', icon: Archive, enabled: canManageWarehouseSettings || isAccounting },
    { id: 'salary_advance', label: 'Ứng lương', description: advanceLimitPreview, icon: Banknote, enabled: canManageSalaryAdvanceSettings },
    { id: 'bubble', label: 'Bong bóng +', description: bubbleForm.floatingQuickActionEnabled ? 'Đang bật' : 'Đang tắt', icon: PlusCircle, enabled: isAccounting },
    { id: 'backup', label: 'Sao lưu/khôi phục', description: 'Xuất file hoặc nhập lại dữ liệu', icon: ArchiveRestore, enabled: canBackupData || canRestoreData || isAccounting },
    { id: 'reset', label: 'Reset dữ liệu', description: 'Xóa riêng từng phạm vi', icon: Database, enabled: canResetCompanyData || isAccounting }
  ].filter(panel => panel.enabled);
  const safeActiveSettingsPanel = settingsPanels.some(panel => panel.id === activeSettingsPanel)
    ? activeSettingsPanel
    : '';
  const settingsPageTitle = safeActiveSettingsPanel === 'care' && careRuleId
    ? CARE_RULES.find(([id]) => id === careRuleId)?.[1] || 'Nhắc khách hàng'
    : safeActiveSettingsPanel === 'account' && bankAccountDraft
    ? (bankAccountDraft.bankName || 'Tài khoản mới')
    : settingsPanels.find(panel => panel.id === safeActiveSettingsPanel)?.label || 'Cài đặt';
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('hd-settings-title', { detail: settingsPageTitle }));
    return () => window.dispatchEvent(new CustomEvent('hd-settings-title', { detail: 'Cài đặt' }));
  }, [settingsPageTitle]);
  const todayAutoBackupState = getAutoBackupStateForCompany(currentCompany?.id || '', getTodayString());
  const toggleResetScope = (scopeId) => {
    setSelectedResetScopes(prev => (
      prev.includes(scopeId)
        ? prev.filter(id => id !== scopeId)
        : [...prev, scopeId]
    ));
    setResetStatus('');
  };

  const handleBankSettingSubmit = async (event) => {
    event.preventDefault();
    if (!canManageBankTransferSettings) {
      setBankSaveStatus('Bạn chưa được cấp quyền chỉnh sửa tài khoản nhận chuyển khoản.');
      return;
    }
    const normalizedBankAccountNumber = bankForm.bankAccountNumber.trim().replace(/\s+/g, '');
    const normalizedVirtualAccountNumber = bankForm.sepayVirtualAccountNumber.trim().replace(/\s+/g, '').toUpperCase();
    const shouldUseVirtualAccount = Boolean(bankForm.sepayUseVirtualAccount && normalizedVirtualAccountNumber);
    const payload = {
      bankId: bankForm.bankId.trim().toUpperCase(),
      bankName: bankForm.bankName.trim(),
      bankAccountName: bankForm.bankAccountName.trim().toUpperCase(),
      bankAccountNumber: normalizedBankAccountNumber,
      sepayVirtualAccountNumber: normalizedVirtualAccountNumber,
      sepayUseVirtualAccount: shouldUseVirtualAccount,
      sepayReceivingAccountNumber: shouldUseVirtualAccount ? normalizedVirtualAccountNumber : normalizedBankAccountNumber,
      invoiceQrTemplate: bankForm.invoiceQrTemplate || DEFAULT_INVOICE_TRANSFER_PROFILE.template,
      autoReconcileByOrderCode: Boolean(bankForm.autoReconcileByOrderCode)
    };
    if (!payload.bankId || !payload.bankName || !payload.bankAccountName || !payload.bankAccountNumber) {
      setBankSaveStatus('Vui lòng nhập đủ mã ngân hàng, tên ngân hàng, số tài khoản và chủ tài khoản.');
      return;
    }
    const result = await onUpdateCompanySettings?.(payload);
    setBankSaveStatus(result?.success ? 'Đã lưu tài khoản nhận chuyển khoản.' : (result?.message || 'Không thể lưu tài khoản nhận chuyển khoản.'));
  };

  const handleLoyaltySettingSubmit = async (event) => {
    event.preventDefault();
    if (loyaltySaveInFlight.current) return;
    if (!canManageLoyaltySettings) {
      setLoyaltySaveStatus('Bạn chưa được cấp quyền chỉnh sửa tích điểm khách hàng.');
      return;
    }
    loyaltySaveInFlight.current = true;
    setIsSavingLoyalty(true);
    setLoyaltySaveStatus('Đang chờ máy chủ xác nhận...');
    try {
    const result = await onUpdateCompanySettings?.({
      customerLoyaltyEnabled: Boolean(loyaltyForm.customerLoyaltyEnabled),
      loyaltyEarnMode: loyaltyForm.loyaltyEarnMode === 'revenue_percent' ? 'revenue_percent' : 'fixed',
      loyaltyRevenuePercent: Math.min(100, Math.max(0, Number(loyaltyForm.loyaltyRevenuePercent) || 0)),
      loyaltyEarnAmountPerPoint: parseInputCurrency(loyaltyForm.loyaltyEarnAmountPerPoint) || DEFAULT_CUSTOMER_LOYALTY_SETTINGS.earnAmountPerPoint,
      loyaltyRedeemValuePerPoint: parseInputCurrency(loyaltyForm.loyaltyRedeemValuePerPoint) || DEFAULT_CUSTOMER_LOYALTY_SETTINGS.redeemValuePerPoint,
      loyaltyEligibilityConditions: normalizeLoyaltyEligibilityConditions(loyaltyForm.loyaltyEligibilityConditions)
    });
    setLoyaltySaveStatus(result?.success ? 'Đã lưu cài đặt tích điểm khách hàng.' : (result?.message || 'Không thể lưu cài đặt tích điểm.'));
    } catch (error) {
      setLoyaltySaveStatus(error?.code === 'firestore/sync-pending'
        ? 'Máy chủ chưa xác nhận. Cài đặt đang chờ đồng bộ; vui lòng kiểm tra kết nối mạng.'
        : getFriendlyFirebaseErrorMessage(error, 'Không thể lưu cài đặt tích điểm. Vui lòng thử lại.'));
    } finally {
      loyaltySaveInFlight.current = false;
      setIsSavingLoyalty(false);
    }
  };

  const handleCustomerCareSettingSubmit = async (event) => {
    event.preventDefault();
    if (!canManageCustomerCareSettings) {
      setCustomerCareSaveStatus('Bạn chưa được cấp quyền cài nhắc chăm sóc khách hàng.');
      return;
    }
    const inactiveDays = Math.max(1, parseInt(customerCareForm.customerCareInactiveDays, 10) || DEFAULT_CUSTOMER_CARE_SETTINGS.inactiveDays);
    const result = await onUpdateCompanySettings?.({
      customerCareReminderEnabled: Boolean(customerCareForm.customerCareReminderEnabled),
      customerCareInactiveDays: inactiveDays
    });
    setCustomerCareSaveStatus(result?.success ? 'Đã lưu cài đặt nhắc chăm sóc khách hàng.' : (result?.message || 'Không thể lưu cài đặt nhắc chăm sóc.'));
  };

  const handleWarehouseSettingSubmit = async (event) => {
    event.preventDefault();
    if (!canManageWarehouseSettings) {
      setWarehouseSaveStatus('B\u1ea1n ch\u01b0a \u0111\u01b0\u1ee3c c\u1ea5p quy\u1ec1n c\u00e0i \u0111\u1eb7t xu\u1ea5t kho.');
      return;
    }
    const autoCancelDays = Math.max(0, parseInt(warehouseForm.warehouseOrderAutoCancelDays, 10) || 0);
    const result = await onUpdateCompanySettings?.({
      warehouseOrderAutoCancelDays: autoCancelDays
    });
    setWarehouseSaveStatus(result?.success ? '\u0110\u00e3 l\u01b0u c\u00e0i \u0111\u1eb7t t\u1ef1 \u1ea9n \u0111\u01a1n \u0111\u1eb7t.' : (result?.message || 'Kh\u00f4ng th\u1ec3 l\u01b0u c\u00e0i \u0111\u1eb7t xu\u1ea5t kho.'));
  };

  const handleAdvanceSettingSubmit = async (event) => {
    event.preventDefault();
    if (!canManageSalaryAdvanceSettings) {
      setAdvanceSaveStatus('Bạn chưa được cấp quyền cấu hình ứng lương.');
      return;
    }
    const companyLimit = parseSalaryAdvancePercentSettingInput(advanceForm.salaryAdvancePercent);
    if (companyLimit.invalid) {
      setAdvanceSaveStatus('Vui lòng nhập % mặc định hợp lệ, hoặc bỏ trống để không giới hạn.');
      return;
    }
    const nextPercentByDepartment = {};
    for (const department of SALARY_ADVANCE_DEPARTMENT_OPTIONS) {
      const parsed = parseSalaryAdvancePercentSettingInput(advanceForm.salaryAdvancePercentByDepartment?.[department.key]);
      if (parsed.invalid) {
        setAdvanceSaveStatus(`% ứng của ${department.label} chưa hợp lệ.`);
        return;
      }
      nextPercentByDepartment[department.key] = parsed.percent;
    }
    const result = await onUpdateCompanySettings?.({
      salaryAdvancePercent: companyLimit.percent,
      salaryAdvancePercentByDepartment: nextPercentByDepartment
    });
    setAdvanceSaveStatus(result?.success
      ? 'Đã lưu cấu hình ứng lương. Bỏ trống nghĩa là nhân viên được nhập số tiền muốn ứng và chờ duyệt.'
      : (result?.message || 'Không thể lưu cấu hình ứng lương.'));
  };

  const handleBubbleSettingSubmit = async (event) => {
    event.preventDefault();
    if (!isAccounting) {
      setBubbleSaveStatus('Bạn chưa được cấp quyền cài đặt bong bóng +.');
      return;
    }
    const result = await onUpdateCompanySettings?.({
      floatingQuickActionEnabled: Boolean(bubbleForm.floatingQuickActionEnabled)
    });
    setBubbleSaveStatus(result?.success ? 'Đã lưu cài đặt bong bóng +.' : (result?.message || 'Không thể lưu cài đặt bong bóng +.'));
  };

  const handleCreateBackupFile = async () => {
    if (!canBackupData) {
      setBackupStatus('Bạn chưa được cấp quyền sao lưu dữ liệu.');
      return;
    }
    try {
      setIsBackingUp(true);
      setBackupStatus('');
      const result = await onCreateCompanyBackup?.();
      if (!result?.success || !result.backup) {
        setBackupStatus(result?.message || 'Không thể tạo file sao lưu.');
        return;
      }
      const shareResult = await shareContentFile({
        filename: result.filename || buildBackupFilename(currentCompany?.name || 'HD Manager'),
        content: JSON.stringify(result.backup, null, 2),
        mimeType: 'application/json;charset=utf-8',
        title: 'Sao lưu HD Manager',
        text: 'File sao lưu dữ liệu HD Manager',
        dialogTitle: 'Lưu hoặc chia sẻ file sao lưu'
      });
      if (shareResult.status === 'shared') {
        setBackupStatus(`Đã tạo file sao lưu ${result.count || 0} bản ghi và mở bảng chia sẻ.`);
      } else if (shareResult.status === 'saved') {
        setBackupStatus(`Đã lưu file sao lưu ${result.count || 0} bản ghi trong thư mục HDManager.`);
      } else if (shareResult.status === 'downloaded') {
        setBackupStatus(`Đã tải file sao lưu ${result.count || 0} bản ghi về máy.`);
      } else if (shareResult.status === 'cancelled') {
        setBackupStatus('Đã tạo file sao lưu nhưng bạn đã hủy chia sẻ.');
      } else {
        setBackupStatus('Không thể xuất file sao lưu trên thiết bị này.');
      }
    } catch (error) {
      setBackupStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể tạo file sao lưu.'));
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestoreBackupFile = async (event) => {
    const file = event.target.files?.[0];
    if (event.target) event.target.value = '';
    if (!file) return;
    if (!canRestoreData) {
      setBackupStatus('Bạn chưa được cấp quyền khôi phục dữ liệu.');
      return;
    }

    try {
      setIsRestoringBackup(true);
      setBackupStatus('');
      const rawText = await readFileAsText(file);
      const parsedBackup = JSON.parse(rawText);
      const recordCount = countBackupRecords(parsedBackup);
      if (recordCount <= 0) {
        setBackupStatus('File sao lưu không có dữ liệu để khôi phục.');
        return;
      }
      const confirmed = window.confirm(`Khôi phục ${recordCount} bản ghi từ file sao lưu này? Dữ liệu trùng ID sẽ được cập nhật, dữ liệu hiện có không bị xóa.`);
      if (!confirmed) {
        setBackupStatus('Đã hủy khôi phục dữ liệu.');
        return;
      }
      const result = await onRestoreCompanyBackup?.(parsedBackup);
      setBackupStatus(result?.message || (result?.success ? 'Đã khôi phục dữ liệu.' : 'Không thể khôi phục dữ liệu.'));
    } catch (error) {
      setBackupStatus(getFriendlyFirebaseErrorMessage(error, 'File sao lưu không hợp lệ hoặc không thể khôi phục.'));
    } finally {
      setIsRestoringBackup(false);
    }
  };

  const handleResetDemoData = async () => {
    if (!canResetCompanyData) {
      setResetStatus('Bạn chưa được cấp quyền reset dữ liệu.');
      return;
    }
    if (selectedResetScopes.length === 0) {
      setResetStatus('Vui lòng chọn ít nhất một phạm vi dữ liệu cần reset.');
      return;
    }
    const selectedLabels = RESET_DATA_SCOPE_OPTIONS
      .filter(option => selectedResetScopes.includes(option.id))
      .map(option => option.label)
      .join(', ');
    const normalizedResetDateFrom = normalizeResetDateKey(resetDateRange.dateFrom);
    const normalizedResetDateTo = normalizeResetDateKey(resetDateRange.dateTo);
    if (normalizedResetDateFrom && normalizedResetDateTo && normalizedResetDateFrom > normalizedResetDateTo) {
      setResetStatus('Khoảng thời gian reset chưa hợp lệ.');
      return;
    }
    const resetDateText = normalizedResetDateFrom || normalizedResetDateTo
      ? ` trong khoảng ${normalizedResetDateFrom || 'đầu'} đến ${normalizedResetDateTo || 'nay'}`
      : '';
    const firstConfirm = window.confirm(`Reset sẽ chỉ xóa các phạm vi đã chọn: ${selectedLabels}${resetDateText}. Tài khoản nhân sự và cài đặt doanh nghiệp vẫn được giữ lại. Bạn có muốn tiếp tục không?`);
    if (!firstConfirm) return;
    const secondConfirm = window.confirm(`Xác nhận lần cuối: ${selectedLabels}${resetDateText} sẽ bị xóa và không thể hoàn tác. Bạn vẫn muốn reset chứ?`);
    if (!secondConfirm) return;

    try {
      setIsResetting(true);
      setResetStatus('');
      const result = await onResetCompanyDemoData?.(selectedResetScopes, {
        dateFrom: normalizedResetDateFrom,
        dateTo: normalizedResetDateTo
      });
      setResetStatus(result?.message || (result?.success ? 'Đã reset dữ liệu.' : 'Không thể reset dữ liệu.'));
    } catch (error) {
      setResetStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể reset dữ liệu.'));
    } finally {
      setIsResetting(false);
    }
  };

  if (!canAccessSettings) {
    return <div className="p-4 text-center text-sm text-gray-500">Bạn không có quyền truy cập mục cài đặt.</div>;
  }

  if (!safeActiveSettingsPanel) return (
    <div data-settings-page="menu" className="divide-y divide-gray-200 bg-white pb-20">
          <SyncQueueStatus />
          {settingsPanels.map((panel) => {
            const PanelIcon = panel.icon;
            return (
              <button
                key={panel.id}
                type="button"
                onClick={() => {
                  if (panel.id === 'bank_payments') {
                    setActiveTab?.('bank_payments');
                    return;
                  }
                  setShowBankSettings(true);
                  setShowLoyaltySettings(true);
                  setShowCustomerCareSettings(true);
                  setShowWarehouseSettings(true);
                  setShowAdvanceSettings(true);
                  setShowBubbleSettings(true);
                  setActiveSettingsPanel(panel.id);
                }}
                className="flex w-full items-center gap-3 px-3 py-4 text-left text-gray-800 hover:bg-gray-50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center text-emerald-600">
                  <PanelIcon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{panel.label}</span>
                  <span className="mt-1 block text-xs text-gray-500">{panel.description}</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-gray-400" />
              </button>
            );
          })}
    </div>
  );

  return (
    <div data-settings-page={safeActiveSettingsPanel} className="space-y-4 pb-20 [&>section]:rounded-none [&>section]:border-0 [&>section]:shadow-none">

      {safeActiveSettingsPanel === 'security' && <React.Suspense fallback={<div aria-busy="true">Đang tải...</div>}><LazyIdentitySecurityCenter standalone identityApi={identitySecurityApi} identityUser={currentUser} vpsMode={isVpsMode} onGetIdentityToken={onGetIdentityToken} onLogout={onLogout} /></React.Suspense>}
      {safeActiveSettingsPanel === 'account' && <CompanyBankAccounts company={currentCompany} banks={BANK_ID_OPTIONS} canEdit={canManageBankTransferSettings} onSave={onUpdateCompanySettings} draft={bankAccountDraft} setDraft={setBankAccountDraft} />}


      {safeActiveSettingsPanel === 'loyalty' && <section className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm hd-soft-red-outline">
        <div className="flex min-h-16 items-center justify-between gap-4 border-b border-gray-200 pb-3">
          <span id="loyalty-status-label" className="text-sm font-bold text-gray-800">Trạng thái</span>
          <button type="button" role="switch" aria-labelledby="loyalty-status-label" aria-checked={loyaltyForm.customerLoyaltyEnabled} disabled={!canManageLoyaltySettings && !isAccounting} onClick={() => setLoyaltyForm(prev => ({ ...prev, customerLoyaltyEnabled: !prev.customerLoyaltyEnabled }))} className="loyalty-power-switch" data-on={loyaltyForm.customerLoyaltyEnabled}>
            <span className="loyalty-power-switch__label" aria-hidden="true">{loyaltyForm.customerLoyaltyEnabled ? 'Bật' : 'Tắt'}</span>
            <span className="loyalty-power-switch__thumb" aria-hidden="true" />
          </button>
        </div>
        {showLoyaltySettings && (
          <form onSubmit={handleLoyaltySettingSubmit} className="mt-4 space-y-3">
            <label className="block text-xs font-bold text-gray-700">Kiểu tích điểm
              <select value={loyaltyForm.loyaltyEarnMode || 'fixed'} onChange={event => setLoyaltyForm(prev => ({ ...prev, loyaltyEarnMode: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-3 text-sm">
                <option value="fixed">Số tiền đổi điểm</option><option value="revenue_percent">% doanh thu đổi điểm</option>
              </select>
            </label>
            {loyaltyForm.loyaltyEarnMode === 'revenue_percent' && <label className="block text-xs font-bold text-gray-700">Tỷ lệ thưởng trên doanh thu đơn hàng (%)
              <input aria-label="Tỷ lệ tích điểm theo doanh thu" type="number" min="0" max="100" step="0.01" value={loyaltyForm.loyaltyRevenuePercent} onChange={event => setLoyaltyForm(prev => ({ ...prev, loyaltyRevenuePercent: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 p-3 text-sm" />
            </label>}

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-gray-500">Tiền để được 1 điểm</span>
                <input
                  type="tel"
                  value={loyaltyForm.loyaltyEarnAmountPerPoint}
                  onChange={(event) => setLoyaltyForm(prev => ({ ...prev, loyaltyEarnAmountPerPoint: formatInputCurrency(event.target.value) }))}
                  className="w-full rounded-xl border border-gray-300 p-3 text-sm font-bold text-amber-700 outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="100.000"
                />
                <p className="mt-1 text-[9px] leading-3 font-normal text-gray-500">Số {formatCurrency(loyaltyEarnPreview)} vnd đổi 1 tích điểm</p>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-gray-500">1 điểm quy đổi</span>
                <input
                  type="tel"
                  value={loyaltyForm.loyaltyRedeemValuePerPoint}
                  onChange={(event) => setLoyaltyForm(prev => ({ ...prev, loyaltyRedeemValuePerPoint: formatInputCurrency(event.target.value) }))}
                  className="w-full rounded-xl border border-gray-300 p-3 text-sm font-bold text-amber-700 outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="1.000"
                />
                <p className="mt-1 text-[9px] leading-3 font-normal text-gray-500">1 tích điểm đổi số {formatCurrency(loyaltyRedeemPreview)} vnd</p>
              </label>
            </div>

            <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-3">
              <div>
                <p className="text-sm font-bold text-amber-950">Điều kiện nhận tích điểm</p>
                <p className="mt-1 text-xs leading-5 text-amber-800">
                  Chỉ cộng điểm cho đơn đáp ứng toàn bộ điều kiện đang chọn. Không chọn điều kiện nào sẽ giữ cách tích điểm hiện tại.
                </p>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {LOYALTY_ELIGIBILITY_CONDITION_DEFINITIONS.map((condition) => {
                  const conditions = normalizeLoyaltyEligibilityConditions(loyaltyForm.loyaltyEligibilityConditions);
                  const selected = conditions[condition.id] === true;
                  return (
                    <button
                      key={condition.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setLoyaltyForm((previous) => {
                          const previousConditions = normalizeLoyaltyEligibilityConditions(previous.loyaltyEligibilityConditions);
                          return {
                            ...previous,
                            loyaltyEligibilityConditions: {
                              ...previousConditions,
                              [condition.id]: !previousConditions[condition.id]
                            }
                          };
                        });
                      }}
                      className={`flex min-h-12 items-start gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${selected
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                        : 'border-white bg-white/80 text-slate-700 hover:border-emerald-200'}`}
                    >
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs font-black ${selected
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-300 bg-white text-transparent'}`}
                      >
                        ✓
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold">{condition.label}</span>
                        <span className="mt-0.5 block text-xs leading-4 opacity-75">{condition.customerDescription}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {loyaltySaveStatus && (
              <div role="status" aria-live="polite" className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                {loyaltySaveStatus}
              </div>
            )}

            <button type="submit" disabled={isSavingLoyalty || !canManageLoyaltySettings} aria-busy={isSavingLoyalty} className="w-full rounded-xl bg-amber-500 py-3.5 text-sm font-black text-white shadow-md shadow-amber-500/20 disabled:opacity-60">
              {isSavingLoyalty ? 'Đang lưu...' : 'Lưu'}
            </button>
          </form>
        )}
      </section>}

{safeActiveSettingsPanel === 'care' && <CustomerCareSettings company={currentCompany} selected={careRuleId} onSelect={setCareRuleId} onSave={onUpdateCompanySettings} canEdit={canManageCustomerCareSettings} />}

      {safeActiveSettingsPanel === 'warehouse' && <section className="rounded-3xl border border-amber-100 bg-white p-4 shadow-sm hd-soft-red-outline">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <Archive size={21} />
            </div>
            <div>
              <h3 className="text-lg font-black text-gray-900">{'C\u00e0i \u0111\u1eb7t xu\u1ea5t kho'}</h3>
              <p className="mt-1 text-xs text-gray-500">{'C\u00e0i s\u1ed1 ng\u00e0y gi\u1eef \u0111\u01a1n \u0111\u1eb7t trong danh s\u00e1ch \u0111\u00f3ng h\u00e0ng. Qu\u00e1 s\u1ed1 ng\u00e0y n\u00e0y app s\u1ebd t\u1ef1 \u1ea9n kh\u1ecfi ph\u1ea7n \u0111\u1ed1i chi\u1ebfu.'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowWarehouseSettings(prev => !prev)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 shadow-sm"
          >
            {showWarehouseSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showWarehouseSettings ? '\u0110\u00f3ng' : 'M\u1edf'}
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wide text-gray-400">{'Tr\u1ea1ng th\u00e1i'}</p>
              <p className="mt-1 text-sm font-bold text-gray-900">
                {warehouseAutoCancelDaysPreview > 0 ? `T\u1ef1 \u1ea9n \u0111\u01a1n \u0111\u1eb7t sau ${warehouseAutoCancelDaysPreview} ng\u00e0y` : 'Kh\u00f4ng t\u1ef1 \u1ea9n \u0111\u01a1n \u0111\u1eb7t'}
              </p>
              <p className="mt-1 text-xs text-gray-500">{'C\u00e0i \u1edf \u0111\u00e2y s\u1ebd \u00e1p d\u1ee5ng cho ph\u1ea7n phi\u1ebfu xu\u1ea5t kho tr\u00ean to\u00e0n h\u1ec7 th\u1ed1ng.'}</p>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${warehouseStatusClasses}`}>
              {warehouseAutoCancelDaysPreview > 0 ? `${warehouseAutoCancelDaysPreview} ng\u00e0y` : 'T\u1eaft'}
            </span>
          </div>
        </div>

        {showWarehouseSettings && (
          <form onSubmit={handleWarehouseSettingSubmit} className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-gray-500">{'T\u1ef1 \u1ea9n sau bao nhi\u00eau ng\u00e0y'}</span>
              <div className="flex items-center overflow-hidden rounded-xl border border-amber-200 bg-amber-50">
                <input
                  type="tel"
                  disabled={!canManageWarehouseSettings}
                  value={warehouseForm.warehouseOrderAutoCancelDays}
                  onChange={(event) => setWarehouseForm(prev => ({
                    ...prev,
                    warehouseOrderAutoCancelDays: event.target.value.replace(/[^\d]/g, '')
                  }))}
                  className="min-w-0 flex-1 bg-transparent p-3 text-center text-sm font-black text-amber-800 outline-none disabled:bg-gray-100"
                  placeholder="0"
                />
                <span className="pr-3 text-xs font-black text-amber-700">{'ng\u00e0y'}</span>
              </div>
              <span className="mt-2 block text-xs font-bold text-gray-500">{'Nh\u1eadp 0 n\u1ebfu kh\u00f4ng mu\u1ed1n t\u1ef1 \u1ea9n \u0111\u01a1n \u0111\u1eb7t.'}</span>
            </label>

            {warehouseSaveStatus && (
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                {warehouseSaveStatus}
              </div>
            )}

            <button
              type="submit"
              disabled={!canManageWarehouseSettings}
              className="w-full rounded-xl bg-amber-500 py-3.5 text-sm font-black text-white shadow-md shadow-amber-500/20 disabled:opacity-60"
            >
              {'L\u01b0u c\u00e0i \u0111\u1eb7t xu\u1ea5t kho'}
            </button>
          </form>
        )}
      </section>}

      {safeActiveSettingsPanel === 'salary_advance' && <section className="rounded-3xl border border-orange-100 bg-white p-4 shadow-sm hd-soft-red-outline">
        <div className="flex min-h-16 items-center justify-between gap-4 border-b border-gray-200 pb-3">
          <span id="advance-config-label" className="text-sm font-bold text-gray-800">Cấu hình</span>
          <button
            type="button"
            role="switch"
            aria-labelledby="advance-config-label"
            aria-checked={showAdvanceSettings}
            aria-controls="advance-config-form"
            onClick={() => setShowAdvanceSettings(prev => !prev)}
            className="loyalty-power-switch"
            data-on={showAdvanceSettings}
          >
            <span className="loyalty-power-switch__label" aria-hidden="true">{showAdvanceSettings ? 'Bật' : 'Tắt'}</span>
            <span className="loyalty-power-switch__thumb" aria-hidden="true" />
          </button>
        </div>

        {showAdvanceSettings && (
          <form id="advance-config-form" onSubmit={handleAdvanceSettingSubmit} className="mt-4 space-y-4">
            <label className="block rounded-2xl border border-orange-100 bg-orange-50/70 p-3">
              <span className="mb-2 block text-xs font-black uppercase text-orange-700">Mặc định toàn công ty (%)</span>
              <input
                type="tel"
                inputMode="decimal"
                disabled={!canManageSalaryAdvanceSettings}
                value={advanceForm.salaryAdvancePercent}
                onChange={(event) => setAdvanceForm(prev => ({
                  ...prev,
                  salaryAdvancePercent: event.target.value.replace(/[^\d,.]/g, '')
                }))}
                className="w-full rounded-xl border border-orange-200 bg-white p-3 text-center text-sm font-black text-orange-800 outline-none focus:ring-2 focus:ring-orange-400 disabled:bg-gray-100"
                placeholder="Bỏ trống = không giới hạn"
              />
              <span className="mt-2 block text-xs font-bold text-orange-700">
                {describeSalaryAdvanceLimitInput(advanceForm.salaryAdvancePercent)}
              </span>
            </label>

            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-gray-500">Theo bộ phận</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {SALARY_ADVANCE_DEPARTMENT_OPTIONS.map(department => (
                  <label key={department.key} className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                    <span className="mb-2 block text-xs font-black text-gray-700">{department.label}</span>
                    <div className="flex items-center overflow-hidden rounded-xl border border-gray-200 bg-white">
                      <input
                        type="tel"
                        inputMode="decimal"
                        disabled={!canManageSalaryAdvanceSettings}
                        value={advanceForm.salaryAdvancePercentByDepartment?.[department.key] ?? ''}
                        onChange={(event) => {
                          const nextValue = event.target.value.replace(/[^\d,.]/g, '');
                          setAdvanceForm(prev => ({
                            ...prev,
                            salaryAdvancePercentByDepartment: {
                              ...(prev.salaryAdvancePercentByDepartment || {}),
                              [department.key]: nextValue
                            }
                          }));
                        }}
                        className="min-w-0 flex-1 bg-transparent p-3 text-center text-sm font-black text-gray-900 outline-none disabled:bg-gray-100"
                        placeholder="Không giới hạn"
                      />
                      <span className="pr-3 text-xs font-black text-gray-400">%</span>
                    </div>
                    <span className="mt-2 block text-[11px] font-bold text-gray-500">
                      {describeSalaryAdvanceLimitInput(advanceForm.salaryAdvancePercentByDepartment?.[department.key])}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {advanceSaveStatus && (
              <div className="rounded-xl border border-orange-100 bg-orange-50 px-3 py-2 text-xs font-bold text-orange-700">
                {advanceSaveStatus}
              </div>
            )}

            <button
              type="submit"
              disabled={!canManageSalaryAdvanceSettings}
              className="w-full rounded-xl bg-orange-500 py-3.5 text-sm font-black text-white shadow-md shadow-orange-500/20 disabled:opacity-60"
            >
              Lưu
            </button>
          </form>
        )}
      </section>}

      {safeActiveSettingsPanel === 'bubble' && <section className="rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm hd-soft-red-outline">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <PlusCircle size={21} />
            </div>
            <div>
              <h3 className="text-lg font-black text-gray-900">Bong bóng thao tác nhanh</h3>
              <p className="mt-1 text-xs text-gray-500">Bật hoặc tắt nút + nổi trên toàn bộ app. Quyền vai trò vẫn được ưu tiên riêng cho từng tài khoản.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowBubbleSettings(prev => !prev)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 shadow-sm"
          >
            {showBubbleSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showBubbleSettings ? 'Đóng' : 'Mở'}
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wide text-gray-400">Trạng thái</p>
              <p className="mt-1 text-sm font-bold text-gray-900">
                {bubbleForm.floatingQuickActionEnabled ? 'Đang bật bong bóng +' : 'Đang tắt bong bóng +'}
              </p>
              <p className="mt-1 text-xs text-gray-500">Nếu tắt ở đây, mọi tài khoản trong công ty sẽ không thấy nút bong bóng.</p>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${bubbleStatusClasses}`}>
              {bubbleForm.floatingQuickActionEnabled ? 'Bật' : 'Tắt'}
            </span>
          </div>
        </div>

        {showBubbleSettings && (
          <form onSubmit={handleBubbleSettingSubmit} className="mt-4 space-y-3">
            <button
              type="button"
              onClick={() => {
                setBubbleForm(prev => ({
                  ...prev,
                  floatingQuickActionEnabled: !prev.floatingQuickActionEnabled
                }));
                setBubbleSaveStatus('');
              }}
              className={`flex w-full items-center justify-between rounded-2xl border p-3 text-left transition ${
                bubbleForm.floatingQuickActionEnabled
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-gray-200 bg-gray-50 text-gray-600'
              }`}
            >
              <span>
                <span className="block text-sm font-black">Hiển thị bong bóng +</span>
                <span className="mt-1 block text-xs font-bold opacity-75">
                  {bubbleForm.floatingQuickActionEnabled ? 'Người có quyền vai trò sẽ thấy nút này.' : 'Ẩn hoàn toàn nút bong bóng trên app.'}
                </span>
              </span>
              <span className={`relative h-7 w-12 rounded-full transition ${bubbleForm.floatingQuickActionEnabled ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${bubbleForm.floatingQuickActionEnabled ? 'left-6' : 'left-1'}`} />
              </span>
            </button>

            {bubbleSaveStatus && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                {bubbleSaveStatus}
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-black text-white shadow-md shadow-emerald-500/20"
            >
              Lưu cài đặt bong bóng
            </button>
          </form>
        )}
      </section>}

      {safeActiveSettingsPanel === 'zalo_dispatcher' && (
        <ZaloDispatcherPanel
          currentCompany={currentCompany}
          customers={customers}
          orders={orders}
          zaloSendQueue={zaloSendQueue}
          zaloCampaigns={zaloCampaigns}
          zaloCampaignQueue={zaloCampaignQueue}
          zaloInboxMessages={zaloInboxMessages}
          zaloInboxBridgeLogs={zaloInboxBridgeLogs}
          onProcessZaloInboxMessage={onProcessZaloInboxMessage}
          onUpdateCompanySettings={onUpdateCompanySettings}
        />
      )}

      {safeActiveSettingsPanel === 'zalo_inbox' && (
        <ZaloInboxPanel
          currentCompany={currentCompany}
          employee={employee}
          customers={customers}
          products={products}
          orders={orders}
          payments={payments}
          zaloInboxMessages={zaloInboxMessages}
          aiReplyRules={aiReplyRules}
          onUpdateCompanySettings={onUpdateCompanySettings}
          onProcessMessage={onProcessZaloInboxMessage}
          onSendReply={onSendAiZaloReply}
          onIgnoreMessage={onIgnoreZaloInboxMessage}
          onMarkNeedHuman={onMarkNeedHumanZaloInboxMessage}
          onToggleCustomerAiReply={onToggleCustomerAiReply}
          onSaveAiReplyRule={onSaveAiReplyRule}
          onArchiveAiReplyRule={onArchiveAiReplyRule}
        />
      )}

      {safeActiveSettingsPanel === 'zalo_order_requests' && (
        <ZaloOrderRequestPanel
          employee={employee}
          customers={customers}
          products={products}
          zaloInboxMessages={zaloInboxMessages}
          zaloOrderRequests={zaloOrderRequests}
          onUpdateRequest={onUpdateZaloOrderRequest}
          onConvertRequest={onConvertZaloOrderRequest}
        />
      )}

      {safeActiveSettingsPanel === 'zalo_campaigns' && (
        <ZaloCampaignPanel
          currentCompany={currentCompany}
          employee={employee}
          customers={customers}
          products={products}
          zaloCampaigns={zaloCampaigns}
          zaloCampaignQueue={zaloCampaignQueue}
          onCreateCampaign={onCreateZaloCampaign}
          onCancelCampaign={onCancelZaloCampaign}
          onRetryQueueItem={onRetryZaloCampaignQueueItem}
        />
      )}

      {safeActiveSettingsPanel === 'backup' && <section className="rounded-3xl border border-sky-100 bg-white p-4 shadow-sm hd-soft-red-outline">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
            <ArchiveRestore size={21} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black text-gray-900">Sao lưu / Khôi phục</h3>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              Tạo file sao lưu toàn bộ dữ liệu công ty để cất riêng. Khi khôi phục, app chỉ thêm hoặc cập nhật dữ liệu trùng ID, không tự xóa dữ liệu hiện có.
            </p>
            <div className={`mt-3 rounded-xl border px-3 py-2 text-xs font-bold ${
              todayAutoBackupState?.status === 'saved'
                ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                : todayAutoBackupState?.status === 'failed'
                  ? 'border-red-100 bg-red-50 text-red-700'
                  : 'border-amber-100 bg-amber-50 text-amber-700'
            }`}>
              {todayAutoBackupState?.status === 'saved'
                ? `Tự động hằng ngày: đã sao lưu hôm nay (${todayAutoBackupState.recordCount || 0} bản ghi).`
                : todayAutoBackupState?.status === 'manual_required'
                  ? 'Tự động hằng ngày: thiết bị này không cho ghi file nền, hãy bấm Sao lưu thủ công.'
                  : todayAutoBackupState?.status === 'failed'
                    ? `Tự động hằng ngày: ${todayAutoBackupState.message || 'chưa sao lưu được hôm nay.'}`
                    : 'Tự động hằng ngày: sẽ chạy sau khi app mở và tải xong dữ liệu.'}
            </div>
            <input
              ref={backupFileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleRestoreBackupFile}
              className="hidden"
            />
            {backupStatus && (
              <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700">
                {backupStatus}
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleCreateBackupFile}
                disabled={isBackingUp || isRestoringBackup}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-3 py-3 text-sm font-black text-white shadow-md shadow-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download size={16} />
                {isBackingUp ? 'Đang sao lưu...' : 'Sao lưu'}
              </button>
              <button
                type="button"
                onClick={() => backupFileInputRef.current?.click()}
                disabled={isBackingUp || isRestoringBackup}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm font-black text-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ArchiveRestore size={16} />
                {isRestoringBackup ? 'Đang khôi phục...' : 'Khôi phục'}
              </button>
            </div>
          </div>
        </div>
      </section>}

      {safeActiveSettingsPanel === 'reset' && <section className="rounded-3xl border border-red-100 bg-white p-4 shadow-sm hd-soft-red-outline">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <Database size={21} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-black text-gray-900">Reset dữ liệu</h3>
            <p className="mt-1 text-xs text-gray-500">Xóa dữ liệu demo/vận hành để bắt đầu mới hoàn toàn. Tài khoản nhân sự và cài đặt công ty vẫn được giữ lại.</p>
            <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-black uppercase text-red-700">Chọn phạm vi reset</p>
                <button
                  type="button"
                  onClick={() => setSelectedResetScopes(prev => (
                    prev.length === RESET_DATA_SCOPE_OPTIONS.length ? [] : RESET_DATA_SCOPE_OPTIONS.map(option => option.id)
                  ))}
                  className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-red-600 shadow-sm"
                >
                  {selectedResetScopes.length === RESET_DATA_SCOPE_OPTIONS.length ? 'Bỏ chọn' : 'Chọn tất cả'}
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {RESET_DATA_SCOPE_OPTIONS.map((scope) => {
                  const checked = selectedResetScopes.includes(scope.id);
                  return (
                    <button
                      key={scope.id}
                      type="button"
                      onClick={() => toggleResetScope(scope.id)}
                      className={`rounded-2xl border px-3 py-2.5 text-left transition ${checked ? 'border-red-300 bg-white text-red-700 shadow-sm' : 'border-red-100 bg-red-50/50 text-red-400'}`}
                    >
                      <span className="flex items-start gap-2">
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border ${checked ? 'border-red-400 bg-red-500 text-white' : 'border-red-200 bg-white'}`}>
                          {checked && <Check size={13} />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[12px] font-black leading-4">{scope.label}</span>
                          {scope.description && (
                            <span className={`mt-1 block text-[10px] font-bold leading-4 ${checked ? 'text-red-500' : 'text-red-300'}`}>
                              {scope.description}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 rounded-2xl border border-red-100 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-red-700">Thời gian cần xóa</p>
                  <button
                    type="button"
                    onClick={() => {
                      setResetDateRange({ dateFrom: '', dateTo: '' });
                      setResetStatus('');
                    }}
                    className="rounded-full bg-red-50 px-3 py-1 text-[10px] font-black text-red-600"
                  >
                    Toàn bộ
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-black uppercase text-gray-400">Từ ngày</span>
                    <input
                      type="date"
                      value={resetDateRange.dateFrom}
                      onChange={(event) => {
                        setResetDateRange(prev => ({ ...prev, dateFrom: event.target.value }));
                        setResetStatus('');
                      }}
                      className="w-full rounded-2xl border border-red-100 bg-red-50/40 px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-red-300 focus:bg-white"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-black uppercase text-gray-400">Đến ngày</span>
                    <input
                      type="date"
                      value={resetDateRange.dateTo}
                      onChange={(event) => {
                        setResetDateRange(prev => ({ ...prev, dateTo: event.target.value }));
                        setResetStatus('');
                      }}
                      className="w-full rounded-2xl border border-red-100 bg-red-50/40 px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-red-300 focus:bg-white"
                    />
                  </label>
                </div>
                <p className="mt-2 text-[10px] font-bold leading-4 text-red-400">
                  Để trống thời gian nếu muốn xóa toàn bộ phạm vi đã chọn. Khi chọn ngày, app chỉ xóa bản ghi có ngày nằm trong khoảng đó.
                </p>
              </div>
            </div>
            {resetStatus && (
              <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                {resetStatus}
              </div>
            )}
            <button
              type="button"
              onClick={handleResetDemoData}
              disabled={isResetting}
              className="mt-4 w-full rounded-xl bg-red-600 py-3.5 text-sm font-black text-white shadow-md shadow-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isResetting ? 'Đang reset dữ liệu...' : 'Reset dữ liệu'}
            </button>
          </div>
        </div>
      </section>}
    </div>
  );
}
  return SettingsView;
}
