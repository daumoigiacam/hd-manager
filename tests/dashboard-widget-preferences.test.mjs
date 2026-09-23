import assert from 'node:assert/strict';
import {
  HOME_DASHBOARD_WIDGET_IDS,
  getDashboardWidgetPreferenceKey,
  moveDashboardWidget,
  moveDashboardWidgetBefore,
  normalizeDashboardWidgetPreferences,
  readDashboardWidgetPreferences,
  toggleDashboardWidgetVisibility,
  writeDashboardWidgetPreferences,
} from '../src/utils/dashboardWidgetPreferences.js';

class MemoryStorage {
  values = new Map();

  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
}

assert.deepEqual(normalizeDashboardWidgetPreferences(null), {
  order: [...HOME_DASHBOARD_WIDGET_IDS],
  hiddenIds: [],
});
assert.deepEqual(normalizeDashboardWidgetPreferences({
  order: ['warehouse', 'sales', 'sales', 'unknown'],
  hiddenIds: ['hr', 'unknown', 'hr'],
}), {
  order: ['warehouse', 'sales', 'profit', 'cashflow', 'hr'],
  hiddenIds: ['hr'],
});
assert.deepEqual(moveDashboardWidget(['sales', 'profit', 'cashflow'], 'profit', 'up'), ['profit', 'sales', 'cashflow']);
assert.deepEqual(moveDashboardWidget(['sales', 'profit'], 'sales', 'up'), ['sales', 'profit']);
assert.deepEqual(moveDashboardWidgetBefore(['sales', 'profit', 'cashflow'], 'cashflow', 'sales'), ['cashflow', 'sales', 'profit']);
assert.deepEqual(toggleDashboardWidgetVisibility(['sales'], 'sales'), []);
assert.deepEqual(toggleDashboardWidgetVisibility([], 'warehouse'), ['warehouse']);
assert.notEqual(getDashboardWidgetPreferenceKey('company-a', 'staff-1'), getDashboardWidgetPreferenceKey('company-b', 'staff-1'));
assert.notEqual(getDashboardWidgetPreferenceKey('company-a', 'staff-1'), getDashboardWidgetPreferenceKey('company-a', 'staff-2'));
assert.notEqual(getDashboardWidgetPreferenceKey('company-a', 'staff-1'), getDashboardWidgetPreferenceKey('company-a', 'staff-1', 'executive'));

const storage = new MemoryStorage();
const preferences = { order: ['cashflow', 'sales'], hiddenIds: ['profit'] };
assert.equal(writeDashboardWidgetPreferences('company-a', 'staff-1', preferences, storage), true);
assert.deepEqual(readDashboardWidgetPreferences('company-a', 'staff-1', storage), {
  order: ['cashflow', 'sales', 'profit', 'hr', 'warehouse'],
  hiddenIds: ['profit'],
});

const executiveIds = ['finance-summary', 'business-performance'];
const executivePreferences = { order: ['business-performance'], hiddenIds: ['finance-summary'] };
assert.equal(writeDashboardWidgetPreferences('company-a', 'staff-1', executivePreferences, storage, 'executive', executiveIds), true);
assert.deepEqual(readDashboardWidgetPreferences('company-a', 'staff-1', storage, 'executive', executiveIds), {
  order: ['business-performance', 'finance-summary'],
  hiddenIds: ['finance-summary'],
});

const blockedStorage = {
  getItem() { throw new Error('storage blocked'); },
  setItem() { throw new Error('storage blocked'); },
};
assert.deepEqual(readDashboardWidgetPreferences('company-a', 'staff-1', blockedStorage), normalizeDashboardWidgetPreferences(null));
assert.equal(writeDashboardWidgetPreferences('company-a', 'staff-1', preferences, blockedStorage), false);

console.log('PASS dashboard widget preferences: visibility, ordering, tenant/user scoping and storage fallback.');
