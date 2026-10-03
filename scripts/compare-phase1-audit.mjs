import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) throw new Error('Provide before and after audit directories');
const read = async (directory, file) => JSON.parse(await readFile(path.join(directory, file), 'utf8'));
const before = await read(beforePath, 'summary.json');
const after = await read(afterPath, 'summary.json');
const beforeSamples = await read(beforePath, 'samples.json');
const afterSamples = await read(afterPath, 'samples.json');
const stats = values => {
  const sorted = values.sort((a, b) => a - b);
  return { n: sorted.length, p50: sorted[Math.ceil(sorted.length / 2) - 1] ?? null, max: sorted.at(-1) ?? null };
};
function attribution(samples, key) {
  const rows = samples.filter(row => `${row.viewport}/${row.module}/${row.action}` === key);
  const commits = row => row.events.filter(event => event.type === 'render.react'
    && event.detail.component === 'HDManagerRoot' && event.detail.startTimeMs >= row.startTimeMs
    && event.detail.commitTimeMs <= row.endTimeMs + 1);
  const longTasks = row => row.events.filter(event => event.type === 'thread.long_task'
    && event.detail.startTimeMs < row.endTimeMs
    && event.detail.startTimeMs + event.detail.durationMs > row.startTimeMs);
  return {
    rootCommitCount: stats(rows.map(row => commits(row).length)),
    observedLongTaskCount: stats(rows.map(row => longTasks(row).length)),
    observedLongTaskMs: stats(rows.map(row => longTasks(row).reduce((sum, event) => sum + event.detail.durationMs, 0))),
    databaseDurationMs: stats(rows.map(row => row.databaseDurationMs).filter(Number.isFinite)),
    note: 'Observed overlapping work; not isolated causal accounting or Firebase confirmation.',
  };
}
const comparison = after.summary.map(next => {
  const previous = before.summary.find(row => row.key === next.key);
  return {
    key: next.key, beforeN: previous?.n ?? 0, afterN: next.n,
    beforeP50: previous?.p50 ?? null, afterP50: next.p50,
    deltaP50: previous ? +(next.p50 - previous.p50).toFixed(1) : null,
    percentChange: previous ? +(100 * (next.p50 / previous.p50 - 1)).toFixed(1) : null,
    beforeRenderP50: previous?.render.p50 ?? null, afterRenderP50: next.render.p50,
    beforeAttribution: attribution(beforeSamples, next.key), afterAttribution: attribution(afterSamples, next.key),
  };
});
const oldViews = (await read(beforePath, 'observations.json')).filter(row => row.kind === 'phase1-parity');
const newViews = (await read(afterPath, 'observations.json')).filter(row => row.kind === 'phase1-parity');
const parity = oldViews.map(old => {
  const next = newViews.find(row => row.viewport === old.viewport && row.module === old.module && row.view === old.view);
  return { viewport: old.viewport, module: old.module, view: old.view,
    contentEqual: next?.content === old.content, rowsEqual: JSON.stringify(next?.rows) === JSON.stringify(old.rows) };
});
const result = { before: beforePath, after: afterPath, fixtureCountsEqual: JSON.stringify(before.fixtureCounts) === JSON.stringify(after.fixtureCounts),
  beforeFailures: before.failures, afterFailures: after.failures, beforeErrors: before.errors, afterErrors: after.errors, comparison, parity };
await writeFile(path.join(afterPath, 'phase1-comparison.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
