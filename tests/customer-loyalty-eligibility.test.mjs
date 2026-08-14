import assert from 'node:assert/strict';
import {
  DEFAULT_LOYALTY_ELIGIBILITY_CONDITIONS,
  evaluateCustomerLoyaltyOrder,
  getEnabledLoyaltyEligibilityConditions,
  normalizeLoyaltyEligibilityConditions
} from '../src/utils/customerLoyaltyEligibility.js';

let passed = 0;
const test = (name, callback) => {
  callback();
  passed += 1;
  console.log(`PASS ${name}`);
};

const allConditions = {
  notOverdue: true,
  withinCreditLimit: true,
  orderedViaHdManager: true,
  delivered: true,
  afterFifteenOrders: true
};

const eligibleOrder = {
  id: 'order-eligible',
  date: '2026-08-14',
  deliveryStatus: 'Đã giao',
  source: 'customer_portal',
  amount: 1_000_000
};

test('empty condition selection preserves earning behavior for active orders', () => {
  const result = evaluateCustomerLoyaltyOrder({
    order: { id: 'order-a', status: 'pending', amount: 100_000 },
    conditions: DEFAULT_LOYALTY_ELIGIBILITY_CONDITIONS,
    today: '2026-08-14'
  });
  assert.equal(result.eligible, true);
  assert.deepEqual(result.failedConditionIds, []);
});

test('an order earns points only when it passes all five selected conditions', () => {
  const result = evaluateCustomerLoyaltyOrder({
    order: eligibleOrder,
    ledgerOrder: { outstandingAmount: 0 },
    customerDebtLimitStatus: { exceeded: false },
    conditions: allConditions,
    completedOrderCountBefore: 15,
    today: '2026-08-14'
  });
  assert.equal(result.eligible, true);
  assert.deepEqual(result.failedConditionIds, []);
});

test('an unpaid order remains eligible through 23:59 of its order day', () => {
  const result = evaluateCustomerLoyaltyOrder({
    order: eligibleOrder,
    ledgerOrder: { outstandingAmount: 1_000_000 },
    conditions: { notOverdue: true },
    today: '2026-08-14'
  });
  assert.equal(result.eligible, true);
});

test('an unpaid order is ineligible after 23:59 of its order day', () => {
  const result = evaluateCustomerLoyaltyOrder({
    order: { ...eligibleOrder, date: '2026-08-13' },
    ledgerOrder: { outstandingAmount: 1_000_000 },
    conditions: { notOverdue: true },
    today: '2026-08-14'
  });
  assert.equal(result.eligible, false);
  assert.deepEqual(result.failedConditionIds, ['notOverdue']);
});

test('a paid historical order is not overdue', () => {
  const result = evaluateCustomerLoyaltyOrder({
    order: { ...eligibleOrder, date: '2026-08-01' },
    ledgerOrder: { outstandingAmount: 0 },
    conditions: { notOverdue: true },
    today: '2026-08-14'
  });
  assert.equal(result.eligible, true);
});

test('an order at or below the company credit limit remains eligible', () => {
  const result = evaluateCustomerLoyaltyOrder({
    order: eligibleOrder,
    customerDebtLimitStatus: { exceeded: false },
    conditions: { withinCreditLimit: true },
    today: '2026-08-14'
  });
  assert.equal(result.eligible, true);
});

test('an order is blocked when the customer exceeds the company credit limit', () => {
  const result = evaluateCustomerLoyaltyOrder({
    order: eligibleOrder,
    customerDebtLimitStatus: { exceeded: true },
    conditions: { withinCreditLimit: true },
    today: '2026-08-14'
  });
  assert.deepEqual(result.failedConditionIds, ['withinCreditLimit']);
});

test('an order placed through the HD Manager customer app is eligible', () => {
  const result = evaluateCustomerLoyaltyOrder({
    order: { ...eligibleOrder, placedViaHdManager: true, source: 'manual' },
    conditions: { orderedViaHdManager: true },
    today: '2026-08-14'
  });
  assert.equal(result.eligible, true);
});

