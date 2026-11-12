const normalizeText = (value) => `${value ?? ''}`.trim();

const asTimestamp = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'string' && value) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const isArchived = (item) => {
  const status = normalizeText(item?.status).toLowerCase();
  return Boolean(item?.isArchived) || ['archived', 'deleted', 'cancelled', 'canceled'].includes(status);
};

const categoryDefinitions = [
  { id: 'payment_reconciled', label: 'Đối soát', keywords: ['reconcile', 'reconciliation', 'doi soat', 'đối soát'] },
  { id: 'payment', label: 'Thanh toán', keywords: ['payment', 'payos', 'sepay', 'thanh toan', 'thanh toán'] },
  { id: 'order', label: 'Đơn hàng', keywords: ['order', 'don hang', 'đơn hàng', 'invoice', 'hoa don', 'hóa đơn'] },
  { id: 'debt', label: 'Công nợ', keywords: ['debt', 'cong no', 'công nợ', 'du no', 'dư nợ'] },
  { id: 'price', label: 'Báo giá', keywords: ['price', 'pricing', 'bao gia', 'báo giá'] },
  { id: 'delivery', label: 'Giao hàng', keywords: ['delivery', 'dispatch', 'giao hang', 'giao hàng'] },
  { id: 'system', label: 'Hệ thống', keywords: ['system', 'he thong', 'hệ thống'] }
];

const getItemPreview = (item) => normalizeText(
  item?.text
  || item?.message
  || item?.body
  || item?.note
  || item?.description
  || item?.title
  || 'Bạn có thông báo mới.'
);

const getNotificationCategory = (notification) => {
  const source = [
    notification?.category,
    notification?.type,
    notification?.event,
    notification?.title,
    notification?.message
  ].map(normalizeText).join(' ').toLowerCase();
  return categoryDefinitions.find(definition => definition.keywords.some(keyword => source.includes(keyword)))
    || categoryDefinitions.find(definition => definition.id === 'system');
};

export const getCustomerInboxItemTimestamp = (item = {}) => {
  const safeItem = item && typeof item === 'object' ? item : {};
  for (const candidate of [safeItem.createdAt, safeItem.createdAtMs, safeItem.updatedAt, safeItem.transactionAt, safeItem.date]) {
    const timestamp = asTimestamp(candidate);
    if (timestamp) return timestamp;
  }
  return 0;
};

export const isCustomerScopedMessage = (message, customerId) => {
  const trustedCustomerId = normalizeText(customerId);
  return Boolean(
    trustedCustomerId
    && message
    && !isArchived(message)
    && normalizeText(message.customerId) === trustedCustomerId
    && normalizeText(message.conversationType).toLowerCase() === 'customer_support'
  );
};

export const isCustomerScopedNotification = (notification, customerId) => {
  const trustedCustomerId = normalizeText(customerId);
  return Boolean(
    trustedCustomerId
    && notification
    && !isArchived(notification)
    && normalizeText(notification.customerId) === trustedCustomerId
    && normalizeText(notification.recipientType).toLowerCase() === 'customer'
  );
};

export const isCustomerInboxItemUnread = (item, customerId) => {
  const trustedCustomerId = normalizeText(customerId);
  if (item?.__inboxKind === 'message') {
    const sentByCustomer = normalizeText(item.senderType).toLowerCase() === 'customer'
      || normalizeText(item.senderCustomerId) === trustedCustomerId;
    return !sentByCustomer
      && normalizeText(item.customerReadById) !== trustedCustomerId
      && !item.customerReadAt;
  }

  return normalizeText(item.readStatus).toLowerCase() !== 'read'
    && normalizeText(item.readByCustomerId) !== trustedCustomerId;
};

export const buildCustomerInboxConversations = ({
  messages = [],
  notifications = [],
  customerId,
  responsibleConversationId = '',
  responsibleName = ''
} = {}) => {
  const trustedCustomerId = normalizeText(customerId);
  if (!trustedCustomerId) return [];

  const groups = new Map();
  const configuredConversationId = normalizeText(responsibleConversationId);
  const append = (key, conversation, item) => {
    const existing = groups.get(key) || { ...conversation, items: [] };
    existing.items.push(item);
    groups.set(key, existing);
  };

  // Keep the sales conversation available even before the first message arrives.
  if (configuredConversationId) {
    groups.set(`sales:${configuredConversationId}`, {
      id: `sales:${configuredConversationId}`,
      kind: 'sales_chat',
      label: responsibleName || 'Nhân viên phụ trách',
      items: []
    });
  }

  messages
    .filter(message => isCustomerScopedMessage(message, trustedCustomerId))
    .forEach(message => {
      const conversationId = normalizeText(message.conversationId) || configuredConversationId || 'customer_support';
      append(`sales:${conversationId}`, {
        id: `sales:${conversationId}`,
        kind: 'sales_chat',
        label: responsibleName || 'Nhân viên phụ trách'
      }, { ...message, __inboxKind: 'message' });
    });

  notifications
    .filter(notification => isCustomerScopedNotification(notification, trustedCustomerId))
    .forEach(notification => {
      const category = getNotificationCategory(notification);
      append(`notification:${category.id}`, {
        id: `notification:${category.id}`,
        kind: 'notification',
        label: category.label,
        category: category.id
      }, { ...notification, __inboxKind: 'notification' });
    });

  return Array.from(groups.values())
    .map(conversation => {
      const items = [...conversation.items].sort((left, right) => (
        getCustomerInboxItemTimestamp(left) - getCustomerInboxItemTimestamp(right)
      ));
      const latestItem = items[items.length - 1] || null;
      return {
        ...conversation,
        items,
        latestItem,
        latestTimestamp: getCustomerInboxItemTimestamp(latestItem),
        preview: latestItem
          ? getItemPreview(latestItem)
          : 'Bắt đầu trao đổi với nhân viên phụ trách.',
        unreadCount: items.filter(item => isCustomerInboxItemUnread(item, trustedCustomerId)).length
      };
    })
    .sort((left, right) => right.latestTimestamp - left.latestTimestamp);
};

export const getUnreadCustomerInboxItems = (conversation, customerId) => (
  Array.isArray(conversation?.items)
    ? conversation.items.filter(item => isCustomerInboxItemUnread(item, customerId))
    : []
);

export const createCustomerInboxReadPatch = (item, customerId, now = Date.now()) => {
  const trustedCustomerId = normalizeText(customerId);
  if (!trustedCustomerId || !item?.id) return null;

  if (item.__inboxKind === 'message' && isCustomerScopedMessage(item, trustedCustomerId)) {
    return {
      customerReadAt: now,
      customerReadById: trustedCustomerId,
      updatedAt: now
    };
  }

  if (item.__inboxKind === 'notification' && isCustomerScopedNotification(item, trustedCustomerId)) {
    return {
      readStatus: 'read',
      readAt: now,
      readByCustomerId: trustedCustomerId,
      updatedAt: now
    };
  }

  return null;
};
