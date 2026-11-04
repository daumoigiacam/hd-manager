import { useCallback, useEffect, useSyncExternalStore } from 'react';

const noSubscription = () => () => {};

// Route changes belong to the visible shell. The authenticated data owner can
// react through subscriptions without re-rendering every data/write handler.
export function createModuleNavigation(initialTab) {
  let tab = initialTab;
  const listeners = new Set();
  return Object.freeze({
    getSnapshot: () => tab,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      const target = typeof next === 'function' ? next(tab) : next;
      if (Object.is(target, tab)) return;
      tab = target;
      for (const listener of [...listeners]) listener();
    },
  });
}

export function useModuleNavigationSnapshot(store, fallback, enabled = true) {
  const read = useCallback(() => enabled && store ? store.getSnapshot() : fallback,
    [store, fallback, enabled]);
  return useSyncExternalStore(enabled && store ? store.subscribe : noSubscription, read, read);
}

// Same lifetime as useEffect, with route transitions as an additional trigger.
// Dependencies describe captured account/data values; the route comes from the
// store at execution time. Every transition cleans up its previous work first.
export function useModuleNavigationEffect(store, effect, dependencies) {
  useEffect(() => {
    let cleanup;
    const run = () => {
      cleanup?.();
      cleanup = effect(store.getSnapshot());
    };
    const unsubscribe = store.subscribe(run);
    run();
    return () => {
      unsubscribe();
      cleanup?.();
    };
  }, [store, ...dependencies]);
}
