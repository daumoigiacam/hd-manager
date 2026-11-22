import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {createLegacyAuditFixture,legacyAuditScope} from './helpers/legacy-audit-fixture.mjs';

const fixture=await createLegacyAuditFixture();after(fixture.dispose);
const inventory=JSON.parse(await fixture.read('test-results/phase2/collection-inventory.json'));
const classification=JSON.parse(await fixture.read('test-results/harness-scope.json'));

test('phase2 generator is legacy-root static tooling, not canonical Firebase acceptance',()=>{
  assert.equal(classification.scope,legacyAuditScope);assert.equal(classification.productionAccess,false);
  assert.match(inventory.scope,/No production reads/);
});

test('legacy-root tooling: collection inventory covers all declared legacy application collections', () => {
  assert.equal(inventory.totals.collections, 48);
  assert.equal(inventory.rows.length, 48);
  assert.equal(new Set(inventory.rows.map((row) => row.collection)).size, 48);
});

test('legacy-root tooling: inventory distinguishes point, bounded and unbounded query shapes', () => {
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

test('legacy-root tooling: inventory never substitutes staging PostgreSQL counts for production Firebase counts', () => {
  for (const row of inventory.rows) {
    assert.equal(row.currentRows, null);
    assert.match(row.currentRowsScope, /PRODUCTION_UNMEASURED/);
    assert.equal(row.payloadBytes, null);
  }
});

