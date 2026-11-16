/**
 * Editable rows must have the same identity and scope as their editor. Grouping
 * customer/driver cells is safe; merging document weights then editing only the
 * first document is not. Reports may still aggregate their read-only totals.
 * @template {{id: string}} Row
 * @param {readonly Row[]} rows
 * @param {{weight: (row: Row) => number, quantity: (row: Row) => number, unit: (row: Row) => string}} read
 */
export function buildDispatchEditableRows(rows, read) {
  return rows.map(row => ({
    ...row, sourceRows: [row], sourceIds: [row.id], isMergedDispatchRow: false,
    weightKg: read.weight(row), pieceCount: read.quantity(row),
    quantity: read.quantity(row), quantityCount: read.quantity(row), quantityUnit: read.unit(row),
  }));
}

/** @template {{id?: string, sourceRows?: readonly {id?: string}[]}} Row @param {Row} row */
export function requireSingleDispatchSource(row) {
  if (row.sourceRows && row.sourceRows.length !== 1) {
    throw new Error('Dòng này gồm nhiều phiếu xuất. Hãy mở lại danh sách để sửa từng phiếu gốc.');
  }
  const source = row.sourceRows?.[0] || row;
  if (!source.id) throw new Error('Không tìm thấy phiếu gốc để cập nhật.');
  return source;
}
