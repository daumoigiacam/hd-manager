/** @param {number | string | null | undefined} value */
export function formatDispatchNumberInput(value) {
  const parsed = parseFloat(`${value ?? ''}`.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return Number.isInteger(parsed) ? `${parsed}` : `${Number(parsed.toFixed(2))}`;
}
