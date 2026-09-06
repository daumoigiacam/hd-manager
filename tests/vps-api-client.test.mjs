import assert from 'node:assert/strict';
import test from 'node:test';
import { HdApiClient, HdApiError, normalizeVpsPhoneIdentifier } from '../src/api/client.js';
import {
  buildVpsInventoryTransaction,
  createHdConnectStagingApi,
  normalizeVpsAttendance,
  normalizeVpsCustomer,
  normalizeVpsCustomerSupportMessage,
  normalizeVpsFinanceExpense,
  normalizeVpsOrder,
  normalizeVpsProduct,
  normalizeVpsSession,
  normalizeVpsStockMovement,
} from '../src/api/hdConnectStaging.js';
import { saveVpsCompanyReceivingBankAccount } from '../src/api/vpsCompanySettings.js';

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};

const envelope = (data, { status = 200 } = {}) => new Response(
  JSON.stringify({ success: true, data, error: null, meta: { traceId: 'trace-test' } }),
  { status, headers: { 'content-type': 'application/json' } },
);

const errorEnvelope = (message, { status = 400, code = 'REQUEST_REJECTED' } = {}) => new Response(
  JSON.stringify({
    success: false,
    data: null,
    error: { code, message },
    meta: { traceId: 'trace-error' },
  }),
  { status, headers: { 'content-type': 'application/json' } },
);

test('uses the operator finance history contract without substituting customer-portal payments or caller tenant input', async () => {
  const calls = [];
  const api = createHdConnectStagingApi({ get: async (path, options) => {
    calls.push({ path, options });
    return { items: [{ id: 'payment', companyId: 'tenant', amount: '12.50', metadata: { __hdcoProjection: { sourceRecordId: 'legacy-payment' }, requiresApproval: true } }], pagination: { totalItems: 1 } };
  } });
  const page = await api.listPaymentHistory({ page: 1, limit: 100, companyId: 'forged', tenantId: 'forged' });
  assert.equal(calls[0].path, '/finance-suite/payments/history');
  assert.equal(calls[0].options.query.companyId, undefined);
  assert.equal(calls[0].options.query.tenantId, undefined);
  assert.equal(page.items[0].requiresApproval, true);
  await api.getHistoricalCustomerLedger('native-customer');
  assert.equal(calls[1].path, '/finance-suite/customers/native-customer/historical-ledger');
  await assert.rejects(() => api.getHistoricalCustomerLedger(''), { code: 'CUSTOMER_ID_REQUIRED' });
});

test('keeps a customer VPS session and routes bank links without caller tenant or customer IDs', async () => {
  const session = normalizeVpsSession({
    user: {
      id: 'user-1',
      role: 'customer',
      customerId: 'customer-1',
      phoneNormalized: '0900000000',
    },
    company: { id: 'company-1', name: 'Company 1' },
    roles: ['customer'],
    permissions: ['cx.portal.read', 'cx.portal.write'],
  });
  assert.equal(session.user.accountType, 'customer');
  assert.equal(session.user.customerId, 'customer-1');

  const calls = [];
  const api = createHdConnectStagingApi({
    get: async (path, options) => {
      calls.push({ method: 'GET', path, options });
      return [{ id: 'bank-1', customerId: 'customer-1', companyId: 'company-1' }];
    },
    post: async (path, payload, options) => {
      calls.push({ method: 'POST', path, payload, options });
      return { id: 'bank-1', customerId: 'customer-1', companyId: 'company-1' };
    },
  });

  const accounts = await api.listCustomerPortalBankAccounts();
  await api.linkCustomerPortalBankAccount({
    companyId: 'attacker-company',
    customerId: 'attacker-customer',
    bankCode: 'vcb',
    bankName: 'Vietcombank',
    accountNumber: '0123 456 789',
    accountName: 'TEST CUSTOMER',
  });

  assert.equal(accounts.items.length, 1);
  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
    'GET /cx-suite/portal/bank-accounts',
    'POST /cx-suite/portal/bank-accounts',
  ]);
  assert.deepEqual(calls[1].payload, {
    bankCode: 'VCB',
    bankName: 'Vietcombank',
    accountNumber: '0123456789',
    accountName: 'TEST CUSTOMER',
    isDefault: true,
  });
  assert.equal(Object.hasOwn(calls[1].payload, 'companyId'), false);
  assert.equal(Object.hasOwn(calls[1].payload, 'customerId'), false);
  assert.equal(calls[1].options.retry, false);
});

test('reads and redeems customer loyalty against a selected native receivable only', async () => {
  const calls = [];
  const api = createHdConnectStagingApi({
    get: async (path, options) => {
      calls.push({ method: 'GET', path, options });
      if (path === '/cx-suite/loyalty') return { pointsBalance: 50 };
      return {
        items: [{ id: 'receivable-1', originalAmount: '50000', settledAmount: '12500' }],
        pagination: { totalItems: 1 },
      };
    },
    post: async (path, payload, options) => {
      calls.push({ method: 'POST', path, payload, options });
      return { id: 'redemption-1', ...payload };
    },
  });

  const receivables = await api.listCustomerPortalReceivables({
    companyId: 'attacker-company',
    customerId: 'attacker-customer',
    page: 1,
  });
  const loyalty = await api.getCustomerPortalLoyalty();
  await api.redeemCustomerPortalLoyalty({
    companyId: 'attacker-company',
    customerId: 'attacker-customer',
    receivableId: 'receivable-1',
    pointsToUse: 20,
    amount: 999999,
    requestId: 'loyalty-redeem-1',
  });

  assert.equal(receivables.items[0].outstandingAmount, 37500);
  assert.equal(loyalty.pointsBalance, 50);
  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
    'GET /cx-suite/portal/receivables',
    'GET /cx-suite/loyalty',
    'POST /cx-suite/loyalty/redeem',
  ]);
  assert.equal(Object.hasOwn(calls[0].options.query, 'companyId'), false);
  assert.equal(Object.hasOwn(calls[0].options.query, 'customerId'), false);
  assert.deepEqual(calls[2].payload, {
    requestId: 'loyalty-redeem-1',
    receivableId: 'receivable-1',
    pointsToUse: 20,
  });
  assert.equal(Object.hasOwn(calls[2].payload, 'amount'), false);
  assert.equal(calls[2].options.idempotencyKey, 'loyalty-redeem-1');
  assert.equal(calls[2].options.retry, false);
});

test('creates a portal transfer request from native receivables without caller tenant or customer scope', async () => {
  const calls = [];
  const api = createHdConnectStagingApi({
    post: async (path, payload, options) => {
      calls.push({ path, payload, options });
      return { id: 'payment-1', ...payload };
    },
  });

  await api.requestCustomerPortalPayment({
    companyId: 'attacker-company',
    customerId: 'attacker-customer',
    receivableIds: [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
    ],
    clientMutationId: 'portal-transfer-1',
  });

  assert.equal(calls[0].path, '/cx-suite/portal/payment-requests');
  assert.deepEqual(calls[0].payload, {
    receivableIds: [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ],
    clientMutationId: 'portal-transfer-1',
  });
  assert.equal(Object.hasOwn(calls[0].payload, 'companyId'), false);
  assert.equal(Object.hasOwn(calls[0].payload, 'customerId'), false);
  assert.equal(calls[0].options.idempotencyKey, 'portal-transfer-1');
  assert.equal(calls[0].options.retry, false);
  await assert.rejects(
    () => api.requestCustomerPortalPayment({ receivableIds: ['not-a-uuid'] }),
    { code: 'PORTAL_PAYMENT_RECEIVABLE_REQUIRED' },
  );
});

