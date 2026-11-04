import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import {findOwnedWebViewRendererPids} from './helpers/android-renderer-ownership.mjs';
const adb='D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial='emulator-5554',pkg='com.hdmanager.perflab';
const root='test-results/phase2-performance-20261102';
const minutes=Number(process.env.HD_PHASE2_NATIVE_MINUTES||120);
if(!Number.isSafeInteger(minutes)||minutes<1||minutes>125)throw Error('Invalid duration');
const call=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',timeout:20000,windowsHide:true});
const shell=(...args)=>call('shell',...args);
const start=Date.now(),samples=[],launches=[],lifecycle=[];
shell('am','force-stop',pkg);
launches.push({at:Date.now(),result:shell('am','start','-W','-n',pkg+'/.MainActivity','--ez','soak','true')});
const identity={api:shell('getprop','ro.build.version.sdk').trim(),model:shell('getprop','ro.product.model').trim(),
 webview:shell('dumpsys','webviewupdate').match(/Current WebView package[^\n]*/)?.[0]??null,
 package:pkg,realAccounts:false,fixture:'1000 customers,1000 products,200 orders,200 expenses; fabricated',
 apkKind:'non-debuggable profileable synthetic WebView container, NOT full Capacitor release',clockTicks:shell('getconf','CLK_TCK').trim()};
const parseMem=(raw)=>{
 const summary=raw.split('App Summary')[1]||'';
 const native=raw.split(/\r?\n/).find(line=>/^\s*Native Heap\s+\d/.test(line));
 const values=native?.trim().split(/\s+/).slice(2).map(Number);
 return {totalPssKb:Number(summary.match(/TOTAL:\s*(\d+)/)?.[1])||null,
  nativeHeapPssKb:Number(summary.match(/Native Heap:\s*(\d+)/)?.[1])||null,
  nativeHeapAllocatedKb:values?.length>=3?values.at(-2):null,
  javaHeapPssKb:Number(summary.match(/Java Heap:\s*(\d+)/)?.[1])||null,
  graphicsPssKb:summary.match(/Graphics:\s*(\d+)/)?Number(summary.match(/Graphics:\s*(\d+)/)[1]):null,
  bitmapBytes:null,bitmapReason:'Graphics PSS is not bitmap memory; no bitmap allocation profiler attached',
 };
};
await fs.writeFile(`${root}/native-run.json`,JSON.stringify({status:'RUNNING',identity,startedAt:new Date(start).toISOString(),requestedMs:minutes*60000,pid:process.pid},null,2));
try{
 for(let i=0;Date.now()-start<minutes*60000;i++){
  const at=Date.now(),sample={elapsedMs:at-start,processes:[]};
  try{
   const pid=Number(shell('pidof',pkg).trim());
   sample.appPid=pid;
   const renderers=findOwnedWebViewRendererPids(shell('dumpsys','activity','services',pkg),pkg,pid);
   sample.ownershipKnown=renderers.length>0;
   for(const ownPid of [pid,...renderers]){
    const mem=parseMem(shell('dumpsys','meminfo',String(ownPid)));
    const status=shell('cat',`/proc/${ownPid}/status`),stat=shell('cat',`/proc/${ownPid}/stat`);
    const fields=stat.slice(stat.lastIndexOf(')')+2).split(/\s+/);
    sample.processes.push({pid:ownPid,kind:ownPid===pid?'native-main':'owned-renderer',...mem,
     rssKb:Number(status.match(/^VmRSS:\s*(\d+)/m)?.[1])||null,
     userTicks:Number(fields[11]),systemTicks:Number(fields[12]),workerHeapBytes:null,
     workerHeapReason:'No per-worker heap target in non-debuggable run; preview read worker is mocked'});
   }
   if(i>0&&i%40===0){ // about every 10 min; preserve app, no data clear/reload
    shell('input','keyevent','KEYCODE_HOME');await new Promise(r=>setTimeout(r,5000));
    shell('am','start','-n',pkg+'/.MainActivity');lifecycle.push({elapsedMs:Date.now()-start,action:'background-5s-foreground'});
   }
  }catch(error){sample.error=String(error.message).slice(0,200)}
  samples.push(sample);
  const log=shell('logcat','-d','-v','brief','-s','HDPerfLab:I');
  const observedPids=new Set(samples.map(row=>row.appPid).filter(Boolean));
  const events=log.split(/\r?\n/).filter(line=>observedPids.has(Number(line.match(/HDPerfLab\(\s*(\d+)\)/)?.[1]))).map(line=>{try{return JSON.parse(line.slice(line.indexOf('{')))}catch{return null}}).filter(Boolean);
  await fs.writeFile(`${root}/native-memory-progress.json`,JSON.stringify({status:'RUNNING',identity,startedAt:new Date(start).toISOString(),elapsedMs:Date.now()-start,requestedMs:minutes*60000,samples,events,lifecycle,launches},null,2));
  await new Promise(r=>setTimeout(r,Math.max(1,15000-(Date.now()-at))));
 }
}finally{
 const elapsedMs=Date.now()-start;
 await fs.writeFile(`${root}/native-memory-result.json`,JSON.stringify({status:elapsedMs>=minutes*60000?'OBSERVATION_COMPLETE_NOT_LEAK_PROOF':'INCOMPLETE',identity,elapsedMs,requestedMs:minutes*60000,samples,lifecycle,launches},null,2));
 await fs.writeFile(`${root}/native-run.json`,JSON.stringify({status:'STOPPED',elapsedMs,pid:process.pid},null,2));
}
