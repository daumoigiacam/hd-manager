import assert from 'node:assert/strict';
import test from 'node:test';
import { collection, doc, setDoc, query, where, orderBy, documentId, startAfter, limit, getDocs, onSnapshot } from '../src/mocks/firebase-firestore.js';

test('isolated preview respects tenant, document cursor and query listener limit', async () => {
  for (const [id, companyId] of [['a', 'tenant-a'], ['b', 'tenant-b'], ['c', 'tenant-a'], ['d', 'tenant-a']]) {
    await setDoc(doc({}, 'cursor-test', id), { companyId });
  }
  const ref = collection({}, 'cursor-test');
  const scoped = [where('companyId', '==', 'tenant-a'), orderBy(documentId(), 'asc')];
  const first = await getDocs(query(ref, ...scoped, limit(2)));
  assert.deepEqual(first.docs.map(row => row.id), ['a', 'c']);
  const next = await getDocs(query(ref, ...scoped, startAfter(first.docs.at(-1)), limit(2)));
  assert.deepEqual(next.docs.map(row => row.id), ['d']);
  const observed = [];
  const off = onSnapshot(query(ref, ...scoped, limit(1)), snapshot => observed.push(snapshot.docs.map(row => row.id)));
  await Promise.resolve();
  await setDoc(doc({}, 'cursor-test', '0'), { companyId: 'tenant-a' });
  off();
  assert.deepEqual(observed, [['a'], ['0']]);
});
