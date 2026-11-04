import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {assertNoActiveUpgradeSoak} from './helpers/upgrade-observation-barrier.mjs';
const root='test-results/performance-upgrade-20261103',file=root+'/native-listener-pilot-controller.json';
try{await fs.access(file);throw Error('Preserve existing controller evidence')}catch(error){if(error.code!=='ENOENT')throw error}
const state={at:new Date().toISOString(),pid:process.pid,status:'WAITING_POSTSPAN_HEAP_AND_MACROS',steps:[],productionRequests:0,realAccounts:false};
const save=()=>fs.writeFile(file,JSON.stringify(state,null,2));await save();
async function run(name,args,{executable=process.execPath,required=true}={}){
 await assertNoActiveUpgradeSoak();
 const log=root+'/native-pilot-'+name+'.log',fd=await fs.open(log,'wx');
 const row={name,args,log,startedAt:new Date().toISOString()};state.status=name;state.steps.push(row);
 const child=spawn(executable,args,{stdio:['ignore',fd.fd,fd.fd],windowsHide:true});row.pid=child.pid;await save();
 try{row.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)})}
 finally{await fd.close();row.endedAt=new Date().toISOString();await save()}
 if(required&&row.exitCode!==0)throw Error(name+' failed; keep raw failure and inspect before continuing');
}
try{
 const deadline=Date.now()+4*3600000;
 while(true){
  const post=JSON.parse(await fs.readFile(root+'/listener-postspan-resume-controller.json'));
  if(post.endedAt){
   if(post.status!=='OBSERVATIONS_COMPLETE_REVIEW_REQUIRED_NOT_PASS')throw Error('Postspan controller failed; preserve device for review');
   const heap=JSON.parse(await fs.readFile(root+'/post-listener-scope-heap-status.json'));
   if(heap.status!=='POST_SPAN_RETENTION_CAPTURED_NOT_LEAK_ACCEPTANCE')throw Error('Require completed same-APK retention evidence');
   break;
  }
  if(Date.now()>deadline)throw Error('Postspan controller deadline');await new Promise(resolve=>setTimeout(resolve,5000));
 }
 await run('native-tap-calibration',['scripts/upgrade-native-tap-ack-calibration.mjs','after-listener-scope','protocol-01'],{required:false});
 await run('staff-network-before',['scripts/upgrade-run-android-ab.mjs','after-listener-scope','--startup-only','--fixture-rich','--network-diagnostic','--run-label=identity-network-01']);
 await run('baseline-map',['scripts/upgrade-native-listener-map-pilot.mjs','after-listener-scope','public-sdk-01']);
 await run('customer-network-before',['scripts/upgrade-android-customer-startup.mjs','after-listener-scope','portal-01','--network-diagnostic'],{required:false});
 await run('build-patch',['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/upgrade-build-native-listener-pilot.ps1'],{executable:'powershell.exe'});
 await run('verify-patch-asset',['scripts/upgrade-verify-native-listener-assets.mjs']);
 await run('staff-network-after',['scripts/upgrade-run-android-ab.mjs','after-native-listener-release','--startup-only','--fixture-rich','--network-diagnostic','--run-label=identity-network-01']);
 await run('patched-map',['scripts/upgrade-native-listener-map-pilot.mjs','after-native-listener-release','public-sdk-01']);
 await run('patched-six-session-retention',['scripts/upgrade-native-session-retention.mjs','after-native-listener-release','public-sdk-01']);
 await run('reports',['scripts/upgrade-write-verification-report.mjs']);
 state.status='PILOT_OBSERVATIONS_COMPLETE_REVIEW_REQUIRED_NOT_PASS';
}catch(error){state.status='FAILED_REVIEW_REQUIRED';state.error=error.message;process.exitCode=1}
finally{state.endedAt=new Date().toISOString();await save();console.log(JSON.stringify({status:state.status,error:state.error}))}
