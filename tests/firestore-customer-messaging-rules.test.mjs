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

const projectId = 'hd-manager-customer-messaging-rules-test';
const appId = 'test-app';
const companyId = 'company-a';
const customerA = 'customer-a';
const customerB = 'customer-b';
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

const pathFor = (collectionName, id) => (
  `artifacts/${appId}/public/data/${collectionName}/${id}`
);

const environment = await initializeTestEnvironment({
  projectId,
  firestore: { rules }
});

let passed = 0;
const test = async (name, callback) => {
  await callback();
  passed += 1;
  console.log(`PASS ${name}`);
};

const customerContext = (customerId) => environment.authenticatedContext(`firebase-${customerId}`, {
  companyId,
  identityId: `identity-${customerId}`,
  appUserId: `account-${customerId}`,
  customerId,
  accountType: 'customer',
  role: 'customer'
}).firestore();

const waitForSnapshot = (queryRef, predicate, timeoutMs = 5_000) => new Promise((resolve, reject) => {
  let unsubscribe = () => {};
  const timeout = setTimeout(() => {
    unsubscribe();
    reject(new Error('Timed out waiting for a customer inbox realtime snapshot.'));
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
  await environment.withSecurityRulesDisabled(async context => {
    const database = context.firestore();
    const seed = (collectionName, id, data) => setDoc(
      doc(database, pathFor(collectionName, id)),
      { id, ...data }
    );

    await Promise.all([
      seed('notifications', 'notice-a', {
        companyId,
        customerId: customerA,
        recipientType: 'customer',
        category: 'payment',
        title: 'Payment received',
        readStatus: 'unread',
        createdAt: 100
      }),
      seed('notifications', 'notice-b', {
        companyId,
        customerId: customerB,
        recipientType: 'customer',
        category: 'payment',
        title: 'Customer B only',
        readStatus: 'unread',
        createdAt: 110
      }),
      seed('notifications', 'notice-internal', {
        companyId,
        customerId: customerA,
        recipientType: 'employee',
        category: 'system',
        title: 'Internal only',
        createdAt: 120
      }),
      seed('notifications', 'notice-generic', {
        companyId,
        recipientType: 'customer',
        audience: 'all',
        category: 'system',
        title: 'Generic notification',
        createdAt: 130
      }),
      seed('messages', 'message-a', {
        companyId,
        customerId: customerA,
        conversationType: 'customer_support',
        conversationId: 'support-a',
        senderType: 'employee',
        senderEmpId: 'employee-a',
        text: 'Message for customer A',
        createdAt: 200
      }),
      seed('messages', 'message-b', {
        companyId,
        customerId: customerB,
        conversationType: 'customer_support',
        conversationId: 'support-b',
        senderType: 'employee',
        senderEmpId: 'employee-a',
        text: 'Message for customer B',
        createdAt: 210
      }),
      seed('messages', 'message-internal', {
        companyId,
        customerId: customerA,
        conversationType: 'internal_group',
        senderType: 'employee',
        senderEmpId: 'employee-a',
        text: 'Internal company message',
        createdAt: 220
      })
    ]);
  });

  const customerADb = customerContext(customerA);
  const customerBDb = customerContext(customerB);
  const notificationCollectionA = collection(customerADb, `artifacts/${appId}/public/data/notifications`);
  const messageCollectionA = collection(customerADb, `artifacts/${appId}/public/data/messages`);
  const ownNotificationQuery = query(
    notificationCollectionA,
    where('companyId', '==', companyId),
    where('customerId', '==', customerA),
    where('recipientType', '==', 'customer')
  );
  const ownMessageQuery = query(
    messageCollectionA,
    where('companyId', '==', companyId),
    where('customerId', '==', customerA),
    where('conversationType', '==', 'customer_support')
  );

  await test('customer A can read only its own scoped inbox documents', async () => {
    const notification = await assertSucceeds(getDoc(doc(customerADb, pathFor('notifications', 'notice-a'))));
    const message = await assertSucceeds(getDoc(doc(customerADb, pathFor('messages', 'message-a'))));
    assert.equal(notification.data().customerId, customerA);
    assert.equal(message.data().customerId, customerA);
    await assertFails(getDoc(doc(customerADb, pathFor('notifications', 'notice-b'))));
    await assertFails(getDoc(doc(customerADb, pathFor('messages', 'message-b'))));
    await assertFails(getDoc(doc(customerADb, pathFor('notifications', 'notice-internal'))));
    await assertFails(getDoc(doc(customerADb, pathFor('messages', 'message-internal'))));
    await assertFails(getDoc(doc(customerADb, pathFor('notifications', 'notice-generic'))));
  });

  await test('customer inbox queries require tenant, customer, and inbox type constraints', async () => {
    const notifications = await assertSucceeds(getDocs(ownNotificationQuery));
    const messages = await assertSucceeds(getDocs(ownMessageQuery));
    assert.deepEqual(notifications.docs.map(item => item.id), ['notice-a']);
    assert.deepEqual(messages.docs.map(item => item.id), ['message-a']);

    await assertFails(getDocs(query(
      notificationCollectionA,
      where('companyId', '==', companyId),
      where('customerId', '==', customerA)
    )));
    await assertFails(getDocs(query(
      messageCollectionA,
      where('companyId', '==', companyId),
      where('customerId', '==', customerA)
    )));
  });

  await test('customer A can send only its own customer-support message', async () => {
    const ownMessageRef = doc(customerADb, pathFor('messages', 'message-a-created'));
    await assertSucceeds(setDoc(ownMessageRef, {
      id: 'message-a-created',
      companyId,
      customerId: customerA,
      conversationType: 'customer_support',
      conversationId: 'support-a',
      senderType: 'customer',
      senderCustomerId: customerA,
      source: 'customer_portal',
      type: 'customer_to_employee',
      text: 'Please call me back.',
      createdAt: 300
    }));

    await assertFails(setDoc(doc(customerADb, pathFor('messages', 'message-b-forged')), {
      id: 'message-b-forged',
      companyId,
      customerId: customerB,
      conversationType: 'customer_support',
      conversationId: 'support-b',
      senderType: 'customer',
      senderCustomerId: customerB,
      source: 'customer_portal',
      type: 'customer_to_employee',
      text: 'Forged message.',
      createdAt: 301
    }));
    await assertFails(setDoc(doc(customerADb, pathFor('notifications', 'notice-a-forged')), {
      id: 'notice-a-forged',
      companyId,
      customerId: customerA,
      recipientType: 'customer',
      title: 'Forged notification'
    }));
  });

  await test('customers can mark only their own inbox items as read', async () => {
    await assertSucceeds(updateDoc(doc(customerADb, pathFor('notifications', 'notice-a')), {
      readStatus: 'read',
      readByCustomerId: customerA,
      readAt: 400,
      updatedAt: 400
    }));
    await assertSucceeds(updateDoc(doc(customerADb, pathFor('messages', 'message-a')), {
      customerReadById: customerA,
      customerReadAt: 401,
      updatedAt: 401
    }));
    await assertFails(updateDoc(doc(customerADb, pathFor('notifications', 'notice-a')), {
      title: 'Attempted rewrite'
    }));
    await assertFails(updateDoc(doc(customerADb, pathFor('messages', 'message-a')), {
      text: 'Attempted rewrite'
    }));
    await assertFails(updateDoc(doc(customerADb, pathFor('notifications', 'notice-b')), {
      readStatus: 'read',
      readByCustomerId: customerA,
      readAt: 402,
      updatedAt: 402
    }));
  });

  await test('customer A realtime inbox listener receives only A updates', async () => {
    const initialSnapshot = await waitForSnapshot(
      ownNotificationQuery,
      snapshot => snapshot.docs.some(item => item.id === 'notice-a')
    );
    assert.ok(initialSnapshot.docs.every(item => item.data().customerId === customerA));

    const updatePromise = waitForSnapshot(
      ownNotificationQuery,
      snapshot => snapshot.docs.some(item => item.id === 'notice-a-realtime')
    );
    await environment.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), pathFor('notifications', 'notice-a-realtime')), {
        id: 'notice-a-realtime',
        companyId,
        customerId: customerA,
        recipientType: 'customer',
        category: 'order',
        title: 'Realtime for A',
        createdAt: 500
      });
      await setDoc(doc(context.firestore(), pathFor('notifications', 'notice-b-realtime')), {
        id: 'notice-b-realtime',
        companyId,
        customerId: customerB,
        recipientType: 'customer',
        category: 'order',
        title: 'Realtime for B',
        createdAt: 501
      });
    });
    const updatedSnapshot = await updatePromise;
    assert.ok(updatedSnapshot.docs.some(item => item.id === 'notice-a-realtime'));
    assert.equal(updatedSnapshot.docs.some(item => item.id === 'notice-b-realtime'), false);
  });

  await test('customer B remains isolated from customer A', async () => {
    await assertFails(getDoc(doc(customerBDb, pathFor('messages', 'message-a'))));
    const ownCustomerBMessages = await assertSucceeds(getDocs(query(
      collection(customerBDb, `artifacts/${appId}/public/data/messages`),
      where('companyId', '==', companyId),
      where('customerId', '==', customerB),
      where('conversationType', '==', 'customer_support')
    )));
    assert.ok(ownCustomerBMessages.docs.every(item => item.data().customerId === customerB));
  });

  console.log(`Firestore customer messaging rules: ${passed} tests passed.`);
} finally {
  await environment.cleanup();
}
