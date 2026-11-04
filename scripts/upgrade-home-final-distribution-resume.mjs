import fs from'node:fs/promises';import{spawn}from'node:child_process';import{assertVerificationFixtureReady}from'./helpers/verification-fixture-preflight.mjs';
const root='test-results/performance-upgrade-20261103',file=root+'/home-v6-login-20-completed.json';
try{await fs.access(file);throw Error('Preserve prior result')}catch(error){if(error.code!=='ENOENT')throw error}
const original=JSON.parse(await fs.readFile(root+'/home-v6-login-distribution.json'));
if(original.samples.length!==17||original.status!=='FAILED_INCOMPLETE_DISTRIBUTION'||original.error!=='Observation failed: final-distribution-20261104-18')throw Error('Unexpected predecessor; do not silently omit a failed app sample');
const r={...original,status:'RESUMING_AFTER_INFRASTRUCTURE_FAILURE',originalEvidence:root+'/home-v6-login-distribution.json',resumedAt:new Date().toISOString(),interruption:'ADB could not connect to daemon before setup attempt 18; no login or app observation existed for that attempt. Original failed controller/log preserved. Device remained same running emulator. Statistics are conditional on 20 completed app observations, NOT 100% uninterrupted test reliability.',setupAttempts:18};
delete r.error;delete r.endedAt;
const save=()=>fs.writeFile(file,JSON.stringify(r,null,2));await save();
try{
 const fixture=await assertVerificationFixtureReady({requiredRemainingMs:120000});if(fixture.businessSha256!==r.fixture.businessSha256)throw Error('Fixture changed across interruption');r.resumeFixture=fixture;
 for(let i=18;i<=20;i++){
  r.setupAttempts++;const label='final-distribution-resume-20261104-'+i;await save();
  await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['scripts/upgrade-run-android-ab.mjs',r.cohort,'--startup-only','--fixture-rich','--paired-tap','--run-label='+label],{stdio:'inherit',windowsHide:true});p.once('error',reject);p.once('exit',code=>code===0?resolve():reject(Error('Resumed observation failed '+i)))});
  const path=root+'/android-'+r.cohort+'-'+label+'.json',a=JSON.parse(await fs.readFile(path));
  if(a.installedApkSha256!==r.samples[0].apk||a.fixture.businessSha256!==r.fixture.businessSha256)throw Error('APK or fixture mismatch');
  const s={path,apk:a.installedApkSha256,uiMs:a.startup.interactiveMs,shellMs:a.startup.shellMs,dataMs:a.startup.dataReadyMs,kpis:a.homeKpis,pssKiB:a.after.processes.reduce((s,p)=>s+p.pssKb,0),heap:a.after.heap.usedSize,cpuSeconds:a.startupProcessCpu.values[0]?.cpuSeconds,longTasks:a.probe.longTaskCount,maxTaskMs:a.probe.maxTaskMs,errors:a.probe.errors,rejections:a.probe.rejections};r.samples.push(s);await save();
  if(s.errors.length||s.rejections||JSON.stringify(s.kpis)!==JSON.stringify(r.samples[0].kpis))throw Error('Runtime/financial regression');
 }
 const stats=key=>{const a=r.samples.map(x=>x[key]).sort((a,b)=>a-b);return{n:a.length,p50:a[Math.ceil(a.length*.5)-1],p95:a[Math.ceil(a.length*.95)-1],max:a.at(-1)}};r.summary=Object.fromEntries(['uiMs','shellMs','dataMs','pssKiB','heap','cpuSeconds','longTasks','maxTaskMs'].map(key=>[key,stats(key)]));
 r.targets={homeUi:r.summary.uiMs.p95<=200,criticalData:r.summary.dataMs.p95<=3000};r.status='TWENTY_COMPLETED_OBSERVATIONS_WITH_INFRASTRUCTURE_INTERRUPTION_NOT_GLOBAL_ACCEPTANCE';
}catch(error){r.status='RESUME_FAILED';r.error=error.message;process.exitCode=1}finally{r.endedAt=new Date().toISOString();await save();console.log(JSON.stringify({status:r.status,summary:r.summary,targets:r.targets,error:r.error}))}
