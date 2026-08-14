import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
  assert.match(appSource, /pendingQuickProductSelectionKeys\.has\(resolvedSelectionKey\)/);
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
  assert.match(appSource, /await persistOrderRequestMemories\(normalizedRequests\);/);
  assert.match(appSource, /onEditCustomer=\{onEditCustomer\}/);
  assert.match(appSource, /if \(!configuredBilling\.isValid && !hasSavedPricingSnapshot\)/);
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
  assert.match(displayOrdersSource, /searchOrderRecords\(source, orderSearchKeyword/);
  assert.match(displayOrdersSource, /return sortOrdersByNewest\(rankedSource\);/);
});

test('order unit editor suggests catalog units and accepts a new custom unit', () => {
  assert.match(appSource, /getProductCatalogUnitSuggestions\(activeProducts\)/);
  assert.match(appSource, /openDraftItemUnitEditor\(draft, item\)/);
  assert.match(appSource, /const options = quantityUnitOptions;/);
  assert.match(appSource, /list="order-request-unit-suggestions"/);
  assert.match(appSource, /Đơn vị đang có trong sản phẩm/);
  assert.match(appSource, />Lưu ĐVT<\/button>/);
  assert.match(appSource, /Đơn vị mới sẽ được ghi nhớ cho khách và sản phẩm này sau khi lưu đơn/);
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
    ['home', 'orders', 'finance', 'debt', 'more'],
  );
  assert.deepEqual(
    getFixedFooterNavIds({ isDeliveryParticipant: true, permissions }),
    ['home', 'delivery_reports', 'employee_reviews', 'company_attendance', 'more'],
  );
  assert.deepEqual(
    getFixedFooterNavIds({ isSales: true, permissions }),
    ['home', 'order_requests', 'debt', 'company_attendance', 'more'],
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

  assert.deepEqual(ids, ['home', 'order_requests', 'company_attendance', 'more']);
});

test('orders remain reachable from More when the fixed footer belongs to another role', () => {
  const moreMenuSource = appSource.slice(
    appSource.indexOf('function MoreMenu('),
    appSource.indexOf('const PRICING_ENGINE_TABS')
  );

  assert.match(moreMenuSource, /id: 'orders', label: 'Đơn hàng'/);
  assert.match(moreMenuSource, /show: tabPermissions\.orders/);
  assert.match(moreMenuSource, /onClick=\{\(\) => setActiveTab\?\.\(item\.id\)\}/);
});

for (const { name, run } of tests) {
  await run();
  console.log(`PASS ${name}`);
}

console.log(`\n${tests.length} order request UX tests passed.`);
