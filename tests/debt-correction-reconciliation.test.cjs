const test = require('node:test');
const assert = require('node:assert/strict');
const { reconcileCorrectedCustomerDebt: reconcile } = require('../functions/debtCorrectionReconciliation');
const scope = { companyId: 'tenant', customerId: 'customer' };
const fixture = () => ({ ...scope, complete: true,
  orders: ['A', 'B', 'C'].map(id => ({ ...scope, id, amount: id === 'A' ? 400 : 300 })),
  payments: [{ ...scope, id: 'P', amount: 1000, allocations: [{ orderId: 'A', amount: 400 }, { orderId: 'B', amount: 300 }, { orderId: 'C', amount: 300 }] }],
  states: [], corrections: [], credits: [], refunds: [] });
function returned(refund = 0) {
  const data = fixture();
  data.credits.push({ ...scope, id: 'credit', orderId: 'A', amount: 200, operationKey: 'return', actor: 'owner', createdAt: 1 });
  data.corrections.push({ ...scope, id: 'event', paymentId: 'P', orderId: 'A', type: 'PAYMENT_REVERSAL', revision: 1,
    actor: 'owner', createdAt: 1, operationKey: 'return', releaseAmount: 200, refundAmount: refund,
    unallocatedDelta: 200 - refund, refundReference: refund ? 'bank-ref' : '' });
  data.states.push({ ...scope, id: 'state', paymentId: 'P', revision: 1, unallocated: 200 - refund, refunded: refund,
    allocations: [{ orderId: 'A', amount: 200 }, { orderId: 'B', amount: 300 }, { orderId: 'C', amount: 300 }] });
  if (refund) data.refunds.push({ ...scope, id: 'refund', correctionId: 'event', paymentId: 'P', orderId: 'A',
    type: 'REFUND_CONFIRMED', amount: refund, reference: 'bank-ref', actor: 'owner', createdAt: 1 });
  return data;
}
test('normal allocation is reconciled without modifying original records', () => {
  const data = fixture(); const before = structuredClone(data);
  const result = reconcile(data);
  assert.equal(result.status, 'PASS');
  assert.equal(result.balances.currentDebt, 0);
  assert.equal(result.balances.received, 1000);
  assert.deepEqual(data, before);
});
test('released A allocation becomes credit without reallocating B/C', () => {
  const result = reconcile(returned());
  assert.equal(result.status, 'PASS');
  assert.equal(result.balances.unallocated, 200);
  assert.equal(result.balances.currentDebt, 0);
  assert.deepEqual(result.balances.orders.slice(1).map(row => row.allocated), [300, 300]);
});
test('confirmed refund reduces net received, not original receipt amount', () => {
  const result = reconcile(returned(100));
  assert.equal(result.status, 'PASS');
  assert.equal(result.balances.netReceived, 900);
  assert.equal(result.balances.received, 1000);
  assert.equal(result.balances.unallocated, 100);
});
const corruptions = [
  ['partial page', data => { data.complete = false; }],
  ['foreign scope', data => { data.orders[0].companyId = 'foreign'; }],
  ['duplicate credit', data => { data.credits.push({ ...data.credits[0], id: 'second' }); }],
  ['changed B allocation', data => { data.states[0].allocations[1].amount = 301; }],
  ['missing refund', data => { data.refunds = []; }],
  ['duplicate refund', data => { data.refunds.push({ ...data.refunds[0], id: 'second' }); }],
  ['missing correction', data => { data.corrections = []; }],
  ['over-credit', data => { data.credits[0].amount = 500; }],
  ['unknown allocation', data => { data.payments[0].allocations[0].orderId = 'unknown'; }],
  ['unsafe amount', data => { data.payments[0].amount = Number.MAX_SAFE_INTEGER + 1; }]
];
for (const [name, corrupt] of corruptions) test(`reject ${name} without publishing a balance`, () => {
  const data = returned(100); corrupt(data);
  const result = reconcile(data);
  assert.equal(result.status, 'NOT PASS');
  assert.equal(result.balances, null);
  assert.ok(result.issues.length);
});
