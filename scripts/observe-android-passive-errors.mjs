import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const directory=process.env.HD_PASSIVE_HEALTH_OUTPUT,mode=process.argv[2];
if(!directory?.startsWith('test-results/')||!['arm','collect'].includes(mode))throw Error('Local output and arm/collect mode required.');
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance',enableRuntime:false});
await mkdir(directory,{recursive:true});
try{
 if(mode==='arm'){
  const state=await c.evaluate(`(function(){
   if(window.__hdPassiveHealthProbe)throw Error('Passive probe already installed');
   var state={origin:performance.timeOrigin,startedAt:performance.now(),errors:0,resourceErrors:0,unhandledRejections:0,pageHides:0};
   function error(event){if(event.target!==window){state.resourceErrors++;return}state.errors++}
   function rejection(){state.unhandledRejections++}function hide(){state.pageHides++}
   window.addEventListener('error',error,true);window.addEventListener('unhandledrejection',rejection);window.addEventListener('pagehide',hide);
   window.__hdPassiveHealthProbe={read:function(){var main=document.querySelector('main[data-hd-module]');return Object.assign({},state,{elapsedMs:performance.now()-state.startedAt,module:main&&main.getAttribute('data-hd-module'),loginVisible:!!document.querySelector('input[type=tel]'),refreshPending:!!document.querySelector('[data-hd-read-refreshing]')})},restore:function(){window.removeEventListener('error',error,true);window.removeEventListener('unhandledrejection',rejection);window.removeEventListener('pagehide',hide);delete window.__hdPassiveHealthProbe}};
   return window.__hdPassiveHealthProbe.read();
  })()`);
  await writeFile(directory+'/armed.json',JSON.stringify({at:new Date().toISOString(),state},null,2));
  console.log(JSON.stringify({armed:true,origin:state.origin,module:state.module}));
 }else{
  const armed=JSON.parse(await readFile(directory+'/armed.json','utf8'));
  const state=await c.evaluate('window.__hdPassiveHealthProbe?window.__hdPassiveHealthProbe.read():null');
  const sameContext=!!state&&state.origin===armed.state.origin;
  const result={at:new Date().toISOString(),armedAt:armed.at,state,sameContext,
   status:!sameContext?'PAGE_CONTEXT_CHANGED_NOT_CERTIFIED':state.errors||state.resourceErrors||state.unhandledRejections||state.loginVisible?'OBSERVED_FAILURE':'NO_FAILURE_OBSERVED_IN_WINDOW',
   scope:'Passive aggregate counters in the already-approved Acceptance session. CDP is disconnected between arm and collect; no CPU/heap profiler, typed text, message/rejection contents, URLs, document payloads or credentials collected. Error boundaries may catch errors outside these global listeners. Losing page context is not zero errors/PASS. This idle observation is not a mixed-workload soak, latency benchmark or proof of zero leaks.'};
  await writeFile(directory+'/result.json',JSON.stringify(result,null,2));
  await c.evaluate('window.__hdPassiveHealthProbe&&window.__hdPassiveHealthProbe.restore()');
  console.log(JSON.stringify(result));
 }
}finally{c.close()}
