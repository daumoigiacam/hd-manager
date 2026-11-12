// Read-only projection: finance remains the source of truth for linked costs.
export function projectAssetExpenses(logs, expenses, companyId, isConfirmed) {
  const byId = new Map();
  const byLog = new Map();
  for (const expense of expenses) {
    if (expense.companyId !== companyId) continue;
    byId.set(expense.id, expense);
    for (const key of ['assetCostLogId', 'relatedAssetCostLogId', 'sourceAssetCostLogId']) {
      if (expense[key]) byLog.set(expense[key], expense);
    }
  }
  const used = new Set();
  const rows = [];
  const project = (expense, log = {}) => {
    const assetId = expense.assetId ?? expense.vehicleId ?? expense.deliveryExpenseAssetId ?? log.assetId;
    if (!assetId || expense.isArchived || !isConfirmed(expense)) return;
    const category = `${expense.category || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    rows.push({
      ...log,
      id: log.id || `finance_${expense.id}`,
      companyId,
      expenseId: expense.id,
      assetId,
      amount: expense.amount,
      date: expense.date || log.date || expense.createdAt,
      createdAt: expense.createdAt || log.createdAt,
      note: expense.note || '',
      type: /xang|nhien lieu|fuel|dau/.test(category) ? 'fuel' : (log.type || 'other'),
      isArchived: false,
      financeProjection: !log.id,
    });
  };
  for (const log of logs) {
    if (log.companyId !== companyId || log.isArchived) continue;
    const expense = byId.get(log.expenseId || log.relatedExpenseId) || byLog.get(log.id);
    if (expense) {
      if (!used.has(expense.id)) project(expense, log);
      used.add(expense.id);
    } else rows.push(log);
  }
  for (const expense of byId.values()) {
    if (!used.has(expense.id)) project(expense);
  }
  return rows;
}
