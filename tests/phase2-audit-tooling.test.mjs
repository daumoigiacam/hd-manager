import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const inventory = JSON.parse(await readFile('test-results/phase2/collection-inventory.json', 'utf8'));

test('collection inventory covers all declared application collections', () => {
  assert.equal(inventory.totals.collections, 48);
  assert.equal(inventory.rows.length, 48);
  assert.equal(new Set(inventory.rows.map((row) => row.collection)).size, 48);
});

test('inventory distinguishes point, bounded and unbounded query shapes', () => {
  const byName = Object.fromEntries(inventory.rows.map((row) => [row.collection, row]));
  assert.equal(byName.companies.fullLoad, false);
  assert.equal(byName.companies.pagination, 'not applicable');
  assert.equal(byName.messages.fullLoad, false);
  assert.match(byName.messages.pagination, /no cursor/i);
  for (const name of ['products', 'customers', 'orders', 'payments']) {
    assert.equal(byName[name].fullLoad, true, name);
    assert.equal(byName[name].pagination, 'none', name);
    assert.match(byName[name].remediation, /paged read model/i, name);
  }
});

test('inventory never substitutes staging PostgreSQL counts for production Firebase counts', () => {
  for (const row of inventory.rows) {
    assert.equal(row.currentRows, null);
    assert.match(row.currentRowsScope, /PRODUCTION_UNMEASURED/);
    assert.equal(row.payloadBytes, null);
  }
});

