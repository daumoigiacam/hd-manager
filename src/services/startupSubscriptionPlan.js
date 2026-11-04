// Keep the small identity subscriptions ahead of the tenant-wide history.
// Customer portals use their own bootstrap and must not load employees.
export const canStartBusinessSubscriptions = (accountType, coreReady) => (
  accountType === 'customer' || coreReady === true
);

export function startBaselineSubscriptions({ bindings, coreNames, start, schedule, delayFor }) {
  const timers = [];
  for (const binding of bindings) {
    if (coreNames.includes(binding[0])) start(binding);
    else timers.push(schedule(() => start(binding), delayFor(binding[0])));
  }
  return timers;
}

// Admit large secondary subscriptions only after the first screen's requested
// collections are confirmed. Event-driven, one bounded deadline, no polling.
export function createStartupSubscriptionBarrier({ start, isCurrent, onPending = () => {},
  schedule = (callback, delay) => setTimeout(callback, delay), cancel = clearTimeout,
  now = Date.now, bootstrapMs = 30000, foregroundMs = 15000,
}) {
  const confirmed = new Set();
  let required = null, disposed = false, released = false, timer;
  const bootstrapDeadline = now() + bootstrapMs;
  const release = reason => {
    if (disposed || released || !isCurrent()) return;
    released = true; cancel(timer);
    // start() establishes the real subscription's pending state before this
    // waiting marker is removed. Waiting is never reported as completed data.
    try { start(reason); } finally { onPending(false); }
  };
  const check = () => {
    if (required && [...required].every(name => confirmed.has(name))) release('foreground-confirmed');
  };
  onPending(true);
  timer = schedule(() => release('bootstrap-deadline'), bootstrapMs);
  return {
    requestNow() { release('explicit-open'); },
    confirm(name) { if (!disposed && !released) { confirmed.add(name); check(); } },
    activate(names) {
      if (disposed || released || required) return;
      required = new Set(names);
      cancel(timer);
      timer = schedule(() => release('foreground-deadline'), Math.max(0, Math.min(foregroundMs, bootstrapDeadline - now())));
      check();
    },
    dispose() { disposed = true; cancel(timer); onPending(false); },
  };
}
