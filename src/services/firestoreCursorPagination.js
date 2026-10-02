import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore';

export const DEFAULT_CURSOR_PAGE_SIZE = 50;
export const MAX_CURSOR_PAGE_SIZE = 200;

export const CRITICAL_CURSOR_COLLECTIONS = Object.freeze([
  'orders',
  'orderRequests',
  'warehouseDispatches',
  'customers',
  'products',
  'warehouseImports',
  'warehouseStockCounts',
  'pricingInputs',
  'payrollSnapshots',
  'payments',
  'expenses',
  'financials',
]);

export const normalizeCursorPageSize = (value = DEFAULT_CURSOR_PAGE_SIZE) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_CURSOR_PAGE_SIZE;
  return Math.min(parsed, MAX_CURSOR_PAGE_SIZE);
};

export const mergeCursorItems = (currentItems = [], incomingItems = []) => {
  const byId = new Map();
  (Array.isArray(currentItems) ? currentItems : []).forEach((item) => {
    if (item?.id) byId.set(`${item.id}`, item);
  });
  (Array.isArray(incomingItems) ? incomingItems : []).forEach((item) => {
    if (item?.id) byId.set(`${item.id}`, item);
  });
  return Array.from(byId.values()).sort((left, right) => `${left.id}`.localeCompare(`${right.id}`));
};

export const readTenantCursorPage = async ({
  db,
  appId,
  collectionName,
  companyId,
  pageSize = DEFAULT_CURSOR_PAGE_SIZE,
  cursor = null,
} = {}) => {
  if (!db || !appId || !collectionName || !companyId) {
    throw new Error('Thiếu phạm vi tenant để đọc trang dữ liệu.');
  }
  const normalizedPageSize = normalizeCursorPageSize(pageSize);
  const constraints = [
    where('companyId', '==', companyId),
    orderBy(documentId(), 'asc'),
  ];
  if (cursor?.snapshot) constraints.push(startAfter(cursor.snapshot));
  constraints.push(limit(normalizedPageSize));

  const snapshot = await getDocs(query(
    collection(db, 'artifacts', appId, 'public', 'data', collectionName),
    ...constraints,
  ));
  const items = snapshot.docs.map(documentSnapshot => ({
    id: documentSnapshot.id,
    ...documentSnapshot.data(),
  }));
  const lastSnapshot = snapshot.docs.at(-1) || null;
  const previousId = `${cursor?.id || ''}`;
  const nextId = `${lastSnapshot?.id || ''}`;
  const advanced = Boolean(lastSnapshot && nextId && nextId !== previousId);

  return {
    items,
    readCount: snapshot.size,
    pageSize: normalizedPageSize,
    hasMore: snapshot.size === normalizedPageSize && advanced,
    cursor: advanced ? { id: nextId, snapshot: lastSnapshot } : null,
    exhausted: snapshot.size < normalizedPageSize || !advanced,
  };
};

export const collectTenantCursorPages = async ({
  maxPages = 10_000,
  onPage,
  ...options
} = {}) => {
  const seenIds = new Set();
  const items = [];
  let cursor = null;
  let pageCount = 0;
  let hasMore = true;
  while (hasMore) {
    if (pageCount >= maxPages) throw new Error('Cursor pagination vượt giới hạn trang an toàn.');
    const page = await readTenantCursorPage({ ...options, cursor });
    const previousSize = seenIds.size;
    page.items.forEach((item) => {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        items.push(item);
      }
    });
    pageCount += 1;
    await onPage?.(page, pageCount);
    if (page.hasMore && seenIds.size === previousSize) {
      throw new Error('Cursor không tiến lên; đã dừng để tránh vòng lặp vô hạn.');
    }
    cursor = page.cursor;
    hasMore = page.hasMore;
  }
  return { items, pageCount, cursor, exhausted: true };
};