test('uses the tenant-scoped finance bank account default contract without accepting a caller company', async () => {
  const calls = [];
  const api = createHdConnectStagingApi({
    get: async (path, options) => {
      calls.push({ method: 'GET', path, options });
      return { items: [{ id: 'bank-1', isCustomerPaymentDefault: true }], pagination: { totalItems: 1 } };
    },
    post: async (path, payload, options) => {
      calls.push({ method: 'POST', path, payload, options });
      return { id: 'bank-1' };
    },
    patch: async (path, payload, options) => {
      calls.push({ method: 'PATCH', path, payload, options });
      return { id: 'bank-1', ...payload };
    },
  });

  const accounts = await api.listFinanceBankAccounts({ companyId: 'attacker-company', page: 1 });
  await api.createFinanceBankAccount({
    companyId: 'attacker-company',
    code: 'vcb-main',
    bankName: 'Vietcombank',
    accountName: 'HD CO LTD',
    accountNumber: '0123 456 789',
    isCustomerPaymentDefault: true,
  });
  await api.updateFinanceBankAccount('11111111-1111-4111-8111-111111111111', {
    accountNumber: '9988 7766',
  });
  await api.setFinanceCustomerPaymentDefaultBankAccount('11111111-1111-4111-8111-111111111111');

  assert.equal(accounts.items.length, 1);
  assert.equal(calls[0].options.query.companyId, undefined);
  assert.deepEqual(calls[1].payload, {
    code: 'VCB-MAIN',
    bankName: 'Vietcombank',
    accountName: 'HD CO LTD',
    accountNumber: '0123456789',
    isCustomerPaymentDefault: true,
  });
  assert.equal(Object.hasOwn(calls[1].payload, 'companyId'), false);
  assert.equal(calls[2].path, '/finance-suite/bank-accounts/11111111-1111-4111-8111-111111111111');
  assert.deepEqual(calls[2].payload, { accountNumber: '99887766' });
  assert.equal(calls[2].options.retry, false);
  assert.equal(calls[3].path, '/finance-suite/bank-accounts/11111111-1111-4111-8111-111111111111/customer-payment-default');
  assert.equal(calls[3].options.retry, false);
  await assert.rejects(
    () => api.setFinanceCustomerPaymentDefaultBankAccount('foreign-bank'),
    { code: 'FINANCE_BANK_ACCOUNT_INVALID' },
  );
});

test('uses the audited VPS attendance adjustment contract without caller tenant input', async () => {
  const calls = [];
  const api = createHdConnectStagingApi({
    post: async (path, payload, options) => {
      calls.push({ path, payload, options });
      return { id: 'attendance-1', ...payload };
    },
  });

  await api.adjustAttendance({
    employeeId: '11111111-1111-4111-8111-111111111111',
    workDate: '2026-09-06',
    status: 'present',
    checkInAt: new Date('2026-09-06T08:00:00.000Z'),
    checkOutAt: '2026-09-06T17:00:00.000Z',
    reason: 'Approved attendance correction',
    companyId: 'attacker-company',
  });

  assert.equal(calls[0].path, '/hr-suite/attendance/adjustments');
  assert.deepEqual(calls[0].payload, {
    employeeId: '11111111-1111-4111-8111-111111111111',
    workDate: '2026-09-06',
    status: 'PRESENT',
    checkInAt: '2026-09-06T08:00:00.000Z',
    checkOutAt: '2026-09-06T17:00:00.000Z',
    reason: 'Approved attendance correction',
  });
  assert.equal(Object.hasOwn(calls[0].payload, 'companyId'), false);
  assert.equal(calls[0].options.retry, false);
  await assert.rejects(
    () => api.adjustAttendance({
      employeeId: '11111111-1111-4111-8111-111111111111',
      workDate: '2026-09-06',
      status: 'present',
      reason: '',
    }),
    { code: 'HR_ATTENDANCE_ADJUSTMENT_REASON_REQUIRED' },
  );
});

test('saves the company receiving account through the explicit VPS finance contract', async () => {
  const calls = [];
  const api = {
    listFinanceBankAccounts: async () => ({
      items: [{
        id: '11111111-1111-4111-8111-111111111111',
        code: 'CUSTOMER_RECEIVING_BIDV',
        isCustomerPaymentDefault: true,
      }],
    }),
    updateFinanceBankAccount: async (id, payload) => {
      calls.push({ id, payload });
      return { id, ...payload, isCustomerPaymentDefault: true };
    },
    createFinanceBankAccount: async () => {
      throw new Error('The existing default account should be updated.');
    },
    setFinanceCustomerPaymentDefaultBankAccount: async () => {
      throw new Error('The existing default account should remain default.');
    },
  };

  const company = await saveVpsCompanyReceivingBankAccount(api, { id: 'company-1' }, {
    bankId: 'bidv',
    bankName: 'BIDV',
    bankAccountName: 'HD CO LTD',
    bankAccountNumber: '0123 456 789',
  });

  assert.deepEqual(calls, [{
    id: '11111111-1111-4111-8111-111111111111',
    payload: {
      bankName: 'BIDV',
      accountName: 'HD CO LTD',
      accountNumber: '0123456789',
      status: 'ACTIVE',
    },
  }]);
  assert.equal(company.bankId, 'BIDV');
  assert.equal(company.bankAccountNumber, '0123456789');
  assert.equal(company.vpsCustomerPaymentBankAccountId, '11111111-1111-4111-8111-111111111111');
});

test('creates a new receiving account before changing the company default bank', async () => {
  const calls = [];
  const api = {
    listFinanceBankAccounts: async () => ({
      items: [{
        id: '11111111-1111-4111-8111-111111111111',
        code: 'CUSTOMER_RECEIVING_VCB',
        isCustomerPaymentDefault: true,
      }],
    }),
    updateFinanceBankAccount: async () => {
      throw new Error('A different bank must not overwrite the current default account.');
    },
    createFinanceBankAccount: async (payload) => {
      calls.push({ method: 'CREATE', payload });
      return {
        id: '22222222-2222-4222-8222-222222222222',
        ...payload,
      };
    },
    setFinanceCustomerPaymentDefaultBankAccount: async () => {
      throw new Error('Creating the new default account is atomic.');
    },
  };

  const company = await saveVpsCompanyReceivingBankAccount(api, { id: 'company-1' }, {
    bankId: 'bidv',
    bankName: 'BIDV',
    bankAccountName: 'HD CO LTD',
    bankAccountNumber: '9988 7766',
  });

  assert.deepEqual(calls, [{
    method: 'CREATE',
    payload: {
      code: 'CUSTOMER_RECEIVING_BIDV',
      bankName: 'BIDV',
      accountName: 'HD CO LTD',
      accountNumber: '99887766',
      status: 'ACTIVE',
      isCustomerPaymentDefault: true,
    },
  }]);
  assert.equal(company.vpsCustomerPaymentBankAccountId, '22222222-2222-4222-8222-222222222222');
});

