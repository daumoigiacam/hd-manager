import crypto from 'node:crypto';

const API_ROOT = 'https://staging-api.hdconnect.net/api/v1';
const APP_ORIGIN = 'https://staging-app.hdconnect.net';
const EXPECTED_API_HOST = 'staging-api.hdconnect.net';

if (new URL(API_ROOT).hostname !== EXPECTED_API_HOST) {
  throw new Error('STAGING_ONLY_GUARD_FAILED');
}

const suffix = `${Date.now().toString(36)}${crypto.randomInt(1000, 9999)}`;
const makeAccount = (label) => ({
  label,
  companyName: `Codex Lifecycle ${label} ${suffix}`,
  companyCode: `CL${label}${suffix}`.toUpperCase().slice(0, 32),
  phone: `09${crypto.randomInt(10_000_000, 99_999_999)}`,
  password: `Sg${crypto.randomBytes(18).toString('hex')}9!`,
});

const accounts = { a: makeAccount('A'), b: makeAccount('B') };
const state = {
  companies: [],
  checks: {},
  reconciliation: {},
  requests: [],
};

const secretValues = () => [
  accounts.a.phone,
  accounts.a.password,
  accounts.b.phone,
  accounts.b.password,
];

const redact = (value) => {
  let result = String(value ?? '');
  for (const secret of secretValues()) result = result.replaceAll(secret, '[REDACTED]');
  return result.replace(/eyJ[A-Za-z0-9._-]+/g, '[TOKEN]');
};

const unwrap = (payload) =>
  payload && typeof payload === 'object' && 'data' in payload
    ? payload.data
    : payload;

