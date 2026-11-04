import { useEffect, useRef } from 'react';
import { createInstantDataEngine } from './instantDataEngine.js';
import { createVerifiedDataSession, getVerifiedDataSessionKey } from './verifiedDataSession.js';
import {getAdaptivePerformancePolicy,subscribeAdaptivePerformance} from '../services/adaptivePerformance.js';

// Own one engine per verified access epoch, never a module-global tenant cache.
// The caller must derive scope/isCurrent from authenticated state, not a route
// or a cached identity. scope.sessionId is required and must change on relogin.
// Server authorization remains mandatory on every adapter.
export function useInstantDataEngine(options) {
  const {
    scope,
    transport,
    ...configuration
  } = options;
  const owner = useRef(null);
  const current = useRef(null);
  let scopeKey;
  try { scopeKey = getVerifiedDataSessionKey(scope); }
  catch (error) {
    owner.current?.session.close();
    throw error;
  }
  current.current = {
    scopeKey,
    transport,
    configuration
  };
  if (!owner.current || owner.current.session.key !== scopeKey || owner.current.transport !== transport
    || owner.current.session.getSnapshot().closed) {
    // Revoke before creating the new owner, not in a later passive effect.
    // No old query/cache/watch may remain usable during replacement rendering.
    owner.current?.session.close();
    owner.current = null;
    let engine;
    const session = createVerifiedDataSession(scope, { onClose: () => engine?.close() });
    try { engine = createInstantDataEngine({
      ...configuration,
      scope: session.scope,
      transport,
      isCurrent: identity => session.isCurrent() && current.current.scopeKey === scopeKey && current.current.transport === transport && (current.current.configuration.isCurrent?.(identity) ?? true),
      onMetric: event => current.current.configuration.onMetric?.(event)
    }); } catch (error) { session.close(); throw error; }
    owner.current = { engine, session, transport };
  }
  const lease = owner.current;
  useEffect(() => {
    const release=lease.session.retain();
    const apply=policy=>{
      try{lease.engine.setResourceBudget({readConcurrency:Math.min(configuration.maxConcurrent??2,policy.readConcurrency),cachePages:Math.min(configuration.maxCachePages??80,policy.cachePages)})}
      catch(error){if(!['cancelled','permission-denied'].includes(error?.code))throw error}
    };
    apply(getAdaptivePerformancePolicy());
    const unsubscribe=subscribeAdaptivePerformance(apply);
    return()=>{unsubscribe();release()};
  }, [lease]);
  return lease.engine;
}
