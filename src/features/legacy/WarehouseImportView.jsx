import { useState, useEffect, useMemo, useRef } from "react";
import { useAppScreenBack } from "../../hooks/useAppScreenBack.js";
import { useCallback } from "react";
import { buildWarehouseProductScanLookup, getWarehouseScanResultText, resolveWarehouseProductScan } from "../../utils/warehouseProductScanner.js";
import { addWarehouseQuantityUnit, buildWarehouseQuantityUnitSuggestions, dedupeWarehouseQuantityUnits, getRecentWarehouseQuantityUnits, normalizeWarehouseQuantityUnit, resolveRememberedWarehouseQuantityUnit } from "../../utils/warehouseQuantityUnits.js";
import { buildWarehouseGroupOptions } from "../../utils/warehouseGroupOptions.js";
import { useCooperativeProjection } from "../../hooks/useCooperativeProjection.js";
import { mergeWarehouseSupplierOptions } from "../../utils/warehouseSupplierOptions.js";
import { buildWarehouseStockChecklistRows, hasRecordedWarehouseStockMeasure, resolveWarehouseStockChecklistDisplayValue, resolveWarehouseStockCountStatus, selectLatestWarehouseStockCountMeasures } from "../../utils/warehouseInventory.js";
import { purchaseAmount } from "../../utils/productMeasures.js";
import { Plus, Check, X, ChevronDown, Scan, Loader2, ImagePlus, Camera } from "lucide-react";
// Transitional bundle boundary. Only stable local module bindings are injected;
// all actor/company/business data continues to arrive through current props.
// Generated binding contract is checked against the real source AST.
export function createWarehouseImportView(runtime) {
  const {DEFAULT_PROCESSING_INVENTORY_GROUPS,annotateWarehouseMeasureRows,buildCustomerNameAliases,buildMonthKeyFromDate,buildProcessingInventoryGroupKey,buildStoredWarehouseMeasureEntries,buildStoredWarehouseStockCountMeasureEntries,buildWarehouseDispatchMeasureEntries,buildWarehouseImportMeasureEntries,compareVietnameseText,formatCompactDateLabel,formatCurrency,formatNumber,getCustomerDisplayName,getEntityTimestamp,getFriendlyFirebaseErrorMessage,getProductMainGroupLabel,getProductShortName,getTodayString,getWarehouseImportSourceLabel,isWarehouseWeightUnit,normalizeCustomerPhone,normalizeLeadingLabel,normalizeLookupText,normalizeProductGroups,normalizeResetDateKey,normalizeWarehouseCountedMeasureEntries,normalizeWarehouseImportSourceType,normalizeWarehouseMeasureEntries,normalizeWarehouseMeasureUnit,normalizeWarehouseStockVisibilitySettings,parseDateInputValue,parseEntityTimestampValue,parseLooseMoneyValue,parseLooseQuantityValue,resolveWarehouseRecordDateKey,sortWarehouseMeasureRows,useDismissSearchOnOutsideClick,warehouseGroupOptionsCache} = runtime;
  function WarehouseImportView({ isVpsMode = false, vpsWarehouses = [], vpsUnits = [], employee, currentCompany = {}, customers = [], products = [], orders = [], orderRequests = [], warehouseImports = [], warehouseDispatches = [], warehouseStockCounts = [], onAddWarehouseImport, onEditWarehouseImport, onDeleteWarehouseImport, onAddWarehouseStockCount, onPostInventoryOpeningBalance, onEditWarehouseStockCount, onDeleteWarehouseStockCount, onUpdateCompanySettings = null, canCreateWarehouseImport = true, canPostVpsOpeningBalance = false, canEditWarehouseImport = false, canDeleteWarehouseImport = false, canViewActualStockCount = true, canCreateActualStockCount = false, canEditActualStockCount = false, canDeleteActualStockCount = false, canRecordActualStockReason = false, canCompareActualStockCount = true, quickActionIntent = null, onQuickActionHandled = () => {} }) {
  const actualStockReasonOptions = ['Đếm sai', 'Bị mất', 'Hư hỏng', 'Bị lỗi', 'Bị chết', 'Bị loại', 'Trả nhà cung cấp', 'Khác'];
  const [workingDate, setWorkingDate] = useState(getTodayString());
  const [draft, setDraft] = useState({
    warehouseId: '',
    unitId: '',
    productId: '',
    productName: '',
    productCode: '',
    productBarcode: '',
    groupName: DEFAULT_PROCESSING_INVENTORY_GROUPS[0] || 'Vịt',
    totalKg: '',
    quantity: '',
    quantityUnit: 'Con',
    extraMeasures: [],
    sourceType: 'purchase_resale',
    supplier: '',
    supplierCustomerId: '',
    supplierPhone: '',
    unitPrice: '',
    amount: '',
    note: ''
  });
  const [status, setStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const importSubmitRef = useRef(false);
  const importCommandRef = useRef(globalThis.crypto.randomUUID());
  const stockCountSubmitRef = useRef(false);
  const stockCountCommandRef = useRef(globalThis.crypto.randomUUID());
  const [groupSyncStatus, setGroupSyncStatus] = useState('');
  const [editingImportId, setEditingImportId] = useState('');
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [groupSearchTerm, setGroupSearchTerm] = useState('');
  const [showWarehouseProductCodePicker, setShowWarehouseProductCodePicker] = useState(false);
  const [showQuantityUnitPicker, setShowQuantityUnitPicker] = useState(false);
  const [showCustomQuantityUnitModal, setShowCustomQuantityUnitModal] = useState(false);
  const [customQuantityUnitDraft, setCustomQuantityUnitDraft] = useState('');
  const [customQuantityUnitStatus, setCustomQuantityUnitStatus] = useState('');
  const [warehouseProductScanStatus, setWarehouseProductScanStatus] = useState('');
  const [showWarehouseCameraScanner, setShowWarehouseCameraScanner] = useState(false);
  const [isWarehouseCameraScanning, setIsWarehouseCameraScanning] = useState(false);
  const [stockCountDraft, setStockCountDraft] = useState({
    warehouseId: '',
    productId: '',
    unitId: '',
    groupName: DEFAULT_PROCESSING_INVENTORY_GROUPS[0] || 'Vịt',
    totalKg: '',
    quantity: '',
    quantityUnit: 'Con',
    reason: '',
    note: ''
  });
  const [stockCountStatus, setStockCountStatus] = useState('');
  const [editingStockCountId, setEditingStockCountId] = useState('');
  const [isSavingStockCount, setIsSavingStockCount] = useState(false);
  const [vpsStockCountDraft, setVpsStockCountDraft] = useState({
    warehouseId: '',
    productId: '',
    unitId: '',
    countedQuantity: '',
    reason: '',
    note: ''
  });
  const [vpsStockCountStatus, setVpsStockCountStatus] = useState('');
  const [isSavingVpsStockCount, setIsSavingVpsStockCount] = useState(false);
  const [vpsOpeningBalanceDraft, setVpsOpeningBalanceDraft] = useState({
    warehouseId: '',
    productId: '',
    unitId: '',
    quantity: '',
    asOf: '',
    reason: '',
  });
  const [vpsOpeningBalanceStatus, setVpsOpeningBalanceStatus] = useState('');
  const [isSavingVpsOpeningBalance, setIsSavingVpsOpeningBalance] = useState(false);
  const [showStockCountGroupPicker, setShowStockCountGroupPicker] = useState(false);
  const [stockCountGroupSearchTerm, setStockCountGroupSearchTerm] = useState('');
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [quickStockEdit, setQuickStockEdit] = useState(null);
  const [stockVarianceReport, setStockVarianceReport] = useState(null);
  const [warehouseInventoryTab, setWarehouseInventoryTab] = useState('import');
  const [warehouseMovementUnitFilter, setWarehouseMovementUnitFilter] = useState(normalizeLookupText('Con'));
  const [selectedWarehouseMovementRowKey, setSelectedWarehouseMovementRowKey] = useState('');
  const [showHiddenWarehouseStockItems, setShowHiddenWarehouseStockItems] = useState(false);
  const [warehouseStockVisibilityStatus, setWarehouseStockVisibilityStatus] = useState('');
  const warehouseImportFieldRefs = useRef({});
  const warehouseProductCodeImageInputRef = useRef(null);
  const warehouseCameraVideoRef = useRef(null);
  const warehouseCameraStreamRef = useRef(null);
  const warehouseCameraZxingControlsRef = useRef(null);
  const warehouseCameraTimerRef = useRef(null);
  const warehouseScanInFlightRef = useRef(false);
  const warehouseMovementDetailRef = useRef(null);
  useAppScreenBack(() => {
    if (showWarehouseCameraScanner) {
      setShowWarehouseCameraScanner(false);
      return true;
    }
    if (showCustomQuantityUnitModal) {
      setShowCustomQuantityUnitModal(false);
      return true;
    }
    if (showSupplierPicker || showGroupPicker || showStockCountGroupPicker || showWarehouseProductCodePicker || showQuantityUnitPicker) {
      setShowSupplierPicker(false);
      setShowGroupPicker(false);
      setShowStockCountGroupPicker(false);
      setShowWarehouseProductCodePicker(false);
      setShowQuantityUnitPicker(false);
      return true;
    }
    if (quickStockEdit || stockVarianceReport) {
      setQuickStockEdit(null);
      setStockVarianceReport(null);
      return true;
    }
    if (selectedWarehouseMovementRowKey) {
      setSelectedWarehouseMovementRowKey('');
      return true;
    }
    return false;
  });
  const focusNextWarehouseImportField = (fieldKey) => {
    const nextField = warehouseImportFieldRefs.current?.[fieldKey];
    if (!nextField) return;
    const runFocus = () => {
      nextField.focus?.();
      if (typeof nextField.select === 'function' && nextField.type !== 'date') nextField.select();
    };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(runFocus);
    } else {
      runFocus();
    }
  };
  useEffect(() => {
    if (quickActionIntent?.type !== 'create_warehouse_import') return;
    if (!canCreateWarehouseImport) {
      onQuickActionHandled();
      return;
    }
    setWarehouseInventoryTab('import');
    window.requestAnimationFrame?.(() => focusNextWarehouseImportField('productCode'));
    onQuickActionHandled();
  }, [canCreateWarehouseImport, onQuickActionHandled, quickActionIntent?.id, quickActionIntent?.type]);
  const handleWarehouseImportEnter = (event, nextFieldKey) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (nextFieldKey === 'submit') {
      const form = event.currentTarget.form;
      if (form?.requestSubmit) {
        form.requestSubmit();
      } else if (form) {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
      return;
    }
    focusNextWarehouseImportField(nextFieldKey);
  };

  const updateWarehouseWorkingDate = (dateKey = '') => {
    const safeDate = parseDateInputValue(dateKey) ? dateKey : getTodayString();
    setWorkingDate(safeDate);
  };

  const warehouseProductLookup = useMemo(() => new Map((products || []).map(product => [product.id, product])), [products]);
  const getWarehouseInventoryGroupLabel = useCallback((product = {}, fallback = '') => {
    const rawLabel = product?.mainGroup
      || product?.groupName
      || product?.productGroup
      || product?.category
      || fallback
      || product?.name
      || '';
    const normalized = normalizeLeadingLabel(rawLabel);
    const lookup = normalizeLookupText(`${normalized} ${fallback || ''} ${product?.name || ''}`);
    if ((lookup.includes('ga') && (lookup.includes('cong nghiep') || lookup.includes('ga cn'))) || lookup.includes('gcn')) {
      return 'Gà công nghiệp';
    }
    return getProductMainGroupLabel(product, normalized || fallback);
  }, []);
  const getWarehouseProductCodeCandidates = (product = {}) => {
    const shortName = getProductShortName(product);
    return [
      product?.barcode,
      product?.sku,
      product?.code,
      product?.productCode,
      product?.productBarcode,
      product?.productSku,
      product?.productShortName,
      product?.shortName,
      shortName,
      product?.id
    ]
      .map(value => `${value || ''}`.trim())
      .filter(Boolean);
  };
  const warehouseProductCodeLookup = useMemo(
    () => buildWarehouseProductScanLookup(products),
    [products]
  );
  const warehouseProductCodeSuggestions = useMemo(() => {
    const keyword = normalizeLookupText(draft.productCode || '');
    if (!keyword) return [];
    return (products || [])
      .filter(product => product && !product.isArchived)
      .filter(product => {
        const haystack = normalizeLookupText([
          product.name,
          product.productName,
          getProductShortName(product),
          product.barcode,
          product.sku,
          product.code,
          product.productCode,
          product.productBarcode,
          product.category,
          product.groupName,
          product.mainGroup
        ].filter(Boolean).join(' '));
        return haystack.includes(keyword);
      })
      .slice(0, 8);
  }, [draft.productCode, products]);
  const customQuantityUnits = useMemo(
    () => dedupeWarehouseQuantityUnits(currentCompany?.warehouseQuantityUnits || []),
    [currentCompany?.warehouseQuantityUnits]
  );
  const rememberedQuantityUnit = useMemo(
    () => resolveRememberedWarehouseQuantityUnit(warehouseImports, {
      productId: draft.productId,
      productCode: draft.productCode,
      productName: draft.productName,
      groupName: draft.groupName
    }),
    [draft.groupName, draft.productCode, draft.productId, draft.productName, warehouseImports]
  );
  const recentQuantityUnits = useMemo(
    () => getRecentWarehouseQuantityUnits(warehouseImports, {
      productId: draft.productId,
      productCode: draft.productCode,
      productName: draft.productName,
      groupName: draft.groupName
    }),
    [draft.groupName, draft.productCode, draft.productId, draft.productName, warehouseImports]
  );
  const quantityUnitSuggestions = useMemo(
    () => buildWarehouseQuantityUnitSuggestions({
      currentUnit: draft.quantityUnit,
      rememberedUnit: rememberedQuantityUnit,
      recentUnits: recentQuantityUnits,
      customUnits: customQuantityUnits
    }),
    [customQuantityUnits, draft.quantityUnit, recentQuantityUnits, rememberedQuantityUnit]
  );
  useEffect(() => {
    if (!rememberedQuantityUnit) return;
    setDraft(prev => prev.quantityUnit === rememberedQuantityUnit
      ? prev
      : { ...prev, quantityUnit: rememberedQuantityUnit });
  }, [rememberedQuantityUnit]);
  const applyWarehouseProductToDraft = (product = {}, rawCode = '') => {
    if (!product?.id) return false;
    const code = `${rawCode || product.barcode || product.sku || product.productCode || getProductShortName(product) || product.id || ''}`.trim();
    const groupName = getWarehouseInventoryGroupLabel(product, product.name);
    const costPrice = parseLooseMoneyValue(product.costPrice ?? product.importPrice ?? product.purchasePrice ?? product.unitCost);
    const rememberedUnit = resolveRememberedWarehouseQuantityUnit(warehouseImports, {
      productId: product.id,
      productName: product.name || product.productName,
      groupName
    });
    setDraft(prev => ({
      ...prev,
      productId: product.id || '',
      productName: product.name || product.productName || '',
      productCode: code,
      purchaseUnit: product.purchaseUnit || 'Kg',
      productBarcode: product.barcode || product.productBarcode || code,
      groupName: groupName || prev.groupName,
      quantityUnit: rememberedUnit
        || normalizeWarehouseMeasureUnit(product.unit || product.quantityUnit || prev.quantityUnit || 'Con'),
      unitPrice: prev.unitPrice || (costPrice > 0 ? `${costPrice}` : prev.unitPrice)
    }));
    setWarehouseProductScanStatus(`Đã nhận ${product.name || product.productName || code}${groupName ? ` - nhóm ${groupName}` : ''}.`);
    setShowWarehouseProductCodePicker(false);
    return true;
  };
  const applyWarehouseProductCode = (rawCode = '') => {
    const code = `${rawCode || draft.productCode || ''}`.trim();
    if (!code) {
      setWarehouseProductScanStatus('Vui lòng nhập hoặc quét mã sản phẩm.');
      return false;
    }
    const { product, code: matchedCode } = resolveWarehouseProductScan(warehouseProductCodeLookup, code);
    if (!product) {
      setWarehouseProductScanStatus(`Chưa tìm thấy sản phẩm có mã "${code}". Bạn vẫn có thể nhập nhóm hàng thủ công.`);
      return false;
    }
    return applyWarehouseProductToDraft(product, matchedCode || code);
  };
  const getWarehouseUniversalBarcodeDetector = async () => {
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
      throw new Error('Thiết bị này chưa hỗ trợ quét mã tự động.');
    }
    const defaultFormats = ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar', 'data_matrix', 'pdf417', 'aztec'];
    const supportedFormats = typeof window.BarcodeDetector.getSupportedFormats === 'function'
      ? await window.BarcodeDetector.getSupportedFormats()
      : defaultFormats;
    const formats = defaultFormats.filter(format => supportedFormats.includes(format));
    return new window.BarcodeDetector({ formats: formats.length > 0 ? formats : supportedFormats });
  };
  const getWarehouseZxingReader = async () => {
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    return new BrowserMultiFormatReader();
  };
  const detectWarehouseCodeFromImageFile = async (file) => {
    try {
      const detector = await getWarehouseUniversalBarcodeDetector();
      if (typeof window.createImageBitmap === 'function') {
        const bitmap = await window.createImageBitmap(file);
        try {
          const results = await detector.detect(bitmap);
          const detectedCode = `${results?.[0]?.rawValue || ''}`.trim();
          if (detectedCode) return detectedCode;
        } finally {
          bitmap.close?.();
        }
      }
    } catch (error) {
      console.warn('Native warehouse image scan unavailable, falling back to ZXing.', error);
    }
    const reader = await getWarehouseZxingReader();
    const imageUrl = URL.createObjectURL(file);
    try {
      const result = await reader.decodeFromImageUrl(imageUrl);
      return getWarehouseScanResultText(result);
    } finally {
      URL.revokeObjectURL(imageUrl);
      reader.reset?.();
    }
  };
  const handleWarehouseProductCodeImage = async (file) => {
    if (!file) return;
    setWarehouseProductScanStatus('Đang quét mã sản phẩm...');
    try {
      const code = await detectWarehouseCodeFromImageFile(file);
      if (!code) throw new Error('NO_BARCODE');
      setDraft(prev => ({ ...prev, productCode: code }));
      const matched = applyWarehouseProductCode(code);
      if (matched) {
        stopWarehouseCameraScanner();
        setShowWarehouseCameraScanner(false);
        focusNextWarehouseImportField('totalKg');
      }
    } catch (error) {
      setWarehouseProductScanStatus('Chưa đọc được mã. Hãy chụp rõ mã hơn hoặc nhập mã tay.');
    } finally {
      if (warehouseProductCodeImageInputRef.current) warehouseProductCodeImageInputRef.current.value = '';
    }
  };
  const stopWarehouseCameraScanner = (updateState = true) => {
    if (warehouseCameraTimerRef.current) {
      window.clearTimeout?.(warehouseCameraTimerRef.current);
      warehouseCameraTimerRef.current = null;
    }
    if (warehouseCameraZxingControlsRef.current) {
      try {
        warehouseCameraZxingControlsRef.current.stop?.();
      } catch (error) {
        console.warn('Failed to stop warehouse ZXing scanner.', error);
      }
      warehouseCameraZxingControlsRef.current = null;
    }
    const stream = warehouseCameraStreamRef.current;
    if (stream) {
      stream.getTracks?.().forEach(track => track.stop());
      warehouseCameraStreamRef.current = null;
    }
    if (warehouseCameraVideoRef.current) warehouseCameraVideoRef.current.srcObject = null;
    warehouseScanInFlightRef.current = false;
    if (updateState) setIsWarehouseCameraScanning(false);
  };
  const completeWarehouseScan = (rawCode = '') => {
    const code = `${rawCode || ''}`.trim();
    if (!code || warehouseScanInFlightRef.current) return false;
    warehouseScanInFlightRef.current = true;
    const { product, code: matchedCode } = resolveWarehouseProductScan(warehouseProductCodeLookup, code);
    if (!product) {
      warehouseScanInFlightRef.current = false;
      setDraft(prev => ({ ...prev, productCode: code }));
      setWarehouseProductScanStatus(`Đã đọc mã "${code}" nhưng chưa khớp sản phẩm trong catalog.`);
      stopWarehouseCameraScanner();
      return false;
    }
    const matched = applyWarehouseProductToDraft(product, matchedCode || code);
    stopWarehouseCameraScanner();
    if (matched) {
      setShowWarehouseCameraScanner(false);
      focusNextWarehouseImportField('totalKg');
    }
    return matched;
  };
  const openWarehouseCameraScanner = () => {
    setShowWarehouseProductCodePicker(false);
    setWarehouseProductScanStatus('Đang chuẩn bị camera...');
    setShowWarehouseCameraScanner(true);
  };
  const closeWarehouseCameraScanner = () => {
    stopWarehouseCameraScanner();
    setShowWarehouseCameraScanner(false);
  };
  const startWarehouseCameraScanner = async () => {
    try {
      setWarehouseProductScanStatus('Đang mở camera...');
      stopWarehouseCameraScanner(false);
      const video = warehouseCameraVideoRef.current;
      if (!video || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Thiết bị này chưa cho phép mở camera từ app.');
      }
      let detector = null;
      try {
        detector = await getWarehouseUniversalBarcodeDetector();
      } catch (error) {
        console.warn('Native warehouse camera scan unavailable, falling back to ZXing.', error);
      }
      if (!detector) {
        const reader = await getWarehouseZxingReader();
        setIsWarehouseCameraScanning(true);
        setWarehouseProductScanStatus('Đưa QR hoặc mã vạch vào khung để quét.');
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } }, audio: false },
          video,
          (result, error, controlsRef) => {
            if (controlsRef) warehouseCameraZxingControlsRef.current = controlsRef;
            const detectedCode = getWarehouseScanResultText(result);
            if (detectedCode) completeWarehouseScan(detectedCode);
          }
        );
        warehouseCameraZxingControlsRef.current = controls;
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      warehouseCameraStreamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      setIsWarehouseCameraScanning(true);
      setWarehouseProductScanStatus('Đưa QR hoặc mã vạch vào khung để quét.');

      if (detector) {
        const scanFrame = async () => {
          if (!warehouseCameraStreamRef.current || !warehouseCameraVideoRef.current) return;
          try {
            const results = warehouseCameraVideoRef.current.readyState >= 2
              ? await detector.detect(warehouseCameraVideoRef.current)
              : [];
            const detectedCode = `${results?.[0]?.rawValue || ''}`.trim();
            if (detectedCode) {
              completeWarehouseScan(detectedCode);
              return;
            }
          } catch (error) {
            console.warn('Warehouse scanner frame failed.', error);
          }
          warehouseCameraTimerRef.current = window.setTimeout(scanFrame, 450);
        };
        scanFrame();
        return;
      }
    } catch (error) {
      console.warn('Failed to start warehouse scanner.', error);
      stopWarehouseCameraScanner();
      setWarehouseProductScanStatus(error?.message || 'Chưa mở được camera. Bạn có thể chọn ảnh chứa mã để quét.');
    }
  };
  useEffect(() => {
    if (!showWarehouseCameraScanner) return undefined;
    const timer = window.setTimeout(() => startWarehouseCameraScanner(), 0);
    return () => {
      window.clearTimeout(timer);
      stopWarehouseCameraScanner(false);
    };
  }, [showWarehouseCameraScanner]);

  const warehouseGroupScope = JSON.stringify(currentCompany?.productGroups || []);
  const warehouseGroupEntry = warehouseGroupOptionsCache([products, warehouseImports, warehouseDispatches, orders, orderRequests], warehouseGroupScope);
  const prepareWarehouseGroups = useCallback(function* () {
    return yield* buildWarehouseGroupOptions({
      defaults: DEFAULT_PROCESSING_INVENTORY_GROUPS, companyGroups: normalizeProductGroups(currentCompany?.productGroups || []),
      products, imports: warehouseImports, dispatches: warehouseDispatches, orders, requests: orderRequests,
      productLookup: warehouseProductLookup, resolveProductGroup: getWarehouseInventoryGroupLabel,
      normalizeLabel: normalizeLeadingLabel, groupKey: buildProcessingInventoryGroupKey,
    });
  }, [warehouseGroupScope, products, warehouseImports, warehouseDispatches, orders, orderRequests, warehouseProductLookup, getWarehouseInventoryGroupLabel]);
  const warehouseGroupProjection = useCooperativeProjection(prepareWarehouseGroups, warehouseGroupEntry);
  const groupOptions = warehouseGroupProjection.value;
  const filteredGroupOptions = useMemo(() => {
    const keyword = normalizeLookupText(groupSearchTerm || '');
    const rows = keyword
      ? groupOptions.filter(label => normalizeLookupText(label).includes(keyword))
      : groupOptions;
    return rows.slice(0, 18);
  }, [groupSearchTerm, groupOptions]);
  const filteredStockCountGroupOptions = useMemo(() => {
    const keyword = normalizeLookupText(stockCountGroupSearchTerm || '');
    const rows = keyword
      ? groupOptions.filter(label => normalizeLookupText(label).includes(keyword))
      : groupOptions;
    return rows.slice(0, 18);
  }, [stockCountGroupSearchTerm, groupOptions]);
  const supplierCustomerOptions = useMemo(() => (customers || [])
    .filter(customer => customer && !customer.isArchived)
    .sort((left, right) => compareVietnameseText(`${left?.name || left?.customerName || left?.fullName || left?.phone || ''}`, `${right?.name || right?.customerName || right?.fullName || right?.phone || ''}`)),
    [customers]
  );
  const selectedSupplierCustomer = useMemo(() => {
    if (!draft.supplierCustomerId) return null;
    return supplierCustomerOptions.find(customer => customer.id === draft.supplierCustomerId) || null;
  }, [draft.supplierCustomerId, supplierCustomerOptions]);
  const getSupplierCustomerLabel = (customer = {}) => (
    getCustomerDisplayName(customer)
    || customer.name
    || customer.customerName
    || customer.fullName
    || customer.phone
    || 'Khách hàng'
  );
  const recentSupplierOptions = useMemo(() => {
    const optionMap = new Map();
    (warehouseImports || [])
      .filter(item => item && !item.isArchived && `${item.supplier || ''}`.trim())
      .sort((left, right) => (getEntityTimestamp(right) || 0) - (getEntityTimestamp(left) || 0))
      .forEach(item => {
        const supplierName = `${item.supplier || ''}`.trim();
        const supplierKey = normalizeLookupText(`${supplierName} ${item.supplierPhone || ''}`);
        if (!supplierKey || optionMap.has(supplierKey)) return;
        optionMap.set(supplierKey, {
          id: item.supplierCustomerId || `recent_supplier_${supplierKey}`,
          name: supplierName,
          phone: item.supplierPhone || '',
          source: 'recent'
        });
      });
    return Array.from(optionMap.values()).slice(0, 18);
  }, [warehouseImports]);
  const supplierPickerOptions = useMemo(() => {
    return mergeWarehouseSupplierOptions(
      recentSupplierOptions,
      supplierCustomerOptions.map(customer => ({
        ...customer,
        name: getSupplierCustomerLabel(customer),
        phone: customer.phone || customer.phoneNumber || '',
        source: 'customer'
      }))
    );
  }, [recentSupplierOptions, supplierCustomerOptions]);
  const findSupplierCustomerMatch = (supplierText = '', supplierCustomerId = '') => {
    if (supplierCustomerId) {
      return supplierCustomerOptions.find(customer => customer.id === supplierCustomerId) || null;
    }
    const keyword = `${supplierText || ''}`.trim();
    if (!keyword) return null;
    const normalizedKeyword = normalizeLookupText(keyword);
    const phoneKeyword = normalizeCustomerPhone(keyword);
    return supplierCustomerOptions.find(customer => {
      const nameMatch = buildCustomerNameAliases(customer)
        .some(alias => normalizeLookupText(alias) === normalizedKeyword);
      const phoneMatch = phoneKeyword && normalizeCustomerPhone(customer.phone || customer.phoneNumber || '') === phoneKeyword;
      return nameMatch || phoneMatch;
    }) || null;
  };
  const supplierSuggestions = useMemo(() => {
    const normalizedKeyword = normalizeLookupText(draft.supplier || '');
    const phoneKeyword = normalizeCustomerPhone(draft.supplier || '');
    const rows = supplierPickerOptions.filter(customer => {
      if (!normalizedKeyword && !phoneKeyword) return true;
      const nameText = buildCustomerNameAliases(customer).join(' ');
      const haystack = normalizeLookupText([
        nameText,
        customer.phone,
        customer.phoneNumber,
        customer.address,
        customer.customerGroup,
        customer.managerName
      ].filter(Boolean).join(' '));
      const phoneText = normalizeCustomerPhone(customer.phone || customer.phoneNumber || '');
      return haystack.includes(normalizedKeyword) || (phoneKeyword && phoneText.includes(phoneKeyword));
    });
    return rows.slice(0, 8);
  }, [draft.supplier, supplierPickerOptions]);
  useDismissSearchOnOutsideClick(showGroupPicker || showSupplierPicker || showStockCountGroupPicker || showWarehouseProductCodePicker || showQuantityUnitPicker, () => {
    setShowGroupPicker(false);
    setShowSupplierPicker(false);
    setShowStockCountGroupPicker(false);
    setShowWarehouseProductCodePicker(false);
    setShowQuantityUnitPicker(false);
  });
  const selectSupplierCustomer = (customer = {}) => {
    const isLinkedCustomer = customer.source !== 'recent' && supplierCustomerOptions.some(item => item.id === customer.id);
    updateDraft({
      supplier: getSupplierCustomerLabel(customer),
      supplierCustomerId: isLinkedCustomer ? customer.id || '' : '',
      supplierPhone: customer.phone || customer.phoneNumber || ''
    });
    setShowSupplierPicker(false);
  };
  const handleSupplierInputChange = (value = '') => {
    updateDraft({
      supplier: value,
      supplierCustomerId: '',
      supplierPhone: ''
    });
    setShowSupplierPicker(true);
  };

  const ensureWarehouseInventoryGroupExists = async (groupName = '') => {
    const normalizedName = normalizeLeadingLabel(groupName || '');
    if (!normalizedName || !onUpdateCompanySettings) return { created: false };
    const currentGroups = normalizeProductGroups(currentCompany?.productGroups || []);
    const normalizedKey = buildProcessingInventoryGroupKey(normalizedName);
    const alreadyExists = currentGroups.some(label => buildProcessingInventoryGroupKey(label) === normalizedKey);
    if (alreadyExists) return { created: false };
    try {
      const result = await onUpdateCompanySettings({
        productGroups: normalizeProductGroups([...currentGroups, normalizedName])
      });
      if (result && result.success === false) {
        return { created: false, error: result.message || 'Chưa lưu được nhóm hàng mới.' };
      }
    } catch (error) {
      return { created: false, error: getFriendlyFirebaseErrorMessage(error, 'Chưa lưu được nhóm hàng mới.') };
    }
    return { created: true };
  };

  const buildWarehouseGroupSyncNote = (syncResult = {}) => {
    if (syncResult.created) return ' Nhóm mới đã được thêm vào danh sách nhóm hàng.';
    if (syncResult.error) return ` Nhóm mới chưa cập nhật vào danh sách: ${syncResult.error}`;
    return '';
  };
  const syncWarehouseGroupInBackground = (groupName) => {
    if (isVpsMode) return;
    setGroupSyncStatus('');
    void ensureWarehouseInventoryGroupExists(groupName).then(result => {
      setGroupSyncStatus(buildWarehouseGroupSyncNote(result));
    }).catch(error => setGroupSyncStatus(getFriendlyFirebaseErrorMessage(error, 'Chưa cập nhật được danh sách nhóm hàng.')));
  };

  const productLookup = useMemo(() => new Map((products || []).map(product => [product.id, product])), [products]);
  const warehouseStockResetTimestamp = useMemo(() => {
    const rawResetAt = currentCompany?.warehouseStockResetAt || '';
    if (!rawResetAt) return 0;
    const parsed = new Date(rawResetAt).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }, [currentCompany?.warehouseStockResetAt]);
  const warehouseStockResetDateKey = useMemo(
    () => normalizeResetDateKey(currentCompany?.warehouseStockResetAt || ''),
    [currentCompany?.warehouseStockResetAt]
  );
  const isAfterWarehouseStockReset = useCallback((item = {}) => {
    if (!warehouseStockResetTimestamp) return true;
    const dateKey = resolveWarehouseRecordDateKey(item);
    const timestamp = getEntityTimestamp(item);
    if (timestamp) return timestamp >= warehouseStockResetTimestamp;
    if (dateKey && warehouseStockResetDateKey) return `${dateKey}`.slice(0, 10) >= warehouseStockResetDateKey;
    if (!dateKey) return true;
    const endOfDateTimestamp = new Date(`${dateKey}T23:59:59`).getTime();
    return Number.isFinite(endOfDateTimestamp) ? endOfDateTimestamp >= warehouseStockResetTimestamp : true;
  }, [warehouseStockResetDateKey, warehouseStockResetTimestamp]);

  const dayImports = useMemo(() => warehouseImports
    .filter(item => !item?.isArchived && resolveWarehouseRecordDateKey(item) === workingDate && isAfterWarehouseStockReset(item))
    .sort((a, b) => (getEntityTimestamp(b) || 0) - (getEntityTimestamp(a) || 0)), [isAfterWarehouseStockReset, warehouseImports, workingDate]);
  const dayStockCounts = useMemo(() => warehouseStockCounts
    .filter(item => !item?.isArchived && resolveWarehouseRecordDateKey(item) === workingDate && isAfterWarehouseStockReset(item))
    .sort((a, b) => (getEntityTimestamp(b) || 0) - (getEntityTimestamp(a) || 0)), [isAfterWarehouseStockReset, warehouseStockCounts, workingDate]);

  const daySummary = useMemo(() => dayImports.reduce((acc, item) => {
    acc.totalKg += parseLooseQuantityValue(item.totalKg ?? item.weightKg);
    acc.quantity += parseLooseQuantityValue(item.quantity ?? item.totalQuantity);
    acc.amount += parseLooseMoneyValue(item.amount ?? item.totalAmount);
    acc.groupCountSet.add(buildProcessingInventoryGroupKey(item.groupName || item.productGroup || 'Nhóm hàng'));
    const measures = buildStoredWarehouseMeasureEntries(item);
    measures.forEach((measure) => {
      const key = normalizeLookupText(measure.unit);
      const current = acc.measureMap.get(key) || { unit: measure.unit, quantity: 0 };
      current.quantity += measure.quantity;
      acc.measureMap.set(key, current);
    });
    return acc;
  }, { totalKg: 0, quantity: 0, amount: 0, groupCountSet: new Set(), measureMap: new Map() }), [dayImports]);
  const dayMeasureSummary = useMemo(
    () => sortWarehouseMeasureRows(Array.from(daySummary.measureMap.values())),
    [daySummary]
  );

  const getWarehouseStockGroupLabel = useCallback((item = {}, product = null) => normalizeLeadingLabel(
    item.groupName
    || item.productGroup
    || product?.mainGroup
    || product?.category
    || getProductMainGroupLabel(product, product?.name || item.productNameSnapshot || item.productName || '')
    || item.productNameSnapshot
    || item.productName
    || 'Nhóm hàng'
  ), []);
  const dayImportGroupUnitMap = useMemo(() => {
    const groups = new Map();
    dayImports.forEach((item) => {
      const groupName = normalizeLeadingLabel(item.groupName || item.productGroup || 'Nhóm hàng');
      const key = buildProcessingInventoryGroupKey(groupName);
      if (!groups.has(key)) groups.set(key, { key, groupName, units: new Map() });
      const currentGroup = groups.get(key);
      const measures = buildStoredWarehouseMeasureEntries(item);
      measures.forEach((measure) => {
        const unit = normalizeWarehouseMeasureUnit(measure.unit || 'Đơn vị');
        const unitKey = normalizeLookupText(unit);
        if (unitKey) currentGroup.units.set(unitKey, unit);
      });
    });
    return groups;
  }, [dayImports]);
  const dayExportRows = useMemo(() => {
    const grouped = new Map();
    const ensureRow = (groupName = 'Nhóm hàng') => {
      const label = normalizeLeadingLabel(groupName || 'Nhóm hàng');
      const key = buildProcessingInventoryGroupKey(label);
      if (!grouped.has(key)) {
        const importGroup = dayImportGroupUnitMap.get(key);
        grouped.set(key, {
          key,
          groupName: importGroup?.groupName || label,
          measureMap: new Map()
        });
      }
      return grouped.get(key);
    };
    const addExportMeasure = (row, unit, quantity) => {
      const normalizedUnit = normalizeWarehouseMeasureUnit(unit || 'Đơn vị');
      const unitKey = normalizeLookupText(normalizedUnit);
      const amount = parseLooseQuantityValue(quantity);
      if (!unitKey || amount <= 0) return;
      const current = row.measureMap.get(unitKey) || { unit: normalizedUnit, exported: 0 };
      current.exported += amount;
      row.measureMap.set(unitKey, current);
    };

    (warehouseDispatches || [])
      .filter(item => !item?.isArchived && !item?.__pendingFirebaseSync && resolveWarehouseRecordDateKey(item) === workingDate && isAfterWarehouseStockReset(item))
      .forEach((item) => {
        const product = productLookup.get(item.productId);
        const row = ensureRow(getWarehouseStockGroupLabel(item, product));
        buildWarehouseDispatchMeasureEntries(item, product).forEach(measure => {
          addExportMeasure(row, measure.unit, measure.quantity);
        });
      });
    return Array.from(grouped.values())
      .map(row => ({
        ...row,
        measureRows: sortWarehouseMeasureRows(Array.from(row.measureMap.values()))
      }))
      .filter(row => row.measureRows.length > 0)
      .sort((a, b) => (a.groupName || '').localeCompare(b.groupName || '', 'vi'));
  }, [dayImportGroupUnitMap, getWarehouseStockGroupLabel, isAfterWarehouseStockReset, productLookup, warehouseDispatches, workingDate]);
  const getMandatoryWarehouseStockUnitsForGroup = (groupName = '') => {
    const lookup = normalizeLookupText(groupName || '');
    if (lookup.includes('ga') || lookup.includes('vit')) return ['Con', 'Kg'];
    return [];
  };

  const preparedWarehouseStockMovements = useMemo(() => {
    const prepare = records => (records || [])
      .filter(item => !item?.isArchived && !item?.__pendingFirebaseSync && isAfterWarehouseStockReset(item))
      .map(item => ({ item, dateKey: resolveWarehouseRecordDateKey(item), measures: null }));
    return { imports: prepare(warehouseImports), dispatches: prepare(warehouseDispatches) };
  }, [isAfterWarehouseStockReset, warehouseImports, warehouseDispatches, productLookup]);

  const preparedWarehouseStockCounts = useMemo(
    () => (warehouseStockCounts || []).filter(item => !item?.isArchived && isAfterWarehouseStockReset(item)),
    [isAfterWarehouseStockReset, warehouseStockCounts]
  );

  const buildWarehouseStockRowsForDate = useCallback((targetDate = getTodayString()) => {
    const safeTargetDate = `${targetDate || getTodayString()}`.slice(0, 10);
    const grouped = new Map();
    const ensureRow = (groupName, unit = 'Đơn vị', allowCreate = true) => {
      const label = normalizeLeadingLabel(groupName || 'Nhóm hàng');
      const key = buildProcessingInventoryGroupKey(label);
      if (!grouped.has(key)) {
        if (!allowCreate) return null;
        grouped.set(key, {
          key,
          groupName: label,
          unit: normalizeLeadingLabel(unit || 'Đơn vị'),
          measureMap: new Map()
        });
      }
      return grouped.get(key);
    };
    const isMovementAfterMeasureBaseline = (measure = {}, item = {}) => {
      if (!measure?.baselineDate) return true;
      const dateKey = resolveWarehouseRecordDateKey(item);
      if (!dateKey) return false;
      if (dateKey > measure.baselineDate) return true;
      if (dateKey < measure.baselineDate) return false;
      const movementTimestamp = getEntityTimestamp(item) || 0;
      if (measure.baselineAt && movementTimestamp) return movementTimestamp > measure.baselineAt;
      return false;
    };
    const addMeasure = (row, type, unit, quantity, metadata = {}) => {
      const normalizedUnit = normalizeWarehouseMeasureUnit(unit || 'Đơn vị');
      const amount = parseLooseQuantityValue(quantity);
      if (!normalizedUnit || amount < 0 || (type !== 'baseline' && amount <= 0)) return;
      const key = normalizeLookupText(normalizedUnit);
      const current = row.measureMap.get(key) || {
        unit: normalizedUnit,
        baseline: 0,
        imported: 0,
        exported: 0,
        baselineDate: '',
        baselineAt: 0,
        baselineItemId: ''
      };
      if (type === 'baseline') {
        current.baseline = amount;
        current.baselineDate = metadata.dateKey || '';
        current.baselineAt = metadata.timestamp || 0;
        current.baselineItemId = metadata.item?.id || '';
      } else {
        if (!isMovementAfterMeasureBaseline(current, metadata.item)) return;
        current[type] += amount;
      }
      row.measureMap.set(key, current);
    };

    const latestActualStockByGroup = selectLatestWarehouseStockCountMeasures(
      preparedWarehouseStockCounts,
      {
        getGroupKey: item => buildProcessingInventoryGroupKey(item.groupName || item.productGroup || 'Nhóm hàng'),
        getGroupName: item => normalizeLeadingLabel(item.groupName || item.productGroup || 'Nhóm hàng'),
        getDateKey: resolveWarehouseRecordDateKey,
        getTimestamp: item => Math.max(
          parseEntityTimestampValue(item.createdAt) || 0,
          parseEntityTimestampValue(item.updatedAt) || 0,
          getEntityTimestamp(item) || 0
        ),
         getMeasures: buildStoredWarehouseStockCountMeasureEntries,
         getUnitKey: measure => normalizeLookupText(normalizeWarehouseMeasureUnit(measure?.unit || '')),
         targetDate: safeTargetDate,
         excludeTargetDate: true
       }
     );

    latestActualStockByGroup.forEach((baseline) => {
      const row = ensureRow(baseline.groupName, baseline.latestItem?.quantityUnit || baseline.latestItem?.unit || 'Đơn vị');
      baseline.measures.forEach((measure) => {
        if (!isWarehouseWeightUnit(measure.unit)) row.unit = normalizeLeadingLabel(measure.unit);
        addMeasure(row, 'baseline', measure.unit, measure.quantity, measure);
      });
    });

    preparedWarehouseStockMovements.imports
      .filter(entry => entry.dateKey && (!safeTargetDate || entry.dateKey <= safeTargetDate))
      .forEach((entry) => {
        const { item } = entry;
        const row = ensureRow(item.groupName || item.productGroup || 'Nhóm hàng', item.quantityUnit || item.unit || 'Đơn vị');
        if (item.quantityUnit || item.unit) row.unit = normalizeLeadingLabel(item.quantityUnit || item.unit);
        // Derived measures are immutable for this source generation, including
        // the product lookup. Historical dates reuse them without remeasurement.
        const measures = entry.measures ||= buildStoredWarehouseMeasureEntries(item);
        measures.forEach(measure => addMeasure(row, 'imported', measure.unit, measure.quantity, { item }));
      });

    preparedWarehouseStockMovements.dispatches
      .filter(entry => entry.dateKey && (!safeTargetDate || entry.dateKey <= safeTargetDate))
      .forEach((entry) => {
        const { item } = entry;
        const product = productLookup.get(item.productId);
        const row = ensureRow(
          getWarehouseStockGroupLabel(item, product),
          item.quantityUnit || item.unit || product?.unit || 'Đơn vị',
          false
        );
        if (!row) return;
        const dispatchMeasures = entry.measures ||= buildWarehouseDispatchMeasureEntries(item, product);
        if (item.quantityUnit || item.unit || product?.unit) row.unit = normalizeLeadingLabel(item.quantityUnit || item.unit || product?.unit);
        dispatchMeasures.forEach(measure => addMeasure(row, 'exported', measure.unit, measure.quantity, { item }));
      });

    return Array.from(grouped.values())
      .map(row => {
        const measureRows = Array.from(row.measureMap.values())
          .map(measure => ({
            ...measure,
            remaining: (measure.baseline || 0) + (measure.imported || 0) - (measure.exported || 0)
          }));
        getMandatoryWarehouseStockUnitsForGroup(row.groupName).forEach((unit) => {
          const unitKey = normalizeLookupText(unit);
          if (!measureRows.some(measure => normalizeLookupText(measure.unit) === unitKey)) {
            measureRows.push({ unit, baseline: 0, imported: 0, exported: 0, remaining: 0 });
          }
        });
        const annotatedMeasureRows = annotateWarehouseMeasureRows(measureRows);
        const primaryMeasureRows = annotatedMeasureRows.filter(measure => measure.isPrimaryStockUnit);
        const referenceMeasureRows = annotatedMeasureRows.filter(measure => measure.isReferenceStockUnit);
        const primaryQuantityMeasure = primaryMeasureRows.find(measure => !isWarehouseWeightUnit(measure.unit))
          || annotatedMeasureRows.find(measure => !isWarehouseWeightUnit(measure.unit));
        const kgMeasure = annotatedMeasureRows.find(measure => isWarehouseWeightUnit(measure.unit));
        const hasPrimaryStockWarning = primaryMeasureRows.some(measure => parseLooseQuantityValue(measure.remaining) < 0);
        const hasReferenceStockWarning = referenceMeasureRows.some(measure => parseLooseQuantityValue(measure.remaining) < 0);
        return {
          ...row,
          remainingQty: parseLooseQuantityValue(primaryQuantityMeasure?.remaining),
          remainingKg: parseLooseQuantityValue(kgMeasure?.remaining),
          measureRows: annotatedMeasureRows,
          primaryMeasureRows,
          referenceMeasureRows,
          hasPrimaryStockWarning,
          hasReferenceStockWarning,
          hasStockWarning: hasPrimaryStockWarning || hasReferenceStockWarning
        };
      })
      .sort((a, b) => {
        const aWarn = a.hasPrimaryStockWarning ? 1 : 0;
        const bWarn = b.hasPrimaryStockWarning ? 1 : 0;
        if (bWarn !== aWarn) return bWarn - aWarn;
        const aReferenceWarn = a.hasReferenceStockWarning ? 1 : 0;
        const bReferenceWarn = b.hasReferenceStockWarning ? 1 : 0;
        if (bReferenceWarn !== aReferenceWarn) return bReferenceWarn - aReferenceWarn;
        return (a.groupName || '').localeCompare(b.groupName || '', 'vi');
      });
  }, [getWarehouseStockGroupLabel, productLookup, preparedWarehouseStockMovements, preparedWarehouseStockCounts]);

  const warehouseStockRows = useMemo(
    () => buildWarehouseStockRowsForDate(workingDate),
    [buildWarehouseStockRowsForDate, workingDate]
  );

  const warehouseStockVisibilitySettings = useMemo(
    () => normalizeWarehouseStockVisibilitySettings(currentCompany?.warehouseStockVisibilitySettings || {}),
    [currentCompany?.warehouseStockVisibilitySettings]
  );
  const hiddenWarehouseStockGroupKeys = useMemo(
    () => new Set(warehouseStockVisibilitySettings.hiddenGroupKeys),
    [warehouseStockVisibilitySettings]
  );
  const hiddenWarehouseStockUnitKeyMap = useMemo(
    () => new Map(Object.entries(warehouseStockVisibilitySettings.hiddenUnitKeysByGroup || {})
      .map(([groupKey, unitKeys]) => [groupKey, new Set(unitKeys)])),
    [warehouseStockVisibilitySettings]
  );
  const getRenderableWarehouseStockMeasureRows = useCallback((row = {}) => {
    return row.measureRows?.length
      ? row.measureRows
      : normalizeWarehouseMeasureEntries([
        { unit: row.unit, quantity: row.remainingQty },
        { unit: 'Kg', quantity: row.remainingKg }
      ]).map(measure => ({ unit: measure.unit, imported: 0, exported: 0, remaining: measure.quantity }));
  }, []);
  const getVisibleWarehouseStockMeasureRows = useCallback((row = {}) => {
    const hiddenUnitKeys = hiddenWarehouseStockUnitKeyMap.get(row.key) || new Set();
    return getRenderableWarehouseStockMeasureRows(row)
      .filter(measure => !hiddenUnitKeys.has(normalizeLookupText(measure.unit)));
  }, [getRenderableWarehouseStockMeasureRows, hiddenWarehouseStockUnitKeyMap]);
  const visibleWarehouseStockRows = useMemo(
    () => warehouseStockRows.filter(row => !hiddenWarehouseStockGroupKeys.has(row.key)),
    [hiddenWarehouseStockGroupKeys, warehouseStockRows]
  );
  const hiddenWarehouseStockUnitRows = useMemo(() => {
    const rowMap = new Map(warehouseStockRows.map(row => [row.key, row]));
    return Object.entries(warehouseStockVisibilitySettings.hiddenUnitKeysByGroup || {}).flatMap(([groupKey, unitKeys]) => {
      const row = rowMap.get(groupKey);
      return (unitKeys || []).map(unitKey => {
        const measure = getRenderableWarehouseStockMeasureRows(row || {})
          .find(item => normalizeLookupText(item.unit) === normalizeLookupText(unitKey));
        return {
          groupKey,
          unitKey: normalizeLookupText(unitKey),
          groupName: row?.groupName || groupKey,
          unitLabel: measure?.unit || unitKey
        };
      });
    });
  }, [getRenderableWarehouseStockMeasureRows, warehouseStockRows, warehouseStockVisibilitySettings]);
  const hiddenWarehouseStockGroupRows = useMemo(() => {
    const rowMap = new Map(warehouseStockRows.map(row => [row.key, row]));
    return warehouseStockVisibilitySettings.hiddenGroupKeys.map(groupKey => ({
      groupKey,
      groupName: rowMap.get(groupKey)?.groupName || groupKey
    }));
  }, [warehouseStockRows, warehouseStockVisibilitySettings]);
  const hiddenWarehouseStockItemCount = hiddenWarehouseStockGroupRows.length + hiddenWarehouseStockUnitRows.length;
  const saveWarehouseStockVisibilitySettings = useCallback(async (nextSettings, successMessage = 'Đã cập nhật hiển thị tồn kho.') => {
    if (!onUpdateCompanySettings) {
      setWarehouseStockVisibilityStatus('Tài khoản này chưa có quyền lưu cấu hình hiển thị tồn kho.');
      return;
    }
    const normalizedSettings = normalizeWarehouseStockVisibilitySettings(nextSettings);
    setWarehouseStockVisibilityStatus('Đang lưu cấu hình hiển thị...');
    try {
      const result = await onUpdateCompanySettings({ warehouseStockVisibilitySettings: normalizedSettings });
      if (result && result.success === false) {
        setWarehouseStockVisibilityStatus(result.message || 'Chưa lưu được cấu hình hiển thị tồn kho.');
        return;
      }
      setWarehouseStockVisibilityStatus(successMessage);
    } catch (error) {
      setWarehouseStockVisibilityStatus(getFriendlyFirebaseErrorMessage(error, 'Chưa lưu được cấu hình hiển thị tồn kho.'));
    }
  }, [onUpdateCompanySettings]);
  const hideWarehouseStockGroup = (row = {}) => {
    if (!row.key) return;
    const nextSettings = normalizeWarehouseStockVisibilitySettings(warehouseStockVisibilitySettings);
    if (!nextSettings.hiddenGroupKeys.includes(row.key)) {
      nextSettings.hiddenGroupKeys = [...nextSettings.hiddenGroupKeys, row.key];
    }
    saveWarehouseStockVisibilitySettings(nextSettings, `Đã ẩn nhóm ${row.groupName || 'này'} khỏi bảng đối chiếu.`);
  };
  const restoreWarehouseStockGroup = (groupKey = '') => {
    const safeGroupKey = `${groupKey || ''}`.trim();
    if (!safeGroupKey) return;
    const nextSettings = normalizeWarehouseStockVisibilitySettings(warehouseStockVisibilitySettings);
    nextSettings.hiddenGroupKeys = nextSettings.hiddenGroupKeys.filter(key => key !== safeGroupKey);
    saveWarehouseStockVisibilitySettings(nextSettings, 'Đã hiện lại nhóm hàng.');
  };
  const hideWarehouseStockUnit = (row = {}, measure = {}) => {
    if (!row.key || !measure.unit) return;
    const unitKey = normalizeLookupText(measure.unit);
    if (!unitKey) return;
    const nextSettings = normalizeWarehouseStockVisibilitySettings(warehouseStockVisibilitySettings);
    const currentUnitKeys = nextSettings.hiddenUnitKeysByGroup[row.key] || [];
    nextSettings.hiddenUnitKeysByGroup[row.key] = Array.from(new Set([...currentUnitKeys, unitKey]));
    saveWarehouseStockVisibilitySettings(nextSettings, `Đã ẩn chỉ số ${measure.unit} của ${row.groupName || 'nhóm hàng'}.`);
  };
  const restoreWarehouseStockUnit = (groupKey = '', unitKey = '') => {
    const safeGroupKey = `${groupKey || ''}`.trim();
    const safeUnitKey = normalizeLookupText(unitKey);
    if (!safeGroupKey || !safeUnitKey) return;
    const nextSettings = normalizeWarehouseStockVisibilitySettings(warehouseStockVisibilitySettings);
    nextSettings.hiddenUnitKeysByGroup[safeGroupKey] = (nextSettings.hiddenUnitKeysByGroup[safeGroupKey] || [])
      .filter(key => key !== safeUnitKey);
    if (nextSettings.hiddenUnitKeysByGroup[safeGroupKey].length === 0) {
      delete nextSettings.hiddenUnitKeysByGroup[safeGroupKey];
    }
    saveWarehouseStockVisibilitySettings(nextSettings, 'Đã hiện lại chỉ số theo dõi.');
  };
  const restoreAllWarehouseStockVisibility = () => {
    saveWarehouseStockVisibilitySettings({ hiddenGroupKeys: [], hiddenUnitKeysByGroup: {} }, 'Đã hiện lại toàn bộ bảng tồn kho đối chiếu.');
    setShowHiddenWarehouseStockItems(false);
  };

  const warehouseStockSummary = useMemo(() => ({
    groupCount: warehouseStockRows.length,
    warningCount: warehouseStockRows.filter(row => row.hasPrimaryStockWarning).length,
    totalRemainingKg: warehouseStockRows.reduce((sum, row) => sum + (row.remainingKg || 0), 0)
  }), [warehouseStockRows]);
  const actualStockRows = useMemo(() => {
    const systemMap = new Map((warehouseStockRows || []).map(row => [row.key, row]));
    const actualMap = new Map();
    const latestActualGroups = selectLatestWarehouseStockCountMeasures(dayStockCounts, {
      getGroupKey: item => buildProcessingInventoryGroupKey(item.groupName || item.productGroup || 'Nhóm hàng'),
      getGroupName: item => normalizeLeadingLabel(item.groupName || item.productGroup || 'Nhóm hàng'),
      getDateKey: resolveWarehouseRecordDateKey,
      getTimestamp: item => Math.max(
        parseEntityTimestampValue(item.createdAt) || 0,
        parseEntityTimestampValue(item.updatedAt) || 0,
        getEntityTimestamp(item) || 0
      ),
      getMeasures: buildStoredWarehouseStockCountMeasureEntries,
      getUnitKey: measure => normalizeLookupText(normalizeWarehouseMeasureUnit(measure?.unit || ''))
    });
    latestActualGroups.forEach((group) => {
      const measureMap = new Map(group.measures.map(measure => [measure.unitKey, {
        unit: normalizeWarehouseMeasureUnit(measure.unit || 'Đơn vị'),
        actual: parseLooseQuantityValue(measure.quantity),
        actualItemId: measure.itemId || '',
        actualItem: measure.item || null
      }]));
      actualMap.set(group.key, {
        key: group.key,
        groupName: group.groupName,
        measureMap,
        items: group.items,
        countCount: group.items.length,
        latestAt: group.latestAt,
        latestItem: group.latestItem
      });
    });

    const allKeys = new Set([...systemMap.keys(), ...actualMap.keys()]);
    return Array.from(allKeys).map((key) => {
      const systemRow = systemMap.get(key);
      const actualRow = actualMap.get(key);
      const systemMeasures = systemRow?.measureRows || [];
      const actualMeasures = Array.from(actualRow?.measureMap?.values?.() || []);
      const unitKeys = new Set([
        ...systemMeasures.map(measure => normalizeLookupText(measure.unit)),
        ...actualMeasures.map(measure => normalizeLookupText(measure.unit))
      ]);
      getMandatoryWarehouseStockUnitsForGroup(systemRow?.groupName || actualRow?.groupName || '').forEach((unit) => {
        unitKeys.add(normalizeLookupText(unit));
      });
      const rawMeasureRows = Array.from(unitKeys).map((unitKey) => {
        const systemMeasure = systemMeasures.find(measure => normalizeLookupText(measure.unit) === unitKey);
        const actualMeasure = actualMeasures.find(measure => normalizeLookupText(measure.unit) === unitKey);
        const baseline = parseLooseQuantityValue(systemMeasure?.baseline);
        const imported = parseLooseQuantityValue(systemMeasure?.imported);
        const exported = parseLooseQuantityValue(systemMeasure?.exported);
        const expected = parseLooseQuantityValue(systemMeasure?.remaining);
        const actual = parseLooseQuantityValue(actualMeasure?.actual);
        const diff = actual - expected;
        return {
          unit: actualMeasure?.unit || systemMeasure?.unit || 'Đơn vị',
          baseline,
          imported,
          exported,
          expected,
           actual,
           diff,
           actualItemId: actualMeasure?.actualItemId || '',
           actualItem: actualMeasure?.actualItem || null,
           status: !actualMeasure ? 'uncounted' : Math.abs(diff) < 0.0001 ? 'ok' : diff < 0 ? 'loss' : 'surplus'
        };
      });
      const measureRows = annotateWarehouseMeasureRows(rawMeasureRows);
      const primaryRows = measureRows.filter(measure => measure.isPrimaryStockUnit);
      const rowsForStatus = primaryRows.length > 0 ? primaryRows : measureRows;
      const hasReferenceMismatch = measureRows.some(measure => measure.isReferenceStockUnit && measure.status !== 'ok' && measure.status !== 'uncounted');
      const status = resolveWarehouseStockCountStatus(rowsForStatus, Boolean(actualRow));
      return {
        key,
        groupName: actualRow?.groupName || systemRow?.groupName || 'Nhóm hàng',
        measureRows,
        primaryMeasureRows: primaryRows,
        referenceMeasureRows: measureRows.filter(measure => measure.isReferenceStockUnit),
        hasReferenceMismatch,
        status,
        countCount: actualRow?.countCount || 0,
        latestAt: actualRow?.latestAt || 0,
        items: actualRow?.items || [],
        latestItem: actualRow?.latestItem || null
      };
    }).sort((a, b) => {
      const order = { loss: 0, surplus: 1, ok: 2, uncounted: 3 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return (a.groupName || '').localeCompare(b.groupName || '', 'vi');
    });
  }, [dayStockCounts, warehouseStockRows]);

  const actualStockSummary = useMemo(() => ({
    groupCount: actualStockRows.length,
    countedCount: actualStockRows.filter(row => row.countCount > 0).length,
    mismatchCount: actualStockRows.filter(row => row.countCount > 0 && row.status !== 'ok').length,
    lossCount: actualStockRows.filter(row => row.countCount > 0 && row.status === 'loss').length
  }), [actualStockRows]);
  const actualStockLookup = useMemo(() => new Map(actualStockRows.map(row => [row.key, row])), [actualStockRows]);
  const warehouseMovementMonthKey = buildMonthKeyFromDate(workingDate || getTodayString());
  const warehouseMovementUnitOptions = useMemo(() => {
    const unitMap = new Map();
    (warehouseImports || [])
      .filter(item => !item?.isArchived && isAfterWarehouseStockReset(item))
      .filter(item => resolveWarehouseRecordDateKey(item).slice(0, 7) === warehouseMovementMonthKey)
      .forEach((item) => {
        buildStoredWarehouseMeasureEntries(item).forEach((measure) => {
          const unit = normalizeWarehouseMeasureUnit(measure.unit || 'Đơn vị');
          const key = normalizeLookupText(unit);
          if (key && !unitMap.has(key)) unitMap.set(key, unit);
        });
      });
    const options = sortWarehouseMeasureRows(Array.from(unitMap.entries()).map(([key, unit]) => ({ key, unit })))
      .map(option => ({ key: option.key, label: option.unit }));
    return options.length > 0
      ? options
      : [{ key: normalizeLookupText('Con'), label: 'Con' }, { key: normalizeLookupText('Kg'), label: 'Kg' }];
  }, [isAfterWarehouseStockReset, warehouseImports, warehouseMovementMonthKey]);
  useEffect(() => {
    if (warehouseMovementUnitOptions.some(option => option.key === warehouseMovementUnitFilter)) return;
    setWarehouseMovementUnitFilter(warehouseMovementUnitOptions[0]?.key || normalizeLookupText('Con'));
  }, [warehouseMovementUnitFilter, warehouseMovementUnitOptions]);
  const warehouseMovementSelectedUnitLabel = warehouseMovementUnitOptions
    .find(option => option.key === warehouseMovementUnitFilter)?.label || 'Đơn vị';
  const warehouseMovementMonthLabel = useMemo(() => {
    const [yearText, monthText] = `${warehouseMovementMonthKey || ''}`.split('-');
    const year = parseInt(yearText, 10);
    const month = parseInt(monthText, 10);
    return Number.isFinite(year) && Number.isFinite(month)
      ? `Tháng ${month}/${year}`
      : 'Tháng hiện tại';
  }, [warehouseMovementMonthKey]);
  const warehouseMovementMonthDateKeys = useMemo(() => {
    const [yearText, monthText] = `${warehouseMovementMonthKey || ''}`.split('-');
    const year = parseInt(yearText, 10);
    const month = parseInt(monthText, 10);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return [getTodayString()];
    }
    const daysInMonth = new Date(year, month, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, index) => `${warehouseMovementMonthKey}-${String(index + 1).padStart(2, '0')}`);
  }, [warehouseMovementMonthKey]);
  const warehouseMovementTableRows = useMemo(() => {
    // The monthly table has no visible consumers outside the report tab.
    if (warehouseInventoryTab !== 'report') return [];
    const selectedUnitKey = normalizeLookupText(warehouseMovementUnitFilter);
    const importedGroupKeysInMonth = new Set();
    (warehouseImports || [])
      .filter(item => !item?.isArchived && isAfterWarehouseStockReset(item))
      .forEach((item) => {
        const dateKey = resolveWarehouseRecordDateKey(item);
        if (!dateKey || `${dateKey}`.slice(0, 7) !== warehouseMovementMonthKey) return;
        importedGroupKeysInMonth.add(buildProcessingInventoryGroupKey(item.groupName || item.productGroup || 'Nhóm hàng'));
      });
    const getMeasureValue = (measure = {}, valueKey = 'quantity') => parseLooseQuantityValue(
      measure?.[valueKey]
      ?? measure?.quantity
      ?? measure?.remaining
      ?? measure?.actual
      ?? 0
    );
    const getSelectedMeasureValue = (measures = [], valueKey = 'quantity', groupKey = '') => {
      const hiddenUnits = hiddenWarehouseStockUnitKeyMap.get(groupKey) || new Set();
      const visibleMeasures = annotateWarehouseMeasureRows(measures || []).filter((measure) => {
        return !hiddenUnits.has(normalizeLookupText(measure.unit));
      });
      const selectedMeasure = visibleMeasures.find(measure => normalizeLookupText(measure.unit) === selectedUnitKey);
      return selectedMeasure ? getMeasureValue(selectedMeasure, valueKey) : 0;
    };
    const getItemGroupKey = (item = {}, product = null) => buildProcessingInventoryGroupKey(
      getWarehouseStockGroupLabel(item, product)
    );
    const shouldShowGroup = (groupKey = '') => !hiddenWarehouseStockGroupKeys.has(groupKey) && importedGroupKeysInMonth.has(groupKey);
    const getSelectedImportQuantity = (item = {}) => {
      const groupKey = buildProcessingInventoryGroupKey(item.groupName || item.productGroup || 'Nhóm hàng');
      if (!shouldShowGroup(groupKey)) return 0;
      return getSelectedMeasureValue(buildStoredWarehouseMeasureEntries(item), 'quantity', groupKey);
    };
    const getSelectedDispatchQuantity = (item = {}) => {
      const product = productLookup.get(item.productId);
      const groupKey = getItemGroupKey(item, product);
      if (!shouldShowGroup(groupKey)) return 0;
      return getSelectedMeasureValue(buildWarehouseDispatchMeasureEntries(item, product), 'quantity', groupKey);
    };
    const getSelectedStockCountMeasure = (measures = [], groupKey = '') => {
      const hiddenUnits = hiddenWarehouseStockUnitKeyMap.get(groupKey) || new Set();
      const visibleMeasures = annotateWarehouseMeasureRows(measures || []).filter(
        measure => !hiddenUnits.has(normalizeLookupText(measure.unit))
      );
      return visibleMeasures.find(measure => normalizeLookupText(measure.unit) === selectedUnitKey) || null;
    };

    return warehouseMovementMonthDateKeys.flatMap((dateKey) => {
      const groupRows = new Map();
      const ensureMovementGroupRow = (groupName = 'Nhóm hàng') => {
        const groupLabel = normalizeLeadingLabel(groupName || 'Nhóm hàng');
        const groupKey = buildProcessingInventoryGroupKey(groupLabel);
        if (!groupKey || !shouldShowGroup(groupKey)) return null;
        const key = `${dateKey}_${groupKey}_${warehouseMovementUnitFilter}`;
        if (!groupRows.has(key)) {
          groupRows.set(key, {
            key,
            dateKey,
            dayNumber: parseInt(dateKey.slice(8, 10), 10) || '',
            groupKey,
            groupName: groupLabel,
            unit: warehouseMovementSelectedUnitLabel,
            imported: 0,
            hasImport: false,
            exported: 0,
            expected: 0,
            actual: null,
            hasActual: false
          });
        }
        return groupRows.get(key);
      };
      const dayImportsForDate = (warehouseImports || [])
        .filter(item => !item?.isArchived && isAfterWarehouseStockReset(item))
        .filter(item => resolveWarehouseRecordDateKey(item) === dateKey);
      const dayDispatchesForDate = (warehouseDispatches || [])
        .filter(item => !item?.isArchived && !item?.__pendingFirebaseSync && isAfterWarehouseStockReset(item))
        .filter(item => resolveWarehouseRecordDateKey(item) === dateKey);
      const dayStockCountsForDate = (warehouseStockCounts || [])
        .filter(item => !item?.isArchived && isAfterWarehouseStockReset(item))
        .filter(item => resolveWarehouseRecordDateKey(item) === dateKey);
      const latestDayStockCountGroups = selectLatestWarehouseStockCountMeasures(dayStockCountsForDate, {
        getGroupKey: item => buildProcessingInventoryGroupKey(item.groupName || item.productGroup || 'Nhóm hàng'),
        getGroupName: item => normalizeLeadingLabel(item.groupName || item.productGroup || 'Nhóm hàng'),
        getDateKey: resolveWarehouseRecordDateKey,
        getTimestamp: item => Math.max(
          parseEntityTimestampValue(item.createdAt) || 0,
          parseEntityTimestampValue(item.updatedAt) || 0,
          getEntityTimestamp(item) || 0
        ),
        getMeasures: buildStoredWarehouseStockCountMeasureEntries,
        getUnitKey: measure => normalizeLookupText(normalizeWarehouseMeasureUnit(measure?.unit || '')),
        targetDate: dateKey
      });
      const expectedStockRows = buildWarehouseStockRowsForDate(dateKey).filter(row => shouldShowGroup(row.key));

      dayImportsForDate.forEach((item) => {
        const row = ensureMovementGroupRow(item.groupName || item.productGroup || 'Nhóm hàng');
        if (!row) return;
        const importedQuantity = getSelectedImportQuantity(item);
        if (importedQuantity <= 0) return;
        row.hasImport = true;
        row.imported += importedQuantity;
      });
      dayDispatchesForDate.forEach((item) => {
        const product = productLookup.get(item.productId);
        const row = ensureMovementGroupRow(getWarehouseStockGroupLabel(item, product));
        if (!row) return;
        row.exported += getSelectedDispatchQuantity(item);
      });
      expectedStockRows.forEach((stockRow) => {
        const row = ensureMovementGroupRow(stockRow.groupName || 'Nhóm hàng');
        if (!row) return;
        row.expected += getSelectedMeasureValue(stockRow.measureRows || [], 'remaining', stockRow.key);
      });
      latestDayStockCountGroups.forEach((group) => {
        const row = ensureMovementGroupRow(group.groupName || 'Nhóm hàng');
        if (!row) return;
        const selectedMeasure = getSelectedStockCountMeasure(
          group.measures.map(measure => ({ unit: measure.unit, quantity: measure.quantity })),
          group.key
        );
        if (!selectedMeasure) return;
        row.hasActual = true;
        row.actual = parseLooseQuantityValue(selectedMeasure.quantity);
      });

      return Array.from(groupRows.values())
        .map((row) => {
          const hasActual = !!row.hasActual;
          const actual = hasActual ? row.actual || 0 : null;
          const diff = hasActual ? actual - row.expected : null;
          return {
            ...row,
            actual,
            diff,
            status: !hasActual ? 'uncounted' : Math.abs(diff) < 0.0001 ? 'ok' : diff < 0 ? 'loss' : 'surplus'
          };
        })
        // Only show export/stock details for a group that was actually imported on this date.
        .filter(row => row.hasImport)
        .sort((a, b) => (a.groupName || '').localeCompare(b.groupName || '', 'vi'))
        .map((row, index) => ({
          ...row,
          isFirstDateRow: index === 0
        }));
    });
  }, [
    buildWarehouseStockRowsForDate,
    getWarehouseStockGroupLabel,
    hiddenWarehouseStockGroupKeys,
    hiddenWarehouseStockUnitKeyMap,
    isAfterWarehouseStockReset,
    productLookup,
    warehouseDispatches,
    warehouseImports,
    warehouseMovementMonthDateKeys,
    warehouseMovementSelectedUnitLabel,
    warehouseMovementUnitFilter,
    warehouseStockCounts,
    warehouseInventoryTab
  ]);
  const warehouseMovementTableGroups = useMemo(() => {
    const groups = [];
    (warehouseMovementTableRows || []).forEach((row) => {
      const dateKey = row.dateKey || '';
      let currentGroup = groups[groups.length - 1];
      if (!currentGroup || currentGroup.dateKey !== dateKey) {
        currentGroup = {
          dateKey,
          dayNumber: row.dayNumber,
          rows: []
        };
        groups.push(currentGroup);
      }
      currentGroup.rows.push(row);
    });
    return groups.sort((a, b) => `${b.dateKey || ''}`.localeCompare(`${a.dateKey || ''}`));
  }, [warehouseMovementTableRows]);
  const selectedWarehouseMovementRow = useMemo(
    () => (warehouseMovementTableRows || []).find(row => row.key === selectedWarehouseMovementRowKey) || null,
    [selectedWarehouseMovementRowKey, warehouseMovementTableRows]
  );
  useEffect(() => {
    if (warehouseInventoryTab !== 'report') return;
    if (!selectedWarehouseMovementRowKey) return;
    if (!selectedWarehouseMovementRow) setSelectedWarehouseMovementRowKey('');
  }, [selectedWarehouseMovementRow, selectedWarehouseMovementRowKey, warehouseInventoryTab]);
  useEffect(() => {
    if (!selectedWarehouseMovementRowKey || !selectedWarehouseMovementRow) return undefined;
    if (typeof window === 'undefined') return undefined;
    const scrollToDetail = () => {
      warehouseMovementDetailRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
      warehouseMovementDetailRef.current?.focus?.({ preventScroll: true });
    };
    const frameId = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame(scrollToDetail)
      : window.setTimeout(scrollToDetail, 0);
    return () => {
      if (typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(frameId);
      } else {
        window.clearTimeout(frameId);
      }
    };
  }, [selectedWarehouseMovementRow?.key, selectedWarehouseMovementRowKey]);
  const selectedWarehouseMovementDetails = useMemo(() => {
    if (!selectedWarehouseMovementRow) return null;
    const { dateKey, groupKey } = selectedWarehouseMovementRow;
    const isSameGroup = (groupName = '') => buildProcessingInventoryGroupKey(groupName || 'Nhóm hàng') === groupKey;
    const importItems = (warehouseImports || [])
      .filter(item => !item?.isArchived && isAfterWarehouseStockReset(item))
      .filter(item => resolveWarehouseRecordDateKey(item) === dateKey)
      .filter(item => isSameGroup(item.groupName || item.productGroup || 'Nhóm hàng'))
      .sort((a, b) => (getEntityTimestamp(b) || 0) - (getEntityTimestamp(a) || 0));
    const dispatchItems = (warehouseDispatches || [])
      .filter(item => !item?.isArchived && isAfterWarehouseStockReset(item))
      .filter(item => resolveWarehouseRecordDateKey(item) === dateKey)
      .filter((item) => {
        const product = productLookup.get(item.productId);
        return isSameGroup(getWarehouseStockGroupLabel(item, product));
      })
      .sort((a, b) => (getEntityTimestamp(b) || 0) - (getEntityTimestamp(a) || 0));
    const stockCountItems = (warehouseStockCounts || [])
      .filter(item => !item?.isArchived && isAfterWarehouseStockReset(item))
      .filter(item => resolveWarehouseRecordDateKey(item) === dateKey)
      .filter(item => isSameGroup(item.groupName || item.productGroup || 'Nhóm hàng'))
      .sort((a, b) => (getEntityTimestamp(b) || 0) - (getEntityTimestamp(a) || 0));
    return { importItems, dispatchItems, stockCountItems };
  }, [
    getWarehouseStockGroupLabel,
    isAfterWarehouseStockReset,
    productLookup,
    selectedWarehouseMovementRow,
    warehouseDispatches,
    warehouseImports,
    warehouseStockCounts
  ]);
  const openWarehouseMovementDetail = (row = {}) => {
    if (!row?.key) return;
    setSelectedWarehouseMovementRowKey(prev => (prev === row.key ? '' : row.key));
    if (row.dateKey) updateWarehouseWorkingDate(row.dateKey);
  };
  const buildActualStockPayloadForGroup = (groupName, selectedUnit, selectedValue, extra = {}) => {
    const groupLabel = normalizeLeadingLabel(groupName || 'Nhóm hàng');
    const groupKey = buildProcessingInventoryGroupKey(groupLabel);
    const actualRow = actualStockLookup.get(groupKey);
    const unit = normalizeWarehouseMeasureUnit(selectedUnit || 'Đơn vị');
    const unitKey = normalizeLookupText(unit);
    const measureMap = new Map();
    (actualRow?.measureRows || []).filter(measure => measure.status !== 'uncounted').forEach((measure) => {
      const currentUnit = normalizeWarehouseMeasureUnit(measure.unit || 'Đơn vị');
      const currentKey = normalizeLookupText(currentUnit);
      if (!currentKey) return;
      measureMap.set(currentKey, {
        unit: currentUnit,
        quantity: parseLooseQuantityValue(measure.actual)
      });
    });
    measureMap.set(unitKey, { unit, quantity: parseLooseQuantityValue(selectedValue) });
    const countedMeasures = Array.from(measureMap.values());
    const positiveMeasures = countedMeasures.filter(measure => measure.quantity > 0);
    const kgMeasure = positiveMeasures.find(measure => normalizeLookupText(measure.unit) === normalizeLookupText('Kg'));
    const primaryMeasure = positiveMeasures.find(measure => normalizeLookupText(measure.unit) !== normalizeLookupText('Kg'));
    const extraMeasures = positiveMeasures.filter(measure => {
      const key = normalizeLookupText(measure.unit);
      return key !== normalizeLookupText('Kg') && key !== normalizeLookupText(primaryMeasure?.unit || '');
    });
    return {
      groupName: groupLabel,
      totalKg: parseLooseQuantityValue(kgMeasure?.quantity),
      quantity: parseLooseQuantityValue(primaryMeasure?.quantity),
      quantityUnit: normalizeWarehouseMeasureUnit(primaryMeasure?.unit || 'Con'),
      measures: extraMeasures,
      extraMeasures,
      countedMeasures,
      date: workingDate,
      reason: canRecordActualStockReason ? (extra.reason || '') : '',
      note: `${extra.note || ''}`.trim(),
      varianceReasons: extra.varianceReasons || []
    };
  };
  const openQuickStockEdit = (row, measure) => {
    if (!canOpenActualStockForm) {
      setStockCountStatus('Tài khoản này chưa có quyền ghi nhận hoặc sửa tồn kho thực tế.');
      return;
    }
    const actualRow = actualStockLookup.get(row.key);
    const actualMeasure = actualRow?.measureRows?.find(item => normalizeLookupText(item.unit) === normalizeLookupText(measure.unit));
    const hasRecordedActual = hasRecordedWarehouseStockMeasure(actualMeasure);
    const sourceItem = hasRecordedActual ? (actualMeasure?.actualItem || null) : null;
    setQuickStockEdit({
      groupName: row.groupName,
      unit: normalizeWarehouseMeasureUnit(measure.unit),
      value: `${resolveWarehouseStockChecklistDisplayValue(actualMeasure, measure.remaining)}`,
      expected: parseLooseQuantityValue(measure.remaining),
      actualItemId: hasRecordedActual ? (actualMeasure?.actualItemId || sourceItem?.id || '') : '',
      reason: sourceItem?.reason || '',
      note: sourceItem?.note || ''
    });
    setStockCountStatus('');
  };
  const handleSaveQuickStockEdit = async () => {
    if (!quickStockEdit) return;
    const value = parseLooseQuantityValue(quickStockEdit.value);
    if (value < 0) {
      setStockCountStatus('Số tồn thực tế không hợp lệ.');
      return;
    }
    const payload = buildActualStockPayloadForGroup(quickStockEdit.groupName, quickStockEdit.unit, value, {
      reason: quickStockEdit.reason,
      note: quickStockEdit.note
    });
    try {
      setIsSavingStockCount(true);
      if (quickStockEdit.actualItemId && canEditActualStockCount && onEditWarehouseStockCount) {
        await onEditWarehouseStockCount(quickStockEdit.actualItemId, payload);
      } else if (canCreateActualStockCount && onAddWarehouseStockCount) {
        await onAddWarehouseStockCount(payload);
      } else {
        setStockCountStatus('Tài khoản này chưa có quyền lưu tồn kho thực tế.');
        return;
      }
      setStockCountStatus(`Đã cập nhật tồn thực tế ${quickStockEdit.groupName}: ${formatNumber(value)} ${quickStockEdit.unit}.`);
      setQuickStockEdit(null);
    } catch (error) {
      setStockCountStatus(getFriendlyFirebaseErrorMessage(error, 'Chưa cập nhật được tồn kho thực tế.'));
    } finally {
      setIsSavingStockCount(false);
    }
  };
  const openStockVarianceReport = (row, measure, actualMeasure) => {
    if (!hasRecordedWarehouseStockMeasure(actualMeasure) || actualMeasure.status === 'ok') return;
    const sourceItem = actualMeasure?.actualItem || actualStockLookup.get(row.key)?.latestItem || null;
    const savedReasons = Array.isArray(sourceItem?.varianceReasons)
      ? sourceItem.varianceReasons
      : [];
    const reasonMap = new Map(savedReasons.map(item => [item.reason, item.quantity]));
    setStockVarianceReport({
      groupName: row.groupName,
      unit: normalizeWarehouseMeasureUnit(measure.unit),
      baseline: parseLooseQuantityValue(actualMeasure.baseline),
      imported: parseLooseQuantityValue(actualMeasure.imported),
      exported: parseLooseQuantityValue(actualMeasure.exported),
      expected: parseLooseQuantityValue(actualMeasure.expected),
      actual: parseLooseQuantityValue(actualMeasure.actual),
      diff: Number(actualMeasure.diff || 0),
      actualItemId: actualMeasure?.actualItemId || sourceItem?.id || '',
      reasons: actualStockReasonOptions.map(reason => ({
        reason,
        quantity: reasonMap.get(reason) || ''
      }))
    });
  };
  const updateStockVarianceReason = (reason, quantity) => {
    setStockVarianceReport(prev => prev ? ({
      ...prev,
      reasons: (prev.reasons || []).map(item => item.reason === reason ? { ...item, quantity } : item)
    }) : prev);
  };
  const handleSaveStockVarianceReport = async () => {
    if (!stockVarianceReport) return;
    if (!canRecordActualStockReason) {
      setStockCountStatus('Tài khoản này chưa có quyền ghi nguyên nhân thất thoát.');
      return;
    }
    const varianceReasons = (stockVarianceReport.reasons || [])
      .map(item => ({
        reason: item.reason,
        quantity: parseLooseQuantityValue(item.quantity),
        unit: stockVarianceReport.unit
      }))
      .filter(item => item.quantity > 0);
    if (varianceReasons.length === 0) {
      setStockCountStatus('Vui lòng nhập ít nhất một nguyên nhân và số lượng lệch.');
      return;
    }
    const payload = buildActualStockPayloadForGroup(stockVarianceReport.groupName, stockVarianceReport.unit, stockVarianceReport.actual, {
      reason: varianceReasons[0]?.reason || '',
      note: varianceReasons.map(item => `${item.reason}: ${formatNumber(item.quantity)} ${item.unit}`).join('; '),
      varianceReasons
    });
    try {
      setIsSavingStockCount(true);
      if (stockVarianceReport.actualItemId && canEditActualStockCount && onEditWarehouseStockCount) {
        await onEditWarehouseStockCount(stockVarianceReport.actualItemId, payload);
      } else if (canCreateActualStockCount && onAddWarehouseStockCount) {
        await onAddWarehouseStockCount(payload);
      } else {
        setStockCountStatus('Tài khoản này chưa có quyền lưu báo cáo thất thoát.');
        return;
      }
      setStockCountStatus('Đã lưu nguyên nhân sai lệch tồn kho.');
      setStockVarianceReport(null);
    } catch (error) {
      setStockCountStatus(getFriendlyFirebaseErrorMessage(error, 'Chưa lưu được nguyên nhân sai lệch.'));
    } finally {
      setIsSavingStockCount(false);
    }
  };
  const warehouseStockChecklistRows = useMemo(
    () => buildWarehouseStockChecklistRows(warehouseStockRows),
    [warehouseStockRows]
  );
  const canOpenActualStockForm = canCreateActualStockCount || canEditActualStockCount;
  useEffect(() => {
    if (quickActionIntent?.type !== 'create_actual_stock_count') return;
    setWarehouseInventoryTab('stock');
    const firstRow = warehouseStockChecklistRows[0];
    const firstMeasure = firstRow?.measureRows?.[0];
    if (canOpenActualStockForm && firstRow && firstMeasure) {
      openQuickStockEdit(firstRow, firstMeasure);
    } else {
      setStockCountStatus(canOpenActualStockForm
        ? 'Chưa có nhóm hàng trong tồn kho để kiểm thực tế.'
        : 'Tài khoản này chưa có quyền kiểm tồn thực tế.');
    }
    onQuickActionHandled();
  }, [canOpenActualStockForm, onQuickActionHandled, quickActionIntent?.id, quickActionIntent?.type, warehouseStockChecklistRows]);

  const suggestedAmount = useMemo(() => {
    return purchaseAmount({ ...draft, totalKg: parseLooseQuantityValue(draft.totalKg), quantity: parseLooseQuantityValue(draft.quantity), unitPrice: parseLooseMoneyValue(draft.unitPrice) }, draft.purchaseUnit || 'Kg');
  }, [draft]);
  const isEditingImport = Boolean(editingImportId);
  const canSubmitImportForm = isEditingImport ? canEditWarehouseImport : canCreateWarehouseImport;

  const updateDraft = (patch) => {
    setDraft(prev => ({ ...prev, ...patch }));
    setStatus('');
  };
  const handleSaveCustomQuantityUnit = async (event) => {
    event?.preventDefault?.();
    const normalizedUnit = normalizeWarehouseQuantityUnit(customQuantityUnitDraft);
    if (!normalizedUnit) {
      setCustomQuantityUnitStatus('Vui lòng nhập tên đơn vị.');
      return;
    }
    if (!onUpdateCompanySettings) {
      setCustomQuantityUnitStatus('Chưa có quyền lưu đơn vị dùng chung cho công ty.');
      return;
    }
    const nextUnits = addWarehouseQuantityUnit(customQuantityUnits, normalizedUnit);
    try {
      const result = await onUpdateCompanySettings({ warehouseQuantityUnits: nextUnits });
      if (result?.success === false) throw new Error(result.message || 'Không thể lưu đơn vị mới.');
      updateDraft({ quantityUnit: normalizedUnit });
      setCustomQuantityUnitDraft('');
      setCustomQuantityUnitStatus('');
      setShowCustomQuantityUnitModal(false);
      setShowQuantityUnitPicker(false);
      setStatus(`Đã lưu đơn vị ${normalizedUnit} và chọn cho phiếu nhập hiện tại.`);
    } catch (error) {
      setCustomQuantityUnitStatus(error?.message || 'Chưa lưu được đơn vị mới.');
    }
  };
  const resetImportDraft = () => {
    setEditingImportId('');
    setDraft(prev => ({
      ...prev,
      productId: '',
      productName: '',
      productCode: '',
      productBarcode: '',
      totalKg: '',
      quantity: '',
      extraMeasures: [],
      supplier: '',
      supplierCustomerId: '',
      supplierPhone: '',
      unitPrice: '',
      purchaseUnit: 'Kg',
      amount: '',
      note: ''
    }));
    setStatus('');
    setWarehouseProductScanStatus('');
  };
  const handleEditImportFromItem = (item = {}) => {
    if (!item?.id || (!canEditWarehouseImport && !canDeleteWarehouseImport)) return;
    const measures = buildStoredWarehouseMeasureEntries(item);
    const normalizedUnit = normalizeWarehouseMeasureUnit(item.quantityUnit || item.unit || 'Con');
    const primaryMeasures = measures.filter(measure => {
      const unitKey = normalizeLookupText(measure.unit);
      return unitKey !== normalizeLookupText('Kg') && unitKey !== normalizeLookupText(normalizedUnit);
    });
    setEditingImportId(item.id);
    setWorkingDate(item.date || workingDate || getTodayString());
    setDraft({
      productId: item.productId || '',
      productName: item.productName || item.productNameSnapshot || '',
      productCode: item.productCode || item.productBarcode || item.barcode || '',
      productBarcode: item.productBarcode || item.barcode || '',
      groupName: normalizeLeadingLabel(item.groupName || item.productGroup || draft.groupName || 'Nhóm hàng'),
      totalKg: parseLooseQuantityValue(item.totalKg ?? item.weightKg) || '',
      quantity: parseLooseQuantityValue(item.quantity ?? item.totalQuantity) || '',
      quantityUnit: normalizedUnit,
      extraMeasures: primaryMeasures,
      sourceType: normalizeWarehouseImportSourceType(item.sourceType),
      supplier: item.supplier || '',
      supplierCustomerId: item.supplierCustomerId || '',
      supplierPhone: item.supplierPhone || '',
      unitPrice: parseLooseMoneyValue(item.unitPrice) || '',
      purchaseUnit: item.purchaseUnit || 'Kg',
      amount: parseLooseMoneyValue(item.amount) || '',
      note: item.note || ''
    });
    setWarehouseProductScanStatus(item.productName || item.productCode || item.barcode ? 'Đang sửa phiếu có gắn mã sản phẩm.' : '');
    setStatus('Đang sửa phiếu nhập kho. Kiểm tra lại thông tin rồi bấm cập nhật.');
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame?.(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }
  };
  const handleDeleteEditingImport = async () => {
    if (!editingImportId || !canDeleteWarehouseImport || !onDeleteWarehouseImport) return;
    if (typeof window !== 'undefined' && !window.confirm('Xóa phiếu nhập kho này?')) return;
    await onDeleteWarehouseImport(editingImportId);
    resetImportDraft();
    setStatus('Đã xóa phiếu nhập kho.');
  };
  const updateStockCountDraft = (patch) => {
    setStockCountDraft(prev => ({ ...prev, ...patch }));
    setStockCountStatus('');
  };
  const resetStockCountDraft = () => {
    setEditingStockCountId('');
    setStockCountDraft(prev => ({
      ...prev,
      totalKg: '',
      quantity: '',
      reason: '',
      note: ''
    }));
  };
  const handleEditStockCountFromItem = (item = {}) => {
    const countedMeasures = buildStoredWarehouseStockCountMeasureEntries(item);
    const kgMeasure = countedMeasures.find(measure => isWarehouseWeightUnit(measure.unit));
    const quantityMeasure = countedMeasures.find(measure => !isWarehouseWeightUnit(measure.unit));
    setEditingStockCountId(item.id || '');
    setStockCountDraft({
      groupName: normalizeLeadingLabel(item.groupName || item.productGroup || stockCountDraft.groupName || 'Nhóm hàng'),
      totalKg: kgMeasure ? `${parseLooseQuantityValue(kgMeasure.quantity)}` : '',
      quantity: quantityMeasure ? `${parseLooseQuantityValue(quantityMeasure.quantity)}` : '',
      quantityUnit: normalizeWarehouseMeasureUnit(quantityMeasure?.unit || item.quantityUnit || item.unit || 'Con'),
      reason: item.reason || '',
      note: item.note || ''
    });
    setStockCountStatus('Đang sửa phiếu kiểm tồn thực tế. Kiểm tra lại số và bấm cập nhật.');
  };
  const handleDeleteStockCountItem = async (item = {}) => {
    if (!item?.id || !canDeleteActualStockCount || !onDeleteWarehouseStockCount) return;
    if (typeof window !== 'undefined' && !window.confirm('Xóa phiếu kiểm tồn thực tế này?')) return;
    await onDeleteWarehouseStockCount(item.id);
    if (editingStockCountId === item.id) resetStockCountDraft();
    setStockCountStatus('Đã xóa phiếu kiểm tồn thực tế.');
  };

  const handleSubmitStockCount = async (event) => {
    event?.preventDefault?.();
    if (stockCountSubmitRef.current) return;
    const isEditingStockCount = Boolean(editingStockCountId);
    if (isEditingStockCount && (!canEditActualStockCount || !onEditWarehouseStockCount)) {
      setStockCountStatus('Tài khoản này chưa có quyền sửa tồn kho thực tế.');
      return;
    }
    if (!isEditingStockCount && (!canCreateActualStockCount || !onAddWarehouseStockCount)) {
      setStockCountStatus('Tài khoản này chưa có quyền ghi nhận tồn kho thực tế.');
      return;
    }
    const groupName = normalizeLeadingLabel(stockCountDraft.groupName || '');
    const quantity = parseLooseQuantityValue(stockCountDraft.quantity);
    const totalKg = parseLooseQuantityValue(stockCountDraft.totalKg);
    const hasQuantityInput = `${stockCountDraft.quantity ?? ''}`.trim() !== '';
    const hasTotalKgInput = `${stockCountDraft.totalKg ?? ''}`.trim() !== '';
    const countedMeasures = normalizeWarehouseCountedMeasureEntries([
      hasQuantityInput ? { unit: stockCountDraft.quantityUnit || 'Con', quantity } : null,
      hasTotalKgInput ? { unit: 'Kg', quantity: totalKg } : null
    ].filter(Boolean));
    const measures = buildWarehouseImportMeasureEntries({
      totalKg,
      quantity,
      quantityUnit: stockCountDraft.quantityUnit || 'Con'
    });

    if (!groupName) {
      setStockCountStatus('Vui lòng chọn nhóm hàng cần kiểm thực tế.');
      return;
    }
    if (countedMeasures.length === 0) {
      setStockCountStatus('Cần nhập ít nhất một chỉ số thực tế như số con, số kg, số bao hoặc số thùng.');
      return;
    }

    try {
      stockCountSubmitRef.current = true;
      setIsSavingStockCount(true);
      const payload = {
        clientMutationId: stockCountCommandRef.current,
        groupName,
        totalKg,
        quantity,
        quantityUnit: normalizeWarehouseMeasureUnit(stockCountDraft.quantityUnit || 'Con'),
        measures,
        extraMeasures: [],
        countedMeasures,
        date: workingDate,
        reason: canRecordActualStockReason ? stockCountDraft.reason : '',
        note: `${stockCountDraft.note || ''}`.trim()
      };
      if (isEditingStockCount) {
        await onEditWarehouseStockCount(editingStockCountId, payload);
      } else {
        await onAddWarehouseStockCount(payload);
      }
      setStockCountStatus(`${isEditingStockCount ? 'Đã tiếp nhận cập nhật' : 'Đã tiếp nhận'} phiếu tồn thực tế ${groupName}. Kiểm tra trạng thái đồng bộ.`);
      stockCountCommandRef.current = globalThis.crypto.randomUUID();
      resetStockCountDraft();
      syncWarehouseGroupInBackground(groupName);
    } catch (error) {
      setStockCountStatus(getFriendlyFirebaseErrorMessage(error, 'Chưa lưu được tồn kho thực tế.'));
    } finally {
      stockCountSubmitRef.current = false;
      setIsSavingStockCount(false);
    }
  };

  const handleSubmitVpsStockCount = async (event) => {
    event?.preventDefault?.();
    if (!isVpsMode || !onAddWarehouseStockCount || isSavingVpsStockCount) return;
    const { warehouseId, productId, unitId, countedQuantity, reason, note } = vpsStockCountDraft;
    const quantity = parseLooseQuantityValue(countedQuantity);
    if (!warehouseId || !productId || !unitId) {
      setVpsStockCountStatus('Vui lòng chọn đủ kho, sản phẩm và đơn vị tồn VPS.');
      return;
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      setVpsStockCountStatus('Số lượng kiểm thực tế phải là số không âm.');
      return;
    }
    setIsSavingVpsStockCount(true);
    setVpsStockCountStatus('Đang tạo session, ghi line và post kiểm tồn...');
    try {
      await onAddWarehouseStockCount({
        vpsContract: true,
        warehouseId,
        productId,
        unitId,
        countedQuantity: quantity,
        reason: canRecordActualStockReason ? `${reason || ''}`.trim() : '',
        note: `${note || ''}`.trim(),
      });
      setVpsStockCountDraft(prev => ({ ...prev, countedQuantity: '', reason: '', note: '' }));
      setVpsStockCountStatus('Đã post kiểm tồn VPS theo product/unit line.');
    } catch (error) {
      setVpsStockCountStatus(getFriendlyFirebaseErrorMessage(error, 'Chưa post được kiểm tồn VPS.'));
    } finally {
      setIsSavingVpsStockCount(false);
    }
  };

  const handleSubmitVpsOpeningBalance = async (event) => {
    event?.preventDefault?.();
    if (!isVpsMode || !canPostVpsOpeningBalance || !onPostInventoryOpeningBalance || isSavingVpsOpeningBalance) return;
    const { warehouseId, productId, unitId, quantity: rawQuantity, asOf, reason } = vpsOpeningBalanceDraft;
    const quantity = parseLooseQuantityValue(rawQuantity);
    if (!warehouseId || !productId || !unitId) {
      setVpsOpeningBalanceStatus('Vui lòng chọn đủ kho, sản phẩm và UOM cho tồn đầu kỳ VPS.');
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setVpsOpeningBalanceStatus('Số lượng tồn đầu kỳ phải lớn hơn 0.');
      return;
    }
    if (!asOf || Number.isNaN(Date.parse(asOf))) {
      setVpsOpeningBalanceStatus('Vui lòng chọn thời điểm chốt tồn đầu kỳ hợp lệ.');
      return;
    }
    setIsSavingVpsOpeningBalance(true);
    setVpsOpeningBalanceStatus('Đang post tồn đầu kỳ VPS...');
    try {
      await onPostInventoryOpeningBalance({
        vpsContract: true,
        warehouseId,
        productId,
        unitId,
        quantity,
        asOf,
        reason: `${reason || ''}`.trim(),
      });
      setVpsOpeningBalanceDraft(prev => ({ ...prev, quantity: '', reason: '' }));
      setVpsOpeningBalanceStatus('Đã post tồn đầu kỳ VPS theo product/warehouse/UOM. Weight chưa thuộc contract inventory hiện tại.');
    } catch (error) {
      setVpsOpeningBalanceStatus(getFriendlyFirebaseErrorMessage(error, 'Chưa post được tồn đầu kỳ VPS.'));
    } finally {
      setIsSavingVpsOpeningBalance(false);
    }
  };

  const handleSubmit = async (event) => {
    event?.preventDefault?.();
    if (importSubmitRef.current) return;
    if (isEditingImport && (!canEditWarehouseImport || !onEditWarehouseImport)) {
      setStatus('Tài khoản này chưa có quyền sửa phiếu nhập kho.');
      return;
    }
    if (!isEditingImport && (!canCreateWarehouseImport || !onAddWarehouseImport)) {
      setStatus('Tài khoản này chưa có quyền tạo phiếu nhập kho.');
      return;
    }
    let groupName = normalizeLeadingLabel(draft.groupName || '');
    const quantity = parseLooseQuantityValue(draft.quantity);
    const totalKg = parseLooseQuantityValue(draft.totalKg);
    const unitPrice = parseLooseMoneyValue(draft.unitPrice);
    const amount = suggestedAmount;
    if (unitPrice > 0 && amount <= 0) {
      setStatus(`Vui lòng nhập số lượng theo đơn vị nhập ${draft.purchaseUnit || 'Kg'} để tính tiền.`);
      return;
    }
    const sourceType = normalizeWarehouseImportSourceType(draft.sourceType);
    const supplierCustomer = findSupplierCustomerMatch(draft.supplier, draft.supplierCustomerId);
    const supplierName = `${draft.supplier || ''}`.trim() || (supplierCustomer ? getSupplierCustomerLabel(supplierCustomer) : '');
    const matchedProduct = draft.productId
      ? (products || []).find(product => product.id === draft.productId)
      : warehouseProductCodeLookup.get(normalizeLookupText(draft.productCode || ''));
    const productName = matchedProduct?.name || matchedProduct?.productName || draft.productName || '';
    if (!draft.productId && matchedProduct) {
      const productGroupName = getWarehouseInventoryGroupLabel(matchedProduct, productName);
      if (productGroupName) groupName = productGroupName;
    }
    const productCode = `${draft.productCode || matchedProduct?.barcode || matchedProduct?.sku || matchedProduct?.code || matchedProduct?.productCode || ''}`.trim();
    const productBarcode = `${draft.productBarcode || matchedProduct?.barcode || matchedProduct?.productBarcode || productCode || ''}`.trim();
    const measures = buildWarehouseImportMeasureEntries({
      totalKg,
      quantity,
      quantityUnit: draft.quantityUnit || 'Con',
      extraMeasures: draft.extraMeasures || []
    });

    if (!groupName) {
      setStatus('Vui lòng chọn nhóm hàng trước khi lưu.');
      return;
    }
    if (measures.length === 0) {
      setStatus('Cần nhập ít nhất một chỉ số tồn kho như số con, số kg, số bao hoặc số thùng.');
      return;
    }

    try {
      importSubmitRef.current = true;
      setIsSaving(true);
      const payload = {
        clientMutationId: importCommandRef.current,
        warehouseId: draft.warehouseId || '',
        unitId: draft.unitId || '',
        unitLabel: vpsUnits.find(unit => unit.id === draft.unitId)?.symbol
          || vpsUnits.find(unit => unit.id === draft.unitId)?.name
          || '',
        productId: matchedProduct?.id || draft.productId || '',
        productName,
        productNameSnapshot: productName,
        productCode,
        productBarcode,
        barcode: productBarcode || productCode,
        groupName,
        totalKg,
        quantity,
        quantityUnit: normalizeLeadingLabel(draft.quantityUnit || 'Con'),
        purchaseUnit: draft.purchaseUnit || 'Kg',
        sourceType,
        sourceLabel: getWarehouseImportSourceLabel(sourceType),
        supplier: supplierName,
        supplierCustomerId: supplierCustomer?.id || '',
        supplierPhone: supplierCustomer?.phone || supplierCustomer?.phoneNumber || draft.supplierPhone || '',
        measures,
        extraMeasures: draft.extraMeasures || [],
        unitPrice,
        amount,
        date: workingDate,
        note: `${draft.note || ''}`.trim()
      };
      if (isEditingImport) {
        await onEditWarehouseImport(editingImportId, payload);
      } else {
        await onAddWarehouseImport(payload);
      }
      setStatus(isVpsMode
        ? `Đã lưu nhập kho ${groupName}.`
        : `Đã lưu tạm ${isEditingImport ? 'cập nhật' : 'phiếu'} nhập kho ${groupName} và phiếu chi đi kèm. Đang đồng bộ.`);
      importCommandRef.current = globalThis.crypto.randomUUID();
      setDraft(prev => ({
        ...prev,
        warehouseId: '',
        unitId: '',
        productId: '',
        productName: '',
        productCode: '',
        productBarcode: '',
        totalKg: '',
        quantity: '',
        extraMeasures: [],
        unitPrice: '',
        purchaseUnit: 'Kg',
        amount: '',
        note: ''
      }));
      setWarehouseProductScanStatus('');
      setEditingImportId('');
      syncWarehouseGroupInBackground(groupName);
    } catch (error) {
      setStatus(getFriendlyFirebaseErrorMessage(error, 'Chưa lưu được phiếu nhập kho.'));
    } finally {
      importSubmitRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <div className="premium-data-module premium-inventory-module space-y-4 pb-6">
      {groupSyncStatus && <p role="status" className="text-sm text-amber-700">{groupSyncStatus}</p>}
      <div className="premium-data-toolbar grid grid-cols-3 gap-2 rounded-[26px] border border-emerald-100 bg-white p-2 shadow-sm">
        {[
          { key: 'import', label: 'Nhập', count: dayImports.length },
          { key: 'export', label: 'Xuất', count: dayExportRows.length },
          { key: 'stock', label: 'Tồn', count: warehouseStockSummary.warningCount }
        ].map(tab => {
          const isActive = warehouseInventoryTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setWarehouseInventoryTab(tab.key)}
              className={`rounded-2xl px-2 py-3 text-center text-sm font-black transition active:scale-[0.98] ${isActive ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-50 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700'}`}
            >
              <span>{tab.label}</span>
              <span className={`ml-1 inline-flex min-w-5 justify-center rounded-full px-1.5 py-0.5 text-[10px] ${isActive ? 'bg-white/20 text-white' : 'bg-white text-slate-500'}`}>{formatNumber(tab.count || 0)}</span>
            </button>
          );
        })}
      </div>

      {warehouseInventoryTab === 'import' && (
        <>
      {isVpsMode && canPostVpsOpeningBalance && (
        <section className="mb-3 rounded-[30px] border border-violet-100 bg-violet-50/50 p-4 shadow-sm">
          <div className="mb-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-700">Tồn đầu kỳ VPS</p>
            <p className="mt-1 text-xs font-semibold text-violet-900/75">Chỉ post khi đã có snapshot được phê duyệt. Bắt buộc chọn kho, sản phẩm, UOM, số lượng và thời điểm chốt; không tự quy đổi.</p>
          </div>
          <form onSubmit={handleSubmitVpsOpeningBalance} className="grid grid-cols-1 gap-2 md:grid-cols-5">
            <select
              value={vpsOpeningBalanceDraft.warehouseId}
              onChange={event => setVpsOpeningBalanceDraft(prev => ({ ...prev, warehouseId: event.target.value }))}
              className="rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-violet-500"
              required
            >
              <option value="">Chọn kho</option>
              {vpsWarehouses.filter(item => !item?.deletedAt).map(item => (
                <option key={item.id} value={item.id}>{item.code || item.name} - {item.name}</option>
              ))}
            </select>
            <select
              value={vpsOpeningBalanceDraft.productId}
              onChange={event => setVpsOpeningBalanceDraft(prev => ({ ...prev, productId: event.target.value }))}
              className="rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-violet-500"
              required
            >
              <option value="">Chọn sản phẩm</option>
              {products.filter(item => !item?.isArchived).map(item => (
                <option key={item.id} value={item.id}>{item.code || item.name} - {item.name}</option>
              ))}
            </select>
            <select
              value={vpsOpeningBalanceDraft.unitId}
              onChange={event => setVpsOpeningBalanceDraft(prev => ({ ...prev, unitId: event.target.value }))}
              className="rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-violet-500"
              required
            >
              <option value="">Chọn UOM</option>
              {vpsUnits.filter(item => !item?.deletedAt).map(item => (
                <option key={item.id} value={item.id}>{item.symbol || item.code || item.name} - {item.name}</option>
              ))}
            </select>
            <input
              type="number"
              min="0.000001"
              step="0.000001"
              value={vpsOpeningBalanceDraft.quantity}
              onChange={event => setVpsOpeningBalanceDraft(prev => ({ ...prev, quantity: event.target.value }))}
              placeholder="Số lượng"
              className="rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-violet-500"
              required
            />
            <input
              type="datetime-local"
              value={vpsOpeningBalanceDraft.asOf}
              onChange={event => setVpsOpeningBalanceDraft(prev => ({ ...prev, asOf: event.target.value }))}
              className="rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-violet-500"
              required
            />
            <input
              type="text"
              value={vpsOpeningBalanceDraft.reason}
              onChange={event => setVpsOpeningBalanceDraft(prev => ({ ...prev, reason: event.target.value }))}
              placeholder="Lý do / phê duyệt"
              className="rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-violet-500 md:col-span-3"
            />
            <button
              type="submit"
              disabled={isSavingVpsOpeningBalance || vpsWarehouses.length === 0 || vpsUnits.length === 0 || products.length === 0}
              className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-black text-white shadow-sm disabled:opacity-50"
            >
              {isSavingVpsOpeningBalance ? 'Đang post' : 'Post tồn đầu kỳ'}
            </button>
          </form>
          {vpsOpeningBalanceStatus && <p className="mt-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-violet-800">{vpsOpeningBalanceStatus}</p>}
          {(vpsWarehouses.length === 0 || vpsUnits.length === 0 || products.length === 0) && (
            <p className="mt-2 text-xs font-semibold text-amber-700">Thiếu master kho, UOM hoặc sản phẩm VPS; không thể post an toàn.</p>
          )}
        </section>
      )}
      <form onSubmit={handleSubmit} data-keyboard-guard="off" className="rounded-[30px] border border-gray-100 bg-white p-4 shadow-sm">
        {isVpsMode && (
          <div className="mb-3 grid grid-cols-1 gap-2 rounded-2xl border border-blue-100 bg-blue-50/60 p-3 sm:grid-cols-2">
            <label className="min-w-0">
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-blue-700">Kho VPS</span>
              <select
                value={draft.warehouseId || ''}
                onChange={event => updateDraft({ warehouseId: event.target.value })}
                className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500"
                required
              >
                <option value="">Chọn kho đã xác định</option>
                {vpsWarehouses.filter(item => !item?.deletedAt).map(warehouse => (
                  <option key={warehouse.id} value={warehouse.id}>{warehouse.code || warehouse.name} - {warehouse.name}</option>
                ))}
              </select>
            </label>
            <label className="min-w-0">
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-blue-700">Đơn vị tồn VPS</span>
              <select
                value={draft.unitId || ''}
                onChange={event => {
                  const selectedUnit = vpsUnits.find(unit => unit.id === event.target.value);
                  updateDraft({
                    unitId: event.target.value,
                    quantityUnit: normalizeWarehouseMeasureUnit(selectedUnit?.symbol || selectedUnit?.code || selectedUnit?.name || ''),
                  });
                }}
                className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500"
                required
              >
                <option value="">Chọn UOM, không tự quy đổi</option>
                {vpsUnits.filter(item => !item?.deletedAt).map(unit => (
                  <option key={unit.id} value={unit.id}>{unit.symbol || unit.code || unit.name} - {unit.name}</option>
                ))}
              </select>
            </label>
            {(vpsWarehouses.length === 0 || vpsUnits.length === 0) && (
              <p className="sm:col-span-2 text-xs font-semibold text-amber-700">Chưa có master kho/UOM VPS để chọn. Không thể ghi nhận nhập kho an toàn.</p>
            )}
          </div>
        )}
        {isEditingImport && (
          <div className="mb-3 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">
            Đang sửa phiếu nhập kho. Bấm cập nhật để lưu thay đổi hoặc hủy để quay lại tạo mới.
          </div>
        )}
        <div className="grid grid-cols-1 gap-3">
          <div data-search-zone="true" className="relative min-w-0">
            <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-gray-500">Mã SP / quét mã</span>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <input
                ref={node => { warehouseImportFieldRefs.current.productCode = node; }}
                type="text"
                enterKeyHint="next"
                value={draft.productCode || ''}
                onFocus={event => {
                  setShowGroupPicker(false);
                  setShowSupplierPicker(false);
                  setShowStockCountGroupPicker(false);
                  setShowWarehouseProductCodePicker(true);
                  event.currentTarget.select?.();
                }}
                onClick={() => setShowWarehouseProductCodePicker(true)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    const matched = applyWarehouseProductCode(event.currentTarget.value);
                    focusNextWarehouseImportField(matched ? 'totalKg' : 'groupName');
                  }
                }}
                onChange={event => {
                  const value = event.target.value;
                  setDraft(prev => ({
                    ...prev,
                    productId: '',
                    productName: '',
                    productCode: value,
                    productBarcode: ''
                  }));
                  setWarehouseProductScanStatus('');
                  setShowWarehouseProductCodePicker(true);
                }}
                placeholder="Quét hoặc nhập mã sản phẩm"
                className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white px-3 py-3 text-center text-sm font-medium text-gray-900 outline-none placeholder:text-center placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={openWarehouseCameraScanner}
                  title="Quét QR hoặc mã vạch bằng camera"
                  className="flex items-center gap-1.5 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-xs font-black text-emerald-700 shadow-sm active:scale-[0.98]"
                >
                  <Camera size={15} aria-hidden="true" />
                  Quét
                </button>
                <button
                  type="button"
                  onClick={() => warehouseProductCodeImageInputRef.current?.click()}
                  title="Chọn ảnh QR hoặc mã vạch"
                  aria-label="Chọn ảnh QR hoặc mã vạch"
                  className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 py-3 text-slate-600 shadow-sm active:scale-[0.98]"
                >
                  <ImagePlus size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
            <input
              ref={warehouseProductCodeImageInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={event => handleWarehouseProductCodeImage(event.target.files?.[0])}
            />
            {draft.productName && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
                <span className="min-w-0 truncate">Đã chọn: {draft.productName}</span>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(prev => ({
                      ...prev,
                      productId: '',
                      productName: '',
                      productCode: '',
                      productBarcode: ''
                    }));
                    setWarehouseProductScanStatus('');
                  }}
                  className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-black text-slate-500"
                >
                  Bỏ
                </button>
              </div>
            )}
            {showWarehouseProductCodePicker && warehouseProductCodeSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-72 overflow-auto rounded-2xl border border-emerald-100 bg-white p-1.5 shadow-2xl shadow-emerald-900/10">
                {warehouseProductCodeSuggestions.map(product => {
                  const code = getWarehouseProductCodeCandidates(product)[0] || product.id || '';
                  const groupLabel = getWarehouseInventoryGroupLabel(product, product.name);
                  return (
                    <button
                      key={product.id || code}
                      type="button"
                      onMouseDown={event => event.preventDefault()}
                      onClick={() => {
                        applyWarehouseProductToDraft(product, code);
                        focusNextWarehouseImportField('totalKg');
                      }}
                      className="w-full rounded-xl px-3 py-2 text-left transition hover:bg-emerald-50"
                    >
                      <span className="block truncate text-sm font-black text-slate-900">{product.name || product.productName || code}</span>
                      <span className="block truncate text-[11px] font-bold text-slate-400">
                        {[code, groupLabel].filter(Boolean).join(' • ') || 'Sản phẩm'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {warehouseProductScanStatus && (
              <p className={`mt-2 text-center text-[11px] font-bold ${warehouseProductScanStatus.startsWith('Đã') ? 'text-emerald-700' : 'text-amber-700'}`}>
                {warehouseProductScanStatus}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
          <label data-search-zone="true" className="relative min-w-0">
            <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-gray-500">Nhóm hàng</span>
            <input
              ref={node => { warehouseImportFieldRefs.current.groupName = node; }}
              type="text"
              enterKeyHint="next"
              value={draft.groupName}
              onKeyDown={event => handleWarehouseImportEnter(event, 'totalKg')}
              onFocus={event => {
                setGroupSearchTerm('');
                setShowSupplierPicker(false);
                setShowGroupPicker(true);
                event.currentTarget.select?.();
              }}
              onClick={event => {
                setGroupSearchTerm('');
                setShowSupplierPicker(false);
                setShowGroupPicker(true);
                event.currentTarget.select?.();
              }}
              onChange={event => {
                const value = event.target.value;
                setGroupSearchTerm(value);
                updateDraft({ groupName: normalizeLeadingLabel(value) });
                setShowGroupPicker(true);
              }}
              placeholder="Nhóm hàng"
              className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white px-3 py-3 text-center text-sm font-medium text-gray-900 outline-none placeholder:text-center placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            {showGroupPicker && (
              <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-xl">
                <div className="max-h-64 overflow-y-auto p-2">
                  {warehouseGroupProjection.pending ? <div role="status" aria-busy="true" className="px-3 py-3 text-sm text-slate-600">Đang chuẩn bị nhóm hàng…</div> : warehouseGroupProjection.error ? <div role="alert" className="px-3 py-3 text-sm text-rose-700">Chưa lấy được nhóm hàng. Đóng và mở lại module để thử lại.</div> : filteredGroupOptions.length > 0 ? filteredGroupOptions.map(label => (
                    <button
                      key={label}
                      type="button"
                      onMouseDown={event => event.preventDefault()}
                      onClick={() => {
                        updateDraft({ groupName: label });
                        setGroupSearchTerm('');
                        setShowGroupPicker(false);
                      }}
                      className={`w-full rounded-xl px-3 py-2 text-left text-sm font-bold transition-colors ${buildProcessingInventoryGroupKey(draft.groupName) === buildProcessingInventoryGroupKey(label) ? 'bg-emerald-50 text-emerald-700' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      {label}
                    </button>
                  )) : (
                    <div className="rounded-xl bg-amber-50 px-3 py-3 text-xs font-bold text-amber-700">
                      Chưa có nhóm phù hợp. Bạn có thể nhập tên nhóm mới rồi lưu.
                    </div>
                  )}
                </div>
              </div>
            )}
          </label>

          <label className="min-w-0">
            <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-gray-500">Tổng kg</span>
            <input
              ref={node => { warehouseImportFieldRefs.current.totalKg = node; }}
              type="text"
              inputMode="decimal"
              enterKeyHint="next"
              value={draft.totalKg}
              onKeyDown={event => handleWarehouseImportEnter(event, 'quantity')}
              onChange={event => updateDraft({ totalKg: event.target.value })}
              placeholder="VD 500"
              className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white px-3 py-3 text-center text-sm font-medium text-gray-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </label>

          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(112px,0.78fr)] gap-2">
            <label className="min-w-0">
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-gray-500">Số lượng</span>
              <div className="flex min-w-0 overflow-visible rounded-2xl border border-gray-200 bg-white focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100">
                <input
                  ref={node => { warehouseImportFieldRefs.current.quantity = node; }}
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="next"
                  value={draft.quantity}
                  onKeyDown={event => handleWarehouseImportEnter(event, 'importDate')}
                  onChange={event => updateDraft({ quantity: event.target.value })}
                  placeholder="VD 100"
                  className="min-w-0 flex-1 bg-transparent px-3 py-3 text-center text-sm font-medium text-gray-900 outline-none placeholder:text-center placeholder:text-gray-400"
                />
                <div data-search-zone="true" className="relative shrink-0 border-l border-gray-100 bg-gray-50">
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={showQuantityUnitPicker}
                    aria-label="Chọn đơn vị số lượng"
                    onClick={() => {
                      setShowGroupPicker(false);
                      setShowSupplierPicker(false);
                      setShowWarehouseProductCodePicker(false);
                      setShowQuantityUnitPicker(prev => !prev);
                    }}
                    className="flex h-full min-h-[46px] w-[92px] items-center justify-center gap-1 px-2 text-center text-xs font-bold text-gray-700 outline-none"
                  >
                    <span className="max-w-[62px] truncate">{draft.quantityUnit || 'Con'}</span>
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                  {showQuantityUnitPicker && (
                    <div role="listbox" aria-label="Gợi ý đơn vị số lượng" className="absolute right-0 top-[calc(100%+8px)] z-50 w-44 overflow-hidden rounded-2xl border border-emerald-100 bg-white p-1.5 text-left shadow-2xl shadow-emerald-900/15">
                      {quantityUnitSuggestions.map(unit => (
                        <button
                          key={unit}
                          type="button"
                          role="option"
                          aria-selected={normalizeWarehouseQuantityUnit(draft.quantityUnit) === normalizeWarehouseQuantityUnit(unit)}
                          onClick={() => {
                            updateDraft({ quantityUnit: normalizeWarehouseQuantityUnit(unit) });
                            setShowQuantityUnitPicker(false);
                          }}
                          className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
                        >
                          <span className="truncate">{unit}</span>
                          {normalizeWarehouseQuantityUnit(draft.quantityUnit) === normalizeWarehouseQuantityUnit(unit) && <Check size={15} aria-hidden="true" />}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setCustomQuantityUnitDraft('');
                          setCustomQuantityUnitStatus('');
                          setShowQuantityUnitPicker(false);
                          setShowCustomQuantityUnitModal(true);
                        }}
                        className="mt-1 flex w-full items-center gap-2 rounded-xl border-t border-slate-100 px-3 py-2.5 text-sm font-black text-emerald-700 hover:bg-emerald-50"
                      >
                        <Plus size={16} aria-hidden="true" />
                        Thêm loại
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </label>
            <label className="min-w-0">
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-gray-500">Ngày nhập</span>
              <input
                ref={node => { warehouseImportFieldRefs.current.importDate = node; }}
                type="text"
                enterKeyHint="next"
                value={workingDate}
                onKeyDown={event => handleWarehouseImportEnter(event, 'unitPrice')}
                onFocus={event => { event.currentTarget.type = 'date'; }}
                onBlur={event => { event.currentTarget.type = 'text'; }}
                onChange={event => updateWarehouseWorkingDate(event.target.value || getTodayString())}
                className="w-full min-w-0 appearance-none rounded-2xl border border-gray-200 bg-white px-3 py-3 text-center text-sm font-medium text-gray-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
          </div>

          <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(108px,0.75fr)] gap-2">
            <div data-search-zone="true" className="relative min-w-0">
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-gray-500">Nhà cung cấp</span>
              <input
                data-hd-search-input="true"
                type="text"
                value={draft.supplier || ''}
                onFocus={() => {
                  setShowGroupPicker(false);
                  setShowStockCountGroupPicker(false);
                  setShowSupplierPicker(true);
                }}
                onBlur={() => {
                  if (typeof window !== 'undefined') {
                    window.setTimeout(() => setShowSupplierPicker(false), 140);
                  } else {
                    setShowSupplierPicker(false);
                  }
                }}
                onChange={event => handleSupplierInputChange(event.target.value)}
                placeholder="Tìm KH / nhập tay"
                className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white px-3 py-3 text-center text-sm font-medium text-gray-900 outline-none placeholder:text-center placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
              {selectedSupplierCustomer && (
                <div className="mt-1 flex items-center justify-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">
                  <span className="min-w-0 truncate">Đã liên kết KH: {getSupplierCustomerLabel(selectedSupplierCustomer)}</span>
                  <button
                    type="button"
                    onClick={() => updateDraft({ supplierCustomerId: '', supplierPhone: '' })}
                    className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[9px] text-slate-500"
                  >
                    Bỏ
                  </button>
                </div>
              )}
              {showSupplierPicker && supplierSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-64 overflow-auto rounded-2xl border border-emerald-100 bg-white p-1.5 text-left shadow-2xl shadow-emerald-900/10">
                  {supplierSuggestions.map(customer => (
                    <button
                      key={customer.id || customer.phone || getSupplierCustomerLabel(customer)}
                      type="button"
                      onMouseDown={event => event.preventDefault()}
                      onClick={() => selectSupplierCustomer(customer)}
                      className="w-full rounded-xl px-3 py-2 text-left transition hover:bg-emerald-50"
                    >
                      <span className="block truncate text-sm font-black text-slate-900">{getSupplierCustomerLabel(customer)}</span>
                      <span className="block truncate text-[11px] font-semibold text-slate-400">
                        {customer.source === 'recent'
                          ? ['Đã dùng trước', customer.phone || customer.phoneNumber].filter(Boolean).join(' • ')
                          : [customer.phone || customer.phoneNumber, customer.address, customer.customerGroup].filter(Boolean).join(' • ') || 'Khách hàng trong hệ thống'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <label className="min-w-0">
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-gray-500">Đơn giá</span>
              <input
                ref={node => { warehouseImportFieldRefs.current.unitPrice = node; }}
                type="text"
                inputMode="numeric"
                enterKeyHint="done"
                value={draft.unitPrice}
                onKeyDown={event => handleWarehouseImportEnter(event, 'submit')}
                onChange={event => updateDraft({ unitPrice: event.target.value })}
                placeholder={`Giá / ${draft.purchaseUnit || 'Kg'}`}
                className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white px-3 py-3 text-center text-sm font-medium text-gray-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
          </div>

          <div className="min-w-0">
            <div className="flex min-h-[46px] w-full min-w-0 items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              <span className="shrink-0 text-[11px] font-black uppercase tracking-wide text-emerald-600">Thành tiền</span>
              <span className="min-w-0 truncate text-right font-black">{suggestedAmount > 0 ? `${formatCurrency(suggestedAmount)} đ` : '0 đ'}</span>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSaving || !canSubmitImportForm}
          className="mt-4 w-full rounded-2xl bg-emerald-500 py-3 text-sm font-black text-white shadow-lg shadow-emerald-500/20 disabled:opacity-60"
        >
          {isSaving ? 'Đang lưu...' : isEditingImport ? 'Cập nhật phiếu nhập' : 'Lưu nhập kho'}
        </button>
        {isEditingImport && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={resetImportDraft}
              className="rounded-2xl bg-gray-100 py-3 text-sm font-black text-gray-700"
            >
              Hủy sửa
            </button>
            <button
              type="button"
              onClick={handleDeleteEditingImport}
              disabled={!canDeleteWarehouseImport}
              className="rounded-2xl bg-rose-50 py-3 text-sm font-black text-rose-600 disabled:opacity-50"
            >
              Xóa phiếu
            </button>
          </div>
        )}
        {status && <p className="mt-3 text-center text-xs font-bold text-emerald-700">{status}</p>}
      </form>

      <section className="rounded-[30px] border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[11px] font-black uppercase tracking-[0.16em] text-gray-500">Danh sách nhập kho</p>
          <label className="relative inline-flex shrink-0 items-center rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5">
            <span className="text-xs font-black text-emerald-700">{formatCompactDateLabel(workingDate)}</span>
            <input
              type="date"
              value={workingDate}
              onChange={event => updateWarehouseWorkingDate(event.target.value || getTodayString())}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Chọn ngày xem danh sách nhập kho"
            />
          </label>
        </div>
        {dayImports.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-200 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-gray-500">
            Chưa có phiếu nhập kho trong ngày này.
          </div>
        ) : (
          <div className="space-y-2">
            {dayImports.map(item => {
              const itemMeasures = buildStoredWarehouseMeasureEntries(item);
              const kgMeasure = itemMeasures.find(measure => normalizeLookupText(measure.unit) === normalizeLookupText('Kg'));
              const totalKgValue = parseLooseQuantityValue(item.totalKg ?? item.weightKg) || parseLooseQuantityValue(kgMeasure?.quantity);
              const quantityUnit = normalizeWarehouseMeasureUnit(item.quantityUnit || item.unit || 'Con');
              const quantityValue = parseLooseQuantityValue(item.quantity ?? item.totalQuantity);
              const fallbackQuantityMeasure = itemMeasures.find(measure => normalizeLookupText(measure.unit) !== normalizeLookupText('Kg'));
              const quantityLabel = quantityValue > 0
                ? `${formatNumber(quantityValue)} ${quantityUnit}`
                : fallbackQuantityMeasure
                  ? `${formatNumber(fallbackQuantityMeasure.quantity)} ${fallbackQuantityMeasure.unit}`
                  : '0';
              const unitPriceValue = parseLooseMoneyValue(item.unitPrice);
              const amountValue = parseLooseMoneyValue(item.amount) || (totalKgValue > 0 && unitPriceValue > 0 ? totalKgValue * unitPriceValue : 0);
              const canManageImportItem = Boolean(canEditWarehouseImport || canDeleteWarehouseImport);
              const sourceLabel = getWarehouseImportSourceLabel(item.sourceType);
              const supplierLabel = `${item.supplier || ''}`.trim();
              const linkedSupplierCustomer = item.supplierCustomerId
                ? supplierCustomerOptions.find(customer => customer.id === item.supplierCustomerId)
                : null;
              const supplierDisplayLabel = linkedSupplierCustomer
                ? `KH liên kết: ${getSupplierCustomerLabel(linkedSupplierCustomer)}`
                : supplierLabel
                  ? `NCC: ${supplierLabel}`
                  : '';
              return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleEditImportFromItem(item)}
                disabled={!canManageImportItem}
                className={`w-full rounded-2xl border border-gray-100 bg-white p-3 text-left shadow-sm transition ${canManageImportItem ? 'hover:border-emerald-200 hover:bg-emerald-50/40 active:scale-[0.99]' : 'cursor-default'}`}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-base font-black text-gray-900">{item.groupName || 'Nhóm hàng'}</p>
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">{sourceLabel}</span>
                  </div>
                  {supplierDisplayLabel && (
                    <p className="mt-1 truncate text-[11px] font-bold text-slate-400">{supplierDisplayLabel}</p>
                  )}
                  {(item.productName || item.productCode || item.barcode) && (
                    <p className="mt-1 truncate text-[11px] font-bold text-emerald-600">
                      {['SP', item.productCode || item.barcode, item.productName].filter(Boolean).join(' • ')}
                    </p>
                  )}
                  <div className="mt-2 grid grid-cols-[0.78fr_0.82fr_0.82fr_auto_1fr] items-center gap-1 rounded-2xl bg-emerald-50/70 px-2.5 py-2 text-center text-[11px] font-semibold text-slate-700">
                    <span className="truncate">{totalKgValue > 0 ? `${formatNumber(totalKgValue)} kg` : '0 kg'}</span>
                    <span className="truncate">{quantityLabel}</span>
                    <span className="truncate">{unitPriceValue > 0 ? formatCurrency(unitPriceValue) : '0'}</span>
                    <span className="text-slate-400">=</span>
                    <span className="truncate text-right font-black text-emerald-700">{formatCurrency(amountValue)} đ</span>
                  </div>
                </div>
                {item.note && <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-gray-500">{item.note}</p>}
              </button>
              );
            })}
          </div>
        )}
      </section>

        </>
      )}

      {warehouseInventoryTab === 'export' && (
      <section className="rounded-[30px] border border-blue-100 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[11px] font-black uppercase tracking-[0.16em] text-blue-600">Danh sách xuất kho</p>
          <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">{formatCompactDateLabel(workingDate)}</span>
        </div>
        <p className="mb-3 text-xs font-bold text-gray-500">{formatNumber(dayExportRows.length)} nhóm cần đối chiếu</p>
        {dayExportRows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-blue-100 bg-blue-50/50 px-4 py-7 text-center text-sm font-bold text-slate-500">
            Chưa có nhóm hàng nhập kho cần đối chiếu xuất kho trong ngày này.
          </div>
        ) : (
          <div className="space-y-2">
            {dayExportRows.map(row => (
              <div key={`day_export_${row.key}`} className="rounded-2xl border border-blue-50 bg-blue-50/40 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-black text-slate-900">{row.groupName}</p>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    {row.measureRows.map(measure => (
                      <span key={`${row.key}_${measure.unit}`} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-blue-700 shadow-sm">
                        Xuất {formatNumber(measure.exported || 0)} {measure.unit}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      )}

      {warehouseInventoryTab === 'stock' && (
        <>
      {isVpsMode && (
        <section className="rounded-[30px] border border-blue-100 bg-blue-50/50 p-4 shadow-sm">
          <div className="mb-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-700">Kiểm tồn VPS</p>
            <p className="mt-1 text-xs font-semibold text-blue-800/75">Mỗi lần post là một session với một product/unit line; không tự quy đổi.</p>
          </div>
          <form onSubmit={handleSubmitVpsStockCount} className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <select
              value={vpsStockCountDraft.warehouseId}
              onChange={event => setVpsStockCountDraft(prev => ({ ...prev, warehouseId: event.target.value }))}
              className="rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500"
              required
            >
              <option value="">Chọn kho</option>
              {vpsWarehouses.filter(item => !item?.deletedAt).map(item => (
                <option key={item.id} value={item.id}>{item.code || item.name} - {item.name}</option>
              ))}
            </select>
            <select
              value={vpsStockCountDraft.productId}
              onChange={event => setVpsStockCountDraft(prev => ({ ...prev, productId: event.target.value }))}
              className="rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500"
              required
            >
              <option value="">Chọn sản phẩm</option>
              {products.filter(item => !item?.isArchived).map(item => (
                <option key={item.id} value={item.id}>{item.code || item.name} - {item.name}</option>
              ))}
            </select>
            <select
              value={vpsStockCountDraft.unitId}
              onChange={event => setVpsStockCountDraft(prev => ({ ...prev, unitId: event.target.value }))}
              className="rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500"
              required
            >
              <option value="">Chọn UOM</option>
              {vpsUnits.filter(item => !item?.deletedAt).map(item => (
                <option key={item.id} value={item.id}>{item.symbol || item.code || item.name} - {item.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="0.000001"
                value={vpsStockCountDraft.countedQuantity}
                onChange={event => setVpsStockCountDraft(prev => ({ ...prev, countedQuantity: event.target.value }))}
                placeholder="Tồn thực tế"
                className="min-w-0 flex-1 rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500"
                required
              />
              <button
                type="submit"
                disabled={isSavingVpsStockCount || vpsWarehouses.length === 0 || vpsUnits.length === 0 || products.length === 0}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-sm disabled:opacity-50"
              >
                {isSavingVpsStockCount ? 'Đang post' : 'Post'}
              </button>
            </div>
            {canRecordActualStockReason && (
              <input
                type="text"
                value={vpsStockCountDraft.reason}
                onChange={event => setVpsStockCountDraft(prev => ({ ...prev, reason: event.target.value }))}
                placeholder="Lý do chênh lệch"
                className="rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 md:col-span-2"
              />
            )}
            <input
              type="text"
              value={vpsStockCountDraft.note}
              onChange={event => setVpsStockCountDraft(prev => ({ ...prev, note: event.target.value }))}
              placeholder="Ghi chú"
              className="rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 md:col-span-2"
            />
          </form>
          {vpsStockCountStatus && <p className="mt-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-blue-800">{vpsStockCountStatus}</p>}
          {(vpsWarehouses.length === 0 || vpsUnits.length === 0 || products.length === 0) && (
            <p className="mt-2 text-xs font-semibold text-amber-700">Thiếu master kho, UOM hoặc sản phẩm VPS; không thể post an toàn.</p>
          )}
        </section>
      )}
      {canViewActualStockCount && (
        <section className="rounded-[30px] border border-cyan-100 bg-gradient-to-br from-white via-cyan-50/60 to-emerald-50 p-4 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-600">Kiểm kho thực tế</p>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-2 text-center">
              <div className="rounded-2xl bg-white px-3 py-2 shadow-sm">
                <p className="text-[9px] font-black uppercase text-slate-400">Đã kiểm</p>
                <p className="mt-0.5 text-base font-black text-cyan-700">{formatNumber(actualStockSummary.countedCount)}</p>
              </div>
              <div className={`rounded-2xl px-3 py-2 shadow-sm ${actualStockSummary.mismatchCount > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                <p className="text-[9px] font-black uppercase">Sai lệch</p>
                <p className="mt-0.5 text-base font-black">{formatNumber(actualStockSummary.mismatchCount)}</p>
              </div>
            </div>
          </div>

          {warehouseStockChecklistRows.length > 0 && (
            <div className="mb-3 space-y-2">
              {warehouseStockChecklistRows.map(row => {
                const actualRow = actualStockLookup.get(row.key);
                return (
                <div
                  key={`stock_checklist_${row.key}`}
                  className="w-full rounded-2xl border border-cyan-100 bg-white/90 px-3 py-2 text-left shadow-sm"
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)] items-center gap-2">
                    <p className="min-w-0 truncate text-center text-sm font-black text-slate-900">{row.groupName}</p>
                    <div className="flex flex-wrap justify-end gap-1">
                      {row.measureRows.map(measure => {
                        const actualMeasure = actualRow?.measureRows?.find(item => normalizeLookupText(item.unit) === normalizeLookupText(measure.unit));
                        const hasRecordedActual = hasRecordedWarehouseStockMeasure(actualMeasure);
                        return (
                          <button
                            key={`${row.key}_${measure.unit}`}
                            type="button"
                            onClick={() => {
                              if (isVpsMode) {
                                setStockCountStatus('VPS dùng form product/unit ở phía trên; không sửa grouped legacy count.');
                                return;
                              }
                              openQuickStockEdit(row, measure);
                            }}
                            className={`min-w-0 flex-1 rounded-full px-2 py-1 text-center text-[11px] font-black shadow-sm transition active:scale-95 ${hasRecordedActual ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100'}`}
                          >
                            <span className="block truncate">Tồn {formatNumber(resolveWarehouseStockChecklistDisplayValue(actualMeasure, measure.remaining))} {measure.unit}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );})}
            </div>
          )}

          {stockCountStatus && (
            <p className="mb-3 rounded-2xl border border-cyan-100 bg-white/90 px-3 py-2 text-center text-xs font-bold text-cyan-700 shadow-sm">
              {stockCountStatus}
            </p>
          )}

          {warehouseStockChecklistRows.length === 0 && (
            <div className="rounded-3xl border border-dashed border-cyan-100 bg-white/70 px-4 py-7 text-center text-sm font-bold text-slate-500">
              Chưa có nhóm hàng cần kiểm kho trong ngày này.
            </div>
          )}
        </section>
      )}

      <section className="rounded-[30px] border border-rose-100 bg-gradient-to-br from-white via-rose-50/40 to-emerald-50/70 p-4 shadow-sm hd-soft-red-outline">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-500">Tồn kho đối chiếu</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {hiddenWarehouseStockItemCount > 0 && (
              <button
                type="button"
                onClick={() => setShowHiddenWarehouseStockItems(prev => !prev)}
                className="rounded-full border border-rose-100 bg-white px-3 py-2 text-[11px] font-black text-rose-600 shadow-sm active:scale-[0.98]"
              >
                Đã ẩn {formatNumber(hiddenWarehouseStockItemCount)}
              </button>
            )}
            <label className="relative inline-flex items-center rounded-full border border-rose-100 bg-white px-3 py-2 shadow-sm">
              <span className="text-xs font-black text-rose-600">{formatCompactDateLabel(workingDate)}</span>
              <input
                type="date"
                value={workingDate}
                onChange={event => updateWarehouseWorkingDate(event.target.value || getTodayString())}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Chọn ngày đối chiếu tồn kho"
              />
            </label>
          </div>
        </div>

        {warehouseStockVisibilityStatus && (
          <p className="mb-3 rounded-2xl border border-rose-100 bg-white/90 px-3 py-2 text-center text-xs font-bold text-rose-700 shadow-sm">
            {warehouseStockVisibilityStatus}
          </p>
        )}

        {showHiddenWarehouseStockItems && hiddenWarehouseStockItemCount > 0 && (
          <div className="mb-3 rounded-3xl border border-rose-100 bg-white/95 p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-rose-500">Đang ẩn</p>
              <button
                type="button"
                onClick={restoreAllWarehouseStockVisibility}
                className="rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-black text-emerald-700 active:scale-[0.98]"
              >
                Hiện tất cả
              </button>
            </div>
            <div className="space-y-2">
              {hiddenWarehouseStockGroupRows.map(item => (
                <div key={`hidden_group_${item.groupKey}`} className="flex items-center justify-between gap-2 rounded-2xl bg-rose-50 px-3 py-2">
                  <span className="min-w-0 truncate text-xs font-black text-slate-700">Nhóm: {item.groupName}</span>
                  <button
                    type="button"
                    onClick={() => restoreWarehouseStockGroup(item.groupKey)}
                    className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-emerald-700 shadow-sm active:scale-[0.98]"
                  >
                    Hiện lại
                  </button>
                </div>
              ))}
              {hiddenWarehouseStockUnitRows.map(item => (
                <div key={`hidden_unit_${item.groupKey}_${item.unitKey}`} className="flex items-center justify-between gap-2 rounded-2xl bg-slate-50 px-3 py-2">
                  <span className="min-w-0 truncate text-xs font-black text-slate-700">{item.groupName}: {item.unitLabel}</span>
                  <button
                    type="button"
                    onClick={() => restoreWarehouseStockUnit(item.groupKey, item.unitKey)}
                    className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-emerald-700 shadow-sm active:scale-[0.98]"
                  >
                    Hiện lại
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {warehouseStockRows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-rose-100 bg-white/70 px-4 py-8 text-center text-sm font-bold text-slate-500">
            Chưa có dữ liệu nhập kho hoặc xuất kho thực tế để đối chiếu tồn kho.
          </div>
        ) : visibleWarehouseStockRows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-rose-100 bg-white/70 px-4 py-8 text-center text-sm font-bold text-slate-500">
            Toàn bộ nhóm tồn kho đang được ẩn. Bấm “Đã ẩn” để hiện lại khi cần xem.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {visibleWarehouseStockRows.map(row => {
              const actualRow = actualStockLookup.get(row.key);
              const measureRows = getVisibleWarehouseStockMeasureRows(row);
              const isNegative = Boolean(row.hasPrimaryStockWarning);
              const hasReferenceWarning = Boolean(row.hasReferenceStockWarning);
              return (
                <div key={row.key} className={`rounded-2xl border p-3 shadow-sm ${isNegative ? 'border-red-200 bg-red-50' : hasReferenceWarning ? 'border-amber-100 bg-amber-50/50' : 'border-white bg-white/90'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">{row.groupName}</p>
                      <p className="mt-1 text-[11px] font-bold text-slate-500">Theo dõi {formatNumber(measureRows.length)} chỉ số tồn</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-black ${isNegative ? 'bg-red-100 text-red-700' : hasReferenceWarning ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {isNegative ? 'Thiếu' : hasReferenceWarning ? 'Lệch kg' : 'Ổn'}
                      </span>
                      <button
                        type="button"
                        onClick={() => hideWarehouseStockGroup(row)}
                        className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-rose-500 shadow-sm active:scale-[0.98]"
                        aria-label={`Ẩn nhóm ${row.groupName}`}
                      >
                        Ẩn nhóm
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {measureRows.length === 0 ? (
                      <div className="rounded-xl bg-white px-3 py-3 text-center text-xs font-bold text-slate-400">
                        Các chỉ số của nhóm này đang được ẩn.
                      </div>
                    ) : measureRows.map(measure => {
                      const measureNegative = measure.remaining < 0;
                      const actualMeasure = actualRow?.measureRows?.find(item => normalizeLookupText(item.unit) === normalizeLookupText(measure.unit));
                      const hasActual = hasRecordedWarehouseStockMeasure(actualMeasure);
                      const hasActualMismatch = Boolean(hasActual && actualMeasure.status !== 'ok');
                      const isPrimaryMeasure = measure.isPrimaryStockUnit !== false;
                      const isPrimaryMismatch = hasActualMismatch && (actualMeasure?.isPrimaryStockUnit !== false) && isPrimaryMeasure;
                      return (
                        <div
                          key={`${row.key}_${measure.unit}`}
                          onClick={() => hasActualMismatch && openStockVarianceReport(row, measure, actualMeasure)}
                          onKeyDown={(event) => {
                            if (!hasActualMismatch || (event.key !== 'Enter' && event.key !== ' ')) return;
                            event.preventDefault();
                            openStockVarianceReport(row, measure, actualMeasure);
                          }}
                          role={hasActualMismatch ? 'button' : undefined}
                          tabIndex={hasActualMismatch ? 0 : undefined}
                          className={`grid w-full grid-cols-[0.58fr_0.82fr_0.82fr_0.82fr_0.82fr_auto] items-center gap-1 rounded-xl px-2 py-2 text-center text-[10px] font-bold text-slate-600 transition ${isPrimaryMismatch ? 'bg-amber-50 ring-1 ring-amber-200 active:scale-[0.99]' : hasActualMismatch ? 'bg-slate-50 ring-1 ring-slate-100 active:scale-[0.99]' : 'bg-white'}`}
                        >
                          <span className={`truncate text-left font-black ${isPrimaryMeasure ? 'text-slate-900' : 'text-slate-400'}`}>{measure.unit}</span>
                          <span>Nhập {formatNumber(measure.imported || 0)}</span>
                          <span>Xuất {formatNumber(measure.exported || 0)}</span>
                          <span className={isPrimaryMismatch ? 'font-black text-amber-700' : hasActualMismatch ? 'font-black text-slate-500' : 'font-black text-cyan-700'}>
                            Kiểm {hasActual ? formatNumber(actualMeasure.actual || 0) : '-'}
                          </span>
                          <span className={`font-black ${isPrimaryMismatch ? 'text-red-700' : hasActualMismatch ? 'text-amber-600' : measureNegative && isPrimaryMeasure ? 'text-red-700' : 'text-emerald-700'}`}>
                            {hasActualMismatch ? `Lệch ${formatNumber(actualMeasure.diff || 0)}` : `Tồn ${formatNumber(measure.remaining || 0)}`}
                          </span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              hideWarehouseStockUnit(row, measure);
                            }}
                            className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-500 active:scale-[0.98]"
                            aria-label={`Ẩn chỉ số ${measure.unit} của ${row.groupName}`}
                          >
                            Ẩn
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

        </>
      )}

      {warehouseInventoryTab === 'report' && (
      <section className="rounded-[30px] border border-emerald-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">Bảng nhập xuất tồn</p>
            <p className="mt-1 text-xs font-bold text-slate-400">{warehouseMovementMonthLabel}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-1">
            <span className="px-2 text-[10px] font-black uppercase tracking-wide text-emerald-700">Lọc</span>
            {warehouseMovementUnitOptions.map(option => {
              const isActive = warehouseMovementUnitFilter === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setWarehouseMovementUnitFilter(option.key)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black transition active:scale-[0.98] ${isActive ? 'bg-emerald-500 text-white shadow-sm' : 'bg-white text-slate-500'}`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          {warehouseMovementTableRows.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm font-bold text-slate-400">
              Chưa có dữ liệu {warehouseMovementSelectedUnitLabel.toLocaleLowerCase('vi')} để hiển thị trong tháng này.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse text-center text-[9px] font-bold sm:text-[11px]">
                <colgroup>
                  <col className="w-[14.285%]" />
                  <col className="w-[14.285%]" />
                  <col className="w-[14.285%]" />
                  <col className="w-[14.285%]" />
                  <col className="w-[14.285%]" />
                  <col className="w-[14.285%]" />
                  <col className="w-[14.285%]" />
                </colgroup>
                <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-wide text-slate-500 sm:text-[10px]">
                  <tr>
                    <th className="border border-slate-200 px-1 py-2">Ngày</th>
                    <th className="border border-slate-200 px-1 py-2">Nhóm</th>
                    <th className="border border-slate-200 px-1 py-2">Nhập</th>
                    <th className="border border-slate-200 px-1 py-2">Xuất</th>
                    <th className="border border-slate-200 px-1 py-2">Tồn</th>
                    <th className="border border-slate-200 px-1 py-2">T.tế</th>
                    <th className="border border-slate-200 px-1 py-2">Lệch</th>
                  </tr>
                </thead>
                <tbody>
                  {warehouseMovementTableGroups.map(group => group.rows.map((row, rowIndex) => {
                    const diffValue = row.diff;
                    const hasDiff = diffValue !== null && diffValue !== undefined;
                    const isBadDiff = hasDiff && Math.abs(diffValue) > 0.0001;
                    const isSelected = selectedWarehouseMovementRowKey === row.key;
                    const groupHasBadDiff = group.rows.some(groupRow => {
                      const groupDiff = groupRow.diff;
                      return groupDiff !== null && groupDiff !== undefined && Math.abs(groupDiff) > 0.0001;
                    });
                    return (
                      <tr
                        key={row.key}
                        onClick={() => openWarehouseMovementDetail(row)}
                        className={`cursor-pointer transition hover:bg-emerald-50/70 ${isSelected ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-200' : isBadDiff ? 'bg-amber-50/70' : 'bg-white'}`}
                        title={`Xem chi tiết ${row.groupName} ngày ${formatCompactDateLabel(row.dateKey)}`}
                      >
                        {rowIndex === 0 && (
                          <td
                            rowSpan={group.rows.length}
                            className={`h-12 border border-slate-200 px-1 py-2 align-middle text-center font-black text-slate-800 ${groupHasBadDiff ? 'bg-amber-50/80' : 'bg-slate-50/80'}`}
                            title={formatCompactDateLabel(row.dateKey)}
                          >
                            {group.dayNumber}
                          </td>
                        )}
                        <td className="h-12 border border-slate-200 px-1 py-2 text-center font-black text-slate-800">
                          <span className="block break-words leading-tight">{row.groupName}</span>
                        </td>
                        <td className="h-12 border border-slate-200 px-1 py-2 text-slate-700">{formatNumber(row.imported || 0)}</td>
                        <td className="h-12 border border-slate-200 px-1 py-2 text-slate-700">{formatNumber(row.exported || 0)}</td>
                        <td className="h-12 border border-slate-200 px-1 py-2 font-black text-emerald-700">{formatNumber(row.expected || 0)}</td>
                        <td className="h-12 border border-slate-200 px-1 py-2 text-cyan-700">{row.actual === null ? '-' : formatNumber(row.actual || 0)}</td>
                        <td className={`h-12 border border-slate-200 px-1 py-2 font-black ${isBadDiff ? 'text-red-600' : 'text-slate-500'}`}>
                          {hasDiff ? formatNumber(diffValue || 0) : '-'}
                        </td>
                      </tr>
                    );
                  }))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {selectedWarehouseMovementRow && selectedWarehouseMovementDetails && (
          <div
            ref={warehouseMovementDetailRef}
            tabIndex={-1}
            className="mt-3 scroll-mt-28 rounded-3xl border border-emerald-100 bg-emerald-50/50 p-3 shadow-sm outline-none"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600">Chi tiết nhập - xuất - tồn</p>
                <h4 className="mt-1 text-base font-black text-slate-900">
                  {formatCompactDateLabel(selectedWarehouseMovementRow.dateKey)} • {selectedWarehouseMovementRow.groupName}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedWarehouseMovementRowKey('')}
                className="shrink-0 rounded-full bg-white px-3 py-2 text-[11px] font-black text-slate-500 shadow-sm active:scale-[0.98]"
              >
                Đóng
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-black">
              <div className="rounded-2xl bg-white px-2 py-2 text-emerald-700 shadow-sm">
                <p className="text-[9px] uppercase text-slate-400">Nhập</p>
                <p className="mt-1">{formatNumber(selectedWarehouseMovementRow.imported || 0)}</p>
              </div>
              <div className="rounded-2xl bg-white px-2 py-2 text-blue-700 shadow-sm">
                <p className="text-[9px] uppercase text-slate-400">Xuất</p>
                <p className="mt-1">{formatNumber(selectedWarehouseMovementRow.exported || 0)}</p>
              </div>
              <div className="rounded-2xl bg-white px-2 py-2 text-cyan-700 shadow-sm">
                <p className="text-[9px] uppercase text-slate-400">Thực tế</p>
                <p className="mt-1">{selectedWarehouseMovementRow.actual === null ? '-' : formatNumber(selectedWarehouseMovementRow.actual || 0)}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
              <div className="rounded-2xl bg-white p-3 shadow-sm">
                <p className="mb-2 text-[10px] font-black uppercase tracking-wide text-emerald-600">Phiếu nhập</p>
                {selectedWarehouseMovementDetails.importItems.length === 0 ? (
                  <p className="text-xs font-bold text-slate-400">Không có phiếu nhập.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedWarehouseMovementDetails.importItems.map(item => {
                      const measureLabel = buildStoredWarehouseStockCountMeasureEntries(item)
                        .map(measure => `${formatNumber(measure.quantity)} ${measure.unit}`)
                        .join(' • ');
                      return (
                        <div key={`movement_import_${item.id}`} className="rounded-xl border border-emerald-50 bg-emerald-50/40 px-3 py-2">
                          <p className="truncate text-xs font-black text-slate-800">{item.supplier || item.supplierName || 'Nhà cung cấp'}</p>
                          <p className="mt-1 text-[11px] font-bold text-slate-500">{measureLabel || 'Chưa có số lượng'}</p>
                          <p className="mt-1 text-[11px] font-black text-emerald-700">{formatCurrency(parseLooseMoneyValue(item.amount ?? item.totalAmount))} đ</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="rounded-2xl bg-white p-3 shadow-sm">
                <p className="mb-2 text-[10px] font-black uppercase tracking-wide text-blue-600">Phiếu xuất</p>
                {selectedWarehouseMovementDetails.dispatchItems.length === 0 ? (
                  <p className="text-xs font-bold text-slate-400">Không có phiếu xuất.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedWarehouseMovementDetails.dispatchItems.map(item => {
                      const product = productLookup.get(item.productId);
                      const measureLabel = buildWarehouseDispatchMeasureEntries(item, product)
                        .map(measure => `${formatNumber(measure.quantity)} ${measure.unit}`)
                        .join(' • ');
                      return (
                        <div key={`movement_dispatch_${item.id}`} className="rounded-xl border border-blue-50 bg-blue-50/40 px-3 py-2">
                          <p className="truncate text-xs font-black text-slate-800">{item.customerName || item.customerNameSnapshot || 'Khách hàng'}</p>
                          <p className="mt-1 truncate text-[11px] font-bold text-slate-500">{item.productName || item.productNameSnapshot || product?.name || selectedWarehouseMovementRow.groupName}</p>
                          <p className="mt-1 text-[11px] font-black text-blue-700">{measureLabel || 'Chưa có số lượng'}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="rounded-2xl bg-white p-3 shadow-sm">
                <p className="mb-2 text-[10px] font-black uppercase tracking-wide text-cyan-600">Kiểm tồn</p>
                {selectedWarehouseMovementDetails.stockCountItems.length === 0 ? (
                  <p className="text-xs font-bold text-slate-400">Chưa kiểm tồn thực tế.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedWarehouseMovementDetails.stockCountItems.map(item => {
                      const measureLabel = buildStoredWarehouseMeasureEntries(item)
                        .map(measure => `${formatNumber(measure.quantity)} ${measure.unit}`)
                        .join(' • ');
                      return (
                        <div key={`movement_stock_${item.id}`} className="rounded-xl border border-cyan-50 bg-cyan-50/40 px-3 py-2">
                          <p className="text-xs font-black text-slate-800">{measureLabel || 'Chưa có số lượng'}</p>
                          {(item.reason || item.note) && <p className="mt-1 text-[11px] font-bold text-slate-500">{item.reason || item.note}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        <p className="mt-3 text-center text-[11px] font-bold text-slate-400">
          Bảng này thay cho lịch nhập kho, lịch xuất kho và lịch tồn kho cũ.
        </p>
      </section>
      )}

      {showWarehouseCameraScanner && (
        <div
          className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-950/60 px-0 sm:items-center sm:px-4"
          onClick={closeWarehouseCameraScanner}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="warehouse-camera-scanner-title"
            className="w-full max-w-md overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">Nhập Xuất Tồn</p>
                <h3 id="warehouse-camera-scanner-title" className="mt-1 text-lg font-black text-slate-900">Quét QR / mã vạch</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">Đưa mã sản phẩm vào giữa khung. Khi nhận được mã, app sẽ tự điền thông tin sản phẩm.</p>
              </div>
              <button
                type="button"
                onClick={closeWarehouseCameraScanner}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600"
                aria-label="Đóng scanner sản phẩm"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <div className="relative h-56 overflow-hidden rounded-3xl border border-emerald-100 bg-slate-950">
                <video
                  ref={warehouseCameraVideoRef}
                  className={`h-full w-full object-cover ${isWarehouseCameraScanning ? 'opacity-100' : 'opacity-0'}`}
                  muted
                  playsInline
                />
                {!isWarehouseCameraScanning && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                      <Scan size={32} />
                    </div>
                    <p className="text-sm font-bold text-white/90">Camera chưa quét. Bạn có thể thử lại hoặc chọn ảnh mã.</p>
                  </div>
                )}
                {isWarehouseCameraScanning && (
                  <div className="pointer-events-none absolute inset-10 rounded-3xl border-2 border-emerald-300/90 shadow-[0_0_0_999px_rgba(15,23,42,0.25)]" />
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={startWarehouseCameraScanner}
                  className="flex min-h-[46px] items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-3 py-3 text-sm font-black text-white shadow-lg shadow-emerald-100"
                >
                  {isWarehouseCameraScanning ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
                  {isWarehouseCameraScanning ? 'Đang quét' : 'Quét lại'}
                </button>
                <button
                  type="button"
                  onClick={() => warehouseProductCodeImageInputRef.current?.click()}
                  className="flex min-h-[46px] items-center justify-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-sm font-black text-emerald-700"
                >
                  <ImagePlus size={18} />
                  Chọn ảnh
                </button>
              </div>
              {warehouseProductScanStatus && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                  {warehouseProductScanStatus}
                </div>
              )}
              <p className="text-center text-[11px] font-semibold text-slate-400">Nếu camera không được cấp quyền, hãy cho phép camera hoặc dùng ảnh mã rõ nét.</p>
            </div>
          </div>
        </div>
      )}

      {showCustomQuantityUnitModal && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
          onClick={() => setShowCustomQuantityUnitModal(false)}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="warehouse-custom-unit-title"
            onSubmit={handleSaveCustomQuantityUnit}
            onClick={event => event.stopPropagation()}
            className="w-full max-w-sm rounded-[28px] border border-emerald-100 bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">Đơn vị nhập kho</p>
                <h3 id="warehouse-custom-unit-title" className="mt-1 text-xl font-black text-slate-900">Thêm loại mới</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">Đơn vị sẽ được lưu để dùng lại cho các lần nhập sau.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomQuantityUnitModal(false)}
                className="shrink-0 rounded-full bg-slate-100 p-2 text-slate-500"
                aria-label="Đóng thêm đơn vị"
              >
                <X size={18} />
              </button>
            </div>
            <label className="mt-4 block">
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Tên đơn vị</span>
              <input
                type="text"
                value={customQuantityUnitDraft}
                onChange={event => setCustomQuantityUnitDraft(event.target.value)}
                placeholder="VD: Thùng xốp"
                autoFocus
                className="w-full rounded-2xl border border-emerald-100 bg-emerald-50/30 px-4 py-3 text-base font-bold text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            {customQuantityUnitStatus && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">{customQuantityUnitStatus}</p>}
            <div className="mt-4 grid grid-cols-[0.8fr_1fr] gap-2">
              <button
                type="button"
                onClick={() => setShowCustomQuantityUnitModal(false)}
                className="rounded-2xl bg-slate-100 py-3 text-sm font-black text-slate-600"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="rounded-2xl bg-emerald-500 py-3 text-sm font-black text-white shadow-lg shadow-emerald-500/20"
              >
                Lưu đơn vị
              </button>
            </div>
          </form>
        </div>
      )}

      {quickStockEdit && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
          onClick={() => setQuickStockEdit(null)}
        >
          <div
            className="w-full max-w-sm rounded-[28px] border border-cyan-100 bg-white p-4 shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-600">Sửa tồn thực tế</p>
                <h3 className="mt-1 truncate text-xl font-black text-slate-900">{quickStockEdit.groupName}</h3>
                <p className="mt-1 text-xs font-bold text-slate-500">Theo hệ thống: {formatNumber(quickStockEdit.expected)} {quickStockEdit.unit}</p>
              </div>
              <button
                type="button"
                onClick={() => setQuickStockEdit(null)}
                className="shrink-0 rounded-full bg-slate-100 p-2 text-slate-500"
                aria-label="Đóng sửa tồn thực tế"
              >
                <X size={18} />
              </button>
            </div>
            <label className="mt-4 block">
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">Tồn thực tế ({quickStockEdit.unit})</span>
              <input
                type="text"
                inputMode="decimal"
                value={quickStockEdit.value}
                onChange={event => setQuickStockEdit(prev => ({ ...prev, value: event.target.value }))}
                autoFocus
                className="w-full rounded-2xl border border-cyan-100 bg-cyan-50/40 px-4 py-3 text-2xl font-black text-slate-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>
            {canRecordActualStockReason && (
              <select
                value={quickStockEdit.reason}
                onChange={event => setQuickStockEdit(prev => ({ ...prev, reason: event.target.value }))}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              >
                <option value="">Lý do nếu có sai lệch</option>
                {actualStockReasonOptions.map(reason => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </select>
            )}
            <div className="mt-4 grid grid-cols-[0.8fr_1fr] gap-2">
              <button
                type="button"
                onClick={() => setQuickStockEdit(null)}
                className="rounded-2xl bg-slate-100 py-3 text-sm font-black text-slate-600"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveQuickStockEdit}
                disabled={isSavingStockCount}
                className="rounded-2xl bg-cyan-500 py-3 text-sm font-black text-white shadow-lg shadow-cyan-500/20 disabled:opacity-60"
              >
                {isSavingStockCount ? 'Đang lưu...' : 'Cập nhật'}
              </button>
            </div>
          </div>
        </div>
      )}

      {stockVarianceReport && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
          onClick={() => setStockVarianceReport(null)}
        >
          <div
            className="w-full max-w-md rounded-[28px] border border-red-200 bg-orange-50 p-4 shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-red-600">Báo cáo sai lệch</p>
                <h3 className="mt-1 truncate text-xl font-black text-slate-900">{stockVarianceReport.groupName}</h3>
                <p className="mt-1 text-xs font-bold text-slate-600">
                  Tồn hệ thống {formatNumber(stockVarianceReport.expected)} {stockVarianceReport.unit} • Kiểm thực tế {formatNumber(stockVarianceReport.actual)} {stockVarianceReport.unit}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStockVarianceReport(null)}
                className="shrink-0 rounded-full bg-white/80 p-2 text-slate-500"
                aria-label="Đóng báo cáo sai lệch"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center">
              {[
                ['Tồn đầu', stockVarianceReport.baseline],
                ['Nhập', stockVarianceReport.imported],
                ['Xuất', stockVarianceReport.exported],
                ['Lệch', stockVarianceReport.diff]
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-orange-100 bg-white px-3 py-2">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
                  <p className={`mt-1 text-sm font-black ${label === 'Lệch' && value < 0 ? 'text-red-600' : label === 'Lệch' && value > 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                    {formatNumber(value || 0)} {stockVarianceReport.unit}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 rounded-2xl border border-orange-100 bg-white px-3 py-2 text-xs font-bold leading-relaxed text-slate-600">
              Tồn hệ thống = tồn đầu + nhập - xuất. Lệch âm nghĩa là kiểm thực tế ít hơn hệ thống; thường do còn phiếu xuất chưa ghi, hàng chết/hư/mất, hao hụt hoặc kiểm thiếu. Nếu số kiểm là đúng, hãy lưu nguyên nhân để chốt truy vết.
            </p>
            <div className="mt-4 space-y-2">
              {(stockVarianceReport.reasons || []).map(item => (
                <label key={item.reason} className="grid grid-cols-[1fr_112px] items-center gap-2 rounded-2xl border border-orange-100 bg-white px-3 py-2">
                  <span className="text-sm font-black text-slate-800">{item.reason}</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.quantity}
                      onChange={event => updateStockVarianceReason(item.reason, event.target.value)}
                      placeholder="0"
                      className="min-w-0 flex-1 rounded-xl border border-slate-200 px-2 py-2 text-right text-sm font-black text-slate-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                    />
                    <span className="text-[11px] font-black text-slate-500">{stockVarianceReport.unit}</span>
                  </div>
                </label>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-[0.8fr_1fr] gap-2">
              <button
                type="button"
                onClick={() => setStockVarianceReport(null)}
                className="rounded-2xl bg-white py-3 text-sm font-black text-slate-600"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveStockVarianceReport}
                disabled={isSavingStockCount || !canRecordActualStockReason}
                className="rounded-2xl bg-red-500 py-3 text-sm font-black text-white shadow-lg shadow-red-500/20 disabled:opacity-60"
              >
                {isSavingStockCount ? 'Đang lưu...' : 'Lưu nguyên nhân'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
  return WarehouseImportView;
}
