// Frozen daily finance callback from installed APK 03fead14.
export default () => {

    const rowsByDate = new Map();
    const ensureRow = (date) => {
      if (!date) return null;
      if (!rowsByDate.has(date)) {
        rowsByDate.set(date, { date, revenue: 0, expense: 0, profit: 0 });
      }
      return rowsByDate.get(date);
    };
    const isActiveRecord = (record = {}) => !(
      record.archived
      || record.isArchived
      || record.deleted
      || record.isDeleted
      || ['cancelled', 'canceled', 'deleted'].includes(`${record.status || ''}`.toLowerCase())
    );
    const getOrderRevenue = (order = {}) => {
      const direct = parseLooseMoneyValue(order.totalAmount ?? order.grandTotal ?? order.total ?? order.amount ?? order.finalAmount);
      if (direct > 0) return direct;
      const items = Array.isArray(order.items) && order.items.length
        ? order.items
        : (Array.isArray(order.lines) && order.lines.length ? order.lines : (Array.isArray(order.products) ? order.products : []));
      return items.reduce((sum, item) => {
        return sum + getTransactionBillingPresentation(item).amount;
      }, 0);
    };
    const getExpenseAmount = (expense = {}) => parseLooseMoneyValue(expense.amount ?? expense.total ?? expense.cost ?? expense.value ?? expense.money);
    const resolveFinanceDateKey = (record = {}, dateFields = []) => {
      const rawDate = dateFields.find(value => value !== undefined && value !== null && `${value}`.trim() !== '');
      return resolveEntityDateKey({ ...record, date: rawDate || record.date }, '');
    };

    (orders || []).filter(isActiveRecord).forEach((order) => {
      const date = resolveFinanceDateKey(order, [
        order.date,
        order.orderDate,
        order.createdAt,
        order.updatedAt,
        order.timestamp
      ]);
      const row = ensureRow(date);
      if (!row) return;
      row.revenue += getOrderRevenue(order);
    });

    (expenses || []).filter(isActiveRecord).forEach((expense) => {
      const date = resolveFinanceDateKey(expense, [
        expense.date,
        expense.transactionDate,
        expense.paymentDate,
        expense.expenseDate,
        expense.createdAt,
        expense.updatedAt,
        expense.timestamp
      ]);
      const row = ensureRow(date);
      if (!row) return;
      row.expense += getExpenseAmount(expense);
    });

    return [...rowsByDate.values()]
      .map(row => ({ ...row, profit: row.revenue - row.expense }))
      .filter(row => row.revenue > 0 || row.expense > 0)
      .sort((a, b) => `${b.date}`.localeCompare(`${a.date}`));
  };
