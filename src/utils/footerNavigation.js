export const FIXED_FOOTER_NAV_IDS = Object.freeze({
  accounting: Object.freeze(['home', 'orders', 'finance', 'more']),
  delivery: Object.freeze(['home', 'delivery_reports', 'company_attendance', 'more']),
  sales: Object.freeze(['home', 'order_requests', 'debt', 'more']),
  warehouse: Object.freeze(['home', 'warehouse_dispatch', 'delivery_reports', 'more']),
  default: Object.freeze(['home', 'orders', 'warehouse_dispatch', 'more']),
});

const CONTEXTUAL_FAB_ACTION_IDS = Object.freeze({
  home: Object.freeze(['*']),
  executive_dashboard: Object.freeze(['*']),
  customers: Object.freeze(['quick_customer', 'quick_customer_import']),
  products: Object.freeze(['quick_product']),
  orders: Object.freeze(['quick_create_order']),
  order_requests: Object.freeze(['quick_order_request']),
  finance: Object.freeze(['quick_create_income', 'quick_create_expense']),
  employees: Object.freeze(['quick_employee']),
  warehouse_dispatch: Object.freeze(['quick_warehouse_dispatch']),
  warehouse_import: Object.freeze(['quick_warehouse_import', 'quick_stock_adjustment']),
});

export const resolveFixedFooterGroup = ({
  isOwnerAccount = false,
  isAccounting = false,
  isSales = false,
  isDeliveryParticipant = false,
  isWarehouseScale = false,
} = {}) => {
  if (isWarehouseScale) return 'warehouse';
  if (isDeliveryParticipant) return 'delivery';
  if (isSales) return 'sales';
  if (!isOwnerAccount && isAccounting) return 'accounting';
  return 'default';
};

export const getFixedFooterNavIds = ({ permissions = {}, ...roleFlags } = {}) => {
  const group = resolveFixedFooterGroup(roleFlags);
  return FIXED_FOOTER_NAV_IDS[group].filter((id) => id === 'more' || Boolean(permissions[id]));
};

export const getContextualFabActionIds = (activeTab = '') => CONTEXTUAL_FAB_ACTION_IDS[activeTab] || Object.freeze([]);
