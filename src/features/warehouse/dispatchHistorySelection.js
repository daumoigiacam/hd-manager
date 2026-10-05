/**
 * Resolve selection from current authoritative groups, never from a dialog copy.
 * @template {{dateKey: string}} T
 * @param {ReadonlyMap<string, T>} groups
 * @param {string | null} dateKey
 * @returns {T | null}
 */
export function resolveDispatchHistorySelection(groups, dateKey) {
  return dateKey === null ? null : groups.get(dateKey) || null;
}