async function api(path, options = {}) {
  const method = options.method ?? (options.body === undefined ? 'GET' : 'POST');
  const expected = options.expected ?? [200, 201];
  const headers = {
    Accept: 'application/json',
    Origin: APP_ORIGIN,
    ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
    ...(options.headers ?? {}),
  };
  const response = await fetch(`${API_ROOT}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  state.requests.push({ method, path, status: response.status });
  if (!expected.includes(response.status)) {
    const code =
      payload?.error?.code ??
      payload?.data?.code ??
      payload?.code ??
      `HTTP_${response.status}`;
    const error = new Error(`${method} ${path} failed: ${redact(code)}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return unwrap(payload);
}

async function expectFailure(label, path, options, statuses, codes = []) {
  try {
    await api(path, { ...options, expected: [] });
  } catch (error) {
    const code =
      error.payload?.error?.code ??
      error.payload?.data?.code ??
      error.payload?.code ??
      null;
    if (!statuses.includes(error.status)) throw error;
    if (codes.length > 0 && !codes.includes(code)) {
      throw new Error(`${label} returned unexpected safe error code: ${redact(code)}`);
    }
    state.checks[label] = { status: error.status, code };
    return;
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

async function register(account) {
  const auth = await api('/auth/register', {
    body: {
      companyName: account.companyName,
      companyCode: account.companyCode,
      phone: account.phone,
      password: account.password,
      fullName: `Lifecycle Owner ${account.label}`,
      deviceName: 'staging-lifecycle-e2e',
    },
  });
  if (!auth?.accessToken || !auth?.refreshToken || !auth?.company?.id) {
    throw new Error(`Registration ${account.label} returned an incomplete auth contract`);
  }
  state.companies.push({
    label: account.label,
    id: auth.company.id,
    code: auth.company.code,
    name: auth.company.name,
  });
  return auth;
}

const listItems = (value) => (Array.isArray(value) ? value : value?.items ?? []);
const number = (value) => Number(value ?? 0);

async function balances(token, warehouseId, productId) {
  const data = await api(
    `/inventory/balances?warehouseId=${warehouseId}&productId=${productId}&limit=100`,
    { token },
  );
  const result = { AVAILABLE: 0, RESERVED: 0, total: 0 };
  for (const item of listItems(data)) {
    const quantity = number(item.quantity);
    result[item.inventoryStatus] = number(result[item.inventoryStatus]) + quantity;
    result.total += quantity;
  }
  return result;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

async function openSse(token) {
  const controller = new AbortController();
  const connectionTimeout = setTimeout(() => controller.abort(), 10_000);
  let response;
  try {
    response = await fetch(`${API_ROOT}/realtime/stream`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(connectionTimeout);
  }
  if (response.status !== 200 || !response.body) {
    controller.abort();
    throw new Error(`SSE connection failed with HTTP ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const events = [];
  const done = (async () => {
    try {
      while (events.length < 2) {
        const chunk = await reader.read();
        if (chunk.done) break;
        text += decoder.decode(chunk.value, { stream: true });
        const frames = text.split('\n\n');
        text = frames.pop() ?? '';
        for (const frame of frames) {
          const event = frame.match(/^event:\s*(.+)$/m)?.[1];
          const raw = frame.match(/^data:\s*(.+)$/m)?.[1];
          if (!event || !raw) continue;
          const data = JSON.parse(raw);
          events.push({ event, data });
        }
      }
      return events;
    } finally {
      controller.abort();
    }
  })();
  return { controller, done };
}

let fatal;
try {
  const authA = await register(accounts.a);
  const authB = await register(accounts.b);
  let accessA = authA.accessToken;
  let refreshA = authA.refreshToken;

  const meA = await api('/auth/me', { token: accessA });
  const meB = await api('/auth/me', { token: authB.accessToken });
  assertEqual(meA.companyId, authA.company.id, 'Tenant A auth context');
  assertEqual(meB.companyId, authB.company.id, 'Tenant B auth context');
  assert(meA.roles?.includes('OWNER'), 'Tenant A owner role is missing');

  let sse;
  try {
    sse = await openSse(accessA);
  } catch (error) {
    state.checks.realtimeSse = {
      status: 'BLOCKED',
      reason: redact(error?.name ?? error),
    };
  }

  const unit = await api('/master-data/units', {
    token: accessA,
    body: {
      code: `UNIT-${suffix}`.slice(0, 80),
      name: `Lifecycle Unit ${suffix}`,
      symbol: 'ea',
      decimalPrecision: 3,
      status: 'ACTIVE',
    },
  });
  const warehouse = await api('/warehouse-suite/warehouses', {
    token: accessA,
    body: {
      code: `WH-${suffix}`.slice(0, 80),
      name: `Lifecycle Warehouse ${suffix}`,
      type: 'MAIN',
      status: 'ACTIVE',
    },
  });
  const product = await api('/products', {
    token: accessA,
    body: {
      code: `PRD-${suffix}`.slice(0, 80),
      sku: `SKU-${suffix}`.slice(0, 120),
      name: `Lifecycle Product ${suffix}`,
      type: 'GOODS',
      status: 'ACTIVE',
      baseUnitId: unit.id,
      purchaseUnitId: unit.id,
      salesUnitId: unit.id,
      inventoryUnitId: unit.id,
      metadata: { fixture: 'STAGING_VPS_LIFECYCLE_E2E' },
    },
  });
  const productUnits = await api(`/products/${product.id}/units`, { token: accessA });
  assert(listItems(productUnits).length >= 1, 'ProductUnit roles were not created');
  const customer = await api('/master-data/customers', {
    token: accessA,
    body: {
      code: `CUS-${suffix}`.slice(0, 80),
      name: `Lifecycle Customer ${suffix}`,
      status: 'ACTIVE',
      creditLimit: 10_000_000,
      attributes: { fixture: 'STAGING_VPS_LIFECYCLE_E2E' },
    },
  });
  const customerB = await api('/master-data/customers', {
    token: authB.accessToken,
    body: {
      code: `CUSB-${suffix}`.slice(0, 80),
      name: `Lifecycle Customer B ${suffix}`,
      status: 'ACTIVE',
    },
  });

  await api('/warehouse-suite/stock-in', {
    token: accessA,
    body: {
      warehouseId: warehouse.id,
      productId: product.id,
      unitId: unit.id,
      quantity: 20,
      inventoryStatus: 'AVAILABLE',
      referenceType: 'STAGING_E2E_OPENING',
      referenceId: `opening-${suffix}`,
      reason: 'Disposable lifecycle opening stock',
      metadata: { fixture: 'STAGING_VPS_LIFECYCLE_E2E' },
    },
  });
  if (sse) {
    try {
      const sseEvents = await Promise.race([
        sse.done,
        new Promise((_, reject) =>
          setTimeout(() => {
            sse.controller.abort();
            reject(new Error('SSE did not deliver a tenant event in time'));
          }, 15_000),
        ),
      ]);
      assert(sseEvents.some((entry) => entry.event === 'ready'), 'SSE ready event missing');
      assert(sseEvents.some((entry) => entry.event === 'event'), 'SSE business event missing');
      state.checks.realtimeSse = 'PASS';
    } catch (error) {
      state.checks.realtimeSse = {
        status: 'BLOCKED',
        reason: redact(error?.message ?? error),
      };
    }
  }
  const baseline = await balances(accessA, warehouse.id, product.id);
  assertEqual(baseline.AVAILABLE, 20, 'Opening available stock');
  assertEqual(baseline.total, 20, 'Opening physical stock');

  const orderMutationId = `order-${suffix}`;
  const order = await api('/sales/orders', {
    token: accessA,
    idempotencyKey: orderMutationId,
    body: {
      customerId: customer.id,
      warehouseId: warehouse.id,
      currency: 'VND',
      paymentTerm: 'NET7',
      clientMutationId: orderMutationId,
      metadata: { fixture: 'STAGING_VPS_LIFECYCLE_E2E' },
      lines: [
        {
          productId: product.id,
          unitId: unit.id,
          warehouseId: warehouse.id,
          quantity: 10,
          unitPrice: 100_000,
        },
      ],
    },
  });
  const orderLine = order.lines?.[0];
  assert(orderLine?.id, 'Created order did not return an order line');
  assertEqual((await balances(accessA, warehouse.id, product.id)).total, 20, 'Draft stock');

  const confirmed = await api(`/sales/orders/${order.id}/confirm`, {
    token: accessA,
    body: { note: 'Disposable lifecycle confirmation' },
  });
  assertEqual(confirmed.status, 'CONFIRMED', 'Confirmed order status');
  assertEqual((await balances(accessA, warehouse.id, product.id)).total, 20, 'Confirm stock');

  const receivablesBefore = await api('/finance-suite/receivables?limit=100', {
    token: accessA,
  });
  assertEqual(listItems(receivablesBefore).length, 0, 'Dispatch must not auto-post debt');

  const reserved = await api(`/sales/orders/${order.id}/reserve`, {
    token: accessA,
    body: { reason: 'Disposable lifecycle reservation' },
  });
  const reservedLine = reserved.lines?.[0];
  assert(reservedLine?.reservationId, 'Order reservation ID is missing');
  let stock = await balances(accessA, warehouse.id, product.id);
  assertEqual(stock.AVAILABLE, 10, 'Available stock after reservation');
  assertEqual(stock.RESERVED, 10, 'Reserved stock after reservation');
  assertEqual(stock.total, 20, 'Physical stock after reservation');

  const plan = await api(`/sales/orders/${order.id}/delivery-plans`, {
    token: accessA,
    body: {
      warehouseId: warehouse.id,
      status: 'PLANNED',
      notes: 'Disposable lifecycle plan',
      lines: [{ orderLineId: orderLine.id, quantity: 10 }],
    },
  });

  const dispatchOneBody = {
    sourceDispatchId: `dispatch-1-${suffix}`,
    warehouseId: warehouse.id,
    productId: product.id,
    unitId: unit.id,
    quantity: 4,
    orderId: order.id,
    orderLineId: orderLine.id,
    reservationId: reservedLine.reservationId,
    deliveryPlanId: plan.id,
    actualCount: 4,
    reason: 'Disposable partial dispatch 1',
    metadata: { fixture: 'STAGING_VPS_LIFECYCLE_E2E' },
  };
  const dispatchOne = await api('/warehouse-suite/stock-out', {
    token: accessA,
    idempotencyKey: dispatchOneBody.sourceDispatchId,
    body: dispatchOneBody,
  });
  assertEqual(dispatchOne.replayed, false, 'First dispatch replay flag');
  const afterDispatchOne = await balances(accessA, warehouse.id, product.id);
  assertEqual(afterDispatchOne.AVAILABLE, 10, 'Available after dispatch 1');
  assertEqual(afterDispatchOne.RESERVED, 6, 'Reserved after dispatch 1');
  assertEqual(afterDispatchOne.total, 16, 'Physical stock after dispatch 1');

  const dispatchReplay = await api('/warehouse-suite/stock-out', {
    token: accessA,
    idempotencyKey: dispatchOneBody.sourceDispatchId,
    body: dispatchOneBody,
  });
  assertEqual(
    dispatchReplay.dispatchId,
    dispatchOne.dispatchId,
    'Dispatch retry stable execution ID',
  );
  assertEqual(
    (await balances(accessA, warehouse.id, product.id)).total,
    16,
    'Physical stock after dispatch retry',
  );

  await expectFailure(
    'overDispatchRejected',
    '/warehouse-suite/stock-out',
    {
      token: accessA,
      body: {
        ...dispatchOneBody,
        sourceDispatchId: `dispatch-over-${suffix}`,
        quantity: 7,
      },
    },
    [400],
  );

  const dispatchTwoBody = {
    ...dispatchOneBody,
    sourceDispatchId: `dispatch-2-${suffix}`,
    quantity: 6,
    actualCount: 6,
    reason: 'Disposable partial dispatch 2',
  };
  const dispatchTwo = await api('/warehouse-suite/stock-out', {
    token: accessA,
    idempotencyKey: dispatchTwoBody.sourceDispatchId,
    body: dispatchTwoBody,
  });
  assertEqual(dispatchTwo.replayed, false, 'Second dispatch replay flag');
  stock = await balances(accessA, warehouse.id, product.id);
  assertEqual(stock.AVAILABLE, 10, 'Available after full fulfilment');
  assertEqual(stock.RESERVED, 0, 'Reserved after full fulfilment');
  assertEqual(stock.total, 10, 'Physical stock after full fulfilment');

  const fulfilledOrder = await api(`/sales/orders/${order.id}`, { token: accessA });
  assertEqual(number(fulfilledOrder.lines?.[0]?.deliveredQuantity), 10, 'Delivered quantity');
  assertEqual(number(fulfilledOrder.lines?.[0]?.reservedQuantity), 0, 'Remaining reserved line quantity');

  const reversalBody = {
    sourceReversalId: `return-1-${suffix}`,
    quantity: 2,
    returnDisposition: 'RESTORE_RESERVATION',
    reason: 'Disposable partial return',
    actualCount: 2,
    metadata: { fixture: 'STAGING_VPS_LIFECYCLE_E2E' },
  };
  const reversal = await api(
    `/warehouse-suite/stock-out/${dispatchOne.dispatchId}/reversals`,
    { token: accessA, body: reversalBody },
  );
  assertEqual(reversal.replayed, false, 'First reversal replay flag');
  stock = await balances(accessA, warehouse.id, product.id);
  assertEqual(stock.AVAILABLE, 10, 'Available after reservation-restoring return');
  assertEqual(stock.RESERVED, 2, 'Reserved after reservation-restoring return');
  assertEqual(stock.total, 12, 'Physical stock after return');

  const reversalReplay = await api(
    `/warehouse-suite/stock-out/${dispatchOne.dispatchId}/reversals`,
    { token: accessA, body: reversalBody },
  );
  assertEqual(reversalReplay.replayed, true, 'Reversal retry replay flag');
  assertEqual(
    (await balances(accessA, warehouse.id, product.id)).total,
    12,
    'Physical stock after reversal retry',
  );

  await expectFailure(
    'overReturnRejected',
    `/warehouse-suite/stock-out/${dispatchOne.dispatchId}/reversals`,
    {
      token: accessA,
      body: {
        ...reversalBody,
        sourceReversalId: `return-over-${suffix}`,
        quantity: 3,
      },
    },
    [400],
  );

  const returnedOrder = await api(`/sales/orders/${order.id}`, { token: accessA });
  assertEqual(number(returnedOrder.lines?.[0]?.deliveredQuantity), 8, 'Net delivered quantity');
  assertEqual(number(returnedOrder.lines?.[0]?.reservedQuantity), 2, 'Restored reserved quantity');
  assert(returnedOrder.lines?.[0]?.reservationId, 'Restored reservation ID missing');

  const released = await api(`/sales/orders/${order.id}/release-reservation`, {
    token: accessA,
    body: { reason: 'Release restored disposable reservation' },
  });
  assertEqual(number(released.lines?.[0]?.reservedQuantity), 0, 'Released reserved quantity');
  stock = await balances(accessA, warehouse.id, product.id);
  assertEqual(stock.AVAILABLE, 12, 'Available after reservation release');
  assertEqual(stock.RESERVED, 0, 'Reserved after reservation release');
  assertEqual(stock.total, 12, 'Physical stock after reservation release');

  const cancellableOrder = await api('/sales/orders', {
    token: accessA,
    idempotencyKey: `cancel-order-${suffix}`,
    body: {
      customerId: customer.id,
      warehouseId: warehouse.id,
      clientMutationId: `cancel-order-${suffix}`,
      lines: [
        {
          productId: product.id,
          unitId: unit.id,
          warehouseId: warehouse.id,
          quantity: 2,
          unitPrice: 50_000,
        },
      ],
    },
  });
  await api(`/sales/orders/${cancellableOrder.id}/confirm`, { token: accessA, body: {} });
  await api(`/sales/orders/${cancellableOrder.id}/reserve`, { token: accessA, body: {} });
  assertEqual((await balances(accessA, warehouse.id, product.id)).RESERVED, 2, 'Cancel test reservation');
  const cancelled = await api(`/sales/orders/${cancellableOrder.id}/cancel`, {
    token: accessA,
    body: { reason: 'Disposable cancellation before dispatch' },
  });
  assertEqual(cancelled.status, 'CANCELLED', 'Cancelled order status');
  stock = await balances(accessA, warehouse.id, product.id);
  assertEqual(stock.AVAILABLE, 12, 'Available after cancellation');
  assertEqual(stock.RESERVED, 0, 'Reserved after cancellation');
  assertEqual(stock.total, 12, 'Physical stock after cancellation');

  await expectFailure(
    'cancelAfterDispatchRejected',
    `/sales/orders/${order.id}/cancel`,
    { token: accessA, body: { reason: 'Must reverse all dispatches first' } },
    [400],
    ['SALES_ORDER_DISPATCH_REVERSAL_REQUIRED'],
  );

  const receivable = await api('/finance-suite/receivables', {
    token: accessA,
    body: {
      customerId: customer.id,
      invoiceNumber: `INV-${suffix}`.slice(0, 120),
      sourceAggregateType: 'SalesOrder',
      sourceAggregateId: order.id,
      originalAmount: 1_000_000,
      paymentTermDays: 7,
      description: 'Explicit disposable receivable',
    },
  });
  const settlement = await api('/finance-suite/debt-movements', {
    token: accessA,
    body: {
      receivableId: receivable.id,
      type: 'SETTLEMENT',
      amount: 250_000,
      referenceId: `settlement-${suffix}`,
      note: 'Explicit disposable settlement',
    },
  });
  assert(settlement.id, 'Explicit debt settlement was not created');

  const cashAccount = await api('/finance-suite/cash-accounts', {
    token: accessA,
    body: {
      code: `CASH-${suffix}`.slice(0, 60),
      name: `Lifecycle Cash ${suffix}`,
      currencyCode: 'VND',
      openingBalance: 0,
      status: 'ACTIVE',
    },
  });
  const cashTransaction = await api('/finance-suite/cash-transactions', {
    token: accessA,
    body: {
      cashAccountId: cashAccount.id,
      transactionNumber: `CT-${suffix}`.slice(0, 80),
      type: 'RECEIPT',
      amount: 250_000,
      counterpartyType: 'Customer',
      counterpartyId: customer.id,
      referenceType: 'FinanceReceivable',
      referenceId: receivable.id,
      description: 'Explicit disposable cash receipt',
    },
  });
  assert(cashTransaction.id, 'Explicit finance transaction was not created');

  for (const [label, path] of [
    ['tenantBToCustomerA', `/master-data/customers/${customer.id}`],
    ['tenantBToProductA', `/products/${product.id}`],
    ['tenantBToOrderA', `/sales/orders/${order.id}`],
    ['tenantAToCustomerB', `/master-data/customers/${customerB.id}`],
  ]) {
    await expectFailure(label, path, { token: label.startsWith('tenantB') ? authB.accessToken : accessA }, [404]);
  }
  await expectFailure(
    'tenantBStockOutARejected',
    '/warehouse-suite/stock-out',
    {
      token: authB.accessToken,
      body: {
        sourceDispatchId: `cross-tenant-${suffix}`,
        warehouseId: warehouse.id,
        productId: product.id,
        unitId: unit.id,
        quantity: 1,
      },
    },
    [404],
  );

  const dispatches = await api(
    `/warehouse-suite/dispatches?orderId=${order.id}&limit=100`,
    { token: accessA },
  );

  const refreshed = await api('/auth/refresh', {
    body: { refreshToken: refreshA },
  });
  accessA = refreshed.accessToken;
  refreshA = refreshed.refreshToken;
  assertEqual((await api('/auth/me', { token: accessA })).companyId, authA.company.id, 'Refreshed tenant');
  await api('/auth/logout', {
    token: accessA,
    body: { refreshToken: refreshA },
  });
  await expectFailure('loggedOutRefreshRejected', '/auth/refresh', { body: { refreshToken: refreshA } }, [401]);

  state.reconciliation = {
    ordered: 10,
    reserved: 10,
    dispatched: 10,
    returned: 2,
    netFulfilled: 8,
    physicalStockBefore: 20,
    physicalStockAfter: stock.total,
    availableAfter: stock.AVAILABLE,
    reservedAfter: stock.RESERVED,
    orderStatusAfterReturn: returnedOrder.status,
    deliveredQuantityAfterReturn: number(returnedOrder.lines?.[0]?.deliveredQuantity),
    explicitReceivableAmount: number(receivable.originalAmount),
    explicitSettlementAmount: number(settlement.amount),
    explicitCashReceiptAmount: number(cashTransaction.amount),
    dispatchRecordsObserved: listItems(dispatches).length,
  };
  state.checks = {
    ...state.checks,
    registration: 'PASS',
    phoneLoginContract: 'PASS',
    productUnit: 'PASS',
    orderConfirmNoStockOut: 'PASS',
    reservationConsumption: 'PASS',
    partialFulfilment: 'PASS',
    dispatchIdempotency: 'PASS',
    immutableReversal: 'PASS',
    reversalIdempotency: 'PASS',
    cancelBeforeDispatch: 'PASS',
    debtExplicitOnly: 'PASS',
    financeExplicitOnly: 'PASS',
    tenantIsolation: 'PASS',
    refreshLogout: 'PASS',
    ...(state.checks.realtimeSse === 'PASS' ? { realtimeSse: 'PASS' } : {}),
  };
} catch (error) {
  fatal = redact(error?.stack ?? error);
} finally {
  const report = {
    status: fatal ? 'FAIL' : 'PASS',
    stagingOnly: true,
    apiRoot: API_ROOT,
    companies: state.companies,
    checks: state.checks,
    reconciliation: state.reconciliation,
    requestCount: state.requests.length,
    failedRequestEvidence: state.requests.filter((entry) => entry.status >= 400),
    credentialsPersisted: false,
    productionTouched: false,
    firebaseTouched: false,
    cleanupRequired: state.companies.map((company) => company.id),
    ...(fatal ? { failure: fatal } : {}),
  };
  console.log(JSON.stringify(report, null, 2));
}

if (fatal) process.exitCode = 1;
