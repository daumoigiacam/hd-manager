import test from 'node:test';
import assert from 'node:assert/strict';
import { canStartBusinessSubscriptions, startBaselineSubscriptions } from '../src/services/startupSubscriptionPlan.js';

test('identity listeners start now, not behind the first foreground effect/timer', () => {
  const order = [], scheduled = [];
  const timers = startBaselineSubscriptions({
    bindings: [['companies'], ['employees'], ['notifications']], coreNames: ['companies', 'employees'],
    start: ([name]) => order.push(name), schedule: callback => { scheduled.push(callback); return 1; }, delayFor: () => 0,
  });
  assert.deepEqual(order, ['companies', 'employees']);
  assert.deepEqual(timers, [1]);
  assert.equal(canStartBusinessSubscriptions('employee', false), false);
  assert.equal(canStartBusinessSubscriptions('company', false), false);
  // Releasing core readiness admits business data without dropping any target.
  if (canStartBusinessSubscriptions('employee', true)) order.push('orders');
  scheduled.forEach(callback => callback());
  assert.deepEqual(order, ['companies', 'employees', 'orders', 'notifications']);
});

test('customer bootstrap never gains an employee-directory prerequisite', () => {
  assert.equal(canStartBusinessSubscriptions('customer', false), true);
  const order = [];
  startBaselineSubscriptions({ bindings: [['notifications'], ['messages']], coreNames: ['companies', 'employees'],
    start: ([name]) => order.push(name), schedule: callback => { callback(); return 1; }, delayFor: () => 0 });
  assert.deepEqual(order, ['notifications', 'messages']);
});
