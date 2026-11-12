// Scope one arbiter to one authenticated tenant/session. Never use for writes.
export function createReadArbiter() {
  const entries = new Map();
  let disposed = false;
  const entryFor = key => {
    if (!entries.has(key)) entries.set(key, { revision: 0, active: null, queued: null });
    return entries.get(key);
  };
  const start = (entry, task) => {
    const revision = ++entry.revision;
    const promise = Promise.resolve().then(() => {
      if (disposed) return;
      return task(() => !disposed && entry.revision === revision);
    });
    entry.active = promise;
    const clear = () => { if (entry.active === promise) entry.active = null; };
    promise.then(clear, clear);
    return promise;
  };
  return {
    run(key, task, { force = false } = {}) {
      if (disposed) return Promise.resolve();
      const entry = entryFor(key);
      if (entry.queued) return entry.queued;
      if (!entry.active) return start(entry, task);
      if (!force) return entry.active;
      // A post-write refresh must start AFTER the old read; coalesce its waiters.
      entry.revision += 1;
      const launch = () => {
        entry.queued = null;
        return disposed ? undefined : start(entry, task);
      };
      entry.queued = entry.active.then(launch, launch);
      return entry.queued;
    },
    invalidate(key) { if (!disposed) entryFor(key).revision += 1; },
    dispose() { disposed = true; entries.clear(); }
  };
}
