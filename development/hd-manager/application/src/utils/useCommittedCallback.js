import {useCallback, useLayoutEffect, useRef} from 'react';

// Stable DOM callback identity, latest committed state. Updating the ref in a
// layout effect avoids exposing state from an interrupted render to an event.
export function useCommittedCallback(callback) {
  const latest = useRef(callback);
  useLayoutEffect(() => { latest.current = callback; });
  return useCallback((...args) => latest.current(...args), []);
}
