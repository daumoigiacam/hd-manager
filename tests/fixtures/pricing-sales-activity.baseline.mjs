// Frozen before cooperative scheduling; do not derive expected results from the new implementation.
export default ({ orders = [], orderRequests = [], products = [] } = {}) => {
  const productById = new Map((Array.isArray(products) ? products : []).map(product => [product?.id, product]));
  const groups = {};
  const registerLine = (line = {}, parent = {}) => {
    const product = productById.get(line?.productId || line?.product?.id || line?.id) || {};
    const groupKey = getPricingSalesGroupKey(line, parent, product);
    if (!groupKey) return;
    const groupName = getPricingSalesGroupLabel(line, parent, product);
    if (!groupName) return;
    const timestamp = getEntityTimestamp(parent) || getPricingInputTimestamp(parent);
    const current = groups[groupKey];
    if (!current || timestamp >= current.timestamp) {
      groups[groupKey] = {
        groupKey,
        groupName,
        timestamp,
        averageKg: 1,
      };
    }
  };
  const registerDocument = (document = {}) => {
    const statusText = normalizeLookupText(document?.status || document?.state || '');
    if (document?.isArchived || statusText.includes('cancel') || statusText.includes('huy')) return;
    getPricingDocumentLineItems(document).forEach(line => registerLine(line, document));
  };
  (Array.isArray(orders) ? orders : []).forEach(registerDocument);
  (Array.isArray(orderRequests) ? orderRequests : []).forEach(registerDocument);
  return groups;
};
