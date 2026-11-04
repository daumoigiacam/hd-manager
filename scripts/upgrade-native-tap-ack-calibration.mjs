import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
import {assertNoActiveUpgradeSoak} from './helpers/upgrade-observation-barrier.mjs';
import {dispatchTrustedTap} from './helpers/trusted-input-pair.mjs';
const cohort=process.argv[2],label=process.argv[3];if(!/^after-[a-z0-9-]+$/.test(cohort||'')||!/^[a-z0-9-]+$/.test(label||''))throw Error('Explicit owned cohort and label required');
const root='test-results/performance-upgrade-20261103',out=`${root}/native-tap-ack-${cohort}-${label}.json`,adb='D:/HD-DEV/android/sdk/platform-tools/adb.exe',pkg='com.hdmanager.caplab.diag';
try{await fs.access(out);throw Error('Preserve calibration evidence')}catch(e){if(e.code!=='ENOENT')throw e}
await assertNoActiveUpgradeSoak();
const id=JSON.parse(await fs.readFile(`${root}/${cohort}/capacitor-build-identity.json`,'utf8'));if(id.project!=='demo-hdm-perf-verification')throw Error('Not owned demo');
const shell=(...args)=>execFileSync(adb,['-s','emulator-5554',...args],{encoding:'utf8',timeout:30000,windowsHide:true}).trim();
shell('shell','am','force-stop','com.hdmanager.caplab');shell('shell','am','start','-W','-n',pkg+'/com.hdmanager.app.VerificationActivity');
const c=await connectAndroidWebView({adb,serial:'emulator-5554',packageName:pkg,port:9298});
const result={at:new Date().toISOString(),cohort,label,status:'RUNNING',trials:[],productionRequests:0,conditions:'AFTER natural span only. Temporary control button outside React root, no business action. Add150ms ONLY to host down-ACK resolution, not browser/native time. Verify paired wire ordering/trust on Android10/WebView74. Not an app UI latency, startup, RAM or all-device acceptance.'};
try{
 const remote=shell('shell','pm','path',pkg).replace(/^package:/,'');if(!remote.startsWith('/data/app/')||!remote.includes(pkg)||!remote.endsWith('/base.apk'))throw Error('Unexpected test package');
 result.apkSha256=shell('shell','sha256sum',remote).split(/\s+/)[0];if(result.apkSha256!==crypto.createHash('sha256').update(await fs.readFile(`${root}/${cohort}/capacitor-project/app/build/outputs/apk/diagnostic/app-diagnostic.apk`)).digest('hex'))throw Error('APK mismatch');
 result.device={api:shell('shell','getprop','ro.build.version.sdk'),webview:shell('shell','dumpsys','webviewupdate').match(/Current WebView package[^\n]*/)?.[0]||null};
 const point=await c.evaluate(`(function(){if(!window.__hdVerification||!window.__hdVerification.fixtureOnly)throw Error('Not demo');if(document.getElementById('hd-tap-calibration'))throw Error('Control already exists');var b=document.createElement('button');b.id='hd-tap-calibration';b.type='button';b.textContent='Synthetic tap control';b.style.cssText='position:fixed;left:30px;top:40px;width:240px;height:65px;z-index:2147483647;background:white;color:black;border:1px solid black';window.__upgradeTapRows=[];['pointerdown','pointerup','click'].forEach(function(name){b.addEventListener(name,function(e){if(window.__upgradeTapRows.length<16)window.__upgradeTapRows.push({name:name,at:performance.now(),trusted:e.isTrusted})})});document.body.appendChild(b);var r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 const delayed={send:async(method,args)=>{const value=await c.send(method,args);if(method==='Input.dispatchMouseEvent'&&args.type==='mousePressed')await new Promise(r=>setTimeout(r,150));return value}};
 for(const variant of['serial','paired','paired','serial','serial','paired']){
  await c.evaluate('window.__upgradeTapRows=[]');
  if(variant==='serial'){await delayed.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await delayed.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1})}
  else await dispatchTrustedTap(delayed,point);
  const events=await c.evaluate('window.__upgradeTapRows');if(events.map(e=>e.name).join(',')!=='pointerdown,pointerup,click'||events.some(e=>!e.trusted))throw Error('Native trusted pointer ordering failed');
  result.trials.push({variant,events,downUpGapMs:events[1].at-events[0].at});
 }
 if(result.trials.filter(r=>r.variant==='serial').some(r=>r.downUpGapMs<140)||result.trials.filter(r=>r.variant==='paired').some(r=>r.downUpGapMs>100))throw Error('Native ACK calibration did not demonstrate paired dispatch benefit under controlled delay');
 result.status='NATIVE_PAIRED_TAP_PROTOCOL_VERIFIED_NOT_APP_BENEFIT';
}catch(e){result.status='FAILED';result.error=e.message;process.exitCode=1}
finally{try{await c.evaluate("(function(){var b=document.getElementById('hd-tap-calibration');if(b)b.remove();delete window.__upgradeTapRows})()")}catch{}c.close();result.endedAt=new Date().toISOString();await fs.writeFile(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result))}
