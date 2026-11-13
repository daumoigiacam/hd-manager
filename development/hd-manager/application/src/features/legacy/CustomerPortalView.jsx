import InstantHome,{InstantHomeNavigation} from '../../layout/InstantHome.jsx';
import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { filterCustomerVisibleProducts, isCustomerVisibleProduct } from "../../utils/customerProductVisibility.js";
import { buildVietQrBankAppDeeplink, isVietQrBankAppSupported, launchBankPaymentAndCopyReference, resolveVietQrBankAppId } from "../../utils/bankAppDeeplink.js";
import { buildCustomerSupportConversationId, getCustomerMessagingEmployeeId } from "../../utils/employeeScopedCustomerMessaging.js";
import { buildCustomerInboxConversations, getCustomerInboxItemTimestamp, getUnreadCustomerInboxItems, isCustomerScopedMessage, isCustomerScopedNotification } from "../../utils/customerMessaging.js";
import { getCustomerPortalLineConversion, getCustomerPortalOrderLines as mapCustomerPortalOrderLines, getCustomerPortalOrderSelection, getCustomerPortalOrderTotal as getMappedCustomerPortalOrderTotal, resolveCustomerPortalOrderSelection } from "../../utils/customerPortalOrderDetail.js";
import { useCallback } from "react";
import { buildCustomerProductBillingSnapshot, isSameBillingUnit, resolveCustomerProductActualUnit, resolveTransactionBillingSnapshot } from "../../services/customerProductBilling.js";
import { normalizeProductPricingUnit } from "../../services/productPricingUnits.js";
import { buildPricingEngineSnapshot } from "../../services/pricingEngineService.js";
import { getEnabledLoyaltyEligibilityConditions } from "../../utils/customerLoyaltyEligibility.js";
import { Home, X, AlertCircle, ChevronLeft, UserCircle, CheckCircle, TrendingUp, ChevronDown, ChevronUp, CreditCard, ShoppingCart, Search, Star, Package, Wallet, Banknote, Target, Receipt, MoreHorizontal, Percent, Send, Gift, MessageCircle, Megaphone } from "lucide-react";
import { getOrderInputUnitOptions } from "../../services/smartCustomerOrdering.js";
import { AppShell, HDHeader, HDBottomNavigation } from "../../layout/index.js";
import AccountGreeting from "../../layout/AccountGreeting.jsx";
// Transitional bundle boundary. Only stable local module bindings are injected;
// all actor/company/business data continues to arrive through current props.
// Generated binding contract is checked against the real source AST.
export function createCustomerPortalView(runtime) {
  const {AppSectionErrorBoundary,BANK_APP_OPEN_OPTIONS,BANK_ID_OPTIONS,CustomerEmptyState,CustomerStatCard,DEFAULT_CUSTOMER_LOYALTY_SETTINGS,PRICING_TODAY_PRICE_COLUMNS,appId,buildCustomerLedger,buildCustomerLocationFromPosition,buildLatestPricingInputsByGroup,buildPayosPaymentQrImageSource,buildPricingGroupRowsFromInputs,buildPricingSalesGroupsByActivity,buildPricingTodayPriceMatrix,calculateCustomerLoyaltySummary,copyTextToClipboard,formatCurrency,formatDateLabel,formatDateTimeLabel,formatNumber,formatOrderCode,formatPricingVnd,getBankOptionLabel,getCompanyDisplayName,getCompanyLogoUrl,getCustomerBranchById,getCustomerBranchDisplayName,getCustomerBranchFixedProductIds,getCustomerBranchProductConfigSource,getCustomerFixedProductIds,getCustomerLocationShareText,getCustomerPlainName,getCustomerProductAttribute,getCustomerProductSize,getDeliveryAssignmentIds,getEmployeeAvatarUrl,getEmployeePositionLabel,getEntityTimestamp,getFriendlyFirebaseErrorMessage,getInitials,getInvoiceTransferProfile,getOrderPlacedAtLabel,getPaymentDateKey,getTodayString,isCashflowOfficial,isSameLoginPhone,normalizeCustomerBranches,normalizeCustomerLocationFields,normalizeCustomerPhone,normalizeLookupText,normalizePricingRuleDraft,openExternalPaymentUrl,parseCustomerLocationInput,parseLooseMoneyValue,parseLooseQuantityValue,readImageFileAsDataUrl,requestCurrentLocation,requestCustomerDebtPaymentIntent,resolveCustomerProductBillingConfiguration,resolveEntityDateKey,roundMoneyValue} = runtime;
  function CustomerPortalView({
  catalogState = {status:'ready',error:''},onRetryCatalog,
  financialState = {status:'loading',confirmedAt:null},
  firebaseUser,
  currentUser,
  currentCompany,
  customer,
  products = [],
  orders = [],
  orderRequests = [],
  warehouseImports = [],
  warehouseDispatches = [],
  deliveryReports = [],
  payments = [],
  bankAccounts = [],
  employees = [],
  messages = [],
  customerPoints = [],
  rewardCatalog = [],
  promotions = [],
  notifications = [],
  pricingInputs = [],
  pricingRules = [],
  onAddOrderRequest,
  onEditOrderRequest,
  onEditCustomer,
  onAddMessage,
  onMarkCustomerInboxItemsRead,
  onRedeemCustomerPoints,
  onLinkCustomerBankAccount,
  onLogout
}) {
  const financialReady=Boolean(financialState.scope&&financialState.status==='ready');
  const financialPresentationRef=useRef(null);
  if(financialPresentationRef.current?.scope!==financialState.scope)financialPresentationRef.current=null;
  const financialAccessRef=useRef(financialState);financialAccessRef.current=financialState;
  const hasFreshFinancialAccess=()=>financialReady&&financialAccessRef.current===financialState;
  const cachedFinancialPresentation=!financialReady&&financialState.scope
    &&financialPresentationRef.current?.scope===financialState.scope?financialPresentationRef.current:null;
  const financialStatus=financialReady?'ready':cachedFinancialPresentation?'revalidating':'loading';
  const financialCachedAt=cachedFinancialPresentation?.confirmedAt??financialState.confirmedAt;
  const financialFields={};
  const financialValue=(key,value)=>{
    if(financialReady){financialFields[key]=value;return value;}
    return cachedFinancialPresentation&&Object.prototype.hasOwnProperty.call(cachedFinancialPresentation.values,key)
      ?cachedFinancialPresentation.values[key]:'—';
  };
  useLayoutEffect(()=>{
    const keys=['debt','points','monthlyOrders','monthlySales','paid','remainingDebtLimit'];
    if(financialReady&&keys.every(key=>Object.prototype.hasOwnProperty.call(financialFields,key))){
      // Presentation only: six completed Home fields, never a ledger/draft or
      // a source for payment/order decisions. Commit together after rendering.
      financialPresentationRef.current={scope:financialState.scope,confirmedAt:financialState.confirmedAt,values:financialFields};
    }
  });
  const customerAvatarInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState('home');
  const [cart, setCart] = useState([]);
  const [deliveryDate, setDeliveryDate] = useState(getTodayString());
  const [orderNote, setOrderNote] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [submitMessage, setSubmitMessage] = useState('');
  const [profileDraft, setProfileDraft] = useState(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isGettingProfileGps, setIsGettingProfileGps] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [editingOrderRequestId, setEditingOrderRequestId] = useState('');
  const [isPaymentSheetOpen, setIsPaymentSheetOpen] = useState(false);
  const [selectedPaymentBankId, setSelectedPaymentBankId] = useState('BIDV');
  const [selectedPaymentOrderIds, setSelectedPaymentOrderIds] = useState([]);
  const [debtPaymentIntent, setDebtPaymentIntent] = useState(null);
  const [isPreparingDebtPayment, setIsPreparingDebtPayment] = useState(false);
  const [debtPaymentActionMessage, setDebtPaymentActionMessage] = useState('');
  const [bankLinkForm, setBankLinkForm] = useState({
    bankCode: 'BIDV',
    bankName: getBankOptionLabel('BIDV'),
    accountNumber: '',
    accountName: ''
  });
  const [isLinkingBankAccount, setIsLinkingBankAccount] = useState(false);
  const [bankLinkMessage, setBankLinkMessage] = useState('');
  const [selectedCustomerOrderSelection, setSelectedCustomerOrderSelection] = useState(null);
  const customerOrderListScrollTopRef = useRef(0);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [redeemPointsInput, setRedeemPointsInput] = useState('');
  const [isRedeemingPoints, setIsRedeemingPoints] = useState(false);
  const [redeemPointsMessage, setRedeemPointsMessage] = useState('');
  const [isPointWithdrawSheetOpen, setIsPointWithdrawSheetOpen] = useState(false);
  const [pointWithdrawMode, setPointWithdrawMode] = useState('debt');
  const [pointWithdrawInput, setPointWithdrawInput] = useState('');
  const [selectedPointRewardId, setSelectedPointRewardId] = useState('');
  const [pointWithdrawNote, setPointWithdrawNote] = useState('');
  const [isSubmittingPointWithdraw, setIsSubmittingPointWithdraw] = useState(false);
  const [pointWithdrawMessage, setPointWithdrawMessage] = useState('');
  const [selectedCustomerConversationId, setSelectedCustomerConversationId] = useState('');
  const [customerMessageText, setCustomerMessageText] = useState('');
  const [isSendingCustomerMessage, setIsSendingCustomerMessage] = useState(false);
  const customerInboxReadInFlightRef = useRef(new Set());
  const [confirmingReceivedTrackingId, setConfirmingReceivedTrackingId] = useState('');
  const [isCustomerProfileEditorOpen, setIsCustomerProfileEditorOpen] = useState(false);
  const safeProducts = useMemo(() => Array.isArray(products) ? products : [], [products]);
  const customerVisibleProducts = useMemo(
    () => filterCustomerVisibleProducts(safeProducts),
    [safeProducts]
  );
  const customerVisibleProductIds = useMemo(
    () => new Set(customerVisibleProducts.map(product => `${product?.id || ''}`).filter(Boolean)),
    [customerVisibleProducts]
  );
  useEffect(() => {
    // Do not clear a draft while the product stream is still empty during startup.
    if (safeProducts.length === 0 || cart.length === 0) return;
    const unavailableItems = cart.filter(item => (
      item?.productId && !customerVisibleProductIds.has(`${item.productId}`)
    ));
    if (unavailableItems.length === 0) return;

    setCart(previous => previous.filter(item => (
      !item?.productId || customerVisibleProductIds.has(`${item.productId}`)
    )));
    setSubmitMessage(unavailableItems.length === 1
      ? 'Một sản phẩm đã được công ty ẩn nên đã được bỏ khỏi giỏ hàng.'
      : `${unavailableItems.length} sản phẩm đã được công ty ẩn nên đã được bỏ khỏi giỏ hàng.`);
  }, [cart, customerVisibleProductIds, safeProducts.length]);
  const safeOrders = useMemo(() => Array.isArray(orders) ? orders : [], [orders]);
  const safeOrderRequests = useMemo(() => Array.isArray(orderRequests) ? orderRequests : [], [orderRequests]);
  const safeWarehouseImports = useMemo(() => Array.isArray(warehouseImports) ? warehouseImports : [], [warehouseImports]);
  const safeWarehouseDispatches = useMemo(() => Array.isArray(warehouseDispatches) ? warehouseDispatches : [], [warehouseDispatches]);
  const safeDeliveryReports = useMemo(() => Array.isArray(deliveryReports) ? deliveryReports : [], [deliveryReports]);
  const safePayments = useMemo(() => Array.isArray(payments) ? payments : [], [payments]);
  const safeBankAccounts = useMemo(() => Array.isArray(bankAccounts) ? bankAccounts : [], [bankAccounts]);
  const safeEmployees = useMemo(() => Array.isArray(employees) ? employees : [], [employees]);
  const safeMessages = useMemo(() => Array.isArray(messages) ? messages : [], [messages]);
  const safeCustomerPoints = useMemo(() => Array.isArray(customerPoints) ? customerPoints : [], [customerPoints]);
  const safeRewardCatalog = useMemo(() => Array.isArray(rewardCatalog) ? rewardCatalog : [], [rewardCatalog]);
  const safePromotions = useMemo(() => Array.isArray(promotions) ? promotions : [], [promotions]);
  const safeNotifications = useMemo(() => Array.isArray(notifications) ? notifications : [], [notifications]);
  const safePricingInputs = useMemo(() => Array.isArray(pricingInputs) ? pricingInputs : [], [pricingInputs]);
  const safePricingRules = useMemo(() => Array.isArray(pricingRules) ? pricingRules : [], [pricingRules]);
  function getCustomerBankDisplayText(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string' || typeof value === 'number') return `${value}`.trim() || fallback;
    if (typeof value === 'boolean') return value ? 'Có' : 'Không';
    if (typeof value === 'object') {
      const nestedValue = value.label ?? value.name ?? value.title ?? value.value ?? value.id ?? value.code ?? fallback;
      return getCustomerBankDisplayText(nestedValue, fallback);
    }
    return fallback;
  }
  const customerPortalEmployeeLookup = useMemo(
    () => new Map(safeEmployees.map(employeeItem => [employeeItem.id, employeeItem])),
    [safeEmployees]
  );
  const customerProfile = useMemo(() => customer || {
    id: currentUser?.customerId || '',
    companyId: currentUser?.companyId || '',
    name: currentUser?.name || '',
    phone: currentUser?.phone || ''
  }, [customer, currentUser?.customerId, currentUser?.companyId, currentUser?.name, currentUser?.phone]);
  const customerInboxCustomerId = `${customerProfile?.id || currentUser?.customerId || ''}`.trim();
  const customerBranches = useMemo(
    () => normalizeCustomerBranches(customerProfile || {}, customerVisibleProducts),
    [customerProfile, customerVisibleProducts]
  );
  const customerDefaultBankAccount = useMemo(() => {
    const customerId = customerProfile?.id || currentUser?.customerId || '';
    if (!customerId) return null;
    return safeBankAccounts.find(account => account.customerId === customerId && account.isDefault && !account.isArchived)
      || safeBankAccounts.find(account => account.customerId === customerId && !account.isArchived)
      || null;
  }, [currentUser?.customerId, customerProfile?.id, safeBankAccounts]);
  useEffect(() => {
    const bankCode = `${customerDefaultBankAccount?.bankCode || customerDefaultBankAccount?.bankId || ''}`.trim().toUpperCase();
    if (bankCode && isVietQrBankAppSupported(bankCode)) {
      setSelectedPaymentBankId(bankCode);
    }
  }, [customerDefaultBankAccount?.bankCode, customerDefaultBankAccount?.bankId]);
  const customerBankStatus = getCustomerBankDisplayText(customerDefaultBankAccount?.status, 'unlinked') || 'unlinked';
  const customerBankStatusLabel = {
    linked: 'Đã liên kết',
    active: 'Đã liên kết',
    verifying: 'Đang xác minh',
    pending: 'Đang xác minh',
    error: 'Liên kết lỗi',
    failed: 'Liên kết lỗi',
    unlinked: 'Chưa liên kết'
  }[customerBankStatus] || 'Chưa liên kết';
  const selectedCustomerBranch = useMemo(
    () => getCustomerBranchById(customerProfile || {}, selectedBranchId, customerVisibleProducts),
    [customerProfile, customerVisibleProducts, selectedBranchId]
  );
  const responsibleEmployee = useMemo(() => {
    const managerId = getCustomerMessagingEmployeeId(customerProfile);
    const managerPhone = customerProfile?.managerPhone || customerProfile?.salesPhone || customerProfile?.employeePhone || '';
    const managerName = customerProfile?.managerName || customerProfile?.salesName || customerProfile?.employeeName || customerProfile?.salesOwnerName || '';
    const normalizedManagerName = normalizeLookupText(managerName);
    return safeEmployees.find(item => item.id === managerId)
      || safeEmployees.find(item => managerPhone && isSameLoginPhone(item.phone, managerPhone))
      || safeEmployees.find(item => normalizedManagerName && normalizeLookupText(item.name || '') === normalizedManagerName)
      || safeEmployees.find(item => normalizedManagerName && normalizeLookupText(item.name || '').includes(normalizedManagerName))
      || null;
  }, [customerProfile?.empId, customerProfile?.employeeName, customerProfile?.employeePhone, customerProfile?.managerEmpId, customerProfile?.managerName, customerProfile?.managerPhone, customerProfile?.salesEmpId, customerProfile?.salesName, customerProfile?.salesOwnerName, customerProfile?.salesPhone, safeEmployees]);
  const responsibleEmployeeName = responsibleEmployee?.name
    || customerProfile?.managerName
    || customerProfile?.salesName
    || customerProfile?.employeeName
    || customerProfile?.salesOwnerName
    || 'Chưa gán nhân viên';
  const responsibleEmployeePhone = responsibleEmployee?.phone
    || customerProfile?.managerPhone
    || customerProfile?.salesPhone
    || customerProfile?.employeePhone
    || '';
  const responsibleEmployeeId = responsibleEmployee?.id
    || getCustomerMessagingEmployeeId(customerProfile)
    || '';
  const responsibleEmployeeChatTitle = [
    'Tin nhắn',
    'NVKD',
    responsibleEmployeeName,
    responsibleEmployeePhone
  ].filter(Boolean).join(' - ');
  const customerResponsibleConversationId = useMemo(
    () => buildCustomerSupportConversationId(customerProfile?.id || currentUser?.customerId || ''),
    [currentUser?.customerId, customerProfile?.id]
  );
  const customerResponsibleMessages = useMemo(() => (
    safeMessages
      .filter(message => isCustomerScopedMessage(message, customerInboxCustomerId))
      .sort((left, right) => getCustomerInboxItemTimestamp(left) - getCustomerInboxItemTimestamp(right))
      .slice(-100)
  ), [customerInboxCustomerId, safeMessages]);

  useEffect(() => {
    if (customerBranches.length === 0) {
      if (selectedBranchId) setSelectedBranchId('');
      return;
    }
    if (!customerBranches.some(branch => branch.id === selectedBranchId)) {
      setSelectedBranchId(customerBranches[0].id);
    }
  }, [customerBranches, selectedBranchId]);

  useEffect(() => {
    if (!customerProfile?.id) return;
    setProfileDraft({
      name: customerProfile.name || '',
      phone: customerProfile.phone || currentUser?.phone || '',
      avatarUrl: customerProfile.avatarUrl || customerProfile.avatar || '',
      address: customerProfile.address || '',
      location: customerProfile.location || null,
      locationInput: getCustomerLocationShareText(customerProfile || {}) || customerProfile.locationUrl || customerProfile.address || '',
      birthday: customerProfile.birthday || customerProfile.dateOfBirth || '',
      email: customerProfile.email || '',
      zaloGroupLink: customerProfile.zaloGroupLink || customerProfile.zaloLink || ''
    });
  }, [customerProfile?.id, customerProfile?.name, customerProfile?.phone, customerProfile?.avatarUrl, customerProfile?.avatar, customerProfile?.address, customerProfile?.location, customerProfile?.locationUrl, customerProfile?.birthday, customerProfile?.dateOfBirth, customerProfile?.email, customerProfile?.zaloGroupLink, customerProfile?.zaloLink, currentUser?.phone]);

  useEffect(() => {
    if (!customerProfile?.id) return;
    if (customerDefaultBankAccount) {
      const bankCode = getCustomerBankDisplayText(customerDefaultBankAccount.bankCode || customerDefaultBankAccount.bankId, 'BIDV');
      const selectedBank = BANK_ID_OPTIONS.find(option => option.value === bankCode);
      setBankLinkForm({
        bankCode,
        bankName: getCustomerBankDisplayText(customerDefaultBankAccount.bankName, selectedBank?.label || getBankOptionLabel(bankCode)),
        accountNumber: getCustomerBankDisplayText(customerDefaultBankAccount.accountNumber || customerDefaultBankAccount.bankAccountNumber),
        accountName: getCustomerBankDisplayText(customerDefaultBankAccount.accountName || customerDefaultBankAccount.bankAccountName)
      });
      return;
    }
    setBankLinkForm(prev => ({
      ...prev,
      bankCode: prev.bankCode || 'BIDV',
      bankName: prev.bankName || getBankOptionLabel(prev.bankCode || 'BIDV')
    }));
  }, [customerDefaultBankAccount, customerProfile?.id]);

  const customerOrders = useMemo(
    () => safeOrders.filter(order => order.customerId === customerProfile?.id).sort((a, b) => `${b.createdAt || b.date || ''}`.localeCompare(`${a.createdAt || a.date || ''}`)),
    [safeOrders, customerProfile?.id]
  );
  const customerRequests = useMemo(() => {
    const grouped = new Map();
    safeOrderRequests
      .filter(request => request.customerId === customerProfile?.id && !request.isArchived)
      .forEach((request) => {
        const versionKey = request.customerOrderRootId
          || request.sourceCustomerRequestId
          || request.clientRequestId
          || request.id;
        const current = grouped.get(versionKey);
        if (!current || (getEntityTimestamp(request) || 0) >= (getEntityTimestamp(current) || 0)) {
          grouped.set(versionKey, request);
        }
      });
    return Array.from(grouped.values())
      .sort((a, b) => `${b.updatedAt || b.createdAt || b.date || ''}`.localeCompare(`${a.updatedAt || a.createdAt || a.date || ''}`));
  }, [safeOrderRequests, customerProfile?.id]);
  const customerPortalOrderDisplayNumberMap = useMemo(() => {
    const map = new Map();
    const addItems = (items, type) => {
      const sorted = items
        .map(item => ({ ...item, type }))
        .sort((a, b) => (getEntityTimestamp(a) || 0) - (getEntityTimestamp(b) || 0));
      sorted.forEach((item, index) => {
        const displayNumber = index + 1;
      [
        `${type}::${item.id || ''}`,
        item.id,
        item.customerOrderRootId,
        item.sourceCustomerRequestId,
        item.clientRequestId,
        item.requestCode,
        item.orderId,
        item.orderCode,
        item.code
      ].filter(Boolean).forEach(key => {
        map.set(`${key}`, displayNumber);
      });
      });
    };
    addItems(customerRequests, 'request');
    addItems(customerOrders, 'order');
    return map;
  }, [customerOrders, customerRequests]);
  const customerPortalDetailItems = useMemo(
    () => [
      ...customerRequests.map(item => ({ ...item, type: 'request' })),
      ...customerOrders.map(item => ({ ...item, type: 'order' })),
    ],
    [customerOrders, customerRequests]
  );
  const selectedCustomerOrderItem = useMemo(
    () => resolveCustomerPortalOrderSelection(customerPortalDetailItems, selectedCustomerOrderSelection),
    [customerPortalDetailItems, selectedCustomerOrderSelection]
  );
  const openCustomerOrderDetail = useCallback((item) => {
    const selection = getCustomerPortalOrderSelection(item);
    if (!selection) return;
    if (typeof window !== 'undefined') {
      customerOrderListScrollTopRef.current = window.scrollY || document.documentElement.scrollTop || 0;
    }
    setSelectedCustomerOrderSelection(selection);
  }, []);
  const closeCustomerOrderDetail = useCallback(() => {
    const scrollTop = customerOrderListScrollTopRef.current;
    setSelectedCustomerOrderSelection(null);
    if (typeof window !== 'undefined' && Number.isFinite(scrollTop)) {
      window.requestAnimationFrame(() => window.scrollTo({ top: scrollTop, behavior: 'auto' }));
    }
  }, []);
  useEffect(() => {
    if (!selectedCustomerOrderSelection || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeCustomerOrderDetail();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [closeCustomerOrderDetail, selectedCustomerOrderSelection]);
  const editingOrderRequest = useMemo(
    () => safeOrderRequests.find(request => request.id === editingOrderRequestId) || null,
    [safeOrderRequests, editingOrderRequestId]
  );
  const customerPayments = useMemo(
    () => safePayments
      .filter(payment => payment.customerId === customerProfile?.id && isCashflowOfficial(payment))
      .sort((a, b) => `${b.createdAt || b.date || ''}`.localeCompare(`${a.createdAt || a.date || ''}`)),
    [safePayments, customerProfile?.id]
  );
  const ledger = useMemo(() => customerProfile?.id ? buildCustomerLedger(customerProfile, safeOrders, safePayments) : buildCustomerLedger('', [], []), [customerProfile, safeOrders, safePayments]);
  const pointsInfo = useMemo(() => {
    const customerId = customerProfile?.id || currentUser?.customerId || '';
    const normalizedPhone = normalizeCustomerPhone(customerProfile?.phone || currentUser?.phone || '');
    return safeCustomerPoints.find(item => {
      const pointCustomerId = item?.customer_id || item?.customerId || item?.customer || '';
      const pointDocId = item?.id || '';
      const pointPhone = normalizeCustomerPhone(item?.phone || item?.customerPhone || item?.customer_phone || '');
      return (
        (customerId && (pointCustomerId === customerId || pointDocId === `customer_points_${customerId}` || pointDocId === customerId)) ||
        (normalizedPhone && pointPhone && pointPhone === normalizedPhone)
      );
    }) || {};
  }, [safeCustomerPoints, customerProfile?.id, customerProfile?.phone, currentUser?.customerId, currentUser?.phone]);
  const loyaltySummary = useMemo(() => calculateCustomerLoyaltySummary({
    customer: customerProfile || {},
    ledger,
    company: currentCompany,
    pointsRecord: pointsInfo
  }), [customerProfile, ledger, currentCompany, pointsInfo]);
  const monthKey = getTodayString().slice(0, 7);
  const monthlyOrders = useMemo(() => customerOrders.filter(order => `${order.date || order.createdAt || ''}`.slice(0, 7) === monthKey), [customerOrders, monthKey]);
  const monthlySales = useMemo(() => monthlyOrders.reduce((sum, order) => sum + parseLooseMoneyValue(order.total || order.totalAmount || order.finalTotal || order.amount), 0), [monthlyOrders]);
  const resolveCustomerPortalProductConfiguration = (product, branchId = '', criteria = {}) => {
    const configSource = getCustomerBranchProductConfigSource(customerProfile, branchId, customerVisibleProducts);
    return resolveCustomerProductBillingConfiguration(configSource, product, criteria);
  };
  const buildCustomerPortalBillingSnapshot = ({
    item = {},
    product = null,
    branchId = '',
    preserveSavedSnapshot = false,
    forceCurrentConfiguration = false,
  } = {}) => {
    const currentConfiguration = resolveCustomerPortalProductConfiguration(product, branchId, forceCurrentConfiguration
      ? {}
      : {
          configurationId: item.configurationId || '',
          sizeLabel: item.sizeLabel || item.size || '',
          attributeLabel: item.attributeLabel || item.productAttribute || '',
        });
    const savedSnapshot = resolveTransactionBillingSnapshot({ record: item, configuration: currentConfiguration, product });
    const shouldUseSavedSnapshot = savedSnapshot.hasFrozenPricing
      && !forceCurrentConfiguration
      && !item.isDraftCartLine;
    const billingConfiguration = shouldUseSavedSnapshot
      ? {
          ...currentConfiguration,
          configurationId: savedSnapshot.configurationId || currentConfiguration.configurationId,
          billingUnit: savedSnapshot.billingUnit,
          pricingUnit: savedSnapshot.billingUnit,
          unitPrice: savedSnapshot.unitPrice,
          unitConversions: savedSnapshot.unitConversions || currentConfiguration.unitConversions || '',
          source: 'customer_order_snapshot',
        }
      : currentConfiguration;
    const orderUnit = normalizeProductPricingUnit(
      item.orderUnit
      || item.inputUnit
      || item.quantityUnit
      || item.actualUnit
      || item.unit
      || (shouldUseSavedSnapshot ? savedSnapshot.orderUnit || savedSnapshot.actualUnit : '')
      || billingConfiguration.defaultOrderUnit
      || resolveCustomerProductActualUnit(billingConfiguration, product)
    );
    const actualUnit = shouldUseSavedSnapshot
      ? savedSnapshot.actualUnit
      : orderUnit;
    if (preserveSavedSnapshot && shouldUseSavedSnapshot) return savedSnapshot;
    return buildCustomerProductBillingSnapshot({
      configuration: billingConfiguration,
      product,
      productId: product?.id || item.productId || '',
      productName: product?.name || item.productName || item.productNameSnapshot || '',
      sizeLabel: forceCurrentConfiguration
        ? (billingConfiguration.sizeLabel || '')
        : (item.sizeLabel || item.size || billingConfiguration.sizeLabel || ''),
      attributeLabel: forceCurrentConfiguration
        ? (billingConfiguration.attributeLabel || '')
        : (item.attributeLabel || item.productAttribute || billingConfiguration.attributeLabel || ''),
      actualQuantity: item.actualQuantity ?? item.quantity ?? 0,
      actualUnit,
      orderUnit,
      actualWeightKg: item.actualWeightKg ?? item.weightKg ?? 0,
      conversionFactor: item.conversionFactor ?? item.unitConversionFactor ?? (shouldUseSavedSnapshot ? savedSnapshot.conversionFactor : 0),
      unitConversions: item.unitConversions ?? item.conversions ?? billingConfiguration.unitConversions ?? '',
    });
  };
  const availableProducts = useMemo(() => {
    const fixedIds = selectedBranchId
      ? getCustomerBranchFixedProductIds(customerProfile, selectedBranchId, customerVisibleProducts)
      : getCustomerFixedProductIds(customerProfile, customerVisibleProducts);
    const source = fixedIds.length > 0 ? customerVisibleProducts.filter(product => fixedIds.includes(product.id)) : [];
    const keyword = normalizeLookupText(searchTerm);
    return source
      .filter(product => !keyword || normalizeLookupText(`${product.name || ''} ${product.shortName || ''} ${product.code || ''}`).includes(keyword))
      .slice(0, 80);
  }, [customerProfile, customerVisibleProducts, searchTerm, selectedBranchId]);
  const activePromotions = useMemo(() => safePromotions.filter(item => !item.status || ['active', 'published'].includes(item.status)), [safePromotions]);
  const customerPricingRules = useMemo(
    () => normalizePricingRuleDraft(safePricingRules.find(rule => rule?.id === 'pricing_engine_rules') || safePricingRules[0] || {}),
    [safePricingRules]
  );
  const customerLatestWarehouseInputsByGroup = useMemo(
    () => buildLatestPricingInputsByGroup(safeWarehouseImports),
    [safeWarehouseImports]
  );
  const customerSalesPricingGroupsByGroup = useMemo(
    () => buildPricingSalesGroupsByActivity({
      orders: safeOrders,
      orderRequests: safeOrderRequests,
      products: customerVisibleProducts,
    }),
    [safeOrders, safeOrderRequests, customerVisibleProducts]
  );
  const customerPricingGroupRows = useMemo(
    () => buildPricingGroupRowsFromInputs(customerLatestWarehouseInputsByGroup, customerSalesPricingGroupsByGroup, customerVisibleProducts),
    [customerLatestWarehouseInputsByGroup, customerSalesPricingGroupsByGroup, customerVisibleProducts]
  );
  const customerVisiblePricingGroupRows = useMemo(() => {
    const hiddenSet = new Set(Array.isArray(customerPricingRules.hiddenTodayPriceGroupKeys)
      ? customerPricingRules.hiddenTodayPriceGroupKeys
      : []);
    return customerPricingGroupRows.filter(group => !hiddenSet.has(group.key));
  }, [customerPricingGroupRows, customerPricingRules.hiddenTodayPriceGroupKeys]);
  const customerPricingSnapshot = useMemo(() => buildPricingEngineSnapshot({
    currentCompany,
    products: customerVisibleProducts,
    orders: safeOrders,
    orderRequests: safeOrderRequests,
    warehouseImports: safeWarehouseImports,
    warehouseDispatches: safeWarehouseDispatches,
    pricingInputs: safePricingInputs,
    pricingRules: [customerPricingRules],
  }), [
    currentCompany,
    customerVisibleProducts,
    safeOrders,
    safeOrderRequests,
    safeWarehouseImports,
    safeWarehouseDispatches,
    safePricingInputs,
    customerPricingRules,
  ]);
  const customerPricingTotals = customerPricingSnapshot.totals || {};
  const customerPricingCostPerKg = customerPricingTotals.pricingCostPerKg || customerPricingTotals.latestInputCostPerKg || customerPricingTotals.costPerKg || 0;
  const customerTodayInputPriceOverrides = customerPricingRules.todayInputPriceOverrides || {};
  const customerEffectiveLatestInputsByGroup = useMemo(() => {
    const next = { ...customerLatestWarehouseInputsByGroup };
    Object.entries(customerTodayInputPriceOverrides).forEach(([groupKey, override]) => {
      const pricePerKg = parseLooseMoneyValue(override?.pricePerKg);
      if (pricePerKg <= 0) return;
      const base = next[groupKey] || {};
      const group = customerPricingGroupRows.find(item => item.key === groupKey);
      const totalKg = parseLooseQuantityValue(base.totalKg);
      const quantity = parseLooseQuantityValue(base.quantity);
      next[groupKey] = {
        ...base,
        id: base.id || `customer-today-price-${groupKey}`,
        source: 'manual_today_price',
        groupKey,
        groupName: group?.label || base.groupName || override.groupName || groupKey,
        rawKgPrice: pricePerKg,
        unitPrice: pricePerKg,
        pricePerKg,
        totalKg: totalKg > 0 ? totalKg : 1,
        quantity,
        amount: pricePerKg * (totalKg > 0 ? totalKg : 1),
        date: getTodayString(),
        timestamp: Number.MAX_SAFE_INTEGER - 1,
        isManualTodayPrice: true,
      };
    });
    return next;
  }, [customerLatestWarehouseInputsByGroup, customerTodayInputPriceOverrides, customerPricingGroupRows]);
  const customerFocusedPricingSuggestions = useMemo(() => {
    const existing = (customerPricingSnapshot.priceSuggestions || []).map(item => ({
      id: item.productId || item.productName,
      productName: item.productName,
      groupName: item.groupName,
      unit: item.unit || 'kg',
      costBase: item.costBase,
      suggestedMargin: item.suggestedMargin,
      suggestedPrice: item.suggestedPrice,
      currentPrice: item.currentPrice,
      monthRevenue: item.monthRevenue,
      monthQuantity: item.monthQuantity,
      monthKg: item.monthKg,
      profit: item.profit,
    }));
    if (existing.length) return existing;
    return (customerPricingSnapshot.inputRows || []).slice(0, 8).map((item, index) => ({
      id: item.batchCode || `${item.groupName}-${index}`,
      productName: item.groupName || 'Gia cầm',
      groupName: item.groupName || 'Gia cầm',
      unit: item.totalKg > 0 ? 'kg' : 'con',
      suggestedPrice: item.totalKg > 0 ? customerPricingCostPerKg * (1 + (customerPricingRules.targetMargin || 0) / 100) : 0,
      currentPrice: 0,
      monthRevenue: 0,
      monthQuantity: item.quantity,
      monthKg: item.totalKg,
      profit: 0,
    }));
  }, [customerPricingSnapshot.priceSuggestions, customerPricingSnapshot.inputRows, customerPricingCostPerKg, customerPricingRules.targetMargin]);
  const customerTodayPriceMatrix = useMemo(() => buildPricingTodayPriceMatrix({
    groupPresets: customerVisiblePricingGroupRows,
    typeColumns: PRICING_TODAY_PRICE_COLUMNS,
    lossStageGroups: customerPricingRules.lossStageGroups,
    products: customerVisibleProducts,
    focusedSuggestions: customerFocusedPricingSuggestions,
    pricingCostPerKg: customerPricingCostPerKg,
    latestInputsByGroup: customerEffectiveLatestInputsByGroup,
    marginByGroup: customerPricingRules.marginByGroup,
    marginByProduct: customerPricingRules.marginByProduct,
    fallbackMargin: customerPricingRules.targetMargin,
    cutParts: customerPricingRules.cutParts,
    cutPartGroups: customerPricingRules.cutPartGroups,
  }), [
    customerVisiblePricingGroupRows,
    customerPricingRules.lossStageGroups,
    customerPricingRules.marginByGroup,
    customerPricingRules.marginByProduct,
    customerPricingRules.targetMargin,
    customerPricingRules.cutParts,
    customerPricingRules.cutPartGroups,
    customerVisibleProducts,
    customerFocusedPricingSuggestions,
    customerPricingCostPerKg,
    customerEffectiveLatestInputsByGroup,
  ]);
  const customerTodayPriceGroups = useMemo(
    () => customerTodayPriceMatrix.filter(group => (group.cells || []).some(cell => parseLooseMoneyValue(cell?.price) > 0)),
    [customerTodayPriceMatrix]
  );
  const customerHiddenTodayPriceProductKeySet = useMemo(
    () => new Set(Array.isArray(customerPricingRules.hiddenTodayPriceProductKeys)
      ? customerPricingRules.hiddenTodayPriceProductKeys
      : []),
    [customerPricingRules.hiddenTodayPriceProductKeys],
  );
  const customerTodayPriceRows = useMemo(
    () => PRICING_TODAY_PRICE_COLUMNS
      .filter(column => !customerHiddenTodayPriceProductKeySet.has(column.key))
      .map(column => {
        const columnIndex = PRICING_TODAY_PRICE_COLUMNS.findIndex(item => item.key === column.key);
        return {
          ...column,
          columnIndex,
          hasPrice: customerTodayPriceGroups.some(group => parseLooseMoneyValue(group.cells?.[columnIndex]?.price) > 0),
        };
      })
      .filter(row => row.hasPrice),
    [customerTodayPriceGroups, customerHiddenTodayPriceProductKeySet]
  );
  const customerTodayPriceGridTemplate = {
    gridTemplateColumns: `minmax(74px,0.9fr) repeat(${Math.max(customerTodayPriceGroups.length, 1)}, minmax(70px,1fr))`,
  };
  const customerTodayPriceTableMinWidth = Math.max(300, 86 + customerTodayPriceGroups.length * 78);
  const hasCustomerTodayPriceTable = customerTodayPriceGroups.length > 0 && customerTodayPriceRows.length > 0;
  const customerNotificationItems = useMemo(() => (
    safeNotifications
      .filter(notification => isCustomerScopedNotification(notification, customerInboxCustomerId))
      .sort((left, right) => getCustomerInboxItemTimestamp(right) - getCustomerInboxItemTimestamp(left))
      .slice(0, 100)
  ), [customerInboxCustomerId, safeNotifications]);
  const customerInboxConversations = useMemo(() => buildCustomerInboxConversations({
    messages: customerResponsibleMessages,
    notifications: customerNotificationItems,
    customerId: customerInboxCustomerId,
    responsibleConversationId: customerResponsibleConversationId,
    responsibleName: responsibleEmployeeName || 'Hỗ trợ khách hàng'
  }), [
    customerInboxCustomerId,
    customerNotificationItems,
    customerResponsibleMessages,
    customerResponsibleConversationId,
    responsibleEmployeeName
  ]);
  const selectedCustomerConversation = useMemo(
    () => customerInboxConversations.find(conversation => conversation.id === selectedCustomerConversationId) || null,
    [customerInboxConversations, selectedCustomerConversationId]
  );
  useEffect(() => {
    if (selectedCustomerConversationId && !selectedCustomerConversation) {
      setSelectedCustomerConversationId('');
    }
  }, [selectedCustomerConversation, selectedCustomerConversationId]);
  const customerMessageBadgeCount = useMemo(() => customerInboxConversations.reduce(
    (total, conversation) => total + getUnreadCustomerInboxItems(conversation, customerInboxCustomerId).length,
    0
  ), [customerInboxConversations, customerInboxCustomerId]);
  const markCustomerConversationAsRead = async (conversation) => {
    if (typeof onMarkCustomerInboxItemsRead !== 'function') return;
    const unreadItems = getUnreadCustomerInboxItems(conversation, customerInboxCustomerId);
    const pendingItems = unreadItems.filter(item => {
      const key = `${item.__inboxKind}:${item.id}`;
      if (customerInboxReadInFlightRef.current.has(key)) return false;
      customerInboxReadInFlightRef.current.add(key);
      return true;
    });
    if (!pendingItems.length) return;
    try {
      await onMarkCustomerInboxItemsRead(pendingItems);
    } catch (error) {
      console.warn('Cannot mark customer inbox items as read:', error);
    } finally {
      pendingItems.forEach(item => {
        customerInboxReadInFlightRef.current.delete(`${item.__inboxKind}:${item.id}`);
      });
    }
  };
  const openCustomerInbox = () => {
    setSelectedCustomerConversationId('');
    setActiveTab('messages');
  };
  const openCustomerConversation = (conversation) => {
    setSelectedCustomerConversationId(conversation.id);
    setActiveTab('messages');
    void markCustomerConversationAsRead(conversation);
  };
  const openCustomerSalesConversation = () => {
    const salesConversation = customerInboxConversations.find(conversation => conversation.kind === 'sales_chat');
    if (salesConversation) {
      openCustomerConversation(salesConversation);
      return;
    }
    if (customerResponsibleConversationId) {
      setSelectedCustomerConversationId(`sales:${customerResponsibleConversationId}`);
      setActiveTab('messages');
    }
  };
  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + parseLooseMoneyValue(
    item.amount ?? item.pricingAmount ?? item.lineTotal ?? item.total ?? 0
  ), 0), [cart]);
  const cartHasUnresolvedPricing = useMemo(
    () => cart.some(item => item.billingSnapshotValid === false || item.pricingPendingActual),
    [cart]
  );
  const cartItemCount = useMemo(() => cart.reduce((sum, item) => sum + Math.max(1, Math.floor(parseFloat(item.quantity) || 0)), 0), [cart]);
  const debtLimit = parseLooseMoneyValue(customerProfile?.debtLimit || customerProfile?.debtLimitAmount || customerProfile?.creditLimit || 0);
  const noDebtAllowed = customerProfile?.debtPolicy === 'no_debt' || customerProfile?.debtLimitMode === 'no_debt' || customerProfile?.allowDebt === false || debtLimit <= 0;
  const remainingDebtLimit = debtLimit > 0 ? Math.max(0, debtLimit - Math.max(0, ledger.currentDebt || 0)) : 0;
  const isOrderingLocked = financialReady && noDebtAllowed && (ledger.currentDebt || 0) > 0;
  const debtPaymentAmount = Math.max(0, Math.round(ledger.currentDebt || 0));
  const unpaidCustomerOrdersForPayment = useMemo(() => {
    const ledgerOrders = Array.isArray(ledger.orders) ? ledger.orders : [];
    return ledgerOrders
      .filter(order => (
        !order.isArchived
        && !order.isOpeningDebt
        && `${order.id || order.orderId || ''}`.trim()
        && Math.round(parseLooseMoneyValue(order.outstandingAmount)) > 0
      ))
      .sort((a, b) => (getEntityTimestamp(b) || 0) - (getEntityTimestamp(a) || 0));
  }, [ledger.orders]);
  const unpaidPaymentOrderIdSet = useMemo(
    () => new Set(unpaidCustomerOrdersForPayment.map(order => `${order.id || order.orderId || order.code || order.orderCode || ''}`).filter(Boolean)),
    [unpaidCustomerOrdersForPayment]
  );
  useEffect(() => {
    setSelectedPaymentOrderIds(prev => prev.filter(orderId => unpaidPaymentOrderIdSet.has(orderId)));
  }, [unpaidPaymentOrderIdSet]);
  const selectedPaymentOrders = useMemo(
    () => unpaidCustomerOrdersForPayment.filter(order => selectedPaymentOrderIds.includes(`${order.id || order.orderId || order.code || order.orderCode || ''}`)),
    [unpaidCustomerOrdersForPayment, selectedPaymentOrderIds]
  );
  const selectedPaymentOrderAmount = useMemo(
    () => selectedPaymentOrders.reduce((sum, order) => sum + Math.max(0, Math.round(parseLooseMoneyValue(order.outstandingAmount))), 0),
    [selectedPaymentOrders]
  );
  const allPayableInvoiceAmount = useMemo(
    () => unpaidCustomerOrdersForPayment.reduce((sum, order) => sum + Math.max(0, Math.round(parseLooseMoneyValue(order.outstandingAmount))), 0),
    [unpaidCustomerOrdersForPayment]
  );
  const customerPaymentAmount = selectedPaymentOrders.length > 0
    ? selectedPaymentOrderAmount
    : allPayableInvoiceAmount;
  const activeDebtPaymentAmount = Math.max(0, Math.round(parseLooseMoneyValue(debtPaymentIntent?.amount))) || customerPaymentAmount;
  const activeDebtPaymentOrderCount = Math.max(0, Math.floor(parseLooseMoneyValue(debtPaymentIntent?.orderCount)))
    || selectedPaymentOrders.length;
  const loyaltyPointValue = Math.max(1, parseLooseMoneyValue(loyaltySummary.redeemValuePerPoint) || DEFAULT_CUSTOMER_LOYALTY_SETTINGS.redeemValuePerPoint);
  const availableCustomerPoints = Math.max(0, Math.floor(parseLooseMoneyValue(
    loyaltySummary.currentPoints
    ?? pointsInfo.available_points
    ?? pointsInfo.availablePoints
    ?? pointsInfo.available
    ?? pointsInfo.total_points
    ?? pointsInfo.totalPoints
    ?? 0
  )));
  const redeemablePointMoney = Math.max(0, roundMoneyValue(loyaltySummary.redeemValue ?? (availableCustomerPoints * loyaltyPointValue)));
  const redeemPointsNumber = Math.max(0, Math.floor(parseLooseMoneyValue(redeemPointsInput)));
  const maxRedeemPointsForDebt = debtPaymentAmount > 0 && loyaltyPointValue > 0
    ? Math.min(availableCustomerPoints, Math.floor(debtPaymentAmount / loyaltyPointValue))
    : 0;
  const redeemPointsToUse = Math.min(availableCustomerPoints, redeemPointsNumber, maxRedeemPointsForDebt);
  const redeemPointsMoney = redeemPointsToUse * loyaltyPointValue;
  const activeRewardCatalog = useMemo(
    () => safeRewardCatalog.filter(item => !item.isArchived && !['inactive', 'archived', 'disabled'].includes(`${item.status || ''}`.toLowerCase())),
    [safeRewardCatalog]
  );
  const pointWithdrawPointsNumber = Math.max(0, Math.floor(parseLooseMoneyValue(pointWithdrawInput)));
  const pointWithdrawPointsToUse = Math.min(availableCustomerPoints, pointWithdrawPointsNumber, maxRedeemPointsForDebt);
  const pointWithdrawDebtAmount = pointWithdrawPointsToUse * loyaltyPointValue;
  const enabledLoyaltyEligibilityConditions = useMemo(
    () => getEnabledLoyaltyEligibilityConditions(loyaltySummary.eligibilityConditions),
    [loyaltySummary.eligibilityConditions]
  );
  const selectedPointReward = useMemo(
    () => activeRewardCatalog.find(item => item.id === selectedPointRewardId) || null,
    [activeRewardCatalog, selectedPointRewardId]
  );
  const selectedPointRewardCost = Math.max(0, Math.floor(parseLooseMoneyValue(
    selectedPointReward?.points
    ?? selectedPointReward?.requiredPoints
    ?? selectedPointReward?.pointCost
    ?? selectedPointReward?.cost
    ?? 0
  )));
  const totalCustomerPoints = Math.max(0, Math.floor(parseLooseMoneyValue(
    loyaltySummary.earnedPoints
    ?? pointsInfo.total_points
    ?? pointsInfo.totalPoints
    ?? pointsInfo.total
    ?? availableCustomerPoints
  )));
  const usedCustomerPoints = Math.max(0, Math.floor(parseLooseMoneyValue(
    loyaltySummary.usedPoints
    ?? pointsInfo.used_points
    ?? pointsInfo.usedPoints
    ?? pointsInfo.redeemed_points
    ?? pointsInfo.redeemedPoints
    ?? 0
  )));
  const expiredCustomerPoints = Math.max(0, Math.floor(parseLooseMoneyValue(
    pointsInfo.expired_points
    ?? pointsInfo.expiredPoints
    ?? 0
  )));
  const redemptionPointsInfo = useMemo(() => ({
    ...pointsInfo,
    currentPoints: availableCustomerPoints,
    current_points: availableCustomerPoints,
    availablePoints: availableCustomerPoints,
    available_points: availableCustomerPoints,
    totalPoints: totalCustomerPoints,
    total_points: totalCustomerPoints,
    usedPoints: usedCustomerPoints,
    used_points: usedCustomerPoints,
    expiredPoints: expiredCustomerPoints,
    expired_points: expiredCustomerPoints
  }), [pointsInfo, availableCustomerPoints, totalCustomerPoints, usedCustomerPoints, expiredCustomerPoints]);
  const loyaltyHistory = useMemo(() => {
    const source = Array.isArray(pointsInfo.history)
      ? pointsInfo.history
      : (Array.isArray(pointsInfo.pointHistory)
        ? pointsInfo.pointHistory
        : (Array.isArray(pointsInfo.transactions) ? pointsInfo.transactions : []));
    return [...source]
      .filter(Boolean)
      .sort((a, b) => (getEntityTimestamp(b) || 0) - (getEntityTimestamp(a) || 0))
      .slice(0, 10);
  }, [pointsInfo]);
  const paymentSelectionKey = useMemo(() => unpaidCustomerOrdersForPayment
    .filter(order => selectedPaymentOrderIds.length === 0 || selectedPaymentOrderIds.includes(`${order.id || order.orderId || order.code || order.orderCode || ''}`))
    .map(order => `${order.id || order.orderId || order.code || order.orderCode || ''}:${Math.round(parseLooseMoneyValue(order.outstandingAmount))}`)
    .sort()
    .join('|'), [selectedPaymentOrderIds, unpaidCustomerOrdersForPayment]);
  useEffect(() => {
    setDebtPaymentIntent(null);
    setDebtPaymentActionMessage('');
  }, [paymentSelectionKey]);
  const debtPaymentReference = `${debtPaymentIntent?.paymentCode || ''}`.trim();
  const debtPaymentCheckoutUrl = `${debtPaymentIntent?.checkoutUrl || debtPaymentIntent?.qrImageUrl || ''}`.trim();
  const debtPaymentQrUrl = useMemo(() => {
    const source = debtPaymentIntent?.paymentQrPayload
      || debtPaymentIntent?.qrCode
      || debtPaymentIntent?.qrImageUrl
      || debtPaymentIntent?.paymentQrImageUrl
      || '';
    return source ? buildPayosPaymentQrImageSource(source) : '';
  }, [debtPaymentIntent]);
  const selectedPaymentBankAppId = resolveVietQrBankAppId(selectedPaymentBankId);
  const selectedPaymentBankName = getBankOptionLabel(selectedPaymentBankId);
  const debtPaymentBankAppUrl = useMemo(() => buildVietQrBankAppDeeplink({
    selectedBankId: selectedPaymentBankId,
    receivingBankCode: debtPaymentIntent?.receivingBankCode || debtPaymentIntent?.receivingBankName || '',
    receivingAccountNumber: debtPaymentIntent?.receivingBankAccountNumber || '',
    amount: activeDebtPaymentAmount,
    transferContent: debtPaymentReference,
    receivingAccountName: debtPaymentIntent?.receivingBankAccountName || '',
    returnUrl: typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : ''
  }), [
    activeDebtPaymentAmount,
    debtPaymentIntent?.receivingBankAccountName,
    debtPaymentIntent?.receivingBankAccountNumber,
    debtPaymentIntent?.receivingBankCode,
    debtPaymentIntent?.receivingBankName,
    debtPaymentReference,
    selectedPaymentBankId
  ]);

  const getCustomerPortalOrderCode = (item = {}) => {
    if (item.type === 'order') return formatOrderCode(item.id || item.orderId || item.code || item.orderCode || '');
    return item.code || item.orderCode || item.requestCode || item.id || 'Đơn đặt';
  };

  const getCustomerPortalDisplayOrderCode = (item = {}) => {
    const typeKey = item.type || 'order';
    const displayNumber = customerPortalOrderDisplayNumberMap.get(`${typeKey}::${item.id || ''}`)
      || customerPortalOrderDisplayNumberMap.get(`${item.id || ''}`)
      || customerPortalOrderDisplayNumberMap.get(`${item.customerOrderRootId || ''}`)
      || customerPortalOrderDisplayNumberMap.get(`${item.sourceCustomerRequestId || ''}`)
      || customerPortalOrderDisplayNumberMap.get(`${item.clientRequestId || ''}`)
      || customerPortalOrderDisplayNumberMap.get(`${item.requestCode || ''}`)
      || customerPortalOrderDisplayNumberMap.get(`${item.orderId || ''}`)
      || customerPortalOrderDisplayNumberMap.get(`${item.orderCode || ''}`)
      || customerPortalOrderDisplayNumberMap.get(`${item.code || ''}`);
    if (typeKey === 'request') {
      return displayNumber ? `Đơn đặt ${displayNumber}` : 'Đơn đặt';
    }
    const orderCode = getCustomerPortalOrderCode(item);
    return displayNumber ? `Đơn hàng ${displayNumber} - ${orderCode}` : `Đơn hàng - ${orderCode}`;
  };

  const getCustomerPortalOrderLines = (item = {}) => mapCustomerPortalOrderLines(item);

  const getCustomerPortalOrderTotal = (item = {}) => getMappedCustomerPortalOrderTotal(item);

  const formatCustomerQuantityLabel = (line = {}) => {
    if (!line.quantity) return '--';
    const actualLabel = `${formatNumber(line.quantity)}${line.unit ? ` ${line.unit}` : ''}`;
    const hasSeparateBilling = line.billingQuantity > 0 && (
      !isSameBillingUnit(line.unit, line.billingUnit)
      || parseLooseQuantityValue(line.quantity) !== parseLooseQuantityValue(line.billingQuantity)
    );
    if (!hasSeparateBilling) return actualLabel;
    return `${actualLabel} • tính tiền ${formatNumber(line.billingQuantity)} ${line.billingUnit}`;
  };

  const formatCustomerUnitPriceLabel = (line = {}) => `${formatCurrency(line.unitPrice)} đ${line.billingUnit ? `/${line.billingUnit}` : ''}`;

  const formatCustomerConversionLabel = (line = {}) => {
    const conversion = getCustomerPortalLineConversion(line);
    if (!conversion?.fromUnit || !conversion?.toUnit) return '';
    return `Quy đổi: 1 ${conversion.fromUnit} = ${formatNumber(conversion.factor)} ${conversion.toUnit}`;
  };

  const customerOrderTrackingSteps = ['Lên đơn', 'Nhận đơn', 'Đang giao', 'Đã giao'];
  const getCustomerPortalTrackingTimestamp = (item = {}) => (
    getEntityTimestamp(item)
    || Date.parse(item.updatedAt || item.createdAt || item.date || item.requestedAt || '') || 0
  );
  const getCustomerPortalTrackingDateKey = (item = {}) => (
    resolveEntityDateKey(item, '') || `${item.date || item.deliveryDate || item.requestedDeliveryDate || item.createdAt || item.updatedAt || ''}`.slice(0, 10)
  );
  const getCustomerPortalTrackingRefs = (item = {}) => new Set([
    item.id,
    item.orderId,
    item.orderCode,
    item.code,
    item.requestCode,
    item.clientRequestId,
    item.customerOrderRootId,
    item.sourceCustomerRequestId,
    item.sourceOrderRequestId,
    item.sourceOrderRequestRowKey,
    item.orderRequestId,
    item.orderRequestRowKey,
    item.customerRequestId,
    item.requestRowKey,
    item.rowKey,
    item.sourceMessageId
  ].filter(Boolean).map(value => `${value}`));
  const getCustomerPortalTrackingProductKeys = (item = {}) => {
    const sourceLines = Array.isArray(item.items) && item.items.length
      ? item.items
      : [item.primaryItem || item].filter(Boolean);
    const keys = new Set();
    sourceLines.forEach((line = {}) => {
      [
        line.productId,
        line.productCode,
        line.productName,
        line.productNameSnapshot,
        line.name,
        line.shortName,
        line.product?.id,
        line.product?.name,
        line.product?.shortName,
        item.productId,
        item.productCode,
        item.productName,
        item.productNameSnapshot,
        item.name,
        item.shortName
      ].filter(Boolean).forEach((value) => {
        keys.add(`${value}`);
        keys.add(normalizeLookupText(value));
      });
    });
    return keys;
  };
  const hasCustomerPortalTrackingIntersection = (leftSet, rightSet) => {
    if (!leftSet?.size || !rightSet?.size) return false;
    for (const value of leftSet) {
      if (rightSet.has(value)) return true;
    }
    return false;
  };
  const isCustomerPortalDispatchLinked = (dispatch, sourceItem, sourceProductKeys, sourceRefs) => {
    const dispatchRefs = getCustomerPortalTrackingRefs(dispatch);
    if (hasCustomerPortalTrackingIntersection(sourceRefs, dispatchRefs)) return true;
    if (!hasCustomerPortalTrackingIntersection(sourceProductKeys, getCustomerPortalTrackingProductKeys(dispatch))) return false;
    const sourceTime = getCustomerPortalTrackingTimestamp(sourceItem);
    const dispatchTime = getCustomerPortalTrackingTimestamp(dispatch);
    if (sourceTime && dispatchTime) return dispatchTime >= sourceTime - (60 * 60 * 1000);
    const sourceDateKey = getCustomerPortalTrackingDateKey(sourceItem);
    const dispatchDateKey = getCustomerPortalTrackingDateKey(dispatch);
    if (sourceDateKey && dispatchDateKey) return dispatchDateKey >= sourceDateKey;
    return true;
  };
  const isCustomerPortalDeliveryLinked = (report, sourceItem, matchedDispatches, sourceProductKeys, sourceRefs) => {
    const reportRefs = getCustomerPortalTrackingRefs(report);
    if (hasCustomerPortalTrackingIntersection(sourceRefs, reportRefs)) return true;
    const dispatchIdSet = new Set(matchedDispatches.map(dispatch => `${dispatch.id || ''}`).filter(Boolean));
    if (report.dispatchId && dispatchIdSet.has(`${report.dispatchId}`)) return true;
    if (!hasCustomerPortalTrackingIntersection(sourceProductKeys, getCustomerPortalTrackingProductKeys(report))) return false;
    const sourceTime = getCustomerPortalTrackingTimestamp(sourceItem);
    const reportTime = getCustomerPortalTrackingTimestamp(report);
    if (sourceTime && reportTime) return reportTime >= sourceTime - (60 * 60 * 1000);
    const sourceDateKey = getCustomerPortalTrackingDateKey(sourceItem);
    const reportDateKey = getCustomerPortalTrackingDateKey(report);
    return Boolean(sourceDateKey && reportDateKey && reportDateKey >= sourceDateKey);
  };
  const isCustomerPortalTrackingDelivered = (item = {}) => {
    if (
      item.customerConfirmedReceived
      || item.customerReceivedAt
      || item.customerReceivedConfirmedAt
      || item.receivedConfirmedAt
      || item.deliveredAt
      || item.deliveryCompletedAt
      || item.completedAt
    ) {
      return true;
    }
    const normalizedStatus = normalizeLookupText([
      item.status,
      item.reviewStatus,
      item.orderStatus,
      item.deliveryStatus,
      item.trackingStatus,
      item.customerStatus
    ].filter(Boolean).join(' '));
    return [
      'delivered',
      'completed',
      'complete',
      'done',
      'customer received',
      'customer_received',
      'received by customer',
      'da giao',
      'giao thanh cong',
      'da nhan hang',
      'hoan thanh'
    ].some(word => normalizedStatus.includes(word));
  };
  const getCustomerPortalDispatchDriverInfo = (dispatch = {}) => {
    const driverIds = getDeliveryAssignmentIds(dispatch);
    const driverNames = driverIds
      .map(driverId => customerPortalEmployeeLookup.get(driverId)?.name)
      .filter(Boolean);
    const fallbackName = `${dispatch.assignedDriverNameSnapshot || dispatch.driverNameSnapshot || dispatch.assignedDriverName || dispatch.driverName || ''}`.trim();
    const driverName = (driverNames.length ? driverNames.join(', ') : fallbackName).trim();
    return { driverId: driverIds[0] || '', driverName };
  };
  const getCustomerPortalDispatchDriverSummary = (dispatches = []) => {
    const driverMap = new Map();
    dispatches.forEach((dispatch) => {
      const driverInfo = getCustomerPortalDispatchDriverInfo(dispatch);
      const driverKey = driverInfo.driverId || normalizeLookupText(driverInfo.driverName);
      if (!driverKey) return;
      driverMap.set(driverKey, driverInfo.driverName || 'Tài xế được phân công');
    });
    return Array.from(driverMap.values()).filter(Boolean).join(', ');
  };
  const customerOrderTrackingRows = useMemo(() => {
    const customerId = customerProfile?.id || '';
    if (!customerId) return [];
    const customerDispatches = safeWarehouseDispatches
      .filter(dispatch => dispatch.customerId === customerId && !dispatch.isArchived);
    const customerReports = safeDeliveryReports
      .filter(report => report.customerId === customerId && !report.isArchived);
    const receivedStatusWords = ['approved', 'confirmed', 'accepted', 'converted', 'processing', 'preparing', 'da duyet', 'da nhan', 'da xac nhan', 'xac nhan'];

    return customerRequests
      .slice(0, 12)
      .map((request) => {
        const requestItem = { ...request, type: 'request' };
        if (isCustomerPortalTrackingDelivered(requestItem)) return null;
        const sourceRefs = getCustomerPortalTrackingRefs(requestItem);
        const sourceProductKeys = getCustomerPortalTrackingProductKeys(requestItem);
        const matchedOrders = customerOrders.filter((order) => {
          const orderRefs = getCustomerPortalTrackingRefs(order);
          if (hasCustomerPortalTrackingIntersection(sourceRefs, orderRefs)) return true;
          const hasSameProducts = hasCustomerPortalTrackingIntersection(sourceProductKeys, getCustomerPortalTrackingProductKeys(order));
          if (!hasSameProducts) return false;
          const requestDateKey = getCustomerPortalTrackingDateKey(requestItem);
          const orderDateKey = getCustomerPortalTrackingDateKey(order);
          return Boolean(requestDateKey && orderDateKey && orderDateKey >= requestDateKey);
        });
        const matchedDispatches = customerDispatches.filter(dispatch => (
          isCustomerPortalDispatchLinked(dispatch, requestItem, sourceProductKeys, sourceRefs)
        ));
        const matchedReports = customerReports.filter(report => (
          isCustomerPortalDeliveryLinked(report, requestItem, matchedDispatches, sourceProductKeys, sourceRefs)
        ));
        const normalizedStatus = normalizeLookupText(`${request.status || ''} ${request.reviewStatus || ''} ${request.orderStatus || ''}`);
        const isReceived = matchedOrders.length > 0 || receivedStatusWords.some(word => normalizedStatus.includes(word));
        const stageIndex = matchedReports.length > 0
          ? 3
          : (matchedDispatches.length > 0 ? 2 : (isReceived ? 1 : 0));
        if (stageIndex >= 3) return null;
        const assignedDriverSummary = stageIndex >= 2 ? getCustomerPortalDispatchDriverSummary(matchedDispatches) : '';
        const lines = getCustomerPortalOrderLines(requestItem);
        const productSummary = lines
          .slice(0, 3)
          .map(line => `${line.productName}${line.quantity ? ` ${formatCustomerQuantityLabel(line)}` : ''}`)
          .join(', ');
        const rowId = request.id || request.clientRequestId || request.requestCode || `${request.customerId}_${request.createdAt || request.date || ''}`;

        return {
          id: rowId,
          sourceRequestId: request.id || '',
          code: getCustomerPortalDisplayOrderCode(requestItem),
          dateLabel: formatDateTimeLabel(request.updatedAt || request.createdAt || request.date || request.requestedAt),
          productSummary: productSummary || 'Đơn đặt hàng',
          stageIndex,
          statusLabel: customerOrderTrackingSteps[stageIndex],
          assignedDriverSummary,
          canConfirmReceived: stageIndex >= 2 && Boolean(request.id),
          dispatchCount: matchedDispatches.length,
          reportCount: matchedReports.length,
          timestamp: getCustomerPortalTrackingTimestamp(requestItem)
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 6);
  }, [customerOrders, customerPortalEmployeeLookup, customerProfile?.id, customerRequests, safeDeliveryReports, safeWarehouseDispatches]);

  const handleConfirmCustomerOrderReceived = async (row) => {
    const requestId = row?.sourceRequestId || '';
    if (!requestId || typeof onEditOrderRequest !== 'function') return;
    const now = new Date().toISOString();
    setConfirmingReceivedTrackingId(row.id || requestId);
    try {
      await onEditOrderRequest(requestId, {
        status: 'completed',
        orderStatus: 'delivered',
        deliveryStatus: 'delivered',
        trackingStatus: 'delivered',
        customerStatus: 'received',
        customerConfirmedReceived: true,
        customerReceivedAt: now,
        customerReceivedConfirmedAt: now,
        deliveredAt: now,
        completedAt: now
      }, 'customer_portal');
      setSubmitMessage('Đã xác nhận nhận hàng.');
    } catch (error) {
      setSubmitMessage(getFriendlyFirebaseErrorMessage(error, 'Chưa xác nhận được đã nhận hàng. Vui lòng thử lại.'));
    } finally {
      setConfirmingReceivedTrackingId('');
    }
  };

  const openCustomerProfileEditor = () => {
    setActiveTab('more');
    setIsCustomerProfileEditorOpen(true);
    window.setTimeout(() => {
      document.getElementById('customer-profile-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  const resolveCustomerUnitPrice = (product, branchId = '') => (
    resolveCustomerPortalProductConfiguration(product, branchId || selectedBranchId).unitPrice || 0
  );

  const normalizeCustomerCartItem = (item = {}, { forceCurrentConfiguration = false } = {}) => {
    const product = item.productId ? customerVisibleProducts.find(productItem => productItem.id === item.productId) : null;
    if (!product) return item;
    const snapshot = buildCustomerPortalBillingSnapshot({
      item,
      product,
      branchId: item.branchId || '',
      forceCurrentConfiguration,
    });
    return {
      ...item,
      ...snapshot,
      orderUnit: snapshot.orderUnit || item.orderUnit || item.quantityUnit || item.actualUnit || item.unit || '',
      unit: snapshot.orderUnit || snapshot.actualUnit,
      quantityUnit: snapshot.orderUnit || snapshot.actualUnit,
      actualUnit: snapshot.actualUnit,
      price: snapshot.unitPrice,
      total: snapshot.amount,
      size: snapshot.sizeLabel,
      attributeLabel: snapshot.attributeLabel,
    };
  };

  const addToCart = (product) => {
    if (!product?.id || !isCustomerVisibleProduct(product) || !customerVisibleProductIds.has(`${product.id}`)) {
      setSubmitMessage('Sản phẩm này hiện không được công ty hiển thị cho tài khoản khách hàng.');
      return;
    }
    const branchId = selectedCustomerBranch?.id || '';
    const branchName = selectedCustomerBranch ? getCustomerBranchDisplayName(selectedCustomerBranch) : '';
    const configuration = resolveCustomerPortalProductConfiguration(product, branchId);
    const orderUnit = normalizeProductPricingUnit(
      configuration.defaultOrderUnit || resolveCustomerProductActualUnit(configuration, product)
    );
    const baseItem = {
      productId: product.id,
      productName: product.name || product.shortName || 'Sản phẩm',
      productNameSnapshot: product.name || product.shortName || 'Sản phẩm',
      shortName: product.shortName || '',
      branchId,
      branchName,
      branchAddress: selectedCustomerBranch?.address || '',
      quantity: 1,
      actualQuantity: 1,
      actualUnit: orderUnit,
      orderUnit,
      quantityUnit: orderUnit,
      unit: orderUnit,
      isDraftCartLine: true,
      size: configuration.sizeLabel || getCustomerProductSize(customerProfile, product),
      sizeLabel: configuration.sizeLabel || getCustomerProductSize(customerProfile, product),
      attributeLabel: configuration.attributeLabel || getCustomerProductAttribute(customerProfile, product),
      configurationId: configuration.configurationId || '',
    };
    setCart(prev => {
      const exists = prev.find(item => item.productId === product.id && (item.branchId || '') === branchId);
      if (exists) return prev.map(item => item.lineId === exists.lineId
        ? normalizeCustomerCartItem({ ...item, quantity: (parseFloat(item.quantity) || 0) + 1, actualQuantity: (parseFloat(item.quantity) || 0) + 1 })
        : item);
      return [{
        ...normalizeCustomerCartItem(baseItem),
        lineId: `${product.id}_${branchId || 'main'}_${Date.now()}`,
      }, ...prev];
    });
  };

  const updateCartItem = (lineId, patch) => setCart(prev => prev.map(item => {
    if (item.lineId !== lineId) return item;
    const nextPatch = typeof patch === 'function' ? patch(item) : patch;
    const nextItem = { ...item, ...nextPatch };
    if (Object.prototype.hasOwnProperty.call(nextPatch || {}, 'quantity')) nextItem.actualQuantity = nextItem.quantity;
    const hasOrderUnitPatch = ['orderUnit', 'quantityUnit', 'actualUnit', 'unit']
      .some(field => Object.prototype.hasOwnProperty.call(nextPatch || {}, field));
    if (hasOrderUnitPatch) {
      const orderUnit = normalizeProductPricingUnit(
        nextPatch?.orderUnit || nextPatch?.quantityUnit || nextPatch?.actualUnit || nextPatch?.unit
      );
      nextItem.orderUnit = orderUnit;
      nextItem.quantityUnit = orderUnit;
      nextItem.actualUnit = orderUnit;
      nextItem.unit = orderUnit;
      nextItem.actualWeightKg = 0;
      nextItem.billingQuantity = 0;
      nextItem.pricingQuantity = 0;
      nextItem.conversionFactor = 0;
    }
    const branchChanged = Object.prototype.hasOwnProperty.call(nextPatch || {}, 'branchId')
      && `${nextItem.branchId || ''}` !== `${item.branchId || ''}`;
    return normalizeCustomerCartItem(nextItem, { forceCurrentConfiguration: branchChanged });
  }));
  const removeCartItem = (lineId) => setCart(prev => prev.filter(item => item.lineId !== lineId));

  const handleOpenDebtPayment = async () => {
    if(!hasFreshFinancialAccess()){setDebtPaymentActionMessage('Đang đối chiếu công nợ và thanh toán. Vui lòng chờ xác nhận dữ liệu mới.');return;}
    if (isPreparingDebtPayment) return;
    if (customerPaymentAmount <= 0) {
      setDebtPaymentActionMessage(debtPaymentAmount > 0
        ? 'Khoản nợ này chưa gắn với hóa đơn để tạo QR tự đối soát. Vui lòng liên hệ công ty.'
        : 'Hiện tại bạn không có công nợ cần thanh toán.');
      return;
    }
    const payableOrders = selectedPaymentOrders.length > 0
      ? selectedPaymentOrders
      : unpaidCustomerOrdersForPayment;
    const orderIds = payableOrders
      .map(order => `${order.id || order.orderId || ''}`.trim())
      .filter(Boolean);
    if (!orderIds.length) {
      setDebtPaymentActionMessage('Không tìm thấy hóa đơn hợp lệ để tạo QR thanh toán.');
      return;
    }

    setIsPreparingDebtPayment(true);
    setDebtPaymentActionMessage('');
    try {
      const payment = await requestCustomerDebtPaymentIntent({ firebaseUser, appId, orderIds });
      if(!hasFreshFinancialAccess())return;
      setDebtPaymentIntent(payment);
      setIsPaymentSheetOpen(true);
    } catch (error) {
      setDebtPaymentActionMessage(error?.message || 'Chưa tạo được QR thanh toán công nợ. Vui lòng thử lại.');
    } finally {
      setIsPreparingDebtPayment(false);
    }
  };

  const handleConfirmPaymentTransfer = async () => {
    if(!hasFreshFinancialAccess())return;
    if (!debtPaymentReference) return;
    if (!selectedPaymentBankAppId || !debtPaymentBankAppUrl) {
      const copied = await copyTextToClipboard(debtPaymentReference);
      setDebtPaymentActionMessage(
        `${copied ? 'Đã sao chép nội dung chuyển khoản. ' : ''}${selectedPaymentBankName} chưa hỗ trợ mở trực tiếp; vui lòng quét QR.`
      );
      return;
    }

    const paymentFallbackUrl = debtPaymentCheckoutUrl || debtPaymentQrUrl;
    const { opened, copied } = await launchBankPaymentAndCopyReference({
      openPayment: () => hasFreshFinancialAccess()?openExternalPaymentUrl(debtPaymentBankAppUrl, paymentFallbackUrl):false,
      copyReference: () => hasFreshFinancialAccess()?copyTextToClipboard(debtPaymentReference):false
    });

    setDebtPaymentActionMessage(opened
      ? `${copied ? 'Đã sao chép nội dung chuyển khoản. ' : ''}Đã mở liên kết thanh toán ${selectedPaymentBankName}.`
      : `${copied ? 'Đã sao chép nội dung chuyển khoản. ' : ''}Chưa mở được ${selectedPaymentBankName}; vui lòng quét QR.`
    );
  };

  const handleCopyDebtPaymentReference = async () => {
    if(!hasFreshFinancialAccess())return;
    if (!debtPaymentReference) return;
    const copied = await copyTextToClipboard(debtPaymentReference);
    setDebtPaymentActionMessage(copied
      ? 'Đã sao chép chính xác nội dung chuyển khoản.'
      : 'Chưa sao chép được. Vui lòng nhấn giữ mã để sao chép.');
  };

  const CustomerDebtPaymentButton = ({ compact = false }) => {
    if (!financialReady || debtPaymentAmount <= 0) return null;
    if (compact) {
      return (
        <button
          type="button"
          onClick={() => {
            setActiveTab('debt');
            window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
          }}
          className="mt-3 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-emerald-100"
        >
          Thanh toán nợ {formatCurrency(debtPaymentAmount)}
        </button>
      );
    }
    const selectedOrderLabel = selectedPaymentOrders.length > 0
      ? ` (${selectedPaymentOrders.length} đơn)`
      : '';
    return (
      <button
        type="button"
        onClick={handleOpenDebtPayment}
        disabled={isPreparingDebtPayment || customerPaymentAmount <= 0}
        className="mt-4 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-emerald-100 disabled:from-gray-300 disabled:to-gray-300 disabled:shadow-none"
      >
        {isPreparingDebtPayment
          ? 'Đang tạo QR chính xác...'
          : `Thanh toán ${formatCurrency(customerPaymentAmount)}${selectedOrderLabel}`}
      </button>
    );
  };

  const openPointWithdrawSheet = () => {
    if(!hasFreshFinancialAccess())return;
    setPointWithdrawMode(debtPaymentAmount > 0 ? 'debt' : 'gift');
    setPointWithdrawInput(debtPaymentAmount > 0 && maxRedeemPointsForDebt > 0 ? String(maxRedeemPointsForDebt) : '');
    setSelectedPointRewardId(activeRewardCatalog[0]?.id || '');
    setPointWithdrawNote('');
    setPointWithdrawMessage('');
    setIsPointWithdrawSheetOpen(true);
  };

  const handleRedeemPointsForDebt = async () => {
    if(!hasFreshFinancialAccess()){setRedeemPointsMessage('Đang đối chiếu điểm và công nợ. Vui lòng chờ xác nhận dữ liệu mới.');return;}
    if (isRedeemingPoints) return;
    if (!onRedeemCustomerPoints) {
      setRedeemPointsMessage('Công ty chưa bật chức năng dùng điểm trừ công nợ.');
      return;
    }
    if (debtPaymentAmount <= 0) {
      setRedeemPointsMessage('Hiện tại bạn không có công nợ cần trừ điểm.');
      return;
    }
    const pointsToUse = redeemPointsToUse;
    const amount = redeemPointsMoney;
    if (pointsToUse <= 0 || amount <= 0) {
      setRedeemPointsMessage('Vui lòng nhập số điểm muốn dùng.');
      return;
    }
    setIsRedeemingPoints(true);
    setRedeemPointsMessage('');
    try {
      const result = await onRedeemCustomerPoints({
        customerId: customerProfile.id,
        customerName: customerProfile.name || currentUser?.name || '',
        pointsInfo: redemptionPointsInfo,
        pointsToUse,
        pointValue: loyaltyPointValue,
        amount
      });
      if (result?.success === false) throw new Error(result.message || 'Chưa dùng được điểm.');
      setRedeemPointsInput('');
      setRedeemPointsMessage(result?.message || `Đã dùng ${formatNumber(pointsToUse)} điểm để trừ công nợ.`);
    } catch (error) {
      setRedeemPointsMessage(getFriendlyFirebaseErrorMessage(error, 'Chưa dùng được điểm, vui lòng thử lại.'));
    } finally {
      setIsRedeemingPoints(false);
    }
  };

  const handleSubmitPointWithdraw = async () => {
    if(!hasFreshFinancialAccess()){setPointWithdrawMessage('Đang đối chiếu điểm và công nợ. Vui lòng chờ xác nhận dữ liệu mới.');return;}
    if (isSubmittingPointWithdraw) return;
    if (availableCustomerPoints <= 0) {
      setPointWithdrawMessage('Bạn chưa có điểm khả dụng để rút.');
      return;
    }

    if (pointWithdrawMode === 'debt') {
      if (!onRedeemCustomerPoints) {
        setPointWithdrawMessage('Công ty chưa bật chức năng dùng điểm trừ công nợ.');
        return;
      }
      if (debtPaymentAmount <= 0) {
        setPointWithdrawMessage('Hiện tại bạn không có công nợ cần trừ điểm.');
        return;
      }
      const pointsToUse = pointWithdrawPointsToUse;
      const amount = pointWithdrawDebtAmount;
      if (pointsToUse <= 0 || amount <= 0) {
        setPointWithdrawMessage('Vui lòng nhập số điểm muốn rút.');
        return;
      }

      setIsSubmittingPointWithdraw(true);
      setPointWithdrawMessage('');
      try {
        const result = await onRedeemCustomerPoints({
          customerId: customerProfile.id,
          customerName: customerProfile.name || currentUser?.name || '',
          pointsInfo: redemptionPointsInfo,
          pointsToUse,
          pointValue: loyaltyPointValue,
          amount,
          note: pointWithdrawNote || 'Khách hàng rút điểm trừ công nợ',
          actorName: customerProfile.name || currentUser?.name || 'Khách hàng'
        });
        if (result?.success === false) throw new Error(result.message || 'Chưa rút được điểm.');
        setPointWithdrawInput('');
        setRedeemPointsInput('');
        setPointWithdrawMessage(result?.message || `Đã rút ${formatNumber(pointsToUse)} điểm để trừ công nợ.`);
      } catch (error) {
        setPointWithdrawMessage(getFriendlyFirebaseErrorMessage(error, 'Chưa rút được điểm, vui lòng thử lại.'));
      } finally {
        setIsSubmittingPointWithdraw(false);
      }
      return;
    }

    const reward = selectedPointReward || activeRewardCatalog[0] || null;
    const rewardCost = Math.max(0, Math.floor(parseLooseMoneyValue(
      reward?.points ?? reward?.requiredPoints ?? reward?.pointCost ?? reward?.cost ?? 0
    )));
    if (!reward) {
      setPointWithdrawMessage('Công ty chưa có quà tặng để đổi điểm.');
      return;
    }
    if (rewardCost > availableCustomerPoints) {
      setPointWithdrawMessage(`Bạn cần ${formatNumber(rewardCost)} điểm để đổi quà này.`);
      return;
    }
    if (typeof onAddMessage !== 'function') {
      setPointWithdrawMessage('Chưa gửi được yêu cầu đổi quà, vui lòng thử lại sau.');
      return;
    }

    setIsSubmittingPointWithdraw(true);
    setPointWithdrawMessage('');
    try {
      const rewardName = reward.name || reward.title || 'Quà tặng';
      const requestText = [
        `Khách hàng yêu cầu rút điểm đổi quà: ${rewardName}`,
        rewardCost > 0 ? `Số điểm dự kiến: ${formatNumber(rewardCost)}` : '',
        pointWithdrawNote ? `Ghi chú: ${pointWithdrawNote}` : ''
      ].filter(Boolean).join('\n');
      await onAddMessage({
        source: 'customer_portal',
        type: 'loyalty_point_withdraw_request',
        conversationType: 'customer_support',
        conversationId: customerResponsibleConversationId,
        customerId: customerProfile.id,
        customerName: customerProfile.name || currentUser?.name || currentUser?.phone || '',
        customerPhone: customerProfile.phone || currentUser?.phone || '',
        senderType: 'customer',
        senderCustomerId: customerProfile.id,
        senderName: customerProfile.name || currentUser?.name || currentUser?.phone || 'Khách hàng',
        receiverEmpId: responsibleEmployeeId,
        recipientEmpId: responsibleEmployeeId,
        receiverName: responsibleEmployeeName,
        text: requestText,
        message: requestText,
        status: 'unread',
        requestStatus: 'pending',
        rewardId: reward.id || '',
        rewardName,
        pointsRequested: rewardCost,
        note: pointWithdrawNote || ''
      });
      setPointWithdrawMessage('Đã gửi yêu cầu đổi quà cho nhân viên phụ trách.');
      setPointWithdrawNote('');
    } catch (error) {
      setPointWithdrawMessage(getFriendlyFirebaseErrorMessage(error, 'Chưa gửi được yêu cầu đổi quà, vui lòng thử lại.'));
    } finally {
      setIsSubmittingPointWithdraw(false);
    }
  };

  const handleSendCustomerMessage = async () => {
    const cleanText = customerMessageText.trim();
    if (!cleanText) {
      setSubmitMessage('Vui lòng nhập nội dung tin nhắn.');
      return;
    }
    if (typeof onAddMessage !== 'function') {
      setSubmitMessage('Chức năng nhắn tin chưa sẵn sàng, vui lòng thử lại sau.');
      return;
    }

    setCustomerMessageText('');
    setIsSendingCustomerMessage(true);
    try {
      await onAddMessage({
        source: 'customer_portal',
        type: 'customer_to_employee',
        conversationType: 'customer_support',
        conversationId: customerResponsibleConversationId,
        customerId: customerProfile.id,
        customerName: customerProfile.name || currentUser?.name || currentUser?.phone || '',
        customerPhone: customerProfile.phone || currentUser?.phone || '',
        senderType: 'customer',
        senderCustomerId: customerProfile.id,
        senderName: customerProfile.name || currentUser?.name || currentUser?.phone || 'Khách hàng',
        receiverEmpId: responsibleEmployeeId,
        recipientEmpId: responsibleEmployeeId,
        targetEmpId: responsibleEmployeeId,
        receiverName: responsibleEmployeeName,
        recipientName: responsibleEmployeeName,
        targetEmpName: responsibleEmployeeName,
        receiverPhone: responsibleEmployeePhone,
        recipientPhone: responsibleEmployeePhone,
        targetEmpPhone: responsibleEmployeePhone,
        text: cleanText,
        message: cleanText,
        status: 'unread'
      });
      setSubmitMessage(responsibleEmployeeId
        ? 'Đã gửi tin nhắn cho nhân viên phụ trách.'
        : 'Đã gửi tin nhắn vào hàng chờ phân loại.');
    } catch (error) {
      setCustomerMessageText(prev => prev || cleanText);
      setSubmitMessage(getFriendlyFirebaseErrorMessage(error, 'Chưa gửi được tin nhắn, vui lòng thử lại.'));
    } finally {
      setIsSendingCustomerMessage(false);
    }
  };

  const renderPointWithdrawSheet = () => {
    if (!isPointWithdrawSheetOpen) return null;
    const isDebtMode = pointWithdrawMode === 'debt';
    const canSubmitDebt = isDebtMode && debtPaymentAmount > 0 && pointWithdrawPointsNumber > 0 && pointWithdrawDebtAmount > 0;
    const canSubmitGift = !isDebtMode && Boolean(selectedPointReward || activeRewardCatalog[0]);
    const withdrawMessageIsSuccess = pointWithdrawMessage.startsWith('Đã ');

    return (
      <div
        style={{display:financialReady?undefined:'none'}} aria-hidden={!financialReady}
        className="fixed inset-0 z-[93] flex items-end justify-center bg-black/45 p-4 sm:items-center"
        onClick={() => setIsPointWithdrawSheetOpen(false)}
      >
        <div
          className="w-full max-w-md overflow-hidden rounded-[32px] bg-white shadow-2xl"
          onClick={event => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-amber-100 bg-gradient-to-br from-amber-50 via-white to-emerald-50 p-5">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Rút điểm</p>
              <h3 className="mt-1 text-2xl font-black text-gray-900">{formatNumber(availableCustomerPoints)} điểm</h3>
              <p className="mt-1 text-xs font-semibold text-gray-500">
                Quy đổi: 1 điểm = {formatCurrency(loyaltyPointValue)} đ
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsPointWithdrawSheetOpen(false)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-gray-500 shadow-sm"
              aria-label="Đóng rút điểm"
            >
              <X size={20} />
            </button>
          </div>

          <div className="max-h-[65vh] overflow-y-auto p-5">
            <div className="grid grid-cols-2 gap-2 rounded-3xl bg-gray-50 p-1.5">
              <button
                type="button"
                onClick={() => {
                  setPointWithdrawMode('debt');
                  setPointWithdrawInput(maxRedeemPointsForDebt > 0 ? String(maxRedeemPointsForDebt) : '');
                  setPointWithdrawMessage('');
                }}
                className={`rounded-2xl px-3 py-3 text-sm font-extrabold transition ${isDebtMode ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}
              >
                Trừ công nợ
              </button>
              <button
                type="button"
                onClick={() => {
                  setPointWithdrawMode('gift');
                  setSelectedPointRewardId(selectedPointRewardId || activeRewardCatalog[0]?.id || '');
                  setPointWithdrawMessage('');
                }}
                className={`rounded-2xl px-3 py-3 text-sm font-extrabold transition ${!isDebtMode ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-500'}`}
              >
                Đổi quà
              </button>
            </div>

            {isDebtMode ? (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-3 text-center">
                    <p className="text-[10px] font-black uppercase text-emerald-700">Công nợ</p>
                    <p className="mt-1 text-lg font-black text-gray-900">{formatCurrency(debtPaymentAmount)} đ</p>
                  </div>
                  <div className="rounded-3xl border border-amber-100 bg-amber-50 p-3 text-center">
                    <p className="text-[10px] font-black uppercase text-amber-700">Sẽ trừ</p>
                    <p className="mt-1 text-lg font-black text-gray-900">{formatCurrency(pointWithdrawDebtAmount)} đ</p>
                  </div>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={pointWithdrawInput}
                    onChange={event => setPointWithdrawInput(event.target.value)}
                    placeholder="Nhập số điểm muốn rút"
                    className="min-w-0 rounded-3xl border border-amber-100 bg-white px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-amber-300"
                  />
                  <button
                    type="button"
                    onClick={() => setPointWithdrawInput(String(maxRedeemPointsForDebt))}
                    disabled={maxRedeemPointsForDebt <= 0}
                    className="rounded-3xl bg-amber-100 px-4 py-3 text-xs font-extrabold text-amber-800 disabled:opacity-40"
                  >
                    Tối đa
                  </button>
                </div>
                {debtPaymentAmount <= 0 && (
                  <p className="rounded-2xl bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500">
                    Bạn chưa có công nợ cần trừ. Có thể chuyển sang lựa chọn đổi quà nếu công ty đã tạo quà tặng.
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {activeRewardCatalog.length > 0 ? activeRewardCatalog.map((reward) => {
                  const rewardCost = Math.max(0, Math.floor(parseLooseMoneyValue(
                    reward.points ?? reward.requiredPoints ?? reward.pointCost ?? reward.cost ?? 0
                  )));
                  const selected = (selectedPointRewardId || activeRewardCatalog[0]?.id) === reward.id;
                  return (
                    <button
                      key={reward.id || reward.name || reward.title}
                      type="button"
                      onClick={() => setSelectedPointRewardId(reward.id || '')}
                      className={`w-full rounded-3xl border p-4 text-left transition ${selected ? 'border-amber-300 bg-amber-50 shadow-sm' : 'border-gray-100 bg-white'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-extrabold text-gray-900">{reward.name || reward.title || 'Quà tặng'}</p>
                          {reward.description && <p className="mt-1 line-clamp-2 text-xs font-semibold text-gray-500">{reward.description}</p>}
                        </div>
                        <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-black text-amber-700 shadow-sm">
                          {formatNumber(rewardCost)} điểm
                        </span>
                      </div>
                    </button>
                  );
                }) : (
                  <CustomerEmptyState text="Công ty chưa tạo quà tặng để đổi điểm." />
                )}
                {selectedPointReward && selectedPointRewardCost > availableCustomerPoints && (
                  <p className="rounded-2xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
                    Bạn chưa đủ điểm để đổi quà này.
                  </p>
                )}
              </div>
            )}

            <textarea
              value={pointWithdrawNote}
              onChange={event => setPointWithdrawNote(event.target.value)}
              rows={2}
              placeholder="Ghi chú thêm nếu cần"
              className="mt-4 w-full rounded-3xl border border-gray-100 bg-gray-50/70 p-3 text-sm font-semibold text-gray-800 outline-none focus:border-emerald-200"
            />

            {pointWithdrawMessage && (
              <p className={`mt-3 rounded-2xl px-3 py-2 text-xs font-bold ${withdrawMessageIsSuccess ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                {pointWithdrawMessage}
              </p>
            )}

            <button
              type="button"
              onClick={handleSubmitPointWithdraw}
              disabled={!financialReady || isSubmittingPointWithdraw || (isDebtMode ? !canSubmitDebt : !canSubmitGift)}
              className="mt-4 w-full rounded-3xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-emerald-100 disabled:from-gray-300 disabled:to-gray-300 disabled:shadow-none"
            >
              {isSubmittingPointWithdraw
                ? 'Đang xử lý...'
                : (isDebtMode ? 'Rút điểm trừ công nợ' : 'Gửi yêu cầu đổi quà')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderCustomerMessages = () => {
    if (selectedCustomerConversation) {
      const conversation = selectedCustomerConversation;
      const conversationItems = Array.isArray(conversation.items) ? conversation.items : [];
      const isSalesConversation = conversation.kind === 'sales_chat';
      return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedCustomerConversationId('')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-gray-600 shadow-sm ring-1 ring-gray-100"
              aria-label="Quay lại danh sách tin nhắn"
            >
              <ChevronLeft size={22} />
            </button>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">
                {isSalesConversation ? 'Trao đổi' : 'Thông báo'}
              </p>
              <h2 className="truncate text-xl font-extrabold text-gray-950">{conversation.label}</h2>
            </div>
          </div>

          <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
            <div className="max-h-[min(62vh,680px)] space-y-3 overflow-y-auto bg-gray-50/70 p-4">
              {conversationItems.length > 0 ? conversationItems.map((item, index) => {
                const isNotification = item.__inboxKind === 'notification';
                const isMine = !isNotification && (
                  item.senderType === 'customer' || item.senderCustomerId === customerInboxCustomerId
                );
                const itemText = item.text || item.message || item.body || item.note || item.description || item.title || 'Có thông báo mới.';
                const itemKey = `${item.__inboxKind || 'message'}-${item.id || getCustomerInboxItemTimestamp(item) || index}`;
                if (isNotification) {
                  return (
                    <div key={itemKey} className="flex justify-start">
                      <div className="max-w-[88%] rounded-[22px] border border-sky-100 bg-white px-4 py-3 text-gray-800 shadow-sm">
                        <div className="mb-1 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-sky-600">
                          <Megaphone size={14} />
                          <span>{item.title || conversation.label}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm font-semibold leading-5">{itemText}</p>
                        <p className="mt-1 text-[10px] font-bold text-gray-400">
                          {formatDateTimeLabel(item.createdAt || getCustomerInboxItemTimestamp(item))}
                        </p>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={itemKey} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[78%] rounded-[22px] px-4 py-2.5 shadow-sm ${isMine ? 'bg-emerald-500 text-white' : 'border border-gray-100 bg-white text-gray-800'}`}>
                      <p className="whitespace-pre-wrap text-sm font-semibold leading-5">{itemText}</p>
                      <p className={`mt-1 text-[10px] font-bold ${isMine ? 'text-emerald-50/80' : 'text-gray-400'}`}>
                        {formatDateTimeLabel(item.createdAt || getCustomerInboxItemTimestamp(item))}
                      </p>
                    </div>
                  </div>
                );
              }) : (
                <div className="rounded-3xl border border-dashed border-emerald-100 bg-white p-5 text-center">
                  <MessageCircle className="mx-auto mb-2 text-emerald-500" size={24} />
                  <p className="text-sm font-bold text-gray-700">
                    {isSalesConversation ? 'Chưa có tin nhắn nào.' : 'Chưa có thông báo nào.'}
                  </p>
                  {isSalesConversation && (
                    <p className="mt-1 text-xs text-gray-500">Bạn có thể nhắn trực tiếp cho nhân viên phụ trách tại đây.</p>
                  )}
                </div>
              )}
            </div>

            {isSalesConversation && (
              <div className="border-t border-gray-100 bg-white p-4">
                <div className="flex items-end gap-2">
                  <textarea
                    value={customerMessageText}
                    onChange={event => setCustomerMessageText(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing) {
                        event.preventDefault();
                        handleSendCustomerMessage();
                      }
                    }}
                    enterKeyHint="send"
                    rows={2}
                    placeholder="Nhập nội dung cần trao đổi..."
                    className="min-h-[72px] flex-1 resize-none rounded-3xl border border-emerald-100 bg-emerald-50/40 p-3 text-sm font-semibold outline-none focus:border-emerald-300"
                  />
                  <button
                    type="button"
                    onClick={handleSendCustomerMessage}
                    disabled={isSendingCustomerMessage || !customerMessageText.trim()}
                    className="flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 text-sm font-extrabold text-white shadow-lg shadow-emerald-100 disabled:from-gray-300 disabled:to-gray-300"
                    aria-label="Gửi tin nhắn"
                  >
                    <Send size={18} />
                    <span className="hidden sm:inline">{isSendingCustomerMessage ? 'Đang gửi' : 'Gửi'}</span>
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      );
    }

    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">Hộp thư của tôi</p>
          <h2 className="mt-1 text-2xl font-extrabold text-gray-950">Tin nhắn</h2>
          <p className="mt-1 text-sm font-medium text-gray-500">Thông báo và trao đổi được cập nhật ngay khi có dữ liệu mới.</p>
        </div>
        <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          {customerInboxConversations.length > 0 ? customerInboxConversations.map(conversation => {
            const unreadCount = getUnreadCustomerInboxItems(conversation, customerInboxCustomerId).length;
            const isSalesConversation = conversation.kind === 'sales_chat';
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => openCustomerConversation(conversation)}
                className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-4 text-left transition last:border-b-0 hover:bg-emerald-50/40 active:bg-emerald-50"
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${isSalesConversation ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'}`}>
                  {isSalesConversation ? <MessageCircle size={20} /> : <Megaphone size={20} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`truncate text-sm ${unreadCount > 0 ? 'font-extrabold text-gray-950' : 'font-bold text-gray-800'}`}>{conversation.label}</span>
                    {unreadCount > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>
                    )}
                  </span>
                  <span className={`mt-1 block truncate text-sm ${unreadCount > 0 ? 'font-semibold text-gray-700' : 'text-gray-500'}`}>{conversation.preview}</span>
                </span>
                <span className="shrink-0 text-[10px] font-bold text-gray-400">
                  {conversation.latestTimestamp ? formatDateTimeLabel(conversation.latestTimestamp) : ''}
                </span>
              </button>
            );
          }) : (
            <div className="p-6 text-center">
              <MessageCircle className="mx-auto mb-2 text-emerald-500" size={26} />
              <p className="text-sm font-bold text-gray-700">Chưa có tin nhắn hoặc thông báo.</p>
            </div>
          )}
        </section>
      </div>
    );
  };

  const renderPaymentSheet = () => {
    if (!isPaymentSheetOpen) return null;
    return (
      <div style={{display:financialReady?undefined:'none'}} aria-hidden={!financialReady} className="fixed inset-0 z-[90] bg-white text-slate-950">
        <div className="customer-payment-sheet mx-auto flex min-h-screen w-full max-w-md flex-col overflow-y-auto px-5 pt-6">
          <button
            type="button"
            onClick={() => setIsPaymentSheetOpen(false)}
            className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-900 shadow-sm"
            aria-label="Đóng thanh toán"
          >
            <X size={28} />
          </button>

          <div className="space-y-5">
            <section>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-700">Thanh toán công nợ</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">Quét QR hoặc mở app ngân hàng</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">QR đã chứa đúng số tiền và nội dung để SePay tự đối soát.</p>
            </section>

            <section className="rounded-[2rem] border border-emerald-100 bg-emerald-50/60 p-4 text-center">
              <div className="flex flex-col items-center">
                <img
                  src={debtPaymentQrUrl}
                  alt="Mã QR thanh toán"
                  className="h-56 w-56 rounded-3xl border border-white bg-white object-contain p-3 shadow-sm"
                />
                <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{formatNumber(activeDebtPaymentAmount)} đ</p>
                <p className="mt-1 text-sm font-semibold text-emerald-700">{activeDebtPaymentOrderCount} hóa đơn</p>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
              <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Nội dung chuyển khoản</p>
                  <p className="mt-1 break-all text-xl font-black text-slate-950">{debtPaymentReference}</p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyDebtPaymentReference}
                  className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-emerald-700 shadow-sm"
                >
                  Sao chép
                </button>
              </div>
              <div className="mt-4 border-t border-slate-200 pt-3 text-sm font-semibold text-slate-600">
                <p>{debtPaymentIntent?.receivingBankName || debtPaymentIntent?.receivingBankCode || 'Ngân hàng nhận'}</p>
                <p className="mt-1 font-black text-slate-900">{debtPaymentIntent?.receivingBankAccountNumber || ''}</p>
                <p className="mt-1 text-xs uppercase text-slate-500">{debtPaymentIntent?.receivingBankAccountName || ''}</p>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-100 bg-slate-50/70 p-3">
              <label htmlFor="customer-payment-bank" className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Chọn app ngân hàng muốn mở
              </label>
              <select
                id="customer-payment-bank"
                value={selectedPaymentBankId}
                onChange={event => setSelectedPaymentBankId(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400"
              >
                {BANK_APP_OPEN_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>

              {debtPaymentActionMessage && (
                <p className="mt-3 rounded-2xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">{debtPaymentActionMessage}</p>
              )}

              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
                <p className="min-w-0 text-xs font-semibold leading-5 text-slate-500">
                  App sẽ sao chép mã <strong>{debtPaymentReference}</strong> và mở {selectedPaymentBankName} trên điện thoại.
                </p>
                <button
                  type="button"
                  onClick={handleConfirmPaymentTransfer}
                  className="min-h-11 whitespace-nowrap rounded-[1.2rem] bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-100"
                >
                  Mở {selectedPaymentBankName}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  };

  const canCustomerEditRequest = (request = {}) => {
    const status = `${request.status || request.reviewStatus || ''}`.toLowerCase();
    return !['confirmed', 'preparing', 'shipping', 'completed', 'converted', 'cancelled', 'canceled'].includes(status);
  };

  const startEditCustomerRequest = (request = {}) => {
    if (!request?.id || !canCustomerEditRequest(request)) return;
    const requestItems = (Array.isArray(request.items) && request.items.length > 0)
      ? request.items
      : (request.primaryItem ? [request.primaryItem] : []);
    const unavailableItem = requestItems.find(item => (
      item?.productId && !customerVisibleProductIds.has(`${item.productId}`)
    ));
    if (unavailableItem) {
      setSubmitMessage(`${unavailableItem.productName || 'Sản phẩm này'} hiện đã được công ty ẩn nên không thể chỉnh sửa trong tài khoản khách hàng.`);
      return;
    }
    const nextCart = requestItems.map((item, index) => {
      const product = item.productId ? customerVisibleProducts.find(productItem => productItem.id === item.productId) : null;
      const branchId = item.branchId || item.customerBranchId || '';
      const branch = getCustomerBranchById(customerProfile || {}, branchId, customerVisibleProducts);
      const snapshot = buildCustomerPortalBillingSnapshot({
        item,
        product,
        branchId,
        preserveSavedSnapshot: true,
      });
      return {
        ...item,
        ...snapshot,
        lineId: item.lineId || `${item.productId || `customer_item_${index}`}_${branchId || 'main'}_${index}`,
        productId: item.productId || `customer_item_${index}`,
        productName: item.productName || item.productNameSnapshot || item.description || product?.name || 'Sản phẩm',
        shortName: item.shortName || product?.shortName || '',
        branchId,
        branchName: item.branchName || item.customerBranchName || (branch ? getCustomerBranchDisplayName(branch) : ''),
        branchAddress: item.branchAddress || item.customerBranchAddress || branch?.address || '',
        isDraftCartLine: true,
        orderUnit: snapshot.orderUnit || item.orderUnit || item.quantityUnit || item.actualUnit || item.unit || '',
        unit: snapshot.orderUnit || snapshot.actualUnit,
        quantityUnit: snapshot.orderUnit || snapshot.actualUnit,
        actualUnit: snapshot.actualUnit,
        quantity: snapshot.actualQuantity || item.quantity || 1,
        price: snapshot.unitPrice,
        total: snapshot.amount,
        size: item.size || item.sizeLabel || item.weightKg || '',
        attributeLabel: item.attributeLabel || item.productAttribute || item.attribute || ''
      };
    });
    setCart(nextCart.filter(item => item.productName));
    setDeliveryDate(request.requestedDeliveryDate || request.date || getTodayString());
    setOrderNote(request.note || '');
    setEditingOrderRequestId(request.id);
    setSubmitMessage(`Đang sửa đơn ${request.code || request.orderCode || request.id}. Bấm cập nhật để lưu bản mới nhất.`);
    setActiveTab('order');
  };

  const submitOrderRequest = async () => {
    if(!hasFreshFinancialAccess()){setSubmitMessage('Đang đối chiếu công nợ. Bạn vẫn có thể chọn sản phẩm và chuẩn bị đơn.');return;}
    if (!customerProfile?.id || cart.length === 0 || isSubmittingOrder || isOrderingLocked) return;
    if (cartHasUnresolvedPricing) {
      setSubmitMessage('Chưa thể gửi đơn vì có sản phẩm chưa có quy đổi hợp lệ sang đơn vị tính giá.');
      return;
    }
    setIsSubmittingOrder(true);
    setSubmitMessage('');
    try {
      const normalizedItems = cart
        .filter(item => (parseFloat(item.quantity) || 0) > 0)
        .map(item => {
          const product = item.productId ? customerVisibleProducts.find(productItem => productItem.id === item.productId) : null;
          const branch = getCustomerBranchById(customerProfile || {}, item.branchId, customerVisibleProducts);
          const branchId = item.branchId || branch?.id || '';
          const branchName = item.branchName || (branch ? getCustomerBranchDisplayName(branch) : '');
          const branchAddress = item.branchAddress || branch?.address || '';
          const fixedProductIds = branchId
            ? getCustomerBranchFixedProductIds(customerProfile, branchId, customerVisibleProducts)
            : getCustomerFixedProductIds(customerProfile, customerVisibleProducts);
          const existingSnapshot = resolveTransactionBillingSnapshot({ record: item, product });
          if (!product) {
            throw new Error(`Sản phẩm ${item.productName || ''} hiện đã được công ty ẩn và không thể gửi đơn.`);
          }
          if (!fixedProductIds.includes(product.id) && !existingSnapshot.hasFrozenPricing) {
            throw new Error(`Sản phẩm ${item.productName || ''} không còn trong danh sách cố định của khách hàng.`);
          }
          const snapshot = buildCustomerPortalBillingSnapshot({ item, product, branchId });
          if (!snapshot.billingSnapshotValid || snapshot.pricingPendingActual) {
            const orderUnit = snapshot.orderUnit || item.orderUnit || item.quantityUnit || 'đơn vị đặt';
            const billingUnit = snapshot.basePriceUnit || snapshot.billingUnit || snapshot.pricingUnit || 'đơn vị tính giá';
            const reason = ['MISSING_BILLING_QUANTITY', 'ACTUAL_UNIT_NOT_ALLOWED'].includes(snapshot.billingSnapshotError)
              ? `Chưa có quy đổi hợp lệ từ ${orderUnit} sang ${billingUnit}`
              : 'Cấu hình tính tiền chưa hợp lệ';
            throw new Error(`${reason} cho ${product.name || item.productName || 'sản phẩm'}.`);
          }
          return {
            ...item,
            ...snapshot,
            productId: item.productId,
            productName: item.productName,
            productNameSnapshot: item.productName,
            shortName: item.shortName || '',
            branchId,
            branchName,
            branchAddress,
            customerBranchId: branchId,
            customerBranchName: branchName,
            customerBranchAddress: branchAddress,
            orderUnit: snapshot.orderUnit || item.orderUnit || item.quantityUnit || item.actualUnit || item.unit || '',
            unit: snapshot.orderUnit || snapshot.actualUnit,
            quantityUnit: snapshot.orderUnit || snapshot.actualUnit,
            actualUnit: snapshot.actualUnit,
            basePriceUnit: snapshot.basePriceUnit || snapshot.billingUnit || snapshot.pricingUnit || '',
            conversionFactor: snapshot.conversionFactor || 0,
            unitConversions: snapshot.unitConversions || '',
            price: snapshot.unitPrice,
            total: snapshot.amount,
            size: item.size || '',
            attributeLabel: item.attributeLabel || ''
          };
        });
      if (normalizedItems.length === 0) throw new Error('Vui lòng nhập số lượng sản phẩm.');
      const primaryItem = normalizedItems[0];
      const requestBranches = Array.from(new Map(normalizedItems
        .filter(item => item.branchId)
        .map(item => [item.branchId, {
          id: item.branchId,
          name: item.branchName,
          address: item.branchAddress
        }])
      ).values());
      const customerOrderRootId = editingOrderRequest?.customerOrderRootId || editingOrderRequestId || '';
      const customerSubmittedAt = new Date().toISOString();
      const requestPayload = {
        source: 'customer_portal',
        customerId: customerProfile.id,
        customerName: customerProfile.name || currentUser?.name || '',
        customerNameSnapshot: customerProfile.name || currentUser?.name || '',
        phone: customerProfile.phone || currentUser?.phone || '',
        date: deliveryDate || getTodayString(),
        requestedDeliveryDate: deliveryDate || getTodayString(),
        note: orderNote,
        status: 'accepted',
        reviewStatus: 'accepted',
        reviewStatusLabel: 'Đã nhận',
        customerApprovalStatus: 'accepted',
        employeeApprovalStatus: 'accepted',
        needsEmployeeApproval: false,
        salesEmpId: responsibleEmployeeId,
        assignedSalesEmpId: responsibleEmployeeId,
        responsibleEmployeeId,
        customerSubmittedAt,
        submittedByCustomerAccountId: currentUser?.id || currentUser?.uid || '',
        items: normalizedItems,
        primaryItem,
        customerBranches: requestBranches,
        hasMultipleBranches: requestBranches.length > 1,
        branchId: primaryItem.branchId || '',
        branchName: primaryItem.branchName || '',
        branchAddress: primaryItem.branchAddress || '',
        customerBranchId: primaryItem.branchId || '',
        customerBranchName: primaryItem.branchName || '',
        productId: primaryItem.productId,
        productName: primaryItem.productName,
        quantity: primaryItem.quantity,
        unit: primaryItem.unit,
        orderUnit: primaryItem.orderUnit || primaryItem.quantityUnit || primaryItem.unit,
        basePriceUnit: primaryItem.basePriceUnit || primaryItem.billingUnit || primaryItem.pricingUnit || '',
        conversionFactor: primaryItem.conversionFactor || 0,
        unitPrice: primaryItem.unitPrice,
        totalAmount: normalizedItems.reduce((sum, item) => sum + parseLooseMoneyValue(item.amount), 0),
        createdByRole: 'customer',
        createdByCustomerId: customerProfile.id,
        customerOrderRootId: customerOrderRootId || undefined,
        customerOrderVersion: editingOrderRequest
          ? (parseInt(editingOrderRequest.customerOrderVersion || 1, 10) || 1) + 1
          : 1,
        customerEditedAt: editingOrderRequest ? customerSubmittedAt : ''
      };
      if (editingOrderRequestId && onEditOrderRequest) {
        await onEditOrderRequest(editingOrderRequestId, requestPayload, 'customer_portal');
      } else {
        await onAddOrderRequest('customer_portal', requestPayload);
      }
      setCart([]);
      setOrderNote('');
      setEditingOrderRequestId('');
      setSubmitMessage(editingOrderRequestId
        ? 'Đã cập nhật đơn đặt hàng. Công ty sẽ chỉ thấy bản mới nhất.'
        : 'Đã gửi đơn đặt hàng. Đơn đã vào danh sách của nhân viên phụ trách.');
      setActiveTab('orders');
    } catch (error) {
      setSubmitMessage(getFriendlyFirebaseErrorMessage(error, 'Chưa gửi được đơn đặt hàng.'));
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const saveProfile = async () => {
    if (!customerProfile?.id || !profileDraft) return;
    setIsSavingProfile(true);
    try {
      const locationPayload = profileDraft.location || parseCustomerLocationInput(profileDraft.locationInput);
      const normalizedLocationFields = normalizeCustomerLocationFields(locationPayload || profileDraft.locationInput, profileDraft.address, 'customer_portal_profile');
      await onEditCustomer(customerProfile.id, {
        name: profileDraft.name,
        phone: profileDraft.phone || currentUser?.phone || customerProfile.phone || '',
        avatarUrl: profileDraft.avatarUrl,
        address: profileDraft.address,
        ...normalizedLocationFields,
        birthday: profileDraft.birthday,
        email: profileDraft.email,
        zaloGroupLink: profileDraft.zaloGroupLink
      });
      setSubmitMessage('Đã cập nhật hồ sơ cá nhân.');
    } catch (error) {
      setSubmitMessage(getFriendlyFirebaseErrorMessage(error, 'Chưa lưu được hồ sơ.'));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleUseCurrentGpsForProfile = async () => {
    if (!profileDraft || isGettingProfileGps) return;
    setIsGettingProfileGps(true);
    setSubmitMessage('Đang lấy GPS hiện tại...');
    try {
      const position = await requestCurrentLocation();
      const location = buildCustomerLocationFromPosition(position);
      if (!location) throw new Error('Không đọc được tọa độ GPS.');
      const locationInput = getCustomerLocationShareText({ location, address: profileDraft.address }) || `${location.lat}, ${location.lng}`;
      setProfileDraft(prev => ({
        ...prev,
        location,
        locationInput
      }));
      if (!onEditCustomer || !customerProfile?.id) {
        throw new Error('Chưa kết nối được hồ sơ khách hàng để lưu vị trí.');
      }
      const normalizedLocationFields = normalizeCustomerLocationFields(location, profileDraft.address || customerProfile.address || '', 'customer_portal_gps');
      await onEditCustomer(customerProfile.id, {
        ...normalizedLocationFields,
        address: profileDraft.address || customerProfile.address || '',
      });
      setSubmitMessage(`Đã cập nhật vị trí giao hàng lên hệ thống${location.accuracy ? ` (sai số ${location.accuracy}m)` : ''}.`);
    } catch (error) {
      setSubmitMessage(getFriendlyFirebaseErrorMessage(error, 'Không thể lấy GPS hiện tại. Hãy kiểm tra quyền vị trí.'));
    } finally {
      setIsGettingProfileGps(false);
    }
  };

  const handleCustomerAvatarSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readImageFileAsDataUrl(file, 512, 0.82);
      setProfileDraft(prev => ({ ...(prev || {}), avatarUrl: dataUrl }));
      setSubmitMessage('Đã chọn ảnh đại diện. Bấm Lưu hồ sơ để cập nhật.');
    } catch (error) {
      setSubmitMessage(getFriendlyFirebaseErrorMessage(error, 'Không thể đọc ảnh đại diện.'));
    } finally {
      event.target.value = '';
    }
  };

  const statusLabel = (status = '') => {
    const map = { pending: 'Chờ duyệt', accepted: 'Đã nhận', received: 'Đã nhận', confirmed: 'Đã xác nhận', preparing: 'Đang chuẩn bị', shipping: 'Đang giao', completed: 'Hoàn thành', cancelled: 'Đã hủy', draft: 'Chờ kiểm tra' };
    return map[status] || map[`${status}`.toLowerCase()] || status || 'Đang xử lý';
  };

  const handleCustomerBankLinkSubmit = async (event) => {
    event?.preventDefault?.();
    if (!customerProfile?.id) return;
    const selectedBank = BANK_ID_OPTIONS.find(option => option.value === bankLinkForm.bankCode);
    const payload = {
      bankCode: bankLinkForm.bankCode,
      bankName: bankLinkForm.bankName || selectedBank?.label || getBankOptionLabel(bankLinkForm.bankCode),
      accountNumber: bankLinkForm.accountNumber,
      accountName: bankLinkForm.accountName
    };
    if (!payload.bankCode || !String(payload.accountNumber || '').trim() || !String(payload.accountName || '').trim()) {
      setBankLinkMessage('Vui lòng nhập đủ ngân hàng, số tài khoản và tên chủ tài khoản.');
      return;
    }
    if (typeof onLinkCustomerBankAccount !== 'function') {
      setBankLinkMessage('Chưa sẵn sàng kết nối ngân hàng. Vui lòng thử lại sau.');
      return;
    }

    setIsLinkingBankAccount(true);
    setBankLinkMessage('Đang xác minh và liên kết tài khoản...');
    try {
      const result = await onLinkCustomerBankAccount(customerProfile.id, payload);
      setBankLinkMessage(result?.message || (result?.success ? 'Đã liên kết tài khoản ngân hàng.' : 'Không thể liên kết tài khoản ngân hàng.'));
    } catch (error) {
      setBankLinkMessage(getFriendlyFirebaseErrorMessage(error, 'Liên kết ngân hàng bị lỗi. Vui lòng thử lại.'));
    } finally {
      setIsLinkingBankAccount(false);
    }
  };

  if (!customerProfile?.id) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl p-6 text-center max-w-sm">
          <AlertCircle className="mx-auto text-amber-500 mb-3" size={32} />
          <h2 className="font-bold text-lg">Chưa tìm thấy hồ sơ khách hàng</h2>
          <p className="text-sm text-gray-500 mt-2">Tài khoản này chưa liên kết đúng với hồ sơ khách hàng.</p>
          <button onClick={onLogout} className="mt-5 w-full bg-emerald-500 text-white font-bold py-3 rounded-2xl">Đăng xuất</button>
        </div>
      </div>
    );
  }

  const navItems = [
    { id: 'home', label: 'Trang chủ', icon: Home },
    { id: 'order', label: 'Đặt hàng', icon: ShoppingCart },
    { id: 'orders', label: 'Đơn hàng', icon: Package },
    { id: 'more', label: 'Thêm', icon: MoreHorizontal }
  ];
  const renderCustomerOverview = () => (
    <div className="space-y-4">
      <div aria-busy={!financialReady} data-hd-customer-financial-status={financialStatus} className="rounded-[2rem] bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-5 shadow-lg">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex min-h-[78px] flex-col items-center justify-center rounded-2xl bg-white/15 p-3 text-center">
            <p className="text-[11px] uppercase tracking-wider opacity-80">Công nợ</p>
            <p className="mt-1 text-lg font-black">{financialValue('debt',formatCurrency(ledger.currentDebt || 0))}</p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('points')}
            className="flex min-h-[78px] flex-col items-center justify-center rounded-2xl bg-white/15 p-3 text-center transition active:scale-[0.98]"
          >
            <p className="text-[11px] uppercase tracking-wider opacity-80">Điểm</p>
            <p className="mt-1 text-lg font-black">{financialValue('points',formatNumber(availableCustomerPoints))}</p>
          </button>
        </div>
      </div>
      {financialReady && debtPaymentAmount > 0 && (
        <div className={`rounded-2xl border p-4 text-sm font-semibold ${isOrderingLocked ? 'border-red-100 bg-red-50 text-red-700' : 'border-emerald-100 bg-emerald-50 text-emerald-800'}`}>
          <p>{isOrderingLocked
            ? 'Tài khoản đang có công nợ cần thanh toán trước khi đặt thêm đơn mới.'
            : 'Bạn đang có công nợ. Mở danh sách hóa đơn để chọn và thanh toán.'}</p>
          <CustomerDebtPaymentButton compact />
        </div>
      )}
      {!financialReady && <p role="status" className="text-xs text-slate-500">{cachedFinancialPresentation
        ?<>Đang đối chiếu lại công nợ và thanh toán… Số liệu đã xác nhận{financialCachedAt?` lúc ${formatDateTimeLabel(financialCachedAt)}`:''} đang được giữ để tham khảo.</>
        :<>Đang đối chiếu công nợ và thanh toán… Bạn vẫn có thể xem sản phẩm.</>}</p>}
      <div aria-busy={!financialReady} className="grid grid-cols-2 gap-3">
        <CustomerStatCard label="Đơn tháng này" value={financialValue('monthlyOrders',monthlyOrders.length)} icon={Receipt} tone="blue" />
        <CustomerStatCard label="Doanh số tháng" value={financialValue('monthlySales',formatCurrency(monthlySales))} icon={TrendingUp} tone="emerald" />
        <CustomerStatCard label="Đã thanh toán" value={financialValue('paid',formatCurrency(customerPayments.reduce((sum, item) => sum + parseLooseMoneyValue(item.amount), 0)))} icon={CreditCard} tone="orange" />
        <CustomerStatCard label="Còn được nợ" value={financialValue('remainingDebtLimit',debtLimit > 0 ? formatCurrency(remainingDebtLimit) : '0 đ')} icon={CheckCircle} tone="purple" />
      </div>
      <div className="bg-white rounded-3xl p-4 shadow-sm border border-emerald-100">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-extrabold text-gray-900">Theo dõi đơn hàng</h3>
            <p className="text-[11px] font-semibold text-gray-400">Cập nhật theo đơn đặt, phiếu xuất và báo cáo giao hàng.</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{customerOrderTrackingRows.length}</span>
        </div>
        {customerOrderTrackingRows.length === 0 ? (
          <p className="rounded-2xl bg-gray-50 p-4 text-center text-sm font-semibold text-gray-400">Chưa có đơn nào để theo dõi.</p>
        ) : (
          <div className="space-y-3">
            {customerOrderTrackingRows.map((row) => (
              <div key={`customer_tracking_${row.id}`} className="rounded-3xl border border-rose-100 bg-gradient-to-br from-white to-emerald-50/40 p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-gray-900">{row.code}</p>
                    <p className="mt-0.5 truncate text-[11px] font-semibold text-gray-500">{row.productSummary}</p>
                    <p className="mt-1 text-[10px] font-bold text-gray-400">{row.dateLabel}</p>
                    {row.assignedDriverSummary && (
                      <p className="mt-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">
                        Đang giao bởi tài xế {row.assignedDriverSummary}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-black text-emerald-700">{row.statusLabel}</span>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-1.5">
                  {customerOrderTrackingSteps.map((step, stepIndex) => {
                    const isDone = stepIndex <= row.stageIndex;
                    const isCurrent = stepIndex === row.stageIndex;
                    return (
                      <div
                        key={`${row.id}_${step}`}
                        className={`rounded-2xl px-1.5 py-2 text-center transition ${isDone ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-300'} ${isCurrent ? 'ring-1 ring-emerald-300' : ''}`}
                      >
                        <span className={`mx-auto mb-1 block h-2.5 w-2.5 rounded-full ${isDone ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                        <span className="block text-[9px] font-black leading-tight">{step}</span>
                      </div>
                    );
                  })}
                </div>
                {row.canConfirmReceived && (
                  <button
                    type="button"
                    onClick={() => handleConfirmCustomerOrderReceived(row)}
                    disabled={confirmingReceivedTrackingId === row.id}
                    className="mt-3 w-full rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-black text-white shadow-sm transition active:scale-[0.98] disabled:opacity-60"
                  >
                    {confirmingReceivedTrackingId === row.id ? 'Đang xác nhận...' : 'Đã nhận hàng'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-emerald-100">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-extrabold text-slate-900">Bảng giá hôm nay</h3>
              <TrendingUp size={18} className="text-emerald-500" />
            </div>
            {hasCustomerTodayPriceTable ? (
              <div className="overflow-hidden rounded-2xl border border-emerald-100">
                <div className="overflow-x-auto">
                  <div style={{ minWidth: `${customerTodayPriceTableMinWidth}px` }}>
                    <div
                      style={customerTodayPriceGridTemplate}
                      className="grid bg-emerald-50 text-center text-[9px] font-black uppercase tracking-[0.03em] text-emerald-800"
                    >
                      <div className="border-r border-emerald-100 px-2 py-2 text-left">Sản phẩm</div>
                      {customerTodayPriceGroups.map(group => (
                        <div
                          key={`customer-price-head-${group.groupKey}`}
                          className="border-r border-emerald-100 px-1.5 py-2 last:border-r-0"
                        >
                          <span className="block break-words">{group.groupLabel}</span>
                        </div>
                      ))}
                    </div>
                    {customerTodayPriceRows.map(row => (
                      <div
                        key={`customer-price-row-${row.key}`}
                        style={customerTodayPriceGridTemplate}
                        className="grid border-t border-emerald-100 bg-white text-center"
                      >
                        <div className="flex items-center border-r border-emerald-100 px-2 py-2 text-left">
                          <p className="truncate text-xs font-black text-slate-900">{row.label}</p>
                        </div>
                        {customerTodayPriceGroups.map(group => {
                          const price = parseLooseMoneyValue(group.cells?.[row.columnIndex]?.price);
                          return (
                            <div
                              key={`customer-price-cell-${row.key}-${group.groupKey}`}
                              className="flex min-w-0 items-center justify-center border-r border-emerald-100 px-1.5 py-2 last:border-r-0"
                            >
                              <span className={`whitespace-nowrap text-[11px] font-black ${price > 0 ? 'text-emerald-700' : 'text-slate-300'}`}>
                                {price > 0 ? formatPricingVnd(price) : ''}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="rounded-2xl bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-400">
                Chưa có bảng giá hôm nay.
              </p>
            )}
          </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          ['Đặt hàng', 'order', ShoppingCart],
          ['Ngân hàng', 'bank', CreditCard],
          ['Thanh toán', 'payments', CreditCard],
          ['Công nợ', 'debt', Wallet],
          ['Khuyến mãi', 'more', Gift],
          ['Hồ sơ', 'more', UserCircle]
        ].map(([label, tab, Icon]) => (
          <button key={label} onClick={() => setActiveTab(tab)} className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm text-center">
            <Icon size={20} className="mx-auto text-emerald-500 mb-1" />
            <span className="text-[11px] font-bold">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderOrder = () => (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm">
        <div className="flex items-center gap-2 bg-gray-50 rounded-2xl px-3 py-2 border border-gray-100">
          <Search size={18} className="text-gray-400" />
          <input data-hd-search-input="true" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Tìm sản phẩm hoặc tên viết tắt" className="bg-transparent outline-none flex-1 text-sm" />
        </div>
        {customerBranches.length > 0 && (
          <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/60 p-3">
            <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-sky-700">Chi nhánh đặt hàng</label>
            <select
              value={selectedBranchId}
              onChange={e => setSelectedBranchId(e.target.value)}
              className="w-full rounded-xl border border-sky-100 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-sky-400"
            >
              {customerBranches.map((branch, index) => (
                <option key={branch.id} value={branch.id}>{getCustomerBranchDisplayName(branch, index)}</option>
              ))}
            </select>
            {selectedCustomerBranch?.address && (
              <p className="mt-2 line-clamp-2 text-[11px] font-semibold text-sky-700">{selectedCustomerBranch.address}</p>
            )}
          </div>
        )}
      </div>
      {isOrderingLocked && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">
          <p>Bạn cần thanh toán công nợ hiện tại trước khi đặt hàng mới.</p>
          <CustomerDebtPaymentButton compact />
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {availableProducts.map(product => {
          const productTitle = product.shortName || product.name || 'Sản phẩm';
          const productMeta = product.shortName && product.name
            ? product.name
            : (getCustomerProductSize(customerProfile, product) || getCustomerProductAttribute(customerProfile, product) || product.category || 'Sản phẩm');
          return (
            <button
              key={product.id}
              type="button"
              disabled={isOrderingLocked}
              onClick={() => addToCart(product)}
              className={`min-h-[92px] rounded-3xl border bg-white p-2.5 text-left shadow-sm transition ${isOrderingLocked ? 'opacity-60' : 'active:scale-[0.98] hover:border-emerald-200 hover:bg-emerald-50/40'} border-gray-100`}
            >
              <span className="flex items-start justify-between gap-1">
                <span className="line-clamp-2 min-w-0 text-sm font-extrabold leading-snug text-gray-900">{productTitle}</span>
                <span className="shrink-0 text-[11px] font-black text-emerald-600">{formatCurrency(resolveCustomerUnitPrice(product, selectedBranchId))}</span>
              </span>
              <span className="mt-1 block line-clamp-2 min-h-[28px] text-[10px] font-semibold leading-snug text-gray-400">{productMeta}</span>
            </button>
          );
        })}
      </div>
      <div className="customer-portal-cart-sticky bg-white rounded-3xl p-4 border border-gray-100 shadow-lg sticky">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-extrabold">{editingOrderRequestId ? 'Sửa đơn đặt' : 'Giỏ hàng'}</h3>
            {editingOrderRequestId && <p className="mt-1 text-[11px] font-semibold text-amber-600">Đang cập nhật bản mới nhất, không tạo đơn trùng.</p>}
          </div>
          <span className="text-sm font-bold text-emerald-600">{formatCurrency(cartTotal)}</span>
        </div>
        {cart.length === 0 ? <p className="text-sm text-gray-400 mt-3">Chưa chọn sản phẩm.</p> : (
          <div className="space-y-2 mt-3">
            {cart.map((item, index) => {
              const lineId = item.lineId || `${item.productId || 'item'}_${item.branchId || 'main'}_${index}`;
              const cartProduct = item.productId
                ? customerVisibleProducts.find(productItem => productItem.id === item.productId)
                : null;
              const cartConfiguration = resolveCustomerPortalProductConfiguration(cartProduct, item.branchId || '');
              const selectedOrderUnit = normalizeProductPricingUnit(
                item.orderUnit
                || item.quantityUnit
                || item.actualUnit
                || item.unit
                || cartConfiguration.defaultOrderUnit
                || resolveCustomerProductActualUnit(cartConfiguration, cartProduct)
              );
              const orderUnitOptions = getOrderInputUnitOptions({
                product: cartProduct,
                pricingUnit: item.basePriceUnit || item.billingUnit || item.pricingUnit || cartConfiguration.billingUnit,
                currentUnit: selectedOrderUnit,
                catalogUnits: cartConfiguration.orderUnits,
                fallback: cartConfiguration.defaultOrderUnit || resolveCustomerProductActualUnit(cartConfiguration, cartProduct),
              });
              const isMissingUnitConversion = ['MISSING_BILLING_QUANTITY', 'ACTUAL_UNIT_NOT_ALLOWED']
                .includes(item.billingSnapshotError);
              return (
              <div key={lineId} className="rounded-2xl bg-gray-50 p-2">
                <div className="grid grid-cols-[1fr_64px_84px_32px] gap-2 items-center">
                  <div>
                    <p className="font-bold text-sm">{item.shortName || item.productName}</p>
                    <p className="text-xs text-gray-500">{formatCurrency(item.unitPrice)} / {item.billingUnit || item.pricingUnit}</p>
                    {item.branchName && <p className="mt-0.5 truncate text-[11px] font-bold text-sky-700">{item.branchName}</p>}
                  </div>
                <input type="number" value={item.quantity} onChange={e => updateCartItem(lineId, { quantity: e.target.value })} className="w-full rounded-xl border border-gray-200 p-2 text-center outline-none" />
                <select
                  aria-label={`Đơn vị đặt của ${item.shortName || item.productName || 'sản phẩm'}`}
                  value={selectedOrderUnit}
                  onChange={event => updateCartItem(lineId, { orderUnit: event.target.value })}
                  className="w-full rounded-xl border border-emerald-100 bg-emerald-50 p-2 text-center text-xs font-bold text-emerald-700 outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  {orderUnitOptions.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                </select>
                <button onClick={() => removeCartItem(lineId)} className="text-red-400"><X size={18} /></button>
                </div>
                {(item.billingSnapshotValid === false || item.pricingPendingActual) && (
                  <p className="mt-2 rounded-xl bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-700">
                    {isMissingUnitConversion
                      ? `Chưa có quy đổi từ ${selectedOrderUnit || 'đơn vị đặt'} sang ${item.basePriceUnit || item.billingUnit || item.pricingUnit || 'đơn vị tính giá'}; chưa thể gửi đơn.`
                      : `Chưa thể tính tiền cho ${item.shortName || item.productName || 'sản phẩm'}; hãy kiểm tra giá và đơn vị tính giá.`}
                  </p>
                )}
                {customerBranches.length > 0 && (
                  <select
                    value={item.branchId || ''}
                    onChange={e => {
                      const branch = getCustomerBranchById(customerProfile || {}, e.target.value, customerVisibleProducts);
                      updateCartItem(lineId, {
                        branchId: branch?.id || '',
                        branchName: branch ? getCustomerBranchDisplayName(branch) : '',
                        branchAddress: branch?.address || ''
                      });
                    }}
                    className="mt-2 w-full rounded-xl border border-sky-100 bg-white px-3 py-2 text-xs font-bold text-sky-800 outline-none"
                  >
                    <option value="">Khách chính</option>
                    {customerBranches.map((branch, branchIndex) => (
                      <option key={branch.id} value={branch.id}>{getCustomerBranchDisplayName(branch, branchIndex)}</option>
                    ))}
                  </select>
                )}
              </div>
              );
            })}
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="rounded-2xl border border-gray-200 p-3 text-sm outline-none" />
              <input value={orderNote} onChange={e => setOrderNote(e.target.value)} placeholder="Ghi chú" className="rounded-2xl border border-gray-200 p-3 text-sm outline-none" />
            </div>
            <div className="grid grid-cols-1 gap-2">
              <button disabled={!financialReady || isSubmittingOrder || isOrderingLocked || cartHasUnresolvedPricing} onClick={submitOrderRequest} className="w-full bg-emerald-500 text-white font-extrabold py-3 rounded-2xl disabled:bg-gray-300">{isSubmittingOrder ? 'Đang gửi...' : (editingOrderRequestId ? 'Cập nhật đơn' : 'Gửi đơn đặt')}</button>
              {editingOrderRequestId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingOrderRequestId('');
                    setCart([]);
                    setOrderNote('');
                    setSubmitMessage('');
                  }}
                  className="w-full rounded-2xl bg-gray-100 py-3 text-sm font-extrabold text-gray-600"
                >
                  Hủy sửa đơn
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="rounded-3xl border border-rose-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-extrabold text-gray-900">Lịch sử đơn đặt hàng</h3>
          <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-600">{customerRequests.length} đơn</span>
        </div>
        {customerRequests.length === 0 ? (
          <p className="rounded-2xl bg-gray-50 p-4 text-center text-sm font-semibold text-gray-400">Chưa có đơn đặt nào.</p>
        ) : (
          <div className="space-y-3">
            {customerRequests.slice(0, 30).map(item => {
              const requestItem = { ...item, type: 'request' };
              const lines = getCustomerPortalOrderLines(requestItem);
              const total = getCustomerPortalOrderTotal(requestItem);
              const orderCode = getCustomerPortalDisplayOrderCode(requestItem);
              return (
                <div
                  key={`request_history_${item.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openCustomerOrderDetail(requestItem)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openCustomerOrderDetail(requestItem);
                    }
                  }}
                  className="relative overflow-hidden rounded-3xl border border-rose-100 bg-white p-4 shadow-[0_10px_26px_rgba(244,63,94,0.08),inset_0_1px_0_rgba(255,255,255,0.95)] ring-1 ring-rose-50/80 cursor-pointer active:scale-[0.99] transition hover:border-rose-200"
                >
                  <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-rose-300/70 to-transparent" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-extrabold text-gray-900">{orderCode}</p>
                      <p className="mt-1 text-xs text-gray-400">Đặt lúc {getOrderPlacedAtLabel(requestItem)}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{statusLabel(requestItem.status || requestItem.reviewStatus)}</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {lines.slice(0, 3).map((line, index) => (
                      <div key={index} className="rounded-2xl bg-gray-50 px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 font-extrabold text-sm text-gray-800">{line.productName}</span>
                          <span className="shrink-0 text-sm font-black text-emerald-700">{formatCurrency(line.lineTotal)} đ</span>
                        </div>
                        <div className="mt-1 grid grid-cols-3 gap-1 text-[11px] font-bold text-gray-500">
                          <span>SL: {formatCustomerQuantityLabel(line)}</span>
                          <span>Giá: {formatCustomerUnitPriceLabel(line)}</span>
                          <span className="text-right">TT: {formatCurrency(line.lineTotal)} đ</span>
                        </div>
                      </div>
                    ))}
                    {lines.length > 3 && <p className="text-xs font-bold text-gray-400">+{lines.length - 3} dòng khác</p>}
                  </div>
                  <div className="mt-3 flex justify-between border-t border-gray-100 pt-3 font-extrabold">
                    <span>Tổng tiền</span>
                    <span>{formatCurrency(total)} đ</span>
                  </div>
                  {canCustomerEditRequest(requestItem) && (
                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        startEditCustomerRequest(requestItem);
                      }}
                      className="mt-3 w-full rounded-2xl bg-emerald-50 py-3 text-sm font-extrabold text-emerald-700"
                    >
                      Sửa đơn đặt
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const renderOrders = () => {
    const orderItems = customerOrders.map(item => ({ ...item, type: 'order' })).slice(0, 80);

    return (
      <div className="space-y-3">
        <h2 className="text-xl font-extrabold">Đơn hàng của tôi</h2>
        {orderItems.map(item => {
          const lines = getCustomerPortalOrderLines(item);
          const total = getCustomerPortalOrderTotal(item);
          const orderCode = getCustomerPortalDisplayOrderCode(item);

          return (
            <div
              key={`${item.type}_${item.id}`}
              role="button"
              tabIndex={0}
              onClick={() => openCustomerOrderDetail(item)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openCustomerOrderDetail(item);
                }
              }}
              className="relative overflow-hidden rounded-3xl border border-rose-100 bg-white p-4 shadow-[0_10px_26px_rgba(244,63,94,0.08),inset_0_1px_0_rgba(255,255,255,0.95)] ring-1 ring-rose-50/80 cursor-pointer active:scale-[0.99] transition hover:border-rose-200 hover:shadow-[0_14px_30px_rgba(244,63,94,0.12),inset_0_1px_0_rgba(255,255,255,0.95)]"
            >
              <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-rose-300/70 to-transparent" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-extrabold text-gray-900">{orderCode}</p>
                  <p className="text-xs text-gray-400 mt-1">Tạo lúc {getOrderPlacedAtLabel(item)} • Hóa đơn</p>
                </div>
                <span className="shrink-0 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">{statusLabel(item.status || item.reviewStatus)}</span>
              </div>

              <div className="mt-3 space-y-2">
                {lines.slice(0, 4).map((line, index) => (
                  <div key={index} className="rounded-2xl bg-gray-50 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 font-extrabold text-sm text-gray-800">
                        {line.productName}
                        {line.branchName && (
                          <span className="mt-0.5 block truncate text-[11px] font-bold text-sky-700">{line.branchName}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-sm font-black text-emerald-700">{formatCurrency(line.lineTotal)} đ</span>
                    </div>
                    <div className="mt-1 grid grid-cols-3 gap-1 text-[11px] font-bold text-gray-500">
                      <span>SL: {formatCustomerQuantityLabel(line)}</span>
                      <span>Giá: {formatCustomerUnitPriceLabel(line)}</span>
                      <span className="text-right">TT: {formatCurrency(line.lineTotal)} đ</span>
                    </div>
                  </div>
                ))}
                {lines.length > 4 && <p className="text-xs font-bold text-gray-400">+{lines.length - 4} dòng khác, bấm để xem chi tiết</p>}
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between font-extrabold">
                <span>Tổng tiền</span>
                <span>{formatCurrency(total)} đ</span>
              </div>
            </div>
          );
        })}
        {customerOrders.length === 0 && <CustomerEmptyState text="Bạn chưa có đơn hàng công ty nào." />}
      </div>
    );
  };

  const renderCustomerOrderDetailSheet = () => {
    if (!selectedCustomerOrderSelection) return null;
    if (!selectedCustomerOrderItem) {
      return (
        <div className="fixed inset-0 z-[80] bg-slate-50" role="dialog" aria-modal="true" aria-label="Chi tiết đơn hàng">
          <div className="flex h-[100dvh] min-h-0 flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
                <p className="font-extrabold text-slate-900">Chi tiết đơn hàng</p>
                <button type="button" onClick={closeCustomerOrderDetail} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-extrabold text-slate-700">
                  Quay lại
                </button>
              </div>
            </header>
            <main className="flex min-h-0 flex-1 items-center justify-center px-4 text-center">
              <div className="max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="font-extrabold text-slate-900">Đơn hàng không còn khả dụng</p>
                <p className="mt-2 text-sm font-medium text-slate-500">Dữ liệu đơn vừa được cập nhật hoặc không còn trong danh sách của bạn.</p>
              </div>
            </main>
          </div>
        </div>
      );
    }

    const item = selectedCustomerOrderItem;
    const lines = getCustomerPortalOrderLines(item);
    const total = getCustomerPortalOrderTotal(item);
    const orderCode = getCustomerPortalDisplayOrderCode(item);
    const customerName = item.customerName || item.customerNameSnapshot || customerProfile?.name || 'Khách hàng';
    const customerPhone = item.customerPhone || item.phone || customerProfile?.phone || '';
    const orderStatus = statusLabel(item.status || item.reviewStatus);
    const statusHistory = [item.statusHistory, item.orderStatusHistory, item.statusTimeline, item.timeline]
      .find(value => Array.isArray(value)) || [];

    return (
      <div className="fixed inset-0 z-[80] bg-slate-50" role="dialog" aria-modal="true" aria-label={`Chi tiết ${orderCode}`} data-view-only="true">
        <div className="flex h-[100dvh] min-h-0 flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="mx-auto flex max-w-5xl items-center gap-3">
              <button
                type="button"
                onClick={closeCustomerOrderDetail}
                className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-2xl bg-slate-100 px-3 text-sm font-extrabold text-slate-700 transition hover:bg-slate-200"
                aria-label="Quay lại danh sách đơn hàng"
              >
                <ChevronLeft size={20} />
                <span className="hidden sm:inline">Quay lại đơn hàng</span>
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">{item.type === 'request' ? 'Chi tiết đơn đặt' : 'Chi tiết hóa đơn'}</p>
                <h3 className="mt-0.5 truncate text-lg font-black text-slate-950 sm:text-xl">{orderCode}</h3>
                <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{getOrderPlacedAtLabel(item)}</p>
              </div>
              <span className="hidden shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-extrabold text-emerald-700 sm:inline-flex">{orderStatus}</span>
              <button
                type="button"
                onClick={closeCustomerOrderDetail}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                aria-label="Đóng chi tiết đơn hàng"
              >
                <X size={20} />
              </button>
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50 px-4 py-4 pb-6">
            <div className="mx-auto w-full max-w-5xl space-y-4">
              <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Khách hàng</p>
                    <p className="mt-1 truncate text-lg font-extrabold text-slate-950">{customerName}</p>
                    {customerPhone && <p className="mt-1 text-sm font-semibold text-slate-500">{customerPhone}</p>}
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-extrabold text-emerald-700 sm:hidden">{orderStatus}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-600">Chỉ xem</span>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">Sản phẩm</p>
                    <h4 className="mt-1 text-lg font-extrabold text-slate-950">Chi tiết đơn hàng</h4>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-600">{lines.length} dòng</span>
                </div>
                <div className="space-y-3">
                  {lines.map((line, index) => (
                    <article key={line.id || index} className="rounded-3xl border border-emerald-100 bg-emerald-50/35 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words font-extrabold leading-snug text-slate-950">{line.productName}</p>
                          {line.branchName && <p className="mt-1 text-xs font-bold text-sky-700">Chi nhánh: {line.branchName}</p>}
                          {line.size && <p className="mt-1 text-xs font-semibold text-slate-500">Size/thuộc tính: {line.size}</p>}
                          {formatCustomerConversionLabel(line) && <p className="mt-1 text-xs font-semibold text-emerald-700">{formatCustomerConversionLabel(line)}</p>}
                        </div>
                        <p className="shrink-0 text-right text-sm font-black text-slate-950">{formatCurrency(line.lineTotal)} đ</p>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <div className="rounded-2xl bg-white/90 p-3">
                          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Số lượng thực tế</p>
                          <p className="mt-1 break-words text-sm font-extrabold text-emerald-700">{formatCustomerQuantityLabel(line)}</p>
                        </div>
                        <div className="rounded-2xl bg-white/90 p-3">
                          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Đơn giá</p>
                          <p className="mt-1 break-words text-sm font-extrabold text-slate-800">{formatCustomerUnitPriceLabel(line)}</p>
                        </div>
                        <div className="col-span-2 rounded-2xl bg-white/90 p-3 sm:col-span-1">
                          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Thành tiền</p>
                          <p className="mt-1 text-sm font-black text-slate-950">{formatCurrency(line.lineTotal)} đ</p>
                        </div>
                      </div>
                    </article>
                  ))}
                  {lines.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm font-semibold text-slate-500">Đơn này chưa có dòng sản phẩm.</p>}
                </div>
              </section>

              {statusHistory.length > 0 && (
                <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">Lịch sử trạng thái</p>
                  <div className="mt-3 space-y-2">
                    {statusHistory.slice(-10).reverse().map((historyItem, index) => (
                      <div key={`${historyItem?.id || historyItem?.at || historyItem?.createdAt || index}`} className="flex items-start justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-3">
                        <p className="text-sm font-bold text-slate-800">{statusLabel(historyItem?.status || historyItem?.label || historyItem?.state)}</p>
                        <p className="shrink-0 text-xs font-semibold text-slate-500">{getOrderPlacedAtLabel(historyItem)}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="flex items-center justify-between gap-4 rounded-3xl bg-slate-950 px-5 py-4 text-white shadow-lg">
                <div>
                  <p className="text-sm font-bold text-white/70">Tổng tiền</p>
                  <p className="mt-1 text-xs font-semibold text-white/60">Thông tin được lấy từ hóa đơn đã lưu.</p>
                </div>
                <p className="shrink-0 text-right text-xl font-black sm:text-2xl">{formatCurrency(total)} đ</p>
              </section>
            </div>
          </main>
        </div>
      </div>
    );
  };

  const renderDebt = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-extrabold">Công nợ của tôi</h2>
      <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm">
        <div className="grid grid-cols-2 gap-3">
          <CustomerStatCard label="Hạn mức" value={debtLimit > 0 ? formatCurrency(debtLimit) : 'Không cho nợ'} icon={Target} tone="blue" />
          <CustomerStatCard label="Đang nợ" value={formatCurrency(ledger.currentDebt || 0)} icon={Wallet} tone={(ledger.currentDebt || 0) > 0 ? 'red' : 'emerald'} />
          <CustomerStatCard label="Còn được nợ" value={financialValue('remainingDebtLimit',debtLimit > 0 ? formatCurrency(remainingDebtLimit) : '0 đ')} icon={CreditCard} tone="emerald" />
          <CustomerStatCard label="Tiền dư" value={formatCurrency(ledger.creditBalance || 0)} icon={Banknote} tone="purple" />
        </div>
        <div className="mt-3 rounded-3xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">Tích điểm</p>
              <p className="mt-1 text-sm font-semibold text-gray-500">Dùng điểm để trừ trực tiếp vào công nợ hiện tại.</p>
            </div>
            <Star size={22} className="shrink-0 text-amber-500" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white p-3 text-center shadow-sm">
              <p className="text-[11px] font-bold uppercase text-gray-400">Điểm khả dụng</p>
              <p className="mt-1 text-lg font-black text-gray-900">{formatNumber(availableCustomerPoints)}</p>
            </div>
            <div className="rounded-2xl bg-white p-3 text-center shadow-sm">
              <p className="text-[11px] font-bold uppercase text-gray-400">Quy đổi</p>
              <p className="mt-1 text-lg font-black text-emerald-600">{formatCurrency(redeemablePointMoney)} đ</p>
            </div>
          </div>
          {debtPaymentAmount > 0 && availableCustomerPoints > 0 ? (
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={redeemPointsInput}
                onChange={event => setRedeemPointsInput(event.target.value)}
                placeholder="Nhập số điểm"
                className="min-w-0 rounded-2xl border border-amber-100 bg-white px-3 py-3 text-sm font-bold text-gray-900 outline-none focus:border-amber-300"
              />
              <button
                type="button"
                onClick={() => setRedeemPointsInput(String(maxRedeemPointsForDebt))}
                className="rounded-2xl bg-amber-100 px-3 py-3 text-xs font-extrabold text-amber-800"
              >
                Dùng tối đa
              </button>
              <button
                type="button"
                disabled={isRedeemingPoints || redeemPointsMoney <= 0}
                onClick={handleRedeemPointsForDebt}
                className="col-span-2 rounded-2xl bg-amber-500 px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-amber-100 disabled:bg-gray-300 disabled:shadow-none"
              >
                {isRedeemingPoints
                  ? 'Đang dùng điểm...'
                  : `Dùng điểm trừ ${formatCurrency(redeemPointsMoney)} đ`}
              </button>
            </div>
          ) : (
            <div className="mt-3 rounded-2xl bg-white/70 p-3 text-center text-xs font-semibold text-gray-500">
              {debtPaymentAmount <= 0 ? 'Bạn chưa có công nợ cần trừ điểm.' : 'Bạn chưa có điểm khả dụng để sử dụng.'}
            </div>
          )}
          {redeemPointsMessage && (
            <p className={`mt-3 rounded-2xl px-3 py-2 text-xs font-bold ${redeemPointsMessage.includes('Đã dùng') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {redeemPointsMessage}
            </p>
          )}
        </div>
        {unpaidCustomerOrdersForPayment.length > 0 && (
          <div className="mt-3 rounded-3xl border border-emerald-100 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Chọn đơn thanh toán</p>
                <p className="mt-1 text-xs font-semibold text-gray-500">
                  {selectedPaymentOrders.length > 0
                    ? `Đã chọn ${selectedPaymentOrders.length} đơn • ${formatCurrency(customerPaymentAmount)} đ`
                    : 'Không chọn đơn nào thì app thanh toán toàn bộ công nợ.'}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedPaymentOrderIds(unpaidCustomerOrdersForPayment.map(order => `${order.id || order.orderId || order.code || order.orderCode || ''}`).filter(Boolean))}
                  className="rounded-full bg-emerald-50 px-3 py-2 text-[11px] font-extrabold text-emerald-700"
                >
                  Chọn tất cả
                </button>
                {selectedPaymentOrders.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedPaymentOrderIds([])}
                    className="rounded-full bg-gray-50 px-3 py-2 text-[11px] font-extrabold text-gray-500"
                  >
                    Bỏ chọn
                  </button>
                )}
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {unpaidCustomerOrdersForPayment.slice(0, 30).map((order, index) => {
                const orderId = `${order.id || order.orderId || order.code || order.orderCode || `payment_order_${index}`}`;
                const isSelected = selectedPaymentOrderIds.includes(orderId);
                const orderCode = formatOrderCode(order.orderCode || order.code || order.id || order.orderId || orderId);
                const outstanding = Math.max(0, Math.round(parseLooseMoneyValue(order.outstandingAmount)));
                return (
                  <button
                    key={orderId}
                    type="button"
                    onClick={() => setSelectedPaymentOrderIds(prev => (
                      prev.includes(orderId)
                        ? prev.filter(id => id !== orderId)
                        : [...prev, orderId]
                    ))}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                      isSelected
                        ? 'border-emerald-300 bg-emerald-50 shadow-sm'
                        : 'border-gray-100 bg-gray-50/80'
                    }`}
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-black ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-gray-200 bg-white text-white'
                    }`}>
                      {isSelected ? '✓' : ''}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold text-gray-900">{orderCode}</span>
                      <span className="mt-0.5 block truncate text-[11px] font-semibold text-gray-500">
                        {formatDateTimeLabel(order.date || order.createdAt || order.updatedAt)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-black text-gray-900">{formatCurrency(outstanding)} đ</span>
                      <span className="text-[10px] font-semibold text-gray-400">còn nợ</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <CustomerDebtPaymentButton />
        {debtPaymentActionMessage && !isPaymentSheetOpen && (
          <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600">{debtPaymentActionMessage}</p>
        )}
      </div>
      <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm">
        <h3 className="font-extrabold mb-3">Lịch sử công nợ</h3>
        {(ledger.entries || []).slice(0, 40).map((entry, index) => (
          <div key={index} className="py-3 border-b border-gray-50 last:border-0">
            <div className="flex justify-between gap-2"><p className="font-bold text-sm">{entry.label || entry.type || 'Phát sinh'}</p><p className={`font-black ${(entry.amount || 0) < 0 ? 'text-emerald-600' : 'text-gray-900'}`}>{formatCurrency(Math.abs(entry.amount || 0))}</p></div>
            <p className="text-xs text-gray-400 mt-1">{formatDateLabel(entry.date || entry.createdAt)} • Số dư: {formatCurrency(entry.balance || 0)}</p>
          </div>
        ))}
        {(!ledger.entries || ledger.entries.length === 0) && <p className="text-sm text-gray-400">Chưa có lịch sử công nợ.</p>}
      </div>
    </div>
  );

  const renderPayments = () => (
    <div className="space-y-3">
      <h2 className="text-xl font-extrabold">Lịch sử thanh toán</h2>
      {customerPayments.map(payment => (
        <div key={payment.id} className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm">
          <div className="flex justify-between gap-3">
            <div><p className="font-extrabold">{formatCurrency(payment.amount || 0)}</p><p className="text-xs text-gray-400 mt-1">{formatDateLabel(getPaymentDateKey(payment) || payment.date || payment.createdAt)} • {payment.method || payment.type || 'Thanh toán'}</p><p className="text-xs text-gray-500 mt-1">Người thu: {payment.collectorName || payment.employeeName || payment.createdByName || 'Công ty'}</p></div>
            <button className="px-3 py-2 rounded-2xl bg-gray-50 text-gray-500 text-xs font-bold">PDF</button>
          </div>
        </div>
      ))}
      {customerPayments.length === 0 && <CustomerEmptyState text="Chưa có thanh toán nào." />}
    </div>
  );

  const renderBank = () => {
    const transferProfile = getInvoiceTransferProfile(currentCompany || {});
    const companyBankIdText = getCustomerBankDisplayText(transferProfile.bankId);
    const companyBankNameText = getCustomerBankDisplayText(transferProfile.bankName, companyBankIdText || 'Ngân hàng');
    const companyReceivingAccountNumber = transferProfile.sepayReceivingAccountNumber || transferProfile.accountNumber;
    const companyBankAccountText = getCustomerBankDisplayText(companyReceivingAccountNumber);
    const companyBankAccountNameText = getCustomerBankDisplayText(transferProfile.accountName, 'Công ty');
    const companyBankAccountLabel = transferProfile.sepayUseVirtualAccount
      ? `${companyBankNameText} • ${companyBankAccountText} (VA)`
      : `${companyBankNameText} • ${companyBankAccountText}`;
    const safeBankLinkCode = getCustomerBankDisplayText(bankLinkForm.bankCode, 'BIDV');
    const safeBankLinkAccountNumber = getCustomerBankDisplayText(bankLinkForm.accountNumber);
    const safeBankLinkAccountName = getCustomerBankDisplayText(bankLinkForm.accountName);
    const hasCompanyBank = Boolean(companyBankAccountText && companyBankIdText);
    const normalizedBankLinkMessage = `${bankLinkMessage || ''}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();
    const bankLinkMessageTone = normalizedBankLinkMessage.includes('dang ')
      ? 'border-amber-100 bg-amber-50 text-amber-700'
      : (
          normalizedBankLinkMessage.includes('loi')
          || normalizedBankLinkMessage.includes('khong')
          || normalizedBankLinkMessage.includes('chua')
          || normalizedBankLinkMessage.includes('vui long')
        )
          ? 'border-red-100 bg-red-50 text-red-600'
          : 'border-emerald-100 bg-emerald-50 text-emerald-700';
    const statusTone = ['linked', 'active'].includes(customerBankStatus)
      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
      : ['error', 'failed'].includes(customerBankStatus)
        ? 'border-red-100 bg-red-50 text-red-600'
        : ['verifying', 'pending'].includes(customerBankStatus)
          ? 'border-amber-100 bg-amber-50 text-amber-700'
          : 'border-gray-100 bg-gray-50 text-gray-500';

    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Ngân hàng & Thanh toán</p>
              <h2 className="mt-1 text-xl font-extrabold text-slate-900">Liên kết tài khoản</h2>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                Khách hàng chỉ cần nhập tài khoản. Hệ thống tự tạo QR, nhận giao dịch và đối soát công nợ khi server ghi nhận chuyển khoản.
              </p>
            </div>
            <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-black ${statusTone}`}>{customerBankStatusLabel}</span>
          </div>

          <form onSubmit={handleCustomerBankLinkSubmit} className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Ngân hàng</span>
              <select
                value={safeBankLinkCode}
                onChange={(event) => {
                  const selectedBank = BANK_ID_OPTIONS.find(option => option.value === event.target.value);
                  setBankLinkForm(prev => ({
                    ...prev,
                    bankCode: event.target.value,
                    bankName: selectedBank?.label || prev.bankName
                  }));
                }}
                className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-3 text-sm font-bold text-slate-900 outline-none focus:border-emerald-400"
              >
                {BANK_ID_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Số tài khoản</span>
                <input
                  value={safeBankLinkAccountNumber}
                  onChange={event => setBankLinkForm(prev => ({ ...prev, accountNumber: event.target.value }))}
                  inputMode="numeric"
                  placeholder="Nhập số tài khoản"
                  className="w-full rounded-2xl border border-gray-200 px-3 py-3 text-sm font-bold text-slate-900 outline-none focus:border-emerald-400"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Tên chủ tài khoản</span>
                <input
                  value={safeBankLinkAccountName}
                  onChange={event => setBankLinkForm(prev => ({ ...prev, accountName: event.target.value }))}
                  placeholder="VD: NGUYEN VAN A"
                  className="w-full rounded-2xl border border-gray-200 px-3 py-3 text-sm font-bold text-slate-900 outline-none focus:border-emerald-400"
                />
              </label>
            </div>
            {bankLinkMessage && (
              <p className={`rounded-2xl border px-3 py-2 text-sm font-bold ${bankLinkMessageTone}`}>{bankLinkMessage}</p>
            )}
            <button
              type="submit"
              disabled={isLinkingBankAccount}
              className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-black text-white shadow-sm transition active:scale-[0.98] disabled:bg-gray-300"
            >
              {isLinkingBankAccount ? 'Đang liên kết...' : 'Liên kết tài khoản'}
            </button>
          </form>
        </div>

        <div className="rounded-3xl border border-sky-100 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-700">Tài khoản công ty nhận tiền</p>
          {hasCompanyBank ? (
            <div className="mt-3 rounded-2xl bg-sky-50 p-3">
              <p className="text-lg font-black text-slate-900">{companyBankAccountNameText}</p>
              <p className="mt-1 text-sm font-bold text-slate-600">{companyBankAccountLabel}</p>
              <p className="mt-2 text-xs font-semibold leading-5 text-sky-700">
                Khi phát sinh hóa đơn hoặc công nợ, app tự tạo mã chuyển khoản duy nhất theo mã hóa đơn để đối soát và trừ nợ tự động.
              </p>
            </div>
          ) : (
            <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-700">
              Công ty chưa cấu hình tài khoản nhận tiền. Vui lòng báo kế toán/chủ doanh nghiệp cập nhật trong Cài đặt.
            </p>
          )}
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-extrabold text-slate-900">Cách hệ thống xử lý tự động</p>
          <div className="mt-3 space-y-2 text-xs font-semibold leading-5 text-slate-500">
            <p>1. Mã chuyển khoản luôn là mã duy nhất của hóa đơn, không dùng tên khách hàng.</p>
            <p>2. Chuyển thiếu sẽ ghi nhận thanh toán một phần, chuyển đủ sẽ đóng hóa đơn, chuyển dư sẽ tạo tiền dư cho khách.</p>
            <p>3. Giao dịch không khớp mã hóa đơn sẽ vào danh sách chờ kế toán xử lý, không tự trừ nợ.</p>
          </div>
        </div>
      </div>
    );
  };

  const renderPoints = () => (
    <div className="space-y-4">
      <div className="rounded-[2rem] border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-emerald-50 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Tích điểm</p>
            <h2 className="mt-2 text-3xl font-black text-gray-900">{formatNumber(availableCustomerPoints)} điểm</h2>
            <p className="mt-1 text-sm font-semibold text-gray-500">Giá trị quy đổi: {formatCurrency(redeemablePointMoney)} đ</p>
          </div>
          <div className="h-14 w-14 rounded-3xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-inner">
            <Star size={28} />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-white/80 p-3 text-center">
            <p className="text-[10px] font-black uppercase text-gray-400">Tổng tích</p>
            <p className="mt-1 font-black text-gray-900">{formatNumber(totalCustomerPoints)}</p>
          </div>
          <div className="rounded-2xl bg-white/80 p-3 text-center">
            <p className="text-[10px] font-black uppercase text-gray-400">Đã dùng</p>
            <p className="mt-1 font-black text-emerald-700">{formatNumber(usedCustomerPoints)}</p>
          </div>
          <div className="rounded-2xl bg-white/80 p-3 text-center">
            <p className="text-[10px] font-black uppercase text-gray-400">Hết hạn</p>
            <p className="mt-1 font-black text-gray-700">{formatNumber(expiredCustomerPoints)}</p>
          </div>
        </div>
        <p className="mt-3 rounded-2xl bg-white/70 px-3 py-2 text-xs font-semibold text-gray-500">
          Quy đổi hiện tại: 1 điểm = {formatCurrency(loyaltyPointValue)} đ. Điểm tự cập nhật khi công ty xác nhận đơn hàng, thanh toán hoặc dùng điểm.
        </p>
        <button
          type="button"
          onClick={openPointWithdrawSheet}
          disabled={availableCustomerPoints <= 0}
          className="mt-3 w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-400 px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-amber-100 disabled:from-gray-300 disabled:to-gray-300 disabled:shadow-none"
        >
          Rút điểm
        </button>
      </div>

      {enabledLoyaltyEligibilityConditions.length > 0 && (
        <section className="rounded-3xl border border-emerald-100 bg-emerald-50/40 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-base font-black text-white">+</span>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-emerald-950">Điều kiện nhận điểm</h3>
              <p className="mt-1 text-xs leading-5 text-emerald-800">Đơn hàng sẽ được cộng điểm khi đáp ứng toàn bộ điều kiện công ty đang áp dụng.</p>
            </div>
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {enabledLoyaltyEligibilityConditions.map((condition) => (
              <li key={condition.id} className="flex items-center gap-2 rounded-xl bg-white/85 px-3 py-2 text-sm font-semibold text-emerald-950">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">✓</span>
                {condition.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-extrabold text-gray-900">Dùng điểm trừ công nợ</h3>
            <p className="mt-1 text-xs font-semibold text-gray-500">Nếu đang có nợ, bạn có thể dùng điểm khả dụng để giảm số tiền phải thanh toán.</p>
          </div>
          <Percent size={20} className="shrink-0 text-emerald-600" />
        </div>
        {debtPaymentAmount > 0 && availableCustomerPoints > 0 ? (
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={redeemPointsInput}
              onChange={event => setRedeemPointsInput(event.target.value)}
              placeholder="Nhập số điểm"
              className="min-w-0 rounded-2xl border border-amber-100 bg-white px-3 py-3 text-sm font-bold text-gray-900 outline-none focus:border-amber-300"
            />
            <button
              type="button"
              onClick={() => setRedeemPointsInput(String(maxRedeemPointsForDebt))}
              className="rounded-2xl bg-amber-100 px-3 py-3 text-xs font-extrabold text-amber-800"
            >
              Tối đa
            </button>
            <button
              type="button"
              disabled={isRedeemingPoints || redeemPointsMoney <= 0}
              onClick={handleRedeemPointsForDebt}
              className="col-span-2 rounded-2xl bg-amber-500 px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-amber-100 disabled:bg-gray-300 disabled:shadow-none"
            >
              {isRedeemingPoints
                ? 'Đang dùng điểm...'
                : `Dùng điểm trừ ${formatCurrency(redeemPointsMoney)} đ`}
            </button>
          </div>
        ) : (
          <div className="mt-3 rounded-2xl bg-gray-50 p-3 text-center text-xs font-semibold text-gray-500">
            {debtPaymentAmount <= 0 ? 'Bạn chưa có công nợ cần trừ điểm.' : 'Bạn chưa có điểm khả dụng để sử dụng.'}
          </div>
        )}
        {redeemPointsMessage && (
          <p className={`mt-3 rounded-2xl px-3 py-2 text-xs font-bold ${redeemPointsMessage.includes('Đã dùng') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
            {redeemPointsMessage}
          </p>
        )}
      </div>

      <div className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="font-extrabold text-gray-900">Lịch sử điểm</h3>
          <Gift size={18} className="text-amber-500" />
        </div>
        {loyaltyHistory.length > 0 ? loyaltyHistory.map((entry, index) => {
          const pointValue = Math.round(parseLooseMoneyValue(
            entry.points
            ?? entry.pointDelta
            ?? entry.delta
            ?? entry.point
            ?? entry.amount
            ?? 0
          ));
          const positive = pointValue >= 0;
          return (
            <div key={entry.id || index} className="flex items-start justify-between gap-3 border-b border-gray-50 py-3 last:border-0">
              <div className="min-w-0">
                <p className="font-bold text-sm text-gray-900">{entry.label || entry.reason || entry.type || 'Biến động điểm'}</p>
                <p className="mt-1 text-xs font-semibold text-gray-400">{formatDateLabel(entry.date || entry.createdAt || entry.updatedAt)}</p>
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${positive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                {positive ? '+' : ''}{formatNumber(pointValue)}
              </span>
            </div>
          );
        }) : (
          <CustomerEmptyState text="Chưa có lịch sử tích điểm. Điểm sẽ tự hiển thị sau khi công ty xác nhận đơn hàng hoặc thanh toán." />
        )}
      </div>
    </div>
  );

  const renderMore = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-extrabold">Thông tin khách hàng</h2>
      <div className="grid grid-cols-2 gap-3">
        <CustomerStatCard label="Điểm khả dụng" value={formatNumber(availableCustomerPoints)} icon={Star} tone="amber" />
        <CustomerStatCard label="Giá trị điểm" value={formatCurrency(redeemablePointMoney)} icon={Percent} tone="emerald" />
      </div>
      <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Nhân viên phụ trách</p>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-black">
            {getEmployeeAvatarUrl(responsibleEmployee) ? (
              <img src={getEmployeeAvatarUrl(responsibleEmployee)} alt="" className="h-full w-full object-cover" />
            ) : (
              <span>{getInitials(responsibleEmployeeName)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-extrabold text-gray-900">{responsibleEmployeeName}</p>
            <p className="mt-0.5 text-xs font-semibold text-gray-500">
              {responsibleEmployee ? getEmployeePositionLabel(responsibleEmployee.position) : 'Người chăm sóc khách hàng'}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            {responsibleEmployeePhone && (
              <a
                href={`tel:${responsibleEmployeePhone}`}
                className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-extrabold text-emerald-700"
              >
                {responsibleEmployeePhone}
              </a>
            )}
            <button
              type="button"
              onClick={openCustomerSalesConversation}
              className="rounded-2xl bg-sky-50 px-3 py-2 text-xs font-extrabold text-sky-700 disabled:opacity-50"
            >
              Nhắn tin
            </button>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm">
        <h3 className="font-extrabold mb-3">Đổi quà</h3>
        {safeRewardCatalog.length > 0 ? safeRewardCatalog.slice(0, 5).map(item => (
          <div key={item.id} className="flex justify-between py-2 border-b border-gray-50 last:border-0"><span className="font-semibold text-sm">{item.name || item.title}</span><span className="text-xs font-bold text-emerald-600">{formatNumber(item.points || item.requiredPoints || 0)} điểm</span></div>
        )) : <p className="text-sm text-gray-400">Chưa có quà đổi điểm.</p>}
      </div>
      <div id="customer-profile-editor" className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm scroll-mt-24">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setIsCustomerProfileEditorOpen(prev => !prev)}
            className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl text-left active:scale-[0.99]"
          >
            <h3 className="font-extrabold">Hồ sơ cá nhân</h3>
            {isCustomerProfileEditorOpen ? <ChevronUp size={18} className="shrink-0 text-emerald-600" /> : <ChevronDown size={18} className="shrink-0 text-emerald-600" />}
          </button>
          <button onClick={onLogout} className="shrink-0 text-xs font-bold text-red-500">Đăng xuất</button>
        </div>
        {isCustomerProfileEditorOpen && profileDraft && (
          <div className="mt-3 space-y-3">
            <div className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-3 flex items-center gap-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-3xl border border-white bg-white shadow-sm flex items-center justify-center text-lg font-black text-emerald-600">
                {profileDraft.avatarUrl ? (
                  <img src={profileDraft.avatarUrl} alt="Ảnh đại diện khách hàng" className="h-full w-full object-cover" />
                ) : (
                  <span>{getInitials(profileDraft.name || customerProfile.name || 'KH')}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-gray-900">Ảnh đại diện</p>
                <p className="mt-1 text-xs leading-5 text-gray-500">Bấm chọn ảnh để cập nhật logo/cá nhân của tài khoản khách hàng.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => customerAvatarInputRef.current?.click()}
                    className="rounded-full bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm"
                  >
                    Tải ảnh
                  </button>
                  <button
                    type="button"
                    disabled={!profileDraft.avatarUrl}
                    onClick={() => setProfileDraft(prev => ({ ...prev, avatarUrl: '' }))}
                    className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-bold text-gray-600 disabled:opacity-40"
                  >
                    Xóa ảnh
                  </button>
                </div>
                <input ref={customerAvatarInputRef} type="file" accept="image/*" onChange={handleCustomerAvatarSelect} className="hidden" />
              </div>
            </div>
            <input value={profileDraft.avatarUrl} onChange={e => setProfileDraft(prev => ({ ...prev, avatarUrl: e.target.value }))} placeholder="Link ảnh đại diện nếu có" className="w-full rounded-2xl border border-gray-200 p-3 text-sm outline-none" />
            <input value={profileDraft.name} onChange={e => setProfileDraft(prev => ({ ...prev, name: e.target.value }))} placeholder="Họ tên" className="w-full rounded-2xl border border-gray-200 p-3 text-sm outline-none" />
            <input type="tel" value={profileDraft.phone} onChange={e => setProfileDraft(prev => ({ ...prev, phone: e.target.value }))} placeholder="Số điện thoại" className="w-full rounded-2xl border border-gray-200 p-3 text-sm outline-none" />
            <input value={profileDraft.address} onChange={e => setProfileDraft(prev => ({ ...prev, address: e.target.value }))} placeholder="Địa chỉ" className="w-full rounded-2xl border border-gray-200 p-3 text-sm outline-none" />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                value={profileDraft.locationInput || ''}
                onChange={e => {
                  const nextValue = e.target.value;
                  setProfileDraft(prev => ({
                    ...prev,
                    locationInput: nextValue,
                    location: parseCustomerLocationInput(nextValue)
                  }));
                }}
                placeholder="Vị trí giao hàng / link Maps / tọa độ"
                className="w-full rounded-2xl border border-gray-200 p-3 text-sm outline-none"
              />
              <button
                type="button"
                onClick={handleUseCurrentGpsForProfile}
                disabled={isGettingProfileGps}
                className="rounded-2xl bg-emerald-500 px-4 text-sm font-extrabold text-white shadow-sm disabled:bg-gray-300"
              >
                {isGettingProfileGps ? 'Đang lấy' : 'GPS'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={profileDraft.birthday} onChange={e => setProfileDraft(prev => ({ ...prev, birthday: e.target.value }))} className="rounded-2xl border border-gray-200 p-3 text-sm outline-none" />
              <input value={profileDraft.email} onChange={e => setProfileDraft(prev => ({ ...prev, email: e.target.value }))} placeholder="Email" className="rounded-2xl border border-gray-200 p-3 text-sm outline-none" />
            </div>
            <input value={profileDraft.zaloGroupLink} onChange={e => setProfileDraft(prev => ({ ...prev, zaloGroupLink: e.target.value }))} placeholder="Link Zalo" className="w-full rounded-2xl border border-gray-200 p-3 text-sm outline-none" />
            <div className="rounded-2xl bg-gray-50 p-3 text-xs text-gray-500">Mã khách hàng, nhóm khách, giá bán, công nợ và điểm thưởng do công ty quản lý.</div>
            <button onClick={saveProfile} disabled={isSavingProfile} className="w-full bg-emerald-500 text-white font-extrabold py-3 rounded-2xl disabled:bg-gray-300">{isSavingProfile ? 'Đang lưu...' : 'Lưu hồ sơ'}</button>
          </div>
        )}
      </div>
    </div>
  );

  const renderHome=()=> <InstantHome ready={Boolean(customerProfile?.id&&currentCompany?.id)} scope={JSON.stringify([currentCompany?.id,currentUser?.id,customerProfile?.id])}
    identity={{companyName:getCompanyDisplayName(currentCompany),logo:getCompanyLogoUrl(currentCompany),name:getCustomerPlainName(customerProfile)||customerProfile.name,avatar:customerProfile.avatarUrl}}
    modules={navItems.filter(item=>!['home','more'].includes(item.id)).map(item=>({id:item.id,label:item.label}))}
    onNavigate={setActiveTab} onProfile={()=>setActiveTab('more')} onNotifications={()=>setActiveTab('messages')} offline={!navigator.onLine}/>;
  const renderContent = () => {
    if(!financialReady&&['orders','debt','payments','points'].includes(activeTab))return <div role="status" aria-busy="true" data-hd-customer-financial-status="loading" className="rounded-2xl border border-slate-100 bg-white p-4 text-sm text-slate-500">Đang đối chiếu đơn hàng, công nợ và thanh toán…</div>;
    if (activeTab === 'order') return renderOrder();
    if (activeTab === 'orders') return renderOrders();
    if (activeTab === 'messages') return renderCustomerMessages();
    if (activeTab === 'debt') return renderDebt();
    if (activeTab === 'payments') return renderPayments();
    if (activeTab === 'bank') return renderBank();
    if (activeTab === 'points') return renderPoints();
    if (activeTab === 'more') return <>{renderMore()}<button type="button" onClick={()=>setActiveTab('overview')}>Thông tin tài khoản</button></>;
    if (activeTab === 'overview') return renderCustomerOverview();
    return renderHome();
  };

  return (
    <AppShell data-hd-customer-financial-source={financialStatus} className="customer-portal-shell hd-shell--customer min-h-screen">
      {renderPaymentSheet()}
      {renderCustomerOrderDetailSheet()}
      {renderPointWithdrawSheet()}
      <HDHeader style={{display:activeTab==='home'?'none':undefined}} className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <button
          type="button"
          onClick={openCustomerProfileEditor}
          className="flex flex-1 items-center gap-3 min-w-0 text-left rounded-2xl pr-2 active:scale-[0.99] transition"
          title="Bấm để chỉnh sửa hồ sơ khách hàng"
        >
          {activeTab === 'home' ? <AccountGreeting name={getCustomerPlainName(customerProfile) || customerProfile.name || currentUser?.phone || 'Bạn'} companyName={getCompanyDisplayName(currentCompany)} logoUrl={getCompanyLogoUrl(currentCompany)} /> : <><div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black overflow-hidden">
            {customerProfile.avatarUrl ? <img src={customerProfile.avatarUrl} alt="" className="w-full h-full object-cover" /> : getInitials(customerProfile.name || 'KH')}
          </div>
          <div className="min-w-0"><p className="text-xs text-gray-400 font-bold uppercase">{currentCompany?.name || 'HD Manager'}</p><h1 className="font-extrabold truncate">{customerProfile.name || currentUser?.phone}</h1></div></>}
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('order')}
            className="relative w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center"
            aria-label="Mở giỏ hàng"
            title="Giỏ hàng"
          >
            <ShoppingCart size={21} />
            {cartItemCount > 0 && (
              <span className="absolute -right-1 -top-1 flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black leading-none text-white shadow">
                {cartItemCount > 99 ? '99+' : cartItemCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={openCustomerInbox}
            className="relative w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center"
            aria-label="Mở hộp thư"
            title="Hộp thư"
          >
            <MessageCircle size={21} />
            {customerMessageBadgeCount > 0 && (
              <span className="absolute -right-1 -top-1 flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black leading-none text-white shadow">
                {customerMessageBadgeCount > 99 ? '99+' : customerMessageBadgeCount}
              </span>
            )}
          </button>
          {activeTab !== 'home' && <button onClick={() => setActiveTab('more')} className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center"><UserCircle size={22} className="text-emerald-600" /></button>}
        </div>
      </HDHeader>
      {activeTab === 'home' && pointsInfo.pendingRewardDate === getTodayString() && Number(pointsInfo.pendingRewardPoints) > 0 && (
        <div role="status" className="mx-4 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Hãy thanh toán để nhận số tiền {formatCurrency(pointsInfo.pendingRewardMoney)} đ tương đương {formatCurrency(pointsInfo.pendingRewardPoints)} tích điểm.
        </div>
      )}
      {submitMessage && (
        <div className="mx-4 mt-4 rounded-2xl bg-emerald-50 border border-emerald-100 p-3 text-sm font-semibold text-emerald-700 flex justify-between gap-3">
          <span>{submitMessage}</span><button onClick={() => setSubmitMessage('')}><X size={16} /></button>
        </div>
      )}
      <main className="customer-portal-main hd-shell-content p-4">
        <AppSectionErrorBoundary
          name={`customer_${activeTab}`}
          resetKey={activeTab}
          onReset={() => setActiveTab('home')}
        >
          {(activeTab==='home'||catalogState.status==='ready')?renderContent():<div data-hd-customer-bootstrap-status={catalogState.status} data-hd-module-loading aria-busy="true" className="rounded-2xl border border-gray-100 bg-white p-5 text-sm text-slate-600">
            {catalogState.status==='error'?<><p role="alert">{catalogState.error}</p><button type="button" onClick={onRetryCatalog} className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white">Thử lại</button></>:<p role="status">Đang lấy danh mục và thông tin khách hàng…</p>}
          </div>}
        </AppSectionErrorBoundary>
      </main>
      <div className="customer-portal-nav fixed left-1/2 z-30 -translate-x-1/2 bg-white"><InstantHomeNavigation active={activeTab==='more'?'profile':activeTab} onNavigate={setActiveTab} onModules={()=>setActiveTab('more')} onProfile={()=>setActiveTab('more')} onQuickCreate={onAddOrderRequest?()=>setActiveTab('order'):undefined}/></div>
    </AppShell>
  );
}
  return CustomerPortalView;
}
