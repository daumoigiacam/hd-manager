import { writeFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createSaveQueueHarness } from '../tests/helpers/save-queue-harness.mjs';

const label = process.argv[2];
if (!/^[a-z-]+$/.test(label || '')) throw new Error('Pass a report label');
const cases = [];
for (const size of [0, 100, 499]) {
  const rows = Array.from({ length: size }, (_, i) => ({
    key: `orderRequests:${i}`, companyId: 'fixture', collectionName: 'orderRequests', documentId: String(i),
    payload: { name: 'Synthetic fixture', items: Array.from({ length: 20 }, (_, n) => ({ productId: `p${n}`, price: 60000, quantity: 2 })) },
    options: {},
  }));
  const times = [];
  let stats;
  for (let i = 0; i < 6; i++) {
    const harness = createSaveQueueHarness(rows);
    const start = performance.now();
    harness.enqueue({ collectionName: 'products', documentId: 'new', payload: { name: 'Fixture', price: 60 }, durable: true });
    const elapsed = performance.now() - start;
    if (i > 0) times.push(elapsed);
    stats = harness.stats;
  }
  times.sort((a, b) => a - b);
  cases.push({ pendingBeforeSave: size, medianMs: +times[2].toFixed(3), maxMs: +times[4].toFixed(3), ...stats });
}
const report = { label, node: process.version, scope: 'Actual save queue code with memory storage; CPU/serialization only, not browser storage latency or server confirmation.', cases };
await mkdir('test-results', { recursive: true });
await writeFile(`test-results/save-queue-${label}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
