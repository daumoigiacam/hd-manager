const EMPTY_ROWS = Object.freeze([]);

// Immutable snapshots only. Preserve strict customerId equality and row order;
// callers retain their existing archive/approval/source predicates. Weak keys
// let an obsolete dataset and its index be collected together.
export function createCustomerRecordSelector() {
  const datasets = new WeakMap();
  return (rows, customerId) => {
    if (!Array.isArray(rows)) throw new TypeError('Customer history requires an immutable record array');
    let index = datasets.get(rows);
    if (!index) {
      index = new Map();
      for (const row of rows) {
        if (row == null) continue;
        const key = row.customerId;
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(row);
      }
      datasets.set(rows, index);
    }
    return index.get(customerId) || EMPTY_ROWS;
  };
}

function createCustomerIndex() {
  const datasets = new WeakMap();
  let previous = new Map();
  function* prepare(rows) {
    const cached = datasets.get(rows);
    if (cached) return cached;
    const index = new Map();
    for (const row of rows) {
      yield;
      const id = `${row?.customerId || ''}`.trim();
      if (!id) continue;
      if (!index.has(id)) index.set(id, []);
      index.get(id).push(row);
    }
    for (const [id, group] of index) {
      const old = previous.get(id);
      if (old?.length === group.length) {
        let equal = true;
        for (let i = 0; i < group.length; i++) {
          yield;
          if (group[i] !== old[i]) { equal = false; break; }
        }
        if (equal) index.set(id, old);
      }
    }
    previous = index;
    datasets.set(rows, index);
    return index;
  }
  return (rows, cooperative) => cooperative ? prepare(rows) : drain(prepare(rows));
}

function drain(iterator) {
  for (;;) { const next = iterator.next(); if (next.done) return next.value; }
}

// Snapshot rows retain their identity. Reuse unchanged customer groups so one
// payment/order edit does not rebuild every customer's financial history.
export function createCustomerLedgerMapBuilder(buildLedger) {
  const indexOrders = createCustomerIndex();
  const indexPayments = createCustomerIndex();
  const ledgers = new WeakMap();
  return (customers, orders, payments, dayKey, {cooperative = false} = {}) => {
    function* prepare() {
    const safeOrders = Array.isArray(orders) ? orders : EMPTY_ROWS;
    const safePayments = Array.isArray(payments) ? payments : EMPTY_ROWS;
    const ordersByCustomer = yield* indexOrders(safeOrders, true);
    const paymentsByCustomer = yield* indexPayments(safePayments, true);
    const entries = [];
    for (const customer of (Array.isArray(customers) ? customers : [])) {
      yield;
      if (!customer) continue;
      const id = `${customer.id || ''}`.trim();
      const customerOrders = ordersByCustomer.get(id) || EMPTY_ROWS;
      const customerPayments = paymentsByCustomer.get(id) || EMPTY_ROWS;
      let entry = ledgers.get(customer);
      if (!entry || entry.dayKey !== dayKey || entry.orders !== customerOrders || entry.payments !== customerPayments) {
        const prepared = buildLedger(customer, customerOrders, customerPayments,
          cooperative ? {cooperative: true, historyAlreadySelected: true} : undefined);
        const ledger = prepared && typeof prepared.next === 'function' ? yield* prepared : prepared;
        entry = { dayKey, orders: customerOrders, payments: customerPayments, ledger };
        ledgers.set(customer, entry);
      }
      entries.push([customer.id, entry.ledger]);
    }
    return Object.fromEntries(entries);
    }
    return cooperative ? prepare() : drain(prepare());
  };
}
