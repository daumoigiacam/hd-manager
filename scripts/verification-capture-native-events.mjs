import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const root='test-results/phase2-verification-20261102';
const cohort=JSON.parse(await fs.readFile(`${root}/sdk-soak-result.json`,'utf8'));
if(cohort.state.status!=='TWO_HOUR_OBSERVATION_COMPLETE_NOT_ACCEPTANCE'||cohort.state.elapsedMs<7200000)throw Error('Do not mix partial observation with final native events');
const pids=new Set(cohort.samples.map(s=>s.appPid).filter(Number.isFinite));
const log=execFileSync('D:/HD-DEV/android/sdk/platform-tools/adb.exe',['-s','emulator-5554','shell','logcat','-d','-v','brief','-s','HDVerify:I'],{encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:16*1024*1024});
const events=[];
for(const line of log.split(/\r?\n/)) {
 const pid=Number(line.match(/HDVerify\(\s*(\d+)\)/)?.[1]);if(!pids.has(pid))continue;
 try{const event=JSON.parse(line.slice(line.indexOf('{')));events.push({pid,...event})}catch{/* non-payload line */}
}
const origin=cohort.samples[0].documentOrigin,start=Date.parse(cohort.state.startedAt),end=Date.parse(cohort.state.endedAt);
const longTasks=events.filter(e=>e.kind==='long-task'&&Number.isFinite(e.start)&&Number.isFinite(e.duration)).map(e=>({...e,approximateWallStartMs:origin+e.start})).filter(e=>e.approximateWallStartMs>=start&&e.approximateWallStartMs+e.duration<=end);
const result={at:new Date().toISOString(),observedNativePids:[...pids],events,longTasksOver100msInCohort:longTasks,
 qualification:'Captured BEFORE any explicit-GC or supplemental navigation. Android log buffer may omit older events. Only test-package native PIDs retained. Native bridge reports duration/module at observer delivery, not a CPU stack. Wall mapping uses the single document timeOrigin and is approximate.'};
await fs.writeFile(`${root}/native-bridge-events.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify({events:events.length,longTasksOver100ms:longTasks.length,maxMs:longTasks.length?Math.max(...longTasks.map(e=>e.duration)):null}));
