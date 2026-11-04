import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
import {findOwnedWebViewRendererPids} from './helpers/android-renderer-ownership.mjs';
import {observationCoverage} from '../performance/phase2-verification/soak-analysis.mjs';
const root='test-results/phase2-verification-20261102',pkg='com.hdmanager.caplab.diag',adb='D:/HD-DEV/android/sdk/platform-tools/adb.exe';
// Refuse to attach or collect garbage until the actual continuous cohort ended.
const cohort=JSON.parse(await fs.readFile(`${root}/sdk-soak-result.json`,'utf8'));
if(cohort.state.status!=='TWO_HOUR_OBSERVATION_COMPLETE_NOT_ACCEPTANCE'||cohort.state.elapsedMs<7200000||!observationCoverage(cohort.samples,cohort.state.elapsedMs).observedWithoutLargeGaps)throw Error('Natural two-hour observation incomplete; post-soak GC diagnostic refused');
const shell=(...args)=>execFileSync(adb,['-s','emulator-5554','shell',...args],{encoding:'utf8',windowsHide:true,timeout:20000});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let cdp;
const result={at:new Date().toISOString(),package:pkg,status:'STARTING',naturalCohortEndedAt:cohort.state.endedAt,
 qualification:'Separate post-soak diagnostic. Explicit GC changes memory behavior; these samples are NEVER used as natural-soak RAM, optimization savings or interaction acceptance.',errors:[]};
async function snapshot(label){
 const pidText=shell('pidof',pkg).trim();if(!/^[1-9]\d*$/.test(pidText))throw Error('Synthetic app PID unavailable');
 const appPid=Number(pidText);if(appPid!==cohort.samples.at(-1).appPid)throw Error('Native PID changed since soak; snapshots would not be comparable');
 const renderers=findOwnedWebViewRendererPids(shell('dumpsys','activity','services',pkg),pkg,appPid),expected=cohort.samples.at(-1).processes.filter(p=>p.kind==='owned-renderer').map(p=>p.pid);
 if(!expected.length||expected.some(pid=>!renderers.includes(pid)))throw Error('Renderer ownership changed since soak');
 const value={label,at:new Date().toISOString(),heap:await cdp.send('Runtime.getHeapUsage'),dom:await cdp.send('Memory.getDOMCounters'),processes:[]};
 for(const pid of [appPid,...renderers]){
  const mem=shell('dumpsys','meminfo',String(pid)),proc=shell('cat',`/proc/${pid}/status`),number=(text,pattern)=>{const match=text.match(pattern);return match?Number(match[1]):null};
  value.processes.push({pid,totalPssKb:number(mem,/TOTAL:\s*(\d+)/),rssKb:number(proc,/^VmRSS:\s*(\d+)/m)});
 }
 return value;
}
async function inspectWorkerTargets(){
 const sessions=new Map(),value={status:'NOT_VERIFIED',targets:[],errors:[]};
 const off=cdp.onEvent(event=>{if(event.method==='Target.attachedToTarget'&&event.params.targetInfo?.type==='worker')sessions.set(event.params.sessionId,event.params.targetInfo)});
 try{
  await cdp.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false});await wait(1000);
  for(const [sessionId,info] of sessions){
   if(!/^(https:\/\/localhost\/|blob:https:\/\/localhost\/)/.test(info.url||''))continue;
   let stop,timer;
   try{
    const heap=await new Promise((resolve,reject)=>{
     timer=setTimeout(()=>reject(Error('Worker heap reply timeout')),3000);
     stop=cdp.onEvent(event=>{if(event.method!=='Target.receivedMessageFromTarget'||event.params.sessionId!==sessionId)return;const data=JSON.parse(event.params.message);if(data.id===8081)data.error?reject(Error(JSON.stringify(data.error))):resolve(data.result)});
     cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:8081,method:'Runtime.getHeapUsage'})}).catch(reject);
    });value.targets.push({targetId:info.targetId,type:info.type,...heap});
   }catch(error){value.errors.push(error.message)}finally{clearTimeout(timer);stop?.()}
  }
  value.advertisedWorkerTargets=sessions.size;value.status=value.targets.length?'SINGLE_POST_SOAK_OBSERVATION_NOT_A_TWO_HOUR_TREND':'NO_ELIGIBLE_TARGETS_NOT_VERIFIED';
 }catch(error){value.errors.push(error.message)}
 finally{off();try{await cdp.send('Target.setAutoAttach',{autoAttach:false,waitForDebuggerOnStart:false})}catch{/* unavailable */}}
 return value;
}
try{
 cdp=await connectAndroidWebView({adb,serial:'emulator-5554',packageName:pkg,port:9241});
 result.before=await snapshot('after-two-hour-natural-soak-before-explicit-GC');
 await cdp.send('HeapProfiler.collectGarbage');await wait(500);
 result.after=await snapshot('post-explicit-GC-diagnostic-only');
 result.usedHeapDifferenceBytes=result.before.heap.usedSize-result.after.heap.usedSize;
 result.workerProbe=await inspectWorkerTargets();result.status='POST_SOAK_GC_DIAGNOSTIC_RECORDED_NOT_LEAK_PROOF';
}catch(error){result.status='NOT_VERIFIED';result.errors.push(error.message)}
finally{cdp?.close();result.endedAt=new Date().toISOString();await fs.writeFile(`${root}/post-soak-diagnostic.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
