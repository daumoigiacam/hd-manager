import { useCallback, useEffect, useRef } from 'react';

// A stable UI callback reads the last committed screen state.
export function useCurrentCallback(callback) {
  const current = useRef(callback);
  useEffect(() => { current.current = callback; });
  return useCallback((...args) => current.current(...args), []);
}