test('routes customer-support chat through scoped VPS contracts without caller tenant or customer IDs', async () => {
  const calls = [];
  const conversation = {
    id: '8b9bcebd-0f5a-4920-98b1-7be3afc37c5b',
    companyId: 'company-1',
    customerId: 'server-customer',
  };
  const api = createHdConnectStagingApi({
    get: async (path, options) => {
      calls.push({ method: 'GET', path, options });
      if (path === '/cx-suite/portal/support/chat') {
        return {
          conversation,
          messages: [{
            id: 'customer-message-1',
            senderType: 'PORTAL_USER',
            body: 'Please confirm the order.',
          }],
        };
      }
      if (path === '/cx-suite/support/chats') return { items: [conversation] };
      return [{
        id: 'staff-message-1',
        senderType: 'STAFF',
        body: 'Confirmed.',
      }];
    },
    post: async (path, payload, options) => {
      calls.push({ method: 'POST', path, payload, options });
      if (path === '/cx-suite/support/chats') return conversation;
      return {
        id: 'message-1',
        companyId: 'company-1',
        customerId: 'server-customer',
        conversationId: conversation.id,
        senderType: 'STAFF',
        body: 'Reply from support.',
      };
    },
  });

  const portal = await api.getCustomerPortalSupportChat();
  const customerSent = await api.sendCustomerPortalSupportMessage({
    companyId: 'attacker-company',
    customerId: 'attacker-customer',
    text: 'Please confirm the order.',
    clientMutationId: 'customer-support-1',
  });
  const chats = await api.listCustomerSupportChats({ companyId: 'attacker-company' });
  const opened = await api.createCustomerSupportChat('8b9bcebd-0f5a-4920-98b1-7be3afc37c5b');
  const staffMessages = await api.listCustomerSupportMessages(opened);
  const staffSent = await api.sendCustomerSupportReply(opened, {
    text: 'Reply from support.',
    clientMutationId: 'customer-support-2',
  });

  assert.equal(portal.messages[0].type, 'customer_to_employee');
  assert.equal(customerSent.customerId, 'server-customer');
  assert.equal(chats.items[0].customerId, 'server-customer');
  assert.equal(staffMessages[0].type, 'employee_to_customer');
  assert.equal(staffSent.customerId, 'server-customer');
  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
    'GET /cx-suite/portal/support/chat',
    'POST /cx-suite/portal/support/messages',
    'GET /cx-suite/support/chats',
    'POST /cx-suite/support/chats',
    `GET /cx-suite/support/chats/${conversation.id}/messages`,
    `POST /cx-suite/support/chats/${conversation.id}/messages`,
  ]);
  assert.equal(Object.hasOwn(calls[1].payload, 'companyId'), false);
  assert.equal(Object.hasOwn(calls[1].payload, 'customerId'), false);
  assert.equal(calls[1].options.idempotencyKey, 'customer-support-1');
  assert.equal(calls[2].options.query.companyId, undefined);
  assert.deepEqual(calls[3].payload, { customerId: conversation.id });
  assert.equal(calls[5].options.idempotencyKey, 'customer-support-2');
  assert.equal(normalizeVpsCustomerSupportMessage({ senderType: 'PORTAL_USER' }).type, 'customer_to_employee');
});

test('stores an access and refresh token pair after VPS login', async () => {
  const storage = createStorage();
  const requests = [];
  const client = new HdApiClient({
    baseUrl: 'https://staging-api.example.test/api/v1',
    storage,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return envelope({ accessToken: 'access-1', refreshToken: 'refresh-1', user: { id: 'user-1' } });
    },
  });

  const session = await client.login({ email: 'owner@example.test', password: 'password-123' });

  assert.equal(session.user.id, 'user-1');
  assert.equal(client.getAccessToken(), 'access-1');
  assert.equal(client.getRefreshToken(), 'refresh-1');
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/api\/v1\/auth\/login$/);
  assert.equal(requests[0].init.headers.Authorization, undefined);
});

test('normalizes relational VPS unit records to the legacy product unit label', () => {
  const product = normalizeVpsProduct({
    id: 'product-1',
    companyId: 'company-1',
    name: 'Chicken',
    salesUnit: { id: 'unit-1', code: 'CON', name: 'Con', symbol: null },
  });

  assert.equal(product.unit, 'Con');
  assert.equal(product.unitId, 'unit-1');
});

test('normalizes relational order-line units before the legacy UI renders them', () => {
  const order = normalizeVpsOrder({
    id: 'order-1',
    lines: [{
      id: 'line-1',
      unitId: 'unit-1',
      unit: { id: 'unit-1', code: 'CON', name: 'Con', symbol: null },
      quantity: '2',
    }],
  });

  assert.equal(order.items[0].unit, 'Con');
  assert.equal(order.items[0].quantity, 2);
});

test('normalizes VPS draft expenses for the legacy finance read model without posting', () => {
  const expense = normalizeVpsFinanceExpense({
    id: 'expense-1',
    companyId: 'company-1',
    createdBy: 'user-1',
    amount: '125000',
    expenseType: 'Fuel',
    description: 'Delivery fuel',
    expenseDate: '2026-08-24T09:00:00.000Z',
    status: 'DRAFT',
  });

  assert.equal(expense.amount, 125000);
  assert.equal(expense.category, 'Fuel');
  assert.equal(expense.date, '2026-08-24');
  assert.equal(expense.approvalStatus, 'pending');
  assert.equal(expense.handoverStatus, 'pending');
  assert.equal(expense.sourceSystem, 'hd-connect-vps');
});

test('normalizes relational VPS attendance into the existing staff UI read model', () => {
  const attendance = normalizeVpsAttendance({
    id: 'attendance-1',
    companyId: 'company-1',
    employeeId: 'employee-1',
    workDate: '2026-08-22T00:00:00.000Z',
    checkInAt: '2026-08-22T01:00:00.000Z',
    checkOutAt: '2026-08-22T09:00:00.000Z',
    status: 'PRESENT',
  });

  assert.equal(attendance.date, '2026-08-22');
  assert.equal(attendance.empId, 'employee-1');
  assert.equal(attendance.checkIn, '2026-08-22T01:00:00.000Z');
  assert.equal(attendance.checkOut, '2026-08-22T09:00:00.000Z');
  assert.equal(attendance.status, 'present');
  assert.equal(attendance.sourceSystem, 'hd-connect-vps');
});

test('builds inventory mutations only from explicit target IDs and preserves weight metadata', () => {
  const payload = buildVpsInventoryTransaction({
    warehouseId: '11111111-1111-4111-8111-111111111111',
    productId: '22222222-2222-4222-8222-222222222222',
    unitId: '33333333-3333-4333-8333-333333333333',
    quantity: 12,
    quantityUnit: 'Con',
    unitLabel: 'Con',
    weightKg: 24.5,
    packedQuantity: 12,
    billingQuantity: 24.5,
    clientMutationId: 'inventory-mutation-1',
    sourceDispatchId: 'warehouse-dispatch-1',
    orderId: '44444444-4444-4444-8444-444444444444',
    orderLineId: '55555555-5555-4555-8555-555555555555',
    reservationId: '66666666-6666-4666-8666-666666666666',
  });

  assert.equal(payload.warehouseId, '11111111-1111-4111-8111-111111111111');
  assert.equal(payload.productId, '22222222-2222-4222-8222-222222222222');
  assert.equal(payload.unitId, '33333333-3333-4333-8333-333333333333');
  assert.equal(payload.quantity, 12);
    assert.equal(payload.actualWeightKg, 24.5);
    assert.equal(payload.sourceDispatchId, 'warehouse-dispatch-1');
    assert.equal(payload.orderId, '44444444-4444-4444-8444-444444444444');
    assert.equal(payload.orderLineId, '55555555-5555-4555-8555-555555555555');
    assert.equal(payload.reservationId, '66666666-6666-4666-8666-666666666666');
  assert.equal(payload.metadata.packedQuantity, 12);
  assert.equal(payload.metadata.billingQuantity, 24.5);
});

