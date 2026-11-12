import PreloadedWorkspace from '../../layout/PreloadedWorkspace.jsx';
import {createPreloadableModule} from '../../utils/preloadableModule.js';
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
// Official directory JSX/declarations sliced from the existing controller.
// No Runtime, database, transport or second source of customer data.
export function createCustomerDirectory(runtime){const {buildCustomerDirectionsUrl,sortOrdersByNewest,APP_SCREEN_BACK_EVENT,CUSTOMER_HONORIFIC_OPTIONS,EMPTY_CUSTOMER_SUMMARIES,EMPTY_MAIN_LEDGER,ReconciledLedgerContext,ShareActionGrid,buildCustomerDebtLimitStatus,buildCustomerImportDuplicateKey,buildCustomerLocationFromPosition,buildCustomerNameAliases,buildCustomerPhoneDuplicateKey,buildCustomerQuoteShareText,buildCustomerReconciledLedger,buildCustomerReconciledLedgerMap,buildLineItemProductSearchText,calculateCustomerLoyaltySummary,capitalizeFirst,capitalizeFirstPreservingSpacing,copyTextToClipboard,createCustomerBranchId,customerDirectorySummaryCache,escapeHtml,formatCurrency,formatCustomerLocationForDisplay,formatCustomerNameDraft,formatDateLabel,formatDateTimeLabel,formatInputCurrency,formatNumber,formatOrderCode,formatReturnGoodsQty,getCustomerBranchDisplayName,getCustomerDebtLimitConfig,getCustomerDisplayName,getCustomerHonorific,getCustomerLocationDisplayText,getCustomerLocationShareText,getCustomerOpeningDebtAmount,getCustomerOpeningPayableAmount,getCustomerPlainName,getDateKeyFromAnyValue,getDeliveryAssignmentIds,getEntityTimestamp,getFriendlyFirebaseErrorMessage,getLedgerOrderDisplayCode,getOrderLineQuantityValue,getOrderLineUnitPriceValue,getOrderLineWeightKgValue,getOrderReturnGoodsRecords,getOrderReturnProductSummary,getPaymentDateKey,getPaymentMethodLabel,getPaymentSourceLabel,getPaymentTimestamp,getProductAttributes,getProductShortName,getSalesDownlineEmployeeIds,getShareChannelLabel,getTodayString,getTransactionBillingPresentation,hasCustomerOrderConfigurationValue,inferCustomerHonorificFromName,isEmployeeDeliveryParticipant,isEmployeeSalesPosition,isOwnerAccountUser,markAppBackHandled,normalizeCustomerBranches,normalizeCustomerDebtLimitAmount,normalizeCustomerLocationFields,normalizeCustomerOpeningDebtAmount,normalizeCustomerOpeningPayableAmount,normalizeCustomerPhone,normalizeCustomerPriceOverrides,normalizeCustomerProductIds,normalizeLookupText,normalizeReturnGoodsStatus,parseCustomerImportWorkbook,parseCustomerLocationInput,parseEntityTimestampValue,parseInputCurrency,parseLooseMoneyValue,parseLooseQuantityValue,pickCustomerContactFromDevice,productMatchesLookup,requestCurrentLocation,resolveCustomerImportFixedProducts,resolveEntityDateKey,roundMoneyValue,saveContentFile,shareTextContent,shouldCollectCustomerDebtImmediately,sortLedgerOrdersNewestFirst,stripCustomerHonorificPrefix,summarizeOrderReturnGoods,toTitleCase} = runtime;
function CustomerDirectory({onOpenCustomer,onRequestAction, localCustomerSource=null,onDirectoryReady,lookupDataReady=true,directoryDataReady=true,financialDataReady=true,supplementsRequested=false,onRequestSupplements,privacyScope = null, isVpsMode = false, employee, currentCompany, customers, orders, payments, expenses = [], paymentReconciliations = [], customerPoints = [], customerLoans = [], products = [], warehouseImports = [], warehouseDispatches = [], onAddCustomer, onEditCustomer, onDeleteCustomer, onDeleteCustomerLoan, onAddCustomerLoan, onEditCustomerLoan, onOpenCustomerDebt, onOpenOrder = () => false, canOpenOrderDetails = false, employees, isSuperAdmin, canViewAllCustomers = false, canViewAssignedCustomers = false, canViewSupplierImports = false, canEditCustomer = false, canDeleteCustomerPermission = false, canAddCustomerPermission = false, canBulkImportCustomersPermission = false, canReassignCustomerManagerPermission = false, canManageFixedProducts:fixedProductPermission = false, canManageCustomerPrices:pricePermission = false, canManageDriverDebtPermission = false, canViewCustomerLoyalty = false, canViewCustomerLoans = false, canCreateCustomerLoan = false, canReturnCustomerLoan = false, canEditCustomerLoan = false, canDeleteCustomerLoan = false, canManageCustomerDebtLimit = false, canViewCustomerDebtLimitAlerts = false, canViewCustomerPhone = false, canCopyCustomerPhone = false, canCallCustomerPhone = false, canViewCustomerLocation = false, canCopyCustomerLocation = false, canOpenCustomerMaps = false, canEditCustomerPhoneAddress = false, canEditCustomerLocation = false, canViewCustomerDebt = false, canViewCustomerStats = false, canViewCustomerOrderHistory = false, canViewCustomerPaymentHistory = false, searchKeyword: externalSearchKeyword, setSearchKeyword: setExternalSearchKeyword, showSearchBox: externalShowSearchBox, setShowSearchBox: setExternalShowSearchBox, showFilterPanel: externalShowFilterPanel, setShowFilterPanel: setExternalShowFilterPanel, quickActionIntent = null, onQuickActionHandled = () => {}, searchInHeader = false }){
const handleOpenCustomer=async id=>{const opened=await onOpenCustomer(id);if(opened)resetCustomerListView();};
const openCustomerImportModal=()=>onRequestAction('import');
const setShowAddCustomer=value=>{if(value)onRequestAction('create');};
const [showCustomerQuickActions, setShowCustomerQuickActions] = useState(false);
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
const isSales = isEmployeeSalesPosition(employee);
const isDeliveryParticipant = isEmployeeDeliveryParticipant(employee);
const isOwnerCustomerAccount = Boolean(isSuperAdmin || canViewAllCustomers || isOwnerAccountUser(employee, null));
const canViewEveryCustomer = Boolean(isOwnerCustomerAccount || canViewAllCustomers);
const canViewAssignedCustomerList = Boolean(canViewAssignedCustomers || canViewEveryCustomer);
const canAddCustomer = directoryDataReady && lookupDataReady && Boolean(canAddCustomerPermission);
const canBulkImportCustomers = directoryDataReady && lookupDataReady && Boolean(canBulkImportCustomersPermission);
const canSeeCustomerPhone = Boolean(isOwnerCustomerAccount || canViewCustomerPhone);
const canSeeCustomerLocation = Boolean(isOwnerCustomerAccount || canViewCustomerLocation);
const canSeeCustomerDebt = financialDataReady && Boolean(isOwnerCustomerAccount || canViewCustomerDebt);
const canSeeCustomerDebtLimitAlerts = financialDataReady && Boolean(isOwnerCustomerAccount || canViewCustomerDebtLimitAlerts || canSeeCustomerDebt || canManageCustomerDebtLimit);
const canSeeCustomerStats = financialDataReady && Boolean(isOwnerCustomerAccount || canViewCustomerStats);
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
const activeProductsForPricing = useMemo(() => products.filter(product => !product.isArchived), [products]);
const activeProductForPricingLookup = useMemo(
    () => new Map(activeProductsForPricing.map(product => [product.id, product])),
    [activeProductsForPricing]
  );
const salesEmployees = useMemo(() => (employees ? employees.filter(e => isEmployeeSalesPosition(e)) : []), [employees]);
const customerSearch = externalSearchKeyword ?? localCustomerSearchKeyword;
const debouncedCustomerSearch = useDebouncedValue(localCustomerSource?.queryManaged?'':customerSearch, 160);
const setCustomerSearch = setExternalSearchKeyword ?? setLocalCustomerSearchKeyword;
const showSearchBox = externalShowSearchBox ?? localShowSearchBox;
const setShowSearchBox = setExternalShowSearchBox ?? setLocalShowSearchBox;
const showFilterPanel = externalShowFilterPanel ?? localShowFilterPanel;
const setShowFilterPanel = setExternalShowFilterPanel ?? setLocalShowFilterPanel;
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
const localDirectorySummaries=useMemo(()=>localCustomerSource?.queryManaged&&!financialDataReady&&activeCustomers.length<=100?activeCustomers.map(buildCustomerSummary):null,[localCustomerSource?.queryManaged,financialDataReady,activeCustomers,buildCustomerSummary]);
const cooperativeCustomerSummary=useCooperativeProjection(prepareCustomerSummaries,customerSummaryEntry,{enabled:directoryDataReady&&localDirectorySummaries===null});
const customerSummaryProjection=localDirectorySummaries===null?cooperativeCustomerSummary:{value:localDirectorySummaries,pending:false,error:null};
const customerSummaryReady = !customerSummaryProjection.pending && !customerSummaryProjection.error;
const completedCustomerSummaries = useRef({ scope: null, value: EMPTY_CUSTOMER_SUMMARIES });
React.useLayoutEffect(() => {
    if (customerSummaryReady) completedCustomerSummaries.current = { scope: customerSummaryScope, value: customerSummaryProjection.value };
  }, [customerSummaryReady, customerSummaryScope, customerSummaryProjection.value]);
const activeCustomerIdSet = useMemo(() => new Set(activeCustomers.map(customer => customer.id)), [activeCustomers]);
const customerSummaries = useMemo(() => {
    if (customerSummaryReady) return customerSummaryProjection.value;
    if (customerSummaryProjection.error || completedCustomerSummaries.current.scope !== customerSummaryScope) return EMPTY_CUSTOMER_SUMMARIES;
    return completedCustomerSummaries.current.value.filter(customer => activeCustomerIdSet.has(customer.id));
  }, [customerSummaryReady, customerSummaryProjection.value, customerSummaryProjection.error, customerSummaryScope, activeCustomerIdSet]);
const directoryReadyAnnouncement=useRef(null);
useEffect(()=>{
    if(customerSummaryReady&&directoryDataReady&&directoryReadyAnnouncement.current!==customerSummaryScope){
      directoryReadyAnnouncement.current=customerSummaryScope;onDirectoryReady?.();
    }
  },[customerSummaryReady,directoryDataReady,customerSummaryScope,onDirectoryReady]);
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
const handleResetCustomerFilters = () => {
    resetCustomerListView();
  };
const onOpenCustomerCard = useCommittedCallback(handleOpenCustomer);
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
useEffect(()=>{const back=event=>{if(showCustomerQuickActions){setShowCustomerQuickActions(false);markAppBackHandled(event);}else if(showFilterPanel){setShowFilterPanel(false);markAppBackHandled(event);}else if(showSearchBox){setShowSearchBox(false);markAppBackHandled(event);}};window.addEventListener(APP_SCREEN_BACK_EVENT,back);return()=>window.removeEventListener(APP_SCREEN_BACK_EVENT,back);},[showCustomerQuickActions,showFilterPanel,showSearchBox,setShowFilterPanel,setShowSearchBox]);
const customerDirectoryAvailable=customerSummaryReady||(!customerSummaryProjection.error&&completedCustomerSummaries.current.scope===customerSummaryScope);
const retryCustomerSummaries=()=>setCustomerSummaryAttempt(attempt=>attempt+1);
if(!customerDirectoryAvailable)return <div className="premium-data-module premium-customer-module min-h-40 p-4" aria-busy={customerSummaryProjection.pending} data-hd-module-loading={customerSummaryProjection.pending||undefined}>{customerSummaryProjection.error?<div role="alert">Chưa tổng hợp được danh sách khách hàng. <button type="button" className="font-bold underline" onClick={retryCustomerSummaries}>Thử lại</button></div>:<div role="status">Đang chuẩn bị danh sách khách hàng…</div>}</div>;
return (<div className="premium-data-module premium-customer-module space-y-4 animate-in fade-in pb-16" aria-busy={customerSummaryProjection.pending} data-directory-ready={directoryDataReady&&customerSummaryReady?"true":"false"}>
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

      

      
    </div>);
}
return CustomerDirectory;
}
