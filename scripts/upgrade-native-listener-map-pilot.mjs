import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
import {assertNoActiveUpgradeSoak} from './helpers/upgrade-observation-barrier.mjs';
import {readNativeBridgeCallbackCount} from './helpers/native-bridge-callback-count.mjs';

const cohort=process.argv[2],label=process.argv[3];
if(!/^after-[a-z0-9-]+$/.test(cohort||'')||!/^[a-z0-9-]+$/.test(label||''))throw Error('Owned cohort and unique observation label required');
const root='test-results/performance-upgrade-20261103',out=`${root}/native-listener-map-${cohort}-${label}.json`;
try{await fs.access(out);throw Error('Preserve existing native map evidence')}catch(error){if(error.code!=='ENOENT')throw error}
await assertNoActiveUpgradeSoak();
const identity=JSON.parse(await fs.readFile(`${root}/${cohort}/capacitor-build-identity.json`,'utf8'));
if(identity.project!=='demo-hdm-perf-verification')throw Error('Owned demo project required');
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.caplab.diag',port:9299});
const report={at:new Date().toISOString(),cohort,label,status:'RUNNING',iterations:50,counts:[],productionRequests:0,
  conditions:'AFTER natural span and post-span controllers. Same installed demo APK verified by SHA. Public App.addListener(appStateChange) and handle.remove, no business mutation. Closure map size only; callback values/session payloads are never returned. Diagnostic closure inspection adds overhead; this is not UI latency, natural RAM or whole-app leak acceptance.'};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function stableCount(){
  const values=[];
  for(let i=0;i<8;i++){
    const n=await readNativeBridgeCallbackCount(c);values.push(n);
    if(values.length>=3&&values.slice(-3).every(value=>value===n))return {value:n,samples:values};
    await wait(150);
  }
  throw Error('Background native callbacks did not settle; do not infer a leak delta');
}
try{
  const remote=c.shell('shell','pm','path','com.hdmanager.caplab.diag').replace(/^package:/,'');
  if(!remote.startsWith('/data/app/')||!remote.includes('com.hdmanager.caplab.diag')||!remote.endsWith('/base.apk'))throw Error('Unexpected owned APK path');
  report.apkSha256=c.shell('shell','sha256sum',remote).split(/\s+/)[0];
  if(report.apkSha256!==crypto.createHash('sha256').update(await fs.readFile(`${root}/${cohort}/capacitor-project/app/build/outputs/apk/diagnostic/app-diagnostic.apk`)).digest('hex'))throw Error('Installed APK does not match cohort');
  if(!await c.evaluate('Boolean(window.__hdVerification&&window.__hdVerification.fixtureOnly)'))throw Error('Isolated demo runtime required');
  report.device={api:c.shell('shell','getprop','ro.build.version.sdk'),webview:c.shell('shell','dumpsys','webviewupdate').match(/Current WebView package[^\n]*/)?.[0]||null};
  report.origin=await c.evaluate('performance.timeOrigin');
  report.before=await stableCount();
  // Use the installed SDK's public plugin proxy. The application root, auth,
  // caches and native bridge are not overwritten or shimmed by this pilot.
  const operations=await c.evaluate(`(async function(){
    var app=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.App;
    if(!app||typeof app.addListener!=='function')throw Error('Public App plugin unavailable');
    var completed=0;
    for(var i=0;i<50;i++){
      var listener=await app.addListener('appStateChange',function(){});
      try{if(!listener||typeof listener.remove!=='function')throw Error('Listener handle unavailable')}
      finally{if(listener&&typeof listener.remove==='function')await listener.remove()}
      completed++;
    }
    var info=await app.getInfo();
    return {completed:completed,infoPromiseResolved:!!(info&&typeof info.id==='string'&&typeof info.version==='string')};
  })()`);
  report.operations=operations;await wait(500);
  report.after=await stableCount();report.delta=report.after.value-report.before.value;
  if(report.origin!==await c.evaluate('performance.timeOrigin'))throw Error('Document reloaded during callback pilot');
  if(operations.completed!==50||!operations.infoPromiseResolved)throw Error('Native operation or promise semantics failed');
  const patched=identity.nativeBridge?.override===true;
  if(report.delta!==(patched?0:100))throw Error('Unexpected native callback map delta; investigate before adopting');
  report.status=patched?'PATCHED_ANDROID_MAP_RELEASE_VERIFIED_NOT_SOAK_ACCEPTANCE':'BASELINE_ANDROID_MAP_RETENTION_REPRODUCED';
}catch(error){report.status='FAILED';report.error=error.message;process.exitCode=1}
finally{c.close();report.endedAt=new Date().toISOString();await fs.writeFile(out,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,delta:report.delta,error:report.error}))}