test('an order not placed through the HD Manager customer app is blocked', () => {
  const result = evaluateCustomerLoyaltyOrder({
    order: { ...eligibleOrder, source: 'manual' },
    conditions: { orderedViaHdManager: true },
    today: '2026-08-14'
  });
  assert.deepEqual(result.failedConditionIds, ['orderedViaHdManager']);
});

test('only confirmed delivered orders meet the delivery condition', () => {
  const delivered = evaluateCustomerLoyaltyOrder({
    order: { ...eligibleOrder, isDelivered: true },
    conditions: { delivered: true },
    today: '2026-08-14'
  });
  const pending = evaluateCustomerLoyaltyOrder({
    order: { ...eligibleOrder, deliveryStatus: 'Đang giao' },
    conditions: { delivered: true },
    today: '2026-08-14'
  });
  assert.equal(delivered.eligible, true);
  assert.deepEqual(pending.failedConditionIds, ['delivered']);
});

test('each selected condition blocks points when its requirement is not met', () => {
  const result = evaluateCustomerLoyaltyOrder({
    order: {
      id: 'order-c',
      date: '2026-08-01',
      deliveryStatus: 'Đang giao',
      source: 'manual',
      amount: 1_000_000
    },
    ledgerOrder: { outstandingAmount: 1_000_000 },
    customerDebtLimitStatus: { exceeded: true },
    conditions: allConditions,
    completedOrderCountBefore: 14,
    today: '2026-08-14'
  });
  assert.equal(result.eligible, false);
  assert.deepEqual(result.failedConditionIds, [
    'notOverdue',
    'withinCreditLimit',
    'orderedViaHdManager',
    'delivered',
    'afterFifteenOrders'
  ]);
});

test('the fifteenth completed order is still before the point threshold', () => {
  const result = evaluateCustomerLoyaltyOrder({
    order: eligibleOrder,
    conditions: { afterFifteenOrders: true },
    completedOrderCountBefore: 14,
    today: '2026-08-14'
  });
  assert.equal(result.eligible, false);
  assert.deepEqual(result.failedConditionIds, ['afterFifteenOrders']);
});

test('the sixteenth completed order meets the point threshold', () => {
  const result = evaluateCustomerLoyaltyOrder({
    order: eligibleOrder,
    conditions: { afterFifteenOrders: true },
    completedOrderCountBefore: 15,
    today: '2026-08-14'
  });
  assert.equal(result.eligible, true);
});

test('cancelled orders never earn points even when no optional condition is selected', () => {
  const result = evaluateCustomerLoyaltyOrder({
    order: { id: 'order-d', status: 'Đã hủy', amount: 500_000 },
    conditions: DEFAULT_LOYALTY_ELIGIBILITY_CONDITIONS,
    today: '2026-08-14'
  });
  assert.equal(result.eligible, false);
  assert.deepEqual(result.failedConditionIds, ['orderActive']);
});

test('a cancelled status overrides an older delivered status', () => {
  const result = evaluateCustomerLoyaltyOrder({
    order: { id: 'order-e', deliveryStatus: 'Đã giao', status: 'Đã hủy', amount: 500_000 },
    conditions: DEFAULT_LOYALTY_ELIGIBILITY_CONDITIONS,
    today: '2026-08-14'
  });
  assert.equal(result.eligible, false);
  assert.deepEqual(result.failedConditionIds, ['orderActive']);
});

test('configuration is limited to the five current conditions', () => {
  const normalized = normalizeLoyaltyEligibilityConditions({ delivered: true, fullyPaid: true, customRule: true });
  assert.deepEqual(normalized, {
    notOverdue: false,
    withinCreditLimit: false,
    orderedViaHdManager: false,
    delivered: true,
    afterFifteenOrders: false
  });
  assert.deepEqual(getEnabledLoyaltyEligibilityConditions(normalized).map(item => item.id), ['delivered']);
});

console.log(`Customer loyalty eligibility tests passed: ${passed}`);
