import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createReadArbiter } from '../src/services/readArbiter.js';

async function sample(deduplicate) {
  const arbiter = createReadArbiter();
  let requests = 0;
  const start = performance.now();
  const read = async () => {
    requests++;
    await new Promise(resolve => setTimeout(resolve, 1));
    return Array.from({ length: 50 }, (_, id) => ({ id }));
  };
  await Promise.all(Array.from({ length: 100 }, () => deduplicate ? arbiter.run('orders', read) : read()));
  arbiter.dispose();
  return { durationMs: performance.now() - start, requests, fixtureRecordsReturned: requests * 50 };
}
const before = [];
const after = [];
for (let i = 0; i < 50; i++) {
  before.push(await sample(false));
  after.push(await sample(true));
}
function summarize(rows) {
  const durations = rows.map(row => row.durationMs).sort((a, b) => a - b);
  return {
    samples: rows.length,
    p50Ms: durations[Math.ceil(rows.length * .5) - 1],
    p95Ms: durations[Math.ceil(rows.length * .95) - 1],
    requestsPerSample: rows[0].requests,
    fixtureRecordsPerSample: rows[0].fixtureRecordsReturned,
    firestoreReads: 'UNMEASURED',
    listeners: 0
  };
}
const result = {
  scope: 'Synthetic concurrent same-key collection reads; not UI or Firestore latency',
  before: summarize(before), after: summarize(after), beforeSamples: before, afterSamples: after
};
mkdirSync('test-results/core-gaps', { recursive: true });
writeFileSync('test-results/core-gaps/read-arbiter-benchmark.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ before: result.before, after: result.after }, null, 2));
