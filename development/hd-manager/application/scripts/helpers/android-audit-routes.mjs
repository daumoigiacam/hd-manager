// Navigation location depends on the authenticated role, not the route name.
// A hidden module is untested; it must never count as a successful visit.
export function resolveAccessibleAuditRoutes(routes, surfaces) {
  const bottom = new Set(surfaces.bottom), more = new Set(surfaces.more);
  const eligibleRoutes = [], skippedModules = [];
  for (const [module, label] of routes) {
    if (bottom.has(label) || more.has(label)) eligibleRoutes.push([module, label, bottom.has(label)]);
    else skippedModules.push({ module, reason: 'Not present in permitted navigation for this authenticated session; not tested, not PASS.' });
  }
  return { eligibleRoutes, skippedModules };
}
