import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {assertNoActiveUpgradeSoak} from './helpers/upgrade-observation-barrier.mjs';
const root='test-results/performance-upgrade-20261103';
const resume=process.argv.includes('--resume');
const file=root+(resume?'/listener-verification-resume.json':'/listener-verification-controller.json');
try{await fs.access(file);throw Error('Controller record exists; do not rerun or overwrite')}catch(e){if(e.code!=='ENOENT')throw e}
const state={at:new Date().toISOString(),pid:process.pid,status:'WAITING_CURRENT_RETENTION',steps:[],productionRequests:0,realAccounts:false};
const write=()=>fs.writeFile(file,JSON.stringify(state,null,2));await write();
async function run(name,script,args=[]){
 await assertNoActiveUpgradeSoak();
 state.status=name;const log=root+'/controller-'+(resume?'resume-':'')+name+'.log',fd=await fs.open(log,'wx');
 const row={name,script,args,startedAt:new Date().toISOString(),log};state.steps.push(row);
 const child=spawn(process.execPath,[script,...args],{stdio:['ignore',fd.fd,fd.fd],windowsHide:true});row.pid=child.pid;await write();
 try{row.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});}finally{await fd.close();row.endedAt=new Date().toISOString();await write()}
 if(row.exitCode!==0)throw Error(name+' failed; inspect preserved log');
}
try{
 const deadline=Date.now()+12*60000;
 while(true){let current;try{current=JSON.parse(await fs.readFile(root+'/session-retention-after-listener-scope-ui-home-02.json','utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
  if(current?.endedAt){if(current.status!=='SIX_SESSION_RETENTION_DIAGNOSTIC_COMPLETE_NOT_SOAK_ACCEPTANCE'||current.sessions.length!==6)throw Error('Current six-session diagnostic did not finish cleanly');break}
  if(Date.now()>deadline)throw Error('Current diagnostic did not finish before controller deadline');await new Promise(r=>setTimeout(r,1000));
 }
 if(resume){
  const before=JSON.parse(await fs.readFile(root+'/session-retention-after-packet-16k-baseline-01.json','utf8'));
  const control=JSON.parse(await fs.readFile(root+'/native-listener-source-control.json','utf8'));
  const prior=JSON.parse(await fs.readFile(root+'/listener-verification-controller.json','utf8'));
  if(before.sessions.length!==6||before.status!=='SIX_SESSION_RETENTION_DIAGNOSTIC_COMPLETE_NOT_SOAK_ACCEPTANCE'||!control.expected||prior.status!=='FAILED_REVIEW_REQUIRED')throw Error('Resume requires preserved completed baseline and failed gate evidence');
  state.priorFailure={file:root+'/listener-verification-controller.json',error:prior.error,qualification:'Missing trusted clock is still invalid. New independent prearmed-window clock retains raw probe and verifies one real submit epoch. No observed APK/probe or App business code change.'};
 }else{
  await run('baseline-startup','scripts/upgrade-run-android-ab.mjs',['after-packet-16k','--startup-only','--fixture-rich','--run-label=retention-baseline-01']);
  await run('baseline-retention','scripts/upgrade-native-session-retention.mjs',['after-packet-16k','baseline-01']);
 }
 await run('restore-fixed-startup','scripts/upgrade-run-android-ab.mjs',['after-listener-scope','--startup-only','--fixture-rich','--run-label=before-natural-soak-'+(resume?'02':'01')]);
 await run('fixed-two-hour-soak','scripts/upgrade-android-listener-soak.mjs');
 const soak=JSON.parse(await fs.readFile(root+'/soak-listener-scope/sdk-soak-result.json','utf8'));
 if(!soak.state.endedAt||soak.state.elapsedMs<7200000)throw Error('Natural span did not reach two hours');
 state.status='OBSERVATIONS_COMPLETE_REVIEW_REQUIRED_NOT_PASS';state.span={elapsedMs:soak.state.elapsedMs,failures:soak.failures.length,reloads:soak.documentReloads.length,runtimeEvents:soak.runtimeEvents.length};
}catch(e){state.status='FAILED_REVIEW_REQUIRED';state.error=e.message;process.exitCode=1}
finally{state.endedAt=new Date().toISOString();await write();console.log(JSON.stringify({status:state.status,error:state.error,span:state.span}))}
