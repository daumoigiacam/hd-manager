import fs from'node:fs/promises';import{spawn}from'node:child_process';
import{assertVerificationFixtureReady}from'./helpers/verification-fixture-preflight.mjs';
const root='test-results/performance-upgrade-20261103',cohort='after-home-priority-v6-two',file=root+'/home-v6-login-distribution.json';
try{await fs.access(file);throw Error('Preserve existing distribution')}catch(error){if(error.code!=='ENOENT')throw error}
const r={at:new Date().toISOString(),status:'RUNNING',cohort,productionRequests:0,samples:[],conditions:'20 fictional manager logins, fresh app storage per trial; Android10/API29/WebView74, same local SDK/Auth/Firestore fixture. Not physical Android8–10 proof, WAN authentication, app-icon TTID, or cache-hit timing. Each failed/slow observation is preserved.'};
const save=()=>fs.writeFile(file,JSON.stringify(r,null,2));await save();
try{
 r.fixture=await assertVerificationFixtureReady({requiredRemainingMs:10*60000});
 for(let i=1;i<=20;i++){
  const label='final-distribution-20261104-'+String(i).padStart(2,'0');
  await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['scripts/upgrade-run-android-ab.mjs',cohort,'--startup-only','--fixture-rich','--paired-tap','--run-label='+label],{stdio:'inherit',windowsHide:true});p.once('error',reject);p.once('exit',code=>code===0?resolve():reject(Error('Observation failed: '+label)))});
  const path=root+'/android-'+cohort+'-'+label+'.json',a=JSON.parse(await fs.readFile(path));
  const sample={path,apk:a.installedApkSha256,uiMs:a.startup.interactiveMs,shellMs:a.startup.shellMs,dataMs:a.startup.dataReadyMs,kpis:a.homeKpis,pssKiB:a.after.processes.reduce((s,p)=>s+p.pssKb,0),heap:a.after.heap.usedSize,cpuSeconds:a.startupProcessCpu.values[0]?.cpuSeconds,longTasks:a.probe.longTaskCount,maxTaskMs:a.probe.maxTaskMs,errors:a.probe.errors,rejections:a.probe.rejections};r.samples.push(sample);await save();
  if(sample.errors.length||sample.rejections||JSON.stringify(sample.kpis)!==JSON.stringify(r.samples[0].kpis))throw Error('Financial or runtime regression');
 }
 const stats=key=>{const a=r.samples.map(x=>x[key]).sort((a,b)=>a-b);return{n:a.length,p50:a[Math.ceil(a.length*.5)-1],p95:a[Math.ceil(a.length*.95)-1],max:a.at(-1)}};
 r.summary=Object.fromEntries(['uiMs','shellMs','dataMs','pssKiB','heap','cpuSeconds','longTasks','maxTaskMs'].map(key=>[key,stats(key)]));
 r.targets={homeUi:r.summary.uiMs.p95<=200,criticalData:r.summary.dataMs.p95<=3000};r.status='MEASURED_SYNTHETIC_NOT_GLOBAL_ACCEPTANCE';
}catch(error){r.status='FAILED_INCOMPLETE_DISTRIBUTION';r.error=error.message;process.exitCode=1}finally{r.endedAt=new Date().toISOString();await save();console.log(JSON.stringify({status:r.status,summary:r.summary,targets:r.targets,error:r.error}))}
