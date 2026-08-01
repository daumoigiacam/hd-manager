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

for (const { name, run } of tests) {
  await run();
  console.log(`PASS ${name}`);
}

console.log(`\n${tests.length} order request UX tests passed.`);