test('fails closed when inventory mapping or unit evidence is incomplete', async () => {
  assert.throws(
    () => buildVpsInventoryTransaction({
      productId: '22222222-2222-4222-8222-222222222222',
      unitId: '33333333-3333-4333-8333-333333333333',
      quantity: 1,
    }),
    (error) => error instanceof HdApiError && error.code === 'INVENTORY_TARGET_MAPPING_REQUIRED',
  );
  assert.throws(
    () => buildVpsInventoryTransaction({
      warehouseId: '11111111-1111-4111-8111-111111111111',
      productId: '22222222-2222-4222-8222-222222222222',
      unitId: '33333333-3333-4333-8333-333333333333',
      quantity: 1,
      quantityUnit: 'Kg',
      unitLabel: 'Con',
    }),
    (error) => error instanceof HdApiError && error.code === 'INVENTORY_UNIT_MAPPING_MISMATCH',
  );
});

test('normalizes immutable VPS stock movement for the existing warehouse read model', () => {
  const movement = normalizeVpsStockMovement({
    id: '44444444-4444-4444-8444-444444444444',
    companyId: '55555555-5555-4555-8555-555555555555',
    warehouseId: '11111111-1111-4111-8111-111111111111',
    productId: '22222222-2222-4222-8222-222222222222',
    unitId: '33333333-3333-4333-8333-333333333333',
    quantity: '12',
    unit: { name: 'Con' },
    actualWeightKg: '24.5',
  });

  assert.equal(movement.quantity, 12);
  assert.equal(movement.quantityUnit, 'Con');
  assert.equal(movement.weightKg, 24.5);
  assert.equal(movement.readOnlyLedger, true);
});

test('isolates production VPS tokens from staging browser sessions', () => {
  const storage = createStorage();
  const client = new HdApiClient({
    baseUrl: 'https://api.example.test/api/v1',
    storage,
    tokenStorageNamespace: 'vps-production',
    fetchImpl: async () => envelope({}),
  });

  client.setSession({ accessToken: 'production-access', refreshToken: 'production-refresh' });

  assert.equal(storage.getItem('hdconnect.vps-production.access-token'), 'production-access');
  assert.equal(storage.getItem('hdconnect.vps-production.refresh-token'), 'production-refresh');
  assert.equal(storage.getItem('hdconnect.vps-staging.access-token'), null);
  assert.equal(storage.getItem('hdconnect.vps-staging.refresh-token'), null);
});

test('refreshes once and retries an authenticated read after HTTP 401', async () => {
  const storage = createStorage();
  storage.setItem('hdconnect.vps-staging.access-token', 'expired-access');
  storage.setItem('hdconnect.vps-staging.refresh-token', 'refresh-1');
  const calls = [];
  const client = new HdApiClient({
    baseUrl: 'https://staging-api.example.test/api/v1',
    storage,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/auth/refresh')) {
        return envelope({ accessToken: 'fresh-access', refreshToken: 'fresh-refresh' });
      }
      if (calls.filter((call) => call.url.endsWith('/master-data/customers')).length === 1) {
        return errorEnvelope('Access token expired.', { status: 401, code: 'UNAUTHORIZED' });
      }
      return envelope({ items: [{ id: 'customer-1' }], pagination: { page: 1 } });
    },
  });

  const result = await client.get('/master-data/customers');

  assert.equal(result.items[0].id, 'customer-1');
  assert.equal(client.getAccessToken(), 'fresh-access');
  assert.equal(client.getRefreshToken(), 'fresh-refresh');
  assert.equal(calls.filter((call) => call.url.endsWith('/auth/refresh')).length, 1);
  assert.equal(calls.at(-1).init.headers.Authorization, 'Bearer fresh-access');
});

test('parses authenticated VPS SSE events without exposing the access token', async () => {
  const storage = createStorage();
  storage.setItem('hdconnect.vps-staging.access-token', 'access-stream');
  const requests = [];
  const client = new HdApiClient({
    baseUrl: 'https://staging-api.example.test/api/v1',
    storage,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return new Response(
        'event: ready\ndata: {"companyId":"company-1"}\n\n'
        + 'event: event\ndata: {"eventName":"CustomerUpdated","companyId":"company-1"}\n\n',
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    },
  });
  const events = [];

  await client.stream('/realtime/stream', { onEvent: (event) => events.push(event) });

  assert.deepEqual(events, [
    { type: 'ready', data: { companyId: 'company-1' } },
    { type: 'event', data: { eventName: 'CustomerUpdated', companyId: 'company-1' } },
  ]);
  assert.equal(requests[0].url, 'https://staging-api.example.test/api/v1/realtime/stream');
  assert.equal(requests[0].init.headers.Authorization, 'Bearer access-stream');
  assert.equal(requests[0].init.headers.Accept, 'text/event-stream');
});

