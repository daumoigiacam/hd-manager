// Older compound saves repeated one customer's cashflow on each product row.
// Their generated ids share the exact save UUID; unrelated saves may have the
// same amount and must remain separate transactions.
export function deliveryCashflowKey(report, kind) {
  const linked = kind === 'income' ? report.paymentId : report.expenseId;
  const legacyBatch = /^dr_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_\d+$/i.exec(report.id || '');
  return linked || report.cashflowGroupId || legacyBatch?.[1] || report.id;
}

export function takeDeliveryCashflow(seen, report, kind, amount) {
  if (!(amount > 0)) return 0;
  const key = `${report.customerId || report.customerNameSnapshot || ''}:${deliveryCashflowKey(report, kind)}`;
  if (seen.has(key)) return 0;
  seen.add(key);
  return amount;
}
