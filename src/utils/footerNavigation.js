export const FIXED_FOOTER_NAV_IDS = Object.freeze({
  accounting: Object.freeze(['home', 'orders', 'finance', 'debt', 'more']),
  delivery: Object.freeze(['home', 'delivery_reports', 'employee_reviews', 'company_attendance', 'more']),
  sales: Object.freeze(['home', 'order_requests', 'debt', 'company_attendance', 'more']),
  warehouse: Object.freeze(['home', 'warehouse_dispatch', 'order_requests', 'delivery_reports', 'more']),
  default: Object.freeze(['home', 'orders', 'warehouse_dispatch', 'order_requests', 'more']),
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
