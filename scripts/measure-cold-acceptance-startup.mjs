import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
import {readModuleSourceReadiness,isExplicitlyVisible,hasActiveModulePending} from './helpers/module-source-readiness.mjs';

const output=process.env.HD_COLD_STARTUP_OUTPUT;
if(!output?.startsWith('test-results/'))throw Error('A local test-results output is required.');
const adb='D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial='emulator-5554';
const packageName='com.hdmanager.app.acceptance';
const invoke=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',timeout:30000}).trim();
await fs.mkdir(output,{recursive:true});
const previousPid=invoke('shell','pidof',packageName);
// Only the explicitly isolated Acceptance package is stopped; data/cache stay.
invoke('shell','am','force-stop',packageName);
const launchEpoch=Date.now();
const launchDeviceEpoch=Number(invoke('shell','date','+%s%3N'));
if(!Number.isSafeInteger(launchDeviceEpoch)||launchDeviceEpoch<=0)throw Error('Device launch clock unavailable.');
const activity=invoke('shell','am','start','-W','-n',packageName+'/com.hdmanager.app.MainActivity');
const c=await connectAndroidWebView({adb,serial,packageName,enableRuntime:false});
try{
 // Capacitor's initial document can still be replaced after its debug socket
 // appears. Do not install a probe into that disposable bootstrap document.
 const documentDeadline=Date.now()+20000;let boot;
 do{
  boot=await c.evaluate('({age:performance.now(),app:!!window.__HD_STARTUP_TIMING__})');
  if(boot?.app&&boot.age>=1000)break;
  await new Promise(resolve=>setTimeout(resolve,100));
 }while(Date.now()<documentDeadline);
 if(!boot?.app)throw Error('Final application document did not initialize.');
 await c.evaluate(`(function(){
  ${[readModuleSourceReadiness,isExplicitlyVisible,hasActiveModulePending].map(fn=>fn.toString()).join('\n')}
  var s={version:2,attachedPageAgeMs:performance.now(),origin:performance.timeOrigin,firstShellObservedAt:null,homeSourceObservedAt:null,homeReportObservedAt:null,homeReadyTwoFramesAt:null,missing:['actual-home-contract-not-observed'],loginVisible:false,required:null};
  var framesScheduled=false,timer=null;
  var stop=performance.now()+120000;
  function check(){
   var now=performance.now(),m=document.querySelector('main[data-hd-module]');
   if(m&&s.firstShellObservedAt===null)s.firstShellObservedAt=now;
   s.loginVisible=!!document.querySelector('input[type=tel]');
   if(m&&m.getAttribute('data-hd-module')==='home'){
    var source=readModuleSourceReadiness(m,'home',{});s.required=source.required;s.missing=source.missing;
    if(source.sourcesReady&&s.homeSourceObservedAt===null)s.homeSourceObservedAt=now;
    var report=Array.from(m.querySelectorAll('.business-report-workspace,.hd-staff-greeting-surface')).find(function(n){return isExplicitlyVisible(n,m)});
    if(source.sourcesReady&&report&&!hasActiveModulePending(m)&&!framesScheduled&&s.homeReadyTwoFramesAt===null){
     s.homeReportObservedAt=now;framesScheduled=true;requestAnimationFrame(function(){requestAnimationFrame(function(){framesScheduled=false;
      if(!s.done&&m.isConnected&&readModuleSourceReadiness(m,'home',{}).sourcesReady&&!hasActiveModulePending(m)&&isExplicitlyVisible(report,m))s.homeReadyTwoFramesAt=performance.now();
     })});
    }
   }
   if(s.homeReadyTwoFramesAt!==null||performance.now()>=stop){clearInterval(timer);s.done=true;s.completedEpoch=Date.now()}
  }
  s.events=(window.__HD_STARTUP_TIMING__||[]).filter(function(e){return ['auth.persistence.restored','auth.user.restored','shell.rendered','first.ui.rendered','background.sync.core_ready'].indexOf(e.name)>=0}).map(function(e){return {name:e.name,atEpochMs:e.atEpochMs,pageRelativeMs:e.atEpochMs-s.origin}});
  window.__hdColdStartup=s;s.restore=function(){clearInterval(timer);s.done=true};timer=setInterval(check,50);check();return true;
 })()`);
 let observation;const deadline=Date.now()+125000;
 do{
  observation=await c.evaluate(`(function(){var s=window.__hdColdStartup;if(!s)return null;s.events=(window.__HD_STARTUP_TIMING__||[]).filter(function(e){return ['auth.persistence.restored','auth.user.restored','shell.rendered','first.ui.rendered','background.sync.core_ready'].indexOf(e.name)>=0}).map(function(e){return {name:e.name,atEpochMs:e.atEpochMs,pageRelativeMs:e.atEpochMs-s.origin}});return s})()`);
  if(observation?.done)break;
  await new Promise(resolve=>setTimeout(resolve,500));
 }while(Date.now()<deadline);
 const result={at:new Date().toISOString(),launchEpoch,launchDeviceEpoch,previousPid,pid:c.pid,processChanged:previousPid!==c.pid,
  deviceClockUpperBounds:observation?{shellMs:observation.firstShellObservedAt===null?null:observation.origin+observation.firstShellObservedAt-launchDeviceEpoch,
   completeHomeMs:observation.homeReadyTwoFramesAt===null?null:observation.origin+observation.homeReadyTwoFramesAt-launchDeviceEpoch}:null,
  activity,observation,scope:'Actual Acceptance force-stop/start with persisted storage and remembered encrypted session retained. No password login or cache clearing. Activity timing is native lifecycle only. Same device clock recorded before the launch command; DOM/source observations are first-sampled upper bounds at 50ms cadence after CDP attaches. Actual nonempty current Home input contract, same-tenant flags and visible complete Home plus two RAF callbacks required. Events use existing application timestamps. No profiler; not compositor paint, INP, offline freshness or all-device certification.'};
 await fs.writeFile(output+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 if(!result.processChanged||!observation?.done||observation.homeReadyTwoFramesAt===null)process.exitCode=1;
}finally{try{await c.evaluate('window.__hdColdStartup&&window.__hdColdStartup.restore();true')}catch{}c.close()}
