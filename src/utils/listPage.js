export const getListPage = (total, requestedPage = 0, requestedSize = 50) => {
  const count = Math.max(0, Math.floor(Number(total) || 0));
  const pageSize = Math.max(1, Math.floor(Number(requestedSize) || 50));
  const pageCount = Math.max(1, Math.ceil(count / pageSize));
  const page = Math.min(pageCount - 1, Math.max(0, Math.floor(Number(requestedPage) || 0)));
  const start = page * pageSize;
  return { page, pageSize, pageCount, total: count, start, end: Math.min(count, start + pageSize) };
};
