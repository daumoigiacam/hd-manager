const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  MAX_CUSTOMER_DEBT_PAYMENT_ORDERS,
  allocateCustomerDebtPayment,
  buildCustomerDebtLedger,
  buildCustomerDebtPaymentCode,
  buildCustomerDebtPaymentFingerprint,
  buildCustomerDebtPaymentIntentId,
  normalizeCustomerDebtPaymentOrderIds
} = require('../functions/customerDebtPayment');

const orderIds = normalizeCustomerDebtPaymentOrderIds(['order-b', 'order-a', 'order-b', '', null]);
assert.deepStrictEqual(orderIds, ['order-b', 'order-a'], 'Order IDs must be unique without changing selection order.');
assert.strictEqual(
  normalizeCustomerDebtPaymentOrderIds(Array.from({ length: 70 }, (_, index) => `order-${index}`)).length,
  MAX_CUSTOMER_DEBT_PAYMENT_ORDERS,
  'A payment intent must cap the number of selected invoices.'
);

const firstFingerprint = buildCustomerDebtPaymentFingerprint({
  companyId: 'company-1',
  customerId: 'customer-1',
  items: [
    { orderId: 'order-b', amount: 200000 },
    { orderId: 'order-a', amount: 100000 }
  ]
});
const reorderedFingerprint = buildCustomerDebtPaymentFingerprint({
  companyId: 'company-1',
  customerId: 'customer-1',
  items: [
    { orderId: 'order-a', amount: 100000 },
    { orderId: 'order-b', amount: 200000 }
  ]
});
assert.strictEqual(firstFingerprint, reorderedFingerprint, 'The same invoices and amounts must reuse one idempotency key.');
assert.match(buildCustomerDebtPaymentCode(firstFingerprint), /^HDP[A-F0-9]{12}$/, 'Transfer content must be recognized by the SePay HD token parser.');
assert.match(buildCustomerDebtPaymentIntentId(firstFingerprint), /^customer_debt_[a-f0-9]{32}$/, 'Intent ID must be deterministic.');

const firstBankFingerprint = buildCustomerDebtPaymentFingerprint({
  companyId: 'company-1',
  customerId: 'customer-1',
  items: [{ orderId: 'order-a', amount: 100000 }],
  receivingProfile: { bankCode: 'BIDV', accountNumber: '123456789', accountName: 'HD MANAGER' }
});
const changedBankFingerprint = buildCustomerDebtPaymentFingerprint({
  companyId: 'company-1',
  customerId: 'customer-1',
  items: [{ orderId: 'order-a', amount: 100000 }],
  receivingProfile: { bankCode: 'VCB', accountNumber: '987654321', accountName: 'HD MANAGER' }
});
assert.notStrictEqual(
  firstBankFingerprint,
  changedBankFingerprint,
  'A changed receiving account must create a new QR instead of reusing the old bank destination.'
);

const exact = allocateCustomerDebtPayment({
  items: [{ orderId: 'a' }, { orderId: 'b' }, { orderId: 'c' }],
  orderOutstandingById: { a: 100000, b: 250000, c: 50000 },
  paidAmount: 400000
});
assert.deepStrictEqual(exact.allocations.map(item => item.appliedAmount), [100000, 250000, 50000]);
assert.strictEqual(exact.remainingOutstanding, 0);
assert.strictEqual(exact.overpaidAmount, 0);

const partial = allocateCustomerDebtPayment({
  items: [{ orderId: 'a' }, { orderId: 'b' }],
  orderOutstandingById: new Map([['a', 100000], ['b', 250000]]),
  paidAmount: 175000
});
assert.deepStrictEqual(partial.allocations.map(item => item.appliedAmount), [100000, 75000]);
assert.strictEqual(partial.remainingOutstanding, 175000);
assert.strictEqual(partial.overpaidAmount, 0);

const overpaid = allocateCustomerDebtPayment({
  items: [{ orderId: 'a' }],
  orderOutstandingById: { a: 100000 },
  paidAmount: 120000
});
assert.strictEqual(overpaid.appliedAmount, 100000);
assert.strictEqual(overpaid.overpaidAmount, 20000);

