import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
import {findOwnedWebViewRendererPids} from './helpers/android-renderer-ownership.mjs';
import {analyzeTrace} from '../performance/phase2-verification/trace-analysis.mjs';

const root='test-results/phase2-verification-20261102',old='test-results/phase2-performance-20261102';
const adb='D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial='emulator-5554',pkg='com.hdmanager.caplab.diag';
const native=`${root}/capacitor-project`,assets=`${native}/app/src/main/assets/public`;
const apk=`${native}/app/build/outputs/apk/diagnostic/app-diagnostic.apk`;
const state={at:new Date().toISOString(),status:'WAITING_FOR_EXISTING_SOAK_AND_MACRO',pid:process.pid,package:pkg,syntheticOnly:true,productionRequests:0};
const write=async()=>fs.writeFile(`${root}/capacitor-run-status.json`,JSON.stringify(state,null,2));
const read=async file=>{try{return JSON.parse(await fs.readFile(file,'utf8'))}catch{return null}};
const command=(args,timeout=20000)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',timeout,windowsHide:true});
const shell=(...args)=>command(['shell',...args]);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
await write();
// Never foreground another app while the continuous two-hour cohort runs.
const waitingAt=Date.now();let original,barrierReady=false;
while(Date.now()-waitingAt<150*60000){
 original=await read(`${old}/native-memory-result.json`);
 const macro=await read(`${old}/macro-state.json`);
 if(original&&['SYNTHETIC_MACRO_TESTS_COMPLETED','INSTRUMENTATION_FAILED','NOT_RUN_SOAK_INCOMPLETE'].includes(macro?.status)){barrierReady=true;break;}
 await wait(15000);
}
if(!barrierReady)throw Error('Existing soak/macro barrier did not finish; do not interrupt it to run another APK');
let cdp,tracing=false;
const runs=[],errors=[];
async function until(expression,timeout=20000){const end=Date.now()+timeout;let last;while(Date.now()<end){last=await cdp.evaluate(expression);if(last)return last;await wait(100)}throw Error('Verification condition timeout: '+expression.slice(0,140))}
async function click(selector){const point=await cdp.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return null;const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);if(!point)throw Error('Fixture UI control unavailable: '+selector);
 await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});}
