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
