import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function compareMasterSummaries(before, after, excludedModules = []) {
  assert.deepEqual(after.fixtureCounts, before.fixtureCounts, 'Paired runs must retain the same fixture counts');
  if (excludedModules.length === 0) {
    assert.deepEqual(after.measurementContracts, before.measurementContracts, 'Paired runs must retain the same measurement contracts');
  }
  assert.deepEqual(after.errors, [], 'AFTER run has page errors');
  assert.deepEqual(after.failures, [], 'AFTER run has failed actions');
  const eligible = row => !excludedModules.includes(row.key.split('/')[1]);
  const oldRows = new Map(before.summary.filter(eligible).map(row => [row.key, row]));
  const newRows = new Map(after.summary.filter(eligible).map(row => [row.key, row]));
  const rows = [...new Set([...oldRows.keys(), ...newRows.keys()])].map(key => {
    const old = oldRows.get(key);
    const next = newRows.get(key);
    const paired = Boolean(old && next && old.n === next.n);
    return {
      key, paired, beforeN: old?.n ?? 0, afterN: next?.n ?? 0,
      beforeP50: old?.p50 ?? null, afterP50: next?.p50 ?? null,
      beforeP95: old?.p95 ?? null, afterP95: next?.p95 ?? null,
      deltaP50Ms: paired ? +(next.p50 - old.p50).toFixed(1) : null,
      percentP50: paired && old.p50 > 0 ? +(100 * (next.p50 / old.p50 - 1)).toFixed(1) : null,
      beforeRenderP50: old?.render?.p50 ?? null, afterRenderP50: next?.render?.p50 ?? null,
    };
  });
  return {
    before: before.phase, after: after.phase,
    contracts: { before: before.measurementContracts, after: after.measurementContracts },
    fixtureCounts: after.fixtureCounts,
    excludedModules,
    beforeFailures: before.failures, beforeErrors: before.errors,
    afterFailures: after.failures, afterErrors: after.errors,
    note: 'Descriptive paired timings only. Positive deltas require investigation; no threshold silently certifies acceptance. Local receipts are not Firebase acknowledgements.',
    rows,
    unpaired: rows.filter(row => !row.paired),
    positiveDeltas: rows.filter(row => row.paired && row.deltaP50Ms > 0).sort((a, b) => b.deltaP50Ms - a.deltaP50Ms),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [beforeDirectory, afterDirectory, ...excludedModules] = process.argv.slice(2);
  assert.ok(beforeDirectory && afterDirectory, 'Provide BEFORE and AFTER directories, then optional excluded module names');
  const read = async directory => JSON.parse(await readFile(path.join(directory, 'summary.json'), 'utf8'));
  const result = compareMasterSummaries(await read(beforeDirectory), await read(afterDirectory), excludedModules);
  await writeFile(path.join(afterDirectory, 'master-comparison.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ before: result.before, after: result.after, pairs: result.rows.filter(row => row.paired).length,
    unpaired: result.unpaired, positiveDeltas: result.positiveDeltas }, null, 2));
}
