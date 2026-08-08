import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ORDER_REQUEST_SELECTION_LOCK_MS,
  releaseOrderRequestSelectionLock,
  tryAcquireOrderRequestSelectionLock
} from '../src/utils/orderRequestInteraction.js';

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

test('shared order sheet keeps matching products next to each other', () => {
  assert.match(appSource, /const groupedShareableRequestSheetProductGroups = useMemo/);
  assert.match(appSource, /const productKey = row\.productId \|\| normalizeLookupText\(row\.productShortName \|\| row\.productName \|\| ''\)/);
  assert.match(appSource, /groupedShareableRequestSheetProductGroups\.flatMap\(\(group\) => group\.rows\)/);
  assert.match(appSource, /groupedShareableRequestSheetProductGroups\.forEach\(\(group\) =>/);
  assert.doesNotMatch(appSource, /groupedShareableRequestSheetCustomerGroups/);
});

test('orders remain reachable from More when the adaptive footer does not promote them', () => {
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
