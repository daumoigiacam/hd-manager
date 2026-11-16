import {useLayoutEffect, useRef} from 'react';

// Presentation only: pending stays pending. Callers must still admit writes
// against current, fully reconciled sources, never against this retained value.
export function selectRetainedReadProjection(projection, previous, identity, enabled = true) {
  const scoped = enabled && typeof identity === 'string' && identity.length > 0;
  const ready = scoped && !projection.pending && !projection.error;
  const retained = scoped && !projection.error && projection.pending && previous?.identity === identity;
  return {...projection, available: Boolean(ready || retained), retained: Boolean(retained),
    value: ready ? projection.value : retained ? previous.value : undefined};
}

export function useRetainedReadProjection(projection, identity, {enabled = true} = {}) {
  const previous = useRef(null);
  const presentation = selectRetainedReadProjection(projection, previous.current, identity, enabled);
  useLayoutEffect(() => {
    if (!presentation.available) previous.current = null;
    else if (!projection.pending) previous.current = {identity, value: projection.value};
  }, [identity, enabled, projection.value, projection.pending, projection.error, presentation.available]);
  return presentation;
}