test('rejects malformed API envelopes without exposing sensitive request data', async () => {
  const client = new HdApiClient({
    baseUrl: 'https://staging-api.example.test/api/v1',
    fetchImpl: async () => new Response(JSON.stringify({ hello: 'world' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });

  await assert.rejects(
    () => client.get('/master-data/customers'),
    (error) => error instanceof HdApiError && error.code === 'API_REQUEST_REJECTED',
  );
});

test('blocks order creation until the target warehouse and line-unit mapping are proven', async () => {
  const api = createHdConnectStagingApi({
    post: async () => {
      throw new Error('The client must not call the API for unresolved orders.');
    },
  });

  await assert.rejects(
    () => api.createOrder({
      customerId: '11111111-1111-4111-8111-111111111111',
      items: [{ productId: '22222222-2222-4222-8222-222222222222', quantity: 1 }],
    }),
    (error) => error instanceof HdApiError && error.code === 'ORDER_WAREHOUSE_UNRESOLVED',
  );
});

test('sends order line updates through the VPS sales contract', async () => {
  let capturedPath = '';
  let capturedPayload;
  let capturedOptions;
  const api = createHdConnectStagingApi({
    patch: async (path, payload, options) => {
      capturedPath = path;
      capturedPayload = payload;
      capturedOptions = options;
      return {
        id: '33333333-3333-4333-8333-333333333333',
        companyId: '44444444-4444-4444-8444-444444444444',
        lines: payload.lines,
      };
    },
  });

  const order = await api.updateOrder('33333333-3333-4333-8333-333333333333', {
    items: [{
      productId: '55555555-5555-4555-8555-555555555555',
      unitId: '66666666-6666-4666-8666-666666666666',
      quantity: 3,
      unitPrice: 125000,
    }],
    discountType: 'PERCENTAGE',
    discountValue: 5,
    clientMutationId: 'order-line-update-1',
  });

  assert.equal(capturedPath, '/sales/orders/33333333-3333-4333-8333-333333333333');
  assert.equal(capturedOptions.idempotencyKey, 'order-line-update-1');
  assert.equal(capturedPayload.discountType, 'PERCENTAGE');
  assert.equal(capturedPayload.discountValue, 5);
  assert.deepEqual(capturedPayload.lines, [{
    productId: '55555555-5555-4555-8555-555555555555',
    unitId: '66666666-6666-4666-8666-666666666666',
    quantity: 3,
    unitPrice: 125000,
    metadata: { clientMutationId: 'order-line-update-1' },
  }]);
  assert.equal(order.lines[0].productId, capturedPayload.lines[0].productId);
});

test('does not retry a failed POST mutation automatically', async () => {
  let callCount = 0;
  const client = new HdApiClient({
    baseUrl: 'https://staging-api.example.test/api/v1',
    fetchImpl: async () => {
      callCount += 1;
      throw new TypeError('network unavailable');
    },
  });

  await assert.rejects(
    () => client.post('/master-data/customers', { name: 'No retry' }),
    (error) => error instanceof HdApiError && error.code === 'API_NETWORK_ERROR',
  );
  assert.equal(callCount, 1);
});

test('keeps company scope on the server when creating a customer', async () => {
  let capturedPayload;
  let capturedOptions;
  const api = createHdConnectStagingApi({
    post: async (_path, payload, options) => {
      capturedPayload = payload;
      capturedOptions = options;
      return {
        id: '11111111-1111-4111-8111-111111111111',
        companyId: '22222222-2222-4222-8222-222222222222',
        name: payload.name,
      };
    },
  });

  await api.createCustomer({
    name: 'Tenant-safe customer',
    phone: '0900000000',
    companyId: 'attacker-selected-company-id',
    clientMutationId: 'mutation-1',
  });

  assert.equal(Object.hasOwn(capturedPayload, 'companyId'), false);
  assert.equal(capturedPayload.phones[0], '0900000000');
  assert.equal(capturedOptions.idempotencyKey, 'mutation-1');
});

const customerHrFixture = {
  id: '11111111-1111-4111-8111-111111111111',
  companyId: 'd1baaf33-cd5a-4b6a-84a6-d432c231a5c4',
  name: 'Customer HR assignment fixture',
  salesEmployeeId: '1c0fc8af-1bab-42af-b3e2-de71b11059f8',
  salesOwnerId: '22222222-2222-4222-8222-222222222222',
  status: 'ACTIVE',
  attributes: { empId: 'legacy-sales-employee', customBusinessField: 3 },
};

test('customer read maps only typed HR assignment to UI aliases and keeps login owner in a separate read field', () => {
  const customer = normalizeVpsCustomer(customerHrFixture);
  assert.equal(customer.empId, customerHrFixture.salesEmployeeId);
  assert.equal(customer.salesEmpId, customerHrFixture.salesEmployeeId);
  assert.equal(customer.salesEmployeeId, customerHrFixture.salesEmployeeId);
  assert.equal(customer.userSalesOwnerId, customerHrFixture.salesOwnerId);
  assert.equal(customer.salesOwnerId, undefined);
  assert.equal(customer.salesEmployeeReconciliationRequired, false);
  assert.equal(customer.attributes, customerHrFixture.attributes);
  assert.equal(customer.customBusinessField, 3);
  const ownerOnly = normalizeVpsCustomer({ ...customerHrFixture, salesEmployeeId: null, attributes: {} });
  assert.equal(ownerOnly.empId, '');
  assert.equal(ownerOnly.salesEmpId, '');
  assert.equal(ownerOnly.userSalesOwnerId, customerHrFixture.salesOwnerId);
  assert.equal(ownerOnly.salesOwnerId, undefined);
});

test('customer POST serializes salesEmpId and actual App empId as salesEmployeeId, never as a login owner', async () => {
  const requests = [];
  const api = createHdConnectStagingApi(new HdApiClient({
    baseUrl: 'https://staging-api.example.test/api/v1', storage: createStorage(),
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      requests.push({ url, init, body });
      return envelope({ ...customerHrFixture, ...body, salesOwnerId: null });
    },
  }));
  for (const key of ['empId', 'salesEmpId', 'salesEmployeeId']) {
    const saved = await api.createCustomer({ name: 'Customer', [key]: customerHrFixture.salesEmployeeId, clientMutationId: 'stable-customer-hr' });
    const { url, init, body } = requests.at(-1);
    assert.match(url, /\/master-data\/customers$/);
    assert.equal(init.method, 'POST');
    assert.equal(body.salesEmployeeId, customerHrFixture.salesEmployeeId);
    assert.equal(body.salesOwnerId, undefined);
    assert.equal(body.empId, undefined);
    assert.equal(body.salesEmpId, undefined);
    assert.equal(body.companyId, undefined);
    assert.equal(saved.empId, customerHrFixture.salesEmployeeId);
  }
});

test('customer PATCH recognizes one edited UI alias without reusing stale normalized aliases or rewriting User ownership', async () => {
  const newEmployee = '33333333-3333-4333-8333-333333333333';
  const calls = [];
  const api = createHdConnectStagingApi({ patch: async (path, body, options) => {
    calls.push({ path, body, options });
    return { ...customerHrFixture, ...body };
  } });
  for (const field of ['empId', 'salesEmpId', 'salesEmployeeId']) {
    const saved = await api.updateCustomer(customerHrFixture.id, {
      ...normalizeVpsCustomer(customerHrFixture), [field]: newEmployee, clientMutationId: 'same-retry',
    });
    assert.equal(calls.at(-1).path, `/master-data/customers/${customerHrFixture.id}`);
    assert.equal(calls.at(-1).body.salesEmployeeId, newEmployee);
    assert.equal(calls.at(-1).body.salesOwnerId, undefined);
    assert.equal(calls.at(-1).body.userSalesOwnerId, undefined);
    assert.equal(calls.at(-1).body.vpsSalesEmployeeId, undefined);
    assert.equal(calls.at(-1).body.attributes.empId, 'legacy-sales-employee');
    assert.equal(calls.at(-1).options.retry, false);
    assert.equal(calls.at(-1).options.idempotencyKey, 'same-retry');
    assert.equal(saved.empId, newEmployee);
  }
});

test('customer assignments distinguish omitted HR fields, explicit unassignment and the existing User owner contract', async () => {
  let body;
  const api = createHdConnectStagingApi({ post: async (_path, payload) => { body = payload; return { ...customerHrFixture, ...payload }; } });
  await api.createCustomer({ name: 'No HR assignment', salesOwnerId: customerHrFixture.salesOwnerId });
  assert.equal(body.salesOwnerId, customerHrFixture.salesOwnerId);
  assert.equal(Object.hasOwn(body, 'salesEmployeeId'), false);
  await api.createCustomer({ name: 'Both separate targets', salesOwnerId: customerHrFixture.salesOwnerId, salesEmpId: customerHrFixture.salesEmployeeId });
  assert.equal(body.salesOwnerId, customerHrFixture.salesOwnerId);
  assert.equal(body.salesEmployeeId, customerHrFixture.salesEmployeeId);
  await api.createCustomer({ ...normalizeVpsCustomer(customerHrFixture), empId: '' });
  assert.equal(body.salesEmployeeId, null);
  assert.equal(Object.hasOwn(body, 'salesOwnerId'), false);
  await api.createCustomer({ name: 'Explicit null', salesEmployeeId: null });
  assert.equal(body.salesEmployeeId, null);
});

test('customer assignment rejects non-UUID, ambiguous and unmapped historical HR references before transport', async () => {
  const api = createHdConnectStagingApi({ post: () => assert.fail('Invalid HR mapping must not reach transport'), patch: () => assert.fail('Invalid HR mapping must not reach transport') });
  for (const value of ['legacy-employee', 'undefined', ' ', 12, [], [customerHrFixture.salesEmployeeId], { id: customerHrFixture.salesEmployeeId }]) {
    await assert.rejects(api.createCustomer({ name: 'Invalid assignment', salesEmpId: value }), { code: 'reconciliation_required' });
  }
  await assert.rejects(api.createCustomer({ name: 'Ambiguous', empId: customerHrFixture.salesEmployeeId, salesEmpId: customerHrFixture.salesOwnerId }), { code: 'reconciliation_required' });
  for (const attributes of [
    { empId: 'legacy-employee' },
    { salesEmpId: customerHrFixture.salesOwnerId },
    { salesEmployeeId: customerHrFixture.salesEmployeeId, legacyUi: { empId: 'legacy-employee' } },
  ]) {
    const historical = normalizeVpsCustomer({ ...customerHrFixture, salesEmployeeId: null, attributes });
    assert.equal(historical.empId, '');
    assert.equal(historical.salesEmpId, '');
    assert.equal(historical.salesEmployeeReconciliationRequired, true);
    assert.equal(historical.attributes, attributes);
    await assert.rejects(api.updateCustomer(historical.id, historical), { code: 'reconciliation_required' });
  }
});

test('explicit native HR selection reconciles a historical assignment without discarding the raw source reference', async () => {
  const historical = normalizeVpsCustomer({ ...customerHrFixture, salesEmployeeId: null });
  let body;
  const api = createHdConnectStagingApi({ patch: async (_path, payload) => { body = payload; return { ...customerHrFixture, ...payload }; } });
  const saved = await api.updateCustomer(historical.id, { ...historical, empId: customerHrFixture.salesEmployeeId });
  assert.equal(body.salesEmployeeId, customerHrFixture.salesEmployeeId);
  assert.equal(body.salesOwnerId, undefined);
  assert.equal(body.attributes.empId, 'legacy-sales-employee');
  assert.equal(saved.salesEmployeeReconciliationRequired, false);
});

test('customer HR assignment conflicts propagate without retries or implicit clearing of existing User ownership', async () => {
  let calls = 0;
  const current = normalizeVpsCustomer(customerHrFixture);
  const api = createHdConnectStagingApi(new HdApiClient({
    baseUrl: 'https://staging-api.example.test/api/v1', storage: createStorage(),
    fetchImpl: async (_url, init) => {
      calls++;
      const body = JSON.parse(init.body);
      assert.equal(body.salesEmployeeId, '33333333-3333-4333-8333-333333333333');
      assert.equal(Object.hasOwn(body, 'salesOwnerId'), false);
      return errorEnvelope('Assignment conflicts with existing User ownership.', { status: 409, code: 'CUSTOMER_SALES_ASSIGNMENT_CONFLICT' });
    },
  }));
  await assert.rejects(api.updateCustomer(current.id, { ...current, empId: '33333333-3333-4333-8333-333333333333' }), { code: 'CUSTOMER_SALES_ASSIGNMENT_CONFLICT' });
  assert.equal(calls, 1);
  assert.equal(current.empId, customerHrFixture.salesEmployeeId);
  assert.equal(current.userSalesOwnerId, customerHrFixture.salesOwnerId);
});

test('routes VPS identity security contracts without Firebase tokens', async () => {
  const calls = [];
  const api = createHdConnectStagingApi({
    get: async (path, options) => {
      calls.push({ method: 'GET', path, options });
      if (path === '/identity/sessions') {
        return [{
          id: '11111111-1111-4111-8111-111111111111',
          deviceName: 'Browser',
          platform: 'web',
          lastUsedAt: '2026-08-18T00:00:00.000Z',
        }];
      }
      if (path === '/audit') return { items: [{ id: 'audit-1', action: 'AUTH_LOGIN_SUCCEEDED' }] };
      return { id: 'user-1' };
    },
    post: async (path, payload, options) => {
      calls.push({ method: 'POST', path, payload, options });
      return { changed: true };
    },
    delete: async (path, options) => {
      calls.push({ method: 'DELETE', path, options });
      return { revoked: true };
    },
  });

  const profile = await api.getIdentityProfile();
  const sessions = await api.listIdentitySessions();
  await api.changeIdentityPassword({ currentPassword: 'current-password', newPassword: 'new-password' });
  await api.completePasswordReset({ token: 'reset-token-that-is-long-enough', newPassword: 'new-password' });
  await api.revokeIdentitySession(sessions.items[0].deviceId);
  const audit = await api.listIdentityAudit();

  assert.equal(profile.id, 'user-1');
  assert.equal(sessions.items[0].deviceId, '11111111-1111-4111-8111-111111111111');
  assert.equal(audit.entries[0].action, 'AUTH_LOGIN_SUCCEEDED');
  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
    'GET /identity/me',
    'GET /identity/sessions',
    'POST /identity/password/change',
    'POST /identity/password/reset',
    'DELETE /identity/sessions/11111111-1111-4111-8111-111111111111',
    'GET /audit',
  ]);
  assert.equal(calls[2].payload.currentPassword, 'current-password');
  assert.equal(calls[2].options.retry, false);
  assert.equal(calls[3].options.authenticate, false);
});

