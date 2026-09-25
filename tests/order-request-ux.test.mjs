import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import {
  ORDER_REQUEST_SELECTION_LOCK_MS,
  releaseOrderRequestSelectionLock,
  tryAcquireOrderRequestSelectionLock
} from '../src/utils/orderRequestInteraction.js';
import {
  applyOrderRequestClassificationEdit,
  getOrderRequestSizeDisplayValue
} from '../src/utils/orderRequestEditing.js';
import {
  buildOrderRequestSharePagesByCustomer,
  groupOrderRequestShareRowsByCustomer
} from '../src/utils/orderRequestShareGrouping.js';
import { getFixedFooterNavIds } from '../src/utils/footerNavigation.js';
import { buildCustomerFixedProductMemoryPatch } from '../src/utils/customerFixedProductMemory.js';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const appSource = fs.readFileSync(path.join(testDirectory, '..', 'src', 'App.jsx'), 'utf8');

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('product interaction lock rejects rapid duplicate input', () => {
  const locks = new Set();
  assert.equal(ORDER_REQUEST_SELECTION_LOCK_MS, 320);
  assert.equal(tryAcquireOrderRequestSelectionLock(locks, 'product-a'), true);
  assert.equal(tryAcquireOrderRequestSelectionLock(locks, 'product-a'), false);
  assert.equal(locks.size, 1);
  assert.equal(releaseOrderRequestSelectionLock(locks, 'product-a'), true);
  assert.equal(tryAcquireOrderRequestSelectionLock(locks, 'product-a'), true);
});

test('different product options remain independently selectable', () => {
  const locks = new Set();
  assert.equal(tryAcquireOrderRequestSelectionLock(locks, 'product-a'), true);
  assert.equal(tryAcquireOrderRequestSelectionLock(locks, 'product-b'), true);
  assert.deepEqual([...locks].sort(), ['product-a', 'product-b']);
});

test('order product cards expose selected, pending and memoized states', () => {
  assert.match(appSource, /const OrderRequestSelectableProductCard = React\.memo/);
  assert.match(appSource, /aria-selected=\{isSelected\}/);
  assert.match(appSource, /aria-busy=\{isPending\}/);
  assert.match(appSource, /data-selected=\{isSelected \? 'true' : 'false'\}/);
  assert.match(appSource, /pendingQuickProductSelectionKeys\.has\(selectionKey\)/);
});

test('existing variant is toggled instead of creating a duplicate line', () => {
  assert.match(appSource, /const normalizedQuickItem = buildQuickProductDraftItem\(productId, \{\}, variantConfig\);/);
  assert.match(appSource, /const targetVariantKey = getDraftItemVariantKey\(normalizedQuickItem\);/);
  assert.match(appSource, /findIndex\(\(item\) => getDraftItemVariantKey\(item\) === targetVariantKey\)/);
  assert.match(appSource, /filter\(\(item\) => getDraftItemVariantKey\(item\) !== targetVariantKey\)/);
});

