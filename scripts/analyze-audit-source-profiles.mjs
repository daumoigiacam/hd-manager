import fs from 'node:fs/promises';
import path from 'node:path';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

const directory = path.resolve(process.argv[2]);
const buildDirectory = path.resolve(process.argv[3] || directory);
const maps = new Map();
const result = [];
for (const file of (await fs.readdir(directory)).filter(name => name.endsWith('.cpuprofile'))) {
  const profile = JSON.parse(await fs.readFile(path.join(directory, file), 'utf8'));
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const totals = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const frame = nodes.get(profile.samples[i])?.callFrame;
    if (!frame) continue;
    let location = null;
    if (frame.url?.includes('/assets/')) {
      const asset = path.basename(new URL(frame.url).pathname);
      if (!maps.has(asset)) {
        try { maps.set(asset, new TraceMap(JSON.parse(await fs.readFile(path.join(buildDirectory, 'app/assets', `${asset}.map`), 'utf8')))); }
        catch { maps.set(asset, null); }
      }
      if (maps.get(asset)) location = originalPositionFor(maps.get(asset), { line: frame.lineNumber + 1, column: frame.columnNumber });
    }
    const key = `${location?.source || frame.url || 'runtime'}:${location?.line || frame.lineNumber + 1} ${location?.name || frame.functionName || '(anonymous)'}`;
    totals.set(key, (totals.get(key) || 0) + (profile.timeDeltas[i] || 0) / 1000);
  }
  result.push({ file, topSelf: [...totals].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([source, ms]) => ({ source, ms: Math.round(ms) })) });
}
await fs.writeFile(path.join(directory, 'source-profiles.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
