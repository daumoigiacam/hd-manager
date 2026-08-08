const normalizeId = (value) => `${value || ''}`.trim();

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