test('maps VPS sessions to the Identity Security Center and blocks unsupported operations explicitly', async () => {
  let revokedSessionId = '';
  let logoutAllCalled = false;
  const securityApi = (await import('../src/api/hdConnectStaging.js')).createVpsIdentitySecurityApi({
    client: { deviceName: 'HD Manager test', platform: 'hd-manager-web' },
    listIdentitySessions: async () => ({
      items: [{ deviceId: '22222222-2222-4222-8222-222222222222', name: 'Laptop' }],
    }),
    listIdentityAudit: async () => ({ entries: [] }),
    changeIdentityPassword: async (payload) => payload,
    revokeIdentitySession: async (sessionId) => {
      revokedSessionId = sessionId;
      return { revoked: true };
    },
    logoutAll: async () => {
      logoutAllCalled = true;
      return { revoked: true };
    },
  });

  assert.equal(securityApi.getIdentityDevice().name, 'HD Manager test');
  assert.equal((await securityApi.identityListDevices()).devices[0].deviceId, '22222222-2222-4222-8222-222222222222');
  await securityApi.identityRevokeDevices({ deviceId: '22222222-2222-4222-8222-222222222222' });
  await securityApi.identityRevokeDevices({ all: true });
  assert.equal(revokedSessionId, '22222222-2222-4222-8222-222222222222');
  assert.equal(logoutAllCalled, true);
  await assert.rejects(
    () => securityApi.identityDeleteAccount(),
    (error) => error instanceof HdApiError && error.code === 'VPS_IDENTITY_DELETE_NOT_READY' && error.status === 501,
  );
  await assert.rejects(
    () => securityApi.identitySetBiometric(),
    (error) => error instanceof HdApiError && error.code === 'VPS_IDENTITY_BIOMETRIC_NOT_READY',
  );
});

test('rejects invalid VPS identity mutation input before transport', async () => {
  let calls = 0;
  const api = createHdConnectStagingApi({
    post: async () => {
      calls += 1;
      return {};
    },
  });

  await assert.rejects(
    () => api.changeIdentityPassword({ currentPassword: '', newPassword: 'short' }),
    (error) => error instanceof HdApiError && error.code === 'PASSWORD_CHANGE_INPUT_INVALID',
  );
  await assert.rejects(
    () => api.revokeIdentitySession('not-a-uuid'),
    (error) => error instanceof HdApiError && error.code === 'IDENTITY_SESSION_ID_INVALID',
  );
  assert.equal(calls, 0);
});

