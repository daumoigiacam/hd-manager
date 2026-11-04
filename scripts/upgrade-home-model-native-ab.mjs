import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {assertVerificationFixtureReady} from './helpers/verification-fixture-preflight.mjs';
const root='test-results/performance-upgrade-20261103',secondResume=process.argv.includes('--resume-after-second-interruption'),resuming=secondResume||process.argv.includes('--resume-after-setup-interruption'),file=root+(secondResume?'/home-model-native-ab-v13-resumed2.json':resuming?'/home-model-native-ab-v13-resumed.json':'/home-model-native-ab-v13.json');
try{await fs.access(file);throw Error('Preserve prior distribution')}catch(error){if(error.code!=='ENOENT')throw error}
const variants={control:'after-home-model-control-v11',pilot:'after-home-model-pilot-v13'};
const expected={revenue:120000000,expense:7018800000,profit:-6898800000,receivables:80000000};
const state={at:new Date().toISOString(),status:'RUNNING',attempts:[],productionRequests:0,realAccounts:false,
 qualification:'Alternating actual release-like diagnostic APKs on the same owned Android10/WebView74, supported Vietnam reporting timezone, same fictional dataset. Fresh application storage per attempt, warm local Auth/Firestore/Node services. Pilot has four-card/line-only capabilities and no production event bridge; does not certify all roles/modules, app-icon TTID or WAN auth. Old sampled clock and additional event-driven clock stay separate.'};
const save=()=>fs.writeFile(file,JSON.stringify(state,null,2));await save();
try{
 state.fixture=await assertVerificationFixtureReady({requiredRemainingMs:15*60000});
 const service=JSON.parse(await fs.readFile(root+'/home-model-native-service-02/status.json'));
 if(service.status!=='READY_LOCAL_QA'||service.project!=='demo-hdm-home-projection-local'||service.expiresAt-Date.now()<15*60000)throw Error('Owned prototype service unavailable/expiring');
 const counts={control:0,pilot:0};
 if(resuming){const priorFile=root+(secondResume?'/home-model-native-ab-v13-resumed.json':'/home-model-native-ab-v13.json'),prior=JSON.parse(await fs.readFile(priorFile));
  if(prior.status!=='FAILED_OR_INTERRUPTED_NOT_PASS'||!prior.error?.includes(secondResume?'clean-ab-resumed-control-12':'clean-ab-pilot-04')||prior.attempts.filter(row=>row.completedAt).length!==(secondResume?23:6))throw Error('Unexpected prior interruption; review before resuming');
  state.priorInterruption={file:priorFile,status:prior.status,error:prior.error,previous:prior.priorInterruption,qualification:'Preserved ADB command timeouts before trusted login. Completed-observation distribution is conditional, not uninterrupted reliability; no timeout or measurement criterion was relaxed.'};
  state.attempts=prior.attempts;for(const row of state.attempts)if(row.completedAt)counts[row.variant]++;
 }
 const schedule=Array.from({length:20},(_,pair)=>pair%2?['pilot','control']:['control','pilot']).flat();
 for(let position=counts.control+counts.pilot;position<schedule.length;position++){
  const variant=schedule[position],cohort=variants[variant],label='clean-ab-'+(secondResume?'resumed2-':resuming?'resumed-':'')+variant+'-'+String(++counts[variant]).padStart(2,'0');
  const attempt={variant,cohort,label,startedAt:new Date().toISOString()};state.attempts.push(attempt);await save();
  await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/upgrade-run-android-ab.mjs',cohort,'--startup-only','--fixture-rich','--paired-tap','--run-label='+label],{stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',code=>{attempt.exitCode=code;code===0?resolve():reject(Error('Native attempt failed: '+label))})});
  const source=root+'/android-'+cohort+'-'+label+'.json',r=JSON.parse(await fs.readFile(source));
  const values=Object.fromEntries(r.homeKpis.map(row=>[row.metric,Number(row.title.replace(/[^0-9-]/g,''))]));
  if(Object.keys(expected).some(key=>values[key]!==expected[key]))throw Error('Four financial cards failed exact oracle: '+label);
  if(r.probe.errors.length||r.probe.rejections)throw Error('Native JavaScript failure: '+label);
  if(variant==='pilot'&&(r.homeReadModelPilot?.ready!=='true'||r.homeReadModelPilot.result!=='published'))throw Error('Pilot trial is not a genuine projection miss: '+label);
  if(!Number.isFinite(r.eventDrivenHomeClock?.uiMs)||!Number.isFinite(r.eventDrivenHomeClock?.dataMs))throw Error('Event paint witness missing');
  Object.assign(attempt,{completedAt:new Date().toISOString(),source,apkSha256:r.installedApkSha256,oracle:values,
   sampledUiMs:r.startup.interactiveMs,sampledDataMs:r.startup.dataReadyMs,eventUiMs:r.eventDrivenHomeClock.uiMs,eventDataMs:r.eventDrivenHomeClock.dataMs,
   pssKiB:r.after.processes.reduce((sum,p)=>sum+p.pssKb,0),jsHeapBytes:r.after.heap.usedSize,cpuSeconds:r.startupProcessCpu.values[0].cpuSeconds,
   longTasks:r.probe.longTaskCount,maxTaskMs:r.probe.maxTaskMs,model:r.homeReadModelPilot,workerCollections:Object.keys(r.workerTransferAtStartup?.perCollection||{})});await save();
 }
 const summary=rows=>Object.fromEntries(['sampledUiMs','sampledDataMs','eventUiMs','eventDataMs','pssKiB','jsHeapBytes','cpuSeconds','longTasks','maxTaskMs'].map(key=>{
  const a=rows.map(row=>row[key]).sort((a,b)=>a-b);return[key,{n:a.length,p50:a[Math.ceil(a.length*.5)-1],p95:a[Math.ceil(a.length*.95)-1],max:a.at(-1)}]}));
 state.summary=Object.fromEntries(Object.keys(variants).map(variant=>[variant,summary(state.attempts.filter(row=>row.variant===variant&&row.completedAt))]));
 state.status=resuming?'FORTY_COMPLETED_WITH_PRESERVED_SETUP_INTERRUPTION_NOT_GLOBAL_ACCEPTANCE':'FORTY_COMPLETED_LOCAL_NATIVE_OBSERVATIONS_NOT_GLOBAL_ACCEPTANCE';
 state.targets={pilotHomeUiP95Pass:state.summary.pilot.eventUiMs.p95<=200,pilotDataP95Pass:state.summary.pilot.eventDataMs.p95<=3000,
  qualification:'Declared event-driven two-frame witness. Also inspect the retained sampled clock. Not every-device, all-role or production acceptance.'};
}catch(error){state.status='FAILED_OR_INTERRUPTED_NOT_PASS';state.error=error.message;process.exitCode=1}
finally{state.endedAt=new Date().toISOString();await save();console.log(JSON.stringify({status:state.status,summary:state.summary,targets:state.targets,error:state.error}))}
