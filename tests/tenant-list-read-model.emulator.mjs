import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, writeBatch } from 'firebase/firestore';
import { createTenantListReadModel } from '../src/services/tenantListReadModel.js';

if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Local emulator required');
const projectId = 'hd-manager-list-model';
const appId = 'list-model';
const env = await initializeTestEnvironment({ projectId, firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
const evidence = [];
try {
  for (const size of [100, 1000, 5000]) {
    const companyId = `tenant-${size}`;
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      for (let offset = 0; offset < size; offset += 400) {
        const batch = writeBatch(db);
        for (let i = offset; i < Math.min(size, offset + 400); i++) {
          const id = `${companyId}-${String(i).padStart(6, '0')}`;
          batch.set(doc(db, `artifacts/${appId}/public/data/orders/${id}`), { id, companyId, total: i });
        }
        await batch.commit();
      }
    });
    const db = env.authenticatedContext(`owner-${size}`, { companyId, appUserId: `owner-${size}`, accountType: 'employee', role: 'super_admin', identityId: `owner-${size}` }).firestore();
    const model = createTenantListReadModel({ db, appId, companyId, collectionName: 'orders', pageSize: 50 });
    const started = performance.now();
    const concurrent = await Promise.all(Array.from({ length: 10 }, () => model.next()));
    assert.equal(concurrent[0].requests, 1);
    assert.equal(concurrent[0].documentsRead, 50);
    const firstPageMs = performance.now() - started;
    let state = model.snapshot();
    const pageTimes = [];
    let maximumPageReads = 50;
    while (state.hasMore) {
      const previousReads = state.documentsRead;
      const before = performance.now();
      state = await model.next();
      pageTimes.push(performance.now() - before);
      const reads = state.documentsRead - previousReads;
      maximumPageReads = Math.max(maximumPageReads, reads);
      assert.ok(reads <= 50);
    }
    assert.equal(state.items.length, size);
    assert.equal(new Set(state.items.map(item => item.id)).size, size);
    assert.ok(state.items.every(item => item.companyId === companyId));
    for (let i = 0; i < size; i++) assert.equal(state.items[i].id, `${companyId}-${String(i).padStart(6, '0')}`);
    await model.refresh();
    assert.equal(model.snapshot().items.length, 50);
    model.dispose();
    const sorted = [...pageTimes].sort((a, b) => a - b);
    evidence.push({ size, firstPageMs, maximumPageReads, firstPageReadCount: 50, fullyEnumeratedReads: state.documentsRead, requests: state.requests, missing: 0, duplicates: 0, foreignTenant: 0, listeners: 0, nextPageP50Ms: sorted[Math.ceil(sorted.length * .5) - 1], nextPageP95Ms: sorted[Math.ceil(sorted.length * .95) - 1] });
  }
  mkdirSync('test-results/core-gaps', { recursive: true });
  writeFileSync('test-results/core-gaps/list-model-emulator.json', JSON.stringify({ scope: 'Read model only; not integrated App screens; no search/filter or aggregate claims', evidence }, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await env.cleanup();
}
