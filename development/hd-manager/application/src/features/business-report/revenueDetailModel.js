// Consume the same scoped, attributed rows as the rankings; never recalculate prices.
export function selectRevenueDetail(business, selection, report) {
  if (!selection?.id || !['employee', 'customer'].includes(selection.kind)) return { rows: [], revenue: 0 };
  const source = selection.kind === 'employee' ? business.salesEmployeeOrders : business.customerPerformanceRows;
  const rows = (source || []).filter(row => String(row.id) === String(selection.id) && validDateKey(row.date)
    && row.date >= report.startDate && row.date <= report.endDate);
  rows.sort((a, b) => b.date.localeCompare(a.date));
  return { rows, revenue: rows.reduce((total, row) => total + (Number(row.revenue) || 0), 0) };
}

function validDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function getEmployeeRevenueYears(business, selection, asOfDate, preferredYear) {
  if (selection?.kind !== 'employee' || !selection.id || !validDateKey(asOfDate)) return [];
  const years = new Set([asOfDate.slice(0, 4)]);
  if (/^[1-9]\d{3}$/.test(String(preferredYear)) && String(preferredYear) <= asOfDate.slice(0, 4)) years.add(String(preferredYear));
  for (const row of business.salesEmployeeOrders || []) {
    if (String(row.id) === String(selection.id) && validDateKey(row.date) && row.date <= asOfDate) years.add(row.date.slice(0, 4));
  }
  return [...years].sort((a, b) => b.localeCompare(a));
}

// Reuse authorized invoice amounts and the reporting date from the snapshot.
export function selectEmployeeRevenueYear(business, selection, year, asOfDate) {
  if (selection?.kind !== 'employee' || !selection.id || !/^[1-9]\d{3}$/.test(String(year)) || !validDateKey(asOfDate)) return null;
  const months = Array.from({length: 12}, (_, index) => {
    const key = `${year}-${String(index + 1).padStart(2, '0')}`;
    const lastDay = new Date(Date.UTC(Number(year), index + 1, 0)).toISOString().slice(0, 10);
    return {key, month: index + 1, startDate: key + '-01', endDate: lastDay < asOfDate ? lastDay : asOfDate, future: key + '-01' > asOfDate, revenue: 0, orders: 0};
  });
  for (const row of business.salesEmployeeOrders || []) {
    if (String(row.id) !== String(selection.id) || !validDateKey(row.date) || !row.date.startsWith(String(year) + '-') || row.date > asOfDate) continue;
    const month = months[Number(row.date.slice(5, 7)) - 1];
    month.revenue += Number(row.revenue) || 0;
    month.orders += 1;
  }
  return {year: String(year), months, revenue: months.reduce((total, month) => total + month.revenue, 0), orders: months.reduce((total, month) => total + month.orders, 0)};
}
