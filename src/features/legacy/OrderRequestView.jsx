import { useState, useEffect, useMemo, useRef } from "react";
import { useModalScrollLock } from "../../layout/index.js";
import { useCallback } from "react";
import { getProductCatalogUnitSuggestions, normalizeProductPricingUnit, resolveProductUnitPrice } from "../../services/productPricingUnits.js";
import { buildFirstRecordLookup } from "../../utils/firstRecordLookup.js";
import { buildCustomerProductBillingSnapshot, isSameBillingUnit, resolveCustomerProductActualUnit, resolveTransactionBillingSnapshot } from "../../services/customerProductBilling.js";
import { getOrderInputUnitOptions } from "../../services/smartCustomerOrdering.js";
import { createRecordCalculationCache } from "../../services/recordCalculationCache.js";
import { sortProjection } from "../../services/cooperativeProjection.js";
import { useCooperativeProjection } from "../../hooks/useCooperativeProjection.js";
import {usePreparedSearchIndex} from '../../hooks/usePreparedSearchIndex.js';
import {getReadOnlyModuleProjectionEntry,getLocalProjectionClockScope} from '../../services/moduleProjectionCaches.js';
import { createBoundedCollationCompare } from "../../services/collationCompareCache.js";
import { applyOrderRequestClassificationEdit, getOrderRequestSizeDisplayValue } from "../../utils/orderRequestEditing.js";
import { createIncrementalStableSorter } from "../../services/incrementalStableSort.js";
import { getPreviousOrderSuggestions, previousOrderDraftFields } from "../../utils/previousOrderSuggestions.js";
import { getOrderRequestAttributeOptions, expandOrderRequestAttributes } from "../../utils/orderRequestAttributes.js";
import { getProductSearchFields, searchCustomers as searchCustomerRecords } from "../../services/searchEngine.js";
import { getGroupedRowPage } from "../../services/groupedRowPage.js";
import { buildOrderRequestSharePagesByCustomer, groupOrderRequestShareRowsByCustomer } from "../../utils/orderRequestShareGrouping.js";
import { configScopeFingerprint } from "../../utils/customerProductAutoSync.js";
import { ORDER_REQUEST_SELECTION_LOCK_MS, releaseOrderRequestSelectionLock, tryAcquireOrderRequestSelectionLock } from "../../utils/orderRequestInteraction.js";
import { useCurrentCallback } from "../../hooks/useCurrentCallback.js";
import { createRecordedShareCanvas } from "../../utils/shareCanvas.js";
import {renderSharePagesSequentially} from '../../utils/sharePagePipeline.js';
import { buildOrderRequestShareFiles, prepareOrderRequestNativeFiles, hasCompleteOrderRequestShareBlobSet } from "../../utils/orderRequestShare.js";
import { createPerformanceSpan, recordPerformanceEvent } from "../../services/performanceMonitor.js";
import { Capacitor } from "@capacitor/core";
import { Share as CapacitorShare } from "@capacitor/share";
import { Plus, Check, X, ChevronDown, ChevronUp, Edit3, Search, Send, Loader2 } from "lucide-react";
import OrderRequestTableRows from "../orders/OrderRequestTableRows.jsx";
import CoreRowPager from "../orders/CoreRowPager.jsx";
// Transitional bundle boundary. Only stable local module bindings are injected;
// all actor/company/business data continues to arrive through current props.
// Generated binding contract is checked against the real source AST.
export function createOrderRequestView(runtime) {
  const {APP_SCREEN_BACK_EVENT,EMPTY_REQUEST_STATUS_MAPS,GEMINI_PROXY_ENABLED,HDSingleCellEditDialog,OrderRequestSelectableProductGroup,SHARE_IMAGE_CACHE_TTL_MS,buildOrderRequestDuplicateSignature,buildStableHash,buildWarehouseDispatchShortageSummary,canvasToBlob,capitalizeFirst,capitalizeFirstPreservingSpacing,debugShareImageCache,drawRoundedRect,ensureMicrophoneAccess,findBestEntityMatch,fitCanvasFontSize,formatCurrency,formatDateLabel,formatInputCurrency,formatNumber,getCompactProductName,getCustomerBranchById,getCustomerBranchDisplayName,getCustomerBranchFixedProductIds,getCustomerBranchProductConfigSource,getCustomerDisplayName,getCustomerFixedProductIds,getCustomerProductAttribute,getCustomerProductConfig,getCustomerProductDefaultUnit,getCustomerProductPrice,getCustomerProductPricingUnit,getCustomerProductSize,getCustomerProductVariants,getEntityTimestamp,getFriendlyFirebaseErrorMessage,getOrderPlacedAtLabel,getOrderPlacedAtTimeLabel,getProductAttributes,getProductShortName,getSalesDownlineEmployeeIds,getTodayString,getTransactionBillingPresentation,groupOrderRequestProductVariants,hasCustomerProductPrice,isEmployeeSalesPosition,isEmployeeWarehouseScalePosition,isNativeRuntime,isOwnerPosition,isShareCancelled,isTimeoutLikeError,mapMicrophoneAccessErrorMessage,markAppBackHandled,normalizeCustomerBranches,normalizeLeadingLabel,normalizeLookupText,parseDateInputValue,parseInputCurrency,parseLooseMoneyValue,parseLooseQuantityValue,readPersistentShareImageAsset,requestOrderRequestDraftFromGeminiAudio,requestOrderRequestDraftFromGeminiTranscript,resolveCustomerProductBillingConfiguration,roundMoneyValue,saveBlobFile,shareBlobFile,tokenizeLookupText,useAutoDismissMessage,vietnamNumericCollator,writeBlobToShareCache,writePersistentShareImageAsset} = runtime;
  function OrderRequestView({ employee, employees = [], customers, products, orderRequests, warehouseDispatches = [], onAddOrderRequest, onEditOrderRequest, onDeleteOrderRequest, onEditCustomer, onGetCustomerProductPreference, onSaveCustomerProductPreference, onSyncCustomerFixedProductDefaults, showFilterPanel, setShowFilterPanel, canViewAllOrderRequests = false, canCreateOrderRequest = false, canEditOrderRequest = false, canEditOrderRequestQuantityUnit = false, canEditOrderRequestSizePrice = false, canDeleteOrderRequest = false, canSetOrderRequestDeposit = false, canEditOrderRequestDeposit = false, canShareOrderRequestSheet = false, canFilterOrderRequests = false, quickActionIntent = null, onQuickActionHandled = () => {} }) {
  const isSales = isEmployeeSalesPosition(employee);
  const isOwner = isOwnerPosition(employee?.position);
  const isWarehouseScale = isEmployeeWarehouseScalePosition(employee);
  const isOwnerAccount = isOwner || employee?.role === 'super_admin';
  const canViewAllRequests = Boolean(canViewAllOrderRequests);
  const canViewSalesDownlineRequests = Boolean(!canViewAllRequests && canViewAllOrderRequests && isSales);
  const canCreate = Boolean(canCreateOrderRequest);
  const canEditGeneral = Boolean(canEditOrderRequest);
  const canEditQuantity = Boolean(canEditGeneral || canEditOrderRequestQuantityUnit);
  const canEditSizePrice = Boolean(canEditGeneral || canEditOrderRequestSizePrice);
  const canEdit = Boolean(canEditGeneral || canEditQuantity || canEditSizePrice);
  const canSetDeposit = Boolean(canSetOrderRequestDeposit || canEditOrderRequestDeposit || canEditOrderRequest);
  const canEditDeposit = Boolean(canEditOrderRequestDeposit || canEditOrderRequest);
  const canDelete = Boolean(canDeleteOrderRequest);
  const canManage = Boolean(canEdit || canEditDeposit || canDelete);
  const canAccess = Boolean(employee);
  const defaultQuantityUnit = 'Con';
  const standardOrderUnitOptions = ['Kg', 'Con', 'Thùng', 'Bao'];
  const createDraftItem = (seed = {}) => ({
    localItemId: seed.localItemId || `req_item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    previousOrder: Boolean(seed.previousOrder),
    productId: seed.productId || '',
    productSearch: seed.productSearch || '',
    attributeLabel: seed.attributeLabel ?? seed.productAttribute ?? seed.attribute ?? '',
    weightKg: seed.weightKg ?? seed.sizeLabel ?? '',
    quantity: seed.quantity ?? '',
    quantityUnit: seed.quantityUnit || defaultQuantityUnit,
    pricingUnit: seed.pricingUnit || seed.defaultUnit || '',
    inputUnitTouched: Boolean(seed.inputUnitTouched),
    rememberedDefaultInputUnit: seed.rememberedDefaultInputUnit || '',
    unitPrice: seed.unitPrice ?? '',
    configurationId: seed.configurationId || '',
    actualQuantity: seed.actualQuantity ?? seed.quantity ?? '',
    actualUnit: seed.actualUnit || seed.actualQuantityUnit || seed.quantityUnit || '',
    billingQuantity: seed.billingQuantity ?? seed.pricingQuantity ?? '',
    billingUnit: seed.billingUnit || seed.pricingUnit || '',
    amount: seed.amount ?? seed.pricingAmount ?? seed.lineTotal ?? '',
    billingSnapshotVersion: seed.billingSnapshotVersion || 0,
    billingSnapshotSource: seed.billingSnapshotSource || ''
  });
  const createDraft = (seed = {}) => ({
    localId: seed.localId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    customerConfigBase: seed.customerConfigBase || '',
    customerId: seed.customerId || '',
    customerSearch: seed.customerSearch || '',
    branchId: seed.branchId || seed.customerBranchId || '',
    branchName: seed.branchName || seed.customerBranchName || '',
    branchAddress: seed.branchAddress || seed.customerBranchAddress || '',
    note: seed.note || '',
    upfrontPayment: seed.upfrontPayment ?? seed.depositAmount ?? seed.prepaidAmount ?? '',
    items: Array.isArray(seed.items) && seed.items.length > 0
      ? seed.items.map(item => createDraftItem(item))
      : [createDraftItem()]
  });
  const requestDraftStorageKey = `hd-order-request-draft-v1:${employee?.companyId || ''}:${employee?.id || ''}`;
  const [restoredRequestDraft] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem(requestDraftStorageKey) || 'null'); }
    catch { return null; }
  });
  const [showForm, setShowForm] = useState(Boolean(restoredRequestDraft?.drafts?.length));
  const [requestDrafts, setRequestDrafts] = useState(() => restoredRequestDraft?.drafts?.length ? restoredRequestDraft.drafts.map(createDraft) : [createDraft()]);
  useModalScrollLock(showForm);
  const [editingRequestId, setEditingRequestId] = useState(restoredRequestDraft?.editingRequestId || null);
  const [inlineEditingRowKey, setInlineEditingRowKey] = useState('');
  const [inlineEditingDraft, setInlineEditingDraft] = useState({ customerId: '', productId: '', attributeLabel: '', sizeLabel: '', quantity: '', quantityUnit: '', pricingUnit: '', unitPrice: '' });
  const [orderCellEditor, setOrderCellEditor] = useState(null);
  const [orderUnitEditor, setOrderUnitEditor] = useState(null);
  const [isSavingOrderCell, setIsSavingOrderCell] = useState(false);
  const orderEditBaseRef = useRef(restoredRequestDraft?.editBase || null);
  const savingOrderCellRef = useRef(false);
  const [requestStatus, setRequestStatus] = useState('');
  const [requestError, setRequestError] = useState('');
  const [isRequestSubmitting, setIsRequestSubmitting] = useState(false);
  const requestSubmittingRef = useRef(false);
  const [sheetStatus, setSheetStatus] = useState('');
  const [isSheetExporting, setIsSheetExporting] = useState(false);
  const orderRequestSheetAssetCacheRef = useRef(new Map());
  const orderRequestSheetPendingCacheRef = useRef(new Map());
  const [openDraftPicker, setOpenDraftPicker] = useState(null);
  const [internalShowRequestFilterPanel, setInternalShowRequestFilterPanel] = useState(false);
  const showRequestFilterPanel = typeof showFilterPanel === 'boolean' ? showFilterPanel : internalShowRequestFilterPanel;
  const setShowRequestFilterPanel = setShowFilterPanel || setInternalShowRequestFilterPanel;
  const [orderEntryMode, setOrderEntryMode] = useState('manual');
  const [orderFormStage, setOrderFormStage] = useState('manual_setup');
  const requestDraftCacheRef = useRef(null);
  const requestDraftScopeRef = useRef(requestDraftStorageKey);
  useEffect(() => {
    if (requestDraftScopeRef.current === requestDraftStorageKey) return;
    requestDraftScopeRef.current = requestDraftStorageKey;
    orderEditBaseRef.current = null;
    setShowForm(false);
    setEditingRequestId(null);
    setRequestDrafts([createDraft()]);
  }, [requestDraftStorageKey]);
  requestDraftCacheRef.current = { drafts: requestDrafts, editingRequestId, editBase: orderEditBaseRef.current, showForm };
  useEffect(() => {
    const persist = () => {
      if (!requestDraftCacheRef.current?.showForm) return;
      try { window.localStorage.setItem(requestDraftStorageKey, JSON.stringify(requestDraftCacheRef.current)); }
      catch { /* The durable save queue reports storage errors when saving. */ }
    };
    const timer = window.setTimeout(persist, 250);
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', persist);
    return () => { window.clearTimeout(timer); window.removeEventListener('pagehide', persist); document.removeEventListener('visibilitychange', persist); };
  }, [requestDraftStorageKey, requestDrafts, editingRequestId, showForm]);
  useEffect(() => () => {
    if (requestDraftCacheRef.current?.showForm) {
      try { window.localStorage.setItem(requestDraftStorageKey, JSON.stringify(requestDraftCacheRef.current)); }
      catch { /* The durable save queue reports storage errors when saving. */ }
    }
  }, [requestDraftStorageKey]);
  const [orderVoiceStatus, setOrderVoiceStatus] = useState('');
  const [isOrderVoiceListening, setIsOrderVoiceListening] = useState(false);
  const [isOrderVoiceProcessing, setIsOrderVoiceProcessing] = useState(false);
  const [orderVoiceTarget, setOrderVoiceTarget] = useState({ draftLocalId: '', itemLocalId: '' });
  const [quickProductSearch, setQuickProductSearch] = useState('');
  const [pendingQuickProductSelectionKeys, setPendingQuickProductSelectionKeys] = useState(() => new Set());
  const orderVoiceRecognitionRef = useRef(null);
  const orderVoiceMediaRecorderRef = useRef(null);
  const orderVoiceMediaStreamRef = useRef(null);
  const orderVoiceChunksRef = useRef([]);
  const requestDateInputRef = useRef(null);
  const quickProductSelectionLocksRef = useRef(new Set());
  const quickProductSelectionTimersRef = useRef(new Map());
  const quickProductSelectActionRef = useRef(null);
  const handleQuickProductCardSelect = useCallback((selectionKey, productId, variantConfig) => {
    quickProductSelectActionRef.current?.(productId, variantConfig, selectionKey);
  }, []);
  const clearQuickProductSelectionLocks = useCallback(() => {
    quickProductSelectionTimersRef.current.forEach(timerId => window.clearTimeout(timerId));
    quickProductSelectionTimersRef.current.clear();
    quickProductSelectionLocksRef.current.clear();
    setPendingQuickProductSelectionKeys(previous => (previous.size > 0 ? new Set() : previous));
  }, []);
  const keepOrderRequestWorkingNotice = useCallback((message = '') => {
    const normalizedMessage = `${message || ''}`.trim();
    return /^(Đang|Dang|Firebase đang phản hồi chậm|Firebase đang tự phục hồi)/i.test(normalizedMessage);
  }, []);
  useAutoDismissMessage(requestStatus, setRequestStatus, { delay: 4200, keepWhile: keepOrderRequestWorkingNotice });
  useAutoDismissMessage(sheetStatus, setSheetStatus, { delay: 5200 });
  useAutoDismissMessage(orderVoiceStatus, setOrderVoiceStatus, { delay: 4500, keepWhile: keepOrderRequestWorkingNotice });
  useAutoDismissMessage(requestError, setRequestError, { delay: 9000 });
  useEffect(() => () => {
    quickProductSelectionTimersRef.current.forEach(timerId => window.clearTimeout(timerId));
    quickProductSelectionTimersRef.current.clear();
    quickProductSelectionLocksRef.current.clear();
  }, []);
  const openRequestDatePicker = () => {
    const input = requestDateInputRef.current;
    if (!input) return;
    try {
      if (typeof input.showPicker === 'function') input.showPicker();
      else input.click();
    } catch (error) {
      input.focus();
      input.click();
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleScreenBack = (event) => {
      if (openDraftPicker) {
        setOpenDraftPicker(null);
        markAppBackHandled(event);
        return;
      }
      if (orderUnitEditor) {
        setOrderUnitEditor(null);
        markAppBackHandled(event);
        return;
      }
      if (orderCellEditor && !isSavingOrderCell) {
        setOrderCellEditor(null);
        setInlineEditingRowKey('');
        markAppBackHandled(event);
        return;
      }
      if (inlineEditingRowKey) {
        setInlineEditingRowKey('');
        markAppBackHandled(event);
        return;
      }
      if (showForm) {
        setShowForm(false);
        setOrderFormStage('manual_setup');
        setOrderEntryMode('manual');
        markAppBackHandled(event);
        return;
      }
      if (showRequestFilterPanel) {
        setShowRequestFilterPanel(false);
        markAppBackHandled(event);
        return;
      }
      if (isOrderVoiceListening || isOrderVoiceProcessing) {
        orderVoiceRecognitionRef.current?.stop?.();
        orderVoiceMediaRecorderRef.current?.stop?.();
        orderVoiceMediaStreamRef.current?.getTracks?.().forEach(track => track.stop());
        setIsOrderVoiceListening(false);
        setIsOrderVoiceProcessing(false);
        markAppBackHandled(event);
      }
    };
    window.addEventListener(APP_SCREEN_BACK_EVENT, handleScreenBack);
    return () => window.removeEventListener(APP_SCREEN_BACK_EVENT, handleScreenBack);
  }, [inlineEditingRowKey, isOrderVoiceListening, isOrderVoiceProcessing, isSavingOrderCell, openDraftPicker, orderCellEditor, orderUnitEditor, showForm, showRequestFilterPanel]);

  const salesVisibleEmployeeIdSet = useMemo(() => {
    const ids = new Set();
    if (employee?.id) {
      ids.add(employee.id);
      if (canViewSalesDownlineRequests) {
        getSalesDownlineEmployeeIds(employee.id, employees).forEach(id => ids.add(id));
      }
    }
    return ids;
  }, [canViewSalesDownlineRequests, employee?.id, employees]);
  const availableCustomers = useMemo(
    () => customers
      .filter(customer => !customer.isArchived && (!isSales || canViewAllRequests || salesVisibleEmployeeIdSet.has(customer.empId)))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi')),
    [canViewAllRequests, customers, isSales, salesVisibleEmployeeIdSet]
  );
  const activeProducts = useMemo(
    () => (products || [])
      .filter(product => !product.isArchived)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi')),
    [products]
  );
  const quantityUnitOptions = useMemo(() => {
    const catalogUnits = getProductCatalogUnitSuggestions(activeProducts);
    return catalogUnits.length > 0 ? catalogUnits : [defaultQuantityUnit];
  }, [activeProducts]);
  const customerLookup = useMemo(
    () => new Map(availableCustomers.map(customer => [customer.id, customer])),
    [availableCustomers]
  );
  const productLookup = useMemo(
    () => new Map(activeProducts.map(product => [product.id, product])),
    [activeProducts]
  );
  const requestCustomerLookup = useMemo(() => buildFirstRecordLookup(customers), [customers]);
  const requestProductLookup = useMemo(() => buildFirstRecordLookup(activeProducts), [activeProducts]);
  const getOrderRequestFixedProducts = (customer = null, branchId = '') => {
    if (!customer) return [];
    const fixedProductIds = branchId
      ? getCustomerBranchFixedProductIds(customer, branchId, activeProducts)
      : getCustomerFixedProductIds(customer, activeProducts);
    return fixedProductIds.map(productId => productLookup.get(productId)).filter(Boolean);
  };
  const resolveDraftItemQuantityUnit = (configSource = null, product = null, requestedUnit = '') => {
    const configuration = resolveCustomerProductBillingConfiguration(configSource, product);
    const defaultInputUnit = configuration.defaultOrderUnit || resolveCustomerProductActualUnit(configuration, product);
    const unitOptions = getOrderInputUnitOptions({
      product,
      pricingUnit: configuration.billingUnit,
      currentUnit: requestedUnit,
      catalogUnits: quantityUnitOptions,
      fallback: defaultInputUnit || defaultQuantityUnit,
    });
    const normalizedRequestedUnit = normalizeProductPricingUnit(requestedUnit);
    return unitOptions.find(unit => normalizeLookupText(unit) === normalizeLookupText(normalizedRequestedUnit))
      || unitOptions.find(unit => isSameBillingUnit(unit, defaultInputUnit))
      || unitOptions[0]
      || getCustomerProductDefaultUnit(configSource, product, defaultQuantityUnit);
  };
  const getDraftItemUnitOptions = (draft = {}, item = {}) => {
    const product = productLookup.get(item.productId);
    if (!product) return [normalizeProductPricingUnit(item.quantityUnit || defaultQuantityUnit)].filter(Boolean);
    const selectedCustomer = draft.customerId ? customerLookup.get(draft.customerId) : null;
    const configSource = getCustomerBranchProductConfigSource(selectedCustomer, draft.branchId || '', activeProducts);
    const configuration = resolveCustomerProductBillingConfiguration(configSource, product, {
      configurationId: item.configurationId || '',
      sizeLabel: item.weightKg || item.sizeLabel || '',
      attributeLabel: item.attributeLabel || '',
    });
    const defaultInputUnit = resolveCustomerProductActualUnit(configuration, product);
    return getOrderInputUnitOptions({
      product,
      pricingUnit: item.billingUnit || item.pricingUnit || configuration.billingUnit,
      currentUnit: item.quantityUnit || item.actualUnit,
      rememberedUnit: item.rememberedDefaultInputUnit,
      catalogUnits: quantityUnitOptions,
      fallback: defaultInputUnit || defaultQuantityUnit,
    });
  };

  const handleDraftItemQuantityUnitChange = (localId, itemLocalId, nextUnit) => {
    const draft = requestDrafts.find(item => item.localId === localId);
    const item = draft?.items?.find(candidate => candidate.localItemId === itemLocalId);
    const product = productLookup.get(item?.productId);
    const quantityUnit = normalizeProductPricingUnit(nextUnit);
    if (!quantityUnit) {
      setRequestError('Bạn hãy nhập đơn vị đặt hàng trước khi lưu.');
      return false;
    }
    if (!draft || !item || !product) {
      updateDraftItem(localId, itemLocalId, { quantityUnit, actualUnit: quantityUnit, inputUnitTouched: true });
      return true;
    }
    updateDraftItem(localId, itemLocalId, {
      quantityUnit,
      actualUnit: quantityUnit,
      inputUnitTouched: true
    });
    setRequestError('');
    return true;
  };
  const openDraftItemUnitEditor = (draft = {}, item = {}) => {
    const product = productLookup.get(item.productId);
    if (!product) return;
    const orderUnit = normalizeProductPricingUnit(item.quantityUnit || item.actualUnit)
      || getDraftItemUnitOptions(draft, item)[0]
      || defaultQuantityUnit;
    setOrderUnitEditor({
      draftLocalId: draft.localId,
      itemLocalId: item.localItemId,
      productName: product.name || 'Sản phẩm',
      pricingUnit: normalizeProductPricingUnit(item.billingUnit || item.pricingUnit || ''),
      orderUnit,
      activeTarget: 'orderUnit',
      showCustomUnitInput: false,
      customUnit: '',
      error: '',
    });
  };
  const selectOrderUnitEditorValue = (nextUnit) => {
    const normalizedUnit = normalizeProductPricingUnit(nextUnit);
    if (!normalizedUnit) return;
    setOrderUnitEditor(previous => previous ? {
      ...previous,
      [previous.activeTarget === 'pricingUnit' ? 'pricingUnit' : 'orderUnit']: normalizedUnit,
      customUnit: '',
      showCustomUnitInput: false,
      error: '',
    } : previous);
  };
  const addCustomOrderUnitEditorValue = () => {
    const normalizedUnit = normalizeProductPricingUnit(orderUnitEditor?.customUnit || '');
    if (!normalizedUnit) {
      setOrderUnitEditor(previous => previous ? { ...previous, error: 'Vui lòng nhập tên đơn vị mới.' } : previous);
      return;
    }
    selectOrderUnitEditorValue(normalizedUnit);
  };
  const saveDraftItemUnitEditor = (event) => {
    event?.preventDefault?.();
    if (!orderUnitEditor) return;
    const pricingUnit = normalizeProductPricingUnit(orderUnitEditor.pricingUnit);
    const quantityUnit = normalizeProductPricingUnit(orderUnitEditor.orderUnit);
    if (!pricingUnit || !quantityUnit) {
      setOrderUnitEditor(previous => ({
        ...previous,
        error: !pricingUnit ? 'Vui lòng chọn ĐVT giá.' : 'Vui lòng chọn ĐV đặt.',
      }));
      return;
    }
    const draft = requestDrafts.find(item => item.localId === orderUnitEditor.draftLocalId);
    const item = draft?.items?.find(candidate => candidate.localItemId === orderUnitEditor.itemLocalId);
    const product = productLookup.get(item?.productId);
    if (!draft || !item || !product) {
      setOrderUnitEditor(previous => ({ ...previous, error: 'Không tìm thấy dòng sản phẩm cần cập nhật.' }));
      return;
    }
    const selectedCustomer = draft.customerId ? customerLookup.get(draft.customerId) : null;
    const configSource = getCustomerBranchProductConfigSource(selectedCustomer, draft.branchId || '', activeProducts);
    const configuredPriceForUnit = resolveProductUnitPrice({
      product,
      customerConfig: getCustomerProductConfig(configSource, product),
      unit: pricingUnit,
    });
    const currentUnitPrice = parseLooseMoneyValue(item.unitPrice);
    const unitPrice = configuredPriceForUnit > 0 ? configuredPriceForUnit : currentUnitPrice;
    updateDraftItem(orderUnitEditor.draftLocalId, orderUnitEditor.itemLocalId, {
      quantityUnit,
      actualUnit: quantityUnit,
      pricingUnit,
      billingUnit: pricingUnit,
      unitPrice: unitPrice > 0 ? unitPrice : '',
      inputUnitTouched: true,
      rememberedDefaultInputUnit: quantityUnit,
      billingQuantity: '',
      amount: '',
      billingSnapshotVersion: unitPrice > 0 ? 1 : 0,
      billingSnapshotSource: unitPrice > 0 ? 'order_request_unit_editor' : '',
    });
    setRequestError('');
    setOrderUnitEditor(null);
  };
  const getOrderRequestBranchRef = (customer = null, source = {}, fallbackSource = {}) => {
    if (!customer) return { branchId: '', branchName: '', branchAddress: '' };
    const rawBranchId = `${source.branchId || source.customerBranchId || fallbackSource.branchId || fallbackSource.customerBranchId || ''}`.trim();
    const branch = rawBranchId ? getCustomerBranchById(customer, rawBranchId, activeProducts) : null;
    const branchId = branch?.id || rawBranchId;
    const branchName = `${source.branchName || source.customerBranchName || fallbackSource.branchName || fallbackSource.customerBranchName || ''}`.trim()
      || (branch ? getCustomerBranchDisplayName(branch) : '');
    const branchAddress = `${source.branchAddress || source.customerBranchAddress || fallbackSource.branchAddress || fallbackSource.customerBranchAddress || ''}`.trim()
      || branch?.address
      || '';
    return { branchId, branchName, branchAddress };
  };
  const getDefaultOrderRequestBranchRef = (customer = null) => {
    const branches = normalizeCustomerBranches(customer || {}, activeProducts);
    const branch = branches[0] || null;
    return {
      branchId: branch?.id || '',
      branchName: branch ? getCustomerBranchDisplayName(branch) : '',
      branchAddress: branch?.address || ''
    };
  };
  const formatOrderRequestBranchLabel = (branchRef = {}) => {
    const branchName = `${branchRef.branchName || branchRef.customerBranchName || ''}`.trim();
    return branchName ? `CN: ${branchName}` : '';
  };
  const salesFilterOptions = useMemo(
    () => (employees || [])
      .filter((item) => !item?.isArchived && isEmployeeSalesPosition(item))
      .filter((item) => !isSales || canViewAllRequests || salesVisibleEmployeeIdSet.has(item.id))
      .sort((a, b) => (a?.name || '').localeCompare(b?.name || '', 'vi')),
    [canViewAllRequests, employees, isSales, salesVisibleEmployeeIdSet]
  );
  const salesEmployeeLookup = useMemo(
    () => new Map((employees || []).map((item) => [item.id, item])),
    [employees]
  );
  const resolveRequestSalesEmpId = (request = {}) => (
    request.salesEmpId
    || request.assignedSalesEmpId
    || request.responsibleEmployeeId
    || request.customer?.empId
    || request.customer?.salesEmpId
    || request.customer?.managerEmpId
    || request.createdByEmpId
    || request.empId
    || ''
  );
  const isCustomerPortalOrderRequest = (request = {}) => (
    request.source === 'customer_portal'
    || request.createdByRole === 'customer'
    || Boolean(request.createdByCustomerId)
  );
  const getCustomerPortalApprovalState = (request = {}) => {
    if (!isCustomerPortalOrderRequest(request)) return '';
    const rawStatus = `${request.employeeApprovalStatus || request.customerApprovalStatus || request.reviewStatus || request.status || ''}`.toLowerCase();
    if (['accepted', 'received', 'confirmed', 'approved', 'converted', 'completed'].includes(rawStatus)) return 'confirmed';
    if (['rejected', 'cancelled', 'canceled'].includes(rawStatus)) return 'rejected';
    return 'pending';
  };
  const getCustomerPortalApprovalLabel = (state = '') => {
    if (state === 'confirmed') return 'Đã nhận';
    if (state === 'rejected') return 'Từ chối';
    if (state === 'pending') return 'Chờ duyệt';
    return '';
  };
  const canApproveCustomerPortalRequest = (request = {}) => {
    if (!isCustomerPortalOrderRequest(request)) return false;
    if (isOwnerAccount || canViewAllRequests || canEdit) return true;
    const requestCustomer = customers.find((customer) => customer.id === request.customerId) || request.customer || {};
    const requestSalesEmpId = resolveRequestSalesEmpId({ ...request, customer: requestCustomer });
    return Boolean(requestSalesEmpId && salesVisibleEmployeeIdSet.has(requestSalesEmpId));
  };
  const resolveSalesEmployeeName = (salesEmpId = '') => (
    salesEmployeeLookup.get(salesEmpId)?.name
    || (salesEmpId && salesEmpId === employee?.id ? employee?.name : '')
    || 'Chưa rõ nhân viên'
  );
  const resolveQuantityUnitOption = (value = '', fallback = '') => {
    const candidates = [value, fallback, defaultQuantityUnit].map((item) => `${item || ''}`.trim()).filter(Boolean);
    for (const candidate of candidates) {
      const normalizedCandidate = normalizeLookupText(candidate);
      const matched = quantityUnitOptions.find((option) => {
        const normalizedOption = normalizeLookupText(option);
        return normalizedOption === normalizedCandidate
          || normalizedOption.includes(normalizedCandidate)
          || normalizedCandidate.includes(normalizedOption);
      });
      if (matched) return matched;
    }
    return `${fallback || ''}`.trim();
  };
  const buildOrderVoiceContext = () => ({
    customers: availableCustomers.map((customer) => customer?.name || ''),
    products: activeProducts.map((product) => product?.name || ''),
    quantityUnits: quantityUnitOptions
  });
  const cleanupOrderVoiceResources = () => {
    if (orderVoiceMediaStreamRef.current) {
      orderVoiceMediaStreamRef.current.getTracks().forEach((track) => track.stop());
      orderVoiceMediaStreamRef.current = null;
    }
    orderVoiceMediaRecorderRef.current = null;
    orderVoiceChunksRef.current = [];
  };
  const stopOrderVoiceCapture = () => {
    if (orderVoiceRecognitionRef.current) {
      orderVoiceRecognitionRef.current.stop();
      orderVoiceRecognitionRef.current = null;
    }
    if (orderVoiceMediaRecorderRef.current) {
      if (orderVoiceMediaRecorderRef.current.state !== 'inactive') {
        orderVoiceMediaRecorderRef.current.stop();
      } else {
        cleanupOrderVoiceResources();
      }
    }
    setIsOrderVoiceListening(false);
  };
  useEffect(() => () => {
    stopOrderVoiceCapture();
    cleanupOrderVoiceResources();
  }, []);
  const requestWorkingDate = getTodayString();
  const [requestFilterDate, setRequestFilterDate] = useState(requestWorkingDate);
  const [requestFilterDateTouched, setRequestFilterDateTouched] = useState(false);
  const [requestFilterSalesEmpId, setRequestFilterSalesEmpId] = useState('all');
  const setRequestFilterDateFromUser = (value) => {
    setRequestFilterDate(value || requestWorkingDate);
    setRequestFilterDateTouched(true);
  };
  const resetOrderRequestFilters = () => {
    setRequestFilterDate(requestWorkingDate);
    setRequestFilterSalesEmpId('all');
    setRequestFilterDateTouched(false);
  };
  useEffect(() => {
    if (requestFilterDateTouched) return;
    if (requestFilterDate !== requestWorkingDate) {
      setRequestFilterDate(requestWorkingDate);
    }
  }, [requestFilterDate, requestFilterDateTouched, requestWorkingDate]);
  useEffect(() => {
    if (canViewAllRequests && requestFilterSalesEmpId !== 'all') {
      setRequestFilterSalesEmpId('all');
      return;
    }
    if (!isSales || requestFilterSalesEmpId === 'all') return;
    if (!salesVisibleEmployeeIdSet.has(requestFilterSalesEmpId)) {
      setRequestFilterSalesEmpId('all');
    }
  }, [canViewAllRequests, isSales, requestFilterSalesEmpId, salesVisibleEmployeeIdSet]);
  useEffect(() => {
    if (requestFilterSalesEmpId === 'all') return;
    const validSalesFilterIds = new Set(salesFilterOptions.map((salesEmployee) => salesEmployee.id).filter(Boolean));
    if (!validSalesFilterIds.has(requestFilterSalesEmpId)) {
      setRequestFilterSalesEmpId('all');
    }
  }, [requestFilterSalesEmpId, salesFilterOptions]);
  const resolveOrderRequestDateKey = (request = {}) => {
    const rawDate = `${request?.date || request?.requestDate || request?.requestDateKey || request?.orderRequestDate || request?.deliveryDate || ''}`.trim();
    if (rawDate && parseDateInputValue(rawDate)) return rawDate;
    const stamp = getEntityTimestamp(request);
    if (!stamp) return requestWorkingDate;
    const parsed = new Date(stamp);
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const canEmployeeViewRequest = (request = {}) => {
    if (canViewAllRequests || !isSales) return true;
    const requestCustomer = requestCustomerLookup.get(request.customerId);
    const requestSalesEmpId = request.salesEmpId
      || request.assignedSalesEmpId
      || request.responsibleEmployeeId
      || requestCustomer?.empId
      || requestCustomer?.salesEmpId
      || requestCustomer?.managerEmpId
      || request.createdByEmpId
      || request.empId
      || '';
    return salesVisibleEmployeeIdSet.has(requestSalesEmpId);
  };
  const latestOrderRequests = useMemo(() => {
    const grouped = new Map();
    (Array.isArray(orderRequests) ? orderRequests : []).forEach((request) => {
      if (!request || request.isArchived) return;
      const isCustomerVersionedRequest = request.createdByRole === 'customer'
        || request.source === 'customer_portal'
        || request.createdByCustomerId
        || request.customerOrderRootId
        || request.sourceCustomerRequestId
        || request.clientRequestId;
      const versionKey = isCustomerVersionedRequest
        ? (request.customerOrderRootId || request.sourceCustomerRequestId || request.clientRequestId || request.id)
        : request.id;
      if (!versionKey) return;
      const current = grouped.get(versionKey);
      if (!current || (getEntityTimestamp(request) || 0) >= (getEntityTimestamp(current) || 0)) {
        grouped.set(versionKey, request);
      }
    });
    return Array.from(grouped.values());
  }, [orderRequests]);
  const getVisibleRequest = useMemo(() => createRecordCalculationCache((request, requestDateKey, customer, primaryProduct) => ({
    ...request,
    requestDateKey,
    customer,
    primaryItem: (request.items || [])[0] || null,
    primaryProduct
  })), [employee?.companyId, employee?.tenantId]);
  const [requestProjectionAttempt,setRequestProjectionAttempt]=useState(0);
  const prepareVisibleRequests = useMemo(() => function* () {
    const rows=[];let operations=0;
    for (const request of latestOrderRequests) {
      if (++operations % 16 === 0) yield;
      if (request.isArchived || !canEmployeeViewRequest(request)) continue;
      const primaryItem = (request.items || [])[0] || null;
      const requestDateKey = resolveOrderRequestDateKey(request);
      rows.push(getVisibleRequest(
        request,
        requestDateKey,
        requestCustomerLookup.get(request.customerId) || null,
        primaryItem?.productId ? requestProductLookup.get(primaryItem.productId) || null : null
      ));
    }
    return yield* sortProjection(rows,(a,b)=>(getEntityTimestamp(b) || 0)-(getEntityTimestamp(a) || 0));
  }, [getVisibleRequest, latestOrderRequests, requestCustomerLookup, requestProductLookup, requestWorkingDate, canViewAllRequests, isSales, salesVisibleEmployeeIdSet,requestProjectionAttempt]);
  const requestProjectionScope={companyId:employee?.companyId||employee?.tenantId||'',employeeId:employee?.id||'',
    permissionKey:JSON.stringify([canViewAllRequests,isSales,Array.from(salesVisibleEmployeeIdSet).sort()]),periodKey:requestWorkingDate,
    clockKey:getLocalProjectionClockScope(getTodayString())};
  const visibleRequestEntry=getReadOnlyModuleProjectionEntry('requestVisible',[employee,employees,customers,products,orderRequests],requestProjectionScope);
  const visibleRequestsProjection=useCooperativeProjection(prepareVisibleRequests,visibleRequestEntry);
  const visibleRequests=visibleRequestsProjection.value;
  const filteredRequests = useMemo(
    () => visibleRequests.filter((request) => {
      const matchesDate = !requestFilterDate || request.requestDateKey === requestFilterDate;
      const requestSalesEmpId = resolveRequestSalesEmpId(request);
      const matchesSales = requestFilterSalesEmpId === 'all' || requestSalesEmpId === requestFilterSalesEmpId;
      return matchesDate && matchesSales;
    }),
    [visibleRequests, requestFilterDate, requestFilterSalesEmpId]
  );
  const requestDateCounts = useMemo(() => visibleRequests.reduce((acc, request) => {
    const dateKey = request.requestDateKey || requestWorkingDate;
    acc.set(dateKey, (acc.get(dateKey) || 0) + 1);
    return acc;
  }, new Map()), [requestWorkingDate, visibleRequests]);
  const todayRequestCount = requestDateCounts.get(requestWorkingDate) || 0;
  const hasHiddenTodayRequests = Boolean(requestFilterDate && requestFilterDate !== requestWorkingDate && todayRequestCount > 0);
  const getOrderRequestProductSortLabel = (row = {}) => (
    `${row.productShortName || row.productName || row.productGroupName || ''}`.trim()
  );
  const compareRequestLabels = useMemo(() => createBoundedCollationCompare(vietnamNumericCollator),
    [employee?.companyId, employee?.tenantId]);
  const compareOrderRequestRowsByProduct = (a = {}, b = {}) => {
    const groupCompare = compareRequestLabels(`${a.productGroupName || ''}`, `${b.productGroupName || ''}`);
    if (groupCompare !== 0) return groupCompare;

    const productCompare = compareRequestLabels(getOrderRequestProductSortLabel(a), getOrderRequestProductSortLabel(b));
    if (productCompare !== 0) return productCompare;

    const customerCompare = compareRequestLabels(`${a.customerName || ''}`, `${b.customerName || ''}`);
    if (customerCompare !== 0) return customerCompare;

    const sizeCompare = compareRequestLabels(`${getOrderRequestSizeCellLabel(a) || ''}`, `${getOrderRequestSizeCellLabel(b) || ''}`);
    if (sizeCompare !== 0) return sizeCompare;

    return (parseLooseMoneyValue(a.unitPrice) || 0) - (parseLooseMoneyValue(b.unitPrice) || 0);
  };
  const compareOrderRequestRowsByRecent = (a = {}, b = {}) => {
    const timeCompare = (b.requestSortTime || 0) - (a.requestSortTime || 0);
    if (timeCompare !== 0) return timeCompare;

    const customerCompare = compareRequestLabels(`${a.customerName || ''}`, `${b.customerName || ''}`);
    if (customerCompare !== 0) return customerCompare;

    return compareOrderRequestRowsByProduct(a, b);
  };
  const getOrderRequestMainGroupLabel = (product = {}, fallback = '') => {
    const rawLabel = product?.mainGroup
      || product?.groupName
      || product?.productGroup
      || product?.category
      || fallback
      || product?.name
      || 'Nhóm hàng';
    const normalized = normalizeLeadingLabel(rawLabel);
    const lookup = normalizeLookupText(normalized);
    const tokens = tokenizeLookupText(normalized);
    const hasToken = (...values) => values.some((value) => tokens.includes(value));
    if (hasToken('vit')) return 'Vịt';
    if (hasToken('ga')) return 'Gà';
    if (hasToken('heo', 'lon')) return 'Heo';
    if (lookup.includes('thung') || lookup.includes('tui') || lookup.includes('bao') || lookup.includes('vat tu')) return 'Vật tư';
    return normalized || 'Nhóm hàng';
  };
  const getOrderRequestRowNoteText = (row = {}) => capitalizeFirstPreservingSpacing(`${row?.note || row?.requestNote || ''}`.trim());
  const getOrderRequestRowProductLabel = (row = {}) => row.productShortName || getCompactProductName(null, row.productName || 'Hàng hóa');
  const getOrderRequestSizeCellLabel = (row = {}) => getOrderRequestSizeDisplayValue(row);
  const buildOrderRequestProductCellText = (row = {}, { multiline = false } = {}) => {
    const productLabel = getOrderRequestRowProductLabel(row);
    const noteLabel = getOrderRequestRowNoteText(row);
    if (!noteLabel) return productLabel;
    return multiline ? `${productLabel}\n${noteLabel}` : `${productLabel} • ${noteLabel}`;
  };
  // Branch resolution captures this catalog; customer maps are not cache-wide dependencies.
  const getRequestSheetRows = useMemo(() => createRecordCalculationCache((request, requestCustomer, productsById) => {
    const requestItems = (request.items || []).length > 0 ? request.items : (request.primaryItem ? [request.primaryItem] : []);
    return requestItems.map((item, index) => {
      const matchedProduct = item.productId ? productsById.get(item.productId) || request.primaryProduct : request.primaryProduct;
      const productName = matchedProduct?.name || item.description || 'Hàng hóa';
      const branchRef = getOrderRequestBranchRef(requestCustomer, request, item);
      const billing = getTransactionBillingPresentation(item);
      return {
        id: `${request.id}_${item.productId || index}`,
        customerId: requestCustomer?.id || request.customer?.id || request.customerId || '',
        productId: matchedProduct?.id || item.productId || '',
        customerName: requestCustomer?.name || request.customer?.name || 'Khách hàng',
        branchId: branchRef.branchId,
        branchName: branchRef.branchName,
        branchAddress: branchRef.branchAddress,
        customerBranchId: branchRef.branchId,
        customerBranchName: branchRef.branchName,
        customerBranchAddress: branchRef.branchAddress,
        productName,
        productShortName: getProductShortName(matchedProduct),
        productGroupName: getOrderRequestMainGroupLabel(matchedProduct, productName),
        attributeLabel: `${item.attributeLabel ?? item.productAttribute ?? item.attribute ?? ''}`.trim(),
        sizeLabel: `${item.sizeLabel ?? item.weightKg ?? ''}`.trim(),
        configurationId: item.configurationId || '',
        quantity: billing.actualQuantity,
        quantityUnit: billing.actualUnit || matchedProduct?.unit || '',
        billingQuantity: billing.billingQuantity,
        billingUnit: billing.billingUnit,
        unitPrice: billing.unitPrice,
        amount: billing.amount,
        note: `${request.note || item.note || ''}`.trim(),
        date: request.requestDateKey || request.date || ''
      };
    });
  }), [activeProducts, employee?.companyId, employee?.tenantId]);
  const sortRequestSheetRows = useMemo(() => createIncrementalStableSorter(compareOrderRequestRowsByProduct, row => row.id), [compareRequestLabels]);
  const sortEditableRequestRows = useMemo(() => createIncrementalStableSorter(compareOrderRequestRowsByRecent, row => row.rowKey), [compareRequestLabels]);
  const requestSheetRows = useMemo(() => sortRequestSheetRows(filteredRequests.flatMap(request => getRequestSheetRows(
    request,
    request.customer || customerLookup.get(request.customerId) || null,
    productLookup
  ))), [getRequestSheetRows, customerLookup, filteredRequests, productLookup, sortRequestSheetRows]);
  const mergedRequestSheetRows = useMemo(() => {
    const grouped = new Map();
    requestSheetRows.forEach((row, index) => {
      const branchKey = row.branchId || normalizeLookupText(row.branchName || '') || 'main';
      const groupKey = `${row.customerId || row.customerName}__${branchKey}__${row.productId || row.productName}__${row.configurationId || 'default'}__${normalizeLookupText(row.attributeLabel || '')}__${row.sizeLabel || ''}__${normalizeLookupText(row.quantityUnit || '')}__${normalizeLookupText(row.billingUnit || '')}__${roundMoneyValue(row.unitPrice || 0)}`;
      const amount = parseLooseMoneyValue(row.amount);
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          ...row,
          sortIndex: index,
          amountSum: amount
        });
        return;
      }

      const current = grouped.get(groupKey);
      current.quantity += row.quantity || 0;
      current.billingQuantity += row.billingQuantity || 0;
      current.amountSum += amount;
      if (!current.quantityUnit && row.quantityUnit) current.quantityUnit = row.quantityUnit;
      if (!current.date && row.date) current.date = row.date;
      if (row.note && !current.note) current.note = row.note;
      else if (row.note && current.note && !current.note.includes(row.note)) current.note = `${current.note}; ${row.note}`;
    });

    return Array.from(grouped.values())
      .map(({ sortIndex, amountSum, ...row }) => ({ ...row, amount: amountSum }));
  }, [requestSheetRows]);
  const currentDayGroupQuantitySummary = useMemo(() => {
    const groupMap = new Map();
    mergedRequestSheetRows.forEach((row) => {
      const matchedProduct = row.productId ? productLookup.get(row.productId) : null;
      const groupName = row.productGroupName || getOrderRequestMainGroupLabel(matchedProduct, row.productName || 'Nhóm hàng');
      const unitLabel = `${row.quantityUnit || ''}`.trim() || 'đơn vị';
      const quantity = parseLooseQuantityValue(row.quantity);
      if (!quantity) return;
      if (!groupMap.has(groupName)) {
        groupMap.set(groupName, { groupName, totalQuantity: 0, units: new Map() });
      }
      const group = groupMap.get(groupName);
      group.totalQuantity += quantity;
      group.units.set(unitLabel, (group.units.get(unitLabel) || 0) + quantity);
    });

    return Array.from(groupMap.values())
      .map((group) => ({
        ...group,
        unitParts: Array.from(group.units.entries())
          .sort((a, b) => `${a[0]}`.localeCompare(`${b[0]}`, 'vi', { numeric: true, sensitivity: 'base' }))
          .map(([unit, quantity]) => `${formatNumber(quantity)} ${`${unit || ''}`.toLowerCase()}`)
      }))
      .sort((a, b) => {
        if (b.totalQuantity !== a.totalQuantity) return b.totalQuantity - a.totalQuantity;
        return `${a.groupName || ''}`.localeCompare(`${b.groupName || ''}`, 'vi', { numeric: true, sensitivity: 'base' });
      });
  }, [mergedRequestSheetRows, productLookup]);

  const orderRequestDispatchIndex = useRef(null);
  const prepareRequestWarehouseStatuses = useMemo(() => function* () {
    if (visibleRequestsProjection.pending || visibleRequestsProjection.error) return null;
    const summary = yield* buildWarehouseDispatchShortageSummary({
      orderRequests: visibleRequests,
      warehouseDispatches,
      customers,
      products: activeProducts,
      dateKey: requestWorkingDate,
      dispatchDateKey: getTodayString(),
      includePreviousOpenOrders: true,
      autoCancelAfterDays: 0,
      statusesOnly: true,
      cooperative: true,
      dispatchIndexCache: orderRequestDispatchIndex
    });
    const byRowKey = new Map();
    const byRequestId = new Map();

    let operations=0;
    for (const line of summary.requestLineStatuses || []) {
      if (++operations % 16 === 0) yield;
      if (!line?.requestId) continue;
      const rowKey = `${line.requestId}_${line.itemIndex ?? ''}`;
      byRowKey.set(rowKey, line);
      const current = byRequestId.get(line.requestId) || {
        requestId: line.requestId,
        totalLines: 0,
        dispatchedLines: 0,
        latestDispatchedAt: 0,
        latestDispatchDate: ''
      };
      current.totalLines += 1;
      if (line.status === 'dispatched') {
        current.dispatchedLines += 1;
        if ((line.dispatchedAt || 0) >= (current.latestDispatchedAt || 0)) {
          current.latestDispatchedAt = line.dispatchedAt || 0;
          current.latestDispatchDate = line.dispatchedDate || current.latestDispatchDate || '';
        }
      }
      current.status = current.dispatchedLines >= current.totalLines
        ? 'dispatched'
        : current.dispatchedLines > 0
          ? 'partial'
          : 'missing';
      byRequestId.set(line.requestId, current);
    }

    return { byRowKey, byRequestId };
  }, [activeProducts, customers, requestWorkingDate, visibleRequests, warehouseDispatches,visibleRequestsProjection.pending,visibleRequestsProjection.error,requestProjectionAttempt]);
  const requestStatusEntry=!visibleRequestsProjection.pending&&!visibleRequestsProjection.error
    ?getReadOnlyModuleProjectionEntry('requestStatuses',[employee,employees,customers,products,orderRequests,warehouseDispatches],requestProjectionScope):undefined;
  const requestStatusProjection=useCooperativeProjection(prepareRequestWarehouseStatuses,requestStatusEntry);
  const requestProjectionReady=!visibleRequestsProjection.pending && !visibleRequestsProjection.error
    && !requestStatusProjection.pending && !requestStatusProjection.error && Boolean(requestStatusProjection.value);
  const orderRequestWarehouseStatusMaps=requestProjectionReady ? requestStatusProjection.value : EMPTY_REQUEST_STATUS_MAPS;


  const requestPreview = useMemo(() => requestDrafts.reduce((acc, draft) => {
    const nonBlankItems = (draft.items || []).filter(item => {
      const hasProduct = Boolean(item.productId);
      const hasWeight = String(item.weightKg || '').trim() !== '';
      const hasQuantity = String(item.quantity || '').trim() !== '';
      const hasPrice = String(item.unitPrice || '').trim() !== '';
      return hasProduct || hasWeight || hasQuantity || hasPrice;
    });

    if (draft.customerId || nonBlankItems.length > 0 || String(draft.note || '').trim()) {
      acc.totalCustomers += 1;
    }

    nonBlankItems.forEach(item => {
      const billing = getTransactionBillingPresentation(item);
      acc.totalLines += 1;
      if (String(item.weightKg || '').trim() !== '') acc.totalSizedLines += 1;
      acc.totalQuantity += billing.actualQuantity;
      acc.totalAmount += billing.amount;
    });
    return acc;
  }, { totalCustomers: 0, totalLines: 0, totalSizedLines: 0, totalQuantity: 0, totalAmount: 0 }), [requestDrafts]);
  const isEditingRequest = Boolean(editingRequestId);
  const isModeSelectionStage = !isEditingRequest && orderFormStage === 'mode';
  const isManualSetupStage = !isEditingRequest && orderFormStage === 'manual_setup';
  const isOrderDetailStage = isEditingRequest || orderFormStage === 'detail';
  const isCompactManualDetailStage = isOrderDetailStage && !isEditingRequest && orderEntryMode === 'manual';
  const primaryDraft = requestDrafts[0] || null;
  const primaryDraftItem = primaryDraft?.items?.[0] || null;
  const primarySelectedCustomer = primaryDraft?.customerId ? customerLookup.get(primaryDraft.customerId) || null : null;
  const primarySelectedProduct = primaryDraftItem?.productId ? productLookup.get(primaryDraftItem.productId) || null : null;
  const buildOrderRequestVariantKey = (productId = '', variant = {}) => [
    `${productId || ''}`,
    normalizeLookupText(variant.attributeLabel || variant.productAttribute || variant.attribute || ''),
    normalizeLookupText(variant.size || variant.sizeLabel || variant.weightKg || ''),
    normalizeLookupText(variant.unit || variant.quantityUnit || variant.defaultUnit || ''),
    roundMoneyValue(parseLooseMoneyValue(variant.price ?? variant.unitPrice ?? 0))
  ].join('__');
  const getDraftItemVariantKey = (item = {}) => buildOrderRequestVariantKey(item.productId, {
    attributeLabel: item.attributeLabel,
    size: item.weightKg || item.sizeLabel,
    unit: item.billingUnit || item.pricingUnit || item.quantityUnit || item.unit,
    price: item.unitPrice
  });
  const selectedQuickVariantKeys = useMemo(
    () => new Set((primaryDraft?.items || []).filter(item => item?.productId).map(getDraftItemVariantKey)),
    [primaryDraft?.items]
  );
  const previousOrderOptions = useMemo(() => getPreviousOrderSuggestions({
    requests: orderRequests,
    customer: primarySelectedCustomer,
    branchId: primaryDraft?.branchId || '',
    beforeDate: requestWorkingDate,
    productLookup,
  }), [orderRequests, primarySelectedCustomer, primaryDraft?.branchId, requestWorkingDate, productLookup]);
  const primaryCustomerBranches = useMemo(
    () => primarySelectedCustomer ? normalizeCustomerBranches(primarySelectedCustomer, activeProducts) : [],
    [primarySelectedCustomer, activeProducts]
  );
  const primaryProductConfigSource = useMemo(
    () => getCustomerBranchProductConfigSource(primarySelectedCustomer, primaryDraft?.branchId || '', activeProducts),
    [activeProducts, primaryDraft?.branchId, primarySelectedCustomer]
  );
  const manualFixedProductVariantOptions = useMemo(() => {
    const fixed = getOrderRequestFixedProducts(primarySelectedCustomer, primaryDraft?.branchId || '');
    const configuredIds = new Set(fixed.map(product => product.id));
    const options = previousOrderOptions.filter(({ product }) => !configuredIds.has(product.id));
    fixed.forEach(product => {
      const base = resolveCustomerProductBillingConfiguration(primaryProductConfigSource, product);
      const variants = expandOrderRequestAttributes(getProductAttributes(product), getCustomerProductVariants(primaryProductConfigSource, product), base);
      variants.forEach(variant => options.push({ product, variant }));
    });
    return options.map(({ product, variant }) => {
      const configuration = resolveCustomerProductBillingConfiguration(primaryProductConfigSource, product, {
        variant, variantId: variant.id || '', sizeLabel: variant.size || variant.sizeLabel || '', attributeLabel: variant.attributeLabel || '',
      });
      const selectionKey = buildOrderRequestVariantKey(product.id, variant.previousOrder ? variant : {
        attributeLabel: configuration.attributeLabel, size: configuration.sizeLabel,
        unit: configuration.billingUnit, price: configuration.unitPrice,
      });
      return { product, variant, key: selectionKey, selectionKey };
    });
  }, [previousOrderOptions, primarySelectedCustomer, primaryDraft?.branchId, primaryProductConfigSource, activeProducts, productLookup]);
  const manualFixedProductGroups = useMemo(() => {
    const groups = new Map();
    manualFixedProductVariantOptions.forEach(option => {
      if (!groups.has(option.product.id)) groups.set(option.product.id, { product: option.product, variants: [] });
      const group = groups.get(option.product.id);
      if (!group.variants.some(existing => existing.selectionKey === option.selectionKey)) group.variants.push(option);
    });
    return [...groups.values()];
  }, [manualFixedProductVariantOptions]);
  const selectedQuickItems = useMemo(() => new Map((primaryDraft?.items || [])
    .filter(item => item.productId).map(item => [getDraftItemVariantKey(item), item])), [primaryDraft?.items]);
  const manualFixedProductIdSet = useMemo(
    () => new Set(manualFixedProductVariantOptions.map(({ product }) => product.id)),
    [manualFixedProductVariantOptions],
  );
  const manualExtraProductPickerKey = primaryDraft ? `manual-extra-products:${primaryDraft.localId}` : '';
  const isManualExtraProductPickerOpen = Boolean(manualExtraProductPickerKey) && openDraftPicker === manualExtraProductPickerKey;
  const manualCatalogProductVariantOptions = useMemo(() => !isManualExtraProductPickerOpen ? [] : activeProducts.flatMap(product => {
    const variants = getCustomerProductVariants(primaryProductConfigSource, product);
    return variants.map((variant) => {
      const configuration = resolveCustomerProductBillingConfiguration(primaryProductConfigSource, product, {
        variant,
        variantId: variant.id || '',
        sizeLabel: variant.size || '',
        attributeLabel: variant.attributeLabel || '',
      });
      return {
        product,
        variant,
        displayPrice: parseLooseMoneyValue(variant.price) > 0
          ? parseLooseMoneyValue(variant.price)
          : getCustomerProductPrice(primaryProductConfigSource, product),
        key: buildOrderRequestVariantKey(product.id, variant),
        selectionKey: buildOrderRequestVariantKey(product.id, {
          attributeLabel: configuration.attributeLabel,
          size: configuration.sizeLabel,
          unit: configuration.billingUnit,
          price: configuration.unitPrice,
        }),
      };
    });
  }), [isManualExtraProductPickerOpen, activeProducts, primaryProductConfigSource]);
  const quickProductSearchKeyword = normalizeLookupText(quickProductSearch || '');
  const manualProductSearch = usePreparedSearchIndex(activeProducts,getProductSearchFields,
    isManualExtraProductPickerOpen||Boolean(openDraftPicker?.startsWith('product:')));
  const manualProductSearchIndex = manualProductSearch.index;
  const manualMatchingProductSet = useMemo(() => {
    if (!isManualExtraProductPickerOpen || !quickProductSearchKeyword) return null;
    return new Set(manualProductSearchIndex?.search(quickProductSearchKeyword)||[]);
  }, [isManualExtraProductPickerOpen, manualProductSearchIndex, quickProductSearchKeyword]);
  const manualExtraProductVariantOptions = useMemo(() => {
    if (!isManualExtraProductPickerOpen) return [];
    const sourceVariants = manualCatalogProductVariantOptions.filter(({ product, variant, selectionKey }) => {
      if (manualFixedProductIdSet.has(product.id)) return false;
      if (quickProductSearchKeyword) {
        return manualMatchingProductSet.has(product)
          || [variant.size, variant.attributeLabel, variant.unit]
            .some(value => normalizeLookupText(value || '').includes(quickProductSearchKeyword));
      }
      return !selectedQuickVariantKeys.has(selectionKey);
    });
    return sourceVariants
      .sort((a, b) => {
        const selectedDiff = Number(selectedQuickVariantKeys.has(b.selectionKey)) - Number(selectedQuickVariantKeys.has(a.selectionKey));
        if (selectedDiff !== 0) return selectedDiff;
        return (a.product?.name || '').localeCompare(b.product?.name || '', 'vi');
      })
      .slice(0, quickProductSearchKeyword ? 80 : 16);
  }, [isManualExtraProductPickerOpen, manualCatalogProductVariantOptions, manualFixedProductIdSet, manualMatchingProductSet, quickProductSearchKeyword, selectedQuickVariantKeys]);
  const manualExtraProductVariantGroups = useMemo(
    () => groupOrderRequestProductVariants(manualExtraProductVariantOptions),
    [manualExtraProductVariantOptions]
  );
  const manualCustomerPickerKey = primaryDraft ? `customer:${primaryDraft.localId}` : '';
  const isManualCustomerPickerOpen = Boolean(manualCustomerPickerKey) && openDraftPicker === manualCustomerPickerKey;
  const manualCustomerSearchKeyword = normalizeLookupText(primaryDraft?.customerSearch || '');
  const manualFilteredCustomers = useMemo(() => {
    if (!isManualCustomerPickerOpen) return [];
    return manualCustomerSearchKeyword
      ? searchCustomerRecords(availableCustomers, primaryDraft?.customerSearch || '')
      : availableCustomers;
  }, [availableCustomers, isManualCustomerPickerOpen, manualCustomerSearchKeyword, primaryDraft?.customerSearch]);
  const buildRequestDraftFromExisting = (request = {}) => {
    const requestItems = (request.items || []).length > 0 ? request.items : (request.primaryItem ? [request.primaryItem] : []);
    const customer = customerLookup.get(request.customerId) || request.customer || customers.find(item => item.id === request.customerId) || null;
    const branchRef = getOrderRequestBranchRef(customer, request, requestItems[0] || {});
    return createDraft({
      customerId: request.customerId || '',
      customerSearch: customer?.name || '',
      branchId: branchRef.branchId,
      branchName: branchRef.branchName,
      branchAddress: branchRef.branchAddress,
      note: request.note || '',
      upfrontPayment: request.upfrontPayment ?? request.depositAmount ?? request.prepaidAmount ?? '',
      items: requestItems.map(item => ({
        productId: item.productId || '',
        productSearch: productLookup.get(item.productId)?.name || item.description || '',
        attributeLabel: item.attributeLabel ?? item.productAttribute ?? item.attribute ?? '',
        weightKg: `${item.sizeLabel ?? item.weightKg ?? ''}`.trim(),
        quantity: item.quantity ?? '',
        quantityUnit: item.quantityUnit || defaultQuantityUnit,
        pricingUnit: item.pricingUnit || item.defaultUnit || item.quantityUnit || defaultQuantityUnit,
        inputUnitTouched: true,
        unitPrice: item.unitPrice ?? '',
        configurationId: item.configurationId || '',
        actualQuantity: item.actualQuantity ?? item.quantity ?? '',
        actualUnit: item.actualUnit || item.actualQuantityUnit || item.quantityUnit || '',
        billingQuantity: item.billingQuantity ?? item.pricingQuantity ?? '',
        billingUnit: item.billingUnit || item.pricingUnit || '',
        amount: item.amount ?? item.pricingAmount ?? item.lineTotal ?? '',
        billingSnapshotVersion: item.billingSnapshotVersion || (item.pricingUnit && item.unitPrice ? 1 : 0),
        billingSnapshotSource: item.billingSnapshotSource || (item.pricingUnit && item.unitPrice ? 'legacy_order_request' : '')
      }))
    });
  };
  const calculateRequestAmount = (request = {}) => {
    const requestItems = (request.items || []).length > 0 ? request.items : (request.primaryItem ? [request.primaryItem] : []);
    return requestItems.reduce((sum, item) => sum + getTransactionBillingPresentation(item).amount, 0);
  };
  const getEditableRequestBaseRows = useMemo(() => createRecordCalculationCache((request, requestCustomer, salesEmpId, salesName) => {
    const requestItems = (request.items || []).length > 0 ? request.items : (request.primaryItem ? [request.primaryItem] : []);
    const requestSortTime = getEntityTimestamp(request) || 0;
    return requestItems.map((item, itemIndex) => {
      const matchedProduct = item.productId ? productLookup.get(item.productId) || request.primaryProduct : request.primaryProduct;
      const branchRef = getOrderRequestBranchRef(requestCustomer, request, item);
      const attributeLabel = `${item.attributeLabel ?? item.productAttribute ?? item.attribute ?? ''}`.trim();
      const compactProductName = getCompactProductName(matchedProduct, item.description || 'Hang hoa');
      const productGroupName = getOrderRequestMainGroupLabel(matchedProduct, matchedProduct?.name || item.description || 'Nhóm hàng');
      const customerPortalApprovalState = getCustomerPortalApprovalState(request);
      const billing = getTransactionBillingPresentation(item);
      return {
        rowKey: `${request.id}_${itemIndex}`,
        requestId: request.id,
        itemIndex,
        customerId: request.customerId || '',
        customerName: requestCustomer?.name || 'Khach hang',
        branchId: branchRef.branchId,
        branchName: branchRef.branchName,
        branchAddress: branchRef.branchAddress,
        customerBranchId: branchRef.branchId,
        customerBranchName: branchRef.branchName,
        customerBranchAddress: branchRef.branchAddress,
        salesEmpId,
        salesName,
        productId: matchedProduct?.id || item.productId || '',
        productName: matchedProduct?.name || item.description || 'Hang hoa',
        productShortName: compactProductName,
        productGroupName,
        attributeLabel,
        sizeLabel: `${item.sizeLabel ?? item.weightKg ?? ''}`.trim(),
        configurationId: item.configurationId || '',
        quantity: billing.actualQuantity,
        quantityUnit: billing.actualUnit || defaultQuantityUnit,
        actualQuantity: billing.actualQuantity,
        actualUnit: billing.actualUnit || defaultQuantityUnit,
        billingQuantity: billing.billingQuantity,
        billingUnit: billing.billingUnit,
        pricingQuantity: billing.billingQuantity,
        pricingUnit: billing.billingUnit,
        unitPrice: billing.unitPrice,
        amount: billing.amount,
        depositAmount: parseLooseMoneyValue(request.upfrontPayment ?? request.depositAmount ?? request.prepaidAmount ?? 0),
        note: `${request.note || item.note || ''}`.trim(),
        requestDateKey: request.requestDateKey || request.date || '',
        requestPlacedAtLabel: getOrderPlacedAtLabel(request),
        requestPlacedAtTimeLabel: getOrderPlacedAtTimeLabel(request),
        requestSortTime,
        isCustomerPortalRequest: isCustomerPortalOrderRequest(request),
        customerPortalApprovalState,
        customerPortalApprovalLabel: getCustomerPortalApprovalLabel(customerPortalApprovalState)
      };
    });
  }), [activeProducts, employee?.companyId, employee?.tenantId, productLookup]);
  const editableCurrentDayRows = useMemo(() => !requestProjectionReady ? [] : sortEditableRequestRows(filteredRequests.flatMap((request) => {
    const requestWarehouseStatus = orderRequestWarehouseStatusMaps.byRequestId.get(request.id) || null;
    const requestCustomer = request.customer || customerLookup.get(request.customerId) || null;
    const salesEmpId = resolveRequestSalesEmpId(request);
    const salesName = resolveSalesEmployeeName(salesEmpId);
    const canApproveCustomerPortal = canApproveCustomerPortalRequest(request);
    return getEditableRequestBaseRows(request, requestCustomer, salesEmpId, salesName).map(row => {
      const rowWarehouseStatus = orderRequestWarehouseStatusMaps.byRowKey.get(row.rowKey) || null;
      return {
        ...row,
        canApproveCustomerPortal,
        warehouseDispatchStatus: rowWarehouseStatus?.status || requestWarehouseStatus?.status || request.warehouseDispatchStatus || request.dispatchStatus || '',
        warehouseDispatchDate: rowWarehouseStatus?.dispatchedDate || requestWarehouseStatus?.latestDispatchDate || request.warehouseDispatchDate || '',
        warehouseDispatchIds: rowWarehouseStatus?.dispatchIds || []
      };
    });
  })), [requestProjectionReady,sortEditableRequestRows, getEditableRequestBaseRows, filteredRequests, orderRequestWarehouseStatusMaps, canEdit, canViewAllRequests, customerLookup, customers, employee?.id, employee?.name, isOwnerAccount, salesEmployeeLookup, salesVisibleEmployeeIdSet]);
  const editableRowsBySales = useMemo(() => {
    const grouped = new Map();
    editableCurrentDayRows.forEach((row, index) => {
      const groupKey = isOwnerAccount ? (row.salesEmpId || 'unknown-sales') : 'all';
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          key: groupKey,
          sortIndex: index,
          salesName: isOwnerAccount ? row.salesName : '',
          rows: [],
          requestIds: new Set(),
          customerIds: new Set(),
          totalAmount: 0
        });
      }

      const current = grouped.get(groupKey);
      current.rows.push(row);
      if (row.requestId) current.requestIds.add(row.requestId);
      if (row.customerId) current.customerIds.add(row.customerId);
      current.totalAmount += parseLooseMoneyValue(row.amount);
    });

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        rows: group.rows,
        totalOrders: group.requestIds.size,
        totalCustomers: group.customerIds.size,
        totalLines: group.rows.length
      }));
  }, [editableCurrentDayRows, isOwnerAccount]);

  const displayRowsBySales = useMemo(() => editableRowsBySales.map((salesGroup) => {
    const customerGroups = [];
    const customerGroupMap = new Map();

    salesGroup.rows.forEach((row, index) => {
      const branchKey = row.branchId || normalizeLookupText(row.branchName || '') || 'main';
      const customerKey = `${row.customerId || normalizeLookupText(row.customerName || '') || `customer_${index}`}__${branchKey}`;
      if (!customerGroupMap.has(customerKey)) {
        const customerGroup = {
          key: `${salesGroup.key}_${customerKey}`,
          sortIndex: index,
          customerName: row.customerName || '',
          branchId: row.branchId || '',
          branchName: row.branchName || '',
          branchAddress: row.branchAddress || '',
          rows: []
        };
        customerGroupMap.set(customerKey, customerGroup);
        customerGroups.push(customerGroup);
      }
      customerGroupMap.get(customerKey).rows.push(row);
    });

    return {
      ...salesGroup,
      customerGroups
    };
  }), [editableRowsBySales]);
  const [requestDisplayPage, setRequestDisplayPage] = useState({ scope: '', offset: 0 });
  const requestDisplayScope = `${requestFilterDate}|${requestFilterSalesEmpId}`;
  const requestDisplayOffset = requestDisplayPage.scope === requestDisplayScope ? requestDisplayPage.offset : 0;
  const requestRowPage = useMemo(() => getGroupedRowPage(displayRowsBySales.flatMap(salesGroup =>
    salesGroup.customerGroups.map(group => ({ ...group, salesGroup }))), requestDisplayOffset), [displayRowsBySales, requestDisplayOffset]);
  const visibleRequestSalesGroups = useMemo(() => {
    const groups = [];
    for (const customerGroup of requestRowPage.items) {
      const salesGroup = customerGroup.salesGroup;
      if (groups.at(-1)?.key !== salesGroup.key) groups.push({ ...salesGroup, customerGroups: [] });
      groups.at(-1).customerGroups.push(customerGroup);
    }
    return groups;
  }, [requestRowPage]);
  const isOrderRequestRowFullyDispatchedForShare = (row = {}) => {
    const rawStatus = normalizeLookupText(row.warehouseDispatchStatus || row.dispatchStatus || row.orderDispatchStatus || '');
    if (!rawStatus && !(row.isWarehouseDispatched || row.isFullyDispatched || row.hasBeenDispatched)) return false;
    if (rawStatus.includes('partial') || rawStatus.includes('mot phan') || rawStatus.includes('thieu')) return false;
    if (row.isWarehouseDispatched || row.isFullyDispatched || row.hasBeenDispatched) return true;
    return rawStatus === 'dispatched'
      || rawStatus === 'done'
      || rawStatus === 'completed'
      || rawStatus.includes('da xuat kho')
      || rawStatus.includes('xuat xong');
  };
  const getOrderRequestShareData = useMemo(() => {
    let cached = null;
    return () => {
      if (cached) return cached;
      const shareableMergedRequestSheetRows = (() => {
    const grouped = new Map();
    editableCurrentDayRows
      .filter((row) => !isOrderRequestRowFullyDispatchedForShare(row))
      .forEach((row, index) => {
        const normalizedRow = {
          id: row.rowKey || `${row.requestId || 'request'}_${row.itemIndex ?? index}`,
          customerId: row.customerId || '',
          branchId: row.branchId || '',
          branchName: row.branchName || '',
          branchAddress: row.branchAddress || '',
          customerBranchId: row.branchId || '',
          customerBranchName: row.branchName || '',
          customerBranchAddress: row.branchAddress || '',
          salesEmpId: row.salesEmpId || '',
          salesName: row.salesName || '',
          productId: row.productId || '',
          customerName: row.branchName ? `${row.customerName || 'Khách hàng'} - ${row.branchName}` : (row.customerName || 'Khách hàng'),
          productName: row.productName || 'Hàng hóa',
          productShortName: row.productShortName || '',
          productGroupName: row.productGroupName || '',
          attributeLabel: row.attributeLabel || '',
          sizeLabel: row.sizeLabel || '',
          configurationId: row.configurationId || '',
          quantity: parseLooseQuantityValue(row.quantity),
          quantityUnit: row.quantityUnit || '',
          billingQuantity: parseLooseQuantityValue(row.billingQuantity),
          billingUnit: row.billingUnit || row.pricingUnit || '',
          unitPrice: parseLooseMoneyValue(row.unitPrice),
          amount: parseLooseMoneyValue(row.amount),
          note: row.note || '',
          date: row.requestDateKey || '',
          requestSortTime: row.requestSortTime || 0,
          requestPlacedAtTimeLabel: row.requestPlacedAtTimeLabel || '',
          shareSortIndex: index
        };
        const branchKey = normalizedRow.branchId || normalizeLookupText(normalizedRow.branchName || '') || 'main';
        const groupKey = `${normalizedRow.customerId || normalizedRow.customerName}__${branchKey}__${normalizedRow.productId || normalizedRow.productName}__${normalizedRow.configurationId || 'default'}__${normalizeLookupText(normalizedRow.attributeLabel || '')}__${normalizedRow.sizeLabel || ''}__${normalizeLookupText(normalizedRow.quantityUnit || '')}__${normalizeLookupText(normalizedRow.billingUnit || '')}__${roundMoneyValue(normalizedRow.unitPrice || 0)}`;
        const amount = normalizedRow.amount;
        if (!grouped.has(groupKey)) {
          grouped.set(groupKey, {
            ...normalizedRow,
            sortIndex: index,
            amountSum: amount
          });
          return;
        }

        const current = grouped.get(groupKey);
        current.quantity += normalizedRow.quantity || 0;
        current.billingQuantity += normalizedRow.billingQuantity || 0;
        current.amountSum += amount;
        if (!current.quantityUnit && normalizedRow.quantityUnit) current.quantityUnit = normalizedRow.quantityUnit;
        if (!current.date && normalizedRow.date) current.date = normalizedRow.date;
        if (normalizedRow.note && !current.note) current.note = normalizedRow.note;
        else if (normalizedRow.note && current.note && !current.note.includes(normalizedRow.note)) current.note = `${current.note}; ${normalizedRow.note}`;
      });

    return Array.from(grouped.values())
      .sort(compareOrderRequestRowsByRecent)
      .map(({ sortIndex, amountSum, ...row }) => ({ ...row, amount: amountSum }));
      })();
      const groupedShareableRequestSheetCustomerGroups = groupOrderRequestShareRowsByCustomer(shareableMergedRequestSheetRows, {
      compareRows: compareOrderRequestRowsByProduct
      });
      const groupedShareableMergedRequestSheetRows = groupedShareableRequestSheetCustomerGroups.flatMap((group) => group.rows);
      cached = { groupedShareableRequestSheetCustomerGroups, groupedShareableMergedRequestSheetRows };
      return cached;
    };
  }, [editableCurrentDayRows]);
  const getOrderRequestSheetAssetKey = useCallback(() => {
    const { groupedShareableMergedRequestSheetRows } = getOrderRequestShareData();
    if (groupedShareableMergedRequestSheetRows.length === 0) return '';
    const rowFingerprint = groupedShareableMergedRequestSheetRows.map((row) => ({
      id: row.id || '',
      customerId: row.customerId || '',
      customerName: row.customerName || '',
      branchId: row.branchId || '',
      branchName: row.branchName || '',
      productId: row.productId || '',
      productName: row.productName || '',
      productShortName: row.productShortName || '',
      productGroupName: row.productGroupName || '',
      attributeLabel: row.attributeLabel || '',
      sizeLabel: row.sizeLabel || '',
      configurationId: row.configurationId || '',
      quantity: row.quantity || 0,
      quantityUnit: row.quantityUnit || '',
      billingQuantity: row.billingQuantity || 0,
      billingUnit: row.billingUnit || '',
      unitPrice: row.unitPrice || 0,
      amount: row.amount || 0,
      note: row.note || '',
      date: row.date || ''
    }));
    const fingerprint = buildStableHash(JSON.stringify({
      date: requestFilterDate || getTodayString(),
      employeeId: employee?.id || '',
      employeeName: employee?.name || '',
      rows: rowFingerprint
    }));
    return [
      'order_request_sheet',
      employee?.companyId || 'company',
      employee?.id || 'shared',
      requestFilterDate || getTodayString(),
      fingerprint
    ].join('|');
  }, [employee?.companyId, employee?.id, employee?.name, getOrderRequestShareData, requestFilterDate]);

  const resetInlineEditing = () => {
    setInlineEditingRowKey('');
    setInlineEditingDraft({ customerId: '', productId: '', attributeLabel: '', sizeLabel: '', quantity: '', quantityUnit: '', unitPrice: '' });
    setOrderCellEditor(null);
  };

  const getOrderRequestDepositAmount = (request = {}) => (
    parseLooseMoneyValue(request.upfrontPayment ?? request.depositAmount ?? request.prepaidAmount ?? 0)
  );

  const promptEditOrderRequestDeposit = async (requestId) => {
    if (!requestId) return;
    const request = filteredRequests.find(item => item.id === requestId) || orderRequests.find(item => item.id === requestId);
    if (!request) return;
    const currentDeposit = getOrderRequestDepositAmount(request);
    if (!(canEditDeposit || (canSetDeposit && currentDeposit <= 0))) return;
    const rawValue = window.prompt('Nhập / sửa tiền cọc đơn đặt', currentDeposit > 0 ? formatInputCurrency(currentDeposit) : '');
    if (rawValue === null) return;
    const nextDeposit = parseLooseMoneyValue(parseInputCurrency(rawValue));
    const normalizedRequest = {
      ...request,
      upfrontPayment: nextDeposit,
      depositAmount: nextDeposit,
      prepaidAmount: nextDeposit,
      paymentMethod: request.paymentMethod || 'Chuyển khoản'
    };
    try {
      setRequestStatus('');
      await onEditOrderRequest(request.id, normalizedRequest, employee?.id || 'admin');
    } catch (error) {
      setRequestStatus(`Cập nhật tiền cọc bị lỗi: ${getFriendlyFirebaseErrorMessage(error, 'Vui lòng thử lại.')}`);
    }
  };

  const updateCustomerPortalOrderApproval = async (requestId, nextStatus = 'confirmed') => {
    if (!requestId || typeof onEditOrderRequest !== 'function') return;
    const request = latestOrderRequests.find(item => item.id === requestId) || orderRequests.find(item => item.id === requestId);
    if (!request || !canApproveCustomerPortalRequest(request)) return;
    const normalizedStatus = nextStatus === 'rejected' ? 'rejected' : 'confirmed';
    if (normalizedStatus === 'rejected' && typeof window !== 'undefined') {
      const shouldReject = window.confirm('Từ chối đơn khách hàng gửi?');
      if (!shouldReject) return;
    }

    const now = new Date().toISOString();
    const customer = customers.find(item => item.id === request.customerId) || request.customer || {};
    const salesEmpId = request.salesEmpId
      || request.assignedSalesEmpId
      || request.responsibleEmployeeId
      || customer?.empId
      || customer?.salesEmpId
      || customer?.managerEmpId
      || employee?.id
      || '';
    const statusLabel = normalizedStatus === 'confirmed' ? 'Đã duyệt' : 'Từ chối';
    const approvalPatch = {
      customerId: request.customerId || '',
      salesEmpId,
      assignedSalesEmpId: salesEmpId,
      responsibleEmployeeId: salesEmpId,
      source: request.source || 'customer_portal',
      createdByRole: request.createdByRole || 'customer',
      status: normalizedStatus,
      reviewStatus: normalizedStatus,
      reviewStatusLabel: statusLabel,
      customerApprovalStatus: normalizedStatus,
      employeeApprovalStatus: normalizedStatus,
      needsEmployeeApproval: false,
      updatedAt: now,
      ...(normalizedStatus === 'confirmed'
        ? { approvedAt: now, approvedByEmpId: employee?.id || '' }
        : { rejectedAt: now, rejectedByEmpId: employee?.id || '' })
    };

    try {
      setRequestStatus('');
      await onEditOrderRequest(request.id, approvalPatch, employee?.id || 'admin');
    } catch (error) {
      setRequestStatus(`Cập nhật trạng thái duyệt bị lỗi: ${getFriendlyFirebaseErrorMessage(error, 'Vui lòng thử lại.')}`);
    }
  };

  const startInlineEditRow = (row) => {
    if (!row || (!canEdit && !canDelete)) return;
    const sourceRequest = orderRequests.find(request => request.id === row.requestId);
    orderEditBaseRef.current = { request: sourceRequest, customerConfig: configScopeFingerprint(customerLookup.get(row.customerId) || {}) };
    setInlineEditingRowKey(row.rowKey);
    setInlineEditingDraft({
      customerId: row.customerId || '',
      branchId: row.branchId || row.item?.branchId || '',
      productId: row.productId || '',
      attributeLabel: row.attributeLabel || '',
      sizeLabel: row.sizeLabel || '',
      quantity: row.quantity ?? '',
      quantityUnit: row.quantityUnit || '',
      pricingUnit: row.pricingUnit || row.quantityUnit || '',
      unitPrice: row.unitPrice ?? '',
      configurationId: row.configurationId || row.item?.configurationId || '',
      actualQuantity: row.actualQuantity ?? row.quantity ?? '',
      actualUnit: row.actualUnit || row.quantityUnit || '',
      actualWeightKg: row.actualWeightKg ?? row.weightKg ?? 0,
      billingQuantity: row.billingQuantity ?? row.pricingQuantity ?? 0,
      billingUnit: row.billingUnit || row.pricingUnit || '',
      amount: row.amount ?? row.pricingAmount ?? row.lineTotal ?? 0,
      billingSnapshotVersion: row.billingSnapshotVersion || 0,
      billingSnapshotSource: row.billingSnapshotSource || ''
    });
    setRequestStatus('');
    setSheetStatus('');
  };

  const saveInlineEditRow = async (row) => {
    if (!row?.requestId || !canEdit) return false;
    const request = filteredRequests.find(item => item.id === row.requestId)
      || orderRequests.find(item => item.id === row.requestId);
    if (!request) return false;

    const customer = customerLookup.get(inlineEditingDraft.customerId);
    const product = productLookup.get(inlineEditingDraft.productId);
    const quantity = parseLooseQuantityValue(inlineEditingDraft.quantity);
    const sizeLabel = `${inlineEditingDraft.sizeLabel || ''}`.trim();
    const attributeLabel = `${inlineEditingDraft.attributeLabel || ''}`.trim();
    const branchRef = getOrderRequestBranchRef(customer, request, row);
    const configSource = getCustomerBranchProductConfigSource(customer, branchRef.branchId, activeProducts);
    const currentConfiguration = resolveCustomerProductBillingConfiguration(configSource, product, {
      configurationId: inlineEditingDraft.configurationId,
      sizeLabel,
      attributeLabel,
    });
    const sourceItem = (request.items || [])[row.itemIndex] || row.item || row;
    const existingSnapshot = resolveTransactionBillingSnapshot({
      record: { ...sourceItem, ...inlineEditingDraft },
      configuration: currentConfiguration,
      product,
    });
    const billingConfiguration = existingSnapshot.hasFrozenPricing
      ? {
          ...currentConfiguration,
          configurationId: existingSnapshot.configurationId || currentConfiguration.configurationId,
          billingUnit: existingSnapshot.billingUnit,
          pricingUnit: existingSnapshot.billingUnit,
          unitPrice: existingSnapshot.unitPrice,
          source: 'order_request_snapshot',
        }
      : currentConfiguration;
    const actualUnit = existingSnapshot.hasFrozenPricing
      ? existingSnapshot.actualUnit
      : resolveCustomerProductActualUnit(billingConfiguration, product);
    const selectedOrderUnit = normalizeProductPricingUnit(
      inlineEditingDraft.quantityUnit || inlineEditingDraft.actualUnit || actualUnit || ''
    );
    const effectiveActualUnit = selectedOrderUnit || actualUnit;
    const snapshot = buildCustomerProductBillingSnapshot({
      configuration: billingConfiguration,
      product,
      productId: product?.id || '',
      productName: product?.name || '',
      sizeLabel,
      attributeLabel,
      actualQuantity: quantity,
      actualUnit: effectiveActualUnit,
      orderUnit: selectedOrderUnit || effectiveActualUnit,
      actualWeightKg: existingSnapshot.actualWeightKg || 0,
    });

    if (!customer || !product || quantity <= 0 || billingConfiguration.unitPrice <= 0 || (!snapshot.billingSnapshotValid && !snapshot.pricingPendingActual)) {
      setRequestStatus('Vui long chon dung khach hang, hang hoa, so luong va don gia hop le truoc khi luu.');
      return false;
    }

    const requestItems = (request.items || []).length > 0 ? [...request.items] : (request.primaryItem ? [{ ...request.primaryItem }] : []);
    requestItems[row.itemIndex] = applyOrderRequestClassificationEdit({
      ...requestItems[row.itemIndex],
      productId: product.id,
      description: product.name || 'Hang hoa',
      branchId: branchRef.branchId,
      branchName: branchRef.branchName,
      branchAddress: branchRef.branchAddress,
      customerBranchId: branchRef.branchId,
      customerBranchName: branchRef.branchName,
      customerBranchAddress: branchRef.branchAddress,
      ...snapshot,
      quantityUnit: snapshot.quantityUnit || selectedOrderUnit || effectiveActualUnit,
      orderUnit: snapshot.orderUnit || selectedOrderUnit || effectiveActualUnit,
      actualUnit: snapshot.actualUnit || effectiveActualUnit,
      unit: snapshot.actualUnit,
      price: snapshot.unitPrice,
      total: snapshot.amount,
      weightKg: snapshot.actualWeightKg,
    }, { sizeLabel, attributeLabel });

    const normalizedRequest = {
      customerId: customer.id,
      branchId: branchRef.branchId,
      branchName: branchRef.branchName,
      branchAddress: branchRef.branchAddress,
      customerBranchId: branchRef.branchId,
      customerBranchName: branchRef.branchName,
      customerBranchAddress: branchRef.branchAddress,
      salesEmpId: customer.empId || request.salesEmpId || employee?.id || '',
      date: request.requestDateKey || request.date || getTodayString(),
      note: request.note || '',
      items: requestItems,
      totalQuantity: requestItems.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0),
      totalAmount: requestItems.reduce((sum, item) => sum + parseLooseMoneyValue(
        item.amount ?? item.pricingAmount ?? item.lineTotal ?? ((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0))
      ), 0)
    };

    setRequestStatus('');
    try {
      const saved = await onEditOrderRequest(request.id, normalizedRequest, employee?.id || 'admin', {
        expectedOrder: orderEditBaseRef.current?.request,
        expectedCustomerConfig: orderEditBaseRef.current?.customerConfig,
      });
      resetInlineEditing();
      setRequestStatus(saved?.skipped?.length ? 'Đơn đã lưu. Các dòng có biến thể chưa rõ giữ nguyên cấu hình khách hàng.' : 'Đã lưu đơn và đồng bộ cấu hình sản phẩm.');
      return true;
    } catch (error) {
      setRequestStatus(`Cập nhật đơn đặt hàng bị lỗi: ${getFriendlyFirebaseErrorMessage(error, 'Vui lòng thử lại.')}`);
      return false;
    }
  };

  const deleteInlineEditRow = async (row) => {
    if (!row?.requestId || !canDelete) return false;
    const request = filteredRequests.find(item => item.id === row.requestId)
      || orderRequests.find(item => item.id === row.requestId);
    if (!request) return false;
    const requestItems = (request.items || []).length > 0 ? [...request.items] : (request.primaryItem ? [{ ...request.primaryItem }] : []);
    const customerName = request.customer?.name || customerLookup.get(request.customerId)?.name || 'khach hang nay';
    if (!window.confirm(`Xoa dong hang cua ${customerName}?`)) return false;

    try {
      if (requestItems.length <= 1) {
        await onDeleteOrderRequest(request.id);
        setRequestStatus('');
        resetInlineEditing();
        return true;
      }

      requestItems.splice(row.itemIndex, 1);
      const requestCustomer = request.customer || customerLookup.get(request.customerId) || null;
      const branchRef = getOrderRequestBranchRef(requestCustomer, request, requestItems[0] || row);
      const normalizedRequest = {
        customerId: request.customerId,
        branchId: branchRef.branchId,
        branchName: branchRef.branchName,
        branchAddress: branchRef.branchAddress,
        customerBranchId: branchRef.branchId,
        customerBranchName: branchRef.branchName,
        customerBranchAddress: branchRef.branchAddress,
        salesEmpId: request.salesEmpId || request.customer?.empId || employee?.id || '',
        date: request.requestDateKey || request.date || getTodayString(),
        note: request.note || '',
        items: requestItems,
        totalQuantity: requestItems.reduce((sum, item) => sum + parseLooseQuantityValue(item.quantity), 0),
        totalAmount: requestItems.reduce((sum, item) => sum + parseLooseMoneyValue(
          item.amount ?? item.pricingAmount ?? item.lineTotal ?? (parseLooseQuantityValue(item.quantity) * parseLooseMoneyValue(item.unitPrice))
        ), 0)
      };
      await onEditOrderRequest(request.id, normalizedRequest, employee?.id || 'admin');
      setRequestStatus('');
      resetInlineEditing();
      return true;
    } catch (error) {
      setRequestStatus(`Xoa dong hang bi loi: ${getFriendlyFirebaseErrorMessage(error, 'Vui long thu lai.')}`);
      return false;
    }
  };

  const canEditOrderCellField = (field) => {
    if (field === 'customerId' || field === 'productId') return canEditGeneral;
    if (field === 'quantity') return canEditQuantity;
    if (field === 'sizeLabel' || field === 'unitPrice') return canEditSizePrice;
    return false;
  };

  const openOrderCellEditor = (row, field, event) => {
    event?.stopPropagation?.();
    if (!row || (!canEditOrderCellField(field) && !canDelete)) return;
    startInlineEditRow(row);
    setOrderCellEditor({ row, field });
  };

  const closeOrderCellEditor = () => {
    if (isSavingOrderCell) return;
    resetInlineEditing();
  };

  const handleOrderCellValueChange = (nextValue) => {
    if (!orderCellEditor?.field) return;
    const { field, row } = orderCellEditor;

    if (field === 'customerId') {
      const selectedCustomer = customerLookup.get(nextValue);
      if (orderEditBaseRef.current) orderEditBaseRef.current.customerConfig = configScopeFingerprint(selectedCustomer || {});
      const selectedProduct = productLookup.get(inlineEditingDraft.productId);
      const configSource = getCustomerBranchProductConfigSource(selectedCustomer, row.branchId || '', activeProducts);
      const customSize = selectedCustomer && selectedProduct ? getCustomerProductSize(configSource, selectedProduct) : '';
      const customAttribute = selectedCustomer && selectedProduct ? getCustomerProductAttribute(configSource, selectedProduct) : '';
      const attributeOptions = getProductAttributes(selectedProduct);
      setInlineEditingDraft(previous => ({
        ...previous,
        customerId: nextValue,
        attributeLabel: attributeOptions.includes(customAttribute) ? customAttribute : previous.attributeLabel,
        sizeLabel: customSize || previous.sizeLabel,
        quantityUnit: selectedCustomer && selectedProduct
          ? resolveDraftItemQuantityUnit(configSource, selectedProduct, previous.quantityUnit)
          : previous.quantityUnit,
        unitPrice: selectedCustomer && selectedProduct
          ? getCustomerProductPrice(configSource, selectedProduct, resolveDraftItemQuantityUnit(configSource, selectedProduct, previous.quantityUnit))
          : previous.unitPrice
      }));
      return;
    }

    if (field === 'productId') {
      const selectedProduct = productLookup.get(nextValue);
      const selectedCustomer = customerLookup.get(inlineEditingDraft.customerId);
      const configSource = getCustomerBranchProductConfigSource(selectedCustomer, row.branchId || '', activeProducts);
      const customSize = selectedProduct ? getCustomerProductSize(configSource, selectedProduct) : '';
      const customAttribute = selectedProduct ? getCustomerProductAttribute(configSource, selectedProduct) : '';
      const attributeOptions = getProductAttributes(selectedProduct);
      setInlineEditingDraft(previous => ({
        ...previous,
        productId: nextValue,
        attributeLabel: attributeOptions.includes(customAttribute) ? customAttribute : (attributeOptions.includes(previous.attributeLabel) ? previous.attributeLabel : ''),
        sizeLabel: customSize || previous.sizeLabel,
        quantityUnit: selectedProduct
          ? resolveDraftItemQuantityUnit(configSource, selectedProduct, previous.quantityUnit)
          : previous.quantityUnit || defaultQuantityUnit,
        unitPrice: selectedProduct
          ? getCustomerProductPrice(configSource, selectedProduct, resolveDraftItemQuantityUnit(configSource, selectedProduct, previous.quantityUnit))
          : previous.unitPrice
      }));
      return;
    }

    setInlineEditingDraft(previous => ({
      ...previous,
      [field]: field === 'unitPrice' ? parseInputCurrency(nextValue) : nextValue
    }));
  };

  const handleOrderCellQuantityUnitChange = (nextValue) => {
    if (orderCellEditor?.field !== 'quantity') return;
    setInlineEditingDraft(previous => ({
      ...previous,
      quantityUnit: nextValue,
      actualUnit: nextValue,
    }));
  };

  const saveOrderCellEditor = async () => {
    if (!orderCellEditor?.row || !canEditOrderCellField(orderCellEditor.field) || savingOrderCellRef.current) return;
    savingOrderCellRef.current = true;
    setIsSavingOrderCell(true);
    try {
      await saveInlineEditRow(orderCellEditor.row);
    } finally {
      savingOrderCellRef.current = false;
      setIsSavingOrderCell(false);
    }
  };

  const deleteOrderCellEditorRow = async () => {
    if (!orderCellEditor?.row || !canDelete || isSavingOrderCell) return;
    setIsSavingOrderCell(true);
    try {
      await deleteInlineEditRow(orderCellEditor.row);
    } finally {
      setIsSavingOrderCell(false);
    }
  };

  const getOrderCellEditorConfig = () => {
    if (!orderCellEditor?.field) return null;
    const quantityEditorDraft = {
      customerId: inlineEditingDraft.customerId,
      branchId: inlineEditingDraft.branchId || orderCellEditor.row?.branchId || '',
    };
    const quantityEditorItem = {
      productId: inlineEditingDraft.productId || orderCellEditor.row?.productId || '',
      configurationId: inlineEditingDraft.configurationId || '',
      quantityUnit: inlineEditingDraft.quantityUnit || inlineEditingDraft.actualUnit || '',
      actualUnit: inlineEditingDraft.actualUnit || '',
      billingUnit: inlineEditingDraft.billingUnit || inlineEditingDraft.pricingUnit || '',
      pricingUnit: inlineEditingDraft.pricingUnit || '',
      attributeLabel: inlineEditingDraft.attributeLabel || '',
      weightKg: inlineEditingDraft.sizeLabel || '',
      sizeLabel: inlineEditingDraft.sizeLabel || '',
    };
    const quantityEditorUnitOptions = getDraftItemUnitOptions(quantityEditorDraft, quantityEditorItem);
    const selectedQuantityUnit = quantityEditorUnitOptions.find(unit => (
      isSameBillingUnit(unit, inlineEditingDraft.quantityUnit || inlineEditingDraft.actualUnit)
    )) || quantityEditorUnitOptions[0] || defaultQuantityUnit;
    const fieldConfigs = {
      customerId: {
        label: 'Khách hàng',
        title: 'Sửa khách hàng',
        type: 'select',
        value: inlineEditingDraft.customerId,
        options: [{ value: '', label: '-- Chọn khách hàng --' }, ...availableCustomers.map(customer => ({ value: customer.id, label: customer.name }))]
      },
      productId: {
        label: 'Sản phẩm',
        title: 'Sửa sản phẩm',
        type: 'select',
        value: inlineEditingDraft.productId,
        options: [{ value: '', label: '-- Chọn sản phẩm --' }, ...activeProducts.map(product => ({ value: product.id, label: product.name }))]
      },
      quantity: {
        label: 'Số lượng',
        title: 'Sửa số lượng',
        type: 'number',
        value: inlineEditingDraft.quantity,
        secondaryField: {
          label: 'Đơn vị đặt',
          type: 'select',
          inline: true,
          value: selectedQuantityUnit,
          options: quantityEditorUnitOptions.map(unit => ({ value: unit, label: unit })),
          helpText: `Đơn giá vẫn tính theo ${inlineEditingDraft.billingUnit || inlineEditingDraft.pricingUnit || 'đơn vị tính giá'} của sản phẩm.`,
          onValueChange: handleOrderCellQuantityUnitChange,
        },
        placeholder: 'Nhập số lượng'
      },
      sizeLabel: {
        label: 'Size',
        title: 'Sửa size',
        type: 'text',
        value: inlineEditingDraft.sizeLabel,
        placeholder: 'Nhập size hoặc phân loại'
      },
      unitPrice: {
        label: 'Đơn giá',
        title: 'Sửa đơn giá',
        type: 'currency',
        value: formatInputCurrency(inlineEditingDraft.unitPrice),
        suffix: `đ/${inlineEditingDraft.billingUnit || inlineEditingDraft.pricingUnit || inlineEditingDraft.quantityUnit || 'đơn vị'}`,
        placeholder: 'Nhập đơn giá'
      }
    };
    return fieldConfigs[orderCellEditor.field] || null;
  };

  const updateDraft = (localId, patch) => {
    setRequestDrafts(prev => prev.map(draft => {
      if (draft.localId !== localId) return draft;
      const nextPatch = typeof patch === 'function' ? patch(draft) : patch;
      return { ...draft, ...nextPatch };
    }));
  };

  const updateDraftItem = (localId, itemLocalId, patch) => {
    setRequestDrafts(prev => prev.map(draft => {
      if (draft.localId !== localId) return draft;
      return {
        ...draft,
        items: (draft.items || []).map(item => {
          if (item.localItemId !== itemLocalId) return item;
          const nextPatch = typeof patch === 'function' ? patch(item) : patch;
          return { ...item, ...nextPatch };
        })
      };
    }));
  };


  const handleCustomerChange = (localId, customerId) => {
    const selectedCustomer = customerLookup.get(customerId);
    if (isEditingRequest && orderEditBaseRef.current) orderEditBaseRef.current.customerConfig = configScopeFingerprint(selectedCustomer || {});
    const branchRef = getDefaultOrderRequestBranchRef(selectedCustomer);
    const targetDraft = requestDrafts.find(draft => draft.localId === localId);
    if (!isEditingRequest && targetDraft?.customerId !== customerId) {
      updateDraft(localId, {
        customerId,
        customerConfigBase: selectedCustomer ? configScopeFingerprint(selectedCustomer) : '',
        customerSearch: selectedCustomer ? getCustomerDisplayName(selectedCustomer) : '',
        ...branchRef,
        items: [createDraftItem()],
      });
      setOpenDraftPicker(null);
      setRequestError('');
      return;
    }
    updateDraft(localId, (draft) => ({
      customerId,
      customerConfigBase: selectedCustomer ? configScopeFingerprint(selectedCustomer) : '',
      customerSearch: selectedCustomer ? getCustomerDisplayName(selectedCustomer) : '',
      branchId: branchRef.branchId,
      branchName: branchRef.branchName,
      branchAddress: branchRef.branchAddress,
      items: (draft.items || []).map((item) => {
        const product = productLookup.get(item.productId);
        if (!selectedCustomer || !product) return item;
        const configSource = getCustomerBranchProductConfigSource(selectedCustomer, branchRef.branchId, activeProducts);
        const customSize = getCustomerProductSize(configSource, product);
        const customAttribute = getCustomerProductAttribute(configSource, product);
        const attributeOptions = getProductAttributes(product);
        const pricingUnit = getCustomerProductPricingUnit(configSource, product, 'Con');
        const quantityUnit = resolveDraftItemQuantityUnit(
          configSource,
          product,
          item.inputUnitTouched ? item.quantityUnit : ''
        );
        return {
          ...item,
          attributeLabel: attributeOptions.includes(customAttribute) ? customAttribute : item.attributeLabel,
          weightKg: customSize || item.weightKg,
          quantityUnit,
          pricingUnit,
          inputUnitTouched: false,
          unitPrice: getCustomerProductPrice(configSource, product, pricingUnit)
        };
      })
    }));
    setRequestError('');
  };

  const handleBranchChange = (localId, branchId) => {
    const targetDraft = requestDrafts.find(draft => draft.localId === localId);
    const selectedCustomer = targetDraft?.customerId ? customerLookup.get(targetDraft.customerId) : null;
    const branch = getCustomerBranchById(selectedCustomer, branchId, activeProducts);
    if (!isEditingRequest && (targetDraft?.branchId || '') !== (branch?.id || '')) {
      updateDraft(localId, {
        branchId: branch?.id || '',
        branchName: branch ? getCustomerBranchDisplayName(branch) : '',
        branchAddress: branch?.address || '',
        items: [createDraftItem()],
      });
      setOpenDraftPicker(null);
      setRequestError('');
      return;
    }
    const configSource = getCustomerBranchProductConfigSource(selectedCustomer, branch?.id || '', activeProducts);
    updateDraft(localId, (draft) => ({
      branchId: branch?.id || '',
      branchName: branch ? getCustomerBranchDisplayName(branch) : '',
      branchAddress: branch?.address || '',
      items: (draft.items || []).map((item) => {
        const product = productLookup.get(item.productId);
        if (!selectedCustomer || !product) return item;
        const customSize = getCustomerProductSize(configSource, product);
        const customAttribute = getCustomerProductAttribute(configSource, product);
        const attributeOptions = getProductAttributes(product);
        const pricingUnit = getCustomerProductPricingUnit(configSource, product, 'Con');
        const quantityUnit = resolveDraftItemQuantityUnit(
          configSource,
          product,
          item.inputUnitTouched ? item.quantityUnit : ''
        );
        return {
          ...item,
          attributeLabel: attributeOptions.includes(customAttribute) ? customAttribute : item.attributeLabel,
          weightKg: customSize || item.weightKg,
          quantityUnit,
          pricingUnit,
          inputUnitTouched: false,
          unitPrice: getCustomerProductPrice(configSource, product, pricingUnit)
        };
      })
    }));
    setRequestError('');
  };

  const handleProductChange = (localId, itemLocalId, productId, variantConfig = null) => {
    const selectedProduct = productLookup.get(productId);
    const attributeOptions = getProductAttributes(selectedProduct);
    const targetDraft = requestDrafts.find(draft => draft.localId === localId);
    const selectedCustomer = targetDraft?.customerId ? customerLookup.get(targetDraft.customerId) : null;
    const configSource = getCustomerBranchProductConfigSource(selectedCustomer, targetDraft?.branchId || '', activeProducts);
    const configuration = selectedProduct
      ? resolveCustomerProductBillingConfiguration(configSource, selectedProduct, {
          variant: variantConfig,
          variantId: variantConfig?.id || '',
          sizeLabel: variantConfig?.size || variantConfig?.sizeLabel || '',
          attributeLabel: variantConfig?.attributeLabel || '',
        })
      : null;
    const configuredAttribute = `${configuration?.attributeLabel || (selectedProduct ? getCustomerProductAttribute(configSource, selectedProduct) : '') || ''}`.trim();
    const configuredSize = `${configuration?.sizeLabel || (selectedProduct ? getCustomerProductSize(configSource, selectedProduct) : '') || ''}`.trim();
    updateDraftItem(localId, itemLocalId, (item) => {
      const pricingUnit = configuration?.billingUnit || '';
      const quantityUnit = selectedProduct
        ? resolveCustomerProductActualUnit(configuration, selectedProduct)
        : item.quantityUnit || defaultQuantityUnit;
      return {
      productId,
      productSearch: selectedProduct?.name || '',
      previousOrder: false,
      attributeLabel: configuredAttribute
        || (attributeOptions.includes(item.attributeLabel) ? item.attributeLabel : ''),
      weightKg: configuredSize,
      quantityUnit,
      pricingUnit,
      configurationId: configuration?.configurationId || '',
      inputUnitTouched: false,
      rememberedDefaultInputUnit: '',
      unitPrice: configuration?.unitPrice || '',
      actualQuantity: '',
      actualUnit: quantityUnit,
      billingQuantity: '',
      billingUnit: pricingUnit,
      amount: '',
      billingSnapshotVersion: 0,
      billingSnapshotSource: ''
    };
    });
    setRequestError('');
  };

  const buildQuickProductDraftItem = (productId, existingItem = {}, variantConfig = null) => {
    const selectedProduct = productLookup.get(productId);
    if (!selectedProduct) return createDraftItem(existingItem);
    const selectedCustomer = primaryDraft?.customerId ? customerLookup.get(primaryDraft.customerId) : null;
    const configSource = getCustomerBranchProductConfigSource(selectedCustomer, primaryDraft?.branchId || '', activeProducts);
    const configuration = resolveCustomerProductBillingConfiguration(configSource, selectedProduct, {
      variant: variantConfig,
      variantId: variantConfig?.id || '',
      sizeLabel: variantConfig?.size || variantConfig?.sizeLabel || '',
      attributeLabel: variantConfig?.attributeLabel || '',
    });
    const attributeOptions = getProductAttributes(selectedProduct);
    const configuredAttribute = `${configuration.attributeLabel || getCustomerProductAttribute(configSource, selectedProduct) || ''}`.trim();
    const configuredSize = `${configuration.sizeLabel || getCustomerProductSize(configSource, selectedProduct) || ''}`.trim();
    const pricingUnit = configuration.billingUnit;
    const quantityUnit = configuration.defaultOrderUnit || resolveCustomerProductActualUnit(configuration, selectedProduct);
    const configuredPrice = configuration.unitPrice;
    return createDraftItem({
      ...existingItem,
      localItemId: existingItem.localItemId,
      productId: selectedProduct.id,
      productSearch: selectedProduct.name || existingItem.productSearch || '',
      attributeLabel: configuredAttribute
        || (attributeOptions.includes(existingItem.attributeLabel) ? existingItem.attributeLabel : ''),
      weightKg: configuredSize || existingItem.weightKg,
      quantityUnit,
      pricingUnit,
      configurationId: configuration.configurationId,
      inputUnitTouched: Boolean(existingItem.inputUnitTouched),
      unitPrice: configuredPrice > 0 ? configuredPrice : (parseLooseMoneyValue(existingItem.unitPrice) > 0 ? existingItem.unitPrice : ''),
      actualQuantity: '',
      actualUnit: quantityUnit,
      billingQuantity: '',
      billingUnit: pricingUnit,
      amount: '',
      billingSnapshotVersion: 0,
      billingSnapshotSource: '',
      ...previousOrderDraftFields(variantConfig)
    });
  };

  const handleQuickProductSelect = (productId, variantConfig = null, interactionSelectionKey = '') => {
    if (!primaryDraft?.localId) return;
    const selectedProduct = productLookup.get(productId);
    if (!selectedProduct) return;
    // Compare against the normalized draft row, not the raw customer config. The
    // draft may resolve unit/attribute defaults before it is stored in the order.
    const normalizedQuickItem = buildQuickProductDraftItem(productId, {}, variantConfig);
    const targetVariantKey = getDraftItemVariantKey(normalizedQuickItem);

    const selectionKey = interactionSelectionKey || targetVariantKey;
    if (!tryAcquireOrderRequestSelectionLock(quickProductSelectionLocksRef.current, selectionKey)) return;
    setPendingQuickProductSelectionKeys(previous => {
      if (previous.has(selectionKey)) return previous;
      const next = new Set(previous);
      next.add(selectionKey);
      return next;
    });

    updateDraft(primaryDraft.localId, (draft) => {
      const currentItems = Array.isArray(draft.items) ? draft.items : [];
      const existingIndex = currentItems.findIndex((item) => getDraftItemVariantKey(item) === targetVariantKey);

      if (existingIndex >= 0) {
        const nextItems = currentItems.filter((item) => getDraftItemVariantKey(item) !== targetVariantKey);
        return {
          items: nextItems.length > 0 ? nextItems : [createDraftItem()]
        };
      }

      const blankItemIndex = currentItems.findIndex((item) => {
        const hasProduct = Boolean(item.productId);
        const hasSize = String(item.weightKg || '').trim() !== '';
        const hasQuantity = String(item.quantity || '').trim() !== '';
        const hasPrice = String(item.unitPrice || '').trim() !== '';
        return !hasProduct && !hasSize && !hasQuantity && !hasPrice;
      });

      if (blankItemIndex >= 0) {
        const nextItems = [...currentItems];
        nextItems[blankItemIndex] = buildQuickProductDraftItem(productId, nextItems[blankItemIndex], variantConfig);
        return { items: nextItems };
      }

      return {
        items: [...currentItems, buildQuickProductDraftItem(productId, {}, variantConfig)]
      };
    });
    setRequestError('');

    const previousTimer = quickProductSelectionTimersRef.current.get(selectionKey);
    if (previousTimer) window.clearTimeout(previousTimer);
    const timerId = window.setTimeout(() => {
      releaseOrderRequestSelectionLock(quickProductSelectionLocksRef.current, selectionKey);
      quickProductSelectionTimersRef.current.delete(selectionKey);
      setPendingQuickProductSelectionKeys(previous => {
        if (!previous.has(selectionKey)) return previous;
        const next = new Set(previous);
        next.delete(selectionKey);
        return next;
      });
    }, ORDER_REQUEST_SELECTION_LOCK_MS);
    quickProductSelectionTimersRef.current.set(selectionKey, timerId);
  };
  quickProductSelectActionRef.current = handleQuickProductSelect;

  const getOrderVoiceRecognitionConstructor = () => {
    if (typeof window === 'undefined') return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  };

  const getOrderVoiceRecorderMimeType = () => {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
    return [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/mp4;codecs=mp4a.40.2'
    ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || '';
  };

  const applyOrderVoiceExtraction = (target, payload = {}) => {
    if (!target?.draftLocalId || !target?.itemLocalId) return;
    const targetDraft = requestDrafts.find(draft => draft.localId === target.draftLocalId);
    const transcript = `${payload?.transcript || ''}`.trim();
    const customerKeyword = `${payload?.customer_name || payload?.customerName || ''}`.trim() || transcript;
    const productKeyword = `${payload?.product_name || payload?.productName || ''}`.trim() || transcript;
    const customerMatch = findBestEntityMatch(
      [customerKeyword, transcript],
      availableCustomers,
      (item) => item?.name || '',
      (item) => [item?.phone, item?.address, item?.group, item?.customerGroup]
    );
    const candidateProductMatch = findBestEntityMatch(
      [productKeyword, transcript],
      activeProducts,
      (item) => item?.name || '',
      (item) => [item?.category, item?.unit, item?.barcode]
    );
    const requestedSizeLabel = `${payload?.size_label || payload?.sizeLabel || payload?.weight_label || payload?.weightLabel || ''}`.trim();
    const quantityValue = parseLooseQuantityValue(payload?.quantity_value ?? payload?.quantityValue ?? payload?.quantity ?? payload?.qty);
    const noteValue = capitalizeFirstPreservingSpacing(payload?.note || '').trim();
    const effectiveCustomer = customerMatch || (targetDraft?.customerId ? customerLookup.get(targetDraft.customerId) : null);
    const effectiveBranchId = customerMatch
      ? getDefaultOrderRequestBranchRef(customerMatch).branchId
      : (targetDraft?.branchId || '');
    const effectiveConfigSource = getCustomerBranchProductConfigSource(effectiveCustomer, effectiveBranchId, activeProducts);
    const fixedVoiceProducts = getOrderRequestFixedProducts(effectiveCustomer, effectiveBranchId);
    const productMatch = candidateProductMatch && fixedVoiceProducts.some(product => product.id === candidateProductMatch.id)
      ? candidateProductMatch
      : findBestEntityMatch(
        [productKeyword, transcript],
        fixedVoiceProducts,
        (item) => item?.name || '',
        (item) => [item?.category, item?.unit, item?.barcode]
      );
    const configuration = productMatch
      ? resolveCustomerProductBillingConfiguration(effectiveConfigSource, productMatch, { sizeLabel: requestedSizeLabel })
      : null;
    const quantityUnit = configuration ? resolveCustomerProductActualUnit(configuration, productMatch) : '';
    const pricingUnit = configuration?.billingUnit || '';
    const resolvedUnitPrice = configuration?.unitPrice || 0;
    const sizeLabel = configuration?.sizeLabel || requestedSizeLabel;
    const resolvedAttribute = productMatch ? getCustomerProductAttribute(effectiveConfigSource, productMatch) : '';

    if (customerMatch) {
      handleCustomerChange(target.draftLocalId, customerMatch.id);
    } else if (payload?.customer_name) {
      updateDraft(target.draftLocalId, { customerSearch: capitalizeFirstPreservingSpacing(payload.customer_name) });
    }

    updateDraftItem(target.draftLocalId, target.itemLocalId, (item) => ({
      productId: productMatch?.id || item.productId,
      productSearch: productMatch?.name || item.productSearch || capitalizeFirstPreservingSpacing(payload?.product_name || ''),
      attributeLabel: resolvedAttribute || item.attributeLabel,
      weightKg: sizeLabel || (productMatch ? getCustomerProductSize(effectiveConfigSource, productMatch) : '') || item.weightKg,
      quantity: quantityValue > 0 ? quantityValue : item.quantity,
      quantityUnit: quantityUnit || item.quantityUnit || '',
      pricingUnit: pricingUnit || item.pricingUnit || '',
      configurationId: configuration?.configurationId || '',
      inputUnitTouched: Boolean(quantityUnit),
      unitPrice: resolvedUnitPrice > 0 ? resolvedUnitPrice : item.unitPrice,
      actualUnit: quantityUnit || item.actualUnit || '',
      billingUnit: pricingUnit || item.billingUnit || '',
      billingSnapshotVersion: 0,
      billingSnapshotSource: ''
    }));

    if (noteValue) {
      updateDraft(target.draftLocalId, { note: noteValue });
    }

    setRequestError('');
    const missingFields = [
      !customerMatch ? 'khach hang' : '',
      !productMatch ? 'hang hoa' : '',
      !sizeLabel ? 'size' : '',
      quantityValue <= 0 ? 'so luong' : '',
      !quantityUnit ? 'don vi' : '',
      resolvedUnitPrice <= 0 ? 'don gia' : ''
    ].filter(Boolean);

    if (missingFields.length === 0) {
      setOrderVoiceStatus(`Da dien: ${customerMatch?.name || 'Khach hang'} ? ${productMatch?.name || 'Hang hoa'} ? ${sizeLabel || ''} ? ${formatNumber(quantityValue)} ${quantityUnit} ? ${formatCurrency(resolvedUnitPrice)}`);
      return;
    }

    if (transcript) {
      setOrderVoiceStatus(`AI da nghe duoc nhung con thieu ${missingFields.join(', ')}. Ban kiem tra lai roi luu tay.`);
      return;
    }

    setOrderVoiceStatus('AI chua xu ly duoc ghi am nay. Ban vui long kiem tra lai truoc khi luu.');
  };

  const extractOrderVoiceItems = (payload = {}, availableProductOptions = []) => {
    const transcript = `${payload?.transcript || ''}`.trim();
    const rawItems = Array.isArray(payload?.items) && payload.items.length > 0
      ? payload.items
      : [{
          product_name: payload?.product_name || payload?.productName || '',
          size_label: payload?.size_label || payload?.sizeLabel || payload?.weight_label || payload?.weightLabel || '',
          quantity_value: payload?.quantity_value ?? payload?.quantityValue ?? payload?.quantity ?? payload?.qty,
          quantity_unit: payload?.quantity_unit || payload?.quantityUnit || '',
          unit_price_vnd: payload?.unit_price_vnd ?? payload?.unitPriceVnd ?? payload?.unit_price ?? payload?.unitPrice ?? payload?.price
        }];

    return rawItems
      .map((rawItem) => {
        const productKeyword = `${rawItem?.product_name || rawItem?.productName || ''}`.trim() || transcript;
        const productMatch = findBestEntityMatch(
          [productKeyword, transcript],
          availableProductOptions,
          (item) => item?.name || '',
          (item) => [item?.category, item?.unit, item?.barcode]
        );
        const sizeLabel = `${rawItem?.size_label || rawItem?.sizeLabel || rawItem?.weight_label || rawItem?.weightLabel || ''}`.trim();
        const quantityValue = parseLooseQuantityValue(rawItem?.quantity_value ?? rawItem?.quantityValue ?? rawItem?.quantity ?? rawItem?.qty);
        const quantityUnit = resolveQuantityUnitOption(rawItem?.quantity_unit || rawItem?.quantityUnit || '', productMatch?.unit || '');
        const unitPrice = parseLooseMoneyValue(rawItem?.unit_price_vnd ?? rawItem?.unitPriceVnd ?? rawItem?.unit_price ?? rawItem?.unitPrice ?? rawItem?.price);

        return {
          productMatch,
          productName: productMatch?.name || capitalizeFirstPreservingSpacing(rawItem?.product_name || rawItem?.productName || '').trim(),
          sizeLabel,
          quantityValue,
          quantityUnit,
          unitPrice
        };
      })
      .filter((item) => item.productMatch || item.productName || item.sizeLabel || item.quantityValue > 0 || item.quantityUnit || item.unitPrice > 0);
  };

  const applyOrderVoiceDraftExtraction = (draftLocalId, payload = {}) => {
    if (!draftLocalId) return;
    const transcript = `${payload?.transcript || ''}`.trim();
    const targetDraft = requestDrafts.find(draft => draft.localId === draftLocalId);
    const customerKeyword = `${payload?.customer_name || payload?.customerName || ''}`.trim() || transcript;
    const customerMatch = findBestEntityMatch(
      [customerKeyword, transcript],
      availableCustomers,
      (item) => item?.name || '',
      (item) => [item?.phone, item?.address, item?.group, item?.customerGroup]
    );
    const effectiveCustomer = customerMatch || (targetDraft?.customerId ? customerLookup.get(targetDraft.customerId) : null);
    const effectiveBranchId = customerMatch
      ? getDefaultOrderRequestBranchRef(customerMatch).branchId
      : (targetDraft?.branchId || '');
    const effectiveConfigSource = getCustomerBranchProductConfigSource(effectiveCustomer, effectiveBranchId, activeProducts);
    const fixedVoiceProducts = getOrderRequestFixedProducts(effectiveCustomer, effectiveBranchId);
    const extractedItems = extractOrderVoiceItems(payload, fixedVoiceProducts);
    const noteValue = capitalizeFirstPreservingSpacing(payload?.note || '').trim();

    if (customerMatch) {
      handleCustomerChange(draftLocalId, customerMatch.id);
    } else if (payload?.customer_name) {
      updateDraft(draftLocalId, { customerSearch: capitalizeFirstPreservingSpacing(payload.customer_name) });
    }

    updateDraft(draftLocalId, (draft) => ({
      customerId: customerMatch?.id || draft.customerId,
      customerSearch: customerMatch?.name || draft.customerSearch || effectiveCustomer?.name || capitalizeFirstPreservingSpacing(payload?.customer_name || '').trim(),
      note: noteValue || draft.note,
      items: extractedItems.length > 0
        ? extractedItems.map((item) => {
          const configuration = item.productMatch
            ? resolveCustomerProductBillingConfiguration(effectiveConfigSource, item.productMatch, { sizeLabel: item.sizeLabel })
            : null;
          const pricingUnit = configuration?.billingUnit || '';
          const actualUnit = configuration ? resolveCustomerProductActualUnit(configuration, item.productMatch) : '';
          return createDraftItem({
            productId: item.productMatch?.id || '',
            productSearch: item.productMatch?.name || item.productName || '',
            attributeLabel: item.productMatch ? getCustomerProductAttribute(effectiveConfigSource, item.productMatch) : '',
            weightKg: configuration?.sizeLabel || item.sizeLabel || '',
            quantity: item.quantityValue > 0 ? item.quantityValue : '',
            quantityUnit: actualUnit,
            pricingUnit,
            configurationId: configuration?.configurationId || '',
            inputUnitTouched: false,
            unitPrice: configuration?.unitPrice || '',
            actualUnit,
            billingUnit: pricingUnit
          });
        })
        : draft.items
    }));

    setRequestError('');
    const missingLines = extractedItems.filter((item) => {
      const configuration = item.productMatch
        ? resolveCustomerProductBillingConfiguration(effectiveConfigSource, item.productMatch, { sizeLabel: item.sizeLabel })
        : null;
      return !item.productMatch || item.quantityValue <= 0 || !configuration?.billingUnit || configuration?.unitPrice <= 0;
    });
    if (effectiveCustomer && extractedItems.length > 0 && missingLines.length === 0) {
      setOrderVoiceStatus(`Đã điền ${effectiveCustomer.name} với ${extractedItems.length} mặt hàng.`);
      return;
    }

    if (!effectiveCustomer && extractedItems.length === 0) {
      setOrderVoiceStatus('AI chưa nhận ra đủ khách hàng và mặt hàng. Bạn hãy đọc rõ hơn hoặc chỉnh tay.');
      return;
    }

    const parts = [];
    if (!effectiveCustomer) parts.push('thiếu khách hàng');
    if (extractedItems.length === 0) parts.push('chưa có mặt hàng hợp lệ');
    if (missingLines.length > 0) parts.push(`${missingLines.length} dòng cần kiểm tra lại`);
    setOrderVoiceStatus(`AI đã điền nháp gần hoàn chỉnh, ${parts.join(' • ')}.`);
  };

  const transcribeOrderVoiceAudio = async (audioBlob, target) => {
    setIsOrderVoiceProcessing(true);
    setOrderVoiceStatus('Dang gui ghi am cho AI xu ly don dat hang...');
    try {
      const parsed = await requestOrderRequestDraftFromGeminiAudio(audioBlob, buildOrderVoiceContext());
      applyOrderVoiceDraftExtraction(target?.draftLocalId, parsed);
    } catch (error) {
      setOrderVoiceStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể đọc ghi âm. Bạn hãy thử lại hoặc nhập tay.'));
    } finally {
      setIsOrderVoiceProcessing(false);
    }
  };

  const startRecordedOrderVoiceCapture = async (target) => {
    if (!GEMINI_PROXY_ENABLED) {
      setOrderVoiceStatus('App chua co khoa AI de doc ghi am tren thiet bi nay. Ban hay nhap tay.');
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setOrderVoiceStatus('Thiet bi nay chua ho tro ghi am truc tiep. Ban hay nhap tay.');
      return;
    }

    cleanupOrderVoiceResources();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getOrderVoiceRecorderMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      orderVoiceMediaStreamRef.current = stream;
      orderVoiceMediaRecorderRef.current = recorder;
      orderVoiceChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data?.size) orderVoiceChunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        cleanupOrderVoiceResources();
        setIsOrderVoiceListening(false);
        setIsOrderVoiceProcessing(false);
        setOrderVoiceStatus('Khong the ghi am. Ban hay thu lai hoac nhap tay.');
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(orderVoiceChunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
        cleanupOrderVoiceResources();
        if (!audioBlob.size) {
          setOrderVoiceStatus('Khong ghi nhan duoc am thanh. Ban hay thu noi gan micro hon.');
          return;
        }
        await transcribeOrderVoiceAudio(audioBlob, target);
      };

      recorder.start();
      setOrderVoiceTarget(target);
      setIsOrderVoiceListening(true);
      setOrderVoiceStatus('Dang ghi am ca don... Hay doc ten khach, hang hoa, size, so luong, don vi va don gia roi bam Dung nghe.');
    } catch (error) {
          setOrderVoiceStatus('Khong ghi nhan duoc am thanh. Ban hay thu noi gan micro hon.');
      setIsOrderVoiceListening(false);
      setOrderVoiceStatus(mapMicrophoneAccessErrorMessage(error, isNativeRuntime() ? 'native' : 'web'));
    }
  };

  const handleStartOrderVoice = async (draftLocalId) => {
    if (isOrderVoiceProcessing) return;
    const target = { draftLocalId, itemLocalId: '' };
    const microphoneAccess = await ensureMicrophoneAccess();
    if (!microphoneAccess.granted) {
      setOrderVoiceStatus(microphoneAccess.message || 'Ung dung chua duoc cap quyen micro.');
      return;
    }

    if (isNativeRuntime()) {
      await startRecordedOrderVoiceCapture(target);
      return;
    }

    const Recognition = getOrderVoiceRecognitionConstructor();
    if (!Recognition) {
      await startRecordedOrderVoiceCapture(target);
      return;
    }

    stopOrderVoiceCapture();
    setOrderVoiceStatus('Dang nghe giong noi de dien ca don hang...');

    const recognition = new Recognition();
    recognition.lang = 'vi-VN';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    orderVoiceRecognitionRef.current = recognition;
    setIsOrderVoiceListening(true);

    recognition.onresult = async (event) => {
      const transcript = Array.from(event.results || []).map((result) => result?.[0]?.transcript || '').join(' ').trim();
      if (!transcript) return;
      setIsOrderVoiceProcessing(true);
      setOrderVoiceStatus('Dang xu ly cau noi de dien ca don hang...');
      try {
        const parsed = await requestOrderRequestDraftFromGeminiTranscript(transcript, buildOrderVoiceContext());
        applyOrderVoiceDraftExtraction(target?.draftLocalId, parsed);
      } catch (error) {
        setOrderVoiceStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể xử lý câu nói này. Bạn hãy thử lại.'));
      } finally {
        setIsOrderVoiceProcessing(false);
      }
    };

    recognition.onerror = async (event) => {
      setIsOrderVoiceListening(false);
      orderVoiceRecognitionRef.current = null;
      if (['not-allowed', 'service-not-allowed', 'audio-capture', 'network'].includes(event?.error)) {
        await startRecordedOrderVoiceCapture(target);
        return;
      }
      setOrderVoiceStatus(event?.error === 'not-allowed'
        ? 'Ban chua cap quyen micro cho trinh duyet hoac app.'
        : 'Khong the nhan giong noi. Ban hay thu lai hoac nhap tay.');
    };

    recognition.onend = () => {
      setIsOrderVoiceListening(false);
      orderVoiceRecognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch (error) {
      setIsOrderVoiceListening(false);
      orderVoiceRecognitionRef.current = null;
      await startRecordedOrderVoiceCapture(target);
    }
  };

  const addRequestDraft = (seed = {}) => {
    setRequestDrafts(prev => [...prev, createDraft(seed)]);
  };

  const duplicateRequestDraft = (localId) => {
    const targetDraft = requestDrafts.find(draft => draft.localId === localId);
    if (!targetDraft) return;
    addRequestDraft({
      customerId: targetDraft.customerId,
      customerSearch: targetDraft.customerSearch,
      note: targetDraft.note,
      upfrontPayment: targetDraft.upfrontPayment,
      items: (targetDraft.items || []).map(item => ({
        productId: item.productId,
        productSearch: item.productSearch,
        weightKg: item.weightKg,
        quantity: item.quantity,
        quantityUnit: item.quantityUnit,
        pricingUnit: item.pricingUnit,
        unitPrice: item.unitPrice
      }))
    });
  };

  const removeRequestDraft = (localId) => {
    setOpenDraftPicker(prev => (prev && prev.includes(localId) ? null : prev));
    setRequestDrafts(prev => prev.length === 1 ? [createDraft()] : prev.filter(draft => draft.localId !== localId));
  };

  const addDraftItem = (localId, seed = {}) => {
    updateDraft(localId, draft => ({
      items: [...(draft.items || []), createDraftItem(seed)]
    }));
  };

  const duplicateDraftItem = (localId, itemLocalId) => {
    const targetDraft = requestDrafts.find(draft => draft.localId === localId);
    const targetItem = targetDraft?.items?.find(item => item.localItemId === itemLocalId);
    if (!targetItem) return;
    addDraftItem(localId, {
      productId: targetItem.productId,
      productSearch: targetItem.productSearch,
      attributeLabel: targetItem.attributeLabel,
      weightKg: targetItem.weightKg,
      quantity: targetItem.quantity,
      quantityUnit: targetItem.quantityUnit,
      pricingUnit: targetItem.pricingUnit,
      unitPrice: targetItem.unitPrice
    });
  };

  const removeDraftItem = (localId, itemLocalId) => {
    setOpenDraftPicker(prev => (String(prev || '').includes(itemLocalId) ? null : prev));
    updateDraft(localId, draft => {
      const nextItems = (draft.items || []).filter(item => item.localItemId !== itemLocalId);
      return {
        items: nextItems.length > 0 ? nextItems : [createDraftItem()]
      };
    });
  };

  const openOrderRequestForm = () => {
    if (!canCreate) return;
    clearQuickProductSelectionLocks();
    stopOrderVoiceCapture();
    cleanupOrderVoiceResources();
    setOrderVoiceStatus('');
    setOrderVoiceTarget({ draftLocalId: '', itemLocalId: '' });
    setOrderEntryMode('manual');
    setOrderFormStage('manual_setup');
    setEditingRequestId(null);
    resetInlineEditing();
    setRequestDrafts([createDraft()]);
    setRequestError('');
    setRequestStatus('');
    setOpenDraftPicker(null);
    setQuickProductSearch('');
    setShowForm(true);
  };

  const openOrderRequestEditForm = (request) => {
    if (!request || !canEdit) return;
    orderEditBaseRef.current = { request, customerConfig: configScopeFingerprint(customerLookup.get(request.customerId) || {}) };
    clearQuickProductSelectionLocks();
    stopOrderVoiceCapture();
    cleanupOrderVoiceResources();
    setOrderVoiceStatus('');
    setOrderVoiceTarget({ draftLocalId: '', itemLocalId: '' });
    setOrderEntryMode('manual');
    setOrderFormStage('detail');
    resetInlineEditing();
    setEditingRequestId(request.id);
    setRequestDrafts([buildRequestDraftFromExisting(request)]);
    setRequestError('');
    setRequestStatus('');
    setOpenDraftPicker(null);
    setQuickProductSearch('');
    setShowForm(true);
  };

  const closeOrderRequestForm = () => {
    window.localStorage.removeItem(requestDraftStorageKey);
    requestDraftCacheRef.current = null;
    clearQuickProductSelectionLocks();
    stopOrderVoiceCapture();
    cleanupOrderVoiceResources();
    setOrderVoiceStatus('');
    setOrderVoiceTarget({ draftLocalId: '', itemLocalId: '' });
    setOrderEntryMode('manual');
    setOrderFormStage('manual_setup');
    setShowForm(false);
    setEditingRequestId(null);
    resetInlineEditing();
    setRequestDrafts([createDraft()]);
    setRequestError('');
    setOpenDraftPicker(null);
    setOrderUnitEditor(null);
    setQuickProductSearch('');
  };

  useEffect(() => {
    if (quickActionIntent?.type !== 'create_order_request') return;
    openOrderRequestForm();
    onQuickActionHandled?.();
  }, [quickActionIntent?.id, quickActionIntent?.requestedAt, quickActionIntent?.type]);

  const openManualOrderSetup = () => {
    stopOrderVoiceCapture();
    cleanupOrderVoiceResources();
    setOrderVoiceStatus('');
    setOrderVoiceTarget({ draftLocalId: '', itemLocalId: '' });
    setOrderEntryMode('manual');
    setOrderFormStage('manual_setup');
    setRequestError('');
    setOpenDraftPicker(null);
    setQuickProductSearch('');
  };

  const openVoiceOrderEntry = () => {
    openManualOrderSetup();
  };

  const continueManualOrderEntry = () => {
    if (!primaryDraft?.customerId) {
      setRequestError('Vui long chon khach hang truoc khi tiep tuc.');
      return;
    }
    setRequestError('');
    setOrderFormStage('detail');
  };

  const formatSheetSize = (sizeValue) => {
    const raw = `${sizeValue || ''}`.trim();
    if (!raw) return '';
    if (/kg/i.test(raw)) return raw;
    if (/^\d+(?:[.,]\d+)?$/.test(raw)) return `${formatNumber(parseFloat(raw.replace(',', '.')))}kg`;
    return raw;
  };
  const formatOrderRequestSizeCell = (row = {}) => {
    return formatSheetSize(getOrderRequestSizeCellLabel(row));
  };

  const formatSheetQuantity = (quantity, unit = '') => {
    const parsed = parseFloat(quantity);
    if (!parsed) return '';
    return `${formatNumber(parsed)}${unit ? ` ${unit.toLowerCase()}` : ''}`;
  };

  const openRequestTableCell = useCurrentCallback(openOrderCellEditor);
  const approveRequestTableRow = useCurrentCallback(updateCustomerPortalOrderApproval);
  const readRequestProductLabel = useCurrentCallback(getOrderRequestRowProductLabel);
  const readRequestNote = useCurrentCallback(getOrderRequestRowNoteText);
  const readRequestQuantity = useCurrentCallback(formatSheetQuantity);
  const readRequestSize = useCurrentCallback(formatOrderRequestSizeCell);
  const buildOrderRequestSheetFilename = () => `bang-don-dat-hang-${getTodayString()}`;
  const orderRequestSheetRowsPerImage = 12;

  const buildOrderRequestSheetPages = () => {
    const { groupedShareableRequestSheetCustomerGroups, groupedShareableMergedRequestSheetRows } = getOrderRequestShareData();
    const pages = buildOrderRequestSharePagesByCustomer(
      groupedShareableRequestSheetCustomerGroups,
      orderRequestSheetRowsPerImage
    );
    return pages.length ? pages : [groupedShareableMergedRequestSheetRows];
  };

  const renderOrderRequestSheetCanvas = async (rowsForPage = getOrderRequestShareData().groupedShareableMergedRequestSheetRows, pageMeta = {}) => {
    if (rowsForPage.length === 0) {
      throw new Error('permission_denied');
    }

    const rows = rowsForPage;
    const summarySourceRows = getOrderRequestShareData().groupedShareableMergedRequestSheetRows;
    const summaryRows = Array.from(summarySourceRows.reduce((summaryMap, row) => {
      const product = productLookup.get(row.productId) || {};
      const groupName = row.productGroupName || getOrderRequestMainGroupLabel(product, row.productName || 'Nhóm hàng');
      const unit = row.quantityUnit || product.unit || '';
      const key = `${groupName}__${unit}`;
      if (!summaryMap.has(key)) summaryMap.set(key, { groupName, unit, quantity: 0 });
      summaryMap.get(key).quantity += parseLooseQuantityValue(row.quantity);
      return summaryMap;
    }, new Map()).values())
      .filter(summary => summary.quantity > 0)
      .sort((a, b) => `${a.groupName || ''}`.localeCompare(`${b.groupName || ''}`, 'vi', { numeric: true, sensitivity: 'base' }));
    const canvasWidth = 1400;
    const pagePadding = 42;
    const tableX = pagePadding;
    const isFirstSheetPage = !pageMeta.totalPages || (pageMeta.pageNumber || 1) === 1;
    const showSummaryRows = isFirstSheetPage && summaryRows.length > 0;
    let tableY = isFirstSheetPage ? (showSummaryRows ? 232 : 150) : 92;
    const tableWidth = canvasWidth - pagePadding * 2;
    const headerHeight = 64;
    const lineHeight = 30;
    const cellPaddingX = 14;
    const columnTitles = ['Tên', 'Loại', 'Số lượng', 'Size', 'Đơn giá'];
    const canvas = createRecordedShareCanvas(canvasWidth);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('permission_denied');
    }

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const measureWithFont = (text, font) => {
      ctx.font = font;
      return ctx.measureText(`${text || ''}`).width;
    };
    const bodyFont = '900 25px Arial';
    const nameFont = '900 25px Arial';
    const quantityFont = '900 32px Arial';
    const priceFont = '900 25px Arial';
    const maxMeasure = (values, font) => values.reduce((max, value) => Math.max(max, measureWithFont(value, font)), 0);
    const nameWidth = Math.round(tableWidth * 0.22);
    const productWidth = Math.round(tableWidth * 0.26);
    const quantityWidth = Math.round(tableWidth * 0.19);
    const sizeWidth = Math.round(tableWidth * 0.14);
    const priceWidth = tableWidth - nameWidth - productWidth - quantityWidth - sizeWidth;
    const columnWidths = [nameWidth, productWidth, quantityWidth, sizeWidth, priceWidth];
    const columnX = columnWidths.reduce((acc, width) => {
      acc.push(acc[acc.length - 1] + width);
      return acc;
    }, [tableX]);

    const splitLongWord = (word, maxWidth) => {
      if (!word || ctx.measureText(word).width <= maxWidth) return [word];
      const chunks = [];
      let currentChunk = '';
      Array.from(word).forEach((char) => {
        const nextChunk = `${currentChunk}${char}`;
        if (currentChunk && ctx.measureText(nextChunk).width > maxWidth) {
          chunks.push(currentChunk);
          currentChunk = char;
        } else {
          currentChunk = nextChunk;
        }
      });
      if (currentChunk) chunks.push(currentChunk);
      return chunks;
    };

    const wrapCanvasText = (text, maxWidth) => {
      const normalized = `${text || ''}`.replace(/\s+/g, ' ').trim();
      if (!normalized) return [''];
      const words = normalized.split(' ');
      const lines = [];
      let currentLine = '';

      words.forEach((word) => {
        splitLongWord(word, maxWidth).forEach((segment) => {
          const nextLine = currentLine ? `${currentLine} ${segment}` : segment;
          if (currentLine && ctx.measureText(nextLine).width > maxWidth) {
            lines.push(currentLine);
            currentLine = segment;
          } else {
            currentLine = nextLine;
          }
        });
      });

      if (currentLine) lines.push(currentLine);
      return lines.length > 0 ? lines : [''];
    };
    const wrapCanvasMultilineText = (text, maxWidth) => `${text || ''}`
      .split(/\n+/)
      .flatMap((part) => wrapCanvasText(part, maxWidth));

    const groupedRows = [];
    rows.forEach((row, index) => {
      const branchKey = row.branchId || normalizeLookupText(row.branchName || '') || 'main';
      const customerKey = `${row.customerId || normalizeLookupText(row.customerName || '') || index}__${branchKey}`;
      const previousGroup = groupedRows[groupedRows.length - 1];
      if (!previousGroup || previousGroup.customerKey !== customerKey) {
        groupedRows.push({
          key: customerKey,
          customerKey,
          customerName: row.customerName || 'Khách hàng',
          rows: []
        });
      }
      groupedRows[groupedRows.length - 1].rows.push(row);
    });

    const wrappedGroups = groupedRows.map((group) => {
      ctx.font = nameFont;
      const nameLines = wrapCanvasText(group.customerName, Math.max(60, nameWidth - cellPaddingX * 2));
      const wrappedRows = group.rows.map((row) => {
        ctx.font = bodyFont;
        const productDisplayName = buildOrderRequestProductCellText(row, { multiline: true });
        const productLines = wrapCanvasMultilineText(productDisplayName, Math.max(70, productWidth - cellPaddingX * 2));
        ctx.font = quantityFont;
        const quantityLines = wrapCanvasText(formatSheetQuantity(row.quantity, row.quantityUnit), Math.max(60, quantityWidth - 16));
        const sizeLines = wrapCanvasText(formatOrderRequestSizeCell(row), Math.max(50, sizeWidth - 16));
        ctx.font = priceFont;
        const priceLines = wrapCanvasText(row.unitPrice ? formatCurrency(row.unitPrice) : '', Math.max(60, priceWidth - 16));
        const maxLines = Math.max(productLines.length, sizeLines.length, quantityLines.length, priceLines.length, 1);
        return {
          productLines,
          sizeLines,
          quantityLines,
          priceLines,
          height: Math.max(62, (maxLines * lineHeight) + 24)
        };
      });
      const groupHeight = wrappedRows.reduce((sum, row) => sum + row.height, 0);
      const minNameHeight = Math.max(62, (nameLines.length * lineHeight) + 28);
      if (wrappedRows.length > 0 && groupHeight < minNameHeight) {
        wrappedRows[wrappedRows.length - 1].height += minNameHeight - groupHeight;
      }
      return { ...group, nameLines, wrappedRows };
    });

    const tableHeight = headerHeight + wrappedGroups.reduce((groupSum, group) => (
      groupSum + group.wrappedRows.reduce((rowSum, row) => rowSum + row.height, 0)
    ), 0);
    const canvasHeight = tableY + tableHeight + 58;
    canvas.height = canvasHeight;

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    drawRoundedRect(ctx, 22, 20, canvasWidth - 44, canvasHeight - 40, 34);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (isFirstSheetPage) {
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '900 38px Arial';
    ctx.fillText('BẢNG ĐƠN ĐẶT HÀNG', canvasWidth / 2, 68);
    ctx.font = '700 20px Arial';
    ctx.fillStyle = '#475569';
    ctx.fillText(`${isSales ? 'Nhân viên kinh doanh' : 'Người lập'}: ${employee?.name || 'Nhân sự'} • ${formatDateLabel(requestFilterDate || getTodayString())}`, canvasWidth / 2, 100);
    if (pageMeta.totalPages > 1) {
      ctx.font = '800 18px Arial';
      ctx.fillStyle = '#64748b';
      ctx.fillText(`Trang ${pageMeta.pageNumber || 1}/${pageMeta.totalPages}`, canvasWidth / 2, 126);
    }
    } else if (pageMeta.totalPages > 1) {
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = '900 24px Arial';
      ctx.fillText(`Phần ${pageMeta.pageNumber || 1}/${pageMeta.totalPages}`, canvasWidth / 2, 58);
    }

    if (showSummaryRows) {
      const summaryTop = pageMeta.totalPages > 1 ? 148 : 124;
      ctx.fillStyle = '#0f172a';
      ctx.font = '900 21px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('TỔNG THEO NHÓM HÀNG', tableX, summaryTop);

      const chipGap = Math.max(6, Math.min(14, 30 / Math.max(summaryRows.length, 1)));
      const chipWidth = (tableWidth - chipGap * Math.max(0, summaryRows.length - 1)) / Math.max(summaryRows.length, 1);
      const chipHeight = 54;
      summaryRows.forEach((summary, index) => {
        const x = tableX + index * (chipWidth + chipGap);
        const y = summaryTop + 14;
        drawRoundedRect(ctx, x, y, chipWidth, chipHeight, 18);
        ctx.fillStyle = '#fef3c7';
        ctx.fill();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const unitLabel = summary.unit ? ` ${summary.unit}` : '';
        const quantityText = `${formatNumber(summary.quantity)}${unitLabel}`;
        const groupText = `${summary.groupName || 'Nhóm'}`;
        const quantitySize = fitCanvasFontSize(ctx, quantityText, { weight: 900, maxSize: 28, minSize: 16, maxWidth: chipWidth - 18 });
        ctx.fillStyle = '#92400e';
        ctx.font = `900 ${quantitySize}px Arial`;
        ctx.fillText(quantityText, x + chipWidth / 2, y + 21);
        const groupSize = fitCanvasFontSize(ctx, groupText, { weight: 800, maxSize: 16, minSize: 10, maxWidth: chipWidth - 18 });
        ctx.fillStyle = '#b45309';
        ctx.font = `800 ${groupSize}px Arial`;
        ctx.fillText(groupText, x + chipWidth / 2, y + 41);
      });
    }

    ctx.fillStyle = '#ecfdf5';
    ctx.fillRect(tableX, tableY, tableWidth, headerHeight);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.strokeRect(tableX, tableY, tableWidth, tableHeight);
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 28px Arial';
    ctx.textBaseline = 'middle';
    columnTitles.forEach((title, index) => {
      const width = columnWidths[index];
      ctx.textAlign = 'center';
      ctx.fillText(title, columnX[index] + width / 2, tableY + headerHeight / 2);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.strokeRect(columnX[index], tableY, width, headerHeight);
    });

    let rowTop = tableY + headerHeight;
    const drawLines = (lines, x, y, width, height, font, color = '#0f172a') => {
      ctx.fillStyle = color;
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const firstLineY = y + height / 2 - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((line, lineIndex) => {
        ctx.fillText(line || '', x + width / 2, firstLineY + lineIndex * lineHeight);
      });
    };

    wrappedGroups.forEach((group, groupIndex) => {
      const groupTop = rowTop;
      const groupHeight = group.wrappedRows.reduce((sum, row) => sum + row.height, 0);
      ctx.fillStyle = groupIndex % 2 === 0 ? '#ffffff' : '#fbfdff';
      ctx.fillRect(tableX, groupTop, tableWidth, groupHeight);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(columnX[0], groupTop, nameWidth, groupHeight);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.35;
      ctx.strokeRect(columnX[0], groupTop, nameWidth, groupHeight);
      drawLines(group.nameLines, columnX[0], groupTop, nameWidth, groupHeight, nameFont, '#0f172a');

      group.wrappedRows.forEach((row) => {
        const rowHeight = row.height;
        const cells = [
          { index: 1, lines: row.productLines, font: bodyFont, color: '#0f172a' },
          { index: 2, lines: row.quantityLines, font: quantityFont, color: '#065f46' },
          { index: 3, lines: row.sizeLines, font: '700 22px Arial', color: '#334155' },
          { index: 4, lines: row.priceLines, font: priceFont, color: '#0f172a' }
        ];
        cells.forEach((cell) => {
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1.35;
          ctx.strokeRect(columnX[cell.index], rowTop, columnWidths[cell.index], rowHeight);
          drawLines(cell.lines, columnX[cell.index], rowTop, columnWidths[cell.index], rowHeight, cell.font, cell.color);
        });
        rowTop += rowHeight;
      });
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tableX, rowTop);
      ctx.lineTo(tableX + tableWidth, rowTop);
      ctx.stroke();
    });

    return canvas;
  };

  const prepareOrderRequestSheetBlobs = async ({ reason = 'share_click' } = {}) => {
    const { groupedShareableMergedRequestSheetRows } = getOrderRequestShareData();
    const cacheKey = getOrderRequestSheetAssetKey();
    if (!cacheKey || groupedShareableMergedRequestSheetRows.length === 0) return [];
    const expectedBlobCount = buildOrderRequestSheetPages().length;

    const cached = orderRequestSheetAssetCacheRef.current.get(cacheKey);
    if (hasCompleteOrderRequestShareBlobSet(cached?.blobs, expectedBlobCount)) {
      debugShareImageCache('order request memory hit', { count: cached.blobs.length, reason });
      recordPerformanceEvent('share_order_request.cache_lookup', {
        hit: true,
        source: 'memory',
        reason,
        count: cached.blobs.length
      });
      return cached.blobs;
    }

    const pending = orderRequestSheetPendingCacheRef.current.get(cacheKey);
    if (pending) return pending;

    let prepareSpan = null;
    const promise = (async () => {
      const persisted = await readPersistentShareImageAsset(cacheKey, SHARE_IMAGE_CACHE_TTL_MS);
      const persistedBlobs = persisted?.payload?.blobs;
      if (hasCompleteOrderRequestShareBlobSet(persistedBlobs, expectedBlobCount)) {
        orderRequestSheetAssetCacheRef.current.set(cacheKey, {
          blobs: persistedBlobs,
          createdAt: Number(persisted.createdAt || Date.now())
        });
        debugShareImageCache('order request persistent ready', { count: persistedBlobs.length, reason });
        recordPerformanceEvent('share_order_request.cache_lookup', {
          hit: true,
          source: 'indexeddb',
          reason,
          count: persistedBlobs.length
        });
        return persistedBlobs;
      }

      recordPerformanceEvent('share_order_request.cache_lookup', {
        hit: false,
        source: 'render',
        reason
      });
      prepareSpan = createPerformanceSpan('share_order_request.prepare', { reason });
      const blobs = await renderSharePagesSequentially(buildOrderRequestSheetPages(),{
        render:renderOrderRequestSheetCanvas,encode:canvas=>canvasToBlob(canvas,'image/png'),
      });
      if (!hasCompleteOrderRequestShareBlobSet(blobs, expectedBlobCount)) {
        throw new Error('Không thể chuẩn bị đủ ảnh bảng đơn đặt hàng. Vui lòng thử lại.');
      }
      const createdAt = Date.now();
      orderRequestSheetAssetCacheRef.current.delete(cacheKey);
      orderRequestSheetAssetCacheRef.current.set(cacheKey, { blobs, createdAt });
      while (orderRequestSheetAssetCacheRef.current.size > 4) {
        const oldestKey = orderRequestSheetAssetCacheRef.current.keys().next().value;
        orderRequestSheetAssetCacheRef.current.delete(oldestKey);
      }

      // Publish the complete image set in memory first, then persist it. A
      // storage failure never removes the last usable set of share images.
      void writePersistentShareImageAsset({
        sourceKey: cacheKey,
        scope: 'order_request_sheet',
        entityId: `${employee?.id || 'shared'}_${requestFilterDate || getTodayString()}`,
        payload: { blobs },
        createdAt
      });
      prepareSpan?.end({
        status: 'ok',
        count: blobs.length,
        bytes: blobs.reduce((sum, blob) => sum + Number(blob?.size || 0), 0)
      });
      return blobs;
    })().catch((error) => {
      prepareSpan?.fail(error);
      recordPerformanceEvent('share_order_request.cache_error', {
        reason,
        error: error?.message || String(error)
      }, 'warn');
      throw error;
    }).finally(() => {
      orderRequestSheetPendingCacheRef.current.delete(cacheKey);
    });

    orderRequestSheetPendingCacheRef.current.set(cacheKey, promise);
    return promise;
  };

  const shareOrderRequestSheetBlobs = async (blobs = []) => {
    if (blobs.length === 1) {
      return shareBlobFile({
        filename: `${buildOrderRequestSheetFilename()}.png`,
        blob: blobs[0],
        title: 'Bảng đơn đặt hàng',
        text: 'Danh sách đơn đặt hàng đã được gộp theo khách. Bạn có thể chia sẻ lên Zalo hoặc gửi ngay.',
        dialogTitle: 'Chia sẻ bảng đơn đặt hàng'
      });
    }

    const baseFilename = buildOrderRequestSheetFilename();
    if (Capacitor.getPlatform() !== 'web') {
      try {
        const uris = await prepareOrderRequestNativeFiles(blobs, baseFilename, writeBlobToShareCache);
        const capability = await CapacitorShare.canShare().catch(() => ({ value: false }));
        if (capability?.value && uris.length) {
          await CapacitorShare.share({
            title: 'Bảng đơn đặt hàng',
            dialogTitle: 'Chia sẻ bảng đơn đặt hàng',
            files: uris
          });
          return { status: 'shared', count: uris.length };
        }
        // Cache URIs are temporary; only a completed share or a Documents
        // write below may be reported as success.
      } catch (error) {
        if (isShareCancelled(error)) {
          return { status: 'cancelled' };
        }
        throw error;
      }
    }

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        const files = buildOrderRequestShareFiles(blobs, baseFilename);
        if (files.length === blobs.length && (!navigator.canShare || navigator.canShare({ files }))) {
          await navigator.share({ title: 'Bảng đơn đặt hàng', files });
          return { status: 'shared', count: files.length };
        }
      } catch (error) {
        if (isShareCancelled(error)) {
          return { status: 'cancelled' };
        }
        // A recipient may already have accepted some pages. Never resend the batch automatically.
        throw error;
      }
    }

    const downloadResults = [];
    for (let index = 0; index < blobs.length; index += 1) {
      downloadResults.push(await saveBlobFile(`${baseFilename}-trang-${index + 1}.png`, blobs[index]));
      // Let the browser register one download before starting the next one.
      if (index < blobs.length - 1) {
        await new Promise(resolve => window.setTimeout(resolve, 180));
      }
    }
    const completed = downloadResults.filter(result => result.status === 'downloaded' || result.status === 'saved');
    return { status: completed.length === blobs.length ? completed[0]?.status : 'unsupported', count: completed.length };
  };

  const orderRequestShareBusyRef = useRef(false);
  const handleShareOrderRequestSheet = async () => {
    if (!requestProjectionReady) return;
    if (orderRequestShareBusyRef.current) return;
    if (!canShareOrderRequestSheet) {
      setSheetStatus('Bạn chưa được cấp quyền chia sẻ bảng đơn đặt hàng.');
      return;
    }
    if (getOrderRequestShareData().groupedShareableMergedRequestSheetRows.length === 0) {
      setSheetStatus(mergedRequestSheetRows.length > 0
        ? 'Tất cả đơn đặt hàng trong ngày đã xuất kho, không còn đơn mới để chia sẻ.'
        : 'Chưa có đơn đặt hàng nào để chia sẻ.');
      return;
    }

    const shareAssetStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    orderRequestShareBusyRef.current = true;
    setIsSheetExporting(true);
    try {
      const blobs = await prepareOrderRequestSheetBlobs({ reason: 'share_click' });
      const shareAssetReadyMs = Math.max(0, (typeof performance !== 'undefined' ? performance.now() : Date.now()) - shareAssetStartedAt);
      debugShareImageCache(`order request share assets ready ${Math.round(shareAssetReadyMs)}ms`, {
        readyMs: Math.round(shareAssetReadyMs * 100) / 100,
        count: blobs.length,
        bytes: blobs.reduce((sum, blob) => sum + Number(blob?.size || 0), 0)
      });
      const result = await shareOrderRequestSheetBlobs(blobs);

      setSheetStatus(['shared', 'saved', 'downloaded', 'cancelled'].includes(result.status)
        ? '' : 'Thiết bị này chưa hỗ trợ chia sẻ trực tiếp.');
    } catch (error) {
      setSheetStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể chia sẻ bảng đơn đặt hàng.'));
    } finally {
      orderRequestShareBusyRef.current = false;
      setIsSheetExporting(false);
    }
  };

  const handleDownloadOrderRequestSheet = async () => {
    if (getOrderRequestShareData().groupedShareableMergedRequestSheetRows.length === 0) {
      setSheetStatus(mergedRequestSheetRows.length > 0
        ? 'Tất cả đơn đặt hàng trong ngày đã xuất kho, không còn đơn mới để tải xuống.'
        : 'Chưa có đơn đặt hàng nào để tải xuống.');
      return;
    }

    setIsSheetExporting(true);
    try {
      const blobs = await prepareOrderRequestSheetBlobs({ reason: 'download_click' });
      const baseFilename = buildOrderRequestSheetFilename();
      const results = await Promise.all(blobs.map((blob, index) => saveBlobFile(
        blobs.length > 1 ? `${baseFilename}-trang-${index + 1}.png` : `${baseFilename}.png`,
        blob
      )));
      setSheetStatus(results.some(result => ['saved', 'downloaded'].includes(result.status))
        ? '' : 'Không thể tải bảng đơn đặt hàng trên thiết bị này.');
    } catch (error) {
      setSheetStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể tải bảng đơn đặt hàng.'));
    } finally {
      setIsSheetExporting(false);
    }
  };

  const handleSubmitOrderRequests = async (e) => {
    e.preventDefault();
    if (isRequestSubmitting || requestSubmittingRef.current) return;

    if (availableCustomers.length === 0) {
      setRequestError('Chua co khach hang phu hop de len don dat hang.');
      return;
    }

    if (activeProducts.length === 0) {
      setRequestError('Chua co san pham nao trong danh muc de chon.');
      return;
    }

    const normalizedRequests = [];
    const invalidRows = [];

    requestDrafts.forEach((draft, index) => {
      const customer = customerLookup.get(draft.customerId);
      const branchRef = getOrderRequestBranchRef(customer, draft);
      const rawItems = draft.items || [];
      const normalizedItems = [];
      const invalidItemIndexes = [];
      const upfrontPayment = parseLooseMoneyValue(draft.upfrontPayment);
      const hasAnyItemInput = rawItems.some(item => {
        const hasProduct = Boolean(item.productId);
        const hasWeight = String(item.weightKg || '').trim() !== '';
        const hasQuantity = String(item.quantity || '').trim() !== '';
        const hasPrice = String(item.unitPrice || '').trim() !== '';
        return hasProduct || hasWeight || hasQuantity || hasPrice;
      });
      const isBlankDraft = !draft.customerId && !hasAnyItemInput && !String(draft.note || '').trim() && upfrontPayment <= 0;

      if (isBlankDraft) {
        return;
      }

      rawItems.forEach((item, itemIndex) => {
        const isBlankItem = !item.productId
          && String(item.weightKg || '').trim() === ''
          && String(item.quantity || '').trim() === ''
          && String(item.unitPrice || '').trim() === '';

        if (isBlankItem) return;

        const product = productLookup.get(item.productId);
        const sizeLabel = `${item.weightKg || ''}`.trim();
        const attributeLabel = `${item.attributeLabel || ''}`.trim();
        const quantity = parseLooseQuantityValue(item.quantity);
        const savedUnitPrice = parseLooseMoneyValue(item.unitPrice);

        if (!product || quantity <= 0) {
          invalidItemIndexes.push(itemIndex + 1);
          return;
        }

        const configSource = getCustomerBranchProductConfigSource(customer, branchRef.branchId, activeProducts);
        const configuredBilling = resolveCustomerProductBillingConfiguration(configSource, product, {
          configurationId: item.configurationId || '',
          sizeLabel,
          attributeLabel,
        });
        const hasSavedPricingSnapshot = Boolean(
          item.billingSnapshotVersion
          || ((item.billingUnit || item.pricingUnit) && savedUnitPrice > 0)
        );
        // Added catalog products still require a valid billing configuration.
        if (!configuredBilling.isValid && !hasSavedPricingSnapshot) {
          invalidItemIndexes.push(itemIndex + 1);
          return;
        }
        const billingConfiguration = hasSavedPricingSnapshot
          ? {
              ...configuredBilling,
              configurationId: item.configurationId || configuredBilling.configurationId,
              billingUnit: normalizeProductPricingUnit(item.billingUnit || item.pricingUnit || item.quantityUnit),
              pricingUnit: normalizeProductPricingUnit(item.billingUnit || item.pricingUnit || item.quantityUnit),
              unitPrice: savedUnitPrice,
              source: item.billingSnapshotSource || 'order_request_snapshot',
            }
          : configuredBilling;
        const billingUnit = billingConfiguration.billingUnit;
        const quantityUnit = hasSavedPricingSnapshot
          ? normalizeProductPricingUnit(item.quantityUnit || item.actualUnit || billingUnit)
          : resolveDraftItemQuantityUnit(configSource, product, item.quantityUnit || item.actualUnit);
        const usesWeightPricing = isSameBillingUnit(billingUnit, 'Kg');
        if (!billingUnit || !quantityUnit || (!usesWeightPricing && !isSameBillingUnit(quantityUnit, billingUnit))) {
          invalidItemIndexes.push(itemIndex + 1);
          return;
        }
        const billingSnapshot = buildCustomerProductBillingSnapshot({
          configuration: billingConfiguration,
          product,
          productId: product.id,
          productName: product.name,
          sizeLabel,
          attributeLabel,
          actualQuantity: quantity,
          actualUnit: quantityUnit,
          actualWeightKg: usesWeightPricing && isSameBillingUnit(quantityUnit, billingUnit) ? quantity : 0,
          billingQuantity: isSameBillingUnit(quantityUnit, billingUnit) ? quantity : 0,
          billingUnit,
          unitPrice: billingConfiguration.unitPrice,
        });
        if (!billingSnapshot.billingSnapshotValid && !billingSnapshot.pricingPendingActual) {
          invalidItemIndexes.push(itemIndex + 1);
          return;
        }
        normalizedItems.push({
          productId: product.id,
          branchId: branchRef.branchId,
          branchName: branchRef.branchName,
          branchAddress: branchRef.branchAddress,
          customerBranchId: branchRef.branchId,
          customerBranchName: branchRef.branchName,
          customerBranchAddress: branchRef.branchAddress,
          attributeLabel,
          productAttribute: attributeLabel,
          sizeLabel,
          ...billingSnapshot,
          description: product.name || 'Hàng hóa',
          quantity,
          quantityUnit,
          orderUnit: quantityUnit,
          defaultOrderUnit: quantityUnit,
          billingUnit: billingSnapshot.billingUnit,
          pricingUnit: billingSnapshot.billingUnit,
          unitPrice: billingSnapshot.unitPrice,
          pricingQuantity: billingSnapshot.billingQuantity,
          pricingPendingActual: billingSnapshot.pricingPendingActual,
          lineTotal: billingSnapshot.amount
        });
      });

      if (!customer || normalizedItems.length === 0 || invalidItemIndexes.length > 0) {
        invalidRows.push(
          invalidItemIndexes.length > 0
            ? `khách ${index + 1}, mặt hàng ${invalidItemIndexes.join(', ')}`
            : `khách ${index + 1}`
        );
        return;
      }

      const totalQuantity = normalizedItems.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
      const totalAmount = normalizedItems.reduce((sum, item) => sum + parseLooseMoneyValue(item.lineTotal), 0);

      const requestSalesEmpId = isSales
        ? (employee?.id || customer.empId || '')
        : (customer.empId || employee?.id || '');

      normalizedRequests.push({
        clientMutationId: draft.localId,
        customerId: customer.id,
        branchId: branchRef.branchId,
        branchName: branchRef.branchName,
        branchAddress: branchRef.branchAddress,
        customerBranchId: branchRef.branchId,
        customerBranchName: branchRef.branchName,
        customerBranchAddress: branchRef.branchAddress,
        salesEmpId: requestSalesEmpId,
        date: requestWorkingDate || getTodayString(),
        note: capitalizeFirst(draft.note || '').trim(),
        upfrontPayment,
        depositAmount: upfrontPayment,
        paymentMethod: 'Chuyển khoản',
        items: normalizedItems,
        totalQuantity,
        totalAmount
      });
    });

    if (normalizedRequests.length === 0) {
      setRequestError('Ban chua co don dat hang hop le de luu.');
      return;
    }

    if (invalidRows.length > 0) {
      setRequestError(`Vui long kiem tra lai ${invalidRows.join('; ')}. Moi khach can chon dung khach hang, it nhat mot mat hang, co so luong va don gia thu hop le.`);
      return;
    }

    if (!isEditingRequest) {
      const seenRequestSignatures = new Map();
      const duplicateRequestLabels = [];

      normalizedRequests.forEach((requestPayload, index) => {
        const signature = buildOrderRequestDuplicateSignature(requestPayload);
        if (!signature) return;
        const customerName = customerLookup.get(requestPayload.customerId)?.name || `khach ${index + 1}`;
        const label = `${index + 1}. ${customerName}`;
        if (seenRequestSignatures.has(signature)) {
          duplicateRequestLabels.push(label);
          return;
        }
        seenRequestSignatures.set(signature, true);
      });

      if (duplicateRequestLabels.length > 0) {
        setRequestError(`Trong lan luu nay co don dat hang trung: ${duplicateRequestLabels.slice(0, 3).join('; ')}${duplicateRequestLabels.length > 3 ? '...' : ''}. Vui long kiem tra lai.`);
        return;
      }
    }

    requestSubmittingRef.current = true;
    setIsRequestSubmitting(true);
    setRequestStatus('');
    setRequestError('');

    try {
      if (isEditingRequest) {
        if (normalizedRequests.length !== 1) {
          setRequestError('Chỉ được chỉnh sửa một đơn đặt hàng mỗi lần.');
          return;
        }

        const saved = await onEditOrderRequest(editingRequestId, normalizedRequests[0], employee?.id || 'admin', {
          expectedOrder: orderEditBaseRef.current?.request,
          expectedCustomerConfig: orderEditBaseRef.current?.customerConfig,
        });
        setRequestStatus('');
        closeOrderRequestForm();
        if (saved?.skipped?.length) setRequestStatus('Đơn đã lưu. Các dòng có nhiều biến thể chưa rõ giữ nguyên cấu hình khách hàng.');
        return;
      }

      const skippedDefaults = [];
      for (const requestPayload of normalizedRequests) {
        const savedRequestId = await onAddOrderRequest(employee?.id || 'admin', requestPayload, {
          expectedCustomerConfig: requestDrafts.find(draft => draft.localId === requestPayload.clientMutationId)?.customerConfigBase,
          onDefaultsSynced: skipped => skippedDefaults.push(...skipped),
        });
        if (!savedRequestId) throw new Error('Không thể tạo mã đơn đặt hàng. Vui lòng thử lại.');
      }

      setRequestStatus('');
      closeOrderRequestForm();
      if (skippedDefaults.length) setRequestStatus('Đơn đã lưu. Các dòng có nhiều biến thể chưa rõ giữ nguyên cấu hình khách hàng.');
    } catch (error) {
      const message = getFriendlyFirebaseErrorMessage(error, 'Không thể lưu đơn đặt hàng. Vui lòng thử lại.');
      setRequestError(message);
      if (isTimeoutLikeError(error)) {
        setRequestStatus('Đơn chưa được máy chủ xác nhận. App vẫn giữ biểu mẫu để bạn kiểm tra kết nối và thử lại an toàn.');
        return;
      }
      setRequestStatus(`Luu don dat hang bi loi: ${message}`);
    } finally {
      requestSubmittingRef.current = false;
      setIsRequestSubmitting(false);
    }
  };

  const orderCellEditorConfig = getOrderCellEditorConfig();

  if (!canAccess) {
    return <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center text-sm text-gray-500">Bạn không có quyền vào mục đơn đặt hàng.</div>;
  }

  return (
    <div className="premium-data-module premium-orders-module premium-order-request-module space-y-4 animate-in fade-in pb-16" aria-busy={!requestProjectionReady}>
      {requestStatus && (
        <div role="status" className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          <span className="min-w-0 flex-1">{requestStatus}</span>
          <button
            type="button"
            onClick={() => setRequestStatus('')}
            className="-mr-1 rounded-full p-1 text-emerald-500 transition hover:bg-emerald-100 hover:text-emerald-700"
            aria-label="Ẩn thông báo đơn đặt hàng"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {sheetStatus && (
        <div role="status" className="flex items-start gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700">
          <span className="min-w-0 flex-1">{sheetStatus}</span>
          <button
            type="button"
            onClick={() => setSheetStatus('')}
            className="-mr-1 rounded-full p-1 text-sky-500 transition hover:bg-sky-100 hover:text-sky-700"
            aria-label="Ẩn thông báo chia sẻ đơn đặt hàng"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {hasHiddenTodayRequests && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
          <span>Đang xem ngày {formatDateLabel(requestFilterDate)}. Hôm nay có {todayRequestCount} đơn mới.</span>
          <button
            type="button"
            onClick={resetOrderRequestFilters}
            className="rounded-full bg-amber-500 px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow-sm"
          >
            Xem hôm nay
          </button>
        </div>
      )}

      <div className="hd-request-toolbar">
        <label
          className="hd-request-toolbar__date relative inline-flex items-center justify-center"
          onClick={(event) => {
            if (event.target?.tagName !== 'INPUT') openRequestDatePicker();
          }}
        >
          <span>{formatDateLabel(requestFilterDate)}</span>
          <input
            ref={requestDateInputRef}
            type="date"
            value={requestFilterDate}
            onChange={(e) => setRequestFilterDateFromUser(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Chọn ngày xem đơn đặt hàng"
          />
        </label>
        {canCreate && (
          <button type="button" onClick={openOrderRequestForm} className="hd-request-toolbar__create">
            Lên đơn
          </button>
        )}
        {canShareOrderRequestSheet && (
          <button type="button" onClick={handleShareOrderRequestSheet} disabled={isSheetExporting || !requestProjectionReady}
            aria-label={isSheetExporting ? 'Đang chuẩn bị chia sẻ' : 'Chia sẻ'}
            className="hd-request-toolbar__share">
            {isSheetExporting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Chia sẻ
          </button>
        )}
      </div>

      <div className="hd-request-list bg-white">
        {!requestProjectionReady ? (
          visibleRequestsProjection.error || requestStatusProjection.error
            ? <p role="alert" className="p-4 text-sm text-amber-800">Chưa đối chiếu xong đơn đặt và xuất kho.
                <button type="button" onClick={()=>setRequestProjectionAttempt(n=>n+1)} className="ml-3 font-bold underline">Thử lại</button>
              </p>
            : <p role="status" className="p-4 text-sm text-slate-500">Đang chuẩn bị đơn đặt và đối chiếu xuất kho…</p>
        ) : <>


          {showRequestFilterPanel && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Lọc theo ngày</label>
                  <input
                    type="date"
                    value={requestFilterDate}
                    onChange={(e) => setRequestFilterDateFromUser(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Nhân viên kinh doanh</label>
                  <select
                    value={requestFilterSalesEmpId}
                    onChange={(e) => setRequestFilterSalesEmpId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="all">Tất cả nhân viên</option>
                    {salesFilterOptions.map((salesEmployee) => (
                      <option key={salesEmployee.id} value={salesEmployee.id}>{salesEmployee.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={resetOrderRequestFilters}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Đặt lại bộ lọc
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 overflow-x-auto overflow-y-visible rounded-2xl border-2 border-slate-800">
            <table className="order-request-summary-table w-full table-fixed text-center text-[10px] sm:text-[11px] md:text-[13px] text-slate-900">
              <colgroup>
                <col style={{ width: '24%' }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: '19%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '19%' }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-800 px-2 py-2 font-black break-words">Tên</th>
                  <th className="border border-slate-800 px-2 py-2 font-black break-words">Loại</th>
                  <th className="w-px border border-slate-800 px-1 py-2 font-black whitespace-nowrap">Số lượng</th>
                  <th className="w-px border border-slate-800 px-1 py-2 font-black whitespace-nowrap">Size</th>
                  <th className="w-px border border-slate-800 px-1 py-2 font-black whitespace-nowrap">Đơn giá</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-gradient-to-r from-amber-50 via-white to-emerald-50">
                  <td colSpan={5} className="border border-slate-800 px-2 py-2">
                    <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-0.5">
                      {currentDayGroupQuantitySummary.length > 0 ? (
                        currentDayGroupQuantitySummary.map((group) => (
                          <span
                            key={group.groupName}
                            className="shrink-0 rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-black text-slate-800 shadow-sm"
                          >
                            {group.unitParts.join(' • ')} {group.groupName}
                          </span>
                        ))
                      ) : (
                        <span className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold text-slate-400">
                          Chưa có số lượng
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
                <OrderRequestTableRows visibleRequestSalesGroups={visibleRequestSalesGroups} isOwnerAccount={isOwnerAccount}
                  selectedRowKey={orderCellEditor?.row?.rowKey} canEditGeneral={canEditGeneral} canEditQuantity={canEditQuantity}
                  canEditSizePrice={canEditSizePrice} canDelete={canDelete} openOrderCellEditor={openRequestTableCell}
                  updateCustomerPortalOrderApproval={approveRequestTableRow} formatOrderRequestBranchLabel={formatOrderRequestBranchLabel}
                  getOrderRequestRowProductLabel={readRequestProductLabel} formatDateLabel={formatDateLabel}
                  getOrderRequestRowNoteText={readRequestNote} formatSheetQuantity={readRequestQuantity}
                  formatOrderRequestSizeCell={readRequestSize} formatCurrency={formatCurrency} />
              </tbody>
            </table>
          </div>
          {canManage && (
            <p className="mt-3 text-[11px] text-slate-400">Bấm đúng ô cần sửa. Nút xóa nằm trong bảng sửa của ô đã chọn.</p>
          )}
          <CoreRowPager page={requestRowPage} onChange={offset => setRequestDisplayPage({ scope: requestDisplayScope, offset })} />
          {filteredRequests.length === 0 && (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
              Không có đơn đặt hàng nào khớp bộ lọc hiện tại.
            </div>
          )}
          </>}
        </div>

      {orderCellEditor && orderCellEditorConfig && (
        <HDSingleCellEditDialog
          open
          eyebrow="Đơn đặt hàng"
          title={orderCellEditorConfig.title}
          context={[orderCellEditor.row.customerName || 'Khách hàng', getOrderRequestRowProductLabel(orderCellEditor.row) || 'Sản phẩm', inlineEditingDraft.attributeLabel, inlineEditingDraft.sizeLabel, inlineEditingDraft.billingUnit || inlineEditingDraft.pricingUnit].filter(Boolean).join(' • ')}
          fieldLabel={orderCellEditorConfig.label}
          fieldType={orderCellEditorConfig.type}
          value={orderCellEditorConfig.value}
          options={orderCellEditorConfig.options || []}
          secondaryField={orderCellEditorConfig.secondaryField || null}
          suffix={orderCellEditorConfig.suffix || ''}
          placeholder={orderCellEditorConfig.placeholder || ''}
          canSave={canEditOrderCellField(orderCellEditor.field)}
          canDelete={canDelete}
          isBusy={isSavingOrderCell}
          onValueChange={handleOrderCellValueChange}
          onCancel={closeOrderCellEditor}
          onSave={saveOrderCellEditor}
          onDelete={deleteOrderCellEditorRow}
        />
      )}

      {showForm && (
        <div className="hd-order-request-modal-layer hd-modal-layer fixed inset-0 z-[120] isolate bg-black/60 flex items-start justify-center px-2 pt-[calc(env(safe-area-inset-top)+0.25rem)] pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:p-4" data-hd-modal-root="true">
          <div className="hd-order-request-modal-panel hd-modal-surface relative z-[121] flex min-h-0 w-full max-w-5xl flex-col bg-white rounded-[28px] shadow-2xl overflow-hidden" role="dialog" aria-modal="true" aria-label={isEditingRequest ? 'Chỉnh sửa đơn đặt hàng' : 'Lên đơn đặt hàng'}>
            <div className={`shrink-0 border-b border-gray-100 flex items-start justify-between gap-4 ${(isCompactManualDetailStage || isManualSetupStage) ? 'px-4 py-2.5' : 'px-5 py-4'}`}>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.16em] font-bold text-emerald-600">{isEditingRequest ? 'Chỉnh sửa đơn đặt hàng' : 'Lên Đơn Đặt'}</p>
                {(isEditingRequest || isModeSelectionStage || orderEntryMode === 'voice') && (
                  <p className="text-xs text-slate-500 mt-2">
                    {isEditingRequest
                      ? 'Bạn có thể sửa khách, mặt hàng, số lượng, giá hoặc ghi chú rồi lưu lại.'
                      : isModeSelectionStage
                        ? 'Chọn cách lên đơn để bắt đầu thao tác nhanh hơn.'
                        : 'AI sẽ hỗ trợ nghe cả đơn và tự tách khách hàng, mặt hàng, size, số lượng và giá.'}
                  </p>
                )}
              </div>
              <button type="button" onClick={closeOrderRequestForm} className={`${isCompactManualDetailStage ? 'h-8 w-8' : 'h-9 w-9'} rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200`}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitOrderRequests} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {isModeSelectionStage && (
                <div className="hd-modal-body min-h-0 flex-1 overflow-y-auto p-5 bg-slate-50">
                  {(availableCustomers.length === 0 || activeProducts.length === 0) && (
                    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                      {availableCustomers.length === 0
                        ? 'Chưa có khách hàng phù hợp để lên đơn. Bạn hãy thêm khách hàng hoặc kiểm tra nhân viên phụ trách khách.'
                        : 'Chưa có sản phẩm trong danh mục. Bạn hãy thêm sản phẩm trước khi lưu đơn đặt hàng.'}
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={openManualOrderSetup}
                      className="rounded-3xl border border-emerald-200 bg-white p-5 text-left shadow-sm hover:bg-emerald-50 transition-colors"
                    >
                      <p className="text-[11px] uppercase tracking-[0.16em] font-bold text-emerald-600">Thủ công</p>
                      <h3 className="text-lg font-black text-slate-900 mt-2">Lên đơn theo từng bước</h3>
                      <p className="text-sm text-slate-500 mt-2 leading-6">Chọn khách trước, sau đó tick sản phẩm cố định hoặc bấm + để thêm sản phẩm khác.</p>
                    </button>
                    <button
                      type="button"
                      onClick={openVoiceOrderEntry}
                      className="rounded-3xl border border-sky-200 bg-white p-5 text-left shadow-sm hover:bg-sky-50 transition-colors"
                    >
                      <p className="text-[11px] uppercase tracking-[0.16em] font-bold text-sky-600">Giọng nói</p>
                      <h3 className="text-lg font-black text-slate-900 mt-2">Đọc cả đơn một lần</h3>
                      <p className="text-sm text-slate-500 mt-2 leading-6">AI sẽ nghe tên khách, nhiều mặt hàng, size, số lượng, đơn vị và đơn giá để tự điền đơn đặt hàng.</p>
                    </button>
                  </div>
                </div>
              )}

              {isManualSetupStage && primaryDraft && primaryDraftItem && (
                <div className="hd-modal-body min-h-0 flex-1 overflow-y-auto space-y-2 bg-slate-50 px-2 pb-2 pt-1.5 sm:px-3 sm:pb-3 sm:pt-2">
                  <div className="space-y-3 rounded-2xl bg-white px-2 py-2 shadow-sm sm:px-3">
                    <div className="relative space-y-1.5">
                      <label className="block text-[11px] font-bold uppercase text-gray-500">Họ tên khách hàng</label>
                      <div className={`hd-order-request-customer-search flex h-11 w-full items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors duration-200 focus-within:border-emerald-500 ${primaryDraft.customerId ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-200 bg-white'}`}>
                        <Search size={15} className="shrink-0 text-emerald-600" />
                        <input
                          data-hd-search-input="true"
                          type="text"
                          value={primaryDraft.customerSearch || ''}
                          onFocus={(event) => {
                            setOpenDraftPicker(manualCustomerPickerKey);
                            event.currentTarget.select();
                          }}
                          onClick={() => setOpenDraftPicker(manualCustomerPickerKey)}
                          onChange={(e) => updateDraft(primaryDraft.localId, {
                            customerId: '',
                            customerSearch: capitalizeFirstPreservingSpacing(e.target.value)
                          })}
                          className="hd-order-request-customer-search-input min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-semibold text-slate-900 outline-none placeholder:text-gray-400 focus:border-0 focus:ring-0"
                          placeholder="Chọn hoặc tìm khách hàng"
                        />
                        {primaryDraft.customerSearch && (
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              updateDraft(primaryDraft.localId, { customerId: '', customerSearch: '' });
                              setOpenDraftPicker(manualCustomerPickerKey);
                            }}
                            className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                            aria-label="Xóa tên khách đang tìm"
                          >
                            <X size={15} />
                          </button>
                        )}
                        {isManualCustomerPickerOpen ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
                      </div>
                      {isManualCustomerPickerOpen && (
                        <div className="mt-1.5 overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-lg" role="listbox" aria-label="Gợi ý khách hàng">
                          <div className="max-h-[min(40dvh,20rem)] space-y-0.5 overflow-y-auto p-1.5">
                            {manualFilteredCustomers.map(customer => {
                              const isSelectedCustomer = primaryDraft.customerId === customer.id;
                              return (
                                <button
                                  key={customer.id}
                                  type="button"
                                  onClick={() => {
                                    handleCustomerChange(primaryDraft.localId, customer.id);
                                    setOpenDraftPicker(null);
                                  }}
                                  aria-pressed={isSelectedCustomer}
                                  aria-selected={isSelectedCustomer}
                                  role="option"
                                  className={`flex w-full touch-manipulation items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors duration-200 ${isSelectedCustomer ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-transparent text-slate-900 hover:bg-slate-50'}`}
                                >
                                  <span className="min-w-0 flex-1">
                                    <span className={`block text-sm ${isSelectedCustomer ? 'font-black' : 'font-semibold'}`}>{customer.name}</span>
                                    <span className="mt-0.5 block truncate text-[11px] text-slate-500">{customer.phone || 'Chưa có số điện thoại'}{customer.address ? ` • ${customer.address}` : ''}</span>
                                  </span>
                                  {isSelectedCustomer && (
                                    <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                                      <Check size={14} strokeWidth={3} />
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                            {manualCustomerSearchKeyword && manualFilteredCustomers.length === 0 && (
                              <p className="px-2 py-2 text-[11px] text-amber-600">Không tìm thấy khách phù hợp với từ khóa này.</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {primarySelectedCustomer ? (
                      <div className="space-y-3">
                        {primaryCustomerBranches.length > 0 && (
                          <label className="block text-xs font-semibold text-slate-600">
                            Chi nhánh đặt hàng
                            <select
                              aria-label="Chi nhánh đặt hàng"
                              value={primaryDraft.branchId || ''}
                              onChange={event => handleBranchChange(primaryDraft.localId, event.target.value)}
                              className="mt-1 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900"
                            >
                              <option value="">Khách hàng chính</option>
                              {primaryCustomerBranches.map(branch => (
                                <option key={branch.id} value={branch.id}>{branch.name}</option>
                              ))}
                            </select>
                          </label>
                        )}
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <label className="block text-[11px] font-bold uppercase text-gray-500">SP khách lấy</label>
                            <p aria-live="polite" className="mt-1 text-[11px] font-semibold text-slate-400">
                              {pendingQuickProductSelectionKeys.size > 0
                                ? 'Đang cập nhật sản phẩm đã chọn...'
                                : `${selectedQuickVariantKeys.size} sản phẩm đã chọn`}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setQuickProductSearch('');
                              setOpenDraftPicker(prev => prev === manualExtraProductPickerKey ? null : manualExtraProductPickerKey);
                            }}
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-white shadow-sm transition ${isManualExtraProductPickerOpen ? 'border-red-200 bg-red-500' : 'border-emerald-200 bg-emerald-500 hover:bg-emerald-600'}`}
                            aria-label="Thêm sản phẩm khác"
                          >
                            {isManualExtraProductPickerOpen ? <X size={18} /> : <Plus size={20} strokeWidth={3} />}
                          </button>
                        </div>

                        {manualFixedProductVariantOptions.length > 0 ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {manualFixedProductGroups.map(({ product, variants }) => (
                              <OrderRequestSelectableProductGroup
                                key={product.id}
                                product={product}
                                variants={variants}
                                selectedQuickVariantKeys={selectedQuickVariantKeys}
                                pendingQuickProductSelectionKeys={pendingQuickProductSelectionKeys}
                                selectedItems={selectedQuickItems}
                                onQuantityChange={(itemId, quantity) => updateDraftItem(primaryDraft.localId, itemId, { quantity })}
                                onSelect={handleQuickProductCardSelect}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-center text-xs font-semibold text-slate-500">
                            Chưa có sản phẩm từ đơn trước.
                          </div>
                        )}

                        {isManualExtraProductPickerOpen && (
                          <div className="rounded-2xl border border-emerald-100 bg-white shadow-sm overflow-hidden">
                            <div className="p-3 border-b border-gray-100">
                              <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                                <Search size={14} className="text-emerald-600 shrink-0" />
                                <input
                                  data-hd-search-input="true"
                                  type="text"
                                  value={quickProductSearch}
                                  onChange={(e) => setQuickProductSearch(e.target.value)}
                                  className="w-full bg-transparent text-xs outline-none placeholder:text-gray-400"
                                  placeholder="Tìm sản phẩm cần thêm"
                                  autoFocus
                                />
                                {quickProductSearch && (
                                  <button type="button" onClick={() => setQuickProductSearch('')} className="text-slate-400 hover:text-slate-600">
                                    <X size={15} />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="max-h-56 overflow-y-auto p-2 space-y-1">
                              {manualExtraProductVariantGroups.map(({ product, variants }) => (
                                <OrderRequestSelectableProductGroup
                                  key={'extra-group:' + product.id}
                                  product={product}
                                  variants={variants}
                                  selectedQuickVariantKeys={selectedQuickVariantKeys}
                                  pendingQuickProductSelectionKeys={pendingQuickProductSelectionKeys}
                                  onSelect={handleQuickProductCardSelect}
                                />
                              ))}
                              {(manualProductSearch.pending||manualProductSearch.error) && <p role={manualProductSearch.error?'alert':'status'} className="px-2 py-3 text-center text-[11px] text-slate-600">{manualProductSearch.error?'Không thể chuẩn bị tìm kiếm. Hãy đóng rồi mở lại danh sách.':'Đang chuẩn bị tìm kiếm…'}</p>}
                              {!manualProductSearch.pending&&!manualProductSearch.error&&manualExtraProductVariantGroups.length === 0 && (
                                <p className="px-2 py-3 text-center text-[11px] text-amber-600">
                                  {quickProductSearchKeyword ? 'Không tìm thấy sản phẩm phù hợp.' : 'Không còn sản phẩm khác để thêm.'}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>

                  {requestError && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                      {requestError}
                    </div>
                  )}
                </div>
              )}

              {isOrderDetailStage && (
                <>
              <div className={`hd-modal-body min-h-0 flex-1 overflow-y-auto bg-slate-50 ${isCompactManualDetailStage ? 'space-y-2 px-2 pt-1.5 pb-3' : 'space-y-4 p-5'}`}>
                {orderVoiceStatus && (
                  <div role="status" className="flex items-start gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700">
                    <span className="min-w-0 flex-1">{orderVoiceStatus}</span>
                    <button
                      type="button"
                      onClick={() => setOrderVoiceStatus('')}
                      className="-mr-1 rounded-full p-1 text-sky-500 transition hover:bg-sky-100 hover:text-sky-700"
                      aria-label="Ẩn thông báo ghi âm đơn đặt hàng"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}

                {orderEntryMode === 'voice' && !isEditingRequest && (
                  <div className="rounded-2xl border border-sky-200 bg-white px-4 py-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] font-bold text-sky-600">Lên đơn bằng giọng nói</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Chọn đúng khách cần lên đơn rồi bấm <span className="font-bold text-sky-700">Ghi âm cả đơn</span>. AI sẽ tự tách khách hàng, nhiều mặt hàng, size, số lượng, đơn vị và giá cho từng loại.
                        </p>
                      </div>
                      <div className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1.5 text-[11px] font-bold text-sky-700">
                        Đang bật
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {requestDrafts.map((draft) => {
                    const selectedCustomer = customerLookup.get(draft.customerId) || null;
                    const customerBranches = selectedCustomer ? normalizeCustomerBranches(selectedCustomer, activeProducts) : [];
                    const selectedBranchRef = getOrderRequestBranchRef(selectedCustomer, draft);
                    const customerPickerKey = `customer:${draft.localId}`;
                    const isCustomerPickerOpen = openDraftPicker === customerPickerKey;
                    const customerSearchKeyword = normalizeLookupText(draft.customerSearch || '');
                    const filteredCustomers = !isCustomerPickerOpen ? [] : customerSearchKeyword
                      ? searchCustomerRecords(availableCustomers, draft.customerSearch || '')
                      : availableCustomers;
                    return (
                      <div key={draft.localId} className={`rounded-3xl border border-emerald-100 bg-white shadow-sm ${isCompactManualDetailStage ? 'overflow-hidden' : 'p-4 space-y-4'}`}>
                        {isCompactManualDetailStage ? (
                          <div className="border-b border-emerald-100 bg-emerald-50/70 px-3 py-2.5">
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-600">Họ tên khách</p>
                            <p className="mt-0.5 text-base font-black text-slate-900">{selectedCustomer?.name || 'Chưa chọn khách hàng'}</p>
                            {customerBranches.length > 0 && (
                              <select
                                value={draft.branchId || ''}
                                onChange={(e) => handleBranchChange(draft.localId, e.target.value)}
                                className="mt-2 h-9 w-full rounded-xl border border-sky-100 bg-white px-3 text-xs font-bold text-sky-700 outline-none focus:ring-2 focus:ring-sky-400"
                              >
                                <option value="">Chi nhánh lấy hàng</option>
                                {customerBranches.map((branch, branchIndex) => (
                                  <option key={branch.id || branchIndex} value={branch.id || ''}>
                                    {getCustomerBranchDisplayName(branch, branchIndex)}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        ) : (
                          <>
                        <div className="flex flex-wrap items-start justify-end gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {orderEntryMode === 'voice' && (
                              <button
                                type="button"
                                onClick={() => {
                                  const isCurrentVoiceTarget = orderVoiceTarget.draftLocalId === draft.localId && isOrderVoiceListening;
                                  if (isCurrentVoiceTarget) {
                                    stopOrderVoiceCapture();
                                    return;
                                  }
                                  handleStartOrderVoice(draft.localId);
                                }}
                                disabled={isOrderVoiceProcessing}
                                className={`rounded-full px-3 py-1.5 text-[11px] font-bold disabled:opacity-60 disabled:cursor-not-allowed ${
                                  orderVoiceTarget.draftLocalId === draft.localId && isOrderVoiceListening
                                    ? 'border border-red-200 bg-red-50 text-red-600'
                                    : 'border border-sky-200 bg-white text-sky-600 hover:bg-sky-50'
                                }`}
                              >
                                {isOrderVoiceProcessing && orderVoiceTarget.draftLocalId === draft.localId
                                  ? 'Đang xử lý...'
                                  : orderVoiceTarget.draftLocalId === draft.localId && isOrderVoiceListening
                                    ? 'Dừng nghe'
                                    : 'Ghi âm cả đơn'}
                              </button>
                            )}
                            {!isEditingRequest && requestDrafts.length > 1 && (
                              <button type="button" onClick={() => removeRequestDraft(draft.localId)} className="rounded-full border border-red-200 px-3 py-1.5 text-[11px] font-bold text-red-500 hover:bg-red-50">
                                Xóa khách
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2 relative">
                          <label className="block text-[11px] font-bold uppercase text-gray-500">Họ tên khách</label>
                          <button
                            type="button"
                            onClick={() => setOpenDraftPicker(prev => prev === customerPickerKey ? null : customerPickerKey)}
                            className="w-full border border-gray-200 bg-white rounded-xl px-3 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500 flex items-center justify-between gap-3 text-left"
                          >
                            <span className={selectedCustomer ? 'text-slate-900' : 'text-gray-400'}>
                              {selectedCustomer ? selectedCustomer.name : '-- Chọn khách hàng --'}
                            </span>
                            {isCustomerPickerOpen ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
                          </button>
                          {isCustomerPickerOpen && (
                            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-2xl border border-emerald-100 bg-white shadow-xl overflow-hidden">
                              <div className="p-3 border-b border-gray-100">
                                <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                                  <Search size={14} className="text-emerald-600 shrink-0" />
                                  <input
                                    data-hd-search-input="true"
                                    type="text"
                                    value={draft.customerSearch || ''}
                                    onChange={(e) => updateDraft(draft.localId, { customerSearch: capitalizeFirstPreservingSpacing(e.target.value) })}
                                    className="w-full bg-transparent text-xs outline-none placeholder:text-gray-400"
                                    placeholder="Tìm khách hàng trong danh sách"
                                  />
                                </div>
                              </div>
                              <div className="max-h-56 overflow-y-auto p-2 space-y-1">
                                {filteredCustomers.map(customer => (
                                  <button
                                    key={customer.id}
                                    type="button"
                                    onClick={() => {
                                      handleCustomerChange(draft.localId, customer.id);
                                      setOpenDraftPicker(null);
                                    }}
                                    className={`w-full rounded-xl px-3 py-2 text-left transition-colors ${draft.customerId === customer.id ? 'bg-emerald-50 border border-emerald-100' : 'hover:bg-slate-50 border border-transparent'}`}
                                  >
                                    <p className="text-sm font-semibold text-slate-900">{customer.name}</p>
                                    <p className="text-[11px] text-slate-500 mt-1">{customer.phone || 'Chưa có số điện thoại'}{customer.address ? ` • ${customer.address}` : ''}</p>
                                  </button>
                                ))}
                                {customerSearchKeyword && filteredCustomers.length === 0 && (
                                  <p className="px-2 py-2 text-[11px] text-amber-600">Không tìm thấy khách phù hợp với từ khóa này.</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {selectedCustomer && (
                          <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                            <p>{selectedCustomer.phone || 'Chưa có số điện thoại'}{selectedCustomer.address ? ` • ${selectedCustomer.address}` : ''}</p>
                            {customerBranches.length > 0 && (
                              <div className="space-y-1">
                                <label className="block text-[10px] font-black uppercase tracking-[0.14em] text-sky-600">Chi nhánh lấy hàng</label>
                                <select
                                  value={draft.branchId || ''}
                                  onChange={(e) => handleBranchChange(draft.localId, e.target.value)}
                                  className="h-10 w-full rounded-xl border border-sky-100 bg-white px-3 text-xs font-bold text-sky-700 outline-none focus:ring-2 focus:ring-sky-400"
                                >
                                  <option value="">Chọn chi nhánh</option>
                                  {customerBranches.map((branch, branchIndex) => (
                                    <option key={branch.id || branchIndex} value={branch.id || ''}>
                                      {getCustomerBranchDisplayName(branch, branchIndex)}
                                    </option>
                                  ))}
                                </select>
                                {selectedBranchRef.branchAddress && (
                                  <p className="text-[11px] font-semibold text-slate-500">Địa chỉ CN: {selectedBranchRef.branchAddress}</p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                          </>
                        )}

                        <div className={isCompactManualDetailStage ? 'bg-white overflow-hidden' : 'rounded-2xl border border-slate-300 bg-white overflow-hidden'}>
                          {!isCompactManualDetailStage && (
                          <div className="border-b border-slate-300 bg-slate-50 px-4 py-3 text-center">
                            <p className="text-lg font-black text-slate-900">
                              {selectedCustomer?.name || 'Khách hàng'}
                            </p>
                          </div>
                          )}

                          <div className={isCompactManualDetailStage ? 'overflow-visible' : 'overflow-x-auto'}>
                            <div className={isCompactManualDetailStage ? 'w-full min-w-0' : 'min-w-[780px]'}>
                              <div className={`grid ${isCompactManualDetailStage ? 'grid-cols-[minmax(0,1.75fr)_minmax(66px,0.6fr)_minmax(68px,0.62fr)] text-[10.5px]' : 'grid-cols-[minmax(260px,2.25fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(140px,1fr)_minmax(160px,1fr)] text-[13px]'} bg-slate-100 text-center font-black text-slate-900`}>
                                <div className={isCompactManualDetailStage ? 'border-r border-slate-300 px-1.5 py-2 leading-tight' : 'border-r border-slate-300 px-3 py-3'}>Loại hàng đặt</div>
                                <div className={isCompactManualDetailStage ? 'border-r border-slate-300 px-1.5 py-2 leading-tight' : 'border-r border-slate-300 px-3 py-3'}>Số lượng</div>
                                <div className={isCompactManualDetailStage ? 'px-1.5 py-2 leading-tight' : 'border-r border-slate-300 px-3 py-3'}>
                                  {isCompactManualDetailStage ? 'ĐVT đặt' : 'Đơn vị đặt'}
                                </div>
                                {!isCompactManualDetailStage && (
                                  <>
                                    <div className="border-r border-slate-300 px-3 py-3">Size</div>
                                    <div className="px-3 py-3">Đơn giá</div>
                                  </>
                                )}
                              </div>

                              <div className="space-y-0">
                          {(draft.items || []).map((item, itemIndex) => {
                            const selectedProduct = productLookup.get(item.productId) || null;
                            const shouldShowCompactPriceInput = isCompactManualDetailStage
                              && selectedProduct
                              && !hasCustomerProductPrice(selectedCustomer, selectedProduct.id);
                            const productPickerKey = `product:${draft.localId}:${item.localItemId}`;
                            const isProductPickerOpen = openDraftPicker === productPickerKey;
                            const productSearchKeyword = normalizeLookupText(item.productSearch || '');
                            const productConfigSource = getCustomerBranchProductConfigSource(
                              selectedCustomer,
                              draft.branchId || '',
                              activeProducts
                            );
                            const branchFixedProductIds = isProductPickerOpen && selectedCustomer
                              ? draft.branchId
                                ? getCustomerBranchFixedProductIds(selectedCustomer, draft.branchId, activeProducts)
                                : getCustomerFixedProductIds(selectedCustomer, activeProducts)
                              : [];
                            const branchScopedProducts = isProductPickerOpen && selectedCustomer
                              ? activeProducts.filter(product => branchFixedProductIds.includes(product.id))
                              : [];
                            const branchScopedProductVariants = branchScopedProducts.flatMap(product => (
                              getCustomerProductVariants(productConfigSource, product).map(variant => ({
                                product,
                                variant,
                                key: buildOrderRequestVariantKey(product.id, variant),
                              }))
                            ));
                            const matchingProducts = isProductPickerOpen && productSearchKeyword
                              ? new Set(manualProductSearchIndex?.search(productSearchKeyword)||[])
                              : null;
                            const filteredProductVariants = productSearchKeyword
                              ? branchScopedProductVariants.filter(({ product, variant }) => (
                                  matchingProducts.has(product)
                                  || [variant.size, variant.attributeLabel, variant.unit]
                                    .some(value => normalizeLookupText(value || '').includes(productSearchKeyword))
                                ))
                              : branchScopedProductVariants;
                            const selectedConfiguration = selectedProduct
                              ? resolveCustomerProductBillingConfiguration(productConfigSource, selectedProduct, {
                                  configurationId: item.configurationId || '',
                                  sizeLabel: item.weightKg || item.sizeLabel || '',
                                  attributeLabel: item.attributeLabel || '',
                                })
                              : null;
                            const hasFrozenItemConfiguration = Boolean(item.previousOrder || item.billingSnapshotVersion || item.billingSnapshotSource);
                            const fixedAttributeLabel = `${hasFrozenItemConfiguration
                              ? (item.attributeLabel || '')
                              : (item.attributeLabel || selectedConfiguration?.attributeLabel || '')}`.trim();
                            const fixedSizeLabel = `${hasFrozenItemConfiguration
                              ? (item.sizeLabel || item.weightKg || '')
                              : (selectedConfiguration?.sizeLabel || item.sizeLabel || item.weightKg || '')}`.trim();
                            const hasFixedAttribute = Boolean(fixedAttributeLabel);
                            const attributePickerKey = `attribute:${draft.localId}:${item.localItemId}`;
                            const isAttributePickerOpen = openDraftPicker === attributePickerKey;
                            const attributeVariantOptions = selectedProduct
                              ? getOrderRequestAttributeOptions(
                                getProductAttributes(selectedProduct),
                                getCustomerProductVariants(productConfigSource, selectedProduct),
                                resolveCustomerProductBillingConfiguration(productConfigSource, selectedProduct),
                                fixedSizeLabel
                              )
                              : [];
                            const hasAttributeSelection = attributeVariantOptions.length > 0;
                            const itemUnitOptions = getDraftItemUnitOptions(draft, item);
                            const selectedOrderUnit = itemUnitOptions.find(unit => isSameBillingUnit(unit, item.quantityUnit || item.actualUnit))
                              || itemUnitOptions[0]
                              || '';
                            const selectedPricingUnit = normalizeProductPricingUnit(
                              item.billingUnit || item.pricingUnit || selectedConfiguration?.billingUnit || ''
                            );

                            return (
                              <div key={item.localItemId} className="border-t border-slate-300 bg-white">
                                <div className={`grid ${isCompactManualDetailStage ? 'grid-cols-[minmax(0,1.75fr)_minmax(66px,0.6fr)_minmax(68px,0.62fr)]' : 'grid-cols-[minmax(260px,2.25fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(140px,1fr)_minmax(160px,1fr)]'}`}>
                                  <div className={isCompactManualDetailStage ? 'relative min-w-0 border-r border-slate-200 p-1' : 'relative border-r border-slate-200 p-2'}>
                                    <div className={(hasFixedAttribute || hasAttributeSelection) ? `grid items-stretch ${isCompactManualDetailStage ? 'grid-cols-[minmax(0,1fr)_minmax(62px,0.62fr)] gap-1.5' : 'grid-cols-[minmax(0,1fr)_minmax(118px,0.72fr)] gap-2'}` : ''}>
                                      <button
                                        type="button"
                                        onClick={() => setOpenDraftPicker(prev => prev === productPickerKey ? null : productPickerKey)}
                                        className={`flex w-full min-w-0 items-center justify-between rounded-xl border border-gray-200 bg-white text-left font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${isCompactManualDetailStage ? 'min-h-[42px] gap-1 px-2 py-1.5 text-xs' : 'min-h-[52px] gap-3 px-3 py-3 text-sm'}`}
                                      >
                                        <span className={`${selectedProduct ? 'text-slate-900' : 'text-gray-400'} min-w-0 truncate`}>
                                          {selectedProduct
                                            ? getCompactProductName(selectedProduct, selectedProduct.name)
                                            : '-- Chọn sp --'}
                                        </span>
                                        {isProductPickerOpen ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
                                      </button>
                                    {(hasFixedAttribute || hasAttributeSelection) && (
                                      <button
                                        type="button"
                                        onClick={() => hasAttributeSelection && setOpenDraftPicker(previous => previous === attributePickerKey ? null : attributePickerKey)}
                                        disabled={!hasAttributeSelection}
                                        className={`flex w-full min-w-0 items-center justify-center gap-1 rounded-xl border border-sky-100 bg-sky-50 text-center text-sky-800 outline-none focus:ring-2 focus:ring-sky-400 disabled:cursor-default ${isCompactManualDetailStage ? 'h-[42px] px-1 text-[10px] font-black' : 'h-[52px] px-2 text-xs font-bold'}`}
                                        title={hasAttributeSelection ? 'Chọn thuộc tính sản phẩm' : 'Thuộc tính theo cấu hình sản phẩm'}
                                        aria-label="Chọn thuộc tính sản phẩm"
                                      >
                                        <span className="min-w-0 truncate">{fixedAttributeLabel || 'Thuộc tính'}</span>
                                        {hasAttributeSelection && (isAttributePickerOpen
                                          ? <ChevronUp size={12} className="shrink-0" />
                                          : <ChevronDown size={12} className="shrink-0" />)}
                                      </button>
                                    )}
                                    </div>
                                    {isAttributePickerOpen && hasAttributeSelection && (
                                      <div className="absolute right-1 top-[calc(100%+6px)] z-30 min-w-36 overflow-hidden rounded-2xl border border-sky-100 bg-white p-2 shadow-xl">
                                        <p className="px-2 pb-1 text-[10px] font-black uppercase tracking-wide text-sky-600">Thuộc tính</p>
                                        {attributeVariantOptions.map((variant) => {
                                          const isSelectedAttribute = normalizeLookupText(variant.attributeLabel) === normalizeLookupText(fixedAttributeLabel);
                                          return (
                                            <button
                                              key={`${selectedProduct.id}_${variant.id || variant.attributeLabel}`}
                                              type="button"
                                              onClick={() => {
                                                handleProductChange(draft.localId, item.localItemId, selectedProduct.id, variant);
                                                setOpenDraftPicker(null);
                                              }}
                                              className={`w-full rounded-xl px-3 py-2 text-left text-xs font-bold transition-colors ${isSelectedAttribute ? 'bg-sky-50 text-sky-700' : 'text-slate-700 hover:bg-slate-50'}`}
                                            >
                                              {variant.attributeLabel}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                    {isProductPickerOpen && (
                                      <div className="absolute left-2 right-2 top-[calc(100%+6px)] z-20 rounded-2xl border border-emerald-100 bg-white shadow-xl overflow-hidden">
                                        <div className="p-3 border-b border-gray-100">
                                          <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                                            <Search size={14} className="text-emerald-600 shrink-0" />
                                            <input
                                              data-hd-search-input="true"
                                              type="text"
                                              value={item.productSearch || ''}
                                              onChange={(e) => updateDraftItem(draft.localId, item.localItemId, { productSearch: capitalizeFirstPreservingSpacing(e.target.value) })}
                                              className="w-full bg-transparent text-xs outline-none placeholder:text-gray-400"
                                              placeholder="Tìm sản phẩm trong danh mục"
                                            />
                                          </div>
                                        </div>
                                        <div className="max-h-56 overflow-y-auto p-2 space-y-1">
                                          {selectedCustomer && (
                                            <p className="px-2 py-1 text-[10px] font-bold text-emerald-600">
                                              Đang lọc theo sản phẩm cố định của chi nhánh.
                                            </p>
                                          )}
                                          {filteredProductVariants.map(({ product, variant, key }) => {
                                            const configuredOption = resolveCustomerProductBillingConfiguration(productConfigSource, product, {
                                              variant,
                                              variantId: variant.id || '',
                                              sizeLabel: variant.size || '',
                                              attributeLabel: variant.attributeLabel || '',
                                            });
                                            const variantLabel = [
                                              configuredOption.sizeLabel ? `Size ${configuredOption.sizeLabel}` : '',
                                              configuredOption.attributeLabel,
                                              configuredOption.billingUnit,
                                            ].filter(Boolean).join(' • ');
                                            const selectedVariantKey = buildOrderRequestVariantKey(product.id, {
                                              attributeLabel: configuredOption.attributeLabel,
                                              size: configuredOption.sizeLabel,
                                              unit: configuredOption.billingUnit,
                                              price: configuredOption.unitPrice,
                                            });
                                            const isSelectedVariant = getDraftItemVariantKey(item) === selectedVariantKey;
                                            return (
                                            <button
                                              key={key}
                                              type="button"
                                              onClick={() => {
                                                handleProductChange(draft.localId, item.localItemId, product.id, variant);
                                                setOpenDraftPicker(null);
                                              }}
                                              className={`w-full rounded-xl px-3 py-2 text-left transition-colors ${isSelectedVariant ? 'bg-emerald-50 border border-emerald-100' : 'hover:bg-slate-50 border border-transparent'}`}
                                            >
                                              <p className="text-sm font-semibold text-slate-900">
                                                {getProductShortName(product) ? `${getProductShortName(product)} - ${product.name}` : product.name}
                                              </p>
                                              <p className="text-[11px] text-slate-500 mt-1">
                                                {product.category || 'Chưa có nhóm'}
                                                {!isCompactManualDetailStage && `${variantLabel ? ` • ${variantLabel}` : ''} • ${formatCurrency(configuredOption.unitPrice)} đồng`}
                                              </p>
                                            </button>
                                            );
                                          })}
                                          {isProductPickerOpen&&(manualProductSearch.pending||manualProductSearch.error)&&<p role={manualProductSearch.error?'alert':'status'} className="px-2 py-2 text-[11px] text-slate-600">{manualProductSearch.error?'Không thể chuẩn bị tìm kiếm.':'Đang chuẩn bị tìm kiếm…'}</p>}
                                          {!manualProductSearch.pending&&!manualProductSearch.error&&productSearchKeyword && filteredProductVariants.length === 0 && (
                                            <p className="px-2 py-2 text-[11px] text-amber-600">Không tìm thấy sản phẩm phù hợp với từ khóa này.</p>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  <div className={isCompactManualDetailStage ? 'border-r border-slate-200 p-1' : 'border-r border-slate-200 p-2'}>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={item.quantity}
                                      onChange={(e) => updateDraftItem(draft.localId, item.localItemId, { quantity: e.target.value })}
                                      className={`w-full rounded-xl border border-gray-200 bg-white text-center outline-none focus:ring-2 focus:ring-emerald-500 ${isCompactManualDetailStage ? 'h-[42px] px-1.5 text-xs' : 'h-[52px] px-3 text-sm'}`}
                                      placeholder="Số lượng"
                                    />
                                  </div>

                                  <div className={isCompactManualDetailStage ? 'p-1' : 'border-r border-slate-200 p-2'}>
                                    <button
                                      type="button"
                                      onClick={() => openDraftItemUnitEditor(draft, item)}
                                      disabled={!selectedProduct}
                                      className={`flex w-full items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 text-center font-black text-emerald-700 outline-none transition-colors hover:bg-emerald-100 focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 ${isCompactManualDetailStage ? 'h-[42px] px-1 text-xs' : 'h-[52px] px-2 text-sm'}`}
                                      aria-label={`Sửa đơn vị đặt hàng; tính giá theo ${selectedPricingUnit || 'chưa cấu hình'}`}
                                      title={selectedPricingUnit ? `Bấm để sửa đơn vị đặt. Đơn giá vẫn tính theo ${selectedPricingUnit}.` : 'Bấm để sửa đơn vị đặt'}
                                    >
                                      <span className="min-w-0 truncate">{selectedProduct ? selectedOrderUnit : '--'}</span>
                                      {selectedProduct && <Edit3 size={isCompactManualDetailStage ? 11 : 14} className="shrink-0" aria-hidden="true" />}
                                    </button>
                                  </div>

                                  {!isCompactManualDetailStage && (
                                    <>
                                      <div className="border-r border-slate-200 p-2">
                                        <input
                                          type="text"
                                          value={fixedSizeLabel}
                                          readOnly
                                          className="h-[52px] w-full cursor-default rounded-xl border border-sky-100 bg-sky-50 px-3 text-center text-sm font-semibold text-sky-800 outline-none"
                                          placeholder="Theo cấu hình"
                                        />
                                      </div>

                                      <div className="p-2">
                                        <input
                                          type="tel"
                                          value={formatInputCurrency(item.unitPrice)}
                                          readOnly
                                          className="h-[52px] w-full cursor-default rounded-xl border border-emerald-100 bg-emerald-50 px-3 text-center text-sm font-semibold text-emerald-800 outline-none"
                                          placeholder="0 đ"
                                        />
                                      </div>
                                    </>
                                  )}
                                </div>

                                {shouldShowCompactPriceInput && (
                                  <div className="border-t border-amber-100 bg-amber-50/70 px-2 py-2">
                                    <p className="mt-1 text-[10px] font-semibold text-amber-700">
                                      Chưa cấu hình đơn giá. Hãy cập nhật sản phẩm cố định trong hồ sơ khách hàng.
                                    </p>
                                  </div>
                                )}

                                {!isCompactManualDetailStage && (
                                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2">
                                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Mặt hàng {itemIndex + 1}</p>
                                  <div className="flex flex-wrap items-center gap-2">
                                    {false && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const isCurrentVoiceTarget = orderVoiceTarget.draftLocalId === draft.localId && orderVoiceTarget.itemLocalId === item.localItemId;
                                        if (isCurrentVoiceTarget && isOrderVoiceListening) {
                                          stopOrderVoiceCapture();
                                          return;
                                        }
                                        handleStartOrderVoice(draft.localId, item.localItemId);
                                      }}
                                      disabled={isOrderVoiceProcessing}
                                      className={`rounded-full px-3 py-1.5 text-[11px] font-bold disabled:opacity-60 disabled:cursor-not-allowed ${
                                        orderVoiceTarget.draftLocalId === draft.localId && orderVoiceTarget.itemLocalId === item.localItemId && isOrderVoiceListening
                                          ? 'border border-red-200 bg-red-50 text-red-600'
                                          : 'border border-sky-200 bg-white text-sky-600 hover:bg-sky-50'
                                      }`}
                                    >
                                      {isOrderVoiceProcessing && orderVoiceTarget.draftLocalId === draft.localId && orderVoiceTarget.itemLocalId === item.localItemId
                                        ? 'Đang xử lý...'
                                        : orderVoiceTarget.draftLocalId === draft.localId && orderVoiceTarget.itemLocalId === item.localItemId && isOrderVoiceListening
                                          ? 'Dừng nghe'
                                          : 'Giọng nói'}
                                    </button>
                                    )}
                                    <button type="button" onClick={() => duplicateDraftItem(draft.localId, item.localItemId)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50">
                                      Nhân hàng
                                    </button>
                                    {(draft.items || []).length > 1 && (
                                      <button type="button" onClick={() => removeDraftItem(draft.localId, item.localItemId)} className="rounded-full border border-red-200 bg-white px-3 py-1.5 text-[11px] font-bold text-red-500 hover:bg-red-50">
                                        Xóa hàng
                                      </button>
                                    )}
                                  </div>
                                </div>
                                )}

                              </div>
                            );
                          })}

                              </div>
                            </div>
                          </div>

                          {!isCompactManualDetailStage && (
                          <button type="button" onClick={() => addDraftItem(draft.localId)} className="w-full rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-600 hover:bg-emerald-100">
                            + Thêm mặt hàng cho khách này
                          </button>
                          )}
                        </div>

                        <div className={isCompactManualDetailStage ? 'grid grid-cols-[minmax(0,1fr)_minmax(118px,0.72fr)] gap-2 border-t border-slate-200 bg-white px-3 py-2.5' : 'grid grid-cols-[minmax(0,1fr)_minmax(150px,0.35fr)] gap-3'}>
                          <div className="space-y-2">
                            <label className="block text-[11px] font-bold uppercase text-gray-500">{isCompactManualDetailStage ? 'Ghi chú' : 'Ghi chú chung'}</label>
                            <input
                              type="text"
                              value={draft.note}
                              onChange={(e) => updateDraft(draft.localId, { note: capitalizeFirstPreservingSpacing(e.target.value) })}
                              className={`w-full border border-gray-200 bg-white rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500 ${isCompactManualDetailStage ? 'py-2.5' : 'py-3'}`}
                              placeholder="Ghi chú nếu cần"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="block text-[11px] font-bold uppercase text-gray-500">Tiền cọc trước</label>
                            <input
                              type="tel"
                              inputMode="numeric"
                              value={formatInputCurrency(draft.upfrontPayment)}
                              onChange={(e) => updateDraft(draft.localId, { upfrontPayment: parseInputCurrency(e.target.value) })}
                              className={`w-full border border-orange-200 bg-orange-50 rounded-xl px-3 text-sm font-bold text-orange-700 outline-none focus:ring-2 focus:ring-orange-400 ${isCompactManualDetailStage ? 'py-2.5' : 'py-3'}`}
                              placeholder="0 đ"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div
                className={`hd-modal-actions shrink-0 border-t border-slate-200 bg-white space-y-3 ${
                  isCompactManualDetailStage
                    ? 'relative z-[130] rounded-t-3xl px-3 py-2 pb-2 shadow-[0_-18px_36px_rgba(15,23,42,0.16)]'
                    : 'p-4 pb-[calc(env(safe-area-inset-bottom)+28px)]'
                }`}
              >
                {!isCompactManualDetailStage && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Khách</p>
                    <p className="text-sm font-black text-slate-900">{requestPreview.totalCustomers}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Dòng hàng</p>
                    <p className="text-sm font-black text-slate-900">{requestPreview.totalLines}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Có size</p>
                    <p className="text-sm font-black text-slate-900">{requestPreview.totalSizedLines}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Số lượng</p>
                    <p className="text-sm font-black text-slate-900">{formatNumber(requestPreview.totalQuantity)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Tổng giá trị</p>
                    <p className="text-sm font-black text-emerald-600">{formatCurrency(requestPreview.totalAmount)} đ</p>
                  </div>
                </div>
                )}

                {requestError && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                    {requestError}
                  </div>
                )}

                <div className="flex gap-3">
                  <button type="button" onClick={closeOrderRequestForm} disabled={isRequestSubmitting} className={`flex-1 rounded-xl bg-gray-100 px-4 font-bold text-gray-700 disabled:cursor-not-allowed disabled:opacity-60 ${isCompactManualDetailStage ? 'py-2.5' : 'py-3'}`}>Hủy</button>
                  <button type="submit" disabled={isRequestSubmitting} aria-busy={isRequestSubmitting} className={`flex-1 rounded-xl bg-emerald-500 px-4 font-bold text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60 ${isCompactManualDetailStage ? 'py-2.5' : 'py-3'}`}>
                    <span className="inline-flex items-center justify-center gap-2">
                      {isRequestSubmitting && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                      {isRequestSubmitting
                        ? 'Đang lưu...'
                        : (isCompactManualDetailStage ? 'Lưu đơn' : isEditingRequest ? 'Lưu thay đổi' : `Lưu ${requestPreview.totalCustomers || requestDrafts.length} đơn`)}
                    </span>
                  </button>
                </div>
              </div>
                </>
              )}

              {!isOrderDetailStage && (
                <div className={`hd-order-request-modal-actions hd-modal-actions relative z-[122] shrink-0 border-t border-slate-200 bg-white ${isManualSetupStage ? 'px-3 pb-2 pt-2' : 'p-4 space-y-3 pb-4'}`}>
                  <div className="flex gap-3">
                    <button type="button" onClick={closeOrderRequestForm} disabled={isRequestSubmitting} className="flex-1 rounded-xl bg-gray-100 px-4 py-3 font-bold text-gray-700 disabled:cursor-not-allowed disabled:opacity-60">Hủy</button>
                    {isManualSetupStage && (
                      <button type="button" onClick={continueManualOrderEntry} disabled={isRequestSubmitting} className="flex-1 rounded-xl bg-emerald-500 px-4 py-2.5 font-bold text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60">
                        Tiếp tục
                      </button>
                    )}
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {orderUnitEditor && (
        <div className="fixed inset-0 z-[190] flex items-end justify-center bg-slate-950/55 p-3 sm:items-center" role="presentation">
          <form
            onSubmit={saveDraftItemUnitEditor}
            className="w-full max-w-sm rounded-[26px] border border-emerald-100 bg-white p-4 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-unit-editor-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600">Sản phẩm</p>
                <h3 id="order-unit-editor-title" className="mt-1 truncate text-lg font-black text-slate-950">{orderUnitEditor.productName}</h3>
              </div>
              <button type="button" onClick={() => setOrderUnitEditor(null)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500" aria-label="Đóng bảng sửa đơn vị">
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOrderUnitEditor(previous => ({ ...previous, activeTarget: 'pricingUnit', error: '' }))}
                className={`rounded-2xl border px-3 py-2.5 text-left transition-colors ${orderUnitEditor.activeTarget === 'pricingUnit' ? 'border-emerald-500 bg-emerald-50' : 'border-transparent bg-slate-50'}`}
                aria-pressed={orderUnitEditor.activeTarget === 'pricingUnit'}
              >
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">ĐVT giá</p>
                <p className="mt-1 text-sm font-black text-slate-900">{orderUnitEditor.pricingUnit || '-'}</p>
              </button>
              <button
                type="button"
                onClick={() => setOrderUnitEditor(previous => ({ ...previous, activeTarget: 'orderUnit', error: '' }))}
                className={`rounded-2xl border px-3 py-2.5 text-left transition-colors ${orderUnitEditor.activeTarget === 'orderUnit' ? 'border-emerald-500 bg-emerald-50' : 'border-transparent bg-slate-50'}`}
                aria-pressed={orderUnitEditor.activeTarget === 'orderUnit'}
              >
                <p className="text-[10px] font-black uppercase tracking-wide text-emerald-600">ĐV đặt</p>
                <p className="mt-1 text-sm font-black text-emerald-800">{orderUnitEditor.orderUnit || '-'}</p>
              </button>
            </div>

            <div className="mt-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Chọn {orderUnitEditor.activeTarget === 'pricingUnit' ? 'ĐVT giá' : 'ĐV đặt'}
              </p>
              <div className="mt-2 grid grid-cols-[repeat(4,minmax(0,1fr))_40px] gap-1.5">
                {standardOrderUnitOptions.map(unit => {
                  const selectedValue = orderUnitEditor.activeTarget === 'pricingUnit'
                    ? orderUnitEditor.pricingUnit
                    : orderUnitEditor.orderUnit;
                  const isSelected = isSameBillingUnit(unit, selectedValue);
                  return (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => selectOrderUnitEditorValue(unit)}
                      className={`min-h-10 rounded-xl border px-1 py-2 text-[11px] font-black transition-colors ${isSelected ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50'}`}
                      aria-pressed={isSelected}
                    >
                      {unit}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setOrderUnitEditor(previous => ({ ...previous, showCustomUnitInput: !previous.showCustomUnitInput, customUnit: '', error: '' }))}
                  className={`flex min-h-10 items-center justify-center rounded-xl border text-slate-600 transition-colors ${orderUnitEditor.showCustomUnitInput ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50'}`}
                  aria-label="Tạo thêm đơn vị mới"
                  aria-expanded={orderUnitEditor.showCustomUnitInput}
                >
                  <Plus size={17} aria-hidden="true" />
                </button>
              </div>

              {orderUnitEditor.showCustomUnitInput && (
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <input
                    type="text"
                    value={orderUnitEditor.customUnit || ''}
                    onChange={(event) => setOrderUnitEditor(previous => ({ ...previous, customUnit: capitalizeFirstPreservingSpacing(event.target.value), error: '' }))}
                    className="min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-emerald-400"
                    placeholder="Tên đơn vị mới"
                    autoFocus
                  />
                  <button type="button" onClick={addCustomOrderUnitEditorValue} className="min-h-10 rounded-xl bg-emerald-50 px-3 text-xs font-black text-emerald-700">
                    Dùng
                  </button>
                </div>
              )}
            </div>

            {orderUnitEditor.error && (
              <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600">{orderUnitEditor.error}</p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2 pb-[env(safe-area-inset-bottom)]">
              <button type="button" onClick={() => setOrderUnitEditor(null)} className="min-h-12 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700">Hủy</button>
              <button type="submit" className="min-h-12 rounded-2xl bg-emerald-500 px-4 text-sm font-black text-white shadow-lg shadow-emerald-500/20">Lưu ĐVT</button>
            </div>
          </form>
        </div>
      )}

      {false && showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-[28px] shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
            <h3 className="font-bold text-lg mb-4">Tạo Khoản Chi</h3>
                <p className="text-xs font-bold uppercase text-amber-700 mb-1">Cảnh báo trùng số điện thoại</p>
              </div>
              <button type="button" onClick={closeOrderRequestForm} className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitOrderRequests} className="max-h-[82vh] overflow-y-auto p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                <p className="text-xs font-bold uppercase text-amber-700 mb-1">Cảnh báo trùng số điện thoại</p>
                <p className="text-sm text-gray-500 mt-2">Thông tin gói sử dụng và thanh toán sẽ được cập nhật tại đây.</p>
                </div>
                <button type="button" onClick={() => addRequestDraft()} className="text-xs font-bold text-emerald-600 hover:text-emerald-700">
                  + Them khach
                </button>
              </div>

              <div className="space-y-3">
                {requestDrafts.map((draft, index) => {
                  const selectedCustomer = customerLookup.get(draft.customerId) || null;
                  const selectedProduct = productLookup.get(draft.productId) || null;
                  const customerPickerKey = `customer:${draft.localId}`;
                  const productPickerKey = `product:${draft.localId}`;
                  const isCustomerPickerOpen = openDraftPicker === customerPickerKey;
                  const isProductPickerOpen = openDraftPicker === productPickerKey;
                  const customerSearchKeyword = normalizeLookupText(draft.customerSearch || '');
                  const filteredCustomers = !isCustomerPickerOpen ? [] : customerSearchKeyword
                    ? searchCustomerRecords(availableCustomers, draft.customerSearch || '')
                    : availableCustomers;
                  const productSearchKeyword = normalizeLookupText(draft.productSearch || '');
                  const matchingProducts = isProductPickerOpen && productSearchKeyword
                    ? new Set(manualProductSearchIndex?.search(productSearchKeyword)||[])
                    : null;
                  const filteredProducts = !isProductPickerOpen ? [] : productSearchKeyword
                    ? activeProducts.filter(product => matchingProducts.has(product))
                    : activeProducts;
                  return (
                    <div key={draft.localId} className="rounded-2xl border border-gray-200 bg-slate-50 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-bold text-slate-900">Khach {index + 1}</p>
                        <div className="flex items-center gap-3">
                          <button type="button" onClick={() => duplicateRequestDraft(draft.localId)} className="text-xs font-bold text-emerald-600 hover:text-emerald-700">
                            Nhan dong
                          </button>
                          {requestDrafts.length > 1 && (
                            <button type="button" onClick={() => removeRequestDraft(draft.localId)} className="text-xs font-bold text-red-500 hover:text-red-600">
                              Xoa dong
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2 relative">
                <label className="block text-xs font-bold text-gray-500 mb-1">Ho ten khach</label>
                          <button
                            type="button"
                            onClick={() => setOpenDraftPicker(prev => prev === customerPickerKey ? null : customerPickerKey)}
                            className="w-full border border-gray-200 bg-white rounded-xl px-3 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500 flex items-center justify-between gap-3 text-left"
                          >
                            <span className={selectedCustomer ? 'text-slate-900' : 'text-gray-400'}>
                              {selectedCustomer ? selectedCustomer.name : '-- Chon khach hang --'}
                            </span>
                            {isCustomerPickerOpen ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
                          </button>
                          {isCustomerPickerOpen && (
                            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 rounded-2xl border border-emerald-100 bg-white shadow-xl overflow-hidden">
                              <div className="p-3 border-b border-gray-100">
                                <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                                  <Search size={14} className="text-emerald-600 shrink-0" />
                                  <input
                                    data-hd-search-input="true"
                                    type="text"
                                    value={draft.customerSearch || ''}
                                    onChange={(e) => updateDraft(draft.localId, { customerSearch: capitalizeFirstPreservingSpacing(e.target.value) })}
                                    className="w-full bg-transparent text-xs outline-none placeholder:text-gray-400"
                                    placeholder="Tim khach hang"
                                  />
                                </div>
                              </div>
                              <div className="max-h-56 overflow-y-auto p-2 space-y-1">
                                {filteredCustomers.map(customer => (
                                  <button
                                    key={customer.id}
                                    type="button"
                                    onClick={() => {
                                      handleCustomerChange(draft.localId, customer.id);
                                      setOpenDraftPicker(null);
                                    }}
                                    className={`w-full rounded-xl px-3 py-2 text-left transition-colors ${draft.customerId === customer.id ? 'bg-emerald-50 border border-emerald-100' : 'hover:bg-slate-50 border border-transparent'}`}
                                  >
                                    <p className="text-sm font-semibold text-slate-900">{customer.name}</p>
                                    <p className="text-[11px] text-slate-500 mt-1">{customer.phone || 'Chua co so dien thoai'}{customer.address ? ` ? ${customer.address}` : ''}</p>
                                  </button>
                                ))}
                                {customerSearchKeyword && filteredCustomers.length === 0 && (
                                  <p className="px-3 py-2 text-xs text-slate-500">Khong tim thay khach hang phu hop.</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2 relative">
                <label className="block text-xs font-bold text-gray-500 mb-1">Ten hang</label>
                          <button
                            type="button"
                            onClick={() => setOpenDraftPicker(prev => prev === productPickerKey ? null : productPickerKey)}
                            className="w-full border border-gray-200 bg-white rounded-xl px-3 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500 flex items-center justify-between gap-3 text-left"
                          >
                            <span className={selectedProduct ? 'text-slate-900' : 'text-gray-400'}>
                              {selectedProduct ? `${getCompactProductName(selectedProduct, selectedProduct.name)} - ${formatCurrency(selectedProduct.sellingPrice || 0)} ?` : '-- Chon sp --'}
                            </span>
                            {isProductPickerOpen ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
                          </button>
                          {isProductPickerOpen && (
                            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 rounded-2xl border border-emerald-100 bg-white shadow-xl overflow-hidden">
                              <div className="p-3 border-b border-gray-100">
                                <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                                  <Search size={14} className="text-emerald-600 shrink-0" />
                                  <input
                                    data-hd-search-input="true"
                                    type="text"
                                    value={draft.productSearch || ''}
                                    onChange={(e) => updateDraft(draft.localId, { productSearch: capitalizeFirstPreservingSpacing(e.target.value) })}
                                    className="w-full bg-transparent text-xs outline-none placeholder:text-gray-400"
                                    placeholder="Tim san pham"
                                  />
                                </div>
                              </div>
                              <div className="max-h-56 overflow-y-auto p-2 space-y-1">
                                {filteredProducts.map(product => (
                                  <button
                                    key={product.id}
                                    type="button"
                                    onClick={() => {
                                      handleProductChange(draft.localId, product.id);
                                      setOpenDraftPicker(null);
                                    }}
                                    className={`w-full rounded-xl px-3 py-2 text-left transition-colors ${draft.productId === product.id ? 'bg-emerald-50 border border-emerald-100' : 'hover:bg-slate-50 border border-transparent'}`}
                                  >
                                    <p className="text-sm font-semibold text-slate-900">
                                      {getProductShortName(product) ? `${getProductShortName(product)} - ${product.name}` : product.name}
                                    </p>
                                    <p className="text-[11px] text-slate-500 mt-1">{product.category || 'Chua co nhom'} ? {formatCurrency(product.sellingPrice || 0)} ?</p>
                                  </button>
                                ))}
                                {isProductPickerOpen&&(manualProductSearch.pending||manualProductSearch.error)&&<p role={manualProductSearch.error?'alert':'status'} className="px-2 py-2 text-[11px] text-slate-600">{manualProductSearch.error?'Không thể chuẩn bị tìm kiếm.':'Đang chuẩn bị tìm kiếm…'}</p>}
                                {!manualProductSearch.pending&&!manualProductSearch.error&&productSearchKeyword && filteredProducts.length === 0 && (
                                  <p className="px-3 py-2 text-xs text-slate-500">Khong tim thay san pham phu hop.</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {(selectedCustomer || selectedProduct) && (
                        <div className="rounded-2xl border border-white bg-white px-3 py-3 text-xs text-slate-600">
                          {selectedCustomer && (
                            <p>{selectedCustomer.phone || 'Chua co so dien thoai'}{selectedCustomer.address ? ` ? ${selectedCustomer.address}` : ''}</p>
                          )}
                          {selectedProduct && (
                            <p className="mt-1">Gia danh muc: <span className="font-bold text-emerald-600">{formatCurrency(selectedProduct.sellingPrice || 0)} ?</span></p>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-500 mb-1">Size</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={draft.weightKg}
                            onChange={(e) => updateDraft(draft.localId, { weightKg: e.target.value })}
                            className="w-full border border-gray-200 bg-white rounded-xl px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                            placeholder="Kg"
                          />
                        </div>
                        <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-500 mb-1">So luong dat</label>
                          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-stretch gap-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={draft.quantity}
                              onChange={(e) => updateDraft(draft.localId, { quantity: e.target.value })}
                              className="h-[52px] w-full border border-gray-200 bg-white rounded-xl px-3 text-center text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                              placeholder="So luong"
                            />
                            <select
                              value={draft.quantityUnit || ''}
                              onChange={(e) => updateDraft(draft.localId, { quantityUnit: e.target.value })}
                              className="h-[52px] w-full border border-gray-200 bg-white rounded-xl px-3 text-center text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                              <option value="">Don vi</option>
                              {quantityUnitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="hidden">
                <label className="block text-xs font-bold text-gray-500 mb-1">Don gia</label>
                          <input
                            type="tel"
                            value={formatInputCurrency(draft.unitPrice)}
                            onChange={(e) => updateDraft(draft.localId, { unitPrice: parseInputCurrency(e.target.value) })}
                            className="w-full border border-gray-200 bg-white rounded-xl px-3 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500"
                            placeholder="Don gia"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-500 mb-1">Gia de tai xe thu</label>
                          <input
                            type="tel"
                            value={formatInputCurrency(draft.unitPrice)}
                            onChange={(e) => updateDraft(draft.localId, { unitPrice: parseInputCurrency(e.target.value) })}
                            className="w-full border border-gray-200 bg-white rounded-xl px-3 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500"
                            placeholder="Don gia"
                          />
                        </div>
                        <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-500 mb-1">Ghi chu</label>
                          <input
                            type="text"
                            value={draft.note}
                            onChange={(e) => updateDraft(draft.localId, { note: capitalizeFirst(e.target.value) })}
                            className="w-full border border-gray-200 bg-white rounded-xl px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                            placeholder="Ghi chu neu can"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 grid grid-cols-3 gap-3">
                <div>
                <p className="text-xs font-bold uppercase mb-1">Tong size</p>
                  <p className="text-sm font-black text-slate-900">{formatNumber(requestPreview.totalWeight)} kg</p>
                </div>
                <div>
                <p className="text-xs font-bold uppercase mb-1">Tong so luong</p>
                  <p className="text-sm font-black text-slate-900">{formatNumber(requestPreview.totalQuantity)}</p>
                </div>
                <div>
                <p className="text-xs font-bold uppercase mb-1">Gia tri dat</p>
                  <p className="text-sm font-black text-emerald-600">{formatCurrency(requestPreview.totalAmount)} ?</p>
                </div>
              </div>

              {requestError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                  {requestError}
                </div>
              )}

              <div className="flex gap-3 pb-[calc(env(safe-area-inset-bottom)+8px)]">
                <button type="button" onClick={closeOrderRequestForm} className="flex-1 rounded-xl bg-gray-100 px-4 py-3 font-bold text-gray-700">Huy</button>
                <button type="submit" className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 font-bold text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-600">
                  Luu {requestDrafts.length} don
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
  return OrderRequestView;
}
