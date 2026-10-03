import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { appFunction } from './helpers/app-source-function.mjs';

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('share-only grouping runs once on demand and rebuilds for replacement source rows', () => {
  let scans = 0;
  const fixture = [
    { rowKey: 'a', customerId: 'c', productId: 'p', quantity: 2, billingQuantity: 1,
      billingUnit: 'Kg', quantityUnit: 'Con', unitPrice: 10, amount: 10 },
    { rowKey: 'b', customerId: 'c', productId: 'p', quantity: 3, billingQuantity: 2,
      billingUnit: 'Kg', quantityUnit: 'Con', unitPrice: 10, amount: 20 },
    { rowKey: 'done', customerId: 'c', productId: 'p', quantity: 99, isFullyDispatched: true },
  ];
  const create = rows => appFunction('getOrderRequestShareData', {
    editableCurrentDayRows: rows,
    isOrderRequestRowFullyDispatchedForShare: row => { scans++; return !!row.isFullyDispatched; },
    parseLooseQuantityValue: value => Number(value) || 0,
    parseLooseMoneyValue: value => Number(value) || 0,
    normalizeLookupText: value => value.toLowerCase(), roundMoneyValue: Math.round,
    compareOrderRequestRowsByRecent: () => 0, compareOrderRequestRowsByProduct: () => 0,
    groupOrderRequestShareRowsByCustomer: rows => [{ key: 'c', rows }],
  }, { memoCallback: true, scope: 'OrderRequestView' })();
  const get = create(fixture);
  assert.equal(scans, 0);
  const first = get();
  assert.equal(scans, 3);
  assert.equal(first.groupedShareableMergedRequestSheetRows.length, 1);
  const merged = first.groupedShareableMergedRequestSheetRows[0];
  assert.equal(merged.quantity, 5);
  assert.equal(merged.billingQuantity, 3);
  assert.equal(merged.amount, 30);
  assert.equal(get(), first);
  assert.equal(scans, 3);
  assert.equal(fixture[0].quantity, 2);
  const replacement = create([{ ...fixture[0], quantity: 10, amount: 100 }]);
  assert.equal(scans, 3);
  assert.equal(replacement().groupedShareableMergedRequestSheetRows[0].quantity, 10);
  assert.equal(scans, 4);
});

test('request fingerprint is lazy and retains tenant, actor, date and billing fields', () => {
  let calls = 0;
  const rows = [{ id: 'r1', customerId: 'c1', branchId: 'branch', productId: 'p1',
    quantity: 10, quantityUnit: 'Con', billingQuantity: 7.5, billingUnit: 'Kg',
    unitPrice: 38000, amount: 285000, note: 'note', configurationId: 'price-a' }];
  const employee = { id: 'e1', companyId: 'tenant-a', name: 'Employee' };
  const getKey = appFunction('getOrderRequestSheetAssetKey', {
    getOrderRequestShareData: () => ({ groupedShareableMergedRequestSheetRows: rows }), employee, requestFilterDate: '2026-10-03',
    getTodayString: () => '2026-10-03',
    buildStableHash: value => { calls++; return value; },
  }, { memoCallback: true, scope: 'OrderRequestView' });
  assert.equal(calls, 0);
  const original = getKey();
  assert.equal(calls, 1);
  const fingerprint = JSON.parse(original.slice(original.indexOf('{')));
  assert.equal(fingerprint.rows[0].billingQuantity, 7.5);
  assert.equal(fingerprint.rows[0].quantity, 10);
  assert.equal(fingerprint.rows[0].amount, 285000);
  assert.equal(fingerprint.rows[0].branchId, 'branch');
  assert.equal(fingerprint.rows[0].configurationId, 'price-a');
  rows[0] = { ...rows[0], unitPrice: 40000, amount: 300000 };
  assert.notEqual(getKey(), original);
  employee.companyId = 'tenant-b';
  assert.ok(getKey().startsWith('order_request_sheet|tenant-b|e1|2026-10-03|'));
  rows.length = 0;
  const previous = calls;
  assert.equal(getKey(), '');
  assert.equal(calls, previous);
});

test('request image preparation is called only by explicit share and download', () => {
  assert.doesNotMatch(source, /ORDER_REQUEST_SHARE_WARMUP_EVENT|notifyOrderRequestShareWarmup/);
  const calls = [...source.matchAll(/prepareOrderRequestSheetBlobs\(\{ reason: '([^']+)' \}\)/g)];
  assert.deepEqual(calls.map(match => match[1]), ['share_click', 'download_click']);
  assert.match(source, /hasCompleteOrderRequestShareBlobSet\(cached\?\.blobs, expectedBlobCount\)/);
  assert.match(source, /readPersistentShareImageAsset\(cacheKey, SHARE_IMAGE_CACHE_TTL_MS\)/);
  assert.match(source, /orderRequestSheetPendingCacheRef\.current\.get\(cacheKey\)/);
  assert.match(source, /await requireSharedWriteConfirmation\(writeResult, 'orderRequests', requestId\)/);
});
