export function createReadWorkerActivityStore() {
  const pending = new Set(), listeners = new Set();
  let count = 0;
  return {
    subscribe(listener) { listeners.add(listener);return()=>listeners.delete(listener); },
    getSnapshot: () => count,
    setPending(id,value) {
      if (value) pending.add(id);else pending.delete(id);
      if (count === pending.size) return;
      count = pending.size;for (const listener of listeners) listener();
    },
  };
}
