import { useState, useEffect, useMemo, useRef } from "react";
import { useCallback } from "react";
import { buildDeliveryRequestIndex, getDeliveryRecordLookup } from "../../utils/deliveryRequestIndex.js";
import { buildCustomerDirectionsUrl } from "../../utils/customerLocationDirections.js";
import { createRecordCalculationCache } from "../../services/recordCalculationCache.js";
import { buildCustomerProductBillingSnapshot, calculateBillableAmount, isCustomerProductUnitAllowed, isSameBillingUnit, resolveTransactionBillingSnapshot } from "../../services/customerProductBilling.js";
import { normalizeProductPricingUnit } from "../../services/productPricingUnits.js";
import { sortProjection } from "../../services/cooperativeProjection.js";
import { useCooperativeProjection } from "../../hooks/useCooperativeProjection.js";
import { DELIVERY_RECONCILIATION_INITIAL_CUSTOMER_LIMIT, buildPendingDeliveryReconciliationGroups, calculateDeliveryActualCollectionTotal, countPendingDeliveryReconciliationDispatches, getVisibleDeliveryReconciliationGroups, resolveDeliveryCollectionDraftAmount } from "../../utils/deliveryReconciliationUx.js";
import { createDeliverySavePlan } from "../../utils/deliverySavePlan.js";
import { X, CheckCircle, Phone, ChevronDown, ChevronUp, Lock, MapPin, Search, ClipboardList, Send } from "lucide-react";
// Transitional bundle boundary. Only stable local module bindings are injected;
// all actor/company/business data continues to arrive through current props.
// Generated binding contract is checked against the real source AST.
export function createDeliveryReportView(runtime) {
  const {APP_SCREEN_BACK_EVENT,CASHFLOW_APPROVAL_STATUS,DeliveryReconciliationCard,RETURN_GOODS_STATUS_LABELS,areLooseQuantityValuesClose,buildCustomerReconciledLedger,canvasToBlob,capitalizeFirst,collapseLookupText,drawRoundedRect,formatCompactDateLabel,formatCurrency,formatInputCurrency,formatNumber,formatOrderCode,getCompactProductName,getCustomerBranchProductConfigSource,getCustomerLocationDisplayText,getCustomerProductPrice,getCustomerProductPricingUnit,getDeliveryAssignmentIds,getDeliveryProjectionEntry,getDeliveryReportWeightStatus,getEntityTimestamp,getFriendlyFirebaseErrorMessage,getOrderLineQuantityValue,getOrderLineSizeLabel,getOrderLineUnitPriceValue,getOrderLineWeightKgValue,getOrderReturnGoodsRecords,getOrderReturnProductSummary,getPrimaryDeliveryAssignmentId,getProductShortName,getTodayString,isEmployeeDeliveryParticipant,markAppBackHandled,normalizeExpenseCategoryLabel,normalizeLeadingLabel,normalizeLookupText,parseDateInputValue,parseInputCurrency,parseLooseMoneyValue,parseLooseQuantityValue,readImageFileAsDataUrl,resolveCustomerProductBillingConfiguration,resolveEntityDateKey,shareBlobFile,shareTextContent,summarizeOrderReturnGoods,useDismissSearchOnOutsideClick,wrapCanvasText} = runtime;
  function DeliveryReportView({ employee, customers = [], products = [], orderRequests = [], orders = [], payments = [], warehouseImports = [], warehouseDispatches = [], deliveryReports = [], expenses = [], assets = [], assetCostLogs = [], onAddDeliveryReport, onUpdateDeliveryReport, onSaveDeliveryCommand, onEditOrder, onAddPayment, onAddExpense, onAddAssetCostLog, onEditAssetCostLog, canViewDeliveryReports = true, canCreateDeliveryReport = true, canEditDeliveryReport = false, canDeleteDeliveryReport = false, canUploadDeliveryPhoto = true, canDeleteOldDeliveryPhotos = false, canRecordDeliveryIncome = false, canRecordDeliveryExpense = false, canCreateAssetCostLog = false, canEditAssetCostLog = false }) {
  const [workingDate, setWorkingDate] = useState(getTodayString());
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedDispatchId, setSelectedDispatchId] = useState('');
  const [actualWeight, setActualWeight] = useState('');
  const [actualQuantity, setActualQuantity] = useState('');
  const [actualPackageCount, setActualPackageCount] = useState('');
  const [actualQuantityUnit, setActualQuantityUnit] = useState('Con');
  const [actualRows, setActualRows] = useState([]);
  const [note, setNote] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [collectedAmount, setCollectedAmount] = useState('');
  const [collectedAmountManuallyEdited, setCollectedAmountManuallyEdited] = useState(false);
  const [collectedMethod, setCollectedMethod] = useState('Tiền mặt');
  const [deliveryExpenseAmount, setDeliveryExpenseAmount] = useState('');
  const [deliveryExpenseCategory, setDeliveryExpenseCategory] = useState('');
  const [deliveryExpenseAssetId, setDeliveryExpenseAssetId] = useState('');
  const [deliveryExpenseAssetTouched, setDeliveryExpenseAssetTouched] = useState(false);
  const [deliveryExpenseKmAt, setDeliveryExpenseKmAt] = useState('');
  const [deliveryExpenseLiters, setDeliveryExpenseLiters] = useState('');
  const [deliveryExpenseUnitPrice, setDeliveryExpenseUnitPrice] = useState('');
  const [standaloneExpenseNote, setStandaloneExpenseNote] = useState('');
  const [standaloneExpensePhotoUrl, setStandaloneExpensePhotoUrl] = useState('');
  const [customStandaloneExpenseCategories, setCustomStandaloneExpenseCategories] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem('hd_delivery_standalone_expense_categories');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  });
  const [showIncomeReportSection, setShowIncomeReportSection] = useState(false);
  const [showExpenseReportSection, setShowExpenseReportSection] = useState(false);
  const [showReturnReportSection, setShowReturnReportSection] = useState(false);
  const [showShippingReportSection, setShowShippingReportSection] = useState(false);
  const [returnWeight, setReturnWeight] = useState('');
  const [returnQuantity, setReturnQuantity] = useState('');
  const [returnQuantityUnit, setReturnQuantityUnit] = useState('Con');
  const [returnPhotoUrl, setReturnPhotoUrl] = useState('');
  const [shippingAmount, setShippingAmount] = useState('');
  const [shippingNote, setShippingNote] = useState('');
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [selectedReportCustomerKey, setSelectedReportCustomerKey] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [statusTone, setStatusTone] = useState('emerald');
  const [editingReportId, setEditingReportId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const deliverySaveInFlightRef = useRef(false);
  const deliveryCommandIdRef = useRef('');
  const standaloneExpenseCommandIdRef = useRef('');
  const reconciliationExpandedSessionKey = `hd_delivery_reconciliation_expanded:${employee?.id || 'shared'}`;
  const [isReconciliationExpanded, setIsReconciliationExpanded] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.sessionStorage.getItem(`hd_delivery_reconciliation_expanded:${employee?.id || 'shared'}`) === '1';
    } catch {
      return false;
    }
  });
  const [optimisticallyReportedDispatchIds, setOptimisticallyReportedDispatchIds] = useState(() => new Set());
  const [leavingReconciliationGroups, setLeavingReconciliationGroups] = useState(() => new Map());
  const [isReadingPhoto, setIsReadingPhoto] = useState(false);
  const [isReadingReturnPhoto, setIsReadingReturnPhoto] = useState(false);
  const [isReadingStandaloneExpensePhoto, setIsReadingStandaloneExpensePhoto] = useState(false);
  const photoInputRef = useRef(null);
  const returnPhotoInputRef = useRef(null);
  const standaloneExpensePhotoInputRef = useRef(null);
  const deliveryReportFormRef = useRef(null);
  const openPendingReconciliationGroupRef = useRef(null);
  const reconciliationExitTimersRef = useRef(new Set());
  const deliveryFormScrollTimerRef = useRef(null);
  const handleOpenPendingReconciliationGroup = useCallback((groupKey) => {
    openPendingReconciliationGroupRef.current?.(groupKey);
  }, []);
  const toggleReconciliationExpanded = useCallback(() => {
    setIsReconciliationExpanded((current) => {
      const next = !current;
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem(reconciliationExpandedSessionKey, next ? '1' : '0');
        } catch {}
      }
      return next;
    });
  }, [reconciliationExpandedSessionKey]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      setIsReconciliationExpanded(window.sessionStorage.getItem(reconciliationExpandedSessionKey) === '1');
    } catch {
      setIsReconciliationExpanded(false);
    }
  }, [reconciliationExpandedSessionKey]);
  useEffect(() => {
    reconciliationExitTimersRef.current.forEach(timerId => window.clearTimeout(timerId));
    reconciliationExitTimersRef.current.clear();
    setOptimisticallyReportedDispatchIds(new Set());
    setLeavingReconciliationGroups(new Map());
  }, [workingDate]);
  useEffect(() => () => {
    if (typeof window === 'undefined') return;
    reconciliationExitTimersRef.current.forEach(timerId => window.clearTimeout(timerId));
    reconciliationExitTimersRef.current.clear();
    if (deliveryFormScrollTimerRef.current !== null) window.clearTimeout(deliveryFormScrollTimerRef.current);
  }, []);
  const scrollToDeliveryReportForm = () => {
    if (typeof window === 'undefined') return;
    if (deliveryFormScrollTimerRef.current !== null) window.clearTimeout(deliveryFormScrollTimerRef.current);
    deliveryFormScrollTimerRef.current = window.setTimeout(() => {
      deliveryFormScrollTimerRef.current = null;
      deliveryReportFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };
  const deliveryQuantityUnitOptions = ['Con', 'Cái', 'Bộ', 'Bọc', 'Bao', 'Thùng', 'Rổ', 'Can', 'Túi', 'Kg'];

  const deliveryStandaloneExpenseOptions = useMemo(() => {
    const baseOptions = ['Đổ xăng/dầu', 'Mua đá', 'Sửa xe', 'Vé đường', 'Bốc xếp', 'Ăn uống', 'Chi phí khác'];
    return Array.from(new Set([...baseOptions, ...customStandaloneExpenseCategories].filter(Boolean)));
  }, [customStandaloneExpenseCategories]);

  const customerLookup = useMemo(() => getDeliveryRecordLookup(customers), [customers]);
  const productLookup = useMemo(() => getDeliveryRecordLookup(products), [products]);
  const assetLookup = useMemo(() => getDeliveryRecordLookup(assets || []), [assets]);
  const isCurrentEmployeeDeliveryParticipant = isEmployeeDeliveryParticipant(employee);
  const currentEmployeeId = `${employee?.id || ''}`.trim();
  const getDeliveryAssetAssigneeIds = (asset = {}) => [
    asset.driverId,
    asset.assignedDriverId,
    asset.driverEmployeeId,
    asset.assignedEmployeeId,
    asset.employeeId,
    asset.managerId,
    asset.responsibleEmployeeId,
    ...(Array.isArray(asset.driverIds) ? asset.driverIds : []),
    ...(Array.isArray(asset.assignedDriverIds) ? asset.assignedDriverIds : []),
    ...(Array.isArray(asset.assignedEmployeeIds) ? asset.assignedEmployeeIds : [])
  ].map(value => `${value || ''}`.trim()).filter(Boolean);
  const isDeliveryAssetAssignedToCurrentEmployee = (asset = {}) => (
    Boolean(currentEmployeeId) && getDeliveryAssetAssigneeIds(asset).includes(currentEmployeeId)
  );
  const deliveryAssetOptions = useMemo(() => (assets || [])
    .filter(asset => !asset?.isArchived)
    .sort((a, b) => {
      const aAssigned = isDeliveryAssetAssignedToCurrentEmployee(a) ? -1 : 0;
      const bAssigned = isDeliveryAssetAssignedToCurrentEmployee(b) ? -1 : 0;
      return aAssigned - bAssigned || (a.name || '').localeCompare(b.name || '', 'vi');
    }), [assets, currentEmployeeId]);
  const defaultDeliveryAsset = useMemo(() => (
    deliveryAssetOptions.find(asset => isDeliveryAssetAssignedToCurrentEmployee(asset)) || null
  ), [deliveryAssetOptions, currentEmployeeId]);
  const defaultDeliveryAssetId = defaultDeliveryAsset?.id || '';
  useEffect(() => {
    if (!defaultDeliveryAssetId) return;
    if (!editingReportId && !deliveryExpenseAssetTouched && !deliveryExpenseAssetId) {
      setDeliveryExpenseAssetId(defaultDeliveryAssetId);
    }
  }, [
    defaultDeliveryAssetId,
    deliveryExpenseAssetId,
    deliveryExpenseAssetTouched,
    editingReportId,
  ]);
  const formatDeliveryAssetOptionLabel = (asset = {}) => {
    const name = asset.name || asset.vehicleName || asset.vehicleModel || asset.vehicleBrand || asset.type || 'Xe/tài sản';
    const plate = asset.plateNumber || asset.licensePlate || asset.plate || asset.vehiclePlate || '';
    return [name, plate].filter(Boolean).join(' - ');
  };
  const dayDispatches = useMemo(() => {
    const sameDayDispatches = (warehouseDispatches || [])
      .filter(dispatch => !dispatch?.isArchived && resolveEntityDateKey(dispatch, workingDate) === workingDate);
    const visibleDispatches = isCurrentEmployeeDeliveryParticipant && employee?.id
      ? sameDayDispatches.filter(dispatch => getDeliveryAssignmentIds(dispatch).includes(employee.id))
      : sameDayDispatches;
    return visibleDispatches.sort((a, b) => {
      const customerA = customerLookup.get(a.customerId)?.name || a.customerNameSnapshot || '';
      const customerB = customerLookup.get(b.customerId)?.name || b.customerNameSnapshot || '';
      return customerA.localeCompare(customerB, 'vi') || (a.productNameSnapshot || '').localeCompare(b.productNameSnapshot || '', 'vi');
    });
  }, [customerLookup, employee?.id, isCurrentEmployeeDeliveryParticipant, warehouseDispatches, workingDate]);
  const dayReports = useMemo(() => (deliveryReports || [])
    .filter(report => !report?.isArchived && resolveEntityDateKey(report, workingDate) === workingDate), [deliveryReports, workingDate]);
  const dayStandaloneDeliveryExpenses = useMemo(() => (expenses || [])
    .filter(expense => !expense?.isArchived
      && expense?.sourceType === 'driver_delivery_standalone_expense'
      && resolveEntityDateKey(expense, workingDate) === workingDate
      && (!expense.createdByEmployeeId || !employee?.id || expense.createdByEmployeeId === employee.id))
    .sort((a, b) => (getEntityTimestamp(b) || 0) - (getEntityTimestamp(a) || 0)), [employee?.id, expenses, workingDate]);
  const dayDeliveryCollectedTotal = useMemo(() => dayReports.reduce((sum, report) => sum + parseInputCurrency(report.collectedAmount), 0), [dayReports]);
  const dayDeliveryExpenseTotal = useMemo(() => (
    dayReports.reduce((sum, report) => sum + parseInputCurrency(report.deliveryExpenseAmount), 0)
    + dayStandaloneDeliveryExpenses.reduce((sum, expense) => sum + parseInputCurrency(expense.amount), 0)
  ), [dayReports, dayStandaloneDeliveryExpenses]);
  const sumUniqueMoneyValues = (values = []) => Array.from(new Set(
    values.map(value => parseInputCurrency(value)).filter(value => value > 0)
  )).reduce((sum, value) => sum + value, 0);
  const latestReportByDispatch = useMemo(() => {
    const reportMap = new Map();
    dayReports.forEach(report => {
      if (!report.dispatchId) return;
      const previous = reportMap.get(report.dispatchId);
      if (!previous || (getEntityTimestamp(report) || 0) >= (getEntityTimestamp(previous) || 0)) {
        reportMap.set(report.dispatchId, report);
      }
    });
    return reportMap;
  }, [dayReports]);
  const dispatchCustomerOptions = useMemo(() => {
    const activeCustomers = customers.filter(customer => !customer?.isArchived);
    const fromDispatch = Array.from(new Set(dayDispatches.map(dispatch => dispatch.customerId).filter(Boolean)))
      .map(customerId => customerLookup.get(customerId))
      .filter(customer => customer && !customer.isArchived);
    const dispatchCustomerIds = new Set(fromDispatch.map(customer => customer.id).filter(Boolean));
    const remainingCustomers = activeCustomers.filter(customer => !dispatchCustomerIds.has(customer.id));
    return [...fromDispatch, ...remainingCustomers];
  }, [customerLookup, customers, dayDispatches]);
  const filteredCustomerOptions = useMemo(() => {
    const keyword = normalizeLookupText(customerSearch);
    if (!keyword) return dispatchCustomerOptions.slice(0, 20);
    return dispatchCustomerOptions
      .filter(customer => [customer.name, customer.phone, customer.address]
        .filter(Boolean)
        .some(value => normalizeLookupText(value).includes(keyword)))
      .slice(0, 30);
  }, [customerSearch, dispatchCustomerOptions]);
  useDismissSearchOnOutsideClick(showCustomerList, () => setShowCustomerList(false));
  const customerDispatches = useMemo(() => (
    selectedCustomerId
      ? dayDispatches.filter(dispatch => dispatch.customerId === selectedCustomerId)
      : []
  ), [dayDispatches, selectedCustomerId]);
  const selectedDispatch = customerDispatches.find(dispatch => dispatch.id === selectedDispatchId) || customerDispatches[0] || null;
  const selectedCustomer = selectedCustomerId ? customerLookup.get(selectedCustomerId) : null;
  const selectedCustomerPhone = `${selectedCustomer?.phone || selectedCustomer?.phoneNumber || ''}`.trim();
  const selectedCustomerPhoneHref = selectedCustomerPhone ? `tel:${selectedCustomerPhone.replace(/[^\d+]/g, '')}` : '';
  const selectedCustomerLocationUrl = selectedCustomer ? buildCustomerDirectionsUrl(selectedCustomer) : '';
  const selectedCustomerLocationLabel = (() => {
    if (!selectedCustomer) return '';
    const rawText = getCustomerLocationDisplayText(selectedCustomer);
    if (/^https?:\/\//i.test(rawText || '')) return selectedCustomer.address || 'Mở vị trí';
    return rawText || selectedCustomer.address || '';
  })();
  const selectedCustomerDebtInfo = useMemo(() => {
    if (!selectedCustomer) return { debt: 0, credit: 0 };
    const ledger = buildCustomerReconciledLedger(selectedCustomer, orders, payments, warehouseImports, expenses);
    return {
      debt: Math.max(0, parseLooseMoneyValue(ledger.currentDebt)),
      credit: Math.max(0, parseLooseMoneyValue(ledger.creditBalance))
    };
  }, [orders, payments, selectedCustomer, warehouseImports, expenses]);
  const selectedProduct = selectedDispatch?.productId ? productLookup.get(selectedDispatch.productId) : null;
  const selectedProductShortLabel = getProductShortName(selectedProduct) || `${selectedDispatch?.productShortName || selectedDispatch?.productShortNameSnapshot || selectedDispatch?.shortName || ''}`.trim().toUpperCase();
  const selectedProductDisplayName = selectedProductShortLabel || selectedProduct?.name || selectedDispatch?.productNameSnapshot || 'Hàng hóa';
  const expectedWeightKg = parseLooseQuantityValue(selectedDispatch?.weightKg);
  const expectedQuantity = parseLooseQuantityValue(selectedDispatch?.quantity ?? selectedDispatch?.pieceCount ?? selectedDispatch?.quantityCount);
  const expectedQuantityUnit = normalizeLeadingLabel(selectedDispatch?.quantityUnit || selectedDispatch?.unit || selectedProduct?.unit || (expectedQuantity > 0 ? 'Con' : ''));
  const previewStatus = getDeliveryReportWeightStatus({ expectedWeightKg, actualWeightKg: actualWeight });
  const mismatchCount = useMemo(() => dayReports
    .filter(report => getDeliveryReportWeightStatus(report).isMismatch)
    .length, [dayReports]);
  const reportedDispatchCount = latestReportByDispatch.size;
  const findDeliveryRequests = useMemo(() => buildDeliveryRequestIndex(orderRequests || [], customerLookup, normalizeLookupText), [orderRequests, customerLookup]);
  const getDeliveryRequestMetadata = useMemo(() => createRecordCalculationCache((request, fallbackDate, requestCustomer) => {
    const requestDate = resolveEntityDateKey(request, fallbackDate);
    const requestDateValue = parseDateInputValue(requestDate || '');
    return {
      requestDate,
      requestDateMs: requestDateValue ? requestDateValue.getTime() : 0,
      requestTimestamp: getEntityTimestamp(request)
        || new Date(`${requestDate || fallbackDate}T00:00:00.000`).getTime(),
      requestCustomer,
      requestCustomerName: request.customerNameSnapshot || request.customerName || requestCustomer?.name || '',
      requestItems: Array.isArray(request.items) && request.items.length > 0
        ? request.items : (request.primaryItem ? [request.primaryItem] : []),
      requestBranchId: `${request.branchId || request.customerBranchId || ''}`.trim(),
      requestBranchName: normalizeLookupText(request.branchName || request.customerBranchName || ''),
    };
  }), [employee?.companyId, employee?.tenantId]);
  const getDeliveryItemSearchNames = useMemo(() => createRecordCalculationCache((item, product) => {
    const name = item?.productName || item?.productNameSnapshot || item?.description || product?.name || '';
    const shortName = getProductShortName(product) || item?.productShortName || item?.productShortNameSnapshot || '';
    const labels = [name, shortName].filter(Boolean);
    return { normalized: labels.map(normalizeLookupText), collapsed: labels.map(collapseLookupText) };
  }), [employee?.companyId, employee?.tenantId]);
  const getDeliveryItemBillingSnapshot = useMemo(() => createRecordCalculationCache((item, product) => (
    resolveTransactionBillingSnapshot({ record: item, product })
  )), [employee?.companyId, employee?.tenantId]);
  const getDeliveryItemMatchMetadata = useMemo(() => createRecordCalculationCache((item, product) => ({
    quantity: getOrderLineQuantityValue(item),
    weight: getOrderLineWeightKgValue(item),
    size: normalizeLookupText(getOrderLineSizeLabel(item)),
    unit: normalizeLookupText(item?.quantityUnit || item?.unit || product?.unit || ''),
  })), [employee?.companyId, employee?.tenantId]);
  const calculateDispatchOrderRequestPrice = useCallback((dispatch = {}, product = null, customer = null, productLabel = '') => {
    const dispatchCustomerId = dispatch.customerId || customer?.id || '';
    const dispatchProductId = dispatch.productId || product?.id || '';
    const frozenDispatchSnapshot = resolveTransactionBillingSnapshot({
      record: dispatch,
      product,
    });
    if (frozenDispatchSnapshot.hasFrozenPricing) {
      return {
        unitPrice: frozenDispatchSnapshot.unitPrice,
        unitLabel: frozenDispatchSnapshot.billingUnit,
        pricingUnit: frozenDispatchSnapshot.billingUnit,
        billingQuantity: frozenDispatchSnapshot.billingQuantity,
        amount: frozenDispatchSnapshot.amount,
        inputUnit: frozenDispatchSnapshot.actualUnit,
        hasFrozenPricing: true,
        source: 'dispatch_snapshot',
      };
    }
    const dispatchDate = resolveEntityDateKey(dispatch, workingDate) || workingDate;
    const dispatchDateValue = parseDateInputValue(dispatchDate || workingDate);
    const dispatchDateMs = dispatchDateValue ? dispatchDateValue.getTime() : 0;
    const dispatchBranchId = `${dispatch.branchId || dispatch.customerBranchId || ''}`.trim();
    const dispatchBranchName = normalizeLookupText(dispatch.branchName || dispatch.customerBranchName || '');
    const dispatchConfigurationId = `${dispatch.configurationId || ''}`.trim();
    const normalizedCustomerName = normalizeLookupText(dispatch.customerNameSnapshot || customer?.name || '');
    const productNameCandidates = [
      productLabel,
      dispatch.productNameSnapshot,
      dispatch.productShortName,
      dispatch.productShortNameSnapshot,
      product?.name,
      getProductShortName(product)
    ].filter(Boolean);
    const normalizedProductNames = new Set(productNameCandidates.map(normalizeLookupText).filter(Boolean));
    const collapsedProductNames = new Set(productNameCandidates.map(collapseLookupText).filter(Boolean));
    const sourceRequestDate = dispatch.sourceOrderRequestDate
      || dispatch.orderRequestDate
      || dispatch.requestDate
      || dispatch.requestDateKey
      || dispatchDate;
    const sourceRequestId = `${dispatch.sourceOrderRequestId || dispatch.orderRequestId || dispatch.requestId || ''}`.trim();
    const sourceRequestRowKey = `${dispatch.sourceOrderRequestRowKey || dispatch.orderRequestRowKey || dispatch.requestRowKey || ''}`.trim();
    const dispatchTimestamp = getEntityTimestamp(dispatch)
      || new Date(`${dispatchDate || workingDate}T23:59:59.999`).getTime();
    const directSourceUnitPrice = parseLooseMoneyValue(
      dispatch.sourceOrderRequestUnitPrice
      ?? dispatch.orderRequestUnitPrice
      ?? dispatch.requestUnitPrice
      ?? dispatch.orderedUnitPrice
      ?? dispatch.customerOrderUnitPrice
    );
    const resolveFallbackPricing = () => {
      const fallbackConfigSource = getCustomerBranchProductConfigSource(customer, dispatchBranchId, products);
      const fallbackConfiguration = resolveCustomerProductBillingConfiguration(fallbackConfigSource, product, {
        configurationId: dispatchConfigurationId,
        sizeLabel: dispatch.sizeLabel || dispatch.size || dispatch.productSize || dispatch.variantSize || '',
        attributeLabel: dispatch.attributeLabel || dispatch.productAttribute || dispatch.attribute || '',
      });
      const fallbackPricingUnit = normalizeProductPricingUnit(
        dispatch.sourceOrderRequestPricingUnit
        || dispatch.orderRequestPricingUnit
        || dispatch.requestPricingUnit
        || dispatch.pricingUnit
        || fallbackConfiguration.billingUnit
      );
      const fallbackUnitPrice = directSourceUnitPrice
        || (isCustomerProductUnitAllowed(fallbackConfiguration, fallbackPricingUnit)
          ? fallbackConfiguration.unitPrice
          : 0)
        || parseLooseMoneyValue(
          dispatch.unitPrice
          ?? dispatch.price
          ?? dispatch.sellingPrice
          ?? dispatch.unitPriceVnd
          ?? dispatch.unit_price_vnd
        );
      return { fallbackConfiguration, fallbackPricingUnit, fallbackUnitPrice };
    };
    const dispatchQuantityForMatch = parseLooseQuantityValue(dispatch.quantity ?? dispatch.pieceCount ?? dispatch.quantityCount);
    const dispatchWeightForMatch = parseLooseQuantityValue(dispatch.weightKg ?? dispatch.totalKg ?? dispatch.kg ?? dispatch.actualWeightKg ?? dispatch.weight);
    const dispatchSizeKey = normalizeLookupText(dispatch.size || dispatch.sizeLabel || dispatch.productSize || dispatch.variantSize || '');
    const dispatchUnitKey = normalizeLookupText(dispatch.quantityUnit || dispatch.unit || product?.unit || '');
    let bestCandidate = null;
    let resolveBestCandidatePricing = null;
    const compareCandidates = (a, b) => (
      b.exactRow - a.exactRow
      || b.exactRequest - a.exactRequest
      || b.sameSourceDate - a.sameSourceDate
      || b.sameDispatchDate - a.sameDispatchDate
      || b.configurationMatch - a.configurationMatch
      || b.quantityMatch - a.quantityMatch
      || b.weightMatch - a.weightMatch
      || b.sizeMatch - a.sizeMatch
      || b.unitMatch - a.unitMatch
      || b.exactProductId - a.exactProductId
      || b.requestDateMs - a.requestDateMs
      || b.requestTimestamp - a.requestTimestamp
      || a.itemIndex - b.itemIndex
    );

    findDeliveryRequests(dispatchCustomerId, normalizedCustomerName).forEach((request) => {
      const { requestDate, requestDateMs, requestTimestamp, requestCustomer,
        requestCustomerName, requestItems, requestBranchId, requestBranchName } = getDeliveryRequestMetadata(
        request, dispatchDate || workingDate, customerLookup.get(request.customerId)
      );
      const isExactRequest = Boolean(sourceRequestId && request.id === sourceRequestId);
      if (!isExactRequest && dispatchDateMs && requestDateMs && requestDateMs > dispatchDateMs) return;
      if (!isExactRequest && dispatchTimestamp && requestTimestamp && requestTimestamp > dispatchTimestamp) {
        const sameBusinessDay = Boolean(requestDate && (
          requestDate === dispatchDate
          || requestDate === sourceRequestDate
          || requestDate === workingDate
        ));
        if (!sameBusinessDay) return;
      }

      const customerMatches = Boolean(
        (dispatchCustomerId && request.customerId === dispatchCustomerId)
        || (normalizedCustomerName && normalizeLookupText(requestCustomerName) === normalizedCustomerName)
      );
      if (!customerMatches) return;

      requestItems.forEach((item, index) => {
        const itemBranchId = `${item?.branchId || item?.customerBranchId || requestBranchId || ''}`.trim();
        const itemBranchName = normalizeLookupText(item?.branchName || item?.customerBranchName || requestBranchName || '');
        const branchMatches = Boolean(
          (!dispatchBranchId && !dispatchBranchName)
          || (dispatchBranchId && itemBranchId === dispatchBranchId)
          || (dispatchBranchName && itemBranchName === dispatchBranchName)
        );
        if (!branchMatches) return;

        const requestProduct = item?.productId ? productLookup.get(item.productId) : null;
        const exactProductMatch = Boolean(dispatchProductId && item?.productId === dispatchProductId);
        const requestProductNames = exactProductMatch ? null : getDeliveryItemSearchNames(item, requestProduct);
        const requestProductMatches = Boolean(
          exactProductMatch
          || requestProductNames.normalized.some(name => normalizedProductNames.has(name))
          || requestProductNames.collapsed.some(name => collapsedProductNames.has(name))
        );
        if (!requestProductMatches) return;

        const requestSnapshot = getDeliveryItemBillingSnapshot(item, requestProduct || product);
        const itemConfigurationId = `${requestSnapshot.configurationId || item?.configurationId || ''}`.trim();
        const unitPrice = requestSnapshot.hasFrozenPricing
          ? requestSnapshot.unitPrice
          : getOrderLineUnitPriceValue(item);
        if (unitPrice <= 0) return;
        const itemRowKey = `${item?.rowKey || item?.id || item?.lineId || item?.itemId || ''}`.trim();
        const legacyProductRowKey = `${request.id || 'request'}_${item?.productId || index}`;
        const compositeRowKey = `${request.id || 'request'}_${itemRowKey || item?.productId || index}`;
        const { quantity: itemQuantity, weight: itemWeightKg, size: itemSizeKey, unit: itemUnitKey }
          = getDeliveryItemMatchMetadata(item, product);
        const candidate = {
          unitPrice,
          billingQuantity: requestSnapshot.billingQuantity,
          amount: requestSnapshot.amount,
          hasFrozenPricing: requestSnapshot.hasFrozenPricing,
          configurationId: itemConfigurationId,
          source: requestSnapshot.hasFrozenPricing ? 'order_snapshot' : 'legacy_order',
          requestTimestamp: requestTimestamp || 0,
          exactRequest: isExactRequest ? 1 : 0,
          exactRow: sourceRequestRowKey && [itemRowKey, compositeRowKey, legacyProductRowKey].includes(sourceRequestRowKey) ? 1 : 0,
          sameSourceDate: sourceRequestDate && requestDate === sourceRequestDate ? 1 : 0,
          sameDispatchDate: dispatchDate && requestDate === dispatchDate ? 1 : 0,
          exactProductId: dispatchProductId && item?.productId === dispatchProductId ? 1 : 0,
          configurationMatch: dispatchConfigurationId && itemConfigurationId === dispatchConfigurationId ? 1 : 0,
          quantityMatch: dispatchQuantityForMatch > 0 && areLooseQuantityValuesClose(dispatchQuantityForMatch, itemQuantity, 0.001) ? 1 : 0,
          weightMatch: dispatchWeightForMatch > 0 && areLooseQuantityValuesClose(dispatchWeightForMatch, itemWeightKg) ? 1 : 0,
          sizeMatch: dispatchSizeKey && itemSizeKey && dispatchSizeKey === itemSizeKey ? 1 : 0,
          unitMatch: dispatchUnitKey && itemUnitKey && dispatchUnitKey === itemUnitKey ? 1 : 0,
          requestDateMs,
          itemIndex: index
        };
        // A stable minimum selects the same first candidate as the old full sort.
        if (!bestCandidate || compareCandidates(candidate, bestCandidate) < 0) {
          bestCandidate = candidate;
          resolveBestCandidatePricing = () => {
            const pricingUnit = requestSnapshot.hasFrozenPricing
              ? requestSnapshot.billingUnit
              : normalizeProductPricingUnit(
                item?.pricingUnit
                || item?.defaultUnit
                || getCustomerProductPricingUnit(
                  getCustomerBranchProductConfigSource(requestCustomer, itemBranchId, products),
                  requestProduct || product,
                  item?.quantityUnit || item?.unit || product?.unit || 'Con'
                )
              );
            return {
              unitLabel: pricingUnit,
              pricingUnit,
              inputUnit: requestSnapshot.actualUnit || normalizeProductPricingUnit(item?.quantityUnit || item?.unit || dispatch.quantityUnit || dispatch.unit || ''),
            };
          };
        }
      });
    });

    if (bestCandidate) return { ...bestCandidate, ...resolveBestCandidatePricing() };
    const { fallbackConfiguration, fallbackPricingUnit, fallbackUnitPrice } = resolveFallbackPricing();
    return fallbackUnitPrice > 0 ? {
      unitPrice: fallbackUnitPrice,
      unitLabel: fallbackPricingUnit,
      pricingUnit: fallbackPricingUnit,
      configurationId: dispatchConfigurationId || fallbackConfiguration.configurationId || '',
      inputUnit: normalizeProductPricingUnit(dispatch.quantityUnit || dispatch.unit || ''),
      requestTimestamp: dispatchTimestamp || 0,
      exactRequest: 0,
      exactRow: 0,
      sameSourceDate: 0,
      sameDispatchDate: 0,
      exactProductId: 0,
      configurationMatch: 0,
      quantityMatch: 0,
      weightMatch: 0,
      sizeMatch: 0,
      unitMatch: 0,
      requestDateMs: dispatchDateMs,
      itemIndex: 0
    } : null;
  }, [customerLookup, findDeliveryRequests, getDeliveryRequestMetadata, getDeliveryItemSearchNames, getDeliveryItemBillingSnapshot, getDeliveryItemMatchMetadata, productLookup, products, workingDate]);
  const resolveDispatchOrderRequestPrice = useMemo(
    () => createRecordCalculationCache(calculateDispatchOrderRequestPrice),
    [calculateDispatchOrderRequestPrice]
  );
  const reportCustomerGroups = useMemo(() => {
    const grouped = new Map();
    const seenCollectedByCustomer = new Map();
    const seenExpenseByCustomer = new Map();
    const takeUniqueCustomerCashflow = (seenMap, customerKey, value) => {
      const amount = parseInputCurrency(value);
      if (amount <= 0) return 0;
      if (!seenMap.has(customerKey)) seenMap.set(customerKey, new Set());
      const seenValues = seenMap.get(customerKey);
      const valueKey = String(amount);
      if (seenValues.has(valueKey)) return 0;
      seenValues.add(valueKey);
      return amount;
    };
    dayReports.forEach((report) => {
      const customer = customerLookup.get(report.customerId);
      const customerKey = report.customerId || normalizeLookupText(report.customerNameSnapshot || customer?.name || 'khach-hang');
      const product = productLookup.get(report.productId);
      const productLabel = getCompactProductName(product || { name: report.productNameSnapshot }) || report.productNameSnapshot || 'Hàng hóa';
      const productKey = report.productId || normalizeLookupText(productLabel || 'hang-hoa');
      const key = customerKey || 'khach-hang';
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          customerKey,
          productKey: '',
          customerId: report.customerId || '',
          productId: '',
          customerName: customer?.name || report.customerNameSnapshot || 'Khách hàng',
          reports: [],
          totalWeightKg: 0,
          totalQuantity: 0,
          totalPackageCount: 0,
          quantityUnit: report.actualQuantityUnit || report.expectedQuantityUnit || '',
          packageUnit: report.actualPackageUnit || 'Bọc',
          mismatchCount: 0,
          productLabels: new Set(),
          productRows: new Map(),
          collectedAmounts: [],
          expenseAmounts: []
        });
      }
      const group = grouped.get(key);
      const status = getDeliveryReportWeightStatus(report);
      const reportWeight = parseLooseQuantityValue(report.actualWeightKg);
      const reportQuantity = parseLooseQuantityValue(report.actualQuantity);
      const reportPackageCount = parseLooseQuantityValue(report.actualPackageCount);
      group.reports.push(report);
      group.totalWeightKg += reportWeight;
      group.totalQuantity += reportQuantity;
      group.totalPackageCount += reportPackageCount;
      if (!group.quantityUnit && (report.actualQuantityUnit || report.expectedQuantityUnit)) {
        group.quantityUnit = report.actualQuantityUnit || report.expectedQuantityUnit;
      }
      if (!group.packageUnit && report.actualPackageUnit) {
        group.packageUnit = report.actualPackageUnit;
      }
      const productRowKey = productKey || normalizeLookupText(productLabel || 'hang-hoa');
      if (!group.productRows.has(productRowKey)) {
          group.productRows.set(productRowKey, {
            key: productRowKey,
            productLabel,
            weight: 0,
            quantity: 0,
            packageCount: 0,
            quantityUnit: report.actualQuantityUnit || report.expectedQuantityUnit || '',
            packageUnit: report.actualPackageUnit || ''
        });
      }
      const productRow = group.productRows.get(productRowKey);
      productRow.weight += reportWeight;
      productRow.quantity += reportQuantity;
      productRow.packageCount += reportPackageCount;
      if (!productRow.quantityUnit && (report.actualQuantityUnit || report.expectedQuantityUnit)) {
        productRow.quantityUnit = report.actualQuantityUnit || report.expectedQuantityUnit;
      }
      if (!productRow.packageUnit && report.actualPackageUnit) {
        productRow.packageUnit = report.actualPackageUnit;
      }
      const uniqueCollectedAmount = takeUniqueCustomerCashflow(seenCollectedByCustomer, customerKey, report.collectedAmount);
      const uniqueExpenseAmount = takeUniqueCustomerCashflow(seenExpenseByCustomer, customerKey, report.deliveryExpenseAmount);
      if (uniqueCollectedAmount > 0) group.collectedAmounts.push(uniqueCollectedAmount);
      if (uniqueExpenseAmount > 0) group.expenseAmounts.push(uniqueExpenseAmount);
      if (status.isMismatch) group.mismatchCount += 1;
      if (productLabel) group.productLabels.add(productLabel);
    });
    return Array.from(grouped.values())
      .map(group => {
        const productRows = Array.from(group.productRows?.values?.() || [])
          .sort((a, b) => String(a.productLabel || '').localeCompare(String(b.productLabel || ''), 'vi'));
        const productSummary = productRows.length > 0
          ? productRows.slice(0, 5).map((row) => {
              const weightLabel = row.weight > 0 ? `${formatNumber(row.weight)}kg` : '';
              const quantityLabel = row.quantity > 0 ? `${formatNumber(row.quantity)} ${row.quantityUnit || ''}`.trim() : '';
              const packageLabel = row.packageCount > 0 ? `${formatNumber(row.packageCount)} ${row.packageUnit || 'Bọc'}` : '';
              const metrics = [weightLabel, quantityLabel, packageLabel].filter(Boolean).join(' • ');
              return metrics ? `${row.productLabel}: ${metrics}` : row.productLabel;
            }).join(' | ')
          : Array.from(group.productLabels).slice(0, 4).join(', ');
        // The shared delivery table has dedicated Kg and Con columns, so keep this column to product codes only.
        const shortProductSummary = productRows.length > 0
          ? productRows.slice(0, 5).map((row) => row.productLabel).filter(Boolean).join(' | ')
          : Array.from(group.productLabels).slice(0, 4).join(', ');
        const sortedReports = group.reports.sort((a, b) => (getEntityTimestamp(b) || 0) - (getEntityTimestamp(a) || 0));
        return {
          ...group,
          productSummary,
          shortProductSummary,
          tableProductRows: productRows,
          totalCollectedAmount: sumUniqueMoneyValues(group.collectedAmounts),
          totalExpenseAmount: sumUniqueMoneyValues(group.expenseAmounts),
          latestTimestamp: getEntityTimestamp(sortedReports[0]) || 0,
          reports: sortedReports
        };
      })
      .sort((a, b) => {
        const aHasCashflow = parseInputCurrency(a.totalCollectedAmount) > 0 || parseInputCurrency(a.totalExpenseAmount) > 0;
        const bHasCashflow = parseInputCurrency(b.totalCollectedAmount) > 0 || parseInputCurrency(b.totalExpenseAmount) > 0;
        if (aHasCashflow !== bHasCashflow) return aHasCashflow ? -1 : 1;
        if ((b.latestTimestamp || 0) !== (a.latestTimestamp || 0)) return (b.latestTimestamp || 0) - (a.latestTimestamp || 0);
        return a.customerName.localeCompare(b.customerName, 'vi');
      });
  }, [customerLookup, dayReports, productLookup]);
  const prepareDispatchReconciliationGroups = useCallback(function* () {
    const grouped = new Map();
    for (const dispatch of dayDispatches) {
      const customer = customerLookup.get(dispatch.customerId);
      const key = dispatch.customerId || normalizeLookupText(dispatch.customerNameSnapshot || customer?.name || 'khach-hang');
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          customerId: dispatch.customerId || '',
          customerName: customer?.name || dispatch.customerNameSnapshot || 'Khách hàng',
          rows: [],
          productWeights: new Map(),
          reportCount: 0,
          pendingCount: 0,
          mismatchCount: 0
        });
      }
      const group = grouped.get(key);
      const product = productLookup.get(dispatch.productId);
      const report = latestReportByDispatch.get(dispatch.id);
      const reportStatus = getDeliveryReportWeightStatus(report || {});
      const productLabel = getProductShortName(product)
        || getCompactProductName(product || { name: dispatch.productNameSnapshot })
        || dispatch.productShortName
        || dispatch.productShortNameSnapshot
        || dispatch.productNameSnapshot
        || 'Hàng hóa';
      const dispatchWeight = parseLooseQuantityValue(dispatch.weightKg);
      const dispatchQuantity = parseLooseQuantityValue(dispatch.quantity ?? dispatch.pieceCount ?? dispatch.quantityCount);
      const dispatchInputUnit = normalizeProductPricingUnit(
        dispatch.quantityUnit || dispatch.unit || product?.unit || ''
      );
      const priceInfo = resolveDispatchOrderRequestPrice(dispatch, product, customer, productLabel);
      const pricingUnit = normalizeProductPricingUnit(
        priceInfo?.pricingUnit || report?.pricingUnit || dispatch.pricingUnit || dispatchInputUnit || 'Kg'
      );
      const frozenReportSnapshot = report
        ? resolveTransactionBillingSnapshot({ record: report, product })
        : null;
      const useFrozenSnapshot = Boolean(
        frozenReportSnapshot?.hasFrozenPricing
        || (!report && priceInfo?.hasFrozenPricing)
      );
      const calculatedPricing = useFrozenSnapshot ? null : calculateBillableAmount({
        configuration: {
          billingUnit: pricingUnit,
          pricingUnit,
          unitPrice: priceInfo?.unitPrice || 0,
        },
        actualUnit: report?.actualQuantityUnit || priceInfo?.inputUnit || dispatchInputUnit,
        actualQuantity: report ? report.actualQuantity : dispatchQuantity,
        actualWeightKg: report ? report.actualWeightKg : dispatchWeight,
      });
      const pricingResult = useFrozenSnapshot
        ? {
            quantity: frozenReportSnapshot?.hasFrozenPricing
              ? frozenReportSnapshot.billingQuantity
              : priceInfo.billingQuantity,
            amount: frozenReportSnapshot?.hasFrozenPricing
              ? frozenReportSnapshot.amount
              : priceInfo.amount,
            isPending: false,
          }
        : {
            quantity: calculatedPricing.billingQuantity,
            amount: calculatedPricing.amount,
            isPending: calculatedPricing.isPending,
          };
      const actualQuantityLabel = report?.actualQuantity > 0
        ? `${formatNumber(report.actualQuantity)} ${report.actualQuantityUnit || dispatch.quantityUnit || 'đv'}`
        : '';
      const actualPackageLabel = parseLooseQuantityValue(report?.actualPackageCount) > 0
        ? `${formatNumber(report.actualPackageCount)} ${report.actualPackageUnit || 'Bọc'}`
        : '';
      const returnLabel = report && (parseLooseQuantityValue(report.returnWeightKg) > 0 || parseLooseQuantityValue(report.returnQuantity) > 0)
        ? [
          parseLooseQuantityValue(report.returnWeightKg) > 0 ? `${formatNumber(report.returnWeightKg)} kg` : '',
          parseLooseQuantityValue(report.returnQuantity) > 0 ? `${formatNumber(report.returnQuantity)} ${report.returnQuantityUnit || 'đv'}` : ''
        ].filter(Boolean).join(' • ')
        : '';
      group.rows.push({
        dispatch,
        customer,
        product,
        report,
        reportStatus,
        isMismatch: Boolean(report && reportStatus.isMismatch),
        productLabel,
        dispatchWeight,
        dispatchQuantity,
        pricingUnit,
        pricingQuantity: pricingResult.quantity,
        pricingPendingActual: pricingResult.isPending,
        unitPrice: priceInfo?.unitPrice || 0,
        totalAmount: pricingResult.amount,
        actualQuantityLabel,
        actualPackageLabel,
        returnLabel
      });
      const productWeightKey = priceInfo?.unitPrice > 0
        ? `${productLabel}__${pricingUnit}__${Math.round(priceInfo.unitPrice)}`
        : `${productLabel}__${pricingUnit}`;
      if (!group.productWeights.has(productWeightKey)) {
        group.productWeights.set(productWeightKey, {
          productLabel,
          weight: 0,
          pricingQuantity: 0,
          pricingUnit,
          imageUrl: product?.imageUrl || product?.photoUrl || product?.photo || '',
          unitPrice: priceInfo?.unitPrice || 0,
          totalAmount: 0
        });
      }
      const productWeightLine = group.productWeights.get(productWeightKey);
      productWeightLine.pricingQuantity += pricingResult.quantity;
      productWeightLine.weight = productWeightLine.pricingQuantity;
      productWeightLine.totalAmount += pricingResult.amount;
      if (report) group.reportCount += 1;
      else group.pendingCount += 1;
      if (report && reportStatus.isMismatch) group.mismatchCount += 1;
      yield;
    }
    const completed = [];
    for (const group of grouped.values()) {
      const productWeightLines = Array.from(group.productWeights.values());
      const paymentSummaryTotal = productWeightLines.reduce((sum, line) => sum + (line.totalAmount || 0), 0);
      const productWeightLabels = productWeightLines.map((line) => (
        line.unitPrice > 0 && line.pricingQuantity > 0
          ? `${line.productLabel} - ${formatNumber(line.pricingQuantity)} ${line.pricingUnit} x ${formatCurrency(line.unitPrice)} = ${formatCurrency(line.totalAmount)}`
          : `${line.productLabel} - ${formatNumber(line.pricingQuantity)} ${line.pricingUnit}`
      ));
      if (paymentSummaryTotal > 0 && productWeightLabels.length > 1) {
        productWeightLabels.push(`Tổng ${formatCurrency(paymentSummaryTotal)} đ`);
      }
      completed.push({
        ...group,
        productWeightLabels,
        paymentSummaryTotal,
        latestTimestamp: Math.max(0, ...group.rows.map(row => getEntityTimestamp(row.report || row.dispatch) || 0))
      });
      yield;
    }
    return yield* sortProjection(completed, (a, b) => {
      const aCompleted = a.pendingCount <= 0;
      const bCompleted = b.pendingCount <= 0;
      if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;
      const aHasMismatch = a.mismatchCount > 0;
      const bHasMismatch = b.mismatchCount > 0;
      if (aHasMismatch !== bHasMismatch) return aHasMismatch ? -1 : 1;
      if ((b.latestTimestamp || 0) !== (a.latestTimestamp || 0)) return (b.latestTimestamp || 0) - (a.latestTimestamp || 0);
      return (a.customerName || '').localeCompare(b.customerName || '', 'vi');
    });
  }, [customerLookup, dayDispatches, latestReportByDispatch, productLookup, resolveDispatchOrderRequestPrice]);
  const deliveryProjectionEntry = getDeliveryProjectionEntry(
    [warehouseDispatches, customers, products, orderRequests, deliveryReports],
    JSON.stringify([workingDate, employee?.id || '', isCurrentEmployeeDeliveryParticipant]),
  );
  const deliveryProjection = useCooperativeProjection(prepareDispatchReconciliationGroups, deliveryProjectionEntry);
  const dispatchReconciliationGroups = deliveryProjection.value;
  const basePendingReconciliationGroups = useMemo(() => (
    buildPendingDeliveryReconciliationGroups(
      dispatchReconciliationGroups,
      optimisticallyReportedDispatchIds,
    ).map((group) => {
      const productWeightLabels = group.productWeightLines.map((line) => (
        line.unitPrice > 0 && line.pricingQuantity > 0
          ? `${line.productLabel} - ${formatNumber(line.pricingQuantity)} ${line.pricingUnit} x ${formatCurrency(line.unitPrice)} = ${formatCurrency(line.totalAmount)}`
          : `${line.productLabel} - ${formatNumber(line.pricingQuantity)} ${line.pricingUnit}`
      ));
      if (group.paymentSummaryTotal > 0 && productWeightLabels.length > 1) {
        productWeightLabels.push(`Tổng ${formatCurrency(group.paymentSummaryTotal)} đ`);
      }
      return { ...group, productWeightLabels };
    })
  ), [dispatchReconciliationGroups, optimisticallyReportedDispatchIds]);
  const pendingReconciliationGroups = useMemo(() => {
    const mergedGroups = new Map(basePendingReconciliationGroups.map(group => [group.key, group]));
    leavingReconciliationGroups.forEach((group, key) => {
      if (!mergedGroups.has(key)) mergedGroups.set(key, group);
    });
    return Array.from(mergedGroups.values())
      .sort((a, b) => (a.reconciliationOrder || 0) - (b.reconciliationOrder || 0));
  }, [basePendingReconciliationGroups, leavingReconciliationGroups]);
  const pendingReconciliationDispatchCount = useMemo(() => (
    countPendingDeliveryReconciliationDispatches(basePendingReconciliationGroups)
  ), [basePendingReconciliationGroups]);
  const visiblePendingReconciliationGroups = useMemo(() => (
    getVisibleDeliveryReconciliationGroups(
      pendingReconciliationGroups,
      isReconciliationExpanded,
      DELIVERY_RECONCILIATION_INITIAL_CUSTOMER_LIMIT,
    )
  ), [isReconciliationExpanded, pendingReconciliationGroups]);
  const hasMorePendingReconciliationCustomers = basePendingReconciliationGroups.length
    > DELIVERY_RECONCILIATION_INITIAL_CUSTOMER_LIMIT;
  const stageReportedReconciliationRows = useCallback((dispatchIds = []) => {
    const completedDispatchIds = new Set(dispatchIds.map(value => `${value || ''}`.trim()).filter(Boolean));
    if (completedDispatchIds.size === 0) return;

    const leavingKeys = new Set();
    const groupSnapshots = new Map(pendingReconciliationGroups.map(group => [group.key, group]));
    basePendingReconciliationGroups.forEach((group) => {
      const allPendingRowsCompleted = group.rows.length > 0 && group.rows.every(row => (
        completedDispatchIds.has(`${row?.dispatch?.id || ''}`.trim())
      ));
      if (allPendingRowsCompleted) leavingKeys.add(group.key);
    });

    if (leavingKeys.size > 0) {
      setLeavingReconciliationGroups((current) => {
        const next = new Map(current);
        leavingKeys.forEach((key) => {
          const snapshot = groupSnapshots.get(key);
          if (snapshot) next.set(key, snapshot);
        });
        return next;
      });
    }
    setOptimisticallyReportedDispatchIds((current) => {
      const next = new Set(current);
      completedDispatchIds.forEach(dispatchId => next.add(dispatchId));
      return next;
    });

    if (leavingKeys.size > 0 && typeof window !== 'undefined') {
      const timerId = window.setTimeout(() => {
        setLeavingReconciliationGroups((current) => {
          const next = new Map(current);
          leavingKeys.forEach(key => next.delete(key));
          return next;
        });
        reconciliationExitTimersRef.current.delete(timerId);
      }, 220);
      reconciliationExitTimersRef.current.add(timerId);
    }
  }, [basePendingReconciliationGroups, pendingReconciliationGroups]);
  useEffect(() => {
    setOptimisticallyReportedDispatchIds((current) => {
      let changed = false;
      const next = new Set(current);
      current.forEach((dispatchId) => {
        if (latestReportByDispatch.has(dispatchId)) {
          next.delete(dispatchId);
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [latestReportByDispatch]);
  const selectedReportCustomerGroup = reportCustomerGroups.find(group => group.key === selectedReportCustomerKey) || null;
  const groupedDeliveryCollectedTotal = useMemo(() => (
    reportCustomerGroups.reduce((sum, group) => sum + parseInputCurrency(group.totalCollectedAmount), 0)
  ), [reportCustomerGroups]);
  const groupedDeliveryExpenseTotal = useMemo(() => (
    reportCustomerGroups.reduce((sum, group) => sum + parseInputCurrency(group.totalExpenseAmount), 0)
    + dayStandaloneDeliveryExpenses.reduce((sum, expense) => sum + parseInputCurrency(expense.amount), 0)
  ), [dayStandaloneDeliveryExpenses, reportCustomerGroups]);

  const formatDeliveryReportPlainNumber = (value) => {
    const parsed = parseLooseQuantityValue(value);
    return parsed > 0 ? formatNumber(parsed) : '-';
  };

  const formatDeliveryReportCompactMoney = (value) => {
    const amount = parseLooseMoneyValue(value);
    if (amount <= 0) return '-';
    return Math.round(amount / 1000).toLocaleString('vi-VN', {
      maximumFractionDigits: 0
    });
  };

  const toDeliveryInputValue = (value) => {
    const parsed = parseLooseQuantityValue(value);
    return parsed > 0 ? String(value).replace('.', ',') : '';
  };

  const createManualActualRow = (overrides = {}) => ({
    rowKey: overrides.rowKey || `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    existingReportId: overrides.existingReportId || '',
    dispatchId: overrides.dispatchId || '',
    productId: overrides.productId || '',
    productNameInput: overrides.productNameInput || '',
    productNameSnapshot: overrides.productNameSnapshot || overrides.productNameInput || '',
    expectedWeightKg: parseLooseQuantityValue(overrides.expectedWeightKg),
    expectedQuantity: parseLooseQuantityValue(overrides.expectedQuantity),
    expectedQuantityUnit: normalizeLeadingLabel(overrides.expectedQuantityUnit || overrides.actualQuantityUnit || 'Con'),
    actualWeight: overrides.actualWeight !== undefined ? toDeliveryInputValue(overrides.actualWeight) : '',
    actualQuantity: overrides.actualQuantity !== undefined ? toDeliveryInputValue(overrides.actualQuantity) : '',
    actualPackageCount: overrides.actualPackageCount !== undefined ? toDeliveryInputValue(overrides.actualPackageCount) : '',
    actualQuantityUnit: normalizeLeadingLabel(overrides.actualQuantityUnit || overrides.expectedQuantityUnit || 'Con'),
    actualPackageUnit: normalizeLeadingLabel(overrides.actualPackageUnit || 'Bọc'),
    configurationId: `${overrides.configurationId || ''}`.trim(),
    pricingUnit: normalizeProductPricingUnit(overrides.pricingUnit || ''),
    billingUnit: normalizeProductPricingUnit(overrides.billingUnit || overrides.pricingUnit || ''),
    unitPrice: parseLooseMoneyValue(overrides.unitPrice),
    pricingQuantity: parseLooseQuantityValue(overrides.pricingQuantity),
    billingQuantity: parseLooseQuantityValue(overrides.billingQuantity ?? overrides.pricingQuantity),
    amount: parseLooseMoneyValue(overrides.amount ?? overrides.pricingAmount),
    billingSnapshotVersion: parseLooseQuantityValue(overrides.billingSnapshotVersion),
    billingSnapshotSource: `${overrides.billingSnapshotSource || ''}`.trim(),
    pricingPendingActual: Boolean(overrides.pricingPendingActual),
  });

  const buildActualRowFromDispatch = (dispatch = {}) => {
    const report = latestReportByDispatch.get(dispatch.id);
    const product = productLookup.get(dispatch.productId);
    const expectedWeight = parseLooseQuantityValue(dispatch.weightKg);
    const expectedQty = parseLooseQuantityValue(dispatch.quantity ?? dispatch.pieceCount ?? dispatch.quantityCount);
    const expectedUnit = normalizeLeadingLabel(dispatch.quantityUnit || dispatch.unit || product?.unit || (expectedQty > 0 ? 'Con' : ''));
    const productShortLabel = getProductShortName(product) || `${dispatch.productShortName || dispatch.productShortNameSnapshot || dispatch.shortName || ''}`.trim().toUpperCase();
    const customer = customerLookup.get(dispatch.customerId);
    const priceInfo = resolveDispatchOrderRequestPrice(
      dispatch,
      product,
      customer,
      productShortLabel || product?.name || dispatch.productNameSnapshot || ''
    );
    const reportSnapshot = report ? resolveTransactionBillingSnapshot({ record: report, product }) : null;
    const dispatchSnapshot = resolveTransactionBillingSnapshot({ record: dispatch, product });
    const frozenSnapshot = reportSnapshot?.hasFrozenPricing
      ? reportSnapshot
      : (dispatchSnapshot.hasFrozenPricing ? dispatchSnapshot : null);
    return createManualActualRow({
      rowKey: dispatch.id,
      existingReportId: report?.id || '',
      dispatchId: dispatch.id,
      productId: dispatch.productId || '',
      productNameInput: productShortLabel || product?.name || dispatch.productNameSnapshot || 'Hàng hóa',
      productNameSnapshot: product?.name || dispatch.productNameSnapshot || productShortLabel || 'Hàng hóa',
      expectedWeightKg: expectedWeight,
      expectedQuantity: expectedQty,
      expectedQuantityUnit: expectedUnit,
      actualWeight: report ? report.actualWeightKg : expectedWeight,
      actualQuantity: report ? report.actualQuantity : expectedQty,
      actualPackageCount: report?.actualPackageCount || '',
      actualQuantityUnit: report?.actualQuantityUnit || expectedUnit || 'Con',
      actualPackageUnit: report?.actualPackageUnit || 'Bọc',
      configurationId: frozenSnapshot?.configurationId || report?.configurationId || dispatch.configurationId || '',
      pricingUnit: frozenSnapshot?.billingUnit || priceInfo?.pricingUnit || report?.pricingUnit || dispatch.pricingUnit || expectedUnit,
      billingUnit: frozenSnapshot?.billingUnit || priceInfo?.pricingUnit || report?.pricingUnit || dispatch.pricingUnit || expectedUnit,
      unitPrice: frozenSnapshot?.unitPrice || priceInfo?.unitPrice || report?.unitPrice || 0,
      pricingQuantity: frozenSnapshot?.billingQuantity || report?.pricingQuantity || dispatch.pricingQuantity || 0,
      billingQuantity: frozenSnapshot?.billingQuantity || report?.billingQuantity || dispatch.billingQuantity || 0,
      amount: frozenSnapshot?.amount || report?.amount || report?.pricingAmount || dispatch.amount || dispatch.pricingAmount || 0,
      billingSnapshotVersion: frozenSnapshot?.billingSnapshotVersion || report?.billingSnapshotVersion || dispatch.billingSnapshotVersion || 0,
      billingSnapshotSource: frozenSnapshot?.billingSnapshotSource || report?.billingSnapshotSource || dispatch.billingSnapshotSource || '',
      pricingPendingActual: report?.pricingPendingActual,
    });
  };

  const buildActualRowsForCustomer = (customerId) => {
    const rows = dayDispatches
      .filter(dispatch => dispatch.customerId === customerId)
      .map(dispatch => buildActualRowFromDispatch(dispatch));
    return rows.length > 0 ? rows : [createManualActualRow()];
  };

  const updateActualRow = (rowKey, patch) => {
    setActualRows(prev => prev.map(row => row.rowKey === rowKey ? { ...row, ...patch } : row));
  };

  const findProductForActualRow = (row = {}) => {
    if (row.productId && productLookup.has(row.productId)) return productLookup.get(row.productId);
    const keyword = normalizeLookupText(row.productNameInput || row.productNameSnapshot || '');
    if (!keyword) return null;
    return products.find(product => {
      const shortName = getProductShortName(product);
      return normalizeLookupText(product.name) === keyword
        || normalizeLookupText(shortName) === keyword
        || normalizeLookupText(product.name).includes(keyword)
        || normalizeLookupText(shortName).includes(keyword);
    }) || null;
  };

  const resolveActualRowPricingMeta = (row = {}, productOverride = null) => {
    const product = productOverride || findProductForActualRow(row);
    const frozenRowSnapshot = resolveTransactionBillingSnapshot({ record: row, product });
    if (frozenRowSnapshot.hasFrozenPricing) {
      return {
        configurationId: frozenRowSnapshot.configurationId,
        pricingUnit: frozenRowSnapshot.billingUnit,
        unitPrice: frozenRowSnapshot.unitPrice,
        usesWeightPricing: isSameBillingUnit(frozenRowSnapshot.billingUnit, 'Kg'),
        source: 'report_snapshot',
      };
    }
    const dispatch = row.dispatchId
      ? dayDispatches.find(item => item.id === row.dispatchId)
      : null;
    const customer = customerLookup.get(dispatch?.customerId || selectedCustomerId) || selectedCustomer;
    const configSource = getCustomerBranchProductConfigSource(
      customer,
      dispatch?.branchId || dispatch?.customerBranchId || '',
      products
    );
    const productLabel = getProductShortName(product)
      || row.productNameInput
      || row.productNameSnapshot
      || dispatch?.productNameSnapshot
      || '';
    const priceInfo = dispatch
      ? resolveDispatchOrderRequestPrice(dispatch, product, customer, productLabel)
      : null;
    const pricingUnit = normalizeProductPricingUnit(
      priceInfo?.pricingUnit
      || row.pricingUnit
      || getCustomerProductPricingUnit(
        configSource,
        product,
        row.actualQuantityUnit || row.expectedQuantityUnit || product?.unit || 'Con'
      )
    );
    const unitPrice = parseLooseMoneyValue(row.unitPrice)
      || parseLooseMoneyValue(priceInfo?.unitPrice)
      || getCustomerProductPrice(configSource, product, pricingUnit)
      || 0;
    return {
      configurationId: priceInfo?.configurationId || '',
      pricingUnit,
      unitPrice,
      usesWeightPricing: isSameBillingUnit(pricingUnit, 'Kg'),
      source: priceInfo?.source || 'legacy_fallback',
    };
  };

  const selectedCustomerCollectionHint = useMemo(() => {
    if (!selectedCustomerId || actualRows.length === 0) return 0;
    const billingRows = actualRows.map((row) => {
      const product = findProductForActualRow(row);
      const pricingMeta = resolveActualRowPricingMeta(row, product);
      const actualWeightKg = row.actualWeight
        ? parseLooseQuantityValue(row.actualWeight)
        : parseLooseQuantityValue(row.expectedWeightKg);
      const actualQuantity = row.actualQuantity
        ? parseLooseQuantityValue(row.actualQuantity)
        : parseLooseQuantityValue(row.expectedQuantity);
      return {
        pricingUnit: pricingMeta.pricingUnit,
        billingUnit: pricingMeta.pricingUnit,
        unitPrice: pricingMeta.unitPrice,
        actualWeightKg,
        actualQuantity,
        actualQuantityUnit: pricingMeta.usesWeightPricing
          ? (row.actualQuantityUnit || row.expectedQuantityUnit || product?.unit || 'Con')
          : pricingMeta.pricingUnit,
      };
    });
    return calculateDeliveryActualCollectionTotal(billingRows);
  }, [
    actualRows,
    customerLookup,
    dayDispatches,
    productLookup,
    products,
    resolveDispatchOrderRequestPrice,
    selectedCustomer,
    selectedCustomerId,
  ]);

  useEffect(() => {
    setCollectedAmount((currentAmount) => resolveDeliveryCollectionDraftAmount({
      suggestedAmount: selectedCustomerCollectionHint,
      currentAmount,
      incomePanelOpen: showIncomeReportSection,
      manuallyEdited: collectedAmountManuallyEdited,
    }));
  }, [collectedAmountManuallyEdited, selectedCustomerCollectionHint, showIncomeReportSection]);

  const normalizeActualRowsForSave = () => actualRows
    .map((row) => {
      const product = findProductForActualRow(row);
      const actualWeightKg = row.actualWeight ? parseLooseQuantityValue(row.actualWeight) : parseLooseQuantityValue(row.expectedWeightKg);
      const actualQuantityValue = row.actualQuantity ? parseLooseQuantityValue(row.actualQuantity) : parseLooseQuantityValue(row.expectedQuantity);
      const actualPackageCountValue = row.actualPackageCount ? parseLooseQuantityValue(row.actualPackageCount) : 0;
      const productNameSnapshot = product?.name || row.productNameSnapshot || row.productNameInput || '';
      const pricingMeta = resolveActualRowPricingMeta(row, product);
      const actualQuantityUnit = normalizeLeadingLabel(
        pricingMeta.usesWeightPricing
          ? (row.actualQuantityUnit || row.expectedQuantityUnit || product?.unit || 'Con')
          : pricingMeta.pricingUnit
      );
      const billingSnapshot = buildCustomerProductBillingSnapshot({
        configuration: {
          productId: product?.id || row.productId || '',
          productName: productNameSnapshot,
          configurationId: pricingMeta.configurationId || row.configurationId || '',
          billingUnit: pricingMeta.pricingUnit,
          pricingUnit: pricingMeta.pricingUnit,
          unitPrice: pricingMeta.unitPrice,
          source: pricingMeta.source || 'delivery_report',
        },
        product,
        productId: product?.id || row.productId || '',
        productName: productNameSnapshot,
        actualUnit: actualQuantityUnit,
        actualQuantity: actualQuantityValue,
        actualWeightKg,
      });
      return {
        ...row,
        ...billingSnapshot,
        productId: product?.id || row.productId || '',
        productNameSnapshot,
        actualWeightKg,
        actualQuantityValue,
        actualPackageCountValue,
        actualQuantityUnit,
        actualPackageUnit: normalizeLeadingLabel(row.actualPackageUnit || 'Bọc'),
        pricingUnit: billingSnapshot.billingUnit,
        pricingQuantity: billingSnapshot.billingQuantity,
        pricingPendingActual: billingSnapshot.pricingPendingActual,
        unitPrice: billingSnapshot.unitPrice,
        pricingAmount: billingSnapshot.amount,
      };
    })
    .filter(row => row.dispatchId || row.productNameSnapshot || row.actualWeightKg > 0 || row.actualQuantityValue > 0 || row.actualPackageCountValue > 0);

  useEffect(() => {
    if (!selectedCustomerId && !editingReportId) {
      setSelectedDispatchId('');
      setActualRows([]);
    }
  }, [editingReportId, selectedCustomerId]);

  useEffect(() => {
    if (!selectedCustomerId || editingReportId) return;
    const rows = buildActualRowsForCustomer(selectedCustomerId);
    setActualRows(rows);
    const firstDispatchId = rows.find(row => row.dispatchId)?.dispatchId || '';
    if (!firstDispatchId) {
      setSelectedDispatchId('');
      return;
    }
    if (!customerDispatches.some(dispatch => dispatch.id === selectedDispatchId)) {
      setSelectedDispatchId(firstDispatchId);
    }
  }, [customerDispatches, editingReportId, latestReportByDispatch, selectedCustomerId, selectedDispatchId]);

  useEffect(() => {
    if (!expectedQuantityUnit) return;
    if (!actualQuantity) setActualQuantityUnit(expectedQuantityUnit);
    if (!returnQuantity) setReturnQuantityUnit(expectedQuantityUnit);
  }, [actualQuantity, expectedQuantityUnit, returnQuantity, selectedDispatchId]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleScreenBack = (event) => {
      if (selectedReportCustomerKey) {
        setSelectedReportCustomerKey('');
        markAppBackHandled(event);
        return;
      }
      if (showCustomerList) {
        setShowCustomerList(false);
        markAppBackHandled(event);
      }
    };
    window.addEventListener(APP_SCREEN_BACK_EVENT, handleScreenBack);
    return () => window.removeEventListener(APP_SCREEN_BACK_EVENT, handleScreenBack);
  }, [selectedReportCustomerKey, showCustomerList]);

  const handleSelectCustomer = (customer) => {
    setSelectedCustomerId(customer.id);
    setCustomerSearch(customer.name || '');
    setShowCustomerList(false);
    setCollectedAmount('');
    setCollectedAmountManuallyEdited(false);
    const rows = buildActualRowsForCustomer(customer.id);
    setActualRows(rows);
    setSelectedDispatchId(rows.find(row => row.dispatchId)?.dispatchId || '');
  };
  openPendingReconciliationGroupRef.current = (groupKey) => {
    const group = basePendingReconciliationGroups.find(item => item.key === groupKey);
    const primaryRow = group?.rows?.[0];
    if (!primaryRow) return;
    if (primaryRow.customer) handleSelectCustomer(primaryRow.customer);
    if (primaryRow.dispatch?.id) setSelectedDispatchId(primaryRow.dispatch.id);
    scrollToDeliveryReportForm();
  };

  const handlePhotoChange = async (file) => {
    if (!file) return;
    setIsReadingPhoto(true);
    setStatusMessage('');
    try {
      const dataUrl = await readImageFileAsDataUrl(file, 900, 0.72);
      setPhotoUrl(dataUrl);
    } catch (error) {
      setStatusTone('red');
      setStatusMessage(getFriendlyFirebaseErrorMessage(error, 'Không đọc được ảnh cân lại.'));
    } finally {
      setIsReadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleReturnPhotoChange = async (file) => {
    if (!file) return;
    setIsReadingReturnPhoto(true);
    setStatusMessage('');
    try {
      const dataUrl = await readImageFileAsDataUrl(file, 900, 0.72);
      setReturnPhotoUrl(dataUrl);
    } catch (error) {
      setStatusTone('red');
      setStatusMessage(getFriendlyFirebaseErrorMessage(error, 'Không đọc được ảnh trả hàng.'));
    } finally {
      setIsReadingReturnPhoto(false);
      if (returnPhotoInputRef.current) returnPhotoInputRef.current.value = '';
    }
  };

  const handleStandaloneExpensePhotoChange = async (file) => {
    if (!file) return;
    setIsReadingStandaloneExpensePhoto(true);
    setStatusMessage('');
    try {
      const dataUrl = await readImageFileAsDataUrl(file, 900, 0.72);
      setStandaloneExpensePhotoUrl(dataUrl);
    } catch (error) {
      setStatusTone('red');
      setStatusMessage(getFriendlyFirebaseErrorMessage(error, 'Không đọc được ảnh chi phí.'));
    } finally {
      setIsReadingStandaloneExpensePhoto(false);
      if (standaloneExpensePhotoInputRef.current) standaloneExpensePhotoInputRef.current.value = '';
    }
  };

  const getDeliveryPhotoAgeDays = (report = {}) => {
    const rawDate = report.photoCapturedAt || report.createdAt || report.date;
    const parsedDate = rawDate ? new Date(rawDate) : null;
    const fallbackDate = parseDateInputValue(report.date || '');
    const baseDate = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : fallbackDate;
    if (!baseDate) return 0;
    return Math.floor((Date.now() - baseDate.getTime()) / (24 * 60 * 60 * 1000));
  };

  const canDeleteReportPhoto = (report = {}) => (
    Boolean(canDeleteOldDeliveryPhotos && report?.photoUrl && getDeliveryPhotoAgeDays(report) >= 5)
  );

  const handleDeleteReportPhoto = async (report = {}) => {
    if (!report?.id || !onUpdateDeliveryReport) return;
    if (!canDeleteReportPhoto(report)) {
      setStatusTone('amber');
      setStatusMessage('Ảnh báo cáo chỉ được xóa khi đã lưu tối thiểu 5 ngày và tài khoản có quyền xóa ảnh.');
      return;
    }
    if (!window.confirm('Xóa ảnh báo cáo giao hàng này? Dữ liệu báo cáo vẫn được giữ lại.')) return;

    try {
      await onUpdateDeliveryReport(report.id, {
        photoUrl: '',
        photoDeletedAt: new Date().toISOString(),
        photoDeletedByEmpId: employee?.id || ''
      });
      setStatusTone('emerald');
      setStatusMessage('Đã xóa ảnh báo cáo để giảm dung lượng lưu trữ.');
    } catch (error) {
      setStatusTone('red');
      setStatusMessage(getFriendlyFirebaseErrorMessage(error, 'Không xóa được ảnh báo cáo. Hãy thử lại.'));
    }
  };

  const resetReportForm = () => {
    deliveryCommandIdRef.current = '';
    standaloneExpenseCommandIdRef.current = '';
    setEditingReportId('');
    setActualWeight('');
    setActualQuantity('');
    setActualPackageCount('');
    setActualQuantityUnit('Con');
    setNote('');
    setPhotoUrl('');
    setCollectedAmount('');
    setCollectedAmountManuallyEdited(false);
    setDeliveryExpenseAmount('');
    setDeliveryExpenseCategory('');
    setDeliveryExpenseAssetTouched(false);
    setDeliveryExpenseAssetId(defaultDeliveryAssetId || '');
    setDeliveryExpenseKmAt('');
    setDeliveryExpenseLiters('');
    setDeliveryExpenseUnitPrice('');
    setStandaloneExpenseNote('');
    setStandaloneExpensePhotoUrl('');
    setShowIncomeReportSection(false);
    setShowExpenseReportSection(false);
    setShowReturnReportSection(false);
    setReturnWeight('');
    setReturnQuantity('');
    setReturnQuantityUnit('Con');
    setReturnPhotoUrl('');
    setShowShippingReportSection(false);
    setShippingAmount('');
    setShippingNote('');
    setActualRows(selectedCustomerId ? buildActualRowsForCustomer(selectedCustomerId) : []);
  };

  const handleStartEditReport = (report = {}) => {
    if (!report?.id) return;
    const customer = customerLookup.get(report.customerId);
    setEditingReportId(report.id);
    setSelectedCustomerId(report.customerId || '');
    setCustomerSearch(customer?.name || report.customerNameSnapshot || '');
    setSelectedDispatchId(report.dispatchId || '');
    setActualWeight(report.actualWeightKg ? String(report.actualWeightKg).replace('.', ',') : '');
    setActualQuantity(report.actualQuantity ? String(report.actualQuantity).replace('.', ',') : '');
    setActualPackageCount(report.actualPackageCount ? String(report.actualPackageCount).replace('.', ',') : '');
    setActualQuantityUnit(report.actualQuantityUnit || 'Con');
    setNote(report.note || '');
    setPhotoUrl(report.photoUrl || '');
    setCollectedAmount(report.collectedAmount || '');
    setCollectedAmountManuallyEdited(Boolean(parseLooseMoneyValue(report.collectedAmount)));
    setCollectedMethod(report.collectedMethod || 'Tiền mặt');
    const linkedAssetCostLog = assetCostLogs.find(log => log.id === report.assetCostLogId || log.relatedDeliveryReportId === report.id);
    const existingExpenseAssetId = report.deliveryExpenseAssetId || linkedAssetCostLog?.assetId || '';
    setDeliveryExpenseAmount(report.deliveryExpenseAmount || '');
    setDeliveryExpenseCategory(report.deliveryExpenseCategory || '');
    setDeliveryExpenseAssetTouched(Boolean(existingExpenseAssetId));
    setDeliveryExpenseAssetId(existingExpenseAssetId || defaultDeliveryAssetId || '');
    setDeliveryExpenseKmAt(report.deliveryExpenseKmAt ?? linkedAssetCostLog?.kmAt ?? '');
    setDeliveryExpenseLiters(report.deliveryExpenseLiters ?? linkedAssetCostLog?.liters ?? '');
    setDeliveryExpenseUnitPrice(report.deliveryExpenseUnitPrice ?? linkedAssetCostLog?.unitPrice ?? '');
    const shouldShowIncomePanel = Boolean(report.collectedAmount);
    const shouldShowExpensePanel = Boolean(report.deliveryExpenseAmount || report.deliveryExpenseCategory);
    const shouldShowReturnPanel = Boolean(report.returnWeightKg || report.returnQuantity || report.returnPhotoUrl);
    const shouldShowShippingPanel = Boolean(report.shippingAmount || report.shippingNote);
    setShowIncomeReportSection(shouldShowIncomePanel);
    setShowExpenseReportSection(!shouldShowIncomePanel && shouldShowExpensePanel);
    setShowReturnReportSection(!shouldShowIncomePanel && !shouldShowExpensePanel && shouldShowReturnPanel);
    setShowShippingReportSection(!shouldShowIncomePanel && !shouldShowExpensePanel && !shouldShowReturnPanel && shouldShowShippingPanel);
    setReturnWeight(report.returnWeightKg ? String(report.returnWeightKg).replace('.', ',') : '');
    setReturnQuantity(report.returnQuantity ? String(report.returnQuantity).replace('.', ',') : '');
    setReturnQuantityUnit(report.returnQuantityUnit || 'Con');
    setReturnPhotoUrl(report.returnPhotoUrl || '');
    setShippingAmount(report.shippingAmount ? parseInputCurrency(report.shippingAmount) : '');
    setShippingNote(report.shippingNote || '');
    setActualRows([createManualActualRow({
      rowKey: report.dispatchId || report.id,
      existingReportId: report.id,
      dispatchId: report.dispatchId || '',
      productId: report.productId || '',
      productNameInput: getProductShortName(productLookup.get(report.productId)) || report.productNameSnapshot || 'Hàng hóa',
      productNameSnapshot: productLookup.get(report.productId)?.name || report.productNameSnapshot || '',
      expectedWeightKg: report.expectedWeightKg,
      expectedQuantity: report.expectedQuantity,
      expectedQuantityUnit: report.expectedQuantityUnit,
      actualWeight: report.actualWeightKg,
      actualQuantity: report.actualQuantity,
      actualPackageCount: report.actualPackageCount,
      actualQuantityUnit: report.actualQuantityUnit || report.expectedQuantityUnit || 'Con',
      actualPackageUnit: report.actualPackageUnit || 'Bọc',
      configurationId: report.configurationId || '',
      pricingUnit: report.pricingUnit || report.billingUnit || '',
      billingUnit: report.billingUnit || report.pricingUnit || '',
      unitPrice: report.unitPrice || 0,
      billingQuantity: report.billingQuantity || report.pricingQuantity || 0,
      amount: report.amount || report.pricingAmount || 0,
      pricingAmount: report.pricingAmount || report.amount || 0,
      billingSnapshotVersion: report.billingSnapshotVersion || '',
      pricingConfigVersion: report.pricingConfigVersion || ''
    })]);
    setShowCustomerList(false);
    setStatusTone('emerald');
    setStatusMessage('Đang sửa báo cáo giao hàng. Kiểm tra lại rồi bấm cập nhật hoặc xóa nếu nhập sai.');
    scrollToDeliveryReportForm();
  };

  const archiveDeliveryReport = async (reportId) => {
    if (!reportId || !onUpdateDeliveryReport || !canDeleteDeliveryReport) return false;
    if (!window.confirm('Xóa báo cáo giao hàng này?')) return;
    setIsSaving(true);
    try {
      await onUpdateDeliveryReport(reportId, {
        isArchived: true,
        archivedAt: new Date().toISOString(),
        archivedByEmpId: employee?.id || ''
      });
      if (editingReportId === reportId) resetReportForm();
      setSelectedReportCustomerKey('');
      setStatusTone('emerald');
      setStatusMessage('Đã xóa báo cáo giao hàng.');
    } catch (error) {
      setStatusTone('red');
      setStatusMessage(getFriendlyFirebaseErrorMessage(error, 'Không xóa được báo cáo giao hàng.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDeliveryReport = async () => {
    if (!editingReportId) return;
    await archiveDeliveryReport(editingReportId);
  };

  const handleShareDeliveryReport = async (report = {}) => {
    const customer = customerLookup.get(report.customerId);
    const product = productLookup.get(report.productId);
    const customerName = customer?.name || report.customerNameSnapshot || 'Khách hàng';
    const productLabel = getCompactProductName(product || { name: report.productNameSnapshot }) || report.productNameSnapshot || 'Hàng hóa';
    const quantityUnit = report.actualQuantityUnit || report.expectedQuantityUnit || 'đv';
    const lines = [
      `BÁO CÁO GIAO HÀNG - ${formatCompactDateLabel(report.date || workingDate)}`,
      `Khách: ${customerName}`,
      `Loại SP: ${productLabel}`,
      `Số kg: ${formatNumber(parseLooseQuantityValue(report.actualWeightKg))} kg`,
      `Số con: ${formatNumber(parseLooseQuantityValue(report.actualQuantity))} ${quantityUnit}`,
      parseLooseQuantityValue(report.actualPackageCount) > 0 ? `Số lượng đóng gói: ${formatNumber(report.actualPackageCount)} ${report.actualPackageUnit || 'Bọc'}` : '',
      parseInputCurrency(report.collectedAmount) > 0 ? `Tiền thu: ${formatCurrency(report.collectedAmount)} đ` : '',
      parseInputCurrency(report.deliveryExpenseAmount) > 0 ? `Tiền chi: ${formatCurrency(report.deliveryExpenseAmount)} đ` : '',
      employee?.name ? `Người báo: ${employee.name}` : ''
    ].filter(Boolean);
    try {
      const result = await shareTextContent({
        title: 'Báo cáo giao hàng',
        text: lines.join('\n'),
        dialogTitle: 'Chia sẻ báo cáo giao hàng'
      });
      setStatusTone('emerald');
      setStatusMessage(result.status === 'shared' ? 'Đã mở chia sẻ báo cáo giao hàng.' : 'Đã chuẩn bị nội dung báo cáo để chia sẻ.');
    } catch (error) {
      setStatusTone('red');
      setStatusMessage(getFriendlyFirebaseErrorMessage(error, 'Không chia sẻ được báo cáo giao hàng.'));
    }
  };

  const handleShareDeliveryReportTable = async () => {
    if (reportCustomerGroups.length === 0 && dayStandaloneDeliveryExpenses.length === 0) {
      setStatusTone('amber');
      setStatusMessage('Ngày này chưa có báo cáo giao hàng để chia sẻ.');
      return;
    }
    const tableRows = reportCustomerGroups.map((group, index) => ({
      stt: `${index + 1}`,
      customerName: group.customerName || 'Khách hàng',
      productSummary: group.shortProductSummary || group.productSummary || '-',
      weightKg: `${formatNumber(group.totalWeightKg || 0)}kg`,
      quantity: `${formatNumber(group.totalQuantity || 0)} ${group.quantityUnit || ''}`.trim() || '0',
      collected: `${formatCurrency(group.totalCollectedAmount || 0)} đ`,
      expense: `${formatCurrency(group.totalExpenseAmount || 0)} đ`
    }));
    try {
      if (typeof document === 'undefined') {
        setStatusTone('amber');
        setStatusMessage('Thiết bị này chưa hỗ trợ tạo ảnh bảng báo cáo để chia sẻ.');
        return;
      }

      const canvasWidth = 1320;
      const pageX = 42;
      const tableX = 76;
      const tableWidth = canvasWidth - tableX * 2;
      const headerHeight = 70;
      const lineHeight = 29;
      const columns = [
        { title: 'STT', key: 'stt', width: 62, align: 'center' },
        { title: 'Tên khách', key: 'customerName', width: 260, align: 'center' },
        { title: 'Loại hàng', key: 'productSummary', width: 235, align: 'left' },
        { title: 'Kg', key: 'weightKg', width: 125, align: 'center' },
        { title: 'Con', key: 'quantity', width: 125, align: 'center' },
        { title: 'Thu', key: 'collected', width: 200, align: 'right', color: '#047857' },
        { title: 'Chi', key: 'expense', width: 161, align: 'right', color: '#c2410c' }
      ];
      const remainingWidth = tableWidth - columns.reduce((sum, column) => sum + column.width, 0);
      columns[columns.length - 1].width += Math.max(0, remainingWidth);

      const measureCanvas = document.createElement('canvas');
      const measureCtx = measureCanvas.getContext('2d');
      if (!measureCtx) throw new Error('Không thể tạo ảnh bảng báo cáo.');
      measureCtx.font = "800 24px 'Segoe UI', Arial, sans-serif";
      const rowHeights = tableRows.map((row) => {
        const maxLines = Math.max(
          wrapCanvasText(measureCtx, row.customerName, columns[1].width - 22).length,
          wrapCanvasText(measureCtx, row.productSummary, columns[2].width - 22).length,
          1
        );
        return Math.max(74, maxLines * lineHeight + 34);
      });
      const expenseSectionHeight = dayStandaloneDeliveryExpenses.length > 0
        ? 78 + dayStandaloneDeliveryExpenses.length * 42
        : 0;
      const tableHeight = headerHeight + rowHeights.reduce((sum, height) => sum + height, 0);
      const canvasHeight = Math.max(760, 330 + tableHeight + expenseSectionHeight + 132);
      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Không thể tạo ảnh bảng báo cáo.');

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#fecaca';
      ctx.lineWidth = 3;
      drawRoundedRect(ctx, pageX, 34, canvasWidth - pageX * 2, canvasHeight - 68, 34);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.font = "900 42px 'Segoe UI', Arial, sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText('BẢNG BÁO CÁO GIAO HÀNG', canvasWidth / 2, 98);
      ctx.fillStyle = '#64748b';
      ctx.font = "800 23px 'Segoe UI', Arial, sans-serif";
      ctx.fillText(`${formatCompactDateLabel(workingDate)}${employee?.name ? ` • Người báo: ${employee.name}` : ''}`, canvasWidth / 2, 138);

      const summaryCards = [
        { label: 'Đơn giao', value: `${reportCustomerGroups.length}`, color: '#0369a1', bg: '#ecfeff' },
        { label: 'Tổng thu', value: `${formatCurrency(groupedDeliveryCollectedTotal)} đ`, color: '#047857', bg: '#ecfdf5' },
        { label: 'Tổng chi', value: `${formatCurrency(groupedDeliveryExpenseTotal)} đ`, color: '#c2410c', bg: '#fff7ed' }
      ];
      const cardGap = 24;
      const cardWidth = (tableWidth - cardGap * 2) / 3;
      summaryCards.forEach((card, index) => {
        const x = tableX + index * (cardWidth + cardGap);
        ctx.fillStyle = card.bg;
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.5;
        drawRoundedRect(ctx, x, 172, cardWidth, 82, 22);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#64748b';
        ctx.font = "800 18px 'Segoe UI', Arial, sans-serif";
        ctx.textAlign = 'center';
        ctx.fillText(card.label.toUpperCase(), x + cardWidth / 2, 202);
        ctx.fillStyle = card.color;
        ctx.font = "900 28px 'Segoe UI', Arial, sans-serif";
        ctx.fillText(card.value, x + cardWidth / 2, 236);
      });

      const drawCellText = (value, column, x, y, width, height, options = {}) => {
        ctx.fillStyle = options.color || column.color || '#0f172a';
        ctx.font = options.font || "800 23px 'Segoe UI', Arial, sans-serif";
        ctx.textAlign = column.align || 'left';
        ctx.textBaseline = 'alphabetic';
        const linesToDraw = wrapCanvasText(ctx, value, width - 22);
        const textX = column.align === 'right'
          ? x + width - 12
          : column.align === 'center'
            ? x + width / 2
            : x + 12;
        let textY = y + (height - linesToDraw.length * lineHeight) / 2 + 22;
        linesToDraw.forEach((line) => {
          ctx.fillText(line, textX, textY);
          textY += lineHeight;
        });
      };

      const tableY = 286;
      ctx.fillStyle = '#ecfdf5';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.2;
      drawRoundedRect(ctx, tableX, tableY, tableWidth, tableHeight, 24);
      ctx.fill();
      ctx.stroke();

      let currentX = tableX;
      columns.forEach((column) => {
        drawCellText(column.title, { ...column, align: 'center' }, currentX, tableY, column.width, headerHeight, {
          color: '#0f172a',
          font: "900 22px 'Segoe UI', Arial, sans-serif"
        });
        if (currentX > tableX) {
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(currentX, tableY);
          ctx.lineTo(currentX, tableY + tableHeight);
          ctx.stroke();
        }
        currentX += column.width;
      });
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tableX, tableY + headerHeight);
      ctx.lineTo(tableX + tableWidth, tableY + headerHeight);
      ctx.stroke();

      let rowY = tableY + headerHeight;
      tableRows.forEach((row, rowIndex) => {
        const rowHeight = rowHeights[rowIndex];
        if (rowIndex % 2 === 0) {
          ctx.fillStyle = '#ffffff';
        } else {
          ctx.fillStyle = '#f8fafc';
        }
        ctx.fillRect(tableX + 2, rowY, tableWidth - 4, rowHeight);
        currentX = tableX;
        columns.forEach((column) => {
          drawCellText(row[column.key], column, currentX, rowY, column.width, rowHeight);
          currentX += column.width;
        });
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tableX, rowY + rowHeight);
        ctx.lineTo(tableX + tableWidth, rowY + rowHeight);
        ctx.stroke();
        rowY += rowHeight;
      });

      let footerY = tableY + tableHeight + 44;
      if (dayStandaloneDeliveryExpenses.length > 0) {
        ctx.fillStyle = '#fff7ed';
        ctx.strokeStyle = '#fed7aa';
        ctx.lineWidth = 1.6;
        drawRoundedRect(ctx, tableX, footerY - 14, tableWidth, expenseSectionHeight - 18, 22);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#9a3412';
        ctx.font = "900 24px 'Segoe UI', Arial, sans-serif";
        ctx.textAlign = 'left';
        ctx.fillText('CHI PHÍ CHUYẾN GIAO', tableX + 24, footerY + 24);
        footerY += 62;
        dayStandaloneDeliveryExpenses.forEach((expense, index) => {
          const expenseAssetLabel = [
            expense.assetName || expense.deliveryExpenseAssetNameSnapshot,
            expense.assetPlate || expense.deliveryExpenseAssetPlateSnapshot
          ].filter(Boolean).join(' - ');
          ctx.fillStyle = '#334155';
          ctx.font = "800 22px 'Segoe UI', Arial, sans-serif";
          ctx.textAlign = 'left';
          ctx.fillText(`${index + 1}. ${expense.category || expense.note || 'Chi phí'}${expenseAssetLabel ? ` - ${expenseAssetLabel}` : ''}`, tableX + 28, footerY);
          ctx.fillStyle = '#c2410c';
          ctx.textAlign = 'right';
          ctx.fillText(`${formatCurrency(expense.amount)} đ`, tableX + tableWidth - 28, footerY);
          footerY += 42;
        });
      }

      const blob = await canvasToBlob(canvas, 'image/png');
      const result = await shareBlobFile({
        filename: `bao-cao-giao-hang-${workingDate}.png`,
        blob,
        title: 'Bảng báo cáo giao hàng',
        text: '',
        dialogTitle: 'Chia sẻ bảng báo cáo giao hàng'
      });
      setStatusTone('emerald');
      if (result.status === 'shared') {
        setStatusMessage('Đã mở chia sẻ ảnh bảng báo cáo giao hàng.');
      } else if (result.status === 'downloaded' || result.status === 'saved') {
        setStatusMessage('Đã lưu ảnh bảng báo cáo giao hàng để chia sẻ.');
      } else {
        setStatusTone('amber');
        setStatusMessage('Thiết bị chưa chia sẻ được ảnh bảng báo cáo. App chỉ dùng ảnh, không gửi nội dung chữ.');
      }
    } catch (error) {
      setStatusTone('red');
      setStatusMessage(getFriendlyFirebaseErrorMessage(error, 'Không tạo được ảnh bảng báo cáo giao hàng để chia sẻ.'));
    }
  };

  const handleSaveStandaloneDeliveryExpense = async () => {
    if (deliverySaveInFlightRef.current) return;
    if (!canRecordDeliveryExpense) {
      setStatusTone('amber');
      setStatusMessage('Tai khoan chua co quyen tao khoan chi giao hang.');
      return;
    }
    const amountValue = parseInputCurrency(deliveryExpenseAmount);
    const category = normalizeExpenseCategoryLabel(deliveryExpenseCategory || 'Chi phí giao hàng');
    const effectiveStandaloneExpenseAssetId = deliveryExpenseAssetId || (!deliveryExpenseAssetTouched ? defaultDeliveryAssetId : '');
    const selectedExpenseAsset = effectiveStandaloneExpenseAssetId ? assetLookup.get(effectiveStandaloneExpenseAssetId) : null;
    const selectedExpenseAssetName = selectedExpenseAsset?.name || selectedExpenseAsset?.vehicleName || selectedExpenseAsset?.vehicleModel || selectedExpenseAsset?.vehicleBrand || '';
    const selectedExpenseAssetPlate = selectedExpenseAsset?.plateNumber || selectedExpenseAsset?.licensePlate || selectedExpenseAsset?.plate || selectedExpenseAsset?.vehiclePlate || '';
    const noteValue = capitalizeFirst(standaloneExpenseNote || category);
    if (amountValue <= 0) {
      setStatusTone('red');
      setStatusMessage('Nhap so tien chi phi phat sinh.');
      return;
    }
    try {
      deliverySaveInFlightRef.current = true;
      setIsSaving(true);
      setStatusMessage('');
      standaloneExpenseCommandIdRef.current ||= crypto.randomUUID();
      const plan = createDeliverySavePlan(standaloneExpenseCommandIdRef.current);
      const onAddExpense = plan.addExpense;
      const onAddAssetCostLog = plan.addCost;
      await onAddExpense?.({
        amount: amountValue,
        category,
        note: noteValue,
        date: workingDate,
        assetId: effectiveStandaloneExpenseAssetId || '',
        assetName: selectedExpenseAssetName,
        assetPlate: selectedExpenseAssetPlate,
        deliveryExpenseAssetId: effectiveStandaloneExpenseAssetId || '',
        deliveryExpenseAssetNameSnapshot: selectedExpenseAssetName,
        deliveryExpenseAssetPlateSnapshot: selectedExpenseAssetPlate,
        sourceType: 'driver_delivery_standalone_expense',
        sourceLabel: 'Chi phí chuyến giao',
        requiresApproval: true,
        approvalStatus: CASHFLOW_APPROVAL_STATUS.pending,
        handoverStatus: 'pending',
        createdByRole: 'driver',
        createdByEmployeeId: employee?.id || '',
        createdByName: employee?.name || '',
        receiptImageUrl: standaloneExpensePhotoUrl || '',
        photoUrl: standaloneExpensePhotoUrl || ''
      });
      if (effectiveStandaloneExpenseAssetId && canCreateAssetCostLog) {
        const normalizedCategoryKey = normalizeLookupText(category);
        const isFuelCost = ['xang', 'dau', 'nhien lieu', 'fuel'].some(keyword => normalizedCategoryKey.includes(keyword));
        await onAddAssetCostLog?.({
          assetId: effectiveStandaloneExpenseAssetId,
          driverId: employee?.id || getPrimaryDeliveryAssignmentId(selectedExpenseAsset) || '',
          type: isFuelCost ? 'fuel' : 'expense',
          costType: isFuelCost ? 'fuel' : category,
          category,
          amount: amountValue,
          date: workingDate,
          note: noteValue,
          sourceType: 'delivery_standalone_expense',
          sourceLabel: 'Tự động từ chi phí chuyến giao',
          receiptImageUrl: standaloneExpensePhotoUrl || '',
          photoUrl: standaloneExpensePhotoUrl || ''
        });
      }
      if (typeof onSaveDeliveryCommand !== 'function') throw new Error('Chưa kết nối chức năng lưu giao hàng.');
      const result = await onSaveDeliveryCommand({ commandId: plan.commandId, operations: plan.operations });
      if (!result?.success) throw new Error(result?.message || 'Không lưu được chi phí chuyến giao.');
      standaloneExpenseCommandIdRef.current = '';
      setCustomStandaloneExpenseCategories(prev => {
        const next = Array.from(new Set([...prev, category].filter(Boolean)));
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem('hd_delivery_standalone_expense_categories', JSON.stringify(next.slice(-30)));
          } catch {}
        }
        return next.slice(-30);
      });
      setDeliveryExpenseCategory('');
      setDeliveryExpenseAmount('');
      setDeliveryExpenseAssetTouched(false);
      setDeliveryExpenseAssetId(defaultDeliveryAssetId || '');
      setStandaloneExpenseNote('');
      setStandaloneExpensePhotoUrl('');
      setStatusTone('emerald');
      setStatusMessage(result.queued
        ? 'Đã lưu tạm chi phí chuyến giao, đang đồng bộ.'
        : 'Đã lưu chi phí chuyến giao, chờ kế toán/chủ doanh nghiệp xác nhận.');
    } catch (error) {
      setStatusTone('red');
      setStatusMessage(getFriendlyFirebaseErrorMessage(error, 'Không lưu được chi phí phát sinh.'));
    } finally {
      deliverySaveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const handleSubmitReport = async (event) => {
    event.preventDefault();
    if (deliverySaveInFlightRef.current) return false;
    const isEditingReport = Boolean(editingReportId);
    if (!isEditingReport && !canCreateDeliveryReport) {
      setStatusTone('red');
      setStatusMessage('Tài khoản này chưa được cấp quyền tạo báo cáo giao hàng.');
      return false;
    }
    if (isEditingReport && !canEditDeliveryReport) {
      setStatusTone('red');
      setStatusMessage('Tài khoản này chưa được cấp quyền sửa báo cáo giao hàng.');
      return false;
    }
    if (!selectedCustomerId) {
      setStatusTone('red');
      setStatusMessage('Bạn hãy chọn khách hàng trước khi lưu báo cáo.');
      return false;
    }
    deliverySaveInFlightRef.current = true;
    setIsSaving(true);
    setStatusMessage('');
    try {
      deliveryCommandIdRef.current ||= crypto.randomUUID();
      const plan = createDeliverySavePlan(deliveryCommandIdRef.current);
      const onAddDeliveryReport = plan.addReport;
      const onUpdateDeliveryReport = plan.editReport;
      const onEditOrder = plan.editOrder;
      const onAddPayment = plan.addPayment;
      const onAddExpense = plan.addExpense;
      const onEditExpense = plan.editExpense;
      const onAddAssetCostLog = plan.addCost;
      const onEditAssetCostLog = plan.editCost;
      const rowsToSave = normalizeActualRowsForSave();
      if (rowsToSave.length === 0) {
        setStatusTone('red');
        setStatusMessage('Bạn hãy nhập ít nhất một mặt hàng thực tế giao hàng.');
        return false;
      }
      const firstRow = rowsToSave[0];
      const mismatchRows = rowsToSave.filter(row => getDeliveryReportWeightStatus({
        expectedWeightKg: row.expectedWeightKg,
        actualWeightKg: row.actualWeightKg
      }).isMismatch);
      const collectedAmountValue = parseInputCurrency(collectedAmount);
      const deliveryExpenseAmountValue = parseInputCurrency(deliveryExpenseAmount);
      const shippingAmountValue = parseInputCurrency(shippingAmount);
      const shippingNoteValue = capitalizeFirst(shippingNote || '');
      const deliveryExpenseKmAtValue = parseLooseQuantityValue(deliveryExpenseKmAt);
      const deliveryExpenseLitersValue = parseLooseQuantityValue(deliveryExpenseLiters);
      const deliveryExpenseUnitPriceValue = parseInputCurrency(deliveryExpenseUnitPrice);
      const effectiveDeliveryExpenseAssetId = deliveryExpenseAssetId || (!deliveryExpenseAssetTouched ? defaultDeliveryAssetId : '');
      const selectedExpenseAsset = effectiveDeliveryExpenseAssetId ? assetLookup.get(effectiveDeliveryExpenseAssetId) : null;
      const currentEditingReport = editingReportId ? deliveryReports.find(report => report.id === editingReportId) : null;
      const linkedAssetCostLog = editingReportId
        ? assetCostLogs.find(log => log.id === currentEditingReport?.assetCostLogId || log.relatedDeliveryReportId === editingReportId)
        : null;
      const linkedExpense = editingReportId
        ? expenses.find(expense => !expense.isArchived && (
          expense.id === currentEditingReport?.expenseId || expense.relatedDeliveryReportId === editingReportId
        ))
        : null;
      let reportExpenseId = linkedExpense?.id || '';
      const shouldSyncAssetCostLog = deliveryExpenseAmountValue > 0 && effectiveDeliveryExpenseAssetId && (canCreateAssetCostLog || canEditAssetCostLog);
      const returnWeightKgValue = returnWeight ? parseLooseQuantityValue(returnWeight) : 0;
      const returnQuantityValue = returnQuantity ? parseLooseQuantityValue(returnQuantity) : 0;
      const wasEditing = Boolean(editingReportId);
      const buildReportPayload = (row) => ({
        date: workingDate,
        dispatchId: row.dispatchId || '',
        customerId: selectedCustomerId,
        productId: row.productId || '',
        customerNameSnapshot: selectedCustomer?.name || '',
        productNameSnapshot: row.productNameSnapshot || row.productNameInput || 'Hàng hóa',
        expectedWeightKg: row.expectedWeightKg,
        expectedQuantity: row.expectedQuantity,
        expectedQuantityUnit: row.expectedQuantityUnit,
        actualWeightKg: row.actualWeightKg,
        actualQuantity: row.actualQuantityValue,
        actualPackageCount: row.actualPackageCountValue,
        actualQuantityUnit: normalizeLeadingLabel(row.actualQuantityUnit || row.expectedQuantityUnit || 'Con'),
        actualPackageUnit: normalizeLeadingLabel(row.actualPackageUnit || 'Bọc'),
        actualUnit: normalizeLeadingLabel(row.actualQuantityUnit || row.expectedQuantityUnit || 'Con'),
        configurationId: `${row.configurationId || ''}`.trim(),
        billingUnit: normalizeProductPricingUnit(row.billingUnit || row.pricingUnit || row.actualQuantityUnit || 'Con'),
        billingQuantity: parseLooseQuantityValue(row.billingQuantity ?? row.pricingQuantity),
        amount: parseLooseMoneyValue(row.amount ?? row.pricingAmount),
        billingSnapshotVersion: parseLooseQuantityValue(row.billingSnapshotVersion) || 1,
        billingSnapshotSource: row.billingSnapshotSource || 'delivery_report',
        billingSnapshotValid: row.billingSnapshotValid !== false,
        billingSnapshotError: row.billingSnapshotError || '',
        pricingUnit: normalizeProductPricingUnit(row.pricingUnit || row.actualQuantityUnit || 'Con'),
        pricingQuantity: parseLooseQuantityValue(row.pricingQuantity),
        pricingPendingActual: Boolean(row.pricingPendingActual),
        unitPrice: parseLooseMoneyValue(row.unitPrice),
        pricingAmount: parseLooseMoneyValue(row.pricingAmount),
        collectedAmount: collectedAmountValue,
        collectedMethod,
        deliveryExpenseAmount: deliveryExpenseAmountValue,
        deliveryExpenseCategory: normalizeExpenseCategoryLabel(deliveryExpenseCategory || 'Chi phí giao hàng'),
        deliveryExpenseAssetId: effectiveDeliveryExpenseAssetId || '',
        deliveryExpenseAssetNameSnapshot: selectedExpenseAsset?.name || '',
        deliveryExpenseAssetPlateSnapshot: selectedExpenseAsset?.plateNumber || selectedExpenseAsset?.licensePlate || selectedExpenseAsset?.plate || '',
        deliveryExpenseKmAt: deliveryExpenseKmAtValue,
        deliveryExpenseLiters: deliveryExpenseLitersValue,
        deliveryExpenseUnitPrice: deliveryExpenseUnitPriceValue,
        assetCostLogId: linkedAssetCostLog?.id || currentEditingReport?.assetCostLogId || '',
        note: capitalizeFirst(note || ''),
        photoUrl,
        photoCapturedAt: photoUrl ? new Date().toISOString() : '',
        returnWeightKg: returnWeightKgValue,
        returnQuantity: returnQuantityValue,
        returnQuantityUnit: normalizeLeadingLabel(returnQuantityUnit || firstRow.expectedQuantityUnit || 'Con'),
        returnPhotoUrl,
        returnPhotoCapturedAt: returnPhotoUrl ? new Date().toISOString() : '',
        shippingAmount: shippingAmountValue,
        shippingNote: shippingNoteValue,
        shippingMethod: 'Gửi xe'
      });
      const savedReportRefs = [];
      let reportId = editingReportId;
      if (wasEditing && onUpdateDeliveryReport) {
        await onUpdateDeliveryReport(editingReportId, buildReportPayload(firstRow));
        savedReportRefs.push({ row: firstRow, reportId: editingReportId });
      } else {
        const savedIds = [];
        for (const row of rowsToSave) {
          const payload = buildReportPayload(row);
          if (row.existingReportId && onUpdateDeliveryReport && canEditDeliveryReport) {
            await onUpdateDeliveryReport(row.existingReportId, payload);
            savedIds.push(row.existingReportId);
            savedReportRefs.push({ row, reportId: row.existingReportId });
          } else {
            const newId = await onAddDeliveryReport?.(payload);
            if (newId) {
              savedIds.push(newId);
              savedReportRefs.push({ row, reportId: newId });
            }
          }
        }
        reportId = savedIds[0] || '';
      }
      const hasReturnGoods = returnWeightKgValue > 0 || returnQuantityValue > 0 || Boolean(returnPhotoUrl);
      if (hasReturnGoods && typeof onEditOrder === 'function') {
        const nowIso = new Date().toISOString();
        const touchedOrderIds = new Set();
        for (const savedRef of savedReportRefs) {
          const row = savedRef.row || {};
          const dispatchId = `${row.dispatchId || ''}`.trim();
          if (!dispatchId) continue;
          const dispatch = warehouseDispatches.find(item => item?.id === dispatchId) || {};
          const linkedOrder = orders.find(order => {
            if (!order || order.isArchived) return false;
            const sourceDispatchIds = Array.isArray(order.sourceDispatchIds)
              ? order.sourceDispatchIds.map(String)
              : [];
            return sourceDispatchIds.includes(dispatchId)
              || `${order.sourceDispatchId || order.dispatchId || ''}` === dispatchId;
          });
          if (!linkedOrder?.id || touchedOrderIds.has(linkedOrder.id)) continue;
          touchedOrderIds.add(linkedOrder.id);
          const returnRecordId = `delivery_return_${savedRef.reportId || dispatchId}`;
          const existingReturnGoods = getOrderReturnGoodsRecords(linkedOrder);
          const returnRecord = {
            id: returnRecordId,
            sourceType: 'delivery_report',
            deliveryReportId: savedRef.reportId || '',
            dispatchId,
            pieces: returnQuantityValue,
            quantity: returnQuantityValue,
            quantityUnit: normalizeLeadingLabel(returnQuantityUnit || row.expectedQuantityUnit || 'Con'),
            weightKg: returnWeightKgValue,
            returnWeightKg: returnWeightKgValue,
            reason: 'Tài xế báo trả hàng',
            status: 'pending_pickup',
            statusLabel: RETURN_GOODS_STATUS_LABELS.pending_pickup,
            isRetrievedToWarehouse: false,
            pendingPickup: true,
            discountedSale: false,
            discountAmount: 0,
            productSummary: row.productNameSnapshot || row.productNameInput || dispatch.productNameSnapshot || getOrderReturnProductSummary(linkedOrder),
            productId: row.productId || dispatch.productId || '',
            orderId: linkedOrder.id,
            orderCode: formatOrderCode(linkedOrder.id),
            customerId: selectedCustomerId || linkedOrder.customerId || '',
            customerName: selectedCustomer?.name || linkedOrder.customer?.name || linkedOrder.customerNameSnapshot || '',
            photoUrl: returnPhotoUrl || '',
            createdAt: nowIso,
            createdByEmpId: employee?.id || '',
            createdByName: employee?.name || ''
          };
          const nextReturnGoods = existingReturnGoods.some(item => (
            item?.id === returnRecordId || (savedRef.reportId && item?.deliveryReportId === savedRef.reportId)
          ))
            ? existingReturnGoods.map(item => (
              item?.id === returnRecordId || (savedRef.reportId && item?.deliveryReportId === savedRef.reportId)
                ? { ...item, ...returnRecord, createdAt: item.createdAt || nowIso, updatedAt: nowIso }
                : item
            ))
            : [...existingReturnGoods, returnRecord];
          const returnSummary = summarizeOrderReturnGoods({ returnGoods: nextReturnGoods });
          await onEditOrder(linkedOrder.id, {
            customerId: linkedOrder.customerId || selectedCustomerId || '',
            salesEmpId: linkedOrder.salesEmpId || linkedOrder.empId || '',
            empId: linkedOrder.empId || '',
            createdByEmpId: linkedOrder.createdByEmpId || '',
            date: linkedOrder.date || workingDate,
            sellerExtraExpense: linkedOrder.sellerExtraExpense || 0,
            extraExpenseName: linkedOrder.extraExpenseName || '',
            returnGoods: nextReturnGoods,
            returnGoodsUpdatedAt: nowIso,
            returnDiscountAmount: returnSummary.discountAmount,
            returnPendingPickupPieces: returnSummary.pendingPieces,
            returnPendingPickupWeightKg: returnSummary.pendingWeightKg,
            reviewStatus: linkedOrder.reviewStatus === 'approved' ? 'need_review' : (linkedOrder.reviewStatus || 'draft'),
            reviewStatusLabel: 'Có hàng trả chưa lấy về kho'
          });
        }
      }
      if (!wasEditing && collectedAmountValue > 0 && canRecordDeliveryIncome) {
        await onAddPayment?.({
          clientMutationId: `p_delivery_${reportId}`,
          customerId: selectedCustomerId,
          amount: collectedAmountValue,
          method: collectedMethod,
          date: workingDate,
          note: `Tài xế thu khi giao hàng${selectedCustomer?.name ? ` - ${selectedCustomer.name}` : ''}`,
          sourceType: collectedMethod === 'Chuyển khoản' ? 'customer_transfer' : 'driver_cash',
          sourceLabel: 'Thu từ báo cáo giao hàng',
          requiresApproval: true,
          approvalStatus: CASHFLOW_APPROVAL_STATUS.pending,
          handoverStatus: 'pending',
          createdByRole: 'driver',
          relatedDeliveryReportId: reportId || '',
          dispatchId: firstRow.dispatchId || '',
          empId: employee?.id || ''
        });
      }
      if (deliveryExpenseAmountValue > 0 && canRecordDeliveryExpense) {
        const expensePayload = {
          amount: deliveryExpenseAmountValue,
          category: normalizeExpenseCategoryLabel(deliveryExpenseCategory || 'Chi phí giao hàng'),
          note: standaloneExpenseNote || deliveryExpenseCategory || 'Chi phí giao hàng',
          date: workingDate,
          assetId: effectiveDeliveryExpenseAssetId || '',
          assetName: selectedExpenseAsset?.name || selectedExpenseAsset?.vehicleName || selectedExpenseAsset?.vehicleModel || '',
          assetPlate: selectedExpenseAsset?.plateNumber || selectedExpenseAsset?.licensePlate || selectedExpenseAsset?.plate || '',
          deliveryExpenseAssetId: effectiveDeliveryExpenseAssetId || '',
          deliveryExpenseAssetNameSnapshot: selectedExpenseAsset?.name || selectedExpenseAsset?.vehicleName || selectedExpenseAsset?.vehicleModel || '',
          deliveryExpenseAssetPlateSnapshot: selectedExpenseAsset?.plateNumber || selectedExpenseAsset?.licensePlate || selectedExpenseAsset?.plate || '',
          sourceType: 'driver_delivery_expense',
          sourceLabel: 'Chi từ báo cáo giao hàng',
          requiresApproval: true,
          approvalStatus: CASHFLOW_APPROVAL_STATUS.pending,
          handoverStatus: 'pending',
          createdByRole: 'driver',
          relatedDeliveryReportId: reportId || '',
          dispatchId: firstRow.dispatchId || ''
        };
        if (linkedExpense) await onEditExpense(linkedExpense.id, expensePayload);
        else reportExpenseId = await onAddExpense(expensePayload);
        if (reportId) await onUpdateDeliveryReport(reportId, { expenseId: reportExpenseId });
      } else if (linkedExpense && canRecordDeliveryExpense) {
        await onEditExpense(linkedExpense.id, { isArchived: true, archivedAt: new Date().toISOString() });
        if (linkedAssetCostLog && canEditAssetCostLog) {
          await onEditAssetCostLog(linkedAssetCostLog.id, { ...linkedAssetCostLog, isArchived: true, archivedAt: new Date().toISOString() });
        }
      }
      if (shouldSyncAssetCostLog) {
        const normalizedCategory = normalizeExpenseCategoryLabel(deliveryExpenseCategory || 'Chi phí giao hàng');
        const normalizedCategoryKey = normalizeLookupText(normalizedCategory);
        const isFuelCost = ['xang', 'dau', 'nhien lieu', 'fuel'].some(keyword => normalizedCategoryKey.includes(keyword));
        const assetCostPayload = {
          assetId: effectiveDeliveryExpenseAssetId,
          driverId: employee?.id || getPrimaryDeliveryAssignmentId(selectedExpenseAsset) || '',
          type: isFuelCost ? 'fuel' : 'expense',
          costType: isFuelCost ? 'fuel' : normalizedCategory,
          category: normalizedCategory,
          amount: deliveryExpenseAmountValue,
          kmAt: deliveryExpenseKmAtValue,
          liters: deliveryExpenseLitersValue,
          unitPrice: deliveryExpenseUnitPriceValue,
          date: workingDate,
          note: `${normalizedCategory}${selectedCustomer?.name ? ` - ${selectedCustomer.name}` : ''}`,
          sourceType: 'delivery_report_expense',
          sourceLabel: 'Tự động từ báo cáo giao hàng',
          relatedDeliveryReportId: reportId || '',
          expenseId: reportExpenseId,
          dispatchId: firstRow.dispatchId || ''
        };
        if (linkedAssetCostLog?.id && canEditAssetCostLog) {
          await onEditAssetCostLog?.(linkedAssetCostLog.id, assetCostPayload);
        } else if (canCreateAssetCostLog) {
          const assetCostLogId = await onAddAssetCostLog?.(assetCostPayload);
          if (assetCostLogId && reportId && onUpdateDeliveryReport) {
            await onUpdateDeliveryReport(reportId, { assetCostLogId });
          }
        }
      }
      if (typeof onSaveDeliveryCommand !== 'function') throw new Error('Chưa kết nối chức năng lưu giao hàng.');
      const result = await onSaveDeliveryCommand({ commandId: plan.commandId, operations: plan.operations });
      if (!result?.success) throw new Error(result?.message || 'Không lưu được báo cáo giao hàng.');
      if (!wasEditing) {
        stageReportedReconciliationRows(rowsToSave.map(row => row.dispatchId));
      }
      setStatusTone(mismatchRows.length > 0 ? 'amber' : 'emerald');
      setStatusMessage(result.queued ? 'Đã lưu tạm báo cáo và các chứng từ liên quan, đang đồng bộ.' : wasEditing
        ? 'Đã cập nhật báo cáo giao hàng.'
        : !firstRow.dispatchId
        ? 'Đã lưu báo cáo giao hàng trước. Khi có phiếu xuất kho, kế toán/chủ doanh nghiệp có thể đối chiếu lại sau.'
        : mismatchRows.length > 0
          ? `Đã lưu báo cáo. Có ${mismatchRows.length} mặt hàng lệch kg so với phiếu xuất kho.`
          : `Đã lưu báo cáo giao hàng cho ${rowsToSave.length} mặt hàng.`);
      resetReportForm();
      return true;
    } catch (error) {
      setStatusTone('red');
      setStatusMessage(getFriendlyFirebaseErrorMessage(error, 'Không lưu được báo cáo giao hàng.'));
      return false;
    } finally {
      deliverySaveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const handleDeliveryEnterNext = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const form = event.currentTarget.closest('form');
    const fields = Array.from(form?.querySelectorAll('[data-delivery-enter="true"]') || [])
      .filter(field => !field.disabled && field.offsetParent !== null);
    const currentIndex = fields.indexOf(event.currentTarget);
    const nextField = fields[currentIndex + 1];
    if (nextField) {
      nextField.focus();
      if (typeof nextField.select === 'function') nextField.select();
    }
  };

  const toggleDeliveryReportPanel = (panel) => {
    setShowIncomeReportSection(prev => (panel === 'income' ? !prev : false));
    setShowExpenseReportSection(prev => (panel === 'expense' ? !prev : false));
    setShowReturnReportSection(prev => (panel === 'return' ? !prev : false));
    setShowShippingReportSection(prev => (panel === 'shipping' ? !prev : false));
  };

  const deliveryReportPanelButtons = [
    canRecordDeliveryIncome ? {
      key: 'income',
      label: 'Thu',
      active: showIncomeReportSection,
      summary: parseInputCurrency(collectedAmount) > 0 ? `${formatCurrency(collectedAmount)} đ` : '',
      tone: 'emerald'
    } : null,
    canRecordDeliveryExpense ? {
      key: 'expense',
      label: 'Chi',
      active: showExpenseReportSection,
      summary: parseInputCurrency(deliveryExpenseAmount) > 0 ? `${formatCurrency(deliveryExpenseAmount)} đ` : '',
      tone: 'orange'
    } : null,
    {
      key: 'return',
      label: 'Trả',
      active: showReturnReportSection,
      summary: (returnWeight || returnQuantity || returnPhotoUrl) ? 'Có dữ liệu' : '',
      tone: 'orange'
    },
    {
      key: 'shipping',
      label: 'Gửi xe',
      active: showShippingReportSection,
      summary: parseInputCurrency(shippingAmount) > 0 ? `${formatCurrency(shippingAmount)} đ` : (shippingNote ? 'Có dữ liệu' : ''),
      tone: 'cyan'
    }
  ].filter(Boolean);

  const deliveryReconciliationSection = (
    <section
      aria-labelledby="delivery-reconciliation-title"
      className="rounded-[28px] border border-emerald-100 bg-gradient-to-br from-emerald-50/90 via-white to-cyan-50/70 p-3 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 id="delivery-reconciliation-title" className="truncate text-sm font-black uppercase tracking-[0.12em] text-emerald-800">
              Đối chiếu giao hàng
            </h2>
            {pendingReconciliationDispatchCount > 0 && (
              <span
                className="inline-flex min-w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 px-2 py-1 text-[11px] font-black tabular-nums text-white shadow-sm shadow-emerald-600/20"
                aria-label={`${pendingReconciliationDispatchCount} phiếu chưa báo cáo`}
              >
                {pendingReconciliationDispatchCount}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {pendingReconciliationDispatchCount > 0
              ? `${basePendingReconciliationGroups.length} khách hàng đang chờ báo cáo`
              : 'Tất cả phiếu trong ngày đã được báo cáo.'}
          </p>
        </div>
        <label className="relative shrink-0 overflow-hidden rounded-xl border border-emerald-100 bg-white px-2.5 py-2 text-center shadow-sm">
          <input
            type="date"
            value={workingDate}
            onChange={(event) => setWorkingDate(event.target.value || getTodayString())}
            aria-label="Chọn ngày đối chiếu giao hàng"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <span className="block min-w-[74px] text-[11px] font-extrabold text-emerald-700">{formatCompactDateLabel(workingDate)}</span>
        </label>
      </div>

      {pendingReconciliationDispatchCount === 0 ? (
        <div className="mt-3 flex min-h-[76px] items-center justify-center gap-2 rounded-2xl border border-emerald-100 bg-white/90 px-4 text-center text-sm font-bold text-emerald-700">
          <CheckCircle size={20} className="shrink-0" />
          <span>Không còn phiếu cần đối chiếu</span>
        </div>
      ) : (
        <div className="mt-3 space-y-2" aria-live="polite">
          {visiblePendingReconciliationGroups.map(group => (
            <DeliveryReconciliationCard
              key={group.key}
              group={group}
              isLeaving={leavingReconciliationGroups.has(group.key)}
              onOpen={handleOpenPendingReconciliationGroup}
            />
          ))}
        </div>
      )}

      {hasMorePendingReconciliationCustomers && (
        <button
          type="button"
          onClick={toggleReconciliationExpanded}
          aria-expanded={isReconciliationExpanded}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-emerald-100 bg-white px-3 text-xs font-black text-emerald-700 shadow-sm transition duration-200 hover:border-emerald-200 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
        >
          {isReconciliationExpanded ? 'Thu gọn' : `Xem thêm ${basePendingReconciliationGroups.length - DELIVERY_RECONCILIATION_INITIAL_CUSTOMER_LIMIT} khách`}
          {isReconciliationExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      )}
    </section>
  );

  if (!canViewDeliveryReports && !canCreateDeliveryReport) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center">
        <Lock size={26} className="mx-auto text-slate-300" />
        <p className="mt-3 text-sm font-bold text-slate-600">Bạn chưa được cấp quyền báo cáo giao hàng.</p>
        <p className="mt-1 text-xs text-slate-400">Chủ doanh nghiệp có thể bật quyền này trong mục Vai trò.</p>
      </div>
    );
  }

  if (deliveryProjection.pending || deliveryProjection.error) {
    return (
      <section className="p-4" data-hd-module-loading aria-busy={deliveryProjection.pending}>
        <p className="font-semibold">Báo cáo giao hàng · {formatCompactDateLabel(workingDate)}</p>
        <p className="mt-2 text-sm">{dayDispatches.length} phiếu xuất</p>
        <p role={deliveryProjection.error ? 'alert' : 'status'} className="mt-2 text-sm">
          {deliveryProjection.error ? 'Không thể tổng hợp báo cáo. Vui lòng mở lại.' : 'Đang tổng hợp báo cáo…'}
        </p>
      </section>
    );
  }

  return (
    <div className="mx-auto flex w-[calc(100%-0.75rem)] max-w-[430px] flex-col gap-4 animate-in fade-in pb-16 sm:max-w-[520px]">
      <div className="hidden">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-[12px] font-black uppercase tracking-[0.16em] text-cyan-700">Báo cáo công việc</p>
          <label className="relative shrink-0 overflow-hidden rounded-2xl border border-cyan-100 bg-white px-3 py-2 text-center shadow-sm">
            <input
              type="date"
              value={workingDate}
              onChange={(event) => setWorkingDate(event.target.value || getTodayString())}
              aria-label="Chọn ngày báo cáo"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <span className="block min-w-[86px] text-xs font-extrabold text-cyan-700">{formatCompactDateLabel(workingDate)}</span>
          </label>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-white/80 px-2 py-3">
            <p className="text-lg font-black text-slate-900">{dayDispatches.length}</p>
            <p className="text-[10px] font-bold uppercase text-slate-400">Phiếu xuất</p>
          </div>
          <div className="rounded-2xl bg-white/80 px-2 py-3">
            <p className="text-lg font-black text-emerald-600">{reportedDispatchCount}</p>
            <p className="text-[10px] font-bold uppercase text-slate-400">Đã báo</p>
          </div>
          <div className="rounded-2xl bg-white/80 px-2 py-3">
            <p className="text-lg font-black text-amber-600">{mismatchCount}</p>
            <p className="text-[10px] font-bold uppercase text-slate-400">Lệch cân</p>
          </div>
        </div>
      </div>

      {deliveryReconciliationSection}

      {selectedReportCustomerGroup && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
          onClick={() => setSelectedReportCustomerKey('')}
        >
          <div
            className="max-h-[86vh] w-full max-w-md overflow-y-auto rounded-[28px] bg-white p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-600">Chi tiết báo cáo</p>
                <h3 className="mt-1 truncate text-xl font-black text-slate-900">{selectedReportCustomerGroup.customerName}</h3>
                <p className="mt-1 text-xs font-semibold text-slate-400">{formatCompactDateLabel(workingDate)} • {selectedReportCustomerGroup.reports.length} phiếu</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReportCustomerKey('')}
                className="shrink-0 rounded-full bg-slate-100 p-2 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {selectedReportCustomerGroup.reports.map(report => {
                const product = productLookup.get(report.productId);
                const status = getDeliveryReportWeightStatus(report);
                const productLabel = getCompactProductName(product || { name: report.productNameSnapshot }) || report.productNameSnapshot || 'Hàng hóa';
                const returnPieces = [
                  parseLooseQuantityValue(report.returnWeightKg) > 0 ? `${formatNumber(report.returnWeightKg)} kg trả` : '',
                  parseLooseQuantityValue(report.returnQuantity) > 0 ? `${formatNumber(report.returnQuantity)} ${report.returnQuantityUnit || 'đv'} trả` : ''
                ].filter(Boolean);
                return (
                  <div key={report.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-900">{productLabel}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {parseLooseQuantityValue(report.actualWeightKg) > 0 ? `${formatNumber(report.actualWeightKg)} kg` : 'Chưa nhập kg'}
                          {parseLooseQuantityValue(report.actualQuantity) > 0 ? ` • ${formatNumber(report.actualQuantity)} ${report.actualQuantityUnit || report.expectedQuantityUnit || 'đv'}` : ''}
                          {parseLooseQuantityValue(report.actualPackageCount) > 0 ? ` • ${formatNumber(report.actualPackageCount)} ${report.actualPackageUnit || 'Bọc'}` : ''}
                        </p>
                        {returnPieces.length > 0 && <p className="mt-1 text-xs font-bold text-orange-600">{returnPieces.join(' • ')}</p>}
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${status.isMismatch ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {status.isMismatch ? `Lệch ${formatNumber(Math.abs(status.diff))} kg` : 'Khớp'}
                      </span>
                    </div>
                    <div className={`mt-3 grid gap-2 ${canDeleteDeliveryReport ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedReportCustomerKey('');
                          handleStartEditReport(report);
                        }}
                        className="rounded-xl bg-emerald-500 px-3 py-2.5 text-xs font-black text-white"
                      >
                        Sửa / lưu
                      </button>
                      {canDeleteDeliveryReport && (
                        <button
                          type="button"
                          onClick={() => archiveDeliveryReport(report.id)}
                          disabled={isSaving}
                          className="rounded-xl bg-red-50 px-3 py-2.5 text-xs font-black text-red-600 disabled:opacity-60"
                        >
                          Xóa
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <form ref={deliveryReportFormRef} onSubmit={handleSubmitReport} className="scroll-mt-24 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm space-y-4">
        <div data-search-zone="true" className="relative">
          <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-400">Họ tên khách hàng</label>
          <div className="relative">
            <Search size={17} className="absolute left-3 top-3.5 text-emerald-500" />
            <input
              data-hd-search-input="true"
              type="search"
              value={customerSearch}
              onFocus={() => setShowCustomerList(true)}
              onChange={(event) => {
                setCustomerSearch(capitalizeFirst(event.target.value));
                setShowCustomerList(true);
                if (!event.target.value.trim()) {
                  setSelectedCustomerId('');
                  setSelectedDispatchId('');
                  setActualRows([]);
                  setCollectedAmount('');
                  setCollectedAmountManuallyEdited(false);
                }
              }}
              placeholder="Chọn hoặc tìm khách hàng"
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm font-semibold outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </div>
          {showCustomerList && (
            <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-60 overflow-y-auto rounded-2xl border border-emerald-100 bg-white shadow-xl">
              {filteredCustomerOptions.length > 0 ? filteredCustomerOptions.map(customer => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => handleSelectCustomer(customer)}
                  className="w-full border-b border-slate-50 px-4 py-3 text-left last:border-b-0 hover:bg-emerald-50"
                >
                  <p className="text-sm font-extrabold text-slate-900">{customer.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{[customer.phone, customer.address].filter(Boolean).join(' • ') || 'Chưa có thông tin'}</p>
                </button>
              )) : (
                <p className="px-4 py-5 text-center text-xs font-semibold text-slate-400">Không tìm thấy khách phù hợp.</p>
              )}
            </div>
          )}
          {selectedCustomer && (
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <a
                href={selectedCustomerPhoneHref || undefined}
                title={selectedCustomerPhone ? `Gọi ${selectedCustomerPhone}` : 'Chưa có số điện thoại'}
                aria-label={selectedCustomerPhone ? `Gọi ${selectedCustomerPhone}` : 'Chưa có số điện thoại'}
                onClick={(event) => {
                  if (!selectedCustomerPhoneHref) event.preventDefault();
                }}
                className={`flex min-h-[48px] min-w-0 items-center justify-center rounded-2xl border px-2 py-1.5 text-center shadow-sm ${
                  selectedCustomerPhoneHref
                    ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                    : 'border-slate-100 bg-slate-50 text-slate-400'
                }`}
              >
                <span className="flex min-w-0 items-center gap-1 text-[11px] font-normal leading-4">
                  <Phone size={16} className="shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">{selectedCustomerPhone || 'Chưa có'}</span>
                </span>
              </a>
              <a
                href={selectedCustomerLocationUrl || undefined}
                target="_blank"
                rel="noopener noreferrer"
                title={selectedCustomerLocationLabel || 'Chưa có vị trí'}
                aria-label={selectedCustomerLocationLabel ? `Mở vị trí ${selectedCustomerLocationLabel}` : 'Chưa có vị trí'}
                onClick={(event) => {
                  if (!selectedCustomerLocationUrl) event.preventDefault();
                }}
                className={`flex min-h-[48px] min-w-0 items-center justify-center rounded-2xl border px-2 py-1.5 text-center shadow-sm ${
                  selectedCustomerLocationUrl
                    ? 'border-sky-100 bg-sky-50 text-sky-700'
                    : 'border-slate-100 bg-slate-50 text-slate-400'
                }`}
              >
                <span className="flex min-w-0 items-center gap-1 text-[11px] font-normal leading-4">
                  <MapPin size={16} className="shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">{selectedCustomerLocationLabel || 'Chưa có'}</span>
                </span>
              </a>
              <div className="flex min-h-[48px] min-w-0 flex-col items-center justify-center rounded-2xl border border-rose-100 bg-rose-50 px-1.5 py-1.5 text-center text-rose-700 shadow-sm">
                <span className="text-[11px] font-normal uppercase tracking-wide">Nợ cũ</span>
                <span className="mt-0.5 w-full truncate text-[11px] font-normal leading-4">
                  {selectedCustomerDebtInfo.debt > 0
                    ? `${formatCurrency(selectedCustomerDebtInfo.debt)} đ`
                    : selectedCustomerDebtInfo.credit > 0
                      ? `Dư ${formatCurrency(selectedCustomerDebtInfo.credit)} đ`
                      : '0 đ'}
                </span>
              </div>
            </div>
          )}
        </div>

        {selectedCustomerId && (
          <>
            <div className="rounded-[20px] border border-rose-100 bg-white p-2.5">
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">Thực tế giao hàng</p>
              <datalist id="delivery-report-product-options">
                {products.filter(product => !product.isArchived).map(product => (
                  <option key={product.id} value={getProductShortName(product) || product.name} />
                ))}
              </datalist>
              <div className="space-y-2">
                <div className="grid grid-cols-[1.18fr_0.9fr_0.9fr_0.8fr] gap-1 rounded-2xl border border-slate-100 bg-slate-50 px-1 py-2 text-center text-xs font-black uppercase tracking-wide text-slate-500">
                  <span>Loại</span>
                  <span>Kg</span>
                  <span>Con</span>
                  <span>Giá</span>
                </div>
                {actualRows.map((row) => {
                  const isManualRow = !row.dispatchId;
                  const pricingMeta = resolveActualRowPricingMeta(row);
                  return (
                    <div key={row.rowKey} className="grid grid-cols-[1.18fr_0.9fr_0.9fr_0.8fr] items-center gap-1 text-center text-xs font-semibold">
                      <label className="flex h-11 min-w-0 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/20 px-2 text-center">
                        {isManualRow ? (
                          <input
                            list="delivery-report-product-options"
                            value={row.productNameInput}
                            onChange={(event) => updateActualRow(row.rowKey, { productNameInput: capitalizeFirst(event.target.value), productNameSnapshot: capitalizeFirst(event.target.value) })}
                            onKeyDown={handleDeliveryEnterNext}
                            data-delivery-enter="true"
                            placeholder="Loại hàng"
                            className="h-full w-full min-w-0 appearance-none border-0 bg-transparent p-0 text-center text-xs font-semibold leading-tight text-slate-800 shadow-none outline-none placeholder:text-slate-300 focus:ring-0"
                          />
                        ) : (
                          <span className="truncate text-xs font-semibold leading-tight text-slate-800">{row.productNameInput}</span>
                        )}
                      </label>
                      <label className="flex h-11 min-w-0 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/20 px-1 text-center">
                        {pricingMeta.usesWeightPricing ? (
                          <input
                            type="tel"
                            value={row.actualWeight}
                            onChange={(event) => updateActualRow(row.rowKey, { actualWeight: event.target.value.replace(',', '.') })}
                            onKeyDown={handleDeliveryEnterNext}
                            data-delivery-enter="true"
                            placeholder="Kg"
                            className="h-full w-full min-w-0 appearance-none border-0 bg-transparent p-0 text-center text-xs font-semibold leading-tight text-slate-800 shadow-none outline-none placeholder:text-slate-300 focus:ring-0"
                          />
                        ) : (
                          <span className="text-xs font-semibold text-slate-300" aria-label={`Không áp dụng kg; tính theo ${pricingMeta.pricingUnit}`}>
                            -
                          </span>
                        )}
                      </label>
                      <label className="flex h-11 min-w-0 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/20 px-1 text-center">
                        <input
                          type="tel"
                          value={row.actualQuantity}
                          onChange={(event) => updateActualRow(row.rowKey, {
                            actualQuantity: event.target.value.replace(',', '.'),
                            actualQuantityUnit: pricingMeta.usesWeightPricing
                              ? row.actualQuantityUnit
                              : pricingMeta.pricingUnit,
                          })}
                          onKeyDown={handleDeliveryEnterNext}
                          data-delivery-enter="true"
                          placeholder={pricingMeta.usesWeightPricing ? 'Con' : pricingMeta.pricingUnit}
                          aria-label={`Số lượng ${pricingMeta.usesWeightPricing ? (row.actualQuantityUnit || 'Con') : pricingMeta.pricingUnit}`}
                          className="h-full w-full min-w-0 appearance-none border-0 bg-transparent p-0 text-center text-xs font-semibold leading-tight text-slate-800 shadow-none outline-none placeholder:text-slate-300 focus:ring-0"
                        />
                      </label>
                      <output
                        className="flex h-11 min-w-0 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50/40 px-1 text-center text-[11px] font-bold leading-tight text-emerald-700"
                        aria-label={`Giá bán ${formatCurrency(pricingMeta.unitPrice)} đồng theo ${pricingMeta.pricingUnit}`}
                        title={`Giá bán theo ${pricingMeta.pricingUnit}`}
                      >
                        <span className="truncate">{pricingMeta.unitPrice > 0 ? formatCurrency(pricingMeta.unitPrice) : '-'}</span>
                      </output>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {deliveryReportPanelButtons.length > 0 && (
          <div className="rounded-[22px] border border-slate-100 bg-white p-2 shadow-sm">
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${deliveryReportPanelButtons.length}, minmax(0, 1fr))` }}
            >
              {deliveryReportPanelButtons.map(panel => (
                <button
                  key={panel.key}
                  type="button"
                  data-hd-keep-input-focus="true"
                  aria-expanded={panel.active}
                  onClick={() => toggleDeliveryReportPanel(panel.key)}
                  className={`min-w-0 rounded-2xl border px-2 py-2.5 text-center shadow-sm transition ${
                    panel.active
                      ? panel.tone === 'emerald'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : panel.tone === 'cyan'
                        ? 'border-cyan-200 bg-cyan-50 text-cyan-700'
                        : 'border-orange-200 bg-orange-50 text-orange-700'
                      : 'border-rose-100 bg-white text-slate-600'
                  }`}
                >
                  <span className="block truncate whitespace-nowrap text-[10px] font-black uppercase tracking-[0.06em] sm:text-[11px]">{panel.label}</span>
                  {panel.summary && (
                    <span className={`mt-1 block truncate text-[10px] font-bold ${panel.active ? '' : 'text-slate-400'}`}>{panel.summary}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {canRecordDeliveryIncome && showIncomeReportSection && (
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-2">
            <label className="flex h-11 items-center justify-center rounded-2xl border border-rose-200 bg-white px-3 text-center">
              <input
                type="tel"
                 value={formatInputCurrency(collectedAmount)}
                 onChange={(event) => {
                   setCollectedAmountManuallyEdited(true);
                   setCollectedAmount(parseInputCurrency(event.target.value));
                 }}
                 placeholder={selectedCustomerCollectionHint > 0 ? `Gợi ý ${formatCurrency(selectedCustomerCollectionHint)} đ` : 'Tiền thu'}
                 className="h-full w-full appearance-none border-0 bg-transparent p-0 text-center text-sm font-semibold leading-tight text-emerald-700 shadow-none outline-none placeholder:text-slate-300 focus:ring-0"
               />
            </label>
            <label className="relative flex h-11 items-center justify-center rounded-2xl border border-rose-200 bg-white px-3 text-center">
              <select
                value={collectedMethod}
                onChange={(event) => setCollectedMethod(event.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              >
                <option value="Tiền mặt">Tiền mặt</option>
                <option value="Chuyển khoản">Chuyển khoản</option>
              </select>
              <p className="pointer-events-none truncate text-sm font-semibold leading-tight text-slate-800">{collectedMethod}</p>
            </label>
          </div>
        )}

        {canRecordDeliveryExpense && showExpenseReportSection && (
          <div className="space-y-2 rounded-2xl border border-orange-100 bg-orange-50/70 p-2">
            <datalist id="delivery-expense-category-options">
              {deliveryStandaloneExpenseOptions.map(option => <option key={option} value={option} />)}
            </datalist>
            <div className="space-y-2 rounded-2xl border border-orange-100 bg-white/90 p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-orange-700">Chi chuyến</p>
                  <p className="truncate text-[10px] font-bold text-slate-400">Xăng dầu, mua đá, sửa xe, bốc xếp...</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex h-11 items-center justify-center rounded-2xl border border-orange-100 bg-white px-3 text-center">
                  <input
                    type="tel"
                    value={formatInputCurrency(deliveryExpenseAmount)}
                    onChange={(event) => setDeliveryExpenseAmount(parseInputCurrency(event.target.value))}
                    placeholder="Số tiền"
                    className="h-full w-full appearance-none border-0 bg-transparent p-0 text-center text-sm font-semibold leading-tight text-orange-600 shadow-none outline-none placeholder:text-slate-300 focus:ring-0"
                  />
                </label>
                <label className="flex h-11 items-center justify-center rounded-2xl border border-orange-100 bg-white px-3 text-center">
                  <input
                    list="delivery-expense-category-options"
                    value={deliveryExpenseCategory}
                    onChange={(event) => setDeliveryExpenseCategory(capitalizeFirst(event.target.value))}
                    placeholder="Loại chi"
                    className="h-full w-full appearance-none border-0 bg-transparent p-0 text-center text-sm font-semibold leading-tight text-slate-800 shadow-none outline-none placeholder:text-slate-300 focus:ring-0"
                  />
                </label>
              </div>
              {deliveryAssetOptions.length > 0 && (
                <label className="relative flex h-11 items-center justify-center rounded-2xl border border-orange-100 bg-white px-3 text-center">
                  <select
                    value={deliveryExpenseAssetId}
                    onChange={(event) => {
                      setDeliveryExpenseAssetTouched(true);
                      setDeliveryExpenseAssetId(event.target.value);
                    }}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  >
                    <option value="">Không gắn xe/tài sản</option>
                    {deliveryAssetOptions.map(asset => (
                      <option key={asset.id} value={asset.id}>{formatDeliveryAssetOptionLabel(asset)}</option>
                    ))}
                  </select>
                  <p className="pointer-events-none truncate text-sm font-semibold leading-tight text-slate-800">
                    {deliveryExpenseAssetId ? formatDeliveryAssetOptionLabel(assetLookup.get(deliveryExpenseAssetId) || {}) : 'Xe/tài sản nếu có'}
                  </p>
                </label>
              )}
              <label className="flex h-11 items-center justify-center rounded-2xl border border-orange-100 bg-white px-3 text-center">
                <input
                  value={standaloneExpenseNote}
                  onChange={(event) => setStandaloneExpenseNote(capitalizeFirst(event.target.value))}
                  placeholder="Ghi chú ngắn"
                  className="h-full w-full appearance-none border-0 bg-transparent p-0 text-center text-sm font-semibold leading-tight text-slate-800 shadow-none outline-none placeholder:text-slate-300 focus:ring-0"
                />
              </label>
              {!editingReportId && (
                <button type="button" disabled={isSaving} onClick={handleSaveStandaloneDeliveryExpense}
                  className="min-h-11 w-full rounded-lg border border-orange-200 bg-white px-3 text-sm font-semibold text-orange-700 disabled:opacity-60">
                  {isSaving ? 'Đang lưu...' : 'Lưu chi phí riêng'}
                </button>
              )}
            </div>
          </div>
        )}

        {showReturnReportSection && (
          <div className="space-y-2 rounded-2xl border border-orange-100 bg-orange-50/70 p-2">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_82px] gap-2">
              <label className="flex h-11 min-w-0 items-center justify-center rounded-2xl border border-rose-200 bg-white px-3 text-center">
                <input
                  type="tel"
                  value={returnWeight}
                  onChange={(event) => setReturnWeight(event.target.value.replace(',', '.'))}
                  placeholder="Số kg trả"
                  className="h-full w-full min-w-0 appearance-none border-0 bg-transparent p-0 text-center text-sm font-semibold leading-tight text-orange-700 shadow-none outline-none placeholder:text-slate-300 focus:ring-0"
                />
              </label>
              <label className="flex h-11 min-w-0 items-center justify-center rounded-2xl border border-rose-200 bg-white px-3 text-center">
                <input
                  type="tel"
                  value={returnQuantity}
                  onChange={(event) => setReturnQuantity(event.target.value.replace(',', '.'))}
                  placeholder="Số lượng"
                  className="h-full w-full min-w-0 appearance-none border-0 bg-transparent p-0 text-center text-sm font-semibold leading-tight text-orange-700 shadow-none outline-none placeholder:text-slate-300 focus:ring-0"
                />
              </label>
              <label className="relative flex h-11 min-w-0 items-center justify-center rounded-2xl border border-rose-200 bg-white px-2 text-center">
                <select
                  value={returnQuantityUnit}
                  onChange={(event) => setReturnQuantityUnit(event.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                >
                  {deliveryQuantityUnitOptions.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                </select>
                <p className="pointer-events-none truncate text-sm font-semibold leading-tight text-slate-800">{returnQuantityUnit}</p>
              </label>
            </div>
          </div>
        )}

        {showShippingReportSection && (
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-cyan-100 bg-cyan-50/70 p-2">
            <label className="flex h-11 min-w-0 items-center justify-center rounded-2xl border border-rose-200 bg-white px-3 text-center">
              <input
                type="tel"
                value={formatInputCurrency(shippingAmount)}
                onChange={(event) => setShippingAmount(parseInputCurrency(event.target.value))}
                placeholder="Phí gửi xe"
                className="h-full w-full min-w-0 appearance-none border-0 bg-transparent p-0 text-center text-sm font-semibold leading-tight text-cyan-700 shadow-none outline-none placeholder:text-slate-300 focus:ring-0"
              />
            </label>
            <label className="flex h-11 min-w-0 items-center justify-center rounded-2xl border border-rose-200 bg-white px-3 text-center">
              <input
                value={shippingNote}
                onChange={(event) => setShippingNote(capitalizeFirst(event.target.value))}
                placeholder="Ghi chú gửi xe"
                className="h-full w-full min-w-0 appearance-none border-0 bg-transparent p-0 text-center text-sm font-semibold leading-tight text-slate-800 shadow-none outline-none placeholder:text-slate-300 focus:ring-0"
              />
            </label>
          </div>
        )}

        {statusMessage && (
          <div className={`rounded-2xl px-3 py-2 text-xs font-bold leading-5 ${statusTone === 'red' ? 'bg-red-50 text-red-700 border border-red-100' : statusTone === 'amber' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
            {statusMessage}
          </div>
        )}

        <div className={`grid gap-3 ${editingReportId ? (canDeleteDeliveryReport ? 'grid-cols-[0.8fr_0.8fr_1.4fr]' : 'grid-cols-[0.9fr_1.4fr]') : 'grid-cols-1'}`}>
          {editingReportId && canDeleteDeliveryReport && (
            <button
              type="button"
              onClick={resetReportForm}
              disabled={isSaving}
              className="rounded-2xl bg-slate-100 py-3.5 text-sm font-black text-slate-600 disabled:opacity-60"
            >
              Hủy
            </button>
          )}
          {editingReportId && (
            <button
              type="button"
              onClick={handleDeleteDeliveryReport}
              disabled={isSaving || !onUpdateDeliveryReport}
              className="rounded-2xl bg-red-50 py-3.5 text-sm font-black text-red-600 disabled:opacity-60"
            >
              Xóa
            </button>
          )}
          <button
            type="submit"
            disabled={isSaving || (editingReportId ? !canEditDeliveryReport : !canCreateDeliveryReport)}
            className="rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 py-3.5 text-sm font-black text-white shadow-lg shadow-emerald-500/20 disabled:opacity-60"
          >
            {!canCreateDeliveryReport ? 'Chỉ được xem' : isSaving ? 'Đang lưu...' : editingReportId ? 'Cập nhật' : 'Báo cáo'}
          </button>
        </div>
      </form>

      <section className="rounded-3xl border border-emerald-100 bg-white p-3 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="min-w-0 text-sm font-black uppercase tracking-wide text-slate-800">Báo cáo giao hàng</h3>
          <div className="flex shrink-0 items-center gap-2">
            <label className="relative overflow-hidden rounded-full bg-emerald-50 px-3 py-1.5 text-center">
              <input
                type="date"
                value={workingDate}
                onChange={(event) => setWorkingDate(event.target.value || getTodayString())}
                aria-label="Chọn ngày báo cáo giao hàng"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              <span className="block text-[11px] font-black text-emerald-700">{formatCompactDateLabel(workingDate)} • {reportCustomerGroups.length}</span>
            </label>
            <button
              type="button"
              onClick={handleShareDeliveryReportTable}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-50 text-cyan-600"
              aria-label="Chia sẻ bảng báo cáo giao hàng"
            >
              <Send size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-2xl bg-emerald-50 px-2 py-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-emerald-700">Thu</p>
            <p className="mt-1 text-sm font-black text-emerald-700">{formatCurrency(groupedDeliveryCollectedTotal)} đ</p>
          </div>
          <div className="rounded-2xl bg-orange-50 px-2 py-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-orange-700">Chi</p>
            <p className="mt-1 text-sm font-black text-orange-700">{formatCurrency(groupedDeliveryExpenseTotal)} đ</p>
          </div>
        </div>

        {reportCustomerGroups.length === 0 && dayStandaloneDeliveryExpenses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
            <ClipboardList size={24} className="mx-auto text-slate-300" />
            <p className="mt-2 text-xs font-bold text-slate-400">Chưa có báo cáo giao hàng trong ngày.</p>
          </div>
        ) : (
          <div className="w-full overflow-hidden rounded-2xl border border-slate-100">
            <div className="w-full">
              <div
                className="grid border-b border-slate-200 bg-slate-50 text-center text-[9px] font-black uppercase tracking-tight text-slate-400"
                style={{ gridTemplateColumns: 'minmax(64px, 1.05fr) minmax(0, 3fr)' }}
              >
                <span className="flex items-center justify-center border-r border-slate-200 px-1 py-2">Tên</span>
                <span
                  className="grid divide-x divide-slate-200"
                  style={{ gridTemplateColumns: 'minmax(34px, 1fr) minmax(24px, .56fr) minmax(24px, .56fr) minmax(28px, .62fr) minmax(28px, .62fr)' }}
                >
                  <span className="py-2">Loại</span>
                  <span className="py-2">Kg</span>
                  <span className="py-2">Con</span>
                  <span className="py-2 text-emerald-600">Thu</span>
                  <span className="py-2 text-orange-600">Chi</span>
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {reportCustomerGroups.map(group => {
                  const tableRows = group.tableProductRows?.length
                    ? group.tableProductRows
                    : [{
                        key: `${group.key}-summary`,
                        productLabel: group.productSummary || '-',
                        weight: group.totalWeightKg,
                        quantity: group.totalQuantity
                      }];
                  return (
                    <button
                      key={group.key}
                      type="button"
                      onClick={(event) => { if (event.detail <= 1) setSelectedReportCustomerKey(group.key); }}
                      className="grid w-full items-stretch gap-0 text-center text-[10px] font-semibold text-slate-700 transition hover:bg-emerald-50/60"
                      style={{ gridTemplateColumns: 'minmax(64px, 1.05fr) minmax(0, 3fr)' }}
                    >
                      <span className="flex h-full min-w-0 items-center justify-center border-r border-slate-200 px-1.5 py-2 text-center text-[10px] font-bold leading-4 text-slate-900 sm:text-xs">
                        <span
                          className="break-words"
                          style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                        >
                          {group.customerName}
                        </span>
                      </span>
                      <span className="grid min-w-0">
                        {tableRows.map((row, rowIndex) => (
                          <span
                            key={row.key || `${group.key}-${rowIndex}`}
                            className="grid min-w-0 items-center divide-x divide-slate-100 border-t border-slate-100 first:border-t-0"
                            style={{ gridTemplateColumns: 'minmax(34px, 1fr) minmax(24px, .56fr) minmax(24px, .56fr) minmax(28px, .62fr) minmax(28px, .62fr)' }}
                          >
                            <span className="min-w-0 truncate px-1 py-1.5 text-left leading-4" title={row.productLabel}>
                              {row.productLabel || '-'}
                            </span>
                            <span className="truncate px-0.5 py-1.5 tabular-nums">{formatDeliveryReportPlainNumber(row.weight)}</span>
                            <span className="truncate px-0.5 py-1.5 tabular-nums">{formatDeliveryReportPlainNumber(row.quantity)}</span>
                            <span className="truncate px-0.5 py-1.5 text-emerald-700 tabular-nums">{rowIndex === 0 ? formatDeliveryReportCompactMoney(group.totalCollectedAmount || 0) : ''}</span>
                            <span className="truncate px-0.5 py-1.5 text-orange-700 tabular-nums">{rowIndex === 0 ? formatDeliveryReportCompactMoney(group.totalExpenseAmount || 0) : ''}</span>
                          </span>
                        ))}
                      </span>
                    </button>
                  );
                })}
                {dayStandaloneDeliveryExpenses.length > 0 && (
                  <div className="px-2 py-3 text-[11px] font-bold text-orange-700">
                    <p className="font-black uppercase tracking-wide">Chi phí chuyến giao</p>
                    <div className="mt-1 space-y-1">
                      {dayStandaloneDeliveryExpenses.map((expense, index) => {
                        const expenseAssetLabel = [
                          expense.assetName || expense.deliveryExpenseAssetNameSnapshot,
                          expense.assetPlate || expense.deliveryExpenseAssetPlateSnapshot
                        ].filter(Boolean).join(' - ');
                        return (
                          <p key={expense.id || index} className="flex items-center justify-between gap-2">
                            <span className="truncate">{expense.category || expense.note || 'Chi phí'}{expenseAssetLabel ? ` - ${expenseAssetLabel}` : ''}</span>
                            <span className="shrink-0">{formatCurrency(expense.amount)} đ</span>
                          </p>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
  return DeliveryReportView;
}
