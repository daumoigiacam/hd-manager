import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const OUTPUT_DIR = path.resolve('test-results');
const COMPANY_ID = `stress_company_${RUN_ID}`;
const TODAY = '2026-07-13';

const counters = new Map();
const operations = [];
const failures = [];
const warnings = [];
const autoFixes = [];

function count(type) {
  counters.set(type, (counters.get(type) || 0) + 1);
}

function record(type, detail = {}) {
  count(type);
  operations.push({
    index: operations.length + 1,
    type,
    ...detail
  });
}

function fail(code, detail = {}) {
  failures.push({
    code,
    ...detail
  });
}

function warn(code, detail = {}) {
  warnings.push({
    code,
    ...detail
  });
}

function assert(condition, code, detail = {}) {
  if (!condition) fail(code, detail);
}

function createPrng(seed = 20260713) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const random = createPrng();

function pick(list) {
  return list[Math.floor(random() * list.length)];
}

function numberIn(min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function money(value) {
  return Math.max(0, Math.round(value));
}

function stripAccent(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function normalizeText(value) {
  return stripAccent(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeSearch(value) {
  return normalizeText(value).replace(/\s+/g, '');
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D+/g, '');
  if (digits.startsWith('84')) return `0${digits.slice(2)}`;
  return digits;
}

function containsQuery(recordValue, query) {
  const haystack = normalizeSearch(recordValue);
  const needle = normalizeSearch(query);
  return haystack.includes(needle);
}

function assertNoUndefined(value, label, trail = label) {
  if (value === undefined) {
    fail('undefined-value', { label, trail });
    return;
  }

  if (Number.isNaN(value)) {
    fail('nan-value', { label, trail });
    return;
  }

  if (!value || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoUndefined(item, label, `${trail}[${index}]`));
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    assertNoUndefined(child, label, `${trail}.${key}`);
  }
}

function removeUndefined(value) {
  if (Array.isArray(value)) return value.map(removeUndefined).filter((item) => item !== undefined);
  if (!value || typeof value !== 'object') return value;

  const cleaned = {};
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) {
      autoFixes.push({ type: 'remove-undefined-field', key });
      continue;
    }
    cleaned[key] = removeUndefined(child);
  }
  return cleaned;
}

function push(db, collection, doc) {
  const cleaned = removeUndefined(doc);
  assertNoUndefined(cleaned, `${collection}:${cleaned.id || 'no-id'}`);
  db[collection].push(cleaned);
  record(`create:${collection}`, { id: cleaned.id });
  return cleaned;
}

