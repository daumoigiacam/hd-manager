const { reconcileInventory } = require('./inventoryReconciliation');

async function backfillInventory({ db, snapshot, projectId, emulatorHost, collectionPath, chunkSize = 50, onChunk }) {
  if (!/^demo-[a-z0-9-]+$/.test(projectId || '')
    || !/^(127\.0\.0\.1|localhost):\d+$/.test(emulatorHost || '')) {
    throw new Error('Backfill execution is restricted to a demo project on a local emulator.');
  }
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > 200) throw new Error('Invalid chunk size.');
  const result = reconcileInventory(snapshot);
  if (result.issues.some(row => row.code !== 'missing_balance')) throw new Error('Unresolved reconciliation evidence.');
  const jobId = `backfill_${result.sourceHash}`;
  let created = 0;
  let resumed = 0;
  for (let offset = 0; offset < result.correctionPlan.length; offset += chunkSize) {
    for (const row of result.correctionPlan.slice(offset, offset + chunkSize)) {
      const balanceRef = db.collection(collectionPath('inventoryBalances')).doc(row.balanceId);
      const receiptRef = db.collection(collectionPath('inventoryBackfillReceipts')).doc(`${jobId}_${row.balanceId}`);
      const outcome = await db.runTransaction(async transaction => {
        const [balance, receipt] = await Promise.all([transaction.get(balanceRef), transaction.get(receiptRef)]);
        if (receipt.exists) {
          if (receipt.data().sourceHash !== result.sourceHash || !balance.exists
            || balance.data().companyId !== row.companyId) throw new Error('Backfill receipt mismatch.');
          return 'resumed';
        }
        // Never overwrite a concurrent transaction or an unreviewed existing balance.
        if (balance.exists) throw new Error(`Balance already exists without this backfill receipt: ${row.balanceId}`);
        transaction.set(balanceRef, {
          id: row.balanceId, companyId: row.companyId, warehouseId: row.warehouseId,
          productId: row.productId, unit: row.unit, availableQuantity: row.expected,
          revision: 0, backfillSourceHash: result.sourceHash, backfillCutoffAt: result.cutoffAt,
        });
        transaction.set(receiptRef, {
          companyId: row.companyId, sourceHash: result.sourceHash, balanceId: row.balanceId,
          openingQuantity: row.expected, cutoffAt: result.cutoffAt,
        });
        return 'created';
      });
      if (outcome === 'created') created += 1;
      else resumed += 1;
    }
    await onChunk?.({ jobId, processed: Math.min(offset + chunkSize, result.correctionPlan.length) });
  }
  return { jobId, sourceHash: result.sourceHash, created, resumed, movementsCreated: 0 };
}

module.exports = { backfillInventory };
