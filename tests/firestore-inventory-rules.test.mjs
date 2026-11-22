import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

import {
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
  writeBatch,
} from 'firebase/firestore';

// A denial must come from authorization, never Rules expression exhaustion.
const assertFails=operation=>assert.rejects(operation,error=>error.code==='permission-denied'&&!/maximum of 1000 expressions/.test(error.message));

const projectId = 'demo-phase4-inventory-rules-'+process.pid;
if(!/^(?:localhost|127\.0\.0\.1):8185$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Inventory Rules require loopback 8185');
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
        // These three collections also host active legacy CRUD. Match the
        // actual backend journal schema; the denial oracle is unchanged.
        ...(['warehouseImports','warehouseDispatches','warehouseStockCounts'].includes(collectionName)
          ? {inventoryOperationId:'forged-server-operation',inventoryMovements:[]} : {}),
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

  await check('removing journal markers or forging empty marker fields cannot escape server ownership',async()=>{
    for(const [name,id]of [['warehouseImports','import-a'],['warehouseStockCounts','count-a'],['warehouseDispatches','dispatch-a']]){
      await assertFails(setDoc(doc(employeeDb,pathFor(name,id)),{id,companyId:companyA,note:'strip journal'}));
      for(const key of ['inventoryOperationId','inventoryMovements','inventoryCommittedAt','inventoryCommittedByEmployeeId','ledgerId']){
        await assertFails(setDoc(doc(employeeDb,pathFor(name,`forged-${key}`)),{companyId:companyA,[key]:''}));
      }
    }
  });

  await check('plain legacy imports and counts retain client CRUD; ordinary activity logs remain writable',async()=>{
    for(const name of ['warehouseImports','warehouseStockCounts','activityLogs']){
      const ref=doc(employeeDb,pathFor(name,'legacy-client'));
      await assertSucceeds(setDoc(ref,{id:'legacy-client',companyId:companyA,note:'legacy',action:'ORDINARY_LEGACY_ACTION',type:'ordinary'}));
      await assertSucceeds(updateDoc(ref,{note:'edited'}));
      await assertSucceeds(deleteDoc(ref));
    }
  });

  await check('a rejected journal batch publishes none of its otherwise-allowed writes',async()=>{
    const batch=writeBatch(employeeDb),ref=doc(employeeDb,pathFor('warehouseImports','atomic-rollback'));
    batch.set(ref,{id:'atomic-rollback',companyId:companyA,note:'must not commit'});
    batch.update(doc(employeeDb,pathFor('inventoryBalances','balance-a')),{availableQuantity:999});
    await assertFails(batch.commit());
    assert.equal((await getDoc(ref)).exists(),false);
    assert.equal((await getDoc(doc(employeeDb,pathFor('inventoryBalances','balance-a')))).data().availableQuantity,100);
  });

  const evidence = {
    generatedAt: new Date().toISOString(),
    environment: 'LOCAL_FIRESTORE_EMULATOR',
    checks: passed,
    expectedChecks: 8,
    status: passed === 8 ? 'PASS' : 'FAIL',
    assertions: [
      'same-tenant employee read succeeds',
      'cross-tenant and customer reads fail',
      'direct client creates fail for all server-managed inventory collections',
      'balance, ledger, operation, import and count mutations fail',
      'dispatch order link cannot mutate inventory facts',
    ],
  };
  const reportDirectory=new URL('../test-results/phase4/',import.meta.url);
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(new URL('firestore-inventory-rules.json',reportDirectory), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`Firestore inventory rules: ${passed}/8 checks passed.`);
} finally {
  await testEnvironment.cleanup();
}