test('routes supported warehouse, inventory, finance and HR contracts without tenant override', async () => {
  const calls = [];
  const api = createHdConnectStagingApi({
    get: async (path, options) => {
      calls.push({ method: 'GET', path, options });
      return { items: [] };
    },
    post: async (path, payload, options) => {
      calls.push({ method: 'POST', path, payload, options });
      return { id: 'record-1' };
    },
    patch: async (path, payload, options) => {
      calls.push({ method: 'PATCH', path, payload, options });
      return { id: 'record-1' };
    },
  });

  await api.listWarehouses({ page: 1 });
  await api.createWarehouse({ companyId: 'attacker-company', code: 'WH-A', name: 'Warehouse A' });
  await api.postInventoryOpeningBalance({
    tenantId: 'attacker-tenant',
    warehouseId: '11111111-1111-4111-8111-111111111118',
    productId: '11111111-1111-4111-8111-111111111119',
    unitId: '11111111-1111-4111-8111-111111111117',
    quantity: 10,
    clientMutationId: 'opening-1',
  });
  await api.createFinanceCashAccount({ companyId: 'attacker-company', code: 'CASH-A', name: 'Cash' });
  await api.createEmployee({ organizationId: 'attacker-org', employeeCode: 'EMP-A', fullName: 'Employee A' });

  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
    'GET /warehouse-suite/warehouses',
    'POST /warehouse-suite/warehouses',
    'POST /inventory/transactions/opening-balance',
    'POST /finance-suite/cash-accounts',
    'POST /hr-suite/employees',
  ]);
  for (const call of calls.filter((entry) => entry.payload)) {
    assert.equal(Object.hasOwn(call.payload, 'companyId'), false);
    assert.equal(Object.hasOwn(call.payload, 'tenantId'), false);
    assert.equal(Object.hasOwn(call.payload, 'organizationId'), false);
  }
  assert.equal(calls[2].options.idempotencyKey, 'opening-1');
  assert.equal(calls[2].options.retry, false);
});

test('routes the explicit payroll lifecycle without Firebase-shaped status writes', async () => {
  const calls = [];
  const api = createHdConnectStagingApi({
    get: async (path, options) => {
      calls.push({ method: 'GET', path, options });
      return { items: [] };
    },
    post: async (path, payload, options) => {
      calls.push({ method: 'POST', path, payload, options });
      return { id: 'payroll-1', status: 'DRAFT' };
    },
  });

  await api.listPayrollPeriods({ page: 1 });
  await api.createPayrollPeriod({ code: '2026-08', periodStart: '2026-08-01', periodEnd: '2026-08-31', clientMutationId: 'period-1' });
  await api.generatePayroll({ payrollPeriodId: '11111111-1111-4111-8111-111111111111', code: 'PAYROLL-2026-08', clientMutationId: 'payroll-1' });
  await api.approvePayroll('22222222-2222-4222-8222-222222222222');
  await api.lockPayroll('22222222-2222-4222-8222-222222222222');

  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
    'GET /hr-suite/payroll-periods',
    'POST /hr-suite/payroll-periods',
    'POST /hr-suite/payrolls/generate',
    'POST /hr-suite/payrolls/22222222-2222-4222-8222-222222222222/approve',
    'POST /hr-suite/payrolls/22222222-2222-4222-8222-222222222222/lock',
  ]);
  assert.equal(calls[2].options.idempotencyKey, 'payroll-1');
  assert.equal(calls[4].options.retry, false);
});

test('routes warehouse transfers through explicit source and destination contracts', async () => {
  const calls = [];
  const api = createHdConnectStagingApi({
    get: async (path, options) => {
      calls.push({ method: 'GET', path, options });
      return { items: [] };
    },
    post: async (path, payload, options) => {
      calls.push({ method: 'POST', path, payload, options });
      return { id: '11111111-1111-4111-8111-111111111111', status: 'DRAFT' };
    },
  });

  await api.listWarehouseTransfers({ companyId: 'attacker-company', page: 1 });
  await api.createWarehouseTransfer({
    companyId: 'attacker-company',
    sourceWarehouseId: '11111111-1111-4111-8111-111111111112',
    destinationWarehouseId: '11111111-1111-4111-8111-111111111113',
    lines: [{ productId: '11111111-1111-4111-8111-111111111114', unitId: '11111111-1111-4111-8111-111111111115', quantity: 1 }],
    clientMutationId: 'transfer-1',
  });
  await api.postWarehouseTransfer('11111111-1111-4111-8111-111111111111');

  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
    'GET /warehouse-suite/transfers',
    'POST /warehouse-suite/transfers',
    'POST /warehouse-suite/transfers/11111111-1111-4111-8111-111111111111/post',
  ]);
  assert.equal(Object.hasOwn(calls[1].payload, 'companyId'), false);
  assert.equal(calls[1].options.idempotencyKey, 'transfer-1');
  assert.equal(calls[1].options.retry, false);
  assert.equal(calls[2].options.retry, false);
});

test('routes VPS stock count as an explicit session, line, and post sequence', async () => {
  const calls = [];
  const api = createHdConnectStagingApi({
    post: async (path, payload, options) => {
      calls.push({ path, payload, options });
      if (path === '/warehouse-suite/counts') return { id: '11111111-1111-4111-8111-111111111111' };
      if (path.endsWith('/lines')) return { id: 'line-1' };
      return { id: '11111111-1111-4111-8111-111111111111', status: 'POSTED' };
    },
  });

  const session = await api.createWarehouseCountSession({
    warehouseId: '22222222-2222-4222-8222-222222222222',
    notes: 'E2E count',
    companyId: 'attacker-company',
    clientMutationId: 'count-1',
  });
  await api.addWarehouseCountLine(session.id, {
    productId: '33333333-3333-4333-8333-333333333333',
    unitId: '44444444-4444-4444-8444-444444444444',
    countedQuantity: 12,
    tenantId: 'attacker-tenant',
    clientMutationId: 'count-1',
  });
  await api.postWarehouseCountSession(session.id);

  assert.deepEqual(calls.map(call => call.path), [
    '/warehouse-suite/counts',
    '/warehouse-suite/counts/11111111-1111-4111-8111-111111111111/lines',
    '/warehouse-suite/counts/11111111-1111-4111-8111-111111111111/post',
  ]);
  assert.equal(calls[0].options.idempotencyKey, 'count-1');
  assert.equal(calls[1].payload.countedQuantity, 12);
  assert.equal(Object.hasOwn(calls[0].payload, 'companyId'), false);
  assert.equal(Object.hasOwn(calls[1].payload, 'tenantId'), false);
  assert.equal(calls[2].options.retry, false);
});

test('opens the authenticated VPS realtime stream without a Firebase fallback', async () => {
  const controller = new AbortController();
  const events = [];
  const api = createHdConnectStagingApi({
    stream: async (path, options) => {
      events.push({ path, options });
      options.onEvent({ type: 'ready', data: { companyId: 'company-1' } });
      controller.abort();
    },
  });

  await api.subscribeRealtime({ signal: controller.signal, onEvent: () => {} });

  assert.equal(events[0].path, '/realtime/stream');
  assert.equal(typeof events[0].options.onEvent, 'function');
});

