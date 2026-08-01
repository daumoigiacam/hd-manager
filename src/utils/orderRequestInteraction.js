export const ORDER_REQUEST_SELECTION_LOCK_MS = 320;

export const tryAcquireOrderRequestSelectionLock = (lockSet, selectionKey) => {
  if (!(lockSet instanceof Set) || !selectionKey || lockSet.has(selectionKey)) return false;
  lockSet.add(selectionKey);
  return true;
};

export const releaseOrderRequestSelectionLock = (lockSet, selectionKey) => {
  if (!(lockSet instanceof Set) || !selectionKey) return false;
  return lockSet.delete(selectionKey);
};
