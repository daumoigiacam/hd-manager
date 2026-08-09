import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getRelatedShareCollectionItems,
  upsertOrderIntoShareCollection
} from '../src/utils/orderShareCache.js';

const originalOrder = {
  id: 'order-1',
  customerId: 'customer-1',
  amount: 100000,
  updatedAt: '2026-08-09T10:00:00.000Z'
};
const relatedOrder = {
  id: 'order-2',
  customerId: 'customer-1',
  amount: 50000,
  updatedAt: '2026-08-08T10:00:00.000Z'
};
const updatedOrder = {
  ...originalOrder,
  paymentAmount: 100000,
  paymentLookupSyncedAt: '2026-08-09T10:00:02.000Z',
  updatedAt: '2026-08-09T10:00:02.000Z'
};
const source = [originalOrder, relatedOrder];

const canonical = upsertOrderIntoShareCollection(source, updatedOrder);
assert.notEqual(canonical, source, 'An updated order must produce a canonical share collection.');
assert.equal(canonical[0], updatedOrder, 'The share context must use the latest order snapshot.');
assert.equal(source[0], originalOrder, 'Canonicalization must not mutate application state.');

const beforeRelated = getRelatedShareCollectionItems(source, 'customer-1', 'order-1');
const afterRelated = getRelatedShareCollectionItems(canonical, 'customer-1', 'order-1');
assert.deepEqual(
  beforeRelated.map(order => order.id),
  ['order-2'],
  'The current invoice must not invalidate its own related-order fingerprint.'
);
assert.deepEqual(
  afterRelated.map(order => order.id),
  ['order-2'],
  'A QR update on the current invoice must keep the related-order fingerprint stable.'
);

assert.equal(
  upsertOrderIntoShareCollection(source, originalOrder),
  source,
  'An already canonical collection should retain its reference for fingerprint caching.'
);

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
assert.match(
  appSource,
  /prepareOrderShareNativeFile\(orderForShare, blob, reason\)/,
  'Background invoice preparation must also prepare the native share file.'
);
assert.match(
  appSource,
  /preparedNativeFile:\s*asset\.nativeFile/,
  'The share action must reuse the native file prepared in the background.'
);
assert.match(
  appSource,
  /reason:\s*'order_detail_opened_or_refreshed'/,
  'Opening an existing invoice must warm its share asset before the share button is pressed.'
);
assert.doesNotMatch(
  appSource,
  /requestIdleCallback\(run,\s*\{\s*timeout:\s*250\s*\}\)/,
  'Sales invoice warmup must not wait for requestIdleCallback.'
);

console.log('Order share cache tests passed.');
