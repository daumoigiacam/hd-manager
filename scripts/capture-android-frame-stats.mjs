import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const output=process.env.HD_ANDROID_FRAME_OUTPUT;
if(!output?.startsWith('test-results/'))throw Error('A local output is required.');
const adb='D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial='emulator-5554',packageName='com.hdmanager.app.acceptance';
const raw=execFileSync(adb,['-s',serial,'shell','dumpsys','gfxinfo',packageName,'framestats'],{encoding:'utf8',timeout:15000});
let columns=null;const frames=[],invalid=[];
for(const line of raw.split(/\r?\n/)){
  const fields=line.trim().split(',').filter(Boolean);
  if(fields[0]==='Flags'&&fields.includes('IntendedVsync')&&fields.includes('FrameCompleted')){columns=fields;continue;}
  if(!columns||fields.length!==columns.length||!fields.every(value=>/^\d+$/.test(value)))continue;
  const flags=Number(fields[columns.indexOf('Flags')]);
  const intended=BigInt(fields[columns.indexOf('IntendedVsync')]),completed=BigInt(fields[columns.indexOf('FrameCompleted')]);
  const durationMs=Number(completed-intended)/1e6;
  if(flags!==0||intended<=0n||completed<=intended||durationMs>60000){invalid.push({flags});continue;}
  frames.push({intendedVsyncNs:intended.toString(),completedNs:completed.toString(),durationMs});
}
const values=frames.map(row=>row.durationMs).sort((a,b)=>a-b),percentile=p=>values.length?values[Math.ceil(values.length*p)-1]:null;
const result={at:new Date().toISOString(),status:frames.length?'OBSERVED_NATIVE_HWUI_FRAME_RING':'UNMEASURED',frames,excludedFrames:invalid.length,
  summary:{samples:frames.length,p50Ms:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),over16_67ms:values.filter(v=>v>16.67).length,over100ms:values.filter(v=>v>100).length},
  scope:'Numeric records only from the Android HWUI retained frame ring of the Acceptance package. No counters reset. Ring may omit earlier frames and include launch/startup outside the navigation window. Native frame completion is NOT WebView compositor paint, EventTiming/INP, all UI interactions or complete acceptance.'};
await mkdir(output,{recursive:true});await writeFile(output+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,summary:result.summary}));
