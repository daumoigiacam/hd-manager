export const upsertOrderIntoShareCollection = (collection = [], order = {}) => {
  const source = Array.isArray(collection) ? collection : [];
  const orderId = `${order?.id || ''}`.trim();
  if (!orderId) return source;

  const existingIndex = source.findIndex(item => `${item?.id || ''}`.trim() === orderId);
  if (existingIndex < 0) return [order, ...source];
  if (source[existingIndex] === order) return source;

  const next = source.slice();
  next[existingIndex] = order;
  return next;
};

export const getRelatedShareCollectionItems = (
  collection = [],
  customerId = '',
  excludedEntityId = ''
) => {
  const normalizedCustomerId = `${customerId || ''}`.trim();
  const normalizedExcludedId = `${excludedEntityId || ''}`.trim();
  if (!Array.isArray(collection) || !normalizedCustomerId) return [];

  return collection.filter(item => (
    `${item?.customerId || ''}`.trim() === normalizedCustomerId
    && !item?.isArchived
    && (!normalizedExcludedId || `${item?.id || ''}`.trim() !== normalizedExcludedId)
  ));
};
