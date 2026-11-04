import { mkdir, writeFile } from 'node:fs/promises';
import { connectAndroidWebView } from './helpers/android-webview-cdp.mjs';
import { normalizeTrustedInputTimestamp } from './helpers/browser-interaction-timing.mjs';

// Diagnostic floor only: a temporary DOM button outside React changes its own
// counter. This does NOT measure a business module, cache, network or app paint.
const output=process.env.HD_INPUT_CONTROL_OUTPUT;
if(!output?.startsWith('test-results/'))throw Error('A local test-results output is required.');
await mkdir(output,{recursive:true});
const cdp=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
const samples=[];
try {
  await cdp.evaluate(`(function(){
    if(window.__hdInputControl)throw Error('Input control already active');
    var normalize=${normalizeTrustedInputTimestamp.toString()},sample=null,rows=[],tasks=[];
    var button=document.createElement('button');button.type='button';button.textContent='Kiểm tra thao tác';
    button.setAttribute('aria-label','Local diagnostic input control');
    button.style.cssText='position:fixed;top:50%;left:25%;width:50%;height:60px;z-index:2147483647;background:white;color:black;touch-action:manipulation;font:16px sans-serif';
    button.addEventListener('pointerdown',function(event){var now=performance.now();
      sample={inputAt:normalize(event.timeStamp,now,performance.timeOrigin,event.isTrusted),capturedAt:now};
    });
    button.addEventListener('click',function(event){event.stopPropagation();if(!sample)return;
      var current=sample;current.clickAt=performance.now();button.textContent='Kiểm tra '+(rows.length+1);
      current.domUpdatedAt=performance.now();requestAnimationFrame(function(){requestAnimationFrame(function(){
        current.twoFrameAt=performance.now();rows.push(current);
      })});
    });
    var observer;try{observer=new PerformanceObserver(function(list){list.getEntries().forEach(function(e){tasks.push({start:e.startTime,duration:e.duration})})});observer.observe({entryTypes:['longtask']})}catch(e){}
    document.body.appendChild(button);
    window.__hdInputControl={read:function(){return {rows:rows,tasks:tasks}},position:function(){var r=button.getBoundingClientRect();return {x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio}},restore:function(){if(observer)observer.disconnect();button.remove();delete window.__hdInputControl}};
  })()`);
  for(let i=0;i<12;i++){
    const position=await cdp.evaluate('window.__hdInputControl.position()');
    cdp.shell('shell','input','tap',String(Math.round(position.x)),String(Math.round(position.y)));
    const deadline=Date.now()+15000;let state;
    do {state=await cdp.evaluate('window.__hdInputControl.read()');if(state.rows.length>i)break;await new Promise(resolve=>setTimeout(resolve,100));}while(Date.now()<deadline);
    if(state.rows.length!==i+1)throw Error('Missing diagnostic sample');
    const row=state.rows[i];samples.push({...row,inputToDomMs:row.inputAt===null?null:row.domUpdatedAt-row.inputAt,inputToTwoFrameMs:row.inputAt===null?null:row.twoFrameAt-row.inputAt});
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  const state=await cdp.evaluate('window.__hdInputControl.read()');
  const values=samples.map(row=>row.inputToTwoFrameMs).filter(Number.isFinite).sort((a,b)=>a-b);
  const result={at:new Date().toISOString(),status:'DIAGNOSTIC_ONLY_NOT_APP_ACCEPTANCE',samples,longTasks:state.tasks,
    p50Ms:values[Math.ceil(values.length*.5)-1]??null,p95Ms:values[Math.ceil(values.length*.95)-1]??null,
    nativeProcesses:cdp.shell('shell','ps','-A','-o','PID,PPID,NAME').split(/\r?\n/).filter(line=>/dex2oat|installd|hdmanager|sandboxed_process/.test(line)),
    scope:'Temporary button outside React while the App and its background work remain active; this does not isolate system load from app load. Trusted input timestamp to own DOM update/two RAF callbacks. Diagnostic only, not app navigation/paint/INP or server time. No business data or credentials read/written.'};
  await writeFile(output+'/result.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({status:result.status,samples:samples.length,p50Ms:result.p50Ms,p95Ms:result.p95Ms}));
} catch(error) {
  await writeFile(output+'/incomplete-result.json',JSON.stringify({at:new Date().toISOString(),status:'INCOMPLETE_DIAGNOSTIC_NOT_ACCEPTANCE',samples,error:error.message},null,2));
  throw error;
} finally {try{await cdp.evaluate('window.__hdInputControl && window.__hdInputControl.restore()')}finally{cdp.close()}}
