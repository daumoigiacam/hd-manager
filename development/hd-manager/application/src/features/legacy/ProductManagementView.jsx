import { memo, useState, useEffect, useMemo, useRef } from "react";
import { useModalScrollLock } from "../../layout/index.js";
import { useCallback, useSyncExternalStore } from "react";
import { useAppScreenBack } from "../../hooks/useAppScreenBack.js";
import { createIncrementalProductStockIndex } from "../../utils/incrementalProductStock.js";
import { useCooperativeProjection } from "../../hooks/useCooperativeProjection.js";
import { usePreparedSearch } from "../../hooks/usePreparedSearch.js";
import { hasSearchQuery as hasTokenSearchQuery, getProductSearchFields } from "../../services/searchEngine.js";
import { usePagedList } from "../../services/renderOptimization";
import { normalizeProductPricingUnit } from "../../services/productPricingUnits.js";
import { DollarSign, Plus, Check, X, ChevronRight, ChevronLeft, ShoppingBag, Settings, Package, Trash2, Banknote, Filter, Store, Scan, FileText, LayoutGrid, Loader2, ImagePlus, Barcode } from "lucide-react";
import { HDButton, HDEmptyState } from "../../design-system/index.js";
import { ListPagination } from "../../design-system/ListPagination.jsx";
// Transitional bundle boundary. Only stable local module bindings are injected;
// all actor/company/business data continues to arrive through current props.
// Generated binding contract is checked against the real source AST.
export function createProductManagementView(runtime) {
  const {ConfirmDialog,EMPTY_CATALOG_INVENTORY,EMPTY_PRODUCT_SEARCH_STORE,buildInventoryMetrics,formatCurrency,formatInputCurrency,formatNumber,getFriendlyFirebaseErrorMessage,getProductAttributes,getProductInventoryUnit,getProductOpeningStock,getProductShortName,getTodayString,normalizeLeadingLabel,normalizeLookupText,normalizeProductGroups,parseInputCurrency,parseLooseQuantityValue,productCatalogMetricsCache,toTitleCase} = runtime;
  const EMPTY_PRODUCT_INVENTORY_ROW = Object.freeze({});
  const ProductCatalogRow = memo(function ProductCatalogRow({ p, inventoryRow, productTab, showArchived, canEdit, canDelete, onEdit, onDelete }) {
          const isInventoryTracked = (inventoryRow.openingStock || 0) > 0;
          const isLowStock = isInventoryTracked && (inventoryRow.remainingStock || 0) <= Math.max(1, (inventoryRow.openingStock || 0) * 0.12);
          const productAttributes = getProductAttributes(p);
          const productShortName = getProductShortName(p);
          return (
          <div role="listitem" className={`hd-product-list__item ${showArchived ? 'hd-product-list__item--archived' : ''} ${isLowStock ? 'hd-product-list__item--low-stock' : ''}`}>
            <div
              className={`hd-product-list__primary ${canEdit && !showArchived ? 'cursor-pointer' : ''}`}
              onClick={() => !showArchived && canEdit && onEdit(p)}
              title={p.barcode ? `Mã: ${p.barcode}` : p.name}
            >
              <div className="hd-product-list__image">
                {p.image ? <img src={p.image} alt={p.name} loading="lazy" decoding="async" /> : <Package size={20}/>}
              </div>

              <div className="hd-product-list__info">
                <h3 className="hd-product-list__name">{p.name}</h3>
                <div className="hd-product-list__meta" title={`${productAttributes.join(', ')}${productAttributes.length > 0 ? ' • ' : ''}${p.unit || ''}`}>
                  <span>{productAttributes.length > 0 ? productAttributes.slice(0, 3).join(' · ') : 'Không thuộc tính'}</span>
                  <span aria-hidden="true">•</span>
                  <span>{p.unit || 'Chưa có ĐVT'}</span>
                </div>
              </div>

              <span className="hd-product-list__short-name" title="Tên viết tắt">{productShortName || '—'}</span>

              <div className="hd-product-list__price">
                <span>{formatCurrency(p.sellingPrice)} đ</span>
                {p.discount > 0 && <small>-{formatCurrency(p.discount)}</small>}
              </div>

              <div className="hd-product-list__action">
                {canDelete ? (
                  <button
                    type="button"
                    aria-label={`Xóa sản phẩm ${p.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      if(window.confirm('Xóa vĩnh viễn sản phẩm này?')) onDelete(p.id);
                    }}
                  >
                    <Trash2 size={14}/>
                  </button>
                ) : canEdit && !showArchived ? (
                  <ChevronRight size={16} aria-hidden="true" />
                ) : null}
              </div>
            </div>

              {productTab === 'inventory' && (
                <div className="hd-product-list__inventory">
                  <div className="rounded-xl bg-slate-50 px-2 py-1.5">
                    <p className="text-[9px] font-bold uppercase text-slate-400">Tồn đầu</p>
                    <p className="text-[11px] font-black text-slate-700">{formatNumber(inventoryRow.openingStock || 0)} {inventoryRow.stockUnit || getProductInventoryUnit(p)}</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 px-2 py-1.5">
                    <p className="text-[9px] font-bold uppercase text-amber-500">Đã bán</p>
                    <p className="text-[11px] font-black text-amber-700">{formatNumber(inventoryRow.soldQuantity || 0)}</p>
                  </div>
                  <div className={`rounded-xl px-2 py-1.5 ${isLowStock ? 'bg-rose-50' : 'bg-emerald-50'}`}>
                    <p className={`text-[9px] font-bold uppercase ${isLowStock ? 'text-rose-500' : 'text-emerald-500'}`}>Còn</p>
                    <p className={`text-[11px] font-black ${isLowStock ? 'text-rose-700' : 'text-emerald-700'}`}>{formatNumber(inventoryRow.remainingStock || 0)} {inventoryRow.stockUnit || getProductInventoryUnit(p)}</p>
                  </div>
                </div>
              )}
          </div>
          );

  });
  function ProductManagementView({ searchStore=null, warehouseImports = [], warehouseDispatches = [], isAccounting, currentCompany = {}, products, orders = [], onAddProduct, onEditProduct, onToggleArchiveProduct, onDeleteProduct, onUpdateCompanySettings, canCreateProduct = false, canEditProduct = false, canDeleteProduct = false, canViewArchivedProducts = false, canManageProductInventory = false, canManageProductAttributes = false, searchKeyword: externalSearchKeyword, setSearchKeyword: setExternalSearchKeyword, showFilterPanel: externalShowFilterPanel, setShowFilterPanel: setExternalShowFilterPanel, quickActionIntent = null, onQuickActionHandled = () => {} }) {
  const [showForm, setShowForm] = useState(false);
  useModalScrollLock(showForm);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const productSaveInFlightRef = useRef(false);
  const productCreateCommandRef = useRef(null);
  const [showArchived, setShowArchived] = useState(false);
  const [actionItem, setActionItem] = useState(null);
  const [editingProd, setEditingProd] = useState(null);
  const [localProductSearch, setLocalProductSearch] = useState('');
  const [localShowFilterPanel, setLocalShowFilterPanel] = useState(false);
  const [productTab, setProductTab] = useState('products');
  const [selectedUnit, setSelectedUnit] = useState('Tất cả');
  const [discountFilter, setDiscountFilter] = useState('Tất cả');
  const [isProductGroupCreateOpen, setIsProductGroupCreateOpen] = useState(false);
  const [newProductGroupName, setNewProductGroupName] = useState('');
  const [productGroupMessage, setProductGroupMessage] = useState('');
  const [isSavingProductGroup, setIsSavingProductGroup] = useState(false);
  const [editingProductGroupName, setEditingProductGroupName] = useState('');
  const [editingProductGroupValue, setEditingProductGroupValue] = useState('');
  const [isRenamingProductGroup, setIsRenamingProductGroup] = useState(false);
  const canCreate = Boolean(canCreateProduct || isAccounting);
  const canEdit = Boolean(canEditProduct || isAccounting);
  const canDelete = Boolean(canDeleteProduct || isAccounting);
  const canViewArchived = Boolean(canViewArchivedProducts || isAccounting);
  const canManageInventory = Boolean(canManageProductInventory || canEdit);
  const canManageAttributes = Boolean(canManageProductAttributes || canEdit);
  const canManageProductGroups = Boolean(canCreate || canEdit);
  const storedProductSearch=useSyncExternalStore((searchStore||EMPTY_PRODUCT_SEARCH_STORE).subscribe,(searchStore||EMPTY_PRODUCT_SEARCH_STORE).getSnapshot);
  const productSearch = searchStore?storedProductSearch:externalSearchKeyword ?? localProductSearch;
  const setProductSearch = setExternalSearchKeyword ?? setLocalProductSearch;
  const showFilterPanel = externalShowFilterPanel ?? localShowFilterPanel;
  const setShowFilterPanel = setExternalShowFilterPanel ?? setLocalShowFilterPanel;
  
  const [prodData, setProdData] = useState({ 
    name: '', category: '', unit: 'Cái', costPrice: '', sellingPrice: '', 
    shortName: '', barcode: '', image: '', discount: '', attributes: '' 
  });
  const [barcodeScanStatus, setBarcodeScanStatus] = useState('');
  const barcodeImageInputRef = useRef(null);
  const productWorkflowReturnRef = useRef(null);

  const [activeCategory, setActiveCategory] = useState('Tất cả');
  useAppScreenBack(() => {
    if (actionItem) {
      setActionItem(null);
      return true;
    }
    if (isProductGroupCreateOpen) {
      setIsProductGroupCreateOpen(false);
      return true;
    }
    if (editingProductGroupName) {
      setEditingProductGroupName('');
      setEditingProductGroupValue('');
      return true;
    }
    if (showForm) {
      setShowForm(false);
      return true;
    }
    if (productTab !== 'products') {
      setProductTab('products');
      return true;
    }
    if (showArchived) {
      setShowArchived(false);
      return true;
    }
    return false;
  });

  const activeProducts = useMemo(() => products.filter(p => !!p.isArchived === showArchived), [products, showArchived]);
  // Published collection records are replaced, including nested stock edits;
  // unchanged records retained by the snapshot setter can reuse measurements.
  const stockIndex = useMemo(() => createIncrementalProductStockIndex({ immutableRecords: true }), [currentCompany?.id]);
  const [inventoryCalculationAttempt,setInventoryCalculationAttempt]=useState(0);
  const inventoryDateKey=getTodayString();
  const inventoryScope=[currentCompany?.id,inventoryDateKey].join('|');
  const inventoryEntry=useMemo(()=>productCatalogMetricsCache([products,orders,warehouseImports,warehouseDispatches],inventoryScope),[products,orders,warehouseImports,warehouseDispatches,inventoryScope]);
  const prepareInventoryMetrics=useMemo(()=>()=>buildInventoryMetrics(products,orders,{untilDate:inventoryDateKey,warehouseImports,warehouseDispatches,stockBalanceResolver:stockIndex.build,cooperative:true}),[products,orders,warehouseImports,warehouseDispatches,stockIndex,inventoryDateKey,inventoryCalculationAttempt]);
  const inventoryProjection=useCooperativeProjection(prepareInventoryMetrics,inventoryEntry);
  const inventoryReady=!inventoryProjection.pending && !inventoryProjection.error;
  const inventoryMetrics=inventoryReady ? inventoryProjection.value : EMPTY_CATALOG_INVENTORY;
  const inventoryByProductId = useMemo(
    () => new Map(inventoryMetrics.productRows.map(row => [row.id, row])),
    [inventoryMetrics.productRows]
  );
  const configuredProductGroups = useMemo(
    () => normalizeProductGroups(currentCompany?.productGroups || []),
    [currentCompany?.productGroups]
  );
  const allCategories = useMemo(
    () => normalizeProductGroups([...configuredProductGroups, ...products.map(p => p.category)]),
    [configuredProductGroups, products]
  );
  const productGroupRows = useMemo(() => {
    const counts = new Map();
    products.forEach(product => {
      const key = normalizeLookupText(product.category || '');
      const count = counts.get(key) || { activeCount: 0, archivedCount: 0 };
      if (product.isArchived) count.archivedCount += 1;
      else count.activeCount += 1;
      counts.set(key, count);
    });
    return allCategories.map(category => ({
      name: category,
      ...(counts.get(normalizeLookupText(category)) || { activeCount: 0, archivedCount: 0 }),
    }));
  }, [allCategories, products]);
  const categories = useMemo(() => {
    const cats = activeProducts.map(p => p.category).filter(Boolean);
    return ['Tất cả', ...new Set(cats)];
  }, [activeProducts]);

  const units = useMemo(() => {
    const list = activeProducts.map(p => p.unit).filter(Boolean);
    return ['Tất cả', ...new Set(list)];
  }, [activeProducts]);

  const filteredProductCatalog = useMemo(() => (
    activeProducts.filter(p => {
      if (activeCategory !== 'Tất cả' && p.category !== activeCategory) return false;
      if (selectedUnit !== 'Tất cả' && p.unit !== selectedUnit) return false;
      if (discountFilter === 'Đang giảm giá' && !(p.discount > 0)) return false;
      if (discountFilter === 'Không giảm giá' && p.discount > 0) return false;
      return true;
    })
  ), [activeProducts, activeCategory, selectedUnit, discountFilter]);
  const preparedProductSearch = usePreparedSearch(filteredProductCatalog, getProductSearchFields, productSearch,undefined,undefined,undefined,{warmup:true});
  const displayedProducts = hasTokenSearchQuery(productSearch) ? preparedProductSearch.results : filteredProductCatalog;
  const inventoryProducts = useMemo(
    () => displayedProducts.filter(product => Number(inventoryByProductId.get(product.id)?.remainingStock || 0) > 0),
    [displayedProducts, inventoryByProductId]
  );
  const visibleProducts = productTab === 'inventory' ? inventoryProducts : displayedProducts;
  const productPage = usePagedList(visibleProducts, JSON.stringify([
    productTab, productSearch, activeCategory, selectedUnit, discountFilter, showArchived,
  ]));
  // Retain only the last committed VISIBLE page while this same immutable
  // catalog/stock/permission scope is being searched. Do not publish it as the
  // new answer or keep a second catalog/index. Reusing keyed rows avoids an
  // empty-list paint followed by remounting all cards on every broad query.
  const committedPageRef = useRef(null);
  const pageScope = useMemo(() => ({}), [currentCompany?.id, filteredProductCatalog, inventoryByProductId, productTab, canEdit, canDelete]);
  useEffect(() => {
    if (!preparedProductSearch.pending && !preparedProductSearch.error && (productTab !== 'inventory' || inventoryReady)) {
      committedPageRef.current = { scope: pageScope, page: productPage };
    } else if (committedPageRef.current?.scope !== pageScope) committedPageRef.current = null;
  }, [pageScope, productPage, preparedProductSearch.pending, preparedProductSearch.error, productTab, inventoryReady]);
  const retainedPage = preparedProductSearch.pending && !preparedProductSearch.error && committedPageRef.current?.scope === pageScope
    ? committedPageRef.current.page : null;
  const displayedPage = retainedPage || productPage;
  const hasProductFilters = hasTokenSearchQuery(productSearch)
    || activeCategory !== 'Tất cả'
    || selectedUnit !== 'Tất cả'
    || discountFilter !== 'Tất cả';

  useEffect(() => {
    if (!categories.includes(activeCategory)) setActiveCategory('Tất cả');
  }, [categories, activeCategory]);

  useEffect(() => {
    if (!units.includes(selectedUnit)) setSelectedUnit('Tất cả');
  }, [units, selectedUnit]);

  const resetProductFilters = () => {
    setProductSearch('');
    setActiveCategory('Tất cả');
    setSelectedUnit('Tất cả');
    setDiscountFilter('Tất cả');
  };

  const handleCreateProductGroup = async (event) => {
    event.preventDefault();
    const groupName = normalizeLeadingLabel(newProductGroupName);
    const groupKey = normalizeLookupText(groupName);

    if (!groupKey) {
      setProductGroupMessage('Vui lòng nhập tên nhóm hàng.');
      return;
    }

    if (allCategories.some(category => normalizeLookupText(category) === groupKey)) {
      setProductGroupMessage(`Nhóm hàng "${groupName}" đã có sẵn.`);
      return;
    }

    if (!canManageProductGroups || !onUpdateCompanySettings) {
      setProductGroupMessage('Tài khoản hiện tại chưa có quyền tạo nhóm hàng.');
      return;
    }

    setIsSavingProductGroup(true);
    setProductGroupMessage('');
    try {
      const result = await onUpdateCompanySettings({
        productGroups: normalizeProductGroups([...configuredProductGroups, groupName])
      });
      if (result?.success === false) {
        setProductGroupMessage(result.message || 'Chưa lưu được nhóm hàng. Vui lòng thử lại.');
        return;
      }
      setNewProductGroupName('');
      setIsProductGroupCreateOpen(false);
      setProductGroupMessage(`Đã tạo nhóm hàng "${groupName}".`);
    } catch (error) {
      setProductGroupMessage(`Tạo nhóm hàng lỗi: ${getFriendlyFirebaseErrorMessage(error, 'Vui lòng thử lại.')}`);
    } finally {
      setIsSavingProductGroup(false);
    }
  };

  const handleStartEditProductGroup = (groupName) => {
    if (!canManageProductGroups || isRenamingProductGroup) return;
    setEditingProductGroupName(groupName);
    setEditingProductGroupValue(groupName);
    setProductGroupMessage('');
  };

  const handleCancelEditProductGroup = () => {
    setEditingProductGroupName('');
    setEditingProductGroupValue('');
  };

  const handleRenameProductGroup = async (event, oldGroupName) => {
    event.preventDefault();
    const previousName = normalizeLeadingLabel(oldGroupName);
    const nextName = normalizeLeadingLabel(editingProductGroupValue);
    const previousKey = normalizeLookupText(previousName);
    const nextKey = normalizeLookupText(nextName);

    if (!previousKey || !nextKey) {
      setProductGroupMessage('Vui lòng nhập tên nhóm hàng hợp lệ.');
      return;
    }

    if (previousKey === nextKey) {
      handleCancelEditProductGroup();
      return;
    }

    if (!canManageProductGroups || !onUpdateCompanySettings) {
      setProductGroupMessage('Tài khoản hiện tại chưa có quyền sửa nhóm hàng.');
      return;
    }

    const hasDuplicate = allCategories.some(category => {
      const categoryKey = normalizeLookupText(category);
      return categoryKey === nextKey && categoryKey !== previousKey;
    });

    if (hasDuplicate) {
      setProductGroupMessage(`Nhóm hàng "${nextName}" đã có sẵn.`);
      return;
    }

    setIsRenamingProductGroup(true);
    setProductGroupMessage('');
    try {
      const existsInConfiguredGroups = configuredProductGroups.some(group => normalizeLookupText(group) === previousKey);
      const nextConfiguredGroups = existsInConfiguredGroups
        ? configuredProductGroups.map(group => normalizeLookupText(group) === previousKey ? nextName : group)
        : [...configuredProductGroups, nextName];

      const result = await onUpdateCompanySettings({
        productGroups: normalizeProductGroups(nextConfiguredGroups)
      });

      if (result?.success === false) {
        setProductGroupMessage(result.message || 'Chưa lưu được tên nhóm hàng. Vui lòng thử lại.');
        return;
      }

      const productsToRename = products.filter(product => normalizeLookupText(product.category || '') === previousKey);
      if (productsToRename.length > 0 && typeof onEditProduct === 'function') {
        await Promise.all(productsToRename.map(product => onEditProduct(product.id, { category: nextName })));
      }

      setEditingProductGroupName('');
      setEditingProductGroupValue('');
      setProductGroupMessage(`Đã đổi nhóm "${previousName}" thành "${nextName}".`);
    } catch (error) {
      setProductGroupMessage(`Sửa nhóm hàng lỗi: ${getFriendlyFirebaseErrorMessage(error, 'Vui lòng thử lại.')}`);
    } finally {
      setIsRenamingProductGroup(false);
    }
  };

  const emptyProductForm = (prefill = {}) => ({
    name: '',
    shortName: '',
    category: '',
    unit: 'Cái',
    purchaseUnit: 'Kg',
    stockUnit: 'Con',
    stockQuantity: '',
    costPrice: '',
    sellingPrice: '',
    barcode: '',
    image: '',
    discount: '',
    attributes: '',
    ...prefill
  });

  const openCreateProductForm = useCallback((prefill = {}) => {
    productCreateCommandRef.current = crypto.randomUUID();
    setEditingProd(null);
    setBarcodeScanStatus('');
    setProdData(emptyProductForm(prefill));
    setShowForm(true);
  }, []);

  useEffect(() => {
    if (quickActionIntent?.type !== 'create_product') return;
    productWorkflowReturnRef.current = quickActionIntent.returnTo || null;
    openCreateProductForm(quickActionIntent.prefill || {});
    onQuickActionHandled?.();
  }, [quickActionIntent?.id, quickActionIntent?.requestedAt, quickActionIntent?.type, openCreateProductForm]);

  const handleOpenEdit = useCallback((p) => {
    setEditingProd(p);
    setBarcodeScanStatus('');
    setProdData({ 
      name: p.name, category: p.category, unit: p.unit,
      purchaseUnit: p.purchaseUnit || 'Kg',
      stockUnit: p.stockUnit || p.inventoryUnit || p.unit || 'Con',
      stockQuantity: getProductOpeningStock(p),
      costPrice: p.costPrice || '', sellingPrice: p.sellingPrice || '',
      shortName: getProductShortName(p),
      barcode: p.barcode || '', image: p.image || '', discount: p.discount || '',
      attributes: getProductAttributes(p).join(', ')
    });
    setShowForm(true);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (productSaveInFlightRef.current) return;
    productSaveInFlightRef.current = true;
    setIsSavingProduct(true);
    let pData = { 
      ...prodData,
      name: toTitleCase((prodData.name || '').trim()),
      shortName: `${prodData.shortName || ''}`.trim().toUpperCase(),
      productShortName: `${prodData.shortName || ''}`.trim().toUpperCase(),
      costPrice: parseInt(prodData.costPrice) || 0, 
      sellingPrice: parseInt(prodData.sellingPrice) || 0,
      discount: parseInt(prodData.discount) || 0,
      attributes: getProductAttributes({ attributes: prodData.attributes }),
      productAttributes: getProductAttributes({ attributes: prodData.attributes }),
      attributeText: `${prodData.attributes || ''}`.trim(),
      stockQuantity: parseLooseQuantityValue(prodData.stockQuantity),
      stockUnit: `${prodData.stockUnit || prodData.unit || ''}`.trim(),
      purchaseUnit: normalizeProductPricingUnit(prodData.purchaseUnit || 'Kg')
    };
    try {
      if (editingProd) {
        await Promise.resolve(onEditProduct(editingProd.id, pData));
        productWorkflowReturnRef.current = null;
      } else {
        productCreateCommandRef.current ||= crypto.randomUUID();
        await Promise.resolve(onAddProduct({ ...pData, clientMutationId: productCreateCommandRef.current }));
      }
      setBarcodeScanStatus('');
      setShowForm(false);
      if (!editingProd && productWorkflowReturnRef.current) {
        const nextStep = productWorkflowReturnRef.current;
        productWorkflowReturnRef.current = null;
        onQuickActionHandled?.(nextStep);
      }
    } catch (error) {
      setBarcodeScanStatus(getFriendlyFirebaseErrorMessage(error, 'Không thể lưu sản phẩm. Vui lòng kiểm tra lại thông tin.'));
    } finally {
      productSaveInFlightRef.current = false;
      setIsSavingProduct(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 500000) {
        alert("Vui lòng chọn ảnh có kích thước nhỏ hơn 500KB để tối ưu tốc độ.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => setProdData({...prodData, image: reader.result});
      reader.readAsDataURL(file);
    }
  };

  const handleBarcodeImageScan = async (file) => {
    if (!file) return;

    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
    setBarcodeScanStatus('');
      return;
    }

    setBarcodeScanStatus('');

    try {
      const defaultFormats = ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar'];
      const supportedFormats = typeof window.BarcodeDetector.getSupportedFormats === 'function'
        ? await window.BarcodeDetector.getSupportedFormats()
        : defaultFormats;
      const formats = defaultFormats.filter(format => supportedFormats.includes(format));
      const detector = new window.BarcodeDetector({ formats: formats.length > 0 ? formats : supportedFormats });
      const bitmap = await createImageBitmap(file);
      const results = await detector.detect(bitmap);
      if (typeof bitmap.close === 'function') bitmap.close();

      if (!results.length || !results[0]?.rawValue) {
    setBarcodeScanStatus('');
        return;
      }

      const detectedCode = results[0].rawValue.trim();
      setProdData(prev => ({ ...prev, barcode: detectedCode }));
      setBarcodeScanStatus(`Đã nhận mã: ${detectedCode}`);
    } catch (error) {
    setBarcodeScanStatus('');
    } finally {
      if (barcodeImageInputRef.current) barcodeImageInputRef.current.value = '';
    }
  };

  const handleScanBarcode = () => {
    barcodeImageInputRef.current?.click();
  };

  return (
    <div className="premium-data-module premium-products-module space-y-4 animate-in fade-in pb-16" aria-busy={productTab === 'inventory' && !inventoryReady}>
      {productTab === 'inventory' && inventoryProjection.pending && <p role="status" className="p-3 text-sm text-slate-500">Đang đối chiếu số lượng và giá trị tồn kho…</p>}
      {productTab === 'inventory' && inventoryProjection.error && <p role="alert" className="p-3 text-sm text-amber-800">Chưa tính xong tồn kho.
        <button type="button" onClick={()=>setInventoryCalculationAttempt(n=>n+1)} className="ml-3 font-bold underline">Thử lại</button>
      </p>}
      <div className="hd-section-tabs hd-product-tabs grid grid-cols-3 border-b border-gray-200" role="tablist" aria-label="Kho sản phẩm">
        <button type="button" role="tab" aria-selected={!showArchived && productTab === 'products'} onClick={() => { setProductTab('products'); setShowArchived(false); }} className={`border-b-2 text-sm font-semibold ${!showArchived && productTab === 'products' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'}`}>Sản phẩm</button>
        <button type="button" role="tab" aria-selected={!showArchived && productTab === 'inventory'} onClick={() => { setProductTab('inventory'); setShowArchived(false); }} className={`border-b-2 text-sm font-semibold ${!showArchived && productTab === 'inventory' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'}`}>Tồn kho</button>
        <button type="button" role="tab" aria-selected={productTab === 'groups'} onClick={() => { setProductTab('groups'); setShowArchived(false); }} className={`border-b-2 text-sm font-semibold ${productTab === 'groups' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500'}`}>Nhóm hàng</button>
      </div>

      {showFilterPanel && productTab !== 'groups' && (
        <div className="bg-white rounded-2xl border border-emerald-100 p-3 shadow-sm space-y-3 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wide text-emerald-700">
              <Filter size={14} />
              Bộ lọc sản phẩm
            </div>
            <button type="button" onClick={() => setShowFilterPanel(false)} className="rounded-full bg-gray-100 p-1.5 text-gray-500 hover:bg-gray-200" aria-label="Đóng bộ lọc">
              <X size={15} />
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
            {categories.map(cat => (
              <button 
                key={cat} 
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold shrink-0 transition-colors ${activeCategory === cat ? 'bg-emerald-50 border border-emerald-500 text-emerald-600' : 'bg-white border border-gray-200 text-gray-600'}`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Lọc theo nhóm</label>
              <select value={activeCategory} onChange={e => setActiveCategory(e.target.value)} className="w-full border border-gray-200 rounded-xl p-2.5 text-sm outline-none bg-white">
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Lọc theo đơn vị</label>
              <select value={selectedUnit} onChange={e => setSelectedUnit(e.target.value)} className="w-full border border-gray-200 rounded-xl p-2.5 text-sm outline-none bg-white">
                {units.map(unit => <option key={unit} value={unit}>{unit}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Lọc theo khuyến mãi</label>
              <select value={discountFilter} onChange={e => setDiscountFilter(e.target.value)} className="w-full border border-gray-200 rounded-xl p-2.5 text-sm outline-none bg-white">
                <option value="Tất cả">Tất cả sản phẩm</option>
                <option value="Đang giảm giá">Đang giảm giá</option>
                <option value="Không giảm giá">Không giảm giá</option>
              </select>
            </div>
            <button type="button" onClick={resetProductFilters} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-bold transition-colors">
              Xóa bộ lọc
            </button>
          </div>
        </div>
      )}

      {productTab === 'groups' ? (
        <div className="hd-product-groups rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
            <div className="hd-product-groups__header mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-gray-800">Danh sách nhóm hàng</p>
                <span className="text-[11px] font-bold text-gray-400">{productGroupRows.length} nhóm</span>
              </div>
              {canManageProductGroups && (
                <button
                  type="button"
                  onClick={() => {
                    setIsProductGroupCreateOpen(isOpen => !isOpen);
                    setProductGroupMessage('');
                  }}
                  aria-label="Thêm nhóm hàng"
                  title="Thêm nhóm hàng"
                  className="hd-product-groups__add inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-700"
                >
                  <Plus size={18} />
                </button>
              )}
            </div>
            {isProductGroupCreateOpen && canManageProductGroups && (
              <form onSubmit={handleCreateProductGroup} className="mb-3 flex items-center gap-2 rounded-xl bg-slate-50 p-2">
                <input
                  autoFocus
                  value={newProductGroupName}
                  onChange={event => {
                    setNewProductGroupName(toTitleCase(event.target.value));
                    if (productGroupMessage) setProductGroupMessage('');
                  }}
                  disabled={isSavingProductGroup}
                  aria-label="Tên nhóm hàng mới"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-400"
                />
                <button type="submit" disabled={isSavingProductGroup} aria-label="Lưu nhóm hàng" title="Lưu nhóm hàng" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white disabled:bg-gray-300">
                  {isSavingProductGroup ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}
                </button>
                <button type="button" onClick={() => { setIsProductGroupCreateOpen(false); setNewProductGroupName(''); setProductGroupMessage(''); }} aria-label="Hủy thêm nhóm hàng" title="Hủy" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200">
                  <X size={17} />
                </button>
              </form>
            )}
            {productGroupMessage && (
              <p className={`mb-3 text-xs font-semibold ${productGroupMessage.startsWith('Đã') ? 'text-emerald-600' : 'text-amber-600'}`}>
                {productGroupMessage}
              </p>
            )}
            {!canManageProductGroups && (
              <p className="mb-3 text-xs font-semibold text-gray-400">Tài khoản này chỉ được xem nhóm hàng.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {productGroupRows.map(group => {
                const isEditingGroup = normalizeLookupText(editingProductGroupName) === normalizeLookupText(group.name);

                return (
                  <div key={group.name} className="rounded-2xl border border-emerald-50 bg-emerald-50/50 p-3">
                    {isEditingGroup ? (
                      <form onSubmit={event => handleRenameProductGroup(event, group.name)} className="space-y-2">
                        <input
                          autoFocus
                          value={editingProductGroupValue}
                          onChange={event => {
                            setEditingProductGroupValue(toTitleCase(event.target.value));
                            if (productGroupMessage) setProductGroupMessage('');
                          }}
                          disabled={isRenamingProductGroup}
                          className="w-full rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100 disabled:bg-gray-50 disabled:text-gray-400"
                          placeholder="Tên nhóm hàng"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={handleCancelEditProductGroup}
                            disabled={isRenamingProductGroup}
                            className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-black text-gray-600 disabled:opacity-60"
                          >
                            Hủy
                          </button>
                          <button
                            type="submit"
                            disabled={isRenamingProductGroup}
                            className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:bg-gray-300"
                          >
                            {isRenamingProductGroup ? 'Đang lưu' : 'Lưu'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleStartEditProductGroup(group.name)}
                          disabled={!canManageProductGroups || isRenamingProductGroup}
                          className={`block w-full text-left ${canManageProductGroups ? 'cursor-pointer' : 'cursor-default'}`}
                        >
                          <p className="truncate text-sm font-black text-gray-800">{group.name}</p>
                        </button>
                        <p className="mt-1 text-[11px] font-semibold text-emerald-700">
                          {group.activeCount} sản phẩm
                          {group.archivedCount > 0 ? ` • ${group.archivedCount} đã ẩn` : ''}
                        </p>
                        {canManageProductGroups && (
                          <p className="mt-1 text-[10px] font-semibold text-gray-400">Bấm tên nhóm để sửa</p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
              {productGroupRows.length === 0 && (
                <HDEmptyState
                  className="col-span-2 rounded-2xl border border-dashed border-slate-200 bg-white"
                  icon={<Package size={24} aria-hidden="true" />}
                  title="Chưa có nhóm hàng"
                  description={canManageProductGroups
                    ? 'Tạo nhóm đầu tiên bằng nút thêm ở phía trên.'
                    : 'Nhóm hàng của công ty sẽ hiển thị tại đây sau khi được tạo.'}
                />
              )}
            </div>
        </div>
      ) : (
      <>
        <fieldset disabled={preparedProductSearch.pending} className="m-0 min-w-0 border-0 p-0"><ListPagination pagination={displayedPage} label="Phân trang sản phẩm" /></fieldset>
      <fieldset disabled={preparedProductSearch.pending} onClickCapture={event => { if (preparedProductSearch.pending) { event.preventDefault(); event.stopPropagation(); } }} className="hd-product-list relative m-0 min-w-0 border-0 p-0" role="list" aria-busy={preparedProductSearch.pending} data-hd-search-retained={Boolean(retainedPage)} data-hd-search-committed-query={!preparedProductSearch.pending && !preparedProductSearch.error && (productTab !== 'inventory' || inventoryReady) ? productSearch : undefined} aria-label={productTab === 'inventory' ? 'Danh sách tồn kho sản phẩm' : 'Danh sách sản phẩm'}>
        {retainedPage ? <span role="status" className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-emerald-300"><span className="sr-only">Đang lọc; danh sách trước chưa phải kết quả mới.</span></span> : null}
        {preparedProductSearch.pending && !retainedPage ? <p role="status" aria-busy="true" className="p-4 text-sm text-slate-500">Đang tìm sản phẩm…</p> : preparedProductSearch.error ? <p role="alert" className="p-4 text-sm text-amber-700">Không thể tìm sản phẩm. Hãy thử lại từ khóa.</p> : productTab === 'inventory' && !inventoryReady ? <p role="status" className="p-4 text-sm text-slate-500">Chưa có kết quả tồn kho hoàn tất để hiển thị.</p> : <>
        {displayedPage.items.map(p => <ProductCatalogRow key={p.id} p={p} inventoryRow={inventoryByProductId.get(p.id) || EMPTY_PRODUCT_INVENTORY_ROW} productTab={productTab} showArchived={showArchived} canEdit={canEdit} canDelete={canDelete} onEdit={handleOpenEdit} onDelete={onDeleteProduct} />)}
        {displayedPage.items.length === 0 && !preparedProductSearch.pending && (
          <HDEmptyState
            icon={<Package size={24} aria-hidden="true" />}
            title={hasProductFilters
              ? 'Không tìm thấy sản phẩm phù hợp'
              : productTab === 'inventory'
                ? (displayedProducts.length > 0 ? 'Chưa có sản phẩm còn tồn kho' : 'Chưa có sản phẩm')
                : showArchived ? 'Chưa có sản phẩm đã lưu trữ' : 'Chưa có sản phẩm'}
            description={hasProductFilters
              ? 'Thử điều chỉnh từ khóa hoặc bộ lọc để xem thêm sản phẩm.'
              : productTab === 'inventory' && displayedProducts.length > 0
                ? 'Sản phẩm sẽ xuất hiện tại đây khi tồn kho được ghi nhận lớn hơn 0.'
                : showArchived
                  ? 'Các sản phẩm đã lưu trữ sẽ được liệt kê tại đây.'
                  : canCreate
                    ? 'Thêm sản phẩm đầu tiên để bắt đầu quản lý danh mục và tồn kho.'
                    : 'Sản phẩm sẽ hiển thị tại đây sau khi người có quyền tạo thêm.'}
            action={hasProductFilters
              ? <HDButton variant="secondary" size="sm" onClick={resetProductFilters}>Xóa bộ lọc</HDButton>
              : productTab === 'inventory' && displayedProducts.length > 0
                ? <HDButton variant="secondary" size="sm" onClick={() => setProductTab('products')}>Xem sản phẩm</HDButton>
                : showArchived
                  ? <HDButton variant="secondary" size="sm" onClick={() => setShowArchived(false)}>Xem sản phẩm đang dùng</HDButton>
                  : canCreate
                    ? <HDButton variant="primary" size="sm" onClick={() => openCreateProductForm()}>Thêm sản phẩm</HDButton>
                    : null}
            className="rounded-2xl border border-dashed border-slate-200 bg-white"
          />
        )}
      </>}
      </fieldset>
      </>
      )}

      {!showArchived && canCreate && (
        <div className="hd-module-fab hd-product-module-fab fixed right-4 z-50 pointer-events-none flex justify-end">
           <button aria-label="Thêm sản phẩm" onClick={() => openCreateProductForm()} className="pointer-events-auto bg-blue-600 text-white rounded-full w-14 h-14 shadow-[0_4px_15px_rgba(37,99,235,0.4)] flex items-center justify-center hover:bg-blue-700 hover:scale-105 transition-all">
              <Plus size={28}/>
           </button>
        </div>
      )}

      {showForm && (
        <div className="hd-product-editor-layer hd-modal-layer fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 px-0 pt-4 pb-[calc(88px+env(safe-area-inset-bottom))] sm:p-4" data-hd-modal-root="true">
          <div className="hd-product-editor hd-modal-surface bg-white rounded-t-3xl sm:rounded-2xl p-5 w-full max-w-md animate-in slide-in-from-bottom-full duration-300 flex flex-col max-h-[calc(100dvh-120px)] sm:max-h-[90vh]" role="dialog" aria-modal="true" aria-label={editingProd ? 'Sửa sản phẩm' : 'Tạo sản phẩm'}>
            <div className="hd-product-editor__header flex justify-between items-center mb-4 shrink-0 border-b border-gray-100 pb-3">
              <button type="button" aria-label="Quay lại" onClick={()=>setShowForm(false)} className="hd-product-editor__back"><ChevronLeft size={24}/></button>
              <h3 className="font-bold text-lg text-gray-800">{editingProd ? 'Sửa sản phẩm' : 'Tạo sản phẩm'}</h3>
            </div>
            
            <form onSubmit={handleSubmit} className="hd-product-editor__form flex min-h-0 flex-1 flex-col">
              <div className="hd-product-editor__body hd-modal-body space-y-4 overflow-y-auto pr-1 pb-4 flex-1">
              
              {editingProd && <div className="hd-product-editor__row hd-product-editor__row--barcode">
                <label className="hd-product-editor__field">
                  <Barcode size={19} className="hd-product-editor__field-icon" />
                  <span className="hd-product-editor__field-control">
                    <span className="hd-product-editor__field-label">Mã vạch / SKU</span>
                    <input aria-label="Mã vạch / SKU" type="text" value={prodData.barcode} onChange={e=>setProdData({...prodData, barcode: e.target.value})} className="hd-product-editor__field-input" />
                  </span>
                </label>
                <button type="button" onClick={handleScanBarcode} className="hd-product-editor__scan-button" aria-label="Quét mã từ ảnh hoặc QR">
                  <Scan size={18} />
                  <span className="hd-product-editor__field-label">Quét ảnh/QR</span>
                </button>
                <input ref={barcodeImageInputRef} type="file" accept="image/*" onChange={e => handleBarcodeImageScan(e.target.files?.[0])} className="hidden" />
                {barcodeScanStatus && <p className={`hd-product-editor__status ${barcodeScanStatus.startsWith('Đã nhận mã') ? 'text-emerald-600' : barcodeScanStatus.startsWith('Đang quét') ? 'text-blue-600' : 'text-orange-600'}`}>{barcodeScanStatus}</p>}
              </div>}
              {!editingProd && barcodeScanStatus && <p role="alert" className="text-red-600">{barcodeScanStatus}</p>}

              <div className="hd-product-editor__row hd-product-editor__row--name-image">
                <label className="hd-product-editor__field">
                  <ShoppingBag size={19} className="hd-product-editor__field-icon" />
                  <span className="hd-product-editor__field-control">
                    <span className="hd-product-editor__field-label">Tên sản phẩm *</span>
                    <input aria-label="Tên sản phẩm" required type="text" value={prodData.name} onChange={e=>setProdData({...prodData, name: toTitleCase(e.target.value)})} className="hd-product-editor__field-input" />
                  </span>
                </label>
                <label className="hd-product-editor__image-picker" title="Chọn ảnh sản phẩm">
                  {prodData.image ? (
                    <img src={prodData.image} alt="Ảnh sản phẩm" className="w-full h-full object-cover" />
                  ) : (
                    <><ImagePlus size={18} /><span className="hd-product-editor__field-label">Ảnh sản phẩm</span></>
                  )}
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                </label>
              </div>

              <div className="hd-product-editor__row hd-product-editor__row--short-category">
                <label className="hd-product-editor__field">
                  <FileText size={18} className="hd-product-editor__field-icon" />
                  <span className="hd-product-editor__field-control">
                    <span className="hd-product-editor__field-label">Viết tắt</span>
                    <input aria-label="Viết tắt" type="text" value={prodData.shortName || ''} onChange={e=>setProdData({...prodData, shortName: e.target.value.toUpperCase()})} className="hd-product-editor__field-input font-black uppercase" />
                  </span>
                </label>
                <label className="hd-product-editor__field">
                  <LayoutGrid size={18} className="hd-product-editor__field-icon" />
                  <span className="hd-product-editor__field-control">
                    <span className="hd-product-editor__field-label">Nhóm hàng *</span>
                    <input aria-label="Nhóm hàng" required type="text" value={prodData.category} onChange={e=>setProdData({...prodData, category: toTitleCase(e.target.value)})} list="category-list" className="hd-product-editor__field-input" />
                  </span>
                  <datalist id="category-list">
                    {allCategories.map(c => <option key={c} value={c} />)}
                  </datalist>
                </label>
              </div>

              <div className={`hd-product-editor__row hd-product-editor__row--unit-attributes ${canManageAttributes ? '' : 'hd-product-editor__row--single'}`}>
                <label className="hd-product-editor__field">
                  <Store size={18} className="hd-product-editor__field-icon" />
                  <span className="hd-product-editor__field-control">
                    <span className="hd-product-editor__field-label">Đơn vị bán *</span>
                    <input aria-label="Đơn vị bán" required type="text" value={prodData.unit} onChange={e=>setProdData({...prodData, unit: toTitleCase(e.target.value)})} list="unit-list" className="hd-product-editor__field-input" />
                  </span>
                  <datalist id="unit-list">
                    <option value="Cái" /><option value="Kg" /><option value="Con" /><option value="Lít" /><option value="Hộp" /><option value="Thùng" /><option value="Gói" />
                  </datalist>
                </label>
                {canManageAttributes && (
                  <label className="hd-product-editor__field">
                    <Settings size={18} className="hd-product-editor__field-icon" />
                    <span className="hd-product-editor__field-control">
                      <span className="hd-product-editor__field-label">Thuộc tính</span>
                    <input
                      aria-label="Thuộc tính"
                      type="text"
                      value={prodData.attributes || ''}
                      onChange={e => setProdData({ ...prodData, attributes: e.target.value })}
                      className="hd-product-editor__field-input"
                    />
                    </span>
                  </label>
                )}
              </div>

              <label className="hd-product-editor__field">
                <Store size={18} className="hd-product-editor__field-icon" />
                <span className="hd-product-editor__field-control">
                  <span className="hd-product-editor__field-label">Đơn vị nhập *</span>
                  <input aria-label="Đơn vị nhập" required type="text" value={prodData.purchaseUnit || 'Kg'} onChange={e => setProdData({ ...prodData, purchaseUnit: e.target.value })} list="unit-list" className="hd-product-editor__field-input" />
                </span>
              </label>
              <div className="hd-product-editor__row hd-product-editor__row--prices">
                <label className="hd-product-editor__field">
                  <Banknote size={19} className="hd-product-editor__field-icon" />
                  <span className="hd-product-editor__field-control">
                    <span className="hd-product-editor__field-label">Giá vốn</span>
                    <input aria-label="Giá vốn" type="tel" value={formatInputCurrency(prodData.costPrice)} onChange={e=>setProdData({...prodData, costPrice: parseInputCurrency(e.target.value)})} className="hd-product-editor__field-input" />
                  </span>
                </label>
                <label className="hd-product-editor__field">
                  <DollarSign size={19} className="hd-product-editor__field-icon" />
                  <span className="hd-product-editor__field-control">
                    <span className="hd-product-editor__field-label">Giá bán *</span>
                    <input aria-label="Giá bán" required type="tel" value={formatInputCurrency(prodData.sellingPrice)} onChange={e=>setProdData({...prodData, sellingPrice: parseInputCurrency(e.target.value)})} className="hd-product-editor__field-input font-bold" />
                  </span>
                </label>
              </div>

              <div className="hd-product-editor__row hd-product-editor__row--inventory">
                  <label className="hd-product-editor__field">
                    <Package size={19} className="hd-product-editor__field-icon" />
                    <span className="hd-product-editor__field-control">
                      <span className="hd-product-editor__field-label">Tồn đầu</span>
                    <input
                      aria-label="Tồn đầu"
                      type="number"
                      min="0"
                      step="0.01"
                      value={prodData.stockQuantity}
                      onChange={e => setProdData({ ...prodData, stockQuantity: e.target.value })}
                      disabled={!canManageInventory}
                      className="hd-product-editor__field-input"
                    />
                    </span>
                  </label>
                  <label className="hd-product-editor__field">
                    <Store size={19} className="hd-product-editor__field-icon" />
                    <span className="hd-product-editor__field-control">
                      <span className="hd-product-editor__field-label">Đơn vị tồn</span>
                    <input
                      aria-label="Đơn vị tồn"
                      type="text"
                      value={prodData.stockUnit}
                      onChange={e => setProdData({ ...prodData, stockUnit: toTitleCase(e.target.value) })}
                      list="stock-unit-list"
                      disabled={!canManageInventory}
                      className="hd-product-editor__field-input"
                    />
                    </span>
                    <datalist id="stock-unit-list">
                      <option value="Con" /><option value="Kg" /><option value="Cái" /><option value="Thùng" /><option value="Túi" /><option value="Bao" />
                    </datalist>
                  </label>
              </div>

              </div>

              <div className="hd-product-editor__actions hd-modal-actions -mx-5 flex gap-3 shrink-0 border-t border-gray-100 bg-white px-5 pt-3 pb-[calc(8px+env(safe-area-inset-bottom))]">
                <button type="button" onClick={()=>setShowForm(false)} disabled={isSavingProduct} className="flex-1 bg-gray-100 py-3 rounded-xl text-gray-700 font-bold disabled:opacity-50">Hủy</button>
                <button type="submit" disabled={isSavingProduct} aria-busy={isSavingProduct} className="flex-1 bg-emerald-500 text-white py-3 rounded-xl font-bold disabled:opacity-50">{isSavingProduct ? 'Đang lưu...' : 'Lưu'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog 
        isOpen={!!actionItem} 
        isRestoring={actionItem?.isArchived}
        title={actionItem?.isArchived ? "Khôi phục sản phẩm" : "Ẩn sản phẩm"} 
        message={actionItem?.isArchived ? "Sản phẩm này sẽ xuất hiện trở lại trong danh mục bán hàng. Bạn đồng ý chứ?" : "Sản phẩm này sẽ bị ẩn để dọn dẹp danh sách, có thể khôi phục từ tab Đã ẩn."}
        onConfirm={() => { onToggleArchiveProduct(actionItem.id, actionItem.isArchived); setActionItem(null); }} 
        onCancel={() => setActionItem(null)} 
      />
    </div>
  );
}
  return ProductManagementView;
}
