import fs from'node:fs/promises';
import{connectAndroidWebView}from'./helpers/android-webview-cdp.mjs';
const root='test-results/performance-upgrade-20261103';
const previous=JSON.parse(await fs.readFile(`${root}/post-soak-heap-retry-status.json`,'utf8'));
if(!previous.snapshot?.complete)throw Error('Preserve a complete original retainer snapshot first');
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.caplab.diag',port:9239});
const report={startedAt:new Date().toISOString(),qualification:'Post-span synthetic editor-history diagnostic only. Explicit undo/GC must never be counted as application memory improvement or applied to business forms.'};
try{
 if(!await c.evaluate(`Boolean(window.__hdVerification&&window.__hdVerification.fixtureOnly)`))throw Error('Fixture-only guard');
 report.before={heap:await c.send('Runtime.getHeapUsage'),dom:await c.send('Memory.getDOMCounters')};
 report.undo=await c.evaluate(`new Promise(function(resolve){var count=0;function step(){for(var i=0;i<10&&count<1000&&document.queryCommandEnabled('undo');i++){if(!document.execCommand('undo'))break;count++}if(count<1000&&document.queryCommandEnabled('undo'))setTimeout(step,0);else resolve({count:count,remaining:document.queryCommandEnabled('undo'),redo:document.queryCommandEnabled('redo')})}step()})`);
 // A fresh edit only in a temporary synthetic input invalidates the redo branch.
 report.redoReset=await c.evaluate(`(function(){var e=document.createElement('input');e.setAttribute('data-diagnostic-only','true');document.body.appendChild(e);e.focus();var inserted=document.execCommand('insertText',false,'fixture-history-reset');e.blur();e.remove();return{inserted:inserted,redo:document.queryCommandEnabled('redo')}})()`);
 await c.send('HeapProfiler.collectGarbage');await new Promise(r=>setTimeout(r,1000));await c.send('HeapProfiler.collectGarbage');
 report.after={heap:await c.send('Runtime.getHeapUsage'),dom:await c.send('Memory.getDOMCounters'),page:await c.evaluate(`({elements:document.querySelectorAll('*').length,module:document.querySelector('main[data-hd-module]')&&document.querySelector('main[data-hd-module]').getAttribute('data-hd-module')})`)};
 report.status='DIAGNOSTIC_ONLY';
}catch(error){report.status='FAILED';report.error=error.message;process.exitCode=1}finally{report.endedAt=new Date().toISOString();await fs.writeFile(`${root}/native-undo-diagnostic.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));c.close()}