async function textButton(label){label=({'Sản phẩm':'Kho sản phẩm','Tài sản':'Quản lý tài sản'})[label]||label;const point=await cdp.evaluate(`(()=>{const e=Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()===${JSON.stringify(label)}&&!e.disabled&&e.getClientRects().length);if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);if(!point)return false;
 await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});return true;}
async function snapshot(label){
 const main=await cdp.evaluate(`(()=>{const s=window.__hdVerification,m=document.querySelector('main[data-hd-module]');return{label:${JSON.stringify(label)},at:performance.now(),module:m&&m.getAttribute('data-hd-module'),probe:s?{maxTaskMs:s.maxTaskMs,longTaskTotal:s.longTaskTotal,errors:s.errors,rejections:s.rejections,workersCreated:s.workersCreated,workersTerminated:s.workersTerminated,workerCounters:s.workerCounters,homeShellMs:s.homeShellMs,homeDataReadyMs:s.homeDataReadyMs,frames:s.frames.slice(-20),inputs:s.inputs.slice(-20)}:null,mainSdk:window.__hdSdkListenerCounters||null}})()`);
 try{main.jsHeap=await cdp.send('Runtime.getHeapUsage');main.dom=await cdp.send('Memory.getDOMCounters')}catch(error){main.heapReadError=error.message}
 try{const m=await cdp.send('Performance.getMetrics');main.timelineMetrics=Object.fromEntries(m.metrics.filter(v=>['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration'].includes(v.name)).map(v=>[v.name,v.value]))}catch(error){main.performanceReadError=error.message}
 main.workerHeap=[];
 if(!tracing)try{
  const info=await cdp.send('Target.getTargets');
  for(const target of info.targetInfos.filter(t=>t.type==='worker'&&(t.url.startsWith('https://localhost/')||t.url.startsWith('blob:https://localhost/')))){
   const attached=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
   const id=9001;
   const value=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{off();reject(Error('Worker heap reply timed out'))},3000);
    const off=cdp.onEvent(e=>{if(e.method!=='Target.receivedMessageFromTarget'||e.params.sessionId!==attached.sessionId)return;
     const message=JSON.parse(e.params.message);if(message.id!==id)return;clearTimeout(timer);off();message.error?reject(Error(JSON.stringify(message.error))):resolve(message.result)});
    cdp.send('Target.sendMessageToTarget',{sessionId:attached.sessionId,message:JSON.stringify({id,method:'Runtime.getHeapUsage'})}).catch(reject);
   });
   main.workerHeap.push({asset:path.basename(new URL(target.url).pathname),...value});await cdp.send('Target.detachFromTarget',{sessionId:attached.sessionId});
  }
 }catch(error){main.workerHeapError=error.message}
 if(!tracing)try{
  const appPid=Number(shell('pidof',pkg).trim()),renderers=findOwnedWebViewRendererPids(shell('dumpsys','activity','services',pkg),pkg,appPid);
  main.nativeProcesses=[];
  for(const pid of [appPid,...renderers]){
   const mem=shell('dumpsys','meminfo',String(pid)),status=shell('cat',`/proc/${pid}/status`);
   main.nativeProcesses.push({pid,kind:pid===appPid?'native-main':'owned-renderer',pssKb:Number(mem.match(/TOTAL:\s*(\d+)/)?.[1])||null,rssKb:Number(status.match(/^VmRSS:\s*(\d+)/m)?.[1])||null,nativeHeapPssKb:Number(mem.match(/Native Heap:\s*(\d+)/)?.[1])||null});
  }
 }catch(error){main.nativeReadError=error.message}
 if(tracing)main.deepMemory='NOT_SAMPLED_DURING_CPU_TRACE: avoid worker attach and dumpsys overhead in trace';
 runs.push(main);await fs.writeFile(`${root}/capacitor-diagnostic-progress.json`,JSON.stringify({at:new Date().toISOString(),scope:'diagnostic overhead; real SDK against demo Emulator; not release performance benchmark',runs,errors},null,2));return main;
}
async function login(identifier){
 await until('Boolean(document.querySelector("input[type=tel]"))');
 await click('input[type=tel]');await cdp.send('Input.insertText',{text:identifier});
 await click('input[type=password]');await cdp.send('Input.insertText',{text:'Local-fixture-only-2026!'});
 await textButton('Vào Ứng Dụng');await until('Boolean(document.querySelector("main[data-hd-module]"))',30000);
 await until('Number.isFinite(window.__hdVerification.homeDataReadyMs)',30000);
}
async function stopTrace(){
 const completed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{off();reject(Error('Trace completion timed out'))},30000);const off=cdp.onEvent(e=>{if(e.method==='Tracing.tracingComplete'){clearTimeout(timer);off();resolve(e.params)}})});
 await cdp.send('Tracing.end');tracing=false;const {stream}=await completed;let content='';
 while(true){const chunk=await cdp.send('IO.read',{handle:stream,size:1024*1024});content+=chunk.base64Encoded?Buffer.from(chunk.data,'base64').toString('utf8'):chunk.data;if(chunk.eof)break}
 await cdp.send('IO.close',{handle:stream});const trace=JSON.parse(content);
 // A WebView trace may include other browser processes; retain only the
 // exact app/renderer ownership verified by Android's service binding.
 const appPid=Number(shell('pidof',pkg).trim()),owned=new Set([appPid,...findOwnedWebViewRendererPids(shell('dumpsys','activity','services',pkg),pkg,appPid)]);
 trace.traceEvents=trace.traceEvents.filter(e=>owned.has(e.pid));
 await fs.writeFile(`${root}/capacitor-owned-trace.json`,JSON.stringify(trace));
 await analyzeTrace({input:`${root}/capacitor-owned-trace.json`,assetRoot:`${root}/source-maps`,output:`${root}/capacitor-trace-summary.json`});
}
try{
 const bytes=await fs.readFile(apk);state.apkSha256=crypto.createHash('sha256').update(bytes).digest('hex');state.apkBytes=bytes.length;
 for(const port of [8185,9199,5002])command(['reverse',`tcp:${port}`,`tcp:${port}`]);
 state.status='DIAGNOSTIC_RUNNING';state.startedAt=new Date().toISOString();await write();
 command(['install','-r',apk],60000);shell('am','force-stop',pkg);state.setupAppDataClearedForSyntheticTarget=shell('pm','clear',pkg).trim();state.launch=shell('am','start','-W','-n',pkg+'/com.hdmanager.app.VerificationActivity');
 cdp=await connectAndroidWebView({adb,serial,packageName:pkg,port:9237});
 await cdp.send('Performance.enable');
 cdp.onEvent(e=>{if(e.method==='Page.javascriptDialogOpening'&&/đăng xuất/i.test(e.params.message||''))void cdp.send('Page.handleJavaScriptDialog',{accept:true}).catch(error=>errors.push('Dialog: '+error.message))});
 await until('Boolean(document.querySelector("input[type=tel]"))');await snapshot('before-login-no-trace');
 await cdp.send('Tracing.start',{categories:'devtools.timeline,v8,blink.user_timing,disabled-by-default-v8.cpu_profiler,disabled-by-default-devtools.timeline',transferMode:'ReturnAsStream',options:'sampling-frequency=1000'});
 tracing=true;
 await login('0900000001');await snapshot('manager-home-ready');
 // Actual UI paths first; never silently fall back to programmatic routing.
 for(const label of ['Thêm','Khách hàng','Thêm','Sản phẩm','Trang chủ']){
  const clicked=await textButton(label);runs.push({kind:'actual-ui-navigation',label,clicked});await wait(1000);if(clicked)await snapshot('after-ui-'+label);
  if(clicked&&label==='Khách hàng'){
   const search=await cdp.evaluate(`(()=>{let e=Array.from(document.querySelectorAll('input')).find(e=>!e.disabled&&e.getClientRects().length&&(e.type==='search'||(e.placeholder||'').includes('Tìm')));if(!e)return false;e.setAttribute('data-hd-verification-search','true');return true})()`);
   if(search){await click('[data-hd-verification-search]');await cdp.send('Input.insertText',{text:'Synthetic'});await wait(400);await snapshot('customer-search-input')}
   runs.push({kind:'search',exercised:search,scope:'trusted protocol input feedback; filtered-result completion is not assumed from two frames'});
  }
 }
 // Separate reproduction of the ORIGINAL synthetic route protocol. It bypasses
 // navigate and may exercise the parent's fallback scroll-reset path.
 for(let round=0;round<3;round++)for(const target of ['warehouse_import','warehouse_dispatch','price_quotes','home']){
  await cdp.evaluate(`(()=>{const m=document.querySelector('main[data-hd-module]'),k=m&&Object.keys(m).find(k=>k.startsWith('__reactFiber$'));let f=k&&m[k];for(let n=0;f&&n<100;n++,f=f.return){const p=f.memoizedProps;if(p&&typeof p.setActiveTab==='function'){p.setActiveTab(${JSON.stringify(target)});return true}}return false})()`);
  await wait(1000);await snapshot('synthetic-parent-route-'+target);
 }
 await stopTrace();await snapshot('after-trace');
 const logout=await cdp.evaluate(`(()=>{const m=document.querySelector('main[data-hd-module]'),k=m&&Object.keys(m).find(k=>k.startsWith('__reactFiber$'));let f=k&&m[k];for(let n=0;f&&n<100;n++,f=f.return){if(f.memoizedProps&&typeof f.memoizedProps.onLogout==='function'){f.memoizedProps.onLogout();return true}}return false})()`);
 runs.push({kind:'logout',method:'public component onLogout callback, not direct SDK signOut',invoked:logout});
 if(logout){await until('Boolean(document.querySelector("input[type=tel]"))');await wait(2500);await snapshot('after-manager-logout');await login('0900000002');await snapshot('employee-relogin-home-ready')}
 state.status='DIAGNOSTIC_COMPLETED_NOT_ACCEPTANCE';
}catch(error){state.status='DIAGNOSTIC_FAILED';state.error=error.message;errors.push(error.message)}
finally{
 if(tracing&&cdp)try{await stopTrace()}catch(error){errors.push('Trace cleanup: '+error.message)}
 cdp?.close();state.endedAt=new Date().toISOString();await write();
 await fs.writeFile(`${root}/capacitor-diagnostic-result.json`,JSON.stringify({state,runs,errors,qualification:'Profiler and heap sampling diagnostic, synthetic identity service and demo Firebase; not production login latency, real-device certification or a two-hour Capacitor soak.'},null,2));
}
