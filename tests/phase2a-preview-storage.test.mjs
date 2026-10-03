import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { loadPreviewStorage, key } from './helpers/preview-storage-harness.mjs';
import { createPreviewStoreSerializer } from '../src/mocks/preview-store-serializer.js';

const before = { gitRef: '5f162f5ce85fd4dc746382f13a6a4170e4a29775', file: 'src/mocks/firebase-firestore.js' };
const after = 'src/mocks/firebase-firestore.js';
const fixture = { __replaceSeed: true, products: { p: { id:'p',companyId:'a',name:'Product',quantity:10 } },
  customers: { c: { id:'c',companyId:'a',name:'Customer' } }, orderRequests: {}, warehouseImports:{},
  warehouseDispatches:{}, payments:{}, expenses:{} };
const raw = JSON.stringify(fixture);
const open = source => loadPreviewStorage(source, raw);
const ref = (h, name, id) => h.api.doc(null, name, id);

test('serializer preserves exact JSON including key order, escaping and omitted fields', () => {
  const encode = createPreviewStoreSerializer();
  const store = { '2': { '10': { name:'"\\\n',array:[null,1],missing:undefined }, '2':{ amount:1.5 } },
    '1': { p:{ count:0 } }, empty:{}, absent:undefined };
  assert.equal(encode(store), JSON.stringify(store));
  const next = { ...store, '1':{ p:{ count:2 } } };
  assert.equal(encode(next), JSON.stringify(next));
});

test('six datasets create, edit, transaction, snapshot isolation and restart equal baseline', async () => {
  const states = [];
  for (const source of [before, after]) {
    const h = await open(source);
    for (const collection of ['orderRequests','warehouseImports','warehouseDispatches','products','customers','payments']) {
      const document = ref(h, collection, 'new');
      await h.api.setDoc(document,{companyId:'a',quantity:3,unit:'kg',unitPrice:100,amount:300});
      await h.api.setDoc(document,{quantity:5,amount:500},{merge:true});
      const snapshot = (await h.api.getDoc(document)).data();
      snapshot.quantity = -999;
      assert.equal((await h.api.getDoc(document)).data().quantity,5);
    }
    await h.api.runTransaction(null, async tx => {
      tx.set(ref(h,'warehouseImports','linked'),{companyId:'a',quantity:4});
      tx.set(ref(h,'expenses','linked'),{companyId:'a',amount:400});
      tx.update(ref(h,'products','p'),{quantity:h.api.increment(4)});
    });
    await h.api.deleteDoc(ref(h,'warehouseDispatches','new'));
    const restarted = await loadPreviewStorage(source, undefined, h.shared);
    assert.equal((await restarted.api.getDoc(ref(restarted,'products','p'))).data().quantity,14);
    assert.equal((await restarted.api.getDoc(ref(restarted,'expenses','linked'))).data().amount,400);
    assert.equal((await restarted.api.getDoc(ref(restarted,'warehouseDispatches','new'))).exists(),false);
    states.push(JSON.parse(h.raw()));
  }
  assert.deepEqual(states[1],states[0]);
});

test('duplicate writes omit verified identical disk write but preserve notifications', async () => {
  const h = await open(after);
  let notifications = 0;
  const unsubscribe = h.api.onSnapshot(h.api.collection(null,'products'),() => { notifications++; });
  await new Promise(resolve => queueMicrotask(resolve));
  const document = ref(h,'products','p');
  await h.api.setDoc(document,{quantity:15},{merge:true});
  h.events.length = 0;
  await h.api.setDoc(document,{quantity:15},{merge:true});
  assert.equal(h.events.filter(e => e.kind === 'setItem').length,0);
  assert.equal(notifications,3);
  for (const name of [...h.shared.keys()]) if (name.startsWith(`${key}:patch:`)) h.shared.delete(name);
  await h.api.setDoc(document,{quantity:15},{merge:true});
  assert.equal(h.events.filter(e => e.kind === 'setItem').length,1);
  assert.equal(JSON.parse(h.raw()).products.p.quantity,15);
  unsubscribe();
});

