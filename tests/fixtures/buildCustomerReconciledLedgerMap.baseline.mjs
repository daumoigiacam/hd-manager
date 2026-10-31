// Frozen candidate 0c29b54f source, before cooperative ledger changes.
export default (customers = [], orders = [], payments = [], warehouseImports = [], expenses = []) => {
  const salesLedgers = buildCustomerLedgerMap(customers, orders, payments);
  const importsByCustomerId = new Map();
  const importsByPhone = new Map();
  const importsByName = new Map();
  const repaymentsByCustomer = new Map();
  expenses.forEach(item => {
    if (!item || item.isArchived || item.sourceType !== 'customer_debt_repayment') return;
    if (!repaymentsByCustomer.has(item.customerId)) repaymentsByCustomer.set(item.customerId, []);
    repaymentsByCustomer.get(item.customerId).push(item);
  });
  const addImport = (index, key, item) => {
    if (!key) return;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(item);
  };

  (Array.isArray(warehouseImports) ? warehouseImports : []).forEach(item => {
    if (!item || item.isArchived) return;
    addImport(importsByCustomerId, `${item.supplierCustomerId || item.linkedCustomerId || item.customerId || ''}`.trim(), item);
    addImport(importsByPhone, normalizeCustomerPhone(item.supplierPhone || item.phone || item.customerPhone || ''), item);
    addImport(importsByName, normalizeLookupText(item.supplier || item.supplierName || item.customerName || item.customerNameSnapshot || ''), item);
  });

  return Object.fromEntries((Array.isArray(customers) ? customers : []).filter(Boolean).map(customer => {
    const customerId = `${customer.id || ''}`.trim();
    const phone = normalizeCustomerPhone(customer.phone || customer.phoneNumber || '');
    const name = normalizeLookupText(getCustomerDisplayName(customer) || customer.name || '');
    const matchedImports = [...new Set([
      ...(importsByCustomerId.get(customerId) || []),
      ...(importsByPhone.get(phone) || []),
      ...(importsByName.get(name) || [])
    ])];
    const purchaseLedger = buildCustomerSupplierPurchaseLedger(customer, matchedImports);
    return [customer.id, applyCustomerSupplierReconciliation(salesLedgers[customer.id], purchaseLedger,
      getCustomerDebtRepayments(customer, repaymentsByCustomer.get(customer.id) || []))];
  }));
};
