// Frozen grouping before indexed lookup; amounts and iteration order remain identical.
export default () => {
    const entries = [];
    const visibleCustomersById = new Map(customerSummaries.map(customer => [`${customer.id}`, customer]));
    const findEntry = (name, phone, customerId) => entries.find(entry => (
      (customerId && entry.customerId === customerId)
      || (normalizeLookupText(entry.name) === normalizeLookupText(name)
        && (!entry.phone || !phone || normalizeCustomerPhone(entry.phone) === normalizeCustomerPhone(phone)))
    ));
    customerSummaries.filter(customer => customer.hasPurchaseReconciliation).forEach(customer => {
      entries.push({
        id: `customer-${customer.id}`,
        customerId: customer.id,
        name: customer.displayName || customer.name || 'Nhà cung cấp',
        phone: canSeeCustomerPhone ? (customer.phone || '') : '',
        address: canSeeCustomerLocation ? (customer.address || '') : '',
        importCount: 0,
        totalAmount: 0,
        lastImportTime: 0
      });
    });
    if (canViewSupplierImports) {
      safeCustomerWarehouseImports.filter(item => item && !item.isArchived).forEach(item => {
        const supplierName = `${item.supplier || item.supplierName || ''}`.trim();
        const customerId = `${item.supplierCustomerId || ''}`.trim();
        if (!supplierName && !customerId) return;
        const linkedCustomer = customerId ? visibleCustomersById.get(customerId) : null;
        if (customerId && !linkedCustomer) return;
        const name = linkedCustomer?.displayName || supplierName || linkedCustomer?.name || '';
        const phone = linkedCustomer
          ? (canSeeCustomerPhone ? (linkedCustomer.phone || item.supplierPhone || '') : '')
          : `${item.supplierPhone || ''}`.trim();
        let entry = findEntry(name, phone, linkedCustomer?.id || '');
        if (!entry) {
          entry = {
            id: linkedCustomer ? `customer-${linkedCustomer.id}` : `supplier-${normalizeLookupText(name)}-${normalizeCustomerPhone(phone)}`,
            customerId: linkedCustomer?.id || '',
            name,
            phone,
            address: linkedCustomer && canSeeCustomerLocation ? (linkedCustomer.address || '') : '',
            importCount: 0,
            totalAmount: 0,
            lastImportTime: 0
          };
          entries.push(entry);
        }
        entry.importCount += 1;
        entry.totalAmount += parseLooseMoneyValue(item.amount) || 0;
        const importDateTime = new Date(item.date || '').getTime();
        entry.lastImportTime = Math.max(entry.lastImportTime, Number.isFinite(importDateTime) ? importDateTime : (getEntityTimestamp(item) || 0));
      });
    }
    return entries.sort((a, b) => b.lastImportTime - a.lastImportTime || a.name.localeCompare(b.name, 'vi'));
  };
