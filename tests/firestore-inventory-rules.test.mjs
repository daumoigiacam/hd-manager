import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const projectId = 'hd-manager-phase4-inventory-rules';
const appId = 'phase4-rules-app';
const companyA = 'company-a';
const companyB = 'company-b';
const employeeA = 'employee-a';
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const pathFor = (collectionName, id) => `artifacts/${appId}/public/data/${collectionName}/${id}`;

const testEnvironment = await initializeTestEnvironment({ projectId, firestore: { rules } });
let passed = 0;
const check = async (name, callback) => {
  await callback();
  passed += 1;
  console.log(`PASS ${name}`);
};

try {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    const seed = (collectionName, id, data) => setDoc(
      doc(database, pathFor(collectionName, id)),
      { id, ...data },
    );
    await Promise.all([
      seed('companies', companyA, { companyId: companyA, name: 'Company A' }),
      seed('companies', companyB, { companyId: companyB, name: 'Company B' }),
      seed('employees', employeeA, { companyId: companyA, position: 'Xuất kho' }),
      seed('inventoryBalances', 'balance-a', {
        companyId: companyA,
        warehouseId: 'warehouse-a',
        productId: 'product-a',
        unit: 'con',
        availableQuantity: 100,
      }),
      seed('inventoryBalances', 'balance-b', {
        companyId: companyB,
        warehouseId: 'warehouse-b',
        productId: 'product-b',
        unit: 'con',
        availableQuantity: 200,
      }),
      seed('inventoryLedger', 'ledger-a', { companyId: companyA, operationId: 'operation-a' }),
      seed('inventoryOperations', 'operation-a', { companyId: companyA, status: 'COMMITTED' }),
      seed('warehouseImports', 'import-a', {
        companyId: companyA,
        inventoryOperationId: 'operation-import-a',
        inventoryMovements: [{ productId: 'product-a', unit: 'con', quantity: 100 }],
      }),
      seed('warehouseStockCounts', 'count-a', {
        companyId: companyA,
        inventoryOperationId: 'operation-count-a',
        inventoryMovements: [{ productId: 'product-a', unit: 'con', quantity: 100 }],
      }),
      seed('warehouseDispatches', 'dispatch-a', {
        companyId: companyA,
        inventoryOperationId: 'operation-dispatch-a',
        inventoryMovements: [{ productId: 'product-a', unit: 'con', quantity: 10 }],
        linkedOrderId: '',
      }),
    ]);
  });

  const employeeDb = testEnvironment.authenticatedContext('firebase-employee-a', {
    identityId: 'identity-employee-a',
    companyId: companyA,
    appUserId: employeeA,
    accountType: 'employee',
    role: 'warehouse',
  }).firestore();
  const otherTenantDb = testEnvironment.authenticatedContext('firebase-employee-b', {
    identityId: 'identity-employee-b',
    companyId: companyB,
    appUserId: 'employee-b',
    accountType: 'employee',
    role: 'warehouse',
  }).firestore();
  const customerDb = testEnvironment.authenticatedContext('firebase-customer-a', {
    identityId: 'identity-customer-a',
    companyId: companyA,
    appUserId: 'customer-account-a',
    customerId: 'customer-a',
    accountType: 'customer',
    role: 'customer',
  }).firestore();

  await check('employee can read only server-managed inventory from the same tenant', async () => {
    const ownBalance = await assertSucceeds(getDoc(doc(employeeDb, pathFor('inventoryBalances', 'balance-a'))));
    assert.equal(ownBalance.data().availableQuantity, 100);
    await assertFails(getDoc(doc(employeeDb, pathFor('inventoryBalances', 'balance-b'))));
    await assertFails(getDoc(doc(otherTenantDb, pathFor('inventoryBalances', 'balance-a'))));
    await assertFails(getDoc(doc(customerDb, pathFor('inventoryBalances', 'balance-a'))));
  });

  await check('tenant-scoped balance list query cannot leak another company', async () => {
    const result = await assertSucceeds(getDocs(query(
      collection(employeeDb, `artifacts/${appId}/public/data/inventoryBalances`),
      where('companyId', '==', companyA),
    )));
    assert.equal(result.size, 1);
    assert.equal(result.docs[0].data().companyId, companyA);
  });

  await check('client cannot create any server-managed inventory document', async () => {
    for (const collectionName of [
      'inventoryBalances',
      'inventoryLedger',
      'inventoryOperations',
      'warehouseImports',
      'warehouseDispatches',
      'warehouseStockCounts',
    ]) {
      await assertFails(setDoc(doc(employeeDb, pathFor(collectionName, `client-${collectionName}`)), {
        id: `client-${collectionName}`,
        companyId: companyA,
      }));
    }
  });

  await check('client cannot alter or delete balances, ledger, operations, imports or counts', async () => {
    const targets = [
      ['inventoryBalances', 'balance-a'],
      ['inventoryLedger', 'ledger-a'],
      ['inventoryOperations', 'operation-a'],
      ['warehouseImports', 'import-a'],
      ['warehouseStockCounts', 'count-a'],
    ];
    for (const [collectionName, id] of targets) {
      await assertFails(updateDoc(doc(employeeDb, pathFor(collectionName, id)), { updatedAt: 'client-write' }));
      await assertFails(deleteDoc(doc(employeeDb, pathFor(collectionName, id))));
    }
  });

  await check('dispatch can only receive an order link without changing inventory facts', async () => {
    const dispatchRef = doc(employeeDb, pathFor('warehouseDispatches', 'dispatch-a'));
    await assertSucceeds(updateDoc(dispatchRef, {
      linkedOrderId: 'order-a',
      linkedOrderCreatedAt: '2026-10-02T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
    }));
    await assertFails(updateDoc(dispatchRef, {
      inventoryMovements: [{ productId: 'product-a', unit: 'con', quantity: 99 }],
      updatedAt: 'client-tamper',
    }));
    await assertFails(updateDoc(dispatchRef, { companyId: companyB }));
    await assertFails(deleteDoc(dispatchRef));
  });

  const evidence = {
    generatedAt: new Date().toISOString(),
    environment: 'LOCAL_FIRESTORE_EMULATOR',
    checks: passed,
    expectedChecks: 5,
    status: passed === 5 ? 'PASS' : 'FAIL',
    assertions: [
      'same-tenant employee read succeeds',
      'cross-tenant and customer reads fail',
      'direct client creates fail for all server-managed inventory collections',
      'balance, ledger, operation, import and count mutations fail',
      'dispatch order link cannot mutate inventory facts',
    ],
  };
  await mkdir('test-results/phase4', { recursive: true });
  await writeFile('test-results/phase4/firestore-inventory-rules.json', `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`Firestore inventory rules: ${passed}/5 checks passed.`);
} finally {
  await testEnvironment.cleanup();
}
