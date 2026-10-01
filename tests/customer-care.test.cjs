const assert = require('node:assert/strict');
const { eventRules, calendarEvents, sendCareMessage } = require('../functions/customerCare');
const now = Date.parse('2026-10-02T02:00:00Z');
assert.deepEqual(eventRules('orders', null, { status: 'pending' }), ['first_order']);
assert.deepEqual(eventRules('orders', { status: 'pending' }, { status: 'delivered' }), ['delivered']);
assert.deepEqual(eventRules('orders', { status: 'delivered' }, { status: 'delivered', updatedAt: now }), []);
assert.deepEqual(eventRules('orders', null, { status: 'cancelled', isDelivered: true }), []);
assert.deepEqual(eventRules('payments', null, { amount: 100, isPaymentIntent: true }), []);
assert.deepEqual(eventRules('payments', null, { amount: 100, requiresApproval: true, approvalStatus: 'pending' }), []);
assert.deepEqual(eventRules('payments', { amount: 100, requiresApproval: true, approvalStatus: 'pending' }, { amount: 100, requiresApproval: true, approvalStatus: 'approved' }), ['payment']);
assert.deepEqual(eventRules('payments', { amount: 100 }, { amount: 200 }), []);
const events = calendarEvents({ birthday: '1990-10-02', createdAt: '2026-01-01' }, [{ id: 'old', date: '2026-09-20' }], { inactive: { inactiveDays: 7 }, holiday: { holidayDates: ['2026-10-02'] } }, now);
assert.deepEqual(events, [['birthday', '2026-10-02'], ['holiday', '2026-10-02'], ['inactive', 'old']]);
assert.deepEqual(calendarEvents({ birthday: '1990-10-03' }, [{ id: 'new', date: '2026-10-01' }], {}, now), []);

async function testSend() {
  const records = new Map([
    ['companies/co', { name: 'Company', customerCareRules: { payment: { enabled: true, enabledAt: '2026-10-01', message: 'Thank you', sender: 'assigned_employee' } } }],
    ['customers/cu', { companyId: 'co', empId: 'em' }],
    ['employees/em', { companyId: 'co', name: 'Employee' }],
  ]);
  const snapshot = ref => ({ exists: records.has(ref), data: () => records.get(ref) });
  const db = { doc: path => path, runTransaction: task => task({ get: async ref => snapshot(ref), set: (ref, value) => records.set(ref, value) }) };
  const args = { db, path: name => name, companyId: 'co', customerId: 'cu', ruleId: 'payment', eventKey: 'p1', eventAt: now };
  assert.equal(await sendCareMessage(args), true);
  assert.equal(await sendCareMessage(args), false);
  const message = [...records.values()].find(row => row.conversationId);
  assert.equal(message.senderEmpId, 'em');
  assert.equal(message.customerId, 'cu');
  assert.equal(message.conversationId, 'customer_cu');
  assert.equal(await sendCareMessage({ ...args, eventKey: 'old', eventAt: Date.parse('2026-09-01') }), false);
  records.get('employees/em').companyId = 'other';
  assert.equal(await sendCareMessage({ ...args, eventKey: 'p2' }), false);
  records.get('companies/co').customerCareRules.payment.sender = 'company';
  assert.equal(await sendCareMessage({ ...args, eventKey: 'p2' }), true);
  records.get('customers/cu').companyId = 'other';
  assert.equal(await sendCareMessage({ ...args, eventKey: 'p3' }), false);
  records.get('customers/cu').companyId = 'co';
  records.get('companies/co').customerCareRules.payment.enabled = false;
  assert.equal(await sendCareMessage({ ...args, eventKey: 'p4' }), false);
}
testSend().then(() => console.log('PASS care: six triggers, approval, duplicate, disabled, old events, sender and tenant isolation'));
