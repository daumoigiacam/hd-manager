const assert = require('node:assert/strict');
const fs = require('node:fs');
const admin = require('../functions/node_modules/firebase-admin');
const { backfillInventory } = require('../functions/inventoryBackfill');
const { reconcileInventory } = require('../functions/inventoryReconciliation');

async function main() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^(localhost|127\.0\.0\.1):\d+$/.test(host || '')) throw new Error('Local emulator required.');
  const projectId = 'demo-phase4b';
  const app = admin.initializeApp({ projectId });
  const db = app.firestore();
  try {
    const companyId = 'test-tenant';
    const collectionPath = name => `artifacts/phase4b/public/data/${name}`;
    const snapshot = {
      environment: 'staging', companyId, complete: true, sourceEvidence: 'synthetic-emulator-fixture',
      cutoffAt: '2026-10-02T00:00:00Z',
      products: ['p1', 'p2'].map(id => ({ id, companyId })),
      warehouses: [{ id: 'w1', companyId }],
      openings: ['p1', 'p2'].map(id => ({
        id: `opening-${id}`, companyId, warehouseId: 'w1', productId: id,
        unit: 'con', quantity: 100, sourceEvidence: `fixture-${id}`,
      })), ledger: [], balances: [],
    };
    const options = { db, snapshot, projectId, emulatorHost: host, collectionPath, chunkSize: 1 };
    await assert.rejects(backfillInventory({ ...options, onChunk: () => { throw new Error('simulated interruption'); } }));
    const resumed = await backfillInventory(options);
    assert.equal(resumed.created, 1);
    assert.equal(resumed.resumed, 1);
    const retried = await backfillInventory(options);
    assert.equal(retried.created, 0);
    const balances = await db.collection(collectionPath('inventoryBalances')).get();
    const reconciled = reconcileInventory({ ...snapshot, balances: balances.docs.map(doc => doc.data()) });
    assert.equal(reconciled.status, 'PASS');
    assert.equal((await db.collection(collectionPath('inventoryLedger')).get()).size, 0);
    fs.mkdirSync('test-results/phase4b', { recursive: true });
    fs.writeFileSync('test-results/phase4b/backfill-emulator.json', JSON.stringify({
      generatedAt: new Date().toISOString(), environment: 'local-firestore-emulator',
      projectId, status: 'PASS', resumed, retried, reconciliation: reconciled,
      limitations: ['Synthetic fixture only', 'No real staging export or staging authentication tested'],
    }, null, 2));
    console.log('PASS emulator: interrupted backfill, resume, retry, reconciliation, no ledger mutation');
  } finally { await app.delete(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
