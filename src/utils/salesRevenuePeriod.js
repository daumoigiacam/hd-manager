const normalizeId = (value) => `${value || ''}`.trim();

let activeRevenueIndex = null;

// Only synchronous report calculations share this index; never across saves.
export const withSalesRevenueIndex = (calculate) => {
  const previous = activeRevenueIndex;
  activeRevenueIndex = new WeakMap();
  try { return calculate(); } finally { activeRevenueIndex = previous; }
};

const toFiniteAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

export const normalizeSalesRevenueMonthKey = (value = '') => {
  const text = `${value || ''}`.trim();
  const directMatch = text.match(/^(\d{4})-(\d{2})/);
  if (directMatch) {
    const month = Number(directMatch[2]);
    return month >= 1 && month <= 12 ? `${directMatch[1]}-${directMatch[2]}` : '';
  }

  const date = value instanceof Date
    ? value
    : (value && typeof value?.toDate === 'function' ? value.toDate() : null);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export const getSalesOrderMonthKey = (order = {}) => {
  const candidates = [order.date, order.orderDate, order.createdAt];
  for (const candidate of candidates) {
    const monthKey = normalizeSalesRevenueMonthKey(candidate);
    if (monthKey) return monthKey;
  }
  return '';
};

export const getSalesOrderEmployeeId = (order = {}, customerById = new Map()) => {
  const customer = customerById.get(normalizeId(order?.customerId));
  return normalizeId(
    order?.salesEmpId
      || customer?.empId
      || order?.createdByEmpId
      || order?.empId
  );
};

export const summarizeEmployeeSalesRevenueForMonth = ({
  employeeId = '',
  orders = [],
  customers = [],
  monthKey = ''
} = {}) => {
  const safeEmployeeId = normalizeId(employeeId);
  const safeMonthKey = normalizeSalesRevenueMonthKey(monthKey);
  if (!safeEmployeeId || !safeMonthKey) {
    return { monthKey: safeMonthKey, revenue: 0, orderCount: 0, customerCount: 0, orderIds: [] };
  }

  const customerById = new Map(
    (customers || [])
      .filter(customer => customer?.id)
      .map(customer => [normalizeId(customer.id), customer])
  );
  if (activeRevenueIndex && Array.isArray(orders) && Array.isArray(customers)) {
    let byCustomers = activeRevenueIndex.get(orders);
    if (!byCustomers) { byCustomers = new WeakMap(); activeRevenueIndex.set(orders, byCustomers); }
    let index = byCustomers.get(customers);
    if (!index) {
      index = new Map();
      for (const order of orders) {
        if (!order || order.isArchived) continue;
        const month = getSalesOrderMonthKey(order);
        const owner = getSalesOrderEmployeeId(order, customerById);
        if (!month || !owner) continue;
        if (!index.has(month)) index.set(month, new Map());
        const owners = index.get(month);
        if (!owners.has(owner)) owners.set(owner, { revenue: 0, orderCount: 0, customers: new Set(), orderIds: [] });
        const row = owners.get(owner);
        row.revenue += toFiniteAmount(order.amount);
        row.orderCount += 1;
        if (order.customerId) row.customers.add(normalizeId(order.customerId));
        if (order.id) row.orderIds.push(normalizeId(order.id));
      }
      byCustomers.set(customers, index);
    }
    const row = index.get(safeMonthKey)?.get(safeEmployeeId);
    return { monthKey: safeMonthKey, revenue: row?.revenue || 0, orderCount: row?.orderCount || 0,
      customerCount: row?.customers.size || 0, orderIds: row ? [...row.orderIds] : [] };
  }
  const matchedCustomerIds = new Set();
  const orderIds = [];
  let revenue = 0;
  let orderCount = 0;

  (orders || []).forEach(order => {
    if (!order || order.isArchived) return;
    if (getSalesOrderMonthKey(order) !== safeMonthKey) return;
    if (getSalesOrderEmployeeId(order, customerById) !== safeEmployeeId) return;

    revenue += toFiniteAmount(order.amount);
    orderCount += 1;
    if (order.customerId) matchedCustomerIds.add(normalizeId(order.customerId));
    if (order.id) orderIds.push(normalizeId(order.id));
  });

  return {
    monthKey: safeMonthKey,
    revenue,
    orderCount,
    customerCount: matchedCustomerIds.size,
    orderIds
  };
};

export const calculateEmployeeSalesRevenueForMonth = (options = {}) => (
  summarizeEmployeeSalesRevenueForMonth(options).revenue
);
