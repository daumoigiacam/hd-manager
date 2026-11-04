// QA-only opt-in source CPU diagnosis. No heap snapshot, arguments, locals,
// document contents, headers, tokens or external inspector listener.
const {Session}=require('node:inspector');const {getHeapStatistics}=require('node:v8');
const ownFiles=new Set(['employeeHomeGrpcSnapshot.js','employeeHomeRestSnapshot.js','employeeHomePrivateValues.js','employeeHomeReadModel.js','employeeHomeRuntime.js','employeeHomeFieldSpec.js']);
function safeFrame(frame={}){
 const url=typeof frame.url==='string'?frame.url.replaceAll('\\','/'):'',parts=url.split('/');let module='runtime',file=null,allowName=false;
 const local=url.startsWith('file:')||url.startsWith('/')||/^[A-Za-z]:\//.test(url),at=local?parts.lastIndexOf('node_modules'):-1;
 if(at>=0){const name=parts[at+1]?.startsWith('@')?parts.slice(at+1,at+3).join('/'):parts[at+1];
  if(/^(?:@[a-z0-9_-]+\/)?[a-z0-9_.-]{1,80}$/.test(name||'')){module=name;const last=parts.at(-1);if(/^[A-Za-z0-9_.-]{1,100}\.(?:js|cjs|mjs)$/.test(last||''))file=last;allowName=true}
 }else if(local&&ownFiles.has(parts.at(-1))){module='app';file=parts.at(-1);allowName=true}
 else if(/^node:[a-zA-Z0-9_/-]{1,120}$/.test(url)){module=url;allowName=true}
 const name=frame.functionName||'';
 if(['(root)','(idle)','(program)','(garbage collector)'].includes(name)||/^[A-Za-z0-9_]+\$(?:decode|encode|toObject|fromObject)$/.test(name))allowName=true;
 return {module,...(file?{file}:{}),function:allowName&&/^[A-Za-z0-9_$ .:()[\]<>-]{0,120}$/.test(name)?name:'[other]',
  ...(Number.isSafeInteger(frame.lineNumber)&&frame.lineNumber>=0?{line:frame.lineNumber}:{}),
  ...(Number.isSafeInteger(frame.columnNumber)&&frame.columnNumber>=0?{column:frame.columnNumber}:{})};
}
function summarizeHomeCpuProfile(profile){
 if(!Array.isArray(profile?.nodes)||!Array.isArray(profile.samples)||!Array.isArray(profile.timeDeltas)||profile.nodes.length>50000||profile.samples.length>100000)throw new TypeError('Invalid bounded Home CPU profile.');
 const nodes=new Map(profile.nodes.map(n=>[n.id,n])),parents=new Map(),totals=new Map();let missingDeltas=0,gapsOver50ms=0,maxSampleIntervalMs=0;
 for(const node of nodes.values())for(const child of node.children||[])parents.set(child,node.id);
 profile.samples.forEach((id,i)=>{const delta=profile.timeDeltas[i];if(!Number.isFinite(delta)||delta<0||!nodes.has(id)){missingDeltas++;return}
  const ms=delta/1000;maxSampleIntervalMs=Math.max(maxSampleIntervalMs,ms);if(ms>=50)gapsOver50ms++;totals.set(id,(totals.get(id)||0)+ms);
 });
 const frames=[...totals].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([id,selfSampleMs])=>{
  const chain=[];let cursor=parents.get(id);
  for(let depth=0;cursor!==undefined&&depth<4;depth++,cursor=parents.get(cursor))chain.push(safeFrame(nodes.get(cursor)?.callFrame));
  return {...safeFrame(nodes.get(id)?.callFrame),selfSampleMs,parents:chain};
 });
 return {samples:profile.samples.length,missingDeltas,gapsOver50ms,maxSampleIntervalMs,frames};
}
const memory=()=>{const usage=process.memoryUsage(),heap=getHeapStatistics();return {...Object.fromEntries(['rss','heapTotal','heapUsed','external','arrayBuffers'].filter(k=>Number.isFinite(usage[k])).map(k=>[k+'MiB',usage[k]/1048576])),heapLimitMiB:heap.heap_size_limit/1048576}};
const safeMemory=value=>Object.fromEntries(['rssMiB','heapTotalMiB','heapUsedMiB','externalMiB','arrayBuffersMiB','heapLimitMiB'].filter(key=>Number.isFinite(value?.[key])&&value[key]>=0&&value[key]<=1048576).map(key=>[key,value[key]]));
const fail=code=>Object.assign(new Error(code),{code,statusCode:503});
function createEmployeeHomeCpuDiagnostic({record,makeSession=()=>new Session(),readMemory=memory}={}){
 if(typeof record!=='function')throw new TypeError('Bounded private CPU record callback required.');let used=false;
 return async(scope,operation)=>{
  if(!scope.nonce?.startsWith('qaCpu_'))return operation();
  if(used)throw fail('home_cpu_diagnostic_already_used');used=true;
  const session=makeSession(),post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(error,value)=>error?reject(error):resolve(value)));
  let started=false,before,at,ok=false;
  try{
   session.connect();await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:1000});before=safeMemory(readMemory());await post('Profiler.start');started=true;at=performance.now();
   try{const result=await operation();ok=true;return result}
   finally{
    const durationMs=performance.now()-at,after=safeMemory(readMemory());
    try{const {profile}=await post('Profiler.stop');started=false;record({phase:'snapshot_cpu',durationMs,ok,profileComplete:true,runtime:process.version,memoryBefore:before,memoryAfter:after,...summarizeHomeCpuProfile(profile),
     scope:'DIAGNOSTIC_ONLY. Sample intervals include idle/gaps and instrumentation overhead; not exact function CPU, cloud latency acceptance or a heap snapshot.'})}
    catch{record({phase:'snapshot_cpu',durationMs,ok:false,code:'home_cpu_diagnostic_failed'})}
   }
  }catch(error){if(!started&&at===undefined)throw fail('home_cpu_diagnostic_unavailable');throw error}
  finally{if(started)try{await post('Profiler.stop')}catch{/* cleanup only */}try{session.disconnect()}catch{/* no external listener */}}
 };
}
module.exports={createEmployeeHomeCpuDiagnostic,summarizeHomeCpuProfile};
