import fs from 'node:fs/promises';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const output=process.env.HD_UI_STALL_OUTPUT;
if(!output)throw Error('Set HD_UI_STALL_OUTPUT');
const seconds=Number(process.env.HD_UI_STALL_SECONDS || 180);
if(!Number.isSafeInteger(seconds) || seconds<10 || seconds>1200)throw Error('Invalid observation duration');
await fs.mkdir(output,{recursive:true});
const cdp=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',port:9238,enableRuntime:false});
const started=Date.now();let stop=false,latest=null,failure=null;
process.once('SIGINT',()=>{stop=true});
try{
  const origin=await cdp.evaluate(`(function(){
    if(window.__hdUiStallProbe)throw Error('UI stall probe already exists');
    var stats={longTaskSupported:false,longTaskError:false,tasks:0,over100:0,maxTaskMs:null,maxVisibleTimerGapMs:null,phases:{},worst:[]};
    function phase(){var main=document.querySelector('main[data-hd-module]');return main?main.getAttribute('data-hd-module'):document.querySelector('input[type="tel"]')?'login':'boot';}
    var observer=null;
    try{
      observer=new PerformanceObserver(function(list){
        if(document.visibilityState!=='visible')return;
        list.getEntries().forEach(function(entry){
          if(entry.entryType!=='longtask')return;
          var label=phase(),row=stats.phases[label] || {tasks:0,over100:0,maxMs:0};
          row.tasks++;if(entry.duration>100){row.over100++;stats.over100++}row.maxMs=Math.max(row.maxMs,entry.duration);stats.phases[label]=row;
          stats.tasks++;stats.maxTaskMs=Math.max(stats.maxTaskMs || 0,entry.duration);
          stats.worst.push({phaseAtDelivery:label,start:entry.startTime,duration:entry.duration});
          stats.worst.sort(function(a,b){return b.duration-a.duration});stats.worst=stats.worst.slice(0,20);
        });
      });
      observer.observe({entryTypes:['longtask']});
      stats.longTaskSupported=Boolean((PerformanceObserver.supportedEntryTypes && PerformanceObserver.supportedEntryTypes.indexOf('longtask')>=0)
        || typeof window.PerformanceLongTaskTiming!=='undefined');
    }catch(error){stats.longTaskError=true;}
    var previous=performance.now(),wasVisible=document.visibilityState==='visible';
    var timer=setInterval(function(){var at=performance.now(),visible=document.visibilityState==='visible';if(visible && wasVisible)stats.maxVisibleTimerGapMs=Math.max(stats.maxVisibleTimerGapMs || 0,at-previous);previous=at;wasVisible=visible},50);
    window.__hdUiStallProbe={stats:stats,restore:function(){clearInterval(timer);if(observer)observer.disconnect();delete window.__hdUiStallProbe}};
    return performance.timeOrigin;
  })()`);
  while(!stop && Date.now()-started<seconds*1000){
    latest=await cdp.evaluate(`(function(){var p=window.__hdUiStallProbe,m=document.querySelector('main[data-hd-module]');return {origin:performance.timeOrigin,module:m && m.getAttribute('data-hd-module'),stats:p && p.stats};})()`);
    if(latest.origin!==origin || !latest.stats)throw Error('Observed page/probe changed');
    await fs.writeFile(output+'/progress.json',JSON.stringify({started,at:Date.now(),latest},null,2));
    await new Promise(resolve=>setTimeout(resolve,5000));
  }
}catch(error){failure=error.message;}
finally{
  try{await cdp.evaluate('window.__hdUiStallProbe && window.__hdUiStallProbe.restore()')}catch{/* lost renderer */}
  await fs.writeFile(output+'/result.json',JSON.stringify({started,ended:Date.now(),stopped:stop,latest,failure,
    scope:'Diagnostic Long Tasks API aggregates and 50-ms visible-page timer gaps only; no credentials, typed values, documents or network data. Observer phase labels are sampled at delivery, not causal attribution. Missing support stays unverified. Timer gaps are not INP, frame times or input latency. Stop this probe before clean interaction benchmarks.'},null,2));cdp.close();
}
