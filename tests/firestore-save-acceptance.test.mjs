import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDocFromServer, disableNetwork, enableNetwork, onSnapshot, runTransaction } from 'firebase/firestore';
import { coalescePendingWrite } from '../src/utils/localFirstSave.js';
import { commitAtomicWrites } from '../src/utils/atomicSave.js';

assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^127\.0\.0\.1:\d+$/, 'Local emulator is required');
const env = await initializeTestEnvironment({
  projectId: 'demo-hd-save-acceptance',
  firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
});
const claims = { companyId: 'acceptance', identityId: 'identity', appUserId: 'employee', accountType: 'employee', role: 'super_admin' };
const db = env.authenticatedContext('writer', claims).firestore();
const reader = env.authenticatedContext('reader', claims).firestore();
const path = (collection, id) => `artifacts/acceptance/public/data/${collection}/${id}`;
const samples = [];
try {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), path('companies', 'acceptance')), { id: 'acceptance', name: 'Test only' });
    await setDoc(doc(context.firestore(), path('employees', 'employee')), { id: 'employee', companyId: 'acceptance', name: 'Test only' });
  });
  for (const collection of ['customers', 'products', 'orders', 'orderRequests', 'warehouseImports', 'warehouseDispatches', 'expenses', 'payments', 'deliveryReports', 'employees']) {
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const id = `${collection}-${iteration}`;
      const reference = doc(db, path(collection, id));
      const start = performance.now();
      await setDoc(reference, { id, companyId: 'acceptance', amount: 60000, revision: 1 });
      const createMs = performance.now() - start;
      const editStart = performance.now();
      await setDoc(reference, { amount: 63000, revision: 2 }, { merge: true });
      const editMs = performance.now() - editStart;
      const saved = await getDocFromServer(doc(reader, path(collection, id)));
      assert.equal(saved.data().amount, 63000);
      assert.equal(saved.data().revision, 2);
      assert.equal(saved.data().companyId, 'acceptance');
      samples.push({ collection, iteration, createMs: Math.round(createMs), editMs: Math.round(editMs) });
    }
  }

  for (const [index, writes] of [
    [{ payload: { companyId: 'acceptance', name: 'P', units: { buy: 'kg', sell: 'con' } }, options: {} },
      { payload: { units: { sell: 'kg' }, price: 63 }, options: { merge: true } }],
    [{ payload: { units: { buy: 'kg' }, price: 60 }, options: { merge: true } },
      { payload: { units: { sell: 'con' }, price: 63 }, options: { merge: true } }],
    [{ payload: { units: { buy: 'kg' } }, options: { merge: true } },
      { payload: { units: {} }, options: { merge: true } }],
  ].entries()) {
    const sequential = doc(db, path('products', `sequential-${index}`));
    const replay = doc(db, path('products', `replay-${index}`));
    const seed = { companyId: 'acceptance', units: { legacy: 'box' }, name: 'Old' };
    await setDoc(sequential, seed);
    await setDoc(replay, seed);
    for (const write of writes) await setDoc(sequential, write.payload, write.options);
    const queued = JSON.parse(JSON.stringify(coalescePendingWrite(writes[0], writes[1].payload, writes[1].options)));
    await setDoc(replay, queued.payload, queued.options);
    assert.deepEqual((await getDocFromServer(replay)).data(), (await getDocFromServer(sequential)).data());
  }

  const grouped = [
    { collectionName: 'orders', documentId: 'atomic-order', payload: { companyId: 'acceptance', amount: 63 } },
    { collectionName: 'payments', documentId: 'atomic-payment', payload: { companyId: 'acceptance', amount: 20 } },
    { collectionName: 'expenses', documentId: 'atomic-expense', payload: { companyId: 'acceptance', amount: 3 } },
  ];
  const commit = writes => commitAtomicWrites({ writes, companyId: 'acceptance',
    transaction: callback => runTransaction(db, callback),
    reference: write => doc(db, path(write.collectionName, write.documentId)),
  });
  await commit(grouped);
  await commit(JSON.parse(JSON.stringify(grouped)));
  for (const write of grouped) assert.equal((await getDocFromServer(doc(reader, path(write.collectionName, write.documentId)))).data().amount, write.payload.amount);
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), path('expenses', 'denied-atomic')), { companyId: 'other', amount: 7 });
  });
  await assertFails(commit([
    { ...grouped[0], payload: { companyId: 'acceptance', amount: 999 } },
    { ...grouped[2], documentId: 'denied-atomic' },
  ]));
  assert.equal((await getDocFromServer(doc(reader, path('orders', 'atomic-order')))).data().amount, 63, 'Rejected expense must also roll back the order');

  const costGroup = [
    { collectionName: 'assetCostLogs', documentId: 'cost-log', payload: { companyId: 'acceptance', amount: 200000 } },
    { collectionName: 'expenses', documentId: 'cost-expense', payload: { companyId: 'acceptance', amount: 200000 } },
  ];
  await commit(costGroup);
  await assertFails(commit([
    { ...costGroup[0], payload: { companyId: 'acceptance', amount: 999 } },
    { ...costGroup[1], documentId: 'denied-atomic' },
  ]));
  assert.equal((await getDocFromServer(doc(reader, path('assetCostLogs', 'cost-log')))).data().amount, 200000);

  const deliveryGroup = [
    { collectionName: 'deliveryReports', documentId: 'delivery-command', payload: { companyId: 'acceptance', collectedAmount: 60, deliveryExpenseAmount: 3 } },
    { collectionName: 'payments', documentId: 'delivery-payment', ifAbsent: true, payload: { companyId: 'acceptance', amount: 60, customerId: 'c', relatedDeliveryReportId: 'delivery-command' } },
    { collectionName: 'expenses', documentId: 'delivery-expense', payload: { companyId: 'acceptance', amount: 3, relatedDeliveryReportId: 'delivery-command' } },
    { collectionName: 'assetCostLogs', documentId: 'delivery-cost', payload: { companyId: 'acceptance', amount: 3, relatedDeliveryReportId: 'delivery-command' } },
  ];
  await commit(deliveryGroup);
  await commit(JSON.parse(JSON.stringify(deliveryGroup)));
  await assertFails(commit([
    { ...deliveryGroup[0], payload: { companyId: 'acceptance', collectedAmount: 999 } },
    { ...deliveryGroup[2], documentId: 'denied-atomic' },
    { ...deliveryGroup[3], payload: { companyId: 'acceptance', amount: 999 } },
  ]));
  assert.equal((await getDocFromServer(doc(reader, path('deliveryReports', 'delivery-command')))).data().collectedAmount, 60);
  assert.equal((await getDocFromServer(doc(reader, path('assetCostLogs', 'delivery-cost')))).data().amount, 3);

  const resolution = [
    { collectionName: 'orders', documentId: 'resolution-order', payload: { companyId: 'acceptance', amount: 63 } },
    { collectionName: 'deliveryReports', documentId: 'resolution-report', payload: { companyId: 'acceptance', resolutionStatus: 'lost_charged' } },
    { collectionName: 'financials', documentId: 'resolution-penalty', ifAbsent: true, payload: { companyId: 'acceptance', empId: 'employee', type: 'penalty', amount: 3, date: '2026-09-30', sourceDeliveryReportId: 'resolution-report' } },
  ];
  await commit(resolution);
  await commit(JSON.parse(JSON.stringify(resolution)));
  await assert.rejects(commit([
    { ...resolution[0], payload: { companyId: 'acceptance', amount: 999 } },
    { ...resolution[2], payload: { ...resolution[2].payload, amount: 999 } },
  ]), error => error.code === 'firestore/financial-command-conflict');
  assert.equal((await getDocFromServer(doc(reader, path('orders', 'resolution-order')))).data().amount, 63);
  assert.equal((await getDocFromServer(doc(reader, path('financials', 'resolution-penalty')))).data().amount, 3);

  await setDoc(doc(db, path('deliveryReports', 'resolve-once')), { companyId: 'acceptance', resolutionStatus: 'pending' });
  const once = [
    { collectionName: 'orders', documentId: 'resolve-once-order', payload: { companyId: 'acceptance', amount: 63 } },
    { collectionName: 'deliveryReports', documentId: 'resolve-once', resolveOnce: true, payload: { companyId: 'acceptance', resolutionStatus: 'accepted', linkedOrderId: 'resolve-once-order' }, options: { merge: true } },
  ];
  await commit(once);
  await setDoc(doc(db, path('orders', 'resolve-once-order')), { amount: 70 }, { merge: true });
  const replayOnce = await commit(JSON.parse(JSON.stringify(once)));
  assert.equal(replayOnce.existingDocuments[0].payload.amount, 70);
  await assert.rejects(commit([{ ...once[1], payload: { ...once[1].payload, resolutionStatus: 'rejected' } }]), error => error.code === 'firestore/delivery-resolution-conflict');
  assert.equal((await getDocFromServer(doc(reader, path('deliveryReports', 'resolve-once')))).data().resolutionStatus, 'accepted');
  assert.equal((await getDocFromServer(doc(reader, path('orders', 'resolve-once-order')))).data().amount, 70);

  await setDoc(doc(db, path('deliveryReports', 'competing-decisions')), { companyId: 'acceptance', resolutionStatus: 'pending' });
  const decision = status => [{ collectionName: 'deliveryReports', documentId: 'competing-decisions', resolveOnce: true, payload: { companyId: 'acceptance', resolutionStatus: status }, options: { merge: true } }];
  const competing = await Promise.allSettled([commit(decision('accepted')), commit(decision('rejected'))]);
  assert.equal(competing.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(competing.find(result => result.status === 'rejected').reason.code, 'firestore/delivery-resolution-conflict');

  const paymentGroup = [
    { collectionName: 'payments', documentId: 'conditional-payment', ifAbsent: true, payload: { companyId: 'acceptance', customerId: 'c', amount: 60, method: 'cash' } },
    { collectionName: 'notifications', documentId: 'conditional-notice', ifAbsent: true, payload: { companyId: 'acceptance', status: 'unread' } },
    { collectionName: 'zalo_campaign_queue', documentId: 'conditional-zalo', ifAbsent: true, payload: { companyId: 'acceptance', status: 'pending' } },
  ];
  await commit(paymentGroup);
  await setDoc(doc(db, path('notifications', 'conditional-notice')), { status: 'read' }, { merge: true });
  await setDoc(doc(db, path('zalo_campaign_queue', 'conditional-zalo')), { status: 'sent' }, { merge: true });
  await commit(JSON.parse(JSON.stringify(paymentGroup)));
  assert.equal((await getDocFromServer(doc(reader, path('notifications', 'conditional-notice')))).data().status, 'read');
  assert.equal((await getDocFromServer(doc(reader, path('zalo_campaign_queue', 'conditional-zalo')))).data().status, 'sent');
  await assert.rejects(commit([{ ...paymentGroup[0], payload: { ...paymentGroup[0].payload, amount: 63 } }]), error => error.code === 'firestore/payment-command-conflict');
  assert.equal((await getDocFromServer(doc(reader, path('payments', 'conditional-payment')))).data().amount, 60);

  const reference = doc(db, path('orderRequests', 'offline-edit'));
  await setDoc(reference, { companyId: 'acceptance', revision: 0, amount: 60000 });
  await disableNetwork(db);
  let acknowledged = false;
  const first = setDoc(reference, { amount: 62000, revision: 1 }, { merge: true });
  const second = setDoc(reference, { amount: 63000, revision: 2 }, { merge: true });
  const pending = Promise.all([first, second]).then(() => { acknowledged = true; });
  await new Promise((resolve, reject) => {
    let stop = () => {};
    const timeout = setTimeout(() => { stop(); reject(new Error('Offline local update missing')); }, 5000);
    stop = onSnapshot(reference, snapshot => {
      if (snapshot.data()?.revision !== 2 || !snapshot.metadata.hasPendingWrites) return;
      clearTimeout(timeout);
      stop();
      resolve();
    }, error => { clearTimeout(timeout); reject(error); });
  });
  assert.equal(acknowledged, false, 'Offline cache must not be confused with server confirmation');
  assert.equal((await getDocFromServer(doc(reader, path('orderRequests', 'offline-edit')))).data().revision, 0);
  const reconnectStart = performance.now();
  await enableNetwork(db);
  await pending;
  const restored = await getDocFromServer(doc(reader, path('orderRequests', 'offline-edit')));
  assert.equal(restored.data().revision, 2);
  assert.equal(restored.data().amount, 63000);
  await assertFails(setDoc(doc(db, path('orders', 'wrong-tenant')), { companyId: 'other', amount: 1 }));
  const report = { environment: 'Firestore Emulator, actual SDK and security rules; not app UI or production network', samples, coalescedReplayMatchesSequentialWrites: true, offlineLatestEditPreserved: true, permissionDeniedVerified: true, assetCostAtomicRollback: true, deliveryCompoundAtomicRollback: true, deliveryPenaltyAtomicRollback: true, deliveryResolutionCompetingDecisionsRejected: true, deliveryResolutionRetryPreservesLaterOrderEdit: true, paymentConditionalRetryPreservesReadAndSent: true, paymentIdReuseRejected: true, reconnectMs: Math.round(performance.now() - reconnectStart) };
  await writeFile('test-results/firestore-save-acceptance.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await env.cleanup();
}
