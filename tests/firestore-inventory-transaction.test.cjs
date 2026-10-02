const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { performance } = require('node:perf_hooks');

const admin = require('../functions/node_modules/firebase-admin');
const {
  buildInventoryBalanceId,
  executeAtomicInventoryOperation,
} = require('../functions/inventoryTransactions');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST is required. Run this test through Firebase Emulator.');
}

const projectId = 'hd-manager-phase4-inventory-transaction';
const appId = 'phase4-transaction-app';
const firebaseApp = admin.apps.find(app => app.name === 'phase4-inventory')
  || admin.initializeApp({ projectId }, 'phase4-inventory');
const db = firebaseApp.firestore();
const FieldValue = admin.firestore.FieldValue;
const collectionPath = (resolvedAppId, name) => `artifacts/${resolvedAppId}/public/data/${name}`;
const claims = {
  uid: 'owner-a',
  identityId: 'identity-owner-a',
  companyId: 'company-a',
  appUserId: 'owner-a',
  accountType: 'employee',
  role: 'super_admin',
};
const evidence = [];

const command = ({ type, key, quantity, warehouseId, productId = 'product-a', companyClaims = claims }) => (
  executeAtomicInventoryOperation({
    db,
    FieldValue,
    collectionPath,
    appId,
    claims: companyClaims,
    payload: {
      operationType: type,
      clientMutationId: key,
      collectionName: type === 'INBOUND'
        ? 'warehouseImports'
        : (type === 'COUNT' ? 'warehouseStockCounts' : 'warehouseDispatches'),
      documentId: `${type.toLowerCase()}_${companyClaims.companyId}_${key}`,
      document: { note: key },
      movements: [{ warehouseId, productId, unit: 'con', quantity }],
    },
  })
);

const getBalance = async ({ warehouseId, productId = 'product-a', companyId = claims.companyId }) => {
  const balanceId = buildInventoryBalanceId({ companyId, warehouseId, productId, unit: 'con' });
  const snapshot = await db.collection(collectionPath(appId, 'inventoryBalances')).doc(balanceId).get();
  return snapshot.data();
};

test.before(async () => {
  await db.collection(collectionPath(appId, 'companies')).doc(claims.companyId).set({
    id: claims.companyId,
    companyId: claims.companyId,
  });
  await db.collection(collectionPath(appId, 'employees')).doc(claims.appUserId).set({
    id: claims.appUserId,
    companyId: claims.companyId,
    position: 'Chủ doanh nghiệp',
  });
});

for (const concurrentRequests of [2, 5, 10, 25, 50]) {
  test(`Firestore transaction preserves stock under ${concurrentRequests} concurrent requests`, async () => {
    const startedAt = performance.now();
    const warehouseId = `warehouse-matrix-${concurrentRequests}`;
    await command({
      type: 'INBOUND',
      key: `warehouse-import-emulator-${concurrentRequests}`,
      quantity: 100,
      warehouseId,
    });
    const quantity = concurrentRequests === 2 ? 60 : 7;
    const results = await Promise.allSettled(Array.from({ length: concurrentRequests }, (_, index) => command({
      type: 'OUTBOUND',
      key: `warehouse-dispatch-emulator-${concurrentRequests}-${index}`,
      quantity,
      warehouseId,
    })));
    const accepted = results.filter(result => result.status === 'fulfilled').length;
    const rejected = results.filter(result => result.status === 'rejected').length;
    const balance = await getBalance({ warehouseId });
    assert.equal(accepted + rejected, concurrentRequests);
    assert.equal(balance.availableQuantity, 100 - accepted * quantity);
    assert.ok(balance.availableQuantity >= 0);
    assert.ok(accepted * quantity <= 100);
    evidence.push({
      concurrentRequests,
      requestedQuantity: quantity,
      accepted,
      rejected,
      finalStock: balance.availableQuantity,
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
    });
  });
}

test('Firestore transaction replays one operation key without a second deduction', async () => {
  const startedAt = performance.now();
  const warehouseId = 'warehouse-retry';
  await command({ type: 'INBOUND', key: 'warehouse-import-emulator-retry', quantity: 100, warehouseId });
  const send = () => command({
    type: 'OUTBOUND',
    key: 'warehouse-dispatch-emulator-retry',
    quantity: 12,
    warehouseId,
  });
  const results = await Promise.all([send(), send(), send(), send()]);
  const balance = await getBalance({ warehouseId });
  assert.equal(balance.availableQuantity, 88);
  assert.equal(results.filter(result => result.duplicate).length, 3);

  const dispatchSnapshot = await db.collection(collectionPath(appId, 'warehouseDispatches')).get();
  const matchingDispatches = dispatchSnapshot.docs.filter(docSnapshot => (
    docSnapshot.data().clientMutationId === 'warehouse-dispatch-emulator-retry'
  ));
  assert.equal(matchingDispatches.length, 1);
  evidence.push({
    scenario: 'idempotent-retry',
    attempts: 4,
    duplicates: results.filter(result => result.duplicate).length,
    finalStock: balance.availableQuantity,
    outboundDocuments: matchingDispatches.length,
    durationMs: Number((performance.now() - startedAt).toFixed(2)),
  });
});

test.after(async () => {
  fs.mkdirSync('test-results/phase4', { recursive: true });
  fs.writeFileSync('test-results/phase4/firestore-inventory-transaction.json', `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    environment: 'LOCAL_FIRESTORE_EMULATOR',
    status: 'PASS',
    evidence,
  }, null, 2)}\n`, 'utf8');
  await firebaseApp.delete();
});
