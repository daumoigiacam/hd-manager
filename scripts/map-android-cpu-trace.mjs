import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
const { values } = parseArgs({ options: { input: { type: 'string' }, build: { type: 'string' }, output: { type: 'string' }, tasks: {type:'string'} } });
if (!values.input || !values.build || !values.output) throw Error('Required: --input trace.json --build public-directory --output summary.json');
const trace = JSON.parse(await readFile(values.input, 'utf8'));
const taskMetadata = values.tasks ? JSON.parse(await readFile(values.tasks,'utf8')).tasks : [];
const groups = new Map(), maps = new Map(), artifacts = [];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function mapped(frame) {
  if (!frame?.url?.includes('/assets/')) return frame;
  const name = path.basename(new URL(frame.url).pathname);
  if (!maps.has(name)) {
    try {
      const [asset, map] = await Promise.all([readFile(path.join(values.build, 'assets', name)), readFile(path.join(values.build, 'assets', `${name}.map`))]);
      maps.set(name, new TraceMap(JSON.parse(map.toString('utf8'))));
      artifacts.push({ name, assetSha256: sha(asset), mapSha256: sha(map) });
    } catch { maps.set(name, null); }
  }
  return { ...frame, original: maps.get(name) ? originalPositionFor(maps.get(name), { line: frame.lineNumber + 1, column: frame.columnNumber }) : null };
}
for (const event of trace.events) {
  const data = event.args?.data;
  if (!data?.cpuProfile && event.name !== 'Profile') continue;
  const key = `${event.pid}:${event.id}`;
  if (!groups.has(key)) groups.set(key, { pid: event.pid, nodes: new Map(), times: new Map(), intervals:new Map(), samples: 0, missingDeltas: 0, gapsOver50ms:0, maxSampleIntervalMs:null, spans:[], clock:null, tid:null });
  const group = groups.get(key);
  if(event.name === 'Profile') {group.clock=data.startTime;group.tid=event.tid;continue;}
  for (const node of data.cpuProfile.nodes || []) group.nodes.set(node.id, node);
  (data.cpuProfile.samples || []).forEach((id, i) => {
    group.samples++;
    const delta = data.timeDeltas?.[i];
    if (!Number.isFinite(delta) || delta < 0) { group.missingDeltas++; return; }
    group.maxSampleIntervalMs=Math.max(group.maxSampleIntervalMs||0,delta/1000);
    if(delta>50000)group.gapsOver50ms++;
    const interval=group.intervals.get(id)||{count:0,maxMs:0};interval.count++;interval.maxMs=Math.max(interval.maxMs,delta/1000);group.intervals.set(id,interval);
    if (values.tasks && Number.isFinite(group.clock)) {group.spans.push({id,start:group.clock,end:group.clock+delta});group.clock+=delta;}
    group.times.set(id, (group.times.get(id) || 0) + delta / 1000);
  });
}
const results = [];
for (const group of groups.values()) {
  const top = [];
  for (const [id, ms] of [...group.times].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
    const node = group.nodes.get(id), stack = [];
    let current = node;
    for (let i = 0; current && i < 80; i++, current = group.nodes.get(current.parent)) stack.push(current.callFrame);
    top.push({ selfSampleMs: ms, sampleCount:group.intervals.get(id)?.count,maxSampleIntervalMs:group.intervals.get(id)?.maxMs,frame: await mapped(node?.callFrame), stack: await Promise.all(stack.reverse().slice(-10).map(mapped)) });
  }
  const longTasks=[];
  for(const task of taskMetadata.filter(t=>t.pid===group.pid && t.tid===group.tid && t.name==='RunTask' && t.dur>100000).sort((a,b)=>b.dur-a.dur).slice(0,12)){
    const totals=new Map();
    for(const span of group.spans){const overlap=Math.min(span.end,task.ts+task.dur)-Math.max(span.start,task.ts);if(overlap>0)totals.set(span.id,(totals.get(span.id)||0)+overlap/1000);}
    const frames=[];
    for(const [id,ms] of [...totals].sort((a,b)=>b[1]-a[1]).slice(0,8)){
      const stack=[];let node=group.nodes.get(id);
      for(let i=0;node && i<80;i++,node=group.nodes.get(node.parent))stack.push(node.callFrame);
      frames.push({selfSampleMs:ms,frame:await mapped(group.nodes.get(id)?.callFrame),stack:await Promise.all(stack.reverse().slice(-10).map(mapped))});
    }
    longTasks.push({ts:task.ts,durationMs:task.dur/1000,frames});
  }
  results.push({ pid: group.pid, tid:group.tid, samples: group.samples, missingDeltas: group.missingDeltas,gapsOver50ms:group.gapsOver50ms,maxSampleIntervalMs:group.maxSampleIntervalMs,top, longTasks });
}
await writeFile(values.output, JSON.stringify({ artifacts, results, scope: 'V8 sample interval sums including idle; diagnostic overhead present. Large deltas can include off-CPU/sampling gaps, and must not be attributed entirely to the sampled function. Not interaction latency, exact CPU duration or p95. Missing deltas counted, never fabricated.' }, null, 2));
console.log(JSON.stringify(results.map(g => ({ pid: g.pid, samples: g.samples, top: g.top.slice(0, 8).map(t => ({ ms: t.selfSampleMs, functionName: t.frame?.functionName, original: t.frame?.original })) }))));
