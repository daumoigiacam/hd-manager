import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const project='hd-manager-c5839',output='test-results/perf-target-20261102/startup-api-verification.json';
const definitions=[['identityLoginRegional','asia-southeast1',1],['identityBiometricLoginRegional','asia-southeast1',1],['customerPortalBootstrapRegional','asia-southeast1',1],['customerPortalBootstrap','us-central1',0]];
// Keep full CLI metadata in memory: environment/configuration values must not
// enter the diagnostic artifact or terminal output.
const listed=JSON.parse(execFileSync(process.execPath,['node_modules/firebase-tools/lib/bin/firebase.js','functions:list','--project',project,'--json'],{encoding:'utf8',timeout:60000}));
const rows=Array.isArray(listed.result)?listed.result:listed.result?.functions;
assert(Array.isArray(rows),'Unknown CLI metadata format');
const functions=definitions.map(([name,region,min])=>{
 const item=rows.find(row=>row.id===name&&row.region===region);assert(item,'Missing deployed '+name);
 return {name,region,state:item.state||item.status||null,platform:item.platform,runtime:item.runtime,
  memoryMiB:item.availableMemoryMb??item.serviceConfig?.availableMemory??null,
  concurrency:item.concurrency??item.serviceConfig?.maxInstanceRequestConcurrency??null,
  minInstances:item.minInstances??item.serviceConfig?.minInstanceCount??0,expectedMinInstances:min};
});
const probes=[];
for(const [name,region]of definitions)for(const origin of ['https://localhost','https://app.hdconnect.net']){
 const url=`https://${region}-${project}.cloudfunctions.net/${name}`;
 for(const method of ['OPTIONS','GET',...(name.startsWith('customerPortalBootstrap')?['POST']:[])]){
  const started=performance.now();const response=await fetch(url,{method,headers:{Origin:origin,'Content-Type':'application/json',...(method==='OPTIONS'?{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}:{})},...(method==='POST'?{body:'{}'}:{}),signal:AbortSignal.timeout(20000)});
  probes.push({name,origin,method,status:response.status,allowOrigin:response.headers.get('access-control-allow-origin'),roundTripMs:performance.now()-started,
   expectedStatus:method==='OPTIONS'?204:method==='GET'?405:401});
  await response.arrayBuffer();
 }
}
const deploymentVerified=functions.every(row=>row.minInstances===row.expectedMinInstances)&&probes.every(p=>p.status===p.expectedStatus&&(p.allowOrigin===p.origin||p.allowOrigin==='*'));
const result={at:new Date().toISOString(),status:deploymentVerified?'DEPLOYMENT_VERIFIED_NOT_PERFORMANCE_ACCEPTANCE':'DEPLOYMENT_VERIFICATION_FAILED',functions,probes,
 scope:'Selected function metadata only; no environment/secret values exported. OPTIONS/GET and unauthenticated bootstrap rejection probe route/CORS/guard availability without reading business records or submitting a login. Probe timing is NOT real login or complete Home data latency.'};
await fs.writeFile(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(!deploymentVerified)process.exitCode=1;
