import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';

const projectId = 'hd-manager-tenant-isolation-rules-test';
const appId = 'test-app';
const companyA = 'company-a';
const companyB = 'company-b';
const customerA = 'customer-a';
const customerB = 'customer-b';
const accountA = 'customer-account-a';
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

const pathFor = (collectionName, id) => (
  `artifacts/${appId}/public/data/${collectionName}/${id}`
);

const testEnvironment = await initializeTestEnvironment({
  projectId,
  firestore: { rules }
});

let passed = 0;
const test = async (name, callback) => {
  await callback();
  passed += 1;
  console.log(`PASS ${name}`);
};

const waitForRealtimeSnapshot = (queryRef, predicate, timeoutMs = 5000) => new Promise((resolve, reject) => {
  let unsubscribe = () => {};
  const timeout = setTimeout(() => {
    unsubscribe();
    reject(new Error('Timed out waiting for a Firestore realtime snapshot.'));
  }, timeoutMs);
  unsubscribe = onSnapshot(
    queryRef,
    (snapshot) => {
      if (!predicate(snapshot)) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(snapshot);
    },
    (error) => {
      clearTimeout(timeout);
      unsubscribe();
      reject(error);
    }
  );
});

try {
  await testEnvironment.withSecurityRulesDisabled(async context => {
    const database = context.firestore();
    const seed = async (collectionName, id, data) => {
      await setDoc(doc(database, pathFor(collectionName, id)), { id, ...data });
    };

    await seed('companies', companyA, { name: 'Company A', internalSecret: 'must-not-leak' });
    await seed('companies', companyB, { name: 'Company B', internalSecret: 'must-not-leak' });
    await seed('employees', 'employee-a', { companyId: companyA, name: 'Employee A' });
    await seed('employees', 'employee-b', { companyId: companyB, name: 'Employee B' });
    await seed('customers', customerA, { companyId: companyA, name: 'Customer A', phone: '0900000001' });
    await seed('customers', customerB, { companyId: companyA, name: 'Customer B', phone: '0900000002' });
    await seed('customer_accounts', accountA, { companyId: companyA, customerId: customerA });
    await seed('orders', 'order-a', { companyId: companyA, customerId: customerA, total: 100_000 });
    await seed('orders', 'order-b', { companyId: companyA, customerId: customerB, total: 200_000 });
    await seed('orders', 'order-company-b', { companyId: companyB, customerId: 'customer-company-b', total: 300_000 });
    await seed('products', 'product-a', {
      companyId: companyA,
      name: 'Product A',
      salePrice: 70_000,
      costPrice: 50_000
    });
    await seed('pricingInputs', 'pricing-a', { companyId: companyA, productId: 'product-a', costPrice: 50_000 });
    await seed('payments', 'payment-a', { companyId: companyA, customerId: customerA, amount: 100_000 });
    await seed('customer_points', 'points-a', { companyId: companyA, customerId: customerA, available_points: 100 });
    await seed('payrollSnapshots', 'payroll-a', {
      companyId: companyA,
      employeeId: 'employee-a',
      status: 'LOCKED'
    });
  });

  const employeeADb = testEnvironment.authenticatedContext('firebase-employee-a', {
    companyId: companyA,
    identityId: 'identity-employee-a',
    appUserId: 'employee-a',
    accountType: 'employee',
    role: 'super_admin'
  }).firestore();
  const employeeBDb = testEnvironment.authenticatedContext('firebase-employee-b', {
    companyId: companyB,
    identityId: 'identity-employee-b',
    appUserId: 'employee-b',
    accountType: 'employee',
    role: 'super_admin'
  }).firestore();
  const customerADb = testEnvironment.authenticatedContext('firebase-customer-a', {
    companyId: companyA,
    identityId: 'identity-customer-a',
    appUserId: accountA,
    customerId: customerA,
    accountType: 'customer',
    role: 'customer'
  }).firestore();
  const claimlessDb = testEnvironment.authenticatedContext('firebase-claimless', {}).firestore();
  const unauthenticatedDb = testEnvironment.unauthenticatedContext().firestore();

  await test('unauthenticated and claimless sessions cannot read application data', async () => {
    await assertFails(getDoc(doc(unauthenticatedDb, pathFor('customers', customerA))));
    await assertFails(getDoc(doc(claimlessDb, pathFor('customers', customerA))));
  });

  await test('employees can read their tenant but cannot read another tenant by document id', async () => {
    const ownOrder = await assertSucceeds(getDoc(doc(employeeADb, pathFor('orders', 'order-a'))));
    assert.equal(ownOrder.data().companyId, companyA);
    await assertFails(getDoc(doc(employeeADb, pathFor('orders', 'order-company-b'))));
    await assertFails(getDoc(doc(employeeBDb, pathFor('orders', 'order-a'))));
  });

  await test('employees cannot create documents for another tenant or without companyId', async () => {
    await assertFails(setDoc(doc(employeeADb, pathFor('customers', 'cross-company-create')), {
      id: 'cross-company-create',
      companyId: companyB,
      name: 'Cross tenant'
    }));
    await assertFails(setDoc(doc(employeeADb, pathFor('customers', 'missing-company-create')), {
      id: 'missing-company-create',
      name: 'Missing tenant'
    }));
  });

  await test('client identities cannot read or mutate server-only customer credentials', async () => {
    const accountRef = doc(employeeADb, pathFor('customer_accounts', accountA));
    await assertFails(getDoc(accountRef));
    await assertFails(getDocs(query(
      collection(employeeADb, `artifacts/${appId}/public/data/customer_accounts`),
      where('companyId', '==', companyA)
    )));
    await assertFails(setDoc(doc(employeeADb, pathFor('customer_accounts', 'employee-created-account')), {
      id: 'employee-created-account',
      companyId: companyA,
      customerId: customerA,
      password_hash: 'unsafe'
    }));
    await assertFails(updateDoc(accountRef, { status: 'blocked' }));
  });

  await test('tenant list queries require a company constraint', async () => {
    await assertFails(getDocs(collection(employeeADb, `artifacts/${appId}/public/data/orders`)));
    const ownOrders = await assertSucceeds(getDocs(query(
      collection(employeeADb, `artifacts/${appId}/public/data/orders`),
      where('companyId', '==', companyA)
    )));
    assert.equal(ownOrders.size, 2);
  });

  await test('tenant realtime listeners receive only their own company updates', async () => {
    const ordersRef = collection(employeeADb, `artifacts/${appId}/public/data/orders`);
    const ownOrdersQuery = query(ordersRef, where('companyId', '==', companyA));
    const initialSnapshot = await waitForRealtimeSnapshot(
      ownOrdersQuery,
      snapshot => snapshot.docs.some(item => item.id === 'order-a')
    );
    assert.ok(initialSnapshot.docs.every(item => item.data().companyId === companyA));

    const updatedSnapshotPromise = waitForRealtimeSnapshot(
      ownOrdersQuery,
      snapshot => snapshot.docs.some(item => item.id === 'order-a' && item.data().total === 110_000)
    );
    await testEnvironment.withSecurityRulesDisabled(async context => {
      await updateDoc(doc(context.firestore(), pathFor('orders', 'order-a')), { total: 110_000 });
    });
    const updatedSnapshot = await updatedSnapshotPromise;
    assert.ok(updatedSnapshot.docs.every(item => item.data().companyId === companyA));
    assert.equal(updatedSnapshot.docs.find(item => item.id === 'order-a')?.data().total, 110_000);
  });

  await test('customers can read and safely edit only their own profile', async () => {
    const ownProfileRef = doc(customerADb, pathFor('customers', customerA));
    const ownProfile = await assertSucceeds(getDoc(ownProfileRef));
    assert.equal(ownProfile.data().name, 'Customer A');
    await assertFails(getDoc(doc(customerADb, pathFor('customers', customerB))));
    await assertSucceeds(updateDoc(ownProfileRef, { address: 'Updated address' }));
    await assertFails(updateDoc(ownProfileRef, { companyId: companyB }));
  });

  await test('customers can read only their own orders', async () => {
    const ownOrder = await assertSucceeds(getDoc(doc(customerADb, pathFor('orders', 'order-a'))));
    assert.equal(ownOrder.data().customerId, customerA);
    await assertFails(getDoc(doc(customerADb, pathFor('orders', 'order-b'))));
    await assertFails(getDoc(doc(customerADb, pathFor('orders', 'order-company-b'))));
  });

  await test('customer list queries require both tenant and owner constraints', async () => {
    await assertFails(getDocs(query(
      collection(customerADb, `artifacts/${appId}/public/data/orders`),
      where('companyId', '==', companyA)
    )));
    const ownOrders = await assertSucceeds(getDocs(query(
      collection(customerADb, `artifacts/${appId}/public/data/orders`),
      where('companyId', '==', companyA),
      where('customerId', '==', customerA)
    )));
    assert.equal(ownOrders.size, 1);
  });

  await test('customers cannot read employee, payroll, or internal pricing records', async () => {
    await assertFails(getDoc(doc(customerADb, pathFor('employees', 'employee-a'))));
    await assertFails(getDoc(doc(customerADb, pathFor('payrollSnapshots', 'payroll-a'))));
    await assertFails(getDoc(doc(customerADb, pathFor('pricingInputs', 'pricing-a'))));
  });

  await test('customers cannot bypass the sanitized portal API to read raw catalog or account data', async () => {
    await assertFails(getDoc(doc(customerADb, pathFor('companies', companyA))));
    await assertFails(getDoc(doc(customerADb, pathFor('products', 'product-a'))));
    await assertFails(getDoc(doc(customerADb, pathFor('customer_accounts', accountA))));
  });

  await test('customers cannot create payments or mutate loyalty balances', async () => {
    await assertFails(setDoc(doc(customerADb, pathFor('payments', 'customer-created-payment')), {
      id: 'customer-created-payment',
      companyId: companyA,
      customerId: customerA,
      amount: 1_000
    }));
    await assertFails(updateDoc(doc(customerADb, pathFor('customer_points', 'points-a')), {
      available_points: 0
    }));
  });

  await test('customers can create only their own order requests', async () => {
    await assertSucceeds(setDoc(doc(customerADb, pathFor('orderRequests', 'request-own')), {
      id: 'request-own',
      companyId: companyA,
      customerId: customerA,
      items: []
    }));
    await assertFails(setDoc(doc(customerADb, pathFor('orderRequests', 'request-other')), {
      id: 'request-other',
      companyId: companyA,
      customerId: customerB,
      items: []
    }));
  });

  console.log(`Firestore tenant isolation rules: ${passed} tests passed.`);
} finally {
  await testEnvironment.cleanup();
}
