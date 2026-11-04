import{assertVerificationFixtureReady}from'./helpers/verification-fixture-preflight.mjs';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
import {findOwnedWebViewRendererPids} from './helpers/android-renderer-ownership.mjs';
import {readWorkerHeaps} from '../performance/phase2-verification/worker-heap.mjs';
const root='test-results/performance-upgrade-20261103/soak-editor-cleanup',adb='D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial='emulator-5554',pkg='com.hdmanager.caplab.diag';
const state={at:new Date().toISOString(),status:'VERIFYING_CANDIDATE',pid:process.pid,workloadRevision:'upgrade-detached-editor-closed-cache-query-witness-current-root-v5',package:pkg,durationRequestedMs:7200000,productionRequests:0};
const write=async()=>fs.writeFile(`${root}/sdk-soak-status.json`,JSON.stringify(state,null,2));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const command=(...args)=>{try{return execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:20000})}catch(error){error.adbArgs=args;error.message=`ADB ${args.join(' ')}: ${error.message}`;throw error}};
await fs.mkdir(root,{recursive:true});
state.fixtureAvailability=await assertVerificationFixtureReady({requiredRemainingMs:7200000});
state.status='NATIVE_PREFLIGHT_NOT_SOAK';await write();
for(const [label,commandFile,args]of[
 ['build-native-ready-epoch','powershell',['-NoProfile','-File','scripts/upgrade-build-native-epoch-harness.ps1']],
 ['macro-warm-ready-epoch',process.execPath,['scripts/upgrade-capacitor-macro.mjs','after-quiet-probe','--harness=after-query-witness','--method=warmSyntheticPasswordLogin']]
]){
 const output=await fs.open('test-results/performance-upgrade-20261103/'+label+'.log','w');
 try{execFileSync(commandFile,args,{stdio:['ignore',output.fd,output.fd],windowsHide:true,timeout:900000});state.nativeWarmPreflight={...(state.nativeWarmPreflight||{}),[label]:'COMPLETE'};}
 catch(error){state.nativeWarmPreflight={...(state.nativeWarmPreflight||{}),[label]:{status:'FAILED',error:error.message,exitCode:error.status}};if(label==='build-native-ready-epoch')throw error;}
 finally{await output.close();await write();}
}
command('shell','am','force-stop','com.hdmanager.caplab');
state.status='VERIFYING_CANDIDATE';
const previousSoak=JSON.parse(await fs.readFile('test-results/performance-upgrade-20261103/soak-integrated/sdk-soak-result.json','utf8'));
const previousWorker=JSON.parse(await fs.readFile('test-results/performance-upgrade-20261103/worker-heap-two-hour.json','utf8'));
if(!previousSoak.state.endedAt||previousSoak.state.elapsedMs<7200000||!previousWorker.endedAt||previousWorker.elapsedMs<7200000)throw Error('Previous collectors must finish; do not interrupt their spans');
state.fixtureManifest=JSON.parse(await fs.readFile('test-results/performance-upgrade-20261103/rich-service/fixture-manifest.json','utf8'));
if(state.fixtureManifest.workload?.kind!=='synthetic-linked-business-v1'||state.fixtureManifest.project!=='demo-hdm-perf-verification')throw Error('Rich fixture not ready');

