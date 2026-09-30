export function summarizeInteractionSamples(samples) {
  const stats = values => {
    const sorted = [...values].sort((a, b) => a - b);
    return { n: sorted.length, min: sorted[0], average: sorted.reduce((a, b) => a + b, 0) / sorted.length, p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1) };
  };
  const groups = new Map();
  for (const sample of samples) {
    const key = `${sample.viewport}/${sample.module}/${sample.action}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sample);
  }
  return [...groups].map(([key, group]) => ({
    key, ...stats(group.map(row => row.totalMs)),
    // Arming can precede the actual input by several frames. Exclude earlier commits.
    render: stats(group.map(row => row.events.filter(event => (
      event.type === 'render.react' && event.detail.component === 'HDManagerRoot'
      && event.detail.startTimeMs >= row.startTimeMs
      && event.detail.commitTimeMs <= row.endTimeMs + 1
    )).reduce((sum, event) => sum + event.detail.actualDurationMs, 0))),
    maxActiveListeners: Math.max(...group.map(row => row.subscriptions.length)),
    maxSdkOperations: Math.max(...group.map(row => row.events.filter(event => (
      event.type === 'firestore.operation' && event.interactionId === row.interactionId
      && event.detail.startTimeMs >= row.startTimeMs
    )).length)),
  }));
}
