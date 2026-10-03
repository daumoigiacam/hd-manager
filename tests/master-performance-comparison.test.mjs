import assert from 'node:assert/strict';
import test from 'node:test';
import { compareMasterSummaries } from '../scripts/compare-master-performance.mjs';

const summary = (phase, rows = []) => ({ phase, fixtureCounts: { products: 600, dispatches: 4300 },
  measurementContracts: { result: 'exact ordered results plus two frames' }, errors: [], failures: [], summary: rows });
const row = (key, p50, n = 5) => ({ key, n, p50, p95: p50 + 20, render: { p50: 4 } });

test('comparison retains slow paths, positive deltas, missing samples and failed BEFORE evidence', () => {
  const before = summary('before', [row('cpu-low-6x/products/save', 3000), row('cpu-low-6x/dispatch/open', 1000),
    row('cpu-high-1x/customers/create', 30, 1)]);
  before.failures = [{ module: 'customers', error: 'Covered by navigation' }];
  const after = summary('after', [row('cpu-low-6x/products/save', 700), row('cpu-low-6x/dispatch/open', 1100),
    row('cpu-high-1x/customers/create', 20, 5), row('cpu-high-1x/settings/open', 10)]);
  const result = compareMasterSummaries(before, after);
  assert.equal(result.rows.length, 4);
  assert.deepEqual(result.beforeFailures, before.failures);
  assert.equal(result.positiveDeltas.length, 1);
  assert.equal(result.positiveDeltas[0].deltaP50Ms, 100);
  assert.equal(result.unpaired.length, 2);
  assert.equal(result.unpaired[0].deltaP50Ms, null);
  assert.equal(result.rows[0].percentP50, -76.7);
});

test('fixture shrinkage and AFTER failures cannot produce a valid comparison', () => {
  const before = summary('before');
  const after = summary('after');
  after.fixtureCounts.products = 50;
  assert.throws(() => compareMasterSummaries(before, after), /same fixture counts/);
  after.fixtureCounts.products = 600;
  after.measurementContracts.result = 'input value only';
  assert.throws(() => compareMasterSummaries(before, after), /same measurement contracts/);
  after.measurementContracts = before.measurementContracts;
  after.errors.push('error');
  assert.throws(() => compareMasterSummaries(before, after), /page errors/);
  after.errors = [];
  after.failures.push('failed action');
  assert.throws(() => compareMasterSummaries(before, after), /failed actions/);
});

test('explicitly excluded modules remain recorded without mixing incompatible product pairs', () => {
  const before = summary('before', [row('cpu-low-6x/products/save', 3000), row('cpu-low-6x/dispatch/open', 1000)]);
  const after = summary('after', [row('cpu-low-6x/products/save', 700), row('cpu-low-6x/dispatch/open', 500)]);
  const result = compareMasterSummaries(before, after, ['products']);
  assert.deepEqual(result.excludedModules, ['products']);
  assert.deepEqual(result.rows.map(item => item.key), ['cpu-low-6x/dispatch/open']);
});