test('reconnects a closed VPS realtime stream and suppresses duplicate event IDs', async () => {
  const controller = new AbortController();
  const deliveredEvents = [];
  const streamStates = [];
  let streamCalls = 0;
  const api = createHdConnectStagingApi({
    stream: async (_path, options) => {
      streamCalls += 1;
      options.onEvent({ type: 'ready', data: { companyId: 'company-1' } });
      options.onEvent({
        type: 'event',
        data: { eventId: 'event-1', companyId: 'company-1' },
      });

      if (streamCalls === 1) return;

      options.onEvent({
        type: 'event',
        data: { eventId: 'event-1', companyId: 'company-1' },
      });
      options.onEvent({
        type: 'event',
        data: { eventId: 'event-2', companyId: 'company-1' },
      });
      controller.abort();
    },
  });

  await api.subscribeRealtime({
    signal: controller.signal,
    initialReconnectDelayMs: 0,
    maxReconnectDelayMs: 0,
    onEvent: (message) => deliveredEvents.push(message),
    onState: (state) => streamStates.push(state),
  });

  assert.equal(streamCalls, 2);
  assert.deepEqual(
    deliveredEvents
      .filter((message) => message.type === 'event')
      .map((message) => message.data.eventId),
    ['event-1', 'event-2'],
  );
  assert.ok(streamStates.some((state) => state.state === 'reconnecting'));
});

test('refreshes once before reconnecting an unauthorized VPS realtime stream', async () => {
  const controller = new AbortController();
  const streamStates = [];
  let streamCalls = 0;
  let refreshCalls = 0;
  const api = createHdConnectStagingApi({
    stream: async (_path, options) => {
      streamCalls += 1;
      if (streamCalls === 1) {
        throw new HdApiError('Access token expired.', {
          status: 401,
          code: 'AUTH_ACCESS_TOKEN_EXPIRED',
        });
      }
      options.onEvent({ type: 'ready', data: { companyId: 'company-1' } });
      controller.abort();
    },
    refresh: async () => {
      refreshCalls += 1;
      return { accessToken: 'rotated-access', refreshToken: 'rotated-refresh' };
    },
  });

  await api.subscribeRealtime({
    signal: controller.signal,
    onEvent: () => {},
    onState: (state) => streamStates.push(state),
  });

  assert.equal(refreshCalls, 1);
  assert.equal(streamCalls, 2);
  assert.ok(streamStates.some((state) => state.state === 'reauthenticating'));
});

test('does not retry a forbidden VPS realtime stream', async () => {
  let streamCalls = 0;
  const api = createHdConnectStagingApi({
    stream: async () => {
      streamCalls += 1;
      throw new HdApiError('Realtime permission denied.', {
        status: 403,
        code: 'AUTH_PERMISSION_DENIED',
      });
    },
  });

  await assert.rejects(
    () => api.subscribeRealtime({ onEvent: () => {} }),
    (error) => error instanceof HdApiError && error.code === 'AUTH_PERMISSION_DENIED',
  );
  assert.equal(streamCalls, 1);
});

test('routes notification, storage, reporting and settings contracts without tenant override', async () => {
  const calls = [];
  const api = createHdConnectStagingApi({
    get: async (path, options) => {
      calls.push({ method: 'GET', path, options });
      return { items: [] };
    },
    post: async (path, payload, options) => {
      calls.push({ method: 'POST', path, payload, options });
      return { id: 'record-1' };
    },
  });

  await api.listNotifications({ status: 'UNREAD' });
  await api.markNotificationsRead({ notificationIds: ['notification-1'], all: false });
  await api.listStorage({ page: 1 });
  await api.getStorageSignedUrl({ tenantId: 'attacker-tenant', fileId: 'file-1' });
  await api.uploadStorageFile({
    tenantId: 'attacker-tenant',
    fileName: 'test.txt',
    mimeType: 'text/plain',
    contentText: 'test content',
  });
  await api.getExecutiveReports({ period: 'month' });
  await api.getPlatformConfig({ companyId: 'attacker-company' });

  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
    'GET /notifications',
    'POST /notifications/read',
    'GET /storage',
    'POST /storage/signed-url',
    'POST /storage/upload',
    'GET /executive/reports',
    'GET /platform/config',
  ]);
  assert.deepEqual(calls[1].payload, { notificationIds: ['notification-1'], all: false });
  assert.equal(Object.hasOwn(calls[3].payload, 'tenantId'), false);
  assert.equal(Object.hasOwn(calls[4].payload, 'tenantId'), false);
  assert.equal(Object.hasOwn(calls[6].options.query, 'companyId'), false);
});

test('normalizes supported phone forms and sends the phone/password login contract', async () => {
  assert.equal(normalizeVpsPhoneIdentifier('0925999333'), '0925999333');
  assert.equal(normalizeVpsPhoneIdentifier('84925999333'), '0925999333');
  assert.equal(normalizeVpsPhoneIdentifier('+84925999333'), '0925999333');
  assert.equal(normalizeVpsPhoneIdentifier('not-a-phone'), '');

  for (const phone of ['0925999333', '84925999333', '+84925999333']) {
    const requests = [];
    const client = new HdApiClient({
      baseUrl: 'https://api.example.test/api/v1',
      storage: createStorage(),
      fetchImpl: async (url, init) => {
        requests.push({ url, init });
        return envelope({ accessToken: 'access', refreshToken: 'refresh', user: { id: 'user' } });
      },
    });
    await client.login({ phone, password: 'password-123' });
    assert.deepEqual(JSON.parse(requests[0].init.body), {
      phone: '0925999333',
      password: 'password-123',
    });
  }
});

test('rejects invalid phone input before sending a login request', async () => {
  let called = false;
  const client = new HdApiClient({
    baseUrl: 'https://api.example.test/api/v1',
    storage: createStorage(),
    fetchImpl: async () => {
      called = true;
      return envelope({});
    },
  });
  await assert.rejects(
    () => client.login({ phone: '12345', password: 'password-123' }),
    { code: 'LOGIN_INPUT_INVALID' },
  );
  assert.equal(called, false);
});

test('registers a phone-only owner without adding an email field', async () => {
  const requests = [];
  const client = new HdApiClient({
    baseUrl: 'https://api.example.test/api/v1',
    storage: createStorage(),
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return envelope({ accessToken: 'access', refreshToken: 'refresh', user: { id: 'user' } });
    },
  });
  await client.register({
    companyCode: 'hdco2',
    companyName: 'HD Test Company',
    phone: '+84925999333',
    password: 'password-123',
  });
  assert.match(requests[0].url, /\/api\/v1\/auth\/register$/);
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    companyCode: 'HDCO2',
    companyName: 'HD Test Company',
    phone: '0925999333',
    password: 'password-123',
  });
});

test('routes tenant-scoped legacy business history without accepting a caller tenant override', async () => {
  const calls = [];
  const api = createHdConnectStagingApi({
    get: async (path, options) => {
      calls.push({ path, options });
      if (path === '/legacy-business/summary') return { total: 4338, domains: {} };
      return { items: [{ id: 'legacy-1', companyId: 'company-1' }], pagination: { totalItems: 1 } };
    },
  });

  const history = await api.listLegacyBusiness({
    domain: 'FINANCE',
    companyId: 'attacker-company',
    tenantId: 'attacker-tenant',
  });
  const summary = await api.getLegacyBusinessSummary();

  assert.equal(history.items[0].id, 'legacy-1');
  assert.equal(summary.total, 4338);
  assert.equal(calls[0].path, '/legacy-business');
  assert.equal(calls[0].options.query.domain, 'FINANCE');
  assert.equal(Object.hasOwn(calls[0].options.query, 'companyId'), false);
  assert.equal(Object.hasOwn(calls[0].options.query, 'tenantId'), false);
  assert.equal(calls[1].path, '/legacy-business/summary');
});
