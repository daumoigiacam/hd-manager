const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('../functions/node_modules/firebase-admin');
const { executeAtomicInventoryOperation, buildInventoryBalanceId } = require('../functions/inventoryTransactions');
const { prepareInventoryReversal } = require('../functions/inventoryReversal');
if (!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Local emulator required');
const app = admin.initializeApp({ projectId: 'hd-manager-reversal' }, 'reversal');
const db = app.firestore();
const FieldValue = admin.firestore.FieldValue;
const appId = 'reversal-test';
const collectionPath = (id, name) => `artifacts/${id}/public/data/${name}`;
const claims = { companyId: 'company-a', appUserId: 'owner-a', accountType: 'employee', role: 'owner' };
const ref = (name, id) => db.collection(collectionPath(appId, name)).doc(id);
test.before(async () => {
  await ref('companies', claims.companyId).set({ companyId: claims.companyId });
  await ref('employees', claims.appUserId).set({ companyId: claims.companyId, role: 'owner' });
});
test.after(() => app.delete());
async function seed(key) {
  const create = (type, quantity) => executeAtomicInventoryOperation({ db, FieldValue, collectionPath, appId, claims, payload: {
    operationType: type, clientMutationId: `${key}-${type}`, documentId: `${key}-${type}`,
    collectionName: type === 'INBOUND' ? 'warehouseImports' : 'warehouseDispatches',
    document: {}, movements: [{ warehouseId: key, productId: 'product-a', unit: 'con', quantity }]
  } });
  await create('INBOUND', 100);
  return create('OUTBOUND', 12);
}
const reverse = (operationId, extra = {}) => db.runTransaction(async transaction => {
  const plan = await prepareInventoryReversal({ transaction, db, collectionPath, appId, claims,
    operationId, reason: 'Customer returned goods', goodsReturned: true, timestamp: FieldValue.serverTimestamp(), ...extra });
  if (!plan.duplicate) plan.apply();
  return { duplicate: plan.duplicate, reversalId: plan.reversalId };
});
for (const concurrency of [2, 5, 10]) {
  test(`${concurrency} reversals compensate once and preserve original ledger`, async () => {
    const key = `reversal-${concurrency}`;
    const source = await seed(key);
    const original = await db.collection(collectionPath(appId, 'inventoryLedger')).where('operationId', '==', source.operationId).get();
    const before = original.docs.map(doc => doc.data());
    const results = await Promise.all(Array.from({ length: concurrency }, () => reverse(source.operationId)));
    assert.equal(results.filter(item => !item.duplicate).length, 1);
    const balanceId = buildInventoryBalanceId({ companyId: claims.companyId, warehouseId: key, productId: 'product-a', unit: 'con' });
    assert.equal((await ref('inventoryBalances', balanceId).get()).data().availableQuantity, 100);
    const ledger = await db.collection(collectionPath(appId, 'inventoryLedger')).where('operationId', '==', results[0].reversalId).get();
    assert.equal(ledger.size, 1);
    assert.equal(ledger.docs[0].data().delta, 12);
    const after = await db.collection(collectionPath(appId, 'inventoryLedger')).where('operationId', '==', source.operationId).get();
    assert.deepEqual(after.docs.map(doc => doc.data()), before);
    assert.equal((await reverse(source.operationId)).duplicate, true);
  });
}
test('missing return confirmation and foreign identity cannot reverse', async () => {
  const source = await seed('reversal-denied');
  await assert.rejects(reverse(source.operationId, { goodsReturned: false }), { code: 'reversal_goods_confirmation' });
  await assert.rejects(reverse(source.operationId, { claims: { ...claims, companyId: 'foreign' } }), { code: 'reversal_source' });
});
test('caller failure rolls back compensation and receipt together', async () => {
  const source = await seed('reversal-rollback');
  await assert.rejects(db.runTransaction(async transaction => {
    const plan = await prepareInventoryReversal({ transaction, db, collectionPath, appId, claims, operationId: source.operationId,
      reason: 'Return', goodsReturned: true, timestamp: FieldValue.serverTimestamp() });
    plan.apply();
    throw new Error('Debt transition failed');
  }), /Debt transition failed/);
  assert.equal((await reverse(source.operationId)).duplicate, false);
});
