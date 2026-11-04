import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
import {readMainNavigationTimeline} from './helpers/android-timeline-metadata.mjs';

// No V8 sampling: correlate real trusted input with layout/GC/event work.
// The timeline itself adds overhead, so these samples are diagnostic only.
const output=process.env.HD_NAV_TIMELINE_OUTPUT;
if(!output?.startsWith('test-results/'))throw Error('Local diagnostic output required.');
await mkdir(output,{recursive:true});
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',port:9231,enableRuntime:false});
let tracing=false,finished;const done=new Promise(resolve=>{finished=resolve});
const off=c.onEvent(e=>{if(e.method==='Tracing.tracingComplete')finished(e.params)});
try{
 const state=await c.evaluate('(function(){var m=document.querySelector("main[data-hd-module]");return {module:m&&m.getAttribute("data-hd-module"),login:!!document.querySelector("input[type=tel]")}})()');
 if(!state.module||state.login)throw Error('Existing approved authenticated Acceptance session required.');
 await c.send('Tracing.start',{categories:'toplevel,devtools.timeline,v8,blink.user_timing',transferMode:'ReturnAsStream'});tracing=true;
 await c.evaluate('performance.mark("hd-navigation-timeline-root")');
 const exit=await new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,['scripts/audit-android-webview.mjs'],{windowsHide:true,stdio:'ignore',env:{...process.env,
   HD_ANDROID_AUTHENTICATED_AUDIT:'true',HD_ANDROID_AUDIT_ACCESSIBLE_ONLY:'true',HD_ANDROID_AUDIT_LIGHTWEIGHT:'true',
   HD_ANDROID_AUDIT_FEEDBACK_ONLY:'false',HD_ANDROID_AUDIT_SOURCE_READY:'true',HD_ANDROID_AUDIT_ROUNDS:'2',
   HD_ANDROID_AUDIT_ROUTE_SEQUENCE:JSON.stringify(['orders','messages','employee_reviews','pricing']),HD_ANDROID_AUDIT_OUTPUT:output+'/navigation'}});
  const guard=setTimeout(()=>{p.kill();reject(Error('Navigation diagnosis exceeded its 180-second bound.'))},180000);
  p.once('error',error=>{clearTimeout(guard);reject(error)});p.once('exit',code=>{clearTimeout(guard);resolve(code)});
 });
 await c.send('Tracing.end');tracing=false;const result=await done,chunks=[];let bytes=0;
 while(true){const chunk=await c.send('IO.read',{handle:result.stream,size:65536});
  const data=chunk.base64Encoded?Buffer.from(chunk.data,'base64').toString('utf8'):chunk.data;bytes+=Buffer.byteLength(data);
  if(bytes>64*1024*1024)throw Error('Diagnostic trace byte cap exceeded.');chunks.push(data);if(chunk.eof)break;
 }
 await c.send('IO.close',{handle:result.stream});
 const timeline=readMainNavigationTimeline(JSON.parse(chunks.join('')).traceEvents),{events,longTasks}=timeline;
 const navigation=JSON.parse(await readFile(output+'/navigation/result.json','utf8'));
 await writeFile(output+'/timeline.json',JSON.stringify({at:new Date(),...timeline,sampling:false,
  scope:'No V8 CPU sampling. Timing/type/PID/TID metadata only; no event args, URLs, credentials, document data or DOM contents retained. Timeline+navigation observers add overhead; not clean acceptance or proof of a JavaScript function cause.'}));
 const summary={auditExit:exit,samples:navigation.samples.length,feedbackOver100:navigation.samples.filter(s=>s.inputToFeedbackMs>=100).length,
  mainRunTasksOver100:longTasks.length,longTasks:longTasks.map(t=>({durationMs:t.dur/1000,threadCpuMs:t.tdur/1000,children:t.children.map(e=>({name:e.name,type:e.eventType,durationMs:e.dur/1000,source:e.source}))})),
  acceptance:'DIAGNOSTIC_ONLY_NOT_PASS'};
 await writeFile(output+'/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
 if(exit!==0)throw Error('Navigation diagnosis incomplete; failed samples retained.');
}finally{
 if(tracing)try{await c.send('Tracing.end')}catch{/* renderer may have exited */}
 off();c.close();
}
