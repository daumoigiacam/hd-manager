const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('../functions/node_modules/firebase-admin');
const { preparePaymentCorrection } = require('../functions/paymentCorrection');
if (!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Local emulator required');
const app = admin.initializeApp({ projectId: 'hd-manager-payment-correction' }, 'payment-correction');
const db = app.firestore();
const appId = 'payment-correction';
const collectionPath = (id, name) => `artifacts/${id}/public/data/${name}`;
const claims = { companyId: 'company-a', appUserId: 'owner-a', accountType: 'employee', role: 'owner' };
const ref = (name, id) => db.collection(collectionPath(appId, name)).doc(id);
test.before(async () => {
  await ref('companies', claims.companyId).set({ companyId: claims.companyId });
  await ref('employees', claims.appUserId).set({ companyId: claims.companyId, role: 'owner' });
  for (const id of ['A', 'B', 'C']) await ref('orders', id).set({ companyId: claims.companyId, customerId: 'customer-a', amount: 4000000 });
});
test.after(() => app.delete());
const original = { companyId: 'company-a', customerId: 'customer-a', amount: 10000000,
  allocations: [{ orderId: 'A', amount: 4000000 }, { orderId: 'B', amount: 3000000 }, { orderId: 'C', amount: 3000000 }] };
const correct = (paymentId, overrides = {}, failAfterApply = false) => db.runTransaction(async transaction => {
  const plan = await preparePaymentCorrection({ transaction, db, collectionPath, appId, claims, paymentId,
    orderId: 'A', operationKey: `return-${paymentId}`, releaseAmount: 2000000, reason: 'Accepted return',
    timestamp: admin.firestore.FieldValue.serverTimestamp(), ...overrides });
  if (!plan.duplicate) plan.apply();
  if (failAfterApply) throw new Error('Order transition failed');
  return { id: plan.id, duplicate: plan.duplicate, state: plan.state };
});
for (const concurrency of [2, 5, 10]) {
  test(`${concurrency} corrections affect only A once; original payment and B/C unchanged`, async () => {
    const id = `payment-${concurrency}`;
    await ref('payments', id).set(original);
    const results = await Promise.all(Array.from({ length: concurrency }, () => correct(id)));
    const accepted = results.filter(row => !row.duplicate);
    assert.equal(accepted.length, 1);
    assert.deepEqual(accepted[0].state.allocations, [{ orderId: 'A', amount: 2000000 }, ...original.allocations.slice(1)]);
    assert.equal(accepted[0].state.unallocated, 2000000);
    assert.equal(accepted[0].state.refunded, 0);
    assert.deepEqual((await ref('payments', id).get()).data(), original);
    assert.equal((await correct(id)).duplicate, true);
    const events = await db.collection(collectionPath(appId, 'paymentCorrections')).where('paymentId', '==', id).get();
    assert.equal(events.size, 1);
  });
}
test('actual refund moves released allocation to refunded, not another payment', async () => {
  await ref('payments', 'refund').set(original);
  await assert.rejects(correct('refund', { refundAmount: 1000000 }), { code: 'refund_confirmation' });
  const result = await correct('refund', { refundAmount: 1000000, refundConfirmed: true, refundReference: 'bank-refund-1' });
  assert.equal(result.state.refunded, 1000000);
  assert.equal(result.state.unallocated, 1000000);
  assert.equal(result.state.allocations.reduce((sum, row) => sum + row.amount, 0) + result.state.unallocated + result.state.refunded, original.amount);
  assert.deepEqual((await ref('payments', 'refund').get()).data(), original);
  await assert.rejects(correct('refund', { operationKey: 'second-refund', refundAmount: 1000000, refundConfirmed: true, refundReference: 'bank-refund-1' }), { code: 'refund_duplicate_reference' });
});
test('different corrections cannot release more than A allocation', async () => {
  await ref('payments', 'excess').set(original);
  const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => correct('excess', { operationKey: `different-${i}` })));
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 2);
  assert.ok(results.filter(row => row.status === 'rejected').every(row => row.reason.code === 'allocation_insufficient'));
});
test('missing authoritative allocation, tenant mismatch and operation conflict are rejected', async () => {
  await ref('payments', 'missing').set({ companyId: 'company-a', customerId: 'customer-a', amount: 100 });
  await assert.rejects(correct('missing'), { code: 'allocation_reconciliation_required' });
  await ref('payments', 'denied').set(original);
  await assert.rejects(correct('denied', { claims: { ...claims, companyId: 'company-b' } }), { code: 'correction_tenant' });
  await correct('denied');
  await assert.rejects(correct('denied', { releaseAmount: 1 }), { code: 'correction_conflict' });
});
test('caller failure rolls back all financial writes', async () => {
  await ref('payments', 'rollback').set(original);
  await assert.rejects(correct('rollback', {}, true), /Order transition failed/);
  assert.equal((await correct('rollback')).duplicate, false);
});
