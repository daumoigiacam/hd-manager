import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
const { values } = parseArgs({ options: { input: { type: 'string' }, build: { type: 'string' }, output: { type: 'string' } } });
if (!values.input || !values.build || !values.output) throw Error('Required: --input profile.json --build public-directory --output summary.json');
const profile = JSON.parse(await readFile(values.input, 'utf8'));
const allocations = [];
function visit(node, stack) {
  const chain = [...stack, node.callFrame];
  if (node.selfSize) allocations.push({ estimatedBytes: node.selfSize, frame: node.callFrame, stack: chain.slice(-7) });
  for (const child of node.children || []) visit(child, chain);
}
visit(profile.head, []);
allocations.sort((a, b) => b.estimatedBytes - a.estimatedBytes);
const maps = new Map();
const artifacts = [];
const sha = value => createHash('sha256').update(value).digest('hex');
async function mapFrame(frame) {
  if (!frame?.url?.includes('/assets/')) return frame;
  const name = path.basename(new URL(frame.url).pathname);
  if (!maps.has(name)) {
    try {
      const [asset, sourceMap] = await Promise.all([
        readFile(path.join(values.build, 'assets', name)), readFile(path.join(values.build, 'assets', `${name}.map`)),
      ]);
      maps.set(name, new TraceMap(JSON.parse(sourceMap.toString('utf8'))));
      artifacts.push({ name, assetSha256: sha(asset), mapSha256: sha(sourceMap) });
    } catch { maps.set(name, null); }
  }
  const map = maps.get(name);
  return { ...frame, original: map ? originalPositionFor(map, { line: frame.lineNumber + 1, column: frame.columnNumber }) : null };
}
const top = [];
for (const row of allocations.slice(0, 25)) top.push({
  estimatedBytes: row.estimatedBytes, frame: await mapFrame(row.frame), stack: await Promise.all(row.stack.map(mapFrame)),
});
await writeFile(values.output, JSON.stringify({ at: profile.at, artifacts, top,
  scope: 'Allocation sampling estimates mapped by exact asset filename. No object values. Not retained heap, latency or proof of OOM; missing maps remain null.' }, null, 2));
console.log(JSON.stringify(top.slice(0, 6).map(row => ({ estimatedBytes: row.estimatedBytes, functionName: row.frame.functionName, original: row.frame.original }))));
