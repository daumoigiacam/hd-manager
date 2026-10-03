export function createOrderSearchState() {
  let value = '';
  const listeners = new Set();
  return {
    getSnapshot: () => value,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    set: next => {
      const updated = typeof next === 'function' ? next(value) : next;
      if (Object.is(updated, value)) return;
      value = updated;
      listeners.forEach(listener => listener());
    },
  };
}
