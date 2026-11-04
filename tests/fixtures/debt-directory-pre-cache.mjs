// Frozen pre-cache callback. Source SHA256 9addd0630d7d3705e0d1ac89b697eb71838ec4c51d376cae5bf162005bf208f3
export const buildFrozenDebtDirectory=({customers,debtLedgerIndex,employees,getDateKeyFromAnyValue,getEntityTimestamp,getPaymentDateKey,getPaymentTimestamp,buildCustomerDebtLimitStatus})=>(() => customers.map(customer => {
    const ledger = debtLedgerIndex[customer.id];
    const manager = employees.find(emp => emp.id === customer.empId);
    const debtTransactions = [
      ...(ledger.orders || []).map(order => {
        const dateKey = getDateKeyFromAnyValue(order.date || order.createdAt || order.updatedAt || getEntityTimestamp(order));
        return {
          id: `order_${order.id}`,
          type: 'order',
          dateKey,
          timestamp: getEntityTimestamp(order) || (dateKey ? new Date(`${dateKey}T12:00:00`).getTime() : 0)
        };
      }),
      ...(ledger.payments || []).map(payment => {
        const dateKey = getPaymentDateKey(payment) || getDateKeyFromAnyValue(payment.date || payment.createdAt || payment.updatedAt || getEntityTimestamp(payment));
        return {
          id: `payment_${payment.id}`,
          type: 'payment',
          dateKey,
          timestamp: getPaymentTimestamp(payment) || getEntityTimestamp(payment) || (dateKey ? new Date(`${dateKey}T12:00:00`).getTime() : 0)
        };
      })
    ].filter(item => item.dateKey);
    const transactionTimes = debtTransactions.map(item => item.timestamp || 0).filter(Boolean);
    return {
      ...customer,
      ledger,
      debtLimitStatus: buildCustomerDebtLimitStatus(customer, ledger),
      managerName: manager?.name || 'Chưa gán',
      debtTransactions,
      latestDebtTransactionAt: transactionTimes.length ? Math.max(...transactionTimes) : 0,
      oldestDebtTransactionAt: transactionTimes.length ? Math.min(...transactionTimes) : 0
    };
  }))();
