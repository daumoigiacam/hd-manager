import {createRequire} from 'node:module';import {writeFile} from 'node:fs/promises';
import {sanitizeHomeCpuLog} from './helpers/employee-home-cpu-log-metadata.mjs';
const require=createRequire(import.meta.url),cli=require('firebase-tools'),project='hd-manager-c5839';
const {sanitizeHomeRuntimeShape}=require('../functions/employeeHomeRuntimeShape');
const listed=await cli.functions.list({project,nonInteractive:true,json:true});
const arrays=[listed,listed?.result,listed?.functions,listed?.result?.functions].filter(Array.isArray);
const deployed=arrays.flat().find(item=>item.id==='employeeHomeBootstrapRegional'&&item.region==='asia-southeast1');
const {entries}=await require('../node_modules/firebase-tools/lib/gcp/cloudlogging.js').listEntries(project,
 'resource.type="cloud_run_revision" AND resource.labels.service_name="employeehomebootstrapregional"',40,'desc');
const rows=entries.map(entry=>{
 const row={at:entry.timestamp,severity:entry.severity||null};
 if(entry.httpRequest)row.http={method:entry.httpRequest.requestMethod,status:entry.httpRequest.status,latency:entry.httpRequest.latency,responseBytes:entry.httpRequest.responseSize};
 const text=entry.textPayload||'';
 if(text.startsWith('HD_HOME_QA_RUNTIME_SHAPE ')){try{row.runtimeShape=sanitizeHomeRuntimeShape(JSON.parse(text.slice('HD_HOME_QA_RUNTIME_SHAPE '.length)))}catch{row.invalidRuntimeShape=true}}
 if(text.startsWith('HD_HOME_QA_TIMING ')){
  try{const v=JSON.parse(text.slice(18));row.timing={durationMs:v.durationMs,status:v.status,
   phases:v.phases.map(p=>({phase:['identity','snapshot','snapshot_source','snapshot_cpu','calculation','current_actor'].includes(p.phase)?p.phase:'unknown',durationMs:p.durationMs,ok:p.ok,
    ...(p.phase==='snapshot_cpu'?sanitizeHomeCpuLog(p):{}),
    ...Object.fromEntries(['cpuMs','requestMs','processingMs','decodedBytes','httpStatus','firstEntryMs','protoBytes','selectedFields'].filter(k=>Number.isFinite(p[k])).map(k=>[k,p[k]])),...(p.transport==='grpc'?{transport:'grpc'}:{}),...(['gzip','br','deflate','identity','none'].includes(p.encoding)?{encoding:p.encoding}:{}),
    ...(/^[a-z_]{1,80}$/.test(p.code||'')?{code:p.code}:{}),...(['employees','customers','orders','payments','expenses','financials','attendance','performance','employeeReviews','deliveryReports','holidays','advances','assets','assetCostLogs'].includes(p.collection)?{collection:p.collection,pages:p.pages,rows:p.rows}:{})}))}}catch{row.invalidTiming=true}
 }
 if(entry.severity==='ERROR'||entry.severity==='CRITICAL'){
  const content=text+' '+JSON.stringify(entry.jsonPayload||{});
  row.errorCategories=[['memory',/memory limit|out of memory|heap/i],['deadline',/deadline|timeout/i],['identity',/unauthorized|forbidden|permission/i],['type_error',/TypeError/],['reference_error',/ReferenceError/]]
   .filter(([,pattern])=>pattern.test(content)).map(([name])=>name);
 }
 return row;
});
const result={at:new Date(),function:deployed?{id:deployed.id,region:deployed.region,state:deployed.state,platform:deployed.platform,
 minInstances:deployed.minInstances??deployed.serviceConfig?.minInstanceCount??0,maxInstances:deployed.maxInstances??deployed.serviceConfig?.maxInstanceCount??null,
 concurrency:deployed.concurrency??deployed.serviceConfig?.maxInstanceRequestConcurrency??null,memoryMiB:deployed.availableMemoryMb??deployed.serviceConfig?.availableMemory??null}:null,rows,
 scope:'Cloud Run request timing/status and fixed numeric QA phases only. No audit principal/IP, headers, URLs, tokens, environment values, raw exceptions or business data exported.'};
await writeFile('test-results/perf-target-20261102/employee-home-qa-runtime-diagnostics.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