const apk='test-results/performance-upgrade-20261103/after-quiet-probe/capacitor-project/app/build/outputs/apk/diagnostic/app-diagnostic.apk';
const installed=command('shell','pm','path',pkg).trim().replace(/^package:/,'');
if(!installed.startsWith('/data/app/')||!installed.includes(pkg)||!installed.endsWith('/base.apk'))throw Error('Unexpected installed fixture path');
state.apkSha256=crypto.createHash('sha256').update(await fs.readFile(apk)).digest('hex');
if(command('shell','sha256sum',installed).trim().split(/\s+/)[0]!==state.apkSha256)throw Error('Installed candidate hash mismatch');
state.buildIdentity=JSON.parse(await fs.readFile('test-results/performance-upgrade-20261103/after-quiet-probe/capacitor-build-identity.json','utf8'));
const sourceManifest=JSON.parse(await fs.readFile('test-results/performance-upgrade-20261103/after-quiet-probe/source-inputs.json','utf8'));
state.sourceInputHashes=sourceManifest;
const verifySource=async()=>{const changed=[];for(const row of (sourceManifest.files||sourceManifest)){const bytes=await fs.readFile(row.file);if(crypto.createHash('sha256').update(bytes).digest('hex')!==row.sha256)changed.push(row.file)}return changed};
state.sourceChangesBefore=await verifySource();if(state.sourceChangesBefore.length)throw Error('APK source inputs changed before soak');
await write();
let cdp,lastDocumentOrigin,cohortMaxTaskMs=null;const samples=[],actions=[],failures=[],documentReloads=[],runtimeEvents=[],nativeSamplingErrors=[];
function observeConnection(connection){
 connection.onEvent(event=>{if(['Runtime.exceptionThrown','Inspector.targetCrashed'].includes(event.method)&&runtimeEvents.length<1000)runtimeEvents.push({at:new Date().toISOString(),method:event.method,details:event.params})});
 connection.onEvent(event=>{if(event.method==='Page.javascriptDialogOpening'&&/đăng xuất/i.test(event.params.message||''))void connection.send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{})});
}
async function clickText(text){const original=text;text=({'Sản phẩm':'Kho sản phẩm','Tài sản':'Quản lý tài sản'})[text]||text;const point=await cdp.evaluate(`(()=>{const list=Array.from(document.querySelectorAll('button')).filter(e=>e.getClientRects().length&&!e.disabled);const e=list.find(e=>e.getAttribute('aria-label')===${JSON.stringify(original)})||list.find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return h&&(h===e||e.contains(h))?{x:x,y:y}:null})()`);if(!point)return false;
 await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});return true;}
