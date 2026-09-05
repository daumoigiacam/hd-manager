// Commit a collection to UI state only after all tenant-scoped pages agree.
// A changing count, repeated page or tenant mismatch must not look like a
// successful but truncated legacy collection.
export async function readCompleteVpsCollection(readPage, {
  companyId,
  cancelled = () => false,
  query = {},
  maxItems = 250000,
} = {}) {
  if (!companyId) throw new Error('VPS_COLLECTION_TENANT_REQUIRED');
  const items = [];
  const ids = new Set();
  const limit = 100;
  let expected;
  for (let page = 1; page <= Math.ceil(maxItems / limit) + 1; page += 1) {
    if (cancelled()) throw new Error('VPS_COLLECTION_CANCELLED');
    const result = await readPage({ sortBy: 'createdAt', sortOrder: 'asc', ...query, page, limit });
    if (cancelled()) throw new Error('VPS_COLLECTION_CANCELLED');
    const pagination = result?.pagination;
    const count = pagination?.totalItems;
    if (!Array.isArray(result?.items) || !Number.isInteger(count) || count < 0 || count > maxItems || typeof pagination.hasNextPage !== 'boolean') {
      throw new Error('VPS_COLLECTION_PAGINATION_REQUIRED');
    }
    if (expected === undefined) expected = count;
    if (count !== expected) throw new Error('VPS_COLLECTION_CHANGED_DURING_READ');
    for (const row of result.items) {
      if (!row?.id || row.companyId !== companyId || ids.has(row.id)) {
        throw new Error('VPS_COLLECTION_ID_OR_TENANT_MISMATCH');
      }
      ids.add(row.id);
      items.push(row);
    }
    if (items.length > expected || (pagination.hasNextPage && (result.items.length === 0 || items.length >= expected))) {
      throw new Error('VPS_COLLECTION_PAGINATION_INCONSISTENT');
    }
    if (!pagination.hasNextPage) {
      if (items.length !== expected) throw new Error('VPS_COLLECTION_INCOMPLETE');
      return { items, pagination: { ...pagination, totalItems: expected, hasNextPage: false }, complete: true };
    }
  }
  throw new Error('VPS_COLLECTION_LIMIT_REACHED');
}
