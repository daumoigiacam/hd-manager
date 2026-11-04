// Startup-only numeric runtime metadata for the separately approved QA service.
// No account/source reads, profiler, heap snapshot, synthetic allocation or env dump.
const {getHeapStatistics,getHeapSpaceStatistics}=require('node:v8');
const {availableParallelism}=require('node:os');
const spaces=new Set(['read_only_space','new_space','old_space','code_space','shared_space','trusted_space','new_large_object_space','large_object_space','code_large_object_space','shared_large_object_space','trusted_large_object_space']);
const finite=value=>Number.isFinite(value)&&value>=0&&value<=1048576;
function sanitizeHomeRuntimeShape(value={}){
 const out={version:1};
 if(/^v22\.\d+\.\d+$/.test(value.runtime||''))out.runtime=value.runtime;
 for(const key of ['heapLimitMiB','heapTotalMiB','heapUsedMiB','rssMiB','externalMiB','arrayBuffersMiB','constrainedMemoryMiB'])if(finite(value[key]))out[key]=value[key];
 if(Number.isSafeInteger(value.availableParallelism)&&value.availableParallelism>0&&value.availableParallelism<=1024)out.availableParallelism=value.availableParallelism;
 out.spaces=Array.isArray(value.spaces)?value.spaces.filter(s=>spaces.has(s?.name)).slice(0,12).map(s=>({name:s.name,...Object.fromEntries(['sizeMiB','usedMiB','availableMiB','physicalMiB'].filter(k=>finite(s[k])).map(k=>[k,s[k]]))})):[];
 const flags=value.flags||{};out.flags={};for(const key of ['maxOldSpaceMiB','maxSemiSpaceMiB'])if(Number.isSafeInteger(flags[key])&&flags[key]>0&&flags[key]<=65536)out.flags[key]=flags[key];
 out.scope='STARTUP_RUNTIME_METADATA_ONLY. Allocated space sizes are not proof of their maximum capacity, document readiness, latency acceptance or an OOM diagnosis.';
 return out;
}
function readHomeRuntimeShape(){
 const h=getHeapStatistics(),m=process.memoryUsage(),flags={};
 // Export only these numeric options; never copy NODE_OPTIONS/arguments/paths.
 for(const text of [process.env.NODE_OPTIONS||'',...process.execArgv])for(const match of text.matchAll(/(?:^|\s)--max-(old|semi)-space-size=(\d+)(?=\s|$)/g))flags[match[1]==='old'?'maxOldSpaceMiB':'maxSemiSpaceMiB']=Number(match[2]);
 return {runtime:process.version,heapLimitMiB:h.heap_size_limit/1048576,heapTotalMiB:m.heapTotal/1048576,heapUsedMiB:m.heapUsed/1048576,rssMiB:m.rss/1048576,externalMiB:m.external/1048576,arrayBuffersMiB:m.arrayBuffers/1048576,
  constrainedMemoryMiB:typeof process.constrainedMemory==='function'?process.constrainedMemory()/1048576:0,availableParallelism:availableParallelism(),flags,
  spaces:getHeapSpaceStatistics().map(s=>({name:s.space_name,sizeMiB:s.space_size/1048576,usedMiB:s.space_used_size/1048576,availableMiB:s.space_available_size/1048576,physicalMiB:s.physical_space_size/1048576}))};
}
function logHomeRuntimeShape({env=process.env,read=readHomeRuntimeShape,record=value=>console.info('HD_HOME_QA_RUNTIME_SHAPE '+JSON.stringify(value))}={}){
 if(env.GCLOUD_PROJECT!=='hd-manager-c5839'||env.FUNCTION_TARGET!=='employeeHomeBootstrapRegional'||env.K_SERVICE!=='employeehomebootstrapregional')return false;
 try{record(sanitizeHomeRuntimeShape(read()));return true}catch{return false}
}
module.exports={sanitizeHomeRuntimeShape,readHomeRuntimeShape,logHomeRuntimeShape};
