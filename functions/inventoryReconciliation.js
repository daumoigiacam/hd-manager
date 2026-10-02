const crypto = require('node:crypto');
const { buildInventoryBalanceId } = require('./inventoryTransactions');

const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const quantity = value => typeof value === 'number' && Number.isFinite(value)
  && Math.abs(value) <= Number.MAX_SAFE_INTEGER / 1e6;
const round = value => Math.round(value * 1e6) / 1e6;
const key = row => JSON.stringify([row.companyId, row.warehouseId, row.productId, row.unit]);

// Input is an explicitly mapped, complete staging export, never a guessed legacy projection.
function reconcileInventory(input) {
  const issues = [];
  const issue = (code, id = '') => issues.push({ code, id });
  if (!input || input.environment !== 'staging' || !input.companyId
    || input.complete !== true || !input.sourceEvidence
    || !Number.isFinite(Date.parse(input.cutoffAt))) {
    throw new Error('A complete, evidenced staging snapshot with a cutoff is required.');
  }
  for (const name of ['openings', 'ledger', 'balances', 'products', 'warehouses']) {
    if (!Array.isArray(input[name])) throw new Error(`Missing snapshot collection: ${name}`);
  }
  const products = new Set(input.products.map(row => row.id));
  const warehouses = new Set(input.warehouses.map(row => row.id));
  for (const row of [...input.products, ...input.warehouses]) {
    if (row.companyId !== input.companyId) issue('foreign_catalog_record', row.id);
  }
  const valid = row => {
    if (row.companyId !== input.companyId) { issue('foreign_tenant', row.id); return false; }
    if (!row.warehouseId || !row.productId || !row.unit || !row.id) {
      issue('missing_mapping', row.id); return false;
    }
    if (!products.has(row.productId) || !warehouses.has(row.warehouseId)) {
      issue('orphan_record', row.id); return false;
    }
    return true;
  };
  const expected = new Map();
  for (const row of input.openings) {
    if (!valid(row)) continue;
    if (!row.sourceEvidence || !quantity(row.quantity) || row.quantity < 0) {
      issue('opening_evidence_invalid', row.id); continue;
    }
    if (expected.has(key(row))) { issue('duplicate_opening', row.id); continue; }
    expected.set(key(row), { ...row, expected: row.quantity, sequence: 0 });
  }
  const ledgerIds = new Set();
  for (const row of [...input.ledger].sort((a, b) => a.sequence - b.sequence)) {
    if (!valid(row)) continue;
    if (ledgerIds.has(row.id)) { issue('duplicate_ledger', row.id); continue; }
    ledgerIds.add(row.id);
    const current = expected.get(key(row));
    if (!current) { issue('missing_opening', row.id); continue; }
    const timestamp = Date.parse(row.createdAt);
    const expectedDelta = row.operationType === 'INBOUND' ? row.quantity
      : row.operationType === 'OUTBOUND' ? -row.quantity : null;
    if (!Number.isFinite(timestamp) || timestamp > Date.parse(input.cutoffAt)
      || !quantity(row.quantity) || row.quantity < 0
      || (expectedDelta === null && !['COUNT', 'REVERSAL', 'AMENDMENT'].includes(row.operationType))
      || (expectedDelta !== null && round(row.afterQuantity - row.beforeQuantity) !== round(expectedDelta))
      || (expectedDelta === null && !row.sourceEvidence)) {
      issue('invalid_movement_evidence', row.id); continue;
    }
    if (!Number.isSafeInteger(row.sequence) || row.sequence !== current.sequence + 1
      || !quantity(row.beforeQuantity) || !quantity(row.afterQuantity)
      || round(current.expected) !== round(row.beforeQuantity)
      || !row.operationId || !row.documentId) {
      issue('broken_ledger_chain', row.id); continue;
    }
    if (row.afterQuantity < 0) issue('negative_ledger', row.id);
    current.expected = row.afterQuantity;
    current.sequence = row.sequence;
  }
  const actual = new Map();
  for (const row of input.balances) {
    if (!valid(row)) continue;
    if (actual.has(key(row))) { issue('duplicate_balance', row.id); continue; }
    if (!quantity(row.availableQuantity)) { issue('invalid_balance', row.id); continue; }
    if (row.availableQuantity < 0) issue('negative_balance', row.id);
    actual.set(key(row), row);
    if (row.id !== buildInventoryBalanceId(row)) issue('balance_key_migration_required', row.id);
    if (!expected.has(key(row))) issue('unexplained_balance', row.id);
  }
  const rows = [...expected].map(([identity, row]) => {
    const balance = actual.get(identity);
    const difference = balance ? round(balance.availableQuantity - row.expected) : null;
    if (!balance) issue('missing_balance', row.id);
    else if (difference !== 0) issue('balance_mismatch', balance.id);
    return {
      companyId: row.companyId, warehouseId: row.warehouseId,
      productId: row.productId, unit: row.unit,
      balanceId: buildInventoryBalanceId(row), expected: round(row.expected),
      actual: balance?.availableQuantity ?? null, difference,
    };
  });
  const unsafe = issues.some(row => row.code !== 'missing_balance');
  return {
    status: issues.length ? 'BLOCKED' : 'PASS', sourceHash: digest(input),
    companyId: input.companyId, cutoffAt: input.cutoffAt,
    totalProducts: products.size, totalWarehouses: warehouses.size,
    totalInventoryRecords: input.ledger.length + input.openings.length + input.balances.length,
    rows, issues,
    // Existing mismatches always need a separate reviewed correction, never an overwrite.
    correctionPlan: unsafe ? [] : rows.filter(row => row.actual === null).map(row => ({
      action: 'CREATE_MISSING_BALANCE', ...row,
    })),
  };
}

module.exports = { reconcileInventory };
