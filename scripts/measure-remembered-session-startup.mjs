import fs from 'node:fs/promises';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const output=process.env.HD_REMEMBERED_STARTUP_OUTPUT || 'test-results/android10-remembered-session-startup';
await fs.mkdir(output,{recursive:true});
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
let registration;
try{
 await c.send('Page.enable');
 const source=`(function(){
  var requiredHome=null,framesScheduled=false;
  var state={observerVersion:4,origin:performance.timeOrigin,kind:'remembered-session-js-reload',shellAt:null,shellModule:null,coreAt:null,homeServerConfirmedAt:null,homeCommittedReportReadyAt:null,homeReadyTwoFramesAt:null,requiredHome:null,homeServerMissing:['actual-home-contract-not-observed'],
   reportSeen:false,blankTransitions:0,lastBlank:false,visibleRefreshBadgeSeen:false,firstRefreshAt:null,lastRefreshClearAt:null,completedEpoch:null,endReason:null,tasks:0,over100:0,maxTaskMs:null,maxTimerGapMs:null,worst:[]};
  var po=null,mo=null,tick=null,end=null,expiry=null,last=performance.now(),wasVisible=document.visibilityState==='visible';
  function finish(reason){if(state.endReason)return;state.endReason=reason;state.completedEpoch=Date.now();
   if(po)po.disconnect();if(mo)mo.disconnect();clearInterval(tick);clearTimeout(end);clearTimeout(expiry);}
  function check(){if(state.endReason)return;var now=performance.now(),m=document.querySelector('main[data-hd-module]');
   if(m&&state.shellAt===null){state.shellAt=now;state.shellModule=m.getAttribute('data-hd-module');end=setTimeout(function(){finish('two-minutes-after-shell')},120000);}
   var core=(window.__HD_STARTUP_TIMING__||[]).find(function(e){return e.name==='background.sync.core_ready'});
   if(core&&state.coreAt===null)state.coreAt=core.atEpochMs-state.origin;
   var marker=document.querySelector('[data-hd-read-refreshing="true"]');var pending=!!marker;if(marker&&!marker.hidden)state.visibleRefreshBadgeSeen=true;
   if(m&&m.getAttribute('data-hd-module')==='home'){
    var key=Object.keys(m).find(function(k){return k.indexOf('__reactFiber$')===0}),fiber=key&&m[key],confirmed=null,account=null;
    for(var depth=0;fiber&&depth<100;depth++,fiber=fiber.return){var props=fiber.memoizedProps;
     if(props&&props.currentUser)account=props.currentUser;
     if(props&&props.serverConfirmedCollectionState)confirmed=props.serverConfirmedCollectionState;
     if(props&&Array.isArray(props.homeReadinessCollections)&&props.homeReadinessCollections.length){
      requiredHome=['companies','employees'].concat(props.homeReadinessCollections);state.requiredHome=requiredHome.slice();
     }
    }
    var sameTenant=account&&confirmed&&confirmed.tenantId===account.companyId;
    state.homeServerMissing=requiredHome?requiredHome.filter(function(name){return !sameTenant||confirmed.collections[name]!==true}):['actual-home-contract-not-observed'];
    if(!state.homeServerMissing.length&&state.homeServerConfirmedAt===null)state.homeServerConfirmedAt=now;
    var report=m.querySelector('.business-report-workspace,.hd-staff-greeting-surface');var hidden=Array.from(m.querySelectorAll('[data-hd-projection-content]')).some(function(g){return g.style.display==='none'});if(report&&!hidden)state.reportSeen=true;var blank=state.reportSeen&&(!report||hidden);if(blank!==state.lastBlank)state.blankTransitions++;state.lastBlank=blank;
    if(!state.homeServerMissing.length&&report&&!hidden&&!report.closest('[aria-busy="true"]')
      &&!m.querySelector('[data-hd-module-loading],[data-hd-report-refreshing],[data-hd-ledger-loading]')
      &&state.homeReadyTwoFramesAt===null&&!framesScheduled){
      framesScheduled=true;state.homeCommittedReportReadyAt=now;
      requestAnimationFrame(function(){requestAnimationFrame(function(){
       framesScheduled=false;if(state.endReason)return;
       if(!m.isConnected||m.querySelector('[data-hd-module-loading],[data-hd-report-refreshing],[data-hd-ledger-loading]')){state.homeCommittedReportReadyAt=null;return}
       state.homeReadyTwoFramesAt=performance.now();
      })});
    }
   }
   if(pending){if(state.firstRefreshAt===null)state.firstRefreshAt=now;state.lastRefreshClearAt=null;}
   else if(m&&state.firstRefreshAt!==null&&state.lastRefreshClearAt===null)state.lastRefreshClearAt=now;
  }
  try{po=new PerformanceObserver(function(list){if(state.endReason||document.visibilityState!=='visible')return;
   list.getEntries().forEach(function(e){if(e.entryType!=='longtask')return;state.tasks++;if(e.duration>=100)state.over100++;
    state.maxTaskMs=Math.max(state.maxTaskMs||0,e.duration);state.worst.push({start:e.startTime,duration:e.duration});state.worst.sort(function(a,b){return b.duration-a.duration});state.worst=state.worst.slice(0,20);});});
   po.observe({entryTypes:['longtask']});state.longTaskSupported=typeof PerformanceLongTaskTiming!=='undefined';
  }catch(e){state.longTaskSupported=false;}
  mo=new MutationObserver(check);mo.observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-busy']});
  tick=setInterval(function(){var now=performance.now(),visible=document.visibilityState==='visible';if(visible&&wasVisible)state.maxTimerGapMs=Math.max(state.maxTimerGapMs||0,now-last);last=now;wasVisible=visible;check()},50);
  expiry=setTimeout(function(){finish('three-minute-no-shell-timeout')},180000);
  window.__hdRememberedStartup={state:state,restore:finish};check();
 })()`;
 registration=(await c.send('Page.addScriptToEvaluateOnNewDocument',{source})).identifier;
 await c.send('Page.reload',{ignoreCache:false});
 await fs.writeFile(output+'/armed.json',JSON.stringify({at:new Date(),registration,scope:'Preload observer before bundled App scripts, then same-process Page.reload with encrypted remembered session. Warm process/file cache; not cold device/process or password-login latency. No credential entry/extraction.'},null,2));
 console.log('REMEMBERED_STARTUP_OBSERVER_ARMED');
 const deadline=Date.now()+240000;let result;
 do{
  try{result=await c.evaluate(`(function(){var p=window.__hdRememberedStartup;return p&&{probe:p.state,loginVisible:!!document.querySelector('input[type="tel"]'),refreshPending:!!document.querySelector('[data-hd-read-refreshing]'),ledgerPending:!!document.querySelector('[data-hd-ledger-loading]'),startup:(window.__HD_STARTUP_TIMING__||[]).filter(function(e){return ['auth.persistence.ready','auth.persistence.configured','auth.persistence.restored','auth.identity_cache_released','auth.user.restored','shell.rendered','first.ui.rendered','data.core.available','background.sync.core_ready','data.notifications.admitted'].indexOf(e.name)>=0}).map(function(e){return {name:e.name,atEpochMs:e.atEpochMs,durationMs:e.durationMs,...(e.name==='data.notifications.admitted'?{reason:(e.detail && e.detail.reason)}: {})}})};})()`)}catch{result=null;}
  if(result?.probe.endReason)break;
  if(!result && Date.now()>deadline-230000)throw Error('Preload probe did not attach within 10 seconds');
  await new Promise(r=>setTimeout(r,500));
 }while(Date.now()<deadline);
 if(!result?.probe.endReason)throw Error('Remembered startup observation did not finish');
 await fs.writeFile(output+'/observed.json',JSON.stringify({at:new Date(),...result,scope:'Genuine remembered-session restoration after JS reload. Observer v4 requires the actual nonempty Home input contract from current MainApp props, same-tenant server-confirmed sources and visible company/personal Home content without a pending projection, followed by two RAF callbacks. No legacy company-only contract substituted for personal Home. Exact generation/source commit protection belongs to application code; DOM witness is not a server latency/revision hash guarantee. Timings/counts/collection names only, no forced geometry. Warm process/file cache, not cold process/device, password-login latency, compositor paint or INP. No CPU profiler or regression tests in window.'},null,2));
 console.log(JSON.stringify(result.probe));
 if(result.loginVisible||result.probe.endReason!=='two-minutes-after-shell')throw Error('Remembered startup failed');
}finally{
 if(registration)try{await c.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:registration})}catch{}
 try{await c.evaluate('window.__hdRememberedStartup && window.__hdRememberedStartup.restore("collected")')}catch{}
 c.close();
}
