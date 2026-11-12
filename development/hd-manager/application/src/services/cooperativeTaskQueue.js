// Maintenance work yields between jobs; interactive saves never enter this queue.
// schedule must defer its callback and return a handle accepted by cancel.
// isPaused defers work with polling; pause/resume stop/restart scheduling without
// dropping jobs. dispose drops pending work, but cannot abort an active run.
// Pending keys keep FIFO order and their latest value. Failed runs are reported
// once through onError; callers own retries and tenant guards for async effects.
export function createCooperativeTaskQueue({
  run,
  isPaused = () => false,
  schedule = callback => setTimeout(callback, 250),
  cancel = clearTimeout,
  onError = () => {},
}) {
  const jobs = new Map();
  let timer = null;
  let running = false;
  let paused = false;
  let disposed = false;

  const reportError = (error) => {
    try {
      // Error observers must not reject a timer callback or block later jobs.
      Promise.resolve(onError(error)).catch(() => {});
    } catch { /* An observer failure must not strand maintenance work. */ }
  };
  const cancelScheduled = () => {
    const pending = timer;
    timer = null;
    if (pending !== null) cancel(pending.handle);
  };
  const requestRun = () => {
    if (disposed || paused || running || timer !== null || !jobs.size) return;
    const pending = { handle: null };
    timer = pending;
    try {
      pending.handle = schedule(() => drain(pending));
    } catch (error) {
      if (timer === pending) timer = null;
      throw error;
    }
  };
  async function drain(pending) {
    // Ignore cancelled or duplicate callbacks, even after a replacement timer.
    if (timer !== pending) return;
    timer = null;
    if (disposed || paused || running) return;
    running = true;
    try {
      if (isPaused() || disposed || paused) return;
      const next = jobs.entries().next().value;
      if (!next) return;
      const [key, value] = next;
      jobs.delete(key);
      await run(key, value);
    } catch (error) { reportError(error); }
    finally { running = false; requestRun(); }
  }
  return {
    enqueue(key, value) { if (disposed) return; jobs.set(key, value); requestRun(); },
    pause() { if (disposed) return; paused = true; cancelScheduled(); },
    resume() { if (disposed) return; paused = false; requestRun(); },
    dispose() { disposed = true; jobs.clear(); cancelScheduled(); },
    get size() { return jobs.size; },
  };
}
