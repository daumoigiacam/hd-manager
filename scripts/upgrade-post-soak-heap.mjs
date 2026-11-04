import fs from'node:fs/promises';
import{openSync,writeSync,closeSync}from'node:fs';
import crypto from'node:crypto';
import{connectAndroidWebView}from'./helpers/android-webview-cdp.mjs';
import{assertNoActiveUpgradeSoak}from'./helpers/upgrade-observation-barrier.mjs';
const root='test-results/performance-upgrade-20261103',state={at:new Date().toISOString(),status:'WAITING_FOR_COMPLETED_SPAN',pid:process.pid,productionRequests:0};
state.collectorSha256=crypto.createHash('sha256').update(await fs.readFile(new URL(import.meta.url))).digest('hex');
const save=()=>fs.writeFile(`${root}/post-soak-heap-status.json`,JSON.stringify(state,null,2));
await save();let c,fd,remove,bytes=0;
try{
 const deadline=Date.now()+3*3600000;let span;
 while(Date.now()<deadline){try{span=JSON.parse(await fs.readFile(`${root}/soak-final-rich/sdk-soak-result.json`,'utf8'));if(span.state.endedAt)break}catch(e){if(e.code!=='ENOENT')throw e}await new Promise(r=>setTimeout(r,5000))}
 if(!span?.state?.endedAt||span.state.elapsedMs<7200000)throw Error('Require actual completed two-hour span');
 await assertNoActiveUpgradeSoak();state.spanEndedAt=span.state.endedAt;state.spanElapsedMs=span.state.elapsedMs;state.status='CAPTURING_AFTER_SPAN';state.startedAt=new Date().toISOString();await save();
 c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.caplab.diag',port:9253});
 const remote=c.shell('shell','pm','path','com.hdmanager.caplab.diag').trim().replace(/^package:/,'');if(!remote.startsWith('/data/app/')||!remote.includes('com.hdmanager.caplab.diag')||!remote.endsWith('/base.apk'))throw Error('Unexpected test package path');
 state.apkSha256=c.shell('shell','sha256sum',remote).trim().split(/\s+/)[0];if(state.apkSha256!==span.state.apkSha256)throw Error('Candidate changed before retention diagnostic');
 state.before={heap:await c.send('Runtime.getHeapUsage'),dom:await c.send('Memory.getDOMCounters')};
 state.conditions='Separate AFTER-SPAN retention diagnostic on the same APK/document. Explicit GC and heap snapshot are NOT natural RAM, speed acceptance or part of the completed two-hour span. No navigation, reinstall or business mutation. Synthetic-only test package.';
 const scripts=[],stopScripts=c.onEvent(e=>{if(e.method==='Debugger.scriptParsed'&&scripts.length<2000){const p=e.params;if(p.url&&/^https?:\/\/(?:localhost|127\.0\.0\.1)(?=[:/]|$)/.test(p.url))scripts.push({scriptId:p.scriptId,url:p.url.split('?')[0],startLine:p.startLine,startColumn:p.startColumn})}});
 try{await c.send('Debugger.enable');await new Promise(r=>setTimeout(r,50));await c.send('Debugger.disable')}finally{stopScripts()}
 state.scriptMetadata=scripts;state.conditions+=' Script URL/ID metadata was collected with Debugger briefly enabled, then disabled BEFORE GC; no source text or CPU sampling was collected.';
 await c.send('HeapProfiler.enable');await c.send('HeapProfiler.collectGarbage');
 state.afterGc={heap:await c.send('Runtime.getHeapUsage'),dom:await c.send('Memory.getDOMCounters')};
 const file=`${root}/native-after-memo-search-post-soak.heapsnapshot`,hash=crypto.createHash('sha256');fd=openSync(file,'wx');
 remove=c.onEvent(e=>{if(e.method==='HeapProfiler.addHeapSnapshotChunk'){const b=Buffer.from(e.params.chunk);for(let offset=0;offset<b.length;){const n=writeSync(fd,b,offset,b.length-offset);if(n<=0)throw Error('Incomplete heap artifact write');offset+=n}hash.update(b);bytes+=b.length}});
 await c.send('HeapProfiler.takeHeapSnapshot',{reportProgress:false});remove();remove=null;closeSync(fd);fd=null;
 state.snapshot={file,bytes,sha256:hash.digest('hex'),complete:true};state.status='POST_SPAN_RETENTION_CAPTURED_NOT_LEAK_ACCEPTANCE';
}catch(error){state.status='FAILED';state.error=error.message;state.partialBytes=bytes;process.exitCode=1}
finally{remove?.();if(fd!==undefined&&fd!==null)closeSync(fd);c?.close();state.endedAt=new Date().toISOString();await save();console.log(JSON.stringify(state))}
