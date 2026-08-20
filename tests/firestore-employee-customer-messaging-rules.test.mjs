import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';

const projectId = 'hd-manager-employee-customer-messaging-rules-test';
const appId = 'test-app';
const companyId = 'company-a';
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

const pathFor = (collectionName, id) => (
  `artifacts/${appId}/public/data/${collectionName}/${id}`
);

const environment = await initializeTestEnvironment({
  projectId,
  firestore: { rules },
});

let passed = 0;
const test = async (name, callback) => {
  await callback();
  passed += 1;
  console.log(`PASS ${name}`);
};

const employeeContext = (employeeId, role = 'sales') => environment.authenticatedContext(
  `firebase-${employeeId}`,
  {
    companyId,
    identityId: `identity-${employeeId}`,
    appUserId: employeeId,
    accountType: 'employee',
    role,
  },
).firestore();

const customerContext = (customerId) => environment.authenticatedContext(
  `firebase-${customerId}`,
  {
    companyId,
    identityId: `identity-${customerId}`,
    appUserId: `account-${customerId}`,
    customerId,
    accountType: 'customer',
    role: 'customer',
  },
).firestore();

const scopedMessage = ({ id, customerId, employeeId, senderType = 'customer', text = 'Xin chao' }) => ({
  id,
  companyId,
  customerId,
  conversationType: 'customer_support',
  conversationId: `customer_${customerId}`,
  assignmentState: 'assigned',
  assignedEmployeeId: employeeId,
  receiverEmpId: employeeId,
  recipientEmpId: employeeId,
  targetEmpId: employeeId,
  senderType,
  senderEmpId: senderType === 'employee' ? employeeId : '',
  senderCustomerId: senderType === 'customer' ? customerId : '',
  text,
  createdAt: 100,
});

