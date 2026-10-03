import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPreviewStorage } from './helpers/preview-storage-harness.mjs';
import { createRealtimeSnapshotItemsCollector } from '../src/services/realtimeSnapshotItems.js';

test('one request edit normalizes one record, retains other records, and handles add/delete', async () => {
  const orderRequests = Object.fromEntries(Array.from({ length: 4500 }, (_, i) => {
    const id = String(i).padStart(5, '0');
    return [id, { id, companyId: 'tenant-a', quantity: i, nested: { unit: 'kg' } }];
  }));
  const h = await loadPreviewStorage('src/mocks/firebase-firestore.js', JSON.stringify({ __replaceSeed: true, orderRequests }));
  let normalized = 0;
  const collect = createRealtimeSnapshotItemsCollector(data => { normalized++; return data; });
  const ref = h.api.collection(null, 'orderRequests');
  let items;
  const stop = h.api.onSnapshot(ref, snapshot => { items = collect(snapshot, ref); });
  await new Promise(resolve => queueMicrotask(resolve));
  assert.equal(normalized, 4500);
  const untouched = items[0].data;
  normalized = 0;
  await h.api.setDoc(h.api.doc(null, 'orderRequests', '02200'), { quantity: 17 }, { merge: true });
  assert.equal(normalized, 1);
  assert.equal(items[0].data, untouched);
  assert.equal(items[2200].data.quantity, 17);
  normalized = 0;
  await h.api.setDoc(h.api.doc(null, 'orderRequests', '02200a'), { quantity: 9 });
  assert.equal(normalized, 1);
  assert.equal(items.length, 4501);
  normalized = 0;
  await h.api.deleteDoc(h.api.doc(null, 'orderRequests', '02200'));
  assert.equal(normalized, 0);
  assert.equal(items.length, 4500);
  assert.equal(items.some(item => item.id === '02200'), false);
  stop();
});

test('unsubscribe before first microtask prevents callback', async () => {
  const h = await loadPreviewStorage('src/mocks/firebase-firestore.js', '{"__replaceSeed":true}');
  let calls = 0;
  const stop = h.api.onSnapshot(h.api.collection(null, 'orderRequests'), () => { calls++; });
  stop();
  await new Promise(resolve => queueMicrotask(resolve));
  assert.equal(calls, 0);
});
