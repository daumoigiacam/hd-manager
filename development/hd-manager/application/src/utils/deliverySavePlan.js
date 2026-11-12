export function createDeliverySavePlan(commandId) {
  if (!/^[A-Za-z0-9_-]+$/.test(commandId || '')) throw new Error('Invalid delivery command');
  const operations = [];
  const add = (type, payload, prefix) => {
    const id = payload.id || `${prefix}_${commandId}_${operations.length}`;
    operations.push({ type, payload: { ...payload, id, clientMutationId: id } });
    return id;
  };
  const edit = (type, id, payload) => {
    operations.push({ type, id, payload });
    return { success: true, planned: true };
  };
  return {
    commandId, operations,
    addReport: payload => add('addReport', payload, 'dr'),
    editReport: (id, payload) => edit('editReport', id, payload),
    editOrder: (id, payload) => edit('editOrder', id, payload),
    addPayment: payload => add('addPayment', { ...payload, id: payload.clientMutationId }, 'p'),
    addExpense: payload => add('addExpense', payload, 'exp'),
    editExpense: (id, payload) => edit('editExpense', id, payload),
    addCost: payload => add('addCost', payload, 'acl'),
    editCost: (id, payload) => edit('editCost', id, payload),
  };
}
