// Click duration alone can understate an interaction: pointerdown/up belonging
// to the same interaction ID can be slower. Never invent values for missing data.
export function normalizeTrustedInputTimestamp(stamp,now,origin,trusted) {
  if(trusted!==true || !Number.isFinite(stamp) || !Number.isFinite(now) || !Number.isFinite(origin))return null;
  const value=stamp>1e12?stamp-origin:stamp;
  return value>=0 && value<=now && now-value<60000?value:null;
}

export function extractBrowserInteraction(events, capturedClickTime) {
  if (!Number.isFinite(capturedClickTime)) return { status: 'MISSING_EVENT_TIMING', durationMs: null, events: [] };
  const clicks = events.filter(event => event.name === 'click' && event.interactionId > 0
    && Number.isFinite(event.processingStart) && Math.abs(event.processingStart - capturedClickTime) < 20)
    .sort((a, b) => Math.abs(a.processingStart - capturedClickTime) - Math.abs(b.processingStart - capturedClickTime));
  if (!clicks.length) return { status: 'MISSING_EVENT_TIMING', durationMs: null, events: [] };
  const group = events.filter(event => event.interactionId === clicks[0].interactionId);
  if (group.some(event => !Number.isFinite(event.duration) || event.duration <= 0)) {
    return { status: 'INVALID_EVENT_TIMING', durationMs: null, events: group };
  }
  return { status: 'MEASURED', durationMs: Math.max(...group.map(event => event.duration)), events: group };
}
