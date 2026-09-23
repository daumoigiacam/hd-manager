const normalizeDispatchId = (value) => `${value || ''}`.trim();

export const getWarehouseDispatchIds = (record = {}) => [...new Set([
  ...(Array.isArray(record.sourceDispatchIds) ? record.sourceDispatchIds : []),
  record.sourceDispatchId,
  ...(Array.isArray(record.items) ? record.items.flatMap((item) => [
    ...(Array.isArray(item?.sourceDispatchIds) ? item.sourceDispatchIds : []),
    item?.sourceDispatchId,
  ]) : []),
].map(normalizeDispatchId).filter(Boolean))];

export const collectUsedWarehouseDispatchIds = (orders = []) => new Set(
  (Array.isArray(orders) ? orders : []).flatMap(getWarehouseDispatchIds)
);

export const isWarehouseDispatchAlreadyLinked = (dispatch = {}) => Boolean(
  `${dispatch.linkedOrderId || dispatch.orderId || dispatch.invoiceId || ''}`.trim()
);

export const findDuplicateWarehouseDispatchIds = (drafts = [], orders = []) => {
  const usedIds = collectUsedWarehouseDispatchIds(orders);
  const submittedIds = new Set();
  const duplicateIds = new Set();

  (Array.isArray(drafts) ? drafts : []).forEach((draft) => {
    getWarehouseDispatchIds(draft).forEach((dispatchId) => {
      if (usedIds.has(dispatchId) || submittedIds.has(dispatchId)) duplicateIds.add(dispatchId);
      submittedIds.add(dispatchId);
    });
  });

  return [...duplicateIds].sort();
};

export const resolveOrderCreationDateKey = ({ sourceType = '', draftDate = '', creationDate = '' } = {}) => {
  const draftDateKey = `${draftDate || ''}`.slice(0, 10);
  const creationDateKey = `${creationDate || ''}`.slice(0, 10);

  return sourceType === 'warehouse_dispatch'
    ? (creationDateKey || draftDateKey)
    : (draftDateKey || creationDateKey);
};
