import assert from 'node:assert/strict';

import {
  buildCustomerInboxConversations,
  createCustomerInboxReadPatch,
  getUnreadCustomerInboxItems,
  isCustomerScopedMessage,
  isCustomerScopedNotification
} from '../src/utils/customerMessaging.js';
import {
  dedupePaymentNotifications,
  isEmployeeNotificationVisible
} from '../src/utils/notificationVisibility.js';

const customerA = 'customer-a';
const customerB = 'customer-b';

const messages = [
  {
    id: 'message-a',
    companyId: 'company-a',
    customerId: customerA,
    conversationId: 'support-a',
    conversationType: 'customer_support',
    senderType: 'employee',
    text: 'Anh kiểm tra giúp em đơn hôm nay nhé.',
    createdAt: 20
  },
  {
    id: 'message-b',
    companyId: 'company-a',
    customerId: customerB,
    conversationId: 'support-b',
    conversationType: 'customer_support',
    senderType: 'employee',
    text: 'Tin của khách B.',
    createdAt: 30
  },
  {
    id: 'message-internal',
    companyId: 'company-a',
    customerId: customerA,
    conversationType: 'internal_group',
    senderType: 'employee',
    text: 'Tin nội bộ.',
    createdAt: 40
  }
];

const notifications = [
  {
    id: 'notice-payment-a',
    companyId: 'company-a',
    customerId: customerA,
    recipientType: 'customer',
    category: 'payment',
    title: 'Đã ghi nhận thanh toán',
    message: 'Đã ghi nhận thanh toán 5.000.000đ.',
    readStatus: 'unread',
    createdAt: 50
  },
  {
    id: 'notice-order-a',
    companyId: 'company-a',
    customerId: customerA,
    recipientType: 'customer',
    category: 'order',
    title: 'Đơn hàng đã xác nhận',
    readStatus: 'read',
    createdAt: 60
  },
  {
    id: 'notice-b',
    companyId: 'company-a',
    customerId: customerB,
    recipientType: 'customer',
    category: 'payment',
    title: 'Tin của khách B',
    createdAt: 70
  },
  {
    id: 'notice-internal',
    companyId: 'company-a',
    customerId: customerA,
    recipientType: 'company',
    category: 'system',
    title: 'Tin nội bộ',
    createdAt: 80
  }
];

assert.equal(isCustomerScopedMessage(messages[0], customerA), true);
assert.equal(isCustomerScopedMessage(messages[1], customerA), false);
assert.equal(isCustomerScopedMessage(messages[2], customerA), false);
assert.equal(isCustomerScopedNotification(notifications[0], customerA), true);
assert.equal(isCustomerScopedNotification(notifications[2], customerA), false);
assert.equal(isCustomerScopedNotification(notifications[3], customerA), false);
assert.equal(isCustomerScopedNotification({
  companyId: 'company-a',
  audience: 'all',
  category: 'system'
}, customerA), false);

const companyPaymentNotice = {
  id: 'sepay-company-payment-1',
  recipientType: 'company',
  audience: 'company',
  paymentId: 'payment-1'
};
const customerPaymentNotice = {
  id: 'sepay-customer-payment-1',
  recipientType: 'customer',
  targetCustomerId: customerA,
  paymentId: 'payment-1'
};
assert.equal(isEmployeeNotificationVisible(companyPaymentNotice, { isOwnerAccount: true }), true);
assert.equal(isEmployeeNotificationVisible(customerPaymentNotice, { isOwnerAccount: true }), false);
assert.deepEqual(
  dedupePaymentNotifications([
    companyPaymentNotice,
    { ...companyPaymentNotice, id: 'duplicate-company-payment-1' },
    { id: 'sepay-company-payment-2', recipientType: 'company', paymentId: 'payment-2' }
  ]).map(notice => notice.id),
  ['sepay-company-payment-1', 'sepay-company-payment-2']
);

const conversations = buildCustomerInboxConversations({
  messages,
  notifications,
  customerId: customerA,
  responsibleConversationId: 'support-a',
  responsibleName: 'Nhân viên kinh doanh'
});

assert.deepEqual(conversations.map(conversation => conversation.id), [
  'notification:order',
  'notification:payment',
  'sales:support-a'
]);
assert.equal(conversations.reduce((total, conversation) => total + conversation.unreadCount, 0), 2);
assert.equal(conversations.some(conversation => conversation.preview.includes('khách B')), false);

const paymentConversation = conversations.find(conversation => conversation.id === 'notification:payment');
const unreadPaymentItems = getUnreadCustomerInboxItems(paymentConversation, customerA);
assert.equal(unreadPaymentItems.length, 1);
assert.deepEqual(createCustomerInboxReadPatch(unreadPaymentItems[0], customerA, 100), {
  readStatus: 'read',
  readAt: 100,
  readByCustomerId: customerA,
  updatedAt: 100
});

const salesConversation = conversations.find(conversation => conversation.id === 'sales:support-a');
const unreadSalesItems = getUnreadCustomerInboxItems(salesConversation, customerA);
assert.equal(unreadSalesItems.length, 1);
assert.deepEqual(createCustomerInboxReadPatch(unreadSalesItems[0], customerA, 200), {
  customerReadAt: 200,
  customerReadById: customerA,
  updatedAt: 200
});

const emptySalesConversation = buildCustomerInboxConversations({
  customerId: customerA,
  responsibleConversationId: 'support-empty',
  responsibleName: 'Nhân viên kinh doanh'
});
assert.equal(emptySalesConversation.length, 1);
assert.equal(emptySalesConversation[0].id, 'sales:support-empty');
assert.equal(emptySalesConversation[0].items.length, 0);
assert.equal(emptySalesConversation[0].unreadCount, 0);
assert.equal(emptySalesConversation[0].preview, 'Bắt đầu trao đổi với nhân viên phụ trách.');

console.log('Customer messaging isolation and read-state tests: PASS');