const resumedPartialPayment = allocateCustomerDebtPayment({
  items: [{ orderId: 'settled' }, { orderId: 'remaining' }],
  orderOutstandingById: { settled: 0, remaining: 250000 },
  paidAmount: 100000
});
assert.deepStrictEqual(
  resumedPartialPayment.allocations.map(item => item.appliedAmount),
  [0, 100000],
  'A follow-up payment must skip invoices already settled by an earlier partial payment.'
);
assert.strictEqual(resumedPartialPayment.remainingOutstanding, 150000);
assert.strictEqual(resumedPartialPayment.overpaidAmount, 0);

const ledger = buildCustomerDebtLedger({
  customer: { id: 'customer-1', openingDebtAmount: 50000, openingDebtDate: '2026-07-01' },
  orders: [
    { id: 'order-a', customerId: 'customer-1', amount: 100000, date: '2026-07-02' },
    { id: 'order-b', customerId: 'customer-1', amount: 200000, date: '2026-07-03' }
  ],
  payments: [
    { id: 'payment-opening', customerId: 'customer-1', amount: 70000, date: '2026-07-02' },
    { id: 'payment-b', customerId: 'customer-1', amount: 80000, matchedOrderId: 'order-b', date: '2026-07-04' }
  ]
});
assert.strictEqual(ledger.orderOutstandingById.get('opening_debt_customer-1'), 0, 'Oldest unmatched payment must settle opening debt first.');
assert.strictEqual(ledger.orderOutstandingById.get('order-a'), 80000, 'Remaining unmatched payment must settle the oldest invoice.');
assert.strictEqual(ledger.orderOutstandingById.get('order-b'), 120000, 'Matched payment must settle its exact invoice first.');
assert.strictEqual(ledger.currentDebt, 200000, 'Ledger total must equal the sum of exact invoice balances.');

const approvalLedger = buildCustomerDebtLedger({
  customer: { id: 'customer-1' },
  orders: [{ id: 'order-c', customerId: 'customer-1', amount: 100000, date: '2026-07-01' }],
  payments: [
    { id: 'pending', customerId: 'customer-1', amount: 100000, date: '2026-07-02', requiresApproval: true, approvalStatus: 'pending_handover' },
    { id: 'approved', customerId: 'customer-1', amount: 40000, date: '2026-07-03', requiresApproval: true, approvalStatus: 'approved' }
  ]
});
assert.strictEqual(approvalLedger.orderOutstandingById.get('order-c'), 60000, 'Only official payments may reduce customer debt.');

const canonicalAmountLedger = buildCustomerDebtLedger({
  customer: { id: 'customer-1' },
  orders: [{
    id: 'order-canonical',
    customerId: 'customer-1',
    amount: 0,
    totalAmount: 999999,
    date: '2026-07-01'
  }],
  payments: []
});
assert.strictEqual(
  canonicalAmountLedger.currentDebt,
  0,
  'Server QR totals must use the same canonical order.amount field as the customer ledger.'
);

const canonicalPaymentLedger = buildCustomerDebtLedger({
  customer: { id: 'customer-1' },
  orders: [{
    id: 'order-payment-canonical',
    customerId: 'customer-1',
    amount: 100000,
    date: '2026-07-01'
  }],
  payments: [{
    id: 'payment-canonical',
    customerId: 'customer-1',
    amount: 0,
    paymentAmount: 100000,
    actualAmount: 100000,
    date: '2026-07-02'
  }]
});
assert.strictEqual(
  canonicalPaymentLedger.currentDebt,
  100000,
  'Server debt allocation must use the same canonical payment.amount field as the customer ledger.'
);

const firestoreRules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
for (const collectionName of [
  'customer_payment_intents',
  'customer_payment_intent_lookup',
  'customer_payment_intent_transactions'
]) {
  assert.ok(
    firestoreRules.includes(`'${collectionName}'`),
    `${collectionName} must be protected as a server-managed collection.`
  );
}
assert.match(
  firestoreRules,
  /allow create: if hasIdentitySession\(\)\s*&& !isServerManagedCustomerPaymentCollection\(collectionId\)/,
  'Clients must not create customer debt payment intents.'
);
assert.match(
  firestoreRules,
  /allow update: if hasIdentitySession\(\)\s*&& !isServerManagedCustomerPaymentCollection\(collectionId\)/,
  'Clients must not update customer debt payment intents.'
);
assert.match(
  firestoreRules,
  /allow delete: if hasIdentitySession\(\)\s*&& !isServerManagedCustomerPaymentCollection\(collectionId\)/,
  'Clients must not delete customer debt payment intents.'
);

console.log('customer debt payment tests: PASS');
