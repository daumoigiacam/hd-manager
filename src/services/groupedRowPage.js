// Slice presentation rows, not business data. Row objects retain their identity.
export function getGroupedRowPage(groups, requestedOffset = 0, size = 100) {
  const limit = Math.max(1, Math.floor(size) || 100);
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const offset = Math.min(Math.max(0, Math.floor(requestedOffset / limit) * limit || 0),
    Math.max(0, Math.ceil(total / limit) - 1) * limit);
  const items = [];
  let position = 0;
  for (const group of groups) {
    const start = Math.max(0, offset - position);
    const end = Math.min(group.rows.length, offset + limit - position);
    if (end > start) {
      const rows = group.rows.slice(start, end);
      items.push({ ...group, rows, rowSpan: rows.length });
    }
    position += group.rows.length;
    if (position >= offset + limit) break;
  }
  return { items, total, offset, size: limit, hasPrevious: offset > 0, hasNext: offset + limit < total };
}
