const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export const formatVnd = (value) => `${Math.round(number(value)).toLocaleString('vi-VN')} đ`;

export const formatCompactVnd = (value) => {
  const amount = number(value);
  const magnitude = Math.abs(amount);
  if (magnitude >= 1_000_000_000) return `${(amount / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`;
  if (magnitude >= 1_000_000) return `${(amount / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;
  return formatVnd(amount);
};

export const formatPercent = (value) => `${number(value).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
export const formatShortDate = (key) => {
  const [year, month, day] = String(key || '').split('-');
  return year && month && day ? `${day}/${month}` : String(key || '');
};

export const REPORT_PERIODS = [
  { id: 'today', label: 'Hôm nay' },
  { id: 'week', label: 'Tuần' },
  { id: 'month', label: 'Tháng' },
  { id: 'quarter', label: 'Quý' },
  { id: 'year', label: 'Năm' },
];

const sumRows = (rows, field) => rows.reduce((sum, row) => sum + number(row?.[field]), 0);

export function getPayrollPeriodSummary(finance = {}, report = {}) {
  const employees = aggregateReportRows(finance.salaryEmployeeRows || [], report, {
    groupBy: 'employeeId', valueFields: ['value'], limit: Infinity,
  });
  employees.forEach(employee => {
    const source = (finance.salaryEmployeeRows || []).find(row => (row.id || String(row.employeeId || row.name || 'Khác')) === employee.id && (!report.startDate || row.date >= report.startDate) && (!report.endDate || row.date <= report.endDate));
    employee.employeeId = source?.employeeId || '';
    employee.date = report.endDate || source?.date || '';
  });
  return { employees, total: sumRows(employees, 'value') };
}

const isPayrollExpenseRow = row => row.sourceType === 'payroll' || row.category === 'Lương';

export function getNonPayrollExpenseItems(rows = [], report = {}) {
  return aggregateReportRows(rows.filter(row => !isPayrollExpenseRow(row)), report, {
    groupBy: 'name', valueFields: ['value'], limit: Infinity,
  });
}

export function getExpenseSourceRows(rows = [], report = {}, selected = {}) {
  return rows.filter(row => !isPayrollExpenseRow(row) && row.name === selected.name && row.date
    && (!report.startDate || row.date >= report.startDate)
    && (!report.endDate || row.date <= report.endDate))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getPeriodGuidance(snapshot, report, customers, costs) {
  const alerts = (snapshot.alerts || []).filter(row => !['negativeProfit', 'expenseSpike'].includes(row.id))
    .map(row => ({ ...row, message: `Hiện tại: ${row.message}` }));
  if (report.profit < 0) alerts.unshift({ id: 'negativeProfit', title: 'Lợi nhuận âm', message: `${report.label}: lợi nhuận ${formatVnd(report.profit)}. Cần kiểm tra giá vốn, giá bán và chi phí.`, targetTab: 'executive_dashboard' });
  const change = getChangePercent(report.expense, report.previous?.expense);
  if (change > 30) alerts.push({ id: 'expenseSpike', title: 'Chi phí tăng đột biến', message: `${report.label}: chi phí tăng ${formatPercent(change)} so với kỳ trước.`, targetTab: 'finance' });
  const recommendations = (snapshot.recommendations || []).filter(row => !['adjust-low-margin', 'cost-control', 'handle-first-alert'].includes(row.id))
    .map(row => ({ ...row, impact: `Hiện tại: ${row.impact}` }));
  const customer = customers.find(row => row.revenue > 0 && row.profit / row.revenue < 0.02);
  if (customer) recommendations.push({ id: 'adjust-low-margin', title: `Rà soát giá bán khách ${customer.name}`, impact: `${report.label}: biên lợi nhuận ${formatPercent(customer.profit / customer.revenue * 100)}`, targetTab: 'customers' });
  const cost = costs[0];
  if (cost?.value > 0 && report.expense > 0) recommendations.push({ id: 'cost-control', title: `Kiểm soát ${cost.name.toLowerCase()}`, impact: `${report.label}: khoản này chiếm ${formatPercent(cost.value / report.expense * 100)} tổng chi`, targetTab: 'finance' });
  return { alerts, recommendations };
}

export function getReportPeriod(finance = {}, period = 'today', customRange = null) {
  const today = String(finance.todayKey || '');
  const month = String(finance.currentMonthKey || today.slice(0, 7));
  const quarter = Math.floor((Number(month.slice(5, 7)) - 1) / 3);
  const year = today.slice(0, 4);
  const quarterStartMonth = String(quarter * 3 + 1).padStart(2, '0');
  const daily = Array.isArray(finance.series30Days) ? finance.series30Days : [];
  const monthly = Array.isArray(finance.series12Months) ? finance.series12Months : [];
  const rangeRows = period === 'custom'
    ? daily.filter((row) => row.date >= customRange?.start && row.date <= customRange?.end)
    : [];
  const map = {
    today: { label: 'Hôm nay', startDate: today, endDate: today, revenue: finance.revenueToday, profit: finance.profitToday, expense: finance.expenseToday, rows: daily.filter((row) => row.date === today), previous: { revenue: finance.revenueYesterday, profit: finance.profitYesterday, expense: finance.expenseYesterday } },
    week: { label: 'Tuần này', startDate: finance.weekStartKey, endDate: finance.weekEndKey, revenue: finance.revenueWeek, profit: finance.profitWeek, expense: finance.expenseWeek, rows: daily.filter((row) => row.date >= finance.weekStartKey && row.date <= finance.weekEndKey) },
    month: { label: 'Tháng này', startDate: `${month}-01`, endDate: today, revenue: finance.revenueMonth, profit: finance.profitMonth, expense: finance.expenseMonth, rows: daily.filter((row) => String(row.date).startsWith(month)), previous: { revenue: finance.revenuePreviousMonth, profit: finance.profitPreviousMonth, expense: finance.expensePreviousMonth } },
    quarter: { label: `Quý ${quarter + 1}`, startDate: `${year}-${quarterStartMonth}-01`, endDate: today, revenue: finance.revenueQuarter, profit: finance.quarterProfit, expense: finance.expenseQuarter, rows: monthly.filter((row) => String(row.month).startsWith(year) && Math.floor((Number(String(row.month).slice(5, 7)) - 1) / 3) === quarter) },
    year: { label: `Năm ${year}`, startDate: `${year}-01-01`, endDate: today, revenue: finance.revenueYear, profit: finance.yearProfit, expense: finance.expenseYear, rows: monthly.filter((row) => String(row.month).startsWith(year)) },
    custom: { label: `${formatShortDate(customRange?.start)}–${formatShortDate(customRange?.end)}`, startDate: customRange?.start, endDate: customRange?.end, revenue: sumRows(rangeRows, 'revenue'), profit: sumRows(rangeRows, 'profit'), expense: sumRows(rangeRows, 'expense'), rows: rangeRows },
  };
  const selected = map[period] || map.today;
  const chartRows = period === 'today' ? (Array.isArray(finance.series7Days) ? finance.series7Days : []) : selected.rows;
  return {
    ...selected,
    revenue: number(selected.revenue),
    profit: number(selected.profit),
    expense: number(selected.expense),
    receivables: number(finance.receivables),
    overdueReceivables: number(finance.overdueReceivables),
    chartRows,
    chartLabel: period === 'today' ? '7 ngày' : selected.label,
  };
}

export function aggregateReportRows(rows = [], report = {}, { groupBy = 'name', valueFields = ['value'], limit = 30 } = {}) {
  const totals = new Map();
  rows.forEach((row) => {
    if (!row?.date || (report.startDate && row.date < report.startDate) || (report.endDate && row.date > report.endDate)) return;
    const key = String(row[groupBy] || row.name || 'Khác');
    const current = totals.get(key) || { id: row.id || key, name: row.name || key, category: row.category || '', department: row.department || '', detail: row.detail || '', count: 0 };
    valueFields.forEach((field) => { current[field] = (current[field] || 0) + number(row[field]); });
    current.count += 1;
    totals.set(key, current);
  });
  const sortField = valueFields[0];
  return [...totals.values()]
    .sort((left, right) => number(right[sortField]) - number(left[sortField]) || left.name.localeCompare(right.name, 'vi'))
    .slice(0, limit);
}

export function getTopSalesEmployees(business = {}, finance = {}, period = 'today', customRange = null, limit = 5) {
  const today = String(finance.todayKey || '');
  const month = String(finance.currentMonthKey || today.slice(0, 7));
  const quarterStartMonth = String(Math.floor((Number(month.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0');
  const ranges = {
    today: [today, today],
    week: [finance.weekStartKey, today],
    month: [`${month}-01`, today],
    quarter: [`${today.slice(0, 4)}-${quarterStartMonth}-01`, today],
    year: [`${today.slice(0, 4)}-01-01`, today],
    custom: [customRange?.start, customRange?.end],
  };
  const [start, end] = ranges[period] || ranges.today;
  if (!start || !end) return [];
  const totals = new Map();
  (business.salesEmployeeOrders || []).forEach((row) => {
    if (!row.date || row.date < start || row.date > end) return;
    const id = String(row.id || row.name || '');
    if (!id) return;
    const current = totals.get(id) || { id, name: row.name || 'Nhân viên', revenue: 0, orders: 0 };
    current.revenue += number(row.revenue);
    current.orders += number(row.orders || 1);
    totals.set(id, current);
  });
  return [...totals.values()].filter((row) => row.revenue > 0)
    .sort((left, right) => right.revenue - left.revenue || left.name.localeCompare(right.name, 'vi'))
    .slice(0, limit);
}

export function getChangePercent(current, previous) {
  if (!Number.isFinite(Number(previous)) || number(previous) === 0) return null;
  return ((number(current) - number(previous)) / Math.abs(number(previous))) * 100;
}

export function getProductImage(productRow, products = []) {
  const normalized = String(productRow?.name || '').trim().toLocaleLowerCase('vi-VN');
  const product = products.find((item) => String(item?.id || '') === String(productRow?.id || ''))
    || products.find((item) => String(item?.name || '').trim().toLocaleLowerCase('vi-VN') === normalized);
  const candidate = product?.imageUrl || product?.photoUrl || product?.image || product?.photo || product?.images?.[0];
  return typeof candidate === 'string' ? candidate : candidate?.url || '';
}

export function getRevenueGroups(rows = [], limit = 5) {
  const positive = rows.filter((row) => number(row.revenue) > 0);
  const total = sumRows(positive, 'revenue');
  if (!total) return [];
  const visible = positive.slice(0, limit);
  const visibleTotal = sumRows(visible, 'revenue');
  const groups = visible.map((row) => ({ name: row.name, value: number(row.revenue), share: number(row.revenue) / total * 100 }));
  if (visibleTotal < total) groups.push({ name: 'Khác', value: total - visibleTotal, share: (total - visibleTotal) / total * 100 });
  return groups;
}
