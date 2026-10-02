import { performance } from 'node:perf_hooks';
import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { searchCustomers } from '../src/services/searchEngine.js';

const phase = process.argv[2] || 'baseline';
if (!/^[a-z0-9-]+$/.test(phase)) throw new Error('Invalid phase');
const customers = Array.from({ length: 5000 }, (_, index) => ({
  id: `customer_${index}`, name: `Khách hàng Nguyễn ${index}`,
  phone: `090${String(index).padStart(7, '0')}`, address: `Quận ${index % 12} Hồ Chí Minh`,
  branches: [{ name: `Chi nhánh ${index % 8}`, address: 'Thủ Đức' }],
}));
const queries = ['nguyen 123', '0900000123', 'thu duc', 'khong khop'];
for (const query of queries) searchCustomers(customers, query);
const samples = [], hash = createHash('sha256');
for (let iteration = 0; iteration < 20; iteration++) {
  for (const query of queries) {
    const start = performance.now();
    const matches = searchCustomers(customers, query);
    samples.push({ query, ms: performance.now() - start });
    hash.update(JSON.stringify(matches.map(row => row.id)));
  }
}
const sorted = samples.map(row => row.ms).sort((a, b) => a - b);
const stats = Object.fromEntries([50, 90, 95, 99].map(rank => [`p${rank}`, sorted[Math.ceil(sorted.length * rank / 100) - 1]]));
const report = { phase, scope: 'Local Node CPU microbenchmark only; not end-to-end UI, database, or concurrent users', node: process.version, records: customers.length, iterations: 20, n: samples.length, ...stats, max: sorted.at(-1), mean: sorted.reduce((a, b) => a + b, 0) / sorted.length, resultHash: hash.digest('hex'), samples };
await mkdir('test-results/master-audit', { recursive: true });
await writeFile(`test-results/master-audit/search-${phase}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, samples: undefined }));
