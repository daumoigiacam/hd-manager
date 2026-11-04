import fs from 'node:fs/promises';import {spawn} from 'node:child_process';import crypto from 'node:crypto';
import {assertVerificationFixtureReady} from './helpers/verification-fixture-preflight.mjs';
const runSet=process.argv[2]||'';if(runSet&&!/^[a-z0-9-]+$/.test(runSet))throw Error('Invalid run set');const suffix=runSet?'-'+runSet:'';
const root='test-results/performance-upgrade-20261103',file=root+'/home-priority-ab-20261104'+suffix+'.json';
const state={at:new Date().toISOString(),status:'WAITING_FOR_BUILDS',productionRequests:0,realAccounts:false,runs:[],conditions:'Android10/WebView74 synthetic SDK fixture. Fresh application storage per trial; already-warm local Firestore Emulator. Control waits for full existing Home report; primary variants publish matching four financial cards/line chart from complete critical sources and leave detailed analytics unopened. No claim that critical-ready equals all-history-ready. Three samples per variant are not P95 or all-device acceptance.'};
const save=()=>fs.writeFile(file,JSON.stringify(state,null,2));await save();
try{
 const deadline=Date.now()+15*60000;
 while(true){const a=await fs.readFile(root+'/build-home-priority-pair-20261104.log','utf8'),b=await fs.readFile(root+'/build-home-priority-four-20261104.log','utf8');if(a.includes('BUILD FAILED')||b.includes('BUILD FAILED'))throw Error('Native build failed');if((a.match(/BUILD SUCCESSFUL/g)||[]).length===2&&b.includes('BUILD SUCCESSFUL'))break;if(Date.now()>deadline)throw Error('Build wait deadline');await new Promise(r=>setTimeout(r,2000))}
 state.fixture=await assertVerificationFixtureReady();state.identities=[];
 for(const name of ['control','primary','four']){const dir=root+'/after-home-priority-'+name,identity=JSON.parse(await fs.readFile(dir+'/capacitor-build-identity.json')),source=JSON.parse(await fs.readFile(dir+'/source-inputs.json'));if(identity.project!=='demo-hdm-perf-verification'||identity.featureFlags.homePriorityData!==(name!=='control')||identity.featureFlags.workerInitialConcurrency!==(name==='four'?'4':'2')||!source.unchangedDuringBuild)throw Error('Unexpected source/feature identity');state.identities.push({name,identity,sourceSha256:crypto.createHash('sha256').update(JSON.stringify(source.files)).digest('hex')})}
 if(new Set(state.identities.map(x=>x.sourceSha256)).size!==1)throw Error('A/B source mismatch');
 state.status='RUNNING_ALTERNATING_AB';await save();const counts={control:0,primary:0,four:0};
 for(const name of ['control','primary','four','four','primary','control','primary','control','four']){
  const label='home-priority-ab-20261104'+suffix+'-0'+(++counts[name]),cohort='after-home-priority-'+name;
  await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/upgrade-run-android-ab.mjs',cohort,'--startup-only','--fixture-rich','--paired-tap','--run-label='+label],{stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Driver failure: '+name))) });
  const path=root+'/android-'+cohort+'-'+label+'.json',r=JSON.parse(await fs.readFile(path));
  state.runs.push({variant:name,file:path,interactiveMs:r.startup.interactiveMs,dataReadyMs:r.startup.dataReadyMs,kpis:r.homeKpis,pssKb:r.after.processes.reduce((n,p)=>n+p.pssKb,0),jsHeapBytes:r.after.heap.usedSize,cpuSeconds:r.startupProcessCpu.values[0]?.cpuSeconds,longTasks:r.probe.longTaskCount,maxTaskMs:r.probe.maxTaskMs,errors:r.probe.errors,rejections:r.probe.rejections});await save();
 }
 const oracle=JSON.stringify(state.runs[0].kpis);if(state.runs.some(r=>JSON.stringify(r.kpis)!==oracle||r.errors.length||r.rejections))throw Error('Financial or runtime regression');
 const median=xs=>xs.sort((a,b)=>a-b)[Math.floor(xs.length/2)];state.summary=['control','primary','four'].map(variant=>{const rows=state.runs.filter(r=>r.variant===variant);return{variant,samples:rows.length,...Object.fromEntries(['interactiveMs','dataReadyMs','pssKb','jsHeapBytes','cpuSeconds','longTasks','maxTaskMs'].map(key=>[key,median(rows.map(r=>r[key]))]))}});state.status='MEASURED_NOT_GLOBAL_ACCEPTANCE';
}catch(error){state.status='FAILED';state.error=error.message;process.exitCode=1}finally{state.endedAt=new Date().toISOString();await save();console.log(JSON.stringify({status:state.status,summary:state.summary,error:state.error}))}
