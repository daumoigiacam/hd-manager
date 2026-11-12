const normalizeText = (value) => `${value ?? ''}`.trim();

export const getCustomerMessagingEmployeeId = (customer = {}) => (
  normalizeText(
    customer?.empId
    || customer?.assignedEmployeeId
    || customer?.salesEmpId
    || customer?.managerEmpId
    || customer?.employeeId
    || customer?.responsibleEmployeeId
  )
);

export const buildCustomerSupportConversationId = (customerId = '') => {
  const normalizedCustomerId = normalizeText(customerId);
  return normalizedCustomerId ? `customer_${normalizedCustomerId}` : '';
};

export const buildCustomerMessageRouting = (customer = {}) => {
  const customerId = normalizeText(customer?.id || customer?.customerId);
  const assignedEmployeeId = getCustomerMessagingEmployeeId(customer);
  return {
    customerId,
    assignedEmployeeId,
    assignmentState: assignedEmployeeId ? 'assigned' : 'unclassified',
    conversationId: buildCustomerSupportConversationId(customerId),
  };
};

export const isEmployeeScopedCustomerMessage = (
  message = {},
  { currentEmployeeId = '', customer = null, isManager = false } = {}
) => {
  if (normalizeText(message?.conversationType).toLowerCase() !== 'customer_support') return false;
  if (isManager) return true;
  const employeeId = normalizeText(currentEmployeeId);
  if (!employeeId) return false;
  // The customer profile is the source of truth during an assignment change.
  // This revokes the former employee immediately, before the Function has
  // finished backfilling historical message routing fields.
  const assignedEmployeeId = getCustomerMessagingEmployeeId(customer || {})
    || normalizeText(message?.assignedEmployeeId);
  return normalizeText(message?.assignmentState || 'assigned') === 'assigned'
    && assignedEmployeeId === employeeId;
};

export const buildEmployeeCustomerMessageNotification = (
  message = {},
  { currentEmployeeId = '', customer = null, isManager = false } = {}
) => {
  if (
    normalizeText(message?.senderType).toLowerCase() !== 'customer'
    || !isEmployeeScopedCustomerMessage(message, { currentEmployeeId, customer, isManager })
    || normalizeText(message?.employeeReadById) === normalizeText(currentEmployeeId)
    || message?.employeeReadAt
  ) {
    return null;
  }

  const customerName = normalizeText(customer?.name || message?.customerName) || 'Khach hang';
  const text = normalizeText(message?.text || message?.message) || 'Khach hang vua gui tin nhan.';
  return {
    id: `customer-message-${normalizeText(message?.id)}`,
    title: `Khach hang - ${customerName}`,
    message: text,
    createdAt: message?.createdAt || message?.updatedAt || Date.now(),
    tab: 'messages',
    tone: 'sky',
    customerId: normalizeText(message?.customerId),
    searchKeyword: customerName,
    sourceMessage: message,
  };
};