test('write failure rejects without persisted success; identical retry remains durable', async () => {
  for (const source of [before,after]) {
    const h = await open(source);
    h.failWrites(true);
    await assert.rejects(h.api.setDoc(ref(h,'products','p'),{quantity:20},{merge:true}),/storage failure/);
    assert.equal(h.raw(),raw);
    h.failWrites(false);
    await h.api.setDoc(ref(h,'products','p'),{quantity:20},{merge:true});
    const restarted = await loadPreviewStorage(source,undefined,h.shared);
    assert.equal((await restarted.api.getDoc(ref(restarted,'products','p'))).data().quantity,20);
  }
});

test('interrupted multi-collection callback leaves disk unchanged; retry commits both', async () => {
  for (const source of [before,after]) {
    const h = await open(source);
    const command = async tx => {
      tx.set(ref(h,'warehouseImports','return'),{companyId:'a',quantity:2});
      tx.set(ref(h,'expenses','return'),{companyId:'a',amount:200});
    };
    await assert.rejects(h.api.runTransaction(null,async tx => { await command(tx); throw new Error('interrupted'); }),/interrupted/);
    assert.equal(h.raw(),raw);
    await h.api.runTransaction(null,command);
    assert.equal(JSON.parse(h.raw()).warehouseImports.return.quantity,2);
    assert.equal(JSON.parse(h.raw()).expenses.return.amount,200);
  }
});

test('malformed startup uses seed and malformed sync keeps current state, like baseline', async () => {
  for (const source of [before,after]) {
    const h = await loadPreviewStorage(source,'{bad');
    assert.ok((await h.api.getDocs(h.api.collection(null,'products'))).size > 0);
    await h.api.setDoc(ref(h,'products','saved'),{companyId:'a',quantity:8});
    h.shared.set(key,'{broken');
    h.reloadEvent();
    assert.equal((await h.api.getDoc(ref(h,'products','saved'))).data().quantity,8);
  }
});

test('cross-tab reload invalidates fragments and preserves foreign tenant records', async () => {
  const h = await open(after);
  await h.api.setDoc(ref(h,'products','p'),{quantity:11},{merge:true});
  const remote = JSON.parse(h.raw());
  remote.products.p.quantity = 99;
  remote.products.foreign = {id:'foreign',companyId:'b',quantity:50};
  h.shared.set(key,JSON.stringify(remote));
  h.reloadEvent();
  await h.api.setDoc(ref(h,'customers','c'),{name:'Changed'},{merge:true});
  assert.equal(JSON.parse(h.raw()).products.p.quantity,99);
  assert.equal(JSON.parse(h.raw()).products.foreign.companyId,'b');
});

test('inherited footer and production Firebase transport remain unchanged', async () => {
  for (const path of ['src/design-system/foundation.css']) {
    const content = await readFile(path, 'utf8');
    const customerFabRule = /\.hd-shell--staff \.hd-module-fab\.hd-customer-module-fab \{\r?\n  bottom: calc\(max\(var\(--hd-footer-height, 0px\), var\(--hd-bottom-nav-height, 4rem\)\) \+ var\(--hd-space-3, 0\.75rem\)\);\r?\n\}\r?\n\r?\n/g;
    const customerPagerRule = /@media \(min-width: 600px\) \{\r?\n  \.hd-app-content\[data-hd-module="customers"\] \.hd-list-pagination \{\r?\n    padding-inline-end: 5rem;\r?\n    margin-bottom: 5rem;\r?\n  \}\r?\n\}\r?\n\r?\n/g;
    assert.equal([...content.matchAll(customerFabRule)].length, 1, 'Only the isolated customer FAB correction is allowed');
    assert.equal([...content.matchAll(customerPagerRule)].length, 1, 'Only the evidenced customer pager clearance is allowed');
    // Windows checkout normalizes line endings; compare against the fixed release, not local bytes.
    const baseline = execFileSync('git', ['show', `4db424a3e511bc2a24162245e7423478da9f89c8:${path}`], { encoding: 'utf8' });
    const canonical = text => text.replace(customerFabRule, '').replace(customerPagerRule, '').replace(/\r\n/g, '\n');
    assert.equal(canonical(content), canonical(baseline));
  }
  for (const path of ['src/config/firebase-runtime.js', 'src/config/firebase-rest-runtime.js']) {
    const baseline = execFileSync('git', ['show', `5f162f5:${path}`], { encoding: 'utf8' });
    assert.equal((await readFile(path, 'utf8')).replace(/\r\n/g, '\n'), baseline.replace(/\r\n/g, '\n'));
  }
});
