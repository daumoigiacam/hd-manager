const assert = require('node:assert/strict');
const test = require('node:test');
const { reconcileInventory } = require('../functions/inventoryReconciliation');
const { buildInventoryBalanceId } = require('../functions/inventoryTransactions');
const identity = { companyId: 'test-tenant', warehouseId: 'warehouse-a', productId: 'product-a', unit: 'con' };
function fixture() {
  return {
    environment: 'staging', companyId: identity.companyId, complete: true,
    sourceEvidence: 'fixture-only', cutoffAt: '2026-10-02T00:00:00Z',
    products: [{ id: identity.productId, companyId: identity.companyId }],
    warehouses: [{ id: identity.warehouseId, companyId: identity.companyId }],
    openings: [{ ...identity, id: 'opening', quantity: 100, sourceEvidence: 'approved-opening-fixture' }],
    ledger: [{ ...identity, id: 'ledger-1', sequence: 1, operationId: 'op-1', documentId: 'dispatch-1', beforeQuantity: 100, afterQuantity: 30, operationType: 'OUTBOUND', quantity: 70, createdAt: '2026-10-01T12:00:00Z' }],
    balances: [{ ...identity, id: buildInventoryBalanceId(identity), availableQuantity: 30 }],
  };
}
test('opening minus outbound reconciles without modifying input', () => {
  const input = fixture(); const before = JSON.stringify(input);
  assert.equal(reconcileInventory(input).status, 'PASS');
  assert.equal(JSON.stringify(input), before);
});
test('reversal restores stock and duplicate reversal evidence blocks', () => {
  const input = fixture();
  input.ledger.push({ ...input.ledger[0], id: 'reversal', sequence: 2, operationId: 'reverse-1', beforeQuantity: 30, afterQuantity: 100, operationType: 'REVERSAL', sourceEvidence: 'fixture-reversal' });
  input.balances[0].availableQuantity = 100;
  assert.equal(reconcileInventory(input).status, 'PASS');
  input.ledger.push({ ...input.ledger[1] });
  assert.equal(reconcileInventory(input).status, 'BLOCKED');
});
test('missing balance gives a create-only plan; reruns are deterministic', () => {
  const input = fixture(); input.balances = [];
  const result = reconcileInventory(input);
  assert.equal(result.correctionPlan.length, 1);
  assert.deepEqual(result, reconcileInventory(input));
});
test('mismatch never generates an automatic correction', () => {
  const input = fixture(); input.balances[0].availableQuantity = 999;
  assert.equal(reconcileInventory(input).rows[0].difference, 969);
  assert.deepEqual(reconcileInventory(input).correctionPlan, []);
});
for (const scenario of ['foreign', 'orphan', 'duplicate', 'negative', 'chain']) {
  test(`rejects ${scenario} evidence`, () => {
    const input = fixture();
    if (scenario === 'foreign') input.ledger[0].companyId = 'other';
    if (scenario === 'orphan') input.ledger[0].productId = 'unknown';
    if (scenario === 'duplicate') input.balances.push({ ...input.balances[0], id: 'other-id' });
    if (scenario === 'negative') input.balances[0].availableQuantity = -1;
    if (scenario === 'chain') input.ledger[0].beforeQuantity = 200;
    assert.equal(reconcileInventory(input).status, 'BLOCKED');
    assert.deepEqual(reconcileInventory(input).correctionPlan, []);
  });
}
test('rejects production and incomplete sources', () => {
  assert.throws(() => reconcileInventory({ ...fixture(), environment: 'production' }));
  assert.throws(() => reconcileInventory({ ...fixture(), complete: false }));
});
test('balance keys preserve identity case, punctuation and delimiter boundaries', () => {
  const rows = ['product-a', 'product_a', 'Product-a', 'product|a'];
  assert.equal(new Set(rows.map(productId => buildInventoryBalanceId({ ...identity, productId }))).size, rows.length);
  assert.notEqual(buildInventoryBalanceId({ ...identity, companyId: 'A' }), buildInventoryBalanceId({ ...identity, companyId: 'a' }));
});