test('plus picker exposes the active catalog and remembers new customer products after save', () => {
  assert.match(appSource, /const manualCatalogProductVariantOptions = useMemo\(\(\) => activeProducts\.flatMap/);
  assert.match(appSource, /const sourceVariants = manualCatalogProductVariantOptions\.filter/);
  assert.match(appSource, /const savedRequestId = await onAddOrderRequest/);
  assert.match(appSource, /await persistOrderRequestMemories\(savedRequests\);/);
  assert.match(appSource, /onEditCustomer=\{onEditCustomer\}/);
  assert.match(appSource, /if \(!configuredBilling\.isValid && !hasSavedPricingSnapshot\)/);
});

test('catalog product attributes become selectable order-request variants', () => {
  const variantSource = appSource.slice(
    appSource.indexOf('const getCustomerProductVariants'),
    appSource.indexOf('const hasCustomerProductPrice'),
  );

  assert.match(variantSource, /if \(productAttributes\.length > 0 && !hasConfiguredVariants\)/);
  assert.match(variantSource, /productAttributes\.forEach\(\(attribute, index\) =>/);
  assert.match(variantSource, /attributeLabel: attribute/);
  assert.match(appSource, /const manualFixedProductVariantOptions = useMemo\(\(\) => manualFixedProductOptions\.flatMap/);
  assert.match(appSource, /const manualFixedProductVariantGroups = useMemo\(/);
  assert.match(appSource, /manualFixedProductVariantGroups\.map\(\(\{ product, variants \}\)/);
  assert.doesNotMatch(appSource, /manualFixedProductVariantOptions\.map/);
});

test('catalog search groups one product and keeps its attributes as selectable chips', () => {
  assert.match(appSource, /const groupOrderRequestProductVariants = \(options = \[\]\) =>/);
  assert.match(appSource, /const attributeLabels = \[\.\.\.new Set\(\[/);
  assert.match(appSource, /const getFamily = \(product = \{\}\) =>/);
  assert.match(appSource, /const groupKey = family\.key;/);
  assert.doesNotMatch(appSource, /const groupKey = `\$\{family\.key\}__\$\{normalizeLookupText\(product\?\.category/);
  assert.match(appSource, /displayAttributeLabel/);
  assert.match(appSource, /const visibleLabels = new Set\(\)/);
  assert.match(appSource, /const manualExtraProductVariantGroups = useMemo\(/);
  assert.match(appSource, /<OrderRequestSelectableProductGroup/);
  assert.match(appSource, /data-order-product-attribute=\{selectionKey\}/);
  assert.match(appSource, /onSelect=\{handleQuickProductCardSelect\}/);
});

test('configured duplicate products across categories appear as one suggestion with all variants', () => {
  const start = appSource.indexOf('const groupOrderRequestProductVariants = (options = []) =>');
  const end = appSource.indexOf('const OrderRequestSelectableProductGroup', start);
  assert.ok(start >= 0 && end > start, 'product variant grouping function should be present');
  const groupProductVariants = vm.runInNewContext(
    `${appSource.slice(start, end)}; groupOrderRequestProductVariants`,
    {
      normalizeLookupText: value => `${value}`
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim(),
      getProductAttributes: product => product.attributes || [],
    },
  );
  const groups = groupProductVariants([
    {
      product: { id: 'duck-main', name: 'Vịt Không Móc', category: 'Vịt tươi' },
      variant: { size: 'To', attributeLabel: 'To' },
      selectionKey: 'duck-main-to',
    },
    {
      product: { id: 'duck-duplicate', name: 'Vịt Không Móc', category: 'Gia cầm' },
      variant: { size: 'Nhỏ', attributeLabel: 'Nhỏ' },
      selectionKey: 'duck-duplicate-small',
    },
    {
      product: { id: 'chicken-main', name: 'Gà Móc', category: 'Gia cầm' },
      variant: { size: 'To', attributeLabel: 'To' },
      selectionKey: 'chicken-main-to',
    },
  ]);

  assert.equal(groups.length, 2);
  const duckGroup = groups.find(group => group.variants.some(option => option.product.id === 'duck-main'));
  assert.equal(duckGroup.variants.length, 2);
  assert.deepEqual(
    Array.from(duckGroup.variants, option => option.product.id).sort(),
    ['duck-duplicate', 'duck-main'],
  );
});

test('new product memory merges customer products once without replacing existing data', () => {
  const input = {
    customer: {
      id: 'customer-a',
      customerProductIds: ['product-a'],
    },
    requests: [{
      customerId: 'customer-a',
      items: [
        { productId: 'product-a' },
        { productId: 'product-b' },
        { productId: 'product-b' },
      ],
    }],
    validProductIds: ['product-a', 'product-b'],
  };
  const first = buildCustomerFixedProductMemoryPatch(input);
  assert.deepEqual(first.patch, { customerProductIds: ['product-a', 'product-b'] });
  assert.deepEqual(first.addedProductIds, ['product-b']);

  const retry = buildCustomerFixedProductMemoryPatch({
    ...input,
    customer: { ...input.customer, ...first.patch },
  });
  assert.equal(retry.patch, null);
  assert.deepEqual(retry.addedProductIds, []);
});

test('branch memory preserves inherited products and stays scoped to that branch', () => {
  const result = buildCustomerFixedProductMemoryPatch({
    customer: {
      id: 'customer-a',
      customerProductIds: ['product-a'],
      branches: [{ id: 'branch-a', name: 'Branch A', customerProductIds: [] }],
    },
    requests: [{
      customerId: 'customer-a',
      branchId: 'branch-a',
      items: [{ productId: 'product-b' }],
    }],
    validProductIds: ['product-a', 'product-b'],
  });

  assert.equal(result.patch.customerProductIds, undefined);
  assert.deepEqual(result.patch.branches[0].customerProductIds, ['product-a', 'product-b']);
  assert.deepEqual(result.addedProductIds, ['product-b']);
});

test('saved order updates fixed-product price and order unit without changing pricing unit', () => {
  const result = buildCustomerFixedProductMemoryPatch({
    customer: {
      id: 'customer-a',
      customerProductIds: ['duck'],
      priceOverrides: {
        duck: {
          price: 50000,
          unitPrice: 50000,
          billingUnit: 'Kg',
          pricingUnit: 'Kg',
          unitPrices: { Kg: 50000 },
          orderUnits: ['Con'],
          defaultOrderUnit: 'Con',
          orderUnit: 'Con',
        },
      },
    },
    requests: [{
      customerId: 'customer-a',
      createdAt: '2026-08-17T10:00:00.000Z',
      items: [{
        productId: 'duck',
        billingUnit: 'Kg',
        pricingUnit: 'Kg',
        unitPrice: 62000,
        orderUnit: 'Bộ',
      }],
    }],
    validProductIds: ['duck'],
  });

  const config = result.patch.priceOverrides.duck;
  assert.equal(config.price, 62000);
  assert.equal(config.unitPrice, 62000);
  assert.deepEqual(config.unitPrices, { Kg: 62000 });
  assert.equal(config.billingUnit, 'Kg');
  assert.equal(config.pricingUnit, 'Kg');
  assert.equal(config.defaultOrderUnit, 'Bộ');
  assert.equal(config.orderUnit, 'Bộ');
  assert.deepEqual(config.orderUnits, ['Con', 'Bộ']);
});

test('saved order price decrease replaces the matching fixed-product variant price', () => {
  const result = buildCustomerFixedProductMemoryPatch({
    customer: {
      id: 'hien-chao-goi',
      customerProductIds: ['duck'],
      priceOverrides: {
        duck: {
          billingUnit: 'Kg',
          pricingUnit: 'Kg',
          variants: [{
            id: 'duck-2.8-3-to',
            sizeLabel: '2.8-3kg',
            attributeLabel: 'To',
            price: 57000,
            unitPrice: 57000,
            unitPrices: { Kg: 57000 },
          }],
        },
      },
    },
    requests: [{
      customerId: 'hien-chao-goi',
      items: [{
        productId: 'duck',
        configurationId: 'duck-2.8-3-to',
        sizeLabel: '2.8-3kg',
        attributeLabel: 'To',
        billingUnit: 'Kg',
        pricingUnit: 'Kg',
        unitPrice: 55000,
        orderUnit: 'Con',
      }],
    }],
    validProductIds: ['duck'],
  });

  const variant = result.patch.priceOverrides.duck.variants[0];
  assert.equal(variant.price, 55000);
  assert.equal(variant.unitPrice, 55000);
  assert.deepEqual(variant.unitPrices, { Kg: 55000 });
  assert.equal(variant.billingUnit, 'Kg');
  assert.equal(variant.pricingUnit, 'Kg');
});

test('order-unit-only changes preserve a fixed price and pricing unit', () => {
  const result = buildCustomerFixedProductMemoryPatch({
    customer: {
      id: 'customer-a',
      priceOverrides: {
        duck: {
          price: 62000,
          unitPrice: 62000,
          billingUnit: 'Kg',
          pricingUnit: 'Kg',
          unitPrices: { Kg: 62000 },
        },
      },
    },
    requests: [{
      customerId: 'customer-a',
      items: [{ productId: 'duck', quantityUnit: 'Con' }],
    }],
    validProductIds: ['duck'],
  });

  const config = result.patch.priceOverrides.duck;
  assert.equal(config.price, 62000);
  assert.equal(config.unitPrice, 62000);
  assert.equal(config.billingUnit, 'Kg');
  assert.equal(config.pricingUnit, 'Kg');
  assert.deepEqual(config.unitPrices, { Kg: 62000 });
  assert.equal(config.defaultOrderUnit, 'Con');
  assert.equal(config.orderUnit, 'Con');
});

test('a new saved product learns price and ordering unit once and is idempotent on retry', () => {
  const input = {
    customer: { id: 'customer-a', customerProductIds: [] },
    requests: [{
      customerId: 'customer-a',
      items: [{
        productId: 'duck',
        billingUnit: 'Kg',
        unitPrice: 65000,
        orderUnit: 'Con',
      }],
    }],
    validProductIds: ['duck'],
  };
  const first = buildCustomerFixedProductMemoryPatch(input);
  const config = first.patch.priceOverrides.duck;
  assert.deepEqual(first.patch.customerProductIds, ['duck']);
  assert.deepEqual(first.addedProductIds, ['duck']);
  assert.equal(config.price, 65000);
  assert.equal(config.billingUnit, 'Kg');
  assert.equal(config.pricingUnit, 'Kg');
  assert.equal(config.defaultOrderUnit, 'Con');

  const retry = buildCustomerFixedProductMemoryPatch({
    ...input,
    customer: { ...input.customer, ...first.patch },
  });
  assert.equal(retry.patch, null);
  assert.deepEqual(retry.addedProductIds, []);
  assert.deepEqual(retry.updatedProductIds, []);
});

test('legacy numeric prices and historical products are retained when order memory is added', () => {
  const result = buildCustomerFixedProductMemoryPatch({
    customer: {
      id: 'customer-a',
      customerProductIds: ['retired-duck', 'legacy-duck', 'active-duck'],
      priceOverrides: { 'legacy-duck': 60000 },
    },
    requests: [{
      customerId: 'customer-a',
      items: [
        { productId: 'legacy-duck', billingUnit: 'Kg', quantityUnit: 'Con' },
        { productId: 'new-duck', billingUnit: 'Kg', unitPrice: 65000, quantityUnit: 'Con' },
      ],
    }],
    validProductIds: ['legacy-duck', 'active-duck', 'new-duck'],
  });

  const legacyConfig = result.patch.priceOverrides['legacy-duck'];
  assert.deepEqual(result.patch.customerProductIds, ['retired-duck', 'legacy-duck', 'active-duck', 'new-duck']);
  assert.equal(legacyConfig.price, 60000);
  assert.equal(legacyConfig.unitPrice, 60000);
  assert.equal(legacyConfig.billingUnit, 'Kg');
  assert.equal(legacyConfig.pricingUnit, 'Kg');
  assert.equal(legacyConfig.defaultOrderUnit, 'Con');
});

test('branch saved defaults remain isolated from the root customer configuration', () => {
  const result = buildCustomerFixedProductMemoryPatch({
    customer: {
      id: 'customer-a',
      customerProductIds: ['duck'],
      priceOverrides: {
        duck: {
          price: 50000,
          unitPrice: 50000,
          billingUnit: 'Kg',
          pricingUnit: 'Kg',
          unitPrices: { Kg: 50000 },
        },
      },
      branches: [{ id: 'branch-a', customerProductIds: [] }],
    },
    requests: [{
      customerId: 'customer-a',
      branchId: 'branch-a',
      items: [{ productId: 'duck', billingUnit: 'Kg', unitPrice: 60000, orderUnit: 'Bộ' }],
    }],
    validProductIds: ['duck'],
  });

  const branchConfig = result.patch.branches[0].priceOverrides.duck;
  assert.equal(result.patch.priceOverrides, undefined);
  assert.deepEqual(result.patch.branches[0].customerProductIds, ['duck']);
  assert.equal(branchConfig.price, 60000);
  assert.equal(branchConfig.billingUnit, 'Kg');
  assert.equal(branchConfig.pricingUnit, 'Kg');
  assert.equal(branchConfig.defaultOrderUnit, 'Bộ');
});

test('saved request synchronizes customer defaults atomically only after the request save succeeds', () => {
  assert.match(appSource, /const handleSyncCustomerFixedProductDefaults = async/);
  assert.match(appSource, /await runTransaction\(db, async \(transaction\) =>/);
  assert.match(appSource, /onSyncCustomerFixedProductDefaults=\{handleSyncCustomerFixedProductDefaults\}/);
  assert.match(appSource, /onSyncCustomerFixedProductDefaults=\{onSyncCustomerFixedProductDefaults\}/);
  assert.match(appSource, /await onSyncCustomerFixedProductDefaults\(customerId, memoryRequests\)/);
  assert.match(appSource, /await persistOrderRequestMemories\(savedRequests\);/);
  assert.match(appSource, /orderUnit: quantityUnit,/);
  assert.match(appSource, /billingUnit: billingSnapshot\.billingUnit,/);
  assert.match(
    appSource,
    /await onEditOrderRequest\(request\.id, normalizedRequest, employee\?\.id \|\| 'admin'\);\s*if \(orderCellEditor\?\.field === 'unitPrice'\) \{\s*await persistAdditionalCustomerFixedProducts\(\[\{\s*\.\.\.normalizedRequest,\s*items: \[requestItems\[row\.itemIndex\]\],\s*\}\]\);\s*\}/,
    'saving an inline-edited order line must update only that fixed-product memory after the order save succeeds'
  );
});

test('order submit keeps both state and ref duplicate guards', () => {
  assert.match(appSource, /if \(isRequestSubmitting \|\| requestSubmittingRef\.current\) return;/);
  assert.match(appSource, /requestSubmittingRef\.current = true;/);
  assert.match(appSource, /aria-busy=\{isRequestSubmitting\}/);
  assert.match(appSource, /requestSubmittingRef\.current = false;/);
});

test('existing order rows edit one selected cell and keep delete inside the editor dialog', () => {
  assert.match(appSource, /canEditOrderRequestSizePrice = false/);
  assert.match(appSource, /const HDSingleCellEditDialog = React\.memo/);
  assert.match(appSource, /openOrderCellEditor\(row, 'unitPrice', event\)/);
  assert.match(appSource, /title: 'Sửa đơn giá'/);
  assert.match(appSource, /\[field\]: field === 'unitPrice' \? parseInputCurrency\(nextValue\) : nextValue/);
  assert.match(appSource, /onDelete=\{deleteOrderCellEditorRow\}/);
  assert.match(appSource, /Nút xóa nằm trong bảng sửa của ô đã chọn/);
  assert.doesNotMatch(appSource, /title="Xoa toan bo don dat hang"/);
});

test('summary quantity editor can change order unit without replacing pricing unit', () => {
  assert.match(appSource, /const handleOrderCellQuantityUnitChange = \(nextValue\) =>/);
  assert.match(appSource, /label: 'Đơn vị đặt'/);
  assert.match(appSource, /const hasInlineSecondaryField = Boolean\(secondaryField\?\.inline\);/);
  assert.match(appSource, /grid-cols-\[minmax\(0,1fr\)_minmax\(7rem,0\.58fr\)\]/);
  assert.match(appSource, /label: 'Đơn vị đặt',\s*type: 'select',\s*inline: true,/);
  assert.match(appSource, /getDraftItemUnitOptions\(quantityEditorDraft, quantityEditorItem\)/);
  assert.match(appSource, /orderUnit: selectedOrderUnit \|\| effectiveActualUnit/);
  assert.match(appSource, /billingUnit: inlineEditingDraft\.billingUnit \|\| inlineEditingDraft\.pricingUnit/);
  assert.match(appSource, /secondaryField=\{orderCellEditorConfig\.secondaryField \|\| null\}/);
});

test('saved size overrides stale billing snapshot and is displayed before the old attribute', () => {
  const editedItem = applyOrderRequestClassificationEdit({
    sizeLabel: '1-1.2kg',
    attributeLabel: 'Trung',
    billingSnapshotVersion: 1,
  }, {
    sizeLabel: '2-2.5kg',
    attributeLabel: 'Trung',
  });

  assert.equal(editedItem.sizeLabel, '2-2.5kg');
  assert.equal(editedItem.attributeLabel, 'Trung');
  assert.equal(editedItem.productAttribute, 'Trung');
  assert.equal(getOrderRequestSizeDisplayValue(editedItem), '2-2.5kg');
  assert.equal(getOrderRequestSizeDisplayValue({ attributeLabel: 'Trung' }), 'Trung');
  assert.match(appSource, /applyOrderRequestClassificationEdit\(\{/);
  assert.match(appSource, /return formatSheetSize\(getOrderRequestSizeCellLabel\(row\)\);/);
});

test('customer and product columns use the same width', () => {
  assert.match(
    appSource,
    /<col style=\{\{ width: '24%' \}\} \/>\s*<col style=\{\{ width: '24%' \}\} \/>/
  );
});

test('product column content is centered consistently', () => {
  assert.match(appSource, /className="w-full rounded-xl px-1 py-1 text-center font-semibold text-slate-900 transition/);
  assert.match(appSource, /className="flex flex-wrap items-center justify-center gap-1\.5"/);
});

test('order search results are sorted by order recency after relevance filtering', () => {
  const displayOrdersSource = appSource.slice(
    appSource.indexOf('const displayOrders = useMemo'),
    appSource.indexOf('const selectedRevenueDate ='),
  );
  assert.match(appSource, /const deferredOrderSearchKeyword = useDeferredValue\(orderSearchKeyword\)/);
  assert.match(displayOrdersSource, /searchOrderRecords\(source, deferredOrderSearchKeyword/);
  assert.match(displayOrdersSource, /return sortOrdersByNewest\(rankedSource\);/);
});

test('order unit editor configures pricing and order units from one compact choice row', () => {
  assert.match(appSource, /getProductCatalogUnitSuggestions\(activeProducts\)/);
  assert.match(appSource, /openDraftItemUnitEditor\(draft, item\)/);
  assert.match(appSource, /const standardOrderUnitOptions = \['Kg', 'Con', 'Thùng', 'Bao'\]/);
  assert.match(appSource, /activeTarget: 'orderUnit'/);
  assert.match(appSource, /activeTarget: 'pricingUnit'/);
  assert.match(appSource, />ĐVT giá<\/p>/);
  assert.match(appSource, />ĐV đặt<\/p>/);
  assert.match(appSource, /grid-cols-\[repeat\(4,minmax\(0,1fr\)\)_40px\]/);
  assert.match(appSource, /aria-label="Tạo thêm đơn vị mới"/);
  assert.match(appSource, /placeholder="Tên đơn vị mới"/);
  assert.match(appSource, /billingSnapshotSource: unitPrice > 0 \? 'order_request_unit_editor' : ''/);
  assert.match(appSource, />Lưu ĐVT<\/button>/);
  assert.doesNotMatch(appSource, /Danh sách gợi ý chỉ lấy từ đơn vị đang dùng trong sản phẩm/);
});

test('manual order rows expose product attributes and a spinner-free quantity field', () => {
  assert.match(appSource, /const attributePickerKey = `attribute:\$\{draft\.localId\}:\$\{item\.localItemId\}`/);
  assert.match(appSource, /aria-label="Chọn thuộc tính sản phẩm"/);
  assert.match(appSource, /handleProductChange\(draft\.localId, item\.localItemId, selectedProduct\.id, variant\)/);
  assert.match(appSource, /type="text"\s*inputMode="decimal"\s*value=\{item\.quantity\}/);
});

test('order request header is compact and has no filter control', () => {
  assert.match(appSource, /activeTab === 'order_requests' \? 'Đơn đặt'/);
  const headerSource = appSource.slice(
    appSource.indexOf(") : activeTab === 'order_requests' ? ("),
    appSource.indexOf(") : !hideHeaderSearchFilter ? ("),
  );
  assert.match(headerSource, /renderNotificationBell\('bg-transparent text-white hover:bg-white\/15'\)/);
  assert.doesNotMatch(headerSource, /<Filter/);
  assert.doesNotMatch(headerSource, /aria-label="Bộ lọc"/);
});

test('shared order sheet keeps every customer and all products together', () => {
  const rows = [
    { id: 'a-2', customerId: 'a', customerName: 'Customer A', productSort: 2 },
    { id: 'b-1', customerId: 'b', customerName: 'Customer B', productSort: 1 },
    { id: 'a-1', customerId: 'a', customerName: 'Customer A', productSort: 1 },
    { id: 'a-3', customerId: 'a', customerName: 'Customer A', productSort: 3 },
  ];
  const groups = groupOrderRequestShareRowsByCustomer(rows, {
    compareRows: (a, b) => a.productSort - b.productSort,
  });

  assert.deepEqual(groups.map((group) => group.customerId), ['a', 'b']);
  assert.deepEqual(groups[0].rows.map((row) => row.id), ['a-1', 'a-2', 'a-3']);
  assert.deepEqual(
    groups.flatMap((group) => group.rows).map((row) => row.customerId),
    ['a', 'a', 'a', 'b'],
  );

  const pages = buildOrderRequestSharePagesByCustomer(groups, 2);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[0].map((row) => row.customerId), ['a', 'a', 'a']);
  assert.deepEqual(pages[1].map((row) => row.customerId), ['b']);

  assert.match(appSource, /const groupedShareableRequestSheetCustomerGroups = useMemo/);
  assert.match(appSource, /groupOrderRequestShareRowsByCustomer\(shareableMergedRequestSheetRows/);
  assert.match(appSource, /groupedShareableRequestSheetCustomerGroups\.flatMap\(\(group\) => group\.rows\)/);
  assert.match(appSource, /buildOrderRequestSharePagesByCustomer\(/);
  assert.doesNotMatch(appSource, /groupedShareableRequestSheetProductGroups/);
});

test('share images are prepared in background and reused from persistent cache', () => {
  assert.match(appSource, /const SHARE_IMAGE_CACHE_DB_NAME = 'hd-manager-share-image-cache'/);
  assert.match(appSource, /const readPersistentShareImageAsset = async/);
  assert.match(appSource, /const writePersistentShareImageAsset = async/);
  assert.match(appSource, /scope: 'sales_order_invoice'/);
  assert.match(appSource, /reason: 'order_created'/);
  assert.match(appSource, /reason: 'order_updated'/);
  assert.match(appSource, /reason: 'order_request_created'/);
  assert.match(appSource, /reason: 'order_request_updated'/);
  assert.match(appSource, /window\.addEventListener\(ORDER_REQUEST_SHARE_WARMUP_EVENT, handleSavedOrderRequest\)/);
  assert.match(appSource, /const prepareOrderRequestSheetBlobs = async/);
  assert.match(appSource, /reason = 'order_request_loaded_or_changed'/);
  assert.match(appSource, /prepareOrderRequestSheetBlobs\(\{ reason: 'share_click' \}\)/);
  assert.match(appSource, /prepareOrderRequestSheetBlobs\(\{ reason: 'download_click' \}\)/);
  assert.doesNotMatch(appSource, /const canvases = await renderOrderRequestSheetCanvases\(\);\s*const blobs = await Promise\.all\(canvases\.map\(\(canvas\) => canvasToBlob\(canvas, 'image\/png'\)\)\);\s*const result = await shareOrderRequestSheetBlobs/);
});

test('mobile footer stays fixed for accounting, delivery and sales roles', () => {
  const permissions = {
    home: true,
    orders: true,
    finance: true,
    debt: true,
    delivery_reports: true,
    employee_reviews: true,
    company_attendance: true,
    order_requests: true,
  };

  assert.deepEqual(
    getFixedFooterNavIds({ isAccounting: true, permissions }),
    ['home', 'orders', 'finance', 'more'],
  );
  assert.deepEqual(
    getFixedFooterNavIds({ isDeliveryParticipant: true, permissions }),
    ['home', 'delivery_reports', 'company_attendance', 'more'],
  );
  assert.deepEqual(
    getFixedFooterNavIds({ isSales: true, permissions }),
    ['home', 'order_requests', 'debt', 'more'],
  );

  const footerSource = appSource.slice(
    appSource.indexOf('const footerNavItems = useMemo'),
    appSource.indexOf('const desktopSidebarItems = useMemo'),
  );
  assert.match(footerSource, /getFixedFooterNavIds\(\{/);
  assert.doesNotMatch(footerSource, /footerUsage|activeTab|\.sort\(/);
});

test('fixed footer never replaces a denied module with another feature', () => {
  const ids = getFixedFooterNavIds({
    isSales: true,
    permissions: {
      home: true,
      order_requests: true,
      debt: false,
      company_attendance: true,
    },
  });

  assert.deepEqual(ids, ['home', 'order_requests', 'more']);
});

test('orders remain reachable from More when the fixed footer belongs to another role', () => {
  const moreMenuSource = appSource.slice(
    appSource.indexOf('function MoreMenu('),
    appSource.indexOf('const PRICING_ENGINE_TABS')
  );

  assert.match(moreMenuSource, /id: 'orders'[^\n]*label: 'Đơn hàng'/);
  assert.match(moreMenuSource, /show: tabPermissions\.orders/);
  assert.match(moreMenuSource, /onClick=\{\(\) => setActiveTab\?\.\(item\.id\)\}/);
});

for (const { name, run } of tests) {
  await run();
  console.log(`PASS ${name}`);
}

console.log(`\n${tests.length} order request UX tests passed.`);
