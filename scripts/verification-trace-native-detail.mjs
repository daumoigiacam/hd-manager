import fs from 'node:fs/promises';
const root='test-results/phase2-verification-20261102';
const raw=JSON.parse(await fs.readFile(`${root}/capacitor-owned-trace.json`,'utf8'));
const summary=JSON.parse(await fs.readFile(`${root}/capacitor-trace-summary.json`,'utf8'));
const rows=[];
for(const task of summary.longTasks.filter(t=>t.rendererMainThread&&t.durationMs>=300)) {
 const end=task.ts+task.durationMs*1000;
 const children=raw.traceEvents.filter(e=>e.pid===task.pid&&e.tid===task.tid&&e.ph==='X'&&e.ts>=task.ts&&e.ts+e.dur<=end+1&&e.dur<task.durationMs*1000-1)
  .sort((a,b)=>b.dur-a.dur).slice(0,16).map(e=>({name:e.name,category:e.cat,durationMs:e.dur/1000,relativeMs:(e.ts-task.ts)/1000,threadCpuMs:Number.isFinite(e.tdur)?e.tdur/1000:null,argsKeys:Object.keys(e.args||{}),dataKeys:Object.keys(e.args?.data||{})}));
 rows.push({taskMs:task.durationMs,taskCpuMs:task.threadCpuMs,ts:task.ts,children});
}
await fs.writeFile(`${root}/trace-native-task-inspection.json`,JSON.stringify({at:new Date().toISOString(),scope:'Offline inspection of diagnostic trace; nested durations must not be summed as exclusive CPU',rows},null,2));
console.log(JSON.stringify(rows));
