import {parseAndroidProcessMetrics} from './helpers/android-process-metrics.mjs';
import {armTrustedLoginClock,resolveTrustedLoginObservation} from './helpers/trusted-login-observation.mjs';
import {armEventHomeStartupClock} from './helpers/event-home-startup-clock.mjs';
import {createIdentityNetworkTimingCollector} from './helpers/identity-network-timing.mjs';
import {dispatchTrustedTap,assertNativeTapProtocolProof} from './helpers/trusted-input-pair.mjs';
import {armAuthPipelineTiming} from './helpers/auth-pipeline-timing.mjs';
import {armRestStartupTiming} from './helpers/rest-startup-timing.mjs';
import {armWorkerStartupCpu} from './helpers/worker-startup-cpu.mjs';
import {installTwoLaneWorkerPilot} from './helpers/two-lane-worker-pilot.mjs';
import {createInitialReadAdmission} from '../src/services/initialReadAdmission.js';
import {armStartupSourceTiming} from './helpers/startup-source-timing.mjs';
import {ownedCpuIntervals} from './helpers/upgrade-soak-metrics.mjs';
import {readWorkerHeaps} from '../performance/phase2-verification/worker-heap.mjs';
import{armUiTiming}from'./helpers/prearmed-ui-timing.mjs';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
import {createSearchRecordIndex,getProductSearchFields} from '../src/services/searchEngine.js';
import {makeFixture} from '../performance/phase2/synthetic-fixture.mjs';
import {findOwnedWebViewRendererPids} from './helpers/android-renderer-ownership.mjs';
import {readModuleSourceReadiness} from './helpers/module-source-readiness.mjs';
const cohort=process.argv[2]||'baseline';if(!/^[a-z0-9-]+$/.test(cohort))throw Error('Invalid cohort');
const diagnosticCpu=process.argv.includes('--profile');let profiling=false;
const diagnosticTimeline=process.argv.includes('--timeline');let tracing=false;
const searchOnly=process.argv.includes('--search-only');
const startupOnly=process.argv.includes('--startup-only');
const balancedTwoWorkerPilot=process.argv.includes('--two-worker-balanced-pilot');
const fourInitialTwoWorkerPilot=process.argv.includes('--two-worker-four-initial-pilot');
const twoWorkerPilot=process.argv.includes('--two-worker-pilot')||balancedTwoWorkerPilot||fourInitialTwoWorkerPilot;
if(twoWorkerPilot&&!startupOnly)throw Error('QA worker pilot is limited to startup');
const workerCpuDiagnostic=process.argv.includes('--worker-startup-cpu');let workerCpu=null;
if(workerCpuDiagnostic&&!startupOnly)throw Error('Worker profiling requires startup-only');
const restTimingDiagnostic=process.argv.includes('--rest-startup-diagnostic');
if(restTimingDiagnostic&&!startupOnly)throw Error('REST diagnostic requires startup-only');
const sourceTimingDiagnostic=process.argv.includes('--startup-source-diagnostic');
const homeDetailsDiagnostic=process.argv.includes('--home-details-diagnostic');
if(homeDetailsDiagnostic&&(!startupOnly||!sourceTimingDiagnostic))throw Error('Details lifecycle diagnostic requires startup and bounded source timing');
if(sourceTimingDiagnostic&&!startupOnly)throw Error('Source timing diagnostic requires startup-only');
const authPipelineDiagnostic=process.argv.includes('--auth-pipeline-diagnostic');
if(authPipelineDiagnostic&&!startupOnly)throw Error('Auth pipeline diagnostic requires startup-only');
const storageDiagnostic=process.argv.includes('--storage-diagnostic');
if(storageDiagnostic&&!startupOnly)throw Error('Storage diagnostic requires startup-only');
const startupCpu=process.argv.includes('--profile-startup');
if(startupCpu&&(!startupOnly||diagnosticCpu))throw Error('Startup CPU diagnostic requires startup-only and cannot combine with search profiling');
const networkDiagnostic=process.argv.includes('--network-diagnostic');
if(networkDiagnostic&&!startupOnly)throw Error('Network diagnostic requires startup-only');
const navigationOnly=process.argv.includes('--navigation-only'),profileNavigation=process.argv.includes('--profile-navigation');
const cycleOption=process.argv.find(arg=>arg.startsWith('--nav-cycles='));const navCycles=cycleOption?Number(cycleOption.slice(13)):10;
if(!Number.isInteger(navCycles)||navCycles<1||navCycles>10)throw Error('Invalid diagnostic navigation cycle bound');
const flatVisualPilot=process.argv.includes('--flat-visual-pilot');
const authDecorationPilot=process.argv.includes('--auth-decoration-pilot');
if(authDecorationPilot&&!startupOnly)throw Error('Auth decoration pilot requires startup-only');
const navigationTimeline=process.argv.includes('--navigation-trace');
const phaseDiagnostic=process.argv.includes('--phase-diagnostic');
const externalReadyOwner=process.argv.includes('--external-ready-owner');
const observerCalibration=process.argv.includes('--observer-calibration');
const nativeTelemetryCalibration=process.argv.includes('--native-telemetry');
const root='test-results/performance-upgrade-20261103',pkg='com.hdmanager.caplab.diag',adb='D:/HD-DEV/android/sdk/platform-tools/adb.exe';
const pairedTap=process.argv.includes('--paired-tap');
if(pairedTap)assertNativeTapProtocolProof(JSON.parse(await fs.readFile(root+'/native-tap-ack-after-listener-scope-protocol-01.json','utf8')));
const c=await connectAndroidWebView({adb,serial:'emulator-5554',packageName:pkg,port:9251});
const networkCollector=networkDiagnostic?createIdentityNetworkTimingCollector():null;
const stopNetwork=networkCollector?c.onEvent(event=>networkCollector.onEvent(event)):()=>{};
const result={at:new Date().toISOString(),cohort,package:pkg,conditions:'Android 10/WebView74 emulator; real SDK with demo fixture, no real users/data or CPU profiler. CDP metadata adds overhead. In-page observer armed BEFORE trusted pointer/input → current-query/current-source ready UI and two RAF; host CDP turnaround excluded, not Cloud latency or INP.',navigation:[],search:[],errors:[]};
result.inputDispatch={mode:pairedTap?'ordered-paired-tap-v1':'legacy-serial-down-ACK-then-up',qualification:'Paired protocol requires completed Android calibration. This is an input-harness correction; do not attribute differences against serial synthetic taps to an app code speedup.'};
if(process.argv.includes('--fixture-rich'))result.fixture=JSON.parse(await fs.readFile(`${root}/rich-service/fixture-manifest.json`,'utf8'));
if(diagnosticCpu)result.conditions='DIAGNOSTIC CPU profiler on search phase only; never performance acceptance. Same synthetic SDK/demo dataset.';
if(diagnosticTimeline||navigationTimeline)result.conditions='DIAGNOSTIC timeline; never performance acceptance. Same synthetic SDK/demo dataset; only owned process trace retained.';
if(phaseDiagnostic)result.conditions='DIAGNOSTIC timestamp counters for source/index/query/hook phases; no V8 CPU sampler. Instrumentation adds overhead and is never speed acceptance. Same synthetic SDK/demo data.';
if(profileNavigation)result.conditions='DIAGNOSTIC CPU profiler on navigation only; never speed acceptance. Same real SDK/local fictional data.';
if(observerCalibration)result.conditions='DIAGNOSTIC measurement observer overhead A/B, same business APK and data; not an application performance improvement or acceptance.';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(expression,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){const value=await c.evaluate(expression);if(value)return value;await wait(30)}throw Error('UI condition timeout: '+expression.slice(0,80))}
async function press(selector){const point=await c.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled||!e.getClientRects().length)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return h&&(h===e||e.contains(h))?{x:x,y:y}:null})()`);if(!point)throw Error('Control unavailable: '+selector);if(pairedTap)await dispatchTrustedTap(c,point);else{await c.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});}}
async function fill(selector,value){
 await press(selector);await c.evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`);
 // A controlled search input can restore its caret between CDP requests on
 // WebView74. Use a real editing key and verify clearing before inserting;
 // never assign input.value or quietly benchmark an accidentally appended query.
 await c.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
 await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
 await until(`document.querySelector(${JSON.stringify(selector)}).value===''`);
 await c.send('Input.insertText',{text:value});
 await until(`document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(value)}`);
}
async function ready(id){await until(`(()=>{const m=document.querySelector('main[data-hd-module]');return m&&m.getAttribute('data-hd-module')===${JSON.stringify(id)}&&window.__hdSourceContract(m,${JSON.stringify(id)},window.__hdPlans).sourcesReady&&!window.__hdModulePending(m)})()`)}
async function stopTimeline(){
 const complete=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{off();reject(Error('Trace completion timeout'))},30000);const off=c.onEvent(e=>{if(e.method==='Tracing.tracingComplete'){clearTimeout(timer);off();resolve(e.params)}})});
 await c.send('Tracing.end');tracing=false;const {stream}=await complete;let content='';
 while(true){const chunk=await c.send('IO.read',{handle:stream,size:1048576});content+=chunk.base64Encoded?Buffer.from(chunk.data,'base64').toString('utf8'):chunk.data;if(chunk.eof)break}
 await c.send('IO.close',{handle:stream});const trace=JSON.parse(content),pid=Number(c.shell('shell','pidof',pkg)),owned=new Set([pid,...findOwnedWebViewRendererPids(c.shell('shell','dumpsys','activity','services',pkg),pkg,pid)]);
 trace.traceEvents=trace.traceEvents.filter(e=>owned.has(e.pid));await fs.writeFile(`${root}/timeline-${cohort}.json`,JSON.stringify(trace));
}
async function snapshot(){
 const heap=await c.send('Runtime.getHeapUsage'),dom=await c.send('Memory.getDOMCounters'),metrics=await c.send('Performance.getMetrics');
 const pid=Number(c.shell('shell','pidof',pkg)),renderers=findOwnedWebViewRendererPids(c.shell('shell','dumpsys','activity','services',pkg),pkg,pid),processes=[];
 for(const p of[pid,...renderers])processes.push({pid:p,kind:p===pid?'native':'renderer',...parseAndroidProcessMetrics(c.shell('shell','dumpsys','meminfo',String(p)),c.shell('shell','cat',`/proc/${p}/status`),c.shell('shell','cat',`/proc/${p}/stat`))});
 const timingCounters=Object.fromEntries(metrics.metrics.filter(m=>['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration'].includes(m.name)).map(m=>[m.name,m.value]));
 return{elapsedMs:performance.now(),heap,dom,processes,rendererOwnershipKnown:renderers.length>0,cpu:timingCounters,timingCounters,timingCounterQualification:'Legacy cpu field is retained as an alias only. CDP duration counters are NOT exclusive process CPU. Actual owned-process CPU uses proc utime/stime at recorded CLK_TCK; endpoint interval includes diagnostic sampling overhead, not exact trusted-tap latency.'};
}
async function readProbe(){return c.evaluate('({errors:window.__hdVerification.errors,rejections:window.__hdVerification.rejections,longTaskCount:window.__hdVerification.longTaskTotal,maxTaskMs:window.__hdVerification.maxTaskMs,blockedExternalRequests:window.__hdVerification.networkBlocked,nativeTelemetryCalls:window.__hdVerification.nativeTelemetryCalls,nativeTelemetryCounts:window.__hdVerification.nativeTelemetryCounts,workerTransfer:window.__hdVerification.workerTransfer||null})')}
async function measure(){
 if(networkDiagnostic){await c.send('Network.enable');result.conditions+=' DIAGNOSTIC main-page network timeline, numeric whitelist only; no headers, bodies or query strings. Not clean speed acceptance.';}
 await until('typeof window.__hdSourceContract==="function"');
 const reader=await c.evaluate('window.__hdSourceContract&&window.__hdSourceContract.toString()');
 result.sourceReadinessReaderSha256=crypto.createHash('sha256').update(reader||'').digest('hex');
 if(result.sourceReadinessReaderSha256!==crypto.createHash('sha256').update(readModuleSourceReadiness.toString()).digest('hex'))throw Error('Readiness reader is outdated; do not accept timings from a stale React branch');
 const apkPath=c.shell('shell','pm','path',pkg).trim().replace(/^package:/,'');
 if(!apkPath.startsWith('/data/app/')||!apkPath.includes(pkg)||!apkPath.endsWith('/base.apk'))throw Error('Unexpected installed fixture APK path');
 result.installedApkSha256=c.shell('shell','sha256sum',apkPath).trim().split(/\s+/)[0];
 result.device={serial:'emulator-5554',api:c.shell('shell','getprop','ro.build.version.sdk'),webview:c.shell('shell','dumpsys','webviewupdate').match(/Current WebView package[^\n]*/)?.[0]||null};
 result.device.clockTicksPerSecond=Number(c.shell('shell','getconf','CLK_TCK'));
 await c.send('Performance.enable');
 await until('Boolean(window.__hdVerification&&window.__hdVerification.fixtureOnly&&(document.querySelector("input[type=tel]")||document.querySelector("main[data-hd-module]")))');
 if(await c.evaluate('Boolean(document.querySelector("input[type=tel]"))')){
  if(authDecorationPilot){
   const css=await fs.readFile('performance/upgrade-20261103/auth-decoration-pilot.css','utf8');
   result.authDecorationPilot={cssSha256:crypto.createHash('sha256').update(css).digest('hex'),scope:'auth decorative layers only; no data or readiness changes'};
   await c.evaluate(`(function(){var s=document.createElement('style');s.id='upgrade-auth-decoration-pilot';s.textContent=${JSON.stringify(css)};document.head.appendChild(s)})()`);
   result.conditions+=' DIAGNOSTIC auth decoration CSS pilot, not accepted application code.';
  }
  await fill('input[type=tel]','0900000001');await fill('input[type=password]','Local-fixture-only-2026!');
  if(twoWorkerPilot){
   const {createTwoLaneReadWorker}=await import('../performance/upgrade-20261103/pilots/read-worker-lanes.js');
   const initialConcurrency=fourInitialTwoWorkerPilot?4:2;
   result.twoWorkerPilot={sourceSha256:crypto.createHash('sha256').update(createTwoLaneReadWorker.toString()).digest('hex'),globalInitialConcurrency:initialConcurrency,maxPending:16,expenseLane:balancedTwoWorkerPilot?1:0};
   await c.evaluate(`(${installTwoLaneWorkerPilot.toString()})(${createTwoLaneReadWorker.toString()},${createInitialReadAdmission.toString()},${JSON.stringify({expenseLane:balancedTwoWorkerPilot?1:0,initialConcurrency})})`);
   result.conditions+=' QA TWO-WORKER PROTOTYPE INJECTED before login; not shipping integration or global acceptance. Global initial concurrency='+initialConcurrency+(initialConcurrency===4?' (CHANGED concurrency, not the fair global-two A/B).':'.');
  }
  if(workerCpuDiagnostic){workerCpu=await armWorkerStartupCpu(c,{ownedSyntheticApk:true});result.conditions+=' DIAGNOSTIC worker CPU profiler active; not speed acceptance.';}
  if(restTimingDiagnostic){await c.evaluate(`(${armRestStartupTiming.toString()})({ownedSyntheticApk:true})`);result.conditions+=' DIAGNOSTIC REST pagination and parse timing, not acceptance.';}
  if(sourceTimingDiagnostic){await c.evaluate(`(${armStartupSourceTiming.toString()})()`);result.conditions+=' DIAGNOSTIC bounded source/contract timestamps, not clean speed acceptance.';}
  if(startupOnly){result.startupResourceBefore=await snapshot();result.conditions+=' Startup-only: endpoint resource snapshot after credential entry/before submit; no periodic heap sampler. Resource interval includes sample and pre-submit overhead, not peak memory.';}
  if(authPipelineDiagnostic)await c.evaluate(`(${armAuthPipelineTiming.toString()})()`);
  if(storageDiagnostic)await c.evaluate(`(function(){var proto=Storage.prototype,names=['getItem','setItem','removeItem'],originals={},rows=[];window.__upgradeStorageTiming={rows:rows,dropped:0};names.forEach(function(name){var original=originals[name]=proto[name];proto[name]=function(key){var started=performance.now();try{return original.apply(this,arguments)}finally{var duration=performance.now()-started;if(rows.length<128){var hash=2166136261,text=String(key);for(var i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);rows.push({operation:name,keyHash:(hash>>>0).toString(16),start:started,durationMs:duration,stack:duration>=50?String(new Error().stack).split('\\n').slice(1,5):undefined})}else window.__upgradeStorageTiming.dropped++}}});window.__upgradeStorageRestore=function(){names.forEach(function(name){proto[name]=originals[name]});delete window.__upgradeStorageRestore}})()`);
  if(startupCpu){await c.send('Profiler.enable');await c.send('Profiler.setSamplingInterval',{interval:1000});result.startupCpuClock={beforeStartMs:await c.evaluate('performance.now()')};await c.send('Profiler.start');result.startupCpuClock.afterStartMs=await c.evaluate('performance.now()');profiling=true;result.conditions+=' CPU PROFILER ACTIVE: function names/locations only, not speed acceptance. Main-page profile does not attribute worker CPU or native/GPU work.';}
  await c.evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Vào Ứng Dụng').setAttribute('data-upgrade-login','true')`);
  await c.evaluate(`(${armTrustedLoginClock.toString()})('[data-upgrade-login]')`);
  await c.evaluate(`(${armEventHomeStartupClock.toString()})('[data-upgrade-login]')`);await press('[data-upgrade-login]');
 }
 await until('Boolean(document.querySelector("button[aria-label=\\"Trang chủ\\"]"))');
 await press('button[aria-label="Trang chủ"]');await ready('home');
 // The probe samples readiness separately from the DOM contract. Allow its
 // next real observation before navigating away; do not turn a missed sample
 // into a fabricated zero or a shell/data-ready equivalence.
 await until('Number.isFinite(window.__hdVerification.homeDataReadyMs)',30000);
 await until('window.__upgradeEventHomeClock&&Number.isFinite(window.__upgradeEventHomeClock.uiMs)&&Number.isFinite(window.__upgradeEventHomeClock.dataMs)',10000);
 result.startup=await c.evaluate('({shellMs:window.__hdVerification.homeShellMs,interactiveMs:window.__hdVerification.homeInteractiveMs,dataReadyMs:window.__hdVerification.homeDataReadyMs,anchor:window.__hdVerification.loginAnchor,identityRequestAt:window.__hdVerification.identityRequestAt,loginIntentAt:window.__hdVerification.loginStart,stages:window.__hdVerification.stages})');
 result.startupOriginalProbe={...result.startup};
 result.eventDrivenHomeClock=await c.evaluate('window.__upgradeEventHomeClock||null');
 result.eventDrivenHomeClockQualification='Additional event-driven two-frame witness with the same visible/enabled navigation and actual current-data contract. Old sampled clocks retained; instrumentation differences are NOT application speed improvements.';
 result.homeReadModelPilot=await c.evaluate("(function(){var e=document.querySelector('[data-hd-home-read-model-ready]');return e?{ready:e.getAttribute('data-hd-home-read-model-ready'),result:e.getAttribute('data-hd-home-read-model-result'),capabilities:e.getAttribute('data-hd-home-read-model-capabilities')}:null})()");
 result.independentLoginClock=await c.evaluate('window.__upgradeLoginClock||null');
 if(result.independentLoginClock)result.startup=resolveTrustedLoginObservation(result.startupOriginalProbe,result.independentLoginClock);
 if(!/^trusted-login-/.test(result.startup.anchor||''))throw Error('Full login timing lacks a trusted submit intent; API-request-only timing is not accepted');
 result.nativeTelemetryCallsAtStartup=await c.evaluate('window.__hdVerification.nativeTelemetryCalls');
 if(authPipelineDiagnostic){result.authPipeline=await c.evaluate('window.__upgradeAuthPipeline');await c.evaluate('window.__upgradeAuthPipelineRestore()');result.conditions+=' Auth fetch/JSON/entropy timing diagnostic only; never speed acceptance, no credentials or response/random values collected.';}
 if(storageDiagnostic){result.storageDiagnostic=await c.evaluate('window.__upgradeStorageTiming');await c.evaluate('window.__upgradeStorageRestore()');result.conditions+=' Storage prototype timing diagnostic only, no values or unmasked keys recorded; no speed acceptance.';}
 result.workerTransferAtStartup=await c.evaluate('window.__hdVerification.workerTransfer||null');
 if(twoWorkerPilot){result.twoWorkerPilot.metadata=await c.evaluate('window.__upgradeTwoLanePilot.read()');const m=result.twoWorkerPilot.metadata;if(m.proxies!==1||m.childWorkers!==2||m.errors||m.fallbacks||m.peakInitialActive!==result.twoWorkerPilot.globalInitialConcurrency)throw Error('Two-worker prototype failed, changed admission or fell back; timing cannot prove its benefit');}
 if(workerCpu){result.workerStartupCpuFile=`${root}/worker-cpu-${cohort}.json`;await fs.writeFile(result.workerStartupCpuFile,JSON.stringify(await workerCpu.stop()));workerCpu=null;}
 if(restTimingDiagnostic)result.restStartupTiming=await c.evaluate('window.__upgradeRestStartupTiming.restore()');
 if(homeDetailsDiagnostic){
  result.primaryKpisBeforeDetails=await c.evaluate("Array.from(document.querySelectorAll('.business-report-kpi')).map(function(e){return e.title})");
  await c.evaluate("Array.from(document.querySelectorAll('button')).find(function(e){return e.textContent.trim()==='Xem phân tích'}).setAttribute('data-upgrade-details','true')");
  await press('[data-upgrade-details]');await ready('home');
  result.detailKpis=await c.evaluate("Array.from(document.querySelectorAll('.business-report-kpi')).map(function(e){return e.title})");
  await c.evaluate("Array.from(document.querySelectorAll('button')).find(function(e){return e.getAttribute('aria-label')==='Quay lại'}).setAttribute('data-upgrade-details-back','true')");
  await press('[data-upgrade-details-back]');
  await until("Array.from(document.querySelectorAll('button')).some(function(e){return e.textContent.trim()==='Xem phân tích'})");await ready('home');
  result.primaryKpisAfterDetails=await c.evaluate("Array.from(document.querySelectorAll('.business-report-kpi')).map(function(e){return e.title})");
  result.conditions+=' DIAGNOSTIC explicit Home detail demand/back lifetime, not clean startup or module timing.';
 }
 if(sourceTimingDiagnostic){result.startupSourceTiming=await c.evaluate('window.__upgradeStartupSources');await c.evaluate('window.__upgradeStartupSourcesRestore()');}
 if(startupCpu&&profiling){result.startupCpuClock.beforeStopMs=await c.evaluate('performance.now()');const profile=(await c.send('Profiler.stop')).profile;result.startupCpuClock.afterStopMs=await c.evaluate('performance.now()');profiling=false;result.startupCpuProfile=`${root}/cpu-${cohort}-startup.json`;await fs.writeFile(result.startupCpuProfile,JSON.stringify(profile));await c.send('Profiler.disable');}
 if(startupOnly){
  if(!result.startupResourceBefore)throw Error('Startup-only requires the fresh synthetic password form');
  result.homeKpis=await c.evaluate("Array.from(document.querySelectorAll('main[data-hd-module=home] .business-report-kpi-grid .business-report-kpi')).map(function(e){return{metric:e.className.match(/business-report-kpi--([a-z]+)/)[1],title:e.getAttribute('title')}})");
  if(result.homeKpis.length!==4||result.homeKpis.find(k=>k.metric==='revenue')?.title.replace(/[^0-9]/g,'')!=='120000000'||result.homeKpis.find(k=>k.metric==='receivables')?.title.replace(/[^0-9]/g,'')!=='80000000')throw Error('Full Home financial oracle did not match synthetic120M sales/80M debt');
  result.after=await snapshot();result.startupWorkerHeaps=await readWorkerHeaps(c);result.startupProcessCpu=ownedCpuIntervals([result.startupResourceBefore,result.after],result.device.clockTicksPerSecond);result.probe=await readProbe();result.status=authDecorationPilot?'AUTH_DECORATION_PILOT_NOT_ACCEPTANCE':(twoWorkerPilot||workerCpuDiagnostic||restTimingDiagnostic||sourceTimingDiagnostic||authPipelineDiagnostic||storageDiagnostic)?'STARTUP_PIPELINE_DIAGNOSTIC_NOT_ACCEPTANCE':startupCpu?'STARTUP_CPU_DIAGNOSTIC_NOT_ACCEPTANCE':networkDiagnostic?'STARTUP_NETWORK_DIAGNOSTIC_NOT_ACCEPTANCE':'STARTUP_TRANSFER_OBSERVED_NOT_GLOBAL_ACCEPTANCE';return;
 }

 if(nativeTelemetryCalibration){await c.evaluate('window.__hdVerification.setNativeTelemetryEnabled(true)');result.conditions+=' Native bridge logging ENABLED only for overhead calibration; never speed acceptance.';}
 result.visualPilot=flatVisualPilot;
 result.externalReadinessObserver=externalReadyOwner;
 if(externalReadyOwner){await c.evaluate('window.__hdVerification.setReadinessPollingEnabled(false)');result.conditions+=' Measurement-overhead calibration only: periodic source polling is paused AFTER Home startup; this driver still verifies actual current source/projection readiness on EVERY route. Errors, long-tasks and input/worker counters remain active.';}
 if(flatVisualPilot)await c.evaluate(`(()=>{var s=document.createElement('style');s.id='upgrade-flat-pilot';s.textContent='html.hd-low-power-ui .hd-enterprise-app-shell *,html.hd-low-power-ui .mobile-app-shell *{box-shadow:none!important;text-shadow:none!important;transition:none!important;}';document.head.appendChild(s)})()`);
 else await c.evaluate(`(()=>{var s=document.getElementById('upgrade-flat-pilot');if(s)s.remove()})()`);
 await c.evaluate(`(()=>{window.__upgradeInput=null;document.addEventListener('pointerdown',function(){window.__upgradePointer=performance.now()},true);document.addEventListener('input',function(){window.__upgradeInput=performance.now()},true)})()`);
 result.before=await snapshot();
 const targets=['products','order_requests','customers','orders','warehouse_dispatch'];
 if(profileNavigation){await c.send('Profiler.enable');await c.send('Profiler.setSamplingInterval',{interval:1000});await c.send('Profiler.start');profiling=true;}
 if(navigationTimeline){await c.send('Tracing.start',{categories:'devtools.timeline,v8,blink.user_timing,disabled-by-default-devtools.timeline',transferMode:'ReturnAsStream'});tracing=true;}
 for(let cycle=0;cycle<(searchOnly?0:navCycles);cycle++)for(const id of targets){
  await press('button[aria-label="Thêm"]');await until('Boolean(document.querySelector("button[data-hd-more-module]"))');
  await c.evaluate(`(${armUiTiming.toString()})(${JSON.stringify({kind:'navigation',module:id,selector:'button[data-hd-more-module="'+id+'"]'})})`);
  await press(`button[data-hd-more-module="${id}"]`);
  const timing=await c.evaluate('window.__upgradeArmedPromise');
  result.navigation.push({cycle,id,...timing});
  if(id==='warehouse_dispatch'&&cycle===0){await press('button[aria-label="Mở danh sách khách hàng"]');await until(`Boolean(document.querySelector('.hd-dispatch-picker-list [role=option]'))`);result.largePicker=await c.evaluate(`(()=>{var e=document.querySelector('.hd-dispatch-picker-list'),v=e.querySelector('[data-hd-virtual-options]');return{options:e.querySelectorAll('[role=option]').length,logicalOptions:v?Number(v.getAttribute('data-hd-virtual-options')):e.querySelectorAll('[role=option]').length,elements:e.querySelectorAll('*').length,height:e.clientHeight,scrollHeight:e.scrollHeight}})()`);await press('button[aria-label="Mở danh sách khách hàng"]');}
 }
 if(profileNavigation&&profiling){const cpu=(await c.send('Profiler.stop')).profile;profiling=false;await fs.writeFile(`${root}/cpu-${cohort}-navigation.json`,JSON.stringify(cpu));await c.send('Profiler.disable');}
 if(navigationTimeline&&tracing)await stopTimeline();
 await press('button[aria-label="Thêm"]');await until('Boolean(document.querySelector("button[data-hd-more-module=products]"))');await press('button[data-hd-more-module="products"]');await ready('products');await press('button[aria-label="Tìm kiếm"]');
 await until(`Boolean(Array.from(document.querySelectorAll('input')).find(e=>e.getClientRects().length&&/Tìm sản phẩm/.test(e.placeholder||'')))`);
 await c.evaluate(`Array.from(document.querySelectorAll('input')).find(e=>e.getClientRects().length&&/Tìm sản phẩm/.test(e.placeholder||'')).setAttribute('data-upgrade-query','true')`);
 // Match Firestore's document-name byte ordering, including broad queries
 // with equal scores; fixture object insertion order is not that ordering.
 const rows=Object.entries(makeFixture('manager',1000).data.products).sort(([a],[b])=>Buffer.compare(Buffer.from(a),Buffer.from(b))).map(([,row])=>row),index=createSearchRecordIndex(rows,getProductSearchFields);
 const queries=navigationOnly?[]:process.argv.includes('--first-search-only')?['s']:process.argv.includes('--broad-search')?['s','sy','syn','synthetic','product','Synthetic Product 1','Synthetic Product 90','900','no-match-fictional','Synthetic Product']:Array.from({length:20},(_,i)=>i%5===4?'no-match-fictional':`Synthetic Product ${900+i}`);
 if(diagnosticTimeline||diagnosticCpu)await c.evaluate(`(function(){var list=document.querySelector('.hd-product-list');window.__upgradeDomChanges={addedRows:0,removedRows:0};window.__upgradeDomObserver=new MutationObserver(function(records){records.forEach(function(record){[['addedNodes','addedRows'],['removedNodes','removedRows']].forEach(function(pair){Array.from(record[pair[0]]).forEach(function(node){if(node.nodeType!==1)return;window.__upgradeDomChanges[pair[1]]+=(node.matches('[role=listitem]')?1:0)+node.querySelectorAll('[role=listitem]').length})})})});window.__upgradeDomObserver.observe(list,{childList:true,subtree:true});document.addEventListener('input',function(){window.__upgradeDomChanges={addedRows:0,removedRows:0}},true)})()`);
 if(diagnosticCpu){await c.send('Profiler.enable');await c.send('Profiler.setSamplingInterval',{interval:1000});await c.send('Profiler.start');profiling=true;}
 if(diagnosticTimeline){await c.send('Tracing.start',{categories:'devtools.timeline,v8,blink.user_timing,disabled-by-default-devtools.timeline',transferMode:'ReturnAsStream'});tracing=true;}
 const pageSize=await c.evaluate("document.documentElement.classList.contains('hd-low-power-ui')?15:20");result.searchPageSize=pageSize;
 for(const query of queries){
  const expected=index.search(query).slice(0,pageSize).map(p=>p.name);
  await press('[data-upgrade-query]');await c.evaluate("document.querySelector('[data-upgrade-query]').select()");
  await c.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
  await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
  await until(`document.querySelector('[data-upgrade-query]').value===''&&document.querySelector('.hd-product-list').getAttribute('data-hd-search-committed-query')===''`);
  await c.evaluate(`(${armUiTiming.toString()})(${JSON.stringify({kind:'search',module:'products',selector:'[data-upgrade-query]',query,names:expected})})`);
  await c.send('Input.insertText',{text:query});
  const timing=await c.evaluate('window.__upgradeArmedPromise');
  await until(`document.querySelector('[data-upgrade-query]').value===${JSON.stringify(query)}`);
  result.search.push({query,expected,...timing,...(diagnosticTimeline||diagnosticCpu?{diagnosticDomMutations:await c.evaluate('window.__upgradeDomChanges')}: {})});
 }

 if(profiling){const cpu=(await c.send('Profiler.stop')).profile;profiling=false;await fs.writeFile(`${root}/cpu-${cohort}.json`,JSON.stringify(cpu));await c.send('Profiler.disable');}
 if(tracing)await stopTimeline();
 if(diagnosticTimeline||diagnosticCpu)await c.evaluate('if(window.__upgradeDomObserver)window.__upgradeDomObserver.disconnect()');
 result.after=await snapshot();result.probe=await readProbe();
 if(phaseDiagnostic)result.phaseDiagnostics=await c.evaluate('(function(){var s=window.__hdVerification||{};return{search:s.searchPhases||[],sources:s.sourcePhases||[],stages:s.stages||[]}})()');
 result.status=diagnosticCpu||diagnosticTimeline||navigationTimeline||phaseDiagnostic||flatVisualPilot||profileNavigation||externalReadyOwner||observerCalibration||nativeTelemetryCalibration?'DIAGNOSTIC_NOT_ACCEPTANCE':'MEASURED_SYNTHETIC_NOT_UNIVERSAL_ACCEPTANCE';
}
try{await measure()}catch(error){process.exitCode=1;result.status='FAILED';result.errors.push(error.message);try{result.failedUi=await c.evaluate(`({module:document.querySelector('main[data-hd-module]')&&document.querySelector('main[data-hd-module]').getAttribute('data-hd-module'),buttons:Array.from(document.querySelectorAll('button')).filter(e=>e.getClientRects().length).map(e=>({aria:e.getAttribute('aria-label'),text:e.textContent.trim().slice(0,40)}))})`)}catch{/* retain original error */}}
finally{if(twoWorkerPilot)try{await c.evaluate("if(window.__upgradeTwoLanePilot)window.__upgradeTwoLanePilot.restore()") }catch(error){result.errors.push("QA worker cleanup: "+error.message)}if(workerCpu)try{result.workerStartupCpuFile=`${root}/worker-cpu-${cohort}-partial.json`;await fs.writeFile(result.workerStartupCpuFile,JSON.stringify(await workerCpu.stop()));workerCpu=null}catch(error){result.errors.push('Worker profiler cleanup: '+error.message)}if(networkCollector)result.identityNetwork=networkCollector.snapshot();stopNetwork();if(nativeTelemetryCalibration)try{await c.evaluate('window.__hdVerification.setNativeTelemetryEnabled(false)')}catch(error){result.errors.push('Native telemetry restore: '+error.message)}if(profiling)try{const cpu=(await c.send('Profiler.stop')).profile;await fs.writeFile(`${root}/cpu-${cohort}-partial.json`,JSON.stringify(cpu));}catch(error){result.errors.push('Profiler cleanup: '+error.message)}if(externalReadyOwner)try{await c.evaluate('if(window.__hdVerification&&window.__hdVerification.setReadinessPollingEnabled)window.__hdVerification.setReadinessPollingEnabled(true)')}catch(error){result.errors.push('Observer restore: '+error.message)}try{await c.evaluate('if(window.__upgradeRestStartupTiming)window.__upgradeRestStartupTiming.restore();if(window.__upgradeStartupSourcesRestore)window.__upgradeStartupSourcesRestore();if(window.__upgradeAuthPipelineRestore)window.__upgradeAuthPipelineRestore();if(window.__upgradeStorageRestore)window.__upgradeStorageRestore();if(window.__upgradeArmedAbort)window.__upgradeArmedAbort();window.__upgradeArmedAbort=null;window.__upgradeArmedPromise=null;if(window.__upgradeLoginClockStop)window.__upgradeLoginClockStop();if(window.__upgradeEventHomeStop)window.__upgradeEventHomeStop()')}catch{}c.close();const summary=xs=>{const a=xs.map(x=>x.ms).sort((a,b)=>a-b);return{n:a.length,p50:a[Math.ceil(.5*a.length)-1]??null,p95:a[Math.ceil(.95*a.length)-1]??null,max:a.at(-1)??null}};result.summary={navigation:summary(result.navigation),search:summary(result.search)};result.endedAt=new Date().toISOString();result.hash=crypto.createHash('sha256').update(JSON.stringify(result.navigation)+JSON.stringify(result.search)).digest('hex');await fs.mkdir(root,{recursive:true});await fs.writeFile(`${root}/android-${cohort}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,summary:result.summary,largePicker:result.largePicker,errors:result.errors}));}

