import PreloadedWorkspace from '../../layout/PreloadedWorkspace.jsx';
import {createPreloadableModule} from '../../utils/preloadableModule.js';
const deferredCustomerDetailRender=createPreloadableModule(()=>import('./CustomerDetailRender.jsx'));
const deferredCustomerCreateRender=createPreloadableModule(()=>import('./CustomerCreateRender.jsx'));
const deferredCustomerImportRender=createPreloadableModule(()=>import('./CustomerImportRender.jsx'));
import {useCommittedCallback} from '../../utils/useCommittedCallback.js';
import {startSearchTrace} from '../../data/crmSearchTrace.js';
import { createSupplierEntryIndex } from '../../utils/supplierEntryIndex.js';
import { createBoundedCollationCompare } from '../../services/collationCompareCache.js';
import { isVpsStagingMode } from "@hd/hd-connect-runtime";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { CUSTOMER_RECONCILIATION_FILTERS, buildCustomerReconciliationExportFileName, buildCustomerReconciliationWorkbook, downloadCustomerReconciliationWorkbook, filterCustomerReconciliationRows, getCustomerReconciliationDirectionLabel, getCustomerReconciliationFilterLabel, paginateCustomerReconciliationRows, summarizeCustomerReconciliationRows } from "../../utils/customerReconciliationExport.js";
import { canPickCustomerContact as canUseCustomerContactPicker, getCustomerContactPickerUnavailableMessage } from "../../utils/customerContactPicker.js";
import { Capacitor } from "@capacitor/core";
import { useDebouncedValue, usePagedList } from "../../services/renderOptimization";
import { useCallback } from "react";
import { useCooperativeProjection } from "../../hooks/useCooperativeProjection.js";
import { hasSearchQuery as hasTokenSearchQuery, rankCustomerSearchResults, searchOrders as searchOrderRecords } from "../../services/searchEngine.js";
import { configScopeFingerprint } from "../../utils/customerProductAutoSync.js";
import { PRODUCT_PRICING_UNIT_OPTIONS, getProductPrimaryPricingUnit, normalizeProductPricingUnit, normalizeUnitPriceMap, putUnitPriceIntoMap } from "../../services/productPricingUnits.js";
import { Plus, Check, X, AlertCircle, ChevronRight, ChevronLeft, UserCircle, Phone, ChevronDown, ChevronUp, MapPin, Search, Package, Trash2, Wallet, CalendarDays, Filter, Receipt, FileText, Download, Loader2, Gift } from "lucide-react";
import { HDButton, HDFilterBar, HDFilterSheet, HDKpiCard } from "../../design-system/index.js";
import { ListPagination } from "../../design-system/ListPagination.jsx";
// Transitional bundle boundary. Only stable local module bindings are injected;
// all actor/company/business data continues to arrive through current props.
// Generated binding contract is checked against the real source AST.
export function createCustomerCRMView(runtime) {
  const {buildCustomerDirectionsUrl,sortOrdersByNewest,APP_SCREEN_BACK_EVENT,CUSTOMER_HONORIFIC_OPTIONS,EMPTY_CUSTOMER_SUMMARIES,EMPTY_MAIN_LEDGER,ReconciledLedgerContext,ShareActionGrid,buildCustomerDebtLimitStatus,buildCustomerImportDuplicateKey,buildCustomerLocationFromPosition,buildCustomerNameAliases,buildCustomerPhoneDuplicateKey,buildCustomerQuoteShareText,buildCustomerReconciledLedger,buildCustomerReconciledLedgerMap,buildLineItemProductSearchText,calculateCustomerLoyaltySummary,capitalizeFirst,capitalizeFirstPreservingSpacing,copyTextToClipboard,createCustomerBranchId,customerDirectorySummaryCache,escapeHtml,formatCurrency,formatCustomerLocationForDisplay,formatCustomerNameDraft,formatDateLabel,formatDateTimeLabel,formatInputCurrency,formatNumber,formatOrderCode,formatReturnGoodsQty,getCustomerBranchDisplayName,getCustomerDebtLimitConfig,getCustomerDisplayName,getCustomerHonorific,getCustomerLocationDisplayText,getCustomerLocationShareText,getCustomerOpeningDebtAmount,getCustomerOpeningPayableAmount,getCustomerPlainName,getDateKeyFromAnyValue,getDeliveryAssignmentIds,getEntityTimestamp,getFriendlyFirebaseErrorMessage,getLedgerOrderDisplayCode,getOrderLineQuantityValue,getOrderLineUnitPriceValue,getOrderLineWeightKgValue,getOrderReturnGoodsRecords,getOrderReturnProductSummary,getPaymentDateKey,getPaymentMethodLabel,getPaymentSourceLabel,getPaymentTimestamp,getProductAttributes,getProductShortName,getSalesDownlineEmployeeIds,getShareChannelLabel,getTodayString,getTransactionBillingPresentation,hasCustomerOrderConfigurationValue,inferCustomerHonorificFromName,isEmployeeDeliveryParticipant,isEmployeeSalesPosition,isOwnerAccountUser,markAppBackHandled,normalizeCustomerBranches,normalizeCustomerDebtLimitAmount,normalizeCustomerLocationFields,normalizeCustomerOpeningDebtAmount,normalizeCustomerOpeningPayableAmount,normalizeCustomerPhone,normalizeCustomerPriceOverrides,normalizeCustomerProductIds,normalizeLookupText,normalizeReturnGoodsStatus,parseCustomerImportWorkbook,parseCustomerLocationInput,parseEntityTimestampValue,parseInputCurrency,parseLooseMoneyValue,parseLooseQuantityValue,pickCustomerContactFromDevice,productMatchesLookup,requestCurrentLocation,resolveCustomerImportFixedProducts,resolveEntityDateKey,roundMoneyValue,saveContentFile,shareTextContent,shouldCollectCustomerDebtImmediately,sortLedgerOrdersNewestFirst,stripCustomerHonorificPrefix,summarizeOrderReturnGoods,toTitleCase} = runtime;
  function CustomerCRMView({initialCustomerId=null,initialAction=null,onReturnToDirectory,navigationRequest=null, localCustomerSource=null,onDirectoryReady,lookupDataReady=true,directoryDataReady=true,financialDataReady=true,supplementsRequested=false,onRequestSupplements,privacyScope = null, isVpsMode = false, employee, currentCompany, customers, orders, payments, expenses = [], paymentReconciliations = [], customerPoints = [], customerLoans = [], products = [], warehouseImports = [], warehouseDispatches = [], onAddCustomer, onEditCustomer, onDeleteCustomer, onDeleteCustomerLoan, onAddCustomerLoan, onEditCustomerLoan, onOpenCustomerDebt, onOpenOrder = () => false, canOpenOrderDetails = false, employees, isSuperAdmin, canViewAllCustomers = false, canViewAssignedCustomers = false, canViewSupplierImports = false, canEditCustomer = false, canDeleteCustomerPermission = false, canAddCustomerPermission = false, canBulkImportCustomersPermission = false, canReassignCustomerManagerPermission = false, canManageFixedProducts:fixedProductPermission = false, canManageCustomerPrices:pricePermission = false, canManageDriverDebtPermission = false, canViewCustomerLoyalty = false, canViewCustomerLoans = false, canCreateCustomerLoan = false, canReturnCustomerLoan = false, canEditCustomerLoan = false, canDeleteCustomerLoan = false, canManageCustomerDebtLimit = false, canViewCustomerDebtLimitAlerts = false, canViewCustomerPhone = false, canCopyCustomerPhone = false, canCallCustomerPhone = false, canViewCustomerLocation = false, canCopyCustomerLocation = false, canOpenCustomerMaps = false, canEditCustomerPhoneAddress = false, canEditCustomerLocation = false, canViewCustomerDebt = false, canViewCustomerStats = false, canViewCustomerOrderHistory = false, canViewCustomerPaymentHistory = false, searchKeyword: externalSearchKeyword, setSearchKeyword: setExternalSearchKeyword, showSearchBox: externalShowSearchBox, setShowSearchBox: setExternalShowSearchBox, showFilterPanel: externalShowFilterPanel, setShowFilterPanel: setExternalShowFilterPanel, quickActionIntent = null, onQuickActionHandled = () => {}, searchInHeader = false }) {
  const accountLoginEnabled = isVpsMode || isVpsStagingMode;
  const [showAddCustomer, setShowAddCustomer] = useState(initialAction==='create');
  const [showCustomerImportModal, setCustomerImportOpen] = useState(initialAction==='import');
  const setShowCustomerImportModal=useCallback(value=>{setCustomerImportOpen(value);if(value===false&&initialAction==='import')onReturnToDirectory?.();},[initialAction,onReturnToDirectory]);
  const [showCustomerQuickActions, setShowCustomerQuickActions] = useState(false);
  const [isPickingCustomerContact, setIsPickingCustomerContact] = useState(false);
  const [customerContactStatus, setCustomerContactStatus] = useState('');
  const customerCreateSubmitRef = useRef(false);
  const customerCreateCommandRef = useRef(null);
  if (customerCreateCommandRef.current === null) customerCreateCommandRef.current = crypto.randomUUID();
  const customerProfileSubmitRef = useRef(false);
  const [isSavingNewCustomer, setIsSavingNewCustomer] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialCustomerId);
  const [customerListMode, setCustomerListMode] = useState('customers');
  const [localCustomerSearchKeyword, setLocalCustomerSearchKeyword] = useState('');
  const [localShowSearchBox, setLocalShowSearchBox] = useState(false);
  const [localShowFilterPanel, setLocalShowFilterPanel] = useState(false);
  const [customerStatusFilter, setCustomerStatusFilter] = useState('all');
  const [supplierSortFilter, setSupplierSortFilter] = useState('recent');
  const [customerSortFilter, setCustomerSortFilter] = useState('default');
  const [customerDateFilter, setCustomerDateFilter] = useState(getTodayString());
  const [customerManagerFilter, setCustomerManagerFilter] = useState('all');
  const onLocalFiltersChange=localCustomerSource?.onFiltersChange;
  useEffect(()=>{onLocalFiltersChange?.({managerId:customerManagerFilter});},[onLocalFiltersChange,customerManagerFilter]);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderMonth, setOrderMonth] = useState('');
  const [orderSort, setOrderSort] = useState('newest');
  const [debtShareStatus, setDebtShareStatus] = useState('');
  const [customerEditForm, setCustomerEditForm] = useState({ name: '', phone: '', address: '', customerGroup: '', empId: '', zaloContact: '', zaloGroupLink: '', location: null, locationInput: '', debtLimitMode: 'no_debt', debtLimitAmount: '', purchaseReconciliationEnabled: false, openingDebtAmount: '', openingDebtNote: '', openingPayableAmount: '', openingPayableNote: '', createLogin: false, loginPassword: '', loginPasswordConfirm: '' });
  const [showCustomerEditForm, setShowCustomerEditForm] = useState(false);
  const [customerEditStatus, setCustomerEditStatus] = useState('');
  const [isSavingCustomerProfile, setIsSavingCustomerProfile] = useState(false);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);
  const [showCustomerLocationActions, setShowCustomerLocationActions] = useState(false);
  const [customerLocationStatus, setCustomerLocationStatus] = useState('');
  const [isUpdatingSelectedCustomerLocation, setIsUpdatingSelectedCustomerLocation] = useState(false);
  const [isCapturingNewCustomerLocation, setIsCapturingNewCustomerLocation] = useState(false);
  const [isImportingCustomers, setIsImportingCustomers] = useState(false);
  const [customerImportStatus, setCustomerImportStatus] = useState('');
  const [customerImportManagerId, setCustomerImportManagerId] = useState(() => (
    isEmployeeSalesPosition(employee) ? employee?.id || '' : (employees || []).find(isEmployeeSalesPosition)?.id || ''
  ));
  const [driverDebtAccessEnabledDraft, setDriverDebtAccessEnabledDraft] = useState(false);
  const [allowedDriverIdsDraft, setAllowedDriverIdsDraft] = useState([]);
  const [isSavingDriverAccess, setIsSavingDriverAccess] = useState(false);
  const [customerPriceDrafts, setCustomerPriceDrafts] = useState({});
  const customerPriceBaseRef = useRef('');
  const [customerPriceSearch, setCustomerPriceSearch] = useState('');
  const [customerPriceStatus, setCustomerPriceStatus] = useState('');
  const [isSavingCustomerPrices, setIsSavingCustomerPrices] = useState(false);
  const [customerPriceDirty, setCustomerPriceDirty] = useState(false);
  const [customerProductIdsDraft, setCustomerProductIdsDraft] = useState([]);
  const [customerProductPickerSearch, setCustomerProductPickerSearch] = useState('');
  const [isCustomerFixedProductsOpen, setIsCustomerFixedProductsOpen] = useState(true);
  const [customerBranchesDraft, setCustomerBranchesDraft] = useState([]);
  const [customerBranchStatus, setCustomerBranchStatus] = useState('');
  const [isSavingCustomerBranches, setIsSavingCustomerBranches] = useState(false);
  const [customerDebtLimitStatus, setCustomerDebtLimitStatus] = useState('');
  const [customerOpeningDebtStatus, setCustomerOpeningDebtStatus] = useState('');
  const [customerLoanDraft, setCustomerLoanDraft] = useState({ productName: '', quantity: '', unit: 'Kg', weightKg: '', loanDate: getTodayString(), dueDate: '', note: '' });
  const [customerLoanStatus, setCustomerLoanStatus] = useState('');
  const [customerLoanReturnDrafts, setCustomerLoanReturnDrafts] = useState({});
  const [customerLoanEditDrafts, setCustomerLoanEditDrafts] = useState({});
  const [editingCustomerLoanId, setEditingCustomerLoanId] = useState('');
  const [isSavingCustomerLoan, setIsSavingCustomerLoan] = useState(false);
  const [savingCustomerLoanReturnId, setSavingCustomerLoanReturnId] = useState('');
  const [savingCustomerLoanEditId, setSavingCustomerLoanEditId] = useState('');
  const [isSavingCustomerDebtLimit, setIsSavingCustomerDebtLimit] = useState(false);
  const [isSavingCustomerOpeningDebt, setIsSavingCustomerOpeningDebt] = useState(false);
  const [customerDetailOpenSections, setCustomerDetailOpenSections] = useState({});
  const [showCustomerDebtList, setShowCustomerDebtList] = useState(false);
  const [customerReconciliationFilter, setCustomerReconciliationFilter] = useState(CUSTOMER_RECONCILIATION_FILTERS.ALL);
  const [customerReconciliationExportStatus, setCustomerReconciliationExportStatus] = useState('');
  const [isExportingCustomerReconciliation, setIsExportingCustomerReconciliation] = useState(false);
  const customerImportInputRef = useRef(null);
  const customerContactPickerInFlightRef = useRef(false);
  const customerPriceAutoSaveTimerRef = useRef(null);
  const customerOrderHistoryRef = useRef(null);
  const customerPaymentHistoryRef = useRef(null);
  const customerLoansRef = useRef(null);
  const customerReconciliationReportRef = useRef(null);
  const selectedCustomerSnapshotRef = useRef(null);
  const showCustomerEditFormRef = useRef(false);
  const selectedCustomerDraftSourceIdRef = useRef(null);
  const customerWorkflowReturnRef = useRef(null);
  const handledNavigation=useRef(navigationRequest?.key);
  useEffect(()=>{
    if(!navigationRequest||handledNavigation.current===navigationRequest.key)return;
    handledNavigation.current=navigationRequest.key;
    setSelectedCustomerId(navigationRequest.customerId||null);
    setShowAddCustomer(navigationRequest.kind==='create');
    setCustomerImportOpen(navigationRequest.kind==='import');
    setShowCustomerQuickActions(false);setShowCustomerEditForm(false);
    if(navigationRequest.kind==='detail'){setOrderSearch('');setOrderMonth('');setOrderSort('newest');}
  },[navigationRequest]);

  const isSales = isEmployeeSalesPosition(employee);
  const isDeliveryParticipant = isEmployeeDeliveryParticipant(employee);
  const isOwnerCustomerAccount = Boolean(isSuperAdmin || canViewAllCustomers || isOwnerAccountUser(employee, null));
  const canViewEveryCustomer = Boolean(isOwnerCustomerAccount || canViewAllCustomers);
  const canViewAssignedCustomerList = Boolean(canViewAssignedCustomers || canViewEveryCustomer);
  const canDeleteCustomer = financialDataReady && Boolean(canDeleteCustomerPermission);
  const canReassignCustomerManager = lookupDataReady && Boolean(canReassignCustomerManagerPermission);
  const canAddCustomer = directoryDataReady && lookupDataReady && Boolean(canAddCustomerPermission);
  const canPickCustomerContact = canUseCustomerContactPicker({ platform: Capacitor.getPlatform() });
  const canBulkImportCustomers = directoryDataReady && lookupDataReady && Boolean(canBulkImportCustomersPermission);
  const canEditCustomerProfile = lookupDataReady && Boolean(canEditCustomer || canEditCustomerPhoneAddress || canEditCustomerLocation);
  const canManageFixedProducts=lookupDataReady&&fixedProductPermission;
  const canManageCustomerPrices=lookupDataReady&&pricePermission;
  const canSeeCustomerPhone = Boolean(isOwnerCustomerAccount || canViewCustomerPhone);
  const canCopyVisibleCustomerPhone = Boolean(isOwnerCustomerAccount || canCopyCustomerPhone);
  const canCallVisibleCustomerPhone = Boolean(isOwnerCustomerAccount || canCallCustomerPhone);
  const canSeeCustomerLocation = Boolean(isOwnerCustomerAccount || canViewCustomerLocation);
  const canCopyVisibleCustomerLocation = Boolean(isOwnerCustomerAccount || canCopyCustomerLocation);
  const canOpenVisibleCustomerMaps = Boolean(isOwnerCustomerAccount || canOpenCustomerMaps);
  const canEditCustomerContactFields = Boolean(canEditCustomer || canEditCustomerPhoneAddress);
  const canEditCustomerLocationFields = Boolean(canEditCustomer || canEditCustomerLocation);
  const canAddCustomerLocationFields = Boolean(canAddCustomer || canEditCustomerLocationFields);
  const canSeeCustomerDebt = financialDataReady && Boolean(isOwnerCustomerAccount || canViewCustomerDebt);
  const canSeeCustomerLoans = financialDataReady && Boolean(isOwnerCustomerAccount || canViewCustomerLoans);
  const canCreateCustomerLoanRecord = financialDataReady && Boolean(isOwnerCustomerAccount || canCreateCustomerLoan);
  const canReturnCustomerLoanRecord = financialDataReady && Boolean(isOwnerCustomerAccount || canReturnCustomerLoan);
  const canEditCustomerLoanRecord = financialDataReady && Boolean(isOwnerCustomerAccount || canEditCustomerLoan);
  const canDeleteCustomerLoanRecord = financialDataReady && Boolean(isOwnerCustomerAccount || canDeleteCustomerLoan);
  const canSeeCustomerDebtLimitAlerts = financialDataReady && Boolean(isOwnerCustomerAccount || canViewCustomerDebtLimitAlerts || canSeeCustomerDebt || canManageCustomerDebtLimit);
  const canSeeCustomerStats = financialDataReady && Boolean(isOwnerCustomerAccount || canViewCustomerStats);
  const canSeeCustomerOrderHistory = financialDataReady && Boolean(isOwnerCustomerAccount || canViewCustomerOrderHistory);
  const canSeeCustomerPaymentHistory = financialDataReady && Boolean(isOwnerCustomerAccount || canViewCustomerPaymentHistory);
  const canUseCustomerLoyalty=financialDataReady&&canViewCustomerLoyalty;
  const allActiveCustomers = useMemo(() => customers.filter(c => !c.isArchived), [customers]);
  const safeCustomerWarehouseDispatches = useMemo(
    () => (Array.isArray(warehouseDispatches) ? warehouseDispatches : []),
    [warehouseDispatches]
  );
  const safeCustomerWarehouseImports = useMemo(
    () => (Array.isArray(warehouseImports) ? warehouseImports : []),
    [warehouseImports]
  );
  const salesVisibleEmployeeIdSet = useMemo(() => {
    const ids = new Set();
    if (employee?.id) {
      ids.add(employee.id);
      getSalesDownlineEmployeeIds(employee.id, employees).forEach(id => ids.add(id));
    }
    return ids;
  }, [employee?.id, employees]);
  const driverAssignedCustomerIdSet = useMemo(() => {
    const ids = new Set();
    if (!isDeliveryParticipant || !employee?.id) return ids;
    const todayKey = getTodayString();
    safeCustomerWarehouseDispatches.forEach((dispatch) => {
      if (!dispatch || dispatch.isArchived) return;
      if (!getDeliveryAssignmentIds(dispatch).includes(employee.id)) return;
      const dispatchDateKey = resolveEntityDateKey(dispatch, dispatch.date || dispatch.createdAt || dispatch.updatedAt || todayKey);
      if (dispatchDateKey !== todayKey) return;
      const customerId = `${dispatch.customerId || dispatch.customer?.id || ''}`.trim();
      if (customerId) ids.add(customerId);
    });
    return ids;
  }, [employee?.id, isDeliveryParticipant, safeCustomerWarehouseDispatches]);
  const activeCustomers = useMemo(
    () => allActiveCustomers.filter(c => {
      if (isDeliveryParticipant && !isOwnerCustomerAccount) {
        if (driverAssignedCustomerIdSet.size > 0) return driverAssignedCustomerIdSet.has(c.id);
        return (c.allowedDriverIds || []).includes(employee?.id);
      }
      if (canViewEveryCustomer) return true;
      if (!canViewAssignedCustomerList) return false;
      if (isSales) return salesVisibleEmployeeIdSet.has(c.empId);
      return c.empId === employee?.id;
    }),
    [allActiveCustomers, canViewAssignedCustomerList, canViewEveryCustomer, driverAssignedCustomerIdSet, employee?.id, isDeliveryParticipant, isOwnerCustomerAccount, isSales, salesVisibleEmployeeIdSet]
  );
  const [newCus, setNewCus] = useState({ name: '', phone: '', address: '', customerGroup: '', empId: employee?.id || '', zaloGroupLink: '', location: null, locationInput: '', openingBalanceType: 'receivable', debtLimitMode: 'no_debt', debtLimitAmount: '', openingDebtAmount: '', openingDebtNote: '', openingPayableAmount: '', openingPayableNote: '', createLogin: false, loginPassword: '', loginPasswordConfirm: '' });
  const [newCustomerProductIds, setNewCustomerProductIds] = useState([]);
  const [newCustomerProductSearch, setNewCustomerProductSearch] = useState('');
  const activeProductsForPricing = useMemo(() => products.filter(product => !product.isArchived), [products]);
  const newCustomerProductSuggestionLimit = 10;
  const newCustomerProductUsageById = useMemo(() => {
    const usageByProductId = new Map();
    if (!showAddCustomer) return usageByProductId;
    (orders || [])
      .filter(order => !order?.isArchived)
      .forEach(order => {
        const orderItems = Array.isArray(order?.items) && order.items.length > 0
          ? order.items
          : (order?.primaryItem ? [order.primaryItem] : []);
        orderItems.forEach(item => {
          const productId = item?.productId || '';
          if (!productId) return;
          const current = usageByProductId.get(productId) || { quantity: 0, count: 0, lastTime: 0 };
          usageByProductId.set(productId, {
            quantity: current.quantity + (parseLooseQuantityValue(item?.quantity) || 1),
            count: current.count + 1,
            lastTime: Math.max(current.lastTime, getEntityTimestamp(order) || 0)
          });
        });
      });
    return usageByProductId;
  }, [orders, showAddCustomer]);
  const activeProductForPricingLookup = useMemo(
    () => new Map(activeProductsForPricing.map(product => [product.id, product])),
    [activeProductsForPricing]
  );
  const selectedNewCustomerProductIdSet = useMemo(
    () => new Set(newCustomerProductIds),
    [newCustomerProductIds]
  );
  const newCustomerProductOptions = useMemo(() => {
    if (!showAddCustomer) return [];
    const keyword = normalizeLookupText(newCustomerProductSearch);
    return activeProductsForPricing
      .filter(product => productMatchesLookup(product, keyword))
      .sort((a, b) => {
        const selectedDiff = Number(selectedNewCustomerProductIdSet.has(b.id)) - Number(selectedNewCustomerProductIdSet.has(a.id));
        if (selectedDiff !== 0) return selectedDiff;
        const aUsage = newCustomerProductUsageById.get(a.id) || { quantity: 0, count: 0, lastTime: 0 };
        const bUsage = newCustomerProductUsageById.get(b.id) || { quantity: 0, count: 0, lastTime: 0 };
        if (bUsage.quantity !== aUsage.quantity) return bUsage.quantity - aUsage.quantity;
        if (bUsage.count !== aUsage.count) return bUsage.count - aUsage.count;
        if (bUsage.lastTime !== aUsage.lastTime) return bUsage.lastTime - aUsage.lastTime;
        return (a.name || '').localeCompare(b.name || '', 'vi');
      });
  }, [showAddCustomer, activeProductsForPricing, newCustomerProductSearch, newCustomerProductUsageById, selectedNewCustomerProductIdSet]);
  const toggleNewCustomerProduct = (productId) => {
    if (!productId) return;
    setNewCustomerProductIds(prev => (
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    ));
  };
  const salesEmployees = useMemo(() => (employees ? employees.filter(e => isEmployeeSalesPosition(e)) : []), [employees]);
  const customerSearch = externalSearchKeyword ?? localCustomerSearchKeyword;
  const debouncedCustomerSearch = useDebouncedValue(localCustomerSource?.queryManaged?'':customerSearch, 160);
  const setCustomerSearch = setExternalSearchKeyword ?? setLocalCustomerSearchKeyword;
  const showSearchBox = externalShowSearchBox ?? localShowSearchBox;
  const setShowSearchBox = setExternalShowSearchBox ?? setLocalShowSearchBox;
  const showFilterPanel = externalShowFilterPanel ?? localShowFilterPanel;
  const setShowFilterPanel = setExternalShowFilterPanel ?? setLocalShowFilterPanel;

  const driverEmployees = useMemo(() => employees ? employees.filter(e => isEmployeeDeliveryParticipant(e)) : [], [employees]);
  const customerManagerOptions = useMemo(
    () => [{ value: 'all', label: 'Tất cả NVKD' }, ...(localCustomerSource?.queryManaged?localCustomerSource.managerOptions||[]:salesEmployees.map(emp => ({ value: emp.id, label: emp.name })))],
    [localCustomerSource?.queryManaged,localCustomerSource?.managerOptions,salesEmployees]
  );
  const customerPointLookup = useMemo(() => {
    const lookup = new Map();
    (Array.isArray(customerPoints) ? customerPoints : []).forEach(item => {
      const customerId = item?.customerId || item?.customer_id;
      if (customerId) lookup.set(customerId, item);
    });
    return lookup;
  }, [customerPoints]);

  const sharedCustomerLedgerMap = React.useContext(ReconciledLedgerContext);
  const customerLedgerIndex = useMemo(
    () => !financialDataReady?EMPTY_MAIN_LEDGER:sharedCustomerLedgerMap || buildCustomerReconciledLedgerMap(activeCustomers, orders, payments, safeCustomerWarehouseImports, expenses),
    [financialDataReady,sharedCustomerLedgerMap, activeCustomers, orders, payments, safeCustomerWarehouseImports, expenses]
  );
  const buildCustomerSummary = useCallback((cus) => {
    if(!financialDataReady)return {...cus,customerHonorific:getCustomerHonorific(cus),plainName:getCustomerPlainName(cus),displayName:getCustomerDisplayName(cus),
      managerName:employees.find(emp=>emp.id===cus.empId)?.name||'Chưa gán',orders:[],debtOrders:[],payments:[],purchaseImports:[],
      totalRevenue:null,totalPaid:null,currentDebt:null,creditBalance:null,orderCount:null,lastOrderDate:'',debtLimitStatus:null,
      allowedDriverNames:(cus.allowedDriverIds||[]).map(id=>employees.find(emp=>emp.id===id&&isEmployeeDeliveryParticipant(emp))?.name).filter(Boolean)};
    const ledger = customerLedgerIndex[cus.id] || buildCustomerReconciledLedger(cus, orders, payments, safeCustomerWarehouseImports, expenses);
    const purchaseReconciliationEnabled = Boolean(
      cus?.purchaseReconciliationEnabled ||
      cus?.isPurchaseReconciliationEnabled ||
      cus?.reconciliationEnabled ||
      cus?.hasPurchaseReconciliation
    );
    const loyalty = calculateCustomerLoyaltySummary({
      customer: cus,
      ledger,
      company: currentCompany,
      pointsRecord: customerPointLookup.get(cus.id)
    });
    const debtLimitStatus = buildCustomerDebtLimitStatus(cus, ledger);
    const customerDebtOrders = ledger.orders.filter(order => Math.max(0, parseLooseMoneyValue(order.outstandingAmount)) > 0);
    const customerOrders = ledger.orders.filter(order => !order.isOpeningDebt).sort((a, b) => new Date(b.date) - new Date(a.date));
    const customerPayments = [...ledger.payments].sort((a, b) => new Date(b.date) - new Date(a.date));
    const manager = employees.find(emp => emp.id === cus.empId);

    return {
      ...cus,
      customerHonorific: getCustomerHonorific(cus),
      plainName: getCustomerPlainName(cus),
      displayName: getCustomerDisplayName(cus),
      orders: customerOrders,
      debtOrders: customerDebtOrders,
      payments: customerPayments,
      totalRevenue: ledger.totalRevenue,
      totalPaid: ledger.totalPaid,
      currentDebt: ledger.currentDebt,
      creditBalance: ledger.creditBalance,
      purchaseReconciliationEnabled,
      hasPurchaseReconciliation: purchaseReconciliationEnabled || ledger.hasPurchaseReconciliation,
      salesDebtBeforeReconcile: ledger.salesDebtBeforeReconcile,
      purchaseDebt: ledger.purchaseDebt,
      openingPayableAmount: ledger.openingPayableAmount,
      openingPayableDate: ledger.openingPayableDate,
      openingPayableNote: ledger.openingPayableNote,
      purchaseImportAmount: ledger.purchaseImportAmount,
      purchaseImports: ledger.purchaseImports,
      companyOwesBeforeReconcile: ledger.companyOwesBeforeReconcile,
      reconciliationOffset: ledger.reconciliationOffset,
      reconciliationStatus: ledger.reconciliationStatus,
      reconciliationNetAmount: ledger.reconciliationNetAmount,
      debtLimitStatus,
      orderCount: customerOrders.length,
      managerName: manager?.name || 'Chưa gán',
      lastOrderDate: customerOrders[0]?.date || '',
      loyalty,
      loyaltyPoints: loyalty.currentPoints,
      loyaltyEligibleAmount: loyalty.eligibleAmount,
      loyaltyRedeemValue: loyalty.redeemValue,
      driverDebtAccessEnabled: cus.driverDebtAccessEnabled ?? ((cus.allowedDriverIds || []).length > 0),
      allowedDriverIds: cus.allowedDriverIds || [],
      allowedDriverNames: (cus.allowedDriverIds || [])
        .map(driverId => employees.find(emp => emp.id === driverId && isEmployeeDeliveryParticipant(emp))?.name)
        .filter(Boolean)
    };
  }, [financialDataReady,customerLedgerIndex, orders, payments, safeCustomerWarehouseImports, expenses, currentCompany, customerPointLookup, employees]);

  const [customerSummaryAttempt, setCustomerSummaryAttempt] = useState(0);
  const customerSummaryScope = JSON.stringify([financialDataReady,privacyScope, currentCompany?.id || '', employee?.id || '',
    Boolean(isSuperAdmin), Boolean(canViewAllCustomers), Boolean(canViewAssignedCustomers), Boolean(canViewSupplierImports),
    Boolean(canSeeCustomerPhone), Boolean(canSeeCustomerLocation), Boolean(canSeeCustomerDebt), Boolean(canSeeCustomerStats)]);
  const customerSummaryEntry = useMemo(() => typeof privacyScope === 'string' && privacyScope
    ? customerDirectorySummaryCache([customers, orders, payments, warehouseImports, expenses, customerPoints,
      employees, customerLedgerIndex, currentCompany || EMPTY_MAIN_LEDGER], customerSummaryScope) : null,
    [privacyScope, customers, orders, payments, warehouseImports, expenses, customerPoints, employees,
      customerLedgerIndex, currentCompany, customerSummaryScope]);
  const prepareCustomerSummaries = useCallback(function* () {
    void customerSummaryAttempt;
    const summaries = [];
    for (const customer of activeCustomers) { summaries.push(buildCustomerSummary(customer)); yield; }
    return summaries;
  }, [activeCustomers, buildCustomerSummary, customerSummaryAttempt]);
  // A SQLite directory page is capped at 100 and contains no financial
  // projection. Use the SAME existing summary function without an idle/worker
  // round trip. Full accounting and unbounded cloud arrays keep cooperation.
  const localDirectorySummaries=useMemo(()=>localCustomerSource?.queryManaged&&!financialDataReady&&activeCustomers.length<=100?activeCustomers.map(buildCustomerSummary):null,[localCustomerSource?.queryManaged,financialDataReady,activeCustomers,buildCustomerSummary]);
  const cooperativeCustomerSummary=useCooperativeProjection(prepareCustomerSummaries,customerSummaryEntry,{enabled:directoryDataReady&&localDirectorySummaries===null});
  const customerSummaryProjection=localDirectorySummaries===null?cooperativeCustomerSummary:{value:localDirectorySummaries,pending:false,error:null};
  const customerSummaryReady = !customerSummaryProjection.pending && !customerSummaryProjection.error;
  const completedCustomerSummaries = useRef({ scope: null, value: EMPTY_CUSTOMER_SUMMARIES });
  React.useLayoutEffect(() => {
    if (customerSummaryReady) completedCustomerSummaries.current = { scope: customerSummaryScope, value: customerSummaryProjection.value };
  }, [customerSummaryReady, customerSummaryScope, customerSummaryProjection.value]);
  const activeCustomerIdSet = useMemo(() => new Set(activeCustomers.map(customer => customer.id)), [activeCustomers]);
  // Keep only a same-access readonly directory during recomputation. Remove
  // deleted/out-of-scope rows immediately; a selected detail is rebuilt from
  // its current source below, never from a retained financial summary.
  const customerSummaries = useMemo(() => {
    if (customerSummaryReady) return customerSummaryProjection.value;
    if (customerSummaryProjection.error || completedCustomerSummaries.current.scope !== customerSummaryScope) return EMPTY_CUSTOMER_SUMMARIES;
    return completedCustomerSummaries.current.value.filter(customer => activeCustomerIdSet.has(customer.id));
  }, [customerSummaryReady, customerSummaryProjection.value, customerSummaryProjection.error, customerSummaryScope, activeCustomerIdSet]);
  const customerDirectoryAvailable = customerSummaryReady || (!customerSummaryProjection.error && completedCustomerSummaries.current.scope === customerSummaryScope);
  const directoryReadyAnnouncement=useRef(null);
  useEffect(()=>{
    if(customerSummaryReady&&directoryDataReady&&directoryReadyAnnouncement.current!==customerSummaryScope){
      directoryReadyAnnouncement.current=customerSummaryScope;onDirectoryReady?.();
    }
  },[customerSummaryReady,directoryDataReady,customerSummaryScope,onDirectoryReady]);
  const retryCustomerSummaries = () => setCustomerSummaryAttempt(attempt => attempt + 1);

  const compareSupplierNames = useMemo(() => createBoundedCollationCompare(new Intl.Collator('vi')), []);
  const compareCustomerNames = compareSupplierNames;
  const supplierEntries = useMemo(() => {
    const entries = [];
    const supplierEntryIndex = createSupplierEntryIndex({normalizeName:normalizeLookupText,normalizePhone:normalizeCustomerPhone});
    const visibleCustomersById = new Map(customerSummaries.map(customer => [`${customer.id}`, customer]));
    const findEntry = (name, phone, customerId) => supplierEntryIndex.find(name, phone, customerId);
    customerSummaries.filter(customer => customer.hasPurchaseReconciliation).forEach(customer => {
      entries.push(supplierEntryIndex.add({
        id: `customer-${customer.id}`,
        customerId: customer.id,
        name: customer.displayName || customer.name || 'Nhà cung cấp',
        phone: canSeeCustomerPhone ? (customer.phone || '') : '',
        address: canSeeCustomerLocation ? (customer.address || '') : '',
        importCount: 0,
        totalAmount: 0,
        lastImportTime: 0
      }));
    });
    if (canViewSupplierImports) {
      safeCustomerWarehouseImports.filter(item => item && !item.isArchived).forEach(item => {
        const supplierName = `${item.supplier || item.supplierName || ''}`.trim();
        const customerId = `${item.supplierCustomerId || ''}`.trim();
        if (!supplierName && !customerId) return;
        const linkedCustomer = customerId ? visibleCustomersById.get(customerId) : null;
        if (customerId && !linkedCustomer) return;
        const name = linkedCustomer?.displayName || supplierName || linkedCustomer?.name || '';
        const phone = linkedCustomer
          ? (canSeeCustomerPhone ? (linkedCustomer.phone || item.supplierPhone || '') : '')
          : `${item.supplierPhone || ''}`.trim();
        let entry = findEntry(name, phone, linkedCustomer?.id || '');
        if (!entry) {
          entry = {
            id: linkedCustomer ? `customer-${linkedCustomer.id}` : `supplier-${normalizeLookupText(name)}-${normalizeCustomerPhone(phone)}`,
            customerId: linkedCustomer?.id || '',
            name,
            phone,
            address: linkedCustomer && canSeeCustomerLocation ? (linkedCustomer.address || '') : '',
            importCount: 0,
            totalAmount: 0,
            lastImportTime: 0
          };
          entries.push(supplierEntryIndex.add(entry));
        }
        entry.importCount += 1;
        entry.totalAmount += parseLooseMoneyValue(item.amount) || 0;
        const importDateTime = new Date(item.date || '').getTime();
        entry.lastImportTime = Math.max(entry.lastImportTime, Number.isFinite(importDateTime) ? importDateTime : (getEntityTimestamp(item) || 0));
      });
    }
    return entries.sort((a, b) => b.lastImportTime - a.lastImportTime || compareSupplierNames(a.name, b.name));
  }, [customerSummaries, safeCustomerWarehouseImports, canViewSupplierImports, canSeeCustomerPhone, canSeeCustomerLocation]);

  const filteredSuppliers = useMemo(() => {
    const keyword = normalizeLookupText(debouncedCustomerSearch);
    const matches = !keyword ? supplierEntries : supplierEntries.filter(entry => normalizeLookupText([
      entry.name, entry.phone, entry.address
    ].filter(Boolean).join(' ')).includes(keyword));
    return supplierSortFilter === 'name'
      ? [...matches].sort((a, b) => compareSupplierNames(a.name, b.name))
      : matches;
  }, [debouncedCustomerSearch, supplierEntries, supplierSortFilter]);

  const supplierPage = usePagedList(
    filteredSuppliers,
    `suppliers|${debouncedCustomerSearch}|${supplierSortFilter}`
  );

  const filteredCustomers = useMemo(() => {
    if(localCustomerSource?.queryManaged)return customerSummaries;
    const rawKeyword = `${debouncedCustomerSearch || ''}`.trim();
    const hasKeyword = hasTokenSearchQuery(rawKeyword);
    const dateActivityTimes = new Map();
    const getCustomerDateActivityTime = (cus) => {
      if (dateActivityTimes.has(cus)) return dateActivityTimes.get(cus);
      const targetDate = customerDateFilter || getTodayString();
      const activityItems = [
        ...(Array.isArray(cus.orders) ? cus.orders : []),
        ...(Array.isArray(cus.payments) ? cus.payments : []),
        cus
      ];
      const latestActivity = activityItems.reduce((latest, item) => {
        const dateKey = getDateKeyFromAnyValue(item?.date || item?.createdAt || item?.createdDate || item?.updatedAt || getEntityTimestamp(item));
        if (dateKey !== targetDate) return latest;
        const timeValue = getEntityTimestamp(item) || new Date(item?.createdAt || item?.updatedAt || item?.date || `${targetDate}T12:00:00`).getTime() || 0;
        return Math.max(latest, timeValue);
      }, 0);
      dateActivityTimes.set(cus, latestActivity);
      return latestActivity;
    };
    const customerSearchRankById = new Map(
      hasKeyword
        ? rankCustomerSearchResults(customerSummaries.map((cus) => {
          const manager = employees.find(emp => emp.id === cus.empId) || {};
          const fixedProductNames = (Array.isArray(cus.customerProductIds) ? cus.customerProductIds : [])
            .map(productId => activeProductForPricingLookup.get(productId)?.name)
            .filter(Boolean);
          return {
            ...cus,
            searchAliases: buildCustomerNameAliases(cus),
            // Supplemental fields stay ephemeral so private source data is never changed.
            searchText: [
              manager.name,
              manager.phone,
              ...(Array.isArray(cus.allowedDriverNames) ? cus.allowedDriverNames : []),
              ...fixedProductNames,
              canSeeCustomerLocation ? getCustomerLocationShareText(cus) : '',
            ].filter(Boolean).join(' '),
          };
        }), rawKeyword).map(result => [result.record.id, result.score])
        : []
    );
    const matchesCustomerKeyword = (cus) => !hasKeyword || customerSearchRankById.has(cus.id);
    const filteredList = customerSummaries.filter(cus => {
      if (!matchesCustomerKeyword(cus)) return false;
      if (!hasKeyword) {
        if (canSeeCustomerDebt) {
          if (customerStatusFilter === 'debt' && !(cus.currentDebt > 0)) return false;
          if (customerStatusFilter === 'credit' && !(cus.creditBalance > 0)) return false;
          if (customerStatusFilter === 'balanced' && (cus.currentDebt > 0 || cus.creditBalance > 0)) return false;
        }
        if (customerSortFilter === 'date' && customerDateFilter && getCustomerDateActivityTime(cus) <= 0) return false;
        if (customerManagerFilter !== 'all' && cus.empId !== customerManagerFilter) return false;
      }
      return true;
    });
    return filteredList.sort((a, b) => {
      if (hasKeyword) {
        const scoreDiff = (customerSearchRankById.get(b.id) || 0) - (customerSearchRankById.get(a.id) || 0);
        if (scoreDiff !== 0) return scoreDiff;
      }
      if ((customerSortFilter === 'revenue' || customerSortFilter === 'revenue_desc') && canSeeCustomerStats) {
        if (b.totalRevenue !== a.totalRevenue) return b.totalRevenue - a.totalRevenue;
      }
      if (customerSortFilter === 'revenue_asc' && canSeeCustomerStats) {
        if (a.totalRevenue !== b.totalRevenue) return a.totalRevenue - b.totalRevenue;
      }
      if (customerSortFilter === 'date') {
        const timeDiff = getCustomerDateActivityTime(b) - getCustomerDateActivityTime(a);
        if (timeDiff !== 0) return timeDiff;
      }
      return compareCustomerNames(a.displayName || a.name || '', b.displayName || b.name || '');
    });
  }, [localCustomerSource?.queryManaged,activeProductForPricingLookup, customerSummaries, debouncedCustomerSearch, customerStatusFilter, customerSortFilter, customerDateFilter, customerManagerFilter, employees, canSeeCustomerStats, canSeeCustomerPhone, canSeeCustomerLocation, canSeeCustomerDebt, compareCustomerNames]);

  // The native local directory already has a complete bounded SQL page. Mount
  // only a viewport-sized presentation page on phones; the existing pagination
  // retains access to EVERY row. Resolve once, so opening the keyboard cannot
  // change page boundaries or move a user's selection.
  const [localDirectoryRenderSize] = useState(() => {
    if (!localCustomerSource?.queryManaged || typeof window === 'undefined' || window.innerWidth > 768) return undefined;
    return Math.max(4, Math.min(10, Math.ceil(Math.max(0, window.innerHeight - 280) / 110)));
  });
  const customerPage = usePagedList(
    filteredCustomers,
    `${localCustomerSource?.queryManaged?customerSearch:debouncedCustomerSearch}|${customerStatusFilter}|${customerSortFilter}|${customerDateFilter}|${customerManagerFilter}`,
    localDirectoryRenderSize
  );

  const duplicateCustomerPhoneGroups = useMemo(() => {
    const phoneMap = new Map();
    activeCustomers.forEach((customer) => {
      const phoneKey = buildCustomerPhoneDuplicateKey(customer.phone);
      if (!phoneKey) return;
      const currentList = phoneMap.get(phoneKey) || [];
      currentList.push(customer);
      phoneMap.set(phoneKey, currentList);
    });
    return [...phoneMap.entries()]
      .map(([phoneKey, entries]) => ({ phoneKey, entries }))
      .filter(group => group.entries.length > 1);
  }, [activeCustomers]);
  const duplicateCustomerPhoneKeySet = useMemo(
    () => new Set(duplicateCustomerPhoneGroups.map(group => group.phoneKey)),
    [duplicateCustomerPhoneGroups]
  );
  const newCustomerPhoneDuplicate = useMemo(() => {
    const phoneKey = buildCustomerPhoneDuplicateKey(newCus.phone);
    if (!phoneKey) return null;
    return allActiveCustomers.find(customer => buildCustomerPhoneDuplicateKey(customer.phone) === phoneKey) || null;
  }, [allActiveCustomers, newCus.phone]);
  const getDuplicateCustomerDisplayName = (customer) => {
    if (!customer) return 'khách hàng khác';
    if (!isSales || salesVisibleEmployeeIdSet.has(customer.empId)) return customer.name || 'khách hàng khác';
    return 'một khách hàng khác trong hệ thống';
  };

  const selectedCustomerLive = useMemo(() => {
    if (!selectedCustomerId) return null;
    if(localCustomerSource?.detail?.id===selectedCustomerId)return buildCustomerSummary(localCustomerSource.detail);
    const sourceCustomer = activeCustomers.find(cus => cus.id === selectedCustomerId);
    if (!sourceCustomer) return null;
    const visibleSummary = customerSummaryReady ? customerSummaries.find(cus => cus.id === selectedCustomerId) : null;
    return visibleSummary || buildCustomerSummary(sourceCustomer);
  }, [localCustomerSource?.detail,activeCustomers, buildCustomerSummary, customerSummaryReady, customerSummaries, selectedCustomerId]);

  useEffect(() => {
    if (!selectedCustomerId) {
      selectedCustomerSnapshotRef.current = null;
      return;
    }
    if (selectedCustomerLive) {
      selectedCustomerSnapshotRef.current = selectedCustomerLive;
    }
  }, [selectedCustomerId, selectedCustomerLive]);

  useEffect(() => {
    showCustomerEditFormRef.current = showCustomerEditForm;
  }, [showCustomerEditForm]);

  const selectedCustomer = (localCustomerSource?.detail?.id === selectedCustomerId || activeCustomerIdSet.has(selectedCustomerId))
    ? selectedCustomerLive || (selectedCustomerSnapshotRef.current?.id === selectedCustomerId ? selectedCustomerSnapshotRef.current : null)
    : null;
  const handleOpenSelectedCustomerDebt = () => {
    if (!selectedCustomer) return;
    const openedDebtLedger = onOpenCustomerDebt?.(selectedCustomer.id);
    if (!openedDebtLedger) setShowCustomerDebtList(true);
  };
  const selectedCustomerLocationText = selectedCustomer ? getCustomerLocationDisplayText(selectedCustomer) : '';
  const selectedCustomerLocationShareText = selectedCustomer ? getCustomerLocationShareText(selectedCustomer) : '';
  const selectedCustomerDirectionsUrl = selectedCustomer ? buildCustomerDirectionsUrl(selectedCustomer) : '';
  const selectedCustomerNeedsImmediateCollection = shouldCollectCustomerDebtImmediately(selectedCustomer?.debtLimitStatus);
  const selectedCustomerDebtOrders = useMemo(
    () => sortLedgerOrdersNewestFirst((selectedCustomer?.debtOrders || []).filter(order => Math.max(0, parseLooseMoneyValue(order.outstandingAmount)) > 0)),
    [selectedCustomer?.debtOrders]
  );
  const getCustomerLoanBalance = (loan = {}) => {
    const borrowedQuantity = parseLooseQuantityValue(loan.quantity);
    const borrowedWeightKg = parseLooseQuantityValue(loan.weightKg);
    const returns = Array.isArray(loan.returns) ? loan.returns : [];
    const returnedQuantity = returns.reduce((sum, item) => sum + parseLooseQuantityValue(item.quantity), 0);
    const returnedWeightKg = returns.reduce((sum, item) => sum + parseLooseQuantityValue(item.weightKg), 0);
    const remainingQuantity = Math.max(0, borrowedQuantity - returnedQuantity);
    const remainingWeightKg = Math.max(0, borrowedWeightKg - returnedWeightKg);
    const hasQuantityTracking = borrowedQuantity > 0 || returnedQuantity > 0;
    const hasWeightTracking = borrowedWeightKg > 0 || returnedWeightKg > 0;
    const isClosed = (!hasQuantityTracking || remainingQuantity <= 0.0001) && (!hasWeightTracking || remainingWeightKg <= 0.0001);
    const isOverdue = !isClosed && loan.dueDate && loan.dueDate < getTodayString();
    return { borrowedQuantity, borrowedWeightKg, returnedQuantity, returnedWeightKg, remainingQuantity, remainingWeightKg, hasQuantityTracking, hasWeightTracking, isClosed, isOverdue };
  };
  const selectedCustomerLoans = useMemo(() => (
    (Array.isArray(customerLoans) ? customerLoans : [])
      .filter(loan => loan.customerId === selectedCustomerId && !loan.isArchived)
      .sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.createdAt || a.loanDate || 0).getTime() || 0;
        const timeB = new Date(b.updatedAt || b.createdAt || b.loanDate || 0).getTime() || 0;
        return timeB - timeA;
      })
  ), [customerLoans, selectedCustomerId]);
  const selectedCustomerLoanStats = useMemo(() => selectedCustomerLoans.reduce((acc, loan) => {
    const balance = getCustomerLoanBalance(loan);
    if (balance.isClosed) acc.closed += 1;
    else acc.open += 1;
    if (balance.isOverdue) acc.overdue += 1;
    acc.remainingQuantity += balance.remainingQuantity;
    acc.remainingWeightKg += balance.remainingWeightKg;
    return acc;
  }, { open: 0, closed: 0, overdue: 0, remainingQuantity: 0, remainingWeightKg: 0 }), [selectedCustomerLoans]);
  const selectedCustomerPendingReturnGoods = useMemo(() => {
    if (!selectedCustomerId) return [];
    return (Array.isArray(orders) ? orders : [])
      .filter(order => !order.isArchived && (order.customerId || order.customer?.id) === selectedCustomerId)
      .flatMap(order => getOrderReturnGoodsRecords(order)
        .filter(record => normalizeReturnGoodsStatus(record) === 'pending_pickup')
        .map(record => ({
          ...record,
          orderId: order.id,
          orderCode: record.orderCode || formatOrderCode(order.id),
          productSummary: record.productSummary || getOrderReturnProductSummary(order)
        })));
  }, [orders, selectedCustomerId]);
  const selectedCustomerPendingReturnSummary = useMemo(
    () => summarizeOrderReturnGoods({ returnGoods: selectedCustomerPendingReturnGoods }),
    [selectedCustomerPendingReturnGoods]
  );
  const selectedCustomerReconciliationRows = useMemo(() => {
    if (!selectedCustomer?.hasPurchaseReconciliation) return [];

    const rows = [];
    const customerId = `${selectedCustomer.id || ''}`.trim();
    const customerPhone = normalizeCustomerPhone(selectedCustomer.phone || selectedCustomer.phoneNumber || '');
    const customerNameKeys = [
      selectedCustomer.displayName,
      selectedCustomer.plainName,
      selectedCustomer.name,
      getCustomerDisplayName(selectedCustomer)
    ].map(value => normalizeLookupText(value || '')).filter(value => value.length >= 3);
    const customerOrderIds = new Set((selectedCustomer.orders || []).map(order => `${order?.id || ''}`.trim()).filter(Boolean));
    const customerOrderRefs = new Set((selectedCustomer.orders || []).flatMap(order => [
      order?.id,
      order?.code,
      order?.orderCode,
      order?.invoiceCode,
      formatOrderCode(order?.id)
    ]).map(value => normalizeLookupText(value || '')).filter(Boolean));
    const selectedCustomerOrders = Array.isArray(selectedCustomer.orders) ? selectedCustomer.orders : [];
    const findLinkedCustomerOrder = (record = {}) => {
      const raw = record?.webhookData && typeof record.webhookData === 'object' ? record.webhookData : {};
      const candidateOrderIds = [record.orderId, record.invoiceId, record.linkedOrderId, raw.orderId, raw.invoiceId]
        .map(value => `${value || ''}`.trim())
        .filter(Boolean);
      const directMatch = selectedCustomerOrders.find(order => candidateOrderIds.includes(`${order?.id || ''}`.trim()));
      if (directMatch) return directMatch;

      const candidateRefs = [
        record.orderCode,
        record.invoiceCode,
        record.payosOrderCode,
        record.sepayReferenceCode,
        record.referenceCode,
        raw.orderCode,
        raw.invoiceCode,
        raw.referenceCode
      ].map(value => normalizeLookupText(value || '')).filter(Boolean);
      return selectedCustomerOrders.find(order => {
        const orderRefs = [order?.id, order?.code, order?.orderCode, order?.invoiceCode, formatOrderCode(order?.id)]
          .map(value => normalizeLookupText(value || ''))
          .filter(Boolean);
        return candidateRefs.some(reference => orderRefs.some(orderRef => (
          reference === orderRef || reference.includes(orderRef) || orderRef.includes(reference)
        )));
      }) || null;
    };
    const buildOrderMetrics = (record = {}) => {
      const items = Array.isArray(record.items) ? record.items : [];
      const totals = items.reduce((result, item) => {
        const unit = normalizeLookupText(item?.quantityUnit || item?.unit || '');
        const quantity = getOrderLineQuantityValue(item);
        const weightKg = getOrderLineWeightKgValue(item);
        const unitPrice = getOrderLineUnitPriceValue(item);
        return {
          weightKg: result.weightKg + weightKg,
          pieces: result.pieces + (unit.includes('con') ? quantity : 0),
          unitPrices: unitPrice > 0 ? [...result.unitPrices, unitPrice] : result.unitPrices,
          lineAmount: result.lineAmount + getTransactionBillingPresentation(item).amount
        };
      }, { weightKg: 0, pieces: 0, unitPrices: [], lineAmount: 0 });
      const recordUnit = normalizeLookupText(record.quantityUnit || record.unit || '');
      const fallbackQuantity = getOrderLineQuantityValue(record);
      const fallbackWeightKg = getOrderLineWeightKgValue(record);
      const fallbackUnitPrice = getOrderLineUnitPriceValue(record);
      const amount = parseLooseMoneyValue(record.amount ?? record.totalAmount ?? record.value ?? record.total) || totals.lineAmount;
      const distinctUnitPrices = [...new Set(totals.unitPrices)];
      const unitPrice = distinctUnitPrices.length === 1 ? distinctUnitPrices[0] : fallbackUnitPrice;
      return {
        weightKg: totals.weightKg || fallbackWeightKg,
        pieces: totals.pieces || (recordUnit.includes('con') ? fallbackQuantity : 0),
        priceLabel: unitPrice > 0
          ? `Giá ${formatCurrency(unitPrice)} đ`
          : amount > 0
            ? `Tổng ${formatCurrency(amount)} đ`
            : ''
      };
    };
    const getRawDate = (record = {}) => record.date
      || record.paymentDate
      || record.transactionDate
      || record.transactionDateTime
      || record.paidAt
      || record.transactionAt
      || record.createdAt
      || record.updatedAt
      || '';
    const getRowTime = (record = {}) => getPaymentTimestamp(record) || getEntityTimestamp(record) || parseEntityTimestampValue(getRawDate(record)) || 0;
    const getRowDateLabel = (record = {}) => {
      const dateKey = record.type === 'payment'
        ? getPaymentDateKey(record)
        : getDateKeyFromAnyValue(getRawDate(record));
      return formatDateLabel(dateKey || getRawDate(record) || getTodayString());
    };
    const addRow = (row) => {
      if (!row || row.amount <= 0) return;
      rows.push({
        ...row,
        dateLabel: row.dateLabel || getRowDateLabel(row.source || {}),
        time: row.time || getRowTime(row.source || {})
      });
    };

    const openingPayableAmount = getCustomerOpeningPayableAmount(selectedCustomer);
    if (openingPayableAmount > 0) {
      addRow({
        id: `opening_payable_${customerId}`,
        direction: CUSTOMER_RECONCILIATION_FILTERS.COMPANY_PURCHASE,
        title: 'Nợ cũ công ty với khách',
        detail: selectedCustomer.openingPayableNote || 'Số dư công ty nợ khách từ trước khi dùng app.',
        reference: 'Nợ cũ',
        amount: openingPayableAmount,
        amountLabel: 'Cty nợ/mua',
        tone: 'indigo',
        dateLabel: formatDateLabel(selectedCustomer.openingPayableDate || getTodayString()),
        time: parseEntityTimestampValue(selectedCustomer.openingPayableDate) || 0,
        source: selectedCustomer
      });
    }

    (Array.isArray(selectedCustomer.purchaseImports) ? selectedCustomer.purchaseImports : []).forEach(item => {
      const amount = parseLooseMoneyValue(item.amount ?? item.totalAmount ?? item.value ?? item.total);
      addRow({
        id: `purchase_${item.id || item.code || getEntityTimestamp(item) || rows.length}`,
        direction: CUSTOMER_RECONCILIATION_FILTERS.COMPANY_PURCHASE,
        title: 'Công ty mua hàng từ khách',
        detail: item.note || item.description || item.productName || item.supplierName || 'Phiếu nhập hàng',
        reference: item.code || item.invoiceCode || item.referenceCode || item.id || '',
        amount,
        amountLabel: 'Cty nợ/mua',
        tone: 'indigo',
        metrics: buildOrderMetrics(item),
        source: item
      });
    });

    selectedCustomerOrders.forEach(order => {
      const amount = parseLooseMoneyValue(order.amount ?? order.totalAmount ?? order.total)
        || (Array.isArray(order.items)
          ? order.items.reduce((sum, item) => sum + (getOrderLineQuantityValue(item) * getOrderLineUnitPriceValue(item)), 0)
          : 0);
      const productNames = (Array.isArray(order.items) ? order.items : [])
        .map(item => item?.description || item?.productName || item?.name || '')
        .filter(Boolean);
      addRow({
        id: `sale_order_${order.id || formatOrderCode(order.id) || rows.length}`,
        direction: CUSTOMER_RECONCILIATION_FILTERS.CUSTOMER_PURCHASE,
        title: 'Hóa đơn bán hàng',
        detail: productNames.length > 0 ? productNames.slice(0, 2).join(', ') : 'Hóa đơn bán cho khách',
        reference: order.code || order.orderCode || order.invoiceCode || formatOrderCode(order.id),
        amount,
        amountLabel: 'Khách mua',
        tone: 'emerald',
        orderId: order.id,
        metrics: buildOrderMetrics(order),
        source: order
      });
    });

    (Array.isArray(selectedCustomer.payments) ? selectedCustomer.payments : []).forEach(payment => {
      const amount = parseLooseMoneyValue(payment.amount);
      const appliedAmount = parseLooseMoneyValue(payment.appliedAmount);
      const linkedOrder = findLinkedCustomerOrder(payment);
      addRow({
        id: `payment_${payment.id || getPaymentTimestamp(payment) || rows.length}`,
        direction: 'payment',
        title: appliedAmount > 0 ? 'Khách thanh toán và cấn trừ' : 'Khách thanh toán',
        detail: payment.note || getPaymentSourceLabel(payment) || 'Khoản thu từ khách hàng',
        reference: payment.orderCode || payment.invoiceCode || payment.orderId || payment.referenceCode || '',
        amount,
        amountLabel: appliedAmount > 0 ? `Đã cấn trừ ${formatCurrency(appliedAmount)} đ` : 'Đã thu',
        tone: 'emerald',
        orderId: linkedOrder?.id || '',
        metrics: linkedOrder ? buildOrderMetrics(linkedOrder) : null,
        source: payment
      });
    });

    const pendingStatuses = new Set(['need_reconciliation', 'pending', 'unmatched', 'manual', 'awaiting_review', 'pending_review']);
    (Array.isArray(paymentReconciliations) ? paymentReconciliations : []).forEach(item => {
      const status = normalizeLookupText(item.status || item.reconciliationStatus || '').replace(/\s+/g, '_');
      if (status && !pendingStatuses.has(status)) return;
      const raw = item.webhookData && typeof item.webhookData === 'object' ? item.webhookData : {};
      const candidateIds = [
        item.customerId, item.linkedCustomerId, item.supplierCustomerId, item.customer?.id,
        raw.customerId, raw.linkedCustomerId, raw.supplierCustomerId, raw.customer?.id
      ].map(value => `${value || ''}`.trim()).filter(Boolean);
      const candidateOrderIds = [item.orderId, item.invoiceId, raw.orderId, raw.invoiceId]
        .map(value => `${value || ''}`.trim()).filter(Boolean);
      const candidateRefs = [
        item.orderCode, item.invoiceCode, item.payosOrderCode, item.sepayReferenceCode,
        item.sepayCode, item.transactionId, item.bankTransactionId, item.referenceCode,
        raw.orderCode, raw.invoiceCode, raw.referenceCode, raw.transactionId
      ].map(value => normalizeLookupText(value || '')).filter(Boolean);
      const candidatePhones = [item.phone, item.customerPhone, raw.phone, raw.customerPhone]
        .map(value => normalizeCustomerPhone(value || '')).filter(Boolean);
      const candidateTexts = [item.customerName, item.customerNameSnapshot, item.supplierName, item.description, item.note, raw.customerName, raw.description]
        .map(value => normalizeLookupText(value || '')).filter(Boolean);
      const isLinked = candidateIds.includes(customerId)
        || candidateOrderIds.some(value => customerOrderIds.has(value))
        || candidateRefs.some(value => customerOrderRefs.has(value) || [...customerOrderRefs].some(ref => value.includes(ref) || ref.includes(value)))
        || candidatePhones.includes(customerPhone)
        || candidateTexts.some(value => customerNameKeys.some(nameKey => value.includes(nameKey)));
      if (!isLinked) return;
      const amount = parseLooseMoneyValue(item.amount ?? item.transferAmount ?? item.offsetAmount ?? raw.amount ?? raw.transferAmount);
      const linkedOrder = findLinkedCustomerOrder(item);
      addRow({
        id: `pending_${item.id || item.transactionId || item.sepayReferenceCode || rows.length}`,
        direction: 'pending',
        title: 'Giao dịch chờ đối soát',
        detail: item.reason || item.description || 'Cần ghép thủ công trước khi cấn trừ công nợ.',
        reference: item.sepayReferenceCode || item.transactionId || item.referenceCode || '',
        amount,
        amountLabel: 'Chờ xử lý',
        tone: 'amber',
        orderId: linkedOrder?.id || '',
        metrics: linkedOrder ? buildOrderMetrics(linkedOrder) : null,
        source: item
      });
    });

    return rows.sort((left, right) => (right.time || 0) - (left.time || 0));
  }, [paymentReconciliations, selectedCustomer]);
  const filteredCustomerReconciliationRows = useMemo(
    () => filterCustomerReconciliationRows(selectedCustomerReconciliationRows, customerReconciliationFilter),
    [customerReconciliationFilter, selectedCustomerReconciliationRows]
  );
  const customerReconciliationSummary = useMemo(
    () => summarizeCustomerReconciliationRows(filteredCustomerReconciliationRows),
    [filteredCustomerReconciliationRows]
  );
  const customerReconciliationReportPages = useMemo(
    () => paginateCustomerReconciliationRows(filteredCustomerReconciliationRows, 14),
    [filteredCustomerReconciliationRows]
  );
  const customerReconciliationFilterCounts = useMemo(() => ({
    [CUSTOMER_RECONCILIATION_FILTERS.ALL]: selectedCustomerReconciliationRows.length,
    [CUSTOMER_RECONCILIATION_FILTERS.COMPANY_PURCHASE]: filterCustomerReconciliationRows(
      selectedCustomerReconciliationRows,
      CUSTOMER_RECONCILIATION_FILTERS.COMPANY_PURCHASE
    ).length,
    [CUSTOMER_RECONCILIATION_FILTERS.CUSTOMER_PURCHASE]: filterCustomerReconciliationRows(
      selectedCustomerReconciliationRows,
      CUSTOMER_RECONCILIATION_FILTERS.CUSTOMER_PURCHASE
    ).length
  }), [selectedCustomerReconciliationRows]);

  useEffect(() => {
    setCustomerReconciliationFilter(CUSTOMER_RECONCILIATION_FILTERS.ALL);
    setCustomerReconciliationExportStatus('');
    setIsExportingCustomerReconciliation(false);
  }, [selectedCustomerId]);

  const getCustomerReconciliationExportContext = () => ({
    companyName: currentCompany?.name || currentCompany?.companyName || currentCompany?.displayName || 'HD Manager',
    customerName: getCustomerDisplayName(selectedCustomer) || selectedCustomer?.name || 'Khách hàng',
    filter: customerReconciliationFilter,
    generatedAt: new Date().toLocaleString('vi-VN'),
    rows: filteredCustomerReconciliationRows
  });

  const handleExportCustomerReconciliationExcel = () => {
    if (filteredCustomerReconciliationRows.length === 0) {
      setCustomerReconciliationExportStatus('Không có dữ liệu trong bộ lọc để xuất Excel.');
      return;
    }
    setIsExportingCustomerReconciliation(true);
    setCustomerReconciliationExportStatus('Đang tạo file Excel...');
    try {
      const context = getCustomerReconciliationExportContext();
      const bytes = buildCustomerReconciliationWorkbook(context);
      const fileName = buildCustomerReconciliationExportFileName({
        customerName: context.customerName,
        filter: context.filter,
        extension: 'xlsx',
        dateKey: getTodayString()
      });
      downloadCustomerReconciliationWorkbook({ bytes, fileName });
      setCustomerReconciliationExportStatus(`Đã tải file Excel: ${fileName}`);
    } catch (error) {
      console.error('Không thể tạo file Excel đối soát khách hàng:', error);
      setCustomerReconciliationExportStatus('Không thể tạo file Excel. Vui lòng thử lại.');
    } finally {
      setIsExportingCustomerReconciliation(false);
    }
  };

  const handleExportCustomerReconciliationPdf = async () => {
    const reportNode = customerReconciliationReportRef.current;
    const pageNodes = reportNode ? [...reportNode.querySelectorAll('[data-reconciliation-pdf-page]')] : [];
    if (filteredCustomerReconciliationRows.length === 0 || pageNodes.length === 0) {
      setCustomerReconciliationExportStatus('Không có dữ liệu trong bộ lọc để xuất PDF.');
      return;
    }
    setIsExportingCustomerReconciliation(true);
    setCustomerReconciliationExportStatus('Đang tạo file PDF...');
    try {
      const [{ toPng }, { jsPDF }] = await Promise.all([
        import('html-to-image'),
        import('jspdf')
      ]);
      if (document.fonts?.ready) await document.fonts.ready;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      for (let index = 0; index < pageNodes.length; index += 1) {
        const dataUrl = await toPng(pageNodes[index], {
          cacheBust: true,
          pixelRatio: 1.5,
          backgroundColor: '#ffffff'
        });
        if (index > 0) pdf.addPage('a4', 'portrait');
        pdf.addImage(dataUrl, 'PNG', 0, 0, 210, 297);
      }
      const context = getCustomerReconciliationExportContext();
      const fileName = buildCustomerReconciliationExportFileName({
        customerName: context.customerName,
        filter: context.filter,
        extension: 'pdf',
        dateKey: getTodayString()
      });
      pdf.save(fileName);
      setCustomerReconciliationExportStatus(`Đã tải file PDF: ${fileName}`);
    } catch (error) {
      console.error('Không thể tạo file PDF đối soát khách hàng:', error);
      setCustomerReconciliationExportStatus('Không thể tạo file PDF. Vui lòng thử lại.');
    } finally {
      setIsExportingCustomerReconciliation(false);
    }
  };
  const customerEditPhoneDuplicate = useMemo(() => {
    const phoneKey = buildCustomerPhoneDuplicateKey(customerEditForm.phone);
    if (!phoneKey || !selectedCustomer) return null;
    return allActiveCustomers.find(customer => customer.id !== selectedCustomer.id && buildCustomerPhoneDuplicateKey(customer.phone) === phoneKey) || null;
  }, [allActiveCustomers, customerEditForm.phone, selectedCustomer]);

  useEffect(() => {
    if (customerPriceAutoSaveTimerRef.current) {
      clearTimeout(customerPriceAutoSaveTimerRef.current);
      customerPriceAutoSaveTimerRef.current = null;
    }
    if (!selectedCustomerId) {
      // The list has no editor to reset on mount or a background snapshot.
      // Reset once when leaving a previously selected customer, not every time.
      if (selectedCustomerDraftSourceIdRef.current === null) return;
      selectedCustomerDraftSourceIdRef.current = null;
      setAllowedDriverIdsDraft([]);
      setDriverDebtAccessEnabledDraft(false);
      setCustomerPriceDrafts({});
      setCustomerProductIdsDraft([]);
      setCustomerBranchesDraft([]);
      setCustomerBranchStatus('');
      setCustomerProductPickerSearch('');
      setCustomerPriceSearch('');
      setCustomerPriceStatus('');
      setCustomerDebtLimitStatus('');
      setCustomerOpeningDebtStatus('');
      setCustomerLoanDraft({ productName: '', quantity: '', unit: 'Kg', weightKg: '', loanDate: getTodayString(), dueDate: '', note: '' });
      setCustomerLoanStatus('');
      setCustomerLoanReturnDrafts({});
      setCustomerLoanEditDrafts({});
      setEditingCustomerLoanId('');
      setIsSavingCustomerLoan(false);
      setSavingCustomerLoanReturnId('');
      setSavingCustomerLoanEditId('');
      setCustomerPriceDirty(false);
      setCustomerEditForm({ name: '', phone: '', address: '', customerGroup: '', empId: employee?.id || '', zaloContact: '', zaloGroupLink: '', location: null, locationInput: '', debtLimitMode: 'no_debt', debtLimitAmount: '', openingDebtAmount: '', openingDebtNote: '', openingPayableAmount: '', openingPayableNote: '', createLogin: false, loginPassword: '', loginPasswordConfirm: '' });
      setShowCustomerEditForm(false);
      setIsCustomerFixedProductsOpen(true);
      setCustomerDetailOpenSections({});
      setShowCustomerDebtList(false);
      return;
    }

    const sourceCustomer = customers.find(customer => customer.id === selectedCustomerId)
      || (selectedCustomerSnapshotRef.current?.id === selectedCustomerId ? selectedCustomerSnapshotRef.current : null);
    if (!sourceCustomer) return;
    const isSameCustomerRefresh = selectedCustomerDraftSourceIdRef.current === selectedCustomerId;
    const shouldPreserveProfileEditor = showCustomerEditFormRef.current && isSameCustomerRefresh;
    selectedCustomerDraftSourceIdRef.current = selectedCustomerId;
    const sourceAllowedDriverIds = sourceCustomer?.allowedDriverIds || [];
    const normalizedProductIds = normalizeCustomerProductIds(sourceCustomer || {}, activeProductsForPricing);
    const normalizedBranches = normalizeCustomerBranches(sourceCustomer || {}, activeProductsForPricing);
    setAllowedDriverIdsDraft(sourceAllowedDriverIds);
    setDriverDebtAccessEnabledDraft(sourceCustomer?.driverDebtAccessEnabled ?? (sourceAllowedDriverIds.length > 0));
    if (!isSameCustomerRefresh || !customerPriceDirty) {
      setCustomerPriceDrafts(normalizeCustomerPriceOverrides(sourceCustomer || {}));
      setCustomerProductIdsDraft(normalizedProductIds);
      customerPriceBaseRef.current = configScopeFingerprint(sourceCustomer);
    }
    setCustomerBranchesDraft(normalizedBranches);
    setCustomerBranchStatus('');
    setIsCustomerFixedProductsOpen(normalizedProductIds.length === 0);
    setCustomerProductPickerSearch('');
    setCustomerPriceSearch('');
    setCustomerPriceStatus('');
    setCustomerDebtLimitStatus('');
    setCustomerOpeningDebtStatus('');
    setCustomerLoanDraft({ productName: '', quantity: '', unit: 'Kg', weightKg: '', loanDate: getTodayString(), dueDate: '', note: '' });
    setCustomerLoanStatus('');
    setCustomerLoanReturnDrafts({});
    setCustomerLoanEditDrafts({});
    setEditingCustomerLoanId('');
    setIsSavingCustomerLoan(false);
    setSavingCustomerLoanReturnId('');
    setSavingCustomerLoanEditId('');
    if (!isSameCustomerRefresh || !customerPriceDirty) setCustomerPriceDirty(false);
    const sourceDebtLimitConfig = getCustomerDebtLimitConfig(sourceCustomer || {});
    if (!shouldPreserveProfileEditor) {
      setCustomerEditForm({
        name: sourceCustomer?.name || '',
        phone: sourceCustomer?.phone || '',
        address: sourceCustomer?.address || '',
        customerGroup: sourceCustomer?.customerGroup || '',
        empId: sourceCustomer?.empId || employee?.id || '',
        zaloContact: sourceCustomer?.zaloContact || sourceCustomer?.zaloPhone || sourceCustomer?.zalo || '',
        zaloGroupLink: sourceCustomer?.zaloGroupLink || '',
        location: sourceCustomer?.location || null,
        locationInput: getCustomerLocationShareText(sourceCustomer || {}) || '',
        debtLimitMode: sourceDebtLimitConfig.mode || 'no_debt',
        debtLimitAmount: sourceDebtLimitConfig.mode === 'limited' ? sourceDebtLimitConfig.limitAmount : '',
        purchaseReconciliationEnabled: Boolean(
          sourceCustomer?.purchaseReconciliationEnabled ||
          sourceCustomer?.isPurchaseReconciliationEnabled ||
          sourceCustomer?.reconciliationEnabled ||
          sourceCustomer?.hasPurchaseReconciliation
        ),
        openingDebtAmount: getCustomerOpeningDebtAmount(sourceCustomer || {}),
        openingDebtNote: sourceCustomer?.openingDebtNote || sourceCustomer?.oldDebtNote || '',
        openingPayableAmount: getCustomerOpeningPayableAmount(sourceCustomer || {}),
        openingPayableNote: sourceCustomer?.openingPayableNote || sourceCustomer?.oldPayableNote || sourceCustomer?.companyOpeningDebtNote || '',
        createLogin: false,
        loginPassword: '',
        loginPasswordConfirm: ''
      });
    }
    if (!isSameCustomerRefresh) {
      setCustomerDetailOpenSections({});
      setShowCustomerDebtList(false);
    }
    if (!shouldPreserveProfileEditor) {
      setShowCustomerEditForm(false);
    }
    if (!isSameCustomerRefresh) {
      setShowCustomerLocationActions(false);
      setCustomerLocationStatus('');
    }
  }, [selectedCustomerId, customers, employee?.id, activeProductsForPricing]);

  useEffect(() => {
    setDebtShareStatus('');
    setCustomerEditStatus('');
    setCustomerLocationStatus('');
    setCustomerLoanStatus('');
  }, [selectedCustomerId]);

  useEffect(() => () => {
    if (customerPriceAutoSaveTimerRef.current) {
      clearTimeout(customerPriceAutoSaveTimerRef.current);
    }
  }, []);

  const availableOrderMonths = useMemo(() => {
    if (!selectedCustomer) return [];
    return [...new Set(selectedCustomer.orders.map(order => order.date?.substring(0, 7)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  }, [selectedCustomer]);

  const filteredOrders = useMemo(() => {
    if (!selectedCustomer) return [];

    const hasKeyword = hasTokenSearchQuery(orderSearch);
    const list = selectedCustomer.orders.filter(order => {
      if (orderMonth && !order.date.startsWith(orderMonth)) return false;
      return true;
    });

    if (hasKeyword) {
      return sortOrdersByNewest(searchOrderRecords(list, orderSearch, {
        getItemText: (order) => (order.items || [])
          .map(item => buildLineItemProductSearchText(item, activeProductsForPricing))
          .join(' '),
      }));
    }
    return list.sort((a, b) => {
      if (orderSort === 'oldest') return new Date(a.date) - new Date(b.date);
      if (orderSort === 'amount_desc') return (b.amount || 0) - (a.amount || 0);
      if (orderSort === 'amount_asc') return (a.amount || 0) - (b.amount || 0);
      return new Date(b.date) - new Date(a.date);
    });
  }, [selectedCustomer, orderMonth, orderSearch, orderSort, activeProductsForPricing]);

  const customerProductUsageStats = useMemo(() => {
    if (!selectedCustomer) return new Map();
    const productById = new Map(activeProductsForPricing.map(product => [product.id, product]));
    const productByName = new Map(activeProductsForPricing.map(product => [normalizeLookupText(product.name || ''), product]));
    const usageMap = new Map();

    (selectedCustomer.orders || []).forEach(order => {
      const orderTime = new Date(order.date || order.createdAt || 0).getTime() || 0;
      (order.items || []).forEach(item => {
        const matchedProduct = productById.get(item.productId)
          || productByName.get(normalizeLookupText(item.description || item.productName || item.name || ''));
        if (!matchedProduct?.id) return;

        const quantity = parseLooseQuantityValue(item.quantity) || 1;
        const current = usageMap.get(matchedProduct.id) || { count: 0, quantity: 0, lastOrderTime: 0 };
        usageMap.set(matchedProduct.id, {
          count: current.count + 1,
          quantity: current.quantity + quantity,
          lastOrderTime: Math.max(current.lastOrderTime || 0, orderTime)
        });
      });
    });

    return usageMap;
  }, [activeProductsForPricing, selectedCustomer]);

  const selectedCustomerProductIdSet = useMemo(
    () => new Set(customerProductIdsDraft),
    [customerProductIdsDraft]
  );

  const customerPricingProducts = useMemo(
    () => activeProductsForPricing.filter(product => selectedCustomerProductIdSet.has(product.id)),
    [activeProductsForPricing, selectedCustomerProductIdSet]
  );

  const availableCustomerProductOptions = useMemo(() => {
    const keyword = normalizeLookupText(customerProductPickerSearch);
    return activeProductsForPricing
      .filter(product => productMatchesLookup(product, keyword))
      .sort((a, b) => {
        const usageA = customerProductUsageStats.get(a.id) || { count: 0, quantity: 0, lastOrderTime: 0 };
        const usageB = customerProductUsageStats.get(b.id) || { count: 0, quantity: 0, lastOrderTime: 0 };
        if (usageB.quantity !== usageA.quantity) return usageB.quantity - usageA.quantity;
        if (usageB.count !== usageA.count) return usageB.count - usageA.count;
        if (usageB.lastOrderTime !== usageA.lastOrderTime) return usageB.lastOrderTime - usageA.lastOrderTime;
        const selectedDiff = Number(selectedCustomerProductIdSet.has(b.id)) - Number(selectedCustomerProductIdSet.has(a.id));
        if (selectedDiff !== 0) return selectedDiff;
        return (a.name || '').localeCompare(b.name || '', 'vi');
      });
  }, [activeProductsForPricing, customerProductPickerSearch, customerProductUsageStats, selectedCustomerProductIdSet]);

  const addCustomerProductToPricing = (productId) => {
    if (!productId) return;
    setCustomerProductIdsDraft(prev => prev.includes(productId) ? prev : [...prev, productId]);
    setCustomerProductPickerSearch('');
    setCustomerPriceDirty(true);
  };

  const removeCustomerProductFromPricing = (productId) => {
    setCustomerProductIdsDraft(prev => prev.filter(id => id !== productId));
    setCustomerPriceDrafts(prev => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
    setCustomerPriceDirty(true);
  };

  const toggleCustomerProductForPricing = (productId) => {
    if (!productId) return;
    if (selectedCustomerProductIdSet.has(productId)) {
      removeCustomerProductFromPricing(productId);
      return;
    }
    setCustomerProductIdsDraft(prev => prev.includes(productId) ? prev : [...prev, productId]);
    setCustomerPriceDirty(true);
  };

  const createEmptyCustomerBranchDraft = () => ({
    id: createCustomerBranchId(),
    name: '',
    phone: '',
    address: '',
    note: '',
    customerProductIds: []
  });

  const addCustomerBranchDraft = () => {
    setCustomerBranchesDraft(prev => [...prev, createEmptyCustomerBranchDraft()]);
    setCustomerBranchStatus('');
    setCustomerDetailOpenSections(prev => ({ ...prev, branches: true }));
  };

  const updateCustomerBranchDraft = (branchId, field, value) => {
    setCustomerBranchesDraft(prev => prev.map(branch => (
      branch.id === branchId ? { ...branch, [field]: value } : branch
    )));
    setCustomerBranchStatus('');
  };

  const removeCustomerBranchDraft = (branchId) => {
    setCustomerBranchesDraft(prev => prev.filter(branch => branch.id !== branchId));
    setCustomerBranchStatus('Đã bỏ chi nhánh khỏi bản nháp. Bấm Lưu chi nhánh để cập nhật.');
  };

  const toggleCustomerBranchProduct = (branchId, productId) => {
    if (!branchId || !productId) return;
    setCustomerBranchesDraft(prev => prev.map(branch => {
      if (branch.id !== branchId) return branch;
      const currentIds = Array.isArray(branch.customerProductIds) ? branch.customerProductIds : [];
      const nextIds = currentIds.includes(productId)
        ? currentIds.filter(id => id !== productId)
        : [...currentIds, productId];
      return { ...branch, customerProductIds: nextIds };
    }));
    setCustomerBranchStatus('');
  };

  const handleSaveCustomerBranches = async () => {
    if (!selectedCustomer?.id || !onEditCustomer || isSavingCustomerBranches) return;
    if (!canManageFixedProducts && !canEditCustomerProfile) {
      setCustomerBranchStatus('Tài khoản hiện tại chưa có quyền lưu chi nhánh khách hàng.');
      return;
    }
    setIsSavingCustomerBranches(true);
    try {
      const validProductIds = new Set(activeProductsForPricing.map(product => product.id));
      const normalizedBranches = customerBranchesDraft
        .map((branch, index) => {
          const cleanName = `${branch.name || ''}`.trim();
          const cleanAddress = `${branch.address || ''}`.trim();
          const cleanPhone = `${branch.phone || ''}`.trim();
          const cleanNote = `${branch.note || ''}`.trim();
          const productIds = [...new Set((branch.customerProductIds || [])
            .map(productId => `${productId || ''}`.trim())
            .filter(productId => productId && (validProductIds.size === 0 || validProductIds.has(productId))))];
          return {
            id: `${branch.id || createCustomerBranchId()}`.trim() || `branch_${index + 1}`,
            name: cleanName,
            address: cleanAddress,
            phone: cleanPhone,
            note: cleanNote,
            customerProductIds: productIds
          };
        })
        .filter(branch => branch.name || branch.address || branch.phone || branch.note || branch.customerProductIds.length > 0);

      await onEditCustomer(selectedCustomer.id, { branches: normalizedBranches });
      setCustomerBranchesDraft(normalizedBranches);
      setCustomerBranchStatus(`Đã lưu ${normalizedBranches.length} chi nhánh cho khách hàng.`);
    } catch (error) {
      setCustomerBranchStatus(getFriendlyFirebaseErrorMessage(error, 'Chưa lưu được chi nhánh khách hàng.'));
    } finally {
      setIsSavingCustomerBranches(false);
    }
  };

  const filteredPricingProducts = useMemo(() => {
    const baseList = customerPricingProducts;

    return [...baseList].sort((a, b) => {
      const usageA = customerProductUsageStats.get(a.id) || { count: 0, quantity: 0, lastOrderTime: 0 };
      const usageB = customerProductUsageStats.get(b.id) || { count: 0, quantity: 0, lastOrderTime: 0 };
      if (usageB.quantity !== usageA.quantity) return usageB.quantity - usageA.quantity;
      if (usageB.count !== usageA.count) return usageB.count - usageA.count;
      if (usageB.lastOrderTime !== usageA.lastOrderTime) return usageB.lastOrderTime - usageA.lastOrderTime;
      return `${a.category || ''}${a.name || ''}`.localeCompare(`${b.category || ''}${b.name || ''}`, 'vi');
    });
  }, [customerPricingProducts, customerProductUsageStats]);

  const dashboardStats = useMemo(() => filteredCustomers.reduce((acc, cus) => {
    acc.totalRevenue += cus.totalRevenue;
    acc.totalDebt += cus.currentDebt;
    acc.totalOrders += cus.orderCount;
    return acc;
  }, { totalRevenue: 0, totalDebt: 0, totalOrders: 0 }), [filteredCustomers]);

  const resetCustomerListView = () => {
    setCustomerSearch('');
    setCustomerStatusFilter('all');
    setCustomerSortFilter('default');
    setCustomerDateFilter(getTodayString());
    setCustomerManagerFilter('all');
    setShowSearchBox(false);
    setShowFilterPanel(false);
  };

  const handleOpenCustomer = async (customerId) => {
    if(localCustomerSource){try{await localCustomerSource.readDetail(customerId);}catch{return;}}
    const customerSnapshot = customerSummaries.find(customer => customer.id === customerId)
      || allActiveCustomers.find(customer => customer.id === customerId);
    if (customerSnapshot) {
      selectedCustomerSnapshotRef.current = customerSnapshot.orders ? customerSnapshot : buildCustomerSummary(customerSnapshot);
    }
    setSelectedCustomerId(customerId);
    setOrderSearch('');
    setOrderMonth('');
    setOrderSort('newest');
    resetCustomerListView();
  };

  const handleCloseCustomerDetail = () => {
    localCustomerSource?.closeDetail?.();
    setSelectedCustomerId(null);
    resetCustomerListView();
    onReturnToDirectory?.();
  };

  useEffect(() => {
    if (quickActionIntent?.type !== 'create_customer') return;
    customerWorkflowReturnRef.current = quickActionIntent.returnTo || null;
    setSelectedCustomerId(null);
    setShowCustomerQuickActions(false);
    setShowCustomerEditForm(false);
    setShowFilterPanel(false);
    setShowSearchBox(false);
    setCustomerContactStatus('');
    setNewCus(prev => ({
      ...prev,
      empId: employee?.id || prev.empId || '',
      ...(quickActionIntent.prefill || {})
    }));
    setShowAddCustomer(true);
    onQuickActionHandled?.();
  }, [quickActionIntent?.id, quickActionIntent?.requestedAt, quickActionIntent?.type, employee?.id]);

  useEffect(() => {
    if (quickActionIntent?.type !== 'edit_customer_zalo_link' || !quickActionIntent.customerId) return undefined;
    setSelectedCustomerId(quickActionIntent.customerId);
    setOrderSearch('');
    setOrderMonth('');
    setOrderSort('newest');
    resetCustomerListView();
    setShowCustomerEditForm(true);
    setCustomerDetailOpenSections(prev => ({ ...prev, profile: true }));
    if (typeof window === 'undefined') {
      onQuickActionHandled?.();
      return undefined;
    }
    let retryTimer = null;
    let attempts = 0;
    const focusZaloInput = () => {
      attempts += 1;
      const input = document.querySelector('[data-customer-zalo-group-link-input="true"]');
      if (input) {
        input.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        input.focus?.();
        onQuickActionHandled?.();
        return true;
      }
      if (attempts >= 12) {
        onQuickActionHandled?.();
        return true;
      }
      return false;
    };
    const focusTimer = window.setTimeout(() => {
      if (focusZaloInput()) return;
      retryTimer = window.setInterval(() => {
        if (focusZaloInput() && retryTimer) {
          window.clearInterval(retryTimer);
          retryTimer = null;
        }
      }, 150);
    }, 120);
    return () => {
      window.clearTimeout(focusTimer);
      if (retryTimer) window.clearInterval(retryTimer);
    };
  }, [quickActionIntent?.id, quickActionIntent?.type, quickActionIntent?.customerId]);

  const scrollToCustomerSection = (targetRef) => {
    targetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const isCustomerDetailSectionOpen = (sectionId) => Boolean(customerDetailOpenSections[sectionId]);
  const toggleCustomerDetailSection = (sectionId) => {
    setCustomerDetailOpenSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };
  const openCustomerDetailSection = (sectionId, targetRef = null) => {
    setCustomerDetailOpenSections(prev => ({ ...prev, [sectionId]: true }));
    if (targetRef) window.setTimeout(() => scrollToCustomerSection(targetRef), 0);
  };

  const handleResetCustomerFilters = () => {
    resetCustomerListView();
  };

  useEffect(() => {
    setCustomerImportManagerId((prev) => {
      if (isSales) return employee?.id || '';
      if (prev) return prev;
      return salesEmployees[0]?.id || '';
    });
  }, [employee?.id, isSales, salesEmployees]);

  useEffect(() => {
    if (!showAddCustomer) {
      setCustomerContactStatus('');
      setIsPickingCustomerContact(false);
      setNewCustomerProductIds(current => current.length === 0 ? current : []);
      setNewCustomerProductSearch('');
    }
  }, [showAddCustomer]);

  const closeAddCustomerModal = () => {
    setShowAddCustomer(false);
    onReturnToDirectory?.();
    setCustomerContactStatus('');
    setNewCus({ customerHonorific: '', name: '', phone: '', address: '', customerGroup: '', empId: employee?.id || '', zaloGroupLink: '', location: null, locationInput: '', openingBalanceType: 'receivable', debtLimitMode: 'no_debt', debtLimitAmount: '', openingDebtAmount: '', openingDebtNote: '', openingPayableAmount: '', openingPayableNote: '', createLogin: false, loginPassword: '', loginPasswordConfirm: '' });
    setNewCustomerProductIds([]);
    setNewCustomerProductSearch('');
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleScreenBack = (event) => {
      if (showCustomerDebtList) {
        setShowCustomerDebtList(false);
        markAppBackHandled(event);
        return;
      }
      if (showCustomerImportModal) {
        setShowCustomerImportModal(false);
        markAppBackHandled(event);
        return;
      }
      if (showAddCustomer) {
        setShowAddCustomer(false);
        if(initialAction==='create')onReturnToDirectory?.();
        setCustomerContactStatus('');
        markAppBackHandled(event);
        return;
      }
      if (showCustomerQuickActions) {
        setShowCustomerQuickActions(false);
        markAppBackHandled(event);
        return;
      }
      if (showCustomerEditForm) {
        setShowCustomerEditForm(false);
        markAppBackHandled(event);
        return;
      }
      if (selectedCustomerId) {
        handleCloseCustomerDetail();
        markAppBackHandled(event);
        return;
      }
      if (showFilterPanel) {
        setShowFilterPanel(false);
        markAppBackHandled(event);
        return;
      }
      if (showSearchBox) {
        setShowSearchBox(false);
        markAppBackHandled(event);
      }
    };
    window.addEventListener(APP_SCREEN_BACK_EVENT, handleScreenBack);
    return () => window.removeEventListener(APP_SCREEN_BACK_EVENT, handleScreenBack);
  }, [selectedCustomerId, showAddCustomer, showCustomerDebtList, showCustomerEditForm, showCustomerImportModal, showCustomerQuickActions, showFilterPanel, showSearchBox]);

  const handleAddCustomerSubmit = async (e) => {
    e.preventDefault();
    if (customerCreateSubmitRef.current) return;
    const finalEmpId = isSales ? employee?.id || '' : newCus.empId;
    if (!finalEmpId) {
      setCustomerContactStatus('Vui lòng chọn nhân viên phụ trách trước khi lưu khách hàng.');
      return;
    }
    if (newCustomerPhoneDuplicate) {
      setCustomerContactStatus(`Số điện thoại này đã có trong danh sách khách hàng: ${getDuplicateCustomerDisplayName(newCustomerPhoneDuplicate)}. Vui lòng kiểm tra lại trước khi lưu.`);
      return;
    }
    if (accountLoginEnabled && newCus.createLogin) {
      if (`${newCus.loginPassword || ''}`.length < 8) {
        setCustomerContactStatus('Mật khẩu tạm cần ít nhất 8 ký tự.');
        return;
      }
      if (newCus.loginPassword !== newCus.loginPasswordConfirm) {
        setCustomerContactStatus('Mật khẩu nhập lại chưa khớp.');
        return;
      }
    }
    customerCreateSubmitRef.current = true;
    setIsSavingNewCustomer(true);
    setCustomerContactStatus('');
    try {
      const validProductIds = new Set(activeProductsForPricing.map(product => product.id));
      const fixedProductIds = newCustomerProductIds.filter(productId => validProductIds.has(productId));
      const locationPayload = newCus.location || parseCustomerLocationInput(newCus.locationInput);
      const normalizedLocationFields = normalizeCustomerLocationFields(locationPayload || newCus.locationInput, newCus.address, 'company_new_customer');
      const openingDebtAmount = normalizeCustomerOpeningDebtAmount(newCus.openingDebtAmount);
      const openingPayableAmount = normalizeCustomerOpeningPayableAmount(newCus.openingPayableAmount);
      await onAddCustomer(finalEmpId, {
        clientMutationId: customerCreateCommandRef.current,
        customerHonorific: newCus.customerHonorific,
        name: newCus.name,
        phone: newCus.phone,
        address: newCus.address,
        ...normalizedLocationFields,
        customerGroup: newCus.customerGroup,
        zaloGroupLink: `${newCus.zaloGroupLink || ''}`.trim(),
        debtLimitMode: newCus.debtLimitMode || 'no_debt',
        debtLimitAmount: newCus.debtLimitMode === 'limited' ? normalizeCustomerDebtLimitAmount(newCus.debtLimitAmount) : 0,
        openingDebtAmount,
        openingDebtDate: openingDebtAmount > 0 ? getTodayString() : '',
        openingDebtNote: `${newCus.openingDebtNote || ''}`.trim(),
        openingPayableAmount,
        openingPayableDate: openingPayableAmount > 0 ? getTodayString() : '',
        openingPayableNote: `${newCus.openingPayableNote || ''}`.trim(),
        allowedDriverIds: [],
        driverDebtAccessEnabled: false,
        customerProductIds: fixedProductIds,
        account: accountLoginEnabled && newCus.createLogin
          ? { phone: newCus.phone, password: newCus.loginPassword }
          : undefined
      });
      closeAddCustomerModal();
      customerCreateCommandRef.current = crypto.randomUUID();
      setNewCus({ name: '', phone: '', address: '', customerGroup: '', empId: employee?.id || '', zaloGroupLink: '', location: null, locationInput: '', openingBalanceType: 'receivable', debtLimitMode: 'no_debt', debtLimitAmount: '', openingDebtAmount: '', openingDebtNote: '', openingPayableAmount: '', openingPayableNote: '', createLogin: false, loginPassword: '', loginPasswordConfirm: '' });
      setNewCustomerProductIds([]);
      setNewCustomerProductSearch('');
      setCustomerContactStatus('');
      if (customerWorkflowReturnRef.current) {
        const nextStep = customerWorkflowReturnRef.current;
        customerWorkflowReturnRef.current = null;
        window.setTimeout(() => onQuickActionHandled?.(nextStep), 80);
      }
    } catch (error) {
      setCustomerContactStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể lưu khách hàng. Vui lòng kiểm tra lại thông tin.'));
    } finally {
      customerCreateSubmitRef.current = false;
      setIsSavingNewCustomer(false);
    }
  };

  const handlePickCustomerContact = async () => {
    if (customerContactPickerInFlightRef.current) return;
    if (!canPickCustomerContact) {
      setCustomerContactStatus(getCustomerContactPickerUnavailableMessage());
      return;
    }
    customerContactPickerInFlightRef.current = true;
    setIsPickingCustomerContact(true);
    setCustomerContactStatus('');

    try {
      const result = await pickCustomerContactFromDevice();
      if (result?.ok) {
        setNewCus((prev) => ({
          ...prev,
          customerHonorific: prev.customerHonorific || inferCustomerHonorificFromName(result.name || ''),
          name: toTitleCase(stripCustomerHonorificPrefix(`${result.name || prev.name || ''}`.trim())),
          phone: `${result.phone || prev.phone || ''}`.trim(),
          address: capitalizeFirst(`${result.address || prev.address || ''}`.trim())
        }));
        const missingPhoneNotice = result.phone ? '' : '. Liên hệ này chưa có số điện thoại, hãy bổ sung trước khi lưu';
        setCustomerContactStatus(`Đã lấy liên hệ: ${result.name || 'Khách hàng'}${result.phone ? ` • ${result.phone}` : ''}${missingPhoneNotice}`);
      } else {
        setCustomerContactStatus(result?.message || 'Không thể lấy dữ liệu từ danh bạ điện thoại.');
      }
    } finally {
      customerContactPickerInFlightRef.current = false;
      setIsPickingCustomerContact(false);
    }
  };

  const handleApplyNewCustomerLocationInput = () => {
    const location = parseCustomerLocationInput(newCus.locationInput);
    if (!location) {
      setCustomerContactStatus('Vui lòng dán link Maps, tọa độ GPS hoặc địa chỉ trước khi lưu vị trí.');
      return;
    }
    setNewCus(prev => ({
      ...prev,
      location,
      locationInput: getCustomerLocationShareText({ location, address: prev.address }) || prev.locationInput
    }));
    setCustomerContactStatus('Đã lưu vị trí cho khách mới.');
  };

  const handleCaptureNewCustomerLocation = async () => {
    setIsCapturingNewCustomerLocation(true);
    setCustomerContactStatus('');
    try {
      const position = await requestCurrentLocation();
      const location = buildCustomerLocationFromPosition(position);
      if (!location) throw new Error('Không đọc được tọa độ GPS.');
      setNewCus(prev => ({
        ...prev,
        location,
        locationInput: getCustomerLocationShareText({ location, address: prev.address })
      }));
      setCustomerContactStatus('Đã lấy GPS hiện tại cho khách mới.');
    } catch (error) {
      setCustomerContactStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể lấy GPS hiện tại. Hãy kiểm tra quyền vị trí.'));
    } finally {
      setIsCapturingNewCustomerLocation(false);
    }
  };

  const handleApplyCustomerEditLocationInput = () => {
    const location = parseCustomerLocationInput(customerEditForm.locationInput);
    if (!location) {
      setCustomerLocationStatus('Vui lòng dán link Maps, tọa độ GPS hoặc địa chỉ trước khi lưu vị trí.');
      return;
    }
    setCustomerEditForm(prev => ({
      ...prev,
      location,
      locationInput: getCustomerLocationShareText({ location, address: prev.address }) || prev.locationInput
    }));
    setCustomerLocationStatus('Đã cập nhật vị trí trong form. Bấm Lưu thông tin khách hàng để lưu chính thức.');
  };

  const handleCaptureCustomerEditLocation = async () => {
    setIsUpdatingSelectedCustomerLocation(true);
    setCustomerLocationStatus('');
    try {
      const position = await requestCurrentLocation();
      const location = buildCustomerLocationFromPosition(position);
      if (!location) throw new Error('Không đọc được tọa độ GPS.');
      setCustomerEditForm(prev => ({
        ...prev,
        location,
        locationInput: getCustomerLocationShareText({ location, address: prev.address })
      }));
      setCustomerLocationStatus('Đã lấy GPS hiện tại. Bấm Lưu thông tin khách hàng để lưu chính thức.');
    } catch (error) {
      setCustomerLocationStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể lấy GPS hiện tại. Hãy kiểm tra quyền vị trí.'));
    } finally {
      setIsUpdatingSelectedCustomerLocation(false);
    }
  };

  const handleCopyCustomerPhone = async () => {
    if (!selectedCustomer?.phone) return;
    const copied = await copyTextToClipboard(selectedCustomer.phone);
    setCustomerLocationStatus(copied ? 'Đã sao chép số điện thoại khách hàng.' : 'Không thể sao chép số điện thoại trên thiết bị này.');
  };

  const handleCopyCustomerLocation = async () => {
    if (!selectedCustomerLocationShareText) return;
    const copied = await copyTextToClipboard(selectedCustomerLocationShareText);
    setCustomerLocationStatus(copied ? 'Đã sao chép vị trí khách hàng.' : 'Không thể sao chép vị trí trên thiết bị này.');
  };

  const handleOpenCustomerMaps = () => {
    if (!selectedCustomerDirectionsUrl || typeof window === 'undefined') {
      setCustomerLocationStatus('Khách hàng chưa có GPS hoặc địa chỉ để mở chỉ đường.');
      return;
    }

    const isMobileDevice = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    if (isMobileDevice) {
      window.location.assign(selectedCustomerDirectionsUrl);
      return;
    }

    const opened = window.open(selectedCustomerDirectionsUrl, '_blank', 'noopener,noreferrer');
    if (!opened) window.location.assign(selectedCustomerDirectionsUrl);
  };

  const updateCustomerLoanDraft = (field, value) => {
    setCustomerLoanDraft(prev => ({ ...prev, [field]: value }));
    setCustomerLoanStatus('');
  };

  const updateCustomerLoanReturnDraft = (loanId, field, value) => {
    setCustomerLoanReturnDrafts(prev => ({
      ...prev,
      [loanId]: {
        ...(prev[loanId] || { quantity: '', weightKg: '', returnDate: getTodayString(), note: '' }),
        [field]: value
      }
    }));
    setCustomerLoanStatus('');
  };

  const openCustomerLoanEditor = (loan) => {
    if (!loan?.id) return;
    setEditingCustomerLoanId(prev => prev === loan.id ? '' : loan.id);
    setCustomerLoanEditDrafts(prev => ({
      ...prev,
      [loan.id]: prev[loan.id] || {
        productName: loan.productName || loan.itemName || '',
        quantity: loan.quantity || '',
        unit: loan.unit || 'Kg',
        weightKg: loan.weightKg || '',
        loanDate: loan.loanDate || getTodayString(),
        dueDate: loan.dueDate || '',
        note: loan.note || ''
      }
    }));
    setCustomerLoanStatus('');
  };

  const updateCustomerLoanEditDraft = (loanId, field, value) => {
    setCustomerLoanEditDrafts(prev => ({
      ...prev,
      [loanId]: {
        ...(prev[loanId] || {}),
        [field]: value
      }
    }));
    setCustomerLoanStatus('');
  };

  const buildCustomerLoanQuantityLabel = (quantity, unit, weightKg) => {
    const parts = [];
    const quantityValue = parseLooseQuantityValue(quantity);
    const weightValue = parseLooseQuantityValue(weightKg);
    if (quantityValue > 0) parts.push(`${formatNumber(quantityValue)} ${unit || 'đơn vị'}`.trim());
    if (weightValue > 0) parts.push(`${formatNumber(weightValue)} kg`);
    return parts.join(' • ') || '0';
  };

  const handleCreateCustomerLoan = async () => {
    if (!selectedCustomer) return;
    if (!canCreateCustomerLoanRecord || typeof onAddCustomerLoan !== 'function') {
      setCustomerLoanStatus('Tài khoản hiện tại chưa có quyền tạo phiếu vay.');
      return;
    }
    const productName = `${customerLoanDraft.productName || ''}`.trim();
    const quantity = parseLooseQuantityValue(customerLoanDraft.quantity);
    const weightKg = parseLooseQuantityValue(customerLoanDraft.weightKg);
    if (!productName) {
      setCustomerLoanStatus('Vui lòng nhập tên hàng khách vay.');
      return;
    }
    if (quantity <= 0 && weightKg <= 0) {
      setCustomerLoanStatus('Vui lòng nhập số lượng hoặc số kg khách vay.');
      return;
    }
    setIsSavingCustomerLoan(true);
    setCustomerLoanStatus('');
    try {
      const result = await onAddCustomerLoan(selectedCustomer.id, {
        productName,
        quantity,
        unit: customerLoanDraft.unit || 'Kg',
        weightKg,
        loanDate: customerLoanDraft.loanDate || getTodayString(),
        dueDate: customerLoanDraft.dueDate || '',
        note: customerLoanDraft.note || ''
      });
      if (result?.success === false) {
        setCustomerLoanStatus(result.message || 'Không thể lưu phiếu vay.');
        return;
      }
      setCustomerLoanDraft({ productName: '', quantity: '', unit: 'Kg', weightKg: '', loanDate: getTodayString(), dueDate: '', note: '' });
      setCustomerDetailOpenSections(prev => ({ ...prev, customerLoans: true }));
      setCustomerLoanStatus('Đã lưu phiếu khách vay.');
    } catch (error) {
      setCustomerLoanStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể lưu phiếu vay. Vui lòng thử lại.'));
    } finally {
      setIsSavingCustomerLoan(false);
    }
  };

  const handleRecordCustomerLoanReturn = async (loan) => {
    if (!loan?.id) return;
    if (!canReturnCustomerLoanRecord || typeof onEditCustomerLoan !== 'function') {
      setCustomerLoanStatus('Tài khoản hiện tại chưa có quyền ghi trả hàng.');
      return;
    }
    const draft = customerLoanReturnDrafts[loan.id] || { quantity: '', weightKg: '', returnDate: getTodayString(), note: '' };
    const quantity = parseLooseQuantityValue(draft.quantity);
    const weightKg = parseLooseQuantityValue(draft.weightKg);
    if (quantity <= 0 && weightKg <= 0) {
      setCustomerLoanStatus('Vui lòng nhập số lượng hoặc số kg khách trả.');
      return;
    }
    setSavingCustomerLoanReturnId(loan.id);
    setCustomerLoanStatus('');
    try {
      const returns = Array.isArray(loan.returns) ? loan.returns : [];
      const nextReturns = [
        ...returns,
        {
          id: `clr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          quantity,
          weightKg,
          returnDate: draft.returnDate || getTodayString(),
          note: `${draft.note || ''}`.trim(),
          createdAt: new Date().toISOString(),
          createdByEmpId: employee?.id || ''
        }
      ];
      const nextBalance = getCustomerLoanBalance({ ...loan, returns: nextReturns });
      const result = await onEditCustomerLoan(loan.id, {
        returns: nextReturns,
        status: nextBalance.isClosed ? 'closed' : 'open',
        closedAt: nextBalance.isClosed ? new Date().toISOString() : ''
      });
      if (result?.success === false) {
        setCustomerLoanStatus(result.message || 'Không thể ghi nhận trả hàng.');
        return;
      }
      setCustomerLoanReturnDrafts(prev => ({ ...prev, [loan.id]: { quantity: '', weightKg: '', returnDate: getTodayString(), note: '' } }));
      setCustomerLoanStatus(nextBalance.isClosed ? 'Đã ghi trả và đóng phiếu vay.' : 'Đã ghi nhận khách trả hàng.');
    } catch (error) {
      setCustomerLoanStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể ghi nhận trả hàng. Vui lòng thử lại.'));
    } finally {
      setSavingCustomerLoanReturnId('');
    }
  };

  const handleSaveCustomerLoanEdit = async (loan) => {
    if (!loan?.id) return;
    if (!canEditCustomerLoanRecord || typeof onEditCustomerLoan !== 'function') {
      setCustomerLoanStatus('Tài khoản hiện tại chưa có quyền chỉnh sửa phiếu vay.');
      return;
    }
    const draft = customerLoanEditDrafts[loan.id] || {};
    const productName = `${draft.productName || ''}`.trim();
    const quantity = parseLooseQuantityValue(draft.quantity);
    const weightKg = parseLooseQuantityValue(draft.weightKg);
    if (!productName) {
      setCustomerLoanStatus('Vui lòng nhập tên hàng hóa trước khi lưu sửa.');
      return;
    }
    if (quantity <= 0 && weightKg <= 0) {
      setCustomerLoanStatus('Vui lòng nhập số lượng hoặc số kg trước khi lưu sửa.');
      return;
    }
    setSavingCustomerLoanEditId(loan.id);
    setCustomerLoanStatus('');
    try {
      const result = await onEditCustomerLoan(loan.id, {
        productName,
        quantity,
        unit: draft.unit || loan.unit || 'Kg',
        weightKg,
        loanDate: draft.loanDate || loan.loanDate || getTodayString(),
        dueDate: draft.dueDate || '',
        note: draft.note || ''
      });
      if (result?.success === false) {
        setCustomerLoanStatus(result.message || 'Không thể lưu chỉnh sửa phiếu vay.');
        return;
      }
      setEditingCustomerLoanId('');
      setCustomerLoanStatus('Đã cập nhật phiếu vay/trả.');
    } catch (error) {
      setCustomerLoanStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể lưu chỉnh sửa phiếu vay. Vui lòng thử lại.'));
    } finally {
      setSavingCustomerLoanEditId('');
    }
  };

  const handleArchiveCustomerLoan = async (loan) => {
    if (!loan?.id || !canDeleteCustomerLoanRecord || typeof onDeleteCustomerLoan !== 'function') return;
    if (typeof window !== 'undefined' && !window.confirm('Xóa phiếu vay/trả này khỏi danh sách? Dữ liệu sẽ được lưu trạng thái đã ẩn trên cloud.')) return;
    setCustomerLoanStatus('');
    try {
      const result = await onDeleteCustomerLoan(loan.id);
      setCustomerLoanStatus(result?.success === false ? (result.message || 'Không thể xóa phiếu vay.') : 'Đã xóa phiếu vay khỏi danh sách.');
    } catch (error) {
      setCustomerLoanStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể xóa phiếu vay. Vui lòng thử lại.'));
    }
  };

  const openCustomerImportModal = () => {
    setCustomerImportStatus('');
    setShowCustomerQuickActions(false);
    setShowCustomerImportModal(true);
  };

  useEffect(() => {
    if (quickActionIntent?.type !== 'import_customer') return;
    openCustomerImportModal();
    onQuickActionHandled?.();
  }, [quickActionIntent?.id, quickActionIntent?.requestedAt, quickActionIntent?.type]);

  const handleCustomerImportFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const finalEmpId = isSales ? employee?.id || '' : customerImportManagerId;
    if (!finalEmpId) {
      setCustomerImportStatus('Vui lòng chọn nhân viên phụ trách trước khi nhập file khách hàng.');
      event.target.value = '';
      return;
    }

    setIsImportingCustomers(true);
    setCustomerImportStatus('');

    try {
      const { records, skippedRows, totalDataRows } = await parseCustomerImportWorkbook(file);
      const existingKeys = new Set(customers.map((customer) => buildCustomerImportDuplicateKey(customer)));
      const rowsToImport = [];
      const skippedEntries = [...skippedRows];
      const productWarningEntries = [];

      records.forEach((record) => {
        const duplicateKey = buildCustomerImportDuplicateKey(record);
        if (!duplicateKey || existingKeys.has(duplicateKey)) {
          skippedEntries.push({
            lineNumber: record.lineNumber,
            reason: 'Trùng số điện thoại với khách hàng đã có hoặc bị lặp trong file'
          });
          return;
        }

        const fixedProductResult = record.fixedProductText
          ? resolveCustomerImportFixedProducts(record.fixedProductText, activeProductsForPricing)
          : { productIds: [], productNames: [], unmatchedNames: [] };
        if (record.fixedProductText && fixedProductResult.productIds.length === 0) {
          productWarningEntries.push({
            lineNumber: record.lineNumber,
            reason: `Sản phẩm cố định chưa khớp danh mục: ${fixedProductResult.productNames.join(', ')}`
          });
        } else if (fixedProductResult.unmatchedNames.length > 0) {
          productWarningEntries.push({
            lineNumber: record.lineNumber,
            reason: `Một số sản phẩm chưa khớp: ${fixedProductResult.unmatchedNames.join(', ')}`
          });
        }

        existingKeys.add(duplicateKey);
        rowsToImport.push({
          ...record,
          customerProductIds: fixedProductResult.productIds
        });
      });

      if (rowsToImport.length === 0) {
        const skippedPreview = skippedEntries
          .sort((a, b) => (a.lineNumber || 0) - (b.lineNumber || 0))
          .slice(0, 4)
          .map((item) => `Dòng ${item.lineNumber}: ${item.reason}`)
          .join(' ');
        setCustomerImportStatus(
          skippedPreview
            ? `Không có khách hàng hợp lệ để nhập. ${skippedPreview}${skippedEntries.length > 4 ? ' ...' : ''}`
            : 'Không có khách hàng hợp lệ để nhập.'
        );
        return;
      }

      await Promise.all(rowsToImport.map((record) => onAddCustomer(finalEmpId, {
        name: record.name,
        phone: record.phone,
        address: record.address,
        customerGroup: '',
        allowedDriverIds: [],
        driverDebtAccessEnabled: false,
        customerProductIds: record.customerProductIds || []
      })));

      const skippedPreview = skippedEntries
        .sort((a, b) => (a.lineNumber || 0) - (b.lineNumber || 0))
        .slice(0, 4)
        .map((item) => `Dòng ${item.lineNumber}: ${item.reason}`)
          .join(' ');
      const warningPreview = productWarningEntries
        .sort((a, b) => (a.lineNumber || 0) - (b.lineNumber || 0))
        .slice(0, 3)
        .map((item) => `Dòng ${item.lineNumber}: ${item.reason}`)
        .join(' ');
      setCustomerImportStatus(
        `Đã nhập ${rowsToImport.length} khách hàng từ file ${file.name}.${rowsToImport.some(record => (record.customerProductIds || []).length > 0) ? ' Đã lưu sản phẩm cố định cho các dòng khớp danh mục.' : ''}${skippedEntries.length > 0 ? ` Bỏ qua ${skippedEntries.length}/${totalDataRows} dòng không hợp lệ hoặc bị trùng.` : ''}${skippedPreview ? ` ${skippedPreview}${skippedEntries.length > 4 ? ' ...' : ''}` : ''}${warningPreview ? ` Cảnh báo: ${warningPreview}${productWarningEntries.length > 3 ? ' ...' : ''}` : ''}`
      );
    } catch (error) {
      setCustomerImportStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể đọc file Excel khách hàng.'));
    } finally {
      setIsImportingCustomers(false);
      event.target.value = '';
    }
  };

  const handleSaveCustomerProfile = async (e) => {
    e.preventDefault();
    if (customerProfileSubmitRef.current) return;
    if (!selectedCustomer || !onEditCustomer) return;
    if (customerEditPhoneDuplicate) {
      setCustomerEditStatus(`Số điện thoại này đã trùng với khách hàng: ${getDuplicateCustomerDisplayName(customerEditPhoneDuplicate)}. Vui lòng kiểm tra lại trước khi lưu.`);
      return;
    }
    if (accountLoginEnabled && customerEditForm.createLogin) {
      if (`${customerEditForm.loginPassword || ''}`.length < 8) {
        setCustomerEditStatus('Mật khẩu tạm cần ít nhất 8 ký tự.');
        return;
      }
      if (customerEditForm.loginPassword !== customerEditForm.loginPasswordConfirm) {
        setCustomerEditStatus('Mật khẩu nhập lại chưa khớp.');
        return;
      }
      if (buildCustomerPhoneDuplicateKey(selectedCustomer.phone) !== buildCustomerPhoneDuplicateKey(customerEditForm.phone)) {
        setCustomerEditStatus('Hãy lưu số điện thoại mới trước, sau đó mở lại hồ sơ để cấp quyền đăng nhập.');
        return;
      }
    }
    customerProfileSubmitRef.current = true;
    setIsSavingCustomerProfile(true);
    setCustomerEditStatus('');
    try {
      const locationPayload = customerEditForm.location || parseCustomerLocationInput(customerEditForm.locationInput);
      const normalizedLocationFields = normalizeCustomerLocationFields(locationPayload || customerEditForm.locationInput, customerEditForm.address, 'company_customer_profile');
      const openingDebtAmount = normalizeCustomerOpeningDebtAmount(customerEditForm.openingDebtAmount);
      const openingPayableAmount = normalizeCustomerOpeningPayableAmount(customerEditForm.openingPayableAmount);
      const loginAccount = accountLoginEnabled && customerEditForm.createLogin
        ? { phone: customerEditForm.phone, password: customerEditForm.loginPassword }
        : null;
      const updatedCustomerProfile = {
        name: toTitleCase(customerEditForm.name),
        phone: `${customerEditForm.phone || ''}`.trim(),
        address: toTitleCase(customerEditForm.address),
        customerGroup: toTitleCase(customerEditForm.customerGroup),
        empId: customerEditForm.empId || selectedCustomer.empId || '',
        zaloContact: `${customerEditForm.zaloContact || ''}`.trim(),
        zaloGroupLink: `${customerEditForm.zaloGroupLink || ''}`.trim(),
        ...normalizedLocationFields,
        debtLimitMode: customerEditForm.debtLimitMode || 'no_debt',
        debtLimitAmount: customerEditForm.debtLimitMode === 'limited' ? normalizeCustomerDebtLimitAmount(customerEditForm.debtLimitAmount) : 0,
        openingDebtAmount,
        openingDebtDate: openingDebtAmount > 0 ? (selectedCustomer.openingDebtDate || getTodayString()) : '',
        openingDebtNote: `${customerEditForm.openingDebtNote || ''}`.trim(),
        openingPayableAmount,
        openingPayableDate: openingPayableAmount > 0 ? (selectedCustomer.openingPayableDate || getTodayString()) : '',
        openingPayableNote: `${customerEditForm.openingPayableNote || ''}`.trim()
      };
      const saveResult = await onEditCustomer(selectedCustomer.id, {
        ...updatedCustomerProfile,
        ...(loginAccount ? { account: loginAccount } : {})
      });
      selectedCustomerSnapshotRef.current = {
        ...(selectedCustomerSnapshotRef.current || selectedCustomer),
        ...updatedCustomerProfile
      };
      setCustomerEditStatus(saveResult?.queued ? 'Đã lưu tạm thông tin khách hàng. Đang đồng bộ với máy chủ.' : 'Đã cập nhật thông tin khách hàng.');
      setCustomerEditForm(prev => ({
        ...prev,
        createLogin: false,
        loginPassword: '',
        loginPasswordConfirm: '',
      }));
    } catch (error) {
      setCustomerEditStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể cập nhật thông tin khách hàng.'));
    } finally {
      customerProfileSubmitRef.current = false;
      setIsSavingCustomerProfile(false);
    }
  };

  const handleSaveCustomerDebtLimit = async () => {
    if (!selectedCustomer || !onEditCustomer) return;
    setIsSavingCustomerDebtLimit(true);
    setCustomerDebtLimitStatus('');
    try {
      await onEditCustomer(selectedCustomer.id, {
        debtLimitMode: customerEditForm.debtLimitMode || 'no_debt',
        debtLimitAmount: customerEditForm.debtLimitMode === 'limited' ? normalizeCustomerDebtLimitAmount(customerEditForm.debtLimitAmount) : 0,
        purchaseReconciliationEnabled: Boolean(customerEditForm.purchaseReconciliationEnabled)
      });
      setCustomerDebtLimitStatus(customerEditForm.purchaseReconciliationEnabled
        ? 'Đã lưu hạn mức công nợ và bật đối soát khách hàng liên kết.'
        : 'Đã lưu hạn mức công nợ cho khách hàng.');
    } catch (error) {
      setCustomerDebtLimitStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể lưu hạn mức công nợ.'));
    } finally {
      setIsSavingCustomerDebtLimit(false);
    }
  };

  const handleSaveCustomerOpeningDebt = async () => {
    if (!selectedCustomer || !onEditCustomer) return;
    const openingDebtAmount = normalizeCustomerOpeningDebtAmount(customerEditForm.openingDebtAmount);
    const openingPayableAmount = normalizeCustomerOpeningPayableAmount(customerEditForm.openingPayableAmount);
    setIsSavingCustomerOpeningDebt(true);
    setCustomerOpeningDebtStatus('');
    try {
      await onEditCustomer(selectedCustomer.id, {
        openingDebtAmount,
        openingDebtDate: openingDebtAmount > 0 ? (selectedCustomer.openingDebtDate || getTodayString()) : '',
        openingDebtNote: `${customerEditForm.openingDebtNote || ''}`.trim(),
        openingPayableAmount,
        openingPayableDate: openingPayableAmount > 0 ? (selectedCustomer.openingPayableDate || getTodayString()) : '',
        openingPayableNote: `${customerEditForm.openingPayableNote || ''}`.trim()
      });
      setCustomerOpeningDebtStatus(
        openingDebtAmount > 0 || openingPayableAmount > 0
          ? 'Đã lưu nợ cũ và đối soát đầu kỳ cho khách hàng.'
          : 'Đã xóa nợ cũ hai chiều của khách hàng.'
      );
    } catch (error) {
      setCustomerOpeningDebtStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể lưu nợ cũ của khách hàng.'));
    } finally {
      setIsSavingCustomerOpeningDebt(false);
    }
  };

  const handleDeleteCustomerProfile = async () => {
    if (!selectedCustomer || !onDeleteCustomer) return;
    const confirmed = window.confirm(`Xóa khách hàng "${getCustomerDisplayName(selectedCustomer) || selectedCustomer.name}"?\nNếu khách đã có đơn hàng hoặc thanh toán, app sẽ chỉ ẩn khách khỏi danh sách nhưng vẫn giữ lại lịch sử để đối soát.`);
    if (!confirmed) return;

    setIsDeletingCustomer(true);
    setCustomerEditStatus('');
    try {
      const result = await onDeleteCustomer(selectedCustomer.id);
      if (result?.success) {
        const successMessage = result.mode === 'archived'
            ? 'Đã ẩn khách hàng khỏi danh sách, lịch sử cũ vẫn được giữ lại.'
            : 'Đã xóa khách hàng khỏi hệ thống.';
        setSelectedCustomerId(null);
      onReturnToDirectory?.();
        window.alert(successMessage);
      } else {
        setCustomerEditStatus(result?.message || 'Không thể xóa khách hàng.');
      }
    } catch (error) {
      setCustomerEditStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể xóa khách hàng.'));
    } finally {
      setIsDeletingCustomer(false);
    }
  };

  const toggleAllowedDriver = (driverId) => {
    setAllowedDriverIdsDraft(prev => prev.includes(driverId)
      ? prev.filter(id => id !== driverId)
      : [...prev, driverId]
    );
  };

  const handleSaveDriverAccess = async () => {
    if (!selectedCustomer || !onEditCustomer) return;
    setIsSavingDriverAccess(true);
    try {
      await onEditCustomer(selectedCustomer.id, {
        allowedDriverIds: driverDebtAccessEnabledDraft ? allowedDriverIdsDraft : [],
        driverDebtAccessEnabled: driverDebtAccessEnabledDraft
      });
    } finally {
      setIsSavingDriverAccess(false);
    }
  };

  const updateCustomerPriceDraft = (productId, field, value) => {
    setCustomerPriceDrafts(prev => {
      const next = { ...prev };
      const current = typeof next[productId] === 'object' && next[productId] !== null
        ? next[productId]
        : { price: parseLooseMoneyValue(next[productId]), size: '', attributeLabel: '', variants: [] };
      const nextValue = field === 'price'
        ? parseInputCurrency(value)
        : field === 'attributeLabel'
          ? `${value || ''}`.trim()
          : field === 'pricingUnit' || field === 'defaultOrderUnit'
            ? normalizeProductPricingUnit(value)
            : field === 'orderUnits' || field === 'unitConversions'
              ? `${value || ''}`.trim()
            : capitalizeFirstPreservingSpacing(value);
      const updated = {
        ...current,
        [field]: nextValue
      };
      if (field === 'orderUnits') {
        updated.defaultOrderUnit = normalizeProductPricingUnit(nextValue.split(/[;,/&+|]/).map(value => value.trim()).find(Boolean) || '');
        updated.orderUnit = updated.defaultOrderUnit;
      }
      const cleanPrice = parseLooseMoneyValue(updated.price);
      const cleanSize = `${updated.size || ''}`.trim();
      const cleanAttributeLabel = `${updated.attributeLabel || ''}`.trim();
      const pricingUnit = normalizeProductPricingUnit(updated.pricingUnit || updated.defaultUnit || '');
      const orderUnits = updated.orderUnits ?? updated.allowedOrderUnits ?? updated.inputUnits ?? '';
      const defaultOrderUnit = normalizeProductPricingUnit(
        updated.defaultOrderUnit || updated.orderUnit || updated.preferredOrderUnit || ''
      );
      const unitConversions = updated.unitConversions ?? updated.conversions ?? updated.conversion ?? '';
      const hasOrderConfiguration = hasCustomerOrderConfigurationValue(orderUnits)
        || Boolean(defaultOrderUnit)
        || hasCustomerOrderConfigurationValue(unitConversions);
      const cleanVariants = Array.isArray(updated.variants) ? updated.variants : [];
      if (cleanPrice <= 0 && !cleanSize && !cleanAttributeLabel && !pricingUnit && !hasOrderConfiguration && cleanVariants.length === 0) delete next[productId];
      else next[productId] = {
        ...current,
        price: cleanPrice,
        size: cleanSize,
        attributeLabel: cleanAttributeLabel,
        pricingUnit,
        defaultUnit: pricingUnit,
        orderUnits,
        defaultOrderUnit,
        unitConversions,
        variants: cleanVariants
      };
      return next;
    });
    setCustomerPriceDirty(true);
  };

  const addCustomerPriceVariantDraft = (productId) => {
    setCustomerPriceDrafts(prev => {
      const current = typeof prev[productId] === 'object' && prev[productId] !== null
        ? prev[productId]
        : { price: parseLooseMoneyValue(prev[productId]), size: '', attributeLabel: '', variants: [] };
      const variants = Array.isArray(current.variants) ? current.variants : [];
      return {
        ...prev,
        [productId]: {
          ...current,
          variants: [
            ...variants,
            { id: `variant_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, size: '', attributeLabel: '', price: '' }
          ]
        }
      };
    });
    setCustomerPriceDirty(true);
  };

  const updateCustomerPriceVariantDraft = (productId, variantId, field, value) => {
    setCustomerPriceDrafts(prev => {
      const current = typeof prev[productId] === 'object' && prev[productId] !== null
        ? prev[productId]
        : { price: parseLooseMoneyValue(prev[productId]), size: '', attributeLabel: '', variants: [] };
      const variants = (Array.isArray(current.variants) ? current.variants : []).map((variant) => {
        if (variant.id !== variantId) return variant;
        const nextValue = field === 'price'
          ? parseInputCurrency(value)
          : field === 'attributeLabel'
            ? `${value || ''}`.trim()
            : capitalizeFirstPreservingSpacing(value);
        return { ...variant, [field]: nextValue };
      });
      return { ...prev, [productId]: { ...current, variants } };
    });
    setCustomerPriceDirty(true);
  };

  const removeCustomerPriceVariantDraft = (productId, variantId) => {
    setCustomerPriceDrafts(prev => {
      const current = typeof prev[productId] === 'object' && prev[productId] !== null
        ? prev[productId]
        : { price: parseLooseMoneyValue(prev[productId]), size: '', attributeLabel: '', variants: [] };
      const variants = (Array.isArray(current.variants) ? current.variants : []).filter(variant => variant.id !== variantId);
      const cleanPrice = parseLooseMoneyValue(current.price);
      const cleanSize = `${current.size || ''}`.trim();
      const cleanAttributeLabel = `${current.attributeLabel || ''}`.trim();
      const orderUnits = current.orderUnits ?? current.allowedOrderUnits ?? current.inputUnits ?? '';
      const defaultOrderUnit = normalizeProductPricingUnit(
        current.defaultOrderUnit || current.orderUnit || current.preferredOrderUnit || ''
      );
      const unitConversions = current.unitConversions ?? current.conversions ?? current.conversion ?? '';
      const hasOrderConfiguration = hasCustomerOrderConfigurationValue(orderUnits)
        || Boolean(defaultOrderUnit)
        || hasCustomerOrderConfigurationValue(unitConversions);
      const next = { ...prev };
      if (cleanPrice <= 0 && !cleanSize && !cleanAttributeLabel && !hasOrderConfiguration && variants.length === 0) delete next[productId];
      else next[productId] = {
        ...current,
        price: cleanPrice,
        size: cleanSize,
        attributeLabel: cleanAttributeLabel,
        orderUnits,
        defaultOrderUnit,
        unitConversions,
        variants
      };
      return next;
    });
    setCustomerPriceDirty(true);
  };

  const clearCustomerPriceDraft = (productId) => {
    setCustomerPriceDrafts(prev => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
    setCustomerPriceDirty(true);
  };

  const buildCustomerPriceOverridesFromDraft = () => {
    const validProductIds = new Set(customerProductIdsDraft);
    return Object.entries(customerPriceDrafts).reduce((acc, [productId, config]) => {
      const cleanPrice = typeof config === 'object' && config !== null
        ? parseLooseMoneyValue(config.price)
        : parseLooseMoneyValue(config);
      const cleanSize = typeof config === 'object' && config !== null
        ? `${config.size || ''}`.trim()
        : '';
      const product = activeProductForPricingLookup.get(productId);
      const pricingUnit = typeof config === 'object' && config !== null
        ? normalizeProductPricingUnit(config.pricingUnit || config.defaultUnit || getProductPrimaryPricingUnit(product || {}, 'Con'))
        : getProductPrimaryPricingUnit(product || {}, 'Con');
      const savedUnitPrices = typeof config === 'object' && config !== null
        ? normalizeUnitPriceMap(config.unitPrices || config.pricesByUnit || config.priceByUnit || {})
        : {};
      const unitPrices = cleanPrice > 0
        ? putUnitPriceIntoMap(savedUnitPrices, pricingUnit, cleanPrice)
        : savedUnitPrices;
      const rawOrderUnits = typeof config === 'object' && config !== null
        ? config.orderUnits ?? config.allowedOrderUnits ?? config.inputUnits ?? ''
        : '';
      const defaultOrderUnit = typeof config === 'object' && config !== null
        ? normalizeProductPricingUnit(config.defaultOrderUnit || config.orderUnit || config.preferredOrderUnit || '')
        : '';
      const unitConversions = typeof config === 'object' && config !== null
        ? config.unitConversions ?? config.conversions ?? config.conversion ?? ''
        : '';
      const hasOrderConfiguration = hasCustomerOrderConfigurationValue(rawOrderUnits)
        || Boolean(defaultOrderUnit)
        || hasCustomerOrderConfigurationValue(unitConversions);
      const productAttributes = getProductAttributes(product);
      const rawAttributeLabel = typeof config === 'object' && config !== null
        ? `${config.attributeLabel || config.productAttribute || config.attribute || ''}`.trim()
        : '';
      const cleanAttributeLabel = productAttributes.find(attribute => normalizeLookupText(attribute) === normalizeLookupText(rawAttributeLabel)) || '';
      const cleanVariants = typeof config === 'object' && config !== null && Array.isArray(config.variants)
        ? config.variants.map((variant, index) => {
          const variantPrice = parseLooseMoneyValue(variant.price);
          const variantSize = `${variant.size || ''}`.trim();
          const rawVariantAttribute = `${variant.attributeLabel || variant.productAttribute || variant.attribute || ''}`.trim();
          const variantAttributeLabel = productAttributes.find(attribute => normalizeLookupText(attribute) === normalizeLookupText(rawVariantAttribute)) || '';
          const variantUnit = normalizeProductPricingUnit(variant.pricingUnit || variant.defaultUnit || variant.quantityUnit || variant.unit || pricingUnit);
          const variantUnitPrices = normalizeUnitPriceMap(variant.unitPrices || variant.pricesByUnit || variant.priceByUnit || {});
          const variantOrderUnits = variant.orderUnits ?? variant.allowedOrderUnits ?? variant.inputUnits ?? '';
          const variantDefaultOrderUnit = normalizeProductPricingUnit(
            variant.defaultOrderUnit || variant.orderUnit || variant.preferredOrderUnit || ''
          );
          const variantUnitConversions = variant.unitConversions ?? variant.conversions ?? variant.conversion ?? '';
          const hasVariantOrderConfiguration = hasCustomerOrderConfigurationValue(variantOrderUnits)
            || Boolean(variantDefaultOrderUnit)
            || hasCustomerOrderConfigurationValue(variantUnitConversions);
          if (
            variantPrice <= 0
            && !variantSize
            && !variantAttributeLabel
            && !variantUnit
            && Object.keys(variantUnitPrices).length === 0
            && !hasVariantOrderConfiguration
          ) return null;
          return {
            id: `${variant.id || `variant_${index + 1}`}`,
            price: variantPrice,
            size: variantSize,
            attributeLabel: variantAttributeLabel,
            ...(variantUnit ? { pricingUnit: variantUnit, defaultUnit: variantUnit } : {}),
            ...(Object.keys(variantUnitPrices).length > 0 ? { unitPrices: variantUnitPrices } : {}),
            ...(hasCustomerOrderConfigurationValue(variantOrderUnits) ? { orderUnits: variantOrderUnits } : {}),
            ...(variantDefaultOrderUnit ? { defaultOrderUnit: variantDefaultOrderUnit } : {}),
            ...(hasCustomerOrderConfigurationValue(variantUnitConversions) ? { unitConversions: variantUnitConversions } : {})
          };
        }).filter(Boolean)
        : [];
      if (validProductIds.has(productId) && (
        cleanPrice > 0
        || cleanSize
        || cleanAttributeLabel
        || pricingUnit
        || Object.keys(unitPrices).length > 0
        || hasOrderConfiguration
        || cleanVariants.length > 0
      )) {
        acc[productId] = {
          price: cleanPrice,
          size: cleanSize,
          attributeLabel: cleanAttributeLabel,
          pricingUnit,
          defaultUnit: pricingUnit,
          unitPrices,
          ...(hasCustomerOrderConfigurationValue(rawOrderUnits) ? { orderUnits: rawOrderUnits } : {}),
          ...(defaultOrderUnit ? { defaultOrderUnit } : {}),
          ...(hasCustomerOrderConfigurationValue(unitConversions) ? { unitConversions } : {}),
          variants: cleanVariants
        };
      }
      return acc;
    }, {});
  };

  const buildCustomerPriceQuoteText = (priceOverrides = customerPriceDrafts) => {
    if (!selectedCustomer) return '';
    return buildCustomerQuoteShareText({
      customer: selectedCustomer,
      quoteProducts: customerPricingProducts,
      currentCompany,
      employees,
      employee,
      orders,
      payments,
      priceOverrides
    });
  };

  const saveCustomerPriceOverrides = async ({ silent = false } = {}) => {
    if (!selectedCustomer || !onEditCustomer) return null;
    const priceOverrides = buildCustomerPriceOverridesFromDraft();

    setIsSavingCustomerPrices(true);
    if (!silent) setCustomerPriceStatus('');
    try {
      const savedCustomer = await onEditCustomer(selectedCustomer.id, { priceOverrides, customerProductIds: customerProductIdsDraft,
        __customerConfigBase: customerPriceBaseRef.current });
      customerPriceBaseRef.current = configScopeFingerprint(savedCustomer || { ...selectedCustomer, priceOverrides, customerProductIds: customerProductIdsDraft });
      setCustomerPriceDirty(false);
      setCustomerPriceDrafts(priceOverrides);
      setCustomerPriceStatus(silent ? 'Đã lưu cấu hình sản phẩm cố định.' : 'Đã lưu cấu hình sản phẩm cố định cho khách hàng này.');
      return priceOverrides;
    } catch (error) {
      setCustomerPriceStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể lưu giá riêng cho khách hàng.'));
      return null;
    } finally {
      setIsSavingCustomerPrices(false);
    }
  };

  useEffect(() => {
    if (customerPriceDirty) {
      setCustomerPriceStatus('Bạn đang chỉnh sản phẩm cố định. Nhập xong hãy bấm Lưu cấu hình.');
    }
  }, [customerPriceDirty]);

  const handleSaveCustomerPriceSettings = async () => {
    if (customerPriceAutoSaveTimerRef.current) clearTimeout(customerPriceAutoSaveTimerRef.current);
    await saveCustomerPriceOverrides({ silent: false });
  };

  const handleSaveAndNotifyCustomerPrices = async () => {
    if (customerPriceAutoSaveTimerRef.current) clearTimeout(customerPriceAutoSaveTimerRef.current);
    const priceOverrides = await saveCustomerPriceOverrides({ silent: false });
    if (!priceOverrides || !selectedCustomer) return;
    try {
      const canUseCustomerPhoneForShare = canSeeCustomerPhone && selectedCustomer.phone;
      const zaloLookupLabel = canUseCustomerPhoneForShare ? selectedCustomer.phone : (selectedCustomer.name || 'của khách');
      await shareTextContent({
        title: `Báo giá - ${selectedCustomer.name || 'Khách hàng'}`,
        text: buildCustomerPriceQuoteText(priceOverrides),
        dialogTitle: canUseCustomerPhoneForShare ? `Chọn Zalo theo SĐT ${zaloLookupLabel}` : `Chọn Zalo của ${zaloLookupLabel}`
      });
      setCustomerPriceStatus(canUseCustomerPhoneForShare
        ? `Đã lưu giá riêng. Hãy chọn đúng Zalo theo số điện thoại: ${zaloLookupLabel}.`
        : 'Đã lưu giá riêng. Hãy chọn đúng Zalo của khách để gửi báo giá.'
      );
    } catch (error) {
      setCustomerPriceStatus('Đã lưu giá riêng. Chưa mở được bảng chia sẻ, bạn có thể vào Báo giá hàng loạt để gửi lại.');
    }
  };

  const toggleDriverDebtAccess = () => {
    setDriverDebtAccessEnabledDraft(prev => !prev);
  };

  const resolveDebtShareStatusMessage = (result, channel) => {
    if (result.status === 'shared') {
  if (channel === 'zalo') return 'Zalo';
    return 'Đã chia sẻ công nợ.';
    }
    if (result.status === 'copied') {
    return 'Đã sao chép nội dung công nợ.';
    }
    if (result.status === 'cancelled') return 'Bạn đã đóng bảng chia sẻ.';
    return 'web';
  };

  const buildDebtShareText = (customer) => {
    if (!customer) return '';
    const lines = [
      'BẢNG ĐỐI SOÁT CÔNG NỢ',
      currentCompany?.name || currentCompany?.companyName || '',
      `Khách hàng: ${customer.displayName || getCustomerDisplayName(customer) || customer.name || ''}`,
      customer.phone ? `SĐT: ${customer.phone}` : '',
      `Còn phải thu: ${formatCurrency(customer.currentDebt || 0)} đ`,
      `Tiền dư / nợ khách: ${formatCurrency(customer.creditBalance || 0)} đ`,
      '',
      'Danh sách đơn hàng:'
    ];

    if ((customer.orders || []).length === 0) {
      lines.push('- Chưa có đơn hàng nào.');
    } else {
      customer.orders.forEach((order, index) => {
        lines.push(`${index + 1}. ${formatOrderCode(order.id)} - ${formatDateLabel(order.date)} - Tổng ${formatCurrency(order.amount || 0)} đ - Còn nợ ${formatCurrency(order.outstandingAmount || 0)} đ`);
      });
    }

    lines.push('', 'Lịch sử thanh toán:');
    if ((customer.payments || []).length === 0) {
      lines.push('- Chưa có khoản thu nào.');
    } else {
      customer.payments.forEach((payment, index) => {
        lines.push(`${index + 1}. ${formatDateLabel(getPaymentDateKey(payment) || payment.date)} - ${getPaymentMethodLabel(payment)} - Đã thu ${formatCurrency(payment.amount || 0)} đ - Đã phân bổ ${formatCurrency(payment.appliedAmount || 0)} đ`);
      });
    }

    return lines.join('\n');
  };

  const buildDebtReminderText = (customer) => {
    if (!customer) return '';
    const companyName = currentCompany?.name || currentCompany?.companyName || 'công ty';
    const customerName = customer.displayName || getCustomerDisplayName(customer) || customer.name || 'Quý khách';
    const currentDebt = Math.max(0, roundMoneyValue(customer.currentDebt || 0));
    const status = customer.debtLimitStatus || {};
    const policyLine = status.isNoDebt
      ? 'Khách hàng đang được cài chính sách không cho nợ, vì vậy đơn giao hàng cần thu tiền ngay.'
      : status.exceeded
        ? `Công nợ đã vượt hạn mức ${formatCurrency(status.limitAmount || 0)} đ. Đơn giao hàng cần thu tiền ngay để đảm bảo dòng tiền.`
        : 'Đơn giao hàng cần thu tiền ngay theo chính sách công nợ hiện tại.';
    const contactLine = employee?.name
      ? `Liên hệ phụ trách: ${employee.name}${employee.phone ? ` - ${employee.phone}` : ''}`
      : '';

    return [
      `Kính gửi ${customerName},`,
      '',
      `${companyName} xin thông báo công nợ hiện tại của Quý khách là: ${formatCurrency(currentDebt)} đ.`,
      policyLine,
      'Quý khách vui lòng sắp xếp thanh toán/đối soát công nợ để đơn hàng được phục vụ liên tục.',
      contactLine
    ].filter(Boolean).join('\n');
  };

  const handleShareDebtReminder = async () => {
    if (!selectedCustomer) return;
    const result = await shareTextContent({
      title: `Nhắc công nợ - ${selectedCustomer.displayName || selectedCustomer.name || 'Khách hàng'}`,
      text: buildDebtReminderText(selectedCustomer),
      dialogTitle: selectedCustomer.phone
        ? `Chọn Zalo theo SĐT ${selectedCustomer.phone}`
        : 'Chọn Zalo để nhắc công nợ'
    });
    setDebtShareStatus(
      result.status === 'shared'
        ? 'Đã mở bảng chia sẻ. Hãy chọn đúng Zalo của khách để gửi nhắc công nợ.'
        : result.status === 'cancelled'
          ? 'Bạn đã đóng bảng chia sẻ.'
          : 'Đã tạo nội dung nhắc công nợ. Bạn có thể sao chép và gửi lại nếu cần.'
    );
  };

  const buildDebtShareHtml = (customer) => {
    const orderRows = (customer?.orders || []).map((order) => `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(formatOrderCode(order.id))}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(formatDateLabel(order.date))}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(formatCurrency(order.amount || 0))} đ</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(formatCurrency(order.outstandingAmount || 0))} đ</td>
      </tr>
    `).join('');

    const paymentRows = (customer?.payments || []).map((payment) => `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #eef2f7;">${escapeHtml(formatDateLabel(getPaymentDateKey(payment) || payment.date))}</td>
        <td style="padding:10px;border-bottom:1px solid #eef2f7;">${escapeHtml(getPaymentMethodLabel(payment))}</td>
        <td style="padding:10px;border-bottom:1px solid #eef2f7;text-align:right;">${escapeHtml(formatCurrency(payment.amount || 0))} đ</td>
        <td style="padding:10px;border-bottom:1px solid #eef2f7;text-align:right;">${escapeHtml(formatCurrency(payment.appliedAmount || 0))} đ</td>
      </tr>
    `).join('');

    return `
      <!doctype html>
      <html lang="vi">
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(customer?.name || 'Công nợ khách hàng')}</title>
        </head>
        <body style="font-family: Arial, sans-serif; background:#f3f4f6; padding:24px; color:#111827;">
          <div style="max-width:860px; margin:0 auto; background:#ffffff; border-radius:20px; padding:24px; border:1px solid #e5e7eb;">
            <h1 style="margin:0 0 8px; font-size:28px;">Thông báo công nợ</h1>
            <p style="margin:0 0 16px; color:#6b7280;">Khách hàng: ${escapeHtml(customer?.name || 'Khách hàng')} • Cập nhật: ${escapeHtml(formatDateTimeLabel(new Date()))}</p>
            <div style="margin-top:20px; background:#f9fafb; border-radius:16px; padding:16px;">
              <p style="margin:0 0 8px;">Tổng doanh thu: <strong>${escapeHtml(formatCurrency(customer?.totalRevenue || 0))} đ</strong></p>
              <p style="margin:0 0 8px;">Đã thanh toán: <strong>${escapeHtml(formatCurrency(customer?.totalPaid || 0))} đ</strong></p>
              <p style="margin:0 0 8px;">Còn nợ hiện tại: <strong>${escapeHtml(formatCurrency(customer?.currentDebt || 0))} đ</strong></p>
              <p style="margin:0;">Nợ khách: <strong>${escapeHtml(formatCurrency(customer?.creditBalance || 0))} đ</strong></p>
            </div>
            <h2 style="margin:24px 0 12px; font-size:18px;">Lịch sử thanh toán</h2>
            <table style="width:100%; border-collapse:collapse;">
              <thead style="background:#f9fafb;">
                <tr>
                  <th style="padding:10px;text-align:left;">Ngày</th>
                  <th style="padding:10px;text-align:left;">Ngày</th>
                  <th style="padding:10px;text-align:left;">Ngày</th>
                  <th style="padding:10px;text-align:left;">Ngày</th>
                </tr>
              </thead>
              <tbody>${orderRows || '<tr><td colspan="4" style="padding:12px;text-align:center;color:#6b7280;">Chưa có đơn hàng nào</td></tr>'}</tbody>
            </table>
            <h2 style="margin:24px 0 12px; font-size:18px;">Lịch sử thanh toán</h2>
            <table style="width:100%; border-collapse:collapse;">
              <thead style="background:#f9fafb;">
                <tr>
                  <th style="padding:10px;text-align:left;">Ngày</th>
                  <th style="padding:10px;text-align:left;">Ngày</th>
                  <th style="padding:10px;text-align:left;">Ngày</th>
                  <th style="padding:10px;text-align:left;">Ngày</th>
                </tr>
              </thead>
              <tbody>${paymentRows || '<tr><td colspan="4" style="padding:12px;text-align:center;color:#6b7280;">Chưa có khoản thu nào</td></tr>'}</tbody>
            </table>
          </div>
        </body>
      </html>
    `;
  };

  const handleShareDebt = async (channel = 'native') => {
    if (!selectedCustomer) return;
    const result = await shareTextContent({
      title: `Công nợ - ${selectedCustomer.name || 'Khách hàng'}`,
      text: buildDebtShareText(selectedCustomer),
      dialogTitle: channel === 'native' ? 'Chia sẻ hóa đơn' : `Chia sẻ qua ${getShareChannelLabel(channel)}`
    });
    setDebtShareStatus(resolveDebtShareStatusMessage(result, channel));
  };

  const handleCopyDebt = async () => {
    if (!selectedCustomer) return;
    const copied = await copyTextToClipboard(buildDebtShareText(selectedCustomer));
    setDebtShareStatus(copied ? 'Đã sao chép thông tin công nợ. Bạn có thể dán vào Zalo, Facebook, Messenger hoặc email.' : 'Không thể sao chép thông tin công nợ trên thiết bị này.');
  };

  const handleDownloadDebt = async () => {
    if (!selectedCustomer) return;
    const safeName = (selectedCustomer.name || 'khach-hang').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'khach-hang';
    const result = await saveContentFile(`cong-no-${safeName}.html`, buildDebtShareHtml(selectedCustomer), 'text/html;charset=utf-8');
    if (result.status === 'saved') {
    setDebtShareStatus('');
      return;
    }
    if (result.status === 'downloaded') {
    setDebtShareStatus('');
      return;
    }
    setDebtShareStatus('');
  };

  const onOpenCustomerCard = useCommittedCallback(handleOpenCustomer);
  // Keep unchanged result cards while a new asynchronous SQLite page is being
  // requested. Scope and every visible permission remain memo dependencies.
  // These are stateless DOM cards (no inputs or child component state). Reuse
  // the bounded visible slots on search instead of destroying/recreating the
  // entire contact DOM. Every displayed identity and click closure is replaced
  // in the same React commit; pending result cards remain guarded by the host.
  const customerCardNodes = useMemo(() => customerPage.items.map((cus, slot) => {
          const displayName = cus.displayName || getCustomerDisplayName(cus) || cus.name || '';
          const isDuplicatePhone = duplicateCustomerPhoneKeySet.has(buildCustomerPhoneDuplicateKey(cus.phone));
          const needsImmediateCollection = shouldCollectCustomerDebtImmediately(cus.debtLimitStatus);
          const customerPhone = canSeeCustomerPhone ? (cus.phone || 'Chưa có') : 'Đã ẩn theo quyền';
          const customerAddress = canSeeCustomerLocation ? (cus.address || 'Chưa có') : 'Đã ẩn theo quyền';
          return (
            <div
              key={slot}
              data-customer-card="true" data-customer-id={cus.id}
              data-customer-revenue={cus.totalRevenue || 0}
              onClick={() => onOpenCustomerCard(cus.id)}
              className="hd-customer-card hd-render-contained bg-white rounded-2xl shadow-sm border border-gray-100 p-4 cursor-pointer hover:bg-gray-50 transition"
            >
              <div className="hd-customer-card__identity-row">
                <h3 className="hd-customer-card__name font-bold text-gray-800 text-sm">{displayName}</h3>
                <span className="hd-customer-card__manager text-[11px] bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-medium">NVKD: {cus.managerName || 'Chưa phân công'}</span>
                <ChevronRight size={16} className="hd-customer-card__chevron text-gray-300 shrink-0" />
              </div>

              <div className="hd-customer-card__contact-row">
                <p><span>SĐT</span><strong>{customerPhone}</strong></p>
                <p><span>Địa chỉ</span><strong>{customerAddress}</strong></p>
              </div>

              {(canSeeCustomerStats || canSeeCustomerDebt) && (
                <div className="hd-customer-card__stats-row">
                  {canSeeCustomerStats && (
                    <div className="bg-gray-50 rounded-xl p-2.5">
                      <p className="text-[10px] uppercase text-gray-500 font-bold mb-1">DT</p>
                      <p className="font-bold text-emerald-600 text-xs">{formatCurrency(cus.totalRevenue)}</p>
                    </div>
                  )}
                  {canSeeCustomerStats && (
                    <div className="bg-gray-50 rounded-xl p-2.5">
                      <p className="text-[10px] uppercase text-gray-500 font-bold mb-1">Đơn hàng</p>
                      <p className="font-bold text-gray-800 text-xs">{cus.orderCount}</p>
                    </div>
                  )}
                  {canSeeCustomerDebt && (
                    <div className="bg-gray-50 rounded-xl p-2.5">
                      <p className={`text-[10px] uppercase font-bold ${cus.currentDebt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>Còn nợ</p>
                      <p className={`font-bold text-xs ${cus.currentDebt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(cus.currentDebt)}</p>
                    </div>
                  )}
                </div>
              )}

              {(cus.customerGroup || isDuplicatePhone || (canSeeCustomerDebtLimitAlerts && needsImmediateCollection)) && (
                <div className="hd-customer-card__badges">
                  {cus.customerGroup && <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full font-medium">Nhóm: {cus.customerGroup}</span>}
                  {isDuplicatePhone && <span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-1 rounded-full font-bold border border-amber-100">Trùng SĐT</span>}
                  {canSeeCustomerDebtLimitAlerts && needsImmediateCollection && (
                    <span className="text-[11px] bg-rose-50 text-rose-700 px-2 py-1 rounded-full font-black border border-rose-100">
                      Giao hàng - Phải thu tiền ngay{canSeeCustomerDebt && cus.currentDebt > 0 ? ` • ${formatCurrency(cus.currentDebt)} đ` : ''}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        }),
    [customerPage.items,privacyScope,duplicateCustomerPhoneKeySet,canSeeCustomerPhone,canSeeCustomerLocation,
     canSeeCustomerStats,canSeeCustomerDebt,canSeeCustomerDebtLimitAlerts,onOpenCustomerCard]);

  if (selectedCustomer) {
    return (
      <PreloadedWorkspace module={deferredCustomerDetailRender} viewProps={{context:{AlertCircle,CUSTOMER_HONORIFIC_OPTIONS,CUSTOMER_RECONCILIATION_FILTERS,CalendarDays,Check,ChevronDown,ChevronRight,ChevronUp,Download,Filter,Gift,Loader2,MapPin,PRODUCT_PRICING_UNIT_OPTIONS,Package,Phone,Receipt,Search,ShareActionGrid,Trash2,UserCircle,Wallet,X,accountLoginEnabled,activeProductsForPricing,addCustomerBranchDraft,addCustomerPriceVariantDraft,allowedDriverIdsDraft,availableCustomerProductOptions,availableOrderMonths,buildCustomerLoanQuantityLabel,canCallVisibleCustomerPhone,canCreateCustomerLoanRecord,canDeleteCustomer,canDeleteCustomerLoanRecord,canEditCustomer,canEditCustomerContactFields,canEditCustomerLoanRecord,canEditCustomerLocationFields,canEditCustomerProfile,canManageCustomerDebtLimit,canManageCustomerPrices,canManageDriverDebtPermission,canManageFixedProducts,canOpenOrderDetails,canReassignCustomerManager,canReturnCustomerLoanRecord,canSeeCustomerDebt,canSeeCustomerDebtLimitAlerts,canSeeCustomerLoans,canSeeCustomerLocation,canSeeCustomerOrderHistory,canSeeCustomerPaymentHistory,canSeeCustomerPhone,canSeeCustomerStats,canUseCustomerLoyalty,clearCustomerPriceDraft,currentCompany,customerBranchStatus,customerBranchesDraft,customerDebtLimitStatus,customerEditForm,customerEditPhoneDuplicate,customerEditStatus,customerLoanDraft,customerLoanEditDrafts,customerLoanReturnDrafts,customerLoanStatus,customerLoansRef,customerLocationStatus,customerOpeningDebtStatus,customerOrderHistoryRef,customerPaymentHistoryRef,customerPriceDrafts,customerPriceStatus,customerPricingProducts,customerProductPickerSearch,customerProductUsageStats,customerReconciliationExportStatus,customerReconciliationFilter,customerReconciliationFilterCounts,customerReconciliationReportPages,customerReconciliationReportRef,customerReconciliationSummary,debtShareStatus,driverDebtAccessEnabledDraft,driverEmployees,editingCustomerLoanId,filteredCustomerReconciliationRows,filteredOrders,filteredPricingProducts,formatCurrency,formatCustomerLocationForDisplay,formatCustomerNameDraft,formatDateLabel,formatInputCurrency,formatNumber,formatOrderCode,formatReturnGoodsQty,getCustomerBranchDisplayName,getCustomerDisplayName,getCustomerLoanBalance,getCustomerOpeningDebtAmount,getCustomerOpeningPayableAmount,getCustomerReconciliationDirectionLabel,getCustomerReconciliationFilterLabel,getDuplicateCustomerDisplayName,getLedgerOrderDisplayCode,getPaymentDateKey,getPaymentMethodLabel,getPaymentSourceLabel,getProductAttributes,getProductPrimaryPricingUnit,getProductShortName,getTodayString,handleApplyCustomerEditLocationInput,handleArchiveCustomerLoan,handleCaptureCustomerEditLocation,handleCopyDebt,handleCreateCustomerLoan,handleDeleteCustomerProfile,handleDownloadDebt,handleExportCustomerReconciliationExcel,handleExportCustomerReconciliationPdf,handleOpenCustomerMaps,handleOpenSelectedCustomerDebt,handleRecordCustomerLoanReturn,handleSaveAndNotifyCustomerPrices,handleSaveCustomerBranches,handleSaveCustomerDebtLimit,handleSaveCustomerLoanEdit,handleSaveCustomerOpeningDebt,handleSaveCustomerPriceSettings,handleSaveCustomerProfile,handleSaveDriverAccess,handleShareDebt,handleShareDebtReminder,hasCustomerOrderConfigurationValue,inferCustomerHonorificFromName,isCustomerDetailSectionOpen,isCustomerFixedProductsOpen,isDeletingCustomer,isExportingCustomerReconciliation,isSales,isSavingCustomerBranches,isSavingCustomerDebtLimit,isSavingCustomerLoan,isSavingCustomerOpeningDebt,isSavingCustomerPrices,isSavingCustomerProfile,isSavingDriverAccess,isUpdatingSelectedCustomerLocation,localCustomerSource,normalizeLookupText,normalizeProductPricingUnit,onOpenOrder,openCustomerDetailSection,openCustomerLoanEditor,orderMonth,orderSearch,orderSort,parseInputCurrency,parseLooseMoneyValue,removeCustomerBranchDraft,removeCustomerPriceVariantDraft,salesEmployees,savingCustomerLoanEditId,savingCustomerLoanReturnId,selectedCustomer,selectedCustomerDebtOrders,selectedCustomerDirectionsUrl,selectedCustomerLoanStats,selectedCustomerLoans,selectedCustomerLocationText,selectedCustomerNeedsImmediateCollection,selectedCustomerPendingReturnGoods,selectedCustomerPendingReturnSummary,selectedCustomerProductIdSet,selectedCustomerReconciliationRows,setCustomerEditForm,setCustomerProductPickerSearch,setCustomerReconciliationExportStatus,setCustomerReconciliationFilter,setEditingCustomerLoanId,setIsCustomerFixedProductsOpen,setOrderMonth,setOrderSearch,setOrderSort,setShowCustomerDebtList,setShowCustomerEditForm,showCustomerDebtList,showCustomerEditForm,toggleAllowedDriver,toggleCustomerBranchProduct,toggleCustomerDetailSection,toggleCustomerProductForPricing,toggleDriverDebtAccess,updateCustomerBranchDraft,updateCustomerLoanDraft,updateCustomerLoanEditDraft,updateCustomerLoanReturnDraft,updateCustomerPriceDraft,updateCustomerPriceVariantDraft}}} label="chi tiết khách hàng" />
    );
  }

    if (!customerDirectoryAvailable) return <div className="premium-data-module premium-customer-module min-h-40 p-4" aria-busy={customerSummaryProjection.pending} data-hd-module-loading={customerSummaryProjection.pending || undefined}>
    {customerSummaryProjection.error
      ? <div role="alert">Chưa tổng hợp được danh sách khách hàng. <button type="button" className="font-bold underline" onClick={retryCustomerSummaries}>Thử lại</button></div>
      : <div role="status">Đang chuẩn bị danh sách khách hàng…</div>}
  </div>;

return (
    <div className="premium-data-module premium-customer-module space-y-4 animate-in fade-in pb-16" aria-busy={customerSummaryProjection.pending} data-directory-ready={directoryDataReady&&customerSummaryReady?"true":"false"}>
      {!financialDataReady&&<div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-slate-700" role="status">
        Danh bạ đã sẵn sàng. Công nợ, thống kê và lịch sử chưa được xác minh đầy đủ.
        {onRequestSupplements&&<button type="button" onClick={onRequestSupplements} disabled={supplementsRequested} className="ml-2 font-semibold text-blue-700 underline">{supplementsRequested?'Đang tải dữ liệu liên quan…':'Mở công nợ và lịch sử'}</button>}
      </div>}
      <div className="hd-customer-directory-tabs" role="tablist" aria-label="Danh bạ đối tác">
        <button type="button" role="tab" aria-selected={customerListMode === 'customers'} onClick={() => { setCustomerListMode('customers'); setShowFilterPanel(false); }}>Khách hàng</button>
        <button type="button" role="tab" aria-selected={customerListMode === 'suppliers'} onClick={() => { setCustomerListMode('suppliers'); setShowFilterPanel(false); }}>Nhà cung cấp</button>
      </div>
      {customerListMode === 'customers' && !showFilterPanel && (canSeeCustomerStats || canSeeCustomerDebt) && (
      <div
        data-customer-summary="true"
        role="group"
        aria-label="Tổng quan khách hàng"
        className={`hd-customer-summary-grid grid min-w-0 ${canSeeCustomerStats && canSeeCustomerDebt ? '' : canSeeCustomerStats ? 'hd-customer-summary-grid--two' : 'hd-customer-summary-grid--one'}`}
      >
          {canSeeCustomerStats && (
            <HDKpiCard label="DT" value={formatCurrency(dashboardStats.totalRevenue)} className="min-w-0 text-center" />
          )}
          {canSeeCustomerStats && (
            <HDKpiCard label="Đơn hàng" value={dashboardStats.totalOrders} className="min-w-0 text-center" />
          )}
          {canSeeCustomerDebt && (
            <HDKpiCard
              label="Công nợ"
              value={formatCurrency(dashboardStats.totalDebt)}
              className="min-w-0 text-center"
            />
          )}
      </div>
      )}

      {((!searchInHeader && (showSearchBox || customerSearch)) || showFilterPanel) && (
        <div className={`premium-data-toolbar bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3 ${showFilterPanel && searchInHeader ? 'hidden' : ''}`}>
          {!searchInHeader && (showSearchBox || customerSearch) && (
            <div className="bg-gray-50 border border-gray-100 rounded-2xl px-3 py-2 flex items-center gap-2">
              <Search size={16} className="text-gray-400 shrink-0" />
              <input
                data-hd-search-input="true"
                type="text"
                value={customerSearch}
                onChange={(e) => {startSearchTrace();setCustomerSearch(e.target.value);}}
                placeholder="Tìm tên, số điện thoại, địa chỉ..."
                className="flex-1 bg-transparent text-sm outline-none"
              />
              {customerSearch && (
                <button type="button" onClick={() => setCustomerSearch('')} className="text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              )}
            </div>
          )}
          {showFilterPanel && customerListMode === 'suppliers' && (
            <HDFilterSheet
              open
              title="Sắp xếp nhà cung cấp"
              onClose={() => setShowFilterPanel(false)}
              id="hd-customer-filter-sheet"
              footer={<HDButton onClick={() => setShowFilterPanel(false)}>Áp dụng</HDButton>}
            >
              <div className="grid gap-2">
                <button type="button" aria-pressed={supplierSortFilter === 'recent'} onClick={() => setSupplierSortFilter('recent')} className={`rounded-xl p-3 text-left text-sm font-semibold ${supplierSortFilter === 'recent' ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-600'}`}>Nhập kho gần nhất</button>
                <button type="button" aria-pressed={supplierSortFilter === 'name'} onClick={() => setSupplierSortFilter('name')} className={`rounded-xl p-3 text-left text-sm font-semibold ${supplierSortFilter === 'name' ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-600'}`}>Tên A-Z</button>
              </div>
            </HDFilterSheet>
          )}
          {showFilterPanel && customerListMode === 'customers' && (
            <HDFilterSheet
              open
              title="Bộ lọc khách hàng"
              onClose={() => setShowFilterPanel(false)}
              className="hd-customer-filter-sheet"
              id="hd-customer-filter-sheet"
              footer={<HDButton onClick={() => setShowFilterPanel(false)}>Áp dụng</HDButton>}
            >
            <div data-customer-filter-panel="true" className="space-y-3">
              <HDFilterBar label="Lọc và sắp xếp khách hàng">
                {canSeeCustomerDebt && (
                  <button
                    type="button"
                    onClick={() => setCustomerStatusFilter(prev => (prev === 'debt' ? 'all' : 'debt'))}
                    aria-pressed={customerStatusFilter === 'debt'}
                    className={`hd-customer-filter-chip rounded-xl px-2 py-3 text-xs font-bold transition-colors ${customerStatusFilter === 'debt' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-gray-600 hover:bg-slate-200'}`}
                  >
                    Còn nợ
                  </button>
                )}
                {canSeeCustomerStats && (
                  <button
                    type="button"
                    onClick={() => setCustomerSortFilter(prev => (prev === 'revenue' || prev === 'revenue_desc' ? 'revenue_asc' : 'revenue_desc'))}
                    aria-label={`Doanh thu${customerSortFilter === 'revenue_asc' ? ' tăng dần' : customerSortFilter === 'revenue' || customerSortFilter === 'revenue_desc' ? ' giảm dần' : ''}`}
                    aria-pressed={customerSortFilter === 'revenue' || customerSortFilter === 'revenue_desc' || customerSortFilter === 'revenue_asc'}
                    data-sort-direction={customerSortFilter === 'revenue_asc' ? 'asc' : customerSortFilter === 'revenue' || customerSortFilter === 'revenue_desc' ? 'desc' : 'none'}
                    className={`hd-customer-filter-chip flex items-center justify-center gap-1 rounded-xl px-2 py-3 text-xs font-bold transition-colors ${customerSortFilter === 'revenue' || customerSortFilter === 'revenue_desc' || customerSortFilter === 'revenue_asc' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-gray-600 hover:bg-slate-200'}`}
                  >
                    <span>Doanh thu</span>
                    {customerSortFilter === 'revenue_asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (!customerDateFilter) setCustomerDateFilter(getTodayString());
                    setCustomerSortFilter(prev => (prev === 'date' ? 'default' : 'date'));
                  }}
                  aria-pressed={customerSortFilter === 'date'}
                  className={`hd-customer-filter-chip rounded-xl px-2 py-3 text-xs font-bold transition-colors ${customerSortFilter === 'date' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-gray-600 hover:bg-slate-200'}`}
                >
                  Lọc theo ngày
                </button>
              </HDFilterBar>
              {customerSortFilter === 'date' && (
                <input
                  type="date"
                  value={customerDateFilter}
                  onChange={(e) => setCustomerDateFilter(e.target.value || getTodayString())}
                  className="w-full rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-sm font-bold text-blue-700 outline-none"
                />
              )}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Nhóm KH</label>
                <select value={customerManagerFilter} onChange={e => setCustomerManagerFilter(e.target.value)} className="w-full border border-gray-200 rounded-xl p-3 text-sm bg-white outline-none">
                  {customerManagerOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-gray-500">Đang hiển thị {filteredCustomers.length}/{customerSummaries.length} khách hàng.</p>
                <button type="button" onClick={handleResetCustomerFilters} className="text-blue-600 font-bold hover:text-blue-700">Đặt lại</button>
              </div>
            </div>
            </HDFilterSheet>
          )}
        </div>
      )}

      {customerListMode === 'customers' && <div className="space-y-3" role="tabpanel" aria-label="Khách hàng">
        {canSeeCustomerPhone && duplicateCustomerPhoneGroups.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <AlertCircle size={18} className="shrink-0 mt-0.5 text-amber-600" />
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase text-amber-700 mb-1">Cảnh báo trùng số điện thoại</p>
                <p className="text-xs leading-5">
                  Tên khách có thể trùng nhau, nhưng số điện thoại phải là duy nhất. Hệ thống sẽ cảnh báo nếu số điện thoại bị trùng để bạn kiểm tra lại trước khi lưu.
                </p>
                <div className="space-y-1">
                  {duplicateCustomerPhoneGroups.slice(0, 4).map((group) => (
                    <p key={group.phoneKey} className="text-xs font-semibold">
                      {group.entries[0]?.phone || 'Chưa có số điện thoại'}: {group.entries.map(customer => getCustomerDisplayName(customer) || customer.name || 'Không tên').join(' • ')}
                    </p>
                  ))}
                  {duplicateCustomerPhoneGroups.length > 4 && (
                    <p className="text-xs font-semibold">Còn thêm {duplicateCustomerPhoneGroups.length - 4} nhóm trùng khác.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {filteredCustomers.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-50 p-6 text-center text-sm text-gray-400">
            Không tìm thấy khách hàng phù hợp.
          </div>
        )}

        {customerCardNodes}
        <ListPagination pagination={customerPage} label="Phân trang khách hàng" />
      </div>}

      {customerListMode === 'suppliers' && (
        <div className="hd-customer-supplier-list" role="tabpanel" aria-label="Nhà cung cấp">
          <p className="hd-customer-supplier-count">{filteredSuppliers.length} nhà cung cấp</p>
          {filteredSuppliers.length === 0 && (
            <div className="rounded-xl border border-gray-100 bg-white p-6 text-center text-sm text-gray-500">
              {debouncedCustomerSearch ? 'Không tìm thấy nhà cung cấp phù hợp.' : 'Chưa có nhà cung cấp nào.'}
            </div>
          )}
          {supplierPage.items.map(supplier => {
            const SupplierCard = supplier.customerId ? 'button' : 'div';
            return (
              <SupplierCard
                key={supplier.id}
                type={supplier.customerId ? 'button' : undefined}
                onClick={supplier.customerId ? () => handleOpenCustomer(supplier.customerId) : undefined}
                data-supplier-card="true"
                className="hd-customer-supplier-card"
              >
                <span className="hd-customer-supplier-card__heading">
                  <strong>{supplier.name}</strong>
                  {supplier.customerId && <ChevronRight size={17} aria-hidden="true" />}
                </span>
                {(supplier.phone || supplier.address) && (
                  <span className="hd-customer-supplier-card__contact">
                    {supplier.phone && <span>{supplier.phone}</span>}
                    {supplier.address && <span>{supplier.address}</span>}
                  </span>
                )}
                <span className="hd-customer-supplier-card__metrics">
                  <span><small>Phiếu nhập</small><strong>{supplier.importCount}</strong></span>
                  <span><small>Giá trị nhập</small><strong>{formatCurrency(supplier.totalAmount)} đ</strong></span>
                  <span><small>Gần nhất</small><strong>{supplier.lastImportTime ? new Date(supplier.lastImportTime).toLocaleDateString('vi-VN') : 'Chưa có'}</strong></span>
                </span>
              </SupplierCard>
            );
          })}
          <ListPagination pagination={supplierPage} label="Phân trang nhà cung cấp" />
        </div>
      )}

      {customerListMode === 'customers' && (canAddCustomer || canBulkImportCustomers) && (
      <div className="hd-module-fab hd-customer-module-fab fixed right-4 z-50 pointer-events-none flex flex-col items-end gap-2">
        {showCustomerQuickActions && (
          <div className="pointer-events-auto w-52 rounded-2xl border border-gray-100 bg-white p-2 shadow-2xl">
            {canAddCustomer && (
              <button
                type="button"
                onClick={() => {
                  setShowCustomerQuickActions(false);
                  setShowAddCustomer(true);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm font-bold text-gray-700 hover:bg-gray-50"
              >
                <Plus size={16} className="text-blue-600" />
                Tạo khách hàng
              </button>
            )}
            {canBulkImportCustomers && (
              <button
                type="button"
                onClick={openCustomerImportModal}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm font-bold text-emerald-700 hover:bg-emerald-50"
              >
                <FileText size={16} />
                Nhập Excel
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowCustomerQuickActions(prev => !prev)}
          aria-label="Mở thao tác khách hàng"
          className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl transition hover:bg-blue-700"
        >
          <Plus size={24} />
        </button>
      </div>
      )}

      {showAddCustomer && (
        <PreloadedWorkspace module={deferredCustomerCreateRender} viewProps={{context:{AlertCircle,CUSTOMER_HONORIFIC_OPTIONS,Check,ChevronLeft,Loader2,MapPin,Phone,Search,X,activeProductsForPricing,canAddCustomerLocationFields,canManageCustomerDebtLimit,canPickCustomerContact,canSeeCustomerDebt,closeAddCustomerModal,customerContactStatus,formatCustomerLocationForDisplay,formatCustomerNameDraft,formatInputCurrency,getCustomerContactPickerUnavailableMessage,getDuplicateCustomerDisplayName,handleAddCustomerSubmit,handleApplyNewCustomerLocationInput,handleCaptureNewCustomerLocation,handlePickCustomerContact,inferCustomerHonorificFromName,isCapturingNewCustomerLocation,isPickingCustomerContact,isSales,isSavingNewCustomer,localCustomerSource,newCus,newCustomerPhoneDuplicate,newCustomerProductIds,newCustomerProductOptions,newCustomerProductSearch,newCustomerProductSuggestionLimit,newCustomerProductUsageById,parseInputCurrency,salesEmployees,selectedNewCustomerProductIdSet,setNewCus,setNewCustomerProductSearch,toTitleCase,toggleNewCustomerProduct}}} label="tạo khách hàng" />
      )}

      {showCustomerImportModal && (
        <PreloadedWorkspace module={deferredCustomerImportRender} viewProps={{context:{X,customerImportInputRef,customerImportManagerId,customerImportStatus,handleCustomerImportFileChange,isImportingCustomers,isSales,salesEmployees,setCustomerImportManagerId,setCustomerImportStatus,setShowCustomerImportModal}}} label="nhập khách hàng" />
      )}
    </div>
  );
}
  return CustomerCRMView;
}
