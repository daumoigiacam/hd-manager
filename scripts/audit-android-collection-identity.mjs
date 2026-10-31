import fs from 'node:fs/promises';
import {build} from 'esbuild';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const output=process.env.HD_IDENTITY_LAB_OUTPUT||'test-results/android10-collection-identity-lab';
await fs.mkdir(output,{recursive:true});
const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
  import {retainCollectionRecordIdentity} from './src/utils/collectionIdentity.js';
  import {retainCollectionRecordIdentityAsync} from './src/utils/cooperativeCollectionIdentity.js';
  export {retainCollectionRecordIdentity,retainCollectionRecordIdentityAsync};
`},bundle:true,write:false,format:'iife',globalName:'IdentityLab',target:'chrome74'});
const cdp=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
const samples=[];
try{
  const state=await cdp.evaluate('({origin:performance.timeOrigin,module:document.querySelector("main[data-hd-module]")&&document.querySelector("main[data-hd-module]").getAttribute("data-hd-module")})');
  for(const mode of ['sync','cooperative','cooperative','sync']){
    await cdp.evaluate(`(function(){${bundle.outputFiles[0].text}
      var previous=Array.from({length:3000},function(_,id){return {id:'fixture-'+id,amount:id,
        items:Array.from({length:12},function(_,j){return {quantity:j/10,amount:125000,name:'Vịt 🦆'}})}});
      window.__hdIdentityLab={methods:IdentityLab,previous:previous,next:JSON.parse(JSON.stringify(previous))};
    })()`);
    const result=await cdp.evaluate(`new Promise(function(resolve,reject){
      var lab=window.__hdIdentityLab,mode=${JSON.stringify(mode)},tasks=[],observer=null,last=performance.now(),gap=0,feedback=null;
      try{observer=new PerformanceObserver(function(list){list.getEntries().forEach(function(e){if(e.entryType==='longtask')tasks.push({start:e.startTime,duration:e.duration})})});observer.observe({entryTypes:['longtask']})}catch(e){}
      var timer=setInterval(function(){var n=performance.now();gap=Math.max(gap,n-last);last=n},16);
      setTimeout(async function(){
        var start=performance.now();
        requestAnimationFrame(function(){requestAnimationFrame(function(){feedback=performance.now()-start})});
        try{
          var value=mode==='sync'?lab.methods.retainCollectionRecordIdentity(lab.previous,lab.next)
            :await lab.methods.retainCollectionRecordIdentityAsync(lab.previous,lab.next);
          var duration=performance.now()-start,ok=value===lab.previous;
          setTimeout(function(){clearInterval(timer);if(observer)observer.disconnect();resolve({mode:mode,durationMs:duration,feedbackMs:feedback,maxTimerGapMs:gap,
            fullIdentityRetained:ok,rows:value.length,amountSum:value.reduce(function(n,r){return n+r.amount},0),tasks:tasks,longTasksSupported:!!observer})},100);
        }catch(e){clearInterval(timer);if(observer)observer.disconnect();reject(Error('Synthetic identity comparison failed'))}
      },0);
    })`);
    if(!result.fullIdentityRetained||result.rows!==3000||result.amountSum!==4498500)throw Error('Synthetic comparison parity failed');
    samples.push(result);await fs.writeFile(output+'/progress.json',JSON.stringify({state,samples},null,2));
    await cdp.evaluate('delete window.__hdIdentityLab');
  }
  await fs.writeFile(output+'/result.json',JSON.stringify({state,samples,
    scope:'Actual Android 10/WebView 74, ABBA pure helper diagnostic, synthetic 3000-row fixture only. Auth session and business state untouched; background app work may overlap. Timer gap/2RAF are not INP, full-app login, data freshness, or universal acceptance.'},null,2));
  console.log(JSON.stringify(samples.map(({tasks,...row})=>({...row,observedTasksOver100:tasks.filter(t=>t.duration>100).length}))));
}finally{try{await cdp.evaluate('delete window.__hdIdentityLab')}catch{}cdp.close()}
