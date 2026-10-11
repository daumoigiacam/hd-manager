// Consume the same scoped, attributed rows as the rankings; never recalculate prices.
export function selectRevenueDetail(business, selection, report) {
  if (!selection?.id || !['employee', 'customer'].includes(selection.kind)) return { rows: [], revenue: 0 };
  const source = selection.kind === 'employee' ? business.salesEmployeeOrders : business.customerPerformanceRows;
  const rows = (source || []).filter(row => String(row.id) === String(selection.id)
    && row.date >= report.startDate && row.date <= report.endDate);
  rows.sort((a, b) => b.date.localeCompare(a.date));
  return { rows, revenue: rows.reduce((total, row) => total + (Number(row.revenue) || 0), 0) };
}
