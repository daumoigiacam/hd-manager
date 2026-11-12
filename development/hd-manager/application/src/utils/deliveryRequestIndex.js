const recordLookups = new WeakMap();
const requestIndexes = new WeakMap();

// Immutable source arrays own their indexes; old tenants can be garbage collected.
export function getDeliveryRecordLookup(records) {
  if (!recordLookups.has(records)) recordLookups.set(records, new Map(records.map(record => [record.id, record])));
  return recordLookups.get(records);
}

// Preserve source ordering, including duplicate rows, when ID and name both match.
export function buildDeliveryRequestIndex(requests, customerLookup, normalizeName) {
  let contexts = requestIndexes.get(requests);
  if (!contexts) { contexts = new WeakMap(); requestIndexes.set(requests, contexts); }
  let normalizers = contexts.get(customerLookup);
  if (!normalizers) { normalizers = new WeakMap(); contexts.set(customerLookup, normalizers); }
  if (normalizers.has(normalizeName)) return normalizers.get(normalizeName);
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
  const find = (customerId, normalizedName) => {
    const ids = byId.get(customerId) || [];
    const names = byName.get(normalizedName) || [];
    const result = [];
    let idIndex = 0;
    let nameIndex = 0;
    // Both lists were appended in source order. Merge positions, not record IDs:
    // two occurrences of the same record must remain two occurrences.
    while (idIndex < ids.length || nameIndex < names.length) {
      const idPosition = ids[idIndex] ?? Infinity;
      const namePosition = names[nameIndex] ?? Infinity;
      const position = Math.min(idPosition, namePosition);
      result.push(requests[position]);
      if (idPosition === position) idIndex++;
      if (namePosition === position) nameIndex++;
    }
    return result;
  };
  normalizers.set(normalizeName, find);
  return find;
}
