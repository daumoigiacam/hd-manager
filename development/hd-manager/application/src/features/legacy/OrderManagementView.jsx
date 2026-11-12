import { useState, useEffect, useMemo, useRef } from "react";
import { useAppScreenBack } from "../../hooks/useAppScreenBack.js";
import { useCallback, useSyncExternalStore } from "react";
import { createOrderSearchState } from "../../services/orderSearchState.js";
import { hasSearchQuery as hasTokenSearchQuery, getOrderSearchFields, searchCustomers as searchCustomerRecords } from "../../services/searchEngine.js";
import { collectUsedWarehouseDispatchIds, findDuplicateWarehouseDispatchIds, getWarehouseDispatchIds, isWarehouseDispatchAlreadyLinked, selectWarehouseDispatchOrderPriceCandidate, resolveOrderCreationDateKey } from "../../utils/warehouseDispatchOrders.js";
import { useCooperativeProjection } from "../../hooks/useCooperativeProjection.js";
import {getReadOnlyModuleProjectionEntry,getLocalProjectionClockScope,readCompletedModuleProjection,EMPTY_MODULE_PROJECTION_SOURCE} from '../../services/moduleProjectionCaches.js';
import {readOrderDirectoryProjection} from '../../services/orderDirectoryProjection.js';
import { sortOrdersByNewest, compareOrdersByNewest } from "../../utils/orderRecency.js";
import { usePreparedSearch } from "../../hooks/usePreparedSearch.js";
import { getDefaultListPageSize, usePagedList } from "../../services/renderOptimization";
import { buildCustomerProductBillingSnapshot, buildWarehouseDispatchOrderBillingSnapshot, isSameBillingUnit, resolveCustomerProductActualUnit, resolveTransactionBillingSnapshot, prepareWarehouseDispatchOrderItems, updateTransactionBillingItem, summarizeOrderBillingItems, mergeWarehouseDispatchOrderBillingItems } from "../../services/customerProductBilling.js";
import { createPerformanceSpan, recordPerformanceEvent } from "../../services/performanceMonitor.js";
import { getProductPrimaryPricingUnit, normalizeProductPricingUnit } from "../../services/productPricingUnits.js";
import { HDButton, HDEmptyState } from "../../design-system/index.js";
import { DollarSign, Plus, X, AlertCircle, ChevronLeft, CheckCircle, Edit3, Search, Trash2, ClipboardList, Sparkles, Send, Loader2, Camera } from "lucide-react";
import { ListPagination } from "../../design-system/ListPagination.jsx";
import { HDHeader } from "../../layout/index.js";
// Transitional bundle boundary. Only stable local module bindings are injected;
// all actor/company/business data continues to arrive through current props.
// Generated binding contract is checked against the real source AST.
export function createOrderManagementView(runtime) {
  const {EMPTY_ORDER_VIEW_PROJECTION,GEMINI_PROXY_ENABLED,PAYMENT_QR_IMAGE_FETCH_TIMEOUT_MS,PremiumStatusBadge,RETURN_GOODS_STATUS_LABELS,areLooseQuantityValuesClose,buildCustomerLedger,buildCustomerLedgerMap,buildLineItemProductSearchText,buildOrderTransferMemo,buildOrderViewModel,buildOrderViewProjectionSteps,buildPayosPaymentQrImageSource,buildSalesOrderShareFilename,capitalizeFirst,collapseLookupText,debugShareImageCache,findBestEntityMatch,formatCompactDateLabel,formatCurrency,formatDateLabel,formatDateTimeLabel,formatInputCurrency,formatNumber,formatOrderCode,formatReturnGoodsQty,getCachedOrderShareAsset,getCustomerBranchProductConfigSource,getDeliveryReportWeightStatus,getEntityTimestamp,getFriendlyFirebaseErrorMessage,getOrderLineQuantityValue,getOrderLineSizeLabel,getOrderLineUnitPriceValue,getOrderLineWeightKgValue,getOrderOutstandingBalance,getOrderPayosPaymentSource,getOrderReturnGoodsRecords,getOrderReturnProductSummary,getOrderSalesEmpId,getPaymentDateKey,getPaymentMethodLabel,getProductShortName,getShareChannelLabel,getTodayString,getTransactionBillingPresentation,isEmployeeSalesPosition,isTimeoutLikeError,normalizeAiOrderDate,normalizeLookupText,normalizeOrderPaymentSnapshot,parseDateInputValue,parseInputCurrency,parseLooseMoneyValue,parseLooseQuantityValue,requestNotebookOrderDraftsFromGemini,resolveCustomerProductBillingConfiguration,resolveEntityDateKey,scheduleOrderShareWarmup,shareBlobFile,summarizeOrderReturnGoods,toDateInputString,toTitleCase,toTitleCasePreservingSpacing,useAutoDismissMessage,useDismissSearchOnOutsideClick,warmLocalPaymentQrDataUrlCache,warmOrderShareAssetCache,warmPaymentQrImageDataUrlCache} = runtime;
  function OrderManagementView({ isAccounting, employee, currentCompany, employees, customers, orders, allCompanyOrders = null, orderRequests = [], payments, customerLedgerMap: prefetchedCustomerLedgerMap = null, products, warehouseDispatches = [], deliveryReports = [], zaloSendQueue = [], onAddOrder, onEditOrder, onApproveOrderZaloSend, onUpdateOrderZaloMessage, onSyncPayosPaymentStatus, onEnsureOrderPayosPayment, onToggleArchiveOrder, onDeleteOrder, onAddPayment, onAddCustomer, onAddExpense, onResolveDeliveryReportIssue, onOpenCustomerZaloLink, canCreateManualOrder = false, canCreateOrderFromImage = false, canCreateOrderFromWarehouse = false, canEditOrder = false, canEditOrderQuantityPrice = false, canDeleteOrder = false, canSharePaymentQr = false, canRecordOrderPayment = false, canResolveDeliveryIssues = false, canChargeLostDeliveryGoods = false, searchStore = null, searchKeyword: externalSearchKeyword, setSearchKeyword: setExternalSearchKeyword, showSearchBox: externalShowSearchBox, setShowSearchBox: setExternalShowSearchBox, showFilterPanel: externalShowFilterPanel, setShowFilterPanel: setExternalShowFilterPanel, quickActionIntent = null, onQuickActionHandled = () => {} }) {
  const [showAddOrder, setShowAddOrder] = useState(false); 
  const [showOrderSourcePicker, setShowOrderSourcePicker] = useState(false);
  const [orderCreationSource, setOrderCreationSource] = useState('');
  const [showQuickAddCus, setShowQuickAddCus] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [orderSaving, setOrderSaving] = useState(false);
  const orderEditInFlightRef = useRef(null);
  const [isSharingOrder, setIsSharingOrder] = useState(false);
  const orderShareInProgressRef = useRef(false);
  const [orderShareStatus, setOrderShareStatus] = useState('');
  const [zaloPreviewOrderId, setZaloPreviewOrderId] = useState('');
  const [zaloPreviewDraft, setZaloPreviewDraft] = useState('');
  const [zaloPreviewSaveStatus, setZaloPreviewSaveStatus] = useState('');
  const [isApprovingZaloSend, setIsApprovingZaloSend] = useState(false);
  const [syncingPayosOrderId, setSyncingPayosOrderId] = useState('');
  const [payosSyncStatus, setPayosSyncStatus] = useState('');
  const [tab, setTab] = useState('all');
  const [localOrderSearchKeyword, setLocalOrderSearchKeyword] = useState('');
  const [localShowSearchBox, setLocalShowSearchBox] = useState(false);
  const [localShowFilterPanel, setLocalShowFilterPanel] = useState(false);
  const [orderDateFilter, setOrderDateFilter] = useState('');
  const [orderProductFilter, setOrderProductFilter] = useState('');
  const [orderPaymentFilter, setOrderPaymentFilter] = useState('');
  const [orderSalesEmpFilter, setOrderSalesEmpFilter] = useState('');
  const [feeEditorOrderId, setFeeEditorOrderId] = useState('');
  const [feeDraft, setFeeDraft] = useState({ name: '', amount: '', payer: 'buyer' });
  const [bulkFeeEditorDraftId, setBulkFeeEditorDraftId] = useState('');
  const [bulkFeeDraft, setBulkFeeDraft] = useState({ name: '', amount: '', payer: 'buyer' });
  const [returnEditorOrderId, setReturnEditorOrderId] = useState('');
  const [returnDraft, setReturnDraft] = useState({ pieces: '', weightKg: '', reason: '', status: 'pending_pickup', discountAmount: '' });
  const [returnEditorError, setReturnEditorError] = useState('');
  const [orderItemEditor, setOrderItemEditor] = useState({ orderId: '', itemIndex: -1, quantity: '', unitPrice: '' });
  const [orderPaymentDraft, setOrderPaymentDraft] = useState({ open: false, orderId: '', amount: '', method: 'Chuyển khoản', date: getTodayString(), isSaving: false, error: '' });
  const [searchCus, setSearchCus] = useState('');
  const [showCusDropdown, setShowCusDropdown] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  useAppScreenBack(() => {
    if (showCusDropdown) {
      setShowCusDropdown(false);
      return true;
    }
    if (zaloPreviewOrderId) {
      setZaloPreviewOrderId('');
      return true;
    }
    if (orderPaymentDraft.open) {
      setOrderPaymentDraft(prev => ({ ...prev, open: false }));
      return true;
    }
    if (orderItemEditor.orderId) {
      setOrderItemEditor({ orderId: '', itemIndex: -1, quantity: '', unitPrice: '' });
      return true;
    }
    if (feeEditorOrderId || returnEditorOrderId) {
      setFeeEditorOrderId('');
      setReturnEditorOrderId('');
      return true;
    }
    if (showQuickAddCus) {
      setShowQuickAddCus(false);
      return true;
    }
    if (showAddOrder) {
      closeAddOrderModal();
      return true;
    }
    if (showOrderSourcePicker) {
      setShowOrderSourcePicker(false);
      return true;
    }
    if (selectedOrderId) {
      closeOrderDetail();
      return true;
    }
    return false;
  });
  const selectedOrderSnapshotRef = useRef(null);
  const zaloPreviewOrderSnapshotRef = useRef(null);
  useDismissSearchOnOutsideClick(showCusDropdown, () => setShowCusDropdown(false));
  const keepOrderShareWorkingNotice = useCallback((message = '') => /^(Đang|Dang)/i.test(`${message || ''}`.trim()), []);
  useAutoDismissMessage(orderShareStatus, setOrderShareStatus, { delay: 5200, keepWhile: keepOrderShareWorkingNotice });
  const isSales = isEmployeeSalesPosition(employee);
  const salesEmployees = employees ? employees.filter(e => isEmployeeSalesPosition(e)) : [];
  const canCreateAnyOrder = Boolean(canCreateManualOrder || canCreateOrderFromImage || canCreateOrderFromWarehouse);
  const canUseWarehouseOrderSource = Boolean(canCreateOrderFromWarehouse);
  const canUseImageOrderSource = Boolean(canCreateOrderFromImage);
  const canUseManualOrderSource = Boolean(canCreateManualOrder);
  const bulkOrderImageInputRef = useRef(null);
  const createEmptyOrderItem = () => ({ productId: '', description: '', quantity: 1, unitPrice: '' });
  const getDefaultSalesEmpId = () => (isSales ? employee?.id || '' : salesEmployees[0]?.id || '');
  const createSingleOrderState = () => ({
    customerId: '',
    branchId: '',
    branchName: '',
    branchAddress: '',
    customerBranchId: '',
    customerBranchName: '',
    customerBranchAddress: '',
    items: [createEmptyOrderItem()],
    discount: '',
    extraExpenseName: '',
    extraExpenseAmount: '',
    extraExpensePayer: 'buyer',
    date: getTodayString(),
    upfrontPayment: '',
    paymentMethod: 'Chuyển khoản'
  });
  const createBulkOrderDraft = (seed = {}) => ({
    localId: seed.localId || `bulk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    customerId: seed.customerId || '',
    customerName: seed.customerName || '',
    branchId: seed.branchId || seed.customerBranchId || '',
    branchName: seed.branchName || seed.customerBranchName || '',
    branchAddress: seed.branchAddress || seed.customerBranchAddress || '',
    customerBranchId: seed.branchId || seed.customerBranchId || '',
    customerBranchName: seed.branchName || seed.customerBranchName || '',
    customerBranchAddress: seed.branchAddress || seed.customerBranchAddress || '',
    salesEmpId: seed.salesEmpId || getDefaultSalesEmpId(),
    items: Array.isArray(seed.items) && seed.items.length > 0 ? seed.items : [createEmptyOrderItem()],
    date: seed.date || getTodayString(),
    note: seed.note || '',
    discount: seed.discount || '',
    extraExpenseName: seed.extraExpenseName || '',
    extraExpenseAmount: seed.extraExpenseAmount || '',
    extraExpensePayer: seed.extraExpensePayer || 'buyer',
    upfrontPayment: seed.upfrontPayment || '',
    paymentMethod: seed.paymentMethod || 'Chuyển khoản',
    sourceType: seed.sourceType || '',
    sourceDispatchIds: Array.isArray(seed.sourceDispatchIds) ? seed.sourceDispatchIds : [],
    sourceDispatchDate: seed.sourceDispatchDate || ''
  });
  const fallbackSearchStore = useMemo(() => createOrderSearchState(), []);
  const committedOrderSearch = useSyncExternalStore((searchStore || fallbackSearchStore).subscribe, (searchStore || fallbackSearchStore).getSnapshot);
  const orderSearchKeyword = searchStore ? committedOrderSearch : (externalSearchKeyword ?? localOrderSearchKeyword);
  const setOrderSearchKeyword = searchStore?.set ?? setExternalSearchKeyword ?? setLocalOrderSearchKeyword;
  const showSearchBox = externalShowSearchBox ?? localShowSearchBox;
  const setShowSearchBox = setExternalShowSearchBox ?? setLocalShowSearchBox;
  const showFilterPanel = externalShowFilterPanel ?? localShowFilterPanel;
  const setShowFilterPanel = setExternalShowFilterPanel ?? setLocalShowFilterPanel;

  const [newOrder, setNewOrder] = useState(createSingleOrderState);
  const [bulkOrderDrafts, setBulkOrderDrafts] = useState([]);
  const [bulkOrderStatus, setBulkOrderStatus] = useState('');
  const [isBulkOrderScanning, setIsBulkOrderScanning] = useState(false);
  const [isBulkOrderSubmitting, setIsBulkOrderSubmitting] = useState(false);
  const bulkOrderSubmittingRef = useRef(false);
  const [selectedWarehouseDispatchDate, setSelectedWarehouseDispatchDate] = useState(getTodayString());
  const dispatchDate = selectedWarehouseDispatchDate || getTodayString();
  const shouldShowOrderNote = (note = '') => {
    const cleanNote = `${note || ''}`.trim();
    if (!cleanNote) return false;
    return normalizeLookupText(cleanNote) !== 'lay tu phieu xuat kho';
  };
  const bulkOrderSource = bulkOrderDrafts.some(draft => draft.sourceType === 'warehouse_dispatch')
    ? 'warehouse_dispatch'
    : bulkOrderDrafts.some(draft => draft.sourceType === 'notebook_image')
      ? 'notebook_image'
      : 'manual';
  const isWarehouseBulkReview = bulkOrderDrafts.some(draft => draft.sourceType === 'warehouse_dispatch');
  
  const [newCus, setNewCus] = useState({ name: '', phone: '', address: '', customerGroup: '', empId: isSales ? employee?.id || '' : '' });

  const orderProjectionScope={companyId:currentCompany?.id||employee?.companyId||'',employeeId:employee?.id||'',
    permissionKey:JSON.stringify([isAccounting]),periodKey:'',clockKey:getLocalProjectionClockScope(getTodayString())};
  const orderDirectoryEntry=getReadOnlyModuleProjectionEntry('orderDirectory',[orders,customers,products],orderProjectionScope);
  const {activeOrders,activeProducts,customerLookup,activeProductLookup,activeOrderById,orderSearchProductLookup}=useMemo(
    ()=>readOrderDirectoryProjection(orderDirectoryEntry,{orders,customers,products}),[orderDirectoryEntry,orders,customers,products]);
  const customerLedgerMap = useMemo(
    () => prefetchedCustomerLedgerMap || buildCustomerLedgerMap(customers, orders, payments),
    [customers, orders, payments, prefetchedCustomerLedgerMap]
  );
  const ledgerIndexEntry=getReadOnlyModuleProjectionEntry('orderLedgerIndex',[customerLedgerMap],orderProjectionScope);
  const paymentIndexEntry=getReadOnlyModuleProjectionEntry('orderPaymentIndex',[customerLedgerMap],orderProjectionScope);
  const filteredCustomers = useMemo(
    () => searchCustomerRecords(customers, searchCus),
    [customers, searchCus]
  );
  const employeeLookup = useMemo(
    () => new Map(employees.map(employeeRecord => [employeeRecord.id, employeeRecord])),
    [employees]
  );
  const ledgerOrderById = useMemo(() => readCompletedModuleProjection(ledgerIndexEntry,() => {
    const orderLookup = new Map();
    Object.values(customerLedgerMap).forEach((ledger) => {
      (ledger?.orders || []).forEach(order => orderLookup.set(order.id, order));
    });
    return orderLookup;
  }), [customerLedgerMap,ledgerIndexEntry]);
  const paymentHistoryByOrderId = useMemo(() => readCompletedModuleProjection(paymentIndexEntry,() => {
    const historyLookup = new Map();
    Object.values(customerLedgerMap).forEach((ledger) => {
      (ledger?.payments || []).forEach((payment) => {
        const allocatedByOrder = new Map();
        (payment.allocations || []).forEach((allocation) => {
          if (!allocation.orderId) return;
          allocatedByOrder.set(
            allocation.orderId,
            (allocatedByOrder.get(allocation.orderId) || 0) + (allocation.amount || 0)
          );
        });
        allocatedByOrder.forEach((allocatedToOrder, orderId) => {
          const history = historyLookup.get(orderId) || [];
          history.push({ ...payment, allocatedToOrder });
          historyLookup.set(orderId, history);
        });
      });
    });
    return historyLookup;
  }), [customerLedgerMap,paymentIndexEntry]);
  const deliveryReportIssueByDispatch = useMemo(() => {
    const dispatchLookup = new Map((warehouseDispatches || []).map(dispatch => [dispatch.id, dispatch]));
    const productLookup = new Map((products || []).map(product => [product.id, product]));
    const issueMap = new Map();
    const resolvedStatuses = new Set(['accepted', 'rejected', 'lost_charged', 'resolved', 'not_required']);

    (deliveryReports || [])
      .filter(report => !report?.isArchived && report?.dispatchId)
      .forEach(report => {
        const statusMeta = getDeliveryReportWeightStatus(report);
        const resolutionStatus = report.resolutionStatus || (statusMeta.isMismatch ? 'pending' : 'not_required');
        if (!statusMeta.isMismatch || resolvedStatuses.has(resolutionStatus)) return;

        const previous = issueMap.get(report.dispatchId);
        if (previous && (getEntityTimestamp(previous.rawReport) || 0) > (getEntityTimestamp(report) || 0)) return;

        const dispatch = dispatchLookup.get(report.dispatchId) || {};
        const product = productLookup.get(report.productId || dispatch.productId) || {};
        issueMap.set(report.dispatchId, {
          reportId: report.id,
          dispatchId: report.dispatchId,
          customerId: report.customerId || dispatch.customerId || '',
          productId: report.productId || dispatch.productId || '',
          productName: report.productNameSnapshot || dispatch.productNameSnapshot || product.name || 'Hàng hóa',
          expectedWeight: statusMeta.expectedWeight,
          actualWeight: statusMeta.actualWeight,
          diff: statusMeta.diff,
          empId: report.empId || report.createdByEmpId || dispatch.empId || dispatch.createdByEmpId || '',
          createdByEmpId: report.createdByEmpId || report.empId || '',
          date: report.date || dispatch.date || '',
          resolutionStatus,
          rawReport: report
        });
      });

    return issueMap;
  }, [deliveryReports, products, warehouseDispatches]);
  const zaloQueueByOrderId = useMemo(() => {
    const queueMap = new Map();
    (zaloSendQueue || []).forEach(queueItem => {
      if (!queueItem?.orderId || queueItem.isArchived) return;
      const previous = queueMap.get(queueItem.orderId);
      if (!previous || (getEntityTimestamp(queueItem) || 0) >= (getEntityTimestamp(previous) || 0)) {
        queueMap.set(queueItem.orderId, queueItem);
      }
    });
    return queueMap;
  }, [zaloSendQueue]);
  const orderRecordsForDuplicateCheck = Array.isArray(allCompanyOrders) ? allCompanyOrders : orders;
  const importedWarehouseDispatchIds = useMemo(
    () => showAddOrder ? collectUsedWarehouseDispatchIds(orderRecordsForDuplicateCheck) : new Set(),
    [orderRecordsForDuplicateCheck, showAddOrder]
  );
  const todayWarehouseDispatches = useMemo(() => (warehouseDispatches || [])
    .filter(dispatch => !dispatch.isArchived && (dispatch.date || getTodayString()) === dispatchDate), [dispatchDate, warehouseDispatches]);
  const pendingWarehouseDispatches = useMemo(() => todayWarehouseDispatches
    .filter(dispatch => !importedWarehouseDispatchIds.has(dispatch.id) && !isWarehouseDispatchAlreadyLinked(dispatch)), [todayWarehouseDispatches, importedWarehouseDispatchIds]);
  const orderViewContext = useMemo(()=>({customerLookup,ledgerOrderById,employeeLookup,paymentHistoryByOrderId,deliveryReportIssueByDispatch,zaloQueueByOrderId}),
    [customerLookup,ledgerOrderById,employeeLookup,paymentHistoryByOrderId,deliveryReportIssueByDispatch,zaloQueueByOrderId]);
  const prepareOrderViews = useMemo(()=>()=>buildOrderViewProjectionSteps(activeOrders,orderViewContext),[activeOrders,orderViewContext]);
  const orderProjectionEntry=getReadOnlyModuleProjectionEntry('orderViews',
    [employee,currentCompany,employees,customers,orders,payments,products,warehouseDispatches,deliveryReports,zaloSendQueue,prefetchedCustomerLedgerMap||EMPTY_MODULE_PROJECTION_SOURCE],
    orderProjectionScope);
  const orderViewProjection = useCooperativeProjection(prepareOrderViews,orderProjectionEntry);
  const orderViewsReady = !orderViewProjection.pending && !orderViewProjection.error;
  const normalizedOrderSnapshots = (orderViewProjection.value || EMPTY_ORDER_VIEW_PROJECTION).snapshots || EMPTY_ORDER_VIEW_PROJECTION.snapshots;
  const getLiveOrderViewModel = useCallback(id=>{
    const order=activeOrderById.get(String(id));return order?buildOrderViewModel(order,orderViewContext):null;
  },[activeOrderById,orderViewContext]);
  const deferredOrderSearchKeyword = orderSearchKeyword;
  const filteredOrderSnapshots = useMemo(() => {
    const selectedProduct = orderProductFilter ? activeProductLookup.get(orderProductFilter) : null;
    const selectedProductName = normalizeLookupText(selectedProduct?.name || '');
    return normalizedOrderSnapshots
      .filter(order => tab === 'pending' ? getOrderOutstandingBalance(order) > 0 : true)
      .filter(order => {
        if (orderDateFilter && resolveEntityDateKey(order, '') !== orderDateFilter) return false;
        const customer = customerLookup.get(order.customerId);
        const salesEmpId = order.salesEmpId || customer?.empId || order.createdByEmpId || order.empId || '';
        if (orderSalesEmpFilter && salesEmpId !== orderSalesEmpFilter) return false;
        if (orderPaymentFilter) {
          const outstandingAmount = getOrderOutstandingBalance(order);
          if (orderPaymentFilter === 'paid' && outstandingAmount > 0) return false;
          if (orderPaymentFilter === 'unpaid' && outstandingAmount <= 0) return false;
        }
        if (orderProductFilter) {
          return (order.items || []).some((item) => {
            const product = item.productId ? activeProductLookup.get(item.productId) : null;
            const itemName = normalizeLookupText(item.description || product?.name || '');
            return item.productId === orderProductFilter || (selectedProductName && itemName === selectedProductName);
          });
        }
        return true;
      })
      ;
  }, [normalizedOrderSnapshots, activeProductLookup, customerLookup, orderDateFilter,
    orderPaymentFilter, orderProductFilter, orderSalesEmpFilter, tab]);
  const getPreparedOrderSearchFields = useCallback(order => getOrderSearchFields(order, {
        getItemText: (order) => (order.items || [])
          .map(item => buildLineItemProductSearchText(item, products, item?.productId ? orderSearchProductLookup.get(item.productId) : undefined))
          .join(' '),
        getCustomerText: (order) => {
          const customer = customerLookup.get(order.customerId);
          return [customer?.name, customer?.phone, customer?.code];
        },
  }), [products, customerLookup, orderSearchProductLookup]);
  const filteredOrderMembership = useMemo(() => new Set(filteredOrderSnapshots), [filteredOrderSnapshots]);
  const sortedOrderEntry=getReadOnlyModuleProjectionEntry('orderSorted',[normalizedOrderSnapshots,customers,products],
    {...orderProjectionScope,periodKey:JSON.stringify([tab,orderDateFilter,orderSalesEmpFilter,orderPaymentFilter,orderProductFilter])});
  const orderedFilteredOrders = useMemo(() => readCompletedModuleProjection(sortedOrderEntry,()=>sortOrdersByNewest(filteredOrderSnapshots)), [filteredOrderSnapshots,sortedOrderEntry]);
  const tiedOrderRanks = useMemo(() => {
    if (!hasTokenSearchQuery(deferredOrderSearchKeyword)) return undefined;
    let rank = 0;
    let tied = false;
    const ranks = new Map();
    orderedFilteredOrders.forEach((order, index) => {
      if (index && compareOrdersByNewest(orderedFilteredOrders[index - 1], order) === 0) tied = true;
      else rank = index;
      ranks.set(order, rank);
    });
    return tied ? ranks : undefined;
  }, [orderedFilteredOrders, deferredOrderSearchKeyword]);
  const preparedOrderSearch = usePreparedSearch(normalizedOrderSnapshots, getPreparedOrderSearchFields,
    deferredOrderSearchKeyword, orderedFilteredOrders, filteredOrderMembership, tiedOrderRanks);
  const displayOrders = hasTokenSearchQuery(deferredOrderSearchKeyword) ? preparedOrderSearch.results : orderedFilteredOrders;
  const displayOrderRenderKey = [
    tab,
    orderDateFilter,
    orderProductFilter,
    orderPaymentFilter,
    orderSalesEmpFilter,
    normalizeLookupText(deferredOrderSearchKeyword)
  ].join('|');
  const [orderPageSize] = useState(() => Math.min(20, getDefaultListPageSize()));
  const orderPage = usePagedList(displayOrders, displayOrderRenderKey, orderPageSize);
  const hasOrderListFilters = Boolean(
    orderSearchKeyword.trim() || orderDateFilter || orderProductFilter || orderPaymentFilter || orderSalesEmpFilter || tab !== 'all'
  );
  const resetOrderListFilters = () => {
    setOrderSearchKeyword('');
    setOrderDateFilter('');
    setOrderProductFilter('');
    setOrderPaymentFilter('');
    setOrderSalesEmpFilter('');
    setTab('all');
  };
  const selectedRevenueDate = orderDateFilter || getTodayString();
  const dailyOrderRevenueSummary = useMemo(() => {
    const ordersForDate = normalizedOrderSnapshots
      .filter(order => resolveEntityDateKey(order, '') === selectedRevenueDate);

    const totalRevenue = ordersForDate.reduce((sum, order) => {
      const directAmount = parseLooseMoneyValue(order.amount ?? order.totalAmount ?? order.finalAmount ?? order.grandTotal ?? order.total);
      if (directAmount > 0) return sum + directAmount;

      const itemSubtotal = (order.items || []).reduce(
        (itemSum, item) => itemSum + getTransactionBillingPresentation(item).amount,
        0
      );
      const customerFee = parseLooseMoneyValue(order.customerExtraExpense ?? order.extraExpenseAmount ?? 0);
      const discount = parseLooseMoneyValue(order.discount ?? 0);
      return sum + Math.max(0, itemSubtotal + customerFee - discount);
    }, 0);

    return {
      count: ordersForDate.length,
      totalRevenue,
      paidRevenue: ordersForDate.reduce((sum, order) => sum + Math.max(
        parseLooseMoneyValue(order.appliedAmount),
        parseLooseMoneyValue(order.paidAmount),
        parseLooseMoneyValue(order.collectedAmount)
      ), 0),
      outstandingRevenue: ordersForDate.reduce((sum, order) => sum + getOrderOutstandingBalance(order), 0)
    };
  }, [normalizedOrderSnapshots, selectedRevenueDate]);
  const selectedOrderLive = useMemo(() => selectedOrderId ? normalizeOrderPaymentSnapshot(getLiveOrderViewModel(selectedOrderId) || null) : null, [selectedOrderId, getLiveOrderViewModel]);
  const zaloPreviewOrderLive = useMemo(() => zaloPreviewOrderId ? normalizeOrderPaymentSnapshot(getLiveOrderViewModel(zaloPreviewOrderId) || null) : null, [zaloPreviewOrderId, getLiveOrderViewModel]);
  useEffect(() => {
    if (!selectedOrderId) {
      selectedOrderSnapshotRef.current = null;
      return;
    }
    if (selectedOrderLive) {
      selectedOrderSnapshotRef.current = selectedOrderLive;
    }
  }, [selectedOrderId, selectedOrderLive]);
  useEffect(() => {
    if (!zaloPreviewOrderId) {
      zaloPreviewOrderSnapshotRef.current = null;
      return;
    }
    if (zaloPreviewOrderLive) {
      zaloPreviewOrderSnapshotRef.current = zaloPreviewOrderLive;
    }
  }, [zaloPreviewOrderId, zaloPreviewOrderLive]);
  const selectedOrder = selectedOrderLive
    || (selectedOrderSnapshotRef.current?.id === selectedOrderId ? selectedOrderSnapshotRef.current : null);
  const zaloPreviewOrder = zaloPreviewOrderLive
    || (zaloPreviewOrderSnapshotRef.current?.id === zaloPreviewOrderId ? zaloPreviewOrderSnapshotRef.current : null);

  useEffect(() => {
    if (selectedOrderId && !getLiveOrderViewModel(selectedOrderId) && selectedOrderSnapshotRef.current?.id !== selectedOrderId) {
      closeOrderDetail();
    }
    if (zaloPreviewOrderId && !getLiveOrderViewModel(zaloPreviewOrderId) && zaloPreviewOrderSnapshotRef.current?.id !== zaloPreviewOrderId) {
      setZaloPreviewOrderId('');
    }
  }, [selectedOrderId, zaloPreviewOrderId, getLiveOrderViewModel]);

  useEffect(() => {
    const paymentSource = getOrderPayosPaymentSource(selectedOrder);
    if (paymentSource) {
      warmLocalPaymentQrDataUrlCache(paymentSource, { width: 520 });
    }
    const qrUrl = buildPayosPaymentQrImageSource(paymentSource);
    if (qrUrl) {
      warmPaymentQrImageDataUrlCache(qrUrl, { timeoutMs: PAYMENT_QR_IMAGE_FETCH_TIMEOUT_MS });
    }
  }, [
    selectedOrder?.id,
    selectedOrder?.paymentProvider,
    selectedOrder?.sepayQrCode,
    selectedOrder?.paymentQrImageUrl,
    selectedOrder?.paymentQrUrl,
    selectedOrder?.paymentQrPayload,
    selectedOrder?.qrCode,
    selectedOrder?.checkoutUrl,
    selectedOrder?.paymentCheckoutUrl,
    selectedOrder?.payosQrCode
  ]);

  useEffect(() => {
    if (!canSharePaymentQr || !selectedOrder?.id) return;
    scheduleOrderShareWarmup({
      order: selectedOrder,
      company: currentCompany,
      customers,
      orders,
      payments,
      products,
      ensurePayment: onEnsureOrderPayosPayment,
      reason: 'order_detail_opened_or_refreshed'
    });
  }, [
    canSharePaymentQr,
    currentCompany,
    customers,
    orders,
    payments,
    products,
    selectedOrder?.id,
    selectedOrder?.updatedAt,
    selectedOrder?.paymentLookupSyncedAt
  ]);

  useEffect(() => {
    if (!zaloPreviewOrder) {
      setZaloPreviewDraft('');
      setZaloPreviewSaveStatus('');
      return;
    }
    setZaloPreviewDraft(getOrderZaloMessageDraft(zaloPreviewOrder));
    setZaloPreviewSaveStatus('');
  }, [zaloPreviewOrderId]);
  
  const subTotal = newOrder.items.reduce(
    (sum, item) => sum + getTransactionBillingPresentation(item).amount,
    0
  );
  const discountAmount = parseFloat(newOrder.discount) || 0;
  const extraExpense = parseFloat(newOrder.extraExpenseAmount) || 0;
  
  let customerExtraExpense = 0;
  let sellerExtraExpense = 0;
  
  if (newOrder.extraExpensePayer === 'buyer') {
    customerExtraExpense = extraExpense;
  } else if (newOrder.extraExpensePayer === 'shared') {
    customerExtraExpense = extraExpense / 2;
    sellerExtraExpense = extraExpense / 2;
  } else if (newOrder.extraExpensePayer === 'seller') {
    sellerExtraExpense = extraExpense;
  }

  const totalAmount = Math.max(0, subTotal - discountAmount + customerExtraExpense);

  const openOrderDetail = (orderId) => {
    const orderSnapshot = getLiveOrderViewModel(orderId) || activeOrders.find(order => order.id === orderId) || null;
    if (orderSnapshot) {
      selectedOrderSnapshotRef.current = normalizeOrderPaymentSnapshot(orderSnapshot);
    }
    setSelectedOrderId(orderId);
    setOrderShareStatus('');
    setPayosSyncStatus('');
  };

  const closeOrderDetail = () => {
    setSelectedOrderId(null);
    selectedOrderSnapshotRef.current = null;
    setOrderShareStatus('');
    setPayosSyncStatus('');
    setSyncingPayosOrderId('');
    setFeeEditorOrderId('');
    setReturnEditorOrderId('');
    setReturnDraft({ pieces: '', weightKg: '', reason: '', status: 'pending_pickup', discountAmount: '' });
    setReturnEditorError('');
    setOrderItemEditor({ orderId: '', itemIndex: -1, quantity: '', unitPrice: '' });
    setOrderPaymentDraft({ open: false, orderId: '', amount: '', method: 'Chuyển khoản', date: getTodayString(), isSaving: false, error: '' });
    setZaloPreviewOrderId('');
    zaloPreviewOrderSnapshotRef.current = null;
  };

  const isOrderDraft = (order) => (order?.reviewStatus || 'draft') === 'draft';
  const canEditDraftOrder = (order) => {
    if (!order || !isOrderDraft(order)) return false;
    const empId = employee?.id || '';
    if (!empId) return false;
    return [order.createdByEmpId, order.empId, order.salesEmpId].filter(Boolean).includes(empId);
  };
  const canEditOrderRecord = (order) => Boolean(canEditOrder || canEditDraftOrder(order));
  const canEditOrderItemRecord = (order) => Boolean(canEditOrderQuantityPrice || canEditDraftOrder(order));

  const buildEditableOrderPayload = (order, patch = {}) => {
    const items = Array.isArray(patch.items) ? patch.items : (Array.isArray(order?.items) ? order.items : []);
    const itemSubtotal = items.reduce(
      (sum, item) => sum + getTransactionBillingPresentation(item).amount,
      0
    );
    const nextDiscount = Object.prototype.hasOwnProperty.call(patch, 'discount')
      ? parseLooseMoneyValue(patch.discount)
      : parseLooseMoneyValue(order?.discount);
    const nextCustomerExtraExpense = Object.prototype.hasOwnProperty.call(patch, 'customerExtraExpense')
      ? parseLooseMoneyValue(patch.customerExtraExpense)
      : parseLooseMoneyValue(order?.customerExtraExpense);
    const isEditingCustomerFee = Object.prototype.hasOwnProperty.call(patch, 'customerExtraExpense');
    const nextExtraExpenseName = Object.prototype.hasOwnProperty.call(patch, 'extraExpenseName')
      ? capitalizeFirst(patch.extraExpenseName || '')
      : (order.extraExpenseName || '');
    const nextExtraExpenseAmount = Object.prototype.hasOwnProperty.call(patch, 'extraExpenseAmount')
      ? parseLooseMoneyValue(patch.extraExpenseAmount)
      : parseLooseMoneyValue(order.extraExpenseAmount ?? order.customerExtraExpense);
    const nextExtraExpensePayer = Object.prototype.hasOwnProperty.call(patch, 'extraExpensePayer')
      ? (patch.extraExpensePayer || 'buyer')
      : (order.extraExpensePayer || 'buyer');
    const nextSellerExtraExpense = Object.prototype.hasOwnProperty.call(patch, 'sellerExtraExpense')
      ? parseLooseMoneyValue(patch.sellerExtraExpense)
      : (isEditingCustomerFee ? 0 : parseLooseMoneyValue(order.sellerExtraExpense));

    return {
      customerId: order.customerId,
      branchId: patch.branchId ?? order.branchId ?? order.customerBranchId ?? '',
      branchName: patch.branchName ?? order.branchName ?? order.customerBranchName ?? '',
      branchAddress: patch.branchAddress ?? order.branchAddress ?? order.customerBranchAddress ?? '',
      customerBranchId: patch.customerBranchId ?? patch.branchId ?? order.customerBranchId ?? order.branchId ?? '',
      customerBranchName: patch.customerBranchName ?? patch.branchName ?? order.customerBranchName ?? order.branchName ?? '',
      customerBranchAddress: patch.customerBranchAddress ?? patch.branchAddress ?? order.customerBranchAddress ?? order.branchAddress ?? '',
      salesEmpId: order.salesEmpId || getOrderSalesEmpId(order, customers) || '',
      items,
      discount: nextDiscount,
      extraExpenseName: nextCustomerExtraExpense > 0 || nextSellerExtraExpense > 0 || nextExtraExpenseAmount > 0
        ? (nextExtraExpenseName || 'Phụ phí')
        : '',
      extraExpenseAmount: nextExtraExpenseAmount,
      extraExpensePayer: nextExtraExpensePayer,
      customerExtraExpense: nextCustomerExtraExpense,
      sellerExtraExpense: nextSellerExtraExpense,
      amount: Math.max(0, itemSubtotal - nextDiscount + nextCustomerExtraExpense),
      date: order.date || getTodayString(),
      note: order.note || '',
      sourceType: order.sourceType || '',
      sourceDispatchIds: Array.isArray(order.sourceDispatchIds) ? order.sourceDispatchIds : [],
      sourceDispatchDate: order.sourceDispatchDate || '',
      reviewStatus: order.reviewStatus || 'draft',
      reviewStatusLabel: order.reviewStatusLabel || ((order.reviewStatus || 'draft') === 'draft' ? 'Chờ kiểm tra' : ''),
      zaloSendStatus: order.zaloSendStatus || 'not_queued',
      zaloSendQueueId: order.zaloSendQueueId || '',
      zaloQueuedAt: order.zaloQueuedAt || '',
      zaloSentAt: order.zaloSentAt || ''
    };
  };

  const commitOrderEdit = async (order, payload, collectedPaymentData = null) => {
    const key = JSON.stringify([order.id, payload, collectedPaymentData]);
    if (orderEditInFlightRef.current) {
      if (orderEditInFlightRef.current.key === key) return orderEditInFlightRef.current.promise;
      throw new Error('Đang lưu thay đổi trước đó. Vui lòng chờ xác nhận.');
    }
    setOrderSaving(true);
    const promise = Promise.resolve().then(async () => {
      const result = await onEditOrder(order.id, payload, collectedPaymentData);
      if (!result?.success) throw new Error(result?.message || 'Không lưu được thay đổi hóa đơn.');
      if (result.order) selectedOrderSnapshotRef.current = normalizeOrderPaymentSnapshot(result.order);
      return result;
    }).finally(() => {
      orderEditInFlightRef.current = null;
      setOrderSaving(false);
    });
    orderEditInFlightRef.current = { key, promise };
    return promise;
  };

  const promptEditOrderMoney = async (order, field) => {
    if (!order || !onEditOrder || !canEditOrderRecord(order)) return;
    const paymentToEdit = (order.paymentHistory || []).find(payment => payment.sourceOrderId === order.id || payment.matchedOrderId === order.id) || (order.paymentHistory || [])[0];
    const config = {
      discount: {
        label: 'giảm giá',
        current: order.discount || 0,
        patch: (value) => ({ discount: value })
      },
      fee: {
        label: 'phụ phí khách chịu',
        current: order.customerExtraExpense || 0,
        patch: (value) => ({ customerExtraExpense: value })
      },
      paid: {
        label: 'số tiền đã thu',
        current: order.appliedAmount || 0
      }
    }[field];

    if (!config) return;
    const rawValue = window.prompt(`Nhập lại ${config.label}`, formatCurrency(config.current || 0));
    if (rawValue === null) return;
    const nextValue = parseInputCurrency(rawValue);
    const basePayload = buildEditableOrderPayload(order, field === 'discount' || field === 'fee' ? config.patch(nextValue) : {});

    try {
      let result;
      if (field === 'paid') {
        result = await commitOrderEdit(order, basePayload, {
          amount: nextValue,
          method: paymentToEdit?.method || 'Chuyển khoản',
          note: paymentToEdit?.note || `Khách thanh toán - ${formatOrderCode(order.id)}`,
          existingPaymentId: paymentToEdit?.id,
          existingSourceType: paymentToEdit?.sourceType || 'order_upfront'
        });
      } else {
        result = await commitOrderEdit(order, basePayload);
      }
      setOrderShareStatus(result.queued ? 'Đã lưu tạm thay đổi hóa đơn, đang đồng bộ.' : `Đã cập nhật ${config.label}.`);
    } catch (error) {
      setOrderShareStatus(getFriendlyFirebaseErrorMessage(error, `Không thể cập nhật ${config.label}.`));
    }
  };

  const openOrderPaymentModal = (order) => {
    if (!order || !onAddPayment || !canRecordOrderPayment) return;
    const dueAmount = Math.max(0, parseLooseMoneyValue(order.outstandingAmount ?? order.amount));
    setOrderPaymentDraft({
      open: true,
      clientMutationId: `p_${crypto.randomUUID()}`,
      orderId: order.id,
      amount: dueAmount > 0 ? formatCurrency(dueAmount) : '',
      method: 'Chuyển khoản',
      date: getTodayString(),
      isSaving: false,
      error: ''
    });
    setOrderShareStatus('');
  };

  const closeOrderPaymentModal = () => {
    setOrderPaymentDraft({ open: false, orderId: '', amount: '', method: 'Chuyển khoản', date: getTodayString(), isSaving: false, error: '' });
  };

  const submitOrderPayment = async (event) => {
    event.preventDefault();
    if (orderPaymentDraft.isSaving) return;
    const order = getLiveOrderViewModel(orderPaymentDraft.orderId) || selectedOrder;
    const amount = parseInputCurrency(orderPaymentDraft.amount);

    if (!order || !onAddPayment || !canRecordOrderPayment) {
      setOrderPaymentDraft(prev => ({ ...prev, error: 'Tài khoản này chưa có quyền thu tiền đơn hàng.' }));
      return;
    }
    if (amount <= 0) {
      setOrderPaymentDraft(prev => ({ ...prev, error: 'Vui lòng nhập số tiền thu lớn hơn 0.' }));
      return;
    }

    const orderCode = formatOrderCode(order.id);
    setOrderPaymentDraft(prev => ({ ...prev, isSaving: true, error: '' }));

    try {
      const paymentResult = await onAddPayment({
        clientMutationId: orderPaymentDraft.clientMutationId,
        customerId: order.customerId,
        amount,
        method: orderPaymentDraft.method,
        date: orderPaymentDraft.date || getTodayString(),
        note: `Thu tiền hóa đơn ${orderCode}`,
        bankContent: `TT ${orderCode}`,
        referenceCode: orderCode,
        matchedOrderId: order.id,
        matchedOrderCode: orderCode,
        sourceOrderId: order.id,
        sourceType: 'order_direct_payment',
        sourceLabel: orderPaymentDraft.method === 'Tiền mặt' ? 'Thu tiền mặt tại đơn hàng' : 'Khách chuyển khoản tại đơn hàng',
        collectorEmpId: employee?.id || '',
        collectorName: employee?.name || ''
      });
      closeOrderPaymentModal();
      setOrderShareStatus(paymentResult?.queued ? 'Đã lưu khoản thu trên thiết bị, đang chờ máy chủ xác nhận.' : `Đã ghi nhận thu ${formatCurrency(amount)} đ cho ${orderCode}.`);
    } catch (error) {
      setOrderPaymentDraft(prev => ({
        ...prev,
        isSaving: false,
        error: getFriendlyFirebaseErrorMessage(error, 'Không thể ghi nhận khoản thu. Vui lòng thử lại.')
      }));
    }
  };

  const openOrderFeeEditor = (order) => {
    if (!order || !canEditOrderRecord(order)) return;
    setFeeEditorOrderId(order.id);
    setFeeDraft({
      name: order.extraExpenseName || 'Vận chuyển',
      amount: order.extraExpenseAmount ?? order.customerExtraExpense ?? '',
      payer: order.extraExpensePayer || 'buyer'
    });
    setOrderShareStatus('');
  };

  const closeOrderFeeEditor = () => {
    setFeeEditorOrderId('');
    setFeeDraft({ name: '', amount: '', payer: 'buyer' });
  };

  const saveOrderFeeEditor = async (order, overrideAmount = null) => {
    if (!order || !onEditOrder || !canEditOrderRecord(order)) return;
    const feeAmount = overrideAmount === null ? parseLooseMoneyValue(feeDraft.amount) : parseLooseMoneyValue(overrideAmount);
    const payer = feeDraft.payer || 'buyer';
    const customerFee = payer === 'buyer' ? feeAmount : payer === 'shared' ? feeAmount / 2 : 0;
    const sellerFee = payer === 'seller' ? feeAmount : payer === 'shared' ? feeAmount / 2 : 0;

    try {
      const result = await commitOrderEdit(order, buildEditableOrderPayload(order, {
        extraExpenseName: feeAmount > 0 ? capitalizeFirst(feeDraft.name || 'Phụ phí') : '',
        extraExpenseAmount: feeAmount,
        extraExpensePayer: payer,
        customerExtraExpense: customerFee,
        sellerExtraExpense: sellerFee
      }));
      setOrderShareStatus(result.queued ? 'Đã lưu tạm phụ phí, đang đồng bộ.' : feeAmount > 0 ? 'Đã cập nhật phụ phí.' : 'Đã xóa phụ phí khỏi đơn.');
      closeOrderFeeEditor();
    } catch (error) {
      setOrderShareStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể cập nhật phụ phí.'));
    }
  };

  const createReturnGoodsRecordId = () => `return_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const openOrderReturnEditor = (order) => {
    if (!order || !canEditOrderRecord(order)) return;
    setReturnEditorOrderId(order.id);
    setReturnDraft({ pieces: '', weightKg: '', reason: '', status: 'pending_pickup', discountAmount: '' });
    setReturnEditorError('');
    setOrderShareStatus('');
  };

  const closeOrderReturnEditor = () => {
    setReturnEditorOrderId('');
    setReturnDraft({ pieces: '', weightKg: '', reason: '', status: 'pending_pickup', discountAmount: '' });
    setReturnEditorError('');
  };

  const saveOrderReturnEditor = async (order) => {
    if (!order || !onEditOrder || !canEditOrderRecord(order)) return;
    const pieces = parseLooseQuantityValue(returnDraft.pieces);
    const weightKg = parseLooseQuantityValue(returnDraft.weightKg);
    const reason = capitalizeFirst(returnDraft.reason || '');
    const status = returnDraft.status || 'pending_pickup';
    const discountAmount = status === 'discounted_sale' ? parseLooseMoneyValue(returnDraft.discountAmount) : 0;

    if (pieces <= 0 && weightKg <= 0) {
      setReturnEditorError('Vui lòng nhập số con hoặc số kg khách trả.');
      return;
    }
    if (!reason.trim()) {
      setReturnEditorError('Vui lòng nhập lý do trả hàng.');
      return;
    }
    if (status === 'discounted_sale' && discountAmount <= 0) {
      setReturnEditorError('Vui lòng nhập số tiền giảm giá nếu bán luôn cho khách.');
      return;
    }

    const nowIso = new Date().toISOString();
    const nextRecord = {
      id: createReturnGoodsRecordId(),
      pieces,
      weightKg,
      reason,
      status,
      statusLabel: RETURN_GOODS_STATUS_LABELS[status] || RETURN_GOODS_STATUS_LABELS.pending_pickup,
      isRetrievedToWarehouse: status === 'retrieved',
      pendingPickup: status === 'pending_pickup',
      discountedSale: status === 'discounted_sale',
      discountAmount,
      productSummary: getOrderReturnProductSummary(order),
      orderId: order.id,
      orderCode: formatOrderCode(order.id),
      customerId: order.customerId || order.customer?.id || '',
      customerName: order.customer?.name || order.customerNameSnapshot || '',
      createdAt: nowIso,
      createdByEmpId: employee?.id || '',
      createdByName: employee?.name || ''
    };
    const nextReturnGoods = [...getOrderReturnGoodsRecords(order), nextRecord];
    const returnSummary = summarizeOrderReturnGoods({ returnGoods: nextReturnGoods });
    const nextDiscount = parseLooseMoneyValue(order.discount) + discountAmount;

    try {
      const result = await commitOrderEdit(order, {
        ...buildEditableOrderPayload(order, discountAmount > 0 ? { discount: nextDiscount } : {}),
        returnGoods: nextReturnGoods,
        returnGoodsUpdatedAt: nowIso,
        returnDiscountAmount: returnSummary.discountAmount,
        returnPendingPickupPieces: returnSummary.pendingPieces,
        returnPendingPickupWeightKg: returnSummary.pendingWeightKg,
        reviewStatus: order.reviewStatus === 'approved' ? 'need_review' : (order.reviewStatus || 'draft'),
        reviewStatusLabel: status === 'pending_pickup'
          ? 'Có hàng trả chưa lấy về kho'
          : status === 'discounted_sale'
            ? 'Đã giảm giá hàng trả'
            : 'Đã ghi nhận hàng trả'
      });
      setOrderShareStatus(result.queued ? 'Đã lưu tạm thông tin trả hàng, đang đồng bộ.' : status === 'pending_pickup'
        ? 'Đã ghi nhận hàng trả chưa lấy về kho. Khách hàng sẽ có cảnh báo để nhân viên lấy lại.'
        : status === 'discounted_sale'
          ? 'Đã ghi nhận hàng trả và giảm giá bán luôn cho khách.'
          : 'Đã ghi nhận hàng trả đã lấy về kho.');
      closeOrderReturnEditor();
    } catch (error) {
      setReturnEditorError(getFriendlyFirebaseErrorMessage(error, 'Không thể lưu thông tin trả hàng.'));
    }
  };

  const openOrderItemEditor = (order, itemIndex) => {
    if (!order || !canEditOrderItemRecord(order)) return;
    const currentItems = Array.isArray(order.items) ? order.items : [];
    const targetItem = currentItems[itemIndex];
    if (!targetItem) return;
    const billing = getOrderItemBillingPresentation(targetItem);
    setOrderItemEditor({
      orderId: order.id,
      itemIndex,
      quantity: `${billing.billingQuantity || ''}`,
      unitPrice: billing.unitPrice > 0
        ? formatCurrency(billing.unitPrice)
        : ''
    });
    setOrderShareStatus('');
  };

  const closeOrderItemEditor = () => {
    setOrderItemEditor({ orderId: '', itemIndex: -1, quantity: '', unitPrice: '' });
  };

  const saveOrderItemEditor = async (order) => {
    if (!order || !onEditOrder || !canEditOrderItemRecord(order)) return;
    const currentItems = Array.isArray(order.items) ? order.items : [];
    const targetItem = currentItems[orderItemEditor.itemIndex];
    if (!targetItem) return;

    const currentBilling = getOrderItemBillingPresentation(targetItem);
    const currentQuantity = currentBilling.billingQuantity;
    const currentUnitPrice = currentBilling.unitPrice;
    const quantityInput = `${orderItemEditor.quantity ?? ''}`.trim();
    const unitPriceInput = `${orderItemEditor.unitPrice ?? ''}`.trim();
    const nextQuantity = quantityInput === '' ? currentQuantity : parseLooseQuantityValue(quantityInput);
    const nextUnitPrice = unitPriceInput === '' ? currentUnitPrice : parseInputCurrency(unitPriceInput);
    if (nextQuantity < 0 || Number.isNaN(nextQuantity)) {
      setOrderShareStatus('Số lượng không hợp lệ.');
      return;
    }
    if (nextUnitPrice < 0 || Number.isNaN(nextUnitPrice)) {
      setOrderShareStatus('Đơn giá không hợp lệ.');
      return;
    }

    const nextItems = currentItems.map((item, index) => index === orderItemEditor.itemIndex
      ? updateTransactionBillingItem(item, { billingQuantity: nextQuantity, unitPrice: nextUnitPrice })
      : item);

    try {
      const result = await commitOrderEdit(order, buildEditableOrderPayload(order, { items: nextItems }));
      const quantityChanged = nextQuantity !== currentQuantity;
      const priceChanged = nextUnitPrice !== currentUnitPrice;
      setOrderShareStatus(result.queued ? 'Đã lưu tạm thay đổi hóa đơn, đang đồng bộ.' : quantityChanged && priceChanged
        ? 'Đã cập nhật số lượng và đơn giá.'
        : quantityChanged
          ? 'Đã cập nhật số lượng.'
          : priceChanged
            ? 'Đã cập nhật đơn giá.'
            : 'Không có thay đổi mới.'
      );
      closeOrderItemEditor();
    } catch (error) {
      setOrderShareStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể cập nhật số lượng và đơn giá.'));
    }
  };

  const promptEditOrderItem = async (order, itemIndex, field) => {
    if (!order || !onEditOrder || !canEditOrderItemRecord(order)) return;
    const currentItems = Array.isArray(order.items) ? order.items : [];
    const targetItem = currentItems[itemIndex];
    if (!targetItem) return;

    const currentBilling = getOrderItemBillingPresentation(targetItem);
    const isQuantity = field === 'quantity';
    const currentValue = isQuantity ? currentBilling.billingQuantity : currentBilling.unitPrice;
    const rawValue = window.prompt(
      isQuantity ? 'Nhập lại số lượng' : 'Nhập lại đơn giá',
      isQuantity ? `${currentValue || ''}` : formatCurrency(currentValue || 0)
    );
    if (rawValue === null) return;

    const nextValue = isQuantity
      ? parseLooseQuantityValue(rawValue)
      : parseInputCurrency(rawValue);
    if (nextValue < 0 || Number.isNaN(nextValue)) {
      setOrderShareStatus(isQuantity ? 'Số lượng không hợp lệ.' : 'Đơn giá không hợp lệ.');
      return;
    }

    const nextItems = currentItems.map((item, index) => index === itemIndex
      ? updateTransactionBillingItem(item, {
        billingQuantity: isQuantity ? nextValue : currentBilling.billingQuantity,
        unitPrice: isQuantity ? currentBilling.unitPrice : nextValue,
      })
      : item);

    try {
      const result = await commitOrderEdit(order, buildEditableOrderPayload(order, { items: nextItems }));
      setOrderShareStatus(result.queued ? 'Đã lưu tạm thay đổi hóa đơn, đang đồng bộ.' : isQuantity ? 'Đã cập nhật số lượng.' : 'Đã cập nhật đơn giá.');
    } catch (error) {
      setOrderShareStatus(getFriendlyFirebaseErrorMessage(error, isQuantity ? 'Không thể cập nhật số lượng.' : 'Không thể cập nhật đơn giá.'));
    }
  };

  const findOrderItemIndexForDeliveryIssue = (order, issue) => {
    const currentItems = Array.isArray(order?.items) ? order.items : [];
    if (!currentItems.length || !issue) return -1;
    if (issue.productId) {
      const byProductId = currentItems.findIndex(item => item.productId === issue.productId);
      if (byProductId >= 0) return byProductId;
    }

    const issueProductName = normalizeLookupText(issue.productName || '');
    if (!issueProductName) return -1;
    return currentItems.findIndex((item) => {
      const product = item.productId ? activeProducts.find(activeProduct => activeProduct.id === item.productId) : null;
      const itemName = normalizeLookupText(item.description || product?.name || '');
      return itemName === issueProductName || itemName.includes(issueProductName) || issueProductName.includes(itemName);
    });
  };

  const buildOrderPatchFromDeliveryIssue = (order, issue) => {
    const currentItems = Array.isArray(order?.items) ? order.items : [];
    const targetIndex = findOrderItemIndexForDeliveryIssue(order, issue);
    const targetItem = currentItems[targetIndex];
    if (!targetItem) return null;

    const nextQuantity = parseLooseQuantityValue(issue.actualWeight);
    if (nextQuantity < 0 || Number.isNaN(nextQuantity)) return null;
    const unitPrice = parseLooseMoneyValue(targetItem.unitPrice);
    const expectedQuantity = parseLooseQuantityValue(issue.expectedWeight || targetItem.quantity);
    const lostQuantity = Math.max(0, expectedQuantity - nextQuantity);
    const nextItems = currentItems.map((item, index) => (
      index === targetIndex ? { ...item, quantity: nextQuantity } : item
    ));

    return {
      item: targetItem,
      nextQuantity,
      unitPrice,
      lostQuantity,
      lostAmount: Math.max(0, lostQuantity * unitPrice),
      orderData: buildEditableOrderPayload(order, { items: nextItems })
    };
  };

  const handleResolveDeliveryIssue = async (order, issue, action) => {
    if (!order || !issue?.reportId || !onResolveDeliveryReportIssue) return;
    if (!canResolveDeliveryIssues) {
      setOrderShareStatus('Tài khoản này chưa được phân quyền xử lý cảnh báo lệch cân.');
      return;
    }

    try {
      if (action === 'rejected') {
        const result = await onResolveDeliveryReportIssue({
          reportId: issue.reportId,
          action: 'rejected',
          orderId: order.id,
          note: 'Từ chối cảnh báo, giữ nguyên dữ liệu đơn đã lên.'
        });
        if (result?.success === false) throw new Error(result.message);
        setOrderShareStatus(result?.queued ? 'Đã lưu tạm xử lý cảnh báo, đang đồng bộ. Đơn hàng giữ nguyên.' : 'Đã từ chối cảnh báo. Đơn hàng giữ nguyên dữ liệu đã lên.');
        return;
      }

      const issuePatch = buildOrderPatchFromDeliveryIssue(order, issue);
      if (!issuePatch) {
        setOrderShareStatus('Không tìm thấy dòng hàng tương ứng trong đơn để cập nhật.');
        return;
      }

      if (action === 'lost_charged') {
        if (!canChargeLostDeliveryGoods) {
          setOrderShareStatus('Tài khoản này chưa được phân quyền trừ lương khi mất hàng.');
          return;
        }
        if (issue.diff >= 0) {
          setOrderShareStatus('Cảnh báo này không phải thiếu hàng nên không tạo khoản trừ lương.');
          return;
        }
        const responsibleEmp = employees.find(emp => emp.id === (issue.empId || issue.createdByEmpId));
        const defaultPenalty = Math.round(issuePatch.lostAmount || 0);
        if (defaultPenalty <= 0) {
          setOrderShareStatus('Chưa tính được số tiền trừ lương vì đơn hàng chưa có đơn giá hợp lệ.');
          return;
        }
        const result = await onResolveDeliveryReportIssue({
          reportId: issue.reportId,
          action: 'lost_charged',
          orderId: order.id,
          orderData: issuePatch.orderData,
          note: `Chấp nhận thiếu hàng, cập nhật đơn theo thực tế ${formatNumber(issuePatch.nextQuantity)} kg.`,
          penaltyData: {
            empId: issue.empId || issue.createdByEmpId || employee?.id || '',
            amount: defaultPenalty,
            date: resolveEntityDateKey(order, getTodayString()),
            reason: `Mất hàng ${issue.productName || 'hàng hóa'} - ${formatOrderCode(order.id)} - ${responsibleEmp?.name || 'Nhân viên'}`
          }
        });
        if (result?.success === false) throw new Error(result.message);
        setOrderShareStatus(result?.queued ? `Đã lưu tạm cập nhật đơn và khoản trừ lương ${formatCurrency(defaultPenalty)} đ, đang đồng bộ.` : `Đã cập nhật đơn theo thực tế và ghi khoản trừ lương ${formatCurrency(defaultPenalty)} đ.`);
        return;
      }

      const result = await onResolveDeliveryReportIssue({
        reportId: issue.reportId,
        action: 'accepted',
        orderId: order.id,
        orderData: issuePatch.orderData,
        note: `Chấp nhận cảnh báo, cập nhật đơn theo thực tế ${formatNumber(issuePatch.nextQuantity)} kg.`
      });
      if (result?.success === false) throw new Error(result.message);
      setOrderShareStatus(result?.queued ? 'Đã lưu tạm xử lý cảnh báo và cập nhật đơn, đang đồng bộ.' : 'Đã chấp nhận cảnh báo và cập nhật đơn hàng theo số lượng thực tế.');
    } catch (error) {
      setOrderShareStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể xử lý cảnh báo lệch cân.'));
    }
  };

  const getOrderStatusMeta = (order) => {
    if ((order?.outstandingAmount || 0) > 0) {
      return {
        label: 'Còn nợ',
        chipClasses: 'bg-amber-50 text-amber-700',
        amountClasses: 'text-orange-600'
      };
    }

    return {
      label: 'Đã thanh toán',
      chipClasses: 'bg-emerald-50 text-emerald-700',
      amountClasses: 'text-emerald-600'
    };
  };

  const getOrderReviewMeta = (order) => {
    const reviewStatus = order?.reviewStatus || 'draft';
    if (reviewStatus === 'approved_for_zalo') {
      return { label: 'Đã duyệt Zalo', chipClasses: 'bg-blue-50 text-blue-700' };
    }
    if (reviewStatus === 'confirmed') {
      return { label: 'Đã xác nhận', chipClasses: 'bg-emerald-50 text-emerald-700' };
    }
    if (reviewStatus === 'need_review') {
      return { label: 'Cần kiểm tra', chipClasses: 'bg-rose-50 text-rose-700' };
    }
    if (reviewStatus === 'completed') {
      return { label: 'Hoàn tất', chipClasses: 'bg-emerald-50 text-emerald-700' };
    }
    return { label: 'Chờ kiểm tra', chipClasses: 'bg-amber-50 text-amber-700' };
  };

  const getOrderZaloSendMeta = (order) => {
    const sendStatus = order?.zaloSendStatus || 'not_queued';
    if (sendStatus === 'sent') return { label: 'Đã gửi Zalo', chipClasses: 'bg-emerald-50 text-emerald-700', locked: true };
    if (sendStatus === 'sending') return { label: 'Đang gửi Zalo', chipClasses: 'bg-amber-50 text-amber-700', locked: true };
    if (sendStatus === 'queued' || sendStatus === 'pending') return { label: 'Chờ gửi Zalo', chipClasses: 'bg-blue-50 text-blue-700', locked: false, wakeable: true };
    if (sendStatus === 'failed') return { label: 'Gửi lỗi', chipClasses: 'bg-rose-50 text-rose-700', locked: false };
    if (sendStatus === 'cancelled') return { label: 'Đã hủy gửi', chipClasses: 'bg-slate-100 text-slate-500', locked: false };
    return { label: 'Chưa duyệt gửi', chipClasses: 'bg-slate-50 text-slate-600', locked: false };
  };

  const getOrderItemBillingPresentation = (item = {}) => {
    return getTransactionBillingPresentation(item);
  };

  const formatOrderItemBillingLine = (item = {}, index = 0) => {
    const billing = getOrderItemBillingPresentation(item);
    const actualLabel = `${formatNumber(billing.actualQuantity)}${billing.actualUnit ? ` ${billing.actualUnit}` : ''}`;
    const billingLabel = `${formatNumber(billing.billingQuantity)}${billing.billingUnit ? ` ${billing.billingUnit}` : ''}`;
    const quantityLabel = isSameBillingUnit(billing.actualUnit, billing.billingUnit)
      && billing.actualQuantity === billing.billingQuantity
      ? billingLabel
      : `${actualLabel} • tính tiền ${billingLabel}`;
    return `${index + 1}. ${item.description || item.productName || item.productNameSnapshot || 'Sản phẩm'}: ${quantityLabel} x ${formatCurrency(billing.unitPrice)} đ = ${formatCurrency(billing.amount)} đ`;
  };

  const buildOrderZaloMessageLegacy = (order) => {
    if (!order) return '';
    const customer = order.customer || customers.find(c => c.id === order.customerId) || {};
    const honorific = customer.customerHonorific ? `${customer.customerHonorific} ` : '';
    const itemLines = (order.items || []).map(formatOrderItemBillingLine);
    const lines = [
      `Kính gửi: ${honorific}${customer.name || 'quý khách'}`,
      `${currentCompany?.name || 'HD Manager'}`,
      `Đơn hàng: ${formatOrderCode(order.id)} - ${formatDateTimeLabel(order.date)}`,
      '',
      ...itemLines,
      '',
      `Tổng đơn: ${formatCurrency(order.amount || 0)} đ`,
      `Đã thu: ${formatCurrency(order.appliedAmount || 0)} đ`,
      `Còn phải thu: ${formatCurrency(order.outstandingAmount || 0)} đ`,
      '',
      'Nếu cần đặt hàng hoặc điều chỉnh thông tin, Quý khách vui lòng phản hồi lại tin nhắn này.',
      `Liên hệ: ${order.salesOwner?.name || employee?.name || 'Nhân viên phụ trách'}`
    ];
    return lines.join('\n');
  };

  const buildOrderZaloMessage = (order) => {
    if (!order) return '';
    const customer = order.customer || customers.find(c => c.id === order.customerId) || {};
    const orderCode = formatOrderCode(order.id);
    const ledger = customer?.id ? buildCustomerLedger(customer, orders, payments) : null;
    const ledgerOrder = ledger?.orders?.find(item => item.id === order.id) || null;
    const orderAmount = parseLooseMoneyValue(ledgerOrder?.amount ?? order.amount);
    const storedPaidAmount = Math.max(
      parseLooseMoneyValue(order.appliedAmount),
      parseLooseMoneyValue(order.paidAmount),
      parseLooseMoneyValue(order.collectedAmount)
    );
    const paidAmount = Math.max(
      parseLooseMoneyValue(ledgerOrder?.appliedAmount),
      storedPaidAmount
    );
    const outstandingAmount = Math.max(0, ledgerOrder
      ? parseLooseMoneyValue(ledgerOrder.outstandingAmount)
      : parseLooseMoneyValue(order.outstandingAmount ?? (orderAmount - paidAmount)));
    const currentCustomerDebt = ledger ? Math.max(0, parseLooseMoneyValue(ledger.currentDebt)) : outstandingAmount;
    const oldDebt = Math.max(0, currentCustomerDebt - outstandingAmount);
    const totalToPay = Math.max(0, outstandingAmount + oldDebt);
    const itemLines = (order.items || []).map(formatOrderItemBillingLine);
    const lines = [
      `Kính gửi: ${customer.name || 'Quý khách'}`,
      `Mã đơn hàng: ${orderCode}`,
      `Ngày: ${formatDateLabel(order.date)}`,
      ...itemLines,
      `Tổng tiền: ${formatCurrency(orderAmount)} đ`,
      ...(paidAmount > 0 ? [`Đã thu: ${formatCurrency(paidAmount)} đ`] : []),
      `Còn nợ đơn này: ${formatCurrency(outstandingAmount)} đ`,
      `Nợ cũ: ${formatCurrency(oldDebt)} đ`,
      `Số tiền cần thanh toán: ${formatCurrency(totalToPay)} đ`,
      `Nội dung chuyển khoản: ${buildOrderTransferMemo(order) || `TT ${orderCode}`}`,
      'Vui lòng quét mã QR SePay được gửi kèm bên dưới để app tự đối soát công nợ.'
    ].filter(line => line !== null && line !== undefined);
    return lines.join('\n');
  };

  const getOrderZaloMessageDraft = (order) => {
    const customMessage = `${order?.zaloMessageText || ''}`.trim();
    return customMessage || buildOrderZaloMessage(order);
  };

  const openZaloPreview = (order) => {
    if (!order) return;
    setZaloPreviewOrderId(order.id);
    setZaloPreviewDraft(getOrderZaloMessageDraft(order));
    setZaloPreviewSaveStatus('');
  };

  const saveZaloPreviewDraft = async (order, messageText = zaloPreviewDraft) => {
    if (!order || !onUpdateOrderZaloMessage) return { success: false, message: 'Chưa có hàm lưu mẫu tin Zalo.' };
    const cleanMessage = `${messageText || ''}`.trim();
    if (!cleanMessage) return { success: false, message: 'Nội dung tin Zalo không được để trống.' };
    const result = await onUpdateOrderZaloMessage(order.id, cleanMessage);
    setZaloPreviewSaveStatus(result?.success === false ? (result.message || 'Không lưu được mẫu tin Zalo.') : 'Đã lưu mẫu tin Zalo cho hóa đơn này.');
    return result;
  };

  const approveOrderZaloSend = async (order, overrideMessage = '') => {
    if (!order || !onApproveOrderZaloSend || isApprovingZaloSend) return;
    setIsApprovingZaloSend(true);
    setOrderShareStatus('');
    try {
      const message = `${overrideMessage || getOrderZaloMessageDraft(order)}`.trim();
      if (!message) {
        setOrderShareStatus('Nội dung tin Zalo không được để trống.');
        return;
      }
      if (overrideMessage && onUpdateOrderZaloMessage) {
        await onUpdateOrderZaloMessage(order.id, message);
      }
      const result = await onApproveOrderZaloSend(order.id, message);
      if (result?.success === false) {
        setOrderShareStatus(result.message || 'Không thể duyệt gửi Zalo.');
        return;
      }
      setOrderShareStatus(result?.sentNow
        ? 'Đã duyệt và gửi Zalo ngay trên máy PC này.'
        : (result?.message || 'Đã duyệt gửi Zalo và đưa đơn vào hàng đợi gửi.'));
      setZaloPreviewOrderId('');
    } catch (error) {
      setOrderShareStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể duyệt gửi Zalo.'));
    } finally {
      setIsApprovingZaloSend(false);
    }
  };

  const syncOrderPayosPayment = async (order) => {
    if (!order || !onSyncPayosPaymentStatus || syncingPayosOrderId) return;
    setSyncingPayosOrderId(order.id);
    setPayosSyncStatus('');
    try {
      const result = await onSyncPayosPaymentStatus(order.id);
      if (result?.success === false) {
        setPayosSyncStatus(result.message || 'Không kiểm tra được thanh toán SePay.');
        return;
      }
      if (result?.status === 'paid') {
        setPayosSyncStatus(`SePay đã thanh toán đủ. App đã ghi nhận ${formatCurrency(result.appliedAmount || result.amountSynced || 0)} đ và trừ công nợ.`);
        return;
      }
      if (result?.status === 'partial') {
        setPayosSyncStatus(`SePay đã thanh toán một phần. App đã ghi nhận ${formatCurrency(result.appliedAmount || result.amountSynced || 0)} đ, còn nợ ${formatCurrency(result.outstandingAmount || 0)} đ.`);
        return;
      }
      if (result?.status === 'already_synced') {
        setPayosSyncStatus('Giao dịch SePay này đã được app ghi nhận trước đó, không cộng trùng.');
        return;
      }
      if (result?.status === 'not_paid_yet') {
        setPayosSyncStatus('SePay chưa báo thanh toán cho hóa đơn này. Nếu khách vừa chuyển, chờ vài giây rồi kiểm tra lại.');
        return;
      }
      if (result?.status === 'need_reconciliation') {
        setPayosSyncStatus('SePay đã có giao dịch nhưng cần kế toán đối soát vì nội dung hoặc trạng thái chưa khớp hóa đơn.');
        return;
      }
      setPayosSyncStatus(result?.message || 'Đã kiểm tra trạng thái SePay.');
    } catch (error) {
      setPayosSyncStatus(getFriendlyFirebaseErrorMessage(error, 'Không kiểm tra được thanh toán SePay.'));
    } finally {
      setSyncingPayosOrderId('');
    }
  };

  const buildOrderShareText = (order) => {
    if (!order) return '';

    const itemLines = (order.items || []).map(formatOrderItemBillingLine);

    const textLines = [
      `HÓA ĐƠN ${formatOrderCode(order.id)}`,
      `Khách hàng: ${order.customer?.name || 'Khách lẻ'}`,
      `Ngày lập: ${formatDateTimeLabel(order.date)}`,
      `Nhân viên kinh doanh: ${order.salesOwner?.name || 'Chưa gán'}`,
      `Tạo bởi: ${order.createdBy?.name || 'Hệ thống'}`,
      '',
      'Danh sách hàng hóa:'
    ];

    if (itemLines.length > 0) textLines.push(...itemLines);
    else textLines.push('- Chưa có chi tiết sản phẩm');

    textLines.push(
      '',
      `Tổng tiền hàng: ${formatCurrency((order.items || []).reduce((sum, item) => sum + getOrderItemBillingPresentation(item).amount, 0))} đ`,
      `Giảm giá: ${formatCurrency(order.discount || 0)} đ`
    );

    if (order.customerExtraExpense > 0 || order.extraExpenseName) {
      textLines.push(`Phụ phí khách chịu${order.extraExpenseName ? ` (${order.extraExpenseName})` : ''}: ${formatCurrency(order.customerExtraExpense || 0)} đ`);
    }

    textLines.push(
      `Tổng hóa đơn: ${formatCurrency(order.amount || 0)} đ`,
      `Đã thu: ${formatCurrency(order.appliedAmount || 0)} đ`,
      `Còn nợ: ${formatCurrency(order.outstandingAmount || 0)} đ`
    );

    if ((order.paymentHistory || []).length > 0) {
      textLines.push('', 'Lịch sử thanh toán gắn với đơn:');
      order.paymentHistory.forEach((payment, index) => {
        textLines.push(`${index + 1}. ${formatDateLabel(getPaymentDateKey(payment) || payment.date)} - ${getPaymentMethodLabel(payment)} - ${formatCurrency(payment.allocatedToOrder || 0)} đ`);
      });
    }

    textLines.push('', 'Cảm ơn quý khách và hẹn gặp lại!');
    return textLines.join('\n');
  };

  const resolveShareStatusMessage = (result, channel) => {
    if (result.status === 'shared') {
      if (channel === 'native') return 'Đã mở bảng chia sẻ của máy. Bạn có thể chọn ứng dụng muốn gửi cho khách.';
      return `Đã mở bảng chia sẻ. Hãy chọn ${getShareChannelLabel(channel)} nếu máy đã cài ứng dụng đó.`;
    }
    if (result.status === 'copied') {
      if (channel === 'native') return 'Máy chưa hỗ trợ mở bảng chia sẻ trực tiếp. Nội dung đã được sao chép để bạn gửi thủ công.';
      return `Nội dung đã được sao chép. Bạn có thể dán vào ${getShareChannelLabel(channel)} để gửi cho khách.`;
    }
    if (result.status === 'cancelled') return 'Bạn đã đóng bảng chia sẻ.';
    if (result.error || result.shareError) return 'Không mở được bảng chia sẻ và chưa lưu được ảnh. Vui lòng kiểm tra bộ nhớ máy rồi thử lại.';
    return 'Thiết bị này chưa hỗ trợ chia sẻ trực tiếp. Bạn có thể dùng nút sao chép hoặc lưu file.';
  };

  const handleShareOrder = async (channel = 'native') => {
    if (orderShareInProgressRef.current) return;
    if (orderSaving) {
      setOrderShareStatus('Hóa đơn đang được lưu. Vui lòng chia sẻ sau khi hoàn tất.');
      return;
    }
    if (!canSharePaymentQr) {
      setOrderShareStatus('Bạn chưa được cấp quyền chia sẻ hóa đơn QR.');
      return;
    }
    if (!selectedOrder) return;
    orderShareInProgressRef.current = true;
    setIsSharingOrder(true);
    const shareAssetStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const title = `${formatOrderCode(selectedOrder.id)} - ${selectedOrder.customer?.name || 'Hóa đơn'}`;
    const shareSpan = createPerformanceSpan('share_invoice.total', {
      orderId: selectedOrder.id,
      channel
    });
    const readSpan = createPerformanceSpan('share_invoice.read_data', {
      orderId: selectedOrder.id,
      source: 'in_memory_cache'
    });
    let readSpanClosed = false;
    try {
      const cachedAsset = getCachedOrderShareAsset(selectedOrder, currentCompany, {
        customers,
        orders,
        payments,
        products
      });
      readSpan.end({ status: cachedAsset ? 'cache_hit' : 'cache_miss' });
      readSpanClosed = true;
      let asset = cachedAsset;
      if (!asset) {
        setOrderShareStatus('Đang chuẩn bị ảnh hóa đơn lần đầu...');
        asset = await warmOrderShareAssetCache({
          order: selectedOrder,
          company: currentCompany,
          customers,
          orders,
          payments,
          products,
          ensurePayment: onEnsureOrderPayosPayment,
          reason: 'share_click_cache_miss'
        });
      } else {
        recordPerformanceEvent('share_invoice.cache_ready', {
          orderId: selectedOrder.id,
          reason: 'share_click_cache_hit'
        });
      }
      if (!asset?.blob) {
        throw new Error('Chưa chuẩn bị được ảnh hóa đơn. Vui lòng thử lại sau vài giây.');
      }
      const shareAssetReadyMs = Math.max(0, (typeof performance !== 'undefined' ? performance.now() : Date.now()) - shareAssetStartedAt);
      debugShareImageCache(`sales invoice share asset ready ${Math.round(shareAssetReadyMs)}ms`, {
        orderId: selectedOrder.id,
        readyMs: Math.round(shareAssetReadyMs * 100) / 100,
        bytes: Number(asset.blob?.size || 0),
        source: cachedAsset ? 'memory' : 'persistent_or_rendered'
      });
      const shareApiSpan = createPerformanceSpan('share_invoice.native_share', {
        orderId: selectedOrder.id,
        channel,
        cacheHit: Boolean(cachedAsset)
      });
      let result;
      try {
        result = await shareBlobFile({
          filename: buildSalesOrderShareFilename(selectedOrder),
          blob: asset.blob,
          preparedNativeFile: asset.nativeFile,
          title,
          text: `Hóa đơn ${formatOrderCode(selectedOrder.id)}`,
          dialogTitle: channel === 'native' ? 'Chia sẻ hóa đơn' : `Chia sẻ qua ${getShareChannelLabel(channel)}`
        });
        shareApiSpan.end({ status: result?.status || 'unknown' });
      } catch (error) {
        shareApiSpan.fail(error);
        throw error;
      }
      if (result.status === 'downloaded' || result.status === 'saved') {
        setOrderShareStatus(result.shareError
          ? 'Không mở được bảng chia sẻ; ảnh hóa đơn đã được lưu vào máy để gửi thủ công.'
          : 'Ảnh hóa đơn đã được lưu/tải xuống. Hãy chọn ứng dụng nhận để gửi thủ công.');
        shareSpan.end({ status: result.status, cacheHit: Boolean(cachedAsset) });
        return;
      }
      setOrderShareStatus(resolveShareStatusMessage(result, channel));
      shareSpan.end({ status: result?.status || 'unknown', cacheHit: Boolean(cachedAsset) });
    } catch (error) {
      if (!readSpanClosed) readSpan.fail(error);
      shareSpan.fail(error);
      setOrderShareStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể tạo ảnh hóa đơn.'));
    } finally {
      orderShareInProgressRef.current = false;
      setIsSharingOrder(false);
    }
  };

  const handleAddItem = () => setNewOrder({...newOrder, items: [...newOrder.items, createEmptyOrderItem()]});
  const handleRemoveItem = (index) => {
    const newItems = [...newOrder.items]; newItems.splice(index, 1);
    setNewOrder({...newOrder, items: newItems});
  };
  const handleItemChange = (index, field, value) => {
    const newItems = [...newOrder.items];
    newItems[index][field] = value;
    setNewOrder({...newOrder, items: newItems});
  };
  const handleItemProductChange = (index, prodId) => {
    const prod = activeProducts.find(p => p.id === prodId);
    const newItems = [...newOrder.items]; 
    if(prod) {
      newItems[index].productId = prod.id;
      newItems[index].description = prod.name;
      newItems[index].unitPrice = prod.sellingPrice;
    } 
    else {
      newItems[index].productId = '';
      newItems[index].description = '';
      newItems[index].unitPrice = '';
    }
    setNewOrder({...newOrder, items: newItems});
  };

  const handleQuickAddCustomer = (e) => {
    e.preventDefault();
    const finalEmpId = isSales ? employee.id : newCus.empId;
    if (!finalEmpId) return setErrorMsg("Vui lòng chọn nhân viên phụ trách khách hàng này!");
    
    onAddCustomer(finalEmpId, { name: newCus.name, phone: newCus.phone, address: newCus.address, customerGroup: newCus.customerGroup });
    setSearchCus(newCus.name);
    setShowQuickAddCus(false);
    setNewCus({name:'', phone:'', address:'', customerGroup: '', empId: isSales ? employee?.id || '' : ''});
  };

  const normalizeOrderItemsForSubmit = (items = [], { allowDescriptionOnly = false } = {}) => {
    return items
      .map((item) => {
        const matchedProduct = item.productId ? activeProducts.find((product) => product.id === item.productId) : null;
        const description = capitalizeFirst(`${item.description || matchedProduct?.name || ''}`.trim());
        const quantity = parseLooseQuantityValue(item.quantity);
        const unitPrice = parseLooseMoneyValue(item.unitPrice);
        return {
          ...item,
          productId: item.productId || '',
          description,
          quantity,
          unitPrice
        };
      })
      .filter((item) => {
        const hasIdentity = allowDescriptionOnly ? Boolean(item.productId || item.description) : Boolean(item.productId);
        return hasIdentity && item.quantity > 0 && item.unitPrice > 0;
      });
  };

  const resolveCustomerForOrderDraft = async (draft) => {
    const typedCustomerName = capitalizeFirst(`${draft.customerName || ''}`.trim());
    const selectedCustomer = draft.customerId ? customers.find((customer) => customer.id === draft.customerId) : null;
    if (selectedCustomer) {
      return { customerId: selectedCustomer.id, customer: selectedCustomer };
    }

    const matchedCustomer = typedCustomerName
      ? findBestEntityMatch(typedCustomerName, customers, (customer) => customer.name)
      : null;
    if (matchedCustomer) {
      return { customerId: matchedCustomer.id, customer: matchedCustomer };
    }

    if (!typedCustomerName) {
      throw new Error('Vui lòng nhập tên khách hàng cho đơn nháp này.');
    }

    const salesEmpId = draft.salesEmpId || getDefaultSalesEmpId();
    if (!salesEmpId) {
      throw new Error(`Khách "${typedCustomerName}" chưa có nhân viên kinh doanh phụ trách. Bạn hãy chọn NVKD trước khi tạo đơn.`);
    }

    const createdCustomerId = await onAddCustomer(salesEmpId, {
      name: typedCustomerName,
      phone: '',
      address: '',
      customerGroup: ''
    });

    if (!createdCustomerId) {
      throw new Error(`Không thể tạo khách hàng "${typedCustomerName}" trên hệ thống.`);
    }

    return {
      customerId: createdCustomerId,
      customer: {
        id: createdCustomerId,
        name: typedCustomerName,
        empId: salesEmpId
      }
    };
  };

  const submitOrderDraft = async (draft, { allowDescriptionOnly = false } = {}) => {
    const isWarehouseDispatchDraft = draft.sourceType === 'warehouse_dispatch' || getWarehouseDispatchIds(draft).length > 0;
    const orderDate = resolveOrderCreationDateKey({
      sourceType: isWarehouseDispatchDraft ? 'warehouse_dispatch' : draft.sourceType,
      draftDate: draft.date,
      creationDate: getTodayString(),
    });
    const preparedItems = isWarehouseDispatchDraft
      ? prepareWarehouseDispatchOrderItems(draft.items)
      : draft.items;
    const validItems = normalizeOrderItemsForSubmit(preparedItems, { allowDescriptionOnly });
    if (validItems.length === 0) {
      throw new Error(allowDescriptionOnly
        ? 'Mỗi đơn nháp cần ít nhất 1 dòng hàng có tên/mặt hàng, số lượng và đơn giá.'
        : 'Vui lòng nhập ít nhất 1 sản phẩm hợp lệ.');
    }

    const { customerId, customer } = await resolveCustomerForOrderDraft(draft);
    const empId = employee?.id || 'admin';
    const salesEmpId = customer?.empId || draft.salesEmpId || (isSales ? employee?.id : null);
    if (!salesEmpId) {
      throw new Error('Khách hàng này chưa có nhân viên kinh doanh phụ trách.');
    }

    const discount = parseLooseMoneyValue(draft.discount);
    const extraExpenseAmount = parseLooseMoneyValue(draft.extraExpenseAmount);
    let customerDraftExpense = 0;
    let sellerDraftExpense = 0;

    if (draft.extraExpensePayer === 'buyer') {
      customerDraftExpense = extraExpenseAmount;
    } else if (draft.extraExpensePayer === 'shared') {
      customerDraftExpense = extraExpenseAmount / 2;
      sellerDraftExpense = extraExpenseAmount / 2;
    } else if (draft.extraExpensePayer === 'seller') {
      sellerDraftExpense = extraExpenseAmount;
    }

    const orderSubtotal = validItems.reduce((sum, item) => sum + getOrderItemBillingPresentation(item).amount, 0);
    const orderTotal = Math.max(0, orderSubtotal - discount + customerDraftExpense);

    const orderId = await onAddOrder(empId, {
      customerId,
      branchId: draft.branchId || draft.customerBranchId || '',
      branchName: draft.branchName || draft.customerBranchName || '',
      branchAddress: draft.branchAddress || draft.customerBranchAddress || '',
      customerBranchId: draft.customerBranchId || draft.branchId || '',
      customerBranchName: draft.customerBranchName || draft.branchName || '',
      customerBranchAddress: draft.customerBranchAddress || draft.branchAddress || '',
      salesEmpId,
      items: validItems,
      discount,
      extraExpenseName: capitalizeFirst(draft.extraExpenseName || ''),
      extraExpenseAmount,
      extraExpensePayer: draft.extraExpensePayer || 'buyer',
      customerExtraExpense: customerDraftExpense,
      sellerExtraExpense: sellerDraftExpense,
      amount: orderTotal,
      date: orderDate,
      note: capitalizeFirst(draft.note || ''),
      sourceType: isWarehouseDispatchDraft ? 'warehouse_dispatch' : (draft.sourceType || ''),
      sourceDispatchIds: Array.isArray(draft.sourceDispatchIds) ? draft.sourceDispatchIds : [],
      sourceDispatchDate: draft.sourceDispatchDate || '',
      reviewStatus: 'draft',
      reviewStatusLabel: 'Chờ kiểm tra',
      zaloSendStatus: 'not_queued'
    }, { upfrontPayment: parseLooseMoneyValue(draft.upfrontPayment), paymentMethod: draft.paymentMethod });

    return { customerId, salesEmpId, amount: orderTotal, orderId, postSaveWarnings: [] };
  };

  const isOrderSaveTimeoutError = (error) => {
    if (error?.code === 'firestore/sync-pending' || error?.code === 'HD_TIMEOUT') return true;
    if (isTimeoutLikeError(error)) return true;
    const message = `${error?.message || error || ''}`.toLowerCase();
    return message.includes('quá thời gian')
      || message.includes('qua thoi gian')
      || message.includes('timeout');
  };

  const handleAddBulkDraft = () => {
    if (!canUseManualOrderSource && bulkOrderSource !== 'notebook_image') {
      setBulkOrderStatus('Bạn chưa được cấp quyền thêm đơn nháp thủ công.');
      return;
    }
    setBulkOrderStatus('');
    setBulkOrderDrafts((prev) => [...prev, createBulkOrderDraft()]);
  };

  const handleLoadWarehouseDispatchDrafts = () => {
    if (!canUseWarehouseOrderSource) {
      setBulkOrderStatus('Bạn chưa được cấp quyền lấy đơn từ phiếu xuất kho.');
      return;
    }
    setErrorMsg('');
    if (pendingWarehouseDispatches.length === 0) {
      setBulkOrderStatus(todayWarehouseDispatches.length > 0
        ? `Toàn bộ phiếu xuất kho ngày ${formatDateLabel(dispatchDate)} đã được lấy lên đơn trước đó. Nếu cần sửa, hãy chỉnh trực tiếp trong danh sách đơn hàng.`
        : `Ngày ${formatDateLabel(dispatchDate)} chưa có phiếu xuất kho nào để lấy lên đơn.`);
      return;
    }

    if (bulkOrderDrafts.length > 0 && !window.confirm(`Thao tác này sẽ thay danh sách đơn nháp hiện tại bằng dữ liệu phiếu xuất kho ngày ${formatDateLabel(dispatchDate)}. Bạn có muốn tiếp tục không?`)) {
      return;
    }

    const customerLookup = new Map(customers.map(customer => [customer.id, customer]));
    const productLookup = new Map(activeProducts.map(product => [product.id, product]));
    const activeOrderRequests = (orderRequests || []).filter(request => !request?.isArchived);
    const orderRequestsByCustomerId = new Map();
    const orderRequestsByCustomerName = new Map();
    activeOrderRequests.forEach((request) => {
      const requestCustomer = customerLookup.get(request.customerId);
      const requestCustomerName = normalizeLookupText(
        request.customerNameSnapshot || request.customerName || requestCustomer?.name || ''
      );
      if (request.customerId) {
        const customerRequests = orderRequestsByCustomerId.get(request.customerId) || [];
        customerRequests.push(request);
        orderRequestsByCustomerId.set(request.customerId, customerRequests);
      }
      if (requestCustomerName) {
        const namedCustomerRequests = orderRequestsByCustomerName.get(requestCustomerName) || [];
        namedCustomerRequests.push(request);
        orderRequestsByCustomerName.set(requestCustomerName, namedCustomerRequests);
      }
    });
    const orderRequestDepositByCustomer = activeOrderRequests
      .filter(request => resolveEntityDateKey(request, dispatchDate) === dispatchDate)
      .reduce((depositMap, request) => {
        const deposit = parseLooseMoneyValue(request.upfrontPayment ?? request.depositAmount ?? request.prepaidAmount);
        if (deposit <= 0) return depositMap;
        const customer = customerLookup.get(request.customerId);
        const customerName = request.customerNameSnapshot || request.customerName || customer?.name || '';
        const requestItems = Array.isArray(request.items) && request.items.length > 0
          ? request.items
          : (request.primaryItem ? [request.primaryItem] : []);
        const firstRequestItem = requestItems[0] || {};
        const branchId = `${request.branchId || request.customerBranchId || firstRequestItem.branchId || firstRequestItem.customerBranchId || ''}`.trim();
        const branchName = `${request.branchName || request.customerBranchName || firstRequestItem.branchName || firstRequestItem.customerBranchName || ''}`.trim();
        const customerBaseKey = request.customerId || normalizeLookupText(customerName);
        const branchKey = branchId || normalizeLookupText(branchName) || 'main';
        const key = customerBaseKey ? `${customerBaseKey}__${branchKey}` : '';
        if (!key) return depositMap;
        depositMap.set(key, (depositMap.get(key) || 0) + deposit);
        return depositMap;
      }, new Map());
    const findOrderRequestPricingForDispatch = (dispatch = {}, customer = null, product = null, productName = '', customerName = '') => {
      const dispatchCustomerId = dispatch.customerId || customer?.id || '';
      const dispatchProductId = dispatch.productId || product?.id || '';
      const dispatchBranchId = `${dispatch.branchId || dispatch.customerBranchId || ''}`.trim();
      const dispatchBranchName = normalizeLookupText(dispatch.branchName || dispatch.customerBranchName || '');
      const normalizedCustomerName = normalizeLookupText(customerName || dispatch.customerNameSnapshot || customer?.name || '');
      const productNameCandidates = [
        productName,
        dispatch.productNameSnapshot,
        dispatch.productShortName,
        dispatch.productShortNameSnapshot,
        product?.name,
        getProductShortName(product)
      ].filter(Boolean);
      const normalizedProductNames = new Set(productNameCandidates.map(normalizeLookupText).filter(Boolean));
      const collapsedProductNames = new Set(productNameCandidates.map(collapseLookupText).filter(Boolean));
      const dispatchQuantityForMatch = parseLooseQuantityValue(dispatch.quantity ?? dispatch.pieceCount ?? dispatch.quantityCount);
      const dispatchWeightForMatch = parseLooseQuantityValue(dispatch.weightKg ?? dispatch.totalKg ?? dispatch.kg ?? dispatch.actualWeightKg ?? dispatch.weight);
      const dispatchSizeKey = normalizeLookupText(dispatch.size || dispatch.sizeLabel || dispatch.productSize || dispatch.variantSize || '');
      const dispatchUnitKey = normalizeLookupText(dispatch.quantityUnit || dispatch.unit || product?.unit || '');
      const dispatchSourceUnitPrice = parseLooseMoneyValue(
        dispatch.sourceOrderRequestUnitPrice
        ?? dispatch.orderRequestUnitPrice
        ?? dispatch.requestUnitPrice
        ?? dispatch.orderedUnitPrice
        ?? dispatch.customerOrderUnitPrice
      );
      const dispatchSourcePricingUnit = normalizeProductPricingUnit(
        dispatch.sourceOrderRequestPricingUnit
        || dispatch.orderRequestPricingUnit
        || dispatch.requestPricingUnit
        || dispatch.sourcePricingUnit
        || ''
      );
      const sourceRequestDate = dispatch.sourceOrderRequestDate
        || dispatch.orderRequestDate
        || dispatch.requestDate
        || dispatch.requestDateKey
        || dispatchDate;
      const sourceRequestId = `${dispatch.sourceOrderRequestId || dispatch.orderRequestId || ''}`.trim();
      const sourceRequestRowKey = `${dispatch.sourceOrderRequestRowKey || dispatch.orderRequestRowKey || dispatch.requestRowKey || ''}`.trim();
      const candidateRequests = [...new Set([
        ...(orderRequestsByCustomerId.get(dispatchCustomerId) || []),
        ...(orderRequestsByCustomerName.get(normalizedCustomerName) || []),
      ])];
      const matchedPriceCandidates = [];

      for (const request of candidateRequests) {
        const requestDate = resolveEntityDateKey(request, dispatchDate);
        const requestTimestamp = getEntityTimestamp(request)
          || new Date(`${requestDate || dispatchDate}T00:00:00.000`).getTime();
        const isExactSourceRequest = Boolean(sourceRequestId && request.id === sourceRequestId);
        const requestCustomer = customerLookup.get(request.customerId);
        const requestCustomerName = request.customerNameSnapshot || request.customerName || requestCustomer?.name || '';
        const requestCustomerMatches = Boolean(
          (dispatchCustomerId && request.customerId === dispatchCustomerId)
          || (normalizedCustomerName && normalizeLookupText(requestCustomerName) === normalizedCustomerName)
        );
        if (!requestCustomerMatches) continue;

        const requestItems = Array.isArray(request.items) && request.items.length > 0
          ? request.items
          : (request.primaryItem ? [request.primaryItem] : []);
        const requestBranchId = `${request.branchId || request.customerBranchId || ''}`.trim();
        const requestBranchName = normalizeLookupText(request.branchName || request.customerBranchName || '');
        for (const [itemIndex, item] of requestItems.entries()) {
          const itemRowKey = `${item?.rowKey || item?.id || item?.lineId || item?.itemId || ''}`.trim();
          const legacyProductRowKey = `${request.id || 'request'}_${item?.productId || itemIndex}`;
          const compositeRowKey = `${request.id || 'request'}_${itemRowKey || item?.productId || itemIndex}`;
          const itemBranchId = `${item?.branchId || item?.customerBranchId || requestBranchId || ''}`.trim();
          const itemBranchName = normalizeLookupText(item?.branchName || item?.customerBranchName || requestBranchName || '');
          const branchMatches = Boolean(
            (!dispatchBranchId && !dispatchBranchName)
            || (dispatchBranchId && itemBranchId === dispatchBranchId)
            || (dispatchBranchName && itemBranchName === dispatchBranchName)
          );
          if (!branchMatches) continue;
          const requestProduct = item?.productId ? productLookup.get(item.productId) : null;
          const requestProductName = item?.productName
            || item?.productNameSnapshot
            || item?.description
            || requestProduct?.name
            || '';
          const requestProductShortName = getProductShortName(requestProduct) || item?.productShortName || item?.productShortNameSnapshot || '';
          const requestProductCandidates = [requestProductName, requestProductShortName].filter(Boolean);
          const requestProductMatches = Boolean(
            (dispatchProductId && item?.productId === dispatchProductId)
            || requestProductCandidates.some(name => normalizedProductNames.has(normalizeLookupText(name)) || collapsedProductNames.has(collapseLookupText(name)))
          );
          if (!requestProductMatches) continue;

          const requestUnitPrice = getOrderLineUnitPriceValue(item);
          if (requestUnitPrice > 0) {
            const requestBillingSnapshot = resolveTransactionBillingSnapshot({ record: item, product: requestProduct || product });
            const itemQuantity = getOrderLineQuantityValue(item);
            const itemWeightKg = getOrderLineWeightKgValue(item);
            const itemSizeKey = normalizeLookupText(getOrderLineSizeLabel(item));
            const itemUnitKey = normalizeLookupText(item?.quantityUnit || item?.unit || product?.unit || '');
            matchedPriceCandidates.push({
              price: requestUnitPrice,
              billingUnit: requestBillingSnapshot.billingUnit || normalizeProductPricingUnit(
                item?.billingUnit || item?.pricingUnit || item?.defaultUnit || item?.quantityUnit || item?.unit || ''
              ),
              requestTimestamp: requestTimestamp || 0,
              exactRequest: isExactSourceRequest ? 1 : 0,
              exactRow: sourceRequestRowKey && [itemRowKey, compositeRowKey, legacyProductRowKey].includes(sourceRequestRowKey) ? 1 : 0,
              sameSourceDate: sourceRequestDate && requestDate === sourceRequestDate ? 1 : 0,
              exactProductId: dispatchProductId && item?.productId === dispatchProductId ? 1 : 0,
              quantityMatch: dispatchQuantityForMatch > 0 && areLooseQuantityValuesClose(dispatchQuantityForMatch, itemQuantity, 0.001) ? 1 : 0,
              weightMatch: dispatchWeightForMatch > 0 && areLooseQuantityValuesClose(dispatchWeightForMatch, itemWeightKg) ? 1 : 0,
              sizeMatch: dispatchSizeKey && itemSizeKey && dispatchSizeKey === itemSizeKey ? 1 : 0,
              unitMatch: dispatchUnitKey && itemUnitKey && dispatchUnitKey === itemUnitKey ? 1 : 0
            });
          }
        }
      }

      const latestMatchingPrice = selectWarehouseDispatchOrderPriceCandidate(matchedPriceCandidates);
      return latestMatchingPrice || {
        price: dispatchSourceUnitPrice || 0,
        billingUnit: dispatchSourcePricingUnit,
      };
    };
    const groupedDrafts = pendingWarehouseDispatches.reduce((groupMap, dispatch) => {
      const customer = customerLookup.get(dispatch.customerId);
      const customerName = dispatch.customerNameSnapshot || customer?.name || 'Khách hàng';
      const branchId = `${dispatch.branchId || dispatch.customerBranchId || ''}`.trim();
      const branchName = `${dispatch.branchName || dispatch.customerBranchName || ''}`.trim();
      const branchAddress = `${dispatch.branchAddress || dispatch.customerBranchAddress || ''}`.trim();
      const customerBaseKey = dispatch.customerId || normalizeLookupText(customerName);
      const branchKey = branchId || normalizeLookupText(branchName) || 'main';
      const customerKey = customerBaseKey ? `${customerBaseKey}__${branchKey}` : '';
      if (!groupMap.has(customerKey)) {
        groupMap.set(customerKey, {
          customer,
          customerName,
          branchId,
          branchName,
          branchAddress,
          dispatchIds: [],
          upfrontPayment: orderRequestDepositByCustomer.get(customerKey) || 0,
          items: []
        });
      }

      const group = groupMap.get(customerKey);
      const product = productLookup.get(dispatch.productId);
      const productName = dispatch.productNameSnapshot || product?.name || 'Hàng hóa';
      const customerProductConfig = resolveCustomerProductBillingConfiguration(
        getCustomerBranchProductConfigSource(customer, branchId, activeProducts),
        product,
        {
          configurationId: dispatch.configurationId || '',
          sizeLabel: dispatch.sizeLabel || dispatch.size || '',
          attributeLabel: dispatch.attributeLabel || dispatch.productAttribute || '',
        }
      );
      const orderRequestPricing = findOrderRequestPricingForDispatch(dispatch, customer, product, productName, customerName);
      const resolvedDispatchBilling = buildWarehouseDispatchOrderBillingSnapshot({
        dispatch,
        product,
        configuration: customerProductConfig,
        sourceUnitPrice: orderRequestPricing.price,
        sourcePricingUnit: orderRequestPricing.billingUnit,
      });
      const billingUnit = resolvedDispatchBilling.billingUnit;
      const actualUnit = resolvedDispatchBilling.actualUnit;
      const unitPrice = resolvedDispatchBilling.unitPrice;
      const actualQuantity = resolvedDispatchBilling.actualQuantity;
      const actualWeightKg = resolvedDispatchBilling.actualWeightKg;
      const billingQuantity = resolvedDispatchBilling.billingQuantity;
      const amount = resolvedDispatchBilling.amount;
      group.dispatchIds.push(dispatch.id);
      group.items.push({
        ...resolvedDispatchBilling,
        productId: product?.id || dispatch.productId || '',
        description: product?.name || productName,
        productName: product?.name || productName,
        productNameSnapshot: productName,
        configurationId: resolvedDispatchBilling.configurationId || dispatch.configurationId || '',
        sizeLabel: dispatch.sizeLabel || dispatch.size || '',
        attributeLabel: dispatch.attributeLabel || dispatch.productAttribute || '',
        actualQuantity,
        actualUnit,
        actualWeightKg,
        billingQuantity,
        billingUnit,
        unitPrice,
        amount,
        quantity: actualQuantity,
        quantityCount: actualQuantity,
        quantityUnit: actualUnit,
        weightKg: actualWeightKg,
        pricingQuantity: billingQuantity,
        pricingUnit: billingUnit,
        pricingAmount: amount,
        lineTotal: amount,
        billingSnapshotVersion: 1,
        billingSnapshotSource: resolvedDispatchBilling.billingSnapshotSource || 'warehouse_dispatch_order_snapshot',
        sourceDispatchIds: [dispatch.id]
      });
      return groupMap;
    }, new Map());

    const mappedDrafts = Array.from(groupedDrafts.values()).map((group, index) => createBulkOrderDraft({
      localId: `bulk_dispatch_${Date.now()}_${index}`,
      customerId: group.customer?.id || '',
      customerName: group.customer?.name || group.customerName,
      branchId: group.branchId || '',
      branchName: group.branchName || '',
      branchAddress: group.branchAddress || '',
      customerBranchId: group.branchId || '',
      customerBranchName: group.branchName || '',
      customerBranchAddress: group.branchAddress || '',
      salesEmpId: group.customer?.empId || getDefaultSalesEmpId(),
      date: getTodayString(),
      note: 'Lấy từ phiếu xuất kho',
      upfrontPayment: group.upfrontPayment > 0 ? group.upfrontPayment : '',
      paymentMethod: 'Chuyển khoản',
      sourceType: 'warehouse_dispatch',
      sourceDispatchIds: group.dispatchIds,
      sourceDispatchDate: dispatchDate,
      items: mergeWarehouseDispatchOrderBillingItems(group.items).map(item => ({
        ...item,
        actualQuantity: item.actualQuantity > 0 ? Number(item.actualQuantity.toFixed(2)) : 0,
        actualWeightKg: item.actualWeightKg > 0 ? Number(item.actualWeightKg.toFixed(2)) : 0,
        billingQuantity: item.billingQuantity > 0 ? Number(item.billingQuantity.toFixed(2)) : 0,
        quantity: item.actualQuantity > 0 ? Number(item.actualQuantity.toFixed(2)) : '',
        quantityCount: item.actualQuantity > 0 ? Number(item.actualQuantity.toFixed(2)) : 0,
        weightKg: item.actualWeightKg > 0 ? Number(item.actualWeightKg.toFixed(2)) : 0,
        pricingQuantity: item.billingQuantity > 0 ? Number(item.billingQuantity.toFixed(2)) : 0,
        amount: Math.round(item.amount),
        pricingAmount: Math.round(item.amount),
        lineTotal: Math.round(item.amount),
        unitPrice: item.unitPrice || ''
      }))
    }));

    const mergedLineCount = mappedDrafts.reduce((sum, draft) => sum + draft.items.length, 0);
    const consolidatedLineCount = Math.max(0, pendingWarehouseDispatches.length - mergedLineCount);
    setBulkOrderDrafts(mappedDrafts);
    setBulkOrderStatus(`Đã lấy ${pendingWarehouseDispatches.length} dòng phiếu xuất kho ngày ${formatDateLabel(dispatchDate)} thành ${mappedDrafts.length} đơn nháp.${consolidatedLineCount > 0 ? ` Đã gộp ${consolidatedLineCount} dòng sản phẩm trùng.` : ''}`);
  };

  const handleBulkDraftChange = (draftId, field, value) => {
    setBulkOrderDrafts((prev) => prev.map((draft) => draft.localId === draftId ? { ...draft, [field]: value } : draft));
  };

  const refreshBulkDraftItemBilling = (item = {}, patch = {}) => {
    const nextItem = { ...item, ...patch };
    const product = activeProducts.find(candidate => candidate.id === nextItem.productId) || null;
    const billingUnit = normalizeProductPricingUnit(
      nextItem.billingUnit || nextItem.pricingUnit || nextItem.defaultUnit || nextItem.quantityUnit || product?.unit || ''
    );
    const actualUnit = normalizeProductPricingUnit(
      nextItem.actualUnit || nextItem.actualQuantityUnit || nextItem.quantityUnit || product?.unit || billingUnit
    );
    const patchBillingQuantity = patch.billingQuantity ?? patch.pricingQuantity ?? patch.quantity;
    const billingQuantity = parseLooseQuantityValue(
      patchBillingQuantity ?? nextItem.billingQuantity ?? nextItem.pricingQuantity ?? nextItem.quantity
    );
    const actualQuantity = parseLooseQuantityValue(
      nextItem.actualQuantity ?? nextItem.quantityCount
    );
    const actualWeightKg = parseLooseQuantityValue(
      nextItem.actualWeightKg ?? nextItem.weightKg ?? nextItem.totalKg ?? nextItem.kg
    );
    const unitPrice = parseLooseMoneyValue(nextItem.unitPrice);
    const snapshot = buildCustomerProductBillingSnapshot({
      configuration: {
        productId: nextItem.productId || product?.id || '',
        productName: nextItem.productName || nextItem.productNameSnapshot || nextItem.description || product?.name || '',
        configurationId: nextItem.configurationId || '',
        billingUnit,
        pricingUnit: billingUnit,
        unitPrice,
        source: 'warehouse_dispatch_order_snapshot',
      },
      product,
      productId: nextItem.productId || product?.id || '',
      productName: nextItem.productName || nextItem.productNameSnapshot || nextItem.description || product?.name || '',
      sizeLabel: nextItem.sizeLabel || nextItem.size || '',
      attributeLabel: nextItem.attributeLabel || nextItem.productAttribute || '',
      actualQuantity,
      actualUnit,
      actualWeightKg,
      billingQuantity,
      billingUnit,
      unitPrice,
    });

    return {
      ...nextItem,
      ...snapshot,
      actualQuantity: snapshot.actualQuantity,
      actualWeightKg: snapshot.actualWeightKg,
      billingQuantity: snapshot.billingQuantity,
      quantity: snapshot.actualQuantity,
      quantityCount: snapshot.actualQuantity,
      quantityUnit: snapshot.actualUnit,
      pricingQuantity: snapshot.billingQuantity,
      pricingUnit: snapshot.billingUnit,
      amount: snapshot.amount,
      pricingAmount: snapshot.amount,
      lineTotal: snapshot.amount,
    };
  };

  const handleBulkDraftItemChange = (draftId, itemIndex, field, value) => {
    setBulkOrderDrafts((prev) => prev.map((draft) => {
      if (draft.localId !== draftId) return draft;
      const items = [...draft.items];
      items[itemIndex] = refreshBulkDraftItemBilling(items[itemIndex], { [field]: value });
      return { ...draft, items };
    }));
  };

  const normalizeBulkDraftDateValue = (rawValue) => {
    const raw = `${rawValue || ''}`.trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const matched = raw.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
    if (!matched) return '';

    const currentYear = parseDateInputValue(getTodayString()).getFullYear();
    const day = parseInt(matched[1], 10);
    const month = parseInt(matched[2], 10);
    const yearInput = matched[3] ? parseInt(matched[3], 10) : currentYear;
    const year = yearInput < 100 ? 2000 + yearInput : yearInput;
    const parsed = new Date(year, month - 1, day, 12, 0, 0);

    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.getDate() !== day ||
      parsed.getMonth() !== month - 1 ||
      parsed.getFullYear() !== year
    ) {
      return '';
    }

    return toDateInputString(parsed);
  };

  const promptEditBulkDraftItemQuantity = (draftId, itemIndex, currentValue) => {
    const rawValue = window.prompt('Nhập số lượng mới', currentValue === undefined || currentValue === null ? '' : `${currentValue}`);
    if (rawValue === null) return;
    const quantity = parseLooseQuantityValue(rawValue);
    if (quantity <= 0) {
      window.alert('Số lượng phải lớn hơn 0.');
      return;
    }
    handleBulkDraftItemChange(draftId, itemIndex, 'billingQuantity', Number(quantity.toFixed(2)));
  };

  const promptEditBulkDraftItemPrice = (draftId, itemIndex, currentValue) => {
    const rawValue = window.prompt('Nhập đơn giá mới', formatInputCurrency(currentValue));
    if (rawValue === null) return;
    const unitPrice = parseLooseMoneyValue(rawValue);
    if (unitPrice <= 0) {
      window.alert('Đơn giá phải lớn hơn 0.');
      return;
    }
    handleBulkDraftItemChange(draftId, itemIndex, 'unitPrice', unitPrice);
  };

  const promptEditBulkDraftDate = (draftId, currentValue) => {
    const rawValue = window.prompt('Nhập ngày đơn (ví dụ 13/05/2026)', formatCompactDateLabel(currentValue));
    if (rawValue === null) return;
    const dateValue = normalizeBulkDraftDateValue(rawValue);
    if (!dateValue) {
      window.alert('Ngày chưa đúng định dạng.');
      return;
    }
    handleBulkDraftChange(draftId, 'date', dateValue);
  };

  const openBulkDraftFeeEditor = (draft) => {
    if (!draft?.localId) return;
    setBulkFeeEditorDraftId(draft.localId);
    setBulkFeeDraft({
      name: draft.extraExpenseName || 'Vận chuyển',
      amount: draft.extraExpenseAmount || '',
      payer: draft.extraExpensePayer || 'buyer'
    });
  };

  const closeBulkDraftFeeEditor = () => {
    setBulkFeeEditorDraftId('');
    setBulkFeeDraft({ name: '', amount: '', payer: 'buyer' });
  };

  const saveBulkDraftFeeEditor = (overrideAmount = null) => {
    if (!bulkFeeEditorDraftId) return;
    const feeAmount = overrideAmount === null
      ? parseLooseMoneyValue(bulkFeeDraft.amount)
      : parseLooseMoneyValue(overrideAmount);
    if (feeAmount < 0) {
      setBulkOrderStatus('Số tiền phí không hợp lệ.');
      return;
    }
    const payer = bulkFeeDraft.payer || 'buyer';
    setBulkOrderDrafts((prev) => prev.map((draft) => draft.localId === bulkFeeEditorDraftId ? {
      ...draft,
      extraExpenseName: feeAmount > 0 ? capitalizeFirst(bulkFeeDraft.name || 'Phụ phí') : '',
      extraExpenseAmount: feeAmount,
      extraExpensePayer: payer
    } : draft));
    closeBulkDraftFeeEditor();
  };

  const buildOrderDuplicateSignature = (entry = {}) => {
    const customerKey = entry.customerId || normalizeLookupText(entry.customerName || entry.customer?.name || '');
    const branchKey = `${entry.branchId || entry.customerBranchId || ''}`.trim()
      || normalizeLookupText(entry.branchName || entry.customerBranchName || '');
    const dateKey = entry.date || getTodayString();
    const itemKey = (Array.isArray(entry.items) ? entry.items : [])
      .map((item) => {
        const product = item.productId ? activeProducts.find((activeProduct) => activeProduct.id === item.productId) : null;
        const productKey = item.productId || normalizeLookupText(item.description || product?.name || '');
        const quantity = parseLooseQuantityValue(item.quantity);
        const unitPrice = parseLooseMoneyValue(item.unitPrice);
        return `${productKey}:${quantity.toFixed(2)}:${Math.round(unitPrice)}`;
      })
      .filter(Boolean)
      .sort()
      .join('|');
    return customerKey && itemKey ? `${dateKey}__${customerKey}__${branchKey || 'main'}__${itemKey}` : '';
  };

  const findDuplicateBulkOrderDrafts = (drafts = []) => {
    const existingOrderSignatures = new Set(
      activeOrders
        .map((order) => buildOrderDuplicateSignature({
          customerId: order.customerId,
          customerName: order.customer?.name,
          branchId: order.branchId || order.customerBranchId || '',
          branchName: order.branchName || order.customerBranchName || '',
          date: resolveEntityDateKey(order, order.date || getTodayString()),
          items: order.items || []
        }))
        .filter(Boolean)
    );
    const seenDraftSignatures = new Map();
    const duplicateLabels = [];

    drafts.forEach((draft, index) => {
      const signature = buildOrderDuplicateSignature(draft);
      if (!signature) return;
      const label = `Đơn nháp ${index + 1}${draft.customerName ? ` - ${draft.customerName}` : ''}`;
      if (existingOrderSignatures.has(signature)) {
        duplicateLabels.push(label);
        return;
      }
      if (seenDraftSignatures.has(signature)) {
        duplicateLabels.push(label);
        return;
      }
      seenDraftSignatures.set(signature, draft.localId || index);
    });

    return duplicateLabels;
  };

  const handleBulkDraftItemProductChange = (draftId, itemIndex, productId) => {
    setBulkOrderDrafts((prev) => prev.map((draft) => {
      if (draft.localId !== draftId) return draft;
      const product = activeProducts.find((item) => item.id === productId);
      const items = [...draft.items];
      const customer = customers.find((candidate) => candidate.id === draft.customerId) || null;
      const configuration = product
        ? resolveCustomerProductBillingConfiguration(
          getCustomerBranchProductConfigSource(customer, draft.branchId || draft.customerBranchId || '', activeProducts),
          product
        )
        : null;
      const nextItem = product ? {
        ...items[itemIndex],
        productId: product.id,
        productName: product.name,
        productNameSnapshot: product.name,
        description: product.name,
        configurationId: configuration?.configurationId || '',
        billingUnit: configuration?.billingUnit || configuration?.pricingUnit || getProductPrimaryPricingUnit(product, 'Con'),
        pricingUnit: configuration?.pricingUnit || configuration?.billingUnit || getProductPrimaryPricingUnit(product, 'Con'),
        actualUnit: resolveCustomerProductActualUnit(configuration, product),
        unitPrice: configuration?.unitPrice || items[itemIndex].unitPrice || product.sellingPrice,
      } : {
        ...items[itemIndex],
        productId: ''
      };
      items[itemIndex] = refreshBulkDraftItemBilling(nextItem);
      return { ...draft, items };
    }));
  };

  const handleAddBulkDraftItem = (draftId) => {
    setBulkOrderDrafts((prev) => prev.map((draft) => draft.localId === draftId ? { ...draft, items: [...draft.items, createEmptyOrderItem()] } : draft));
  };

  const handleRemoveBulkDraftItem = (draftId, itemIndex) => {
    setBulkOrderDrafts((prev) => prev.map((draft) => {
      if (draft.localId !== draftId) return draft;
      const items = draft.items.filter((_, index) => index !== itemIndex);
      return { ...draft, items: items.length > 0 ? items : [createEmptyOrderItem()] };
    }));
  };

  const handleRemoveBulkDraft = (draftId) => {
    setBulkOrderDrafts((prev) => prev.filter((draft) => draft.localId !== draftId));
  };

  const handleNotebookImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBulkOrderStatus('');
    if (!GEMINI_PROXY_ENABLED) {
      setBulkOrderStatus('Chưa cấu hình Gemini API key cho tính năng này.');
      if (bulkOrderImageInputRef.current) bulkOrderImageInputRef.current.value = '';
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setBulkOrderStatus('Ảnh quá lớn. Bạn hãy chọn ảnh nhỏ hơn 8MB để AI xử lý ổn định.');
      if (bulkOrderImageInputRef.current) bulkOrderImageInputRef.current.value = '';
      return;
    }

    setIsBulkOrderScanning(true);
    try {
      const aiOrders = await requestNotebookOrderDraftsFromGemini(file);
      const mappedDrafts = aiOrders.map((rawOrder, draftIndex) => {
        const matchedCustomer = findBestEntityMatch(rawOrder?.customer_name, customers, (customer) => customer.name);
        const items = Array.isArray(rawOrder?.items) ? rawOrder.items.map((rawItem) => {
          const matchedProduct = findBestEntityMatch(rawItem?.description, activeProducts, (product) => product.name);
          const parsedQuantity = parseLooseQuantityValue(rawItem?.quantity_kg ?? rawItem?.quantity ?? rawItem?.qty);
          const parsedUnitPrice = parseLooseMoneyValue(rawItem?.unit_price_vnd ?? rawItem?.unit_price ?? rawItem?.price);
          return {
            productId: matchedProduct?.id || '',
            description: matchedProduct?.name || capitalizeFirst(rawItem?.description || ''),
            quantity: parsedQuantity > 0 ? parsedQuantity : '',
            unitPrice: parsedUnitPrice > 0 ? parsedUnitPrice : (matchedProduct?.sellingPrice || '')
          };
        }).filter((item) => item.description || item.productId) : [];

        return createBulkOrderDraft({
          localId: `bulk_ai_${Date.now()}_${draftIndex}`,
          customerId: matchedCustomer?.id || '',
          customerName: matchedCustomer?.name || capitalizeFirst(rawOrder?.customer_name || ''),
          salesEmpId: matchedCustomer?.empId || getDefaultSalesEmpId(),
          date: normalizeAiOrderDate(rawOrder?.date),
          note: capitalizeFirst(rawOrder?.note || ''),
          sourceType: 'notebook_image',
          items: items.length > 0 ? items : [createEmptyOrderItem()]
        });
      });

      setBulkOrderDrafts(mappedDrafts);
      setBulkOrderStatus(`AI đã tách ${mappedDrafts.length} đơn nháp từ ảnh ${file.name}. Bạn rà soát lại rồi bấm tạo hàng loạt.`);
    } catch (error) {
      setBulkOrderStatus(getFriendlyFirebaseErrorMessage(error, 'AI chưa đọc được ảnh sổ sách này. Bạn hãy thử lại.'));
    } finally {
      setIsBulkOrderScanning(false);
      if (bulkOrderImageInputRef.current) bulkOrderImageInputRef.current.value = '';
    }
  };

  const handleSubmitBulkOrders = async () => {
    if (isBulkOrderSubmitting || bulkOrderSubmittingRef.current) return;
    if (isWarehouseBulkReview && !canUseWarehouseOrderSource) {
      setBulkOrderStatus('Bạn chưa được cấp quyền tạo đơn từ phiếu xuất kho.');
      return;
    }
    if (!isWarehouseBulkReview && bulkOrderSource === 'notebook_image' && !canUseImageOrderSource) {
      setBulkOrderStatus('Bạn chưa được cấp quyền lên đơn bằng hình ảnh.');
      return;
    }
    if (bulkOrderDrafts.length === 0) {
      setBulkOrderStatus('Chưa có đơn nháp để tạo hàng loạt.');
      return;
    }

    setErrorMsg('');
    setBulkOrderStatus('');
    if (isWarehouseBulkReview) {
      const duplicateDispatchIds = findDuplicateWarehouseDispatchIds(
        bulkOrderDrafts,
        orderRecordsForDuplicateCheck
      );
      if (duplicateDispatchIds.length > 0) {
        const sourceDateLabel = formatDateLabel(bulkOrderDrafts[0]?.sourceDispatchDate || selectedWarehouseDispatchDate);
        setBulkOrderStatus(`Có ${duplicateDispatchIds.length} phiếu xuất kho ngày ${sourceDateLabel} đã được lên đơn hoặc bị lặp trong lô hiện tại. App đã chặn tạo trùng, vui lòng tải lại dữ liệu để kiểm tra.`);
        return;
      }
    }
    const duplicateDraftLabels = findDuplicateBulkOrderDrafts(bulkOrderDrafts);
    if (duplicateDraftLabels.length > 0) {
      setBulkOrderStatus(`App đã phạt hiện ${duplicateDraftLabels.length} đơn có dấu hiệu trùng: ${duplicateDraftLabels.slice(0, 3).join(', ')}${duplicateDraftLabels.length > 3 ? '...' : ''}. Vui lòng kiểm tra lại trước khi tạo.`);
      return;
    }
    bulkOrderSubmittingRef.current = true;
    setIsBulkOrderSubmitting(true);
    setBulkOrderStatus(`Đang xác nhận ${bulkOrderDrafts.length} đơn với máy chủ...`);
    let createdCount = 0;
    const postSaveWarnings = [];

    try {
      for (let index = 0; index < bulkOrderDrafts.length; index += 1) {
        const result = await submitOrderDraft(bulkOrderDrafts[index], { allowDescriptionOnly: true });
        if (Array.isArray(result?.postSaveWarnings)) postSaveWarnings.push(...result.postSaveWarnings);
        createdCount += 1;
      }
      setBulkOrderDrafts([]);
      setShowAddOrder(false);
      setShowOrderSourcePicker(false);
      setOrderCreationSource('');
      closeBulkDraftFeeEditor();
      const sourceLabel = isWarehouseBulkReview ? 'phiếu xuất kho' : bulkOrderSource === 'notebook_image' ? 'ảnh sổ sách' : 'đơn nháp';
      setBulkOrderStatus(`Đã tạo ${createdCount} đơn hàng từ ${sourceLabel}.${postSaveWarnings.length > 0 ? ` Có ${postSaveWarnings.length} cảnh báo phụ cần kiểm tra.` : ''}`);
    } catch (error) {
      if (isOrderSaveTimeoutError(error)) {
        setBulkOrderStatus('Có đơn chưa được máy chủ xác nhận. App giữ nguyên dữ liệu để bạn kiểm tra kết nối và thử lại an toàn.');
      } else {
        setBulkOrderStatus(`Dừng ở đơn nháp ${createdCount + 1}: ${getFriendlyFirebaseErrorMessage(error, 'Không thể tạo đơn.')}`);
      }
    } finally {
      bulkOrderSubmittingRef.current = false;
      setIsBulkOrderSubmitting(false);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (isBulkOrderSubmitting || bulkOrderSubmittingRef.current) return;
    setErrorMsg('');
    if (!canUseManualOrderSource) {
      setErrorMsg('Bạn chưa được cấp quyền tạo đơn thủ công.');
      return;
    }

    bulkOrderSubmittingRef.current = true;
    setIsBulkOrderSubmitting(true);
    setBulkOrderStatus('Đang xác nhận đơn với máy chủ...');
    try {
      const result = await submitOrderDraft(newOrder, { allowDescriptionOnly: false });
      const postSaveWarnings = Array.isArray(result?.postSaveWarnings) ? result.postSaveWarnings : [];
      setShowAddOrder(false);
      setShowOrderSourcePicker(false);
      setSearchCus('');
      setNewOrder(createSingleOrderState());
      setOrderCreationSource('');
      setBulkOrderStatus(
        postSaveWarnings.length > 0
          ? postSaveWarnings.join(' ')
          : 'Đã tạo đơn hàng. Máy chủ đã xác nhận và đồng bộ dữ liệu.'
      );
    } catch (error) {
      setBulkOrderStatus('');
      if (isOrderSaveTimeoutError(error)) {
        setErrorMsg('Đơn chưa được máy chủ xác nhận. App giữ nguyên biểu mẫu để bạn kiểm tra kết nối và thử lại an toàn.');
      } else {
        setErrorMsg(getFriendlyFirebaseErrorMessage(error, 'Không thể tạo đơn hàng này.'));
      }
    } finally {
      bulkOrderSubmittingRef.current = false;
      setIsBulkOrderSubmitting(false);
    }
  };

  const openAddOrderModal = () => {
    if (!canCreateAnyOrder) return;
    setErrorMsg('');
    setBulkOrderStatus('');
    setBulkOrderDrafts([]);
    closeBulkDraftFeeEditor();
    setOrderCreationSource('');
    setShowOrderSourcePicker(true);
  };

  const handleChooseOrderCreationSource = (source) => {
    if (source === 'warehouse' && !canUseWarehouseOrderSource) return;
    if (source === 'image' && !canUseImageOrderSource) return;
    if (source === 'manual' && !canUseManualOrderSource) return;

    setShowOrderSourcePicker(false);
    setOrderCreationSource(source);
    setShowAddOrder(true);
    setErrorMsg('');
    setBulkOrderStatus('');
    setBulkOrderDrafts([]);
    closeBulkDraftFeeEditor();

    if (source === 'manual') {
      setSearchCus('');
      setShowCusDropdown(false);
      setNewOrder(createSingleOrderState());
      return;
    }

    if (source === 'warehouse') {
      setSelectedWarehouseDispatchDate(getTodayString());
      setBulkOrderStatus('Chọn ngày phiếu xuất kho rồi bấm lấy phiếu để tạo đơn nháp.');
      return;
    }

    setBulkOrderStatus('Chụp hoặc chọn ảnh sổ sách để AI tách thành đơn nháp.');
    if (typeof window !== 'undefined') {
      window.setTimeout(() => bulkOrderImageInputRef.current?.click(), 160);
    }
  };

  const closeAddOrderModal = () => {
    setShowAddOrder(false);
    setShowOrderSourcePicker(false);
    setOrderCreationSource('');
    setErrorMsg('');
    setBulkOrderStatus('');
    setBulkOrderDrafts([]);
    closeBulkDraftFeeEditor();
  };

  useEffect(() => {
    if (quickActionIntent?.type !== 'create_order') return;
    openAddOrderModal();
    onQuickActionHandled?.();
  }, [quickActionIntent?.id, quickActionIntent?.requestedAt, quickActionIntent?.type]);

  useEffect(() => {
    if (quickActionIntent?.type !== 'open_order_detail' || !quickActionIntent?.orderId) return;
    const orderId = `${quickActionIntent.orderId}`.trim();
    const orderExists = Boolean(getLiveOrderViewModel(orderId) || activeOrders.some(order => order.id === orderId));
    if (orderExists) openOrderDetail(orderId);
    onQuickActionHandled?.();
  }, [
    quickActionIntent?.id,
    quickActionIntent?.requestedAt,
    quickActionIntent?.type,
    quickActionIntent?.orderId,
    activeOrders,
    getLiveOrderViewModel
  ]);

  return (
    <div className="premium-data-module premium-orders-module space-y-4 animate-in fade-in pb-16" aria-busy={!orderViewsReady || preparedOrderSearch.pending}>
      {showFilterPanel && (
        <div className="premium-data-toolbar bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setTab('all')} className={`rounded-xl border px-3 py-3 text-sm font-bold transition-colors ${tab === 'all' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>Tất cả đơn</button>
              <button type="button" onClick={() => setTab('pending')} className={`rounded-xl border px-3 py-3 text-sm font-bold transition-colors ${tab === 'pending' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>Chờ xác nhận</button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Ngày</span>
                <input
                  type="date"
                  value={orderDateFilter}
                  onChange={(e) => setOrderDateFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Loại hàng</span>
                <select
                  value={orderProductFilter}
                  onChange={(e) => setOrderProductFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Tất cả loại hàng</option>
                  {activeProducts.map(product => (
                    <option key={product.id} value={product.id}>{product.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Thu tiền</span>
                <select
                  value={orderPaymentFilter}
                  onChange={(e) => setOrderPaymentFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Tất cả đơn</option>
                  <option value="paid">Đã thanh toán</option>
                  <option value="unpaid">Còn nợ</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">NVKD</span>
                <select
                  value={orderSalesEmpFilter}
                  onChange={(e) => setOrderSalesEmpFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Tất cả NVKD</option>
                  {salesEmployees.map(salesEmployee => (
                    <option key={salesEmployee.id} value={salesEmployee.id}>{salesEmployee.name}</option>
                  ))}
                </select>
              </label>
            </div>
            {(orderDateFilter || orderProductFilter || orderPaymentFilter || orderSalesEmpFilter) && (
              <button
                type="button"
                onClick={() => {
                  setOrderDateFilter('');
                  setOrderProductFilter('');
                  setOrderPaymentFilter('');
                  setOrderSalesEmpFilter('');
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600"
              >
                Xóa bộ lọc ngày / sản phẩm / thanh toán / NVKD
              </button>
            )}
            <p className="text-[11px] text-gray-500">Đang hiển thị {displayOrders.length} đơn phù hợp với bộ lọc hiện tại.</p>
          </div>
        </div>
      )}

      <div className="premium-data-summary overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-600 via-teal-500 to-cyan-500 p-3 text-white shadow-sm">
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-white/75">Doanh thu ngày</p>
            <div className="relative w-[132px] rounded-xl border border-white/25 bg-white/10 sm:w-[160px]">
              <span className="pointer-events-none block px-2.5 py-1.5 text-right text-xs font-normal text-white">
                {formatCompactDateLabel(selectedRevenueDate)}
              </span>
              <input
                type="date"
                aria-label="Chọn ngày xem doanh thu đơn hàng"
                value={selectedRevenueDate}
                onChange={(event) => setOrderDateFilter(event.target.value || getTodayString())}
                className="order-revenue-date-input absolute inset-0 h-full w-full cursor-pointer opacity-0 outline-none"
              />
            </div>
          </div>
          <h2 className="mt-1 text-center text-[14px] font-black tracking-tight">{orderViewsReady ? `${formatCurrency(dailyOrderRevenueSummary.totalRevenue)} đ` : '—'}</h2>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-2xl bg-white/14 px-3 py-1.5 backdrop-blur">
            <p className="text-[10px] font-black uppercase tracking-wide text-white/70">Đã thu</p>
            <p className="mt-1 text-sm font-black">{orderViewsReady ? `${formatCurrency(dailyOrderRevenueSummary.paidRevenue)} đ` : '—'}</p>
          </div>
          <div className="rounded-2xl bg-white/14 px-3 py-1.5 backdrop-blur">
            <p className="text-[10px] font-black uppercase tracking-wide text-white/70">Còn nợ</p>
            <p className="mt-1 text-sm font-black">{orderViewsReady ? `${formatCurrency(dailyOrderRevenueSummary.outstandingRevenue)} đ` : '—'}</p>
          </div>
        </div>
      </div>

      {bulkOrderStatus && !showAddOrder && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold leading-6 ${
            /dừng|không|chưa|kiểm tra|trùng/i.test(bulkOrderStatus)
              ? 'border-amber-200 bg-amber-50 text-amber-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {bulkOrderStatus}
        </div>
      )}
      
      <div className="premium-data-list space-y-3" aria-busy={orderViewProjection.pending || Boolean(orderViewProjection.error) || preparedOrderSearch.pending}>
        {orderViewProjection.pending && <p role="status" className="px-4 py-3 text-sm text-gray-500">Đang tổng hợp danh sách đơn…</p>}
        {orderViewProjection.error && <p role="alert" className="px-4 py-3 text-sm text-red-600">Chưa tổng hợp được danh sách đơn. Hãy mở lại màn hình.</p>}
        {preparedOrderSearch.pending && <p role="status" className="px-4 py-3 text-sm text-gray-500">Đang tìm kiếm...</p>}
        {preparedOrderSearch.error && <p role="alert" className="px-4 py-3 text-sm text-red-600">Chưa tìm kiếm được. Hãy mở lại danh sách.</p>}
        {displayOrders.length === 0 && !orderViewProjection.pending && !orderViewProjection.error && !preparedOrderSearch.pending && !preparedOrderSearch.error && (
          <HDEmptyState
            icon={<ClipboardList size={24} />}
            title={hasOrderListFilters ? 'Không tìm thấy đơn phù hợp' : 'Chưa có đơn hàng'}
            description={hasOrderListFilters ? 'Thử xóa bộ lọc hoặc tìm với từ khóa khác.' : 'Đơn hàng mới sẽ hiển thị tại đây sau khi được tạo.'}
            action={hasOrderListFilters
              ? <HDButton variant="secondary" size="sm" onClick={resetOrderListFilters}>Xóa bộ lọc</HDButton>
              : canCreateAnyOrder
                ? <HDButton size="sm" onClick={openAddOrderModal}><Plus size={16} aria-hidden="true" />Tạo đơn hàng</HDButton>
                : null}
            className="premium-empty-state rounded-2xl bg-white p-6"
          />
        )}

        {orderPage.items.map((order, orderIndex) => {
          const statusMeta = getOrderStatusMeta(order);
          const reviewMeta = getOrderReviewMeta(order);
          const zaloMeta = getOrderZaloSendMeta(order);
          const primaryItem = (order.items || [])[0] || null;
          const extraItemCount = Math.max(0, (order.items || []).length - 1);
          const billingSummaries = summarizeOrderBillingItems(order.items || []);
          const hasSingleBillingUnit = billingSummaries.length === 1;
          const singleBillingUnit = hasSingleBillingUnit ? billingSummaries[0].unit : '';
          const quantityHeading = hasSingleBillingUnit
            ? `Số ${singleBillingUnit.toLocaleLowerCase('vi-VN')}`
            : 'Số lượng';
          const quantityLabel = billingSummaries.length > 0
            ? billingSummaries.map(summary => `${formatNumber(summary.quantity)} ${summary.unit}`).join(' • ')
            : 'Chưa có';
          const itemTypeLabel = primaryItem
            ? `${primaryItem.description || 'Mặt hàng'}${extraItemCount > 0 ? ` +${extraItemCount} loại` : ''}`
            : 'Chưa có mặt hàng';
          const unitPriceLabel = billingSummaries.length === 0
            ? 'Chưa có'
            : billingSummaries.map((summary) => {
              if (summary.unitPrices.length === 0) return `Chưa có đ/${summary.unit}`;
              if (summary.unitPrices.length === 1) return `${formatCurrency(summary.unitPrices[0])} đ/${summary.unit}`;
              return `${formatCurrency(summary.unitPrices[0])} - ${formatCurrency(summary.unitPrices.at(-1))} đ/${summary.unit}`;
            }).join(' • ');
          const deliveryReportIssues = order.deliveryReportIssues || [];

          return (
            <div
              key={order.id || order._id || order.orderId || `legacy_${orderPage.start + orderIndex}`}
              className="hd-render-contained relative"
            >
              {canDeleteOrder && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (window.confirm('Xóa vĩnh viễn đơn hàng này?')) onDeleteOrder(order.id);
                  }}
                  className="absolute top-3 right-3 z-10 text-gray-300 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              )}

              <button
                type="button"
                onClick={() => openOrderDetail(order.id)}
                className="w-full bg-white p-4 rounded-2xl shadow-sm border border-gray-100 text-left hover:border-emerald-200 hover:shadow-md transition-all"
              >
                <div className="flex justify-between items-start gap-3 pr-7">
                  <div>
                    <h3 className="font-bold text-gray-800">{order.customer?.name || 'Khách lẻ'}</h3>
                    {(order.branchName || order.customerBranchName) && (
                      <p className="mt-1 inline-flex max-w-full rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-black text-sky-700">
                        CN: {order.branchName || order.customerBranchName}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">{formatDateTimeLabel(order.date)} • {formatOrderCode(order.id)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <PremiumStatusBadge status={statusMeta.label} label={statusMeta.label} />
                    <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${reviewMeta.chipClasses}`}>{reviewMeta.label}</span>
                    {order.zaloSendStatus && order.zaloSendStatus !== 'not_queued' && (
                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${zaloMeta.chipClasses}`}>{zaloMeta.label}</span>
                    )}
                  </div>
                </div>

                <div className="mt-3 text-[11px]">
                  <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="uppercase tracking-wide text-[10px] text-gray-400 font-bold mb-1">Loại hàng</p>
                        <p className="font-semibold text-gray-700 leading-5">{itemTypeLabel}</p>
                      </div>
                      <div>
                        <p className="uppercase tracking-wide text-[10px] text-gray-400 font-bold mb-1">{quantityHeading}</p>
                        <p className="font-semibold text-gray-700 leading-5">{quantityLabel}</p>
                      </div>
                      <div>
                        <p className="uppercase tracking-wide text-[10px] text-gray-400 font-bold mb-1">Đơn giá</p>
                        <p className="font-semibold text-gray-700 leading-5">{unitPriceLabel}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {order.extraExpenseName && (order.customerExtraExpense || 0) > 0 && (
                  <p className="mt-2 text-xs font-medium text-blue-600">+ {order.extraExpenseName} ({formatCurrency(order.customerExtraExpense || 0)} đ)</p>
                )}

                {shouldShowOrderNote(order.note) && (
                  <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-700">
                    Ghi chú: {order.note}
                  </p>
                )}

                {deliveryReportIssues.length > 0 && (
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                    <div className="flex items-start gap-2">
                      <AlertCircle size={15} className="mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p>Cảnh báo lệch cân giao hàng</p>
                        <p className="mt-1 font-semibold leading-5 text-amber-700">
                          {deliveryReportIssues.slice(0, 2).map(issue => `${issue.productName}: ${formatNumber(issue.actualWeight)} kg thực tế / ${formatNumber(issue.expectedWeight)} kg phiếu`).join(' • ')}
                          {deliveryReportIssues.length > 2 ? ` • +${deliveryReportIssues.length - 2} dòng` : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </button>
            </div>
          );
        })}

      </div>
      <ListPagination pagination={orderPage} label="Phân trang đơn hàng" />

      {canCreateAnyOrder && (
      <div
        className="hd-order-module-fab fixed right-4 z-40 pointer-events-none flex justify-end"
        style={{ bottom: 'calc(var(--hd-footer-height) + 1rem)' }}
      >
         <button
           type="button"
           aria-label="Tạo đơn bán hàng"
           onClick={openAddOrderModal}
           className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_10px_25px_rgba(37,99,235,0.35)] transition hover:bg-blue-700 active:scale-95"
         >
            <Plus size={26} strokeWidth={3}/>
         </button>
      </div>
      )}

      {selectedOrder && (() => {
        const canEditSelectedOrder = canEditOrderRecord(selectedOrder);
        const detailItems = selectedOrder.items || [];
        const detailCustomer = customers.find(customer => customer.id === selectedOrder.customerId);
        const detailOutstanding = Math.max(0, parseLooseMoneyValue(selectedOrder.outstandingAmount ?? (parseLooseMoneyValue(selectedOrder.amount) - parseLooseMoneyValue(selectedOrder.appliedAmount))));
        const selectedOrderFeeAmount = parseLooseMoneyValue(selectedOrder.extraExpenseAmount ?? selectedOrder.customerExtraExpense);
        const sellerFeeAmount = parseLooseMoneyValue(selectedOrder.sellerExtraExpense);
        const hasAnyFee = selectedOrderFeeAmount > 0 || parseLooseMoneyValue(selectedOrder.customerExtraExpense) > 0 || sellerFeeAmount > 0;
        const selectedOrderReturnSummary = summarizeOrderReturnGoods(selectedOrder);
        const hasReturnGoods = selectedOrderReturnSummary.count > 0;
        return (
          <div className="hd-order-detail-layer fixed inset-0 bg-gray-50 z-50 flex flex-col animate-in slide-in-from-right">
            <HDHeader className="hd-order-detail-header hd-safe-header-compact relative z-10 bg-white border-b border-slate-200 px-4 pb-3 pt-3 flex items-center justify-between shrink-0 shadow-sm">
              <div className="flex items-center gap-3">
                <button type="button" onClick={closeOrderDetail} className="p-2 rounded-full text-white hover:bg-white/10">
                  <ChevronLeft size={22} />
                </button>
                <div>
                  <h2 className="text-[17px] font-extrabold tracking-tight text-white">Hóa đơn bán hàng</h2>
                  <p className="mt-0.5 text-[12px] font-semibold text-white/80">{formatOrderCode(selectedOrder.id)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {canSharePaymentQr && <button type="button" title="Chia sẻ hóa đơn" aria-label="Chia sẻ hóa đơn" disabled={orderSaving || isSharingOrder} onClick={() => handleShareOrder()} className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center disabled:opacity-50"><Send size={18} /></button>}
              </div>
            </HDHeader>

            <div
              className="hd-order-detail-content flex-1 min-h-0 overflow-y-auto px-4 pt-3 pb-[calc(var(--hd-safe-bottom)+7rem)] space-y-4"
              style={{ scrollPaddingBottom: 'calc(var(--hd-safe-bottom) + 7rem)' }}
            >
              <section aria-label="Thao tác hóa đơn" className="hd-invoice-detail-sheet bg-white p-3">
                <div className="mb-4 grid grid-cols-2 gap-3 border-b border-slate-100 pb-4" aria-label="Thông tin hóa đơn">
                  <div className="min-w-0 space-y-1">
                    <h3 className="break-words text-base font-extrabold text-slate-900">{detailCustomer?.name || selectedOrder.customerName || 'Khách hàng'}</h3>
                    <p className="break-words text-sm text-slate-600">{detailCustomer?.phone || ''}</p>
                    <p className="break-words text-xs text-slate-500">{detailCustomer?.address || ''}</p>
                  </div>
                  <div className="min-w-0 text-right">
                    <h3 className="text-base font-extrabold text-slate-900">HÓA ĐƠN BÁN HÀNG</h3>
                    <p className="mt-2 break-words text-xs font-semibold text-slate-500">{formatOrderCode(selectedOrder.id)} • {formatDateTimeLabel(selectedOrder.date)}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {detailItems.length === 0 && (
                    <p className="p-4 text-center text-sm text-gray-400">Chưa có chi tiết mặt hàng trong đơn này.</p>
                  )}
                  {detailItems.map((item, index) => {
                    const billing = getOrderItemBillingPresentation(item);
                    return (
                      <div key={`${selectedOrder.id}_quick_${index}`} className="border-b border-slate-100 px-3 py-3 last:border-b-0">
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-extrabold leading-5 text-slate-900">{item.description || `Sản phẩm ${index + 1}`}</p>
                          <div className="mt-2 grid grid-cols-[0.8fr_1fr_1.25fr] items-center gap-2 text-[12px] font-semibold leading-5 text-slate-500">
                            <button type="button" title="Sửa số lượng" disabled={!canEditOrderItemRecord(selectedOrder)} onClick={() => openOrderItemEditor(selectedOrder, index)} className="rounded-lg bg-white px-2 py-0.5 font-extrabold text-emerald-700 shadow-sm ring-1 ring-emerald-100 disabled:text-slate-500 disabled:ring-slate-100">
                              {formatNumber(billing.billingQuantity)} {billing.billingUnit}
                            </button>
                            <button type="button" title="Sửa đơn giá" disabled={!canEditOrderItemRecord(selectedOrder)} onClick={() => openOrderItemEditor(selectedOrder, index)} className="rounded-lg bg-white px-2 py-0.5 font-extrabold text-emerald-700 shadow-sm ring-1 ring-emerald-100 disabled:text-slate-500 disabled:ring-slate-100">
                              {formatCurrency(billing.unitPrice)} đ/{billing.billingUnit}
                            </button>
                            <p className="text-right text-[15px] font-extrabold leading-5 text-slate-900">{formatCurrency(billing.amount)} đ</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {payosSyncStatus && (
                  <p className="mt-2 rounded-2xl border border-sky-100 bg-sky-50 px-3 py-2 text-[11px] font-bold leading-5 text-sky-700">
                    {payosSyncStatus}
                  </p>
                )}

                {(canEditSelectedOrder || canRecordOrderPayment) && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {canEditSelectedOrder && (
                    <button
                      type="button"
                      onClick={() => openOrderFeeEditor(selectedOrder)}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-black text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      {selectedOrderFeeAmount > 0 ? `Phí ${formatCurrency(selectedOrderFeeAmount)}` : 'Phí'}
                    </button>
                    )}
                    {canEditSelectedOrder && (
                      <button
                        type="button"
                        onClick={() => openOrderReturnEditor(selectedOrder)}
                        className="rounded-2xl border border-amber-100 bg-white px-3 py-2.5 text-[11px] font-black text-amber-700 shadow-sm active:scale-[0.98]"
                      >
                        Trả hàng
                      </button>
                    )}
                    {canRecordOrderPayment && (
                      <button
                        type="button"
                        onClick={() => openOrderPaymentModal(selectedOrder)}
                        className="rounded-2xl border border-emerald-100 bg-white px-3 py-2.5 text-[11px] font-black text-emerald-700 shadow-sm active:scale-[0.98]"
                      >
                        Thu tiền
                      </button>
                    )}
                  </div>
                )}

                {shouldShowOrderNote(selectedOrder.note) && (
                  <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-700">
                    Ghi chú: {selectedOrder.note}
                  </div>
                )}

                {hasReturnGoods && (
                  <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-5 text-amber-800">
                    <p className="font-black uppercase tracking-wide">Hàng trả: {formatReturnGoodsQty(selectedOrderReturnSummary)}</p>
                    {selectedOrderReturnSummary.pendingCount > 0 && (
                      <p className="mt-1 text-rose-600">
                        Còn phải lấy về kho: {formatReturnGoodsQty({ pieces: selectedOrderReturnSummary.pendingPieces, weightKg: selectedOrderReturnSummary.pendingWeightKg })}
                      </p>
                    )}
                    {selectedOrderReturnSummary.discountAmount > 0 && (
                      <p className="mt-1 text-emerald-700">Đã giảm giá bán lại: {formatCurrency(selectedOrderReturnSummary.discountAmount)} đ</p>
                    )}
                  </div>
                )}

                {hasAnyFee && (
                  <div className="mt-3 rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-700">Chi phí khác</p>
                        <p className="mt-1 truncate text-sm font-extrabold text-slate-900">{selectedOrder.extraExpenseName || 'Phụ phí'}</p>
                      </div>
                      {canEditSelectedOrder && (
                        <button type="button" onClick={() => openOrderFeeEditor(selectedOrder)} className="shrink-0 rounded-full bg-white px-3 py-1 text-[11px] font-black text-sky-700 shadow-sm ring-1 ring-sky-100">
                          Sửa phí
                        </button>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                      <div className="rounded-2xl bg-white px-3 py-2 shadow-sm">
                        <p className="text-[10px] font-black uppercase text-slate-400">Tính vào đơn</p>
                        <p className="mt-1 text-sm font-black text-emerald-700">{formatCurrency(selectedOrder.customerExtraExpense || 0)} đ</p>
                      </div>
                      <div className="rounded-2xl bg-white px-3 py-2 shadow-sm">
                        <p className="text-[10px] font-black uppercase text-slate-400">Chi phí DN</p>
                        <p className="mt-1 text-sm font-black text-rose-600">{formatCurrency(sellerFeeAmount || 0)} đ</p>
                      </div>
                    </div>
                  </div>
                )}

                {(selectedOrder.deliveryReportIssues || []).length > 0 && (
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3">
                    <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-amber-800">
                      <AlertCircle size={15} /> Cảnh báo lệch cân giao hàng cần xử lý
                    </p>
                    <div className="mt-2 space-y-2">
                      {(selectedOrder.deliveryReportIssues || []).map(issue => {
                        const isShort = (issue.diff || 0) < 0;
                        const responsibleEmp = employees.find(emp => emp.id === (issue.empId || issue.createdByEmpId));
                        return (
                          <div key={issue.reportId || issue.dispatchId} className="rounded-2xl border border-amber-200 bg-white/85 p-3 text-xs text-amber-800 shadow-sm">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="font-black text-slate-900">{issue.productName || 'Hàng hóa'}</p>
                                <p className="mt-1 font-semibold leading-5">
                                  Phiếu {formatNumber(issue.expectedWeight)} kg • Thực tế {formatNumber(issue.actualWeight)} kg • Lệch {formatNumber(Math.abs(issue.diff))} kg
                                </p>
                                {responsibleEmp && (
                                  <p className="mt-1 text-[11px] font-bold text-slate-500">Người báo cáo: {responsibleEmp.name}</p>
                                )}
                              </div>
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${isShort ? 'bg-red-50 text-red-600' : 'bg-sky-50 text-sky-600'}`}>
                                {isShort ? 'Thiếu hàng' : 'Dư hàng'}
                              </span>
                            </div>
                            {canResolveDeliveryIssues ? (
                              <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                                <button type="button" onClick={() => handleResolveDeliveryIssue(selectedOrder, issue, 'accepted')} className="rounded-xl bg-emerald-500 px-3 py-2 text-[11px] font-black text-white shadow-sm">
                                  Chấp nhận
                                </button>
                                <button type="button" onClick={() => handleResolveDeliveryIssue(selectedOrder, issue, 'rejected')} className="rounded-xl bg-white px-3 py-2 text-[11px] font-black text-slate-700 ring-1 ring-slate-200">
                                  Từ chối
                                </button>
                                {isShort && canChargeLostDeliveryGoods && (
                                  <button type="button" onClick={() => handleResolveDeliveryIssue(selectedOrder, issue, 'lost_charged')} className="col-span-2 rounded-xl bg-red-500 px-3 py-2 text-[11px] font-black text-white shadow-sm sm:col-span-1">
                                    Mất hàng - trừ lương
                                  </button>
                                )}
                              </div>
                            ) : (
                              <p className="mt-2 rounded-xl bg-amber-100 px-3 py-2 text-[11px] font-bold text-amber-700">Tài khoản này chỉ được xem cảnh báo, chưa có quyền xử lý.</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div aria-label="Trạng thái thanh toán" className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
                  <span className="rounded-full bg-slate-50 px-3 py-2">Tổng {formatCurrency(selectedOrder.amount || 0)} đ</span>
                  {parseLooseMoneyValue(selectedOrder.appliedAmount) > 0 && <button type="button" disabled={!canEditSelectedOrder} onClick={() => promptEditOrderMoney(selectedOrder, 'paid')} className="rounded-full bg-emerald-50 px-3 py-2 text-emerald-700">Đã thu {formatCurrency(selectedOrder.appliedAmount)} đ</button>}
                  {detailOutstanding > 0 ? <span className="rounded-full bg-amber-50 px-3 py-2 text-amber-700">Còn nợ {formatCurrency(detailOutstanding)} đ</span> : <><span className="rounded-full bg-emerald-50 px-3 py-2 text-emerald-700">Hết nợ</span><span className="text-emerald-700">ĐÃ THANH TOÁN</span></>}
                </div>
              </section>

              {orderShareStatus && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px] leading-5 font-semibold text-emerald-700" role="status">
                  {orderShareStatus}
                </div>
              )}

            </div>

            {returnEditorOrderId === selectedOrder.id && (() => {
              const returnQtyPreview = formatReturnGoodsQty({
                pieces: returnDraft.pieces,
                weightKg: returnDraft.weightKg
              });
              const statusOptions = [
                { id: 'pending_pickup', title: 'Chưa lấy', desc: 'Cảnh báo khách còn nợ hàng trả', tone: 'amber' },
                { id: 'retrieved', title: 'Đã lấy', desc: 'Đã thu hàng về kho', tone: 'emerald' },
                { id: 'discounted_sale', title: 'Giảm giá', desc: 'Bán luôn và trừ vào hóa đơn', tone: 'sky' }
              ];

              return (
                <div
                  className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 px-3 py-5 pb-[calc(96px+env(safe-area-inset-bottom))] sm:p-4"
                  onClick={closeOrderReturnEditor}
                >
                  <form
                    onSubmit={(event) => { event.preventDefault(); saveOrderReturnEditor(selectedOrder); }}
                    onClick={(event) => event.stopPropagation()}
                    className="max-h-[calc(100dvh-150px)] w-full max-w-md overflow-y-auto rounded-[32px] bg-white p-5 shadow-2xl"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-600">Trả hàng</p>
                        <h3 className="mt-1 text-xl font-black text-slate-950">Ghi nhận hàng khách trả</h3>
                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">Nhập số lượng trả, lý do và trạng thái hàng để kho/kinh doanh theo dõi.</p>
                      </div>
                      <button type="button" onClick={closeOrderReturnEditor} className="rounded-full bg-slate-100 p-2 text-slate-500">
                        <X size={18} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Số con</label>
                        <input
                          inputMode="decimal"
                          value={returnDraft.pieces}
                          onChange={(event) => setReturnDraft(prev => ({ ...prev, pieces: event.target.value }))}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-lg font-black text-slate-950 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Số kg</label>
                        <input
                          inputMode="decimal"
                          value={returnDraft.weightKg}
                          onChange={(event) => setReturnDraft(prev => ({ ...prev, weightKg: event.target.value }))}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-lg font-black text-slate-950 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                          placeholder="0"
                        />
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Lý do trả</label>
                      <textarea
                        value={returnDraft.reason}
                        onChange={(event) => setReturnDraft(prev => ({ ...prev, reason: event.target.value }))}
                        className="h-20 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold leading-5 text-slate-900 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                        placeholder="Ví dụ: hàng không đạt, thiếu size, khách đổi..."
                      />
                    </div>

                    <div className="mt-3">
                      <label className="mb-2 block text-[11px] font-black uppercase tracking-wide text-slate-500">Tình trạng hàng</label>
                      <div className="grid grid-cols-3 gap-2">
                        {statusOptions.map(option => {
                          const active = returnDraft.status === option.id;
                          const activeClasses = option.tone === 'emerald'
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                            : option.tone === 'sky'
                              ? 'border-sky-400 bg-sky-50 text-sky-700'
                              : 'border-amber-400 bg-amber-50 text-amber-700';
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => setReturnDraft(prev => ({ ...prev, status: option.id }))}
                              className={`rounded-2xl border px-2 py-3 text-center transition-all ${active ? activeClasses : 'border-slate-200 bg-white text-slate-500'}`}
                            >
                              <span className="block text-[11px] font-black">{option.title}</span>
                              <span className="mt-1 block text-[9px] font-bold opacity-80">{option.desc}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {returnDraft.status === 'discounted_sale' && (
                      <div className="mt-3">
                        <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Số tiền giảm giá</label>
                        <input
                          inputMode="numeric"
                          value={formatInputCurrency(returnDraft.discountAmount)}
                          onChange={(event) => setReturnDraft(prev => ({ ...prev, discountAmount: parseInputCurrency(event.target.value) }))}
                          className="w-full rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-lg font-black text-slate-950 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                          placeholder="0 đ"
                        />
                      </div>
                    )}

                    <div className="mt-3 rounded-3xl bg-slate-50 p-3 text-center">
                      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Sẽ ghi nhận</p>
                      <p className="mt-1 text-base font-black text-slate-950">{returnQtyPreview}</p>
                      <p className="mt-1 text-[11px] font-bold text-slate-500">{RETURN_GOODS_STATUS_LABELS[returnDraft.status] || RETURN_GOODS_STATUS_LABELS.pending_pickup}</p>
                    </div>

                    {returnEditorError && (
                      <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-[12px] font-bold leading-5 text-rose-600">
                        {returnEditorError}
                      </p>
                    )}

                    <div className="mt-5 grid grid-cols-[0.9fr_1.2fr] gap-3">
                      <button type="button" onClick={closeOrderReturnEditor} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-600">
                        Hủy
                      </button>
                      <button type="submit" className="rounded-2xl bg-gradient-to-r from-amber-500 to-emerald-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-amber-200">
                        Lưu trả hàng
                      </button>
                    </div>
                  </form>
                </div>
              );
            })()}

            {orderPaymentDraft.open && orderPaymentDraft.orderId === selectedOrder.id && (() => {
              const draftAmount = parseInputCurrency(orderPaymentDraft.amount);
              const remainingAfterPayment = Math.max(0, parseLooseMoneyValue(selectedOrder.outstandingAmount) - (Number.isFinite(draftAmount) ? draftAmount : 0));

              return (
                <div
                  className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 px-3 py-5 pb-[calc(96px+env(safe-area-inset-bottom))] sm:p-4"
                  onClick={closeOrderPaymentModal}
                >
                  <form
                    onSubmit={submitOrderPayment}
                    onClick={(event) => event.stopPropagation()}
                    className="w-full max-w-sm rounded-[30px] bg-white p-5 shadow-2xl"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-600">Thu tiền</p>
                        <h3 className="mt-1 truncate text-lg font-black text-slate-950">{formatOrderCode(selectedOrder.id)}</h3>
                        <p className="mt-0.5 truncate text-xs font-bold text-slate-500">{selectedOrder.customer?.name || 'Khách hàng'}</p>
                      </div>
                      <button type="button" onClick={closeOrderPaymentModal} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        <X size={20} />
                      </button>
                    </div>

                    <div className="mt-4 rounded-3xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
                      Còn nợ hiện tại: {formatCurrency(selectedOrder.outstandingAmount || 0)} đ
                    </div>

                    <div className="mt-4 space-y-3">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-400">Số tiền thu</span>
                        <input
                          autoFocus
                          inputMode="numeric"
                          value={orderPaymentDraft.amount}
                          onChange={(event) => setOrderPaymentDraft(prev => ({ ...prev, amount: event.target.value, error: '' }))}
                          className="w-full rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-lg font-black text-slate-900 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                          placeholder="0 đ"
                        />
                      </label>

                      <div className="grid grid-cols-2 gap-3">
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-400">Hình thức</span>
                          <select
                            value={orderPaymentDraft.method}
                            onChange={(event) => setOrderPaymentDraft(prev => ({ ...prev, method: event.target.value }))}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-900 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                          >
                            <option>Chuyển khoản</option>
                            <option>Tiền mặt</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-400">Ngày thu</span>
                          <input
                            type="date"
                            value={orderPaymentDraft.date}
                            onChange={(event) => setOrderPaymentDraft(prev => ({ ...prev, date: event.target.value }))}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-900 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="mt-4 rounded-3xl bg-emerald-50 px-4 py-3 text-right">
                      <p className="text-[11px] font-black uppercase tracking-wide text-emerald-600">Còn lại sau khi thu</p>
                      <p className="mt-1 text-xl font-black text-emerald-700">{formatCurrency(remainingAfterPayment)} đ</p>
                    </div>

                    {orderPaymentDraft.error && (
                      <p className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-[12px] font-bold text-rose-600">
                        {orderPaymentDraft.error}
                      </p>
                    )}

                    <div className="mt-5 grid grid-cols-[0.9fr_1.2fr] gap-3">
                      <button type="button" onClick={closeOrderPaymentModal} disabled={orderPaymentDraft.isSaving} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-600 disabled:opacity-60">
                        Hủy
                      </button>
                      <button type="submit" disabled={orderPaymentDraft.isSaving} className="rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-emerald-200 disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none">
                        {orderPaymentDraft.isSaving ? 'Đang lưu...' : 'Lưu khoản thu'}
                      </button>
                    </div>
                  </form>
                </div>
              );
            })()}

            {orderItemEditor.orderId === selectedOrder.id && (() => {
              const editItem = detailItems[orderItemEditor.itemIndex] || {};
              const previewQuantity = parseLooseQuantityValue(orderItemEditor.quantity);
              const previewUnitPrice = parseInputCurrency(orderItemEditor.unitPrice);
              const safeQuantity = Number.isFinite(previewQuantity) ? previewQuantity : 0;
              const safeUnitPrice = Number.isFinite(previewUnitPrice) ? previewUnitPrice : 0;
              const previewTotal = Math.max(0, safeQuantity * safeUnitPrice);

              return (
                <div
                  className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 px-3 py-5 pb-[calc(96px+env(safe-area-inset-bottom))] sm:p-4"
                  onClick={closeOrderItemEditor}
                >
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      saveOrderItemEditor(selectedOrder);
                    }}
                    onClick={(event) => event.stopPropagation()}
                    className="w-full max-w-sm rounded-[30px] bg-white p-5 shadow-2xl"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-600">Sửa mặt hàng</p>
                        <h3 className="mt-1 truncate text-lg font-black text-slate-950">
                          {editItem.description || `Sản phẩm ${orderItemEditor.itemIndex + 1}`}
                        </h3>
                      </div>
                      <button type="button" onClick={closeOrderItemEditor} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        <X size={20} />
                      </button>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-400">Số lượng</span>
                        <input
                          autoFocus
                          inputMode="decimal"
                          value={orderItemEditor.quantity}
                          onChange={(event) => setOrderItemEditor(prev => ({ ...prev, quantity: event.target.value }))}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-bold text-slate-900 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                          placeholder="0"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-400">Đơn giá</span>
                        <input
                          inputMode="numeric"
                          value={orderItemEditor.unitPrice}
                          onChange={(event) => setOrderItemEditor(prev => ({ ...prev, unitPrice: event.target.value }))}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-bold text-slate-900 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                          placeholder="0 đ"
                        />
                      </label>
                    </div>

                    <div className="mt-4 rounded-3xl bg-emerald-50 px-4 py-3 text-right">
                      <p className="text-[11px] font-black uppercase tracking-wide text-emerald-600">Thành tiền mới</p>
                      <p className="mt-1 text-xl font-black text-emerald-700">{formatCurrency(previewTotal)} đ</p>
                    </div>

                    <div className="mt-5 grid grid-cols-[0.9fr_1.2fr] gap-3">
                      <button type="button" onClick={closeOrderItemEditor} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-600">
                        Hủy
                      </button>
                      <button type="submit" className="rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-emerald-200">
                        Lưu thay đổi
                      </button>
                    </div>
                  </form>
                </div>
              );
            })()}

            {feeEditorOrderId === selectedOrder.id && (() => {
              const draftFeeAmount = parseLooseMoneyValue(feeDraft.amount);
              const draftCustomerFee = feeDraft.payer === 'buyer' ? draftFeeAmount : feeDraft.payer === 'shared' ? draftFeeAmount / 2 : 0;
              const draftSellerFee = feeDraft.payer === 'seller' ? draftFeeAmount : feeDraft.payer === 'shared' ? draftFeeAmount / 2 : 0;
              const payerOptions = [
                { id: 'buyer', title: 'Khách chịu', desc: 'Cộng vào hóa đơn', tone: 'emerald' },
                { id: 'shared', title: 'Chia đôi', desc: 'Khách và DN cùng chịu', tone: 'sky' },
                { id: 'seller', title: 'Công ty chịu', desc: 'Ghi vào chi phí', tone: 'rose' }
              ];

              return (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 px-3 py-5 pb-[calc(96px+env(safe-area-inset-bottom))] sm:p-4">
                  <form onSubmit={(event) => { event.preventDefault(); saveOrderFeeEditor(selectedOrder); }} className="max-h-[calc(100dvh-150px)] w-full max-w-md overflow-y-auto rounded-[32px] bg-white p-5 shadow-2xl">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-sky-600">Chi phí khác</p>
                        <h3 className="mt-1 text-xl font-black text-slate-950">Cấu hình phí đơn hàng</h3>
                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">Nhập rõ tên phí, số tiền và ai chịu phí. App sẽ tự tính vào hóa đơn hoặc chi phí doanh nghiệp.</p>
                      </div>
                      <button type="button" onClick={closeOrderFeeEditor} className="rounded-full bg-slate-100 p-2 text-slate-500">
                        <X size={18} />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Tên phí</label>
                        <input
                          value={feeDraft.name}
                          onChange={(event) => setFeeDraft(prev => ({ ...prev, name: capitalizeFirst(event.target.value) }))}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                          placeholder="Ví dụ: Vận chuyển, thùng xốp..."
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Số tiền phí</label>
                        <input
                          inputMode="numeric"
                          value={formatInputCurrency(feeDraft.amount)}
                          onChange={(event) => setFeeDraft(prev => ({ ...prev, amount: parseInputCurrency(event.target.value) }))}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-lg font-black text-slate-950 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                          placeholder="0 đ"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-[11px] font-black uppercase tracking-wide text-slate-500">Ai chịu phí?</label>
                        <div className="grid grid-cols-3 gap-2">
                          {payerOptions.map(option => {
                            const active = feeDraft.payer === option.id;
                            const activeClasses = option.tone === 'emerald'
                              ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                              : option.tone === 'rose'
                                ? 'border-rose-400 bg-rose-50 text-rose-700'
                                : 'border-sky-400 bg-sky-50 text-sky-700';
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => setFeeDraft(prev => ({ ...prev, payer: option.id }))}
                                className={`rounded-2xl border px-2 py-3 text-center transition-all ${active ? activeClasses : 'border-slate-200 bg-white text-slate-500'}`}
                              >
                                <span className="block text-[11px] font-black">{option.title}</span>
                                <span className="mt-1 block text-[9px] font-bold opacity-80">{option.desc}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 rounded-3xl bg-slate-50 p-2">
                        <div className="rounded-2xl bg-white px-3 py-2 text-center shadow-sm">
                          <p className="text-[10px] font-black uppercase text-slate-400">Cộng hóa đơn</p>
                          <p className="mt-1 text-sm font-black text-emerald-700">{formatCurrency(draftCustomerFee)} đ</p>
                        </div>
                        <div className="rounded-2xl bg-white px-3 py-2 text-center shadow-sm">
                          <p className="text-[10px] font-black uppercase text-slate-400">Chi phí DN</p>
                          <p className="mt-1 text-sm font-black text-rose-600">{formatCurrency(draftSellerFee)} đ</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-[0.9fr_1.2fr] gap-3">
                      <button type="button" onClick={closeOrderFeeEditor} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-600">
                        Hủy
                      </button>
                      <button type="submit" className="rounded-2xl bg-gradient-to-r from-sky-500 to-emerald-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-emerald-200">
                        Lưu phí
                      </button>
                    </div>
                    {hasAnyFee && (
                      <button type="button" onClick={() => saveOrderFeeEditor(selectedOrder, 0)} className="mt-3 w-full rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-black text-rose-600">
                        Xóa phí khỏi đơn
                      </button>
                    )}
                  </form>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {zaloPreviewOrder && (() => {
        const zaloMeta = getOrderZaloSendMeta(zaloPreviewOrder);
        const missingZaloLink = !zaloPreviewOrder.customer?.zaloGroupLink;
        const canSubmitZaloPreview = !isApprovingZaloSend && !zaloMeta.locked && `${zaloPreviewDraft || ''}`.trim();

        return (
          <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/60 px-4 py-6">
            <div className="w-full max-w-md rounded-[30px] bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">Xem trước tin Zalo</p>
                  <h3 className="mt-1 truncate text-lg font-black text-slate-950">{formatOrderCode(zaloPreviewOrder.id)}</h3>
                  <p className="mt-0.5 truncate text-xs font-bold text-slate-500">{zaloPreviewOrder.customer?.name || 'Khách hàng'}</p>
                </div>
                <button type="button" onClick={() => setZaloPreviewOrderId('')} className="shrink-0 rounded-full bg-slate-100 p-2 text-slate-500">
                  <X size={18} />
                </button>
              </div>

              {missingZaloLink && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-bold leading-5 text-amber-700">
                  Khách này chưa có link nhóm Zalo. Hãy cập nhật zaloGroupLink trong hồ sơ khách trước khi duyệt gửi.
                </div>
              )}

              <textarea
                value={zaloPreviewDraft}
                onChange={(event) => {
                  setZaloPreviewDraft(event.target.value);
                  setZaloPreviewSaveStatus('');
                }}
                className="mt-4 h-72 w-full resize-none rounded-3xl border border-blue-100 bg-white px-4 py-3 text-sm font-semibold leading-6 text-slate-700 outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                placeholder="Nhập nội dung tin Zalo gửi cho khách..."
              />
              {zaloPreviewSaveStatus && (
                <p className="mt-2 rounded-2xl bg-slate-50 px-3 py-2 text-[12px] font-bold text-slate-600">
                  {zaloPreviewSaveStatus}
                </p>
              )}

              <div className="mt-4 grid grid-cols-3 gap-2">
                <button type="button" onClick={() => setZaloPreviewOrderId('')} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-600">
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => saveZaloPreviewDraft(zaloPreviewOrder)}
                  className="rounded-2xl border border-blue-100 bg-blue-50 px-3 py-3 text-sm font-black text-blue-700"
                >
                  Lưu mẫu
                </button>
                <button
                  type="button"
                  onClick={() => approveOrderZaloSend(zaloPreviewOrder, zaloPreviewDraft)}
                  disabled={!canSubmitZaloPreview}
                  className="rounded-2xl bg-gradient-to-r from-blue-500 to-emerald-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-emerald-200 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-500 disabled:shadow-none"
                >
                  {zaloMeta.locked ? zaloMeta.label : (isApprovingZaloSend ? 'Đang duyệt...' : (zaloMeta.wakeable ? 'Gửi ngay' : (zaloPreviewOrder.zaloSendStatus === 'failed' || zaloPreviewOrder.zaloSendStatus === 'cancelled' ? 'Gửi lại' : 'Duyệt gửi')))}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showOrderSourcePicker && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-[2rem] bg-white p-5 shadow-2xl animate-in zoom-in-95">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-600">Tạo đơn hàng mới</p>
                <h3 className="mt-1 text-lg font-black text-slate-900">Chọn cách lên đơn</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">Chọn nguồn dữ liệu trước, app sẽ mở đúng màn cần dùng để tránh rối mắt.</p>
              </div>
              <button type="button" onClick={() => setShowOrderSourcePicker(false)} className="rounded-2xl bg-slate-100 p-3 text-slate-500">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              {canUseWarehouseOrderSource && (
                <button
                  type="button"
                  onClick={() => handleChooseOrderCreationSource('warehouse')}
                  className="flex w-full items-center gap-3 rounded-3xl border border-violet-100 bg-violet-50 p-4 text-left transition active:scale-[0.99]"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-200">
                    <ClipboardList size={20} />
                  </span>
                  <span>
                    <span className="block text-sm font-black text-slate-900">Phiếu xuất kho</span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-500">Chọn ngày phiếu xuất rồi rà soát đơn nháp trước khi tạo.</span>
                  </span>
                </button>
              )}

              {canUseImageOrderSource && (
                <button
                  type="button"
                  onClick={() => handleChooseOrderCreationSource('image')}
                  className="flex w-full items-center gap-3 rounded-3xl border border-sky-100 bg-sky-50 p-4 text-left transition active:scale-[0.99]"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-lg shadow-sky-200">
                    <Camera size={20} />
                  </span>
                  <span>
                    <span className="block text-sm font-black text-slate-900">Chụp ảnh sổ</span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-500">Chụp hoặc chọn ảnh có sẵn để AI tách đơn nháp.</span>
                  </span>
                </button>
              )}

              {canUseManualOrderSource && (
                <button
                  type="button"
                  onClick={() => handleChooseOrderCreationSource('manual')}
                  className="flex w-full items-center gap-3 rounded-3xl border border-emerald-100 bg-emerald-50 p-4 text-left transition active:scale-[0.99]"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-200">
                    <Edit3 size={20} />
                  </span>
                  <span>
                    <span className="block text-sm font-black text-slate-900">Thủ công</span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-500">Mở mẫu tạo đơn hiện tại để nhập khách, sản phẩm và thanh toán.</span>
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showAddOrder && (
         <div className="hd-fullscreen-layer hd-order-create-layer fixed inset-0 z-[70] flex flex-col bg-gray-50 animate-in slide-in-from-bottom">
            <HDHeader className="hd-safe-header bg-blue-600 text-white p-4 flex items-center justify-between shrink-0 shadow-sm">
               <div>
                 <h2 className="font-bold text-lg">
                   {orderCreationSource === 'warehouse' ? 'Lên đơn từ phiếu xuất kho' : orderCreationSource === 'image' ? 'Lên đơn bằng hình ảnh' : 'Tạo đơn thủ công'}
                 </h2>
                 <button
                   type="button"
                   onClick={() => {
                     setShowAddOrder(false);
                     setShowOrderSourcePicker(true);
                   }}
                   className="mt-1 text-xs font-bold text-blue-100 underline decoration-blue-200 underline-offset-4"
                 >
                   Đổi cách tạo đơn
                 </button>
               </div>
               <button onClick={closeAddOrderModal} className="hover:bg-blue-700 p-1 rounded-full"><X size={24}/></button>
            </HDHeader>
            
             <div className="hd-order-create-content min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-3 sm:px-4">
                <form id="order-form" onSubmit={handleAddSubmit} className="mx-auto max-w-lg space-y-3 pb-44 sm:pb-6">
                {errorMsg && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 font-medium border border-red-100">{errorMsg}</div>}
                <input ref={bulkOrderImageInputRef} type="file" accept="image/*" capture="environment" onChange={handleNotebookImageUpload} className="hidden" />

                {orderCreationSource !== 'manual' && (
                <div className="space-y-3 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-emerald-50 p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-extrabold tracking-[0.22em] uppercase text-indigo-600">
                        {orderCreationSource === 'warehouse' ? 'Phiếu xuất kho' : 'AI đọc ảnh'}
                      </p>
                       {orderCreationSource !== 'warehouse' && (
                         <h3 className="mt-1 text-base font-bold text-slate-900">Tạo đơn hàng loạt từ ảnh sổ sách</h3>
                       )}
                      <p className="text-xs text-slate-500 mt-1 leading-5">
                        {orderCreationSource === 'warehouse'
                          ? 'Chọn ngày phiếu xuất kho, app sẽ gom theo khách và tạo đơn nháp để kế toán rà soát trước khi lưu.'
                          : 'Chụp ảnh sổ bán hàng hoặc chọn ảnh có sẵn, AI sẽ tách tên khách, hàng hóa, số lượng và đơn giá thành từng đơn nháp.'}
                      </p>
                    </div>
                    <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200">
                      {orderCreationSource === 'warehouse' ? <ClipboardList size={18} /> : isBulkOrderScanning ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                    </div>
                  </div>

                  {orderCreationSource === 'warehouse' ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-[1fr_auto] gap-2 rounded-2xl border border-violet-100 bg-white/80 p-2">
                        <input
                          type="date"
                          value={selectedWarehouseDispatchDate}
                          onChange={(event) => {
                            setSelectedWarehouseDispatchDate(event.target.value || getTodayString());
                            setBulkOrderDrafts([]);
                            setBulkOrderStatus('');
                          }}
                          className="min-w-0 rounded-xl border border-violet-100 bg-white px-3 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-violet-500"
                        />
                        <button
                          type="button"
                          disabled={isBulkOrderScanning || isBulkOrderSubmitting}
                          onClick={handleLoadWarehouseDispatchDrafts}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-violet-200 disabled:opacity-60"
                        >
                          <ClipboardList size={16} />
                          Lấy phiếu
                        </button>
                      </div>
                      <div className="rounded-2xl border border-violet-100 bg-white/80 px-3 py-2 text-[11px] leading-5 text-slate-600">
                        Ngày {formatDateLabel(dispatchDate)}: <span className="font-bold text-slate-900">{todayWarehouseDispatches.length}</span> dòng phiếu.
                        Chưa lên đơn: <span className="font-bold text-violet-700">{pendingWarehouseDispatches.length}</span> dòng.
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isBulkOrderScanning || isBulkOrderSubmitting}
                      onClick={() => bulkOrderImageInputRef.current?.click()}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200 disabled:opacity-60"
                    >
                      {isBulkOrderScanning ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                      {isBulkOrderScanning ? 'AI đang đọc ảnh...' : 'Chụp / chọn ảnh sổ sách'}
                    </button>
                  )}

                  {bulkOrderStatus && (
                    <div
                      className={`rounded-2xl border px-3 py-2 text-xs leading-5 font-medium ${
                        /dừng|không|chưa/i.test(bulkOrderStatus)
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {bulkOrderStatus}
                    </div>
                  )}

                  {bulkOrderDrafts.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{bulkOrderDrafts.length} đơn nháp chờ rà soát</p>
                          <p className="text-[11px] text-slate-500 mt-1">Sửa trực tiếp khách, mặt hàng, số lượng tính tiền và đơn giá rồi bấm tạo hàng loạt.</p>
                        </div>
                        <button
                          type="button"
                          disabled={isBulkOrderScanning || isBulkOrderSubmitting}
                          onClick={handleSubmitBulkOrders}
                          className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-200 disabled:opacity-60"
                        >
                          {isBulkOrderSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                          Tạo {bulkOrderDrafts.length} đơn
                        </button>
                      </div>

                      {bulkOrderDrafts.map((draft, draftIndex) => {
                        const draftTotal = (draft.items || []).reduce((sum, item) => sum + getOrderItemBillingPresentation(item).amount, 0);
                        const matchedCustomer = draft.customerId ? customers.find((customer) => customer.id === draft.customerId) : null;
                        const draftSubtotal = draftTotal;
                        const feeAmount = parseLooseMoneyValue(draft.extraExpenseAmount);
                        const customerFee = draft.extraExpensePayer === 'buyer' ? feeAmount : draft.extraExpensePayer === 'shared' ? feeAmount / 2 : 0;
                        const reviewTotal = Math.max(0, draftSubtotal - parseLooseMoneyValue(draft.discount) + customerFee);
                        const paidAmount = parseLooseMoneyValue(draft.upfrontPayment);
                        const remainingAmount = Math.max(0, reviewTotal - paidAmount);
                        const feeLabel = draft.extraExpenseName || 'Phí';
                        return (
                          <div key={draft.localId} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                            <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-slate-50 to-emerald-50 px-4 py-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-black uppercase tracking-[0.12em] text-emerald-700">Đơn nháp {draftIndex + 1}</p>
                                <input
                                  type="text"
                                  value={draft.customerName}
                                  onChange={(e) => handleBulkDraftChange(draft.localId, 'customerName', capitalizeFirst(e.target.value))}
                                  className="mt-1 w-full min-w-0 border-0 bg-transparent p-0 text-lg font-black text-slate-950 outline-none placeholder:text-slate-300"
                                  placeholder="Tên khách hàng"
                                  aria-label="Tên khách hàng"
                                />
                                {(draft.branchName || draft.customerBranchName) && (
                                  <p className="mt-1 inline-flex max-w-full rounded-full bg-sky-50 px-2 py-1 text-[11px] font-black text-sky-700">
                                    CN: {draft.branchName || draft.customerBranchName}
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveBulkDraft(draft.localId)}
                                className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-500 hover:bg-rose-100"
                                aria-label="Xóa đơn nháp"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>

                            <div className="px-3 py-3">
                              <div className="overflow-hidden rounded-2xl border border-slate-200">
                                <div className="grid min-w-full grid-cols-[minmax(0,1.45fr)_minmax(5.5rem,.85fr)_minmax(5.5rem,.8fr)] items-stretch bg-slate-50 text-center text-[10px] font-black uppercase tracking-wide leading-4 text-slate-500">
                                  <div className="flex min-h-12 items-center justify-center border-r border-slate-200 px-2 py-2">Sản phẩm</div>
                                  <div className="flex min-h-12 items-center justify-center border-r border-slate-200 px-1.5 py-2">SL tính tiền</div>
                                  <div className="flex min-h-12 items-center justify-center px-1.5 py-2">Đơn giá</div>
                                </div>

                                {(draft.items || []).map((item, itemIndex) => {
                                  const billingPresentation = getOrderItemBillingPresentation(item);
                                  return (
                                    <div key={`${draft.localId}_${itemIndex}`} className="grid min-w-full grid-cols-[minmax(0,1.45fr)_minmax(5.5rem,.85fr)_minmax(5.5rem,.8fr)] items-stretch border-t border-slate-200 text-[12px] leading-4">
                                      <div className="relative flex min-h-[4.75rem] min-w-0 items-end border-r border-slate-200 px-1.5 pb-1.5 pt-5">
                                        <select
                                          value={item.productId || ''}
                                          onChange={(e) => handleBulkDraftItemProductChange(draft.localId, itemIndex, e.target.value)}
                                          className="h-10 w-full min-w-0 rounded-xl border border-slate-100 bg-white px-2 pr-6 text-[12px] font-semibold leading-4 text-slate-900 outline-none focus:border-indigo-200 focus:ring-2 focus:ring-indigo-500"
                                          aria-label="Tên sản phẩm"
                                        >
                                          <option value="">{item.description || 'Sản phẩm'}</option>
                                          {activeProducts.map((product) => (
                                            <option key={product.id} value={product.id}>{product.name}</option>
                                          ))}
                                        </select>
                                        {(draft.items || []).length > 1 && (
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveBulkDraftItem(draft.localId, itemIndex)}
                                            className="absolute right-0.5 top-0.5 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-500 shadow-sm"
                                            aria-label="Xóa dòng hàng"
                                          >
                                            <X size={11} />
                                          </button>
                                        )}
                                      </div>
                                      <div className="relative flex min-h-[4.75rem] items-end border-r border-slate-200 px-1.5 pb-1.5 pt-5">
                                        <span className="pointer-events-none absolute inset-x-0 top-1 text-center text-[10px] font-bold text-slate-400">
                                          {billingPresentation.billingUnit || 'ĐV'}
                                        </span>
                                        <input
                                          type="number"
                                          step="0.01"
                                          value={item.billingQuantity ?? item.pricingQuantity ?? item.quantity}
                                          onChange={(e) => handleBulkDraftItemChange(draft.localId, itemIndex, 'billingQuantity', e.target.value)}
                                          className="weight-entry-input h-10 w-full min-w-0 rounded-xl border border-slate-100 bg-white px-1 text-center text-[12px] font-semibold leading-4 tabular-nums text-slate-900 outline-none focus:border-indigo-200 focus:ring-2 focus:ring-indigo-500"
                                          placeholder="0"
                                          aria-label={`Số lượng tính tiền (${billingPresentation.billingUnit || 'đơn vị'})`}
                                        />
                                      </div>
                                      <div className="flex min-h-[4.75rem] items-end px-1.5 pb-1.5 pt-5">
                                        <input
                                          type="tel"
                                          value={formatInputCurrency(item.unitPrice)}
                                          onChange={(e) => handleBulkDraftItemChange(draft.localId, itemIndex, 'unitPrice', parseInputCurrency(e.target.value))}
                                          className="h-10 w-full min-w-0 rounded-xl border border-slate-100 bg-white px-1.5 text-center text-[12px] font-semibold leading-4 tabular-nums text-slate-900 outline-none focus:border-indigo-200 focus:ring-2 focus:ring-indigo-500"
                                          placeholder="Giá"
                                          aria-label="Đơn giá"
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="mt-2 flex items-center justify-between">
                                <button
                                  type="button"
                                  onClick={() => handleAddBulkDraftItem(draft.localId)}
                                  className="inline-flex h-9 items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-3 text-[12px] font-black text-emerald-700"
                                >
                                  <Plus size={13} />
                                  Dòng
                                </button>
                              </div>

                              <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-3">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-[12px] font-black uppercase tracking-wide text-slate-500">Tổng tiền</span>
                                  <strong className="text-lg font-black text-slate-950">{formatCurrency(reviewTotal)} đ</strong>
                                </div>
                                <div
                                  className="mt-2 grid grid-cols-3 items-stretch gap-2 text-center text-[12px] font-bold"
                                >
                                  <label className="flex min-h-16 cursor-text flex-col items-center justify-center rounded-2xl border border-emerald-100 bg-white px-2 py-2 text-slate-600">
                                    <span className="block text-[12px] uppercase tracking-wide text-slate-400">Cọc</span>
                                    <input
                                      type="tel"
                                      inputMode="numeric"
                                      aria-label="Tiền cọc"
                                      value={formatInputCurrency(paidAmount)}
                                      onChange={(e) => handleBulkDraftChange(draft.localId, 'upfrontPayment', parseInputCurrency(e.target.value))}
                                      className="mt-1 block h-5 w-full min-w-0 bg-transparent text-center text-[12px] font-black tabular-nums text-emerald-700 outline-none placeholder:text-emerald-300"
                                      placeholder="0"
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => openBulkDraftFeeEditor(draft)}
                                    className="flex min-h-16 flex-col items-center justify-center rounded-2xl border border-amber-100 bg-white px-2 py-2 text-center text-slate-600"
                                  >
                                    <span className="block text-[12px] uppercase tracking-wide text-slate-400">{feeLabel}</span>
                                    <span className="mt-1 block w-full truncate text-[12px] text-amber-700">{feeAmount > 0 ? `${formatCurrency(feeAmount)} đ` : 'Thêm phí'}</span>
                                  </button>
                                  <div
                                    className="flex min-h-16 flex-col items-center justify-center rounded-2xl border border-slate-100 bg-white px-2 py-2 text-center text-slate-600"
                                  >
                                    <span className="block text-[12px] uppercase tracking-wide text-slate-400">Còn lại</span>
                                    <span className="mt-1 block w-full truncate text-[12px] text-slate-950">{formatCurrency(remainingAmount)} đ</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                        
                      })}

                      <button
                        type="button"
                        disabled={isBulkOrderScanning || isBulkOrderSubmitting}
                        onClick={handleSubmitBulkOrders}
                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-4 text-sm font-bold text-white shadow-lg shadow-emerald-200 disabled:opacity-60"
                      >
                        {isBulkOrderSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                        Tạo {bulkOrderDrafts.length} đơn hàng loạt
                      </button>
                    </div>
                  )}
                </div>
                )}

                {orderCreationSource === 'manual' && (
                <>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">1. Khách hàng *</label>
                  <div className="flex gap-2 items-center">
                    <div data-search-zone="true" className="relative flex-1">
                      <Search size={18} className="absolute left-3 top-3 text-gray-400" />
                      <input data-hd-search-input="true" type="text" value={searchCus} onChange={e => { setSearchCus(e.target.value); setShowCusDropdown(true); setNewOrder({...newOrder, customerId: ''}); }} onFocus={() => setShowCusDropdown(true)} className="w-full border border-gray-300 p-2.5 pl-10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Tìm tên khách hàng..." />
                      {showCusDropdown && (
                        <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                          {filteredCustomers.map(c => (
                            <li key={c.id} onClick={() => { setNewOrder({...newOrder, customerId: c.id}); setSearchCus(c.name); setShowCusDropdown(false); }} className="p-3 text-sm hover:bg-blue-50 cursor-pointer border-b border-gray-50">
                              <span className="font-semibold block text-gray-800">{c.name}</span><span className="text-[10px] text-gray-500">{c.phone || c.address}</span>
                            </li>
                          ))}
                          {filteredCustomers.length === 0 && <li className="p-3 text-sm text-gray-500 text-center">Không tìm thấy</li>}
                        </ul>
                      )}
                    </div>
                    <button type="button" onClick={() => setShowQuickAddCus(true)} className="bg-emerald-50 text-emerald-600 px-3.5 py-2.5 rounded-xl border border-emerald-200 flex items-center justify-center font-bold hover:bg-emerald-100 transition-colors shrink-0">
                      <Plus size={20} />
                    </button>
                  </div>
                  {newOrder.customerId && (
                     <div className="mt-3 p-2.5 bg-blue-50 border border-blue-100 rounded-lg flex justify-between items-center">
                        <span className="text-sm font-semibold text-blue-800 flex items-center gap-2"><CheckCircle size={16}/> Đã chọn: {customers.find(c => c.id === newOrder.customerId)?.name}</span>
                        <button type="button" onClick={() => {setNewOrder({...newOrder, customerId: ''}); setSearchCus('');}}><X size={16} className="text-blue-500 hover:text-blue-700"/></button>
                     </div>
                  )}
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-xs font-bold text-gray-500 uppercase">2. Sản phẩm</label>
                    <button type="button" onClick={handleAddItem} className="text-xs text-blue-600 font-semibold flex items-center bg-blue-50 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"><Plus size={14} className="mr-1"/> Thêm dòng</button>
                  </div>
                  <div className="space-y-3">
                    {newOrder.items.map((item, index) => (
                      <div key={index} className="relative bg-gray-50 p-3 rounded-xl border border-gray-100">
                        {newOrder.items.length > 1 && <button type="button" onClick={() => handleRemoveItem(index)} className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1.5 hover:bg-red-200 shadow-sm"><X size={14}/></button>}
                        <select value={item.productId || ''} onChange={e=>handleItemProductChange(index, e.target.value)} className="w-full border border-gray-200 p-2.5 rounded-lg text-sm outline-none bg-white mb-2 focus:ring-2 focus:ring-blue-500">
                          <option value="">-- Chọn nhanh từ kho --</option>
                          {activeProducts.map(p => <option key={p.id} value={p.id}>{p.name} ({formatCurrency(p.sellingPrice)})</option>)}
                        </select>
                        {item.description && <p className="text-sm font-semibold text-gray-700 mb-2">{item.description}</p>}
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <input required type="number" step="0.01" placeholder="Số lượng" value={item.quantity} onChange={e=>handleItemChange(index, 'quantity', e.target.value)} className="w-full border border-gray-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                          <input required type="tel" placeholder="Giá bán (VNĐ)" value={formatInputCurrency(item.unitPrice)} onChange={e=>handleItemChange(index, 'unitPrice', parseInputCurrency(e.target.value))} className="w-full border border-gray-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="text-right text-xs text-blue-600 font-semibold mt-3 pt-3 border-t border-dashed border-gray-200">Tạm tính: {formatCurrency(getTransactionBillingPresentation(item).amount)} đ</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-3">3. Thanh toán & Phụ phí</label>
                  <div className="flex justify-between items-center mb-2"><span className="text-sm text-gray-600">Tổng tiền hàng:</span><span className="font-semibold">{formatCurrency(subTotal)} đ</span></div>
                  <div className="flex justify-between items-center mb-3 pb-3 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Giảm giá / C.Khấu:</span>
                    <input type="tel" value={formatInputCurrency(newOrder.discount)} onChange={e=>setNewOrder({...newOrder, discount: parseInputCurrency(e.target.value)})} className="w-1/2 border border-gray-200 p-2 rounded-lg text-sm text-right outline-none focus:ring-2 focus:ring-blue-500" placeholder="0 ₫" />
                  </div>

                  <div className="mb-4 bg-gray-50 p-3 rounded-xl border border-gray-200">
                    <p className="text-xs font-bold text-gray-700 mb-2">Chi phí khác (Vận chuyển, thùng xốp...)</p>
                    <div className="flex gap-2 mb-2">
                      <input type="text" placeholder="Tên phí (VD: Ship...)" value={newOrder.extraExpenseName} onChange={e=>setNewOrder({...newOrder, extraExpenseName: capitalizeFirst(e.target.value)})} className="flex-1 border border-gray-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                      <input type="tel" placeholder="Số tiền" value={formatInputCurrency(newOrder.extraExpenseAmount)} onChange={e=>setNewOrder({...newOrder, extraExpenseAmount: parseInputCurrency(e.target.value)})} className="w-1/3 border border-gray-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    {parseFloat(newOrder.extraExpenseAmount) > 0 && (
                      <select value={newOrder.extraExpensePayer} onChange={e=>setNewOrder({...newOrder, extraExpensePayer: e.target.value})} className="w-full border border-gray-200 p-2.5 rounded-lg text-sm outline-none bg-white text-emerald-700 font-medium focus:ring-2 focus:ring-emerald-500">
                        <option value="buyer">Khách chịu phí (+100% vào hóa đơn)</option>
                        <option value="shared">Chia đôi phí (+50% hóa đơn, 50% vào Chi phí)</option>
                        <option value="seller">Shop chịu phí (Tự động hạch toán Chi phí)</option>
                      </select>
                    )}
                  </div>

                  <div className="flex justify-between items-center mb-5 bg-blue-50 p-3 rounded-xl border border-blue-100">
                    <span className="text-sm font-bold text-blue-800">Khách Cần Trả:</span>
                    <span className="text-2xl font-black text-blue-600">{formatCurrency(totalAmount)} đ</span>
                  </div>
                  
                  <div className="bg-orange-50 p-3.5 rounded-xl border border-orange-100 mb-4">
                    <p className="text-xs font-bold text-orange-700 mb-2 flex items-center"><DollarSign size={14} className="mr-1"/> Khách trả trước / Đặt cọc</p>
                    <input type="tel" value={formatInputCurrency(newOrder.upfrontPayment)} onChange={e=>setNewOrder({...newOrder, upfrontPayment: parseInputCurrency(e.target.value)})} className="w-full border border-orange-200 p-2.5 rounded-lg text-sm mb-2 outline-none focus:ring-2 focus:ring-orange-400 bg-white" placeholder="Nhập số tiền đã nhận..." />
                    {parseFloat(newOrder.upfrontPayment) > 0 && (
                      <select value={newOrder.paymentMethod} onChange={e=>setNewOrder({...newOrder, paymentMethod: e.target.value})} className="w-full border border-orange-200 p-2.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                        <option>Chuyển khoản</option><option>Tiền mặt</option><option>Tài xế thu hộ</option>
                      </select>
                    )}
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-500 font-bold uppercase">Ngày lập đơn</span>
                    <input required type="date" value={newOrder.date} onChange={e=>setNewOrder({...newOrder, date: e.target.value})} className="w-full border border-gray-300 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                  </div>
                </div>
               </>
               )}
              </form>
            </div>

            {bulkFeeEditorDraftId && (() => {
              const editingDraft = bulkOrderDrafts.find((draft) => draft.localId === bulkFeeEditorDraftId);
              if (!editingDraft) return null;
              const draftFeeAmount = parseLooseMoneyValue(bulkFeeDraft.amount);
              const draftCustomerFee = bulkFeeDraft.payer === 'buyer' ? draftFeeAmount : bulkFeeDraft.payer === 'shared' ? draftFeeAmount / 2 : 0;
              const draftSellerFee = bulkFeeDraft.payer === 'seller' ? draftFeeAmount : bulkFeeDraft.payer === 'shared' ? draftFeeAmount / 2 : 0;
              const payerOptions = [
                { id: 'buyer', title: 'Khách chịu', desc: 'Cộng vào hóa đơn', tone: 'emerald' },
                { id: 'shared', title: 'Chia đôi', desc: 'Khách và DN cùng chịu', tone: 'sky' },
                { id: 'seller', title: 'Công ty chịu', desc: 'Ghi vào chi phí', tone: 'rose' }
              ];

              return (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 px-3 py-5 pb-[calc(96px+env(safe-area-inset-bottom))] sm:p-4" role="dialog" aria-modal="true" aria-labelledby="bulk-fee-editor-title">
                  <form
                    onSubmit={(event) => { event.preventDefault(); saveBulkDraftFeeEditor(); }}
                    onClick={(event) => event.stopPropagation()}
                    className="max-h-[calc(100dvh-150px)] w-full max-w-md overflow-y-auto rounded-[32px] bg-white p-5 shadow-2xl"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-600">Chi phí khác</p>
                        <h3 id="bulk-fee-editor-title" className="mt-1 text-xl font-black text-slate-950">Thêm phí cho đơn nháp</h3>
                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">Nhập tên phí, số tiền và người chịu phí. Thay đổi chỉ áp dụng cho đơn nháp đang rà soát.</p>
                      </div>
                      <button type="button" onClick={closeBulkDraftFeeEditor} className="shrink-0 rounded-full bg-slate-100 p-2 text-slate-500" aria-label="Đóng bảng thêm phí">
                        <X size={18} />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Tên phí</label>
                        <input
                          autoFocus
                          value={bulkFeeDraft.name}
                          onChange={(event) => setBulkFeeDraft(prev => ({ ...prev, name: capitalizeFirst(event.target.value) }))}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                          placeholder="Ví dụ: Vận chuyển, thùng xốp..."
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Số tiền phí</label>
                        <input
                          inputMode="numeric"
                          value={formatInputCurrency(bulkFeeDraft.amount)}
                          onChange={(event) => setBulkFeeDraft(prev => ({ ...prev, amount: parseInputCurrency(event.target.value) }))}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-lg font-black text-slate-950 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                          placeholder="0 đ"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-[11px] font-black uppercase tracking-wide text-slate-500">Ai chịu phí?</label>
                        <div className="grid grid-cols-3 gap-2">
                          {payerOptions.map(option => {
                            const active = bulkFeeDraft.payer === option.id;
                            const activeClasses = option.tone === 'emerald'
                              ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                              : option.tone === 'rose'
                                ? 'border-rose-400 bg-rose-50 text-rose-700'
                                : 'border-sky-400 bg-sky-50 text-sky-700';
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => setBulkFeeDraft(prev => ({ ...prev, payer: option.id }))}
                                className={`rounded-2xl border px-2 py-3 text-center transition-all ${active ? activeClasses : 'border-slate-200 bg-white text-slate-500'}`}
                              >
                                <span className="block text-[11px] font-black">{option.title}</span>
                                <span className="mt-1 block text-[9px] font-bold opacity-80">{option.desc}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 rounded-3xl bg-slate-50 p-2">
                        <div className="rounded-2xl bg-white px-3 py-2 text-center shadow-sm">
                          <p className="text-[10px] font-black uppercase text-slate-400">Cộng hóa đơn</p>
                          <p className="mt-1 text-sm font-black text-emerald-700">{formatCurrency(draftCustomerFee)} đ</p>
                        </div>
                        <div className="rounded-2xl bg-white px-3 py-2 text-center shadow-sm">
                          <p className="text-[10px] font-black uppercase text-slate-400">Chi phí DN</p>
                          <p className="mt-1 text-sm font-black text-rose-600">{formatCurrency(draftSellerFee)} đ</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-[0.9fr_1.2fr] gap-3">
                      <button type="button" onClick={closeBulkDraftFeeEditor} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-600">Hủy</button>
                      <button type="submit" className="rounded-2xl bg-gradient-to-r from-amber-500 to-emerald-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-amber-200">Lưu phí</button>
                    </div>
                    {parseLooseMoneyValue(editingDraft.extraExpenseAmount) > 0 && (
                      <button type="button" onClick={() => saveBulkDraftFeeEditor(0)} className="mt-3 w-full rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-black text-rose-600">Xóa phí khỏi đơn nháp</button>
                    )}
                  </form>
                </div>
              );
            })()}

            {orderCreationSource === 'manual' && (
            <div className="mobile-order-action-bar bg-white px-4 pt-3 border-t border-gray-100 shadow-[0_-4px_15px_rgba(0,0,0,0.05)] shrink-0">
              <div className="max-w-lg mx-auto">
                <button type="submit" form="order-form" disabled={isBulkOrderSubmitting} className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold shadow-lg shadow-blue-600/30 hover:bg-blue-700 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60">{isBulkOrderSubmitting ? 'Đang lưu...' : 'Xác Nhận Tạo Đơn Hàng'}</button>
              </div>
            </div>
            )}

            {showQuickAddCus && (
              <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl p-5 w-full max-w-sm">
                  <h3 className="font-bold text-lg mb-4 text-gray-800">Thêm Khách Hàng Nhanh</h3>
                  <form onSubmit={handleQuickAddCustomer} className="space-y-4">
                    <input required type="text" value={newCus.name} onChange={e=>setNewCus({...newCus, name: toTitleCasePreservingSpacing(e.target.value)})} className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm" placeholder="Tên khách hàng / Công ty *" />
                    <input required type="tel" value={newCus.phone} onChange={e=>setNewCus({...newCus, phone: e.target.value})} className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm" placeholder="Số điện thoại *" />
                    <input type="text" value={newCus.address} onChange={e=>setNewCus({...newCus, address: toTitleCase(e.target.value)})} className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm" placeholder="Địa chỉ giao hàng" />
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Nhóm KH</label>
                      <input type="text" value={newCus.customerGroup} onChange={e=>setNewCus({...newCus, customerGroup: toTitleCase(e.target.value)})} className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm" placeholder="Ví dụ: Đại lý, VIP, Tạp hóa" />
                    </div>
                    {!isSales && (
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Nhân viên kinh doanh phụ trách</label>
                        <select required value={newCus.empId} onChange={e=>setNewCus({...newCus, empId: e.target.value})} className="w-full border p-3 rounded-xl outline-none bg-white text-sm">
                          <option value="">-- Chọn nhân viên kinh doanh --</option>
                          {salesEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                      </div>
                    )}
                    
                    <div className="flex gap-2 pt-2">
                      <button type="button" onClick={()=>setShowQuickAddCus(false)} className="flex-1 bg-gray-100 text-gray-600 py-3.5 rounded-xl font-bold transition-colors">Hủy</button>
                      <button type="submit" className="flex-[2] bg-emerald-500 text-white py-3.5 rounded-xl font-bold transition-colors shadow-md shadow-emerald-500/30">Lưu Khách Hàng</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
         </div>
      )}
    </div>
  );
}
  return OrderManagementView;
}
