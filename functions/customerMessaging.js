const normalizeText = (value) => `${value ?? ''}`.trim();

const CUSTOMER_ASSIGNMENT_FIELDS = [
  'empId',
  'assignedEmployeeId',
  'salesEmpId',
  'managerEmpId',
  'employeeId',
  'responsibleEmployeeId',
];

const getCustomerMessagingEmployeeId = (customer = {}) => {
  for (const fieldName of CUSTOMER_ASSIGNMENT_FIELDS) {
    const employeeId = normalizeText(customer?.[fieldName]);
    if (employeeId) return employeeId;
  }
  return '';
};

const buildCustomerSupportConversationId = (customerId = '') => {
  const normalizedCustomerId = normalizeText(customerId);
  return normalizedCustomerId ? `customer_${normalizedCustomerId}` : '';
};

const buildCustomerMessageRouting = (customer = {}, customerId = '') => {
  const resolvedCustomerId = normalizeText(customer?.id || customer?.customerId || customerId);
  const assignedEmployeeId = getCustomerMessagingEmployeeId(customer);
  return {
    customerId: resolvedCustomerId,
    assignedEmployeeId,
    assignmentState: assignedEmployeeId ? 'assigned' : 'unclassified',
    conversationId: buildCustomerSupportConversationId(resolvedCustomerId),
  };
};

const hasMatchingCustomerMessageRouting = (message = {}, routing = {}) => {
  const assignedEmployeeId = normalizeText(routing.assignedEmployeeId);
  const hasMatchingAssignment = assignedEmployeeId
    ? (
      normalizeText(message.assignedEmployeeId) === assignedEmployeeId
      && normalizeText(message.receiverEmpId) === assignedEmployeeId
      && normalizeText(message.recipientEmpId) === assignedEmployeeId
      && normalizeText(message.targetEmpId) === assignedEmployeeId
    )
    : ![
      message.assignedEmployeeId,
      message.receiverEmpId,
      message.recipientEmpId,
      message.targetEmpId,
    ].some(value => normalizeText(value));

  return normalizeText(message.conversationId) === normalizeText(routing.conversationId)
    && normalizeText(message.assignmentState) === normalizeText(routing.assignmentState)
    && hasMatchingAssignment;
};

module.exports = {
  CUSTOMER_ASSIGNMENT_FIELDS,
  buildCustomerMessageRouting,
  buildCustomerSupportConversationId,
  getCustomerMessagingEmployeeId,
  hasMatchingCustomerMessageRouting,
  normalizeText,
};