async function input(selector,value){const point=await cdp.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||!e.getClientRects().length)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return h&&(h===e||e.contains(h))?{x:x,y:y}:null})()`);if(!point)return false;
 await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
 await cdp.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(e&&typeof e.select==='function')e.select()})()`);
 await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await cdp.send('Input.insertText',{text:value});return await cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(value)}`);}
async function login(identifier){
 for(let i=0;i<200;i++){if(await cdp.evaluate('Boolean(document.querySelector("input[type=tel]"))'))break;await wait(100)}
 if(!await input('input[type=tel]',identifier))return false;await input('input[type=password]','Local-fixture-only-2026!');return clickText('Vào Ứng Dụng');
}
async function awaitInitialHome(){
 const deadline=performance.now()+45000;
 while(performance.now()<deadline){if(await cdp.evaluate(`(()=>{const m=document.querySelector('main[data-hd-module=home]'),s=window.__hdVerification;return Boolean(m&&s&&Number.isFinite(s.homeDataReadyMs)&&window.__hdSourceContract(m,'home',window.__hdPlans).sourcesReady&&!window.__hdModulePending(m))})()`))return;await wait(200)}
 throw Error('Synthetic Home did not become source/commit/projection ready before soak; do not count a login screen as module coverage');
}
async function logout(){if(!await clickText('Thêm'))return false;await wait(150);return clickText('Đăng xuất')}
try{
 state.status='STARTING';await write();
 state.device={serial,api:command('shell','getprop','ro.build.version.sdk').trim(),model:command('shell','getprop','ro.product.model').trim(),webview:command('shell','dumpsys','webviewupdate').match(/Current WebView package[^\n]*/)?.[0]??null,clockTicksPerSecond:Number(command('shell','getconf','CLK_TCK').trim())};
 state.launch=command('shell','am','start','-W','-n',pkg+'/com.hdmanager.app.VerificationActivity');
 state.initialCondition='Optimized candidate with Adaptive policy ON and separate linked synthetic business fixture (2000 orders/6000 items). Independent two-hour span; no duration from older cohorts added. No reinstall, GC or restart by collector. Metadata sampling/automation overhead is retained; no universal real-device acceptance.';
 cdp=await connectAndroidWebView({adb,serial,packageName:pkg,port:9238});
 observeConnection(cdp);
 const reader=await cdp.evaluate('window.__hdSourceContract.toString()');if(crypto.createHash('sha256').update(reader).digest('hex')!=="1d0c8e90d29ea2cad0bb6e6e7ecb94eef50891b2c8ca53b64e6f8203e309125d")throw Error('Require current-root-v2 reader');
 state.sourceReadinessReaderRevision='current-root-v2';state.loginClockRevision='trusted-intent-v2';
 const initialDeadline=performance.now()+25000;let loginShown=false,homeShown=false;
 while(performance.now()<initialDeadline){loginShown=await cdp.evaluate('Boolean(document.querySelector("input[type=tel]"))');homeShown=await cdp.evaluate('Boolean(document.querySelector("main[data-hd-module]"))');if(loginShown||homeShown)break;await wait(200)}
 if(loginShown)actions.push({kind:'initial-fake-login',invoked:await login('0900000001')});
 if(homeShown)await clickText('Trang chủ');
 await awaitInitialHome();
 if(process.argv.includes('--native-share-preflight')){
  const output=execFileSync(process.execPath,['scripts/upgrade-android-share-compat.mjs','after-quiet-probe'],{encoding:'utf8',windowsHide:true,timeout:30000});
  state.shareCompatibilityPreflight=JSON.parse(output.trim());
  if(state.shareCompatibilityPreflight.status!=='NATIVE_CLASSIC_WORKER_BLOB_COMPATIBILITY_PASS')throw Error('Native preflight failed before observation span');
 }

 state.pageBaseline=await cdp.evaluate(`(()=>{const s=window.__hdVerification;return{now:performance.now(),documentOrigin:performance.timeOrigin,longTaskTotal:s.longTaskTotal,workersCreated:s.workersCreated,workersTerminated:s.workersTerminated}})()`);
 const started=performance.now();state.status='RUNNING';state.startedAt=new Date().toISOString();await write();
 let targets=['home'];let targetIndex=0;
 for(let i=0;performance.now()-started<7200000;i++){
  const cycleAt=performance.now();
  try{
   if(!await clickText('Thêm')){
    const exited=await clickText('Quay lại');
    actions.push({kind:'personal-workspace-exit',exited,elapsedMs:performance.now()-started});
    if(!exited)throw Error('Neither main menu nor explicit workspace exit available');
    await wait(150);if(!await clickText('Thêm'))throw Error('Main menu unavailable after workspace exit');
   }await wait(150);
   const permitted=await cdp.evaluate("Array.from(document.querySelectorAll('button[data-hd-more-module]')).filter(e=>e.getClientRects().length&&!e.disabled).map(e=>e.getAttribute('data-hd-more-module'))");
   if(permitted.length)targets=['home',...permitted.filter(id=>id!=='home')];
   const label=targets[targetIndex++%targets.length];
   const point=await cdp.evaluate("(()=>{var list=Array.from(document.querySelectorAll('button[data-hd-more-module]')),e=list.find(function(b){return b.getAttribute('data-hd-more-module')===LABEL});if(LABEL==='home')e=Array.from(document.querySelectorAll('button')).find(function(b){return b.getAttribute('aria-label')==='Trang chủ'});if(!e)return null;e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return h&&(h===e||e.contains(h))?{x:x,y:y}:null})()".replaceAll('LABEL',JSON.stringify(label)));
   let clicked=false;if(point){await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});clicked=true;}
   if(!clicked)throw Error('Permitted route unavailable: '+label);
   if(clicked){
    const readyDeadline=performance.now()+30000;let ready=false;
    while(performance.now()<readyDeadline){ready=await cdp.evaluate("(()=>{var m=document.querySelector('main[data-hd-module]'),id=m&&m.getAttribute('data-hd-module');return id==="+JSON.stringify(label)+"&&window.__hdSourceContract(m,id,window.__hdPlans).sourcesReady&&!window.__hdModulePending(m)})()");if(ready)break;await wait(100)}
    actions.push({kind:'source-ready-route',label,ready,elapsedMs:performance.now()-started});
    if(!ready)throw Error('Actual route did not reach source/projection readiness: '+label);
   }
   actions.push({elapsedMs:performance.now()-started,kind:'actual-ui-route',label,clicked});
   if(i%2===0||label==='products'){
    const findSearch=`(()=>{Array.from(document.querySelectorAll('[data-hd-verification-soak-search]')).forEach(e=>e.removeAttribute('data-hd-verification-soak-search'));const e=Array.from(document.querySelectorAll('input')).find(e=>!e.disabled&&e.getClientRects().length&&(e.type==='search'||(e.placeholder||'').includes('Tìm')));if(!e)return false;e.setAttribute('data-hd-verification-soak-search','true');return true})()`;
    let search=await cdp.evaluate(findSearch);
    if(!search){
     const point=await cdp.evaluate(`(()=>{const e=Array.from(document.querySelectorAll('button[aria-label="Tìm kiếm"]')).find(e=>!e.disabled&&e.getClientRects().length);if(!e)return null;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return h&&(h===e||e.contains(h))?{x:x,y:y}:null})()`);
     if(point){await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});await wait(300);search=await cdp.evaluate(findSearch)}
    }
    actions.push({elapsedMs:performance.now()-started,kind:'search',exercised:search&&await input('[data-hd-verification-soak-search]',i%4?'Synthetic':'no-match-fictional')});
   }
   if(i>0&&i%40===0){command('shell','input','keyevent','KEYCODE_HOME');await wait(5000);command('shell','am','start','-n',pkg+'/com.hdmanager.app.VerificationActivity');actions.push({kind:'background-foreground',elapsedMs:performance.now()-started})}
   if(i>0&&i%80===0){
    const invoked=await logout();actions.push({kind:'logout',method:'trusted visible logout button',invoked,elapsedMs:performance.now()-started});
    if(!invoked)throw Error('Required synthetic logout callback unavailable; do not assume role-churn coverage');
    await wait(2000);const identifier=(i/80)%2?'0900000002':'0900000001';const loggedIn=await login(identifier);actions.push({kind:'relogin-fake-role',invoked:loggedIn,elapsedMs:performance.now()-started});
    if(!loggedIn)throw Error('Required synthetic relogin UI could not be exercised');await awaitInitialHome();
   }
   const value=await cdp.evaluate(`(()=>{const s=window.__hdVerification,m=document.querySelector('main[data-hd-module]');return{documentOrigin:performance.timeOrigin,module:m&&m.getAttribute('data-hd-module'),probe:s?{workersCreated:s.workersCreated,workersTerminated:s.workersTerminated,workerCounters:s.workerCounters,longTaskTotal:s.longTaskTotal,maxTaskMs:s.maxTaskMs,errors:s.errors,rejections:s.rejections,inputs:s.inputs.slice(-5),frames:s.frames.slice(-5),homeShellMs:s.homeShellMs,homeDataReadyMs:s.homeDataReadyMs}:null,mainSdk:window.__hdSdkListenerCounters||null}})()`);
   const recent=await cdp.evaluate(`(()=>{const s=window.__hdVerification;return performance.timeOrigin===${state.pageBaseline.documentOrigin}?s.longTasks.filter(e=>e.start>=${state.pageBaseline.now}):null})()`);
   if(recent&&value.probe){for(const task of recent)cohortMaxTaskMs=cohortMaxTaskMs===null?task.duration:Math.max(cohortMaxTaskMs,task.duration);value.probe.cohortMaxTaskMs=cohortMaxTaskMs;value.probe.cohortLongTaskTotal=value.probe.longTaskTotal-state.pageBaseline.longTaskTotal;value.probe.frames=value.probe.frames.filter(row=>row.start>=state.pageBaseline.now);value.probe.inputsScope='Page-wide last-five metadata; not a cohort event count';}
   if(lastDocumentOrigin!==undefined&&value.documentOrigin!==lastDocumentOrigin)documentReloads.push({elapsedMs:performance.now()-started,previous:lastDocumentOrigin,current:value.documentOrigin});
   lastDocumentOrigin=value.documentOrigin;
   const sample={elapsedMs:performance.now()-started,...value};
   try{sample.heap=await cdp.send('Runtime.getHeapUsage');sample.dom=await cdp.send('Memory.getDOMCounters')}catch(error){sample.heapError=error.message}
   if(i%4===0)sample.workerHeap=await readWorkerHeaps(cdp);
   sample.sourceReadiness=await cdp.evaluate("(()=>{var m=document.querySelector('main[data-hd-module]'),id=m&&m.getAttribute('data-hd-module');return m?{module:id,contract:window.__hdSourceContract(m,id,window.__hdPlans),projectionPending:window.__hdModulePending(m)}:null})()");
   const nativeReadStart=performance.now();sample.processes=[];
   try{
   const pidText=command('shell','pidof',pkg).trim();if(!/^[1-9]\d*$/.test(pidText)){const error=Error('Synthetic target native process unavailable; do not sample another process');error.targetProcessUnavailable=true;throw error;}
   const appPid=Number(pidText),renderers=findOwnedWebViewRendererPids(command('shell','dumpsys','activity','services',pkg),pkg,appPid);
   sample.appPid=appPid;sample.rendererOwnershipKnown=renderers.length>0;
   for(const pid of [appPid,...renderers]){
    const mem=command('shell','dumpsys','meminfo',String(pid)),proc=command('shell','cat',`/proc/${pid}/status`),stat=command('shell','cat',`/proc/${pid}/stat`);
    const number=(text,regex)=>{const match=text.match(regex);return match?Number(match[1]):null},fields=stat.slice(stat.lastIndexOf(')')+2).trim().split(/\s+/);
    const nativeRow=mem.split(/\r?\n/).find(line=>/^\s*Native Heap\s+\d/.test(line)),nativeValues=nativeRow?.trim().split(/\s+/).slice(2).map(Number);
    sample.processes.push({pid,kind:pid===appPid?'native-main':'owned-renderer',totalPssKb:number(mem,/TOTAL:\s*(\d+)/),rssKb:number(proc,/^VmRSS:\s*(\d+)/m),nativeHeapPssKb:number(mem,/Native Heap:\s*(\d+)/),nativeHeapAllocatedKb:nativeValues?.length>=3?nativeValues.at(-2):null,bitmapBytes:null,bitmapReason:'No bitmap allocation profiler; Graphics PSS is not bitmap allocation size',userTicks:Number(fields[11]),systemTicks:Number(fields[12])});
   }
   }catch(error){if(error.targetProcessUnavailable||(error.adbArgs?.[1]==='pidof'&&error.status===1))throw error;sample.nativeSamplingError={message:error.message,args:error.adbArgs||null,code:error.code||null};nativeSamplingErrors.push({elapsedMs:performance.now()-started,...sample.nativeSamplingError});}
   sample.nativeSamplingDurationMs=performance.now()-nativeReadStart;
   samples.push(sample);
  }catch(error){
   failures.push({elapsedMs:performance.now()-started,error:error.message,request:error.request||null,stack:error.stack});
   // Continue observing the SAME app for the full requested span. Recovery is
   // never a successful UI action and NEVER removes the original failure.
   // No restart/reload/GC: reconnect only the diagnostic transport.
   cdp?.close();
   try{
    cdp=await connectAndroidWebView({adb,serial,packageName:pkg,port:9238});
    observeConnection(cdp);
    actions.push({kind:'diagnostic-transport-reconnected',elapsedMs:performance.now()-started,qualification:'Not a successful UI action; original failure retained'});
   }catch(recoveryError){failures.push({elapsedMs:performance.now()-started,error:'Diagnostic reconnect failed: '+recoveryError.message});}
  }
  state.elapsedMs=performance.now()-started;state.missingNativeSamples=nativeSamplingErrors.length;
  await fs.writeFile(`${root}/sdk-soak-progress.json`,JSON.stringify({state,samples,actions,failures,documentReloads,runtimeEvents,nativeSamplingErrors,qualification:'Capacitor diagnostic build, real SDK against demo Emulator, metadata sampling without CPU profiler; native read failures remain explicit missing data, not zeros or UI latency. Automation is not manual real-device validation.'},null,2));
  await write();await wait(Math.max(1,15000-(performance.now()-cycleAt)));
 }
 state.elapsedMs=performance.now()-started;state.status=state.elapsedMs>=7200000?(failures.length===0?'TWO_HOUR_OBSERVATION_COMPLETE_NOT_ACCEPTANCE':'TWO_HOUR_SPAN_WITH_FAILURES_NOT_ACCEPTANCE'):'INCOMPLETE';
}catch(error){state.status='FAILED';failures.push({error:error.message})}
finally{cdp?.close();try{state.sourceChangesAfter=await verifySource();state.sourceInputsUnchanged=state.sourceChangesAfter.length===0;}catch(error){state.sourceInputsUnchanged=false;state.sourceVerificationError=error.message;}state.endedAt=new Date().toISOString();state.missingNativeSamples=nativeSamplingErrors.length;await write();await fs.writeFile(`${root}/sdk-soak-result.json`,JSON.stringify({state,samples,actions,failures,documentReloads,runtimeEvents,nativeSamplingErrors},null,2));}
