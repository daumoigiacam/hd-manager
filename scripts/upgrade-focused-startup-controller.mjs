import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
const root='test-results/performance-upgrade-20261103',file=root+'/focused-startup-controller.json';
const state={at:new Date().toISOString(),pid:process.pid,status:'WAITING_CURRENT_NATURAL_SPAN',steps:[],productionRequests:0,reason:'Replace repeated install/benchmark loops with retained-memory evidence and one targeted startup CPU/network trace.'};
await fs.writeFile(file,JSON.stringify(state,null,2),{flag:'wx'});
async function save(){await fs.writeFile(file,JSON.stringify(state,null,2))}
async function run(name,args,required=true){
 const log=root+'/focused-'+name+'.log',fd=await fs.open(log,'wx'),step={name,args,log,startedAt:new Date().toISOString()};state.steps.push(step);state.status=name;
 const child=spawn(process.execPath,args,{stdio:['ignore',fd.fd,fd.fd],windowsHide:true});step.pid=child.pid;await save();
 try{step.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)})}finally{await fd.close();step.endedAt=new Date().toISOString();await save()}
 if(required&&step.exitCode!==0)throw Error(name+' failed; preserve current APK and inspect original evidence');
}
try{
 const deadline=Date.now()+3600000;
 while(true){
  let span;try{span=JSON.parse(await fs.readFile(root+'/soak-listener-scope/sdk-soak-result.json'))}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error}
  if(span?.state.endedAt){if(span.state.elapsedMs<7200000)throw Error('Natural span incomplete');break}
  if(Date.now()>deadline)throw Error('Natural span deadline');await new Promise(resolve=>setTimeout(resolve,5000));
 }
 await run('same-apk-heap',['scripts/upgrade-post-listener-heap.mjs']);
 await run('heap-analysis',['--max-old-space-size=2048','scripts/upgrade-analyze-native-retention.mjs','--listener-scope']);
 await run('soak-analysis',['scripts/upgrade-summarize-soak.mjs','soak-listener-scope']);
 await run('tap-protocol',['scripts/upgrade-native-tap-ack-calibration.mjs','after-listener-scope','protocol-01'],false);
 const proof=JSON.parse(await fs.readFile(root+'/native-tap-ack-after-listener-scope-protocol-01.json'));
 const paired=proof.status==='NATIVE_PAIRED_TAP_PROTOCOL_VERIFIED_NOT_APP_BENEFIT'?['--paired-tap']:[];
 await run('one-startup-trace',['scripts/upgrade-run-android-ab.mjs','after-listener-scope','--startup-only','--fixture-rich','--network-diagnostic','--profile-startup','--run-label=focused-startup-cpu-01',...paired]);
 await run('reports',['scripts/upgrade-write-verification-report.mjs']);
 state.status='TARGETED_EVIDENCE_READY_FOR_FIX_NOT_ACCEPTANCE';
}catch(error){state.status='FAILED_REVIEW_REQUIRED';state.error=error.message;process.exitCode=1}
finally{state.endedAt=new Date().toISOString();await save();console.log(JSON.stringify({status:state.status,error:state.error}))}