function dateOffset(days) {
  const value = new Date(`${TODAY}T00:00:00+07:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function timeAt(hour, minute = 0) {
  return `${TODAY}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+07:00`;
}

function id(prefix, index) {
  return `${prefix}_${String(index).padStart(5, '0')}`;
}

function initDb() {
  return {
    companies: [],
    employees: [],
    customers: [],
    products: [],
    orderRequests: [],
    orders: [],
    payments: [],
    expenses: [],
    warehouseImports: [],
    warehouseDispatches: [],
    attendance: [],
    advances: [],
    evaluations: [],
    notifications: [],
    messages: [],
    assets: [],
    deliveryReports: []
  };
}

function createBaseData(db) {
  push(db, 'companies', {
    id: COMPANY_ID,
    name: 'HD STRESS COMPANY',
    slogan: 'Run fast, keep data safe',
    createdAt: timeAt(6),
    status: 'active'
  });

  const roles = ['owner', 'accounting', 'sales', 'driver', 'production', 'warehouse'];
  for (let i = 1; i <= 60; i += 1) {
    const role = roles[i % roles.length];
    push(db, 'employees', {
      id: id('emp', i),
      companyId: COMPANY_ID,
      name: `Nhan vien ${i}`,
      phone: `0909${String(100000 + i).slice(-6)}`,
      role,
      departments: role === 'driver' ? ['driver', 'production'] : [role],
      salary: i % 9 === 0 ? -100000 : 7500000 + i * 25000,
      advanceLimitPercent: i % 7 === 0 ? null : 30,
      createdAt: timeAt(7, i % 60)
    });
  }

  const groups = ['Vit', 'Ga', 'Ga cong nghiep', 'Chan', 'Long', 'Phu'];
  const types = ['Song', 'Khong moc', 'Moc', 'Bong', 'Uc', 'Canh', 'Dui', 'Chan'];
  let productIndex = 1;
  for (const group of groups) {
    for (const type of types) {
      push(db, 'products', {
        id: id('prod', productIndex),
        companyId: COMPANY_ID,
        name: `${group} ${type}`,
        group,
        type,
        unit: type === 'Song' ? 'Con' : 'Kg',
        price: 42000 + productIndex * 1200,
        cost: 31000 + productIndex * 900,
        hidden: false,
        createdAt: timeAt(8, productIndex % 60)
      });
      productIndex += 1;
    }
  }

  push(db, 'customers', {
    id: 'cust_special_com_lam',
    companyId: COMPANY_ID,
    name: 'Com Lam Bau Bang',
    phone: '0964118234',
    address: 'Bau Bang, Ho Chi Minh',
    empId: 'emp_00003',
    latitude: 11.27772,
    longitude: 106.638421,
    debtLimit: 0,
    points: 157,
    createdAt: timeAt(9)
  });

  for (let i = 1; i <= 650; i += 1) {
    push(db, 'customers', {
      id: id('cust', i),
      companyId: COMPANY_ID,
      name: `Khach hang ${i} ${pick(['Bau Bang', 'Chon Thanh', 'Dong Xoai', 'Long Nguyen'])}`,
      phone: `0978${String(100000 + i).slice(-6)}`,
      address: pick(['Bau Bang', 'Chon Thanh', 'Thu Dau Mot', 'Ho Chi Minh']),
      branchName: i % 5 === 0 ? `Chi nhanh ${i % 4 || 4}` : '',
      empId: id('emp', (i % 20) + 1),
      latitude: 11.05 + random() * 0.65,
      longitude: 106.25 + random() * 0.75,
      debtLimit: i % 6 === 0 ? 0 : 20000000,
      points: i % 4 === 0 ? numberIn(0, 500) : 0,
      createdAt: timeAt(9, i % 60)
    });
  }

  for (let i = 1; i <= 30; i += 1) {
    const driver = db.employees.find((employee) => employee.id === id('emp', (i % 30) + 1));
    push(db, 'assets', {
      id: id('asset', i),
      companyId: COMPANY_ID,
      name: `Xe giao hang ${i}`,
      plateNumber: `61C-${String(10000 + i)}`,
      status: i % 8 === 0 ? 'maintenance' : 'active',
      assignedEmployeeIds: driver ? [driver.id] : [],
      assignedDriverName: driver?.name || '',
      createdAt: timeAt(10, i % 60)
    });
  }
}

function createWarehouse(db) {
  const groups = [...new Set(db.products.map((product) => product.group))];
  for (let day = -6; day <= 0; day += 1) {
    for (const group of groups) {
      const count = numberIn(40, 500);
      const avgWeight = group === 'Vit' ? 2.7 : group === 'Ga' ? 1.55 : 1.2;
      const kg = round1(count * avgWeight);
      const unitCost = group === 'Vit' ? 50000 : group === 'Ga' ? 43000 : 36000;
      push(db, 'warehouseImports', {
        id: id(`imp_${group.replace(/\s+/g, '_')}_${dateOffset(day)}`, 1),
        companyId: COMPANY_ID,
        group,
        date: dateOffset(day),
        count,
        kg,
        unitCost,
        amount: money(kg * unitCost),
        supplierId: pick(db.customers).id,
        createdAt: `${dateOffset(day)}T06:30:00+07:00`
      });
    }
  }
}

function createOrderRequestsAndOrders(db) {
  const products = db.products;
  const customers = db.customers;
  const drivers = db.employees.filter((employee) => employee.departments.includes('driver'));
  const orderById = new Map();
  const customerBalance = new Map();

  for (let i = 1; i <= 1600; i += 1) {
    const customer = pick(customers);
    const product = pick(products);
    const quantity = product.unit === 'Con' ? numberIn(1, 80) : round1(numberIn(5, 200) + random());
    const unitPrice = product.price + numberIn(-2000, 4000);
    const amount = money(quantity * unitPrice);
    const requestId = id('or', i);
    const latestFlag = i % 11 === 0 ? false : true;
    push(db, 'orderRequests', {
      id: requestId,
      companyId: COMPANY_ID,
      customerId: customer.id,
      customerName: customer.name,
      empId: customer.empId,
      productId: product.id,
      productName: product.name,
      group: product.group,
      unit: product.unit,
      quantity,
      unitPrice,
      amount,
      requestedAt: timeAt(10 + (i % 12), i % 60),
      status: 'auto_accepted',
      isLatestCustomerOrderVersion: latestFlag,
      createdAt: timeAt(10 + (i % 12), i % 60)
    });

    const driver = pick(drivers);
    const dispatchId = id('dispatch', i);
    push(db, 'warehouseDispatches', {
      id: dispatchId,
      companyId: COMPANY_ID,
      orderRequestId: requestId,
      customerId: customer.id,
      customerName: customer.name,
      productId: product.id,
      productName: product.name,
      group: product.group,
      unit: product.unit,
      kg: product.unit === 'Kg' ? quantity : round1(quantity * (product.group === 'Vit' ? 2.4 : 1.35)),
      count: product.unit === 'Con' ? quantity : 0,
      driverId: driver.id,
      driverName: driver.name,
      status: i % 5 === 0 ? 'delivered' : 'assigned',
      date: TODAY,
      createdAt: timeAt(12 + (i % 8), i % 60)
    });

    const orderId = `HD${String(900000 + i).slice(-6)}`;
    const paidSeed = i % 4;
    const paidAmount = paidSeed === 0 ? 0 : paidSeed === 1 ? money(amount * 0.5) : paidSeed === 2 ? amount : amount + 50000;
    const debt = Math.max(0, amount - paidAmount);
    const credit = Math.max(0, paidAmount - amount);

    const order = push(db, 'orders', {
      id: orderId,
      companyId: COMPANY_ID,
      customerId: customer.id,
      customerName: customer.name,
      empId: customer.empId,
      sourceRequestId: requestId,
      sourceDispatchIds: [dispatchId],
      items: [
        {
          productId: product.id,
          description: product.name,
          quantity,
          unit: product.unit,
          unitPrice
        }
      ],
      amount,
      paidAmount,
      outstandingAmount: debt,
      customerCredit: credit,
      paymentStatus: debt === 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
      date: TODAY,
      createdAt: timeAt(12 + (i % 8), i % 60)
    });
    orderById.set(order.id, order);

    customerBalance.set(customer.id, (customerBalance.get(customer.id) || 0) + debt - credit);

    if (paidAmount > 0) {
      push(db, 'payments', {
        id: id('pay', i),
        companyId: COMPANY_ID,
        customerId: customer.id,
        customerName: customer.name,
        orderId,
        amount: paidAmount,
        allocatedAmount: Math.min(amount, paidAmount),
        overpaidAmount: credit,
        method: i % 3 === 0 ? 'SePay' : 'Cash',
        bankName: i % 3 === 0 ? 'BIDV' : '',
        transferContent: `TT ${orderId}`,
        date: TODAY,
        createdAt: timeAt(13 + (i % 8), i % 60)
      });
    }

    if (i % 9 === 0) {
      push(db, 'deliveryReports', {
        id: id('delrep', i),
        companyId: COMPANY_ID,
        dispatchId,
        customerId: customer.id,
        customerName: customer.name,
        driverId: driver.id,
        thu: paidAmount,
        chi: i % 18 === 0 ? numberIn(30000, 300000) : 0,
        returnedKg: i % 27 === 0 ? round1(random() * 10) : 0,
        status: 'reported',
        date: TODAY,
        createdAt: timeAt(16, i % 60)
      });
    }
  }

  return { orderById, customerBalance };
}

function createFinanceAndPeopleData(db) {
  for (let i = 1; i <= 600; i += 1) {
    const employee = pick(db.employees);
    const category = pick(['fuel', 'ice', 'maintenance', 'salary', 'other']);
    push(db, 'expenses', {
      id: id('exp', i),
      companyId: COMPANY_ID,
      empId: employee.id,
      type: 'expense',
      category,
      assetId: category === 'fuel' || category === 'maintenance' ? pick(db.assets).id : '',
      amount: numberIn(20000, 2500000),
      date: dateOffset(-numberIn(0, 20)),
      createdAt: timeAt(numberIn(7, 20), i % 60)
    });
  }

  for (let i = 1; i <= 720; i += 1) {
    const employee = pick(db.employees);
    const checkInMinute = i % 10 === 0 ? 75 : numberIn(-20, 20);
    push(db, 'attendance', {
      id: id('att', i),
      companyId: COMPANY_ID,
      empId: employee.id,
      date: dateOffset(-numberIn(0, 30)),
      status: i % 13 === 0 ? 'leave' : 'present',
      checkIn: timeAt(8 + Math.floor(Math.max(0, checkInMinute) / 60), Math.max(0, checkInMinute) % 60),
      checkOut: timeAt(17 + (i % 4 === 0 ? 2 : 0), i % 60),
      overtimeHours: i % 4 === 0 ? 2 : 0,
      lateMinutes: Math.max(0, checkInMinute),
      createdAt: timeAt(18, i % 60)
    });
  }

  for (let i = 1; i <= 480; i += 1) {
    const employee = pick(db.employees);
    const requested = employee.advanceLimitPercent === null ? numberIn(500000, 7000000) : numberIn(100000, 2000000);
    push(db, 'advances', {
      id: id('adv', i),
      companyId: COMPANY_ID,
      empId: employee.id,
      amount: requested,
      status: i % 3 === 0 ? 'approved' : 'pending',
      reason: 'stress advance request',
      date: dateOffset(-numberIn(0, 15)),
      createdAt: timeAt(11, i % 60)
    });
  }

  const criteria = [
    'Cam ket',
    'Chu dong',
    'Ownership',
    'Ho tro',
    'Chia se tri thuc',
    'Ton trong',
    'Dong thuan',
    'Giao tiep',
    'Tich cuc',
    'Ket noi'
  ];
  for (let i = 1; i <= 700; i += 1) {
    const target = pick(db.employees);
    const reviewer = pick(db.employees.filter((employee) => employee.id !== target.id));
    const scores = Object.fromEntries(criteria.map((criterion) => [criterion, numberIn(0, 5)]));
    push(db, 'evaluations', {
      id: id('eval', i),
      companyId: COMPANY_ID,
      targetEmpId: target.id,
      reviewerEmpId: reviewer.id,
      anonymous: true,
      month: TODAY.slice(0, 7),
      scores,
      createdAt: timeAt(14, i % 60)
    });
  }
}

function createRealtimeEvents(db) {
  for (let i = 1; i <= 900; i += 1) {
    const employee = pick(db.employees);
    const customer = pick(db.customers);
    push(db, 'notifications', {
      id: id('noti', i),
      companyId: COMPANY_ID,
      receiverId: i % 2 === 0 ? employee.id : customer.id,
      title: i % 3 === 0 ? 'Thanh toan moi' : 'Don hang moi',
      body: i % 3 === 0 ? `${customer.name} vua thanh toan` : `${customer.name} vua tao don`,
      unread: i % 5 !== 0,
      createdAt: timeAt(15, i % 60)
    });

    push(db, 'messages', {
      id: id('msg', i),
      companyId: COMPANY_ID,
      conversationId: `conv_${customer.id}_${employee.id}`,
      senderId: i % 2 === 0 ? customer.id : employee.id,
      receiverId: i % 2 === 0 ? employee.id : customer.id,
      text: `Tin nhan stress ${i}`,
      unread: i % 7 !== 0,
      createdAt: timeAt(16, i % 60)
    });
  }
}

function validateSearch(db) {
  const target = db.customers.find((customer) => customer.id === 'cust_special_com_lam');
  const haystack = [
    target.name,
    target.phone,
    target.address,
    target.branchName,
    normalizePhone(target.phone)
  ].join(' ');

  assert(containsQuery(haystack, 'com lam'), 'customer-search-name-token-failed', { customerId: target.id });
  assert(containsQuery(haystack, 'Co_m Lam'), 'customer-search-punctuation-failed', { customerId: target.id });
  assert(containsQuery(haystack, '0964118234'), 'customer-search-phone-failed', { customerId: target.id });
}

function validateCompanyIsolation(db) {
  for (const [collection, docs] of Object.entries(db)) {
    for (const doc of docs) {
      if (collection === 'companies') continue;
      assert(doc.companyId === COMPANY_ID, 'company-isolation-failed', { collection, id: doc.id, companyId: doc.companyId });
    }
  }
}

function validatePayments(db) {
  const orders = new Map(db.orders.map((order) => [order.id, order]));
  const paymentByOrder = new Map();
  for (const payment of db.payments) {
    paymentByOrder.set(payment.orderId, (paymentByOrder.get(payment.orderId) || 0) + payment.amount);
  }

  for (const order of orders.values()) {
    const paid = paymentByOrder.get(order.id) || 0;
    assert(order.outstandingAmount === Math.max(0, order.amount - paid), 'order-outstanding-mismatch', {
      orderId: order.id,
      expected: Math.max(0, order.amount - paid),
      actual: order.outstandingAmount
    });
    assert(order.customerCredit === Math.max(0, paid - order.amount), 'order-credit-mismatch', {
      orderId: order.id,
      expected: Math.max(0, paid - order.amount),
      actual: order.customerCredit
    });
  }
}

function validateWarehouse(db) {
  const importedByGroup = new Map();
  const dispatchedByGroup = new Map();
  for (const row of db.warehouseImports) {
    importedByGroup.set(row.group, (importedByGroup.get(row.group) || 0) + row.kg);
  }
  for (const row of db.warehouseDispatches) {
    dispatchedByGroup.set(row.group, (dispatchedByGroup.get(row.group) || 0) + row.kg);
  }

  for (const group of new Set([...importedByGroup.keys(), ...dispatchedByGroup.keys()])) {
    const stock = round1((importedByGroup.get(group) || 0) - (dispatchedByGroup.get(group) || 0));
    assert(Number.isFinite(stock), 'warehouse-stock-not-finite', { group, stock });
  }
}

function validateDeliveryAndMap(db) {
  const customers = new Map(db.customers.map((customer) => [customer.id, customer]));
  for (const dispatch of db.warehouseDispatches) {
    const customer = customers.get(dispatch.customerId);
    assert(Boolean(customer), 'dispatch-customer-missing', { dispatchId: dispatch.id });
    assert(typeof customer?.latitude === 'number' && typeof customer?.longitude === 'number', 'dispatch-customer-gps-missing', {
      dispatchId: dispatch.id,
      customerId: dispatch.customerId
    });
    assert(Boolean(dispatch.driverId), 'dispatch-driver-missing', { dispatchId: dispatch.id });
  }
}

function validateEvaluations(db) {
  const rewardByStar = [0, 10000, 20000, 30000, 50000, 100000];
  for (const evaluation of db.evaluations) {
    const values = Object.values(evaluation.scores);
    assert(values.length === 10, 'evaluation-criteria-count-mismatch', { evaluationId: evaluation.id, count: values.length });
    for (const score of values) {
      assert(Number.isInteger(score) && score >= 0 && score <= 5, 'evaluation-score-out-of-range', {
        evaluationId: evaluation.id,
        score
      });
      assert(rewardByStar[score] >= 0, 'evaluation-reward-invalid', { evaluationId: evaluation.id, score });
    }
  }
}

function validateRealtime(db) {
  const newestMessages = [...db.messages].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  assert(newestMessages[0]?.createdAt >= newestMessages.at(-1)?.createdAt, 'message-sort-newest-first-failed');
  assert(db.notifications.some((notification) => notification.unread), 'notification-unread-missing');
}

function validateNoDuplicateIds(db) {
  for (const [collection, docs] of Object.entries(db)) {
    const seen = new Set();
    for (const doc of docs) {
      assert(!seen.has(doc.id), 'duplicate-id', { collection, id: doc.id });
      seen.add(doc.id);
    }
  }
}

function validateAll(db) {
  for (const [collection, docs] of Object.entries(db)) {
    for (const doc of docs) {
      assertNoUndefined(doc, `${collection}:${doc.id}`);
    }
  }
  validateNoDuplicateIds(db);
  validateCompanyIsolation(db);
  validateSearch(db);
  validatePayments(db);
  validateWarehouse(db);
  validateDeliveryAndMap(db);
  validateEvaluations(db);
  validateRealtime(db);
}

function summarizeDb(db) {
  return Object.fromEntries(Object.entries(db).map(([collection, docs]) => [collection, docs.length]));
}

async function writeReport(db) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const operationSummary = Object.fromEntries([...counters.entries()].sort(([a], [b]) => a.localeCompare(b)));
  const result = {
    runId: RUN_ID,
    startedAt: new Date().toISOString(),
    mode: 'local-in-memory-stress-test',
    companyId: COMPANY_ID,
    operationCount: operations.length,
    operationSummary,
    databaseSummary: summarizeDb(db),
    failures,
    warnings,
    autoFixes,
    pass: failures.length === 0
  };

  const jsonPath = path.join(OUTPUT_DIR, `hd-manager-stress-${RUN_ID}.json`);
  const mdPath = path.join(OUTPUT_DIR, `hd-manager-stress-${RUN_ID}.md`);
  await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await writeFile(
    mdPath,
    [
      '# HD Manager Stress Test',
      '',
      `- Run: ${RUN_ID}`,
      `- Company: ${COMPANY_ID}`,
      `- Operations: ${operations.length}`,
      `- Result: ${result.pass ? 'PASS' : 'FAIL'}`,
      '',
      '## Collections',
      '',
      ...Object.entries(result.databaseSummary).map(([name, countValue]) => `- ${name}: ${countValue}`),
      '',
      '## Operation Summary',
      '',
      ...Object.entries(operationSummary).map(([name, countValue]) => `- ${name}: ${countValue}`),
      '',
      '## Failures',
      '',
      ...(failures.length ? failures.map((item) => `- ${item.code}: ${JSON.stringify(item)}`) : ['- None']),
      '',
      '## Warnings',
      '',
      ...(warnings.length ? warnings.map((item) => `- ${item.code}: ${JSON.stringify(item)}`) : ['- None']),
      ''
    ].join('\n'),
    'utf8'
  );

  return { jsonPath, mdPath, result };
}

async function main() {
  const db = initDb();
  createBaseData(db);
  createWarehouse(db);
  createOrderRequestsAndOrders(db);
  createFinanceAndPeopleData(db);
  createRealtimeEvents(db);
  validateAll(db);

  assert(operations.length >= 5000, 'operation-count-below-target', { operationCount: operations.length });

  const { jsonPath, mdPath, result } = await writeReport(db);
  console.log(`HD Manager stress test ${result.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Operations: ${operations.length}`);
  console.log(`Report: ${jsonPath}`);
  console.log(`Summary: ${mdPath}`);

  if (!result.pass) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  failures.push({
    code: 'stress-suite-crashed',
    message: error?.message || String(error),
    stack: error?.stack || ''
  });
  const db = initDb();
  const { jsonPath } = await writeReport(db);
  console.error(`HD Manager stress test crashed. Report: ${jsonPath}`);
  console.error(error);
  process.exitCode = 1;
});
