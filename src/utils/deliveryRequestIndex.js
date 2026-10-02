// Preserve source ordering, including duplicate rows, when ID and name both match.
export function buildDeliveryRequestIndex(requests, customerLookup, normalizeName) {
  const byId = new Map();
  const byName = new Map();
  const append = (map, key, index) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(index);
  };
  requests.forEach((request, index) => {
    if (!request || request.isArchived) return;
    append(byId, request.customerId, index);
    const customer = customerLookup.get(request.customerId);
    append(byName, normalizeName(request.customerNameSnapshot || request.customerName || customer?.name || ''), index);
  });
  return (customerId, normalizedName) => {
    const positions = new Set([...(byId.get(customerId) || []), ...(byName.get(normalizedName) || [])]);
    return [...positions].sort((a, b) => a - b).map(index => requests[index]);
  };
}
