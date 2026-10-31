import test from 'node:test';
import assert from 'node:assert/strict';
import { appFunction, appObject } from './helpers/app-source-function.mjs';
import { selectLatestRecords } from '../src/utils/latestRecords.js';

let parseTimestamp;
parseTimestamp = appFunction('parseEntityTimestampValue', {
  parseVietnameseDateTimeString: appFunction('parseVietnameseDateTimeString'),
  parseEntityTimestampValue: value => parseTimestamp(value),
});
const timestamp = appFunction('getEntityTimestamp', { parseEntityTimestampValue: parseTimestamp });
const callbackOptions = { memoCallback: true, scope: 'MainAppView' };
const callbackSource = appFunction('notificationItems', {}, callbackOptions).toString();
const cache = /const notificationTimestamp = record => \{[\s\S]*?\n\s*};/;
assert.ok(cache.test(callbackSource));
const uncachedSource = callbackSource.replace(cache, 'const notificationTimestamp = getEntityTimestamp;');
class FixedDate extends Date { static now() { return Date.parse('2026-10-31T12:00:00Z'); } }

const run = (cached, role, revision = false) => {
  const counts = new Map();
  const customers = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, name: `Fixture ${i}`, empId: `e${i % 3}` }));
  const rows = prefix => Array.from({ length: 700 }, (_, i) => ({ id: `${prefix}${i}`, customerId: `c${i % 30}`, customerName: `Fixture ${i % 30}`,
    createdAt: i % 19 === 0 ? 'invalid' : i % 11 === 0 ? { seconds: 1790899200 + i * 60 } : `2026-10-${String(1 + (i * 13) % 28).padStart(2, '0')}T12:${String(i % 60).padStart(2, '0')}:00Z`,
    date: '2026-10-31', senderType: i % 7 ? 'customer' : 'employee', amount: 1000 + i, isArchived: i % 31 === 0,
    status: i % 29 ? 'completed' : 'cancelled', type: i % 2 ? 'payos_payment' : 'order_request', paymentId: `p${i}`,
    source: 'customer_portal', sourceType: 'payos', empId: `e${i % 3}`, productId: `p${i % 5}`,
  }));
  const data = { notifications: rows('n'), payments: rows('p'), messages: rows('m'), orderRequests: rows('r'), warehouseDispatches: rows('d'), pendingAdvanceNotifications: rows('a') };
  if (revision) { data.payments = data.payments.slice(10).map((r, i) => i === 1 ? { ...r, createdAt: '2026-10-31T12:30:00Z' } : r); data.notifications = []; }
  const bindings = {
    selectLatestRecords: cached ? selectLatestRecords : (records, limit, getter) => [...records].sort((a, b) => (getter(b) || 0) - (getter(a) || 0)).slice(0, limit),
    ...data, customers, products: [], employees: [], orders: [], employee: { id: 'e1' }, currentUser: { id: 'e1' },
    Date: FixedDate, notificationDateKey: '2026-10-31', getTodayDateKey: () => '2026-10-31',
    getEntityTimestamp: row => { counts.set(row, (counts.get(row) || 0) + 1); return timestamp(row); },
    dedupePaymentNotifications: rows => rows, isEmployeeNotificationVisible: row => role === 'owner' || row.empId === 'e1',
    isOwnerAccount: role === 'owner', isAccounting: role === 'accounting', isSales: role === 'sales', salesNotificationEmployeeIdSet: new Set(['e1']),
    getPaymentReceivingBankLabel: () => 'Fixture bank', parseInputCurrency: Number, formatPaymentNotificationMessage: ({ customerName, amount }) => `${customerName}: ${amount}`,
    buildEmployeeCustomerMessageNotification: row => ({ id: row.id, createdAt: timestamp(row), title: 'Fixture message' }),
    isPayosPaymentRecord: row => row.sourceType === 'payos', getPaymentTimestamp: timestamp, getPaymentDateKey: row => row.date,
    currentAttendanceAlert: { title: 'Attendance', message: 'Fixture' }, attendanceAlerts: [{}],
    formatCurrency: String, resolveNotificationDateKey: row => row.date, canViewOrderRequestNotification: row => role === 'owner' || row.empId === 'e1',
    canViewWarehouseDispatchNotifications: role !== 'sales', canViewWarehouseShortageNotifications: true,
    warehouseDispatchCoverage: { issueLines: [{}], latestTimestamp: 1790899200000 }, formatNumber: String, parseLooseQuantityValue: Number, formatDateLabel: String,
    debtLimitAlerts: [{ customer: customers[0], status: { currentDebt: 1000, limitAmount: 100, overAmount: 900 } }],
    getCustomerDisplayName: row => row.name, customerCareAlerts: [{ customer: customers[1], daysWithoutOrder: 4, hasAnyOrder: false, manager: {} }],
  };
  bindings.persistentNotificationCandidates = appFunction('persistentNotificationCandidates', bindings, callbackOptions)();
  counts.clear();
  const callback = cached ? appFunction('notificationItems', bindings, callbackOptions)
    : new Function(...Object.keys(bindings), `return (${uncachedSource})`)(...Object.values(bindings));
  return { output: callback(), counts };
};

test('actual notification projection equals uncached sorting for roles, invalid dates, edits and visibility boundaries', () => {
  for (const role of ['owner', 'accounting', 'sales']) for (const revision of [false, true]) {
    const cached = run(true, role, revision), old = run(false, role, revision);
    assert.deepEqual(cached.output, old.output);
    assert.ok([...cached.counts.values()].every(count => count === 1), 'each record is evaluated once in this projection');
    const total = counts => [...counts.values()].reduce((sum, value) => sum + value, 0);
    assert.ok(total(old.counts) > total(cached.counts) * 3, 'full scan oracle still exercises repeated comparator reads');
  }
});

test('persistent-history selection only invalidates when its actual immutable source changes', () => {
  const dependencies = appObject('persistentNotificationCandidates').arguments[1].elements.map(node => node.name);
  assert.deepEqual(dependencies, ['notifications']);
});
