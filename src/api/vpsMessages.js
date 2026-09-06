const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MESSAGE_MODULE = 'HD_MANAGER_MESSAGING';

const text = (value) => `${value ?? ''}`.trim();
const isUuid = (value) => UUID_PATTERN.test(text(value));
const uniqueText = (values = []) => [...new Set(values.map(text).filter(Boolean))];

const required = (value, code, message) => {
  const normalized = text(value);
  if (!normalized) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
  return normalized;
};

const metadata = (notification = {}) => (
  notification?.data && typeof notification.data === 'object' && !Array.isArray(notification.data)
    ? notification.data
    : {}
);

const timestamp = (value) => {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
};

export const normalizeVpsMessage = (notification = {}) => {
  const data = metadata(notification);
  const senderUserId = text(data.senderUserId);
  const recipientUserId = text(data.recipientUserId);

  return {
    ...data,
    id: notification.id,
    companyId: notification.companyId,
    conversationId: text(data.conversationId) || `vps-message:${notification.id}`,
    conversationType: text(data.conversationType) || 'internal',
    text: notification.body || '',
    message: notification.body || '',
    senderUserId,
    recipientUserId,
    senderEmpId: text(data.senderEmpId),
    receiverEmpId: text(data.receiverEmpId),
    senderName: text(data.senderName),
    type: text(data.type) || 'employee_to_employee',
    source: 'hd-connect-vps',
    status: notification.status || 'queued',
    createdAt: notification.createdAt || '',
    updatedAt: notification.updatedAt || notification.createdAt || '',
    isArchived: Boolean(notification.deletedAt),
    vpsMessage: true,
  };
};

export async function loadVpsMessages(api, session, { cancelled = () => false } = {}) {
  const companyId = required(session?.companyId, 'VPS_MESSAGE_TENANT_REQUIRED', 'VPS tenant context is required.');
  const result = await api.listNotifications({
    module: MESSAGE_MODULE,
    page: 1,
    limit: 500,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
  const items = Array.isArray(result?.items) ? result.items : [];
  if (cancelled()) return { items: [] };

  return {
    items: items
      .map(normalizeVpsMessage)
      .filter((message) => message.companyId === companyId)
      .sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt)),
  };
}

export async function saveVpsMessage(api, session, record = {}) {
  const companyId = required(session?.companyId, 'VPS_MESSAGE_TENANT_REQUIRED', 'VPS tenant context is required.');
  const senderUserId = required(session?.id, 'VPS_MESSAGE_SENDER_REQUIRED', 'A signed-in sender is required.');
  const recipientUserIds = uniqueText([
    ...(Array.isArray(record.recipientUserIds) ? record.recipientUserIds : []),
    record.recipientUserId,
    record.receiverUserId,
  ]);
  if (recipientUserIds.length === 0) {
    const error = new Error('The target employee must have a mapped VPS user before a message can be sent.');
    error.code = 'VPS_MESSAGE_RECIPIENT_MAPPING_REQUIRED';
    throw error;
  }
  if (recipientUserIds.some((recipientUserId) => !isUuid(recipientUserId))) {
    const error = new Error('The target employee has no valid VPS user mapping.');
    error.code = 'VPS_MESSAGE_RECIPIENT_MAPPING_REQUIRED';
    throw error;
  }
  const body = required(record.text || record.message, 'VPS_MESSAGE_TEXT_REQUIRED', 'Message text is required.');
  if (body.length > 10_000) {
    const error = new Error('Message text is too long.');
    error.code = 'VPS_MESSAGE_TEXT_TOO_LONG';
    throw error;
  }
  const clientMutationId = required(
    record.clientMutationId || record.idempotencyKey || record.id,
    'VPS_MESSAGE_IDEMPOTENCY_REQUIRED',
    'A stable client mutation id is required.',
  );
  const channel = text(record.channel || 'IN_APP').toUpperCase();
  if (channel !== 'IN_APP') {
    const error = new Error('External Zalo delivery requires a configured provider contract.');
    error.code = 'ZALO_PROVIDER_APPROVAL_REQUIRED';
    throw error;
  }

  const notification = await api.sendNotification({
    title: text(record.title) || 'Tin nhan noi bo',
    body,
    channels: ['IN_APP'],
    recipientUserIds: uniqueText([senderUserId, ...recipientUserIds]),
    module: MESSAGE_MODULE,
    eventName: 'StaffMessageSent',
    eventId: clientMutationId.slice(0, 160),
    idempotencyKey: `hdm-message:${clientMutationId}`.slice(0, 180),
    correlationId: clientMutationId.slice(0, 180),
    data: {
      conversationId: text(record.conversationId),
      conversationType: text(record.conversationType) || 'internal',
      customerId: text(record.customerId),
      senderUserId,
      recipientUserId: recipientUserIds[0],
      recipientUserIds,
      senderEmpId: text(record.senderEmpId),
      receiverEmpId: text(record.receiverEmpId),
      receiverEmpIds: uniqueText([
        ...(Array.isArray(record.receiverEmpIds) ? record.receiverEmpIds : []),
        record.receiverEmpId,
      ]),
      participantEmpIds: uniqueText(
        Array.isArray(record.participantEmpIds) ? record.participantEmpIds : [],
      ),
      senderName: text(record.senderName),
      type: text(record.type) || 'employee_to_employee',
      sourceRecordId: text(record.sourceRecordId || clientMutationId),
    },
  });

  const saved = normalizeVpsMessage(notification);
  if (saved.companyId !== companyId) {
    const error = new Error('The VPS notification response belongs to a different tenant.');
    error.code = 'VPS_MESSAGE_TENANT_MISMATCH';
    throw error;
  }
  return saved;
}

export const vpsMessageModule = MESSAGE_MODULE;
