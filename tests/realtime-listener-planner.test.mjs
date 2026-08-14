import assert from 'node:assert/strict';
import test from 'node:test';

import { planForegroundRealtimeActivation } from '../src/services/realtimeListenerPlanner.js';

test('planner prioritizes the requested workspace and keeps listeners bounded', () => {
  const plan = planForegroundRealtimeActivation({
    requestedNames: ['orders', 'customers', 'payments'],
    availableNames: ['companies', 'orders', 'customers', 'payments'],
    baselineNames: ['companies'],
    limit: 2,
  });

  assert.deepEqual(plan.liveNames, ['orders', 'customers']);
  assert.deepEqual(plan.overflowNames, ['payments']);
  assert.deepEqual(plan.evictedNames, []);
});

test('planner keeps recently used listeners warm and evicts the least recent listener', () => {
  const plan = planForegroundRealtimeActivation({
    requestedNames: ['customers', 'products'],
    activeNames: ['orders', 'payments'],
    recentNames: ['orders', 'payments', 'customers'],
    availableNames: ['orders', 'payments', 'customers', 'products'],
    limit: 3,
  });

  assert.deepEqual(plan.liveNames, ['customers', 'products', 'orders']);
  assert.deepEqual(plan.evictedNames, ['payments']);
  assert.deepEqual(plan.overflowNames, []);
});

test('planner is idempotent for repeated activation and excludes baseline listeners', () => {
  const input = {
    requestedNames: ['companies', 'orders', 'orders', 'customers'],
    activeNames: ['orders', 'customers'],
    recentNames: ['orders', 'customers'],
    availableNames: ['companies', 'orders', 'customers'],
    baselineNames: ['companies'],
    limit: 2,
  };

  const first = planForegroundRealtimeActivation(input);
  const second = planForegroundRealtimeActivation({
    ...input,
    activeNames: first.liveNames,
    recentNames: first.recentNames,
  });

  assert.deepEqual(first.liveNames, ['orders', 'customers']);
  assert.deepEqual(second.liveNames, first.liveNames);
  assert.deepEqual(second.evictedNames, []);
  assert.ok(!second.liveNames.includes('companies'));
});

test('zero listener budget moves requested data to read-only and evicts active listeners', () => {
  const plan = planForegroundRealtimeActivation({
    requestedNames: ['orders', 'customers'],
    activeNames: ['payments'],
    availableNames: ['orders', 'customers', 'payments'],
    limit: 0,
  });

  assert.deepEqual(plan.liveNames, []);
  assert.deepEqual(plan.overflowNames, ['orders', 'customers']);
  assert.deepEqual(plan.evictedNames, ['payments']);
});
