const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('../functions/node_modules/firebase-admin');
const { preparePaymentCorrection } = require('../functions/paymentCorrection');
const { reconcileCorrectedCustomerDebt } = require('../functions/debtCorrectionReconciliation');
if (!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Local emulator required');
const app = admin.initializeApp({ projectId: 'hd-manager-debt-correction' }, 'debt-correction');
const db = app.firestore();
const collectionPath = (id, name) => `artifacts/${id}/public/data/${name}`;
const claims = { companyId: 'company', appUserId: 'owner', accountType: 'employee', role: 'owner' };
test.after(() => app.delete());
for (const concurrency of [2, 5, 10]) test(`credit and inherited payment correction reconcile after ${concurrency} concurrent retries`, async () => {
  const appId = `debt-${concurrency}`;
  const ref = (name, id) => db.collection(collectionPath(appId, name)).doc(id);
  const scope = { companyId: 'company', customerId: 'customer' };
  await ref('companies', 'company').set({ companyId: 'company' });
  await ref('employees', 'owner').set({ companyId: 'company', role: 'owner' });
  for (const id of ['A', 'B', 'C']) await ref('orders', id).set({ ...scope, amount: id === 'A' ? 400 : 300 });
  const original = { ...scope, amount: 1000, allocations: [{ orderId: 'A', amount: 400 }, { orderId: 'B', amount: 300 }, { orderId: 'C', amount: 300 }] };
  await ref('payments', 'P').set(original);
  const run = fail => db.runTransaction(async transaction => {
    const plan = await preparePaymentCorrection({ transaction, db, collectionPath, appId, claims,
      paymentId: 'P', orderId: 'A', operationKey: 'return-a', releaseAmount: 200, refundAmount: 100,
      refundConfirmed: true, refundReference: 'bank-ref', reason: 'Accepted credit fixture', timestamp: admin.firestore.FieldValue.serverTimestamp() });
    if (!plan.duplicate) {
      plan.apply();
      transaction.create(ref('orderCredits', plan.id), { ...scope, orderId: 'A', amount: 200,
        operationKey: 'return-a', actor: 'owner', createdAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    if (fail) throw new Error('Credit transition failed');
    return plan.duplicate;
  });
  await assert.rejects(run(true), /Credit transition failed/);
  assert.equal((await db.collection(collectionPath(appId, 'orderCredits')).get()).size, 0);
  const results = await Promise.all(Array.from({ length: concurrency }, () => run(false)));
  assert.equal(results.filter(duplicate => !duplicate).length, 1);
  const read = async name => (await db.collection(collectionPath(appId, name)).get()).docs.map(doc => ({ ...doc.data(), id: doc.id }));
  const audit = reconcileCorrectedCustomerDebt({ ...scope, complete: true,
    orders: await read('orders'), payments: await read('payments'), states: await read('paymentCorrectionStates'),
    corrections: await read('paymentCorrections'), credits: await read('orderCredits'), refunds: await read('refundReceipts') });
  assert.deepEqual(audit.issues, []);
  assert.equal(audit.status, 'PASS');
  assert.equal(audit.balances.currentDebt, 0);
  assert.equal(audit.balances.unallocated, 100);
  assert.equal(audit.balances.netReceived, 900);
  assert.deepEqual((await ref('payments', 'P').get()).data(), original);
  assert.equal((await read('orderCredits')).length, 1);
});
