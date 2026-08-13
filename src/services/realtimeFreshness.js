export const DEFAULT_SERVER_FRESHNESS_WINDOW_MS = 25000;

export const isServerSnapshotFresh = (
  lastServerSnapshotAt,
  {
    now = Date.now(),
    maxAgeMs = DEFAULT_SERVER_FRESHNESS_WINDOW_MS
  } = {}
) => {
  const confirmedAt = Number(lastServerSnapshotAt || 0);
  const freshnessWindow = Math.max(0, Number(maxAgeMs) || 0);
  return confirmedAt > 0 && now >= confirmedAt && now - confirmedAt < freshnessWindow;
};

export const getRealtimeSnapshotSource = (snapshot) => (
  snapshot?.metadata?.fromCache ? 'cache' : 'server'
);

export const shouldApplyRealtimeSnapshot = (snapshot) => (
  !Boolean(snapshot?.metadata?.fromCache)
);

export const getRealtimeDataChangeCount = (snapshot) => {
  if (typeof snapshot?.docChanges !== 'function') return null;

  try {
    const changes = snapshot.docChanges({ includeMetadataChanges: false });
    return Number.isFinite(Number(changes?.length)) ? Number(changes.length) : null;
  } catch {
    try {
      const changes = snapshot.docChanges();
      return Number.isFinite(Number(changes?.length)) ? Number(changes.length) : null;
    } catch {
      return null;
    }
  }
};

export const isServerConfirmedRealtimeSnapshot = (snapshot) => (
  !Boolean(snapshot?.metadata?.fromCache)
  && !Boolean(snapshot?.metadata?.hasPendingWrites)
);

const normalizeVersionValue = (value) => {
  if (value?.toMillis && typeof value.toMillis === 'function') return value.toMillis();
  if (value?.toDate && typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object' && Number.isFinite(Number(value.seconds))) {
    return `${Number(value.seconds)}:${Number(value.nanoseconds || 0)}`;
  }
  return `${value ?? ''}`;
};

export const isRealtimeWriteConfirmed = (serverRecord = {}, expectedPayload = {}) => {
  const data = serverRecord?.data && typeof serverRecord.data === 'object'
    ? serverRecord.data
    : serverRecord;
  const versionField = ['updatedAt', 'modifiedAt', 'archivedAt', 'createdAt']
    .find(field => expectedPayload?.[field] !== undefined && expectedPayload?.[field] !== null);

  // Legacy writes without a version marker keep the existing id-based confirmation behavior.
  if (!versionField) return true;
  return normalizeVersionValue(data?.[versionField]) === normalizeVersionValue(expectedPayload[versionField]);
};
