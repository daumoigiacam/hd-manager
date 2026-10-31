// Archived experiment only. This is not imported by the application.
export function resolveDeferredNavigation(requested, deferred, canAccess) {
  if (!deferred || deferred.scope !== requested.scope || !canAccess(deferred.tab)) return requested.tab;
  return deferred.tab;
}
