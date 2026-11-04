// Second privacy boundary for Cloud logs: do not copy arbitrary profiler fields.
export function sanitizeHomeCpuLog(value={}) {
 const out={};
 for(const key of ['samples','missingDeltas','gapsOver50ms','maxSampleIntervalMs'])if(Number.isFinite(value[key])&&value[key]>=0)out[key]=value[key];
 if(/^v22\.\d+\.\d+$/.test(value.runtime||''))out.runtime=value.runtime;
 if(typeof value.profileComplete==='boolean')out.profileComplete=value.profileComplete;
 for(const key of ['memoryBefore','memoryAfter'])if(value[key]&&typeof value[key]==='object')out[key]=Object.fromEntries(
  ['rssMiB','heapTotalMiB','heapUsedMiB','externalMiB','arrayBuffersMiB','heapLimitMiB'].filter(k=>Number.isFinite(value[key][k])&&value[key][k]>=0&&value[key][k]<=1048576).map(k=>[k,value[key][k]]));
 const frame=f=>{
  const row={};
  if(/^(?:runtime|app|node:[A-Za-z0-9_/-]{1,120}|(?:@[a-z0-9_-]+\/)?[a-z0-9_.-]{1,80})$/.test(f?.module||''))row.module=f.module;
  if(/^[A-Za-z0-9_.-]{1,100}\.(?:js|cjs|mjs)$/.test(f?.file||''))row.file=f.file;
  if(/^[A-Za-z0-9_$ .:()[\]<>-]{0,120}$/.test(f?.function||''))row.function=f.function;
  for(const k of ['line','column'])if(Number.isSafeInteger(f?.[k])&&f[k]>=0)row[k]=f[k];
  return row;
 };
 if(Array.isArray(value.frames))out.frames=value.frames.slice(0,20).map(f=>({...frame(f),
  ...(Number.isFinite(f.selfSampleMs)&&f.selfSampleMs>=0?{selfSampleMs:f.selfSampleMs}:{}),
  parents:Array.isArray(f.parents)?f.parents.slice(0,4).map(frame):[]}));
 out.diagnosticOnly=true;
 return out;
}
