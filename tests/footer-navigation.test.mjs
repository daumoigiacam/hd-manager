import assert from 'node:assert/strict';
import {
  FIXED_FOOTER_NAV_IDS,
  getContextualFabActionIds,
  getFixedFooterNavIds,
} from '../src/utils/footerNavigation.js';

const permissionSet = Object.fromEntries(
  [...new Set(Object.values(FIXED_FOOTER_NAV_IDS).flat())].map((id) => [id, true]),
);

for (const [group, ids] of Object.entries(FIXED_FOOTER_NAV_IDS)) {
  assert.equal(ids.length, 4, `${group} footer should reserve four route slots around the center action`);
  assert.equal(ids.at(-1), 'more', `${group} footer should keep More available`);
}

assert.deepEqual(
  getFixedFooterNavIds({ isAccounting: true, permissions: permissionSet }),
  ['home', 'orders', 'finance', 'more'],
);
assert.deepEqual(
  getFixedFooterNavIds({ isDeliveryParticipant: true, permissions: permissionSet }),
  ['home', 'delivery_reports', 'company_attendance', 'more'],
);
assert.deepEqual(
  getFixedFooterNavIds({ isSales: true, permissions: permissionSet }),
  ['home', 'order_requests', 'debt', 'more'],
);
assert.deepEqual(
  getFixedFooterNavIds({ isWarehouseScale: true, permissions: permissionSet }),
  ['home', 'warehouse_dispatch', 'delivery_reports', 'more'],
);
assert.deepEqual(
  getFixedFooterNavIds({ permissions: permissionSet }),
  ['home', 'orders', 'warehouse_dispatch', 'more'],
);
assert.deepEqual(
  getFixedFooterNavIds({ isSales: true, permissions: { home: true, order_requests: true } }),
  ['home', 'order_requests', 'more'],
  'denied modules are omitted without borrowing unrelated routes',
);

assert.deepEqual(getContextualFabActionIds('home'), ['*']);
assert.deepEqual(getContextualFabActionIds('customers'), ['quick_customer', 'quick_customer_import']);
assert.deepEqual(getContextualFabActionIds('finance'), ['quick_create_income', 'quick_create_expense']);
assert.deepEqual(getContextualFabActionIds('employees'), ['quick_employee']);
assert.deepEqual(getContextualFabActionIds('warehouse_dispatch'), ['quick_warehouse_dispatch']);
assert.deepEqual(getContextualFabActionIds('warehouse_import'), ['quick_warehouse_import', 'quick_stock_adjustment']);
assert.deepEqual(getContextualFabActionIds('settings'), [], 'screens without a create action should not show the FAB');

console.log('Footer navigation role and contextual action tests passed.');
