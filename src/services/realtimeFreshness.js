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
