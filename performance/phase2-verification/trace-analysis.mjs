import fs from 'node:fs/promises';
import path from 'node:path';
import {TraceMap,originalPositionFor} from '@jridgewell/trace-mapping';

const unionLength=ranges=>{
 const sorted=ranges.filter(r=>r[1]>r[0]).sort((a,b)=>a[0]-b[0]);let sum=0,left=null,right=null;
 for(const [a,b] of sorted){if(left===null){left=a;right=b}else if(a<=right)right=Math.max(right,b);else{sum+=right-left;left=a;right=b}}
 return sum+(left===null?0:right-left);
};
// Old Chromium emits many timeline intervals as nested B/E pairs. Ignoring
// these would incorrectly report zero scripting and attribute it to "other".
export function completeTraceIntervals(events){
 const stacks=new Map(),completed=[];
 for(const event of events){
  const key=`${event.pid}:${event.tid}`;
  if(event.ph==='B'){const stack=stacks.get(key)||[];stack.push(event);stacks.set(key,stack)}
  else if(event.ph==='E'){
   const start=stacks.get(key)?.pop();
   if(start&&Number.isFinite(start.ts)&&Number.isFinite(event.ts)&&event.ts>=start.ts){
    const span={...start,ph:'X',dur:event.ts-start.ts};
    if(Number.isFinite(start.tts)&&Number.isFinite(event.tts)&&event.tts>=start.tts)span.tdur=event.tts-start.tts;
    completed.push(span);
   }
  }
 }
 return [...events,...completed];
}
export function summarizeTask(task,events){
 const end=task.ts+task.dur,buckets={scripting:[],layout:[],paint:[],gc:[]};
 for(const e of events){if(e.pid!==task.pid||e.tid!==task.tid||e.ph!=='X'||!Number.isFinite(e.dur))continue;
  const a=Math.max(task.ts,e.ts),b=Math.min(end,e.ts+e.dur);if(b<=a)continue;
  let kind;
  if(/^(FunctionCall|EvaluateScript|RunMicrotasks|V8\.Execute|EventDispatch)$/.test(e.name))kind='scripting';
  else if(/^(Layout|UpdateLayoutTree|RecalculateStyles)$/.test(e.name))kind='layout';
  else if(/^(Paint|PrePaint|CompositeLayers|Layerize)$/.test(e.name))kind='paint';
  else if(/GC|GarbageCollect/.test(e.name))kind='gc';
  if(kind)buckets[kind].push([a,b]);
 }
 const classified=Object.values(buckets).flat(),renderGc=[...buckets.layout,...buckets.paint,...buckets.gc];
 const scriptAndOther=unionLength([...buckets.scripting,...renderGc]);
 return {durationMs:task.dur/1000,threadCpuMs:Number.isFinite(task.tdur)?task.tdur/1000:null,
  scriptingExclusiveWallMs:(scriptAndOther-unionLength(renderGc))/1000,
  layoutWallMs:unionLength(buckets.layout)/1000,paintWallMs:unionLength(buckets.paint)/1000,gcWallMs:unionLength(buckets.gc)/1000,
  unclassifiedWallMs:Math.max(0,task.dur-unionLength(classified))/1000,
  qualification:'Union of nested trace wall intervals; not CPU attribution. Categories can overlap; threadCpuMs exists only if trace supplies tdur.'};
}
export async function analyzeTrace({input,assetRoot,output}){
 const raw=JSON.parse(await fs.readFile(input,'utf8')),events=completeTraceIntervals(raw.traceEvents||raw.events||[]),groups=new Map(),maps=new Map();
 async function map(frame){if(!frame?.url?.includes('/assets/'))return {functionName:frame?.functionName||null,original:null};
  const name=path.basename(new URL(frame.url).pathname);
  if(!maps.has(name))maps.set(name,await fs.readFile(path.join(assetRoot,'assets',name+'.map'),'utf8').then(s=>new TraceMap(JSON.parse(s))).catch(()=>null));
  return {functionName:frame.functionName,asset:name,original:maps.get(name)?originalPositionFor(maps.get(name),{line:frame.lineNumber+1,column:frame.columnNumber}):null};
 }
 for(const event of events){const data=event.args?.data;if(event.name!=='Profile'&&!data?.cpuProfile)continue;
  const key=`${event.pid}:${event.id}`;if(!groups.has(key))groups.set(key,{pid:event.pid,tid:event.tid,nodes:new Map(),clock:null,spans:[],missingDeltas:0,gapsOver50ms:0});
  const g=groups.get(key);if(event.name==='Profile'){g.clock=data?.startTime;g.tid=event.tid;continue}
  for(const node of data.cpuProfile.nodes||[])g.nodes.set(node.id,node);
  (data.cpuProfile.samples||[]).forEach((id,i)=>{const delta=data.timeDeltas?.[i];if(!Number.isFinite(delta)||delta<0){g.missingDeltas++;return}
   if(delta>50000)g.gapsOver50ms++;if(Number.isFinite(g.clock)){g.spans.push({id,start:g.clock,end:g.clock+delta,gap:delta>50000});g.clock+=delta}
  });
 }
 const threadNames=new Map(events.filter(e=>e.name==='thread_name').map(e=>[`${e.pid}:${e.tid}`,e.args?.name]));
 const taskNames=new Set(['RunTask','ThreadControllerImpl::RunTask','TaskQueueManager::ProcessTaskFromWorkQueue']);
 const tasks=events.filter(e=>taskNames.has(e.name)&&e.ph==='X'&&e.dur>=100000).sort((a,b)=>b.dur-a.dur).slice(0,25);
 const result=[];
 for(const task of tasks){const totals=new Map();let uncertainGapMs=0;
  const group=[...groups.values()].find(g=>g.pid===task.pid&&g.tid===task.tid);
  if(group)for(const span of group.spans){const overlap=Math.min(task.ts+task.dur,span.end)-Math.max(task.ts,span.start);if(overlap<=0)continue;if(span.gap)uncertainGapMs+=overlap/1000;else totals.set(span.id,(totals.get(span.id)||0)+overlap/1000)}
  const frames=[];for(const [id,sampleIntervalMs] of [...totals].sort((a,b)=>b[1]-a[1]).slice(0,10))frames.push({sampleIntervalMs,...await map(group.nodes.get(id)?.callFrame)});
  const threadName=threadNames.get(`${task.pid}:${task.tid}`)||null;
  result.push({ts:task.ts,pid:task.pid,tid:task.tid,threadName,rendererMainThread:threadName==='CrRendererMain',...summarizeTask(task,events),uncertainSamplingGapMs:uncertainGapMs,frames});
 }
 const summary={at:new Date().toISOString(),input,diagnostic:true,eventCount:events.length,cpuProfileGroups:groups.size,
  missingDeltas:[...groups.values()].reduce((n,g)=>n+g.missingDeltas,0),gapsOver50ms:[...groups.values()].reduce((n,g)=>n+g.gapsOver50ms,0),
  taskNames:[...new Set(events.filter(e=>e.dur>=100000&&e.ph==='X').map(e=>e.name))].slice(0,60),longTasks:result,
  historical551_6msExactRoot:'NOT_VERIFIED: original duration-only cohort had no synchronized CPU trace; this is reproduction evidence only',
  qualification:'Profiler overhead present. No wall duration or idle/off-CPU sample gap is claimed as exact function CPU. No automatic production patch.'};
 await fs.writeFile(output,JSON.stringify(summary,null,2));return summary;
}
