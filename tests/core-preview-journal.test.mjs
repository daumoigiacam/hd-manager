import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPreviewStorage, key } from './helpers/preview-storage-harness.mjs';

test('large preview saves write document patches only, with atomic transaction recovery', { timeout: 30000 }, async () => {
  const fixture = { __replaceSeed: true, products: Object.fromEntries(Array.from({ length: 50000 }, (_, i) => [`p${i}`, { id: `p${i}`, name: `Product ${i}`, quantity: i }])) };
  const base = JSON.stringify(fixture);
  const h = await loadPreviewStorage('src/mocks/firebase-firestore.js', base);
  h.events.length = 0;
  await h.api.runTransaction(null, async tx => {
    tx.update(h.api.doc(null, 'products', 'p0'), { quantity: 12 });
    tx.set(h.api.doc(null, 'expenses', 'x'), { amount: 123 });
  });
  const writes = h.events.filter(e => e.kind === 'setItem');
  assert.equal(writes.length, 1);
  assert.ok(writes[0].bytes < 400);
  assert.equal(h.shared.get(key), base, 'baseline is not rewritten during save');
  const restarted = await loadPreviewStorage('src/mocks/firebase-firestore.js', undefined, h.shared);
  assert.equal((await restarted.api.getDoc(h.api.doc(null, 'products', 'p0'))).data().quantity, 12);
  assert.equal((await restarted.api.getDoc(h.api.doc(null, 'expenses', 'x'))).data().amount, 123);
  console.log(JSON.stringify({ baselineBytes: Buffer.byteLength(base), patchBytes: writes[0].bytes, wholeStoreWrites: 0 }));
});

test('replacement fixture never replays old patches and stale writer rejects', { timeout: 10000 }, async () => {
  const h = await loadPreviewStorage('src/mocks/firebase-firestore.js', JSON.stringify({ __replaceSeed: true, products: {} }));
  await h.api.setDoc(h.api.doc(null, 'products', 'x'), { name: 'old' });
  h.shared.set(key, JSON.stringify({ __replaceSeed: true, products: { x: { id: 'x', name: 'new' } } }));
  await assert.rejects(h.api.setDoc(h.api.doc(null, 'products', 'x'), { name: 'stale' }), /baseline changed/);
  const fresh = await loadPreviewStorage('src/mocks/firebase-firestore.js', undefined, h.shared);
  assert.equal((await fresh.api.getDoc(fresh.api.doc(null, 'products', 'x'))).data().name, 'new');
});

test('failed transaction journal write recovers neither half; retry recovers both', { timeout: 10000 }, async () => {
  const h = await loadPreviewStorage('src/mocks/firebase-firestore.js', JSON.stringify({ __replaceSeed: true }));
  const command = tx => { tx.set(h.api.doc(null, 'a', '1'), { amount: 1 }); tx.set(h.api.doc(null, 'b', '2'), { amount: 2 }); };
  h.failWrites(true);
  await assert.rejects(h.api.runTransaction(null, command), /storage failure/);
  const failed = await loadPreviewStorage('src/mocks/firebase-firestore.js', undefined, h.shared);
  assert.equal((await failed.api.getDocs(failed.api.collection(null, 'a'))).size, 0);
  h.failWrites(false);
  await h.api.runTransaction(null, command);
  const success = await loadPreviewStorage('src/mocks/firebase-firestore.js', undefined, h.shared);
  assert.equal((await success.api.getDocs(success.api.collection(null, 'a'))).size, 1);
  assert.equal((await success.api.getDocs(success.api.collection(null, 'b'))).size, 1);
});
