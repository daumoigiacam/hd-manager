export function numericStats(values){const a=values.filter(Number.isFinite).sort((a,b)=>a-b);return{n:a.length,min:a[0]??null,median:a.length?a[Math.floor(a.length/2)]:null,p95:a.length?a[Math.ceil(a.length*.95)-1]:null,max:a.at(-1)??null}}
export function sumOwnedProcesses(sample,field,kind){
 const rows=sample.processes?.filter(p=>!kind||p.kind===kind);
 if(!rows?.length||(!kind&&sample.rendererOwnershipKnown!==true)||rows.some(p=>!Number.isFinite(p[field])))return undefined;
 return rows.reduce((n,p)=>n+p[field],0);
}
export function ownedCpuIntervals(samples,hz){
 const values=[],missing=[];if(!Number.isFinite(hz)||hz<=0)return{values,missing:[{reason:'Clock ticks per second not recorded'}]};
 for(let i=1;i<samples.length;i++){
  const a=samples[i-1],b=samples[i],durationMs=b.elapsedMs-a.elapsedMs,old=new Map((a.processes||[]).map(p=>[p.pid,p]));
  let reason=null,ticks=0;
  if(!(durationMs>0)||!a.rendererOwnershipKnown||!b.rendererOwnershipKnown||old.size!==b.processes?.length||!old.size)reason='Missing owned process or invalid interval';
  else for(const p of b.processes){const prior=old.get(p.pid);if(!prior||[prior.userTicks,prior.systemTicks,p.userTicks,p.systemTicks].some(n=>!Number.isFinite(n))){reason='Process changed or CPU counters missing';break}const delta=p.userTicks+p.systemTicks-prior.userTicks-prior.systemTicks;if(delta<0){reason='CPU counter regressed';break}ticks+=delta}
  if(reason)missing.push({startMs:a.elapsedMs,endMs:b.elapsedMs,reason});
  else values.push({startMs:a.elapsedMs,endMs:b.elapsedMs,durationMs,cpuSeconds:ticks/hz,oneCorePercent:ticks/hz/(durationMs/1000)*100});
 }
 return{values,missing,qualification:'Sum of owned native and renderer process CPU ticks. 100% means one fully occupied CPU core; multi-thread totals can exceed 100%. Not device-wide CPU, main-thread exclusive CPU or profiler attribution. Sampling overhead remains included.'};
}

export function memoryTrend(rows,get){
 const points=rows.map(s=>[s.elapsedMs/60000,get(s)]).filter(p=>p.every(Number.isFinite));
 if(points.length<2)return null;
 const x=points.reduce((n,p)=>n+p[0],0)/points.length,y=points.reduce((n,p)=>n+p[1],0)/points.length;
 const denominator=points.reduce((n,p)=>n+(p[0]-x)**2,0);
 return denominator>0?points.reduce((n,p)=>n+(p[0]-x)*(p[1]-y),0)/denominator:null;
}

export function matchedSessionModuleMemory(samples,sessions,metrics){
 return sessions.flatMap(session=>{
  const rows=samples.filter(s=>s.elapsedMs>=session.startMs&&s.elapsedMs<session.endMs);
  return [...new Set(rows.map(s=>s.module))].map(module=>{
   const matched=rows.filter(s=>s.module===module).sort((a,b)=>a.elapsedMs-b.elapsedMs);
   const first=matched[0].elapsedMs,last=matched.at(-1).elapsedMs,third=(last-first)/3;
   return {sessionIndex:session.index,module,samples:matched.length,startMs:first,endMs:last,
    metrics:Object.fromEntries(Object.entries(metrics).map(([name,get])=>[name,{
     all:numericStats(matched.map(get)),unitsPerMinuteSlope:memoryTrend(matched,get),
     firstThird:numericStats(matched.filter(s=>s.elapsedMs<=first+third).map(get)),
     lastThird:numericStats(matched.filter(s=>s.elapsedMs>=last-third).map(get))
    }])),qualification:'Matched observed module within one recorded principal session. Small sample counts, cache warmup, role relogin, native allocation and GC remain confounders; no automatic leak PASS or failure.'};
  });
 });
}
