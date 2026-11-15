const uniqueNames = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map(value => `${value || ''}`.trim())
    .filter(Boolean)
));

export const planForegroundRealtimeActivation = ({
  requestedNames = [],
  activeNames = [],
  recentNames = [],
  availableNames = [],
  baselineNames = [],
  limit = 0,
  retainRecent = true,
  retainedActiveNames = [],
} = {}) => {
  const available = new Set(uniqueNames(availableNames));
  const baseline = new Set(uniqueNames(baselineNames));
  const maxListeners = Math.max(0, Number(limit) || 0);
  const isEligible = name => (
    !baseline.has(name)
    && (available.size === 0 || available.has(name))
  );
  const requested = uniqueNames(requestedNames).filter(isEligible);
  const active = uniqueNames(activeNames).filter(isEligible);
  const recency = uniqueNames([
    ...requested,
    ...recentNames,
    ...active,
  ]).filter(isEligible);
  const liveNames = requested.slice(0, maxListeners);

  // Explicit short-lived retention cannot revive a closed/cold subscription.
  // Current demand always owns the budget before any retained source.
  for(const name of uniqueNames(retainedActiveNames).filter(isEligible)){
    if(liveNames.length>=maxListeners)break;
    if(active.includes(name)&&!liveNames.includes(name))liveNames.push(name);
  }

  for (const name of retainRecent ? recency : []) {
    if (liveNames.length >= maxListeners) break;
    if (!liveNames.includes(name)) liveNames.push(name);
  }

  const liveSet = new Set(liveNames);
  return {
    liveNames,
    overflowNames: requested.filter(name => !liveSet.has(name)),
    evictedNames: active.filter(name => !liveSet.has(name)),
    recentNames: recency,
  };
};
