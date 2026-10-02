import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const inputDirectories = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['test-results/full-interaction/master-baseline', 'test-results/full-interaction/phase2-client'];
const outputPath = path.resolve('test-results/phase2/cpu-profile-analysis.json');

const moduleFromFile = (file) => ['payroll', 'pricing', 'finance', 'products']
  .find((module) => file.includes(`-${module}-`)) || 'unknown';
const compactUrl = (url = '') => {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.hash}`;
  } catch {
    return url.length > 120 ? url.slice(-120) : url;
  }
};
const ignoredFunctions = new Set(['(idle)', '(program)', '(garbage collector)', '(root)']);

async function analyzeProfile(directory, file) {
  const profile = JSON.parse(await readFile(path.join(directory, file), 'utf8'));
  const nodesById = new Map((profile.nodes || []).map((node) => [node.id, node]));
  const aggregate = new Map();
  let sampledUs = 0;
  for (let index = 0; index < (profile.samples || []).length; index += 1) {
    const deltaUs = Number(profile.timeDeltas?.[index] || 0);
    const node = nodesById.get(profile.samples[index]);
    sampledUs += deltaUs;
    if (!node) continue;
    const frame = node.callFrame || {};
    const functionName = frame.functionName || '(anonymous)';
    if (ignoredFunctions.has(functionName)) continue;
    const url = compactUrl(frame.url);
    const key = `${functionName}|${url}|${frame.lineNumber ?? -1}`;
    const current = aggregate.get(key) || {
      functionName,
      url,
      line: Number(frame.lineNumber ?? -1) + 1,
      selfUs: 0,
      samples: 0,
    };
    current.selfUs += deltaUs;
    current.samples += 1;
    aggregate.set(key, current);
  }
  const topSelf = [...aggregate.values()]
    .sort((left, right) => right.selfUs - left.selfUs)
    .slice(0, 25)
    .map((entry) => ({
      ...entry,
      selfMs: Number((entry.selfUs / 1000).toFixed(2)),
      sampleSharePercent: sampledUs ? Number((entry.selfUs * 100 / sampledUs).toFixed(2)) : 0,
    }))
    .map(({ selfUs, ...entry }) => entry);
  return {
    directory,
    file,
    module: moduleFromFile(file),
    sampledMs: Number((sampledUs / 1000).toFixed(2)),
    sampleCount: profile.samples?.length || 0,
    topSelf,
  };
}

const profiles = [];
for (const directory of inputDirectories) {
  let files = [];
  try {
    files = (await readdir(directory)).filter((file) => file.endsWith('.cpuprofile'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  for (const file of files) profiles.push(await analyzeProfile(directory, file));
}

const report = {
  generatedAt: new Date().toISOString(),
  scope: 'Chrome CPU sampling profile; self time is derived from timeDeltas and is not wall-clock navigation time.',
  inputDirectories,
  profiles,
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, profiles: profiles.length, modules: [...new Set(profiles.map((profile) => profile.module))] }));
