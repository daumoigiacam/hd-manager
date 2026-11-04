// Offline analysis only. Do not infer leak absence from a flat rounded heap.
export function median(values) {
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b),n=sorted.length;
  return n ? n%2 ? sorted[(n-1)/2] : (sorted[n/2-1]+sorted[n/2])/2 : null;
}
export function observationCoverage(samples,elapsedMs,{maximumGapMs=60000}={}) {
  const clocks=(samples||[]).map(row=>row.elapsedMs).filter(Number.isFinite);
  const gaps=[];let previous=0,regressions=0;
  for(const clock of clocks){if(clock<previous)regressions++;gaps.push(clock-previous);previous=clock;}
  if(Number.isFinite(elapsedMs))gaps.push(elapsedMs-previous);
  const largeGaps=gaps.filter(gap=>gap>maximumGapMs);
  return {samples:clocks.length,maxGapMs:gaps.length?Math.max(...gaps):null,largeGaps,regressions,
    observedWithoutLargeGaps:clocks.length>=2&&regressions===0&&largeGaps.length===0,
    qualification:`Coverage check only, not a latency PASS: any unobserved gap >${maximumGapMs} ms prevents continuous-observation confirmation. No interpolation across host sleep or missing samples.`};
}
export function processCpuIntervals(samples,clockTicksPerSecond) {
  if(!Number.isFinite(clockTicksPerSecond)||clockTicksPerSecond<=0)return {status:'NOT_VERIFIED_CLOCK_TICKS',processes:[]};
  const previous=new Map(),groups=new Map();
  for(const sample of samples||[])for(const proc of sample.processes||[]) {
    if(!Number.isFinite(sample.elapsedMs)||!Number.isFinite(proc.userTicks)||!Number.isFinite(proc.systemTicks))continue;
    const key=`${proc.kind}/${proc.pid}`,ticks=proc.userTicks+proc.systemTicks,prior=previous.get(key);
    previous.set(key,{t:sample.elapsedMs,ticks});
    if(!prior||sample.elapsedMs<=prior.t||ticks<prior.ticks)continue;
    const durationMs=sample.elapsedMs-prior.t,cpuMs=(ticks-prior.ticks)*1000/clockTicksPerSecond;
    if(!groups.has(key))groups.set(key,{pid:proc.pid,kind:proc.kind,intervals:[],cpuMs:0,observedWallMs:0});
    const row=groups.get(key);row.intervals.push({endMs:sample.elapsedMs,cpuMs,durationMs,percentOfOneCore:100*cpuMs/durationMs});row.cpuMs+=cpuMs;row.observedWallMs+=durationMs;
  }
  return {status:'PROCESS_CPU_OBSERVED',clockTicksPerSecond,processes:[...groups.values()].map(row=>({...row,weightedPercentOfOneCore:100*row.cpuMs/row.observedWallMs})),
    qualification:'Derived from process utime+stime ticks and sampled monotonic intervals, not JS-function CPU or clean interaction CPU. A multithreaded process can exceed 100% of one core; collection overhead is included.'};
}
export function describeSeries(series,{warmupMs=1200000,bucketMs=300000,unit='KB'}={}) {
  const valid=series.filter(p=>Number.isFinite(p.t)&&Number.isFinite(p.value));
  const groups=new Map();
  for(const p of valid.filter(p=>p.t>=warmupMs)) {
    const id=Math.floor(p.t/bucketMs);
    if(!groups.has(id))groups.set(id,[]);
    groups.get(id).push(p.value);
  }
  const points=[...groups].sort(([a],[b])=>a-b).map(([id,values])=>({t:(id+.5)*bucketMs,value:median(values),sampleCount:values.length}));
  const mx=points.reduce((n,p)=>n+p.t/3600000,0)/(points.length||1),my=points.reduce((n,p)=>n+p.value,0)/(points.length||1);
  const denominator=points.reduce((n,p)=>n+(p.t/3600000-mx)**2,0);
  const slope=points.length>=4&&denominator>0?points.reduce((n,p)=>n+(p.t/3600000-mx)*(p.value-my),0)/denominator:null;
  return {count:valid.length,unit,min:valid.length?Math.min(...valid.map(p=>p.value)):null,max:valid.length?Math.max(...valid.map(p=>p.value)):null,
    lateFiveMinuteMedians:points,descriptiveSlopePerHour:slope,
    qualification:'Descriptive only; serial correlation, route phases and GC prevent causal leak or no-leak conclusions.'};
}
export function describeProcessSamples(samples,cohort) {
  const groups=new Map();
  for(const s of samples||[])for(const proc of s.processes||[])for(const key of ['totalPssKb','rssKb','nativeHeapPssKb','nativeHeapAllocatedKb']) {
    if(!Number.isFinite(proc[key]))continue;
    const id=`${proc.kind}/${proc.pid}/${key}`;
    if(!groups.has(id))groups.set(id,{cohort,pid:proc.pid,kind:proc.kind,metric:key,series:[]});
    groups.get(id).series.push({t:s.elapsedMs,value:proc[key]});
  }
  return [...groups.values()].map(({series,...info})=>({...info,...describeSeries(series)}));
}
export function summarizeSdkSoak(data) {
  const samples=data?.samples||[],actions=data?.actions||[];
  const observedClicks=new Map();
  for(const sample of samples)for(const row of sample.probe?.frames||[]) {
    if(row.trusted!==true||!Number.isFinite(row.start)||!Number.isFinite(row.feedbackMs)||!Number.isFinite(sample.documentOrigin))continue;
    observedClicks.set(`${sample.documentOrigin}/${row.start}`,row.feedbackMs);
  }
  const clickValues=[...observedClicks.values()].sort((a,b)=>a-b);
  const clicks={uniqueObserved:clickValues.length,medianMs:median(clickValues),p95NearestRankMs:clickValues.length?clickValues[Math.ceil(.95*clickValues.length)-1]:null,
    maxMs:clickValues.length?clickValues.at(-1):null,over100Ms:clickValues.filter(ms=>ms>100).length,
    qualification:'Observed trusted pointer event delivery to two RAF only; NOT INP, input-queue latency or operation completion. Five-event sampling window may miss interactions. Repeated snapshots deduplicated by document clock and event start.'};
  const loginEpochs=actions.filter(a=>['initial-fake-login','relogin-fake-role'].includes(a.kind)).map((action,index)=>{
    const sample=action.invoked===true?samples.find(s=>s.elapsedMs>=(action.elapsedMs||0)&&Number.isFinite(s.probe?.homeDataReadyMs)):null;
    return {epoch:index,action:action.kind,invoked:action.invoked,firstSampleMs:sample?.elapsedMs??null,homeShellMs:sample?.probe?.homeShellMs??null,homeDataReadyMs:sample?.probe?.homeDataReadyMs??null,
      qualification:'One first sample per explicit synthetic-login action; not 480 independent logins. Fake loopback identity and demo SDK data, poll/RAF observation overhead included.'};
  });
  const metric=(key,read,unit)=>({metric:key,...describeSeries(samples.map(s=>({t:s.elapsedMs,value:read(s)})),{unit})});
  const moduleGroups=new Map();
  for(const sample of samples) {
    if(!moduleGroups.has(sample.module))moduleGroups.set(sample.module,[]);
    moduleGroups.get(sample.module).push(sample);
  }
  const modules=[...moduleGroups].map(([module,rows])=>({module,samples:rows.length,
    jsHeapUsedBytes:describeSeries(rows.map(s=>({t:s.elapsedMs,value:s.heap?.usedSize})),{unit:'bytes'}),
    sdkOutstanding:describeSeries(rows.map(s=>({t:s.elapsedMs,value:s.mainSdk?.outstanding})),{unit:'public SDK listeners'})}));
  return {sampleCount:samples.length,failures:data?.failures||[],clicks,loginEpochs,metrics:[
    metric('mainJsHeapUsedBytes',s=>s.heap?.usedSize,'bytes'),metric('domNodes',s=>s.dom?.nodes,'nodes'),
    metric('domJsEventListeners',s=>s.dom?.jsEventListeners,'listeners'),
    metric('publicSdkOutstanding',s=>s.mainSdk?.outstanding,'public SDK listeners'),
    metric('workerPublicSdkOutstanding',s=>{
      const counters=s.probe?.workerCounters;
      if(!counters||typeof counters!=='object')return undefined;
      const rows=Object.values(counters);if(rows.some(row=>!Number.isFinite(row?.outstanding)))return undefined;
      return rows.reduce((sum,row)=>sum+row.outstanding,0);
    },'worker-reported public SDK listeners'),
    metric('workerHandlesNotExplicitlyTerminated',s=>s.probe?s.probe.workersCreated-s.probe.workersTerminated:undefined,'handles')],
    modules,observedModules:[...moduleGroups.keys()],
    coverage:{routeClicks:actions.filter(a=>a.kind==='actual-ui-route'&&a.clicked).length,
      routeNotFound:actions.filter(a=>a.kind==='actual-ui-route'&&!a.clicked).length,
      searchInputs:actions.filter(a=>a.kind==='search'&&a.exercised).length,
      backgroundForeground:actions.filter(a=>a.kind==='background-foreground').length,
      logoutInvoked:actions.filter(a=>a.kind==='logout'&&a.invoked).length,
      reloginInvoked:actions.filter(a=>a.kind==='relogin-fake-role'&&a.invoked).length},
    qualification:'Action invocation is not successful operation completion. Per-module samples reduce route confounding; no retained-object graph or causal leak verdict.'};
}
