const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const admin = require('../functions/node_modules/firebase-admin');
const {
  buildInventoryBalanceId,
  executeAtomicInventoryOperation,
} = require('../functions/inventoryTransactions');
const { executeOrderReturnTransaction } = require('../functions/orderReturnTransactions');

if (!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
  throw new Error('Local Firestore emulator required');
}

const app = admin.initializeApp({ projectId: 'hd-manager-order-return' }, 'order-return-application');
const db = app.firestore();
const FieldValue = admin.firestore.FieldValue;
const appId = 'order-return-application';
const collectionPath = (id, name) => `artifacts/${id}/public/data/${name}`;
const claims = { companyId: 'company-return', appUserId: 'owner-return', accountType: 'employee', role: 'owner' };
const ref = (name, id) => db.collection(collectionPath(appId, name)).doc(id);

test('real order screen routes returns through the server transaction and refreshes the cursor read path', () => {
  const appSource = readFileSync(resolve(__dirname, '../src/App.jsx'), 'utf8');
  const editorStart = appSource.indexOf('const saveOrderReturnEditor = async');
  const editorEnd = appSource.indexOf('const openOrderItemEditor =', editorStart);
  const handlerStart = appSource.indexOf('const handleReturnOrder = async');
  const handlerEnd = appSource.indexOf('const handleEditOrder = async', handlerStart);

  assert.ok(editorStart > 0 && editorEnd > editorStart, 'return editor must exist in the real order screen');
  assert.ok(handlerStart > 0 && handlerEnd > handlerStart, 'application return handler must exist');

  const editorSource = appSource.slice(editorStart, editorEnd);
  const handlerSource = appSource.slice(handlerStart, handlerEnd);
  assert.match(editorSource, /await onReturnOrder\(\{/);
  assert.match(editorSource, /goodsReturnedConfirmed:\s*true/);
  assert.match(editorSource, /returnDraft\.condition\s*===\s*'DAMAGED'\s*\?\s*'DAMAGED'\s*:\s*'SELLABLE'/);
  assert.match(editorSource, /quantity:\s*pieces,\s*condition/);
  assert.match(editorSource, /quantity:\s*weightKg,\s*condition/);
  assert.doesNotMatch(editorSource, /commitOrderEdit\(/, 'return must not overwrite the order directly');
  assert.match(handlerSource, /await commitOrderReturnTransaction\(\{/);
  assert.match(handlerSource, /SCREEN_CURSOR_MUTATION_EVENT/);
  assert.match(handlerSource, /serverConfirmed:\s*true/);
});

test.before(async () => {
  await ref('companies', claims.companyId).set({ id: claims.companyId, companyId: claims.companyId });
  await ref('employees', claims.appUserId).set({ id: claims.appUserId, companyId: claims.companyId, role: 'owner' });
});
test.after(() => app.delete());

const seedDeliveredOrder = async (key, deliveredQuantity = 100) => {
  const warehouseId = `warehouse-${key}`;
  const productId = `product-${key}`;
  const unit = 'con';
  const dispatchId = `dispatch-${key}`;
  const orderId = `order-${key}`;
  await executeAtomicInventoryOperation({
    db, FieldValue, collectionPath, appId, claims,
    payload: {
      operationType: 'INBOUND',
      clientMutationId: `inbound-${key}`,
      collectionName: 'warehouseImports',
      documentId: `import-${key}`,
      document: {},
      movements: [{ warehouseId, productId, unit, quantity: deliveredQuantity }],
    },
  });
  const outbound = await executeAtomicInventoryOperation({
    db, FieldValue, collectionPath, appId, claims,
    payload: {
      operationType: 'OUTBOUND',
      clientMutationId: `outbound-${key}`,
      collectionName: 'warehouseDispatches',
      documentId: dispatchId,
      document: { customerId: `customer-${key}` },
      movements: [{ warehouseId, productId, unit, quantity: deliveredQuantity }],
    },
  });
  await ref('orders', orderId).set({
    id: orderId,
    companyId: claims.companyId,
    customerId: `customer-${key}`,
    amount: deliveredQuantity * 1000,
    sourceDispatchIds: [dispatchId],
    items: [{ productId, quantity: deliveredQuantity, unit }],
  });
  await ref('warehouseDispatches', dispatchId).set({ linkedOrderId: orderId }, { merge: true });
  await ref('deliveryReports', `delivery-${key}`).set({
    id: `delivery-${key}`,
    companyId: claims.companyId,
    dispatchId,
    deliveredAt: new Date().toISOString(),
  });
  return { warehouseId, productId, unit, dispatchId, orderId, operationId: outbound.operationId };
};

const commitReturn = (seed, mutation, requestedQuantity, condition = 'SELLABLE', extra = {}) => (
  executeOrderReturnTransaction({
    db, FieldValue, collectionPath, appId, claims,
    payload: {
      clientMutationId: mutation,
      orderId: seed.orderId,
      reason: 'Khách đã trả hàng thực tế',
      goodsReturnedConfirmed: true,
      lines: [{
        warehouseId: seed.warehouseId,
        productId: seed.productId,
        unit: seed.unit,
        quantity: requestedQuantity,
        condition,
      }],
      ...extra,
    },
  })
);

test('application return workflow supports partial, repeated, full and damaged returns without inflating sellable stock', async () => {
  const seed = await seedDeliveredOrder('workflow', 100);
  const first = await commitReturn(seed, 'return-workflow-01', 20);
  assert.equal(first.returnStatus, 'PARTIAL_RETURN');
  const damaged = await commitReturn(seed, 'return-workflow-02', 30, 'DAMAGED');
  assert.equal(damaged.returnStatus, 'PARTIAL_RETURN');
  await assert.rejects(commitReturn(seed, 'return-workflow-too-much', 51), { code: 'return_quantity_exceeds_delivered' });
  const final = await commitReturn(seed, 'return-workflow-03', 50);
  assert.equal(final.returnStatus, 'FULL_RETURN');

  const balanceId = buildInventoryBalanceId({ companyId: claims.companyId, warehouseId: seed.warehouseId, productId: seed.productId, unit: seed.unit });
  const balance = (await ref('inventoryBalances', balanceId).get()).data();
  assert.equal(balance.availableQuantity, 70, '20 + 50 sellable returned; 30 damaged never enters sellable stock');
  const returnState = (await db.collection(collectionPath(appId, 'inventoryReturnStates')).where('orderId', '==', seed.orderId).get()).docs[0].data();
  assert.equal(returnState.deliveredQuantity, 100);
  assert.equal(returnState.returnedQuantity, 100);
  assert.equal(returnState.sellableReturnedQuantity, 70);
  assert.equal(returnState.damagedReturnedQuantity, 30);
  const damagedEvidence = await db.collection(collectionPath(appId, 'inventoryDamagedReturns')).where('orderId', '==', seed.orderId).get();
  assert.equal(damagedEvidence.size, 1);
  assert.equal(damagedEvidence.docs[0].data().type, 'RETURN_DAMAGED');
  assert.equal(damagedEvidence.docs[0].data().sellableStockDelta, 0);
  const order = (await ref('orders', seed.orderId).get()).data();
  assert.equal(order.returnStatus, 'FULL_RETURN');
  assert.equal(order.returnTransactionCount, 3);
  assert.equal(order.returnFinancialStatus, 'BUSINESS_RULE_REQUIRED');
});

for (const concurrency of [2, 5, 10]) {
  test(`same application return mutation is committed once under ${concurrency} concurrent calls`, async () => {
    const seed = await seedDeliveredOrder(`retry-${concurrency}`, 10);
    const results = await Promise.all(Array.from({ length: concurrency }, () => (
      commitReturn(seed, `return-retry-${concurrency}`, 4)
    )));
    assert.equal(results.filter(result => !result.duplicate).length, 1);
    assert.equal(results.filter(result => result.duplicate).length, concurrency - 1);
    assert.equal((await commitReturn(seed, `return-retry-${concurrency}`, 4)).duplicate, true);
    const receipts = await db.collection(collectionPath(appId, 'orderReturns')).where('orderId', '==', seed.orderId).get();
    assert.equal(receipts.size, 1);
    const state = (await db.collection(collectionPath(appId, 'inventoryReturnStates')).where('orderId', '==', seed.orderId).get()).docs[0].data();
    assert.equal(state.returnedQuantity, 4);
  });
}

test('different concurrent operations cannot return more than delivered', async () => {
  const seed = await seedDeliveredOrder('bounded-concurrency', 10);
  const results = await Promise.allSettled(Array.from({ length: 10 }, (_, index) => (
    commitReturn(seed, `return-bounded-${index}`, 2)
  )));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 5);
  assert.ok(results.filter(result => result.status === 'rejected').every(result => (
    result.reason.code === 'return_quantity_exceeds_delivered'
  )));
  const state = (await db.collection(collectionPath(appId, 'inventoryReturnStates')).where('orderId', '==', seed.orderId).get()).docs[0].data();
  assert.equal(state.returnedQuantity, 10);
});

test('idempotency conflicts, missing delivery evidence and unapproved valuation are rejected', async () => {
  const seed = await seedDeliveredOrder('guards', 10);
  await commitReturn(seed, 'return-guard-key', 2);
  await assert.rejects(commitReturn(seed, 'return-guard-key', 3), { code: 'return_idempotency_conflict' });
  await assert.rejects(commitReturn(seed, 'return-guard-credit', 1, 'SELLABLE', { creditAmount: 1000 }), {
    code: 'business_rule_required',
  });
  const noDelivery = await seedDeliveredOrder('no-delivery', 10);
  await ref('deliveryReports', 'delivery-no-delivery').delete();
  await assert.rejects(commitReturn(noDelivery, 'return-no-delivery', 1), { code: 'return_delivery_confirmation_required' });
});
