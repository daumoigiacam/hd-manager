/** @typedef {{id: string, customerName: string, productName: string, productShortName: string, pieceCount: string, quantityUnit: string, weightKg: string}} EmptyDispatchRow */
/**
 * Pad export layout only; do not invent business records.
 * @template T
 * @param {readonly T[] | null} [sourceRows]
 * @returns {(T | EmptyDispatchRow)[]}
 */
export function buildDispatchPreviewRows(sourceRows = []) {
  const rows = sourceRows || [];
  return [...rows, ...Array.from({length: Math.max(0, 6 - rows.length)}, (_, index) => ({
    id: `dispatch_blank_${index}`, customerName: '', productName: '', productShortName: '',
    pieceCount: '', quantityUnit: '', weightKg: ''
  }))];
}
