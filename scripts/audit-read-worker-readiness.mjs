import {mkdir,writeFile} from 'node:fs/promises';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const output=process.env.HD_WORKER_READINESS_OUTPUT;
if(!output?.startsWith('test-results/'))throw Error('A local test-results output is required.');
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
try{
  const observation=await c.evaluate(`(function(){
    var main=document.querySelector('main[data-hd-module]'),key=main&&Object.keys(main).find(function(k){return k.indexOf('__reactFiber$')===0}),fiber=key&&main[key],worker=null,readiness=null;
    for(var depth=0;fiber&&depth<100;depth++,fiber=fiber.return){
      for(var hook=fiber.memoizedState,i=0;hook&&i<1000;hook=hook.next,i++){
        var value=hook.memoizedState;
        if(value&&value.current&&typeof value.current.getReadinessDiagnostics==='function')worker=value.current.getReadinessDiagnostics();
        if(value&&typeof value==='object'&&value.collections&&Object.prototype.hasOwnProperty.call(value,'tenantId')){
          readiness={collections:Object.keys(value.collections).sort().map(function(name){return {collection:name,ready:value.collections[name]===true}})};
        }
      }
    }
    return {module:main&&main.getAttribute('data-hd-module'),pageAgeMs:performance.now(),worker:worker,readiness:readiness,
      visibleRefreshLabel:!!Array.from(document.querySelectorAll('[role=status]')).find(function(n){return /Đang cập nhật dữ liệu/.test(n.textContent||'')&&!n.hidden}),
      hiddenRefreshMarker:!!document.querySelector('[data-hd-read-refreshing]'),moduleLoading:!!(main&&main.querySelector('[data-hd-module-loading]'))};
  })()`);
  await mkdir(output,{recursive:true});
  const result={at:new Date().toISOString(),observation,
    scope:'Read-only aggregate diagnostics from the approved Acceptance session. No rows, identifiers, credentials or document values exported. Pending is retained truthfully until publication witness/React commit; this is not a server latency or full acceptance result.'};
  await writeFile(output+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{c.close()}
