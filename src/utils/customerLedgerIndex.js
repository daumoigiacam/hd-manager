const EMPTY_ROWS = Object.freeze([]);

function createCustomerIndex() {
  const datasets = new WeakMap();
  let previous = new Map();
  return rows => {
    const cached = datasets.get(rows);
    if (cached) return cached;
    const index = new Map();
    for (const row of rows) {
      const id = `${row?.customerId || ''}`.trim();
      if (!id) continue;
      if (!index.has(id)) index.set(id, []);
      index.get(id).push(row);
    }
    for (const [id, group] of index) {
      const old = previous.get(id);
      if (old?.length === group.length && group.every((row, i) => row === old[i])) index.set(id, old);
    }
    previous = index;
    datasets.set(rows, index);
    return index;
  };
}

// Snapshot rows retain their identity. Reuse unchanged customer groups so one
// payment/order edit does not rebuild every customer's financial history.
export function createCustomerLedgerMapBuilder(buildLedger) {
  const indexOrders = createCustomerIndex();
  const indexPayments = createCustomerIndex();
  const ledgers = new WeakMap();
  return (customers, orders, payments, dayKey) => {
    const safeOrders = Array.isArray(orders) ? orders : EMPTY_ROWS;
    const safePayments = Array.isArray(payments) ? payments : EMPTY_ROWS;
    const ordersByCustomer = indexOrders(safeOrders);
    const paymentsByCustomer = indexPayments(safePayments);
    return Object.fromEntries((Array.isArray(customers) ? customers : []).filter(Boolean).map(customer => {
      const id = `${customer.id || ''}`.trim();
      const customerOrders = ordersByCustomer.get(id) || EMPTY_ROWS;
      const customerPayments = paymentsByCustomer.get(id) || EMPTY_ROWS;
      let entry = ledgers.get(customer);
      if (!entry || entry.dayKey !== dayKey || entry.orders !== customerOrders || entry.payments !== customerPayments) {
        entry = { dayKey, orders: customerOrders, payments: customerPayments, ledger: buildLedger(customer, customerOrders, customerPayments) };
        ledgers.set(customer, entry);
      }
      return [customer.id, entry.ledger];
    }));
  };
}
