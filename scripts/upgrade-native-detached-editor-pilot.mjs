import fs from'node:fs/promises';
import{createHash}from'node:crypto';
import{transformSync}from'esbuild';
import{connectAndroidWebView}from'./helpers/android-webview-cdp.mjs';
import{createDetachedEditorCleanup}from'../src/services/detachedEditorCleanup.js';
const root='test-results/performance-upgrade-20261103',c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.caplab.diag',port:9239});
const report={at:new Date().toISOString(),qualification:'Mechanism pilot in old WebView; synthetic detached DOM only, explicit diagnostic GC, no claim of natural long-run app RAM improvement.',cases:[]};
async function snap(){await c.send('HeapProfiler.collectGarbage');return{heap:await c.send('Runtime.getHeapUsage'),dom:await c.send('Memory.getDOMCounters')}}
try{
 if(!await c.evaluate('Boolean(window.__hdVerification&&window.__hdVerification.fixtureOnly)'))throw Error('Fixture guard');
 report.codeSha256=createHash('sha256').update(createDetachedEditorCleanup.toString()).digest('hex');
 await c.evaluate(transformSync(`window.__detachedPilotFactory=${createDetachedEditorCleanup.toString()};window.__detachedPilotHost=document.createElement('div');document.body.appendChild(window.__detachedPilotHost)`,{target:'chrome74'}).code);
 report.before=await snap();
 for(const enabled of[false,true]){
  const row={enabled,before:await snap()};
  if(enabled)await c.evaluate('window.__detachedPilotCleanup=window.__detachedPilotFactory({schedule:function(fn){return setTimeout(fn,0)}})');
  for(let i=0;i<12;i++){
   await c.evaluate(`(function(){var host=window.__detachedPilotHost,r=document.createElement('section');r.setAttribute('data-pilot','true');r.innerHTML='<input aria-label="Synthetic history pilot">'+new Array(501).join('<div><span>fictional row</span></div>');host.appendChild(r);window.__detachedPilotTree=r;r.querySelector('input').focus()})()`);
   await c.send('Input.insertText',{text:`fixture-${i}`});
   await c.evaluate(`(function(){var r=window.__detachedPilotTree;r.remove();${enabled?'window.__detachedPilotCleanup.enqueue(r);':''}window.__detachedPilotTree=null})()`);
  }
  await new Promise(r=>setTimeout(r,1500));row.after=await snap();report.cases.push(row);
 }
 await c.evaluate(`(function(){var e=document.createElement('input');e.id='active-detached-pilot';window.__detachedPilotHost.appendChild(e);e.focus()})()`);
 await c.send('Input.insertText',{text:'keep-active-draft'});
 report.activeEditor=await c.evaluate(`(function(){var e=document.querySelector('#active-detached-pilot'),before=e.value,undoEnabled=document.queryCommandEnabled('undo'),undone=document.execCommand('undo'),afterUndo=e.value,redone=document.execCommand('redo');return{before:before,undoEnabled:undoEnabled,undone:undone,afterUndo:afterUndo,redone:redone,afterRedo:e.value,connected:e.isConnected}})()`);
 report.status=report.activeEditor.afterRedo==='keep-active-draft'&&report.activeEditor.afterUndo===''?'MECHANISM_VERIFIED_NOT_APP_ACCEPTANCE':'FAILED';
}catch(error){report.status='FAILED';report.error=error.message;process.exitCode=1}finally{
 try{await c.evaluate(`if(window.__detachedPilotCleanup)window.__detachedPilotCleanup.dispose();if(window.__detachedPilotHost)window.__detachedPilotHost.remove();window.__detachedPilotFactory=null;window.__detachedPilotCleanup=null;window.__detachedPilotHost=null`)}catch{}
 report.endedAt=new Date().toISOString();await fs.writeFile(`${root}/native-detached-editor-pilot.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));c.close();
}