try {
  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    const seed = (collectionName, id, data) => setDoc(
      doc(database, pathFor(collectionName, id)),
      { id, ...data },
    );

    await Promise.all([
      seed('employees', 'employee-a', { companyId, position: 'Kinh doanh', role: 'sales' }),
      seed('employees', 'employee-b', { companyId, position: 'Kinh doanh', role: 'sales' }),
      seed('employees', 'manager-a', { companyId, position: 'Quản lý', role: 'manager' }),
      seed('customers', 'customer-a', { companyId, empId: 'employee-a', name: 'Customer A' }),
      seed('customers', 'customer-b', { companyId, empId: 'employee-b', name: 'Customer B' }),
      seed('customers', 'customer-unclassified', { companyId, name: 'Unclassified customer' }),
      seed('messages', 'message-a', scopedMessage({
        id: 'message-a', customerId: 'customer-a', employeeId: 'employee-a', text: 'A only',
      })),
      seed('messages', 'message-b', scopedMessage({
        id: 'message-b', customerId: 'customer-b', employeeId: 'employee-b', text: 'B only',
      })),
      seed('messages', 'message-unclassified', {
        id: 'message-unclassified',
        companyId,
        customerId: 'customer-unclassified',
        conversationType: 'customer_support',
        conversationId: 'customer_customer-unclassified',
        assignmentState: 'unclassified',
        senderType: 'customer',
        senderCustomerId: 'customer-unclassified',
        text: 'Management queue only',
        createdAt: 102,
      }),
      seed('messages', 'message-internal', {
        id: 'message-internal',
        companyId,
        conversationType: 'internal',
        conversationId: 'internal-employee-a-employee-b',
        senderType: 'employee',
        senderEmpId: 'employee-a',
        text: 'Internal message',
        createdAt: 103,
      }),
    ]);
  });

  const employeeA = employeeContext('employee-a');
  const employeeB = employeeContext('employee-b');
  const manager = employeeContext('manager-a', 'manager');
  const customerA = customerContext('customer-a');
  const messagesA = collection(employeeA, `artifacts/${appId}/public/data/messages`);

  await test('employee A can read customer A message by direct document access', async () => {
    const message = await assertSucceeds(getDoc(doc(employeeA, pathFor('messages', 'message-a'))));
    assert.equal(message.data().assignedEmployeeId, 'employee-a');
  });

  await test('employee A list query only returns customer A messages assigned to employee A', async () => {
    const snapshot = await assertSucceeds(getDocs(query(
      messagesA,
      where('companyId', '==', companyId),
      where('conversationType', '==', 'customer_support'),
      where('assignedEmployeeId', '==', 'employee-a'),
      where('assignmentState', '==', 'assigned'),
    )));
    assert.deepEqual(snapshot.docs.map((item) => item.id), ['message-a']);
  });

  await test('employee B cannot read employee A customer message by direct document access', async () => {
    await assertFails(getDoc(doc(employeeB, pathFor('messages', 'message-a'))));
    await assertFails(getDocs(query(
      collection(employeeB, `artifacts/${appId}/public/data/messages`),
      where('companyId', '==', companyId),
      where('conversationType', '==', 'customer_support'),
      where('assignedEmployeeId', '==', 'employee-a'),
      where('assignmentState', '==', 'assigned'),
    )));
  });

  await test('employee A can reply in the same customer thread and customer A can read it', async () => {
    const replyRef = doc(employeeA, pathFor('messages', 'message-a-reply'));
    await assertSucceeds(setDoc(replyRef, {
      ...scopedMessage({
        id: 'message-a-reply',
        customerId: 'customer-a',
        employeeId: 'employee-a',
        senderType: 'employee',
        text: 'Da nhan tin.',
      }),
      source: 'employee_console',
      type: 'employee_to_customer',
    }));
    const reply = await assertSucceeds(getDoc(doc(customerA, pathFor('messages', 'message-a-reply'))));
    assert.equal(reply.data().conversationId, 'customer_customer-a');
  });

  await test('manager can read every assigned and unclassified customer conversation', async () => {
    const managerMessages = collection(manager, `artifacts/${appId}/public/data/messages`);
    const assigned = await assertSucceeds(getDoc(doc(manager, pathFor('messages', 'message-a'))));
    const unclassified = await assertSucceeds(getDoc(doc(manager, pathFor('messages', 'message-unclassified'))));
    assert.equal(assigned.data().customerId, 'customer-a');
    assert.equal(unclassified.data().assignmentState, 'unclassified');
    const snapshot = await assertSucceeds(getDocs(query(
      managerMessages,
      where('companyId', '==', companyId),
      where('conversationType', '==', 'customer_support'),
    )));
    assert.equal(snapshot.docs.length, 4);
  });

  await test('unclassified customer message stays out of normal employee access', async () => {
    await assertFails(getDoc(doc(employeeA, pathFor('messages', 'message-unclassified'))));
  });

  await test('reassignment revokes employee A and grants employee B access without changing the thread', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      const database = context.firestore();
      await setDoc(doc(database, pathFor('customers', 'customer-a')), {
        id: 'customer-a',
        companyId,
        empId: 'employee-b',
        name: 'Customer A',
      });
      await setDoc(doc(database, pathFor('messages', 'message-a')), scopedMessage({
        id: 'message-a', customerId: 'customer-a', employeeId: 'employee-b', text: 'A history',
      }));
    });

    await assertFails(getDoc(doc(employeeA, pathFor('messages', 'message-a'))));
    const transferred = await assertSucceeds(getDoc(doc(employeeB, pathFor('messages', 'message-a'))));
    assert.equal(transferred.data().conversationId, 'customer_customer-a');
    assert.equal(transferred.data().assignedEmployeeId, 'employee-b');
  });

  await test('employees retain access to internal messages through a separate scoped query', async () => {
    const snapshot = await assertSucceeds(getDocs(query(
      messagesA,
      where('companyId', '==', companyId),
      where('conversationType', 'in', ['internal', 'internal_group', 'support']),
    )));
    assert.deepEqual(snapshot.docs.map((item) => item.id), ['message-internal']);
  });

  console.log(`Firestore employee customer messaging rules: ${passed} tests passed.`);
} finally {
  await environment.cleanup();
}
