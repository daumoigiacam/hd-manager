import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  buildCustomerMessageRouting,
  buildCustomerSupportConversationId,
  buildEmployeeCustomerMessageNotification,
  getCustomerMessagingEmployeeId,
  isEmployeeScopedCustomerMessage,
} from '../src/utils/employeeScopedCustomerMessaging.js';

const require = createRequire(import.meta.url);
const {
  buildCustomerMessageRouting: buildFunctionRouting,
  hasMatchingCustomerMessageRouting,
} = require('../functions/customerMessaging.js');

let passed = 0;
const test = (name, callback) => {
  callback();
  passed += 1;
  console.log(`PASS ${name}`);
};

const customerA = { id: 'customer-a', companyId: 'company-a', empId: 'employee-a' };
const customerB = { id: 'customer-b', companyId: 'company-a', empId: 'employee-b' };

test('primary customer empId determines the stable support thread', () => {
  const routing = buildCustomerMessageRouting({
    ...customerA,
    assignedEmployeeId: 'legacy-employee',
  });
  assert.equal(getCustomerMessagingEmployeeId({
    ...customerA,
    assignedEmployeeId: 'legacy-employee',
  }), 'employee-a');
  assert.equal(routing.assignedEmployeeId, 'employee-a');
  assert.equal(routing.conversationId, 'customer_customer-a');
  assert.equal(buildCustomerSupportConversationId('customer-a'), 'customer_customer-a');
});

test('employee A can receive and reply only to customer A', () => {
  const routing = buildCustomerMessageRouting(customerA);
  const customerMessage = {
    id: 'message-a',
    customerId: customerA.id,
    conversationType: 'customer_support',
    conversationId: routing.conversationId,
    assignmentState: routing.assignmentState,
    assignedEmployeeId: routing.assignedEmployeeId,
    senderType: 'customer',
    text: 'Can you confirm delivery?',
  };
  const employeeReply = {
    ...customerMessage,
    id: 'message-a-reply',
    senderType: 'employee',
    senderEmpId: 'employee-a',
    text: 'Confirmed.',
  };

  assert.equal(isEmployeeScopedCustomerMessage(customerMessage, {
    currentEmployeeId: 'employee-a', customer: customerA,
  }), true);
  assert.equal(isEmployeeScopedCustomerMessage(customerMessage, {
    currentEmployeeId: 'employee-b', customer: customerA,
  }), false);
  assert.equal(employeeReply.conversationId, customerMessage.conversationId);
  assert.equal(employeeReply.assignedEmployeeId, 'employee-a');
});

test('customer B remains invisible to employee A, including its notification badge', () => {
  const routing = buildCustomerMessageRouting(customerB);
  const customerMessage = {
    id: 'message-b',
    customerId: customerB.id,
    conversationType: 'customer_support',
    conversationId: routing.conversationId,
    assignmentState: routing.assignmentState,
    assignedEmployeeId: routing.assignedEmployeeId,
    senderType: 'customer',
    text: 'Message for B only',
  };

  assert.equal(isEmployeeScopedCustomerMessage(customerMessage, {
    currentEmployeeId: 'employee-a', customer: customerB,
  }), false);
  assert.equal(buildEmployeeCustomerMessageNotification(customerMessage, {
    currentEmployeeId: 'employee-a', customer: customerB,
  }), null);
  assert.equal(buildEmployeeCustomerMessageNotification(customerMessage, {
    currentEmployeeId: 'employee-b', customer: customerB,
  })?.id, 'customer-message-message-b');
});

test('reassignment keeps the thread and history while switching access to employee B', () => {
  const originalRouting = buildCustomerMessageRouting(customerA);
  const reassignedCustomer = { ...customerA, empId: 'employee-b' };
  const reassignedRouting = buildCustomerMessageRouting(reassignedCustomer);
  const functionRouting = buildFunctionRouting(reassignedCustomer, customerA.id);
  const historicalMessage = {
    conversationId: originalRouting.conversationId,
    assignmentState: 'assigned',
    assignedEmployeeId: 'employee-a',
    receiverEmpId: 'employee-a',
    recipientEmpId: 'employee-a',
    targetEmpId: 'employee-a',
  };

  assert.equal(reassignedRouting.conversationId, originalRouting.conversationId);
  assert.equal(reassignedRouting.assignedEmployeeId, 'employee-b');
  assert.equal(isEmployeeScopedCustomerMessage({
    ...historicalMessage,
    conversationType: 'customer_support',
  }, { currentEmployeeId: 'employee-a', customer: reassignedCustomer }), false);
  assert.equal(isEmployeeScopedCustomerMessage({
    ...historicalMessage,
    conversationType: 'customer_support',
    assignedEmployeeId: 'employee-b',
  }, { currentEmployeeId: 'employee-b', customer: reassignedCustomer }), true);
  assert.equal(hasMatchingCustomerMessageRouting(historicalMessage, functionRouting), false);
  assert.equal(hasMatchingCustomerMessageRouting({
    ...historicalMessage,
    assignedEmployeeId: 'employee-b',
    receiverEmpId: 'employee-b',
    recipientEmpId: 'employee-b',
    targetEmpId: 'employee-b',
  }, functionRouting), true);
});

test('unclassified customer messages do not assign themselves to an employee', () => {
  const routing = buildCustomerMessageRouting({ id: 'customer-unclassified', companyId: 'company-a' });
  const message = {
    id: 'message-unclassified',
    customerId: routing.customerId,
    conversationType: 'customer_support',
    conversationId: routing.conversationId,
    assignmentState: routing.assignmentState,
    senderType: 'customer',
    text: 'Please classify this conversation.',
  };

  assert.equal(routing.assignmentState, 'unclassified');
  assert.equal(routing.assignedEmployeeId, '');
  assert.equal(isEmployeeScopedCustomerMessage(message, {
    currentEmployeeId: 'employee-a', customer: {},
  }), false);
  assert.equal(isEmployeeScopedCustomerMessage(message, {
    currentEmployeeId: 'manager-a', customer: {}, isManager: true,
  }), true);
});

console.log(`Employee-scoped customer messaging: ${passed} tests passed.`);
