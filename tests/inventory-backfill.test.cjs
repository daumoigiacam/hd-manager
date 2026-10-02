const assert = require('node:assert/strict');
const test = require('node:test');
const { backfillInventory } = require('../functions/inventoryBackfill');

function setup() {
  const records = new Map();
  const db = {
    collection: name => ({ doc: id => ({ path: `${name}/${id}` }) }),
    runTransaction: async callback => {
      const writes = [];
      const result = await callback({
        get: async ref => ({ exists: records.has(ref.path), data: () => records.get(ref.path) }),
        set: (ref, data) => writes.push([ref.path, data]),
      });
      writes.forEach(([key, value]) => records.set(key, value));
      return result;
    },
  };
  const scope = { companyId: 'tenant', warehouseId: 'w1', unit: 'con' };
  const options = {
    db, projectId: 'demo-phase4b', emulatorHost: '127.0.0.1:8180', collectionPath: name => name,
    snapshot: {
      environment: 'staging', companyId: 'tenant', complete: true, sourceEvidence: 'fixture',
      cutoffAt: '2026-10-02T00:00:00Z', warehouses: [{ id: 'w1', companyId: 'tenant' }],
      products: ['p1', 'p2'].map(id => ({ id, companyId: 'tenant' })),
      openings: ['p1', 'p2'].map(id => ({ ...scope, id, productId: id, quantity: 100, sourceEvidence: 'fixture-count' })),
      ledger: [], balances: [],
    },
  };
  return { records, options };
}
test('backfill resumes after interruption and repeats without movements or duplicate balances', async () => {
  const { records, options } = setup();
  await assert.rejects(backfillInventory({ ...options, chunkSize: 1, onChunk: () => { throw new Error('interrupt'); } }));
  assert.equal(records.size, 2);
  const resumed = await backfillInventory(options);
  assert.equal(resumed.created, 1);
  assert.equal(resumed.resumed, 1);
  assert.equal(records.size, 4);
  const repeated = await backfillInventory(options);
  assert.equal(repeated.created, 0);
  assert.equal(repeated.resumed, 2);
  assert.equal(repeated.movementsCreated, 0);
});
test('backfill refuses production project or nonlocal endpoint', async () => {
  const { options } = setup();
  await assert.rejects(backfillInventory({ ...options, projectId: 'production' }));
  await assert.rejects(backfillInventory({ ...options, emulatorHost: 'example.com:8180' }));
});
test('backfill never overwrites an existing balance without a matching receipt', async () => {
  const { options, records } = setup();
  await backfillInventory(options);
  for (const id of [...records.keys()]) if (id.startsWith('inventoryBackfillReceipts/')) records.delete(id);
  await assert.rejects(backfillInventory(options), /already exists/);
  assert.equal([...records.values()].every(row => row.availableQuantity === 100), true);
});
