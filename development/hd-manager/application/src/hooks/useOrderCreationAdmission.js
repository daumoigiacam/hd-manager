import {useCallback, useLayoutEffect, useRef} from 'react';
import {createOrderCreationAdmission} from '../services/orderCreationAdmission.js';

export function useOrderCreationAdmission({identity, ready, error, callback}) {
  const gate = useRef(null);
  if (!gate.current) gate.current = createOrderCreationAdmission();
  useLayoutEffect(() => { gate.current.update({identity, ready, error, callback}); });
  useLayoutEffect(() => () => gate.current.cancel(), []);
  return useCallback((args, expectedIdentity) => gate.current.run(args, expectedIdentity), []);
}
