const DAY_MS = 24 * 60 * 60 * 1000;

const toNumber = (value, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const toArray = (value) => (Array.isArray(value) ? value : []);
const toCollectionArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
};

const normalizeText = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const DEPARTMENT_LABELS = {
  super_admin: 'Chủ doanh nghiệp',
  owner: 'Chủ doanh nghiệp',
  admin: 'Chủ doanh nghiệp',
  employee: 'Nhân sự',
  accounting: 'Kế toán & nhân sự',
  accountant: 'Kế toán & nhân sự',
  hr: 'Kế toán & nhân sự',
  sales: 'Kinh doanh',
  sale: 'Kinh doanh',
  business: 'Kinh doanh',
  driver: 'Tài xế',
  delivery: 'Giao hàng',
  production: 'Sản xuất',
  warehouse: 'Xuất kho',
  warehouse_export: 'Xuất kho',
  asset: 'Quản lý tài sản',
  finance: 'Thu chi',
  general: 'Chi phí chung'
};

const formatDepartmentLabel = (value = '', fallback = 'Chi phí chung') => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const key = normalizeText(raw).replace(/[\s-]+/g, '_');
  return DEPARTMENT_LABELS[key] || raw;
};

const formatMoneyInsight = (value = 0) => {
  const amount = Math.round(toNumber(value));
  if (Math.abs(amount) >= 1000000000) return `${(amount / 1000000000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
  if (Math.abs(amount) >= 1000000) return `${Math.round(amount / 1000000).toLocaleString('vi-VN')} triệu`;
  return `${amount.toLocaleString('vi-VN')} đ`;
};

const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') return value.toDate();
    if (value.seconds) return new Date(value.seconds * 1000);
  }
  const raw = String(value).trim();
  const isoLike = raw.includes('T') ? raw : raw.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1');
  const date = new Date(isoLike);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dateKey = (value) => {
  const date = parseDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const monthKey = (value) => dateKey(value).slice(0, 7);

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const addMonths = (date, months) => new Date(date.getFullYear(), date.getMonth() + months, 1);

const getPreviousMonthKey = (date = new Date()) => monthKey(addMonths(date, -1));

const getWeekStartDate = (value = new Date()) => {
  const date = parseDate(value) || new Date();
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
};

const getDateValue = (entity = {}) => (
  entity.date ||
  entity.orderDate ||
  entity.requestDate ||
  entity.dispatchDate ||
  entity.importDate ||
  entity.paymentDate ||
  entity.expenseDate ||
  entity.createdAt ||
  entity.updatedAt ||
  entity.timestamp ||
  ''
);

const isArchived = (item = {}) => item.archived || item.isArchived || item.deleted || item.isDeleted;
const isCancelled = (item = {}) => ['cancelled', 'canceled', 'deleted'].includes(normalizeText(item.status));

const getItems = (order = {}) => (
  toArray(order.items).length ? toArray(order.items) :
  toArray(order.lines).length ? toArray(order.lines) :
  toArray(order.products)
);

const itemQuantity = (item = {}) => toNumber(
  item.quantity ?? item.qty ?? item.weight ?? item.weightKg ?? item.kg ?? item.count ?? item.pieceCount
);

const itemUnitPrice = (item = {}) => toNumber(
  item.unitPrice ?? item.price ?? item.unit_price ?? item.salePrice ?? item.finalPrice
);

const itemCost = (item = {}) => toNumber(
  item.costPrice ?? item.cost ?? item.unitCost ?? item.purchasePrice
);

const itemLineTotal = (item = {}) => {
  const direct = toNumber(item.total ?? item.lineTotal ?? item.amount ?? item.subtotal, NaN);
  if (Number.isFinite(direct)) return direct;
  return itemQuantity(item) * itemUnitPrice(item);
};

const orderTotal = (order = {}) => {
  const direct = toNumber(order.totalAmount ?? order.grandTotal ?? order.total ?? order.amount ?? order.finalAmount, NaN);
  if (Number.isFinite(direct)) return direct;
  return getItems(order).reduce((sum, item) => sum + itemLineTotal(item), 0);
};

const orderProfit = (order = {}) => {
  const direct = toNumber(order.profit ?? order.netProfit ?? order.grossProfit, NaN);
  if (Number.isFinite(direct)) return direct;
  const revenue = orderTotal(order);
  const directCost = toNumber(order.costAmount ?? order.totalCost ?? order.costOfGoods, NaN);
  if (Number.isFinite(directCost)) return revenue - directCost;
  const itemCostTotal = getItems(order).reduce((sum, item) => sum + itemQuantity(item) * itemCost(item), 0);
  return itemCostTotal > 0 ? revenue - itemCostTotal : revenue;
};

const paidAmountOfOrder = (order = {}) => toNumber(
  order.paidAmount ?? order.receivedAmount ?? order.upfrontPayment ?? order.prepaidAmount ?? order.deposit
);

const outstandingOfOrder = (order = {}) => {
  const direct = toNumber(order.outstandingAmount ?? order.remainingAmount ?? order.debtAmount, NaN);
  if (Number.isFinite(direct)) return Math.max(0, direct);
  return Math.max(0, orderTotal(order) - paidAmountOfOrder(order));
};

const moneyOfPayment = (payment = {}) => toNumber(payment.amount ?? payment.total ?? payment.paidAmount ?? payment.receivedAmount);
const moneyOfExpense = (expense = {}) => toNumber(expense.amount ?? expense.total ?? expense.cost ?? expense.value);
const isInventoryPurchaseExpense = (expense = {}) => (
  normalizeText(expense.sourceType || expense.source || expense.origin) === 'warehouse_import_purchase' ||
  Boolean(expense.sourceWarehouseImportId || expense.warehouseImportId || expense.importId) ||
  (
    /mua hang|nhap kho|nguyen lieu|hang song/.test(normalizeText(expense.category || expense.type || expense.name || expense.title || '')) &&
    Boolean(expense.autoCreated || expense.autoGenerated || expense.linkedToWarehouseImport)
  )
);

const customerNameOf = (entity = {}, customersById = new Map()) => {
  const customer = entity.customerId ? customersById.get(entity.customerId) : null;
  return entity.customerName || entity.customer?.name || entity.name || customer?.name || customer?.displayName || 'Khách chưa rõ';
};

const productNameOf = (item = {}, productsById = new Map()) => {
  const product = item.productId ? productsById.get(item.productId) : null;
  return item.productShortName || item.shortName || product?.shortName || item.productName || item.name || product?.name || 'Sản phẩm';
};

const employeeNameOf = (entity = {}, employeesById = new Map()) => {
  const employeeId = entity.employeeId || entity.salesId || entity.createdBy || entity.staffId || entity.userId;
  const employee = employeeId ? employeesById.get(employeeId) : null;
  return entity.employeeName || entity.salesName || entity.createdByName || employee?.name || 'Chưa rõ nhân viên';
};

const employeeDisplayNameOf = (employee = {}) => (
  employee.name ||
  employee.displayName ||
  employee.fullName ||
  employee.phone ||
  employee.id ||
  'Chưa rõ nhân viên'
);

const isSalesEmployeeRecord = (employee = {}) => {
  const text = normalizeText([
    employee.position,
    employee.role,
    employee.roleName,
    employee.department,
    employee.type,
    employee.title
  ].filter(Boolean).join(' '));
  return /kinh doanh|ban hang|cong tac vien|sales|sale|business|nvkd|ctv/.test(text);
};

const customerSalesEmployeeIdOf = (customer = {}) => String(
  customer.empId ||
  customer.salesEmpId ||
  customer.managerEmpId ||
  customer.salesOwnerId ||
  customer.assignedSalesEmpId ||
  customer.responsibleEmployeeId ||
  customer.employeeId ||
  ''
);

const percentChange = (current, previous) => {
  if (!previous && !current) return 0;
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
};

const sumByDate = (entities, key, amountGetter) => toArray(entities)
  .filter(item => dateKey(getDateValue(item)) === key)
  .reduce((sum, item) => sum + amountGetter(item), 0);

const sumByMonth = (entities, key, amountGetter) => toArray(entities)
  .filter(item => monthKey(getDateValue(item)) === key)
  .reduce((sum, item) => sum + amountGetter(item), 0);

const sumByYear = (entities, year, amountGetter) => toArray(entities)
  .filter(item => dateKey(getDateValue(item)).startsWith(`${year}-`))
  .reduce((sum, item) => sum + amountGetter(item), 0);

const sumByDateRange = (entities, startKey, endKey, amountGetter) => toArray(entities)
  .filter(item => {
    const key = dateKey(getDateValue(item));
    return key && key >= startKey && key <= endKey;
  })
  .reduce((sum, item) => sum + amountGetter(item), 0);

const sumMapByDateRange = (costByDate = new Map(), startKey = '', endKey = '') => (
  [...costByDate.entries()]
    .filter(([key]) => key && key >= startKey && key <= endKey)
    .reduce((sum, [, value]) => sum + toNumber(value), 0)
);

const isInQuarter = (entity, now) => {
  const date = parseDate(getDateValue(entity));
  if (!date) return false;
  const quarter = Math.floor(now.getMonth() / 3);
  return date.getFullYear() === now.getFullYear() && Math.floor(date.getMonth() / 3) === quarter;
};

const buildSeriesDays = ({ orders, expenses, payments, today, days }) => {
  const rows = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const key = dateKey(addDays(today, -index));
    const revenue = sumByDate(orders, key, orderTotal);
    const expense = sumByDate(expenses, key, moneyOfExpense);
    const income = sumByDate(payments, key, moneyOfPayment);
    rows.push({ date: key, revenue, expense, operatingExpense: expense, income, profit: revenue - expense, cashflow: income - expense });
  }
  return rows;
};

const buildSeriesMonths = ({ orders, expenses, payments, today, months }) => {
  const rows = [];
  for (let index = months - 1; index >= 0; index -= 1) {
    const key = monthKey(addMonths(today, -index));
    const revenue = sumByMonth(orders, key, orderTotal);
    const expense = sumByMonth(expenses, key, moneyOfExpense);
    const income = sumByMonth(payments, key, moneyOfPayment);
    rows.push({ month: key, revenue, expense, operatingExpense: expense, income, profit: revenue - expense, cashflow: income - expense });
  }
  return rows;
};

const normalizeInput = (input = {}) => ({
  now: input.now ? new Date(input.now) : new Date(),
  company: input.company || {},
  employee: input.employee || {},
  orders: toCollectionArray(input.orders).filter(item => !isArchived(item) && !isCancelled(item)),
  orderRequests: toCollectionArray(input.orderRequests).filter(item => !isArchived(item) && !isCancelled(item)),
  payments: toCollectionArray(input.payments).filter(item => !isArchived(item)),
  expenses: toCollectionArray(input.expenses).filter(item => !isArchived(item)),
  financials: toCollectionArray(input.financials).filter(item => !isArchived(item)),
  advances: toCollectionArray(input.advances || input.advanceRequests).filter(item => !isArchived(item) && !isCancelled(item)),
  products: toCollectionArray(input.products).filter(item => !isArchived(item)),
  customers: toCollectionArray(input.customers).filter(item => !isArchived(item)),
  employees: toCollectionArray(input.employees).filter(item => !isArchived(item)),
  attendance: toCollectionArray(input.attendance).filter(item => !isArchived(item)),
  warehouseImports: toCollectionArray(input.warehouseImports).filter(item => !isArchived(item)),
  warehouseDispatches: toCollectionArray(input.warehouseDispatches).filter(item => !isArchived(item)),
  warehouseStockCounts: toCollectionArray(input.warehouseStockCounts).filter(item => !isArchived(item)),
  assets: toCollectionArray(input.assets).filter(item => !isArchived(item)),
  assetCostLogs: toCollectionArray(input.assetCostLogs).filter(item => !isArchived(item)),
  deliveryReports: toCollectionArray(input.deliveryReports).filter(item => !isArchived(item))
});

const classifyExpense = (expense = {}) => {
  const text = normalizeText([
    expense.category,
    expense.type,
    expense.name,
    expense.title,
    expense.note,
    expense.description,
    expense.reason
  ].filter(Boolean).join(' '));
  if (/gia von|mua hang|hang hoa|nhap kho|nguyen lieu|hang song/.test(text)) return 'Giá vốn';
  if (/luong|thuong|phat|nhan su|cong nhan|salary|payroll/.test(text)) return 'Lương';
  if (/thue|mat bang|nha xuong|kho bai|rent/.test(text)) return 'Thuê tài sản';
  if (/dien|nuoc|internet|nuoc may/.test(text)) return 'Điện nước';
  if (/xang|dau|van chuyen|giao hang|fuel/.test(text)) return 'Xăng dầu';
  return 'Chi phí khác';
};

const topRows = (map, valueKey = 'value', limit = 10) => [...map.entries()]
  .map(([name, payload]) => {
    const data = typeof payload === 'number' ? { [valueKey]: payload } : payload;
    const displayName = data.name || data.label || name;
    return {
      id: data.id || normalizeText(displayName) || `${valueKey}-${Math.random()}`,
      name: displayName,
      label: displayName,
      value: toNumber(data[valueKey] ?? data.value),
      [valueKey]: toNumber(data[valueKey] ?? data.value),
      revenue: toNumber(data.revenue),
      profit: toNumber(data.profit),
      debt: toNumber(data.debt),
      quantity: toNumber(data.quantity),
      orders: toNumber(data.orders)
    };
  })
  .sort((a, b) => toNumber(b[valueKey]) - toNumber(a[valueKey]))
  .slice(0, limit);

const buildDispatchSignature = (dispatch = {}) => `${dispatch.customerId || normalizeText(dispatch.customerName || dispatch.name)}|${dispatch.productId || normalizeText(dispatch.productName || dispatch.product || dispatch.itemName)}`;
const buildRequestSignature = (request = {}) => `${request.customerId || normalizeText(request.customerName || request.name)}|${request.productId || normalizeText(request.productName || request.product || request.itemName)}`;

const isRequestDelivered = (request = {}, dispatches = []) => {
  const signature = buildRequestSignature(request);
  const requestTime = parseDate(getDateValue(request))?.getTime() || 0;
  return dispatches.some(dispatch => {
    if (buildDispatchSignature(dispatch) !== signature) return false;
    const dispatchTime = parseDate(getDateValue(dispatch))?.getTime() || 0;
    return !requestTime || !dispatchTime || dispatchTime >= requestTime;
  });
};

const inventoryValueOfImports = (imports = []) => imports.reduce((sum, item) => {
  const direct = toNumber(item.totalAmount ?? item.amount ?? item.totalCost ?? item.finalAmount, NaN);
  if (Number.isFinite(direct)) return sum + direct;
  return sum + toNumber(item.totalKg ?? item.weightKg ?? item.kg) * toNumber(item.unitPrice ?? item.price);
}, 0);

const inventoryValueOfCounts = (counts = []) => counts.reduce((sum, item) => (
  sum + toNumber(item.value ?? item.totalValue ?? item.amount)
), 0);

export const FinancialService = {
  build(source) {
    const today = source.now;
    const todayKey = dateKey(today);
    const yesterdayKey = dateKey(addDays(today, -1));
    const weekStartKey = dateKey(getWeekStartDate(today));
    const weekEndKey = todayKey;
    const currentMonthKey = monthKey(today);
    const previousMonthKey = getPreviousMonthKey(today);
    const year = today.getFullYear();

    const revenueToday = sumByDate(source.orders, todayKey, orderTotal);
    const revenueYesterday = sumByDate(source.orders, yesterdayKey, orderTotal);
    const revenueWeek = sumByDateRange(source.orders, weekStartKey, weekEndKey, orderTotal);
    const revenueMonth = sumByMonth(source.orders, currentMonthKey, orderTotal);
    const revenuePreviousMonth = sumByMonth(source.orders, previousMonthKey, orderTotal);
    const expenseToday = sumByDate(source.expenses, todayKey, moneyOfExpense);
    const expenseYesterday = sumByDate(source.expenses, yesterdayKey, moneyOfExpense);
    const expenseWeek = sumByDateRange(source.expenses, weekStartKey, weekEndKey, moneyOfExpense);
    const expenseMonth = sumByMonth(source.expenses, currentMonthKey, moneyOfExpense);
    const expensePreviousMonth = sumByMonth(source.expenses, previousMonthKey, moneyOfExpense);
    const operatingExpenseToday = expenseToday;
    const operatingExpenseYesterday = expenseYesterday;
    const operatingExpenseWeek = expenseWeek;
    const operatingExpenseMonth = expenseMonth;
    const operatingExpensePreviousMonth = expensePreviousMonth;
    const incomeToday = sumByDate(source.payments, todayKey, moneyOfPayment);
    const outcomeToday = expenseToday;
    const incomeWeek = sumByDateRange(source.payments, weekStartKey, weekEndKey, moneyOfPayment);
    const outcomeWeek = expenseWeek;
    const incomeMonth = sumByMonth(source.payments, currentMonthKey, moneyOfPayment);
    const outcomeMonth = expenseMonth;
    const profitToday = revenueToday - expenseToday;
    const profitYesterday = revenueYesterday - expenseYesterday;
    const profitWeek = revenueWeek - expenseWeek;
    const profitMonth = revenueMonth - expenseMonth;
    const profitPreviousMonth = revenuePreviousMonth - expensePreviousMonth;
    const quarterProfit = source.orders.filter(order => isInQuarter(order, today)).reduce((sum, order) => sum + orderTotal(order), 0)
      - source.expenses.filter(expense => isInQuarter(expense, today)).reduce((sum, expense) => sum + moneyOfExpense(expense), 0);
    const yearProfit = sumByYear(source.orders, year, orderTotal) - sumByYear(source.expenses, year, moneyOfExpense);

    const customerProfileReceivable = source.customers.reduce((sum, customer) => (
      sum + Math.max(0, toNumber(customer.currentDebt ?? customer.debt ?? customer.balanceDue))
    ), 0);
    const orderReceivable = source.orders.reduce((sum, order) => sum + outstandingOfOrder(order), 0);
    const receivables = orderReceivable > 0 ? orderReceivable : customerProfileReceivable;
    const payables = source.expenses
      .filter(expense => ['pending', 'unpaid', 'draft'].includes(normalizeText(expense.status)) || expense.isPaid === false)
      .reduce((sum, expense) => sum + moneyOfExpense(expense), 0);
    const overdueReceivables = source.orders.reduce((sum, order) => {
      const dueDate = parseDate(order.dueDate || order.paymentDueDate);
      const outstanding = outstandingOfOrder(order);
      return dueDate && dueDate < today && outstanding > 0 ? sum + outstanding : sum;
    }, 0);
    const cashBalance = source.payments.reduce((sum, item) => sum + moneyOfPayment(item), 0)
      - source.expenses.reduce((sum, item) => sum + moneyOfExpense(item), 0);
    const cashflowMonth = incomeMonth - outcomeMonth;
    const cashflowPreviousMonth = sumByMonth(source.payments, previousMonthKey, moneyOfPayment) - expensePreviousMonth;

    const series7Days = buildSeriesDays({ orders: source.orders, expenses: source.expenses, payments: source.payments, today, days: 7 });
    const series30Days = buildSeriesDays({ orders: source.orders, expenses: source.expenses, payments: source.payments, today, days: 30 });
    const series12Months = buildSeriesMonths({ orders: source.orders, expenses: source.expenses, payments: source.payments, today, months: 12 });

    const costBreakdownMap = new Map();
    source.expenses
      .filter(expense => monthKey(getDateValue(expense)) === currentMonthKey)
      .forEach(expense => {
        const category = classifyExpense(expense);
        costBreakdownMap.set(category, (costBreakdownMap.get(category) || 0) + moneyOfExpense(expense));
      });
    const costBreakdown = ['Giá vốn', 'Lương', 'Thuê tài sản', 'Điện nước', 'Xăng dầu', 'Chi phí khác']
      .map(name => ({ name, value: costBreakdownMap.get(name) || 0 }));

    return {
      todayKey,
      yesterdayKey,
      weekStartKey,
      weekEndKey,
      currentMonthKey,
      previousMonthKey,
      revenueToday,
      revenueYesterday,
      revenueWeek,
      revenueMonth,
      revenuePreviousMonth,
      revenueChangePct: percentChange(revenueMonth, revenuePreviousMonth),
      profitToday,
      profitYesterday,
      profitWeek,
      profitMonth,
      profitPreviousMonth,
      quarterProfit,
      yearProfit,
      expenseToday,
      expenseYesterday,
      expenseWeek,
      expenseMonth,
      expensePreviousMonth,
      operatingExpenseToday,
      operatingExpenseYesterday,
      operatingExpenseWeek,
      operatingExpenseMonth,
      operatingExpensePreviousMonth,
      expenseChangePct: percentChange(expenseMonth, expensePreviousMonth),
      incomeToday,
      outcomeToday,
      incomeWeek,
      outcomeWeek,
      incomeMonth,
      outcomeMonth,
      cashBalance,
      cashflowMonth,
      cashflowPreviousMonth,
      receivables,
      payables,
      overdueReceivables,
      series7Days,
      series30Days,
      dailyCashflowRows: series30Days,
      series12Months,
      costBreakdown
    };
  }
};

export const CostAnalysisService = {
  build(source, finance) {
    const currentMonthKey = finance.currentMonthKey;
    const previousMonthKey = finance.previousMonthKey;
    const daysPassed = Math.max(1, source.now.getDate());
    const payrollRows = payrollEmployeesOf(source.employees, source.now);
    const activeEmployees = payrollRows.length || 1;
    const salaryMonth = payrollRows.reduce((sum, row) => sum + row.salary, 0);
    const byDepartmentMap = new Map();

    payrollRows.forEach(({ employee, salary }) => {
      const department = formatDepartmentLabel(
        employee.position || employee.department || employee.roleName || employee.role,
        'Chưa phân bộ phận'
      );
      byDepartmentMap.set(department, (byDepartmentMap.get(department) || 0) + salary);
    });
    source.expenses
      .filter(expense => monthKey(getDateValue(expense)) === currentMonthKey)
      .forEach(expense => {
        const department = formatDepartmentLabel(expense.department || expense.departmentName || expense.team, 'Chi phí chung');
        byDepartmentMap.set(department, (byDepartmentMap.get(department) || 0) + moneyOfExpense(expense));
      });

    return {
      totalMonth: finance.expenseMonth,
      previousMonth: finance.expensePreviousMonth,
      averageDaily: finance.expenseMonth / daysPassed,
      salaryMonth,
      salaryAverageDaily: salaryMonth / daysPassed,
      salaryAverageEmployee: salaryMonth / activeEmployees,
      salaryToRevenuePct: finance.revenueMonth > 0 ? (salaryMonth / finance.revenueMonth) * 100 : 0,
      byDepartment: [...byDepartmentMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      trend: {
        currentMonth: finance.expenseMonth,
        previousMonth: finance.expensePreviousMonth,
        changePct: percentChange(finance.expenseMonth, finance.expensePreviousMonth)
      }
    };
  }
};

const productGroupOf = (entity = {}, productsById = new Map()) => {
  const product = entity.productId ? productsById.get(entity.productId) : null;
  return (
    entity.mainGroup ||
    entity.groupName ||
    entity.productGroup ||
    entity.category ||
    product?.mainGroup ||
    product?.groupName ||
    product?.productGroup ||
    product?.category ||
    product?.name ||
    entity.productName ||
    entity.name ||
    'Chưa phân nhóm'
  );
};

const productProfitKeyOf = (entity = {}, productsById = new Map()) => {
  const product = entity.productId ? productsById.get(entity.productId) : null;
  return (
    entity.productId ||
    product?.id ||
    normalizeText(entity.productName || entity.name || entity.groupName || product?.name || product?.shortName || 'san-pham')
  );
};

const inventoryCostKeyOf = (entity = {}, productsById = new Map()) => {
  const group = productGroupOf(entity, productsById);
  return normalizeText(group || productProfitKeyOf(entity, productsById) || 'san-pham');
};

const quantityUnitOf = (entity = {}, fallback = 'đơn vị') => (
  entity.quantityUnit ||
  entity.unit ||
  entity.stockUnit ||
  entity.productUnit ||
  fallback
);

const importQuantityOf = (item = {}) => toNumber(
  item.quantity ??
  item.totalQuantity ??
  item.count ??
  item.pieceCount ??
  item.packageCount
);

const importKgOf = (item = {}) => toNumber(
  item.totalKg ??
  item.weightKg ??
  item.kg ??
  item.weight
);

const dispatchQuantityOf = (item = {}) => toNumber(
  item.quantity ??
  item.pieceCount ??
  item.quantityCount ??
  item.totalQuantity ??
  item.count
);

const dispatchKgOf = (item = {}) => toNumber(
  item.weightKg ??
  item.totalKg ??
  item.kg ??
  item.weight
);

const addQuantityByUnit = (target = {}, unit = '', value = 0) => {
  const normalizedUnit = String(unit || '').trim() || 'đv';
  const quantity = toNumber(value);
  if (quantity <= 0) return target;
  target[normalizedUnit] = (target[normalizedUnit] || 0) + quantity;
  return target;
};

const mergeQuantityByUnit = (target = {}, source = {}) => {
  Object.entries(source || {}).forEach(([unit, value]) => addQuantityByUnit(target, unit, value));
  return target;
};

const PROFIT_QUANTITY_UNIT_PRIORITY = ['Con', 'Kg', 'Bo', 'Bao', 'Boc', 'Thung', 'Cai'];

const selectPrimaryProfitQuantity = (quantityByUnit = {}, preferredUnit = '') => {
  const entries = Object.entries(quantityByUnit || {})
    .map(([unit, value]) => ({ unit, quantity: toNumber(value) }))
    .filter(entry => entry.quantity > 0);
  if (!entries.length) return null;
  const priorityUnits = [preferredUnit, ...PROFIT_QUANTITY_UNIT_PRIORITY].filter(Boolean);
  for (const priorityUnit of priorityUnits) {
    const match = entries.find(entry => normalizeText(entry.unit) === normalizeText(priorityUnit));
    if (match) return match;
  }
  return entries[0];
};

const profitQuantityBasisOf = (row = {}) => {
  const dispatchBasis = selectPrimaryProfitQuantity(row.dispatchQuantitiesByUnit, row.unit);
  if (dispatchBasis?.quantity > 0) return dispatchBasis;
  const soldQuantity = toNumber(row.soldQuantity ?? row.quantitySold);
  if (soldQuantity > 0) return { unit: row.unit || 'dv', quantity: soldQuantity };
  const inputQuantity = toNumber(row.inputQuantity ?? row.todayInputQty);
  if (inputQuantity > 0) return { unit: row.unit || 'dv', quantity: inputQuantity };
  return { unit: row.unit || 'dv', quantity: 0 };
};

const importValueOf = (item = {}) => {
  const direct = toNumber(item.amount ?? item.totalAmount ?? item.total ?? item.value ?? item.costAmount, NaN);
  if (Number.isFinite(direct)) return direct;
  const kg = importKgOf(item);
  const quantity = importQuantityOf(item);
  const unitPrice = toNumber(item.unitPrice ?? item.price ?? item.costPrice ?? item.purchasePrice);
  if (kg > 0 && unitPrice > 0) return kg * unitPrice;
  if (quantity > 0 && unitPrice > 0) return quantity * unitPrice;
  return 0;
};

const PROFIT_EVENT_ORDER = { import: 0, dispatch: 1, sale: 1, revenue: 2 };

const sortProfitEvents = (a, b) => {
  const dayCompare = a.dateKey.localeCompare(b.dateKey);
  if (dayCompare !== 0) return dayCompare;
  if (a.type === b.type) return 0;
  return (PROFIT_EVENT_ORDER[a.type] ?? 9) - (PROFIT_EVENT_ORDER[b.type] ?? 9);
};

const buildProfitRow = (state = {}) => {
  const soldQuantity = toNumber(state.todaySoldQty);
  const revenue = toNumber(state.todayRevenue);
  const inputCost = toNumber(state.todayCost);
  const profit = revenue - inputCost;
  const dispatchQuantitiesByUnit = { ...(state.dispatchQuantitiesByUnit || {}) };
  const quantityBasis = profitQuantityBasisOf({
    ...state,
    soldQuantity,
    quantitySold: soldQuantity,
    inputQuantity: toNumber(state.todayInputQty),
    dispatchQuantitiesByUnit
  });
  const costQuantity = toNumber(quantityBasis.quantity);
  const averageInputCost = costQuantity > 0
    ? inputCost / costQuantity
    : (state.todayInputQty > 0
      ? state.todayInputValue / state.todayInputQty
      : (state.carryQty > 0 ? state.carryValue / state.carryQty : 0));
  const averageSalePrice = costQuantity > 0 ? revenue / costQuantity : 0;
  return {
    id: state.key,
    name: state.name,
    groupName: state.groupName,
    unit: state.unit || 'đơn vị',
    inputQuantity: toNumber(state.todayInputQty),
    inputKg: toNumber(state.todayInputKg),
    inputValue: toNumber(state.todayInputValue),
    soldQuantity,
    quantitySold: soldQuantity,
    dispatchQuantitiesByUnit,
    revenue,
    inputCost,
    cost: inputCost,
    costQuantity,
    costQuantityUnit: quantityBasis.unit,
    averageInputCost,
    averageSalePrice,
    profitPerUnit: averageSalePrice - averageInputCost,
    profit,
    carryoverQuantity: Math.max(0, toNumber(state.carryQty)),
    carryoverValue: Math.max(0, toNumber(state.carryValue)),
    value: profit
  };
};

const aggregateProfitRowsByGroup = (rows = []) => {
  const groupMap = new Map();
  rows.forEach(row => {
    const key = normalizeText(row.groupName || row.name) || 'chua-phan-nhom';
    const current = groupMap.get(key) || {
      id: key,
      name: row.groupName || row.name || 'Chưa phân nhóm',
      groupName: row.groupName || row.name || 'Chưa phân nhóm',
      unit: row.unit || 'đơn vị',
      inputQuantity: 0,
      inputKg: 0,
      inputValue: 0,
      soldQuantity: 0,
      quantitySold: 0,
      dispatchQuantitiesByUnit: {},
      revenue: 0,
      inputCost: 0,
      cost: 0,
      profit: 0,
      carryoverQuantity: 0,
      carryoverValue: 0,
      products: 0
    };
    current.inputQuantity += row.inputQuantity || 0;
    current.inputKg += row.inputKg || 0;
    current.inputValue += row.inputValue || 0;
    current.soldQuantity += row.soldQuantity || 0;
    current.quantitySold = current.soldQuantity;
    mergeQuantityByUnit(current.dispatchQuantitiesByUnit, row.dispatchQuantitiesByUnit);
    current.revenue += row.revenue || 0;
    current.inputCost += row.inputCost || 0;
    current.cost = current.inputCost;
    current.profit += row.profit || 0;
    current.carryoverQuantity += row.carryoverQuantity || 0;
    current.carryoverValue += row.carryoverValue || 0;
    current.products += 1;
    groupMap.set(key, current);
  });
  return [...groupMap.values()]
    .map(row => {
      const quantityBasis = profitQuantityBasisOf(row);
      const costQuantity = toNumber(quantityBasis.quantity);
      return {
        ...row,
        costQuantity,
        costQuantityUnit: quantityBasis.unit,
        averageInputCost: costQuantity > 0 ? row.inputCost / costQuantity : (row.inputQuantity > 0 ? row.inputValue / row.inputQuantity : 0),
        averageSalePrice: costQuantity > 0 ? row.revenue / costQuantity : 0,
        profitPerUnit: costQuantity > 0 ? row.profit / costQuantity : 0,
        value: row.profit
      };
    })
    .sort((a, b) => b.profit - a.profit);
};

export const ProfitabilityService = {
  build(source, finance) {
    const todayKey = finance.todayKey || dateKey(source.now);
    const productsById = new Map(source.products.map(product => [product.id, product]));
    const dispatchSummaryMap = new Map();
    const dispatchUsageKeysByDate = new Set();
    const events = [];

    source.warehouseDispatches.forEach(dispatch => {
      const eventDateKey = dateKey(getDateValue(dispatch));
      if (!eventDateKey || eventDateKey > todayKey) return;
      const quantity = dispatchQuantityOf(dispatch);
      const kg = dispatchKgOf(dispatch);
      if (quantity <= 0 && kg <= 0) return;
      const key = inventoryCostKeyOf(dispatch, productsById);
      dispatchUsageKeysByDate.add(`${eventDateKey}__${key}`);
      events.push({
        type: 'dispatch',
        dateKey: eventDateKey,
        key,
        name: productNameOf(dispatch, productsById),
        groupName: productGroupOf(dispatch, productsById),
        unit: quantity > 0 ? quantityUnitOf(dispatch, 'Con') : 'Kg',
        quantity: quantity > 0 ? quantity : kg,
        kg,
        fallbackCostPerUnit: itemCost(dispatch)
      });
      if (eventDateKey !== todayKey) return;
      const summary = dispatchSummaryMap.get(key) || {
        key,
        name: productNameOf(dispatch, productsById),
        groupName: productGroupOf(dispatch, productsById),
        unit: quantityUnitOf(dispatch, kg > 0 ? 'Kg' : 'Con'),
        dispatchQuantitiesByUnit: {}
      };
      if (quantity > 0) addQuantityByUnit(summary.dispatchQuantitiesByUnit, quantityUnitOf(dispatch, 'Con'), quantity);
      if (kg > 0) addQuantityByUnit(summary.dispatchQuantitiesByUnit, 'Kg', kg);
      dispatchSummaryMap.set(key, summary);
    });

    source.warehouseImports.forEach(item => {
      const eventDateKey = dateKey(getDateValue(item));
      if (!eventDateKey || eventDateKey > todayKey) return;
      const quantity = importQuantityOf(item);
      const kg = importKgOf(item);
      const value = importValueOf(item);
      const primaryQuantity = quantity > 0 ? quantity : kg;
      if (primaryQuantity <= 0 && value <= 0) return;
      const key = inventoryCostKeyOf(item, productsById);
      const name = item.productName || item.name || item.groupName || item.productGroup || productNameOf(item, productsById);
      events.push({
        type: 'import',
        dateKey: eventDateKey,
        key,
        name,
        groupName: productGroupOf(item, productsById),
        unit: quantity > 0 ? quantityUnitOf(item, 'con') : 'kg',
        quantity: primaryQuantity,
        kg,
        value
      });
    });

    source.orders.forEach(order => {
      const eventDateKey = dateKey(getDateValue(order));
      if (!eventDateKey || eventDateKey > todayKey) return;
      getItems(order).forEach(item => {
        const quantity = itemQuantity(item);
        const revenue = itemLineTotal(item);
        if (quantity <= 0 && revenue <= 0) return;
        const key = inventoryCostKeyOf(item, productsById);
        events.push({
          type: 'revenue',
          dateKey: eventDateKey,
          key,
          name: productNameOf(item, productsById),
          groupName: productGroupOf(item, productsById),
          unit: quantityUnitOf(item, productsById.get(item.productId)?.unit || 'đơn vị'),
          quantity,
          revenue,
          fallbackCostPerUnit: itemCost(item)
        });
        if (dispatchUsageKeysByDate.has(`${eventDateKey}__${key}`)) return;
        events.push({
          type: 'sale',
          dateKey: eventDateKey,
          key,
          name: productNameOf(item, productsById),
          groupName: productGroupOf(item, productsById),
          unit: quantityUnitOf(item, productsById.get(item.productId)?.unit || 'dv'),
          quantity,
          fallbackCostPerUnit: itemCost(item)
        });
      });
    });

    const stateMap = new Map();
    const ensureState = (event) => {
      if (!stateMap.has(event.key)) {
        stateMap.set(event.key, {
          key: event.key,
          name: event.name,
          groupName: event.groupName,
          unit: event.unit,
          carryQty: 0,
          carryValue: 0,
          todayInputQty: 0,
          todayInputKg: 0,
          todayInputValue: 0,
          todaySoldQty: 0,
          todayRevenue: 0,
          todayCost: 0,
          dispatchQuantitiesByUnit: {}
        });
      }
      const state = stateMap.get(event.key);
      state.name = state.name || event.name;
      state.groupName = state.groupName || event.groupName;
      state.unit = state.unit || event.unit;
      return state;
    };

    events.sort(sortProfitEvents).forEach(event => {
      const state = ensureState(event);
      if (event.type === 'import') {
        state.carryQty += event.quantity;
        state.carryValue += event.value;
        if (event.dateKey === todayKey) {
          state.todayInputQty += event.quantity;
          state.todayInputKg += event.kg || 0;
          state.todayInputValue += event.value;
        }
        return;
      }

      if (event.type === 'revenue') {
        if (event.dateKey === todayKey) {
          state.todayRevenue += event.revenue || 0;
        }
        return;
      }

      const quantity = event.quantity || 0;
      const averageCost = state.carryQty > 0
        ? state.carryValue / state.carryQty
        : toNumber(event.fallbackCostPerUnit);
      const saleCost = quantity * averageCost;
      state.carryQty = Math.max(0, state.carryQty - quantity);
      state.carryValue = Math.max(0, state.carryValue - saleCost);
      if (event.dateKey === todayKey) {
        state.todaySoldQty += quantity;
        state.todayCost += saleCost;
      }
    });

    dispatchSummaryMap.forEach(summary => {
      const state = ensureState(summary);
      mergeQuantityByUnit(state.dispatchQuantitiesByUnit, summary.dispatchQuantitiesByUnit);
    });

    const productRows = [...stateMap.values()]
      .map(buildProfitRow)
      .filter(row => (
        row.inputQuantity > 0 ||
        row.soldQuantity > 0 ||
        row.carryoverQuantity > 0 ||
        row.revenue > 0 ||
        Object.keys(row.dispatchQuantitiesByUnit || {}).length > 0
      ))
      .sort((a, b) => b.profit - a.profit);
    const groupRows = aggregateProfitRowsByGroup(productRows);
    const totals = productRows.reduce((sum, row) => ({
      revenue: sum.revenue + row.revenue,
      inputCost: sum.inputCost + row.inputCost,
      profit: sum.profit + row.profit,
      soldQuantity: sum.soldQuantity + row.soldQuantity,
      carryoverQuantity: sum.carryoverQuantity + row.carryoverQuantity,
      carryoverValue: sum.carryoverValue + row.carryoverValue
    }), { revenue: 0, inputCost: 0, profit: 0, soldQuantity: 0, carryoverQuantity: 0, carryoverValue: 0 });

    return {
      todayKey,
      totals,
      productRows,
      groupRows,
      topProduct: productRows.find(row => row.profit > 0) || productRows[0] || null,
      topGroup: groupRows.find(row => row.profit > 0) || groupRows[0] || null
    };
  }
};

const buildInventorySoldCostByDate = (source = {}, endDateKey = '') => {
  const productsById = new Map(source.products.map(product => [product.id, product]));
  const dispatchUsageKeysByDate = new Set();
  const events = [];

  source.warehouseDispatches.forEach(dispatch => {
    const eventDateKey = dateKey(getDateValue(dispatch));
    if (!eventDateKey || (endDateKey && eventDateKey > endDateKey)) return;
    const quantity = dispatchQuantityOf(dispatch);
    const kg = dispatchKgOf(dispatch);
    const primaryQuantity = quantity > 0 ? quantity : kg;
    if (primaryQuantity <= 0) return;
    const key = inventoryCostKeyOf(dispatch, productsById);
    dispatchUsageKeysByDate.add(`${eventDateKey}__${key}`);
    events.push({
      type: 'sale',
      dateKey: eventDateKey,
      key,
      quantity: primaryQuantity,
      fallbackCostPerUnit: itemCost(dispatch)
    });
  });

  source.warehouseImports.forEach(item => {
    const eventDateKey = dateKey(getDateValue(item));
    if (!eventDateKey || (endDateKey && eventDateKey > endDateKey)) return;
    const quantity = importQuantityOf(item);
    const kg = importKgOf(item);
    const value = importValueOf(item);
    const primaryQuantity = quantity > 0 ? quantity : kg;
    if (primaryQuantity <= 0 && value <= 0) return;
    events.push({
      type: 'import',
      dateKey: eventDateKey,
      key: inventoryCostKeyOf(item, productsById),
      quantity: primaryQuantity,
      value
    });
  });

  source.orders.forEach(order => {
    const eventDateKey = dateKey(getDateValue(order));
    if (!eventDateKey || (endDateKey && eventDateKey > endDateKey)) return;
    getItems(order).forEach(item => {
      const quantity = itemQuantity(item);
      const revenue = itemLineTotal(item);
      if (quantity <= 0 && revenue <= 0) return;
      const key = inventoryCostKeyOf(item, productsById);
      if (dispatchUsageKeysByDate.has(`${eventDateKey}__${key}`)) return;
      events.push({
        type: 'sale',
        dateKey: eventDateKey,
        key,
        quantity,
        fallbackCostPerUnit: itemCost(item)
      });
    });
  });

  const stateMap = new Map();
  const costByDate = new Map();
  events.sort(sortProfitEvents).forEach(event => {
    const state = stateMap.get(event.key) || { carryQty: 0, carryValue: 0 };
    if (event.type === 'import') {
      state.carryQty += event.quantity || 0;
      state.carryValue += event.value || 0;
      stateMap.set(event.key, state);
      return;
    }

    const quantity = event.quantity || 0;
    const averageCost = state.carryQty > 0
      ? state.carryValue / state.carryQty
      : toNumber(event.fallbackCostPerUnit);
    const saleCost = quantity * averageCost;
    state.carryQty = Math.max(0, state.carryQty - quantity);
    state.carryValue = Math.max(0, state.carryValue - saleCost);
    stateMap.set(event.key, state);
    costByDate.set(event.dateKey, (costByDate.get(event.dateKey) || 0) + saleCost);
  });

  return costByDate;
};

const sumInventorySoldCostByMonth = (costByDate = new Map(), targetMonthKey = '') => (
  [...costByDate.entries()]
    .filter(([key]) => key.startsWith(targetMonthKey))
    .reduce((sum, [, value]) => sum + toNumber(value), 0)
);

export const BusinessAnalysisService = {
  build(source, finance, profitability = {}) {
    const customersById = new Map();
    source.customers.forEach(customer => {
      if (customer.id) customersById.set(customer.id, customer);
      if (customer.id) customersById.set(String(customer.id), customer);
      if (customer.customerId) customersById.set(String(customer.customerId), customer);
    });
    const customersByName = new Map();
    source.customers.forEach(customer => {
      const nameKey = normalizeText(customer.name || customer.displayName || customer.customerName);
      if (nameKey && !customersByName.has(nameKey)) customersByName.set(nameKey, customer);
    });
    const productsById = new Map(source.products.map(product => [product.id, product]));
    const employeesById = new Map();
    source.employees.forEach(employee => {
      if (employee.id) employeesById.set(employee.id, employee);
      if (employee.id) employeesById.set(String(employee.id), employee);
      if (employee.employeeId) employeesById.set(String(employee.employeeId), employee);
    });
    const customerRevenue = new Map();
    const customerProfit = new Map();
    const customerDebt = new Map();
    const productRevenue = new Map();
    const productProfit = new Map();
    const productProfitByDay = new Map();
    const employeeRevenue = new Map();
    const employeeProfit = new Map();
    const salesEmployees = source.employees.filter(isSalesEmployeeRecord);
    salesEmployees.forEach(employee => {
      const employeeId = String(employee.id || employee.employeeId || employeeDisplayNameOf(employee));
      const employeeName = employeeDisplayNameOf(employee);
      employeeRevenue.set(employeeId, { id: employeeId, name: employeeName, revenue: 0, orders: 0 });
      employeeProfit.set(employeeId, { id: employeeId, name: employeeName, profit: 0, orders: 0 });
    });
    const customerOfOrder = (order = {}) => {
      const customerId = order.customerId || order.customer?.id || order.customer?.customerId || '';
      const customerNameKey = normalizeText(order.customerName || order.customer?.name || order.name);
      return (
        (customerId ? customersById.get(customerId) || customersById.get(String(customerId)) : null) ||
        (customerNameKey ? customersByName.get(customerNameKey) : null) ||
        null
      );
    };
    const salesOwnerOfOrder = (order = {}) => {
      const customer = customerOfOrder(order);
      const customerSalesEmpId = customerSalesEmployeeIdOf(customer || {});
      const customerSalesEmployee = customerSalesEmpId ? employeesById.get(customerSalesEmpId) : null;
      if (customerSalesEmployee) {
        const employeeId = String(customerSalesEmployee.id || customerSalesEmpId);
        return { id: employeeId, name: employeeDisplayNameOf(customerSalesEmployee) };
      }
      const orderSalesEmpId = String(
        order.salesEmpId ||
        order.assignedSalesEmpId ||
        order.responsibleEmployeeId ||
        order.employeeId ||
        order.empId ||
        ''
      );
      const orderSalesEmployee = orderSalesEmpId ? employeesById.get(orderSalesEmpId) : null;
      if (orderSalesEmployee) {
        const employeeId = String(orderSalesEmployee.id || orderSalesEmpId);
        return { id: employeeId, name: employeeDisplayNameOf(orderSalesEmployee) };
      }
      const fallbackName = customer?.managerName || customer?.salesName || employeeNameOf(order, employeesById);
      return { id: normalizeText(fallbackName), name: fallbackName };
    };
    const profitabilityProductRows = toArray(profitability.productRows);
    const profitabilityCostByKey = new Map();
    const rememberProfitabilityCost = (key, row) => {
      const normalizedKey = normalizeText(key);
      if (!normalizedKey || profitabilityCostByKey.has(normalizedKey)) return;
      profitabilityCostByKey.set(normalizedKey, row);
    };

    profitabilityProductRows.forEach(row => {
      rememberProfitabilityCost(row.id, row);
      rememberProfitabilityCost(row.name, row);
      rememberProfitabilityCost(row.groupName, row);
    });

    const costRowForItem = (item = {}) => {
      const product = item.productId ? productsById.get(item.productId) : null;
      return (
        profitabilityCostByKey.get(inventoryCostKeyOf(item, productsById)) ||
        profitabilityCostByKey.get(normalizeText(item.productName || item.name || product?.name || product?.shortName)) ||
        profitabilityCostByKey.get(normalizeText(item.groupName || item.productGroup || product?.groupName || product?.productGroup))
      );
    };

    const itemProfitFromProfitability = (item = {}) => {
      const revenue = itemLineTotal(item);
      const quantity = itemQuantity(item);
      const costRow = costRowForItem(item);
      const averageCost = toNumber(costRow?.averageInputCost, NaN);
      if (quantity > 0 && Number.isFinite(averageCost) && averageCost > 0) {
        return { profit: revenue - quantity * averageCost, hasCost: true };
      }
      const fallbackCost = itemCost(item);
      if (quantity > 0 && fallbackCost > 0) {
        return { profit: revenue - quantity * fallbackCost, hasCost: true };
      }
      return { profit: revenue, hasCost: false };
    };

    const orderProfitFromProfitability = (order = {}) => {
      let hasCost = false;
      const profit = getItems(order).reduce((sum, item) => {
        const itemProfit = itemProfitFromProfitability(item);
        hasCost = hasCost || itemProfit.hasCost;
        return sum + itemProfit.profit;
      }, 0);
      return hasCost ? profit : orderProfit(order);
    };

    source.customers.forEach(customer => {
      const name = customer.name || customer.displayName || 'Khách chưa rõ';
      const debt = Math.max(0, toNumber(customer.currentDebt ?? customer.debt ?? customer.balanceDue));
      if (debt > 0) customerDebt.set(name, { debt, value: debt });
    });

    source.orders.forEach(order => {
      const customerName = customerNameOf(order, customersById);
      const salesOwner = salesOwnerOfOrder(order);
      const employeeKey = salesOwner.id || normalizeText(salesOwner.name);
      const revenue = orderTotal(order);
      const profit = orderProfitFromProfitability(order);
      const debt = outstandingOfOrder(order);
      const currentCustomerRevenue = customerRevenue.get(customerName) || { revenue: 0, orders: 0 };
      customerRevenue.set(customerName, { revenue: currentCustomerRevenue.revenue + revenue, orders: currentCustomerRevenue.orders + 1 });
      customerProfit.set(customerName, { profit: (customerProfit.get(customerName)?.profit || 0) + profit });
      if (debt > 0) customerDebt.set(customerName, { debt: (customerDebt.get(customerName)?.debt || 0) + debt });
      const currentEmployeeRevenue = employeeRevenue.get(employeeKey) || { id: employeeKey, name: salesOwner.name, revenue: 0, orders: 0 };
      employeeRevenue.set(employeeKey, {
        ...currentEmployeeRevenue,
        revenue: currentEmployeeRevenue.revenue + revenue,
        orders: currentEmployeeRevenue.orders + 1
      });
      const currentEmployeeProfit = employeeProfit.get(employeeKey) || { id: employeeKey, name: salesOwner.name, profit: 0, orders: 0 };
      employeeProfit.set(employeeKey, {
        ...currentEmployeeProfit,
        profit: currentEmployeeProfit.profit + profit,
        orders: currentEmployeeProfit.orders + 1
      });
      const orderDay = dateKey(getDateValue(order));

      getItems(order).forEach(item => {
        const productName = productNameOf(item, productsById);
        const itemRevenue = itemLineTotal(item);
        const itemQty = itemQuantity(item);
        const itemProfit = itemProfitFromProfitability(item).profit;
        const productRevenueRow = productRevenue.get(productName) || { revenue: 0, quantity: 0 };
        productRevenue.set(productName, { revenue: productRevenueRow.revenue + itemRevenue, quantity: productRevenueRow.quantity + itemQty });
        const productProfitRow = productProfit.get(productName) || { profit: 0, revenue: 0, quantity: 0 };
        productProfit.set(productName, { profit: productProfitRow.profit + itemProfit, revenue: productProfitRow.revenue + itemRevenue, quantity: productProfitRow.quantity + itemQty });
        if (!productProfitByDay.has(productName)) productProfitByDay.set(productName, new Map());
        const dayMap = productProfitByDay.get(productName);
        dayMap.set(orderDay, (dayMap.get(orderDay) || 0) + itemProfit);
      });
    });

    const topProductsByAverageDailyProfit = [...productProfitByDay.entries()]
      .map(([name, dayMap]) => {
        const totalProfit = [...dayMap.values()].reduce((sum, value) => sum + value, 0);
        const activeDays = Math.max(1, dayMap.size);
        return {
          id: normalizeText(name),
          name,
          profit: totalProfit,
          activeDays,
          averageDailyProfit: totalProfit / activeDays,
          value: totalProfit / activeDays
        };
      })
      .filter(row => row.averageDailyProfit > 0)
      .sort((a, b) => b.averageDailyProfit - a.averageDailyProfit)
      .slice(0, 10);

    const profitabilityTopRows = (rows = [], valueKey = 'profit') => rows
      .map(row => {
        const quantityBasis = profitQuantityBasisOf(row);
        return {
          id: row.id || normalizeText(row.name),
          name: row.name || row.groupName || 'Chưa rõ',
          label: row.name || row.groupName || 'Chưa rõ',
          value: toNumber(row[valueKey] ?? row.value),
          [valueKey]: toNumber(row[valueKey] ?? row.value),
          revenue: toNumber(row.revenue),
          profit: toNumber(row.profit),
          quantity: toNumber(quantityBasis.quantity || row.costQuantity || row.soldQuantity || row.quantitySold),
          unit: quantityBasis.unit || row.costQuantityUnit || row.unit || 'đv',
          averageInputCost: toNumber(row.averageInputCost),
          averageSalePrice: toNumber(row.averageSalePrice),
          profitPerUnit: toNumber(row.profitPerUnit)
        };
      })
      .filter(row => toNumber(row[valueKey]) > 0)
      .sort((a, b) => toNumber(b[valueKey]) - toNumber(a[valueKey]))
      .slice(0, 10);
    const topProductsByRevenueFromProfitability = profitabilityTopRows(profitabilityProductRows, 'revenue');
    const topProductsByProfitFromProfitability = profitabilityTopRows(profitabilityProductRows, 'profit');
    const topProductsByAverageDailyProfitFromProfitability = topProductsByProfitFromProfitability
      .map(row => ({
        ...row,
        activeDays: 1,
        averageDailyProfit: row.profit,
        value: row.profit
      }));

    const daysPassed = Math.max(1, source.now.getDate());
    return {
      topCustomersByRevenue: topRows(customerRevenue, 'revenue'),
      topCustomersByProfit: topRows(customerProfit, 'profit'),
      topProductsByRevenue: topProductsByRevenueFromProfitability.length
        ? topProductsByRevenueFromProfitability
        : topRows(productRevenue, 'revenue'),
      topProductsByProfit: topProductsByProfitFromProfitability.length
        ? topProductsByProfitFromProfitability
        : topRows(productProfit, 'profit'),
      topProductsByAverageDailyProfit: topProductsByAverageDailyProfitFromProfitability.length
        ? topProductsByAverageDailyProfitFromProfitability
        : topProductsByAverageDailyProfit,
      topEmployeesByRevenue: topRows(employeeRevenue, 'revenue', employeeRevenue.size || 10),
      topEmployeesByProfit: topRows(employeeProfit, 'profit', employeeProfit.size || 10),
      topCustomersByDebt: topRows(customerDebt, 'debt'),
      revenuePerDay: finance.revenueMonth / daysPassed,
      profitPerDay: finance.profitMonth / daysPassed,
      profitMarginPct: finance.revenueMonth > 0 ? (finance.profitMonth / finance.revenueMonth) * 100 : 0
    };
  }
};

const buildOperations = (source, finance) => {
  const todayKey = finance.todayKey;
  const stockCountValue = inventoryValueOfCounts(source.warehouseStockCounts);
  const importValue = inventoryValueOfImports(source.warehouseImports);
  const inventoryValue = stockCountValue > 0 ? stockCountValue : importValue;
  const inventoryQuantity = source.warehouseStockCounts.reduce((sum, item) => sum + toNumber(item.quantity ?? item.count ?? item.pieceCount ?? item.totalQuantity), 0);
  const lowStockProducts = source.products.filter(product => {
    const minimum = toNumber(product.minStock ?? product.minimumStock, NaN);
    const stock = toNumber(product.stock ?? product.quantity ?? product.remainingStock, NaN);
    return Number.isFinite(minimum) && Number.isFinite(stock) && stock <= minimum;
  });
  const slowMovingRows = source.products.filter(product => toNumber(product.daysInStock ?? product.stockAgeDays ?? product.daysWithoutSale ?? product.slowDays) >= 7).slice(0, 10);
  const attendanceToday = source.attendance.filter(item => dateKey(getDateValue(item)) === todayKey);
  const presentEmployeeIds = new Set(attendanceToday.filter(item => item.checkIn || item.checkInAt || item.inAt || item.startTime).map(item => item.employeeId || item.empId || item.userId).filter(Boolean));
  const leaveEmployeeIds = new Set(attendanceToday.filter(item => /nghi|leave|phep/.test(normalizeText(item.status || item.type))).map(item => item.employeeId || item.empId || item.userId).filter(Boolean));
  const assetsInMaintenance = source.assets.filter(asset => /bao tri|maintenance|sua chua/.test(normalizeText(asset.status)));
  const assetsInUse = source.assets.filter(asset => /dang hoat dong|dang su dung|active|in use/.test(normalizeText(asset.status)));
  const assetsDueMaintenance = source.assets.filter(asset => {
    const next = parseDate(asset.nextMaintenanceDate || asset.maintenanceDueDate || asset.inspectionExpiryDate || asset.registrationExpiryDate);
    return next && next.getTime() - source.now.getTime() <= 15 * DAY_MS && next >= source.now;
  });

  return {
    inventoryValue,
    inventoryQuantity,
    lowStockProducts: lowStockProducts.length,
    lowStockRows: lowStockProducts.slice(0, 10),
    slowMovingProducts: slowMovingRows.length,
    slowMovingRows,
    employeesPresentToday: presentEmployeeIds.size,
    employeesAbsentToday: Math.max(0, source.employees.length - presentEmployeeIds.size - leaveEmployeeIds.size),
    employeesOnLeaveToday: leaveEmployeeIds.size,
    monthlySalaryCost: payrollEmployeesOf(source.employees, source.now).reduce((sum, row) => sum + row.salary, 0),
    assetsTotal: source.assets.length,
    assetsInUse: assetsInUse.length,
    assetsInMaintenance: assetsInMaintenance.length,
    assetsDueMaintenance: assetsDueMaintenance.length,
    assetsDueMaintenanceRows: assetsDueMaintenance.slice(0, 10)
  };
};

export const AlertService = {
  build(source, dashboard) {
    const alerts = [];
    const add = (alert) => alerts.push({
      severity: alert.severity || alert.level || 'medium',
      time: alert.time || dashboard.period.todayKey,
      ...alert
    });

    if (dashboard.finance.overdueReceivables > 0) {
      add({ id: 'overdueDebt', severity: 'high', title: 'Khách nợ quá hạn', message: `Còn ${Math.round(dashboard.finance.overdueReceivables / 1000000)} triệu cần thu hồi hoặc đối chiếu.`, targetTab: 'debt' });
    }
    if (dashboard.finance.receivables > 0) {
      const overLimit = source.customers.filter(customer => {
        const debt = toNumber(customer.currentDebt ?? customer.debt ?? customer.balanceDue);
        const limit = toNumber(customer.debtLimit ?? customer.creditLimit, NaN);
        return Number.isFinite(limit) && debt > limit;
      });
      if (overLimit.length > 0) add({ id: 'debtLimit', severity: 'high', title: 'Khách vượt hạn mức nợ', message: `${overLimit.length} khách đã vượt hạn mức công nợ.`, targetTab: 'customers' });
    }
    const undeliveredOrders = source.orderRequests.filter(request => !isRequestDelivered(request, source.warehouseDispatches)).length;
    if (undeliveredOrders > 0) {
      add({ id: 'undelivered', severity: 'medium', title: 'Đơn hàng chưa giao', message: `${undeliveredOrders} đơn đặt chưa có phiếu xuất tương ứng.`, targetTab: 'warehouse_dispatch' });
    }
    if (dashboard.operations.slowMovingProducts > 0) {
      add({ id: 'oldStock', severity: 'medium', title: 'Hàng tồn quá lâu', message: `${dashboard.operations.slowMovingProducts} mặt hàng có dấu hiệu bán chậm.`, targetTab: 'warehouse_import' });
    }
    if (dashboard.operations.lowStockProducts > 0) {
      add({ id: 'lowStock', severity: 'high', title: 'Tồn kho dưới định mức', message: `${dashboard.operations.lowStockProducts} mặt hàng cần nhập thêm hoặc kiểm lại tồn.`, targetTab: 'products' });
    }
    if (dashboard.finance.profitMonth < 0) {
      add({ id: 'negativeProfit', severity: 'high', title: 'Lợi nhuận âm', message: 'Lợi nhuận tháng đang âm, cần kiểm tra giá vốn, giá bán và chi phí.', targetTab: 'executive_dashboard' });
    }
    if (dashboard.finance.expensePreviousMonth > 0 && dashboard.finance.expenseMonth > dashboard.finance.expensePreviousMonth * 1.3) {
      add({ id: 'expenseSpike', severity: 'medium', title: 'Chi phí tăng đột biến', message: `Chi phí tháng tăng ${Math.round(percentChange(dashboard.finance.expenseMonth, dashboard.finance.expensePreviousMonth))}% so với tháng trước.`, targetTab: 'finance' });
    }
    if (dashboard.operations.employeesAbsentToday >= Math.max(2, Math.ceil(source.employees.length * 0.2))) {
      add({ id: 'absence', severity: 'medium', title: 'Nhân viên nghỉ bất thường', message: `${dashboard.operations.employeesAbsentToday} nhân viên chưa có chấm công hôm nay.`, targetTab: 'company_attendance' });
    }
    if (dashboard.operations.assetsDueMaintenance > 0) {
      add({ id: 'assetMaintenance', severity: 'medium', title: 'Tài sản đến hạn bảo trì', message: `${dashboard.operations.assetsDueMaintenance} tài sản cần kiểm tra trong 15 ngày tới.`, targetTab: 'asset_management' });
    }

    return alerts.slice(0, 20);
  }
};

const formatPercentInsight = (value = 0) => `${Math.abs(Math.round(value)).toLocaleString('vi-VN')}%`;

const formatDateShort = (key = '') => {
  const [year, month, day] = String(key || '').split('-');
  if (!day || !month) return '';
  return `${day}/${month}`;
};

const entityDateKey = (entity = {}) => dateKey(getDateValue(entity));

const entityMonthKey = (entity = {}) => monthKey(getDateValue(entity));

const recordEmployeeIdOf = (entity = {}) => String(
  entity.employeeId ||
  entity.empId ||
  entity.userId ||
  entity.staffId ||
  entity.salesId ||
  entity.assignedTo ||
  entity.createdBy ||
  ''
);

const employeeExperienceSalaryOf = (employee = {}, referenceDate = new Date()) => {
  const amount = toNumber(employee.experienceSalary);
  if (amount <= 0) return 0;
  const startDate = parseDate(employee.startDate || employee.hireDate || employee.joinDate);
  if (!startDate) return 0;
  const now = parseDate(referenceDate) || new Date();
  let months = (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth());
  if (now.getDate() < startDate.getDate()) months -= 1;
  if (months < 0) return 0;
  const periodText = normalizeText(employee.experienceSalaryPeriod || 'months');
  const monthsPerCycle = /year|nam/.test(periodText) ? 12 : 1;
  const cycles = Math.floor(months / monthsPerCycle);
  return cycles > 0 ? amount * cycles : 0;
};

const employeeSalaryOf = (employee = {}, referenceDate = new Date()) => {
  const baseSalary = toNumber(
    employee.basicSalary ??
    employee.baseSalary ??
    employee.salary ??
    employee.monthlySalary ??
    employee.actualSalary ??
    employee.contractSalary
  );
  const fixedAllowances = (
    toNumber(employee.supportSalary) +
    toNumber(employee.responsibilitySalary) +
    employeeExperienceSalaryOf(employee, referenceDate)
  );
  return Math.max(0, baseSalary + fixedAllowances);
};

const isOwnerEmployeeRecord = (employee = {}) => {
  if (employee.role === 'super_admin' || employee.isOwner || employee.isCompanyOwner) return true;
  const text = normalizeText([
    employee.position,
    employee.role,
    employee.roleName,
    employee.department,
    employee.type,
    employee.title
  ].filter(Boolean).join(' ')).replace(/[_-]+/g, ' ');
  return /chu doanh nghiep|chu cua hang|giam doc|owner|business owner|super admin/.test(text);
};

const payrollEmployeesOf = (employees = [], referenceDate = new Date()) => employees
  .filter(employee => isActiveEmployee(employee) && !isOwnerEmployeeRecord(employee))
  .map(employee => ({ employee, salary: employeeSalaryOf(employee, referenceDate) }))
  .filter(row => row.salary > 0);

const employeeAdvanceLimitPercentOf = (employee = {}, company = {}) => {
  const raw = employee.salaryAdvancePercent ??
    employee.advancePercent ??
    employee.advanceLimitPercent ??
    company.salaryAdvancePercent ??
    company.defaultSalaryAdvancePercent ??
    company.advanceLimitPercent ??
    30;
  const percent = toNumber(raw, 30);
  return percent > 1 ? percent : percent * 100;
};

const isActiveEmployee = (employee = {}) => {
  const status = normalizeText(employee.status || employee.state || employee.workStatus || '');
  return !isArchived(employee) && !['inactive', 'blocked', 'disabled', 'nghi viec', 'da nghi', 'ngung hoat dong'].includes(status);
};

const isAttendanceLeave = (record = {}) => {
  const text = normalizeText([record.status, record.state, record.type, record.note, record.reason].filter(Boolean).join(' '));
  return /nghi|leave|absent|phep/.test(text) && !/di lam|present|checked|vao ca|ra ca/.test(text);
};

const isAttendancePresent = (record = {}) => {
  const text = normalizeText([record.status, record.state, record.type, record.note].filter(Boolean).join(' '));
  if (/di lam|present|checked|vao ca|ra ca|working|completed/.test(text)) return true;
  return Boolean(record.checkIn || record.checkInAt || record.clockIn || record.startAt || record.timeIn || record.checkedInAt);
};

const buildMissingAttendanceRows = (source = {}, todayKey = '') => {
  const employeesById = new Map(source.employees.map(employee => [String(employee.id || employee.uid || employee.userId || ''), employee]));
  const presentIds = new Set();
  const leaveIds = new Set();
  source.attendance
    .filter(record => entityDateKey(record) === todayKey)
    .forEach(record => {
      const employeeId = recordEmployeeIdOf(record);
      if (!employeeId) return;
      if (isAttendanceLeave(record)) {
        leaveIds.add(employeeId);
        return;
      }
      if (isAttendancePresent(record)) presentIds.add(employeeId);
    });

  return source.employees
    .filter(isActiveEmployee)
    .filter(employee => {
      const employeeId = String(employee.id || employee.uid || employee.userId || '');
      if (!employeeId) return false;
      return !presentIds.has(employeeId) && !leaveIds.has(employeeId);
    })
    .map(employee => ({
      id: String(employee.id || employee.uid || employee.userId || ''),
      name: employee.name || employee.fullName || employee.displayName || 'Nhân viên chưa rõ',
      department: formatDepartmentLabel(employee.department || employee.role || employee.roleKey || employee.position || '')
    }))
    .filter(row => employeesById.has(row.id));
};

const isAdvanceRecord = (record = {}) => {
  const text = normalizeText([
    record.category,
    record.type,
    record.kind,
    record.name,
    record.title,
    record.note,
    record.description,
    record.reason,
    record.sourceType
  ].filter(Boolean).join(' '));
  return /ung luong|tam ung|advance|salary advance/.test(text);
};

const advanceAmountOf = (record = {}) => toNumber(
  record.approvedAmount ??
  record.amount ??
  record.requestedAmount ??
  record.total ??
  record.value ??
  record.money
);

const buildAdvanceRiskRows = (source = {}, currentMonthKey = '') => {
  const employeesById = new Map(source.employees.map(employee => [String(employee.id || employee.uid || employee.userId || ''), employee]));
  const records = [
    ...source.advances.map(record => ({ ...record, __advanceCollection: true })),
    ...source.financials,
    ...source.expenses
  ].filter(record => {
    if (entityMonthKey(record) !== currentMonthKey) return false;
    const status = normalizeText(record.status || record.state || '');
    if (/reject|tu choi|huy|cancel/.test(status)) return false;
    return record.__advanceCollection || isAdvanceRecord(record);
  });

  const grouped = new Map();
  records.forEach(record => {
    const employeeId = recordEmployeeIdOf(record);
    const employee = employeeId ? employeesById.get(employeeId) : null;
    const name = record.employeeName || record.staffName || record.createdByName || employee?.name || employee?.fullName || 'Nhân viên chưa rõ';
    const key = employeeId || normalizeText(name);
    if (!key) return;
    const current = grouped.get(key) || {
      id: key,
      employee,
      name,
      amount: 0,
      count: 0,
      pending: 0
    };
    const amount = advanceAmountOf(record);
    current.amount += amount;
    current.count += 1;
    const status = normalizeText(record.status || record.state || '');
    if (!/approved|da duyet|paid|da chi|done|completed/.test(status)) current.pending += amount;
    grouped.set(key, current);
  });

  return [...grouped.values()]
    .map(row => {
      const salary = employeeSalaryOf(row.employee || {});
      const percent = employeeAdvanceLimitPercentOf(row.employee || {}, source.company || {});
      const allowed = salary > 0 ? (salary * percent) / 100 : 0;
      return {
        ...row,
        salary,
        percent,
        allowed,
        overAmount: allowed > 0 ? row.amount - allowed : 0,
        missingPolicy: salary <= 0
      };
    })
    .filter(row => row.amount > 0)
    .sort((a, b) => {
      if ((b.overAmount > 0) !== (a.overAmount > 0)) return (b.overAmount > 0) ? 1 : -1;
      return b.amount - a.amount;
    });
};

const customerCurrentDebtOf = (customer = {}) => Math.max(0, toNumber(
  customer.currentDebt ??
  customer.totalDebt ??
  customer.debt ??
  customer.openingDebt ??
  customer.oldDebt ??
  customer.initialDebt
));

const buildDebtRiskRows = (source = {}) => {
  const customersById = new Map(source.customers.map(customer => [String(customer.id || customer.customerId || ''), customer]));
  const rows = new Map();
  const upsert = (key, patch = {}) => {
    const current = rows.get(key) || {
      id: key,
      name: patch.name || 'Khách chưa rõ',
      debt: 0,
      orderDebt: 0,
      profileDebt: 0,
      orderCount: 0,
      oldestDate: '',
      latestDate: '',
      customer: patch.customer || null
    };
    rows.set(key, { ...current, ...patch });
    return rows.get(key);
  };

  source.orders.forEach(order => {
    const debt = outstandingOfOrder(order);
    if (debt <= 0) return;
    const customer = order.customerId ? customersById.get(String(order.customerId)) : null;
    const name = customerNameOf(order, customersById);
    const key = String(order.customerId || customer?.id || normalizeText(name));
    const row = upsert(key, { name, customer });
    const orderKey = entityDateKey(order);
    row.orderDebt += debt;
    row.debt = Math.max(row.debt, row.orderDebt);
    row.orderCount += 1;
    if (orderKey && (!row.oldestDate || orderKey < row.oldestDate)) row.oldestDate = orderKey;
    if (orderKey && (!row.latestDate || orderKey > row.latestDate)) row.latestDate = orderKey;
  });

  source.customers.forEach(customer => {
    const profileDebt = customerCurrentDebtOf(customer);
    if (profileDebt <= 0) return;
    const name = customer.name || customer.displayName || customer.customerName || 'Khách chưa rõ';
    const key = String(customer.id || customer.customerId || normalizeText(name));
    const row = upsert(key, { name, customer });
    row.profileDebt = profileDebt;
    row.debt = Math.max(row.debt, profileDebt, row.orderDebt);
  });

  return [...rows.values()]
    .filter(row => row.debt > 0)
    .sort((a, b) => b.debt - a.debt || b.orderCount - a.orderCount)
    .slice(0, 20);
};

const buildLatestDebtOrderRows = (source = {}) => buildDebtRiskRows(source)
  .filter(row => row.orderCount > 0)
  .sort((a, b) => b.orderCount - a.orderCount || b.debt - a.debt)
  .slice(0, 10);

const formatInsightMoney = (value = 0) => {
  const amount = Math.round(toNumber(value));
  if (Math.abs(amount) >= 1000000000) return `${(amount / 1000000000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
  if (Math.abs(amount) >= 1000000) return `${Math.round(amount / 1000000).toLocaleString('vi-VN')} triệu`;
  return `${amount.toLocaleString('vi-VN')} đ`;
};

const rangeChangePct = (values = []) => {
  const cleanValues = values.map(value => toNumber(value)).filter(value => value > 0);
  if (cleanValues.length < 2) return 0;
  const min = Math.min(...cleanValues);
  const max = Math.max(...cleanValues);
  return min > 0 ? ((max - min) / min) * 100 : 0;
};

const itemPriceOf = (item = {}) => {
  const directPrice = itemUnitPrice(item);
  if (directPrice > 0) return directPrice;
  const quantity = itemQuantity(item);
  const total = itemLineTotal(item);
  return quantity > 0 && total > 0 ? total / quantity : 0;
};

const buildProfitabilityDiagnostics = (source = {}, finance = {}) => {
  const todayKey = finance.todayKey || dateKey(source.now || new Date());
  const todayDate = parseDate(todayKey) || source.now || new Date();
  const dayKeys = [2, 1, 0].map(offset => dateKey(addDays(todayDate, -offset))).filter(Boolean);
  const byGroup = new Map();

  dayKeys.forEach(day => {
    const snapshot = ProfitabilityService.build(source, { ...finance, todayKey: day });
    snapshot.groupRows.forEach(row => {
      if (!row?.name || toNumber(row.costQuantity) <= 0 || toNumber(row.revenue) <= 0) return;
      const key = normalizeText(row.name);
      const current = byGroup.get(key) || { key, name: row.name, unit: row.costQuantityUnit || row.unit || 'đv', rows: [] };
      current.rows.push({
        dateKey: day,
        inputCost: toNumber(row.averageInputCost),
        salePrice: toNumber(row.averageSalePrice),
        profitPerUnit: toNumber(row.profitPerUnit),
        profit: toNumber(row.profit),
        quantity: toNumber(row.costQuantity),
        unit: row.costQuantityUnit || row.unit || current.unit
      });
      byGroup.set(key, current);
    });
  });

  const anomalyRows = [...byGroup.values()]
    .map(group => {
      const rows = group.rows.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
      if (rows.length < 2) return null;
      const first = rows[0];
      const last = rows[rows.length - 1];
      const profitDeltaPct = percentChange(last.profitPerUnit, first.profitPerUnit);
      const profitDeltaValue = last.profitPerUnit - first.profitPerUnit;
      const inputCostRangePct = rangeChangePct(rows.map(row => row.inputCost));
      const salePriceRangePct = rangeChangePct(rows.map(row => row.salePrice));
      const stableInputs = inputCostRangePct <= 3 && salePriceRangePct <= 3;
      const abnormalProfit = Math.abs(profitDeltaPct) >= 12 && Math.abs(profitDeltaValue) >= 500;
      if (!stableInputs || !abnormalProfit) return null;
      return {
        ...group,
        fromDate: first.dateKey,
        toDate: last.dateKey,
        firstProfitPerUnit: first.profitPerUnit,
        lastProfitPerUnit: last.profitPerUnit,
        profitDeltaPct,
        profitDeltaValue,
        inputCostRangePct,
        salePriceRangePct,
        unit: last.unit || group.unit,
        severity: Math.abs(profitDeltaPct)
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 6);

  const productsById = new Map(source.products.map(product => [product.id, product]));
  const customersById = new Map(source.customers.map(customer => [customer.id, customer]));
  const baselineMap = new Map();

  source.orders.forEach(order => {
    const orderDay = dateKey(getDateValue(order));
    if (!orderDay || orderDay >= todayKey || orderDay < dayKeys[0]) return;
    getItems(order).forEach(item => {
      const quantity = itemQuantity(item);
      const price = itemPriceOf(item);
      if (quantity <= 0 || price <= 0) return;
      const key = inventoryCostKeyOf(item, productsById);
      const row = baselineMap.get(key) || { quantity: 0, value: 0 };
      row.quantity += quantity;
      row.value += quantity * price;
      baselineMap.set(key, row);
    });
  });

  const impactMap = new Map();
  source.orders.forEach(order => {
    const orderDay = dateKey(getDateValue(order));
    if (orderDay !== todayKey) return;
    const customerName = customerNameOf(order, customersById);
    const customerKey = String(order.customerId || normalizeText(customerName));
    getItems(order).forEach(item => {
      const quantity = itemQuantity(item);
      const price = itemPriceOf(item);
      if (quantity <= 0 || price <= 0) return;
      const productKey = inventoryCostKeyOf(item, productsById);
      const baseline = baselineMap.get(productKey);
      const baselinePrice = baseline?.quantity > 0 ? baseline.value / baseline.quantity : 0;
      if (baselinePrice <= 0) return;
      const priceDelta = price - baselinePrice;
      const impact = priceDelta * quantity;
      const impactPct = percentChange(price, baselinePrice);
      if (Math.abs(priceDelta) < 500 && Math.abs(impact) < 50000 && Math.abs(impactPct) < 2) return;
      const productName = productNameOf(item, productsById);
      const key = `${customerKey}__${productKey}`;
      const row = impactMap.get(key) || {
        customerName,
        productName,
        unit: quantityUnitOf(item, 'đv'),
        quantity: 0,
        value: 0,
        baselineValue: 0,
        impact: 0
      };
      row.quantity += quantity;
      row.value += price * quantity;
      row.baselineValue += baselinePrice * quantity;
      row.impact += impact;
      row.currentPrice = row.quantity > 0 ? row.value / row.quantity : price;
      row.baselinePrice = row.quantity > 0 ? row.baselineValue / row.quantity : baselinePrice;
      row.priceDelta = row.currentPrice - row.baselinePrice;
      row.impactPct = percentChange(row.currentPrice, row.baselinePrice);
      row.impactAbs = Math.abs(row.impact);
      impactMap.set(key, row);
    });
  });

  const priceImpactRows = [...impactMap.values()]
    .sort((a, b) => b.impactAbs - a.impactAbs)
    .slice(0, 8);

  return { anomalyRows, priceImpactRows };
};

const buildExecutiveInsightItems = (source = {}, dashboard = {}, alerts = []) => {
  const insightRows = [];
  const usedIds = new Set();
  const finance = dashboard.finance || {};
  const todayKey = finance.todayKey || dateKey(source.now || new Date());
  const currentMonthKey = finance.currentMonthKey || monthKey(source.now || new Date());
  const add = (priority, insight) => {
    if (!insight?.text || usedIds.has(insight.id)) return;
    usedIds.add(insight.id);
    insightRows.push({ priority, ...insight });
  };

  const revenueDelta = percentChange(finance.revenueToday, finance.revenueYesterday);
  const profitDelta = percentChange(finance.profitToday, finance.profitYesterday);
  const monthProfitDelta = percentChange(finance.profitMonth, finance.profitPreviousMonth);

  if (finance.profitToday < 0) {
    add(5, {
      id: 'profit-today-negative',
      type: 'warn',
      text: `Lợi nhuận hôm nay đang âm ${formatInsightMoney(Math.abs(finance.profitToday))}. Cần kiểm tra ngay giá vốn đã dùng, chi phí phát sinh và các đơn bán dưới giá.`
    });
  } else if (Math.abs(profitDelta) >= 5) {
    add(profitDelta < 0 ? 12 : 42, {
      id: 'profit-today-delta',
      type: profitDelta >= 0 ? 'good' : 'warn',
      text: `Lợi nhuận hôm nay ${profitDelta >= 0 ? 'tăng' : 'giảm'} ${formatPercentInsight(profitDelta)} so với hôm qua${finance.profitToday ? `, hiện khoảng ${formatInsightMoney(finance.profitToday)}` : ''}.`
    });
  }

  if (Math.abs(revenueDelta) >= 5) {
    add(revenueDelta < 0 ? 15 : 45, {
      id: 'revenue-today-delta',
      type: revenueDelta >= 0 ? 'good' : 'warn',
      text: `Doanh thu hôm nay ${revenueDelta >= 0 ? 'tăng' : 'giảm'} ${formatPercentInsight(revenueDelta)} so với hôm qua, đạt ${formatInsightMoney(finance.revenueToday)}.`
    });
  }

  if (Math.abs(monthProfitDelta) >= 8) {
    add(monthProfitDelta < 0 ? 18 : 48, {
      id: 'profit-month-delta',
      type: monthProfitDelta >= 0 ? 'good' : 'warn',
      text: `Lợi nhuận tháng này ${monthProfitDelta >= 0 ? 'tốt hơn' : 'kém hơn'} ${formatPercentInsight(monthProfitDelta)} so với tháng trước.`
    });
  }

  const debtRows = buildDebtRiskRows(source);
  const topDebt = debtRows[0];
  const receivables = Math.max(toNumber(finance.receivables), debtRows.reduce((sum, row) => sum + toNumber(row.debt), 0));
  if (topDebt?.debt > 0) {
    const share = receivables > 0 ? Math.round((topDebt.debt / receivables) * 100) : 0;
    add(20, {
      id: 'customer-top-debt-risk',
      type: share >= 30 ? 'warn' : 'neutral',
      text: `${topDebt.name} đang là khách nợ cao nhất với ${formatInsightMoney(topDebt.debt)}${share > 0 ? `, chiếm khoảng ${share}% tổng công nợ` : ''}. Nên ưu tiên nhắc thu hoặc đối soát trước khi giao thêm.`
    });
  }

  const debtOrderRisk = buildLatestDebtOrderRows(source)[0];
  if (debtOrderRisk?.orderCount >= 2) {
    add(22, {
      id: 'customer-many-debt-orders',
      type: 'warn',
      text: `${debtOrderRisk.name} còn ${debtOrderRisk.orderCount} đơn chưa tất toán${debtOrderRisk.oldestDate ? `, đơn cũ nhất từ ${formatDateShort(debtOrderRisk.oldestDate)}` : ''}. Đây là khách cần theo sát dòng tiền.`
    });
  }

  const advanceRows = buildAdvanceRiskRows(source, currentMonthKey);
  const overAdvance = advanceRows.find(row => row.overAmount > 0);
  if (overAdvance) {
    add(24, {
      id: 'employee-advance-over-limit',
      type: 'warn',
      text: `${overAdvance.name} đã ứng ${formatInsightMoney(overAdvance.amount)}, vượt hạn mức khoảng ${formatInsightMoney(overAdvance.overAmount)} so với chính sách ${Math.round(overAdvance.percent)}% lương.`
    });
  } else {
    const missingPolicyAdvance = advanceRows.find(row => row.missingPolicy);
    if (missingPolicyAdvance) {
      add(34, {
        id: 'employee-advance-missing-policy',
        type: 'warn',
        text: `${missingPolicyAdvance.name} có phát sinh ứng lương ${formatInsightMoney(missingPolicyAdvance.amount)} nhưng chưa thấy cấu hình lương/hạn mức để kiểm soát tự động.`
      });
    }
  }

  const missingAttendanceRows = buildMissingAttendanceRows(source, todayKey);
  if (missingAttendanceRows.length > 0) {
    const names = missingAttendanceRows.slice(0, 3).map(row => row.name).join(', ');
    add(28, {
      id: 'attendance-missing-today',
      type: 'warn',
      text: `${missingAttendanceRows.length} nhân viên chưa ghi nhận chấm công hôm nay${names ? `: ${names}${missingAttendanceRows.length > 3 ? '...' : ''}` : ''}. Nên kiểm tra để tránh sai lệch lương và ca làm.`
    });
  }

  const topGroup = dashboard.profitability?.topGroup;
  if (topGroup?.profit > 0) {
    add(40, {
      id: 'today-top-profit-group',
      type: 'good',
      text: `Nhóm ${topGroup.name} đang là trụ cột lợi nhuận hôm nay: lãi khoảng ${formatInsightMoney(topGroup.profit)}${topGroup.profitPerUnit ? `, bình quân ${formatInsightMoney(topGroup.profitPerUnit)}/${topGroup.unit || 'đơn vị'}` : ''}.`
    });
  }

  const topProduct = dashboard.profitability?.topProduct || dashboard.business?.topProductsByProfit?.[0];
  const topProductProfit = toNumber(topProduct?.profit);
  if (topProduct?.name && topProductProfit > 0) {
    add(44, {
      id: 'today-top-profit-product',
      type: 'good',
      text: `${topProduct.name} là sản phẩm lãi tốt nhất hiện tại với ${formatInsightMoney(topProductProfit)}${topProduct.profitPerUnit ? `, khoảng ${formatInsightMoney(topProduct.profitPerUnit)}/${topProduct.unit || 'đơn vị'}` : ''}.`
    });
  }

  const profitAnomaly = dashboard.profitability?.anomalyRows?.[0];
  if (profitAnomaly) {
    add(30, {
      id: 'profitability-anomaly-3-days',
      type: 'warn',
      text: `Nhóm ${profitAnomaly.name} có lãi bình quân ${profitAnomaly.profitDeltaValue >= 0 ? 'tăng' : 'giảm'} ${formatPercentInsight(profitAnomaly.profitDeltaPct)} trong 3 ngày dù giá mua và giá bán gần như không đổi. Nên kiểm tra hao hụt, phiếu xuất, kiểm tồn hoặc giá vốn của nhóm này.`
    });
  }

  const priceImpact = dashboard.profitability?.priceImpactRows?.[0];
  if (priceImpact) {
    add(priceImpact.impact >= 0 ? 46 : 31, {
      id: 'customer-price-impact',
      type: priceImpact.impact >= 0 ? 'good' : 'warn',
      text: `${priceImpact.customerName} mua ${priceImpact.productName} ${priceImpact.priceDelta >= 0 ? 'cao hơn' : 'thấp hơn'} bình quân 3 ngày khoảng ${formatInsightMoney(Math.abs(priceImpact.priceDelta))}/${priceImpact.unit || 'đơn vị'}, làm ${priceImpact.impact >= 0 ? 'tăng' : 'giảm'} lãi ước tính ${formatInsightMoney(Math.abs(priceImpact.impact))}.`
    });
  }

  const topRevenueProduct = dashboard.business?.topProductsByRevenue?.[0];
  if (topRevenueProduct?.revenue > 0) {
    const revenueShare = finance.revenueMonth > 0 ? Math.round((topRevenueProduct.revenue / finance.revenueMonth) * 100) : 0;
    add(52, {
      id: 'pillar-revenue-product',
      type: 'neutral',
      text: `${topRevenueProduct.name} đang kéo doanh thu mạnh nhất tháng này với ${formatInsightMoney(topRevenueProduct.revenue)}${revenueShare > 0 ? `, khoảng ${revenueShare}% doanh thu tháng` : ''}.`
    });
  }

  const carryoverValue = toNumber(dashboard.profitability?.totals?.carryoverValue);
  if (carryoverValue > 0) {
    add(62, {
      id: 'carryover-stock-value',
      type: 'neutral',
      text: `Tồn chuyển sang ngày sau khoảng ${formatInsightMoney(carryoverValue)} theo giá vốn bình quân; khoản này không nên tính hết vào chi phí đã dùng hôm nay.`
    });
  }

  if (dashboard.operations?.slowMovingProducts > 0) {
    add(70, {
      id: 'slow-moving-products',
      type: 'warn',
      text: `${dashboard.operations.slowMovingProducts} mặt hàng đang bán chậm. Nên xem lại giá bán, lịch nhập hoặc đẩy ưu tiên tiêu thụ để tránh kẹt vốn.`
    });
  }

  if (alerts.length > 0) {
    add(80, {
      id: 'open-alerts',
      type: 'warn',
      text: `Hôm nay có ${alerts.length} cảnh báo đang mở. Ưu tiên xử lý cảnh báo công nợ, tồn kho và chấm công trước.`
    });
  }

  if (insightRows.length === 0) {
    add(100, {
      id: 'stable',
      type: 'good',
      text: 'Các chỉ số chính đang ổn định. Nên tiếp tục theo dõi công nợ, tồn kho và chấm công trong ngày để tránh phát sinh rủi ro.'
    });
  }

  return insightRows
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 12)
    .map(({ priority, ...insight }) => insight);
};

export const InsightService = {
  build(source, dashboard, alerts = []) {
    return buildExecutiveInsightItems(source, dashboard, alerts);
    const insights = [];
    const revenueDelta = percentChange(dashboard.finance.revenueToday, dashboard.finance.revenueYesterday);
    if (Math.abs(revenueDelta) >= 5) {
      insights.push({
        id: 'revenue-delta',
        type: revenueDelta >= 0 ? 'good' : 'warn',
        text: `Doanh thu hôm nay ${revenueDelta >= 0 ? 'tăng' : 'giảm'} ${Math.abs(Math.round(revenueDelta))}% so với hôm qua.`
      });
    }
    const salaryRatio = dashboard.costs.salaryToRevenuePct;
    if (salaryRatio > 0) {
      insights.push({
        id: 'salary-ratio',
        type: salaryRatio > 25 ? 'warn' : 'neutral',
        text: `Chi phí lương đang chiếm ${Math.round(salaryRatio)}% doanh thu tháng.`
      });
    }
    const topProduct = dashboard.business.topProductsByProfit[0];
    if (topProduct?.profit > 0 && dashboard.finance.profitMonth > 0) {
      const share = Math.round((topProduct.profit / dashboard.finance.profitMonth) * 100);
      const margin = topProduct.revenue > 0 ? Math.round((topProduct.profit / topProduct.revenue) * 100) : 0;
      insights.push({
        id: 'top-product-profit',
        type: 'good',
        text: `${topProduct.name} đang tạo lợi nhuận cao nhất: ${formatMoneyInsight(topProduct.profit)} trong tháng, chiếm khoảng ${share}% lợi nhuận${margin > 0 ? `, biên lãi ${margin}%` : ''}.`
      });
    }
    const topDailyProduct = dashboard.business.topProductsByAverageDailyProfit?.[0];
    if (topDailyProduct?.averageDailyProfit > 0) {
      insights.push({
        id: 'top-product-daily-average-profit',
        type: 'good',
        text: `Bình quân theo ngày bán, ${topDailyProduct.name} đang mang lại khoảng ${formatMoneyInsight(topDailyProduct.averageDailyProfit)}/ngày.`
      });
    }
    const topProfitabilityProduct = dashboard.profitability?.topProduct;
    if (topProfitabilityProduct?.profit > 0) {
      insights.push({
        id: 'today-product-profitability',
        type: 'good',
        text: `${topProfitabilityProduct.name} đang lãi cao nhất hôm nay: ${formatMoneyInsight(topProfitabilityProduct.profit)}, bình quân ${formatMoneyInsight(topProfitabilityProduct.profitPerUnit)}/${topProfitabilityProduct.unit || 'đơn vị'}.`
      });
    }
    const topProfitabilityGroup = dashboard.profitability?.topGroup;
    if (topProfitabilityGroup?.profit > 0) {
      insights.push({
        id: 'today-group-profitability',
        type: 'good',
        text: `Nhóm ${topProfitabilityGroup.name} đang là nhóm lợi nhuận tốt nhất hôm nay với ${formatMoneyInsight(topProfitabilityGroup.profit)} lãi gộp.`
      });
    }
    if ((dashboard.profitability?.totals?.carryoverValue || 0) > 0) {
      insights.push({
        id: 'carryover-stock-value',
        type: 'neutral',
        text: `Giá trị tồn chuyển sang ngày sau khoảng ${formatMoneyInsight(dashboard.profitability.totals.carryoverValue)} theo giá vốn bình quân.`
      });
    }
    const topRevenueProduct = dashboard.business.topProductsByRevenue?.[0];
    if (topRevenueProduct?.revenue > 0) {
      insights.push({
        id: 'top-product-revenue',
        type: 'neutral',
        text: `${topRevenueProduct.name} là nhóm/sản phẩm kéo doanh thu mạnh nhất với ${formatMoneyInsight(topRevenueProduct.revenue)} doanh thu tháng.`
      });
    }
    const topDebt = dashboard.business.topCustomersByDebt[0];
    if (topDebt?.debt > 0) {
      insights.push({ id: 'top-debt', type: 'warn', text: `${topDebt.name} là khách có công nợ cao nhất, cần ưu tiên theo dõi dòng tiền.` });
    }
    if (dashboard.operations.slowMovingProducts > 0) {
      insights.push({ id: 'slow-stock', type: 'warn', text: `Có ${dashboard.operations.slowMovingProducts} mặt hàng bán chậm, nên rà soát nhập hàng và giá bán.` });
    }
    if (alerts.length > 0) {
      insights.push({ id: 'alerts', type: 'warn', text: `Hôm nay có ${alerts.length} cảnh báo cần xử lý để tránh thất thoát hoặc chậm dòng tiền.` });
    }
    if (insights.length === 0) {
      insights.push({ id: 'stable', type: 'good', text: 'Các chỉ số chính đang ổn định. Nên tiếp tục theo dõi công nợ và tồn kho trong ngày.' });
    }
    return insights.slice(0, 12);
  }
};

export const RecommendationService = {
  build(source, dashboard, alerts = []) {
    const recommendations = [];
    const topDebt = dashboard.business.topCustomersByDebt[0];
    if (topDebt?.debt > 0) {
      recommendations.push({
        id: 'collect-debt',
        title: `Thu hồi công nợ ${topDebt.name}`,
        impact: `Dự kiến thu về ${Math.round(topDebt.debt / 1000000)} triệu`,
        detail: 'Ưu tiên nhắc khách hoặc giao hàng kèm điều kiện thu tiền.',
        targetTab: 'debt'
      });
    }
    const slowStock = dashboard.operations.slowMovingRows?.[0];
    if (slowStock) {
      recommendations.push({
        id: 'reduce-slow-stock',
        title: `Giảm nhập hoặc đẩy bán ${slowStock.name || slowStock.productName || 'hàng bán chậm'}`,
        impact: 'Giảm vốn bị kẹt trong tồn kho',
        detail: 'Kiểm tra lại tốc độ bán, size, giá và lịch nhập.',
        targetTab: 'warehouse_import'
      });
    }
    const lowMarginCustomer = dashboard.business.topCustomersByRevenue.find(row => row.revenue > 0 && (dashboard.business.topCustomersByProfit.find(p => p.name === row.name)?.profit || 0) / row.revenue < 0.02);
    if (lowMarginCustomer) {
      recommendations.push({
        id: 'adjust-low-margin',
        title: `Rà soát giá bán khách ${lowMarginCustomer.name}`,
        impact: 'Có thể tăng biên lợi nhuận nhóm khách doanh thu cao',
        detail: 'Khách có doanh thu cao nhưng biên lợi nhuận thấp.',
        targetTab: 'customers'
      });
    }
    const biggestCost = dashboard.finance.costBreakdown?.slice().sort((a, b) => b.value - a.value)[0];
    if (biggestCost?.value > 0) {
      recommendations.push({
        id: 'cost-control',
        title: `Kiểm soát ${biggestCost.name.toLowerCase()}`,
        impact: `Khoản này đang chiếm ${Math.round((biggestCost.value / Math.max(1, dashboard.finance.expenseMonth)) * 100)}% tổng chi tháng`,
        detail: 'So sánh với tháng trước và đặt giới hạn chi theo ngày.',
        targetTab: 'finance'
      });
    }
    if (dashboard.operations.employeesAbsentToday > 0) {
      recommendations.push({
        id: 'attendance-action',
        title: 'Rà soát nhân sự chưa chấm công',
        impact: 'Giảm sai lệch lương và thiếu người vận hành',
        detail: 'Kiểm tra lý do nghỉ, quên chấm hoặc phân ca chưa đúng.',
        targetTab: 'company_attendance'
      });
    }
    if (recommendations.length === 0 && alerts[0]) {
      recommendations.push({
        id: 'handle-first-alert',
        title: `Xử lý cảnh báo: ${alerts[0].title}`,
        impact: 'Giảm rủi ro vận hành trong ngày',
        detail: alerts[0].message,
        targetTab: alerts[0].targetTab || 'executive_dashboard'
      });
    }
    return recommendations.slice(0, 5);
  }
};

const makeKpi = ({ id, title, value, kind = 'money', current = value, previousDay = 0, currentMonth = value, previousMonth = 0, positiveWhen = 'up' }) => {
  const vsYesterday = percentChange(current, previousDay);
  const vsPreviousMonth = percentChange(currentMonth, previousMonth);
  const positive = positiveWhen === 'down' ? vsYesterday <= 0 : vsYesterday >= 0;
  const tone = ['profitToday', 'profitMonth', 'cashBalance', 'cashflowMonth'].includes(id)
    ? (toNumber(value) >= 0 ? 'good' : 'bad')
    : ['receivables', 'payables', 'undeliveredOrders', 'openAlerts'].includes(id)
      ? (toNumber(value) > 0 ? 'warn' : 'good')
      : positive ? 'good' : 'bad';
  return { id, title, label: title, value, kind, vsYesterday, vsPreviousMonth, dayDeltaPct: vsYesterday, monthDeltaPct: vsPreviousMonth, tone, isPositive: positive };
};

export const DashboardService = {
  build(input = {}) {
    const source = normalizeInput(input);
    let finance = FinancialService.build(source);
    const inventorySoldCostByDate = buildInventorySoldCostByDate(source, finance.todayKey);
    const inventoryPurchaseExpenses = source.expenses.filter(isInventoryPurchaseExpense);
    const costOfGoodsToday = toNumber(inventorySoldCostByDate.get(finance.todayKey));
    const costOfGoodsYesterday = toNumber(inventorySoldCostByDate.get(finance.yesterdayKey));
    const costOfGoodsWeek = sumMapByDateRange(inventorySoldCostByDate, finance.weekStartKey, finance.weekEndKey);
    const costOfGoodsMonth = sumInventorySoldCostByMonth(inventorySoldCostByDate, finance.currentMonthKey);
    const costOfGoodsPreviousMonth = sumInventorySoldCostByMonth(inventorySoldCostByDate, finance.previousMonthKey);
    const inventoryPurchaseExpenseToday = sumByDate(inventoryPurchaseExpenses, finance.todayKey, moneyOfExpense);
    const inventoryPurchaseExpenseYesterday = sumByDate(inventoryPurchaseExpenses, finance.yesterdayKey, moneyOfExpense);
    const inventoryPurchaseExpenseWeek = sumByDateRange(inventoryPurchaseExpenses, finance.weekStartKey, finance.weekEndKey, moneyOfExpense);
    const inventoryPurchaseExpenseMonth = sumByMonth(inventoryPurchaseExpenses, finance.currentMonthKey, moneyOfExpense);
    const inventoryPurchaseExpensePreviousMonth = sumByMonth(inventoryPurchaseExpenses, finance.previousMonthKey, moneyOfExpense);
    const nonInventoryExpenseToday = Math.max(0, finance.expenseToday - inventoryPurchaseExpenseToday);
    const nonInventoryExpenseYesterday = Math.max(0, finance.expenseYesterday - inventoryPurchaseExpenseYesterday);
    const nonInventoryExpenseWeek = Math.max(0, finance.expenseWeek - inventoryPurchaseExpenseWeek);
    const nonInventoryExpenseMonth = Math.max(0, finance.expenseMonth - inventoryPurchaseExpenseMonth);
    const nonInventoryExpensePreviousMonth = Math.max(0, finance.expensePreviousMonth - inventoryPurchaseExpensePreviousMonth);
    const actualExpenseToday = nonInventoryExpenseToday + costOfGoodsToday;
    const actualExpenseYesterday = nonInventoryExpenseYesterday + costOfGoodsYesterday;
    const actualExpenseWeek = nonInventoryExpenseWeek + costOfGoodsWeek;
    const actualExpenseMonth = nonInventoryExpenseMonth + costOfGoodsMonth;
    const actualExpensePreviousMonth = nonInventoryExpensePreviousMonth + costOfGoodsPreviousMonth;
    const rebuildDayRow = (row = {}) => {
      const cashExpense = toNumber(row.expense);
      const inventoryPurchaseExpense = sumByDate(inventoryPurchaseExpenses, row.date, moneyOfExpense);
      const nonInventoryExpense = Math.max(0, cashExpense - inventoryPurchaseExpense);
      const costOfGoods = toNumber(inventorySoldCostByDate.get(row.date));
      const actualExpense = nonInventoryExpense + costOfGoods;
      return {
        ...row,
        cashExpense,
        inventoryPurchaseExpense,
        nonInventoryExpense,
        costOfGoods,
        actualUsedCost: costOfGoods,
        expense: actualExpense,
        operatingExpense: actualExpense,
        profitExpense: actualExpense,
        profit: toNumber(row.revenue) - actualExpense,
        cashflow: toNumber(row.income) - cashExpense
      };
    };
    const rebuildMonthRow = (row = {}) => {
      const cashExpense = toNumber(row.expense);
      const inventoryPurchaseExpense = sumByMonth(inventoryPurchaseExpenses, row.month, moneyOfExpense);
      const nonInventoryExpense = Math.max(0, cashExpense - inventoryPurchaseExpense);
      const costOfGoods = sumInventorySoldCostByMonth(inventorySoldCostByDate, row.month);
      const actualExpense = nonInventoryExpense + costOfGoods;
      return {
        ...row,
        cashExpense,
        inventoryPurchaseExpense,
        nonInventoryExpense,
        costOfGoods,
        actualUsedCost: costOfGoods,
        expense: actualExpense,
        operatingExpense: actualExpense,
        profitExpense: actualExpense,
        profit: toNumber(row.revenue) - actualExpense,
        cashflow: toNumber(row.income) - cashExpense
      };
    };
    const series7Days = finance.series7Days.map(rebuildDayRow);
    const series30Days = finance.series30Days.map(rebuildDayRow);
    const series12Months = finance.series12Months.map(rebuildMonthRow);
    const year = source.now.getFullYear();
    const cashExpenseQuarter = source.expenses
      .filter(expense => isInQuarter(expense, source.now))
      .reduce((sum, expense) => sum + moneyOfExpense(expense), 0);
    const inventoryPurchaseExpenseQuarter = inventoryPurchaseExpenses
      .filter(expense => isInQuarter(expense, source.now))
      .reduce((sum, expense) => sum + moneyOfExpense(expense), 0);
    const costOfGoodsQuarter = [...inventorySoldCostByDate.entries()]
      .filter(([key]) => {
        const date = parseDate(key);
        return date && date.getFullYear() === source.now.getFullYear()
          && Math.floor(date.getMonth() / 3) === Math.floor(source.now.getMonth() / 3);
      })
      .reduce((sum, [, value]) => sum + toNumber(value), 0);
    const revenueQuarter = source.orders
      .filter(order => isInQuarter(order, source.now))
      .reduce((sum, order) => sum + orderTotal(order), 0);
    const incomeQuarter = source.payments
      .filter(payment => isInQuarter(payment, source.now))
      .reduce((sum, payment) => sum + moneyOfPayment(payment), 0);
    const actualExpenseQuarter = Math.max(0, cashExpenseQuarter - inventoryPurchaseExpenseQuarter) + costOfGoodsQuarter;
    const cashExpenseYear = sumByYear(source.expenses, year, moneyOfExpense);
    const inventoryPurchaseExpenseYear = sumByYear(inventoryPurchaseExpenses, year, moneyOfExpense);
    const costOfGoodsYear = [...inventorySoldCostByDate.entries()]
      .filter(([key]) => key.startsWith(`${year}-`))
      .reduce((sum, [, value]) => sum + toNumber(value), 0);
    const revenueYear = sumByYear(source.orders, year, orderTotal);
    const incomeYear = sumByYear(source.payments, year, moneyOfPayment);
    const actualExpenseYear = Math.max(0, cashExpenseYear - inventoryPurchaseExpenseYear) + costOfGoodsYear;
    const currentMonthCostBreakdownMap = new Map();
    currentMonthCostBreakdownMap.set('Giá vốn đã dùng', costOfGoodsMonth);
    source.expenses
      .filter(expense => !isInventoryPurchaseExpense(expense))
      .filter(expense => monthKey(getDateValue(expense)) === finance.currentMonthKey)
      .forEach(expense => {
        const category = classifyExpense(expense);
        currentMonthCostBreakdownMap.set(category, (currentMonthCostBreakdownMap.get(category) || 0) + moneyOfExpense(expense));
      });
    const costBreakdown = [...currentMonthCostBreakdownMap.entries()]
      .filter(([, value]) => toNumber(value) > 0)
      .map(([name, value]) => ({ name, value }));
    finance = {
      ...finance,
      cashExpenseToday: finance.expenseToday,
      cashExpenseYesterday: finance.expenseYesterday,
      cashExpenseWeek: finance.expenseWeek,
      cashExpenseMonth: finance.expenseMonth,
      cashExpensePreviousMonth: finance.expensePreviousMonth,
      inventoryPurchaseExpenseToday,
      inventoryPurchaseExpenseYesterday,
      inventoryPurchaseExpenseWeek,
      inventoryPurchaseExpenseMonth,
      inventoryPurchaseExpensePreviousMonth,
      nonInventoryExpenseToday,
      nonInventoryExpenseYesterday,
      nonInventoryExpenseWeek,
      nonInventoryExpenseMonth,
      nonInventoryExpensePreviousMonth,
      costOfGoodsToday,
      costOfGoodsYesterday,
      costOfGoodsWeek,
      costOfGoodsMonth,
      costOfGoodsPreviousMonth,
      actualUsedCostToday: costOfGoodsToday,
      actualUsedCostYesterday: costOfGoodsYesterday,
      actualUsedCostWeek: costOfGoodsWeek,
      actualUsedCostMonth: costOfGoodsMonth,
      actualUsedCostPreviousMonth: costOfGoodsPreviousMonth,
      expenseToday: actualExpenseToday,
      expenseYesterday: actualExpenseYesterday,
      expenseWeek: actualExpenseWeek,
      expenseMonth: actualExpenseMonth,
      expensePreviousMonth: actualExpensePreviousMonth,
      operatingExpenseToday: actualExpenseToday,
      operatingExpenseYesterday: actualExpenseYesterday,
      operatingExpenseWeek: actualExpenseWeek,
      operatingExpenseMonth: actualExpenseMonth,
      operatingExpensePreviousMonth: actualExpensePreviousMonth,
      profitExpenseToday: actualExpenseToday,
      profitExpenseWeek: actualExpenseWeek,
      profitExpenseMonth: actualExpenseMonth,
      profitExpensePreviousMonth: actualExpensePreviousMonth,
      totalExpenseToday: actualExpenseToday,
      totalExpenseWeek: actualExpenseWeek,
      totalExpenseMonth: actualExpenseMonth,
      profitToday: finance.revenueToday - actualExpenseToday,
      profitYesterday: finance.revenueYesterday - actualExpenseYesterday,
      profitWeek: finance.revenueWeek - actualExpenseWeek,
      profitMonth: finance.revenueMonth - actualExpenseMonth,
      profitPreviousMonth: finance.revenuePreviousMonth - actualExpensePreviousMonth,
      expenseChangePct: percentChange(actualExpenseMonth, actualExpensePreviousMonth),
      revenueQuarter,
      revenueYear,
      expenseQuarter: actualExpenseQuarter,
      expenseYear: actualExpenseYear,
      incomeQuarter,
      incomeYear,
      outcomeQuarter: cashExpenseQuarter,
      outcomeYear: cashExpenseYear,
      cashflowToday: finance.incomeToday - finance.expenseToday,
      cashflowWeek: finance.incomeWeek - finance.expenseWeek,
      cashflowQuarter: incomeQuarter - cashExpenseQuarter,
      cashflowYear: incomeYear - cashExpenseYear,
      quarterProfit: revenueQuarter - actualExpenseQuarter,
      yearProfit: revenueYear - actualExpenseYear,
      series7Days,
      series30Days,
      dailyCashflowRows: series30Days,
      series12Months,
      costBreakdown
    };
    const profitabilityBase = ProfitabilityService.build(source, finance);
    const profitabilityDiagnostics = buildProfitabilityDiagnostics(source, finance);
    const profitability = { ...profitabilityBase, ...profitabilityDiagnostics };
    const costs = CostAnalysisService.build(source, finance);
    const business = BusinessAnalysisService.build(source, finance, profitability);
    const operations = buildOperations(source, finance);

    const undeliveredRequests = source.orderRequests.filter(request => !isRequestDelivered(request, source.warehouseDispatches));
    const shell = {
      generatedAt: new Date().toISOString(),
      period: {
        todayKey: finance.todayKey,
        yesterdayKey: finance.yesterdayKey,
        currentMonthKey: finance.currentMonthKey,
        previousMonthKey: finance.previousMonthKey
      },
      finance,
      costs,
      business,
      profitability,
      operations,
      sourceCounts: {
        orders: source.orders.length,
        orderRequests: source.orderRequests.length,
        warehouseDispatches: source.warehouseDispatches.length,
        customers: source.customers.length
      }
    };

    const alerts = AlertService.build(source, shell);
    const kpis = [
      makeKpi({ id: 'revenueToday', title: 'Doanh thu hôm nay', value: finance.revenueToday, current: finance.revenueToday, previousDay: finance.revenueYesterday, currentMonth: finance.revenueMonth, previousMonth: finance.revenuePreviousMonth }),
      makeKpi({ id: 'revenueMonth', title: 'Doanh thu tháng', value: finance.revenueMonth, current: finance.revenueToday, previousDay: finance.revenueYesterday, currentMonth: finance.revenueMonth, previousMonth: finance.revenuePreviousMonth }),
      makeKpi({ id: 'profitToday', title: 'Lợi nhuận hôm nay', value: finance.profitToday, current: finance.profitToday, previousDay: finance.profitYesterday, currentMonth: finance.profitMonth, previousMonth: finance.profitPreviousMonth }),
      makeKpi({ id: 'profitMonth', title: 'Lợi nhuận tháng', value: finance.profitMonth, current: finance.profitToday, previousDay: finance.profitYesterday, currentMonth: finance.profitMonth, previousMonth: finance.profitPreviousMonth }),
      makeKpi({ id: 'expenseMonth', title: 'Tổng chi tháng', value: finance.expenseMonth, current: finance.expenseToday, previousDay: finance.expenseYesterday, currentMonth: finance.expenseMonth, previousMonth: finance.expensePreviousMonth, positiveWhen: 'down' }),
      makeKpi({ id: 'receivables', title: 'Công nợ phải thu', value: finance.receivables, current: finance.receivables, previousDay: finance.receivables, currentMonth: finance.receivables, previousMonth: finance.receivables, positiveWhen: 'down' }),
      makeKpi({ id: 'payables', title: 'Công nợ phải trả', value: finance.payables, current: finance.payables, previousDay: finance.payables, currentMonth: finance.payables, previousMonth: finance.payables, positiveWhen: 'down' }),
      makeKpi({ id: 'cashBalance', title: 'Tiền mặt hiện có', value: finance.cashBalance, current: finance.cashBalance, previousDay: finance.cashBalance, currentMonth: finance.cashBalance, previousMonth: finance.cashBalance }),
      makeKpi({ id: 'inventoryValue', title: 'Giá trị tồn kho', value: operations.inventoryValue, current: operations.inventoryValue, previousDay: operations.inventoryValue, currentMonth: operations.inventoryValue, previousMonth: operations.inventoryValue }),
      makeKpi({ id: 'undeliveredOrders', title: 'Đơn chưa giao', value: undeliveredRequests.length, kind: 'number', current: undeliveredRequests.length, previousDay: 0, currentMonth: undeliveredRequests.length, previousMonth: 0, positiveWhen: 'down' }),
      makeKpi({ id: 'employeesPresent', title: 'Nhân viên đi làm hôm nay', value: operations.employeesPresentToday, kind: 'number', current: operations.employeesPresentToday, previousDay: 0, currentMonth: operations.employeesPresentToday, previousMonth: source.employees.length }),
      makeKpi({ id: 'openAlerts', title: 'Cảnh báo đang mở', value: alerts.length, kind: 'number', current: alerts.length, previousDay: 0, currentMonth: alerts.length, previousMonth: 0, positiveWhen: 'down' })
    ];

    const completed = { ...shell, kpis, alerts };
    const insights = InsightService.build(source, completed, alerts);
    const recommendations = RecommendationService.build(source, completed, alerts);
    return { ...completed, insights, recommendations };
  }
};

export const buildExecutiveDashboardSnapshot = (input = {}) => DashboardService.build(input);
