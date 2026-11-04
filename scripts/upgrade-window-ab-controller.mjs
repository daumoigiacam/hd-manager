import fs from 'node:fs/promises';import {spawn,execFileSync} from 'node:child_process';import crypto from 'node:crypto';
import {assertVerificationFixtureReady} from './helpers/verification-fixture-preflight.mjs';
const root='test-results/performance-upgrade-20261103',statusFile=root+'/window-ab-controller-20261104.json';
const state={at:new Date().toISOString(),status:'WAITING_FOR_BOTH_BUILDS',runs:[],productionRequests:0,realAccounts:false};
const save=()=>fs.writeFile(statusFile,JSON.stringify(state,null,2));await save();
try{
 const deadline=Date.now()+12*60000;
 while(true){
  const log=await fs.readFile(root+'/build-window-pair-20261104.log','utf8');
  if((log.match(/BUILD SUCCESSFUL/g)||[]).length===2)break;
  if(log.includes('BUILD FAILED'))throw Error('A/B APK build failed');
  if(Date.now()>deadline)throw Error('Builds did not finish within bounded wait');
  await new Promise(resolve=>setTimeout(resolve,2000));
 }
 state.fixture=await assertVerificationFixtureReady();
 const identities=[];for(const n of [1,2]){
  const dir=root+'/after-window-'+n,identity=JSON.parse(await fs.readFile(dir+'/capacitor-build-identity.json')),inputs=JSON.parse(await fs.readFile(dir+'/source-inputs.json'));
  if(identity.featureFlags.workerTransferWindow!==String(n)||identity.project!=='demo-hdm-perf-verification'||inputs.unchangedDuringBuild!==true)throw Error('Incorrect isolated source/flag identity');
  identities.push({window:n,identity,inputsSha256:crypto.createHash('sha256').update(JSON.stringify(inputs.files)).digest('hex')});
 }
 if(identities[0].inputsSha256!==identities[1].inputsSha256)throw Error('A/B application sources differ');state.identities=identities;
 state.environment={adb:execFileSync('D:/HD-DEV/android/sdk/platform-tools/adb.exe',['devices','-l'],{encoding:'utf8',windowsHide:true}),condition:'Fresh app storage per trial. Local service warmed by earlier trials. Pixel4_2 relaunched Nov4 with host GPU/no window; no comparisons attributed to application code across emulator reboot. Three samples per variant, not P95 or real-device acceptance.'};
 state.status='RUNNING_ALTERNATING_AB';await save();
 const counters={1:0,2:0};for(const n of [1,2,2,1,1,2]){
  const label='window-ab-20261104-0'+(++counters[n]),cohort='after-window-'+n;
  await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/upgrade-run-android-ab.mjs',cohort,'--startup-only','--fixture-rich','--paired-tap','--run-label='+label],{stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('A/B driver failed: '+cohort+'/'+label)))});
  const file=root+'/android-'+cohort+'-'+label+'.json',r=JSON.parse(await fs.readFile(file));
  state.runs.push({window:n,file,apk:r.installedApkSha256,interactiveMs:r.startup.interactiveMs,dataReadyMs:r.startup.dataReadyMs,pssKb:r.after.processes.reduce((s,p)=>s+p.pssKb,0),jsHeapBytes:r.after.heap.usedSize,cpuSeconds:r.startupProcessCpu.values[0]?.cpuSeconds,longTasks:r.probe.longTaskCount,maxTaskMs:r.probe.maxTaskMs,kpis:r.homeKpis});await save();
 }
 const expected=JSON.stringify(state.runs[0].kpis);if(state.runs.some(r=>JSON.stringify(r.kpis)!==expected))throw Error('A/B financial correctness mismatch');
 const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];state.summary=[1,2].map(n=>{const rows=state.runs.filter(r=>r.window===n);return{window:n,samples:rows.length,...Object.fromEntries(['interactiveMs','dataReadyMs','pssKb','jsHeapBytes','cpuSeconds','longTasks','maxTaskMs'].map(key=>[key,median(rows.map(r=>r[key]))]))}});
 state.status='AB_COMPLETE_NOT_ACCEPTANCE';
}catch(error){state.status='FAILED';state.error=error.message;process.exitCode=1}finally{state.endedAt=new Date().toISOString();await save();console.log(JSON.stringify({status:state.status,summary:state.summary,error:state.error}))}
