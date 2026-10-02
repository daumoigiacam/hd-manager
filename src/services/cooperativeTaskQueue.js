// Maintenance work yields between jobs; interactive saves never enter this queue.
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
  let disposed = false;

  const requestRun = () => {
    if (!disposed && !running && timer === null && jobs.size) timer = schedule(drain);
  };
  async function drain() {
    timer = null;
    if (disposed) return;
    if (isPaused()) { requestRun(); return; }
    const next = jobs.entries().next().value;
    if (!next) return;
    const [key, value] = next;
    jobs.delete(key);
    running = true;
    try { await run(key, value); } catch (error) { onError(error); }
    finally { running = false; requestRun(); }
  }
  return {
    enqueue(key, value) { if (disposed) return; jobs.set(key, value); requestRun(); },
    dispose() { disposed = true; jobs.clear(); if (timer !== null) cancel(timer); timer = null; },
    get size() { return jobs.size; },
  };
}
