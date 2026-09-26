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

export function getReportPeriod(finance = {}, period = 'today', customRange = null) {
  const today = String(finance.todayKey || '');
  const month = String(finance.currentMonthKey || today.slice(0, 7));
  const quarter = Math.floor((Number(month.slice(5, 7)) - 1) / 3);
  const year = today.slice(0, 4);
  const daily = Array.isArray(finance.series30Days) ? finance.series30Days : [];
  const monthly = Array.isArray(finance.series12Months) ? finance.series12Months : [];
  const rangeRows = period === 'custom'
    ? daily.filter((row) => row.date >= customRange?.start && row.date <= customRange?.end)
    : [];
  const map = {
    today: { label: 'Hôm nay', revenue: finance.revenueToday, profit: finance.profitToday, expense: finance.expenseToday, rows: daily.filter((row) => row.date === today), previous: { revenue: finance.revenueYesterday, profit: finance.profitYesterday, expense: finance.expenseYesterday } },
    week: { label: 'Tuần này', revenue: finance.revenueWeek, profit: finance.profitWeek, expense: finance.expenseWeek, rows: daily.filter((row) => row.date >= finance.weekStartKey && row.date <= finance.weekEndKey) },
    month: { label: 'Tháng này', revenue: finance.revenueMonth, profit: finance.profitMonth, expense: finance.expenseMonth, rows: daily.filter((row) => String(row.date).startsWith(month)), previous: { revenue: finance.revenuePreviousMonth, profit: finance.profitPreviousMonth, expense: finance.expensePreviousMonth } },
    quarter: { label: `Quý ${quarter + 1}`, revenue: finance.revenueQuarter, profit: finance.quarterProfit, expense: finance.expenseQuarter, rows: monthly.filter((row) => String(row.month).startsWith(year) && Math.floor((Number(String(row.month).slice(5, 7)) - 1) / 3) === quarter) },
    year: { label: `Năm ${year}`, revenue: finance.revenueYear, profit: finance.yearProfit, expense: finance.expenseYear, rows: monthly.filter((row) => String(row.month).startsWith(year)) },
    custom: { label: `${formatShortDate(customRange?.start)}–${formatShortDate(customRange?.end)}`, revenue: sumRows(rangeRows, 'revenue'), profit: sumRows(rangeRows, 'profit'), expense: sumRows(rangeRows, 'expense'), rows: rangeRows },
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
