// Existing QA service only; never calls an application/Firestore data endpoint.
import {createRequire} from 'node:module';import {readFile,writeFile} from 'node:fs/promises';
import {assertQaHeapService,prepareQaHeapPatch,verifyQaHeapPatch,qaHeapFunction,qaHeapOptions} from './helpers/employee-home-heap-config.mjs';
const require=createRequire(import.meta.url),root='test-results/perf-target-20261102/';
const mode=process.argv[2]||'inspect';if(!['inspect','apply','rollback'].includes(mode))throw Error('Explicit bounded QA mode required.');
// Suppress SDK debug text BEFORE any configuration request: it otherwise logs
// request/response bodies. Full environment values remain in process memory.
const {logger}=require('../node_modules/firebase-tools/lib/logger.js');logger.debug=()=>{};
try{
 const cli=require('firebase-tools');await cli.functions.list({project:'hd-manager-c5839',nonInteractive:true,json:true});
 const {Client}=require('../node_modules/firebase-tools/lib/apiv2.js'),api=new Client({urlPrefix:'https://cloudfunctions.googleapis.com',apiVersion:'v2',auth:true});
 const options={skipLog:{body:true,resBody:true}},get=async()=> (await api.get(qaHeapFunction,options)).body;
 const before=await get(),s=assertQaHeapService(before),summary={at:new Date(),mode,target:'employeeHomeBootstrapRegional',minInstances:0,maxInstances:1,concurrency:1,memoryMiB:512,cpu:1,
  nodeOptionsPresent:Object.hasOwn(s.environmentVariables,'NODE_OPTIONS'),nodeOptionsMatchCandidate:s.environmentVariables.NODE_OPTIONS===qaHeapOptions,authenticatedSourceCalls:0};
 if(mode==='inspect'){console.log(JSON.stringify(summary));await writeFile(root+'qa-heap-inspection.json',JSON.stringify(summary,null,2));process.exit(0)}
 const ledger=JSON.parse(await readFile(root+'employee-home-qa-request-ledger.json','utf8'));if(ledger.limit!==17||ledger.attempts.length!==17)throw Error('Unexpected source-read budget; this operation must not start data reads.');
 if(mode==='apply'){
  const baseline=JSON.parse(await readFile(root+'employee-home-runtime-shape-startup.json','utf8'));
  const shape=baseline.rows[0]?.runtimeShape,young=shape?.spaces?.find(s=>s.name==='new_space');
  if(!shape||shape.heapLimitMiB!==412||shape.constrainedMemoryMiB!==512||!young||young.sizeMiB>4||shape.flags.maxOldSpaceMiB!==409)throw Error('Actual Cloud small-nursery precondition not proven.');
 }
 const patch=prepareQaHeapPatch(before,mode);
 const operation=(await api.patch(qaHeapFunction,patch,{...options,queryParams:{updateMask:'serviceConfig.environmentVariables'}})).body;
 if(!/^projects\/hd-manager-c5839\/locations\/asia-southeast1\/operations\/[A-Za-z0-9_-]+$/.test(operation.name||''))throw Error('Unexpected QA operation identity.');
 const deadline=Date.now()+240000;let done=false;
 while(Date.now()<deadline){const op=(await api.get(operation.name,options)).body;if(op.done){if(op.error)throw Error('QA configuration operation failed.');done=true;break}await new Promise(resolve=>setTimeout(resolve,5000))}
 if(!done)throw Error('QA configuration operation unresolved; no data reads permitted.');
 const after=await get(),verification=verifyQaHeapPatch(before,after,mode),result={...summary,at:new Date(),...verification,nodeOptionsPresent:mode==='apply',nodeOptionsMatchCandidate:mode==='apply',scope:'Only NODE_OPTIONS on the existing QA function changed; no application invocation, Firebase data read/write, service resource increase or other function changed. Post-startup heap limit must be verified before any future data read. Runtime flags may require reapplying after a code deployment.'};
 await writeFile(root+'qa-heap-'+mode+'-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch{console.error('Bounded QA heap inspection/configuration failed; raw errors, environment and credentials suppressed. Inspect only sanitized operation records. No application data request started.');process.exitCode=1}
