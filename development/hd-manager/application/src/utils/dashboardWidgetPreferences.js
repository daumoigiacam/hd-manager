export const HOME_DASHBOARD_WIDGET_IDS = Object.freeze([
  'sales',
  'profit',
  'cashflow',
  'hr',
  'warehouse',
]);

export function getDashboardWidgetPreferenceKey(companyId, employeeId, dashboardId = 'home') {
  const companyKey = `${companyId || 'company'}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const employeeKey = `${employeeId || 'employee'}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const dashboardKey = `${dashboardId || 'home'}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const dashboardSuffix = dashboardKey === 'home' ? '' : `:${dashboardKey}`;
  return `hd-dashboard-widgets:v1:${companyKey}:${employeeKey}${dashboardSuffix}`;
}

export function normalizeDashboardWidgetPreferences(value, availableIds = HOME_DASHBOARD_WIDGET_IDS) {
  const validIds = [...new Set((availableIds || []).filter(id => typeof id === 'string' && id))];
  const validIdSet = new Set(validIds);
  const savedOrder = Array.isArray(value?.order) ? value.order : [];
  const order = [...new Set(savedOrder.filter(id => validIdSet.has(id)))];
  validIds.forEach(id => {
    if (!order.includes(id)) order.push(id);
  });
  const hiddenIds = [...new Set((Array.isArray(value?.hiddenIds) ? value.hiddenIds : []).filter(id => validIdSet.has(id)))];
  return { order, hiddenIds };
}

export function moveDashboardWidget(order, widgetId, direction) {
  const next = [...(Array.isArray(order) ? order : [])];
  const currentIndex = next.indexOf(widgetId);
  const nextIndex = currentIndex + (direction === 'up' ? -1 : direction === 'down' ? 1 : 0);
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= next.length) return next;
  [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
  return next;
}

export function moveDashboardWidgetBefore(order, sourceId, targetId) {
  const next = [...(Array.isArray(order) ? order : [])];
  const sourceIndex = next.indexOf(sourceId);
  const targetIndex = next.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceId === targetId) return next;
  next.splice(sourceIndex, 1);
  next.splice(next.indexOf(targetId), 0, sourceId);
  return next;
}

export function toggleDashboardWidgetVisibility(hiddenIds, widgetId) {
  const next = new Set(Array.isArray(hiddenIds) ? hiddenIds : []);
  if (next.has(widgetId)) next.delete(widgetId);
  else next.add(widgetId);
  return [...next];
}

export function readDashboardWidgetPreferences(companyId, employeeId, storage, dashboardId = 'home', availableIds = HOME_DASHBOARD_WIDGET_IDS) {
  const defaults = normalizeDashboardWidgetPreferences(null, availableIds);
  try {
    const targetStorage = storage === undefined ? globalThis.localStorage : storage;
    const raw = targetStorage?.getItem(getDashboardWidgetPreferenceKey(companyId, employeeId, dashboardId));
    return normalizeDashboardWidgetPreferences(raw ? JSON.parse(raw) : defaults, availableIds);
  } catch {
    return defaults;
  }
}

export function writeDashboardWidgetPreferences(companyId, employeeId, preferences, storage, dashboardId = 'home', availableIds = HOME_DASHBOARD_WIDGET_IDS) {
  try {
    const targetStorage = storage === undefined ? globalThis.localStorage : storage;
    targetStorage?.setItem(
      getDashboardWidgetPreferenceKey(companyId, employeeId, dashboardId),
      JSON.stringify(normalizeDashboardWidgetPreferences(preferences, availableIds)),
    );
    return true;
  } catch {
    return false;
  }
}
