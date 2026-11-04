// Frozen synchronous customer summary calculation before cooperative scheduling.
export default (cus) => {
    const ledger = customerLedgerIndex[cus.id] || buildCustomerReconciledLedger(cus, orders, payments, safeCustomerWarehouseImports, expenses);
    const purchaseReconciliationEnabled = Boolean(
      cus?.purchaseReconciliationEnabled ||
      cus?.isPurchaseReconciliationEnabled ||
      cus?.reconciliationEnabled ||
      cus?.hasPurchaseReconciliation
    );
    const loyalty = calculateCustomerLoyaltySummary({
      customer: cus,
      ledger,
      company: currentCompany,
      pointsRecord: customerPointLookup.get(cus.id)
    });
    const debtLimitStatus = buildCustomerDebtLimitStatus(cus, ledger);
    const customerDebtOrders = ledger.orders.filter(order => Math.max(0, parseLooseMoneyValue(order.outstandingAmount)) > 0);
    const customerOrders = ledger.orders.filter(order => !order.isOpeningDebt).sort((a, b) => new Date(b.date) - new Date(a.date));
    const customerPayments = [...ledger.payments].sort((a, b) => new Date(b.date) - new Date(a.date));
    const manager = employees.find(emp => emp.id === cus.empId);

    return {
      ...cus,
      customerHonorific: getCustomerHonorific(cus),
      plainName: getCustomerPlainName(cus),
      displayName: getCustomerDisplayName(cus),
      orders: customerOrders,
      debtOrders: customerDebtOrders,
      payments: customerPayments,
      totalRevenue: ledger.totalRevenue,
      totalPaid: ledger.totalPaid,
      currentDebt: ledger.currentDebt,
      creditBalance: ledger.creditBalance,
      purchaseReconciliationEnabled,
      hasPurchaseReconciliation: purchaseReconciliationEnabled || ledger.hasPurchaseReconciliation,
      salesDebtBeforeReconcile: ledger.salesDebtBeforeReconcile,
      purchaseDebt: ledger.purchaseDebt,
      openingPayableAmount: ledger.openingPayableAmount,
      openingPayableDate: ledger.openingPayableDate,
      openingPayableNote: ledger.openingPayableNote,
      purchaseImportAmount: ledger.purchaseImportAmount,
      purchaseImports: ledger.purchaseImports,
      companyOwesBeforeReconcile: ledger.companyOwesBeforeReconcile,
      reconciliationOffset: ledger.reconciliationOffset,
      reconciliationStatus: ledger.reconciliationStatus,
      reconciliationNetAmount: ledger.reconciliationNetAmount,
      debtLimitStatus,
      orderCount: customerOrders.length,
      managerName: manager?.name || 'Chưa gán',
      lastOrderDate: customerOrders[0]?.date || '',
      loyalty,
      loyaltyPoints: loyalty.currentPoints,
      loyaltyEligibleAmount: loyalty.eligibleAmount,
      loyaltyRedeemValue: loyalty.redeemValue,
      driverDebtAccessEnabled: cus.driverDebtAccessEnabled ?? ((cus.allowedDriverIds || []).length > 0),
      allowedDriverIds: cus.allowedDriverIds || [],
      allowedDriverNames: (cus.allowedDriverIds || [])
        .map(driverId => employees.find(emp => emp.id === driverId && isEmployeeDeliveryParticipant(emp))?.name)
        .filter(Boolean)
    };
  };
