import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from '@babel/parser';

const source = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const tree = parse(source, { sourceType: 'module', plugins: ['jsx'] });
const debt = tree.program.body.find(node => node.type === 'FunctionDeclaration' && node.id?.name === 'DebtManagementView');
assert.ok(debt, 'Canonical DebtManagementView exists');
let submit;
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'VariableDeclarator' && node.id?.name === 'handlePaymentSubmit') submit = node.init;
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'comments', 'extra'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(walk);
    else if (value?.type) walk(value);
  }
}
walk(debt);
assert.ok(submit, 'Extract the actual debt handler, not another payment form');

const older = Object.freeze({ id: 'older-order', customerId: 'customer-a', code: 'HDORDER', outstandingAmount: 50000 });
const target = Object.freeze({ id: 'selected-order', customerId: 'customer-a', code: 'HDC1C0MU', outstandingAmount: 40000 });
const foreign = Object.freeze({ id: 'foreign-order', customerId: 'customer-b', code: 'HDOTHER', outstandingAmount: 90000 });
function fixture(paymentTargetOrderId, method = 'Chuyển khoản') {
  const payments = [], statuses = [];
  let resets = 0;
  const bindings = {
    sourceFresh: true, debtPaymentSubmitRef: { current: false },
    selectedCustomer: Object.freeze({ id: 'customer-a', name: 'Khách kiểm thử',
      ledger: Object.freeze({ creditBalance: 0, orders: Object.freeze([older, target]) }) }),
    orders: [foreign, older, target], paymentTargetOrderId,
    newPayment: Object.freeze({ kind: 'receipt', amount: '10000', date: '2026-11-21', method, clientMutationId: 'stable-debt-payment' }),
    canRecordCustomerPayment: true, canRecordRepayment: true, isDriver: false,
    employee: { id: 'collector', name: 'Kế toán' }, parseLooseMoneyValue: Number,
    getLedgerOrderDisplayCode: order => order.code,
    setDebtPaymentStatus: value => statuses.push(value), setIsSavingDebtPayment() {},
    resetPaymentDraft: () => resets++, window: { alert: message => assert.fail(message) },
    onAddPayment: async payment => { payments.push(payment); return { success: true, queued: false }; },
    onAddRepayment: () => assert.fail('A receipt must not create a repayment expense'),
    getFriendlyFirebaseErrorMessage: error => error.message,
  };
  const run = Function(...Object.keys(bindings), `return (${source.slice(submit.start, submit.end)})`)(...Object.values(bindings));
  return { payments, statuses, get resets() { return resets; }, run: () => run({ preventDefault() {} }) };
}

test('actual Thu nợ HDC1C0MU submission targets the chosen order instead of the older HDORDER', async () => {
  for (const method of ['Chuyển khoản', 'Tiền mặt']) {
    const f = fixture(target.id, method);
    await f.run();
    assert.equal(f.payments.length, 1);
    const payment = f.payments[0];
    assert.equal(payment.customerId, 'customer-a');
    assert.equal(payment.amount, 10000);
    assert.equal(payment.method, method);
    assert.equal(payment.clientMutationId, 'stable-debt-payment');
    assert.equal(payment.allocateOldestFirst, false);
    assert.equal(payment.allocationMode, 'matched_order_first');
    assert.equal(payment.matchedOrderId, target.id);
    assert.equal(payment.sourceOrderId, target.id);
    assert.equal(payment.matchedOrderCode, 'HDC1C0MU');
    assert.equal(payment.referenceCode, 'HDC1C0MU');
    assert.equal(payment.bankContent, 'TT HDC1C0MU');
    assert.equal(payment.note, 'Thu nợ HDC1C0MU');
    assert.equal(payment.sourceType, 'debt_order_payment');
    assert.notEqual(payment.matchedOrderId, older.id);
    assert.equal(f.resets, 1);
  }
});

test('actual general debt receipt retains oldest-first allocation without an order link', async () => {
  const f = fixture('');
  await f.run();
  const [payment] = f.payments;
  assert.equal(f.payments.length, 1);
  assert.equal(payment.customerId, 'customer-a');
  assert.equal(payment.allocateOldestFirst, true);
  assert.equal(payment.allocationMode, 'oldest_first');
  assert.equal(payment.sourceType, 'customer_transfer');
  for (const field of ['matchedOrderId', 'sourceOrderId', 'matchedOrderCode', 'referenceCode', 'bankContent']) assert.equal(payment[field], '');
  assert.equal(payment.note, 'Thu công nợ');
  assert.equal(f.resets, 1);
});

test('an order belonging to another customer cannot supply receipt links or change the selected customer', async () => {
  const f = fixture(foreign.id);
  await f.run();
  assert.equal(f.payments.length, 1);
  const [payment] = f.payments;
  assert.equal(payment.customerId, 'customer-a');
  assert.notEqual(payment.customerId, foreign.customerId);
  assert.equal(payment.matchedOrderId, '');
  assert.equal(payment.sourceOrderId, '');
  assert.equal(payment.matchedOrderCode, '');
  assert.equal(payment.allocateOldestFirst, true);
  assert.equal(payment.allocationMode, 'oldest_first');
});
