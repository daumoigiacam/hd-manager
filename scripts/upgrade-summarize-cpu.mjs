import fs from 'node:fs/promises';
import path from 'node:path';
import {TraceMap,originalPositionFor} from '@jridgewell/trace-mapping';
const root='test-results/performance-upgrade-20261103',name=process.argv[2]||'after-postings-cpu';if(!/^[a-z0-9-]+$/.test(name))throw Error('Invalid cohort');
const build=process.argv[3]||'after-postings';if(!/^after-[a-z0-9-]+$/.test(build))throw Error('Invalid source-map build');
const profile=JSON.parse(await fs.readFile(`${root}/cpu-${name}.json`,'utf8'));
const nodes=new Map(profile.nodes.map(n=>[n.id,n])),parents=new Map(),mapped=new Map(),maps=new Map(),self=new Map(),inclusive=new Map();
for(const n of profile.nodes)for(const id of n.children||[])parents.set(id,n.id);
async function frame(n){
 if(mapped.has(n.id))return mapped.get(n.id);const f=n.callFrame,asset=path.basename(f.url||'');let source=null;
 if(/^[A-Za-z0-9_.-]+\.js$/.test(asset)){
  if(!maps.has(asset)){try{maps.set(asset,new TraceMap(JSON.parse(await fs.readFile(`${root}/${build}/source-maps/assets/${asset}.map`,'utf8'))))}catch{maps.set(asset,null)}}
  if(maps.get(asset))source=originalPositionFor(maps.get(asset),{line:f.lineNumber+1,column:f.columnNumber});
 }
 const value={functionName:f.functionName||'(anonymous)',asset:asset||null,source:source?.source||null,line:source?.line||null,column:source?.column??null};mapped.set(n.id,value);return value;
}
let uncertainGapMs=0,observedMs=0;
const add=(table,key,value,ms)=>{if(!table.has(key))table.set(key,{...value,samples:0,observedIntervalMs:0});const r=table.get(key);r.samples++;r.observedIntervalMs+=ms};
for(let i=0;i<(profile.samples||[]).length;i++){
 const ms=(profile.timeDeltas?.[i]||0)/1000;if(ms>50){uncertainGapMs+=ms;continue}observedMs+=ms;
 const id=profile.samples[i],node=nodes.get(id);if(!node)continue;
 const value=await frame(node),key=JSON.stringify(value);add(self,key,value,ms);
 const seen=new Set();let at=id;
 for(let depth=0;at&&depth<100;depth++,at=parents.get(at)){
  const parent=nodes.get(at);if(!parent)break;const f=await frame(parent),k=JSON.stringify(f);if(!seen.has(k)){seen.add(k);add(inclusive,k,f,ms)}
 }
}
const top=table=>[...table.values()].sort((a,b)=>b.observedIntervalMs-a.observedIntervalMs).slice(0,45);
const result={at:new Date().toISOString(),scope:'Diagnostic main-renderer V8 CPU sampling; interval weights are NOT function CPU time or acceptance. Gaps >50ms remain unattributed.',samples:profile.samples.length,observedMs,uncertainGapMs,wallMs:(profile.endTime-profile.startTime)/1000,self:top(self),inclusive:top(inclusive)};
await fs.writeFile(`${root}/cpu-${name}-summary.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,self:result.self.slice(0,12),inclusive:result.inclusive.slice(0,12)},null,2));
