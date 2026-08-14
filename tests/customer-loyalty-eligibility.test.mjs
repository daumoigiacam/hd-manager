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
  delivered: true,
  fullyPaid: true,
  noReturn: true,
  notOverdue: true,
  withinCreditLimit: true
};

test('empty condition selection preserves the current earning behavior for active orders', () => {
  const result = evaluateCustomerLoyaltyOrder({
    order: { id: 'order-a', status: 'pending', amount: 100_000 },
    conditions: DEFAULT_LOYALTY_ELIGIBILITY_CONDITIONS,
    today: '2026-08-14'
  });
  assert.equal(result.eligible, true);
  assert.deepEqual(result.failedConditionIds, []);
});

test('an order earns points only when it passes every selected condition', () => {
  const result = evaluateCustomerLoyaltyOrder({
    order: {
      id: 'order-b',
      deliveryStatus: 'Đã giao',
      paymentStatus: 'Đã thanh toán',
      dueDate: '2026-08-31',
      amount: 1_000_000,
      returnAmount: 0
    },
    ledgerOrder: { outstandingAmount: 0 },
    customerDebtLimitStatus: { exceeded: false },
    conditions: allConditions,
    today: '2026-08-14'
  });
  assert.equal(result.eligible, true);
  assert.deepEqual(result.failedConditionIds, []);
});

test('each selected condition blocks points when its requirement is not met', () => {
  const result = evaluateCustomerLoyaltyOrder({
    order: {
      id: 'order-c',
      deliveryStatus: 'Đang giao',
      paymentStatus: 'Chờ thanh toán',
      dueDate: '2026-08-01',
      amount: 1_000_000,
      returnAmount: 20_000
    },
    ledgerOrder: { outstandingAmount: 1_000_000 },
    customerDebtLimitStatus: { exceeded: true },
    conditions: allConditions,
    today: '2026-08-14'
  });
  assert.equal(result.eligible, false);
  assert.deepEqual(result.failedConditionIds, [
    'delivered',
    'fullyPaid',
    'noReturn',
    'notOverdue',
    'withinCreditLimit'
  ]);
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

test('configuration is limited to the five supported conditions', () => {
  const normalized = normalizeLoyaltyEligibilityConditions({ delivered: true, customRule: true });
  assert.deepEqual(normalized, {
    delivered: true,
    fullyPaid: false,
    noReturn: false,
    notOverdue: false,
    withinCreditLimit: false
  });
  assert.deepEqual(getEnabledLoyaltyEligibilityConditions(normalized).map(item => item.id), ['delivered']);
});

console.log(`Customer loyalty eligibility tests passed: ${passed}`);
