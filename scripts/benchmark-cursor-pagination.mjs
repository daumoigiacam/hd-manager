import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const outputPath = 'test-results/phase4/cursor-pagination-benchmark.json';
const sizes = [100, 1_000, 10_000, 50_000, 100_000];
const pageSize = 50;

const measure = (callback, samples = 12) => {
  const durations = [];
  let value;
  for (let index = 0; index < samples; index += 1) {
    const startedAt = performance.now();
    value = callback();
    durations.push(performance.now() - startedAt);
  }
  durations.sort((left, right) => left - right);
  return {
    p50Ms: Number(durations[Math.floor(durations.length * 0.5)].toFixed(4)),
    p95Ms: Number(durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))].toFixed(4)),
    value,
  };
};

const rows = sizes.map((records) => {
  global.gc?.();
  const beforeHeap = process.memoryUsage().heapUsed;
  const dataset = Array.from({ length: records }, (_, index) => ({
    id: `record-${`${index}`.padStart(8, '0')}`,
    companyId: 'company-benchmark',
    customerId: `customer-${index % 2_000}`,
    status: index % 3 === 0 ? 'open' : 'closed',
    total: index * 1_000,
    note: `Synthetic Phase 4 record ${index}`,
  }));
  const fullPayload = measure(() => Buffer.byteLength(JSON.stringify(dataset)), 3);
  const firstPage = measure(() => dataset.slice(0, pageSize));
  const nextPage = measure(() => dataset.slice(pageSize, pageSize * 2));
  const firstPagePayloadBytes = Buffer.byteLength(JSON.stringify(firstPage.value));
  const nextPagePayloadBytes = Buffer.byteLength(JSON.stringify(nextPage.value));
  const idIndex = new Map(dataset.map(item => [item.id, item]));
  const statusIndex = {
    open: dataset.filter(item => item.status === 'open'),
    closed: dataset.filter(item => item.status === 'closed'),
  };
  const exactSearch = measure(() => idIndex.get(`record-${`${records - 1}`.padStart(8, '0')}`));
  const indexedFilterPage = measure(() => statusIndex.open.slice(0, pageSize));
  const afterHeap = process.memoryUsage().heapUsed;
  return {
    records,
    pageSize,
    before: {
      recordsLoaded: records,
      payloadBytes: fullPayload.value,
      serializeP95Ms: fullPayload.p95Ms,
    },
    after: {
      firstPageRecords: firstPage.value.length,
      firstPagePayloadBytes,
      firstPageP95Ms: firstPage.p95Ms,
      nextPageRecords: nextPage.value.length,
      nextPagePayloadBytes,
      nextPageP95Ms: nextPage.p95Ms,
      exactSearchP95Ms: exactSearch.p95Ms,
      indexedFilterPageP95Ms: indexedFilterPage.p95Ms,
    },
    fixtureHeapDeltaBytes: Math.max(0, afterHeap - beforeHeap),
    payloadReductionPercent: Number((100 - (firstPagePayloadBytes / fullPayload.value * 100)).toFixed(4)),
  };
});

const result = {
  generatedAt: new Date().toISOString(),
  scope: 'Synthetic in-process comparison only. This is not Firestore network, browser render, staging, or production load evidence.',
  method: 'Compare serializing a full tenant collection with returning a fixed 50-record cursor page. Index lookup/filter timings use in-memory Maps prepared before measurement.',
  rows,
};

await mkdir('test-results/phase4', { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outputPath}`);
rows.forEach(row => console.log(JSON.stringify({
  records: row.records,
  fullPayloadBytes: row.before.payloadBytes,
  firstPagePayloadBytes: row.after.firstPagePayloadBytes,
  payloadReductionPercent: row.payloadReductionPercent,
  firstPageP95Ms: row.after.firstPageP95Ms,
  nextPageP95Ms: row.after.nextPageP95Ms,
})));
