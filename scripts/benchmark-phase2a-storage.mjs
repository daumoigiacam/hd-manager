import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { loadPreviewStorage, fullAuditFixture, key } from '../tests/helpers/preview-storage-harness.mjs';

const [sourcePath, label] = process.argv.slice(2);
assert.ok(sourcePath);
assert.match(label, /^[a-z0-9-]+$/);
const output = `test-results/phase2a-storage/${label}`;
await mkdir(output, { recursive: true });
const fixture = await fullAuditFixture();
const initialRaw = JSON.stringify(fixture);
const samples = [];
const actions = [['orderRequests', 'request_perf_0'], ['warehouseDispatches', 'dispatch_perf_0'],
  ['products', 'p_perf_0'], ['customers', 'c_perf_0'], ['payments', 'pay_perf_0'], ['warehouseImports', 'import_storage']];
for (let iteration = 1; iteration <= 5; iteration++) {
  const h = await loadPreviewStorage(sourcePath, initialRaw);
  for (const [collection, id] of actions) {
    for (const action of ['edit', 'duplicate']) {
      h.events.length = 0;
      const start = performance.now();
      await h.api.setDoc(h.api.doc(null, collection, id), { note: 'storage benchmark', quantity: 5 }, { merge: true });
      const wallMs = performance.now() - start;
      samples.push({ iteration, collection, action, wallMs, events: [...h.events] });
      const stored = JSON.parse(h.raw());
      assert.equal(stored[collection][id].quantity, 5);
      assert.equal(Object.keys(stored.orderRequests).length, 4500);
      assert.equal(Object.keys(stored.warehouseDispatches).length, 4300);
    }
  }
  const recovered = await loadPreviewStorage(sourcePath, undefined, h.shared);
  assert.equal((await recovered.api.getDoc(recovered.api.doc(null, 'warehouseImports', 'import_storage'))).data().quantity, 5);
  samples.push({ iteration, action: 'reload', events: [...recovered.events] });
}
const median = values => values.sort((a,b) => a-b)[Math.floor(values.length/2)] ?? null;
const summary = actions.flatMap(([collection]) => ['edit','duplicate'].map(action => {
  const rows = samples.filter(row => row.collection === collection && row.action === action);
  const sum = (row, kind, field = 'ms') => row.events.filter(e => e.kind === kind).reduce((n,e) => n+(e[field] || 0),0);
  return { collection, action, n: rows.length, wallP50: median(rows.map(r => r.wallMs)),
    stringifyP50: median(rows.map(r => sum(r,'stringify'))), parseP50: median(rows.map(r => sum(r,'parse'))),
    stringifyBytesP50: median(rows.map(r => sum(r,'stringify','bytes'))),
    writeP50: median(rows.map(r => sum(r,'setItem'))), bytesP50: median(rows.map(r => sum(r,'setItem','bytes'))),
    writesP50: median(rows.map(r => r.events.filter(e => e.kind === 'setItem').length)) };
}));
await writeFile(`${output}/results.json`, JSON.stringify({ label, sourcePath, key,
  boundary: 'Node mock API call through synchronous durable in-memory Storage adapter; NOT browser write or Firebase/UI latency',
  fixtureCounts: Object.fromEntries(Object.entries(fixture).map(([k,v]) => [k,Object.keys(v).length])), samples, summary }, null, 2));
console.log(JSON.stringify(summary, null, 2));
