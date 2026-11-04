import fs from 'node:fs/promises';
import {openSync,writeSync,closeSync} from 'node:fs';
import crypto from 'node:crypto';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
import {assertNoActiveUpgradeSoak} from './helpers/upgrade-observation-barrier.mjs';
const root='test-results/performance-upgrade-20261103',stateFile=root+'/post-editor-cleanup-heap-status.json',lockFile=root+'/post-soak-retention-retry-lock.json';
try{await fs.access(stateFile);throw Error('Existing capture state must not be overwritten')}catch(error){if(error.code!=='ENOENT')throw error}
const state={at:new Date().toISOString(),status:'WAITING_FOR_ACTUAL_TWO_HOUR_END',pid:process.pid,sourceCohort:'after-quiet-probe',productionRequests:0};
const save=()=>fs.writeFile(stateFile,JSON.stringify(state,null,2));await save();let c,fd,remove,bytes=0,locked=false;
try{
 let span;const deadline=Date.now()+2*3600000;
 while(Date.now()<deadline){try{span=JSON.parse(await fs.readFile(root+'/soak-editor-cleanup/sdk-soak-result.json'));if(span.state.endedAt)break}catch(error){if(error.code!=='ENOENT')throw error}await new Promise(r=>setTimeout(r,5000))}
 if(!span?.state.endedAt||span.state.elapsedMs<7200000)throw Error('Require completed independent two-hour span');
 await assertNoActiveUpgradeSoak();
 const oldLock=await fs.readFile(lockFile).catch(error=>{if(error.code!=='ENOENT')throw error;return null});if(oldLock)await fs.writeFile(root+'/post-editor-cleanup-prior-lock.json',oldLock,{flag:'wx'});
 await fs.writeFile(lockFile,JSON.stringify({active:true,pid:process.pid,purpose:'Same-APK post-editor-cleanup retention diagnostic',startedAt:new Date().toISOString()}));locked=true;
 state.spanEndedAt=span.state.endedAt;state.spanElapsedMs=span.state.elapsedMs;state.originalFailures=span.failures.length;state.status='CAPTURING_AFTER_SPAN';state.startedAt=new Date().toISOString();await save();
 c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.caplab.diag',port:9283});
 const remote=c.shell('shell','pm','path','com.hdmanager.caplab.diag').trim().replace(/^package:/,'');if(!remote.startsWith('/data/app/')||!remote.includes('com.hdmanager.caplab.diag')||!remote.endsWith('/base.apk'))throw Error('Unexpected owned package path');
 state.apkSha256=c.shell('shell','sha256sum',remote).split(/\s+/)[0];if(state.apkSha256!==span.state.apkSha256)throw Error('Observed APK changed before diagnostic');
 state.before={heap:await c.send('Runtime.getHeapUsage'),dom:await c.send('Memory.getDOMCounters'),documentOrigin:await c.evaluate('performance.timeOrigin')};
 state.conditions='AFTER completed span only. Explicit GC and heap snapshot are separate diagnostics, not natural RAM, latency acceptance or extra soak time. Same frozen APK; no reinstall, navigation or business mutation. Snapshot may itself stop UI and consume memory. Source checkout has newer separately built changes; only this APK is analyzed.';
 const scripts=[],off=c.onEvent(e=>{if(e.method==='Debugger.scriptParsed'&&scripts.length<2000){const p=e.params;if(p.url&&/^https?:\/\/(localhost|127\.0\.0\.1)(?=[:/]|$)/.test(p.url))scripts.push({scriptId:p.scriptId,url:p.url.split('?')[0],startLine:p.startLine,startColumn:p.startColumn})}});
 try{await c.send('Debugger.enable');await new Promise(r=>setTimeout(r,50));await c.send('Debugger.disable')}finally{off()}
 state.scriptMetadata=scripts;await c.send('HeapProfiler.enable');await c.send('HeapProfiler.collectGarbage');state.afterGc={heap:await c.send('Runtime.getHeapUsage'),dom:await c.send('Memory.getDOMCounters')};
 const file=root+'/native-after-editor-cleanup-post-soak.heapsnapshot',hash=crypto.createHash('sha256');fd=openSync(file,'wx');
 remove=c.onEvent(e=>{if(e.method==='HeapProfiler.addHeapSnapshotChunk'){const b=Buffer.from(e.params.chunk);for(let at=0;at<b.length;){const n=writeSync(fd,b,at,b.length-at);if(n<=0)throw Error('Incomplete snapshot write');at+=n}hash.update(b);bytes+=b.length}});
 await c.send('HeapProfiler.takeHeapSnapshot',{reportProgress:false},120000);remove();remove=null;closeSync(fd);fd=null;
 const origin=await c.evaluate('performance.timeOrigin');if(origin!==state.before.documentOrigin)throw Error('Document reloaded during retention diagnostic');
 state.snapshot={file,bytes,sha256:hash.digest('hex'),complete:true};state.status='POST_SPAN_RETENTION_CAPTURED_NOT_LEAK_ACCEPTANCE';
}catch(error){state.status='FAILED';state.error=error.message;state.partialBytes=bytes;process.exitCode=1}finally{remove?.();if(fd!==undefined&&fd!==null)closeSync(fd);c?.close();state.endedAt=new Date().toISOString();await save();if(locked)await fs.writeFile(lockFile,JSON.stringify({active:false,endedAt:state.endedAt,status:state.status,purpose:'Post-editor-cleanup retention diagnostic'}));console.log(JSON.stringify({status:state.status,error:state.error,before:state.before,afterGc:state.afterGc,snapshot:state.snapshot}))}
