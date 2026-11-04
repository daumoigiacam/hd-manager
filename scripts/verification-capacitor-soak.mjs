import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
import {findOwnedWebViewRendererPids} from './helpers/android-renderer-ownership.mjs';
import {readWorkerHeaps} from '../performance/phase2-verification/worker-heap.mjs';
const root='test-results/phase2-verification-20261102',adb='D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial='emulator-5554',pkg='com.hdmanager.caplab.diag';
const state={at:new Date().toISOString(),status:'WAITING_FOR_MACRO',pid:process.pid,workloadRevision:'explicit-cdp-failure-observation-v4',package:pkg,durationRequestedMs:7200000,productionRequests:0};
const write=async()=>fs.writeFile(`${root}/sdk-soak-status.json`,JSON.stringify(state,null,2));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const read=async file=>{try{return JSON.parse(await fs.readFile(file,'utf8'))}catch{return null}};
const command=(...args)=>{try{return execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:20000})}catch(error){error.adbArgs=args;error.message=`ADB ${args.join(' ')}: ${error.message}`;throw error}};
await write();const queueStart=performance.now();let macro;
const terminal=['SYNTHETIC_CAPACITOR_MACRO_COMPLETED','INSTRUMENTATION_FAILED','NOT_RUN_DIAGNOSTIC_NOT_FINISHED'];
while(performance.now()-queueStart<190*60000){macro=await read(`${root}/capacitor-macro-state.json`);if(terminal.includes(macro?.status))break;await wait(15000)}
if(!terminal.includes(macro?.status))throw Error('Capacitor macro barrier incomplete; do not interrupt other tests');
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
 await cdp.send('Input.insertText',{text:value});return true;}
async function login(identifier){
 for(let i=0;i<200;i++){if(await cdp.evaluate('Boolean(document.querySelector("input[type=tel]"))'))break;await wait(100)}
 if(!await input('input[type=tel]',identifier))return false;await input('input[type=password]','Local-fixture-only-2026!');return clickText('Vào Ứng Dụng');
}
async function awaitInitialHome(){
 const deadline=performance.now()+45000;
 while(performance.now()<deadline){if(await cdp.evaluate(`(()=>{const m=document.querySelector('main[data-hd-module=home]'),s=window.__hdVerification;return Boolean(m&&s&&Number.isFinite(s.homeDataReadyMs)&&window.__hdSourceContract(m,'home',window.__hdPlans).sourcesReady&&!window.__hdModulePending(m))})()`))return;await wait(200)}
 throw Error('Synthetic Home did not become source/commit/projection ready before soak; do not count a login screen as module coverage');
}
async function logout(){const value=await cdp.evaluate(`(()=>{const m=document.querySelector('main[data-hd-module]'),k=m&&Object.keys(m).find(k=>k.startsWith('__reactFiber$'));let f=k&&m[k];for(let n=0;f&&n<100;n++,f=f.return){if(f.memoizedProps&&typeof f.memoizedProps.onLogout==='function'){f.memoizedProps.onLogout();return true}}return false})()`);return value;}
try{
 state.status='STARTING';await write();
 state.device={serial,api:command('shell','getprop','ro.build.version.sdk').trim(),model:command('shell','getprop','ro.product.model').trim(),webview:command('shell','dumpsys','webviewupdate').match(/Current WebView package[^\n]*/)?.[0]??null,clockTicksPerSecond:Number(command('shell','getconf','CLK_TCK').trim())};
 state.launch=command('shell','am','start','-W','-n',pkg+'/com.hdmanager.app.VerificationActivity');
 state.initialCondition='Warm existing synthetic app after preserved incomplete v2/v3. Local demo service restarted and identical fixture reseeded before cohort. No clear, reinstall, reload or GC at start; previous durations are NOT added. Page-wide counters stay intact and cohort counters are segmented by baseline. CDP failure recovery does not reset app; failures invalidate clean acceptance.';
 cdp=await connectAndroidWebView({adb,serial,packageName:pkg,port:9238});
 observeConnection(cdp);
 const initialDeadline=performance.now()+25000;let loginShown=false,homeShown=false;
 while(performance.now()<initialDeadline){loginShown=await cdp.evaluate('Boolean(document.querySelector("input[type=tel]"))');homeShown=await cdp.evaluate('Boolean(document.querySelector("main[data-hd-module]"))');if(loginShown||homeShown)break;await wait(200)}
 if(loginShown)actions.push({kind:'initial-fake-login',invoked:await login('0900000001')});
 if(homeShown)await clickText('Trang chủ');
 await awaitInitialHome();
 state.pageBaseline=await cdp.evaluate(`(()=>{const s=window.__hdVerification;return{now:performance.now(),documentOrigin:performance.timeOrigin,longTaskTotal:s.longTaskTotal,workersCreated:s.workersCreated,workersTerminated:s.workersTerminated}})()`);
 const started=performance.now();state.status='RUNNING';state.startedAt=new Date().toISOString();await write();
 const targets=['Khách hàng','Sản phẩm','Đơn hàng','Thu chi','Sổ nợ','Tài sản','Bảng lương','Xuất kho','Nhập Xuất Tồn','Trang chủ'];
 for(let i=0;performance.now()-started<7200000;i++){
  const cycleAt=performance.now();
  try{
   const label=targets[i%targets.length];let clicked=await clickText(label);if(!clicked){await clickText('Thêm');for(let attempt=0;attempt<8&&!clicked;attempt++){await wait(250);clicked=await clickText(label)}}
   if(clicked)await wait(500);
   actions.push({elapsedMs:performance.now()-started,kind:'actual-ui-route',label,clicked});
   if(i%2===0||label==='Sản phẩm'){
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
    const invoked=await logout();actions.push({kind:'logout',method:'public component callback',invoked,elapsedMs:performance.now()-started});
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
finally{cdp?.close();state.endedAt=new Date().toISOString();state.missingNativeSamples=nativeSamplingErrors.length;await write();await fs.writeFile(`${root}/sdk-soak-result.json`,JSON.stringify({state,samples,actions,failures,documentReloads,runtimeEvents,nativeSamplingErrors},null,2));}
