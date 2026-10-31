import fs from 'node:fs/promises';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const output=process.env.HD_ARMED_LOGIN_OUTPUT;
if(!output)throw Error('Set HD_ARMED_LOGIN_OUTPUT');
await fs.mkdir(output,{recursive:true});
const cdp=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
try{
  const result=await cdp.evaluate(`(function(){
    if(window.__hdArmedLogin)throw Error('Login observer already armed');
    var observer=null,mutation=null,timer=null,expiry=null,endTimer=null,restoreTimer=null;
    var state={origin:performance.timeOrigin,armedEpoch:Date.now(),submitAt:null,submitEpoch:null,shellAt:null,coreAt:null,
      firstRefreshAt:null,refreshReadyAt:null,completedEpoch:null,endReason:null,longTaskSupported:false,longTaskError:false,
      tasks:0,over100:0,maxTaskMs:null,maxVisibleTimerGapMs:null,phases:{},worst:[]};
    function phase(){var m=document.querySelector('main[data-hd-module]');return m?m.getAttribute('data-hd-module'):'login'}
    function restore(reason){
      if(state.endReason)return;
      state.endReason=reason||'collected';state.completedEpoch=Date.now();
      if(observer)observer.disconnect();if(mutation)mutation.disconnect();
      clearInterval(timer);clearTimeout(expiry);clearTimeout(endTimer);clearTimeout(restoreTimer);
      document.removeEventListener('click',click,true);
    }
    function observe(){
      if(state.submitAt===null||state.endReason)return;
      var m=document.querySelector('main[data-hd-module]'),now=performance.now();
      if(m&&state.shellAt===null){state.shellAt=now;endTimer=setTimeout(function(){restore('two-minutes-after-shell')},120000)}
      if(state.coreAt===null&&(window.__HD_STARTUP_TIMING__||[]).some(function(e){return e.name==='background.sync.core_ready'}))state.coreAt=now;
      var pending=!!document.querySelector('[data-hd-read-refreshing="true"]');
      if(pending){if(state.firstRefreshAt===null)state.firstRefreshAt=now;state.refreshReadyAt=null}
      else if(state.firstRefreshAt!==null&&state.refreshReadyAt===null&&m)state.refreshReadyAt=now;
    }
    function click(event){
      if(state.submitAt!==null)return;
      var b=event.target.closest('button');if(!b||!/Vào Ứng Dụng|Vào ứng dụng/i.test(b.innerText))return;
      state.submitAt=performance.now();state.submitEpoch=Date.now();
      var last=performance.now(),visible=document.visibilityState==='visible';
      timer=setInterval(function(){var n=performance.now(),v=document.visibilityState==='visible';if(v&&visible)state.maxVisibleTimerGapMs=Math.max(state.maxVisibleTimerGapMs||0,n-last);last=n;visible=v},50);
      restoreTimer=setTimeout(function(){restore('ten-minute-submit-timeout')},600000);
    }
    try{
      observer=new PerformanceObserver(function(list){
        if(state.submitAt===null||state.endReason||document.visibilityState!=='visible')return;
        list.getEntries().forEach(function(e){
          if(e.entryType!=='longtask'||e.startTime+e.duration<state.submitAt)return;
          var label=phase(),row=state.phases[label]||{tasks:0,over100:0,maxMs:null};row.tasks++;state.tasks++;
          if(e.duration>100){row.over100++;state.over100++}
          row.maxMs=Math.max(row.maxMs||0,e.duration);state.maxTaskMs=Math.max(state.maxTaskMs||0,e.duration);state.phases[label]=row;
          state.worst.push({phaseAtDelivery:label,start:e.startTime,duration:e.duration});state.worst.sort(function(a,b){return b.duration-a.duration});state.worst=state.worst.slice(0,20);
        });
      });observer.observe({entryTypes:['longtask']});
      state.longTaskSupported=!!((PerformanceObserver.supportedEntryTypes&&PerformanceObserver.supportedEntryTypes.indexOf('longtask')>=0)||typeof PerformanceLongTaskTiming!=='undefined');
    }catch(e){state.longTaskError=true}
    mutation=new MutationObserver(observe);mutation.observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-busy']});
    document.addEventListener('click',click,true);
    expiry=setTimeout(function(){restore('two-hour-arm-expiry')},7200000);
    window.__hdArmedLogin={state:state,restore:restore};
    return {origin:state.origin,armedEpoch:state.armedEpoch,longTaskSupported:state.longTaskSupported,loginVisible:!!document.querySelector('input[type="tel"]')};
  })()`);
  await fs.writeFile(output+'/armed.json',JSON.stringify({at:new Date(),...result,
    scope:'Bounded in-page observer starts on actual login button click, ends 2 minutes after shell or 10 minutes after submit; unused arm expires after 2 hours. Counts/timing only, no typed values, credentials, document or network payload. Read and restore before clean navigation audit; timer gaps/Long Tasks are not INP.'},null,2));
  console.log(JSON.stringify(result));
}finally{cdp.close()}
