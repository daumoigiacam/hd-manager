import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {assertVerificationFixtureReady} from './helpers/verification-fixture-preflight.mjs';
const root='test-results/performance-upgrade-20261103',file=root+'/home-transfer-v5-ab-20261104.json';
try{await fs.access(file);throw Error('Preserve previous observations')}catch(error){if(error.code!=='ENOENT')throw error}
const state={at:new Date().toISOString(),status:'WAITING_BUILD',runs:[],productionRequests:0,qualification:'Same Android10/WebView74, fictional Firebase Emulator data, clean application storage each run; local Auth is not production authentication latency. Three per variant is exploratory, not P95 or universal Android acceptance.'};
const save=()=>fs.writeFile(file,JSON.stringify(state,null,2));await save();
try{
 const deadline=Date.now()+15*60000;
 while(true){const log=await fs.readFile(root+'/build-home-priority-v5-admission-20261104.log','utf8');if(log.includes('BUILD FAILED'))throw Error('Build failed');if((log.match(/BUILD SUCCESSFUL/g)||[]).length===2)break;if(Date.now()>deadline)throw Error('Build deadline');await new Promise(r=>setTimeout(r,2000))}
 state.fixture=await assertVerificationFixtureReady();state.identities=[];
 for(const name of ['v5-two','v5-four']){
  const dir=root+'/after-home-priority-'+name,identity=JSON.parse(await fs.readFile(dir+'/capacitor-build-identity.json')),source=JSON.parse(await fs.readFile(dir+'/source-inputs.json'));
  if(identity.project!=='demo-hdm-perf-verification'||identity.featureFlags.homePriorityData!==true||!source.unchangedDuringBuild)throw Error('Unexpected source identity');
  state.identities.push({name,flags:identity.featureFlags,sourceHash:crypto.createHash('sha256').update(JSON.stringify(source.files)).digest('hex')});
 }
 if(state.identities[0].sourceHash!==state.identities[1].sourceHash)throw Error('Source changed between builds');
 state.status='RUNNING';await save();const counts={};
 for(const name of ['v5-two','v5-four','v5-four','v5-two','v5-two','v5-four']){
  counts[name]=(counts[name]||0)+1;const cohort='after-home-priority-'+name,label='transfer-v5-20261104-0'+counts[name];
  await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/upgrade-run-android-ab.mjs',cohort,'--startup-only','--fixture-rich','--paired-tap','--run-label='+label],{stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Driver failed '+name)))});
  const path=root+'/android-'+cohort+'-'+label+'.json',r=JSON.parse(await fs.readFile(path));
  state.runs.push({name,path,uiMs:r.startup.interactiveMs,dataMs:r.startup.dataReadyMs,kpis:r.homeKpis,pssKiB:r.after.processes.reduce((s,p)=>s+p.pssKb,0),heap:r.after.heap.usedSize,cpuSeconds:r.startupProcessCpu.values[0]?.cpuSeconds,longTasks:r.probe.longTaskCount,maxTaskMs:r.probe.maxTaskMs,errors:r.probe.errors,rejections:r.probe.rejections});await save();
 }
 if(state.runs.some(r=>JSON.stringify(r.kpis)!==JSON.stringify(state.runs[0].kpis)||r.errors.length||r.rejections))throw Error('Financial/runtime regression');
 const median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
 state.summary=['v5-two','v5-four'].map(name=>{const rows=state.runs.filter(r=>r.name===name);return{name,samples:rows.length,...Object.fromEntries(['uiMs','dataMs','pssKiB','heap','cpuSeconds','longTasks','maxTaskMs'].map(key=>[key,median(rows.map(r=>r[key]))]))}});
 state.status='MEASURED_NOT_ACCEPTANCE';
}catch(error){state.status='FAILED';state.error=error.message;process.exitCode=1}finally{state.endedAt=new Date().toISOString();await save();console.log(JSON.stringify({status:state.status,summary:state.summary,error:state.error}))}
